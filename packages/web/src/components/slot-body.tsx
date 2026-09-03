import { useRef } from "react";
import { Textarea } from "@/components/ui/input";
import { bodyPieces } from "@/lib/draft-lint";
import { cn } from "@/lib/utils";

// The prompt body, with every malformed `{{` marked where it stands. A textarea cannot style a
// range of its own value, so the text is painted by a mirror behind it and the textarea's own
// glyphs are made transparent; the caret keeps its colour. Both layers carry the identical
// metrics below, which is why they are one constant and not two class lists.
//
// The mark is never colour alone: the same errors are listed as sentences beside the field, and
// `describedBy` points the textarea at them.
const metrics =
  "px-3 py-[10px] font-sans text-body leading-[1.5] break-words [scrollbar-gutter:stable]";

export function SlotBody({
  id,
  value,
  invalid,
  describedBy,
  onChange,
}: {
  readonly id: string;
  readonly value: string;
  readonly invalid: boolean;
  readonly describedBy: string | undefined;
  readonly onChange: (next: string) => void;
}) {
  const mirror = useRef<HTMLDivElement | null>(null);

  return (
    <div className="relative max-w-[75ch]">
      <div
        ref={mirror}
        aria-hidden="true"
        data-slot="lint-overlay"
        className={cn(
          metrics,
          // The transparent border keeps the mirror's box model identical to the
          // textarea's, so the first glyph of each line starts at the same pixel.
          "pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap",
          "rounded-control border border-transparent bg-panel2 text-ink",
        )}
      >
        {bodyPieces(value).map((piece) => (
          <span
            key={piece.start}
            // The offset the mark sits at, which is the offset the server counts its
            // line and column from.
            data-lint-mark={piece.marked ? piece.start : undefined}
            className={
              piece.marked
                ? "text-red underline decoration-red decoration-2 underline-offset-[3px]"
                : undefined
            }
          >
            {piece.text}
          </span>
        ))}
        {/* A trailing newline in the value would otherwise leave the mirror one line
            shorter than the textarea it has to line up with. */}
        {"\n"}
      </div>

      <Textarea
        id={id}
        rows={24}
        value={value}
        spellCheck={false}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={cn(
          metrics,
          // `block` and not the textarea's inline default: inline leaves a descender gap
          // under it, and the wrapper the overlay is stretched to would be taller than
          // the field it has to sit behind.
          "relative block min-h-[520px] resize-y overflow-auto bg-transparent text-transparent caret-ink",
        )}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onScroll={(event) => {
          const overlay = mirror.current;
          if (overlay !== null) {
            overlay.scrollTop = event.currentTarget.scrollTop;
            overlay.scrollLeft = event.currentTarget.scrollLeft;
          }
        }}
      />
    </div>
  );
}
