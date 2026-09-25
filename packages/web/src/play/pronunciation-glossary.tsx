import { type ReactElement, useId } from "react";

export function PronunciationGlossary({
  value,
  supported,
  onChange,
}: {
  readonly value: boolean | undefined;
  readonly supported: boolean;
  readonly onChange: (value: boolean) => void;
}): ReactElement {
  const id = useId();
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
      </label>
      <p id={`${id}-help`} className="text-small text-ink3">
        Uses IPA supplied in the article’s Pronunciation Glossary, for example{" "}
        <code>Arda: /ˈɑɹdə/</code>. Works independently of Narration Preparation with no extra LLM
        call. Supports generated Inworld TTS-2 and TTS-2 Flash audio. Readable text stays unchanged;
        no glossary means ordinary narration.
      </p>
      {!supported ? (
        <p id={`${id}-support`} className="text-small text-ink3">
          Unavailable for this provider or model. Your saved preference is retained.
        </p>
      ) : null}
    </div>
  );
}
