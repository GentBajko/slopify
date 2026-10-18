import type { DatabaseSync } from "node:sqlite";
import { setTimeout as sleep } from "node:timers/promises";
import { transact } from "../../kernel/db/tx.js";
import { internalError } from "../../kernel/errors.js";
import { derive } from "../../kernel/runner/graph.js";
import { pendingAdmitted } from "../admission/admitted-work.js";
import { projectExists, projectPaused, stagesOf } from "../admission/repo.js";
import { startRun } from "../admission/start.js";
import { type CostEstimate, estimateRun } from "../estimate/index.js";
import type { DraftStartDeps } from "../play-drafts/model.js";
import { checkDraftReadiness } from "../play-drafts/readiness.js";
import { templateById } from "../project-templates/repo.js";
import { recoverProject } from "../rebuild/recovery.js";
import { previewRebuild, type RebuildDeps, startRebuild } from "../rebuild/service.js";
import { saveRevision } from "../revisions/mutations.js";
import { currentRevisionId } from "../revisions/repo.js";
import { getRevisionView } from "../revisions/view.js";
import { budgetRoom, budgetWords, fitsBudget } from "./budget.js";
import { sampleEdit } from "./edit.js";
import { removeHiddenProject } from "./hidden.js";
import { continueJobAsSave, type SampleJob } from "./jobs.js";
import { resolveSampleRun, totals } from "./quote.js";
import { sampleOf, sampleVersions, setSampleVersion, upsertSample } from "./repo.js";
import { exceedsAcknowledged, type UnknownAcks } from "./save.js";
import { sampleDocument } from "./scope.js";
import { defaultSampleTopic } from "./service.js";

// A template's paid sample, made on its hidden project through the same engine every project
// runs on: the first one starts a run, every later one saves the project's next revision and
// rebuilds what it outdates. Nothing is spent above what the person saw (a quarter more and five
// cents), with a price unknown they didn't accept, or past today's budget: the version waits,
// saying why. Work already going is never stopped; a newer sample waits for it.

export interface PaidSampleDeps {
  // Play's start: the review prices the sample's run and startRun begins its first one.
  readonly start: DraftStartDeps;
  readonly rebuild: RebuildDeps;
  readonly acks: UnknownAcks;
  readonly timeZone?: string | undefined;
  // How long to wait between looks at a running sample. Tests pass 0.
  readonly pollMs?: number | undefined;
}

const money = (value: number) => `$${value.toFixed(2)}`;

// Why a sample of about `high` (with `unknown` steps unpriced) waits instead of starting, or
// undefined when it may start.
export function holdReason(
  deps: Pick<PaidSampleDeps, "acks" | "timeZone"> & {
    readonly db: DatabaseSync;
    readonly now: Date;
  },
  job: SampleJob,
  cost: { readonly high: number; readonly unknown: number; readonly usesPlan: boolean },
): string | undefined {
  if (exceedsAcknowledged(cost.high, job.ackHigh))
    return `Waiting: this sample now costs about ${money(cost.high)}, more than the ${money(job.ackHigh)} you saw. Press Make sample (${money(cost.high)}) to make it.`;
  if (cost.unknown > 0 && !deps.acks.accepted(job.templateId, job.templateVersion))
    return `Waiting: ${String(cost.unknown)} ${cost.unknown === 1 ? "step of this sample has" : "steps of this sample have"} no known price. Press Make sample to accept that and make it.`;
  const room = budgetRoom(deps.db, deps.now, deps.timeZone);
  if (!fitsBudget(room, cost.high, cost.usesPlan))
    return `Waiting: ${budgetWords(room, cost, "this sample")}, or press Make sample tomorrow.`;
  return undefined;
}

// Whether the sample project still has work going: a stage running or waiting, or work admitted
// and not yet finished while nothing failed, was canceled or paused.
export function sampleBusy(db: DatabaseSync, projectId: string): boolean {
  const state = derive(stagesOf(db, projectId), projectPaused(db, projectId));
  if (state === "running") return true;
  if (state === "failed" || state === "canceled" || state === "paused") return false;
  return (
    db
      .prepare(
        "SELECT 1 FROM revision_work WHERE project_id=? AND dispatch_state='allowed' AND state IN ('pending','running') LIMIT 1",
      )
      .get(projectId) !== undefined
  );
}

