import type { PlanUse, PlanWindowUse } from "@app/slices/run-cost/panel.js";

// How the Run cost tab and the run rail word a run's share of a CLI plan's windows. A plan's
// readings are account-wide, so the run's own share and all use on the account are said apart,
// and a share that cannot be told from other use is said to be shared rather than guessed.

const percent = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

export function windowName(kind: PlanWindowUse["kind"]): string {
  return kind === "five_hour" ? "5-hour" : kind === "weekly" ? "weekly" : "current";
}

function points(value: number): string {
  return value < 1 ? "under 1%" : `${percent.format(value)}%`;
}

// The big number: "5%", "~5%" (split by tokens), "at least 5%", "up to 45%", or "Shared".
export function shareValue(window: PlanWindowUse): string {
  if (window.usedPercent === null) return "Shared";
  const used = window.usedPercent < 1 ? "<1%" : `${percent.format(window.usedPercent)}%`;
  switch (window.basis) {
    case "measured":
      return used;
    case "split":
      return `~${used}`;
    case "shared":
      return `at least ${used}`;
    case "approximate":
      return `up to ${used}`;
  }
}

// What the big number is a share of: "of weekly Codex limit".
export function shareLabel(window: PlanWindowUse, limit: string): string {
  if (window.usedPercent === null) return `${limit}: can't be told from other use`;
  return window.basis === "approximate" ? `of ${limit}, shared with other use` : `of ${limit}`;
}

// The run rail's line: "Codex: 5% of your weekly limit".
export function shareShort(plan: Pick<PlanUse, "name">, window: PlanWindowUse): string {
  const limit = `${windowName(window.kind)} limit`;
  if (window.usedPercent === null)
    return `${plan.name}: this run's share of your ${limit} is shared with other use`;
  return `${plan.name}: ${shareValue(window)} of your ${limit}${window.basis === "approximate" ? ", shared with other use" : ""}`;
}

// "This run used 5% of your weekly Codex limit, ..." and how that share was told.
export function shareLine(plan: Pick<PlanUse, "name">, window: PlanWindowUse): string {
  const limit = `your ${windowName(window.kind)} ${plan.name} limit`;
  const used = window.usedPercent;
  if (window.basis === "approximate")
    return `This project ran before Slopify kept each call's own readings, so its share of ${limit} is shared with other use on this account: up to ${points(used ?? 0)}.`;
  if (used === null)
    return `This run's share of ${limit} is shared with other use: its calls ran while other calls on this account did, so it can't be told apart.`;
  if (window.basis === "shared")
    return `This run used at least ${points(used)} of ${limit}. ${count(window.sharedCalls)} ran while other calls on this account did, so their share is shared with other use and not counted.`;
  if (window.basis === "split")
    return `This run used about ${points(used)} of ${limit}. Calls that ran at the same time split their rise by tokens.`;
  return `This run used ${points(used)} of ${limit}, from each call's own readings.`;
}

// "Claude weekly: 34% → 61% while this ran (all use on this account) · resets Tue 14:00."
export function accountLine(plan: Pick<PlanUse, "name">, window: PlanWindowUse): string {
  const reset = window.rolledOver ? ", with a reset in between" : "";
  const resets = window.resetsAt === null ? "" : ` · resets ${day(window.resetsAt)}`;
  return `${plan.name} ${windowName(window.kind)}: ${percent.format(window.fromPercent)}% → ${percent.format(window.nowPercent)}% while this ran${reset} (all use on this account)${resets}.`;
}

function count(calls: number): string {
  return calls === 1 ? "1 call" : `${percent.format(calls)} calls`;
}

function day(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
