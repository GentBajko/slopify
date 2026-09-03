import { z } from "zod";
import { redact } from "../../kernel/log.js";
import type { LlmCompletion, LlmEvent, LlmPort, Usage } from "../../kernel/ports/llm.js";
import type { ModelInfo, ProviderErrorKind } from "../../kernel/ports/model.js";
import { providerError } from "../../kernel/ports/model.js";
import type { RunCli } from "./run-cli.js";
import { cliEvent, cliShaped, endedWithout, promptOf } from "./run-cli.js";
import { lines } from "./sse-lines.js";

// The local-agent adapter for Claude Code: spawned non-interactively, authenticated by the
// CLI's own login, no key anywhere in this file. Readiness is not computed here - `adapters/**`
// may not import `slices/**`, and `slices/settings/cli-status.ts` already probes the binary per
// request. The registry `main.ts` builds is where this adapter and that probe meet.

export const claudeCodeBinary = "claude";

// The CLI takes an alias for the latest model of a family (`claude --help`, 2.1.258).
// ceiling: a fixed list, because the CLI has no offline command that prints the models an
// account may use. A user whose plan carries a model not listed here cannot pick it;
// reading the list off the CLI is the upgrade when it can print one.
export const claudeCodeModels: readonly ModelInfo[] = [
  { id: "fable", name: "Claude Fable (latest)" },
  { id: "opus", name: "Claude Opus (latest)" },
  { id: "sonnet", name: "Claude Sonnet (latest)" },
  { id: "haiku", name: "Claude Haiku (latest)" },
];

export interface ClaudeCodeDeps {
  readonly run: RunCli;
  readonly binary?: string | undefined;
}

// Measured on 2.1.258, not assumed: with the built-in tools left alone, a `-p` run of this CLI
// still reached for ToolSearch and WebFetch, and the machine's MCP servers were loaded into the
// session. Neither belongs in a content pipeline - grounding on the web is an explicit ask,
// never something a stage does quietly, and no stage should touch the disk. `--tools ""`
// empties the built-in set and `--strict-mcp-config` drops the user's MCP servers; the init
// event of a run with both reports `"tools":[]` and `"mcp_servers":[]`.
export function claudeCodeArgs(req: LlmCompletion): string[] {
  return [
    "-p",
    "--output-format",
    "stream-json",
    // stream-json output is refused without it.
    "--verbose",
    "--strict-mcp-config",
    ...(req.webSearch === true
      ? ["--tools", "WebSearch", "--allowedTools", "WebSearch"]
      : ["--tools", ""]),
    ...(req.model === "" ? [] : ["--model", req.model]),
    // Everything after `--` is the prompt, so a prompt opening with a dash is text and not
    // a flag. It is one argv element: no shell sees it and nothing in it is expanded.
    "--",
    promptOf(req.messages),
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
    const run = deps.run(binary, claudeCodeArgs(req), req.signal);
    try {
      for await (const line of lines(run.stdout, req.signal)) {
        if (line.trim() === "") {
          continue;
        }
        const event = cliEvent(binary, line);
        if (event.type === "assistant") {
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
        if (result.is_error === true || result.subtype !== "success") {
          throw providerError({
            kind: kindOf(result.api_error_status ?? null),
            message: redact(result.result ?? result.subtype),
          });
        }
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
      run.kill();
    }
    // A cancelled run ends its stream the same way an exhausted one does: the child was
    // killed, so stdout simply stopped. An aborted call counts as nothing, so it must not
    // be reported as the provider failing.
    req.signal.throwIfAborted();
    // The stream ended with no result event at all.
    throw providerError({
      kind: "other",
      message: endedWithout(binary, await run.ended, run.stderr()),
    });
  }

  return {
    id: "claude-code",
    // Whole assistant turns rather than token deltas, still enough for the idle timeout to
    // see life on the stream. ceiling: `--include-partial-messages` would give per-token
    // deltas for the streamed article; it is the upgrade when the page needs finer text.
    capabilities: { streams: true, reportsUsage: true, webSearch: true },
    models: (): Promise<readonly ModelInfo[]> => Promise.resolve(claudeCodeModels),
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
