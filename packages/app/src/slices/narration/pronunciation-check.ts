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
  // What the timing model heard where that was not this name, most mentions first. This is the
  // one part of the timing that says how the name was said rather than how clearly: forced
  // alignment places the word it is given whatever it hears, so a name said wrong the same way
  // every time scores as well as one said right (`adapters/alignment/window.ts#heardAs`).
  // Empty where every mention came out as written — and empty for captions timed before
  // Slopify kept this, which is why the answer carries `listened`.
  readonly saidAs: readonly SaidAs[];
  // The pronunciation the sources give this name, so what came out can be read against what
  // was asked for rather than against the spelling. Empty when the name reached the voice as
  // part of a longer term, or with nothing at all.
  readonly ipa: readonly string[];
  // Most of its mentions came out as a sound the name does not spell: the voice has its own
  // pronunciation of this name and keeps to it. Nothing else in the check can see this, because
  // every mention scores well and scores the same. Spelling that is only spelling is folded
  // away first (`soundKey`), so Bel heard as “bell” is not this and Lolth heard as “loth” is.
  readonly different: boolean;
}

export interface SaidAs {
  readonly letters: string;
  readonly mentions: number;
}

export interface HeardNames {
  readonly names: readonly HeardName[];
  readonly uneven: readonly HeardName[];
  // Names most of whose mentions came out as another sound, the most consistent first.
  readonly different: readonly HeardName[];
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

// A name counts as said differently when most of its mentions came out as the same other sound.
// Three mentions is the fewest where "every time" means anything, and six in ten keeps a name
// the voice says both ways out of it: that one belongs under `uneven`, which is about mentions
// disagreeing with each other.
export const differentMinMentions = 3;
export const differentShare = 0.6;

// Pairs of letters that spell one sound, folded so that a spelling and a sound are comparable.
// The timing model writes down what it hears, letter by letter, with no idea how the name is
// spelled: it writes CREEG for Kreeg, BELL for Bel, TIER for Tyr and DRIST for Drizzt, all of
// which are the name said correctly. Only the pairs that are the same sound in English however
// they are written are here — EA is not (heart, beat), nor CH (chair, loch) — so a fold that
// cancels is good evidence and one that does not is still only evidence.
const sameSound: readonly (readonly [string, string])[] = [
  ["PH", "F"],
  ["CK", "K"],
  ["QU", "KW"],
  ["X", "KS"],
  ["EE", "I"],
  ["OO", "U"],
  ["OU", "U"],
  ["AI", "A"],
  ["AY", "A"],
  ["IE", "I"],
  ["OA", "O"],
  ["AU", "O"],
  ["AW", "O"],
  ["C", "K"],
  ["Z", "S"],
  ["Y", "I"],
];

// One name or one hearing of it, reduced to roughly the sounds in it: everything that is only
// spelling is dropped, so two spellings of the same sound meet here and two sounds do not.
export function soundKey(text: string): string {
  let key = text.toUpperCase().replace(/[^\p{Lu}]+/gu, "");
  for (const [pair, sound] of sameSound) key = key.replaceAll(pair, sound);
  return key
    .replace(/(.)\1+/gu, "$1")
    .replace(/E$/u, "")
    .replace(/E?S$/u, "");
}

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
  // What the timing model heard here, where that was not this word: the part of the timing that
  // says how a name was said (`kernel/ports/subtitles.ts`, `adapters/alignment/window.ts`).
  readonly heard?: string | undefined;
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
  const wanted = new Map<string, { readonly name: string; readonly ipa: readonly string[] }>();
  // A word of the timing is one word, so a term of several reaches it a part at a time, and a
  // hyphenated name may arrive whole or in parts. A part that is an ordinary word of this text
  // ("Hall" of "Mithral Hall", in a video that also says "hall") is left out, as it is above.
  // A term stands as it is written, in lower case too ("tiefling"), but a part of a longer
  // term has to look like a name on its own: the "and" of a term that has one is a word.
  for (const entry of nameCandidates(listed, heardText))
    for (const [at, part] of [entry.term, ...entry.term.split(/[\s‐‑-]+/u)].entries())
      if (
        part.length >= 3 &&
        (at === 0 || /^\p{Lu}/u.test(part)) &&
        !wanted.has(part.toLowerCase()) &&
        !ordinaryWord(part, lowercased)
      )
        // The IPA belongs to the whole term, so only the term itself carries it: a part said
        // alone is exactly the mention nothing pronounced.
        wanted.set(part.toLowerCase(), { name: part, ipa: part === entry.term ? entry.ipa : [] });
  const scored = words.flatMap((word) =>
    typeof word.confidence === "number" ? [word.confidence] : [],
  );
  const by = new Map<
    string,
    {
      readonly ipa: readonly string[];
      readonly scores: number[];
      readonly said: Map<string, number>;
    }
  >();
  for (const word of words) {
    if (typeof word.confidence !== "number") continue;
    const found = wanted.get(spokenName(word.text).toLowerCase());
    if (found === undefined) continue;
    const row = by.get(found.name) ?? {
      ipa: found.ipa,
      scores: [] as number[],
      said: new Map<string, number>(),
    };
    row.scores.push(word.confidence);
    // Letters only, so one mention's punctuation never splits a spelling in two.
    const letters = word.heard?.toUpperCase().replace(/[^\p{L}' ]+/gu, "");
    if (letters !== undefined && letters !== "")
      row.said.set(letters, (row.said.get(letters) ?? 0) + 1);
    by.set(found.name, row);
  }
  const names = [...by.entries()]
    .map(([name, row]) => {
      const sorted = [...row.scores].sort((a, b) => a - b);
      const low = percentile(sorted, 0.1);
      const high = percentile(sorted, 0.9);
      // Only the hearings that are another sound: a decode that spells the name differently
      // (CREEG for Kreeg) is the name, and saying so would be noise, not a finding.
      const saidAs = [...row.said.entries()]
        .filter(([letters]) => soundKey(letters) !== soundKey(name))
        .map(([letters, mentions]) => ({ letters, mentions }))
        .sort((a, b) => b.mentions - a.mentions || a.letters.localeCompare(b.letters, "en"));
      // The mentions that came out as one sound, whichever ways they were spelled, against the
      // name's own: CREEG and KREEG are one hearing of Kreeg, and that hearing is the name.
      const key = soundKey(name);
      const sounds = new Map<string, number>();
      for (const [letters, mentions] of row.said)
        if (soundKey(letters) !== key)
          sounds.set(soundKey(letters), (sounds.get(soundKey(letters)) ?? 0) + mentions);
      const elsewhere = [...sounds.values()].sort((a, b) => b - a)[0] ?? 0;
      return {
        name,
        mentions: sorted.length,
        mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
        low,
        high,
        spread: high - low,
        uneven: sorted.length >= heardMinMentions && high - low >= heardSpreadFlag,
        saidAs,
        ipa: row.ipa,
        different:
          sorted.length >= differentMinMentions && elsewhere >= sorted.length * differentShare,
      };
    })
    .sort((a, b) => b.spread - a.spread || a.name.localeCompare(b.name, "en"));
  return {
    names,
    uneven: names.filter((row) => row.uneven),
    // A name the voice renamed outright is worse than one it said two ways, so the worst share
    // of mentions leads.
    different: names
      .filter((row) => row.different)
      .toSorted(
        (a, b) =>
          (b.saidAs[0]?.mentions ?? 0) / b.mentions - (a.saidAs[0]?.mentions ?? 0) / a.mentions ||
          b.mentions - a.mentions,
      ),
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
  const uneven = heard?.uneven.filter((row) => !row.different) ?? [];
  const different = heard?.different ?? [];
  if (guessed.length === 0 && uneven.length === 0 && different.length === 0) return null;
  const parts: string[] = [];
  // First, because it is the only finding that says the video is wrong rather than unguided.
  if (different.length > 0)
    parts.push(
      `${different.length === 1 ? "1 name came" : `${String(different.length)} names came`} out ` +
        `as another sound (${different
          .slice(0, 4)
          .map((row) => `${row.name} as “${(row.saidAs[0]?.letters ?? "").toLowerCase()}”`)
          .join(", ")}${different.length > 4 ? ` and ${String(different.length - 4)} more` : ""})`,
    );
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
  const sentence =
    parts.length === 1
      ? (parts[0] ?? "")
      : `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1) ?? ""}`;
  return `Names in this narration: ${sentence}. Open the check to see every mention.`;
}
