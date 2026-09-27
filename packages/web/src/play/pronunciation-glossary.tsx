import { type ReactElement, type ReactNode, useId } from "react";
import { helpScope, InfoTip } from "@/components/kit/info-tip";

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
      <span className="flex items-center gap-1" {...helpScope}>
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
            aria-describedby={supported ? undefined : `${id}-support`}
            className="size-4 accent-accent"
            onChange={(event) => onChange(event.currentTarget.checked)}
          />
          Use Pronunciation Glossary
        </label>
        <InfoTip id="play.pronunciation-glossary" />
      </span>
      {shared === undefined ? null : (
        <div className="space-y-1 pl-7" {...helpScope}>
          <span className="flex items-center gap-1">
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
                className="size-4 accent-accent"
                onChange={(event) => shared.onChange(event.currentTarget.checked)}
              />
              Also use pronunciations from my other projects
            </label>
            <InfoTip id="play.share-glossary" />
          </span>
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
