import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { redact } from "../../kernel/log.js";
import type { LlmCompletion, LlmEvent, LlmPort } from "../../kernel/ports/llm.js";
import { documentMessages } from "../../kernel/ports/llm-documents.js";
import { type ModelInfo, providerError } from "../../kernel/ports/model.js";
import { cliCheck, cliName, cliReported, commandOf } from "../explain.js";
import { nodeAntigravityModels } from "./antigravity-models.js";
import { noImages } from "./image-workspace.js";
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
}

// No --dangerously-skip-permissions: headless agy soft-denies shell, MCP and URL tools, and
// file tools stay inside the empty private folder the run starts in.
export function antigravityArgs(req: LlmCompletion): string[] {
  const level = req.thinkingConfig?.level;
  const effort = level === "minimal" ? "low" : level;
  return [
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    // The 5-minute default would cut off a long article; Slopify's own stall checks still apply.
    "--print-timeout",
    "60m",
    ...(req.model === "" ? [] : ["--model", req.model]),
    ...(effort === undefined ? [] : ["--effort", effort]),
  ];
}

const eventSchema = z.object({ event: z.string() });
const resultSchema = z.object({
  result: z.object({
    status: z.string(),
    response: z.string().optional(),
    error: z.string().optional(),
    usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }).optional(),
  }),
});

const instructions =
  "You are the writing and research component of Slopify, a video creation app. " +
  "Write the requested articles, narration, research notes or image prompts. " +
  "Follow the topic, language, tone, length and format. Return only the requested content. " +
  "Do not run commands, edit files or read other local files.\n";

export function antigravityLlm(deps: AntigravityDeps): LlmPort {
  const binaryNow = (): string =>
    (typeof deps.binary === "function" ? deps.binary() : deps.binary) ?? antigravityBinary;
  async function* complete(req: LlmCompletion): AsyncGenerator<LlmEvent> {
    req.signal.throwIfAborted();
    const binary = binaryNow();
    // Its headless mode documents text-only prompts; images are pasted only in the terminal UI.
    if (req.images?.length) throw noImages("the Antigravity CLI");
    if (/^gemini$/i.test(commandOf(binary)))
      throw providerError({
        kind: "unsupported",
        message: `The saved program path for the Antigravity CLI (${binary}) still points at the Gemini CLI, which Google has retired. In Settings → Providers, clear the Antigravity CLI path or set it to the agy program, then use Try again.`,
      });
    // The documents travel inline, as with OpenRouter: headless agy refuses MCP tools it was
    // not pre-approved for, so a research reader tool would be silently unavailable.
    const prompt = promptOf([...documentMessages(req.documents), ...req.messages]);
    let directory: string | undefined;
    let run: ReturnType<RunCli> | undefined;
    let ended: CliEnded | undefined;
    try {
      directory = mkdtempSync(join(tmpdir(), "slopify-antigravity-"));
      // agy reads AGENTS.md from its workspace as standing instructions.
      writeFileSync(join(directory, "AGENTS.md"), instructions, { mode: 0o600 });
      const env = deps.env ?? process.env;
      run = deps.run(binary, antigravityArgs(req), req.signal, {
        cwd: directory,
        env: { ...env, PWD: directory, AGY_CLI_DISABLE_AUTO_UPDATE: "true" },
        // A leading sentence keeps a prompt that starts with "/" from reading as a slash command.
        stdin: `${JSON.stringify({
          event: "user",
          message: {
            content: cliInput(`Produce the requested content from this conversation:\n\n${prompt}`),
          },
        })}\n`,
      });
      for await (const line of lines(run.stdout, req.signal)) {
        if (line.trim() === "") continue;
        const value = parseLine(binary, line);
        yield { type: "activity" };
        req.signal.throwIfAborted();
        if (value.event !== "result") continue;
        const { result } = cliShaped(binary, resultSchema, value);
        if (result.status !== "SUCCESS")
          throw failure(binary, req.model, result.error ?? result.status);
        await deliveredInput(run);
        if (result.response !== undefined && result.response !== "")
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
        if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
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
    // Web search is not claimed: the docs name no search tool for headless runs, and a
    // research stage must refuse rather than answer ungrounded.
    capabilities: { streams: false, reportsUsage: true, webSearch: false },
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

// `message` is what the CLI said; `sentence` replaces the default wording when Slopify
// already knows what happened.
function failure(binary: string, model: string, message: string, sentence?: string): Error {
  if (authRequired(message)) return authFailure();
  if (/invalid model selection/i.test(message))
    return providerError({
      kind: "unsupported",
      message: `The ${cliName(binary)} does not offer the model "${model}". Run "agy models" in a terminal to see the ones it has, pick one in the Edit tab (Edit project → Providers), then use Continue the run.`,
    });
  // A used-up plan allowance. agy names no reset time, so the wait checks again later.
  if (
    /quota|resource.?exhausted/i.test(message) &&
    /exhaust|exceed|used up|reached|limit/i.test(message)
  )
    return providerError({
      kind: "rate_limit",
      message: `Your Antigravity plan's quota is used up (the ${cliName(binary)} said: ${redact(message)}). Slopify waits and tries again later by itself.`,
      planLimit: { account: "gemini", resetsAt: null },
    });
  return providerError({
    kind: "other",
    message: sentence ?? cliReported(binary, redact(message), cliCheck(binary)),
  });
}
function authRequired(message: string): boolean {
  return /authentication required|not (?:signed|logged) in|sign.?in (?:has )?expired|GEMINI_API_KEY/i.test(
    message,
  );
}
function authFailure(): Error {
  return providerError({
    kind: "missing_key",
    message:
      'The Antigravity CLI is not signed in, or its sign-in has expired. Open a terminal on the computer running it, run "agy" and sign in with your Google account (or set GEMINI_API_KEY with "modelProvider": "gemini" in ~/.gemini/antigravity-cli/settings.json), then use Try again.',
  });
}
