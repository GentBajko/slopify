import {
  type GlossaryEntry,
  type PronunciationRules,
  parsePronunciationGlossary,
  pronunciationMatches,
  pronunciationSpans,
} from "./pronunciation.js";
import { libraryGlossary } from "./pronunciations-library.js";
import { withSharedGlossary } from "./shared-glossary.js";

// Does this video say the names right? Two answers, at the two moments where a wrong one costs
// money.
//
// Before the narration is paid for: the names the voice will have to invent, because nothing
// pronounces the way this text says them — a two-word glossary term said by one of its words
// ("Belwar Dissengulp" listed, "Belwar" spoken), or a possessive or hyphenated name under the
// pronunciation rules this project narrates with. One line before Continue, so the names can go
// into Settings → Voices → Name pronunciations first and every later video says them the same.
//
// After the render: the same names, counted from the narration that was actually sent to the
// voice, and how each one was heard, from the per-word confidence the subtitle timing already
// wrote. Neither check blocks anything, changes anything or costs anything.

// Where a project's pronunciations come from, in the order narration reads them
// (`slices/rebuild/recipe-text.ts`): your own list first, then the article's own glossary, then
// the pooled copy of the other projects' glossaries where the project shares them.
export interface PronunciationSources {
  readonly glossary: string;
  readonly list?: string | undefined;
  readonly shared?: readonly GlossaryEntry[] | undefined;
  readonly language?: string | undefined;
  readonly rules: PronunciationRules;
}

// A name that reached the voice, or will reach it, as written rather than as IPA.
export interface UnguidedName {
  // The name as the text writes it, which is what a person has to search for to fix it.
  readonly name: string;
  readonly plain: number;
  readonly possessive: number;
  // Written with a capital where it was said. A proper name is ranked first, because
  // "tieflings" read as written is nobody's problem and "Jarlaxle's" is.
  readonly proper: boolean;
}

export interface UnguidedNames {
  // Proper names first, each by how often it is said; common words after them.
  readonly names: readonly UnguidedName[];
  readonly mentions: number;
  // Mentions of proper names only: the number worth acting on.
  readonly proper: number;
}

// How the finished narration was heard saying one name, from the subtitle timing's confidence.
export interface HeardName {
  readonly name: string;
  readonly mentions: number;
  readonly mean: number;
  // The 10th and 90th percentile of its mentions, and the distance between them. The distance
  // is the signal: a rare name scores low even when it is said perfectly, so a name is only
  // worth a second listen when its mentions disagree with each other.
  readonly low: number;
  readonly high: number;
  readonly spread: number;
  readonly uneven: boolean;
}

export interface HeardNames {
  readonly names: readonly HeardName[];
  readonly uneven: readonly HeardName[];
  // Every word the timing has, and their mean confidence: the baseline a name is read against.
  readonly words: number;
  readonly confidence: number;
}

// Measured over the 30 finished videos in this install: "Do'Urden" spreads 0.36 in both videos
// that say it and is heard several ways, while "Gygax" — a rare name the aligner always scores
// low — never spreads past 0.29 in the 26 videos that say it, so a low score on its own never
// flags. Eight mentions is the fewest from which the 10th and 90th percentiles mean anything.
export const heardMinMentions = 8;
export const heardSpreadFlag = 0.3;

// The entries narration pronounces with, assembled the way `recipe-text.ts` assembles them.
// Parsed twice: once under the rules the project narrates with, which is what actually guides
// the voice, and once under the current rules, which is the fullest list of names the sources
// name at all — a hyphenated term rules 1 had to skip is still a name this video says.
export function pronunciationEntries(sources: PronunciationSources): {
  readonly guiding: readonly GlossaryEntry[];
  readonly listed: readonly GlossaryEntry[];
} {
  const under = (rules: PronunciationRules): readonly GlossaryEntry[] => {
    const own = parsePronunciationGlossary(sources.glossary, sources.language, rules);
    const list = libraryGlossary(sources.list, sources.language, rules);
    return withSharedGlossary(
      list.ok ? list.entries : [],
      withSharedGlossary(own.ok ? own.entries : [], sources.shared),
    );
  };
  return { guiding: under(sources.rules), listed: under(2) };
}

// Delivery tags are the preparation's instructions to the voice, not words it reads, so a name
// inside one is not a mention. Blanked, not removed, so every offset still points at the text.
function withoutTags(source: string): string {
  return source.replace(/\[[^\]\n]*\]/gu, (tag) => " ".repeat(tag.length));
}

