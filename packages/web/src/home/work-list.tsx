import type { ProjectListing } from "@app/slices/admission/model.js";
import type { ScheduleSummary } from "@app/slices/schedules/model.js";
import type { ReactElement } from "react";
import { TextLink } from "@/components/kit/link";
import { SectionHead } from "@/components/kit/section-head";
import { FailedItem, HeldTopicsItem, PausedItem, WaitingItem } from "./needs-you.js";
import { ReadyItem } from "./ready.js";

// Home's work list: the decisions waiting for the person first (held reviews, paused runs,
// suggested topics, failures), then the finished videos ready to upload. Only the first row's
// action is primary.

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
  return (
    <section aria-label="Needs you">
      <SectionHead
        title="Needs you"
        info="home.needs-you"
        meta={workMeta(decisions.length + failed.length, ready.length)}
      />
      <ul
        aria-label="Waiting for you"
        className="sl-home-list m-0 flex list-none flex-col gap-3 p-0"
      >
        {rows.map((item, index) =>
          item.kind === "held" ? (
            <HeldTopicsItem key={item.schedule.id} schedule={item.schedule} primary={index === 0} />
          ) : item.kind === "waiting" ? (
            <WaitingItem key={item.project.id} project={item.project} primary={index === 0} />
          ) : item.kind === "paused" ? (
            <PausedItem key={item.project.id} project={item.project} primary={index === 0} />
          ) : (
            <FailedItem key={item.project.id} project={item.project} primary={index === 0} />
          ),
        )}
        {readyShown.map((project, index) => (
          <ReadyItem key={project.id} project={project} primary={rows.length + index === 0} />
        ))}
      </ul>
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
