import type { KeywordPlace } from "@app/slices/keywords/model.js";
import { reservedPrefix } from "@app/slices/keywords/model.js";
import { keywordsFor } from "@app/slices/keywords/specs.js";
import {
  type KeyboardEvent,
  type ReactElement,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/kit/button";
import { KeywordPopover, type ShownKeyword } from "./keyword-card";

// The places an editor body can be: every prompt kind and both entry categories.
export type BodyKeywordPlace = Exclude<KeywordPlace, "title">;

// "Thumbnail Text" for {{Slopify_Thumbnail_Text}}: the chip's short name.
export function keywordLabel(name: string): string {
  return name.slice(reservedPrefix.length).replaceAll("_", " ");
}

// The keywords Slopify fills that this body can use, above the text, under the words "Slopify
// fills these in". Each chip is in the colour that keyword takes in the text, so what you write
// and what Slopify writes read as two things. The chips wrap onto more lines rather than scroll
// out of sight, and the bar is no wider than the editor (80ch). A press puts `{{Slopify_X}}`
// where the caret is, over the selection, and hands the caret back after it; pointing at a chip
// shows what it fills in. The row is one tab stop; the arrow keys, Home and End move along it.
export function KeywordInsertBar({
  place,
  targetId,
  value,
  onChange,
}: {
  readonly place: BodyKeywordPlace;
  // The id of the textarea the keyword goes into.
  readonly targetId: string;
  readonly value: string;
  readonly onChange: (next: string) => void;
}): ReactElement {
  const cardId = useId();
  const row = useRef<HTMLDivElement>(null);
  const caret = useRef<number | undefined>(undefined);
  const [current, setCurrent] = useState(0);
  const [shown, setShown] = useState<ShownKeyword | undefined>(undefined);
  const specs = keywordsFor(place);
  const focusAt = Math.min(current, Math.max(specs.length - 1, 0));

  // The text is the parent's state, so the caret is placed once the new text is on the page.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the inserted text lands.
  useLayoutEffect(() => {
    const at = caret.current;
    caret.current = undefined;
    const box = textareaOf(targetId);
    if (at === undefined || box === undefined) return;
    box.focus();
    box.setSelectionRange(at, at);
  }, [value, targetId]);

  const insert = (name: string): void => {
    const text = `{{${name}}}`;
    const box = textareaOf(targetId);
    const start = Math.min(box?.selectionStart ?? value.length, value.length);
    const end = Math.min(Math.max(box?.selectionEnd ?? start, start), value.length);
    caret.current = box === undefined ? undefined : start + text.length;
    onChange(`${value.slice(0, start)}${text}${value.slice(end)}`);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const last = specs.length - 1;
    const next =
      event.key === "ArrowRight"
        ? focusAt === last
          ? 0
          : focusAt + 1
        : event.key === "ArrowLeft"
          ? focusAt === 0
            ? last
            : focusAt - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : undefined;
    if (next === undefined) return;
    event.preventDefault();
    setCurrent(next);
    row.current?.querySelectorAll<HTMLElement>("[data-keyword]")[next]?.focus();
  };

  const show = (name: string, anchor: HTMLElement): void => setShown({ name, anchor });
  const hide = (name: string): void => setShown((now) => (now?.name === name ? undefined : now));

  return (
    <div className="mb-1 flex min-w-0 max-w-[80ch] items-start gap-2">
      <span className="shrink-0 py-1 text-small text-ink-2">Slopify fills these in:</span>
      <div
        ref={row}
        role="toolbar"
        aria-label="Insert a keyword Slopify fills"
        onKeyDown={onKeyDown}
        className="flex min-w-0 flex-1 flex-wrap gap-1 py-1"
      >
        {specs.map((spec, index) => (
          <Button
            key={spec.name}
            variant="quiet"
            size="small"
            data-keyword={spec.name}
            aria-label={`Insert ${keywordLabel(spec.name)}`}
            aria-describedby={shown?.name === spec.name ? cardId : undefined}
            tabIndex={index === focusAt ? 0 : -1}
            className="shrink-0 text-accent-ink"
            onClick={() => insert(spec.name)}
            onPointerEnter={(event) => show(spec.name, event.currentTarget)}
            onPointerLeave={() => hide(spec.name)}
            onFocus={(event) => {
              setCurrent(index);
              show(spec.name, event.currentTarget);
            }}
            onBlur={() => hide(spec.name)}
          >
            {keywordLabel(spec.name)}
          </Button>
        ))}
      </div>
      <KeywordPopover id={cardId} shown={shown} onDismiss={() => setShown(undefined)} />
    </div>
  );
}

function textareaOf(id: string): HTMLTextAreaElement | undefined {
  const found = document.getElementById(id);
  return found instanceof HTMLTextAreaElement ? found : undefined;
}
