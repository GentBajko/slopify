import { cardinal, numberForms } from "./numbers.js";

export interface SpeechWord {
  readonly text: string;
  readonly spoken: string;
}

// Original display words remain intact; only acoustic matching uses normalized English.
export function speechWords(text: string, observed = ""): readonly SpeechWord[] {
  const words: { text: string; spoken: string }[] = [];
  for (const textWord of text.trim().split(/\s+/)) {
    const forms = wordForms(textWord);
    const spoken =
      forms.find((form) => form !== "" && ` ${observed} `.includes(` ${form} `)) ?? forms[0] ?? "";
    if (spoken === "") {
      const previous = words.at(-1);
      if (previous !== undefined) previous.text += ` ${textWord}`;
      continue;
    }
    words.push({ text: textWord, spoken });
  }
  if (words.length === 0)
    throw new Error("Local subtitles currently require an English transcript with spoken words.");
  return words;
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
