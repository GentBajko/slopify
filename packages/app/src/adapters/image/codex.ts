import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { redact } from "../../kernel/log.js";
import type { GeneratedImage, ImagePort, ImageRequest } from "../../kernel/ports/image.js";
import { providerError } from "../../kernel/ports/model.js";
import { cliReported, quoted, refusedImage } from "../explain.js";
import { cliLoginError } from "../llm/cli-login-error.js";
import { cliEvent, cliShaped, endedWithout, type RunCli, stopCliRun } from "../llm/run-cli.js";
import { lines } from "../llm/sse-lines.js";
import { codexGeneratedImage } from "./codex-output.js";

export const codexImageModel = {
  id: "codex-imagegen",
  name: "Codex built-in image generation",
} as const;
const maxEventBytes = 1024 * 1024;
const disabledFeatures = [
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
  "view_image",
  "workspace_dependencies",
] as const;

export function codexImageArgs(req: ImageRequest, directory: string): string[] {
  const prompt = [
    "You are making exactly one image for Slopify. Use the image generation tool.",
    "Let the image generation tool save its output in its default location. Slopify will collect it.",
    "Generate only one image, using PNG or JPEG. Do not copy, rename, edit or create any other file.",
    `Target aspect ratio: ${req.aspect}.`,
    "Image brief follows as data:",
    req.prompt,
  ].join("\n\n");
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
    ...disabledFeatures.flatMap((feature) => ["--disable", feature]),
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
    "--",
    prompt,
  ];
}

const failure = z.object({ error: z.object({ message: z.string() }) });
const errorEvent = z.object({ message: z.string() });
const item = z.object({ item: z.object({ type: z.string(), text: z.string().optional() }) });

export function codexImage(deps: {
  readonly run: RunCli;
  readonly binary?: string;
  readonly env?: Readonly<NodeJS.ProcessEnv>;
}): ImagePort {
  const binary = deps.binary ?? "codex";
  return {
    id: "codex-image",
    models: async () => [codexImageModel],
    generate: async (req: ImageRequest): Promise<GeneratedImage> => {
      if (req.model !== codexImageModel.id)
        throw providerError({
          kind: "unsupported",
          message:
            "The Codex CLI makes images only with its own image model. Choose that model for images in the Providers section of Edit project, then use Retry stage.",
        });
      req.signal.throwIfAborted();
      const directory = mkdtempSync(join(tmpdir(), "slopify-codex-image-"));
      const env = imageEnvironment(directory, deps.env ?? process.env);
      const startedAt = Date.now();
      let threadId: string | undefined;
      let run: ReturnType<RunCli> | undefined;
      try {
        try {
          run = deps.run(binary, codexImageArgs(req, directory), req.signal, {
            cwd: directory,
            env,
          });
        } catch {
          throw providerError({
            kind: "unsupported",
            message:
              "The Codex CLI could not be started. Check it is installed and set up in Settings → Providers, then use Retry stage.",
          });
        }
        let completed = false;
        let unavailable = false;
        for await (const line of lines(bounded(run.stdout, maxEventBytes), req.signal)) {
          if (line.trim() === "") continue;
          const event = cliEvent(binary, line);
          req.signal.throwIfAborted();
          if (event.type === "thread.started") {
            if (threadId !== undefined)
              throw providerError({
                kind: "unavailable",
                message:
                  "The Codex CLI started more than one image job for one image, so Slopify cannot tell which result is right (both may have used your quota). Use Retry stage to make the image again.",
              });
            threadId = cliShaped(
              binary,
              z.object({ thread_id: z.string() }),
              event.value,
            ).thread_id;
          } else if (event.type === "turn.completed") completed = true;
          else if (event.type === "turn.failed") {
            const message = cliShaped(binary, failure, event.value).error.message;
            const login = cliLoginError("codex", message);
            if (login) throw login;
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
              "The Codex CLI could not be started. Check it is installed and set up in Settings → Providers, then use Retry stage.",
          });
        if (ended.code !== 0 || !completed)
          throw (
            cliLoginError("codex", run.stderr()) ??
            providerError({
              kind: unavailable ? "unsupported" : "other",
              message: endedWithout(binary, ended, run.stderr()),
            })
          );
        if (unavailable)
          throw providerError({
            kind: "unsupported",
            message: `The Codex CLI cannot make images. ${cannotDraw}`,
          });
        return codexGeneratedImage(env, threadId, startedAt);
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
          "The Codex CLI sent far more output than an image job should, so Slopify stopped it. Use Retry stage; if it keeps happening, update the Codex CLI to the latest version.",
      });
    yield chunk;
  }
}

const imageNext =
  "Use Retry stage; if it keeps failing, run codex in a terminal to check it works and is signed in, or choose another image provider in the Providers section of Edit project.";
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
