import type { ReactElement, ReactNode } from "react";
import { Button } from "@/components/kit/button";
import { Status } from "@/components/kit/status";
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
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3.5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h2 className="m-0 text-title-3">{row.label}</h2>
                  {row.problem ? <Status tone="failed">Needs setup</Status> : null}
                </div>
                {/* Folded, the row says what holds it back; open, the field itself says so. */}
                <p
                  data-row-summary
                  className={
                    row.problem && !expanded
                      ? "m-0 mt-0.5 text-small break-words text-danger"
                      : "m-0 mt-0.5 truncate text-small text-ink-2"
                  }
                  title={row.problem && !expanded ? undefined : row.summary}
                >
                  {expanded ? row.summary : (row.problem ?? row.summary)}
                </p>
              </div>
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
            </div>
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
