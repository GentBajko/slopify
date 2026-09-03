import type { Clock } from "../../kernel/clock.js";
import type {
  LlmCapabilities,
  LlmCompletion,
  LlmEvent,
  LlmPort,
  Message,
  Usage,
} from "../../kernel/ports/llm.js";
import type { ModelInfo, ProviderErrorInit } from "../../kernel/ports/model.js";
import { providerError } from "../../kernel/ports/model.js";

// The scripted double every later stage's tests run against: the
// only doubles in the project are these three, so they carry the seam's shape and
// nothing mocks past it.

export interface FakeLlmOptions {
  readonly id?: string;
  readonly capabilities?: LlmCapabilities;
  readonly models?: readonly ModelInfo[];
  readonly deltas?: readonly string[];
  // The deltas one request answers with, when the answer has to depend on what was asked:
  // research sends a planner call, one call per chapter and a synthesis call to the same
  // adapter. The attempt number is 1-based, as `failOnAttempt`'s key is.
  readonly reply?: ((req: LlmCompletion, attempt: number) => readonly string[]) | undefined;
  // `usage: null` is the provider that reports none, and it has to be tellable from the option
  // not being given at all, so it is read with `in` rather than with `??`.
  readonly usage?: Usage | null;
  readonly finishReason?: string | null;
  // Fake milliseconds spent on the injected clock before each delta: how a test drives
  // the idle timeout without waiting.
  readonly gapMs?: number;
  readonly clock?: Clock;
  // Keyed by 1-based attempt number, so a test can fail the first two calls and let the
  // third answer.
  readonly failOnAttempt?: Readonly<Record<number, ProviderErrorInit>>;
  // Every call refuses with this text, which the wrapper must not retry.
  readonly refuse?: string;
  // The model has no web grounding: a request asking for it is refused outright.
  readonly webSearchUnsupported?: boolean;
}

// What a provider that does report usage reports, per call.
export const reportedUsage: Usage = { inputTokens: 11, outputTokens: 22 };

export interface FakeLlm extends LlmPort {
  readonly calls: () => number;
  readonly seen: () => readonly (readonly Message[])[];
}

export function fakeLlm(options: FakeLlmOptions = {}): FakeLlm {
  const gapMs = options.gapMs ?? 0;
  if (gapMs > 0 && options.clock === undefined) {
    throw new Error("a fake LLM with a gap between deltas needs a clock to spend it on");
  }
  const deltas = options.deltas ?? ["Hello", " world"];
  const usage: Usage | null = "usage" in options ? (options.usage ?? null) : reportedUsage;
  let calls = 0;
  const seen: (readonly Message[])[] = [];

  async function* complete(req: LlmCompletion): AsyncGenerator<LlmEvent> {
    calls += 1;
    seen.push([...req.messages]);
    if (options.refuse !== undefined) {
      throw providerError({ kind: "refusal", message: options.refuse });
    }
    if (options.webSearchUnsupported === true && req.webSearch === true) {
      throw providerError({
        kind: "unsupported",
        message: "web research unsupported by this model",
      });
    }
    const failure = options.failOnAttempt?.[calls];
    if (failure !== undefined) {
      throw providerError(failure);
    }
    for (const text of options.reply?.(req, calls) ?? deltas) {
      if (gapMs > 0 && options.clock !== undefined) {
        await options.clock.sleep(gapMs, req.signal);
      }
      req.signal.throwIfAborted();
      yield { type: "delta", text };
    }
    yield {
      type: "done",
      usage,
      finishReason: options.finishReason ?? "stop",
    };
  }

  return {
    id: options.id ?? "fake-llm",
    capabilities: options.capabilities ?? { streams: true, reportsUsage: true, webSearch: true },
    models: (): Promise<readonly ModelInfo[]> =>
      Promise.resolve(options.models ?? [{ id: "fake-model", name: "Fake Model" }]),
    complete,
    calls: (): number => calls,
    seen: (): readonly (readonly Message[])[] => seen,
  };
}
