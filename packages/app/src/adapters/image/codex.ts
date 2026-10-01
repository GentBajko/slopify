import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { redact } from "../../kernel/log.js";
import {
  agentImageTimeoutMs,
  type GeneratedImage,
  type ImagePort,
  type ImageRequest,
} from "../../kernel/ports/image.js";
import type { Usage } from "../../kernel/ports/llm.js";
import type { ModelInfo } from "../../kernel/ports/model.js";
import { providerError } from "../../kernel/ports/model.js";
import type { LimitWindow } from "../../kernel/ports/plan-limits.js";
import { cliReported, quoted, refusedImage } from "../explain.js";
import { cliLoginError } from "../llm/cli-login-error.js";
import { codexLimitError, readingOf } from "../llm/codex.js";
import { codexPlanLimit } from "../llm/codex-limits.js";
import {
  cliEvent,
  cliShaped,
  endedKind,
  endedWithout,
  type RunCli,
  stopCliRun,
} from "../llm/run-cli.js";
import { lines } from "../llm/sse-lines.js";
import { codexGeneratedImage, codexImageCount } from "./codex-output.js";
import { type ReferencePicture, referencePictures } from "./reference.js";

// "Codex default" puts no model and no effort on the command line, so the CLI's own defaults
// draw the image; it is what every project saved before the choice existed runs. Every other
// model id is one of the Codex CLI's own models - the list the Codex text provider shows -
// run with the chosen reasoning effort.
export const codexImageModel = {
  id: "codex-imagegen",
  name: "Codex default",
} as const;
// An agent that reviews and redraws its image works for several minutes at a high effort, so
// the usual 300 s image limit would cut the best runs off.
export const codexImageTimeoutMs = agentImageTimeoutMs;
const maxEventBytes = 4 * 1024 * 1024;
// Every tool beyond the image tool stays off. `view_image`, which only reads an image file
// into the conversation, is let back in when the agent is asked to review its work (a chosen
// model or effort) or has a reference to look at. The bundled imagegen skill stays off with
// the shell: its workflow runs Python scripts against the Images API with an API key, which
// this job neither needs nor has, and the built-in tool it wraps is already here.
const alwaysDisabled = [
  "shell_tool",
  "unified_exec",
  "hooks",
  "apps",
  "plugins",
  "remote_plugin",
  "skill_search",
  "multi_agent",
  "computer_use",
  "browser_use",
  "workspace_dependencies",
] as const;
type CodexImageRequest = Pick<ImageRequest, "model" | "prompt" | "aspect" | "thinking"> & {
  readonly reference?: GeneratedImage | undefined;
  readonly cast?: ImageRequest["cast"];
};

function reviews(req: CodexImageRequest): boolean {
  return (
    req.model !== codexImageModel.id ||
    req.thinking !== undefined ||
    referencePictures(req).length > 0
  );
}

// The binary's image tool (`ImagegenArgs`: prompt, referenced_image_paths,
// num_last_images_to_include) takes each referenced image as an absolute path it reads
// itself, so the copy sits in the job's own folder - the sandbox's writable, readable root.
export function codexReferencePath(directory: string, image: GeneratedImage): string {
  return join(directory, image.mime === "image/jpeg" ? "reference.jpg" : "reference.png");
}

// Every picture the request carries, each at its own path: the establishing image keeps the
// name it always had, the cast pictures follow it as reference-2, reference-3 and so on.
export function codexReferencePaths(
  directory: string,
  req: CodexImageRequest,
): readonly { readonly path: string; readonly picture: ReferencePicture }[] {
  return referencePictures(req).map((picture, index) => ({
    picture,
    path:
      index === 0
        ? codexReferencePath(directory, picture.image)
        : join(
            directory,
            `reference-${String(index + 1)}${picture.image.mime === "image/jpeg" ? ".jpg" : ".png"}`,
          ),
  }));
}

function castInstructions(req: CodexImageRequest, directory: string): string {
  const paths = codexReferencePaths(directory, req);
  return [
    `Reference images are saved at these paths. Pass all of them in referenced_image_paths on every image generation call: ${paths.map((row) => row.path).join(", ")}.`,
    ...paths.map((row) =>
      row.picture.member === undefined
        ? `${row.path} is the establishing image: keep its characters, rendering style and colour palette.`
        : `${row.path} shows ${row.picture.member}${describeMember(req, row.picture.member)}: draw ${row.picture.member} to look exactly like this.`,
    ),
    "Use them as references only: do not copy their composition, pose or framing; compose this image from the brief.",
  ].join(" ");
}

