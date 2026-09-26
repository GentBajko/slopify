import { type ReactElement, type ReactNode, useId } from "react";
import { InfoTip } from "@/components/kit/info-tip";

export function PronunciationGlossary({
  value,
  supported,
  onChange,
  shared,
}: {
  readonly value: boolean | undefined;
  readonly supported: boolean;
  readonly onChange: (value: boolean) => void;
  // Whether the other projects' pronunciations are used too, and a line about the copy.
  readonly shared?: {
    readonly value: boolean | undefined;
    readonly onChange: (value: boolean) => void;
    readonly note?: ReactNode;
  };
}): ReactElement {
  const id = useId();
  const sharing = supported && value === true;
  return (
    <div className="col-span-full min-w-0 space-y-2">
      <label
        htmlFor={id}
        className="flex min-h-10 items-center gap-3 text-small font-semibold max-[1099px]:min-h-11"
      >
        <input
          id={id}
          type="checkbox"
          data-play-field="audio.usePronunciationGlossary"
          checked={value === true}
          disabled={!supported}
          aria-describedby={`${id}-help${supported ? "" : ` ${id}-support`}`}
          className="size-4 accent-accent"
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
        Use Pronunciation Glossary
        <InfoTip label="the Pronunciation Glossary">
          <p>
            Uses IPA supplied in the article’s Pronunciation Glossary, for example{" "}
            <code>Arda: /ˈɑɹdə/</code>. Works independently of Narration Preparation with no extra
            LLM call. Supports generated Inworld TTS-2 and TTS-2 Flash audio. Readable text stays
            unchanged; no glossary means ordinary narration.
          </p>
        </InfoTip>
      </label>
      <p id={`${id}-help`} className="sr-only">
        Uses IPA supplied in the article’s Pronunciation Glossary, for example{" "}
        <code>Arda: /ˈɑɹdə/</code>. Works independently of Narration Preparation with no extra LLM
        call. Supports generated Inworld TTS-2 and TTS-2 Flash audio. Readable text stays unchanged;
        no glossary means ordinary narration.
      </p>
      {shared === undefined ? null : (
        <div className="space-y-1 pl-7">
          <label
            htmlFor={`${id}-shared`}
            className="flex min-h-8 items-center gap-3 text-small max-[1099px]:min-h-11"
          >
            <input
              id={`${id}-shared`}
              type="checkbox"
              data-play-field="audio.shareGlossary"
              checked={shared.value === true}
              disabled={!sharing}
              aria-describedby={`${id}-shared-help`}
              className="size-4 accent-accent"
              onChange={(event) => shared.onChange(event.currentTarget.checked)}
            />
            Also use pronunciations from my other projects
          </label>
          <p id={`${id}-shared-help`} className="text-label text-ink3">
            Adds every term from your other projects&rsquo; glossaries, copied when this project
            starts. This project&rsquo;s own glossary wins where they differ. Turn it off to use
            this article&rsquo;s glossary only.
          </p>
          {shared.note === undefined ? null : shared.note}
        </div>
      )}
      {!supported ? (
        <p id={`${id}-support`} className="text-label text-ink3">
          Unavailable for this provider or model. Your saved preference is retained.
        </p>
      ) : null}
    </div>
  );
}
