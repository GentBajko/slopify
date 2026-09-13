import type { Catalogue } from "../../catalog/schema.js";
import { fingerprint } from "../../kernel/runner/work.js";
import { checkpointClosure, checkpointFingerprint } from "../checkpoints/fingerprint.js";
import type { ResolvedPlayRun, ReviewedCheckpoint } from "../play-drafts/model.js";
import type { ProjectRevision, RevisionContent } from "../revisions/model.js";
import { buildRecipes } from "./recipe-build.js";

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
