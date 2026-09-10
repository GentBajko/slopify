import { z } from "zod";
import { redact } from "../../kernel/log.js";
import type { LlmCompletion, LlmEvent, LlmPort } from "../../kernel/ports/llm.js";
import { type ModelInfo, providerError } from "../../kernel/ports/model.js";
import { geminiWorkspace } from "./gemini-workspace.js";
import type { RunCli } from "./run-cli.js";
import { cliEvent, cliShaped, endedWithout, promptOf } from "./run-cli.js";
import { lines } from "./sse-lines.js";

export const geminiBinary = "gemini";
export const geminiModels: readonly ModelInfo[] = [
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
  { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash-Lite" },
];
export interface GeminiDeps {
  readonly run: RunCli;
  readonly binary?: string | undefined;
}

// Verified against installed Gemini CLI 0.16.0's config/nonInteractiveCli sources.
// Its --allowed-tools flag bypasses approval; tools.core in the isolated settings
// actually restricts discovery. Never request yolo/auto_edit.
export function geminiArgs(req: LlmCompletion, mcpAllowlist: string): string[] {
  return [
    "--output-format",
    "stream-json",
    "--approval-mode",
    "default",
    "--extensions",
    "none",
    "--allowed-mcp-server-names",
    mcpAllowlist,
    ...(req.webSearch === true ? ["--allowed-tools", "google_web_search"] : []),
    ...(req.model === "" ? [] : ["--model", req.model]),
    "-p",
    // The prefix prevents slash-command dispatch; escaping @ prevents Gemini's
    // input preprocessor from reading files even when read tools are disabled.
    `Produce the requested content from this conversation:\n\n${promptOf(req.messages).replaceAll("@", "\\@")}`,
  ];
}
const messageSchema = z.object({
  role: z.string(),
  content: z.string(),
  delta: z.boolean().optional(),
});
const errorSchema = z.object({ severity: z.string(), message: z.string() });
const resultSchema = z.object({
  status: z.string(),
  error: z.object({ message: z.string(), type: z.string().optional() }).optional(),
  stats: z.object({ input_tokens: z.number(), output_tokens: z.number() }).optional(),
});

export function geminiLlm(deps: GeminiDeps): LlmPort {
  const binary = deps.binary ?? geminiBinary;
  async function* complete(req: LlmCompletion): AsyncGenerator<LlmEvent> {
    req.signal.throwIfAborted();
    const workspace = geminiWorkspace(req.webSearch === true);
    let run: ReturnType<RunCli> | undefined;
    try {
      run = deps.run(
        binary,
        geminiArgs(req, workspace.mcpAllowlist),
        req.signal,
        workspace.options,
      );
      for await (const line of lines(authChecked(run.stdout), req.signal)) {
        if (line.trim() === "") continue;
        const event = cliEvent(binary, line);
        yield { type: "activity" };
        req.signal.throwIfAborted();
        if (event.type === "message") {
          const message = cliShaped(binary, messageSchema, event.value);
          if (message.role === "assistant" && message.content !== "")
            yield { type: "delta", text: message.content };
        } else if (event.type === "error") {
          const error = cliShaped(binary, errorSchema, event.value);
          if (error.severity !== "warning") throw failure(error.message);
        } else if (event.type === "result") {
          const result = cliShaped(binary, resultSchema, event.value);
          if (result.status !== "success") throw failure(result.error?.message ?? result.status);
          yield {
            type: "done",
            usage:
              result.stats === undefined
                ? null
                : {
                    inputTokens: result.stats.input_tokens,
                    outputTokens: result.stats.output_tokens,
                  },
            finishReason: null,
          };
          return;
        }
      }
      req.signal.throwIfAborted();
      const ended = await run.ended;
      if (authRequired(run.stderr())) throw authFailure();
      throw failure(endedWithout(binary, ended, run.stderr()));
    } catch (error) {
      req.signal.throwIfAborted();
      throw error;
    } finally {
      run?.kill();
      if (run !== undefined) await run.ended;
      workspace.remove();
    }
  }
  return {
    id: "gemini",
    capabilities: { streams: true, reportsUsage: true, webSearch: true },
    models: () => Promise.resolve(geminiModels),
    complete,
  };
}
function failure(message: string): Error {
  if (/(?:#?3501\b|do not have a valid licen[cs]e of this product)/i.test(message)) {
    return providerError({
      kind: "unsupported",
      message:
        "Gemini CLI access was denied by Google's license check (#3501). Update Gemini CLI and sign in again. For a managed account, contact your administrator to request a license.",
    });
  }
  return authRequired(message)
    ? authFailure()
    : providerError({ kind: "other", message: redact(message) });
}
function authRequired(message: string): boolean {
  return /Code Assist login required|authorize the application|authorization code|Please set an Auth method|re-authenticate|reauthenticate/i.test(
    message,
  );
}
function authFailure(): Error {
  return providerError({
    kind: "missing_key",
    message:
      "Gemini CLI needs sign-in. Run gemini in your terminal, complete login, then retry in Slopify.",
  });
}
async function* authChecked(source: AsyncIterable<Uint8Array>): AsyncGenerator<Uint8Array> {
  const decoder = new TextDecoder();
  let tail = "";
  for await (const bytes of source) {
    tail = (tail + decoder.decode(bytes, { stream: true })).slice(-8192);
    // NO_BROWSER prevents opening OAuth. A logged-out CLI instead writes this
    // non-JSON prompt without a newline; fail before lines() waits for user input.
    if (
      /^(?:Enter the authorization code:|Please visit the following URL to authorize)/m.test(tail)
    )
      throw authFailure();
    yield bytes;
  }
}
