import type { Clock } from "../clock.js";
import type { Log } from "../log.js";
import { redact } from "../log.js";
import type { StageKind } from "../pipeline.js";
import type { ProviderError, ProviderErrorKind } from "../ports/model.js";
import { isProviderError, providerError } from "../ports/model.js";
import type { AttemptStore } from "./attempt-repo.js";

// The retry policy, in one place. A stage slice is handed the wrapped calls of
// `providers.ts` and never an adapter, so there is no way round it.

// Four attempts - the first plus 3 retries - waiting 2 s, 8 s, 30 s.
export const attemptLimit = 4;
export const backoffMs: readonly number[] = [2000, 8000, 30_000];

// Each attempt times out at 120 s, image calls at 300 s.
export const timeoutMs: Readonly<Record<ProviderCallKind, number>> = {
  llm: 120_000,
  tts: 120_000,
  image: 300_000,
};

// A refusal and an unsupported capability are the provider's final answer; retrying only
// spends the user's money again. The third is a key removed mid-run, which leaves nothing
// to call with. A key the provider rejected is different: that is an `auth` failure,
// retried like any other.
const terminalKinds: readonly ProviderErrorKind[] = ["refusal", "unsupported", "missing_key"];

export type ProviderCallKind = "llm" | "tts" | "image";

export interface AttemptContext {
  readonly clock: Clock;
  readonly log: Log;
  readonly attempts: AttemptStore;
  readonly projectId: string;
  readonly stage: StageKind;
  readonly stageId: string;
  // The resumable sub-unit this call belongs to: one image of twenty, one audio chunk.
  readonly pieceId?: string | undefined;
  // The stage's own signal. Cancel aborts it and the whole attempt loop stops.
  readonly signal: AbortSignal;
}

// How a streaming call says a chunk arrived; the idle clock restarts on each one.
export type ProviderCall<T> = (signal: AbortSignal, progress: () => void) => Promise<T>;

export interface AttemptOptions {
  readonly kind: ProviderCallKind;
  readonly streaming?: boolean | undefined;
}

export async function attempt<T>(
  ctx: AttemptContext,
  call: ProviderCall<T>,
  opts: AttemptOptions,
): Promise<T> {
  ctx.signal.throwIfAborted();
  const limit = timeoutMs[opts.kind];
  for (let n = 1; ; n += 1) {
    const id = ctx.attempts.start({
      stageId: ctx.stageId,
      pieceId: ctx.pieceId ?? null,
      n,
      startedAt: ctx.clock.now().toISOString(),
    });
    const window = deadline(ctx.clock, ctx.signal, limit, opts.streaming === true);
    let result:
      | { readonly ok: true; readonly value: T }
      | { readonly ok: false; readonly at: unknown };
    try {
      result = { ok: true, value: await call(window.signal, window.progress) };
    } catch (error) {
      result = { ok: false, at: error };
    }
    const expired = window.expired();
    window.dispose();

    if (result.ok) {
      ctx.attempts.end(id, {
        outcome: "ok",
        endedAt: ctx.clock.now().toISOString(),
        errorText: null,
      });
      return result.value;
    }
    if (ctx.signal.aborted) {
      // An aborted call counts nothing. The row is closed so the page is
      // not left with an attempt that never ended, and carries no error text.
      ctx.attempts.end(id, {
        outcome: "canceled",
        endedAt: ctx.clock.now().toISOString(),
        errorText: null,
      });
      throw result.at;
    }

    const failure = classify(result.at, expired, opts, limit);
    ctx.attempts.end(id, {
      outcome: failure.fault.kind,
      endedAt: ctx.clock.now().toISOString(),
      errorText: failure.message,
    });
    ctx.log.write("warn", "provider.attempt", {
      projectId: ctx.projectId,
      stage: ctx.stage,
      detail: `${opts.kind} attempt ${n} of ${attemptLimit} failed (${failure.fault.kind}): ${failure.message}`,
    });
    if (terminalKinds.includes(failure.fault.kind) || n >= attemptLimit) {
      throw failure;
    }
    // A 429 that names a Retry-After replaces the fixed wait with the provider's.
    await ctx.clock.sleep(failure.fault.retryAfterMs ?? backoffMs[n - 1] ?? 0, ctx.signal);
  }
}

// The wrapper is the only place a provider failure is named.
function classify(
  error: unknown,
  expired: boolean,
  opts: AttemptOptions,
  limit: number,
): ProviderError {
  if (expired) {
    const seconds = Math.round(limit / 1000);
    return providerError({
      kind: "timeout",
      message:
        opts.streaming === true
          ? `the provider sent nothing for ${seconds} s`
          : `the provider did not answer within ${seconds} s`,
    });
  }
  if (isProviderError(error)) {
    // Rebuilt rather than rethrown so the text reaching the stage row, the page and the
    // log has been through the redactor: a provider is free to quote the key back.
    return providerError({
      kind: error.fault.kind,
      message: redact(error.message),
      ...(error.fault.retryAfterMs === undefined ? {} : { retryAfterMs: error.fault.retryAfterMs }),
    });
  }
  return providerError({
    kind: "other",
    message: redact(error instanceof Error ? error.message : String(error)),
  });
}

interface Deadline {
  // The signal handed to the provider call: the stage's abort or this attempt's clock.
  readonly signal: AbortSignal;
  readonly progress: () => void;
  readonly expired: () => boolean;
  readonly dispose: () => void;
}

// The same milliseconds, measured two ways. `idle` restarts the count on every chunk, so a
// stalled stream is cut off and a long answer is not. Cancel still wins.
function deadline(clock: Clock, parent: AbortSignal, ms: number, idle: boolean): Deadline {
  const timer = new AbortController();
  const signal = AbortSignal.any([parent, timer.signal]);
  let due = clock.now().getTime() + ms;
  let expired = false;
  let disposed = false;

  const watch = async (): Promise<void> => {
    while (!disposed) {
      const left = due - clock.now().getTime();
      if (left <= 0) {
        expired = true;
        timer.abort(new Error(`the provider call passed its ${Math.round(ms / 1000)} s limit`));
        return;
      }
      try {
        await clock.sleep(left, timer.signal);
      } catch {
        // Disposed, or the call already ended: nothing left to time.
        return;
      }
    }
  };
  void watch();

  return {
    signal,
    progress: (): void => {
      if (idle) {
        due = clock.now().getTime() + ms;
      }
    },
    expired: (): boolean => expired,
    dispose: (): void => {
      disposed = true;
      timer.abort();
    },
  };
}
