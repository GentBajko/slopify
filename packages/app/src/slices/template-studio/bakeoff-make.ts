import { internalError } from "../../kernel/errors.js";
import { derive } from "../../kernel/runner/graph.js";
import { projectExists, projectPaused, stagesOf } from "../admission/repo.js";
import { copyProject } from "../onboarding/copy.js";
import { templateById } from "../project-templates/repo.js";
import { previewRebuild, startRebuild } from "../rebuild/service.js";
import { saveRevision } from "../revisions/mutations.js";
import { currentRevisionId } from "../revisions/repo.js";
import { getRevisionView } from "../revisions/view.js";
import { withModel } from "./bakeoff.js";
import {
  type BakeoffRow,
  bakeoffOf,
  type CloneRow,
  clonesOf,
  setBakeoff,
  setClone,
} from "./bakeoff-repo.js";
import { budgetRoom, budgetWords, fitsBudget } from "./budget.js";
import { sampleEdit } from "./edit.js";
import { removeHiddenProject } from "./hidden.js";
import type { SampleJob } from "./jobs.js";
import { sectionLabel } from "./model.js";
import { type PaidSampleDeps, refused, settled, studioWords } from "./paid.js";
import { resolveSampleRun } from "./quote.js";
import { sampleOf } from "./repo.js";
import { exceedsAcknowledged } from "./save.js";
import { sampleDocument } from "./scope.js";
import { sectionOfWork } from "./sections.js";

// The bake-off job (`kind: "bakeoff"`), made by the studio's one sample loop: a copy of the
// sample per model, the model switched on it, and only the section's own work started on each.
// Every copy is priced before any starts; a total above what the person saw, an unknown price
// they didn't accept, or one past today's budget makes the bake-off wait, spending nothing, and
// its copies are removed. Work already going is never stopped.

type Deps = Pick<PaidSampleDeps, "start" | "rebuild" | "timeZone" | "pollMs">;

const money = (value: number) => `$${value.toFixed(2)}`;

interface Prepared {
  readonly clone: CloneRow;
  readonly projectId: string;
  readonly revisionId: string;
  readonly previewId: string;
  readonly high: number;
  readonly unknown: number;
  readonly usesPlan: boolean;
  readonly provided: readonly string[];
}