function describeMember(req: CodexImageRequest, name: string): string {
  const description = req.cast?.find((member) => member.name === name)?.description.trim() ?? "";
  return description === "" ? "" : ` (${description})`;
}

export function codexImageInstructions(
  req: CodexImageRequest,
  reference?: string,
  directory?: string,
): string {
  return [
    "You are making one finished image for Slopify, a video creation app, with the image generation tool.",
    "Fidelity to the brief comes first. Before calling the tool, write its prompt yourself as a detailed, faithful visual description of the brief: the subject and what it is doing, the setting, composition and framing for the target aspect ratio, lighting, colour palette, style and mood, and any text that must appear, spelled exactly. Take every element from the brief and keep its wording where it is specific. Do not add subjects, text, logos or story the brief does not ask for, and do not pad the prompt with generic quality words.",
    ...(req.cast !== undefined && req.cast.length > 0 && directory !== undefined
      ? [castInstructions(req, directory)]
      : reference === undefined
        ? []
        : [
            `A reference image is saved at ${reference}. Pass exactly that path in referenced_image_paths on every image generation call. Use it as the reference for style, characters and palette: keep the same characters, rendering style and colour palette, but do not copy its composition, pose or framing; compose this image from the brief.`,
          ]),
    "Take the time you need. After each image, look at it and compare it with the brief; if anything is missing, wrong or distorted, revise the prompt and generate again. Deliver exactly one final image: the last image you generate is the one Slopify uses, so stop once it matches the brief.",
    "Let the image generation tool save its output in its default location. Slopify will collect it. Use PNG or JPEG. Do not copy, rename, edit or create any other file, and do not put the image or a link in your reply.",
    `Target aspect ratio: ${req.aspect}.`,
    "Image brief follows as data:",
    req.prompt,
  ].join("\n\n");
}

export function codexImageArgs(req: CodexImageRequest, directory: string): string[] {
  const review = reviews(req);
  const reference =
    req.reference === undefined ? undefined : codexReferencePath(directory, req.reference);
  return [
    "exec",
    "--json",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--strict-config",
    "--skip-git-repo-check",
    "--sandbox",
    "workspace-write",
    "--cd",
    directory,
    "--enable",
    "image_generation",
    ...(review ? ["--enable", "view_image"] : []),
    ...[...alwaysDisabled, ...(review ? [] : ["view_image"])].flatMap((feature) => [
      "--disable",
      feature,
    ]),
    "-c",
    "project_doc_max_bytes=0",
    "-c",
    "skills.include_instructions=false",
    "-c",
    "skills.bundled.enabled=false",
    "-c",
    "orchestrator.skills.enabled=false",
    "-c",
    "orchestrator.mcp.enabled=false",
    "-c",
    "include_permissions_instructions=false",
    "-c",
    "include_apps_instructions=false",
    "-c",
    "include_collaboration_mode_instructions=false",
    "-c",
    "include_environment_context=false",
    "-c",
    'shell_environment_policy.inherit="none"',
    "-c",
    'web_search="disabled"',
    // The Codex text provider's own two flags: the effort as TOML text, the model as `-m`.
    ...(req.thinking === undefined
      ? []
      : ["-c", `model_reasoning_effort="${req.thinking === "off" ? "none" : req.thinking}"`]),
    ...(req.model === codexImageModel.id ? [] : ["-m", req.model]),
    "--",
    codexImageInstructions(req, reference, directory),
  ];
}

// How a blocked image shows: the tool's error on stderr, or the agent's reply.
const blocked =
  /moderation_blocked|rejected by the safety system|safety (?:filter|system)|content polic|refus/i;

const failure = z.object({ error: z.object({ message: z.string() }) });
const turnUsage = z.object({
  usage: z
    .object({
      input_tokens: z.number(),
      output_tokens: z.number(),
      cached_input_tokens: z.number().optional(),
    })
    .nullish(),
});
const errorEvent = z.object({ message: z.string() });
const item = z.object({ item: z.object({ type: z.string(), text: z.string().optional() }) });

