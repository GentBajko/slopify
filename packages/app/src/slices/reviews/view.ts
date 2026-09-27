import { narrationItemKey, type ReviewRecord } from "./model.js";

// The step whose output a verdict is about: the word timing for the narration (it is what
// the reviewer heard), a short's render for the short, and the item's own step otherwise.
export function reviewedOutputKey(itemKey: string): string {
  if (itemKey === narrationItemKey) return "subtitles:timing";
  if (/^shorts:\d+$/.test(itemKey)) return `${itemKey}:render`;
  return itemKey;
}

export interface ReviewView extends ReviewRecord {
  // Whether the verdict is about the output the project shows now. A verdict on an output
  // that has since been replaced is history, not a flag.
  readonly current: boolean;
  // The shown output the verdict is about, so the page can put it beside that image or short.
  readonly outputId: string | null;
  // How many verdicts the item has had, this one included.
  readonly verdicts: number;
}

// Each item's latest verdict, newest first as the records come.
export function latestReviews(
  records: readonly ReviewRecord[],
  outputs: readonly {
    readonly workKey: string;
    readonly fingerprint: string;
    readonly outputId: string;
  }[],
): readonly ReviewView[] {
  const seen = new Map<string, number>();
  for (const record of records) seen.set(record.itemKey, (seen.get(record.itemKey) ?? 0) + 1);
  const latest = new Map<string, ReviewRecord>();
  for (const record of records) if (!latest.has(record.itemKey)) latest.set(record.itemKey, record);
  return [...latest.values()].map((record) => {
    const shown = outputs.find(
      (output) =>
        output.workKey === reviewedOutputKey(record.itemKey) &&
        output.fingerprint === record.itemFingerprint,
    );
    return {
      ...record,
      current: shown !== undefined,
      outputId: shown?.outputId ?? null,
      verdicts: seen.get(record.itemKey) ?? 1,
    };
  });
}
