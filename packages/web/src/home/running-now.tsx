import type { StageKind } from "@app/kernel/pipeline.js";
import type { ProjectListing, Stage } from "@app/slices/admission/model.js";
import { etaLabel, stageEta } from "@app/slices/eta/model.js";
import { assetOf } from "@app/slices/storage/asset-name.js";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactElement, useState } from "react";
import { fileUrl } from "@/api";
import { useApp } from "@/app-context";
import { hitArea } from "@/components/kit/list-row";
import { Lightbox, MediaFrame, MediaGrid } from "@/components/kit/media";
import { LoadFailed, LoadingBlock } from "@/components/kit/query-state";
import { Status } from "@/components/kit/status";
import { type Step, Steps } from "@/components/kit/steps";
import { stageStateWord } from "@/lib/state-words";
import { limitWaitLine } from "@/project/limit-wait";
import { activityText, capitalised, stageName, stageNames } from "@/project/summary";
import { useLiveProject } from "@/project/use-live";
import { projectQuery } from "@/queries";

// One run going now, as Home shows it: its steps with their lamps and times, and the images as
// they land. It rides the project's own event stream, so a step lighting up or an image
// arriving shows here in the same moment it does on the project page.

const stepTone: Readonly<Record<Stage["state"], Step["tone"]>> = {
  pending: "off",
  running: "running",
  done: "done",
  provided: "done",
  failed: "failed",
  canceled: "off",
  skipped: "off",
};

// "4 min", "1 h 12 min", "38 s".
export function elapsed(
  fromIso: string | null,
  toIso: string | null,
  now: number,
): string | undefined {
  if (fromIso === null) return undefined;
  const ms = (toIso === null ? now : Date.parse(toIso)) - Date.parse(fromIso);
  if (!Number.isFinite(ms) || ms < 0) return undefined;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${String(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${String(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  return `${String(hours)} h ${String(minutes % 60)} min`;
}

// "2 of 8 · about 4 min left": what a running step has counted and its time left, recomputed
// every second (`slices/eta`); "time left unknown" when there is nothing to go by. A step the
// server names says what it is doing instead of its count ("Rendering the video (45%)"), as
// the project page does: the video's last step is the long render, and "50 of 51" sat still
// through all of it.
export function runningDetail(stage: Stage, now: number): string | undefined {
  const eta = stageEta(stage, now);
  if (eta === undefined) return undefined;
  const named = activityText(stage);
  if (named !== undefined)
    return eta.basis === "unknown"
      ? capitalised(named)
      : `${capitalised(named)} · ${etaLabel(eta)}`;
  const counted =
    stage.progressTotal !== null && stage.progressTotal > 0
      ? `${String(Math.floor(stage.progressCurrent ?? 0))} of ${String(stage.progressTotal)} · `
      : "";
  return `${counted}${etaLabel(eta)}`;
}

export function RunningProject({
  project,
  now,
}: {
  readonly project: ProjectListing;
  readonly now: number;
}): ReactElement {
  const { api } = useApp();
  useLiveProject(project.id);
  const [open, setOpen] = useState<number | null>(null);
  const body = useQuery(projectQuery(api, project.id));
  // The list row carries no full settings; the step names read the project's own.
  const config = body.data?.project.config;
  const nameOf = (kind: StageKind): string =>
    config === undefined ? stageNames[kind] : stageName(kind, config);
  const stages = (body.data?.stages ?? []).filter(
    (stage) => stage.source !== "off" && stage.state !== "skipped",
  );
  const images = (body.data?.outputs ?? [])
    .filter((output) => output.role === "image")
    .toSorted((left, right) => (left.meta.index ?? 0) - (right.meta.index ?? 0));
  const drawing = stages.find((stage) => stage.kind === "images" && stage.state === "running");
  const running = stages.find((stage) => stage.state === "running");
  // "Waiting for Codex limits (resets at 14:00)": the run goes on by itself, so it stays here.
  const waiting = limitWaitLine(project.limitWaits);
  // The last few that landed, and a tile for the one being drawn.
  const shown = images.slice(drawing === undefined ? -4 : -3);
  const steps: Step[] = stages.map((stage) => ({
    id: stage.kind,
    name: nameOf(stage.kind),
    tone: stepTone[stage.state],
    state: stageStateWord[stage.state],
    time: elapsed(stage.startedAt, stage.finishedAt, now),
    detail: runningDetail(stage, now),
  }));
  return (
    <li className={`sl-home-run ${hitArea}`}>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="sl-row__title text-[17px]">
            <Link to="/projects/$projectId" params={{ projectId: project.id }}>
              {project.title}
            </Link>
          </div>
          {project.status === "paused" ? (
            <Status tone="waiting">Paused</Status>
          ) : waiting !== undefined ? (
            <Status tone="waiting">{waiting}</Status>
          ) : (
            <Status tone="running">
              {running === undefined ? "Running" : nameOf(running.kind)}
            </Status>
          )}
        </div>
        {shown.length === 0 && drawing === undefined ? null : (
          <MediaGrid list density="compact" label={`Images of ${project.title}`}>
            {shown.map((output, index) => (
              <li key={output.id}>
                <MediaFrame
                  src={fileUrl(api, project.id, assetOf(output))}
                  alt={`Image ${String(output.meta.index ?? "")}`}
                  onOpen={() => setOpen(index)}
                />
              </li>
            ))}
            {drawing === undefined ? null : (
              <li>
                <MediaFrame
                  alt="The next image"
                  generating={`Drawing · ${String(images.length)} so far`}
                />
              </li>
            )}
          </MediaGrid>
        )}
        <Lightbox
          items={shown.map((output) => ({
            src: fileUrl(api, project.id, assetOf(output)),
            alt: `Image ${String(output.meta.index ?? "")}`,
            ...(output.meta.prompt === undefined ? {} : { caption: output.meta.prompt }),
          }))}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
        />
        {drawing === undefined ? null : (
          <p className="m-0 text-small text-ink-2">
            {`Images ${String(drawing.progressCurrent ?? images.length)} of ${String(drawing.progressTotal ?? "?")}`}
          </p>
        )}
      </div>
      {body.data !== undefined ? (
        <Steps steps={steps} label={`Steps of ${project.title}`} />
      ) : body.error !== null ? (
        <LoadFailed
          compact
          what="Its steps"
          error={body.error}
          onRetry={() => void body.refetch()}
          retrying={body.isFetching}
        />
      ) : (
        <LoadingBlock
          label={`Loading the steps of ${project.title}…`}
          rows={3}
          rowClassName="h-6"
        />
      )}
    </li>
  );
}
