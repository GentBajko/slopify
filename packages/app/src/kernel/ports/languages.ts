import { z } from "zod";

// The language a project is made in: what the LLM writes, what the voice speaks, how the
// narration is split into sentences and how the captions are timed. Absent on every run
// config, draft, template and channel saved before it existed, and absent is English, so
// nothing about those changes. Only a language other than English is ever stored.

export const writingSystems = [
  "latin",
  "cyrillic",
  "greek",
  "arabic",
  "hebrew",
  "devanagari",
  "thai",
  "cjk",
  "hangul",
] as const;
export type WritingSystem = (typeof writingSystems)[number];

// How captions are timed in a language:
// - "english": the English model (`adapters/alignment`), word by word;
// - "multilingual": the multilingual model with that language's letters and number words,
//   word by word;
// - "sentences": no model can place its words, so each sentence is spread over the time the
//   narration spends on it. Word-by-word captions and cuts that follow the narration are off.
export type WordTiming = "english" | "multilingual" | "sentences";

export interface LanguageInfo {
  readonly code: string;
  // The name in English, for sentences the app writes ("Write in Spanish").
  readonly name: string;
  // The name in the language itself, for the picker.
  readonly native: string;
  readonly script: WritingSystem;
  readonly timing: WordTiming;
}

export const languageList = [
  { code: "en", name: "English", native: "English", script: "latin", timing: "english" },
  { code: "es", name: "Spanish", native: "Español", script: "latin", timing: "multilingual" },
  { code: "de", name: "German", native: "Deutsch", script: "latin", timing: "multilingual" },
  { code: "fr", name: "French", native: "Français", script: "latin", timing: "multilingual" },
  { code: "it", name: "Italian", native: "Italiano", script: "latin", timing: "multilingual" },
  { code: "pt", name: "Portuguese", native: "Português", script: "latin", timing: "multilingual" },
  { code: "nl", name: "Dutch", native: "Nederlands", script: "latin", timing: "multilingual" },
  { code: "ca", name: "Catalan", native: "Català", script: "latin", timing: "multilingual" },
  { code: "pl", name: "Polish", native: "Polski", script: "latin", timing: "multilingual" },
  { code: "cs", name: "Czech", native: "Čeština", script: "latin", timing: "multilingual" },
  { code: "ro", name: "Romanian", native: "Română", script: "latin", timing: "sentences" },
  { code: "sv", name: "Swedish", native: "Svenska", script: "latin", timing: "sentences" },
  { code: "da", name: "Danish", native: "Dansk", script: "latin", timing: "sentences" },
  { code: "nb", name: "Norwegian", native: "Norsk bokmål", script: "latin", timing: "sentences" },
  { code: "fi", name: "Finnish", native: "Suomi", script: "latin", timing: "sentences" },
  { code: "hu", name: "Hungarian", native: "Magyar", script: "latin", timing: "sentences" },
  { code: "tr", name: "Turkish", native: "Türkçe", script: "latin", timing: "sentences" },
  {
    code: "id",
    name: "Indonesian",
    native: "Bahasa Indonesia",
    script: "latin",
    timing: "sentences",
  },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt", script: "latin", timing: "sentences" },
  { code: "el", name: "Greek", native: "Ελληνικά", script: "greek", timing: "sentences" },
  { code: "ru", name: "Russian", native: "Русский", script: "cyrillic", timing: "sentences" },
  { code: "uk", name: "Ukrainian", native: "Українська", script: "cyrillic", timing: "sentences" },
  { code: "ar", name: "Arabic", native: "العربية", script: "arabic", timing: "sentences" },
  { code: "he", name: "Hebrew", native: "עברית", script: "hebrew", timing: "sentences" },
  { code: "hi", name: "Hindi", native: "हिन्दी", script: "devanagari", timing: "sentences" },
  { code: "th", name: "Thai", native: "ไทย", script: "thai", timing: "sentences" },
  { code: "ja", name: "Japanese", native: "日本語", script: "cjk", timing: "sentences" },
  { code: "zh", name: "Chinese", native: "中文", script: "cjk", timing: "sentences" },
  { code: "ko", name: "Korean", native: "한국어", script: "hangul", timing: "sentences" },
] as const satisfies readonly LanguageInfo[];

export type LanguageCode = (typeof languageList)[number]["code"];
export const languageCodes = languageList.map((language) => language.code) as [
  LanguageCode,
  ...LanguageCode[],
];
export const defaultLanguage: LanguageCode = "en";
export const languageSchema = z.enum(languageCodes);

export function languageInfo(code: string | undefined): LanguageInfo {
  return (
    languageList.find((language) => language.code === (code ?? defaultLanguage)) ?? languageList[0]
  );
}

// The project's language; absent is English.
export function projectLanguage(config: { readonly language?: string | undefined }): string {
  return config.language ?? defaultLanguage;
}

export function isEnglish(config: { readonly language?: string | undefined }): boolean {
  return projectLanguage(config) === defaultLanguage;
}

// Why word-by-word features are off in a language timed by sentences, or undefined when they
// are available. The same sentence is shown beside every control it turns off.
export function wordTimingUnavailable(code: string | undefined): string | undefined {
  const language = languageInfo(code);
  if (language.timing !== "sentences") return undefined;
  return `Word timing isn't available for ${language.name} yet, so captions are timed sentence by sentence: each sentence is shown for the part of the narration that reads it. Word-by-word captions and cuts that follow the narration need word timing and are off.`;
}

// Whether a codepoint belongs to a writing system; used to decide whether a caption font
// covers the project's letters without reading the font for every character.
export function writingSystemOf(codepoint: number): WritingSystem | undefined {
  const inRange = (from: number, to: number): boolean => codepoint >= from && codepoint <= to;
  if (inRange(0x41, 0x5a) || inRange(0x61, 0x7a) || inRange(0xc0, 0x24f) || inRange(0x1e00, 0x1eff))
    return "latin";
  if (inRange(0x370, 0x3ff) || inRange(0x1f00, 0x1fff)) return "greek";
  if (inRange(0x400, 0x52f)) return "cyrillic";
  if (inRange(0x590, 0x5ff)) return "hebrew";
  if (inRange(0x600, 0x6ff) || inRange(0x750, 0x77f) || inRange(0xfb50, 0xfdff)) return "arabic";
  if (inRange(0x900, 0x97f)) return "devanagari";
  if (inRange(0xe00, 0xe7f)) return "thai";
  if (inRange(0x1100, 0x11ff) || inRange(0xac00, 0xd7af)) return "hangul";
  if (inRange(0x3040, 0x30ff) || inRange(0x3400, 0x4dbf) || inRange(0x4e00, 0x9fff)) return "cjk";
  return undefined;
}
