// Narration aliases: a written word or phrase and how the narrator should say it ("Dr." as
// "Doctor"). They change only what is sent to the voice (and to Narration Preparation);
// the article, the transcript and the captions keep the written form. The same matcher runs
// where the text is narrated and where captions are timed against that narration, so both
// agree on which words were said differently. It lives with the ports because the caption
// aligner (an adapter, which may import only ports) needs it as much as the recipes do.

export interface NarrationAlias {
  readonly written: string;
  readonly spoken: string;
  // Only where the written form stands as a word of its own, not inside a longer word.
  readonly wholeWord: boolean;
  readonly caseSensitive: boolean;
}

export interface AliasMatch {
  readonly start: number;
  readonly end: number;
  readonly spoken: string;
}

export const aliasWrittenMax = 200;
export const aliasSpokenMax = 500;
export const aliasCountMax = 1000;

const wordCharacter = /[\p{L}\p{M}\p{N}_]/u;

// Every place an alias applies: leftmost first, the longest written form where two start at
// the same place, never overlapping.
export function aliasMatches(
  text: string,
  aliases: readonly NarrationAlias[],
): readonly AliasMatch[] {
  const found: AliasMatch[] = [];
  for (const alias of aliases) {
    const written = alias.written.trim();
    if (written === "") continue;
    const pattern = written
      .split(/\s+/u)
      .map((word) => word.replace(/[|\\{}()[\]^$+*?.]/gu, "\\$&"))
      .join("\\s+");
    const expression = new RegExp(pattern, alias.caseSensitive ? "gu" : "giu");
    const first = Array.from(written)[0] ?? "";
    const last = Array.from(written).at(-1) ?? "";
    for (const match of text.matchAll(expression)) {
      const start = match.index;
      const end = start + match[0].length;
      if (alias.wholeWord) {
        const before = Array.from(text.slice(Math.max(0, start - 2), start)).at(-1) ?? "";
        const after = Array.from(text.slice(end, end + 2))[0] ?? "";
        if (wordCharacter.test(first) && wordCharacter.test(before)) continue;
        if (wordCharacter.test(last) && wordCharacter.test(after)) continue;
      }
      found.push({ start, end, spoken: alias.spoken });
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const chosen: AliasMatch[] = [];
  let reached = 0;
  for (const match of found) {
    if (match.start < reached) continue;
    chosen.push(match);
    reached = match.end;
  }
  return chosen;
}

// The same text as the narrator should read it.
export function applyAliases(text: string, aliases: readonly NarrationAlias[]): string {
  let out = "";
  let at = 0;
  for (const match of aliasMatches(text, aliases)) {
    out += text.slice(at, match.start) + match.spoken;
    at = match.end;
  }
  return out + text.slice(at);
}
