import { bodyMax } from "@app/slices/library/model.js";
import { type ReactElement, useRef, useState } from "react";
import { Textarea } from "@/components/kit/field";
import { type BodyPiece, bodyPieces } from "@/lib/draft-lint";
import { limitCount } from "@/lib/limit-count";
import { cn } from "@/lib/utils";

// The prompt body, with every malformed `{{` marked where it stands and each line numbered in
// a gutter, in the monospace face prompts and keywords read best in. A textarea cannot style a
// range of its own value, so the text is painted by a mirror behind it and the textarea's own
// glyphs are made transparent; the caret keeps its colour. Both layers carry the identical
// metrics below, which is why they are one constant and not two class lists. The gutter is the
// mirror's left padding, and a wrapped line keeps one number, at its start.
//
// The mark is never colour alone: the same errors are listed as sentences beside the field, and
// `describedBy` points the textarea at them. Under the field: the count against the 100,000
// characters a prompt may hold, and the line and column of the caret, which the lint names.
const metrics =
  "py-3 pr-3 pl-12 font-mono text-small leading-[1.6] break-words [scrollbar-gutter:stable]";

interface Line {
  readonly number: number;
  readonly pieces: readonly BodyPiece[];
}

// The pieces cut at each line break, so each line can carry its number.
export function bodyLines(body: string): readonly Line[] {
  const lines: { number: number; pieces: BodyPiece[] }[] = [{ number: 1, pieces: [] }];
  for (const piece of bodyPieces(body)) {
    const parts = piece.text.split("\n");
    let start = piece.start;
    parts.forEach((text, index) => {
      if (index > 0) lines.push({ number: lines.length + 1, pieces: [] });
      const line = lines.at(-1);
      if (line !== undefined && text !== "") line.pieces.push({ ...piece, start, text });
      start += text.length + 1;
    });
  }
  return lines;
}

// "Line 3, column 12" for a caret offset, counted as the lint counts.
export function caretPosition(body: string, at: number): string {
  const before = body.slice(0, at);
  const line = before.split("\n").length;
  const column = at - before.lastIndexOf("\n");
  return `Line ${String(line)}, column ${String(column)}`;
}

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
}): ReactElement {
  const mirror = useRef<HTMLDivElement | null>(null);
  const [caret, setCaret] = useState<number | undefined>(undefined);
  const countId = `${id}-count`;

  return (
    <div className="max-w-[80ch]">
      <div className="relative">
        <div
          ref={mirror}
          aria-hidden="true"
          data-slot="lint-overlay"
          className={cn(
            metrics,
            // The transparent border keeps the mirror's box model identical to the
            // textarea's, so the first glyph of each line starts at the same pixel.
            "pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap",
            "rounded-control border border-transparent bg-sunken text-ink",
          )}
        >
          {bodyLines(value).map((line) => (
            <div key={line.number} className="relative">
              <span className="absolute -left-11 w-8 text-right text-ink-3 tabular-nums select-none">
                {line.number}
              </span>
              {line.pieces.map((piece) => (
                <span
                  key={piece.start}
                  // The offset the mark sits at, which is the offset the server counts its
                  // line and column from.
                  data-lint-mark={piece.marked ? piece.start : undefined}
                  className={
                    piece.marked
                      ? "text-danger underline decoration-danger decoration-2 underline-offset-[3px]"
                      : undefined
                  }
                >
                  {piece.text}
                </span>
              ))}
              {/* An empty line still takes its height, as it does in the textarea. */}
              {line.pieces.length === 0 ? "​" : null}
            </div>
          ))}
        </div>

        <Textarea
          id={id}
          rows={24}
          value={value}
          spellCheck={false}
          aria-invalid={invalid}
          aria-describedby={[describedBy, countId].filter(Boolean).join(" ")}
          className={cn(
            metrics,
            // `block` and not the textarea's inline default: inline leaves a descender gap
            // under it, and the wrapper the overlay is stretched to would be taller than
            // the field it has to sit behind.
            "relative block min-h-[520px] resize-y border-line-strong overflow-auto bg-transparent text-transparent caret-ink",
          )}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
          onScroll={(event) => {
            const overlay = mirror.current;
            if (overlay !== null) {
              overlay.scrollTop = event.currentTarget.scrollTop;
              overlay.scrollLeft = event.currentTarget.scrollLeft;
            }
          }}
        />
      </div>
      <p
        id={countId}
        className={cn(
          "m-0 mt-1 flex flex-wrap justify-between gap-x-4 text-small tabular-nums",
          value.length > bodyMax ? "text-danger" : "text-ink-3",
        )}
      >
        <span>{limitCount(value.length, bodyMax, "characters")}</span>
        <span aria-live="off">
          {caret === undefined ? "" : caretPosition(value, Math.min(caret, value.length))}
        </span>
      </p>
    </div>
  );
}