// Everything between a pair of slashes already reached the voice as IPA. Whitespace inside is
// never IPA, which keeps an "and/or … his/her" in ordinary prose from reading as a span.
function ipaRanges(source: string): readonly (readonly [number, number])[] {
  return Array.from(
    source.matchAll(/\/[^/\s]+\//gu),
    (match) => [match.index, match.index + match[0].length] as const,
  );
}

// The names to look for: every term the sources name, and — because a two-word term never
// matches one of its words said alone ("Belwar Dissengulp" listed, "Belwar" spoken) — each
// capitalised word of a longer term as a name of its own.
//
// A one-word name of four letters or more that the text also writes in lower case is an
// ordinary English word here, not a name: the pooled copy of the other projects' glossaries
// carries "Hall" (of "Mithral Hall"), "Quick" and "Claw", and an article that also says "halls"
// or "quickly" is not mispronouncing them. An ending of one or two letters counts as the same
// word, which is why "quickly" speaks for "Quick"; more than that does not, so "torment" leaves
// the god Torm alone. A term of several words, or a short one like "Bel", is never read this way.
function lowercaseWords(source: string): ReadonlySet<string> {
  const words = new Set<string>();
  for (const match of source.matchAll(/(?<![\p{L}\p{N}'’-])\p{Ll}[\p{L}'’-]*/gu)) {
    const word = match[0];
    words.add(word);
    if (word.length > 1) words.add(word.slice(0, -1));
    if (word.length > 2) words.add(word.slice(0, -2));
  }
  return words;
}

function ordinaryWord(term: string, lowercased: ReadonlySet<string>): boolean {
  return (
    term.length >= 4 &&
    !term.includes(" ") &&
    // Only a name written with a capital can be mistaken for one: a term the glossary itself
    // writes in lower case ("drow", "lich", "tiefling") is a common word by its own spelling,
    // and is told apart by `proper` rather than left out.
    /^\p{Lu}/u.test(term) &&
    lowercased.has(term.toLowerCase())
  );
}

function nameCandidates(
  entries: readonly GlossaryEntry[],
  source: string,
): readonly GlossaryEntry[] {
  const lowercased = lowercaseWords(source);
  const candidates = new Map<string, GlossaryEntry>();
  for (const entry of entries) {
    if (ordinaryWord(entry.term, lowercased)) continue;
    candidates.set(entry.term.toLowerCase(), entry);
  }
  for (const entry of entries) {
    const words = entry.term.split(" ");
    if (words.length < 2) continue;
    for (const [index, word] of words.entries()) {
      const key = word.toLowerCase();
      if (word.length < 3 || !/^\p{Lu}/u.test(word)) continue;
      if (candidates.has(key) || ordinaryWord(word, lowercased)) continue;
      candidates.set(key, { term: word, ipa: [entry.ipa[index] ?? ""] });
    }
  }
  return [...candidates.values()];
}

function countUnguided(
  source: string,
  entries: readonly GlossaryEntry[],
  guided: readonly (readonly [number, number])[],
): UnguidedNames {
  const text = withoutTags(source);
  const rows = new Map<string, { plain: number; possessive: number; proper: boolean }>();
  // Possessives are always matched here, whatever the project's rules: a possessive the rules
  // never wrapped is exactly the mention that reached the voice as written.
  for (const match of pronunciationMatches(text, nameCandidates(entries, text), true)) {
    if (guided.some(([from, to]) => match.start < to && match.end > from)) continue;
    // Named by what the text says, not by the glossary's spelling of the term.
    const said = text.slice(match.start, match.end);
    const name = said.replace(/['’]s$/u, "");
    const row = rows.get(name) ?? { plain: 0, possessive: 0, proper: /^\p{Lu}/u.test(name) };
    if (match.possessive === undefined) row.plain++;
    else row.possessive++;
    rows.set(name, row);
  }
  const total = (row: { plain: number; possessive: number }): number => row.plain + row.possessive;
  const names = [...rows.entries()]
    .map(([name, row]) => ({ name, ...row }))
    .sort(
      (a, b) =>
        Number(b.proper) - Number(a.proper) ||
        total(b) - total(a) ||
        a.name.localeCompare(b.name, "en"),
    );
  return {
    names,
    mentions: names.reduce((sum, row) => sum + total(row), 0),
    proper: names.filter((row) => row.proper).reduce((sum, row) => sum + total(row), 0),
  };
}

// Before the narration runs: the names this text says that the voice will have to invent. What
// narration will wrap is `pronunciationSpans` itself, under the project's own rules, so a
// project that narrates without possessives is told about its possessives and a newer one is not.
export function namesAhead(
  text: string,
  sources: PronunciationSources,
  possessives: boolean,
): UnguidedNames {
  const { guiding, listed } = pronunciationEntries(sources);
  const plain = withoutTags(text);
  const guided = pronunciationSpans(plain, guiding, possessives).map(
    (span) => [span.start, span.end] as const,
  );
  return countUnguided(plain, listed, guided);
}

// After the render: the same names, counted from the voice script, which is exactly the text the
// voice was sent. A name with no IPA in front of it there was guessed, whatever the glossary says.
export function namesNarrated(script: string, sources: PronunciationSources): UnguidedNames {
  const { listed } = pronunciationEntries(sources);
  return countUnguided(script, listed, ipaRanges(withoutTags(script)));
}

export interface TimedWord {
  readonly text: string;
  readonly confidence?: number | undefined;
}

// A word as the aligner read it: "Do'Urden," is the name, "Drizzt's" is the name too.
function spokenName(text: string): string {
  return text
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/[^\p{L}\p{N}'’-]+$/u, "")
    .replace(/['’]s$/u, "");
}

function percentile(sorted: readonly number[], fraction: number): number {
  const at = Math.round(fraction * (sorted.length - 1));
  return sorted[Math.min(sorted.length - 1, Math.max(0, at))] ?? 0;
}

// How the finished narration was heard saying each name, from the confidence the subtitle timing
// already carries. Nothing here is listened to again and nothing is re-aligned: the numbers are
// the ones written when the captions were timed.
export function heardNames(
  words: readonly TimedWord[],
  sources: PronunciationSources,
  // The narration as it was written: the corpus the candidates are judged against, so a pooled
  // "Hall" is left alone in a video that also says "hall" (see `nameCandidates`). The words as
  // the aligner wrote them down stand in when the narration itself is not at hand.
  corpus?: string,
): HeardNames {
  const { listed } = pronunciationEntries(sources);
  const heardText = corpus ?? words.map((word) => word.text).join(" ");
  const lowercased = lowercaseWords(heardText);
  const wanted = new Map<string, string>();
  // A word of the timing is one word, so a term of several reaches it a part at a time, and a
  // hyphenated name may arrive whole or in parts. A part that is an ordinary word of this text
  // ("Hall" of "Mithral Hall", in a video that also says "hall") is left out, as it is above.
  for (const entry of nameCandidates(listed, heardText))
    for (const part of [entry.term, ...entry.term.split(/[\s‐‑-]+/u)])
      if (part.length >= 3 && !wanted.has(part.toLowerCase()) && !ordinaryWord(part, lowercased))
        wanted.set(part.toLowerCase(), part);
  const scored = words.flatMap((word) =>
    typeof word.confidence === "number" ? [word.confidence] : [],
  );
  const by = new Map<string, number[]>();
  for (const word of words) {
    if (typeof word.confidence !== "number") continue;
    const name = wanted.get(spokenName(word.text).toLowerCase());
    if (name === undefined) continue;
    by.set(name, [...(by.get(name) ?? []), word.confidence]);
  }
  const names = [...by.entries()]
    .map(([name, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      const low = percentile(sorted, 0.1);
      const high = percentile(sorted, 0.9);
      return {
        name,
        mentions: sorted.length,
        mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
        low,
        high,
        spread: high - low,
        uneven: sorted.length >= heardMinMentions && high - low >= heardSpreadFlag,
      };
    })
    .sort((a, b) => b.spread - a.spread || a.name.localeCompare(b.name, "en"));
  return {
    names,
    uneven: names.filter((row) => row.uneven),
    words: scored.length,
    confidence:
      scored.length === 0 ? 0 : scored.reduce((sum, value) => sum + value, 0) / scored.length,
  };
}

const list = (names: readonly { readonly name: string }[], most = 6): string => {
  const shown = names.slice(0, most).map((row) => row.name);
  const rest = names.length - shown.length;
  return rest === 0 ? shown.join(", ") : `${shown.join(", ")} and ${String(rest)} more`;
};

// The one line before the narration is paid for. Names the names, says what will happen to them,
// and says the one place that fixes them for every video at once.
export function namesAheadNotice(result: UnguidedNames): string | null {
  const proper = result.names.filter((row) => row.proper);
  if (proper.length === 0) return null;
  return (
    `${proper.length === 1 ? "1 name" : `${String(proper.length)} names`} in this article ` +
    `${proper.length === 1 ? "has" : "have"} no pronunciation anywhere, so the voice will guess ` +
    `${proper.length === 1 ? "it" : "them"}: ${list(proper)}. ` +
    `To decide how they are said, add them to Settings → Voices → Name pronunciations, then make ` +
    `the narration.`
  );
}

// The one line on the upload section, after the render: what the voice guessed, and what it was
// heard saying more than one way. Null when there is nothing to say.
export function narratedNotice(
  narrated: UnguidedNames | null,
  heard: HeardNames | null,
): string | null {
  const guessed = narrated?.names.filter((row) => row.proper) ?? [];
  const uneven = heard?.uneven ?? [];
  if (guessed.length === 0 && uneven.length === 0) return null;
  const parts: string[] = [];
  if (guessed.length > 0)
    parts.push(
      `the voice guessed ${guessed.length === 1 ? "1 name" : `${String(guessed.length)} names`} ` +
        `(${list(guessed)})`,
    );
  if (uneven.length > 0)
    parts.push(
      `${uneven.length === 1 ? "1 name was" : `${String(uneven.length)} names were`} heard more ` +
        `than one way (${list(uneven)})`,
    );
  return `Names in this narration: ${parts.join(", and ")}. Open the check to see every mention.`;
}
