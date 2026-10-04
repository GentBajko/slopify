import type { ReactElement } from "react";
import { StatusSlot } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";

// The save boundary of a form whose changes wait for its Save button: a reserved line that
// says when something is typed but not saved yet, with Discard beside it. Switches that save at
// once never set it, so the line also tells the two kinds of control apart.
export function UnsavedStatus({
  dirty,
  onDiscard,
  saveLabel = "Save",
  className,
}: {
  readonly dirty: boolean;
  readonly onDiscard: () => void;
  // The button that keeps the changes, named as it reads on screen.
  readonly saveLabel?: string;
  readonly className?: string;
}): ReactElement {
  return (
    <StatusSlot
      tone={dirty ? "warning" : "info"}
      {...(className === undefined ? {} : { className })}
    >
      {dirty ? (
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span>{`Unsaved changes. Press ${saveLabel} or Enter to keep them.`}</span>
          <Button variant="quiet" size="small" onClick={onDiscard}>
            Discard
          </Button>
        </span>
      ) : null}
    </StatusSlot>
  );
}
