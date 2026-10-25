import { costLabel, listOf, placeLabels } from "@app/slices/keywords/model.js";
import { keywordOf } from "@app/slices/keywords/specs.js";
import { type ReactElement, useRef } from "react";
import { Fact, Facts } from "@/components/kit/facts";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/kit/popover";

// What one keyword Slopify fills does, over the keyword in a prompt's text (the Insert menu
// says the same in its rows). The words are the keyword table's own (`keywords/specs.ts`), so
// the editor, the wiki page and the lint never tell two stories. `problem` is the lint's
// sentence when the keyword is misused here.
export function KeywordCard({
  name,
  problem,
}: {
  readonly name: string;
  readonly problem?: string | undefined;
}): ReactElement {
  const spec = keywordOf(name);
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 font-mono text-small text-ink">{`{{${spec?.name ?? name}}}`}</p>
      {/* The lint's sentence about an old name already says it keeps working. */}
      {spec !== undefined && spec.legacy === name && problem === undefined ? (
        <p className="m-0">{`{{${name}}} is its old name, which keeps working.`}</p>
      ) : null}
      {problem === undefined ? null : <p className="m-0 text-danger">{problem}</p>}
      {spec === undefined ? null : (
        <>
          <p className="m-0 text-ink">{spec.fills}</p>
          <Facts className="gap-x-3 sm:gap-y-1">
            <Fact label="Example">
              <span className="whitespace-pre-line text-small">{spec.example}</span>
            </Fact>
            <Fact label="When">
              <span className="text-small">{spec.available}</span>
            </Fact>
            <Fact label="Works in">
              <span className="text-small">
                {listOf(spec.places.map((place) => placeLabels[place]))}
              </span>
            </Fact>
            <Fact label="Cost">
              <span className="text-small">{costLabel(spec.cost)}</span>
            </Fact>
          </Facts>
        </>
      )}
    </div>
  );
}

// Anything with a box on screen: an element, or a span measured where it stands.
export interface Measurable {
  getBoundingClientRect(): DOMRect;
}

// The keyword shown, and what the card sits by: the keyword's own span in the text behind a
// prompt's textarea.
export interface ShownKeyword {
  readonly name: string;
  readonly problem?: string | undefined;
  readonly anchor: Measurable;
}

// The card floats by what it explains without taking focus, so typing and arrow keys carry on;
// Esc or a press elsewhere closes it.
export function KeywordPopover({
  id,
  shown,
  onDismiss,
}: {
  readonly id: string;
  readonly shown: ShownKeyword | undefined;
  readonly onDismiss: () => void;
}): ReactElement {
  const anchor = useRef<Measurable | null>(null);
  anchor.current = shown?.anchor ?? null;
  return (
    <Popover
      open={shown !== undefined}
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
    >
      <PopoverAnchor virtualRef={anchor} />
      {shown === undefined ? null : (
        <PopoverContent
          id={id}
          role="tooltip"
          side="bottom"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <KeywordCard name={shown.name} problem={shown.problem} />
        </PopoverContent>
      )}
    </Popover>
  );
}
