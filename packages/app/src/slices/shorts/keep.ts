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
    text: sentences
      .slice(clip.first - 1, clip.last)
      .map((sentence) => sentence.text)
      .join(" "),
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
      const text = sentences
        .slice(first - 1, last)
        .map((sentence) => sentence.text)
        .join(" ");
      if (short.text !== undefined && !same(text, short.text)) continue;
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
        text,
        ...(short.seed === undefined ? {} : { seed: short.seed }),
      };
    }
    if (found === undefined) lost.push(index + 1);
    else picks.push(found);
  }
  return { picks, lost };
}

// The kept shorts and the new ones together: each kept short keeps its number; the new ones
// take the free numbers (a kept short's whose words changed first, then k+1…) in the order
// they play, carrying `seed` (the pick's token).
export function withNewPicks(
  kept: readonly ShortPick[],
  fresh: readonly ShortPick[],
  seed: string | null,
): readonly ShortPick[] {
  const taken = new Set(kept.map((one) => one.number));
  const free = Array.from({ length: kept.length + fresh.length }, (_value, at) => at + 1).filter(
    (number) => !taken.has(number),
  );
  return [
    ...kept,
    ...fresh
      .toSorted((left, right) => left.start - right.start)
      .map((pick, index) => ({ ...pick, number: free[index] ?? taken.size + index + 1, seed })),
  ].toSorted((left, right) => left.number - right.number);
}

// Where a clip's sentences are in the narration as it is now: at the same numbers when they
// still say the same, else wherever the same run of sentences is found once. Undefined when
// its words are not in the narration any more.
export function locateClip(
  sentences: readonly PickedSentence[],
  clip: Pick<ShortPick, "first" | "last" | "text">,
  durationSeconds: number,
):
  | { readonly first: number; readonly last: number; readonly start: number; readonly end: number }
  | undefined {
  const count = clip.last - clip.first + 1;
  const says = (first: number) =>
    same(
      sentences
        .slice(first - 1, first - 1 + count)
        .map((sentence) => sentence.text)
        .join(" "),
      clip.text,
    );
  const at = (first: number) => {
    const bounds = clipBounds(sentences, first, first + count - 1, durationSeconds);
    return bounds === undefined ? undefined : { first, last: first + count - 1, ...bounds };
  };
  if (count >= 1 && clip.last <= sentences.length && says(clip.first)) return at(clip.first);
  const found: number[] = [];
  for (let first = 1; first + count - 1 <= sentences.length; first++)
    if (says(first)) found.push(first);
  return found.length === 1 && found[0] !== undefined ? at(found[0]) : undefined;
}
