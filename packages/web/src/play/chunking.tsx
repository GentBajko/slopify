import type { Chunking, ChunkMode } from "@app/slices/narration/chunk.js";
import { defaultChunkCharacters, defaultChunkWords } from "@app/slices/narration/chunk.js";
import { Input } from "@/components/ui/input";
import { LabelledField } from "@/play/pickers";
import { InlineSwitch } from "@/play/switches";

export function ChunkingControl({
  value,
  onPick,
}: {
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
        label="Chunking"
        className="min-w-0 max-w-full flex-wrap [&_[data-slot=toggle-group]]:max-w-full [&_[data-slot=toggle-group]]:flex-wrap"
        value={value.mode}
        options={[
          { value: "whole", label: "Whole" },
          { value: "paragraph", label: "Paragraph" },
          { value: "words", label: `Every ${String(words)} words` },
          { value: "characters", label: `Every ${String(characters)} characters` },
        ]}
        onPick={(mode) => {
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
              type="number"
              min={1}
              max={characterMode ? 1000000 : 10000}
              inputMode="numeric"
              className="w-[100px] tabular-nums"
              value={count === undefined ? "" : String(count)}
              onChange={(event) => {
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
