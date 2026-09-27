import type { ReactNode } from "react";
import { StatusSlot } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { ariaKeyShortcuts, useCommand } from "@/components/kit/command-palette";
import { useToast } from "@/components/kit/toast";
import { SavedTick } from "@/components/saved-tick";
import { shortcuts } from "@/lib/shortcuts";

// The bar under an editor's form, pinned to the bottom of the viewport: Delete at the left
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
  const notify = useToast();
  // Ctrl+S (Cmd+S) saves from anywhere in the editor, a field included, instead of the
  // browser's Save page; a held Save says why, as the button does.
  useCommand({
    id: "editor.save",
    title: "Save",
    group: "This editor",
    keywords: ["save", "keep"],
    shortcut: shortcuts.save,
    run: () => {
      if (!held) onSave();
      else if (blocked !== undefined) notify(`Not saved yet: ${blocked}`, "error");
    },
  });

  const failure = errors.join(" ");
  return (
    <div
      data-slot="editor-actions"
      className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t border-line bg-ground py-3"
    >
      <Button
        variant="destructive"
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
        aria-keyshortcuts={ariaKeyShortcuts(shortcuts.save)}
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
