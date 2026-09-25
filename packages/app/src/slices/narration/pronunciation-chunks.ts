import { fingerprint } from "../../kernel/runner/work.js";
import {
  type Chunking,
  chunkNarration,
  defaultChunkCharacters,
  defaultChunkWords,
} from "./chunk.js";
import { type GlossaryEntry, pronunciationMatches } from "./pronunciation.js";

export interface NarrationSource {
  readonly text: string;
  readonly start: number;
  readonly bodyFingerprint: string;
  readonly chunkingFingerprint: string;
}
export interface PronunciationChunk {
  readonly key: string;
  readonly text: string;
  readonly source?: NarrationSource;
}
export function pronunciationChunks(
  source: string,
  chunking: Chunking,
  entries: readonly GlossaryEntry[],
  overriddenKeys: ReadonlySet<string> = new Set(),
  sources: Readonly<Record<string, NarrationSource>> = {},
): readonly PronunciationChunk[] {
  const occurrences = new Map<string, number>();
  const usedKeys = new Set<string>();
  const nextKey = (text: string): string => {
    const hash = fingerprint(text).slice(0, 20);
    let occurrence = (occurrences.get(hash) ?? 0) + 1;
    while (usedKeys.has(`audio:body:${hash}-${occurrence}`)) occurrence++;
    occurrences.set(hash, occurrence);
    const key = `audio:body:${hash}-${occurrence}`;
    usedKeys.add(key);
    return key;
  };
  let offset = 0;
  const chunks = chunkNarration(source, chunking).map((text) => {
    const start = source.indexOf(text, offset);
    if (start < 0)
      throw new Error(
        "Slopify hit an internal error (a narration chunk isn't in the article text). Retry stage; if it happens again, use Download diagnostics in Settings and report it.",
      );
    offset = start + text.length;
    return { key: nextKey(text), text, start, end: offset };
  });
  const bodyFingerprint = fingerprint(source);
  const chunkingFingerprint = fingerprint([
    chunking.mode,
    chunking.mode === "words"
      ? (chunking.words ?? defaultChunkWords)
      : chunking.mode === "characters"
        ? (chunking.characters ?? defaultChunkCharacters)
        : null,
  ]);
  const starts = new Map(chunks.map((chunk, index) => [chunk.start, index]));
  const ends = new Map(chunks.map((chunk, index) => [chunk.end, index]));
  const pinned = new Map<number, { key: string; source: NarrationSource; last: number }>();
  let lastPinned = -1;
  for (const [key, saved] of Object.entries(sources).sort((a, b) => a[1].start - b[1].start)) {
    const first = starts.get(saved.start);
    const last = ends.get(saved.start + saved.text.length);
    if (
      saved.bodyFingerprint !== bodyFingerprint ||
      saved.chunkingFingerprint !== chunkingFingerprint ||
      source.slice(saved.start, saved.start + saved.text.length) !== saved.text ||
      !new RegExp(`^audio:body:${fingerprint(saved.text).slice(0, 20)}-[1-9][0-9]*$`, "u").test(
        key,
      ) ||
      first === undefined ||
      last === undefined ||
      first <= lastPinned ||
      last <= first ||
      chunks.slice(first, last + 1).some((chunk) => overriddenKeys.has(chunk.key))
    )
      continue;
    pinned.set(first, { key, source: saved, last });
    usedKeys.add(key);
    lastPinned = last;
  }
  const blocked = [
    ...chunks.filter((chunk) => overriddenKeys.has(chunk.key)),
    ...[...pinned.values()].map((row) => ({
      start: row.source.start,
      end: row.source.start + row.source.text.length,
    })),
  ].sort((a, b) => a.start - b.start);
  let blockedIndex = 0;
  const matches = pronunciationMatches(source, entries).filter((match) => {
    while ((blocked[blockedIndex]?.end ?? Infinity) <= match.start) blockedIndex++;
    return (blocked[blockedIndex]?.start ?? Infinity) >= match.end;
  });
  const result: PronunciationChunk[] = [];
  let from = 0;
  let matchIndex = 0;
  for (let index = 0; index < chunks.length; index++) {
    const sticky = pinned.get(index);
    if (sticky !== undefined) {
      result.push({ key: sticky.key, text: sticky.source.text, source: sticky.source });
      index = sticky.last;
      from = index + 1;
      continue;
    }
    const chunk = chunks[index];
    if (chunk === undefined)
      throw new Error(
        "Slopify hit an internal error (a narration chunk went missing). Retry stage; if it happens again, use Download diagnostics in Settings and report it.",
      );
    while ((matches[matchIndex]?.end ?? Infinity) <= chunk.end) matchIndex++;
    const match = matches[matchIndex];
    const next = chunks[index + 1];
    if (
      next !== undefined &&
      match !== undefined &&
      match.start < chunk.end &&
      next.start < match.end
    )
      continue;
    const first = chunks[from];
    if (first === undefined)
      throw new Error(
        "Slopify hit an internal error (a group of narration chunks is empty). Retry stage; if it happens again, use Download diagnostics in Settings and report it.",
      );
    const text = source.slice(first.start, chunk.end);
    result.push(
      from === index
        ? { key: chunk.key, text }
        : {
            key: nextKey(text),
            text,
            source: { text, start: first.start, bodyFingerprint, chunkingFingerprint },
          },
    );
    from = index + 1;
  }
  return result;
}
