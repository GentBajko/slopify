import type { LimitWindow } from "../../kernel/ports/plan-limits.js";

// How much of a CLI plan's windows a project's calls took. A plan's readings are account-wide:
// they move with every use of the account, this project's or not. So a call is charged only
// its own before→after rise, and only when nothing else on the account ran during it; calls
// that overlapped split their rise by tokens; anything else is said to be shared, not guessed.

// "measured": every call's rise was its own. "split": some overlapped and split their rise by
// tokens. "shared": some calls' share could not be told apart from other use. "approximate":
// stored before each call's own readings were kept, so only the account's rise is known.
export const windowBases = ["measured", "split", "shared", "approximate"] as const;
export type WindowBasis = (typeof windowBases)[number];

export interface PlanWindowUse {
  readonly kind: LimitWindow["kind"];
  // Percentage points of the window this project's own calls took; null when no call's share
  // could be told apart. Never above `accountPercent` or 100.
  readonly usedPercent: number | null;
  readonly basis: WindowBasis;
  // Calls whose share could not be told apart from other use on the account.
  readonly sharedCalls: number;
  // All use on the account while the calls ran: the reading before the first call, the rise
  // over the run (at most 100) and whether the window reset meanwhile.
  readonly fromPercent: number;
  readonly accountPercent: number;
  readonly rolledOver: boolean;
  // The latest reading and when that window resets.
  readonly nowPercent: number;
  readonly resetsAt: string | null;
}

// One call's readings. `usageId` names its provider_usage row; null for a reading stored
// before that was kept, whose times are only when it was recorded.
export interface CallReading {
  readonly usageId: string | null;
  readonly startMs: number;
  readonly endMs: number;
  readonly tokens: number | null;
  readonly before?: readonly LimitWindow[] | undefined;
  readonly after?: readonly LimitWindow[] | undefined;
}

// Any call on the account, from any project or schedule, with or without readings.
export interface AccountCall {
  readonly id: string;
  readonly startMs: number;
  readonly endMs: number;
  // Tokens in and out; null when the call reported none (an image, a call with no usage).
  readonly tokens: number | null;
}

export interface AccountActivity {
  readonly calls: readonly AccountCall[];
  // Readings of calls other than the project's own, for an after-only call's "before".
  readonly readings: readonly CallReading[];
}

// An after-only call (Claude Code reports its windows once) takes the account's reading just
// before it as its "before"; one older than this says nothing about the call alone.
export const beforeGapMs = 15 * 60_000;
// A stated reset that moves by less than this is drift, not a new window.
const resetDriftMs = 60 * 60_000;

interface Point {
  readonly atMs: number;
  readonly window: LimitWindow;
}

const kindOrder: readonly LimitWindow["kind"][] = ["five_hour", "weekly", "other"];

const windowOf = (
  windows: readonly LimitWindow[] | undefined,
  kind: LimitWindow["kind"],
): LimitWindow | undefined => windows?.find((window) => window.kind === kind);

export function windowUse(
  own: readonly CallReading[],
  account: AccountActivity = { calls: [], readings: [] },
): PlanWindowUse[] {
  const kinds = new Set<LimitWindow["kind"]>();
  for (const reading of own)
    for (const window of [...(reading.before ?? []), ...(reading.after ?? [])])
      kinds.add(window.kind);
  return kindOrder.flatMap((kind) => {
    if (!kinds.has(kind)) return [];
    const use = kindUse(kind, own, account);
    return use === undefined ? [] : [use];
  });
}

