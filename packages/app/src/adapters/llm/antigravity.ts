import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { redact } from "../../kernel/log.js";
import type { LlmCompletion, LlmEvent, LlmPort } from "../../kernel/ports/llm.js";
import { documentMessages } from "../../kernel/ports/llm-documents.js";
import { type ModelInfo, providerError } from "../../kernel/ports/model.js";
import { cliCheck, cliName, cliReported, commandOf } from "../explain.js";
import { accessField } from "../model-access.js";
import { nodeAntigravityModels } from "./antigravity-models.js";
import { imageWorkspace, readFileName, unseenImages } from "./image-workspace.js";
import type { CliEnded, RunCli } from "./run-cli.js";
import {
  cliInput,
  cliShaped,
  deliveredInput,
  endedWithout,
  promptOf,
  stopCliRun,
  stuckCli,
} from "./run-cli.js";
import { lines } from "./sse-lines.js";

// Google retired the Gemini CLI for personal accounts on 2026-06-18; Antigravity CLI (`agy`)
// replaced it. Protocol from antigravity.google/docs/cli/headless.md: with
// `--input-format stream-json` the prompt is a `{"event":"user"}` line on stdin (a `-p` prompt
// would be dropped), closing stdin ends the session after that turn, and stdout carries
// `init`, `step_update` and one `result` event per turn.
export const antigravityBinary = "agy";
export interface AntigravityDeps {
  readonly env?: Readonly<NodeJS.ProcessEnv> | undefined;
  readonly run: RunCli;
  // A function when the saved program path can change between runs (Settings → Providers).
  readonly binary?: string | (() => string) | undefined;
  readonly readModels?: (() => Promise<readonly ModelInfo[]>) | undefined;
  readonly now?: (() => number) | undefined;
}

// No --dangerously-skip-permissions: headless agy refuses shell, MCP and page-reading tools,
// and its file tools stay inside the private folder the run starts in. Checked against agy
// 1.3.6 on 2026-10-15; its print timeout defaults to none, so Slopify's stall checks govern.
export function antigravityArgs(req: LlmCompletion): string[] {
  const level = req.thinkingConfig?.level;
  const effort = level === "minimal" ? "low" : level;
  return [
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--disable-slash-commands",
    ...(req.model === "" ? [] : ["--model", req.model]),
    ...(effort === undefined ? [] : ["--effort", effort]),
  ];
}

const eventSchema = z.object({ event: z.string() });
// The file a finished view_file step opened, as agy 1.3.6 reports it.
const viewedSchema = z.object({
  step_update: z.object({
    state: z.string().optional(),
    tool_name: z.string().optional(),
    tool_info: z
      .object({ parameters: z.object({ AbsolutePath: z.string().optional() }).optional() })
      .optional(),
  }),
});
const resultSchema = z.object({
  result: z.object({
    status: z.string(),
    response: z.string().optional(),
    error: z.string().optional(),
    usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }).optional(),
  }),
});

// agy reads AGENTS.md in its workspace as standing instructions. Headless agy ends the turn
// with no answer when the model reaches for a tool it may not use (page reading, the browser,
// commands), so the rules name the one web tool that needs no permission: search_web.
function instructions(webSearch: boolean, pictures: boolean): string {
  return [
    "You are the writing and research component of Slopify, a video creation app.",
    "Write the requested articles, narration, research notes or image prompts. Follow the topic, language, tone, length and format. Return only the requested content.",
    webSearch
      ? "For anything you need from the web, use only the search_web tool. Never open web pages: do not use read_url_content, the browser or any browser_ tool; the search results' snippets and URLs are your sources."
      : "Do not search the web or open web pages; answer from the supplied conversation.",
    pictures
      ? "Open every picture file listed in the request with view_file before you answer; they are in the current folder and are the only files you may open."
      : "Do not open, read or list any files.",
    "Do not run commands, edit or create files, generate images or start subagents.",
  ].join("\n");
}