export async function makeBakeoff(deps: Deps, job: SampleJob, signal: AbortSignal): Promise<void> {
  const { db } = deps.start;
  const at = () => deps.start.clock.now().toISOString();
  const row = bakeoffOf(db, job.templateId);
  if (row === undefined || (row.state !== "queued" && row.state !== "making")) return;
  const stop = (state: "failed" | "held", sentence: string) =>
    setBakeoff(db, row.id, state, sentence, at());
  const template = templateById(db, row.templateId);
  if (template === undefined) return;
  if (template.version !== row.templateVersion) {
    stop(
      "failed",
      "The template was saved again since the bake-off was priced, so it wasn't made and nothing was spent. Compare again on the new version.",
    );
    return;
  }
  const sample = sampleOf(db, row.templateId);
  if (sample === undefined || !projectExists(db, sample.projectId)) {
    stop(
      "failed",
      "The template's sample is gone, so there is nothing to compare on. Press Make sample, then compare again.",
    );
    return;
  }
  // The copies are taken once the sample's own work has finished.
  await settled(deps, sample.projectId, signal);
  setBakeoff(db, row.id, "making", null, at());

  const clones = clonesOf(db, row.id);
  const prepared: Prepared[] = [];
  for (const clone of clones) {
    if (signal.aborted) return;
    if (clone.state === "making" || clone.state === "done" || clone.state === "failed") continue;
    const ready = await prepare(deps, row, clone, sample, signal);
    if (typeof ready === "string") {
      setClone(db, row.id, clone.slot, { state: "failed", failure: ready, finishedAt: at() });
      continue;
    }
    prepared.push(ready);
  }

  // The whole bake-off is held against what the person accepted, before anything starts.
  if (prepared.length > 0) {
    const high = prepared.reduce(
      (sum, one) => sum + Math.max(one.high, one.clone.quotedHigh ?? 0),
      0,
    );
    const unknown = prepared.reduce((sum, one) => sum + one.unknown, 0);
    const usesPlan = prepared.some((one) => one.usesPlan);
    const room = budgetRoom(db, deps.start.clock.now(), deps.timeZone);
    const waiting = exceedsAcknowledged(high, row.ackHigh)
      ? `Waiting: comparing now costs about ${money(high)}, more than the ${money(row.ackHigh)} you saw. Press Compare again to accept the new price.`
      : unknown > 0 && !row.ackUnknown
        ? `Waiting: ${String(unknown)} ${unknown === 1 ? "step has" : "steps have"} no known price. Press Compare again to accept that.`
        : !fitsBudget(room, high, usesPlan)
          ? `Waiting: ${budgetWords(room, { high, usesPlan }, "comparing")}, or compare tomorrow.`
          : undefined;
    if (waiting !== undefined) {
      for (const one of prepared) {
        // A copy that stays keeps its row, so it stays hidden and Discard removes it later.
        if (removeHiddenProject(deps.rebuild, one.projectId).ok)
          setClone(db, row.id, one.clone.slot, { state: "queued", projectId: null });
        else
          setClone(db, row.id, one.clone.slot, {
            state: "failed",
            failure:
              "This model's copy couldn't be removed while the bake-off waited, because its files are busy or in use. Press Discard in the bake-off once nothing uses Slopify's files, then Compare again.",
            finishedAt: at(),
          });
      }
      stop("held", waiting);
      return;
    }
  }

  for (const one of prepared) {
    if (signal.aborted) return;
    const started = await startRebuild(deps.rebuild, {
      projectId: one.projectId,
      baseRevisionId: one.revisionId,
      idempotencyKey: deps.start.uuid(),
      previewId: one.previewId,
      acknowledgeUnknownCosts: one.unknown === 0 || row.ackUnknown,
      confirmedProvidedWorkKeys: one.provided,
    });
    if (!started.ok) {
      setClone(db, row.id, one.clone.slot, {
        state: "failed",
        failure: refused(started.reason, started.fields),
        finishedAt: at(),
      });
      continue;
    }
    setClone(db, row.id, one.clone.slot, { state: "making", startedAt: at() });
  }

  // Each copy finishes on its own; the slower ones are waited for in turn.
  for (const clone of clonesOf(db, row.id)) {
    if (clone.state !== "making" || clone.projectId === null) continue;
    await settled(deps, clone.projectId, signal);
    const failure = failureOf(deps, clone.projectId);
    setClone(db, row.id, clone.slot, {
      state: failure === null ? "done" : "failed",
      failure,
      finishedAt: at(),
    });
  }
  const finished = clonesOf(db, row.id);
  setBakeoff(
    db,
    row.id,
    finished.some((clone) => clone.state === "done") ? "done" : "failed",
    finished.some((clone) => clone.state === "done")
      ? null
      : "No other model could make the sample: each one says why. Fix it, or pick other models, and compare again.",
    at(),
  );
}

