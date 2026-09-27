import { languageInfo } from "../../kernel/ports/languages.js";
import type { NarrationAlias } from "../../kernel/ports/narration-aliases.js";
import { type AlignmentGates, type AlignmentSpec, englishSpec } from "./spec.js";
import { type Speller, spellers, spokenNumber } from "./spell.js";
import { respoken, type SpeechWord, speechWords } from "./text.js";

// voidful/wav2vec2-xlsr-multilingual-56 (Apache-2.0) as converted to ONNX by NewComer00,
// pinned to one revision. The q4 file: 4-bit weights, about a quarter of the fp32 size.
const revision = "2d48b01b6429d9018f81914550565112d56f6ba7";
export const multilingualModel = {
  filename: "wav2vec2-xlsr-multilingual-56-q4-fcf93903.onnx",
  url: `https://huggingface.co/NewComer00/wav2vec2-xlsr-multilingual-56-ONNX/resolve/${revision}/onnx/model_q4.onnx`,
  bytes: 247_576_761,
  sha256: "fcf939032d4091cf232d6a2e751e172d0409e0c926db6283526151cf50ceb577",
  timeoutMs: 1_200_000,
} as const;

// The model's own labels (its vocab.json at the same revision): 9,913 of them, the blank is
// [PAD] and the word delimiter is "|".
const modelLabels = 9913;
const modelBlank = 9910;
const modelDelimiter = 9908;
// Each letter's lower- and upper-case label. The model was trained on Common Voice text in
// both cases, so a letter's probability is the sum of both.
const modelIds: Readonly<Record<string, readonly number[]>> = {
  a: [36, 10],
  b: [37, 11],
  c: [38, 12],
  d: [39, 13],
  e: [40, 14],
  f: [41, 15],
  g: [42, 16],
  h: [43, 17],
  i: [44, 18],
  j: [45, 19],
  k: [46, 20],
  l: [47, 21],
  m: [48, 22],
  n: [49, 23],
  o: [50, 24],
  p: [51, 25],
  q: [52, 26],
  r: [53, 27],
  s: [54, 28],
  t: [55, 29],
  u: [56, 30],
  v: [57, 31],
  w: [58, 32],
  x: [59, 33],
  y: [60, 34],
  z: [61, 35],
  ß: [145],
  à: [146, 116],
  á: [147, 117],
  â: [148, 118],
  ã: [149, 119],
  ä: [150, 120],
  æ: [152, 122],
  ç: [153, 123],
  è: [154, 124],
  é: [155, 125],
  ê: [156, 126],
  ë: [157, 127],
  ì: [158, 128],
  í: [159, 129],
  î: [160, 130],
  ï: [161, 131],
  ñ: [163, 133],
  ò: [164, 134],
  ó: [165, 135],
  ô: [166, 136],
  õ: [167, 137],
  ö: [168, 138],
  ù: [171, 141],
  ú: [172, 142],
  û: [173, 143],
  ü: [174, 144],
  ý: [175],
  ÿ: [177, 253],
  ą: [182, 181],
  ć: [184, 183],
  č: [188, 187],
  ď: [189],
  ę: [196, 195],
  ě: [198, 197],
  ł: [218, 217],
  ń: [220, 219],
  ň: [222],
  œ: [230, 229],
  ř: [233, 232],
  ś: [235, 234],
  š: [240, 239],
  ť: [242],
  ů: [247],
  ź: [255, 254],
  ż: [257, 256],
  ž: [259, 258],
};

// The letters each language is written with beyond a–z. A letter outside its language is read
// without its accent ("Dvořák" in Spanish is "dvorak"), which is how a reader of that language
// would say it closely enough for timing.
export const alphabets: Readonly<Record<string, string>> = {
  es: "áéíóúüñ",
  de: "äöüß",
  fr: "àâæçèéêëîïôœùûüÿ",
  it: "àèéìíîòóùú",
  pt: "áâãàçéêíóôõú",
  ca: "àèéíïòóúüç",
  nl: "áéëïóöüè",
  pl: "ąćęłńóśźż",
  cs: "áčďéěíňóřšťúůýž",
};

// The English values. Measured on 2026-09-27 with scripts/validate-multilingual-alignment.mjs
// on LibriVox narration (Spanish 64 s / 193 words, German 48 s / 102 words; English 57 s /
// 147 words on its own model as the baseline): folded to one language's letters, the q4
// model's word posteriors averaged 0.95-0.97, as the English model's do (0.96), no word fell
// below 0.2, and the audio of another language was refused at its first window. So the same
// gates hold, and loosening them would only let wrong audio through.
export const multilingualGates: AlignmentGates = {
  meanPosterior: 0.48,
  poorScore: 0.2,
  poorShare: 0.3,
  maximumError: 0.42,
  anchorLetters: 20,
  anchorConfidence: 0.75,
};

export function multilingualLanguages(): readonly string[] {
  return Object.keys(alphabets);
}

// The model and language view the aligner uses for a project language. English keeps its own
// model and every constant it had.
export function alignmentSpecFor(language: string | undefined): AlignmentSpec {
  return language === undefined || language === "en" ? englishSpec : multilingualSpec(language);
}

