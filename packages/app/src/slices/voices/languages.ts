import { languageInfo } from "../../kernel/ports/languages.js";
import type { Voice } from "../settings/model.js";

// Which saved voices speak a project's language. A voice whose languages are unknown (saved
// before voices had any, or one the provider said nothing about) is offered for every
// language: hiding it would hide most voices people already have.

export function voiceSpeaks(
  voice: Pick<Voice, "languages">,
  language: string | undefined,
): boolean {
  if (voice.languages === undefined) return true;
  return voice.languages.includes(languageInfo(language).code);
}

// The voice picker's list: the voices that speak the language, or every voice when the person
// asked to see them all. The chosen voice always stays listed so the picker never goes blank.
export function voicesForLanguage<T extends Pick<Voice, "languages" | "voiceId">>(
  voices: readonly T[],
  language: string | undefined,
  showAll: boolean,
  chosen?: string | undefined,
): readonly T[] {
  if (showAll) return voices;
  return voices.filter((voice) => voiceSpeaks(voice, language) || voice.voiceId === chosen);
}

// A warning, never a refusal: the provider's language list may be incomplete, and many voices
// read other languages well. Undefined when there is nothing to say.
export function voiceLanguageWarning(
  voice: Pick<Voice, "languages" | "name"> | undefined,
  language: string | undefined,
): string | undefined {
  if (voice === undefined || voiceSpeaks(voice, language)) return undefined;
  const wanted = languageInfo(language).name;
  const spoken = (voice.languages ?? []).map((code) =>
    languageInfo(code).code === code ? languageInfo(code).name : code,
  );
  return `${voice.name} is listed for ${spoken.join(", ")}, not ${wanted}, so it may read the ${wanted} narration with the wrong accent. Pick a ${wanted} voice under Narration, or correct the voice's languages in Settings → Voices.`;
}
