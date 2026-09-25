import type { StageKind } from "../../kernel/pipeline.js";
import { narrationRegenerationKey } from "../narration/plan.js";
import type { RevisionEdit, RevisionView } from "../revisions/model.js";
import type { RebuildSelection } from "./model.js";
import type { ResolvedWorkRecipe } from "./recipe-model.js";
import type { RevisionWorkPlan } from "./recipe-work.js";

export function sectionRoots(
  view: RevisionView,
  plan: RevisionWorkPlan,
  stage: StageKind,
): readonly string[] {
  if (
    stage === "article" &&
    (view.revision.config.sources.article !== "generate" || view.revision.content.articleEdited)
  )
    return [];
  return plan.recipes
    .filter((row) => {
      if (row.stage !== stage || row.kind === "provided") return false;
      if (stage === "video")
        return (
          row.input.kind === "local" &&
          (row.key.startsWith("export:") || row.key === "subtitles:files")
        );
      if (stage === "audio")
        return (
          row.input.kind === "tts" ||
          (row.input.kind === "deferred" &&
            ["body-narration", "intro-narration", "outro-narration"].includes(row.input.operation))
        );
      if (stage === "article") return row.key === "article:body" && row.kind === "provider";
      return row.kind === "provider";
    })
    .map((row) => row.key);
}

export function dependentClosure(
  recipes: readonly ResolvedWorkRecipe[],
  roots: readonly string[],
): readonly string[] {
  const selected = new Set(roots);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of recipes)
      if (!selected.has(row.key) && row.dependsOn.some((key) => selected.has(key))) {
        selected.add(row.key);
        changed = true;
      }
  }
  return recipes.filter((row) => selected.has(row.key)).map((row) => row.key);
}

export function recoverySelection(plan: RevisionWorkPlan, stage?: StageKind): RebuildSelection {
  if (stage === undefined) return { kind: "allAffected" };
  const roots = plan.work
    .filter((row) => row.stage === stage && row.disposition !== "reuse")
    .map((row) => row.key);
  const unfinished =
    roots.length === 0
      ? plan.work.filter((row) => row.stage === stage).map((row) => row.key)
      : roots;
  return { kind: "selected", workKeys: unfinished };
}

export function regenerationEdit(
  view: RevisionView,
  plan: RevisionWorkPlan,
  stage: StageKind,
): RevisionEdit | undefined {
  const roots = sectionRoots(view, plan, stage);
  if (roots.length === 0) return undefined;
  const regenerate =
    stage === "research"
      ? ["research:all"]
      : [
          ...new Set(
            roots.map((key) => {
              const row = plan.recipes.find((recipe) => recipe.key === key);
              return row?.input.kind === "tts"
                ? row.input.logicalKey
                : narrationRegenerationKey(key);
            }),
          ),
        ];
  for (const root of roots.filter((key) => key.startsWith("audio:") && key.endsWith(":future"))) {
    const segment = root.slice(0, -7);
    for (const key of Object.keys(view.revision.content.regenerationTokens))
      if ((key === segment || key.startsWith(`${segment}:`)) && !regenerate.includes(key))
        regenerate.push(key);
  }
  return { config: view.revision.config, content: view.revision.content, regenerate };
}
