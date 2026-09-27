import { remark } from "remark";
import remarkGfm from "remark-gfm";

export interface GlossaryEntry {
  readonly term: string;
  readonly ipa: readonly string[];
}
// A glossary row that can't be used: its 1-based entry number and why, never its contents
// (the glossary is model-written text and must not be echoed into messages).
export interface SkippedGlossaryRow {
  readonly row: number;
  readonly reason: string;
}
export type GlossaryResult =
  | {
      readonly ok: true;
      readonly entries: readonly GlossaryEntry[];
      // Rows left out, each with its reason. One bad row no longer stops the narration: the
      // rest of the glossary still applies and the skipped term is read as ordinary text.
      // Absent when every row was used, so a glossary that always parsed reads as before.
      readonly skipped?: readonly SkippedGlossaryRow[];
    }
  | { readonly ok: false; readonly reason: string };

interface MarkdownNode {
  readonly type: string;
  readonly value?: string;
  readonly children?: readonly MarkdownNode[];
}
// Inworld requires English IPA, not every symbol in Unicode's IPA Extensions block.
// https://docs.inworld.ai/tts/capabilities/custom-pronunciation
const ipaAtom =
  "[ˈˌ]?[abdefghijklmnoprstuvwxzæðŋθɑɒɔəɚɛɜɝɡɪɹʃʊʌʒʔɫɾ][\\u0303\\u031a\\u0325\\u0329\\u032a\\u032c\\u032f\\u035c\\u0361ʰʲʷ]*[ːˑ]?";
const ipaSymbols = new RegExp(`^(?:${ipaAtom})+(?:\\.(?:${ipaAtom})+)*$`, "u");
// Another language's glossary needs that language's sounds: the full IPA consonant and vowel
// charts (ç, ʁ, ø, y, ɲ, ʎ, x, β, …) and its diacritics, still never ARPAbet or tags.
const worldAtom =
  "[ˈˌ]?[a-zæçðøħŋœɐɑɒɓɔɕɖɗɘəɚɛɜɝɞɟɠɡɢɣɤɥɦɧɨɪɫɬɭɮɯɰɱɲɳɴɵɶɸɹɺɻɽɾʀʁʂʃʄʈʉʊʋʌʍʎʏʐʑʒʔʕʙʛʜʝʟʡʢβθχ][\\u0300-\\u036fʰʱʲʷʼˠˤ˞]*[ːˑ]?";
const worldSymbols = new RegExp(`^(?:${worldAtom})+(?:\\.(?:${worldAtom})+)*$`, "u");

