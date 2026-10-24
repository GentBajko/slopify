import { keywordOf } from "@app/slices/keywords/specs.js";
import { bodyMax } from "@app/slices/library/model.js";
import { type ReactElement, useId, useRef, useState } from "react";
import { Textarea } from "@/components/kit/field";
import { type BodyPiece, type BodyPlace, bodyPieces, type KeywordMark } from "@/lib/draft-lint";
import { limitCount } from "@/lib/limit-count";
import { cn } from "@/lib/utils";
import { KeywordPopover, type ShownKeyword } from "./keyword-card";

// The prompt body, set as the prose it is: the reading face at body size in full ink, spell
// check on, growing with the text from about twelve lines. Every malformed `{{` is underlined
// where it stands and each keyword is coloured, which a textarea cannot do to its own value, so
// the text is painted by a mirror behind it and the textarea's own glyphs are made transparent;
// the caret keeps its colour. Both layers carry the identical metrics below, which is why they
// are one constant and not two class lists.
//
// The mark is never colour alone: the same errors are listed as sentences beside the field, each
// with a Go to button that puts the caret on it, and `describedBy` points the textarea at them.
// The count against the 100,000 characters a prompt may hold shows only near the limit.
//
// With a `place`, each keyword Slopify fills is marked too: one usable here, a misuse (with the
// lint's sentence), an old name. The textarea is on top, so pointing at a keyword is found by
// measuring the mirror's spans; the caret inside one shows the same card for the keyboard.
const metrics = "px-3 py-2.5 font-sans text-body font-normal break-words [scrollbar-gutter:stable]";

// The count appears from this share of the limit.
const countFrom = 0.9;

interface Line {
  readonly number: number;
  readonly pieces: readonly BodyPiece[];
}

const keywordLooks: Readonly<Record<KeywordMark, string>> = {
  known: "text-accent-ink",
  misuse: "text-danger underline decoration-wavy decoration-danger underline-offset-[3px]",
  legacy: "underline decoration-dotted decoration-waiting decoration-2 underline-offset-[3px]",
};

// A keyword of your own (`{{Topic}}`), the question you answer on Create, is highlighted
// behind its letters, apart from the accent-ink letters of a keyword Slopify fills. Only a
// background and a ring are drawn (neither takes room), so the mirror's glyphs stay exactly
// where the textarea's are. The prompt's detail and the "Asks you for" chips wear the same
// highlight.
export const ownKeywordLook = "rounded-[3px] bg-accent-tint text-ink ring-1 ring-accent/40";

const wellFormed = /\{\{([^{}\n]*)\}\}/g;

// Plain text cut at each keyword of your own: one with a name that Slopify does not fill.
export function ownKeywordParts(
  text: string,
): readonly { readonly at: number; readonly text: string; readonly own: boolean }[] {
  const parts: { at: number; text: string; own: boolean }[] = [];
  let cursor = 0;
  for (const match of text.matchAll(wellFormed)) {
    const name = (match[1] ?? "").trim();
    if (name === "" || keywordOf(name) !== undefined) continue;
    if (match.index > cursor)
      parts.push({ at: cursor, text: text.slice(cursor, match.index), own: false });
    parts.push({ at: match.index, text: match[0], own: true });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) parts.push({ at: cursor, text: text.slice(cursor), own: false });
  return parts;
}

