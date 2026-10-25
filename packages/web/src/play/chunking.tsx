import type { Chunking, ChunkMode } from "@app/slices/narration/chunk.js";
import { defaultChunkCharacters, defaultChunkWords } from "@app/slices/narration/chunk.js";
import { HelpLine, Input } from "@/components/kit/field";
import { helpScope } from "@/components/kit/info-tip";
import { LabelledField } from "@/play/pickers";
import { InlineSwitch } from "@/play/switches";

// The fold's line for it: "read as one piece", "split every 500 words".
export function chunkingWords(value: Chunking): string {
  switch (value.mode) {
    case "whole":
      return "read as one piece";
    case "paragraph":
      return "split by paragraph";
    case "words":
      return `split every ${String(value.words ?? defaultChunkWords)} words`;
    case "characters":
      return `split every ${String(value.characters ?? defaultChunkCharacters)} characters`;
  }
}

// How the narration is sent to the voice service, with one line on when to split and what it
// changes, and the piece size once it is split by words or characters.
export function ChunkingControl({
  value,
  onPick,
  rawCounts,
}: {
  readonly rawCounts?: {
    readonly words: string;
    readonly characters: string;
    readonly onChange: (mode: ChunkMode, amount: string) => void;
  };
  readonly value: Chunking;
  readonly onPick: (next: Chunking) => void;
}) {
  const words = value.words ?? defaultChunkWords;
  const characters = value.characters ?? defaultChunkCharacters;
  const counted = value.mode === "words" || value.mode === "characters";
  const characterMode = value.mode === "characters";
  const count = characterMode ? value.characters : value.words;
  return (
    <div className="col-span-full flex min-w-0 flex-col gap-2" {...helpScope}>
      <InlineSwitch<ChunkMode>
        field="chunking.mode"
        label="Split the narration by"
        className="min-w-0 max-w-full flex-wrap [&_[data-slot=toggle-group]]:max-w-full [&_[data-slot=toggle-group]]:flex-wrap"
        value={value.mode}
        options={[
          { value: "whole", label: "Nothing (one piece)" },
          { value: "paragraph", label: "Paragraph" },
          { value: "words", label: `Every ${String(rawCounts?.words ?? words)} words` },
          {
            value: "characters",
            label: `Every ${String(rawCounts?.characters ?? characters)} characters`,
          },
        ]}
        onPick={(mode) => {
          if (rawCounts) {
            rawCounts.onChange(
              mode,
              mode === "characters" ? rawCounts.characters : rawCounts.words,
            );
            return;
          }
          onPick(
            mode === "words"
              ? { mode, words }
              : mode === "characters"
                ? { mode, characters }
                : { mode },
          );
        }}
      />
      <HelpLine>
        Split it when a voice service refuses long text. It changes the number of requests, not the
        price.
      </HelpLine>
      {counted ? (
        <LabelledField label={characterMode ? "Characters" : "Words"} problem={undefined}>
          {({ id }) => (
            <Input
              id={id}
              data-play-field={characterMode ? "chunking.characters" : "chunking.words"}
              type={rawCounts ? "text" : "number"}
              min={1}
              max={characterMode ? 1000000 : 10000}
              inputMode="numeric"
              className="sl-input--number"
              value={
                rawCounts
                  ? characterMode
                    ? rawCounts.characters
                    : rawCounts.words
                  : count === undefined
                    ? ""
                    : String(count)
              }
              onChange={(event) => {
                if (rawCounts) {
                  rawCounts.onChange(value.mode, event.target.value);
                  return;
                }
                const typed = Number.parseInt(event.target.value, 10);
                const valid = Number.isFinite(typed) && typed > 0;
                onPick(
                  characterMode
                    ? valid
                      ? { mode: "characters", characters: Math.min(typed, 1000000) }
                      : { mode: "characters" }
                    : valid
                      ? { mode: "words", words: Math.min(typed, 10000) }
                      : { mode: "words" },
                );
              }}
            />
          )}
        </LabelledField>
      ) : null}
      {counted ? <HelpLine>Each piece ends at the last whole sentence that fits.</HelpLine> : null}
    </div>
  );
}