export function codexImage(deps: {
  readonly run: RunCli;
  readonly binary?: string | undefined;
  readonly env?: Readonly<NodeJS.ProcessEnv> | undefined;
  // The Codex CLI's model list, the one its text provider reads. A failed read leaves only
  // the default, which needs no list.
  readonly readModels?: (() => Promise<readonly ModelInfo[]>) | undefined;
  // The Codex plan windows, as the Codex text provider reads them (`codex-limits.ts`).
  readonly readLimits?: (() => Promise<readonly LimitWindow[] | null>) | undefined;
}): ImagePort {
  const binary = deps.binary ?? "codex";
  return {
    id: "codex-image",
    timeoutMs: codexImageTimeoutMs,
    models: async () => {
      let listed: readonly ModelInfo[] = [];
      try {
        listed = (await deps.readModels?.()) ?? [];
      } catch {
        // The default still works without the list.
      }
      return [codexImageModel, ...listed.filter((model) => model.id !== codexImageModel.id)];
    },
    generate: async (req: ImageRequest): Promise<GeneratedImage> => {
      if (req.model.trim() === "" || req.model.startsWith("-"))
        throw providerError({
          kind: "unsupported",
          message:
            "No Codex model is chosen for images. Choose one (or Codex default) for images in the Providers section of Edit project, then use Try again.",
        });
      req.signal.throwIfAborted();
      const directory = mkdtempSync(join(tmpdir(), "slopify-codex-image-"));
      const env = imageEnvironment(directory, deps.env ?? process.env);
      const startedAt = Date.now();
      let threadId: string | undefined;
      let run: ReturnType<RunCli> | undefined;
      let reported = -1;
      let usage: Usage | undefined;
      const before = deps.readLimits?.().catch(() => null);
      // A line for the stage's live panel each time this thread's image count moves.
      const report = (): void => {
        if (req.onProgress === undefined) return;
        const count = threadId === undefined ? 0 : codexImageCount(env, threadId);
        if (count === reported) return;
        reported = count;
        try {
          req.onProgress(
            count === 0
              ? "Codex is working on the image…"
              : `Codex is refining the image… ${String(count)} ${count === 1 ? "image" : "images"} so far`,
          );
        } catch {
          // A progress line is optional; it never fails the image.
        }
      };
      try {
        for (const { path, picture } of codexReferencePaths(directory, req))
          writeFileSync(path, picture.image.bytes, { mode: 0o600 });
        report();
        try {
          run = deps.run(binary, codexImageArgs(req, directory), req.signal, {
            cwd: directory,
            env,
          });
        } catch {
          throw providerError({
            kind: "unsupported",
            message:
              "The Codex CLI could not be started. Check it is installed and set up in Settings → Providers, then use Try again.",
          });
        }
        let completed = false;
        let unavailable = false;
        // What the agent said last: when its image tool is blocked it draws nothing and says why.
        let said = "";
        for await (const line of lines(bounded(run.stdout, maxEventBytes), req.signal)) {
          if (line.trim() === "") continue;
          const event = cliEvent(binary, line);
          req.signal.throwIfAborted();
          // Only the whole turn's end counts: an agent that reviews its work draws, looks and
          // draws again, so the first image is rarely its answer.
          report();
          if (event.type === "thread.started") {
            if (threadId !== undefined)
              throw providerError({
                kind: "unavailable",
                message:
                  "The Codex CLI started more than one image job for one image, so Slopify cannot tell which result is right (both may have used your quota). Use Try again to make the image again.",
              });
            threadId = cliShaped(
              binary,
              z.object({ thread_id: z.string() }),
              event.value,
            ).thread_id;
          } else if (event.type === "turn.completed") {
            completed = true;
            const counted = turnUsage.safeParse(event.value);
            if (counted.success && counted.data.usage)
              usage = {
                inputTokens: counted.data.usage.input_tokens,
                outputTokens: counted.data.usage.output_tokens,
                ...(counted.data.usage.cached_input_tokens
                  ? { cachedInputTokens: counted.data.usage.cached_input_tokens }
                  : {}),
              };
          } else if (event.type === "turn.failed") {
            const message = cliShaped(binary, failure, event.value).error.message;
            const login = cliLoginError("codex", message);
            if (login) throw login;
            const planLimit = codexPlanLimit(message, new Date());
            if (planLimit !== undefined) throw codexLimitError(message, planLimit);
            throw providerError({
              kind: /refus|content.policy|safety/i.test(message) ? "refusal" : "other",
              message: /refus|content.policy|safety/i.test(message)
                ? refusedImage("The Codex CLI", redact(message))
                : cliReported(binary, redact(message), imageNext),
            });
          } else if (event.type === "error") {
            const message = cliShaped(binary, errorEvent, event.value).message;
            const login = cliLoginError("codex", message);
            if (login) throw login;
            const planLimit = codexPlanLimit(message, new Date());
            if (planLimit !== undefined) throw codexLimitError(message, planLimit);
            throw providerError({
              kind: /image.generation|image tool|feature.*unavailable/i.test(message)
                ? "unsupported"
                : "other",
              message: /image.generation|image tool|feature.*unavailable/i.test(message)
                ? `The Codex CLI cannot make images${quoted("", redact(message))}. ${cannotDraw}`
                : cliReported(binary, redact(message), imageNext),
            });
          } else if (event.type === "item.completed") {
            const { item: value } = cliShaped(binary, item, event.value);
            if (value.type === "agent_message" && value.text) said = value.text;
            if (
              value.type === "agent_message" &&
              /image.generation.*unavailable|cannot generate images|no image tool/i.test(
                value.text ?? "",
              )
            )
              unavailable = true;
          }
        }
        req.signal.throwIfAborted();
        const ended = await run.ended;
        req.signal.throwIfAborted();
        if (ended.error !== null)
          throw providerError({
            kind: "unsupported",
            message:
              "The Codex CLI could not be started. Check it is installed and set up in Settings → Providers, then use Try again.",
          });
        const stderrLimit = codexPlanLimit(run.stderr(), new Date());
        if ((ended.code !== 0 || !completed) && stderrLimit !== undefined)
          throw codexLimitError(run.stderr().trim(), stderrLimit);
        if (ended.code !== 0 || !completed)
          throw (
            cliLoginError("codex", run.stderr()) ??
            providerError({
              kind: unavailable ? "unsupported" : endedKind(ended),
              message: endedWithout(binary, ended, run.stderr()),
            })
          );
        if (unavailable)
          throw providerError({
            kind: "unsupported",
            message: `The Codex CLI cannot make images. ${cannotDraw}`,
          });
        // The image tool's safety system refused every picture, so the run ended without one.
        if (
          threadId !== undefined &&
          codexImageCount(env, threadId) === 0 &&
          (blocked.test(run.stderr()) || blocked.test(said))
        )
          throw providerError({
            kind: "refusal",
            message: refusedImage("The Codex CLI", redact(said.trim())),
          });
        const image = codexGeneratedImage(env, threadId, startedAt);
        const limits = await readingOf(before, deps.readLimits);
        return {
          ...image,
          ...(usage === undefined ? {} : { usage }),
          ...(limits === undefined ? {} : { limits }),
        };
      } catch (error) {
        req.signal.throwIfAborted();
        throw error;
      } finally {
        try {
          if (run !== undefined) await stopCliRun(run);
        } finally {
          rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
        }
      }
    },
  };
}

