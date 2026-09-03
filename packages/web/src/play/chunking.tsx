import type { Chunking, ChunkMode } from "@app/slices/narration/chunk.js";
import { defaultChunkWords } from "@app/slices/narration/chunk.js";
import { Input } from "@/components/ui/input";
import { LabelledField } from "@/play/pickers";
import { InlineSwitch } from "@/play/switches";

// `logic/08` step 2 and §Q65: how the narration is cut into requests. Whole text is one
// request, Per paragraph one per paragraph, and Every ~N words cuts at the last sentence
// boundary at or before N. The third segment names the N it is carrying, which is how the
// reference sheet draws it ("Every 500 words").

export function ChunkingControl({
  value,
  onPick,
}: {
  readonly value: Chunking;
  readonly onPick: (next: Chunking) => void;
}) {
  const words = value.words ?? defaultChunkWords;

  return (
    <>
      <InlineSwitch<ChunkMode>
        label="Chunking"
        value={value.mode}
        options={[
          { value: "whole", label: "Whole" },
          { value: "paragraph", label: "Paragraph" },
          { value: "words", label: `Every ${String(words)} words` },
        ]}
        onPick={(mode) => {
          // The count is carried across a mode change, so switching away and back does
          // not lose the number that was typed.
          onPick(mode === "words" ? { mode, words } : { mode });
        }}
      />
      {value.mode === "words" ? (
        <LabelledField label="Words" problem={undefined} inline>
          {({ id }) => (
            <Input
              id={id}
              type="number"
              min={1}
              inputMode="numeric"
              className="w-[80px] tabular-nums"
              value={value.words === undefined ? "" : String(value.words)}
              onChange={(event) => {
                const typed = Number.parseInt(event.target.value, 10);
                // An emptied box carries no count at all rather than snapping back to a
                // number the user is in the middle of replacing; the chunker's own
                // default (§Q69) is what a run without one is cut by.
                onPick(
                  Number.isFinite(typed) && typed > 0
                    ? { mode: "words", words: typed }
                    : { mode: "words" },
                );
              }}
            />
          )}
        </LabelledField>
      ) : null}
    </>
  );
}
