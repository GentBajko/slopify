import { type ReactElement, type ReactNode, useId } from "react";
import { Checkbox, HelpLine } from "@/components/kit/field";
import { helpScope } from "@/components/kit/info-tip";

// "Use your pronunciation list": say the words of Settings → Voices → Pronunciation the way they
// are listed ("Dr." as "Doctor"), named as that page is. Any generated voice; the article and
// the captions keep the written words.
export function NarrationAliasesToggle({
  value,
  onChange,
  note,
}: {
  readonly value: boolean | undefined;
  readonly onChange: (value: boolean) => void;
  // What the project uses: how many aliases, and in Edit project the button that copies them
  // again from the Library.
  readonly note?: ReactNode;
}): ReactElement {
  const id = useId();
  return (
    <div className="col-span-full min-w-0 space-y-1" {...helpScope}>
      <span className="flex items-center gap-1">
        <label
          htmlFor={id}
          className="flex min-h-10 items-center gap-3 text-small font-semibold max-[1099px]:min-h-11"
        >
          <Checkbox
            id={id}
            data-play-field="audio.useNarrationAliases"
            checked={value === true}
            onChange={(event) => onChange(event.currentTarget.checked)}
          />
          Use your pronunciation list
        </label>
      </span>
      <HelpLine className="pl-7">
        Says words the way Settings → Voices → Pronunciation lists them, such as Dr. as Doctor. The
        article and captions keep the written words.
      </HelpLine>
      {note === undefined ? null : <div className="pl-7">{note}</div>}
    </div>
  );
}
