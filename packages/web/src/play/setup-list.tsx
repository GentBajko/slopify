import type { ReactElement, ReactNode } from "react";
import { Button } from "@/components/kit/button";
import { Status } from "@/components/kit/status";
import { SectionHead } from "@/components/kit/section-head";
import type { SetupRowId } from "./setup-rows";

export interface SetupListRow {
  readonly id: SetupRowId;
  readonly label: string;
  readonly summary: string;
  // The first refusal the row holds: it needs attention, said on the row itself.
  readonly problem?: string | undefined;
  // The editor under the row, or undefined for a row that opens the side panel instead.
  readonly editor?: ReactNode;
}

// The summary rows of Play. Each is one line of what the run will do; Change opens its editor
// in place under the row (Done folds it again), or the side panel for a row without one.
export function SetupList({
  rows,
  open,
  onChange,
}: {
  readonly rows: readonly SetupListRow[];
  readonly open: ReadonlySet<SetupRowId>;
  readonly onChange: (row: SetupRowId, open: boolean) => void;
}): ReactElement {
  return (
    <ul aria-label="Setup" className="m-0 flex list-none flex-col border-t border-line p-0">
      {rows.map((row) => {
        const expanded = open.has(row.id) && row.editor !== undefined;
        const editorId = `play-row-${row.id}`;
        return (
          <li key={row.id} data-setup-row={row.id} className="border-b border-line">
            <SectionHead
              title={row.label}
              size="small"
              className="items-center py-3.5"
              status={row.problem ? <Status tone="failed">Needs setup</Status> : undefined}
              meta={
                // Folded, the row says what holds it back; open, the field itself says so.
                <span
                  data-row-summary
                  className={
                    row.problem && !expanded
                      ? "block break-words text-danger"
                      : "block truncate text-ink-2"
                  }
                  title={row.problem && !expanded ? undefined : row.summary}
                >
                  {expanded ? row.summary : (row.problem ?? row.summary)}
                </span>
              }
            >
              <Button
                variant="quiet"
                size="small"
                aria-expanded={row.editor === undefined ? undefined : expanded}
                aria-controls={row.editor === undefined ? undefined : editorId}
                aria-label={`${expanded ? "Done with" : "Change"} ${row.label.toLowerCase()}`}
                onClick={() => onChange(row.id, !expanded)}
              >
                {expanded ? "Done" : "Change"}
              </Button>
            </SectionHead>
            {expanded ? (
              <section id={editorId} aria-label={row.label} className="min-w-0 pb-6">
                {row.editor}
              </section>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
