import type { KeptShort } from "../revisions/model.js";
import type { PickedSentence } from "./clips.js";
import { clipBounds, type ShortPick } from "./pick.js";

// Shorts kept through a change of their moments: a count raised or lowered, a new intro or a
// narration edit that moves the timing. A kept short is remembered by its sentences' text, so
// it is found again however the timing moved, and keeps its title, hashtags and seed (and with
// the seed its prompts, images and render's token). Kept shorts come first, numbered 1…k in
// the order listed; new ones follow. Pure: planning, the save and the pick read the same.

// The short a clip of the current pick is, as a kept short.
export function keptOf(
  clip: Pick<
    ShortPick,
    "number" | "first" | "last" | "title" | "description" | "hashtags" | "why" | "seed"
  >,
  sentences: readonly Pick<PickedSentence, "text">[],
): KeptShort | undefined {
  const opening = sentences[clip.first - 1]?.text;
  const closing = sentences[clip.last - 1]?.text;
  if (opening === undefined || closing === undefined || clip.last < clip.first) return undefined;
  return {
    from: clip.number,
    opening,
    closing,
    sentences: clip.last - clip.first + 1,
    title: clip.title,
    description: clip.description,
    hashtags: clip.hashtags,
    why: clip.why,
    ...(clip.seed === undefined ? {} : { seed: clip.seed }),
  };
}

const same = (left: string, right: string): boolean =>
  left.replace(/\s+/g, " ").trim() === right.replace(/\s+/g, " ").trim();

// Each kept short found in the transcript, numbered 1…k in order, and the ones whose
// sentences are no longer there (by their place in the list, 1-based).
export function anchorKept(
  kept: readonly KeptShort[],
  sentences: readonly PickedSentence[],
  durationSeconds: number,
): { readonly picks: readonly ShortPick[]; readonly lost: readonly number[] } {
  const picks: ShortPick[] = [];
  const lost: number[] = [];
  const taken = (first: number, last: number) =>
    picks.some((one) => first <= one.last && last >= one.first);
  for (const [index, short] of kept.entries()) {
    let found: ShortPick | undefined;
    for (let at = 0; at + short.sentences <= sentences.length && found === undefined; at++) {
      const first = at + 1;
      const last = at + short.sentences;
      const opening = sentences[at];
      const closing = sentences[last - 1];
      if (opening === undefined || closing === undefined) continue;
      if (!same(opening.text, short.opening) || !same(closing.text, short.closing)) continue;
      if (taken(first, last)) continue;
      const bounds = clipBounds(sentences, first, last, durationSeconds);
      if (bounds === undefined) continue;
      found = {
        number: index + 1,
        first,
        last,
        start: bounds.start,
        end: bounds.end,
        title: short.title,
        description: short.description,
        hashtags: short.hashtags,
        why: short.why,
        text: sentences
          .slice(first - 1, last)
          .map((sentence) => sentence.text)
          .join(" "),
        ...(short.seed === undefined ? {} : { seed: short.seed }),
      };
    }
    if (found === undefined) lost.push(index + 1);
    else picks.push(found);
  }
  return { picks, lost };
}

// The kept shorts and the new ones together: kept 1…k, then the new ones as k+1… in the order
// they play, carrying `seed` (the pick's token).
export function withNewPicks(
  kept: readonly ShortPick[],
  fresh: readonly ShortPick[],
  seed: string | null,
): readonly ShortPick[] {
  return [
    ...kept,
    ...fresh
      .toSorted((left, right) => left.start - right.start)
      .map((pick, index) => ({ ...pick, number: kept.length + index + 1, seed })),
  ];
}

// Why the pick can't go on: kept shorts whose sentences changed in the narration.
export function lostMessage(lost: readonly number[], kept: readonly KeptShort[]): string {
  const names = lost
    .map((at) => {
      const short = kept[at - 1];
      return short === undefined ? `short ${String(at)}` : `short ${String(at)} ("${short.title}")`;
    })
    .join(", ");
  return `The narration of ${names} changed, so its moment can't be kept. Open Edit project → Shorts and choose Pick a new moment for it or drop it, then Remake.`;
}
