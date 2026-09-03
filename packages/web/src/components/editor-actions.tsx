import type { ReactNode } from "react";
import { SavedTick } from "@/components/saved-tick";
import { Button } from "@/components/ui/button";

// The bar under an editor's sheet: Delete at the left, then the reason Save is holding,
// the Saved tick, Cancel and Save (uiux/screens/05-prompt-editor.md). Both template
// libraries of `logic/15` §Q121 draw it - the prompt editor and the intro/outro editor -
// so the refusal affordance is written once and cannot drift between them.
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

  return (
    <div className="flex flex-wrap items-center gap-[10px] border-t border-line pt-[14px]">
      {onDelete === undefined ? null : (
        <Button className="bg-transparent" onClick={onDelete}>
          Delete
        </Button>
      )}
      <span className="flex-1" />
      {saved ? <SavedTick /> : null}
      {blocked === undefined ? null : (
        <span id={blockedId} className="text-small text-ink2">
          {blocked}
        </span>
      )}
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
      {errors.map((message) => (
        <p key={message} className="basis-full text-label text-red">
          {message}
        </p>
      ))}
    </div>
  );
}