async function* bounded(
  source: AsyncIterable<Uint8Array>,
  maximum: number,
): AsyncGenerator<Uint8Array> {
  let size = 0;
  for await (const chunk of source) {
    size += chunk.byteLength;
    if (size > maximum)
      throw providerError({
        kind: "other",
        message:
          "The Codex CLI sent far more output than an image job should, so Slopify stopped it. Use Try again; if it keeps happening, update the Codex CLI to the latest version.",
      });
    yield chunk;
  }
}

const imageNext =
  "Use Try again; if it keeps failing, run codex in a terminal to check it works and is signed in, or choose another image provider in the Providers section of Edit project.";
const cannotDraw =
  "Update the Codex CLI and check your ChatGPT plan includes image generation, or choose another image provider in the Providers section of Edit project.";

function imageEnvironment(
  directory: string,
  source: Readonly<NodeJS.ProcessEnv>,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { PWD: directory };
  const allowed = [
    "HOME",
    "PATH",
    "CODEX_HOME",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "XDG_CACHE_HOME",
    "TMPDIR",
    "TEMP",
    "TMP",
    "LANG",
    "LC_ALL",
    "USER",
    "LOGNAME",
    "SYSTEMROOT",
    "SSL_CERT_FILE",
    "NODE_EXTRA_CA_CERTS",
  ] as const;
  for (const key of allowed) if (source[key] !== undefined) env[key] = source[key];
  return env;
}