export function antigravityLlm(deps: AntigravityDeps): LlmPort {
  const now = deps.now ?? Date.now;
  const binaryNow = (): string =>
    (typeof deps.binary === "function" ? deps.binary() : deps.binary) ?? antigravityBinary;
  async function* complete(req: LlmCompletion): AsyncGenerator<LlmEvent> {
    req.signal.throwIfAborted();
    const binary = binaryNow();
    if (/^gemini$/i.test(commandOf(binary)))
      throw providerError({
        kind: "unsupported",
        message: `The saved program path for the Antigravity CLI (${binary}) still points at the Gemini CLI, which Google has retired. In Settings → Providers, clear the Antigravity CLI path or set it to the agy program, then use Try again.`,
      });
    // The documents travel inline, as with OpenRouter: headless agy refuses MCP tools it was
    // not pre-approved for, so a research reader tool would be silently unavailable.
    const prompt = promptOf([...documentMessages(req.documents), ...req.messages]);
    let directory: string | undefined;
    let images: ReturnType<typeof imageWorkspace>;
    let run: ReturnType<RunCli> | undefined;
    let ended: CliEnded | undefined;
    const viewed = new Set<string>();
    try {
      // Pictures are copied into the folder agy works in, where view_file needs no permission.
      images = imageWorkspace(req.images);
      directory = images?.directory ?? mkdtempSync(join(tmpdir(), "slopify-antigravity-"));
      writeFileSync(
        join(directory, "AGENTS.md"),
        instructions(req.webSearch === true, images !== undefined),
        { mode: 0o600 },
      );
      const pictures = images
        ? `Pictures to look at (open each with view_file):\n${images.files.map((one) => `- ${one.file}: ${one.name}`).join("\n")}\n\n`
        : "";
      const env = deps.env ?? process.env;
      run = deps.run(binary, antigravityArgs(req), req.signal, {
        cwd: directory,
        env: { ...env, PWD: directory, AGY_CLI_DISABLE_AUTO_UPDATE: "true" },
        // A leading sentence keeps a prompt that starts with "/" from reading as a slash command.
        stdin: `${JSON.stringify({
          event: "user",
          message: {
            content: cliInput(
              `Produce the requested content from this conversation:\n\n${pictures}${prompt}`,
            ),
          },
        })}\n`,
      });
      for await (const line of lines(run.stdout, req.signal)) {
        if (line.trim() === "") continue;
        const value = parseLine(binary, line);
        yield { type: "activity" };
        req.signal.throwIfAborted();
        if (value.event === "step_update" && images !== undefined) {
          const step = viewedSchema.safeParse(value);
          const update = step.success ? step.data.step_update : undefined;
          const file = readFileName(update?.tool_info?.parameters?.AbsolutePath);
          if (update?.tool_name === "view_file" && update.state === "DONE" && file)
            viewed.add(file);
        }
        if (value.event !== "result") continue;
        const { result } = cliShaped(binary, resultSchema, value);
        if (result.status !== "SUCCESS")
          throw failure(binary, req.model, result.error ?? result.status, undefined, now);
        await deliveredInput(run);
        if (result.response === undefined || result.response.trim() === "")
          throw emptyAnswer(binary, run.stderr());
        if (images !== undefined && images.unread(viewed).length > 0) throw unseenImages();
        yield { type: "delta", text: result.response };
        yield {
          type: "done",
          usage:
            result.usage === undefined
              ? null
              : {
                  inputTokens: result.usage.input_tokens,
                  outputTokens: result.usage.output_tokens,
                },
          finishReason: null,
        };
        return;
      }
    } catch (error) {
      req.signal.throwIfAborted();
      throw error;
    } finally {
      try {
        if (run !== undefined) ended = await stopCliRun(run);
      } finally {
        if (directory !== undefined)
          rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
      }
    }
    req.signal.throwIfAborted();
    if (run === undefined)
      throw failure(
        binary,
        req.model,
        "",
        `The ${cliName(binary)} could not be started. Check it is installed and set up in Settings → Providers, then use Try again.`,
      );
    if (authRequired(run.stderr())) throw authFailure();
    throw failure(
      binary,
      req.model,
      run.stderr(),
      ended === undefined ? stuckCli(binary) : endedWithout(binary, ended, run.stderr()),
    );
  }
  return {
    id: "gemini",
    // search_web runs headless without a permission rule (checked with agy 1.3.6).
    capabilities: { streams: false, reportsUsage: true, webSearch: true, images: true },
    models: deps.readModels ?? (() => nodeAntigravityModels(binaryNow())),
    complete,
  };
}

