import type { Clock } from "../clock.js";
import type { Log } from "../log.js";
import type { ThinkingMode, Usage } from "../ports/llm.js";
import { isProviderError, type ProviderFault, providerError } from "../ports/model.js";
import type { Registry } from "../ports/registry.js";
import { attempt, type ProviderCallKind } from "./attempt.js";
import type { AttemptStore } from "./attempt-repo.js";
import type { ProviderUse } from "./meter.js";

// One check call: the smallest request a model takes, to learn whether it works for the
// person's key or login. It goes through the attempt wrapper like every call, but is made
// once - a failure is never retried, so a check never costs more than its estimate - and
// nothing is recorded as a project's attempt.

export type CheckCall =
  | {
      readonly kind: "llm";
      readonly provider: string;
      readonly model: string;
      readonly prompt: string;
      readonly thinking?: ThinkingMode | undefined;
    }
  | {
      readonly kind: "tts";
      readonly provider: string;
      readonly model: string;
      readonly voiceId: string;
      readonly text: string;
    }
  | {
      readonly kind: "image";
      readonly provider: string;
      readonly model: string;
      readonly prompt: string;
      readonly aspect: "16:9" | "9:16" | "1:1";
      readonly thinking?: ThinkingMode | undefined;
    };

export interface CheckDeps {
  readonly registry: Registry;
  readonly clock: Clock;
  readonly log: Log;
}

export interface CheckAnswer {
  readonly verdict: "works" | "no-access" | "failed";
  // The provider's own words (redacted) when it did not work.
  readonly sentence: string | null;
  // A rejected key or a used-up limit: the provider's other checks would fail the same way.
  readonly stopProvider: boolean;
  // What the call used, for pricing; null when nothing was answered.
  readonly use: ProviderUse | null;
}

// ceiling: a check that has not answered in a minute is called failed rather than waited for.
export const checkTimeoutMs = 60_000;

const unrecorded: AttemptStore = { start: () => "model-check", end: () => {} };
const stageOf = { llm: "article", tts: "audio", image: "images" } as const;

export async function checkModel(
  deps: CheckDeps,
  call: CheckCall,
  signal: AbortSignal,
): Promise<CheckAnswer> {
  // Filled in by the call, read once the wrapper is done.
  const seen: { fault?: ProviderFault; use: ProviderUse | null } = { use: null };
  const started = deps.clock.now().getTime();
  const run = async (inner: AbortSignal, progress: () => void): Promise<void> => {
    const bounded = AbortSignal.any([inner, AbortSignal.timeout(checkTimeoutMs)]);
    try {
      seen.use = await answer(deps.registry, call, bounded, progress);
    } catch (error) {
      if (inner.aborted) throw error;
      seen.fault = bounded.aborted
        ? { kind: "timeout" }
        : isProviderError(error)
          ? error.fault
          : { kind: "other" };
      // Rethrown as final, so the wrapper names and redacts it without trying again.
      throw providerError({
        kind: "unsupported",
        message: bounded.aborted
          ? `The model did not answer within ${String(checkTimeoutMs / 1000)} seconds.`
          : error instanceof Error
            ? error.message
            : String(error),
      });
    }
  };
  const kind: ProviderCallKind = call.kind;
  try {
    const result = await attempt(
      {
        work: {
          projectId: "model-check",
          revisionId: "model-check",
          workId: "model-check",
          stageId: "model-check",
          kind: stageOf[call.kind],
          fingerprint: "model-check",
        },
        maySubmit: () => true,
        clock: deps.clock,
        log: deps.log,
        attempts: unrecorded,
        projectId: "model-check",
        stage: stageOf[call.kind],
        stageId: "model-check",
        signal,
      },
      run,
      { kind, timeoutMs: checkTimeoutMs + 30_000 },
    );
    if (!result.ok) return { verdict: "failed", sentence: null, stopProvider: false, use: null };
  } catch (error) {
    signal.throwIfAborted();
    const sentence = error instanceof Error ? error.message : String(error);
    const named: ProviderFault =
      seen.fault ?? (isProviderError(error) ? error.fault : { kind: "other" });
    if (named.access !== undefined)
      return { verdict: "no-access", sentence, stopProvider: false, use: null };
    const stopProvider =
      named.kind === "auth" ||
      named.kind === "missing_key" ||
      named.kind === "rate_limit" ||
      named.planLimit !== undefined;
    return { verdict: "failed", sentence, stopProvider, use: null };
  }
  const answered = seen.use;
  return {
    verdict: "works",
    sentence: null,
    stopProvider: false,
    use:
      answered === null
        ? null
        : { ...answered, wallMs: Math.max(0, deps.clock.now().getTime() - started) },
  };
}

async function answer(
  registry: Registry,
  call: CheckCall,
  signal: AbortSignal,
  progress: () => void,
): Promise<ProviderUse> {
  const base = { provider: call.provider, model: call.model, wallMs: 0 };
  if (call.kind === "llm") {
    let text = "";
    let usage: Usage | null = null;
    for await (const event of registry.llm(call.provider).complete({
      model: call.model,
      ...(call.thinking === undefined ? {} : { thinking: call.thinking }),
      messages: [{ role: "user", content: call.prompt }],
      signal,
    })) {
      progress();
      if (event.type === "delta") text += event.text;
      else if (event.type === "done") usage = event.usage;
    }
    if (text.trim() === "") throw new Error("The model answered with no text.");
    return {
      kind: "llm",
      ...base,
      ...(usage === null ? {} : { tokensIn: usage.inputTokens, tokensOut: usage.outputTokens }),
    };
  }
  if (call.kind === "tts") {
    const spoken = await registry.tts(call.provider).synthesize({
      model: call.model,
      voiceId: call.voiceId,
      text: call.text,
      signal,
      onActivity: progress,
    });
    const bytes = new Uint8Array(await new Response(spoken.audio).arrayBuffer());
    if (bytes.length === 0) throw new Error("The voice model sent no audio.");
    return { kind: "tts", ...base, characters: call.text.length };
  }
  await registry.image(call.provider).generate({
    model: call.model,
    prompt: call.prompt,
    aspect: call.aspect,
    ...(call.thinking === undefined ? {} : { thinking: call.thinking }),
    signal,
  });
  return { kind: "image", ...base, images: 1, size: call.aspect };
}
