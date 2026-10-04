import { CopyIcon, DownloadIcon, Trash2Icon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { Button } from "@/components/kit/button";
import { type Selection, SelectionBar } from "@/components/selection";

// The selection bar of a Library tab: shown only while a row is ticked, so the list stays
// quiet until then. Duplicate selected, Export selected (where the tab exports) and Delete
// selected; the tab decides whether Delete asks first (a permanent delete) or offers Undo.
export function LibraryBulkBar({
  selection,
  total,
  noun,
  scope,
  busy,
  onDuplicate,
  onExport,
  onDelete,
  deleteLabel = "Delete selected",
}: {
  readonly selection: Selection<string>;
  readonly total: number;
  readonly noun: readonly [singular: string, plural: string];
  readonly scope?: string | undefined;
  readonly busy: boolean;
  readonly onDuplicate?: (() => void) | undefined;
  readonly onExport?: (() => void) | undefined;
  readonly onDelete: () => void;
  // "Remove selected" where the list is saved as a whole (Aliases).
  readonly deleteLabel?: string;
}): ReactElement | null {
  if (selection.count === 0) return null;
  return (
    <SelectionBar
      selection={selection}
      total={total}
      noun={noun}
      className="mb-2"
      {...(scope === undefined ? {} : { scope })}
      actions={
        <>
          {onDuplicate === undefined ? null : (
            <Button
              size="small"
              disabled={busy}
              disabledReason="Working on the last press"
              onClick={onDuplicate}
            >
              <CopyIcon aria-hidden="true" className="size-[14px]" />
              Duplicate selected
            </Button>
          )}
          {onExport === undefined ? null : (
            <Button size="small" onClick={onExport}>
              <DownloadIcon aria-hidden="true" className="size-[14px]" />
              Export selected
            </Button>
          )}
          <Button
            size="small"
            variant="destructive"
            disabled={busy}
            disabledReason="Working on the last press"
            onClick={onDelete}
          >
            <Trash2Icon aria-hidden="true" className="size-[14px]" />
            {deleteLabel}
          </Button>
        </>
      }
    />
  );
}

// Holds a tab's ticked rows: Esc anywhere inside clears the selection.
export function SelectionArea({
  selection,
  children,
}: {
  readonly selection: Selection<string>;
  readonly children: ReactNode;
}): ReactElement {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Esc is handed down from the rows' own controls.
    <div onKeyDown={selection.onKeyDown}>{children}</div>
  );
}
