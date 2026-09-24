import { type Cue, sourceSentences } from "./preparation.js";

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
    "Delivery cues or whitespace leave no room for narration at this model's character limit.",
};

export function prepareRequests(
  source: string,
  cues: readonly Cue[],
  maxCharacters: number,
): SteeringResult {
  if (!Number.isInteger(maxCharacters) || maxCharacters < 2)
    return {
      ok: false,
      reason: "The narration character limit must be a whole number of at least 2.",
    };
  if (source.trim() === "") return { ok: true, requests: [] };
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
    const first = Array.from(sentence.text)[0] ?? "";
    const words = sentence.text.match(/\S+\s*|\s+/gu) ?? [];
    const firstWord = words[0] ?? first;
    const freshPrefix = direction === undefined ? carryTag(active) : "";
    const minimum =
      firstWord.length + prefix.length + freshPrefix.length <= maxCharacters
        ? firstWord.length
        : first.length;
    if (spokenText.trim() !== "" && text.length + prefix.length + minimum > maxCharacters) {
      if (!flush()) return cannotFit;
    }
    if (text === "" && direction === undefined) text = carryTag(active);
    if (text.length + prefix.length + first.length > maxCharacters) return cannotFit;
    text += prefix;
    if (direction !== undefined) active = direction.kind === "instruction" ? direction.text : null;
    for (const word of words) {
      if (
        word.length + carryTag(active).length <= maxCharacters &&
        text.length + word.length > maxCharacters &&
        spokenText.trim() !== ""
      ) {
        if (!flush()) return cannotFit;
        text = carryTag(active);
      }
      for (const point of word) {
        if (text.length + point.length > maxCharacters) {
          if (!flush()) return cannotFit;
          text = carryTag(active);
        }
        if (text.length + point.length > maxCharacters) return cannotFit;
        text += point;
        spokenText += point;
      }
    }
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