// Resolves once the project has no work going (`sampleBusy`) and no call in flight.
export async function settled(
  deps: Pick<PaidSampleDeps, "start" | "pollMs">,
  projectId: string,
  signal: AbortSignal,
): Promise<void> {
  while (
    sampleBusy(deps.start.db, projectId) ||
    deps.start.runner.hasInflight?.(projectId) === true
  )
    await sleep(deps.pollMs ?? 2000, undefined, { signal });
}

// Whether a restart stopped the project's run short: a step that was running when Slopify quit
// failed as interrupted, or its admitted work is held until the run is continued.
function stoppedByRestart(db: DatabaseSync, projectId: string): boolean {
  return (
    stagesOf(db, projectId).some(
      (stage) => stage.state === "failed" && stage.failureReason === "interrupted",
    ) ||
    db
      .prepare(
        `SELECT 1 FROM revision_work w WHERE w.project_id=? AND w.dispatch_state='held'
           AND ${pendingAdmitted("w")} LIMIT 1`,
      )
      .get(projectId) !== undefined
  );
}

// What the project's calls billed per use cost since this version's sample started on it.
function spentSince(
  db: DatabaseSync,
  projectId: string,
  version: { readonly updatedAt: string },
): number {
  const row = db
    .prepare(
      "SELECT COALESCE(SUM(cost),0) AS spent FROM provider_usage WHERE project_id=? AND on_plan=0 AND created_at>=?",
    )
    .get(projectId, version.updatedAt);
  return typeof row?.spent === "number" ? row.spent : 0;
}

// What the finished sample says: done, or the failed step's own sentence.
function outcome(db: DatabaseSync, projectId: string): { readonly failed: string | null } {
  const stages = stagesOf(db, projectId);
  const state = derive(stages, projectPaused(db, projectId));
  if (state === "failed") {
    const reason = stages.find((stage) => stage.state === "failed")?.failureReason;
    return {
      failed:
        reason ??
        "A step of the sample failed without saying why. Press Make sample to try again; if it fails again, use Download diagnostics in Settings and report it.",
    };
  }
  if (state === "canceled" || state === "paused")
    return { failed: "The sample stopped before it finished. Press Make sample to make it again." };
  return { failed: null };
}

const refusedSentence: Readonly<Record<string, string>> = {
  conflict:
    "The sample project changed while the sample was being set up. Press Make sample again.",
  "stale-preview":
    "What the sample needed changed while it was being set up. Press Make sample again.",
  readiness:
    "A provider this template uses isn't set up, so the sample can't start. Set it up in Settings → Providers, then press Make sample.",
  "cost-ack-required":
    "Some steps of this sample have no known price. Press Make sample to accept that and make it.",
};

export function refused(reason: string, fields?: readonly { readonly message: string }[]): string {
  const detail = [...new Set((fields ?? []).map((field) => field.message))].join(" ");
  return (
    refusedSentence[reason] ??
    (detail === ""
      ? "Slopify couldn't start the sample. Press Make sample again; if it fails again, use Download diagnostics in Settings and report it."
      : `The sample couldn't start: ${detail}`)
  );
}

