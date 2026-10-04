import type { ProjectListing } from "@app/slices/admission/model.js";
import type { RebuildPreview } from "@app/slices/rebuild/model.js";
import type { Api } from "@/api";
import { usd } from "@/lib/format";
import { startsWithoutReview } from "@/project/rebuild-consent";
import { named } from "@/project/rebuild-scope";
import { workLabels } from "@/project/rebuild-work-names";
import {
  prepareRevision,
  previewProjectRebuild,
  startProjectRebuild,
} from "@/project/revision-api";

// Remake outdated for several projects: each selected project gets the same preview a single
// project's Choose what to remake asks for (every outdated output), and each start goes to the
// same idempotent endpoint with that preview. Projects that cannot be remade from a list say
// why and are left out; nothing starts before the combined review, unless every one of them
// is free work on this computer (the single-project rule, startsWithoutReview).

export interface RemakePlan {
  readonly project: ProjectListing;
  readonly preview: RebuildPreview;
  // Kept for the review's life, so pressing again after a failure replays, never doubles.
  readonly idempotencyKey: string;
}

export interface RemakeSkip {
  readonly project: ProjectListing;
  readonly reason: string;
}

export interface RemakePlans {
  readonly plans: readonly RemakePlan[];
  readonly skipped: readonly RemakeSkip[];
}

export interface RemakeFailure {
  readonly plan: RemakePlan;
  readonly reason: string;
}

const making = (preview: RebuildPreview) =>
  preview.work.filter(
    (work) =>
      work.disposition === "generate" ||
      work.disposition === "local" ||
      work.disposition === "review",
  );

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function planOne(
  api: Api,
  project: ProjectListing,
  sample: boolean,
  newKey: () => string,
): Promise<RemakePlan | RemakeSkip> {
  if (project.status === "running")
    return { project, reason: "It is running now. Remake it once the run has finished." };
  if (sample)
    return { project, reason: "It is a sample project, which stays as it came with Slopify." };
  try {
    const base = await prepareRevision(api, project.id);
    if (!base.ok) return { project, reason: `It couldn't be checked: ${base.message}` };
    const answer = await previewProjectRebuild(api, project.id, {
      baseRevisionId: base.value.view.revision.id,
      request: { kind: "allAffected" },
    });
    if (!answer.ok) return { project, reason: `It couldn't be checked: ${answer.message}` };
    const preview = answer.value.value;
    if (making(preview).length === 0)
      return { project, reason: "Nothing in it is outdated, so there is nothing to remake." };
    const blocked = preview.work.find((work) => work.disposition === "blocked");
    if (blocked !== undefined)
      return {
        project,
        reason: `${workLabels(preview)(blocked.key)} can't run: ${blocked.reason.trim() || "no reason was given."} Open the project and press Choose what to remake to see what to fix.`,
      };
    if (preview.providedReuseRequired.length > 0)
      return {
        project,
        reason:
          "It uses content you supplied, which you confirm on the project itself: open it and press Choose what to remake.",
      };
    return { project, preview, idempotencyKey: newKey() };
  } catch (error) {
    return {
      project,
      reason: `It couldn't be checked: ${message(error)} Press Remake outdated again.`,
    };
  }
}

export async function planRemakes(
  api: Api,
  projects: readonly ProjectListing[],
  samples: ReadonlySet<string>,
  newKey: () => string = () => crypto.randomUUID(),
): Promise<RemakePlans> {
  const answers = await Promise.all(
    projects.map((project) => planOne(api, project, samples.has(project.id), newKey)),
  );
  return {
    plans: answers.filter((one): one is RemakePlan => "preview" in one),
    skipped: answers.filter((one): one is RemakeSkip => !("preview" in one)),
  };
}

// Started straight from the button only when there is nothing to tell: nothing left out and
// every remake free, on this computer.
export function startsAtOnce({ plans, skipped }: RemakePlans): boolean {
  return (
    plans.length > 0 &&
    skipped.length === 0 &&
    plans.every((plan) => startsWithoutReview(plan.preview))
  );
}

// One after the other, each on its own: one refusal leaves the others started.
export async function startRemakes(
  api: Api,
  plans: readonly RemakePlan[],
  acknowledgeUnknownCosts: boolean,
): Promise<{ readonly started: readonly RemakePlan[]; readonly failed: readonly RemakeFailure[] }> {
  const started: RemakePlan[] = [];
  const failed: RemakeFailure[] = [];
  for (const plan of plans) {
    try {
      const answer = await startProjectRebuild(api, plan.project.id, {
        baseRevisionId: plan.preview.baseRevisionId,
        previewId: plan.preview.id,
        idempotencyKey: plan.idempotencyKey,
        acknowledgeUnknownCosts: acknowledgeUnknownCosts && plan.preview.costs.unknown > 0,
        confirmedProvidedWorkKeys: [],
      });
      if (answer.ok) started.push(plan);
      else
        failed.push({
          plan,
          reason:
            answer.reason === "stale-preview" || answer.reason === "conflict"
              ? "It changed since this review was opened. Close the review and press Remake outdated again."
              : `${answer.message}`,
        });
    } catch (error) {
      failed.push({ plan, reason: `${message(error)} Press Try again.` });
    }
  }
  return { started, failed };
}

// "Made again: 12 narration requests, Video export." and "Then rebuilt on this computer, free: …".
export function scopeLines(preview: RebuildPreview): readonly string[] {
  const label = workLabels(preview);
  const of = (disposition: RebuildPreview["work"][number]["disposition"]) =>
    preview.work.filter((work) => work.disposition === disposition).map((work) => work.key);
  const made = [...of("generate"), ...of("review")];
  const local = of("local");
  return [
    made.length === 0 ? undefined : `Made again: ${named(made, label)}.`,
    local.length === 0
      ? undefined
      : `${made.length === 0 ? "Rebuilt" : "Then rebuilt"} on this computer, free: ${named(local, label)}.`,
  ].filter((line): line is string => line !== undefined);
}

const range = (low: number, high: number) => (low === high ? usd(low) : `${usd(low)}–${usd(high)}`);

// What one remake, or all of them, is estimated to cost, in words.
export function costWords(costs: readonly RebuildPreview["costs"][]): string {
  const low = costs.reduce((sum, one) => sum + one.low, 0);
  const high = costs.reduce((sum, one) => sum + one.high, 0);
  const unknown = costs.reduce((sum, one) => sum + one.unknown, 0);
  const onPlan = costs.some((one) => one.rows.some((row) => row.onPlan === true));
  const known =
    high === 0 ? (onPlan ? "$0 on your plan" : "No charge") : `About ${range(low, high)}`;
  return unknown === 0
    ? known
    : `${known}, plus ${String(unknown)} unknown ${unknown === 1 ? "estimate" : "estimates"}`;
}
