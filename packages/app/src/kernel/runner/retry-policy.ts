import type { ProviderErrorKind } from "../ports/model.js";
import { isProviderError } from "../ports/model.js";

// The second tier of the retry policy. `attempt.ts` retries a failed call a few times within
// seconds; when those run out on a failure that time can fix, the step is put back to wait
// and runs again later, so a rate limit, a timeout or a dropped connection costs the user
// nothing but time. The wait is written down, not held in memory: a restart keeps it.

// The failures worth waiting out. A refusal, a rejected or missing key, an unsupported
// request and a lost submission are the provider's final answer (or need a person), so
// they are shown at once. `other` covers a request the provider rejected as well as an
// unreadable answer; the quick in-call retries are all it gets.
export const waitableKinds: readonly ProviderErrorKind[] = ["rate_limit", "timeout", "dropped"];

// Four waits after the first failed run: about 2, 4, 8 and 16 minutes, 30 in all.
export const autoRetryLimit = 4;
export const autoRetryBaseMs = 2 * 60_000;
// ±25 %, so a burst of steps that hit the same limit together do not all return together.
export const autoRetryJitter = 0.25;
// A provider asking for longer than this (a daily quota) is reported rather than waited on.
export const retryAfterCeilingMs = 60 * 60_000;

export interface Fault {
  readonly kind: ProviderErrorKind;
  readonly retryAfterMs?: number | undefined;
}

// A slice may wrap the wrapper's error in its own sentence ("Image 3: ..."); the kind is on
// the cause.
export function faultOf(error: unknown): Fault | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current !== undefined && current !== null; depth += 1) {
    if (isProviderError(current)) return current.fault;
    current = current instanceof Error ? current.cause : undefined;
  }
  return undefined;
}

// `retries` is how many waits the step already had. Undefined: report the failure now.
export function autoRetryDelay(
  fault: Fault | undefined,
  retries: number,
  random: () => number,
): number | undefined {
  if (fault === undefined || !waitableKinds.includes(fault.kind)) return undefined;
  if (retries >= autoRetryLimit) return undefined;
  const nominal = autoRetryBaseMs * 2 ** retries;
  const jittered = Math.round(nominal * (1 - autoRetryJitter + 2 * autoRetryJitter * random()));
  if (fault.retryAfterMs === undefined) return jittered;
  if (fault.retryAfterMs > retryAfterCeilingMs) return undefined;
  // The provider's own wait is the floor; ours still spreads the burst above it.
  return Math.max(fault.retryAfterMs, jittered);
}
