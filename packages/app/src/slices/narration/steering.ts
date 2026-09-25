import { type Cue, sourceSentences } from "./preparation.js";
import type { PronunciationSpan } from "./pronunciation.js";

export interface PreparedRequest {
  readonly text: string;
  readonly spokenText: string;
}
export type SteeringResult =
  | { readonly ok: true; readonly requests: readonly PreparedRequest[] }
  | { readonly ok: false; readonly reason: string };
const cannotFit: SteeringResult = {
  ok: false,
  reason:
    "Delivery cues, an indivisible IPA token or whitespace leave no room for narration at this model's character limit.",
};

function atoms(
  source: string,
  from: number,
  to: number,
  spans: ReadonlyMap<number, PronunciationSpan>,
): readonly PreparedRequest[] {
  const result: PreparedRequest[] = [];
  for (let at = from; at < to; ) {
    const span = spans.get(at);
    if (span !== undefined) {
      if (span.end > to || span.end <= at) throw new Error("Pronunciation span crosses a word.");
      result.push({ text: span.text, spokenText: source.slice(at, span.end) });
      at = span.end;
    } else {
      const point = source.codePointAt(at);
      if (point === undefined) throw new Error("Narration offset is outside the source.");
      const text = String.fromCodePoint(point);
      result.push({ text, spokenText: text });
      at += text.length;
    }
  }
  return result;
}
export function prepareRequests(
  source: string,
  cues: readonly Cue[],
  maxCharacters: number,
  pronunciation: readonly PronunciationSpan[] = [],
): SteeringResult {
  if (!Number.isInteger(maxCharacters) || maxCharacters < 2)
    return {
      ok: false,
      reason: "The narration character limit must be a whole number of at least 2.",
    };
  if (source.trim() === "") return { ok: true, requests: [] };
  const spans = new Map(pronunciation.map((span) => [span.start, span]));
  const requests: PreparedRequest[] = [];
  const bySentence = new Map<number, Cue[]>();
  for (const cue of cues) {
    const group = bySentence.get(cue.sentence) ?? [];
    group.push(cue);
    bySentence.set(cue.sentence, group);
  }
  let active: string | null = null;
  let text = "";
  let spokenText = "";
  let offset = 0;
  const flush = (): boolean => {
    if (spokenText.trim() === "") return false;
    requests.push({ text, spokenText });
    text = "";
    spokenText = "";
    return true;
  };
  for (const sentence of sourceSentences(source)) {
    const events = bySentence.get(sentence.sentence) ?? [];
    const direction = events.find((cue) => cue.kind !== "sound");
    const tags = events.map(cueTag).join(" ");
    const prefix = tags === "" ? "" : `${tags} `;
    const words = Array.from(sentence.text.matchAll(/\S+\s*|\s+/gu)).map((match) =>
      atoms(source, offset + match.index, offset + match.index + match[0].length, spans),
    );
    const first = words[0]?.[0]?.text ?? "";
    const firstWordLength = words[0]?.reduce((length, atom) => length + atom.text.length, 0) ?? 0;
    const freshPrefix = direction === undefined ? carryTag(active) : "";
    const minimum =
      firstWordLength + prefix.length + freshPrefix.length <= maxCharacters
        ? firstWordLength
        : first.length;
    if (spokenText.trim() !== "" && text.length + prefix.length + minimum > maxCharacters) {
      if (!flush()) return cannotFit;
    }
    if (text === "" && direction === undefined) text = carryTag(active);
    if (text.length + prefix.length + first.length > maxCharacters) return cannotFit;
    text += prefix;
    if (direction !== undefined) active = direction.kind === "instruction" ? direction.text : null;
    for (const word of words) {
      const length = word.reduce((sum, atom) => sum + atom.text.length, 0);
      if (
        length + carryTag(active).length <= maxCharacters &&
        text.length + length > maxCharacters &&
        spokenText.trim() !== ""
      ) {
        if (!flush()) return cannotFit;
        text = carryTag(active);
      }
      for (const atom of word) {
        if (text.length + atom.text.length > maxCharacters) {
          if (!flush()) return cannotFit;
          text = carryTag(active);
        }
        if (text.length + atom.text.length > maxCharacters) return cannotFit;
        text += atom.text;
        spokenText += atom.spokenText;
      }
    }
    offset += sentence.text.length;
  }
  if (spokenText !== "" && !flush()) return cannotFit;
  return { ok: true, requests };
}
function cueTag(cue: Cue): string {
  return cue.kind === "instruction"
    ? `[${cue.text}]`
    : cue.kind === "reset"
      ? "[reset]"
      : `[${cue.sound}]`;
}
function carryTag(active: string | null): string {
  return active === null ? "" : `[${active}] `;
}