// The pieces cut at each line break, so the mirror draws the lines the textarea holds.
export function bodyLines(body: string, where?: BodyPlace): readonly Line[] {
  const lines: { number: number; pieces: BodyPiece[] }[] = [{ number: 1, pieces: [] }];
  for (const piece of bodyPieces(body, where)) {
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

export function SlotBody({
  id,
  value,
  invalid,
  describedBy,
  place,
  grandfathered,
  placeholder,
  onChange,
}: {
  readonly id: string;
  readonly value: string;
  readonly invalid: boolean;
  readonly describedBy: string | undefined;
  // Where the body runs, to mark its keywords; the stored prompt's own slot names.
  readonly place?: BodyPlace["place"] | undefined;
  readonly grandfathered?: readonly string[] | undefined;
  readonly placeholder?: string | undefined;
  readonly onChange: (next: string) => void;
}): ReactElement {
  const mirror = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState<ShownKeyword | undefined>(undefined);
  const countId = `${id}-count`;
  const cardId = useId();
  const lines = bodyLines(
    value,
    place === undefined ? undefined : { place, grandfathered: grandfathered ?? [] },
  );
  const keywords = lines.flatMap((line) => line.pieces.filter((piece) => piece.keyword));
  const nearLimit = value.length >= bodyMax * countFrom;

  const showFor = (piece: BodyPiece | undefined): void => {
    const span =
      piece === undefined
        ? null
        : mirror.current?.querySelector(`[data-keyword-at="${String(piece.start)}"]`);
    if (piece?.keyword === undefined || !(span instanceof HTMLElement)) {
      setShown(undefined);
      return;
    }
    const { name, message } = piece.keyword;
    setShown((now) =>
      now?.anchor === span && now.name === name && now.problem === message
        ? now
        : { name, problem: message, anchor: span },
    );
  };
  const pointAt = (x: number, y: number): void => {
    const spans = mirror.current?.querySelectorAll<HTMLElement>("[data-keyword-at]") ?? [];
    const over = [...spans].find((span) => {
      const box = span.getBoundingClientRect();
      return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
    });
    const at = over?.getAttribute("data-keyword-at");
    showFor(keywords.find((piece) => String(piece.start) === at));
  };
  const caretAt = (at: number): void =>
    showFor(keywords.find((piece) => at > piece.start && at < piece.start + piece.text.length));

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
          {lines.map((line) => (
            <div key={line.number}>
              {line.pieces.map((piece) => (
                <span
                  key={piece.start}
                  // The offset the mark sits at, which is the offset the server counts its
                  // line and column from.
                  data-lint-mark={piece.marked ? piece.start : undefined}
                  data-keyword={piece.keyword?.name}
                  data-keyword-kind={piece.keyword?.kind}
                  data-keyword-at={piece.keyword === undefined ? undefined : piece.start}
                  className={
                    piece.marked
                      ? "text-danger underline decoration-danger decoration-2 underline-offset-[3px]"
                      : piece.keyword === undefined
                        ? undefined
                        : keywordLooks[piece.keyword.kind]
                  }
                >
                  {piece.marked || piece.keyword !== undefined
                    ? piece.text
                    : ownKeywordParts(piece.text).map((part) =>
                        part.own ? (
                          <span key={part.at} data-own-keyword="" className={ownKeywordLook}>
                            {part.text}
                          </span>
                        ) : (
                          part.text
                        ),
                      )}
                </span>
              ))}
              {/* An empty line still takes its height, as it does in the textarea. */}
              {line.pieces.length === 0 ? "​" : null}
            </div>
          ))}
        </div>

        <Textarea
          id={id}
          rows={12}
          value={value}
          spellCheck
          placeholder={placeholder}
          aria-invalid={invalid}
          aria-describedby={[
            describedBy,
            nearLimit ? countId : undefined,
            shown === undefined ? undefined : cardId,
          ]
            .filter(Boolean)
            .join(" ")}
          className={cn(
            metrics,
            // `block` and not the textarea's inline default: inline leaves a descender gap
            // under it, and the wrapper the overlay is stretched to would be taller than
            // the field it has to sit behind.
            "relative block resize-y border-line-strong overflow-auto bg-transparent text-transparent caret-ink placeholder:text-ink-3",
          )}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          onSelect={(event) => {
            const at = event.currentTarget.selectionStart;
            if (event.currentTarget.selectionEnd === at) caretAt(at);
            else setShown(undefined);
          }}
          onMouseMove={(event) => pointAt(event.clientX, event.clientY)}
          onMouseLeave={() => setShown(undefined)}
          onScroll={(event) => {
            const overlay = mirror.current;
            if (overlay !== null) {
              overlay.scrollTop = event.currentTarget.scrollTop;
              overlay.scrollLeft = event.currentTarget.scrollLeft;
            }
          }}
        />
        <KeywordPopover id={cardId} shown={shown} onDismiss={() => setShown(undefined)} />
      </div>
      {nearLimit ? (
        <p
          id={countId}
          className={cn(
            "m-0 mt-1 text-small tabular-nums",
            value.length > bodyMax ? "text-danger" : "text-ink-2",
          )}
        >
          {limitCount(value.length, bodyMax, "characters")}
        </p>
      ) : null}
    </div>
  );
}
