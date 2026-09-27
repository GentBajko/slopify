import type { StageKind } from "../pipeline.js";
import type { PlanAccount, PlanLimitHit, PlanLimitReading } from "../ports/plan-limits.js";
import type { ProviderCallKind } from "./attempt.js";

// What one successful provider call used, as the provider reported it. Counts a provider did
// not report are absent, never guessed; the run-cost slice prices it (main.ts wires it in,
// since the kernel may not import a slice).
export interface MeteredCall {
  readonly projectId: string;
  readonly stage: StageKind;
  readonly kind: ProviderCallKind;
  readonly provider: string;
  readonly model: string;
  readonly tokensIn?: number | undefined;
  readonly tokensOut?: number | undefined;
  readonly cachedTokens?: number | undefined;
  readonly characters?: number | undefined;
  readonly images?: number | undefined;
  readonly seconds?: number | undefined;
  // The image's aspect and, for an agent-driven image, its reasoning effort.
  readonly size?: string | undefined;
  readonly quality?: string | undefined;
  // From submitting the call to its answer, retries included.
  readonly wallMs: number;
  readonly limits?: PlanLimitReading | undefined;
}

export interface UsageMeter {
  readonly record: (call: MeteredCall) => void;
}

export interface LimitWaiter {
  readonly projectId: string;
  readonly stage: StageKind;
}

// Living within a CLI's plan limits. `ready` answers at once while the plan has allowance and
// otherwise waits for the stored reset (plus a margin), however the wait began - this call,
// another project's, or a run before a restart. Cancel and pause end the wait through the
// signal.
export interface LimitGate {
  readonly ready: (account: PlanAccount, waiter: LimitWaiter, signal: AbortSignal) => Promise<void>;
  readonly exhausted: (hit: PlanLimitHit) => void;
}
