import { z } from "zod";
import { redact } from "../../kernel/log.js";
import type { LlmCompletion, LlmEvent, LlmPort } from "../../kernel/ports/llm.js";
import { type ModelInfo, providerError } from "../../kernel/ports/model.js";
import { cliCheck, cliName, cliReported } from "../explain.js";
import { documentWorkspace } from "./document-workspace.js";
import { nodeGeminiModels } from "./gemini-models.js";
import { geminiWorkspace } from "./gemini-workspace.js";
import type { CliEnded, RunCli } from "./run-cli.js";
import {
  cliEvent,
  cliInput,
  cliShaped,
  deliveredInput,
  endedWithout,
  promptOf,
  stopCliRun,
  stuckCli,
} from "./run-cli.js";
import { lines } from "./sse-lines.js";

export const geminiBinary = "gemini";
export interface GeminiDeps {
  readonly env?: Readonly<NodeJS.ProcessEnv> | undefined;
  readonly run: RunCli;
  readonly binary?: string | undefined;
  readonly readModels?: (() => Promise<readonly ModelInfo[]>) | undefined;
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
    "Produce the requested content from the supplied conversation on stdin.",
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
    const documents = documentWorkspace(req.documents);
    let workspace: ReturnType<typeof geminiWorkspace> | undefined;
    let run: ReturnType<RunCli> | undefined;
    let ended: CliEnded | undefined;
    try {
      workspace = geminiWorkspace(req.webSearch === true, req, documents, deps.env ?? process.env);
      run = deps.run(binary, geminiArgs(req, workspace.mcpAllowlist), req.signal, {
        ...workspace.options,
        stdin: cliInput(
          `Produce the requested content from this conversation:\n\n${[documents?.instructions, promptOf(req.messages)].filter(Boolean).join("\n\n").replaceAll("@", "\\@")}`,
        ),
      });
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
          if (error.severity !== "warning") throw failure(binary, error.message);
        } else if (event.type === "result") {
          const result = cliShaped(binary, resultSchema, event.value);
          if (result.status !== "success")
            throw failure(binary, result.error?.message ?? result.status);
          await deliveredInput(run);
          documents?.verifyRead();
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
    } catch (error) {
      req.signal.throwIfAborted();
      throw error;
    } finally {
      try {
        if (run !== undefined) ended = await stopCliRun(run);
      } finally {
        documents?.remove();
        workspace?.remove();
      }
    }
    req.signal.throwIfAborted();
    if (run === undefined)
      throw failure(
        binary,
        "",
        `The ${cliName(binary)} could not be started. Check it is installed and set up in Settings → Providers, then use Retry stage.`,
      );
    if (authRequired(run.stderr())) throw authFailure();
    throw failure(
      binary,
      run.stderr(),
      ended === undefined ? stuckCli(binary) : endedWithout(binary, ended, run.stderr()),
    );
  }
  return {
    id: "gemini",
    capabilities: { streams: true, reportsUsage: true, webSearch: true },
    models: deps.readModels ?? (() => nodeGeminiModels(binary)),
    complete,
  };
}
// `message` is what the CLI said, read for the two failures that need the user's hand;
// `sentence` replaces the default wording when Slopify already knows what happened.
function failure(binary: string, message: string, sentence?: string): Error {
  if (/(?:#?3501\b|do not have a valid licen[cs]e of this product)/i.test(message)) {
    return providerError({
      kind: "unsupported",
      message:
        "Google refused the Gemini CLI because the signed-in account has no licence for it (#3501). Update the Gemini CLI, run gemini in a terminal to sign in again, then use Retry stage; for a work or school account, ask your administrator for a Gemini licence.",
    });
  }
  return authRequired(message)
    ? authFailure()
    : providerError({
        kind: "other",
        message: sentence ?? cliReported(binary, redact(message), cliCheck(binary)),
      });
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
      'The Gemini CLI is not signed in, or its sign-in has expired. Open a terminal on the computer running the CLI, run "gemini" and sign in, then use Retry stage.',
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