function kindUse(
  kind: LimitWindow["kind"],
  own: readonly CallReading[],
  account: AccountActivity,
): PlanWindowUse | undefined {
  const mine = own.filter(
    (reading) =>
      windowOf(reading.before, kind) !== undefined || windowOf(reading.after, kind) !== undefined,
  );
  const legacy = mine.some((reading) => reading.usageId === null);
  const calls = new Map<string, AccountCall>();
  for (const call of account.calls) calls.set(call.id, call);
  for (const reading of own)
    if (reading.usageId !== null)
      calls.set(reading.usageId, {
        id: reading.usageId,
        startMs: reading.startMs,
        endMs: reading.endMs,
        tokens: reading.tokens,
      });
  const everyReading = [...own, ...account.readings];

  const points: Point[] = [];
  let used = 0;
  let measured = 0;
  let split = 0;
  let shared = 0;
  for (const reading of mine) {
    const before = windowOf(reading.before, kind);
    const after = windowOf(reading.after, kind);
    if (before !== undefined) points.push({ atMs: reading.startMs, window: before });
    if (after !== undefined) points.push({ atMs: reading.endMs, window: after });
    if (legacy || reading.usageId === null) continue;
    const start = before === undefined ? pointBefore(kind, reading, everyReading) : undefined;
    if (start !== undefined) points.push(start);
    const from = before ?? start?.window;
    const spanStart = before === undefined ? start?.atMs : reading.startMs;
    if (from === undefined || after === undefined || spanStart === undefined) {
      shared += 1;
      continue;
    }
    const rise = rolledOver(from, after, reading.endMs)
      ? after.usedPercent
      : after.usedPercent - from.usedPercent;
    const beside = [...calls.values()].filter(
      (call) =>
        call.id !== reading.usageId && call.endMs > spanStart && call.startMs < reading.endMs,
    );
    if (beside.length === 0) {
      used += rise;
      measured += 1;
      continue;
    }
    const tokens = reading.tokens ?? 0;
    const others = beside.map((call) => call.tokens);
    if (tokens <= 0 || others.some((count) => count === null)) {
      shared += 1;
      continue;
    }
    const total = others.reduce<number>((sum, count) => sum + (count ?? 0), tokens);
    used += (rise * tokens) / total;
    split += 1;
  }

  const sorted = points.toSorted((left, right) => left.atMs - right.atMs);
  const first = sorted[0];
  const last = sorted.at(-1);
  if (first === undefined || last === undefined) return undefined;
  const { rise: accountPercent, segments } = accountRise(sorted);
  const share = legacy
    ? accountPercent
    : measured + split === 0
      ? null
      : Math.min(Math.max(0, used), accountPercent);
  return {
    kind,
    usedPercent: share,
    basis: legacy ? "approximate" : shared > 0 ? "shared" : split > 0 ? "split" : "measured",
    sharedCalls: legacy ? 0 : shared,
    fromPercent: first.window.usedPercent,
    accountPercent,
    rolledOver: segments > 1,
    nowPercent: last.window.usedPercent,
    resetsAt: last.window.resetsAt,
  };
}

// The latest reading on the account at or before the call began, from any call but itself.
function pointBefore(
  kind: LimitWindow["kind"],
  call: CallReading,
  readings: readonly CallReading[],
): Point | undefined {
  let found: Point | undefined;
  for (const reading of readings) {
    if (reading.usageId !== null && reading.usageId === call.usageId) continue;
    const candidates: Point[] = [];
    const before = windowOf(reading.before, kind);
    const after = windowOf(reading.after, kind);
    if (before !== undefined) candidates.push({ atMs: reading.startMs, window: before });
    if (after !== undefined) candidates.push({ atMs: reading.endMs, window: after });
    for (const point of candidates)
      if (
        point.atMs <= call.startMs &&
        point.atMs >= call.startMs - beforeGapMs &&
        (found === undefined || point.atMs > found.atMs)
      )
        found = point;
  }
  return found;
}

// Within one call the window reset when the reading dropped or the stated reset passed.
function rolledOver(before: LimitWindow, after: LimitWindow, endMs: number): boolean {
  if (after.usedPercent < before.usedPercent) return true;
  return before.resetsAt !== null && Date.parse(before.resetsAt) <= endMs;
}

// Across many calls' readings a drop alone is not a reset: parallel calls report out of
// order. A new window needs the stated reset to have passed, or a drop with the reset moved
// on by more than drift. The rise is counted per window from its readings' range, at most 100.
function accountRise(points: readonly Point[]): { rise: number; segments: number } {
  let segments = 1;
  let rise = 0;
  let base = points[0]?.window.usedPercent ?? 0;
  let peak = base;
  for (let at = 1; at < points.length; at += 1) {
    const previous = points[at - 1];
    const current = points[at];
    if (previous === undefined || current === undefined) continue;
    if (newWindow(previous, current)) {
      rise += Math.max(0, peak - base);
      segments += 1;
      base = 0;
      peak = current.window.usedPercent;
      continue;
    }
    peak = Math.max(peak, current.window.usedPercent);
  }
  rise += Math.max(0, peak - base);
  return { rise: Math.min(100, rise), segments };
}

function newWindow(previous: Point, current: Point): boolean {
  const passed =
    previous.window.resetsAt !== null && Date.parse(previous.window.resetsAt) <= current.atMs;
  if (passed) return true;
  if (current.window.usedPercent >= previous.window.usedPercent) return false;
  return (
    previous.window.resetsAt !== null &&
    current.window.resetsAt !== null &&
    Date.parse(current.window.resetsAt) - Date.parse(previous.window.resetsAt) > resetDriftMs
  );
}
