// The plan limits of the command-line agents: Claude Code, Codex and Gemini are billed to
// the user's subscription, which gives them a share of a 5-hour and a weekly allowance rather
// than a bill. Only what a CLI reports is ever recorded here; nothing is estimated.

// The subscription a CLI provider draws on. Codex text and Codex images share one login and
// so one allowance.
export const planAccounts = ["claude-code", "codex", "gemini"] as const;
export type PlanAccount = (typeof planAccounts)[number];

export function planAccountOf(provider: string): PlanAccount | undefined {
  if (provider === "claude-code") return "claude-code";
  if (provider === "codex" || provider === "codex-image") return "codex";
  if (provider === "gemini") return "gemini";
  return undefined;
}

export const planAccountNames: Readonly<Record<PlanAccount, string>> = {
  "claude-code": "Claude",
  codex: "Codex",
  gemini: "Gemini",
};

// One limit window as the CLI reports it. `usedPercent` is 0-100 of the window's allowance;
// `resetsAt` is ISO time, null when the CLI did not say.
export interface LimitWindow {
  readonly kind: "five_hour" | "weekly" | "other";
  readonly usedPercent: number;
  readonly resetsAt: string | null;
}

// What a call saw of its plan's windows. Claude Code reports them during the call; Codex is
// asked before and after it.
export interface PlanLimitReading {
  readonly before?: readonly LimitWindow[] | undefined;
  readonly after?: readonly LimitWindow[] | undefined;
}

// A CLI saying its plan's allowance is used up. `resetsAt` is when it returns (ISO), null when
// the CLI gave no time.
export interface PlanLimitHit {
  readonly account: PlanAccount;
  readonly resetsAt: string | null;
}

// A window of `minutes` length, named the way the screens name it.
export function windowKindOf(minutes: number | null | undefined): LimitWindow["kind"] {
  if (minutes === 300) return "five_hour";
  if (minutes === 10_080) return "weekly";
  return "other";
}

// Epoch seconds or milliseconds to ISO, null for anything that is not a plausible time.
export function isoOfEpoch(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return null;
  const ms = value < 1e12 ? value * 1000 : value;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
