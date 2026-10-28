import { type ReactElement, type ReactNode, useId } from "react";
import { Checkbox } from "@/components/kit/field";
import { helpScope, InfoTip } from "@/components/kit/info-tip";

// "Use the article's pronunciation glossary": names read with the IPA the article lists under its
// Pronunciation Glossary heading. Only Inworld TTS-2 voices read it, so for any other voice the
// tick is not shown at all; the choice is kept on the draft for when such a voice is picked.
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
}): ReactElement | null {
  const id = useId();
  if (!supported) return null;
  const sharing = value === true;
  return (
    <div className="col-span-full min-w-0 space-y-2">
      <span className="flex items-center gap-1" {...helpScope}>
        <label
          htmlFor={id}
          className="flex min-h-10 items-center gap-3 text-small font-semibold max-[1099px]:min-h-11"
        >
          <Checkbox
            id={id}
            data-play-field="audio.usePronunciationGlossary"
            checked={value === true}
            onChange={(event) => onChange(event.currentTarget.checked)}
          />
          Use the article's pronunciation glossary
        </label>
        <InfoTip id="play.pronunciation-glossary" />
      </span>
      {/* Only while the glossary is used: the other projects' entries join it. */}
      {shared === undefined || !sharing ? null : (
        <div className="space-y-1 pl-7" {...helpScope}>
          <span className="flex items-center gap-1">
            <label
              htmlFor={`${id}-shared`}
              className="flex min-h-8 items-center gap-3 text-small max-[1099px]:min-h-11"
            >
              <Checkbox
                id={`${id}-shared`}
                data-play-field="audio.shareGlossary"
                checked={shared.value === true}
                onChange={(event) => shared.onChange(event.currentTarget.checked)}
              />
              Also use pronunciations from my other projects
            </label>
            <InfoTip id="play.share-glossary" />
          </span>
          {shared.note === undefined ? null : shared.note}
        </div>
      )}
    </div>
  );
}
