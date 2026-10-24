import type { ReactElement, ReactNode } from "react";
import { Button } from "@/components/kit/button";
import { Status } from "@/components/kit/status";
import type { SetupRowId } from "./setup-rows";

export interface SetupListRow {
  readonly id: SetupRowId;
  readonly label: string;
  readonly summary: string;
  // What holds the row back, as the next thing to do ("Pick a voice"): the same words the
  // hint under the Make button and the summary drawer use.
  readonly problem?: string | undefined;
  // Where the row's values come from on a draft made from a template: "From Weekly lore" while
  // they are the template's, "Changed here" once this project overrides them.
  readonly origin?: string | undefined;
  readonly editor: ReactNode;
}

// Create's setup, one row per part of the run: its name, one plain sentence of what it will
// do, and what it still needs in red. Change opens the row's editor under it (Fix when it
// needs something); the open row's button closes it again, and its sentence stays in view.
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
    // The rows lay out by the list's own width: the name in its own column only where the
    // sentence beside it still has room.
    <ul
      aria-label="Setup"
      className="@container m-0 flex list-none flex-col border-t border-line p-0"
    >
      {rows.map((row) => {
        const expanded = open.has(row.id);
        const editorId = `play-row-${row.id}`;
        const name = row.label.toLowerCase();
        return (
          <li key={row.id} data-setup-row={row.id} className="scroll-mt-4 border-b border-line">
            <div
              data-row-head
              className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 py-2.5 @min-[560px]:grid-cols-[148px_minmax(0,1fr)_auto]"
            >
              <div className="col-start-1 row-start-1 min-w-0">
                <h3 className="m-0 text-body font-semibold">{row.label}</h3>
                {row.origin === undefined ? null : (
                  <span data-row-origin className="block text-label text-ink-3">
                    {row.origin}
                  </span>
                )}
              </div>
              <div className="col-span-2 col-start-1 row-start-2 min-w-0 @min-[560px]:col-span-1 @min-[560px]:col-start-2 @min-[560px]:row-start-1">
                <p data-row-summary className="m-0 break-words text-small text-ink-2">
                  {row.summary}
                </p>
                {row.problem === undefined ? null : (
                  <p data-row-problem className="m-0 mt-1">
                    <Status tone="failed" className="whitespace-normal">
                      {row.problem}
                    </Status>
                  </p>
                )}
              </div>
              <Button
                variant={row.problem !== undefined && !expanded ? "secondary" : "quiet"}
                size="small"
                className="col-start-2 row-start-1 @min-[560px]:col-start-3"
                aria-expanded={expanded}
                aria-controls={editorId}
                {...(expanded ? {} : { "aria-label": `${row.problem ? "Fix" : "Change"} ${name}` })}
                onClick={() => onChange(row.id, !expanded)}
              >
                {expanded ? `Close ${name}` : row.problem ? "Fix" : "Change"}
              </Button>
            </div>
            {expanded ? (
              <section id={editorId} aria-label={row.label} className="min-w-0 pb-4">
                {row.editor}
              </section>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
