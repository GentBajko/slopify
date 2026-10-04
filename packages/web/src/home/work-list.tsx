import type { ProjectListing } from "@app/slices/admission/model.js";
import type { ScheduleSummary } from "@app/slices/schedules/model.js";
import { type ReactElement, useMemo } from "react";
import { Button } from "@/components/kit/button";
import { TextLink } from "@/components/kit/link";
import { SectionHead } from "@/components/kit/section-head";
import { RowCheck, SelectionBar, useSelection } from "@/components/selection";
import { useBulkMarkUploaded } from "./bulk-uploaded.js";
import { FailedItem, HeldTopicsItem, PausedItem, WaitingItem } from "./needs-you.js";
import { ReadyItem } from "./ready.js";

// Home's work list: the decisions waiting for the person first (held reviews, paused runs,
// suggested topics, failures), then the finished videos ready to upload. Only the first row's
// action is primary. With two or more videos ready, they can be ticked and marked uploaded
// together, with Undo.

export type Decision =
  | { readonly kind: "waiting" | "paused" | "failed"; readonly project: ProjectListing }
  | { readonly kind: "held"; readonly schedule: ScheduleSummary };

// Enough to see what matters without the page turning into the projects list.
export const shownPerKind = 4;

function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

export function workMeta(decisions: number, ready: number): string {
  return [
    decisions === 0 ? undefined : `${plural(decisions, "decision", "decisions")} waiting`,
    ready === 0 ? undefined : `${String(ready)} ready to upload`,
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
}

export function WorkList({
  decisions,
  failed,
  ready,
}: {
  // Every decision but the failures, which are counted apart so only the first few show.
  readonly decisions: readonly Decision[];
  readonly failed: readonly ProjectListing[];
  readonly ready: readonly ProjectListing[];
}): ReactElement {
  const rows: readonly Decision[] = [
    ...decisions,
    ...failed.slice(0, shownPerKind).map((project) => ({ kind: "failed" as const, project })),
  ];
  const readyShown = ready.slice(0, shownPerKind);
  const readyIds = readyShown.map((one) => one.id).join("\n");
  const readyKeys = useMemo(() => (readyIds === "" ? [] : readyIds.split("\n")), [readyIds]);
  const selection = useSelection(readyKeys);
  const mark = useBulkMarkUploaded({
    noun: ["video", "videos"],
    offWords: (count) =>
      count === 1
        ? "It is off Needs you; Projects still lists it."
        : "They are off Needs you; Projects still lists them.",
    onSettled: selection.clear,
  });
  const selectable = readyShown.length >= 2;
  return (
    <section aria-label="Needs you">
      <SectionHead
        title="Needs you"
        info="home.needs-you"
        meta={workMeta(decisions.length + failed.length, ready.length)}
      />
      {rows.length === 0 ? null : (
        <ul
          aria-label="Waiting for you"
          className="sl-home-list m-0 flex list-none flex-col gap-3 p-0"
        >
          {rows.map((item, index) =>
            item.kind === "held" ? (
              <HeldTopicsItem
                key={item.schedule.id}
                schedule={item.schedule}
                primary={index === 0}
              />
            ) : item.kind === "waiting" ? (
              <WaitingItem key={item.project.id} project={item.project} primary={index === 0} />
            ) : item.kind === "paused" ? (
              <PausedItem key={item.project.id} project={item.project} primary={index === 0} />
            ) : (
              <FailedItem key={item.project.id} project={item.project} primary={index === 0} />
            ),
          )}
        </ul>
      )}
      {readyShown.length === 0 ? null : (
        // biome-ignore lint/a11y/noStaticElementInteractions: Esc clears the selection anywhere in the list; each row keeps its own controls.
        <div
          onKeyDown={selection.onKeyDown}
          className={rows.length === 0 ? "flex flex-col gap-2" : "mt-3 flex flex-col gap-2"}
        >
          {selectable ? (
            <SelectionBar
              selection={selection}
              total={readyShown.length}
              noun={["video ready to upload", "videos ready to upload"]}
              actions={
                <Button
                  size="small"
                  disabled={selection.count === 0 || mark.isPending}
                  disabledReason={selection.count === 0 ? "Nothing is selected" : "Saving…"}
                  onClick={() =>
                    mark.mutate({
                      list: readyShown.filter((one) => selection.has(one.id)),
                      on: true,
                    })
                  }
                >
                  Mark selected uploaded
                </Button>
              }
            />
          ) : null}
          <ul
            aria-label="Ready to upload"
            className="sl-home-list m-0 flex list-none flex-col gap-3 p-0"
          >
            {readyShown.map((project, index) => (
              <ReadyItem
                key={project.id}
                project={project}
                primary={rows.length + index === 0}
                {...(selectable
                  ? {
                      check: (
                        <RowCheck selection={selection} value={project.id} label={project.title} />
                      ),
                    }
                  : {})}
              />
            ))}
          </ul>
        </div>
      )}
      {failed.length > shownPerKind || ready.length > shownPerKind ? (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
          {failed.length > shownPerKind ? (
            <TextLink to="/projects" search={{ show: "failed" }}>
              {`See all ${String(failed.length)} failed`}
            </TextLink>
          ) : null}
          {ready.length > shownPerKind ? (
            <TextLink to="/projects" search={{ show: "ready" }}>
              {`See all ${String(ready.length)} ready to upload`}
            </TextLink>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
