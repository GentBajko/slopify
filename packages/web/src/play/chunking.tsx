import type { Chunking, ChunkMode } from "@app/slices/narration/chunk.js";
import { defaultChunkCharacters, defaultChunkWords } from "@app/slices/narration/chunk.js";
import { Input } from "@/components/ui/input";
import { LabelledField } from "@/play/pickers";
import { InlineSwitch } from "@/play/switches";

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
    <>
      <InlineSwitch<ChunkMode>
        field="chunking.mode"
        label="Chunking"
        className="min-w-0 max-w-full flex-wrap [&_[data-slot=toggle-group]]:max-w-full [&_[data-slot=toggle-group]]:flex-wrap"
        value={value.mode}
        options={[
          { value: "whole", label: "Whole" },
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
      {counted ? (
        <LabelledField label={characterMode ? "Characters" : "Words"} problem={undefined} inline>
          {({ id }) => (
            <Input
              id={id}
              data-play-field={characterMode ? "chunking.characters" : "chunking.words"}
              type={rawCounts ? "text" : "number"}
              min={1}
              max={characterMode ? 1000000 : 10000}
              inputMode="numeric"
              className="w-[100px] tabular-nums"
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
      {characterMode ? (
        <p className="basis-full text-small text-ink3">
          Ends at the last complete sentence within the character count, including spaces. A longer
          sentence stays whole; provider request limits still apply.
        </p>
      ) : null}
    </>
  );
}
