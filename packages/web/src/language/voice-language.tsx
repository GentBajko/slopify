import { languageInfo } from "@app/kernel/ports/languages.js";
import type { Voice } from "@app/slices/settings/model.js";
import { voiceLanguageWarning, voicesForLanguage } from "@app/slices/voices/languages.js";
import { type ReactElement, useId, useState } from "react";
import { helpScope, InfoTip } from "@/components/kit/info-tip";

// The voice picker's list for a project language, and the "Show all voices" escape beside it.
// Voices whose languages are unknown are always listed (`slices/voices/languages.ts`).
export function useVoicesForLanguage(
  voices: readonly Voice[],
  language: string | undefined,
  chosen: string | undefined,
): {
  readonly listed: readonly Voice[];
  readonly hidden: number;
  readonly showAll: boolean;
  readonly setShowAll: (value: boolean) => void;
} {
  const [showAll, setShowAll] = useState(false);
  const listed = voicesForLanguage(voices, language, showAll, chosen);
  return { listed, hidden: voices.length - listed.length, showAll, setShowAll };
}

// Under the voice picker: the escape when some voices are hidden, and a warning (never a
// refusal) when the chosen voice is listed for other languages.
export function VoiceLanguageNote({
  language,
  voice,
  hidden,
  showAll,
  onShowAll,
}: {
  readonly language: string | undefined;
  readonly voice: Voice | undefined;
  readonly hidden: number;
  readonly showAll: boolean;
  readonly onShowAll: (value: boolean) => void;
}): ReactElement | null {
  const id = useId();
  const warning = voiceLanguageWarning(voice, language);
  if (hidden === 0 && !showAll && warning === undefined) return null;
  return (
    <div className="col-span-full grid gap-1">
      {hidden > 0 || showAll ? (
        <span className="flex min-h-8 items-center gap-1" {...helpScope}>
          <label htmlFor={id} className="flex items-center gap-2 text-small">
            <input
              id={id}
              type="checkbox"
              checked={showAll}
              onChange={(event) => onShowAll(event.target.checked)}
            />
            Show all voices
            {showAll
              ? ""
              : ` (${String(hidden)} listed for other languages than ${languageInfo(language).name})`}
          </label>
          <InfoTip id="play.show-all-voices" />
        </span>
      ) : null}
      {warning === undefined ? null : (
        <p role="status" className="m-0 text-small text-ink-2">
          {warning}
        </p>
      )}
    </div>
  );
}