// One language's view of the model: its labels are blank, the delimiter and that language's
// letters, and every other label (other alphabets, digits, punctuation, CJK) is left out, the
// way voidful's own decoder masks the vocabulary by language.
export function multilingualSpec(language: string): AlignmentSpec {
  const alphabet = alphabets[language];
  const speller = spellers[language];
  if (alphabet === undefined || speller === undefined)
    throw new Error(
      `Word timing does not support ${languageInfo(language).name}. Slopify times its captions sentence by sentence instead; this is a bug if you see it, so use Download diagnostics in Settings and report it.`,
    );
  const letters = [..."abcdefghijklmnopqrstuvwxyz", ...alphabet];
  const ids: Record<string, number> = { "|": 1 };
  for (const [index, letter] of letters.entries()) ids[letter] = index + 2;
  const columns: readonly (readonly number[])[] = [
    [modelBlank],
    [modelDelimiter],
    ...letters.map((letter) => modelIds[letter] ?? []),
  ];
  const keep = new RegExp(`[^a-z${alphabet}]`, "gu");
  const name = languageInfo(language).name;
  return {
    labels: columns.length,
    delimiter: 1,
    ids,
    letters: ["", " ", ...letters],
    modelLabels,
    compact: (logits, frames) => compactLogits(logits, frames, columns),
    words: (text, observed, aliases) => multilingualWords(text, language, observed, aliases),
    respoken: (word, observed) =>
      respoken(word, observed, (raw) => wordForms(raw, language, alphabet, speller)),
    lettersOnly: (text) => text.toLowerCase().replace(keep, ""),
    comparable: (text) => text.toLowerCase().replace(keep, ""),
    gates: multilingualGates,
    mismatch: `The audio does not closely match the ${name} transcript. Check the article and audio, including any intro or outro, before generating subtitles.`,
  };
}

// Log-sum-exp of each column's labels, frame by frame: the logits of a smaller model whose
// softmax is the original one restricted to these labels.
export function compactLogits(
  logits: Float32Array,
  frames: number,
  columns: readonly (readonly number[])[],
): Float32Array {
  const width = logits.length / frames;
  const result = new Float32Array(frames * columns.length);
  for (let frame = 0; frame < frames; frame += 1) {
    const offset = frame * width;
    for (const [column, labels] of columns.entries()) {
      let max = -Infinity;
      for (const label of labels) max = Math.max(max, logits[offset + label] ?? -Infinity);
      if (max === -Infinity) {
        result[frame * columns.length + column] = -Infinity;
        continue;
      }
      let sum = 0;
      for (const label of labels) sum += Math.exp((logits[offset + label] ?? -Infinity) - max);
      result[frame * columns.length + column] = sum === 0 ? -Infinity : max + Math.log(sum);
    }
  }
  return result;
}

// Display words keep their spelling; only the acoustic match uses the normalised, lower-case
// form in the language's alphabet.
// Narration aliases apply as in English (`text.ts#speechWords`).
export function multilingualWords(
  text: string,
  language: string,
  observed = "",
  aliases: readonly NarrationAlias[] = [],
): readonly SpeechWord[] {
  const speller = spellers[language];
  const alphabet = alphabets[language];
  if (speller === undefined || alphabet === undefined) return [];
  return speechWords(
    text,
    observed,
    aliases,
    (raw) => wordForms(raw, language, alphabet, speller),
    `Local subtitles need a ${languageInfo(language).name} transcript with spoken words. Check the article text, then Try again.`,
  );
}

function wordForms(
  raw: string,
  language: string,
  alphabet: string,
  speller: Speller,
): readonly string[] {
  const plain = raw
    .normalize("NFC")
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'");
  const core = plain.replace(/^[^\p{L}\p{N}$£€]+|[^\p{L}\p{N}%]+$/gu, "");
  if (core === "") return [];
  const currency = core.startsWith("$")
    ? speller.dollar
    : core.startsWith("£")
      ? speller.pound
      : core.startsWith("€") || core.endsWith("€")
        ? speller.euro
        : "";
  const percent = core.endsWith("%") ? speller.percent : "";
  const clean = core.replace(/^[$£€]/, "").replace(/[%€]$/, "");
  let forms: readonly string[];
  if (/^\d[\d., {2}]*$/.test(clean) && /\d$/.test(clean)) forms = spokenNumber(clean, speller);
  else {
    const expanded = clean
      .replaceAll("&", ` ${speller.and} `)
      .replace(/\d+/g, (digits) => ` ${spokenNumber(digits, speller)[0] ?? ""} `);
    forms = [spell(expanded, alphabet, raw, language)];
  }
  return forms.map((form) => [form, currency, percent].filter(Boolean).join(" "));
}

// Keeps the language's own letters, reads other accented Latin letters without the accent,
// drops apostrophes and the Catalan middle dot inside a word, and treats everything else that
// is not a letter as a word break.
function spell(text: string, alphabet: string, raw: string, language: string): string {
  let result = "";
  for (const character of text) {
    if (/[a-z]/.test(character) || alphabet.includes(character)) {
      result += character;
      continue;
    }
    if (character === "'" || character === "·") continue;
    if (!/\p{L}/u.test(character)) {
      result += " ";
      continue;
    }
    const folded = fold(character);
    if (folded === undefined)
      throw new Error(
        `Word timing for ${languageInfo(language).name} reads Latin letters only, and "${raw}" has letters from another alphabet. Write that word in Latin letters in the article (open the project, Edit project → Article), then Try again.`,
      );
    result += folded;
  }
  return result.replace(/\s+/g, " ").trim();
}

const ligatures: Readonly<Record<string, string>> = {
  æ: "ae",
  œ: "oe",
  ß: "ss",
  ø: "o",
  đ: "d",
  ð: "d",
  þ: "th",
  ł: "l",
  ı: "i",
};
function fold(character: string): string | undefined {
  const ligature = ligatures[character];
  if (ligature !== undefined) return ligature;
  const base = character.normalize("NFKD").replace(/\p{M}/gu, "");
  return /^[a-z]+$/.test(base) ? base : undefined;
}
