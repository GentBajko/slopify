import type { ReactNode } from "react";
import { StatusSlot } from "@/components/kit/action-bar";
import { SavedTick } from "@/components/saved-tick";
import { Button } from "@/components/ui/button";

// The bar under an editor's sheet, pinned to the bottom of the viewport: Delete at the left
// (its place kept even before there is a row to delete), then one status slot for the error,
// the Saved tick or the reason Save is holding, then Cancel and Save. Both editors draw it - prompts and intros/outros - so the
// refusal affordance is written once and cannot drift between them.
//
// `cancel` is a node rather than a route, because the two editors return to two different
// lists and neither of them belongs in here.
export function EditorActions({
  onDelete,
  blocked,
  blockedId,
  pending,
  saved,
  cancel,
  errors,
  onSave,
}: {
  // Undefined while the template has no row yet: there is nothing to delete.
  readonly onDelete: (() => void) | undefined;
  readonly blocked: string | undefined;
  readonly blockedId: string;
  readonly pending: boolean;
  readonly saved: boolean;
  readonly cancel: ReactNode;
  readonly errors: readonly string[];
  readonly onSave: () => void;
}) {
  const held = blocked !== undefined || pending || saved;

  const failure = errors.join(" ");
  return (
    <div
      data-slot="editor-actions"
      className="sticky bottom-0 z-10 -mx-[18px] -mb-[18px] flex flex-wrap items-center gap-[10px] rounded-b-panel border-t border-line bg-panel px-[18px] py-3 shadow-[0_-6px_14px_-10px_var(--color-shadow)]"
    >
      <Button
        className="bg-transparent"
        onClick={onDelete}
        disabled={onDelete === undefined}
        aria-hidden={onDelete === undefined ? true : undefined}
        tabIndex={onDelete === undefined ? -1 : undefined}
        style={onDelete === undefined ? { visibility: "hidden" } : undefined}
      >
        Delete
      </Button>
      <StatusSlot tone={failure ? "error" : "info"} id={failure ? undefined : blockedId}>
        {failure ? failure : saved ? <SavedTick /> : blocked}
      </StatusSlot>
      {cancel}
      <Button
        variant="primary"
        aria-disabled={held}
        aria-describedby={blocked === undefined ? undefined : blockedId}
        onClick={() => {
          // `aria-disabled` rather than `disabled`: a button nobody can focus cannot
          // announce the reason it is refusing, so the reason stays reachable and the
          // guard lives here.
          if (!held) {
            onSave();
          }
        }}
      >
        Save
      </Button>
    </div>
  );
}
