import { remark } from "remark";
import remarkGfm from "remark-gfm";

export interface GlossaryEntry {
  readonly term: string;
  readonly ipa: readonly string[];
}
export type GlossaryResult =
  | { readonly ok: true; readonly entries: readonly GlossaryEntry[] }
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
      return cells.length >= 2 ? cells.slice(0, 2).map(textOf).join(": ") : textOf(row);
    });
  }
  if (node.type === "paragraph") return textOf(node).split(/\r?\n/u);
  if (node.type === "root" || node.type === "list" || node.type === "listItem")
    return (node.children ?? []).flatMap(rowsOf);
  return ["(unsupported glossary block)"];
}
function refused(row: number, reason: string): GlossaryResult {
  return {
    ok: false,
    reason:
      "Pronunciation Glossary entry " +
      row +
      ": " +
      reason +
      ". Edit the glossary or turn off Use Pronunciation Glossary.",
  };
}
export function parsePronunciationGlossary(markdown: string): GlossaryResult {
  const rows = rowsOf(remark().use(remarkGfm).parse(markdown));
  const entries = new Map<string, GlossaryEntry>();
  for (const [index, row] of rows.entries()) {
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
    )
      return refused(index + 1, "use Term: /IPA/ or a Term | IPA table");
    const notation = /^(\/[^/]+\/(?:\s+\/[^/]+\/)*)(?:\s+[^/]+)?$/u.exec(pronunciation);
    if (notation?.[1] === undefined)
      return refused(index + 1, "use slash-delimited standard-English IPA");
    const ipa = Array.from(notation[1].matchAll(/\/([^/]+)\//gu)).flatMap((match) =>
      (match[1] ?? "").trim().split(/\s+/u),
    );
    if (ipa.length === 0 || ipa.some((word) => !ipaSymbols.test(word)))
      return refused(index + 1, "use standard-English IPA, not ARPAbet or delivery tags");
    if (term.split(" ").length !== ipa.length)
      return refused(index + 1, "supply one IPA word for each written word");
    const key = term.toLowerCase();
    const previous = entries.get(key);
    if (previous !== undefined && previous.ipa.join(" ") !== ipa.join(" "))
      return refused(index + 1, "conflicting pronunciations were supplied for the same term");
    if (previous === undefined) entries.set(key, { term, ipa });
  }
  return { ok: true, entries: [...entries.values()] };
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
  const boundary = "[\\p{L}\\p{M}\\p{N}_\\-]";
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
    if (entry === undefined) throw new Error("Matched glossary term has no mapping.");
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
      if (ipa === undefined) throw new Error("Validated glossary term has no IPA word.");
      const start = match.start + word.index;
      spans.push({ start, end: start + word[0].length, text: `/${ipa}/` });
    }
  }
  return spans;
}
