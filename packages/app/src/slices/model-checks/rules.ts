import type { ModelInfo } from "../../kernel/ports/model.js";
import {
  type CheckVerdict,
  type ModelCheckRow,
  type ModelStanding,
  type ModelStandingView,
  modelStandings,
  type Retiring,
  type VerdictSource,
} from "./model.js";

export interface VerdictState {
  readonly verdict: CheckVerdict | null;
  readonly verdictSource: VerdictSource | null;
  readonly sentence: string | null;
  readonly checkedAt: string | null;
}

export interface IncomingVerdict {
  readonly verdict: CheckVerdict;
  readonly source: VerdictSource;
  readonly sentence: string | null;
  readonly at: string;
}

// The newer of two decisive answers wins, whichever it is; an answer older than the stored one
// (a slow call finishing late) changes nothing; "failed" tells nothing about access, so it
// never replaces a decisive one.
export function mergeVerdict(
  previous: VerdictState | undefined,
  next: IncomingVerdict,
): VerdictState {
  const decisive = previous?.verdict === "works" || previous?.verdict === "no-access";
  if (previous?.checkedAt != null && Date.parse(next.at) < Date.parse(previous.checkedAt))
    return previous;
  if (next.verdict === "failed" && decisive && previous !== undefined) return previous;
  return {
    verdict: next.verdict,
    verdictSource: next.source,
    sentence: next.sentence,
    checkedAt: next.at,
  };
}

// A row learned with another key or login says nothing about this one.
export function standingOf(
  row: ModelCheckRow | undefined,
  account: string | undefined,
  retiring?: Retiring,
): ModelStandingView {
  const extra = retiring === undefined ? {} : { retiring };
  if (row === undefined || account === undefined || row.account !== account)
    return { standing: "known", checkedAt: null, sentence: null, source: null, ...extra };
  const standing: ModelStanding =
    row.verdict === "works" || row.verdict === "no-access"
      ? row.verdict
      : row.listed === true
        ? "listed"
        : "known";
  return {
    standing,
    checkedAt: row.checkedAt,
    sentence: row.sentence,
    source: row.verdict === null ? null : row.verdictSource,
    ...extra,
  };
}

export interface PickerEntry {
  readonly model: ModelInfo;
  readonly view: ModelStandingView | undefined;
}

export interface PickerList {
  readonly entries: readonly PickerEntry[];
  // How many models "Show all" would add.
  readonly hidden: number;
  // Nothing works for you yet, so the list falls back to listed, then known models.
  readonly fallback: boolean;
}

const order = (view: ModelStandingView | undefined): number =>
  modelStandings.indexOf(view?.standing ?? "known");

// The picker's list. By default only models that work for you, plus the one already chosen
// (never hidden, whatever its standing); before anything works, the listed models, then the
// known ones, so a picker is never empty before the first check.
export function pickerEntries(
  models: readonly ModelInfo[],
  standings: Readonly<Record<string, ModelStandingView>> | undefined,
  selected: string,
  showAll: boolean,
): PickerList {
  const viewOf = (model: ModelInfo): ModelStandingView | undefined =>
    standings !== undefined && Object.hasOwn(standings, model.id) ? standings[model.id] : undefined;
  const all = models
    .map((model, index) => ({ model, view: viewOf(model), index }))
    .sort((a, b) => order(a.view) - order(b.view) || a.index - b.index);
  const has = (standing: ModelStanding) =>
    all.some((entry) => (entry.view?.standing ?? "known") === standing);
  const shown: ModelStanding = has("works") ? "works" : has("listed") ? "listed" : "known";
  const keep = all.filter(
    (entry) =>
      showAll || entry.model.id === selected || (entry.view?.standing ?? "known") === shown,
  );
  return {
    entries: keep.map(({ model, view }) => ({ model, view })),
    hidden: all.length - keep.length,
    fallback: shown !== "works",
  };
}

const monthNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function ago(at: string, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - Date.parse(at)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${String(minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${String(hours)} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${String(days)} days ago`;
}

function shortDate(day: string): string {
  const [, month, date] = day.split("-");
  const name = monthNames[Number(month) - 1];
  return name === undefined ? day : `${String(Number(date))} ${name}`;
}

// The badge beside a model. Retiring outranks the rest: it is the one that needs doing.
export function badgeOf(view: ModelStandingView | undefined, now: Date): string {
  if (view?.retiring !== undefined)
    return `⚠ retiring ${shortDate(view.retiring.on)}${view.retiring.replacement === null ? "" : ` → ${view.retiring.replacement.name}`}`;
  if (view === undefined) return "? not checked";
  if (view.standing === "works")
    return view.checkedAt === null
      ? "✓ works"
      : `✓ works · ${view.source === "run" ? "used" : "checked"} ${ago(view.checkedAt, now)}`;
  if (view.standing === "no-access") return "✕ not on your plan";
  return view.standing === "listed" ? "? listed for you · not checked" : "? not checked";
}

// Models that started working for you since you last looked: Settings → Models' New for you.
export function newForYou(rows: readonly ModelCheckRow[]): readonly ModelCheckRow[] {
  return rows
    .filter((row) => row.verdict === "works" && row.firstWorksAt !== null && !row.noticeSeen)
    .sort((a, b) => (b.firstWorksAt ?? "").localeCompare(a.firstWorksAt ?? ""));
}

// A check estimate in words: "free", "less than a cent", "about $0.04".
export function dollarsText(dollars: number, unpriced = 0): string {
  const base =
    dollars <= 0 ? "free" : dollars < 0.01 ? "less than a cent" : `about $${dollars.toFixed(2)}`;
  if (unpriced === 0) return base;
  const more = `${String(unpriced)} model${unpriced === 1 ? "" : "s"} with no listed price`;
  return dollars <= 0 ? `${more} (price unknown)` : `${base}, plus ${more}`;
}

// The same estimate as the end of a sentence, "this costs …": "about $0.04 at list price",
// and for models with no listed price "an unknown amount: 3 models have no listed price".
export function costPhrase(dollars: number, unpriced = 0): string {
  const base =
    dollars <= 0
      ? "nothing"
      : `${dollars < 0.01 ? "less than a cent" : `about $${dollars.toFixed(2)}`} at list price`;
  if (unpriced === 0) return base;
  const models = `${String(unpriced)} model${unpriced === 1 ? "" : "s"}`;
  return dollars <= 0
    ? `an unknown amount: ${models} ${unpriced === 1 ? "has" : "have"} no listed price`
    : `${base}, plus an unknown amount for ${models} with no listed price`;
}