export async function makePaidSample(
  deps: PaidSampleDeps,
  job: SampleJob,
  signal: AbortSignal,
): Promise<void> {
  const { db } = deps.start;
  const at = () => deps.start.clock.now().toISOString();
  const template = templateById(db, job.templateId, job.templateVersion);
  if (template === undefined) return;
  const mark = (change: Omit<Parameters<typeof setSampleVersion>[3], "at">) =>
    setSampleVersion(db, job.templateId, job.templateVersion, { ...change, at: at() });
  const record = sampleOf(db, job.templateId);
  const topic = record?.topic ?? defaultSampleTopic(db);
  const topicSource = record?.topicSource ?? "fixed";
  const fullScript = record?.fullScript ?? false;
  const resolved = await resolveSampleRun(
    deps.start,
    sampleDocument(template.document, { topic, fullScript }),
    fullScript,
  );
  if (!resolved.ok) {
    mark({
      state: "failed",
      heldReason: `${resolved.problem} Change it in the studio, then press Save.`,
    });
    return;
  }
  const { run, words } = resolved;
  const hold = (cost: {
    readonly high: number;
    readonly unknown: number;
    readonly usesPlan: boolean;
  }) =>
    holdReason(
      { db, now: deps.start.clock.now(), acks: deps.acks, timeZone: deps.timeZone },
      job,
      cost,
    );

  let projectId =
    record !== undefined && projectExists(db, record.projectId) ? record.projectId : undefined;
  if (projectId !== undefined) {
    // Work the last sample started finishes first: it is never stopped from here.
    await settled(deps, projectId, signal);
    // This version's sample already started on that project (a restart queued its job again):
    // it is continued there, never made again on a new one.
    const head = currentRevisionId(db, projectId);
    const version = sampleVersions(db, job.templateId).find(
      (one) => one.templateVersion === job.templateVersion,
    );
    const stopped = stoppedByRestart(db, projectId);
    if (
      head !== undefined &&
      version?.revisionId === head &&
      (version.state === "making" || stopped)
    ) {
      if (stopped) {
        const usesPlan = totals(
          estimateRun(run.draft, run.rendered, words, deps.start.catalogue).rows,
        ).usesPlan;
        const left = Math.max(0, (version.quotedHigh ?? 0) - spentSince(db, projectId, version));
        const waiting = hold({ high: left, unknown: 0, usesPlan });
        if (waiting !== undefined) {
          mark({ state: "held", heldReason: waiting });
          return;
        }
        const resumed = await recoverProject(deps.rebuild, projectId, {
          baseRevisionId: head,
          idempotencyKey: deps.start.uuid(),
          action: { kind: "resume" },
        });
        if (!resumed.ok) {
          mark({
            state: "failed",
            heldReason: `The sample stopped when Slopify quit, and couldn't go on: ${refused(resumed.reason, resumed.fields)}`,
          });
          return;
        }
        mark({ state: "making", heldReason: null });
      }
      await finish(deps, job, projectId, head, signal);
      return;
    }
  }
  // The sample project a new one replaces. It is removed only once the new one actually
  // starts: a change that waits or can't start keeps the old sample as it was.
  let replaced: { readonly projectId: string; readonly sentence: string } | undefined;
  if (projectId !== undefined && job.kind === "topic") {
    // A new topic is a new video: the sample starts again on a project of its own, so no
    // step keeps the old topic as its subject.
    replaced = {
      projectId,
      sentence:
        "The new topic needs a new sample project, and the old one's files couldn't be removed. Press Make sample again; if it fails again, use Download diagnostics in Settings and report it.",
    };
    projectId = undefined;
  }
  if (projectId !== undefined) {
    const base = getRevisionView(deps.rebuild, projectId, currentRevisionId(db, projectId) ?? "");
    if (base === undefined) projectId = undefined;
    else {
      const saved = await saveRevision(deps.rebuild, {
        projectId,
        baseRevisionId: base.revision.id,
        idempotencyKey: deps.start.uuid(),
        edit: sampleEdit(deps.rebuild, base, run),
      });
      if (!saved.ok && saved.reason === "invalid-edit") {
        // A change the project's editor can't make (a different format, a step switched on
        // that a revision can't add): the sample starts again on a project of its own.
        replaced = {
          projectId,
          sentence:
            "The sample needs a new project, and the old one's files couldn't be removed. Press Make sample again; if it fails again, use Download diagnostics in Settings and report it.",
        };
        projectId = undefined;
      } else if (!saved.ok) {
        mark({ state: "failed", heldReason: refused(saved.reason, saved.fields) });
        return;
      } else {
        const revisionId = saved.view.revision.id;
        const preview = await previewRebuild(deps.rebuild, {
          projectId,
          baseRevisionId: revisionId,
          request: { kind: "allAffected" },
        });
        if (!preview.ok) {
          mark({
            state: "failed",
            revisionId,
            heldReason: refused(preview.reason, preview.fields),
          });
          return;
        }
        const cost = covered(db, job, preview.value.costs);
        const waiting = hold(cost);
        if (waiting !== undefined) {
          mark({ state: "held", revisionId, quotedHigh: cost.high, heldReason: waiting });
          return;
        }
        if (
          !preview.value.work.some(
            (work) => work.disposition === "generate" || work.disposition === "local",
          )
        ) {
          mark({ state: "done", revisionId, heldReason: null });
          return;
        }
        const started = await startRebuild(deps.rebuild, {
          projectId,
          baseRevisionId: revisionId,
          idempotencyKey: deps.start.uuid(),
          previewId: preview.value.id,
          // Accepted on Save: unpriced steps the person's quote covered, or ones they accepted.
          acknowledgeUnknownCosts:
            cost.unknown === 0 || deps.acks.accepted(job.templateId, job.templateVersion),
          confirmedProvidedWorkKeys: preview.value.providedReuseRequired,
        });
        if (!started.ok) {
          mark({
            state: "failed",
            revisionId,
            heldReason: refused(started.reason, started.fields),
          });
          return;
        }
        mark({ state: "making", revisionId, quotedHigh: cost.high, heldReason: null });
        await finish(deps, job, projectId, revisionId, signal);
        return;
      }
    }
  }

  // The template's first sample, or one that needs a project of its own.
  const cost = totals(estimateRun(run.draft, run.rendered, words, deps.start.catalogue).rows);
  const waiting = hold(cost);
  if (waiting !== undefined) {
    mark({ state: "held", quotedHigh: cost.high, heldReason: waiting });
    return;
  }
  // Nothing is spent on a provider that isn't set up: Play's own start checks come first.
  const ready = await checkDraftReadiness(deps.start, [run]);
  const missing = ready.fields;
  if (missing.length > 0) {
    mark({
      state: "failed",
      heldReason: `The sample can't start: ${[...new Set(missing.map((field) => field.message))].join(" ")}`,
    });
    return;
  }
  if (replaced !== undefined && !removeHiddenProject(deps.rebuild, replaced.projectId).ok) {
    mark({ state: "failed", heldReason: replaced.sentence });
    return;
  }
  // The sample's row is written before its project, under the id the project will get, so
  // every file the run writes is in the data dir from the very first one.
  const reserved = deps.start.ids.next();
  let given = false;
  const ids = {
    next: () => {
      if (given) return deps.start.ids.next();
      given = true;
      return reserved;
    },
  };
  const started = transact(db, () => {
    upsertSample(db, job.templateId, {
      projectId: reserved,
      topic,
      topicSource,
      fullScript,
      at: at(),
    });
    const begun = startRun({ ...deps.start, ids }, run.draft, run.rendered, true, run.templates);
    if (begun.project.id !== reserved)
      throw new Error(
        internalError(
          "the sample's project got another id than its row",
          "Press Make sample again",
        ),
      );
    // Paid work is under way on this project from here: a restart continues it as this
    // version's sample (a topic job queued again must not replace it and pay twice).
    continueJobAsSave(db, job.templateId);
    mark({
      state: "making",
      revisionId: currentRevisionId(db, begun.project.id) ?? null,
      quotedHigh: cost.high,
      heldReason: null,
    });
    return begun;
  });
  const newId = started.project.id;
  const revisionId = currentRevisionId(db, newId) ?? null;
  deps.start.runner.tick(newId);
  await finish(deps, job, newId, revisionId, signal);
}

