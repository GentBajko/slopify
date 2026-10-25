import type { ProjectSummary, Stage } from "@app/slices/admission/model.js";
import {
  heldWord,
  parkedOnAgent,
  preparedWord,
  stageStateWords,
  waitingForAgentWord,
} from "@app/slices/admission/state-words.js";
import { etaLabel, stageEta } from "@app/slices/eta/model.js";
import type { CheckpointHold } from "@app/slices/reviews/holds.js";
import type { RunCost } from "@app/slices/run-cost/panel.js";
import type { Output } from "@app/slices/storage/model.js";
import type { ReactElement } from "react";
import { TextLink } from "@/components/kit/link";
import { Rail, RailLink } from "@/components/kit/rail";
import type { Tone } from "@/components/kit/status";
import type { Step } from "@/components/kit/steps";
import { usd } from "@/lib/format";
import { stageWords } from "@/lib/stage-words";
import { retryingWord } from "@/lib/state-words";
import type { SectionId } from "./next-action.js";
import { workDuration } from "./run-cost.js";
import type { StatusRow } from "./status-rows.js";
import { finalOutput, summaryOf } from "./summary.js";

// The status column beside the open section: the run's steps (`runSteps`, which the status
// list and the Progress view read), the one status list and the cost line.

const toneOf = (stage: Stage): Tone => {
  switch (stage.state) {
    case "running":
      return "running";
    case "done":
    case "provided":
      return "done";
    case "failed":
      return stage.retryAt === undefined ? "failed" : "waiting";
    default:
      return "off";
  }
};

// What a step waits for when the run is held there: the person's review at its checkpoint, the
// schedule's day (Waiting for its day), or an agent's review of what was made.
type StepHold = CheckpointHold["waitsFor"] | "agent";

const holdLook: Readonly<Record<StepHold, { readonly state: string; readonly detail: string }>> = {
  person: { state: heldWord, detail: "Press Approve at the top to carry on." },
  day: { state: preparedWord, detail: "Its schedule makes it then." },
  agent: { state: waitingForAgentWord, detail: "Goes on once the agent answers." },
};

// A step the person supplied is done like any other; its detail says who supplied it.
const stateWord = (stage: Stage): string => {
  if (stage.state === "failed" && stage.retryAt !== undefined) return retryingWord;
  if (stage.state === "provided") return stageStateWords.done;
  return stageStateWords[stage.state];
};