// A copy of the sample with the model switched, priced for the section's own work. A string
// says why this model can't be compared.
async function prepare(
  deps: Deps,
  row: BakeoffRow,
  clone: CloneRow,
  sample: { readonly projectId: string; readonly topic: string; readonly fullScript: boolean },
  signal: AbortSignal,
): Promise<Prepared | string> {
  const { db } = deps.start;
  const template = templateById(db, row.templateId, row.templateVersion);
  if (template === undefined) return "The template's version is gone.";
  const catalogue = deps.rebuild.catalogue.read();
  const document = withModel(template.document, row.section, clone, catalogue);
  const resolved = await resolveSampleRun(
    deps.start,
    sampleDocument(document, { topic: sample.topic, fullScript: sample.fullScript }),
    sample.fullScript,
  );
  if (!resolved.ok) return resolved.problem;
  if (signal.aborted) return "Slopify stopped before this model's copy was made.";
  let projectId = clone.projectId;
  if (projectId === null || !projectExists(db, projectId)) {
    // The copy's row names its project before the project exists, so it is hidden, and its
    // folder kept in the data dir, from its very first file.
    const reserved = deps.start.ids.next();
    let given = false;
    const ids = {
      next: () => {
        if (given) return deps.start.ids.next();
        given = true;
        return reserved;
      },
    };
    setClone(db, row.id, clone.slot, { projectId: reserved });
    try {
      const copied = copyProject(
        { ...deps.rebuild, ids, catalogue },
        sample.projectId,
        `Bake-off: ${clone.model}`,
      );
      if (copied.projectId !== reserved)
        throw new Error(
          internalError("the bake-off copy got another id than its row", "Compare again"),
        );
    } catch (error) {
      setClone(db, row.id, clone.slot, { projectId: null });
      return `The sample couldn't be copied for ${clone.model}: ${error instanceof Error ? error.message : String(error)}`;
    }
    projectId = reserved;
    // The copy's own spending only: the sample's calls it was copied with are the sample's.
    db.prepare("DELETE FROM provider_usage WHERE project_id=?").run(projectId);
    db.prepare("DELETE FROM plan_limit_readings WHERE project_id=?").run(projectId);
  }
  const base = getRevisionView(deps.rebuild, projectId, currentRevisionId(db, projectId) ?? "");
  if (base === undefined) return "The copy of the sample has no version to change.";
  const saved = await saveRevision(deps.rebuild, {
    projectId,
    baseRevisionId: base.revision.id,
    idempotencyKey: deps.start.uuid(),
    edit: sampleEdit(deps.rebuild, base, resolved.run),
  });
  if (!saved.ok) return refused(saved.reason, saved.fields);
  const revisionId = saved.view.revision.id;
  const all = await previewRebuild(deps.rebuild, {
    projectId,
    baseRevisionId: revisionId,
    request: { kind: "allAffected" },
  });
  if (!all.ok) return refused(all.reason, all.fields);
  const keys = all.value.work
    .filter(
      (work) =>
        (work.disposition === "generate" || work.disposition === "local") &&
        sectionOfWork(work.key) === row.section,
    )
    .map((work) => work.key);
  if (keys.length === 0)
    return `Nothing in ${sectionLabel[row.section]} changes with ${clone.model}, so there is nothing to compare.`;
  const preview = await previewRebuild(deps.rebuild, {
    projectId,
    baseRevisionId: revisionId,
    request: { kind: "selected", workKeys: keys },
  });
  if (!preview.ok) return refused(preview.reason, preview.fields);
  return {
    clone,
    projectId,
    revisionId,
    previewId: preview.value.id,
    high: preview.value.costs.high,
    unknown: preview.value.costs.unknown,
    usesPlan: preview.value.costs.rows.some((one) => one.onPlan === true),
    provided: preview.value.providedReuseRequired,
  };
}

// The failed step's own sentence, or null when the copy's work finished.
function failureOf(deps: Deps, projectId: string): string | null {
  const stages = stagesOf(deps.start.db, projectId);
  const state = derive(stages, projectPaused(deps.start.db, projectId));
  if (state === "failed") {
    const reason = stages.find((stage) => stage.state === "failed")?.failureReason;
    return reason === undefined || reason === null
      ? "A step of this model's copy failed without saying why. Compare again; if it fails again, use Download diagnostics in Settings and report it."
      : studioWords(reason, "Compare again", "");
  }
  if (state === "canceled" || state === "paused")
    return "This model's copy stopped before it finished. Compare again to make it.";
  return null;
}