// A step the rebuild can only price once the step before it has answered (the narration of an
// article still to be written) has no price in its preview. The larger of the preview and the
// price on record is held against what the person saw. The unpriced steps stay unpriced: they
// start only once the version is covered (`UnknownAcks`), by the person's acceptance or by a
// quote of theirs that priced them all, never by a price on record alone.
function covered(
  db: DatabaseSync,
  job: SampleJob,
  costs: CostEstimate,
): { readonly high: number; readonly unknown: number; readonly usesPlan: boolean } {
  const usesPlan = costs.rows.some((row) => row.onPlan === true);
  const quoted = sampleVersions(db, job.templateId).find(
    (version) => version.templateVersion === job.templateVersion,
  )?.quotedHigh;
  return {
    high: quoted === null || quoted === undefined ? costs.high : Math.max(costs.high, quoted),
    unknown: costs.unknown,
    usesPlan,
  };
}

async function finish(
  deps: PaidSampleDeps,
  job: SampleJob,
  projectId: string,
  revisionId: string | null,
  signal: AbortSignal,
): Promise<void> {
  await settled(deps, projectId, signal);
  const { failed } = outcome(deps.start.db, projectId);
  setSampleVersion(deps.start.db, job.templateId, job.templateVersion, {
    state: failed === null ? "done" : "failed",
    revisionId,
    heldReason: failed,
    at: deps.start.clock.now().toISOString(),
  });
}
