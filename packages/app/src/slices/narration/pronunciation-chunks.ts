import { fingerprint } from "../../kernel/runner/work.js";
import { type Chunking, chunkNarration } from "./chunk.js";
import { type GlossaryEntry, pronunciationMatches } from "./pronunciation.js";

export function pronunciationChunks(
  source: string,
  chunking: Chunking,
  entries: readonly GlossaryEntry[],
  overriddenKeys: ReadonlySet<string> = new Set(),
): readonly { readonly key: string; readonly text: string }[] {
  const occurrences = new Map<string, number>();
  const nextKey = (text: string): string => {
    const hash = fingerprint(text).slice(0, 20);
    const occurrence = (occurrences.get(hash) ?? 0) + 1;
    occurrences.set(hash, occurrence);
    return `audio:body:${hash}-${occurrence}`;
  };
  let offset = 0;
  const chunks = chunkNarration(source, chunking).map((text) => {
    const start = source.indexOf(text, offset);
    if (start < 0) throw new Error("Narration chunk is missing from its source.");
    offset = start + text.length;
    return { key: nextKey(text), text, start, end: offset };
  });
  const matches = pronunciationMatches(source, entries).filter(
    (match) =>
      !chunks.some(
        (chunk) =>
          overriddenKeys.has(chunk.key) && chunk.start < match.end && match.start < chunk.end,
      ),
  );
  const result: { key: string; text: string }[] = [];
  let from = 0;
  for (const [index, chunk] of chunks.entries()) {
    const next = chunks[index + 1];
    if (
      next !== undefined &&
      matches.some((match) => match.start < chunk.end && next.start < match.end)
    )
      continue;
    const first = chunks[from];
    if (first === undefined) throw new Error("Narration group has no first chunk.");
    const text = source.slice(first.start, chunk.end);
    result.push({ key: from === index ? chunk.key : nextKey(text), text });
    from = index + 1;
  }
  return result;
}