function textOf(node: MarkdownNode): string {
  if (node.type === "break") return "\n";
  return node.value ?? node.children?.map(textOf).join("") ?? "";
}
function rowsOf(node: MarkdownNode): readonly string[] {
  if (node.type === "heading") {
    const text = textOf(node).trim();
    return /^pronunciation glossary:?\s*$/iu.test(text) ? [] : [text];
  }
  if (node.type === "table") {
    const rows = node.children ?? [];
    return rows.slice(1).map((row) => {
      const cells = row.children ?? [];
      if (cells.length < 2) return textOf(row);
      const [term, ipa] = cells.slice(0, 2).map((cell) => textOf(cell).trim());
      // A table's IPA column is often written without the slashes ("| Tiamat | ˈtiːəmɑːt |");
      // the column already says what the cell is, so a bare cell reads as one /…/ pronunciation.
      return `${term}: ${ipa !== undefined && ipa !== "" && !ipa.includes("/") ? `/${ipa}/` : ipa}`;
    });
  }
  if (node.type === "paragraph") return textOf(node).split(/\r?\n/u);
  if (node.type === "root" || node.type === "list" || node.type === "listItem")
    return (node.children ?? []).flatMap(rowsOf);
  return ["(unsupported glossary block)"];
}
function termIdentity(term: string): string {
  return Array.from(term, (character) => {
    const lower = character.toLowerCase();
    const folded = lower.toUpperCase().toLowerCase();
    if (folded === character) return character;
    // Full case conversion can expand letters; only /iu-equivalent forms may share a key.
    const match = new RegExp(`^${character.replace(/[|\\{}()[\]^$+*?.]/gu, "\\$&")}$`, "iu");
    return match.test(folded) ? folded : match.test(lower) ? lower : character;
  }).join("");
}
// `language` is the project's (`kernel/ports/languages.ts`): absent or English accepts the
// standard-English IPA Inworld asks for, as it always did; any other accepts full IPA.
export function parsePronunciationGlossary(
  markdown: string,
  language?: string | undefined,
): GlossaryResult {
  const english = language === undefined || language === "en";
  const symbols = english ? ipaSymbols : worldSymbols;
  const kind = english ? "standard-English IPA" : "IPA";
  const rows = rowsOf(remark().use(remarkGfm).parse(markdown));
  const entries = new Map<string, GlossaryEntry>();
  const skipped: SkippedGlossaryRow[] = [];
  for (const [index, row] of rows.entries()) {
    const skip = (reason: string): void => {
      skipped.push({ row: index + 1, reason });
    };
    const trimmed = row.trim();
    if (trimmed === "" || /^pronunciation glossary:?\s*$/iu.test(trimmed)) continue;
    const pair = /^([^:]+):\s*(.+)$/u.exec(trimmed);
    const term = pair?.[1]?.trim().replace(/\s+/gu, " ");
    const pronunciation = pair?.[2];
    if (
      term === undefined ||
      pronunciation === undefined ||
      !/[\p{L}\p{N}]/u.test(term) ||
      /[/[\]<>\p{Cc}]/u.test(term)
    ) {
      skip("use Term: /IPA/ or a Term | IPA table");
      continue;
    }
    const notation = /^(\/[^/]+\/(?:\s+\/[^/]+\/)*)(?:\s+[^/]+)?$/u.exec(pronunciation);
    if (notation?.[1] === undefined) {
      skip(`use slash-delimited ${kind}`);
      continue;
    }
    const ipa = Array.from(notation[1].matchAll(/\/([^/]+)\//gu)).flatMap((match) =>
      (match[1] ?? "").trim().split(/\s+/u),
    );
    if (ipa.length === 0 || ipa.some((word) => !symbols.test(word))) {
      skip(
        english
          ? "use standard-English IPA only, not ARPAbet, delivery tags or non-English sounds; give a foreign name an English approximation"
          : "use IPA, not ARPAbet or delivery tags",
      );
      continue;
    }
    if (term.split(" ").length !== ipa.length) {
      skip("supply one IPA word for each written word");
      continue;
    }
    const key = termIdentity(term);
    const previous = entries.get(key);
    if (previous !== undefined && previous.ipa.join(" ") !== ipa.join(" ")) {
      skip("an earlier entry already gives this term a different pronunciation");
      continue;
    }
    if (previous === undefined) entries.set(key, { term, ipa });
  }
  return skipped.length === 0
    ? { ok: true, entries: [...entries.values()] }
    : { ok: true, entries: [...entries.values()], skipped };
}

// What a person reads about the skipped rows: where they are and why, never their text.
export function skippedGlossaryNotice(skipped: readonly SkippedGlossaryRow[]): string | null {
  if (skipped.length === 0) return null;
  const rows = skipped.map((one) => `entry ${one.row}: ${one.reason}`).join("; ");
  return (
    `Pronunciation Glossary: ${skipped.length === 1 ? "1 entry is" : `${skipped.length} entries are`} ` +
    `skipped and read as ordinary text (${rows}). The rest of the glossary is used. ` +
    "To use them, fix those entries in the Pronunciation Glossary at the end of the article in Edit project → Article."
  );
}

// A speaker's own pronunciations (Speakers → Pronunciations for …) are parsed the same way, and
// their bad rows are skipped the same way, so the run review and the speakers editor both say
// which ones: by speaker name and entry number, never the row's text.
export interface SkippedSpeakerPronunciations {
  readonly speaker: string;
  readonly skipped: readonly SkippedGlossaryRow[];
}
export function skippedSpeakerPronunciations(
  speakers: readonly { readonly name: string; readonly pronunciations?: string | undefined }[],
  language?: string | undefined,
): readonly SkippedSpeakerPronunciations[] {
  return speakers.flatMap((speaker) => {
    if (!speaker.pronunciations?.trim()) return [];
    const parsed = parsePronunciationGlossary(speaker.pronunciations, language);
    const skipped = parsed.ok ? (parsed.skipped ?? []) : [];
    return skipped.length === 0 ? [] : [{ speaker: speaker.name.trim() || "A speaker", skipped }];
  });
}
export function skippedSpeakerPronunciationsNotice(
  rows: readonly SkippedSpeakerPronunciations[],
): string | null {
  if (rows.length === 0) return null;
  const parts = rows.map(
    (row) =>
      `${row.speaker}: ${row.skipped.map((one) => `entry ${one.row}: ${one.reason}`).join("; ")}`,
  );
  return (
    `Speaker pronunciations: some entries are skipped and read as ordinary text (${parts.join(". ")}). ` +
    "The rest are used. To use them, fix those entries under Speakers → Pronunciations for that speaker (Play → Audio, or Edit project → Providers)."
  );
}

export interface PronunciationSpan {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}
export interface PronunciationMatch {
  readonly start: number;
  readonly end: number;
  readonly entry: GlossaryEntry;
}
export function pronunciationMatches(
  source: string,
  entries: readonly GlossaryEntry[],
): readonly PronunciationMatch[] {
  if (entries.length === 0) return [];
  const ordered = [...entries].sort((a, b) => b.term.length - a.term.length);
  const patterns = ordered.map((entry) =>
    entry.term
      .split(" ")
      .map((word) => word.replace(/[|\\{}()[\]^$+*?.]/gu, "\\$&"))
      .join("\\s+"),
  );
  const boundary = "[\\p{L}\\p{M}\\p{N}_\\-\u00ad\u2010\u2011\ufe63\uff0d]";
  const expression = new RegExp(
    "(?<!" +
      boundary +
      "['’]?)(?:" +
      patterns.map((pattern) => `(${pattern})`).join("|") +
      ")(?!['’]?" +
      boundary +
      ")",
    "giu",
  );
  const matches: PronunciationMatch[] = [];
  for (const match of source.matchAll(expression)) {
    const end = match.index + match[0].length;
    const before = source[match.index - 1];
    const after = source[end];
    if ((after === "'" && before !== "'") || (after === "’" && before !== "‘")) continue;
    const entry = ordered.find((_, index) => match[index + 1] !== undefined);
    if (entry === undefined)
      throw new Error(
        "Slopify hit an internal error (a pronunciation glossary term has no pronunciation). Retry stage; if it happens again, use Download diagnostics in Settings and report it.",
      );
    matches.push({ start: match.index, end, entry });
  }
  return matches;
}
export function pronunciationSpans(
  source: string,
  entries: readonly GlossaryEntry[],
): readonly PronunciationSpan[] {
  const spans: PronunciationSpan[] = [];
  for (const match of pronunciationMatches(source, entries)) {
    const words = source.slice(match.start, match.end).matchAll(/\S+/gu);
    for (const [index, word] of Array.from(words).entries()) {
      const ipa = match.entry.ipa[index];
      if (ipa === undefined)
        throw new Error(
          "Slopify hit an internal error (a pronunciation glossary term is missing a word). Retry stage; if it happens again, use Download diagnostics in Settings and report it.",
        );
      const start = match.start + word.index;
      spans.push({ start, end: start + word[0].length, text: `/${ipa}/` });
    }
  }
  return spans;
}
