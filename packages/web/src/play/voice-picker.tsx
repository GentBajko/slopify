import type { ProviderStatus, Voice } from "@app/slices/settings/model.js";
import type { ReactElement } from "react";
import { HelpLine } from "@/components/kit/field";
import { TextLink } from "@/components/kit/link";
import { useVoicesForLanguage, VoiceLanguageNote } from "@/language/voice-language";
import { OptionPicker } from "./pickers";

// Settings → Voices opened at a service, once that page reads it; until then it opens on
// Voices.
export function voicesSearch(provider: string) {
  const search = { section: "voices" as const, ...(provider === "" ? {} : { provider }) };
  return search;
}

// Who reads: the voices added under Settings → Voices for the picked voice service, filtered to
// the project's language. Its first entry says what to do next: pick the service first, pick a
// voice, or, when the service has none yet, that it has none, with the way to add one under it.
export function VoicePicker({
  field,
  label = "Voice",
  group,
  provider,
  providers,
  voices,
  language,
  value,
  problem,
  onPick,
}: {
  readonly field: string;
  readonly label?: string;
  readonly group?: string | undefined;
  readonly provider: string;
  readonly providers: readonly ProviderStatus[];
  readonly voices: readonly Voice[];
  // The project language the list is filtered by; absent lists every voice of the service.
  readonly language: string | undefined;
  readonly value: string;
  readonly problem: string | undefined;
  readonly onPick: (voice: string) => void;
}): ReactElement {
  const ofProvider = voices.filter((voice) => voice.provider === provider);
  const byLanguage = useVoicesForLanguage(ofProvider, language ?? "en", value || undefined);
  const mine = language === undefined ? ofProvider : byLanguage.listed;
  const service = providers.find((one) => one.id === provider)?.displayName ?? provider;
  const none = provider !== "" && ofProvider.length === 0;
  return (
    <>
      <div className="min-w-0">
        <OptionPicker
          field={field}
          label={label}
          group={group}
          value={value}
          placeholder={
            provider === ""
              ? "Pick a voice service first"
              : none
                ? `No voices for ${service} yet`
                : mine.length === 0
                  ? "No voices in this language"
                  : "Pick a voice"
          }
          disabled={provider === ""}
          options={mine.map((voice) => ({ value: voice.voiceId, label: voice.name }))}
          problem={problem}
          onPick={onPick}
        />
        {none ? (
          <HelpLine className="mt-1">
            <TextLink to="/settings" search={voicesSearch(provider)}>
              Add a voice for {service} ↗
            </TextLink>
          </HelpLine>
        ) : null}
      </div>
      {language === undefined ? null : (
        <VoiceLanguageNote
          language={language}
          voice={ofProvider.find((voice) => voice.voiceId === value)}
          hidden={byLanguage.hidden}
          showAll={byLanguage.showAll}
          onShowAll={byLanguage.setShowAll}
        />
      )}
    </>
  );
}
