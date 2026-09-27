import { type ReactElement, type ReactNode, useId } from "react";

// "Use narration aliases": say Library → Aliases' words the way they are listed ("Dr." as
// "Doctor"). Any generated voice; the article and the captions keep the written words.
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
    <div className="col-span-full min-w-0 space-y-1">
      <label
        htmlFor={id}
        className="flex min-h-10 items-center gap-3 text-small font-semibold max-[1099px]:min-h-11"
      >
        <input
          id={id}
          type="checkbox"
          data-play-field="audio.useNarrationAliases"
          checked={value === true}
          aria-describedby={`${id}-help`}
          className="size-4 accent-accent"
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
        Use narration aliases
      </label>
      <p id={`${id}-help`} className="pl-7 text-label text-ink3">
        Says the words in Library → Aliases as listed there, copied when the project starts.
        Captions keep the written words.
      </p>
      {note === undefined ? null : <div className="pl-7">{note}</div>}
    </div>
  );
}
