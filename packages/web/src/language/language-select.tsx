import {
  type LanguageCode,
  languageInfo,
  languageList,
  languageSchema,
  wordTimingUnavailable,
} from "@app/kernel/ports/languages.js";
import type { ReactElement } from "react";
import { Field, Select } from "@/components/kit/field";
import type { HelpId } from "@/help/catalog";

// The project language control, the same in Play, Edit project and a channel's brand kit. It
// says under itself what the language changes: what gets written in it and how the captions
// are timed. Self-contained so the Play redesign can put it wherever it belongs.

// The value "" is "not chosen here": the channel's language on Play, English elsewhere.
export function LanguageSelect({
  value,
  onChange,
  inherited,
  label = "Language",
  error,
  disabled = false,
  tip = "play.language",
}: {
  // The info button; a screen where the language means something else passes its own.
  readonly tip?: HelpId;
  readonly value: string | undefined;
  readonly onChange: (language: LanguageCode | undefined) => void;
  // What "not chosen here" resolves to, named in its option ("Channel's language (German)").
  // Absent: there is no such option and the list starts at English.
  readonly inherited?: { readonly label: string; readonly language: string | undefined };
  readonly label?: string;
  readonly error?: string | undefined;
  readonly disabled?: boolean;
}): ReactElement {
  const effective = value ?? inherited?.language;
  return (
    <Field label={label} tip={tip} help={languageHelp(effective)} error={error}>
      <Select
        data-play-field="language"
        value={value ?? (inherited === undefined ? "en" : "")}
        disabled={disabled}
        onChange={(event) =>
          onChange(event.target.value === "" ? undefined : languageSchema.parse(event.target.value))
        }
      >
        {inherited === undefined ? null : (
          <option value="">
            {inherited.label} ({languageInfo(inherited.language).name})
          </option>
        )}
        {languageList.map((language) => (
          <option key={language.code} value={language.code}>
            {language.native === language.name
              ? language.name
              : `${language.native} · ${language.name}`}
          </option>
        ))}
      </Select>
    </Field>
  );
}

// One or two sentences: what is written in the language, and how its captions are timed.
export function languageHelp(code: string | undefined): string {
  const language = languageInfo(code);
  if (language.code === "en") return "Everything is written and timed in English.";
  const written = `The article, narration, YouTube description and Shorts titles are written in ${language.name}; pick a voice that speaks it.`;
  const unavailable = wordTimingUnavailable(language.code);
  if (unavailable !== undefined) return `${written} ${unavailable}`;
  return `${written} Captions are timed word by word with a free 248 MB model, downloaded the first time a ${language.name} project makes captions.`;
}
