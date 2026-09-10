import { z } from "zod";
import { redact } from "../../kernel/log.js";
import type { LlmCompletion, LlmEvent, LlmPort, Usage } from "../../kernel/ports/llm.js";
import type { ModelInfo } from "../../kernel/ports/model.js";
import { providerError } from "../../kernel/ports/model.js";
import type { RunCli } from "./run-cli.js";
import { cliEvent, cliShaped, endedWithout, promptOf } from "./run-cli.js";
import { lines } from "./sse-lines.js";

// The local-agent adapter for the Codex CLI. Same shape as Claude Code's and a different
// vocabulary: Codex writes a JSONL thread of `thread.started`, `item.*` and `turn.*`
// events. No key here either - the CLI's own login authenticates it.

export const codexBinary = "codex";

// Codex publishes its account-specific picker in models_cache.json. With no
// cache, offer custom entry rather than pretending a pinned model is current.
export const codexModels: readonly ModelInfo[] = [];

export interface CodexDeps {
  readonly run: RunCli;
  readonly binary?: string | undefined;
  readonly readModels?: (() => Promise<readonly ModelInfo[]>) | undefined;
}

// `codex exec --help` (0.149.1) for the flags. `-c web_search=<mode>` is a TOML override, and
// the binary's own error names the modes: "unknown variant `bogus`, expected one of `disabled`,
// `cached`, `indexed`, `live`". `live` is the grounded mode research asks for and `disabled` is
// what every other stage runs under, so none grounds itself by accident. `--ephemeral` keeps no
// session file, `--skip-git-repo-check` lets it run in the data directory, and the quotes in
// the value are part of the argv element because the override is parsed as TOML, where a bare
// `live` is not a string.
export function codexArgs(req: LlmCompletion): string[] {
  return [
    "exec",
    "--json",
    "--ephemeral",
    "--skip-git-repo-check",
    "-c",
    `web_search="${req.webSearch === true ? "live" : "disabled"}"`,
    ...(req.thinkingConfig?.effort
      ? ["-c", `model_reasoning_effort="${req.thinkingConfig.effort}"`]
      : []),
    ...(req.model === "" ? [] : ["-m", req.model]),
    // The prompt is one argv element after `--`, so a leading dash is text, not a flag.
    "--",
    promptOf(req.messages),
  ];
}

const itemCompleted = z.object({
  item: z.object({ type: z.string(), text: z.string().optional() }),
});

// The field names are the shipped binary's own: `TurnCompletedEvent` carries `usage`, and
// its counts are `input_tokens`, `cached_input_tokens`, `cache_write_input_tokens`,
// `output_tokens`, `reasoning_output_tokens`. Only the two the port has a home for are read.
const turnCompleted = z.object({
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }).nullish(),
});

const turnFailed = z.object({ error: z.object({ message: z.string() }) });
// The top-level `error` event carries its text in `message`, not in `error.message`.
const errorEvent = z.object({ message: z.string() });

export function codexLlm(deps: CodexDeps): LlmPort {
  const binary = deps.binary ?? codexBinary;

  async function* complete(req: LlmCompletion): AsyncGenerator<LlmEvent> {
    const run = deps.run(binary, codexArgs(req), req.signal);
    try {
      for await (const line of lines(run.stdout, req.signal)) {
        if (line.trim() === "") {
          continue;
        }
        const event = cliEvent(binary, line);
        yield { type: "activity" };
        req.signal.throwIfAborted();
        if (event.type === "item.completed") {
          const { item } = cliShaped(binary, itemCompleted, event.value);
          // A turn also completes `reasoning`, `web_search`, `command_execution` and
          // `error` items. The last of those is a warning, not a failure: this machine's
          // codex opens every run with an `error` item saying it has no metadata for the
          // configured model, then answers normally. Only `turn.failed` ends a turn.
          if (item.type === "agent_message" && item.text !== undefined && item.text !== "") {
            yield { type: "delta", text: item.text };
          }
          continue;
        }
        if (event.type === "turn.completed") {
          const { usage } = cliShaped(binary, turnCompleted, event.value);
          // ceiling: Codex reports no stop reason, so the continuation loop cannot tell a
          // finished answer from one cut at the output limit. A `--output-schema` run
          // would, at the cost of constraining every stage's answer.
          yield { type: "done", usage: usageOf(usage), finishReason: null };
          return;
        }
        if (event.type === "turn.failed") {
          throw providerError({
            kind: "other",
            message: redact(cliShaped(binary, turnFailed, event.value).error.message),
          });
        }
        if (event.type === "error") {
          throw providerError({
            kind: "other",
            message: redact(cliShaped(binary, errorEvent, event.value).message),
          });
        }
      }
    } catch (error) {
      req.signal.throwIfAborted();
      throw error;
    } finally {
      run.kill();
    }
    // A cancelled run ends its stream the same way an exhausted one does: the child was
    // killed, so stdout simply stopped. An aborted call counts as nothing, so it must not
    // be reported as the provider failing.
    req.signal.throwIfAborted();
    // The stream ended with neither a completed turn nor a failure.
    throw providerError({
      kind: "other",
      message: endedWithout(binary, await run.ended, run.stderr()),
    });
  }

  return {
    id: "codex",
    // Prose arrives as whole messages; other JSONL events carry activity separately.
    capabilities: { streams: true, reportsUsage: true, webSearch: true },
    models: deps.readModels ?? (() => Promise.resolve(codexModels)),
    complete,
  };
}

function usageOf(
  usage: { readonly input_tokens: number; readonly output_tokens: number } | null | undefined,
): Usage | null {
  return usage === null || usage === undefined
    ? null
    : { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens };
}
