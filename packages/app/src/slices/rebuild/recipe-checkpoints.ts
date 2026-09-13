import type { Catalogue } from "../../catalog/schema.js";
import { fingerprint } from "../../kernel/runner/work.js";
import { checkpointClosure, checkpointFingerprint } from "../checkpoints/fingerprint.js";
import { saveCheckpointSet } from "../checkpoints/repo.js";
import type { PlayStartResult, ResolvedPlayRun, ReviewedCheckpoint } from "../play-drafts/model.js";
import type { ProjectRevision, RevisionContent, RevisionDeps } from "../revisions/model.js";
import { currentRevisionId } from "../revisions/repo.js";
import { getRevisionView } from "../revisions/view.js";
import { buildRecipes } from "./recipe-build.js";
import { executionCatalogue, executionPlan } from "./runtime-plan.js";

export function reviewCheckpointSet(
  runs: readonly ResolvedPlayRun[],
  catalogue: Catalogue,
  attachments: readonly { readonly stagedFileId: string; readonly bytes: number }[],
  fontHash: string | null,
): readonly ReviewedCheckpoint[] {
  return runs.flatMap((run, runIndex) => {
    if (!run.draft.checkpoints?.length) return [];
    const config = { ...run.draft, rendered: run.rendered };
    const images: [string, RevisionContent["imageDefinitions"][string]][] =
      config.sources.images === "provide"
        ? (config.provided.images ?? []).map((id) => [
            id,
            { source: "provide", assetId: id, prompt: null, templateKey: null },
          ])
        : config.imagePrompts.flatMap((prompt, index) =>
            Array.from(
              { length: prompt.number },
              (_, number): [string, RevisionContent["imageDefinitions"][string]] => [
                `${index}:${number}`,
                {
                  source: "generate",
                  assetId: null,
                  prompt: run.rendered[`imagePrompts.${index}`] ?? null,
                  templateKey: `imagePrompts.${index}`,
                },
              ],
            ),
          );
    const content: RevisionContent = {
      articleMarkdown: config.sources.article === "provide" ? config.provided.article : undefined,
      provided: { audio: config.provided.audio, thumbnail: config.provided.thumbnail },
      imageOrder: images.map(([key]) => key),
      imageDefinitions: Object.fromEntries(images),
      narrationOverrides: {},
      regenerationTokens: {},
      promptTemplates: run.templates,
    };
    const recipes = buildRecipes({
      config,
      content,
      catalogue,
      manifest: { outputs: [], pieces: [] },
      resolved: {
        articleMarkdown: content.articleMarkdown ?? null,
        researchNotes: config.provided.research ?? null,
      },
    });
    // Project and retained asset IDs do not exist until Start; these are setup identities.
    const revision: ProjectRevision = {
      id: "review",
      projectId: "review",
      parentId: null,
      restoredFromId: null,
      config,
      content,
      fingerprints: Object.fromEntries(recipes.map((recipe) => [recipe.key, recipe.fingerprint])),
      createdAt: "review",
    };
    return (
      config.checkpoints?.map((stage) => {
        const closure = checkpointClosure(stage, recipes);
        const video = closure.some((recipe) => recipe.stage === "video");
        const audio = video || closure.some((recipe) => recipe.stage === "audio");
        const inputs = new Set([
          ...(audio && config.provided.audio ? [config.provided.audio] : []),
          ...(video ? (config.provided.images ?? []) : []),
        ]);
        return {
          runIndex,
          checkpointId: stage,
          stage,
          fingerprint: fingerprint({
            recipes: checkpointFingerprint(revision, closure),
            attachments: attachments.filter((file) => inputs.has(file.stagedFileId)),
            font: video ? fontHash : null,
          }),
          workKeys: closure.map((recipe) => recipe.key),
          dependents: [...new Set(closure.map((recipe) => recipe.stage))].filter(
            (kind) => kind !== stage,
          ),
        };
      }) ?? []
    );
  });
}

export function admitReviewedCheckpoints(
  deps: RevisionDeps,
  projectIds: readonly string[],
  reviewed: readonly ReviewedCheckpoint[],
  catalogue: Catalogue,
): NonNullable<PlayStartResult["checkpointSet"]> {
  return projectIds.flatMap((projectId, runIndex) => {
    const gates = reviewed.filter((gate) => gate.runIndex === runIndex);
    if (!gates.length) return [];
    const revisionId = currentRevisionId(deps.db, projectId);
    const view =
      revisionId === undefined ? undefined : getRevisionView(deps, projectId, revisionId);
    if (!view) throw new Error("Checkpoint admission has no retained revision");
    const plan = executionPlan(deps, view, executionCatalogue(catalogue, view.revision.config));
    const checkpoints = gates.map((gate) => {
      const work = deps.db
        .prepare(
          "SELECT id FROM revision_work WHERE project_id=? AND revision_id=? AND kind=? ORDER BY id LIMIT 1",
        )
        .get(projectId, view.revision.id, gate.stage);
      if (typeof work?.id !== "string") throw new Error("Checkpoint admission has no stage work");
      return {
        checkpointId: gate.checkpointId,
        stage: gate.stage,
        workId: work.id,
        fingerprint: checkpointFingerprint(
          view.revision,
          checkpointClosure(gate.stage, plan.recipes),
        ),
        state: "held" as const,
      };
    });
    const saved = saveCheckpointSet(deps.db, {
      projectId,
      revisionId: view.revision.id,
      checkpoints,
      createdAt: deps.clock.now().toISOString(),
    });
    if (!saved.ok) throw new Error("Checkpoint admission could not persist reviewed gates");
    return saved.value.map((row) => {
      const gate = gates.find((gate) => gate.checkpointId === row.checkpointId);
      if (!gate) throw new Error("Checkpoint admission lost its reviewed identity");
      return { ...row, reviewedFingerprint: gate.fingerprint };
    });
  });
}
