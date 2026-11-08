import { useQuery } from "@tanstack/react-query";
import { type ReactElement, type ReactNode, useId } from "react";
import { useApp } from "@/app-context";
import { Checkbox, HelpLine } from "@/components/kit/field";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { TextLink } from "@/components/kit/link";
import { libraryPronunciationsQuery } from "@/queries";

// "Use pronunciations": names said with the IPA they are given rather than however the voice
// guesses. Settings → Voices → Name pronunciations comes first, so a name sounds the same in every
// video, then the glossary this article lists under its Pronunciation Glossary heading, then the
// other projects' pronunciations while they are shared. Only Inworld TTS-2 voices read IPA, so for
// any other voice the tick is not shown at all; the choice is kept on the draft for when such a
// voice is picked.
export function PronunciationGlossary({
  value,
  supported,
  onChange,
  list,
  shared,
}: {
  readonly value: boolean | undefined;
  readonly supported: boolean;
  readonly onChange: (value: boolean) => void;
  // A line about the copy of your Name pronunciations this project carries, said under the tick
  // while pronunciations are used.
  readonly list?: ReactNode;
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
          Use pronunciations
        </label>
        <InfoTip id="play.pronunciation-glossary" />
      </span>
      {sharing ? null : (
        <HelpLine className="pl-7">
          Says each name the way your Name pronunciations list and the article's Pronunciation
          Glossary spell it out, instead of however the voice guesses.
        </HelpLine>
      )}
      {sharing && list !== undefined ? <div className="pl-7">{list}</div> : null}
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

// What Create says under the tick: how many names your list settles, and where to change them.
// The project takes its copy when the run starts.
export function NamePronunciationsNote(): ReactElement {
  const { api } = useApp();
  const listing = useQuery(libraryPronunciationsQuery(api));
  const terms = listing.data?.terms;
  return (
    <p className="m-0 text-label text-ink-2">
      {terms === undefined
        ? "Reading your Name pronunciations…"
        : terms === 0
          ? "Your Name pronunciations list is empty, so this article's glossary decides."
          : `${String(terms)} ${terms === 1 ? "name" : "names"} come from your list first, however this article spells them out.`}{" "}
      <TextLink to="/name-pronunciations">Name pronunciations ↗</TextLink>
    </p>
  );
}
