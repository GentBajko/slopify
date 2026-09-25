import { z } from "zod";
import { redact } from "../../kernel/log.js";
import type { LlmCompletion, LlmEvent, LlmPort, Usage } from "../../kernel/ports/llm.js";
import type { ModelInfo, ProviderErrorKind } from "../../kernel/ports/model.js";
import { providerError } from "../../kernel/ports/model.js";
import { cliCheck, cliReported, commandOf } from "../explain.js";
import { nodeClaudeCodeModels } from "./claude-code-models.js";
import { cliLoginError } from "./cli-login-error.js";
import {
  type DocumentWorkspace,
  documentToolName,
  documentWorkspace,
} from "./document-workspace.js";
import type { CliEnded, RunCli } from "./run-cli.js";
import {
  cliEvent,
  cliInput,
  cliShaped,
  endedWithout,
  promptOf,
  stopCliRun,
  stuckCli,
} from "./run-cli.js";
import { lines } from "./sse-lines.js";

// The local-agent adapter for Claude Code: spawned non-interactively, authenticated by the
// CLI's own login, no key anywhere in this file. Readiness is not computed here - `adapters/**`
// may not import `slices/**`, and `slices/settings/cli-status.ts` already probes the binary per
// request. The registry `main.ts` builds is where this adapter and that probe meet.

export const claudeCodeBinary = "claude";

export interface ClaudeCodeDeps {
  readonly env?: Readonly<NodeJS.ProcessEnv> | undefined;
  readonly run: RunCli;
  readonly binary?: string | undefined;
  readonly readModels?: (() => Promise<readonly ModelInfo[]>) | undefined;
}

const writingRole =
  "You are the writing and research component of Slopify, a video creation app. " +
  "Produce the text requested in the supplied conversation: articles, narration scripts, " +
  "research notes or image prompts. Follow the requested topic, language, tone, length and format. " +
  "Return only the requested content, without progress updates or introductory remarks. " +
  "Use web search when it is available and needed for the requested research. " +
  "Do not inspect or modify local files.";

// Measured on 2.1.258, not assumed: with the built-in tools left alone, a `-p` run of this CLI
// still reached for ToolSearch and WebFetch, and the machine's MCP servers were loaded into the
// session. Neither belongs in a content pipeline - grounding on the web is an explicit ask,
// never something a stage does quietly, and no stage should touch the disk. `--tools ""`
// empties the built-in set and `--strict-mcp-config` drops the user's MCP servers; the init
// event of a run with both reports `"tools":[]` and `"mcp_servers":[]`.
export function claudeCodeArgs(req: LlmCompletion, documents?: DocumentWorkspace): string[] {
  return [
    "-p",
    "--output-format",
    "stream-json",
    // stream-json output is refused without it.
    "--verbose",
    "--include-partial-messages",
    // `claude --help` 2.1.263: safe mode excludes CLAUDE.md, output styles, skills and
    // hooks while retaining login and managed policy. --bare would discard OAuth.
    ...(documents
      ? [
          "--restricted",
          "--setting-sources",
          "",
          "--disable-slash-commands",
          "--no-chrome",
          "--no-session-persistence",
          "--settings",
          JSON.stringify({
            disableAllHooks: true,
            autoMemoryEnabled: false,
            claudeMdExcludes: ["**"],
            enabledPlugins: {},
          }),
        ]
      : ["--safe-mode"]),
    "--system-prompt",
    writingRole +
      (documents
        ? " Use the explicitly supplied research MCP tool to read request documents; it is the only permitted local reference source."
        : ""),
    "--strict-mcp-config",
    "--tools",
    req.webSearch === true ? "WebSearch" : "",
    ...(documents ? ["--mcp-config", documents.config, "--permission-mode", "dontAsk"] : []),
    ...(req.webSearch === true || documents
      ? [
          "--allowedTools",
          [req.webSearch === true ? "WebSearch" : "", documents ? documentToolName : ""]
            .filter(Boolean)
            .join(","),
        ]
      : []),
    ...(req.model === "" ? [] : ["--model", req.model]),
    ...(req.thinking !== undefined && req.thinking !== "off" ? ["--effort", req.thinking] : []),
    // The full prompt is piped as text, not argv: research synthesis can exceed
    // the OS argument-size limit. No shell or local-file access is involved.
  ];
}

const assistantEvent = z.object({
  message: z.object({
    content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
  }),
});

// The result event as 2.1.258 writes it. `subtype` stays "success" even for a failed run -
// a bad model name answers `{"subtype":"success","is_error":true,"api_error_status":404}` -
// so `is_error` is what decides, with `subtype` checked as well for a run that never
// reached the model at all.
const resultEvent = z.object({
  subtype: z.string(),
  is_error: z.boolean().optional(),
  result: z.string().optional(),
  stop_reason: z.string().nullish(),
  api_error_status: z.number().nullish(),
  modelUsage: z
    .record(z.string(), z.object({ inputTokens: z.number(), outputTokens: z.number() }))
    .optional(),
});

