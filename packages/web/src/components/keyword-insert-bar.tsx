import type { KeywordPlace } from "@app/slices/keywords/model.js";
import { costLabel, reservedPrefix } from "@app/slices/keywords/model.js";
import { keywordsFor } from "@app/slices/keywords/specs.js";
import { ChevronDownIcon } from "lucide-react";
import { type ReactElement, useRef } from "react";
import { Button } from "@/components/kit/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/kit/menu";

// The places an editor body can be: every prompt kind and both entry categories.
export type BodyKeywordPlace = Exclude<KeywordPlace, "title">;

// "Thumbnail Text" for {{Slopify_Thumbnail_Text}}: the keyword's short name where the text is
// described (the editor's aside, a prompt's detail), never on what inserts it.
export function keywordLabel(name: string): string {
  return name.slice(reservedPrefix.length).replaceAll("_", " ");
}

// The keywords Slopify fills that this body can use, behind one button above the text: each is
// listed as exactly what goes in ({{Slopify_Title}}), in the color that keyword takes in the
// text, over what it fills in and, when it is part of an AI call, that call. So what a pick
// inserts is what it said, and what each fills in is read before it is picked, not on a hover.
// A pick puts the keyword where the caret was, over the selection, and hands the caret back
// after it.
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
  // Where the caret goes once a pick's text is on the page: after the keyword.
  const caret = useRef<number | undefined>(undefined);
  const specs = keywordsFor(place);

  // A text box keeps its selection while the menu has the focus, so the keyword lands where
  // the caret was.
  const insert = (name: string): void => {
    const text = `{{${name}}}`;
    const box = textareaOf(targetId);
    const start = Math.min(box?.selectionStart ?? value.length, value.length);
    const end = Math.min(Math.max(box?.selectionEnd ?? start, start), value.length);
    caret.current = box === undefined ? undefined : start + text.length;
    onChange(`${value.slice(0, start)}${text}${value.slice(end)}`);
  };

  return (
    <div className="mb-1 flex min-w-0 max-w-[80ch] items-center">
      <Menu>
        <MenuTrigger asChild>
          <Button variant="quiet" size="small" className="text-accent-ink">
            Insert a keyword Slopify fills
            <ChevronDownIcon aria-hidden="true" />
          </Button>
        </MenuTrigger>
        <MenuContent
          align="start"
          className="max-h-[min(60vh,520px)] w-[min(30rem,calc(100vw-32px))] overflow-y-auto"
          // After a pick the focus goes back into the text, after the keyword, not onto the
          // button that opened the menu. The menu holds the focus until it has closed, so this
          // is where the text can take it (the new text is on the page by then).
          onCloseAutoFocus={(event) => {
            const at = caret.current;
            caret.current = undefined;
            const box = textareaOf(targetId);
            if (at === undefined || box === undefined) return;
            event.preventDefault();
            box.focus();
            box.setSelectionRange(at, at);
          }}
        >
          {specs.map((spec) => (
            <MenuItem
              key={spec.name}
              data-keyword={spec.name}
              className="items-start"
              onSelect={() => insert(spec.name)}
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-mono text-small text-accent-ink">{`{{${spec.name}}}`}</span>
                <span className="whitespace-normal text-small text-ink-2">{spec.fills}</span>
                {spec.cost === "free" ? null : (
                  <span className="whitespace-normal text-small text-ink-3">
                    {costLabel(spec.cost)}
                  </span>
                )}
              </span>
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>
    </div>
  );
}

function textareaOf(id: string): HTMLTextAreaElement | undefined {
  const found = document.getElementById(id);
  return found instanceof HTMLTextAreaElement ? found : undefined;
}
