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
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import type { HelpId } from "@/help/catalog";
import { KeywordPopover, type ShownKeyword } from "./keyword-card";

// The places an editor body can be: every prompt kind and both entry categories.
export type BodyKeywordPlace = Exclude<KeywordPlace, "title">;

// The tip beside each bar, listing what that kind can use.
const keywordTips = {
  article: "library.keywords.article",
  script: "library.keywords.script",
  narration: "library.keywords.narration",
  image: "library.keywords.image",
  thumbnail: "library.keywords.thumbnail",
  description: "library.keywords.description",
  shorts: "library.keywords.shorts",
  review: "library.keywords.review",
  intro: "library.keywords.intro",
  outro: "library.keywords.outro",
} as const satisfies Record<BodyKeywordPlace, HelpId>;

// "Thumbnail Text" for {{Slopify_Thumbnail_Text}}: the chip's short name.
export function keywordLabel(name: string): string {
  return name.slice(reservedPrefix.length).replaceAll("_", " ");
}

// The keywords Slopify fills that this body can use, one row above the text. The row keeps its
// height whatever the kind (it scrolls sideways), so switching kind never moves the text. A
// press puts `{{Slopify_X}}` where the caret is, over the selection, and hands the caret back
// after it. The row is one tab stop; the arrow keys, Home and End move along it.
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
    <div className="mb-1 flex min-w-0 items-center gap-2" {...helpScope}>
      <span className="sl-field__label shrink-0">Insert</span>
      <InfoTip id={keywordTips[place]} label="Keywords Slopify fills" className="-my-1" />
      <div
        ref={row}
        role="toolbar"
        aria-label="Insert a keyword Slopify fills"
        onKeyDown={onKeyDown}
        className="flex min-w-0 flex-1 flex-nowrap gap-1 overflow-x-auto py-1"
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
            className="shrink-0 font-mono"
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
