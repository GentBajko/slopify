import { aliasMatches, type NarrationAlias } from "../../kernel/ports/narration-aliases.js";
import { cardinal, numberForms } from "./numbers.js";

export interface SpeechWord {
  readonly text: string;
  readonly spoken: string;
  // Every way the word may be said, the default first; `spoken` is the one picked. Absent
  // means `spoken` is the only form.
  readonly forms?: readonly string[] | undefined;
}

// Original display words remain intact; only acoustic matching uses normalized English.
// Narration aliases ("Dr." said as "Doctor") make the aliased form the default for the
// written words they cover, with the written form kept as an alternative for audio that
// was not aliased (an uploaded chunk, say).
export function speechWords(
  text: string,
  observed = "",
  aliases: readonly NarrationAlias[] = [],
): readonly SpeechWord[] {
  const matches = aliases.length === 0 ? [] : aliasMatches(text, aliases);
  const words: { text: string; spoken: string; forms: string[]; aliased: boolean }[] = [];
  for (const token of text.matchAll(/\S+/g)) {
    const textWord = token[0];
    const start = token.index;
    const end = start + textWord.length;
    const plain = wordForms(textWord);
    const touching = matches.filter((match) => match.start < end && start < match.end);
    let forms = [...plain];
    if (touching.length > 0) {
      let said = "";
      let at = start;
      for (const match of touching) {
        if (match.start >= at) said += textWord.slice(at - start, match.start - start);
        // The spoken form belongs to the word the written form starts in.
        if (match.start >= start) said += ` ${match.spoken} `;
        at = Math.max(at, Math.min(match.end, end));
      }
      said += textWord.slice(at - start);
      const aliased = said
        .trim()
        .split(/\s+/)
        .map((piece) => (piece === "" ? "" : (wordForms(piece)[0] ?? "")))
        .filter((form) => form !== "")
        .join(" ");
      forms = [aliased, ...plain.filter((form) => form !== aliased)];
    }
    const spoken = pick(forms, observed);
    const previous = words.at(-1);
    if (spoken === "") {
      if (previous !== undefined) {
        previous.text += ` ${textWord}`;
        // A word an alias swallowed ("al." of "et al.") still counts when the written
        // form was read out.
        const next = plain[0];
        if (touching.length > 0 && next !== undefined)
          previous.forms = previous.forms.map((form, index) =>
            index === 0 && previous.aliased ? form : `${form} ${next}`,
          );
      }
      continue;
    }
    words.push({ text: textWord, spoken, forms, aliased: touching.length > 0 });
  }
  if (words.length === 0)
    throw new Error("Local subtitles currently require an English transcript with spoken words.");
  return words.map(({ text: shown, spoken, forms }) =>
    forms.length > 1 ? { text: shown, spoken, forms } : { text: shown, spoken },
  );
}

// The form of a word the recording seems to say, else its default.
export function respoken(word: SpeechWord, observed: string): SpeechWord {
  if (word.forms === undefined) return speechWords(word.text, observed)[0] ?? word;
  return { ...word, spoken: pick(word.forms, observed) };
}
function pick(forms: readonly string[], observed: string): string {
  return (
    forms.find((form) => form !== "" && ` ${observed} `.includes(` ${form} `)) ?? forms[0] ?? ""
  );
}

function wordForms(raw: string): readonly string[] {
  const plain = raw.normalize("NFKD").replace(/\p{M}/gu, "").replace(/[‘’]/g, "'");
  if (/\p{L}/u.test(plain.replace(/[A-Za-z]/g, "")))
    throw new Error(
      "Local subtitles currently support English speech and Latin-script names only.",
    );
  const core = plain.replace(/^[^\p{L}\p{N}$£€]+|[^\p{L}\p{N}%]+$/gu, "");
  if (core === "") return [];
  const currency = core.startsWith("$")
    ? "DOLLARS"
    : core.startsWith("£")
      ? "POUNDS"
      : core.startsWith("€")
        ? "EUROS"
        : "";
  const percent = core.endsWith("%") ? "PERCENT" : "";
  const clean = core.replace(/^[$£€]/, "").replace(/%$/, "");
  let forms: readonly string[];
  if (/^\d[\d,.]*(?:s|st|nd|rd|th)?$/i.test(clean)) {
    forms = numberForms(clean);
  } else {
    const expanded = clean
      .replaceAll("&", " AND ")
      .replaceAll("+", " PLUS ")
      .replace(/\d+/g, (digits) => numberForms(digits)[0] ?? digits);
    const normal = expanded
      .toUpperCase()
      .replace(/[^A-Z']/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    forms = /^[A-Z]{2,8}$/.test(clean) ? [normal, clean.split("").join(" ")] : [normal];
  }
  const result = forms.map((form) => [form, currency, percent].filter(Boolean).join(" "));
  const money = /^(\d[\d,]*)\.(\d{2})$/.exec(clean);
  if (currency !== "" && money !== null) {
    const whole = cardinal(Number((money[1] ?? "").replaceAll(",", "")));
    const fraction = cardinal(Number(money[2]));
    const unit = currency === "POUNDS" ? "PENCE" : "CENTS";
    result.push(
      `${whole} ${currency} AND ${fraction} ${unit}`,
      `${whole} ${currency} ${fraction}`,
      `${whole} ${fraction}`,
    );
  }
  return result;
}
