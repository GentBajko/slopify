import type { ProjectListing } from "@app/slices/admission/model.js";
import type { ScheduleSummary } from "@app/slices/schedules/model.js";
import type { ReactElement } from "react";
import { TextLink } from "@/components/kit/link";
import { SectionHead } from "@/components/kit/section-head";
import { plural } from "@/lib/format";
import { FailedItem } from "./failed-item.js";
import { HeldTopicsItem, PausedItem, StoppedItem } from "./needs-you.js";
import { ReadyItem } from "./ready.js";
import { WaitingItem } from "./waiting-item.js";

// Home's two work lists. Ready: the finished videos, each with Watch and Download video.
// Needs you: the decisions waiting for the person (held reviews, stopped and paused runs,
// suggested topics) and the failures with their fix. Only one action in the column is primary:
// the first decision's when there is one, else the first video's Watch.

export type Decision =
  | {
      readonly kind: "waiting" | "stopped" | "paused" | "failed";
      readonly project: ProjectListing;
    }
  | { readonly kind: "held"; readonly schedule: ScheduleSummary };

// Enough to see what matters without the page turning into the projects list.
export const shownPerKind = 4;
export const readyShown = 6;

export function ReadyList({
  ready,
  primary,
  title = "Ready",
  more,
}: {
  readonly ready: readonly ProjectListing[];
  // Whether the first row's Watch is the column's one primary action.
  readonly primary: boolean;
  readonly title?: string;
  // "See all 9 ready to upload": the Projects filter that holds every one, when Home shows
  // fewer.
  readonly more?: ReactElement | undefined;
}): ReactElement {
  const shown = ready.slice(0, readyShown);
  return (
    <section aria-label={title}>
      <SectionHead title={title} meta={plural(ready.length, "video", "videos")} />
      <ul aria-label={title} className="sl-home-list m-0 list-none p-0">
        {shown.map((project, index) => (
          <ReadyItem key={project.id} project={project} primary={primary && index === 0} />
        ))}
      </ul>
      {ready.length > shown.length && more !== undefined ? (
        <div className="mt-2">{more}</div>
      ) : null}
    </section>
  );
}

export function WorkList({
  decisions,
  failed,
}: {
  // Every decision but the failures, which are counted apart so only the first few show.
  readonly decisions: readonly Decision[];
  readonly failed: readonly ProjectListing[];
}): ReactElement {
  const rows: readonly Decision[] = [
    ...decisions,
    ...failed.slice(0, shownPerKind).map((project) => ({ kind: "failed" as const, project })),
  ];
  return (
    <section aria-label="Needs you">
      <SectionHead
        title="Needs you"
        meta={plural(decisions.length + failed.length, "decision", "decisions")}
      />
      <ul aria-label="What needs you" className="sl-home-list m-0 list-none p-0">
        {rows.map((item, index) =>
          item.kind === "held" ? (
            <HeldTopicsItem key={item.schedule.id} schedule={item.schedule} primary={index === 0} />
          ) : item.kind === "waiting" ? (
            <WaitingItem key={item.project.id} project={item.project} primary={index === 0} />
          ) : item.kind === "stopped" ? (
            <StoppedItem key={item.project.id} project={item.project} primary={index === 0} />
          ) : item.kind === "paused" ? (
            <PausedItem key={item.project.id} project={item.project} primary={index === 0} />
          ) : (
            <FailedItem key={item.project.id} project={item.project} primary={index === 0} />
          ),
        )}
      </ul>
      {failed.length > shownPerKind ? (
        <div className="mt-2">
          <TextLink to="/projects" search={{ show: "failed" }}>
            {`See all ${String(failed.length)} failed`}
          </TextLink>
        </div>
      ) : null}
    </section>
  );
}