// "6 min", "41 s", "1 h 52 min": how long a step took, or has taken so far.
export function elapsed(stage: Stage, now: number): string | undefined {
  if (stage.startedAt === null) return undefined;
  const start = Date.parse(stage.startedAt);
  const end = stage.finishedAt === null ? now : Date.parse(stage.finishedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return undefined;
  const seconds = Math.round((end - start) / 1000);
  // A provided step took no time of its own; "0 s" would say nothing.
  if (seconds < 1) return undefined;
  if (seconds < 60) return `${String(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${String(minutes)} min`;
  return `${String(Math.floor(minutes / 60))} h ${String(minutes % 60)} min`;
}

// A running step's line ends with its time left, recomputed every second (`slices/eta`):
// "12 of 40 chunks · about 4 min left", or "time left unknown" when nothing gives one.
function withEta(detail: string | undefined, stage: Stage, now: number): string | undefined {
  const eta = stageEta(stage, now);
  if (eta === undefined) return detail;
  return detail === undefined || detail === "" ? etaLabel(eta) : `${detail} · ${etaLabel(eta)}`;
}

// `holding` is the project body's (`reviews/holds.ts`): a checkpoint the run hasn't reached
// holds nothing, and a run parked on an agent's review waits for the agent on every step left.
export function runSteps({
  stages,
  outputs,
  project,
  resumable,
  holding,
  now,
}: {
  readonly stages: readonly Stage[];
  readonly outputs: readonly Output[];
  readonly project: ProjectSummary;
  readonly resumable: boolean;
  readonly holding: readonly CheckpointHold[];
  readonly now: number;
}): readonly Step[] {
  const parked = parkedOnAgent(project);
  const holdOf = (stage: Stage): StepHold | undefined =>
    holding.find((hold) => hold.stage === stage.kind)?.waitsFor ??
    (parked && stage.state === "pending" ? "agent" : undefined);
  return stages
    .filter((stage) => stage.state !== "skipped")
    .map((stage) => {
      const hold = holdOf(stage);
      const time = elapsed(stage, now);
      return {
        id: stage.id,
        name:
          stage.kind === "video" && finalOutput(project.config) === "audio"
            ? "Audio export"
            : stageWords[stage.kind],
        tone: hold === undefined ? toneOf(stage) : "waiting",
        state: hold === undefined ? stateWord(stage) : holdLook[hold].state,
        ...(time === undefined ? {} : { time }),
        detail:
          hold === undefined
            ? withEta(summaryOf(stage, outputs, project, resumable), stage, now)
            : holdLook[hold].detail,
      };
    });
}

// A step changing state is said aloud ("Video: running"), wherever the status list is on
// screen.
export function StageAnnouncements({
  stages,
}: {
  readonly stages: readonly Stage[];
}): ReactElement {
  return (
    <div className="sr-only">
      {stages
        .filter((stage) => stage.state !== "skipped")
        .map((stage) => (
          <span key={stage.id} role="status" aria-live="polite">
            {`${stageWords[stage.kind]}: ${stage.state}`}
          </span>
        ))}
    </div>
  );
}

// The status column's list: one row per thing the project makes, each a link to its section,
// with its lamp, its state in words and one detail; a row at work or waiting says what it does
// on a second line. All files ends it.
export function ProjectStatusList({
  rows,
  projectId,
  selected,
}: {
  readonly rows: readonly StatusRow[];
  readonly projectId: string;
  readonly selected: SectionId;
}): ReactElement {
  return (
    <Rail label="Project sections" className="sl-status-list">
      {rows.map((row) => (
        <div key={row.id} className="sl-status-list__row">
          <RailLink
            to={`/projects/${projectId}`}
            search={{ section: row.id }}
            resetScroll={false}
            data-tour={`project-rail-${row.id}`}
            current={row.id === selected}
            {...(row.tone === undefined || row.state === undefined
              ? {}
              : { tone: row.tone, state: row.state })}
            {...(row.detail === undefined
              ? {}
              : {
                  meta:
                    row.state === undefined ? (
                      // A row without a state still reads "All files, 9 files" aloud.
                      <>
                        <span className="sr-only">, </span>
                        {row.detail}
                      </>
                    ) : (
                      row.detail
                    ),
                })}
          >
            {row.name}
          </RailLink>
          {row.more === undefined ? null : <p className="sl-status-list__more">{row.more}</p>}
        </div>
      ))}
    </Rail>
  );
}

// "Cost $0.07 · 4 s of working time · See the breakdown": the run's cost in one line under the
// list, the breakdown one press away. While the run goes it is the cost so far.
export function CostLine({
  cost,
  running,
  projectId,
  breakdownShown,
}: {
  readonly cost: RunCost | undefined;
  readonly running: boolean;
  readonly projectId: string;
  // The breakdown is on screen already: the line does not offer it again.
  readonly breakdownShown: boolean;
}): ReactElement {
  const spent = cost !== undefined && (cost.calls > 0 || cost.byStage.length > 0);
  const parts = [
    cost === undefined
      ? undefined
      : !spent
        ? "Nothing spent yet"
        : `${running ? "Cost so far" : "Cost"} ${usd(cost.cost)}${cost.unpriced > 0 ? " known" : ""}`,
    spent && cost?.apiEquivalent !== null && cost?.apiEquivalent !== undefined
      ? `~${usd(cost.apiEquivalent)} via API`
      : undefined,
    // The run's working time once it has stopped; while it runs the clock in the title row counts.
    spent && cost?.run !== null && cost?.run !== undefined && !cost.run.running
      ? `${workDuration(cost.run.workingMs)} of working time`
      : undefined,
  ].filter((part): part is string => part !== undefined);
  return (
    <p className="sl-status-list__cost" data-tour="project-rail-cost">
      {parts.join(" · ")}
      {breakdownShown ? null : (
        <>
          {parts.length === 0 ? null : " · "}
          <TextLink
            to="/projects/$projectId"
            params={{ projectId }}
            search={{ section: "cost" }}
            resetScroll={false}
          >
            See the breakdown
          </TextLink>
        </>
      )}
    </p>
  );
}