export function claudeCodeLlm(deps: ClaudeCodeDeps): LlmPort {
  const binary = deps.binary ?? claudeCodeBinary;

  async function* complete(req: LlmCompletion): AsyncGenerator<LlmEvent> {
    req.signal.throwIfAborted();
    const documents = documentWorkspace(req.documents);
    let run: ReturnType<RunCli> | undefined;
    let ended: CliEnded | undefined;
    try {
      run = deps.run(binary, claudeCodeArgs(req, documents), req.signal, {
        ...(documents
          ? {
              cwd: documents.directory,
              env: {
                ...(deps.env ?? process.env),
                CLAUDE_CODE_SAFE_MODE: "0",
                PWD: documents.directory,
              },
            }
          : {}),
        stdin: cliInput(
          [documents?.instructions, promptOf(req.messages)].filter(Boolean).join("\n\n"),
        ),
      });
      for await (const line of lines(run.stdout, req.signal)) {
        if (line.trim() === "") {
          continue;
        }
        const event = cliEvent(binary, line);
        // Partial text/thinking and tool events are a heartbeat. Full assistant
        // messages remain the sole prose source so text is never appended twice.
        yield { type: "activity" };
        req.signal.throwIfAborted();
        if (event.type === "assistant" && !documents) {
          for (const block of cliShaped(binary, assistantEvent, event.value).message.content) {
            // A turn also carries `thinking` and `tool_use` blocks; only the prose is the
            // stage's output.
            if (block.type === "text" && block.text !== undefined && block.text !== "") {
              yield { type: "delta", text: block.text };
            }
          }
          continue;
        }
        if (event.type !== "result") {
          continue;
        }
        const result = cliShaped(binary, resultEvent, event.value);
        try {
          await run.inputWritten;
        } catch {
          throw providerError({
            kind: "unavailable",
            message:
              "Slopify could not hand the whole prompt to the Claude Code CLI, so it cannot tell what the CLI worked on (it may already have used your quota). Use Retry stage to run it again.",
          });
        }
        if (result.is_error === true || result.subtype !== "success") {
          const login = cliLoginError("claude-code", result.result ?? result.subtype);
          if (login) throw login;
          throw providerError({
            kind: kindOf(result.api_error_status ?? null),
            message: cliReported(
              binary,
              redact(result.result ?? result.subtype),
              nextStep(binary, result.api_error_status ?? null),
            ),
          });
        }
        documents?.verifyRead();
        if (documents && result.result) yield { type: "delta", text: result.result };
        yield {
          type: "done",
          usage: usageOf(result.modelUsage),
          finishReason: result.stop_reason ?? null,
        };
        return;
      }
    } catch (error) {
      // A cancelled stage killed the child; the reason the user's cancel carried is what
      // the runner expects back, not whatever the half-closed pipe threw.
      req.signal.throwIfAborted();
      throw error;
    } finally {
      // The consumer can also abandon the generator - a retry, a timeout - and an agent
      // session left running would keep spending the user's subscription.
      try {
        if (run) ended = await stopCliRun(run);
      } finally {
        documents?.remove();
      }
    }
    // A cancelled run ends its stream the same way an exhausted one does: the child was
    // killed, so stdout simply stopped. An aborted call counts as nothing, so it must not
    // be reported as the provider failing.
    req.signal.throwIfAborted();
    // The stream ended with no result event at all.
    if (!run)
      throw new Error(
        "The Claude Code CLI could not be started. Check it is installed and set up in Settings → Providers, then use Retry stage.",
      );
    const login = cliLoginError("claude-code", run.stderr());
    if (login) throw login;
    throw providerError({
      kind: "other",
      message: ended === undefined ? stuckCli(binary) : endedWithout(binary, ended, run.stderr()),
    });
  }

  return {
    id: "claude-code",
    // Partial messages keep the deadline alive; complete assistant turns supply prose.
    capabilities: { streams: true, reportsUsage: true, webSearch: true },
    models: deps.readModels ?? (() => nodeClaudeCodeModels(binary)),
    complete,
  };
}

// The CLI reports the upstream status on the result event; nothing else about a local
// process says which failure this was.
function kindOf(status: number | null): ProviderErrorKind {
  if (status === 401 || status === 403) {
    return "auth";
  }
  if (status === 429) {
    return "rate_limit";
  }
  return "other";
}

// What most often fixes the upstream status the CLI passed on.
function nextStep(binary: string, status: number | null): string {
  if (status === 401 || status === 403)
    return `Run "${commandOf(binary)} auth login" in a terminal to sign in again, then use Retry stage.`;
  if (status === 429)
    return "Your Claude usage limit may be used up: wait until it resets, then use Retry stage.";
  if (status === 404)
    return "The chosen model may not exist or not be available to your account: choose another in the Providers section of Edit project, then use Retry stage.";
  return cliCheck(binary);
}

// `modelUsage` is keyed by model id and a run may touch more than one - a fallback model,
// a sub-agent - so the counts are summed. An empty object means the CLI reported none.
function usageOf(
  usage: Readonly<Record<string, { inputTokens: number; outputTokens: number }>> | undefined,
): Usage | null {
  const entries = Object.values(usage ?? {});
  if (entries.length === 0) {
    return null;
  }
  return {
    inputTokens: entries.reduce((total, one) => total + one.inputTokens, 0),
    outputTokens: entries.reduce((total, one) => total + one.outputTokens, 0),
  };
}
