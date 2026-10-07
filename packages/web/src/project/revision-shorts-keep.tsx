import { rendersClip } from "@app/slices/rebuild/shorts-keep-save.js";
import type { KeptShort, RevisionEdit, RevisionView } from "@app/slices/revisions/model.js";
import type { PickedShorts } from "@app/slices/shorts/clips.js";
import { keptOf } from "@app/slices/shorts/keep.js";
import type { ShortPick } from "@app/slices/shorts/pick.js";
import { type ReactElement, useId } from "react";

// The finished shorts (their render ready and in use), in number order.
export function finishedClips(
  view: RevisionView,
  clips: readonly ShortPick[],
): readonly ShortPick[] {
  return clips
    .filter((clip) => view.outputs.some((row) => rendersClip(row, clip)))
    .toSorted((left, right) => left.number - right.number);
}

// Edit project → Shorts, when a change would pick the moments again: which finished shorts
// stay as they are (same moment, title and images; only rendered again). Kept shorts come
// first, numbered 1…k in this order; new moments are picked for the rest of the count. Left
// untouched, the save keeps the first finished shorts up to the count (`recipe-save.ts`).
export function KeepShorts({
  edit,
  view,
  picked,
  clips,
  count,
  problem,
  onChange,
}: {
  readonly edit: RevisionEdit;
  readonly view: RevisionView;
  readonly picked: PickedShorts;
  readonly clips: readonly ShortPick[];
  readonly count: number;
  readonly problem: string | undefined;
  readonly onChange: (edit: RevisionEdit) => void;
}): ReactElement | null {
  const id = useId();
  const finished = finishedClips(view, clips);
  if (finished.length === 0) return null;
  const chosen =
    JSON.stringify(edit.content.shortsKeep ?? null) !==
    JSON.stringify(view.revision.content.shortsKeep ?? null);
  const kept = new Set(
    chosen
      ? (edit.content.shortsKeep ?? []).map((short) => short.from)
      : finished.slice(0, count).map((clip) => clip.number),
  );
  const sentences = picked.sentences ?? [];
  const set = (next: ReadonlySet<number>) => {
    const keep = finished.flatMap((clip): KeptShort[] => {
      if (!next.has(clip.number)) return [];
      const short = keptOf(clip, sentences);
      return short === undefined ? [] : [short];
    });
    onChange({ ...edit, content: { ...edit.content, shortsKeep: keep } });
  };
  const over = kept.size > count;
  const fresh = Math.max(0, count - kept.size);
  return (
    <fieldset
      aria-describedby={`${id}-help`}
      className="space-y-2 rounded-md border border-line p-3"
    >
      <legend className="sl-kicker px-1">Keep finished shorts</legend>
      <p id={`${id}-help`} className="text-small text-ink-2">
        Ticked shorts stay as they are: same moment, title and images, only rendered again. They
        come first;{" "}
        {fresh === 0
          ? "no new moments are picked"
          : `${String(fresh)} new ${fresh === 1 ? "moment is" : "moments are"} picked for the rest`}
        .
      </p>
      <ul className="space-y-1">
        {finished.map((clip) => {
          const box = `${id}-${String(clip.number)}`;
          return (
            <li key={clip.number} className="flex min-h-10 items-center gap-3">
              <input
                id={box}
                type="checkbox"
                checked={kept.has(clip.number)}
                aria-invalid={over && kept.has(clip.number)}
                className="size-4 accent-accent"
                onChange={(event) => {
                  const next = new Set(kept);
                  if (event.target.checked) next.add(clip.number);
                  else next.delete(clip.number);
                  set(next);
                }}
              />
              <label htmlFor={box} className="min-w-0 flex-1 text-small">
                <span className="font-semibold">Short {clip.number}</span>{" "}
                <span className="text-ink">{clip.title}</span>{" "}
                <span className="text-ink-3">{Math.round(clip.end - clip.start)} s</span>
              </label>
            </li>
          );
        })}
      </ul>
      {over || problem !== undefined ? (
        <p role="alert" className="text-small text-danger">
          {over
            ? `Tick at most ${String(count)} ${count === 1 ? "short" : "shorts"}, the number of shorts set above.`
            : problem}
        </p>
      ) : null}
    </fieldset>
  );
}