function parseLine(binary: string, line: string): { readonly event: string } {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    value = undefined;
  }
  // Keep every key: the result schema reads the rest of the event.
  cliShaped(binary, eventSchema, value);
  return value as { readonly event: string };
}

// agy 1.3.6 ends a turn whose tool it refused with SUCCESS, no text and exit 0, and says
// why only on stderr.
function emptyAnswer(binary: string, stderr: string): Error {
  if (/no output produced|auto-denied|permission/i.test(stderr))
    return providerError({
      kind: "other",
      message: `The ${cliName(binary)} tried to use a tool Slopify does not allow (it said: ${redact(stderr.trim()).slice(0, 300)}), so it gave no answer. Use Try again; if it keeps happening, choose another model or text provider in the Providers section of Edit project.`,
    });
  return providerError({
    kind: "other",
    message: `The ${cliName(binary)} answered with no text. Use Try again; if it keeps happening, run agy in a terminal to check it works, or choose another model in the Providers section of Edit project.`,
  });
}

// `message` is what the CLI said; `sentence` replaces the default wording when Slopify
// already knows what happened.
function failure(
  binary: string,
  model: string,
  message: string,
  sentence?: string,
  now: () => number = Date.now,
): Error {
  if (authRequired(message)) return authFailure();
  if (/invalid model selection/i.test(message))
    return providerError({
      kind: "unsupported",
      // agy lists models a plan can't run and refuses them with this sentence.
      access: "no-access",
      message: `The ${cliName(binary)} does not offer the model "${model}". Run "agy models" in a terminal to see the ones it has, pick one in the Edit tab (Edit project → Providers), then use Continue the run.`,
    });
  if (
    /quota|resource.?exhausted|capacity/i.test(message) &&
    /exhaust|exceed|used up|reached|limit/i.test(message)
  ) {
    // agy 1.3.6 says "Resets in 0s" for a per-minute capacity limit: retry it like any rate
    // limit. A longer or unnamed reset is the plan's allowance, waited out until it returns.
    const reset = /Resets in\s+(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?/i.exec(message);
    const waitMs =
      reset === null || reset[0].trim() === "Resets in"
        ? undefined
        : ((Number(reset[1] ?? 0) * 60 + Number(reset[2] ?? 0)) * 60 + Number(reset[3] ?? 0)) *
          1000;
    if (waitMs !== undefined && waitMs <= 5 * 60_000)
      return providerError({
        kind: "rate_limit",
        message: `The ${cliName(binary)} is busy: Google's capacity for this model is used for the moment (it said: ${redact(message)}). Slopify tries again by itself shortly; if it keeps happening, run fewer projects at once or choose another model in the Providers section of Edit project.`,
        retryAfterMs: Math.max(1000, waitMs),
      });
    return providerError({
      kind: "rate_limit",
      message: `Your Antigravity plan's quota is used up (the ${cliName(binary)} said: ${redact(message)}). Slopify waits and tries again by itself when it resets.`,
      planLimit: {
        account: "gemini",
        resetsAt: waitMs === undefined ? null : new Date(now() + waitMs).toISOString(),
      },
    });
  }
  return providerError({
    kind: "other",
    ...accessField(null, message),
    message: sentence ?? cliReported(binary, redact(message), cliCheck(binary)),
  });
}
function authRequired(message: string): boolean {
  return /authentication (?:required|failed)|Please sign in|not (?:signed|logged) in|sign.?in (?:has )?expired/i.test(
    message,
  );
}
function authFailure(): Error {
  return providerError({
    kind: "missing_key",
    message:
      'The Antigravity CLI is not signed in, or its sign-in has expired. Open a terminal on the computer running it, run "agy" and sign in with your Google account, then use Try again.',
  });
}
