import { CopyIcon, DownloadIcon, Trash2Icon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { Button } from "@/components/kit/button";
import { type Selection, SelectionBar } from "@/components/selection";

// The selection bar of a Library tab: at rest, Select all and the count, one line; once a row is
// ticked, the count of ticked ones ("1 of 4 prompts selected"), Clear selection, then Duplicate,
// Export (where the tab exports) and Delete, on the same line, so ticking a box never moves the
// rows under the pointer. The bar's own words name what they act on, so the buttons are one word
// on screen (their accessible names say "selected" too). A tab puts the bar over its list and
// detail together, where there is room for the line. The tab decides whether Delete asks first
// (a permanent delete) or offers Undo.
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
  // "Remove selected" where the list is saved as a whole (Aliases). Its first word is what
  // shows on screen.
  readonly deleteLabel?: string;
}): ReactElement {
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
              aria-label="Duplicate selected"
              disabled={busy}
              disabledReason="Working on the last press"
              onClick={onDuplicate}
            >
              <CopyIcon aria-hidden="true" className="size-[14px]" />
              Duplicate
            </Button>
          )}
          {onExport === undefined ? null : (
            <Button size="small" aria-label="Export selected" onClick={onExport}>
              <DownloadIcon aria-hidden="true" className="size-[14px]" />
              Export
            </Button>
          )}
          <Button
            size="small"
            variant="destructive"
            aria-label={deleteLabel}
            disabled={busy}
            disabledReason="Working on the last press"
            onClick={onDelete}
          >
            <Trash2Icon aria-hidden="true" className="size-[14px]" />
            {deleteLabel.split(" ")[0]}
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
