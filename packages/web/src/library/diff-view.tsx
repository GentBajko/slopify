import { type DiffPart, diffCounts, sideOf, wordDiff } from "@app/slices/library/diff.js";
import { type ReactElement, useMemo } from "react";

// Two texts side by side, the older on the left with its removed words struck through and the
// newer on the right with its added words marked. Word-level (`slices/library/diff.ts`), so a
// one-word change in a long prompt is found at a glance. Used by Library → History and by the
// YouTube description's "View diff".
export function DiffColumns({
  before,
  after,
  beforeLabel,
  afterLabel,
}: {
  readonly before: string;
  readonly after: string;
  readonly beforeLabel: string;
  readonly afterLabel: string;
}): ReactElement {
  const parts = useMemo(() => wordDiff(before, after), [before, after]);
  const counts = diffCounts(parts);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="m-0 text-small text-ink-2">
        {counts.added === 0 && counts.removed === 0
          ? "The two texts are the same."
          : `${String(counts.added)} ${counts.added === 1 ? "word" : "words"} added, ${String(counts.removed)} removed.`}
      </p>
      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
        <DiffSide label={beforeLabel} parts={sideOf(parts, "before")} />
        <DiffSide label={afterLabel} parts={sideOf(parts, "after")} />
      </div>
    </div>
  );
}

function DiffSide({
  label,
  parts,
}: {
  readonly label: string;
  readonly parts: readonly DiffPart[];
}): ReactElement {
  return (
    <section aria-label={label} className="flex min-w-0 flex-col gap-1">
      <h4 className="sl-kicker m-0">{label}</h4>
      <div className="min-w-0 whitespace-pre-wrap break-words border-l-2 border-line pl-3 text-small leading-relaxed text-ink">
        {keyed(parts).map(({ key, part }) =>
          part.op === "removed" ? (
            <del key={key} className="rounded-[2px] bg-danger-tint text-danger line-through">
              {part.text}
            </del>
          ) : part.op === "added" ? (
            <ins key={key} className="rounded-[2px] bg-accent-tint text-accent-ink no-underline">
              {part.text}
            </ins>
          ) : (
            <span key={key}>{part.text}</span>
          ),
        )}
      </div>
    </section>
  );
}

// Each part keyed by where it starts in its side's text, which is unique and stable.
function keyed(
  parts: readonly DiffPart[],
): readonly { readonly key: string; readonly part: DiffPart }[] {
  let at = 0;
  return parts.map((part) => {
    const key = `${part.op}-${String(at)}`;
    at += part.text.length;
    return { key, part };
  });
}
