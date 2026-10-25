import type { ProjectListing } from "@app/slices/admission/model.js";
import type { ScheduleSummary } from "@app/slices/schedules/model.js";
import type { ReactElement } from "react";
import { TextLink } from "@/components/kit/link";
import { SectionHead } from "@/components/kit/section-head";
import { plural } from "@/lib/format";
import { FailedItem } from "./failed-item.js";
import { HeldTopicsItem, PausedItem, StoppedItem } from "./needs-you.js";
import { FinishedItem, isReadyToUpload } from "./ready.js";
import { WaitingItem } from "./waiting-item.js";

// Home's two work lists. Finished: what the person's runs made, newest first, each with Watch
// and Download video. Needs you: the decisions waiting for the person (held reviews, stopped
// and paused runs, suggested topics) and the failures with their fix. Only one action in the
// column is primary: the first decision's when there is one, else the newest video's Watch.

export type Decision =
  | {
      readonly kind: "waiting" | "stopped" | "paused" | "failed";
      readonly project: ProjectListing;
    }
  | { readonly kind: "held"; readonly schedule: ScheduleSummary };

// Enough to see what matters without the page turning into the projects list.
export const shownPerKind = 4;
export const finishedShown = 6;

// "4 videos · 2 ready to upload": how many, in the list's own noun, and how many still wait to
// be uploaded, saying how many of those read Done with problems ("3 ready to upload (1 with a
// failed step)") so the count matches the rows' words.
export function finishedMeta(finished: readonly ProjectListing[]): string {
  const videos = finished.every((one) => one.config.sources.video !== "off");
  const ready = finished.filter(isReadyToUpload);
  const failing = ready.filter((one) => one.status === "partial").length;
  return [
    videos
      ? plural(finished.length, "video", "videos")
      : plural(finished.length, "project", "projects"),
    ready.length === 0 || (ready.length === finished.length && failing === 0)
      ? undefined
      : `${String(ready.length)} ready to upload${failing === 0 ? "" : ` (${String(failing)} with a failed step)`}`,
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
}

export function FinishedList({
  finished,
  primary,
  title = "Finished",
  more,
}: {
  // Newest finished first.
  readonly finished: readonly ProjectListing[];
  // Whether the first row's Watch is the column's one primary action.
  readonly primary: boolean;
  readonly title?: string;
  // "See all 9 finished in Projects", when Home shows fewer.
  readonly more?: ReactElement | undefined;
}): ReactElement {
  const shown = finished.slice(0, finishedShown);
  return (
    <section aria-label={title}>
      <SectionHead title={title} meta={finishedMeta(finished)} />
      <ul aria-label={title} className="sl-home-list m-0 list-none p-0">
        {shown.map((project, index) => (
          <FinishedItem key={project.id} project={project} primary={primary && index === 0} />
        ))}
      </ul>
      {finished.length > shown.length && more !== undefined ? (
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
  // "2 decisions · 1 failed": a failure is not a decision, so it is counted apart.
  const meta = [
    decisions.length === 0 ? undefined : plural(decisions.length, "decision", "decisions"),
    failed.length === 0 ? undefined : `${String(failed.length)} failed`,
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
  return (
    <section aria-label="Needs you">
      <SectionHead title="Needs you" meta={meta} />
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
