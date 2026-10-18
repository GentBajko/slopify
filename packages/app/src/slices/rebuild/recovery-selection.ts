import type { StageKind } from "../../kernel/pipeline.js";
import { readmitted, type StageStanding } from "../../kernel/runner/graph.js";
import { narrationRegenerationKey } from "../narration/plan.js";
import { promiseItemKey } from "../reviews/model.js";
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
          (row.key.startsWith("export:") ||
            row.key === "subtitles:files" ||
            row.key === "voices:files")
        );
      if (stage === "audio")
        return (
          row.input.kind === "tts" ||
          (row.input.kind === "deferred" &&
            ["body-narration", "intro-narration", "outro-narration"].includes(row.input.operation))
        );
      if (stage === "article")
        return (
          (row.key === "article:body" || row.key === "script:attribute") && row.kind === "provider"
        );
      if (stage === "document") return row.key === "document:pdf";
      return row.kind === "provider";
    })
    .map((row) => row.key);
}

// What making one reviewed item again regenerates and where its rebuild starts. The article
// and the narration are redone like More → make it again in its section on their stage; an image or the thumbnail
// by its own token, like Regenerate; a short by "Make this short again"'s token.
export function redoTarget(
  view: RevisionView,
  plan: RevisionWorkPlan,
  item: string,
): { readonly roots: readonly string[]; readonly edit: RevisionEdit } | undefined {
  const section = (stage: StageKind) => {
    const edit = regenerationEdit(view, plan, stage);
    return edit === undefined ? undefined : { roots: sectionRoots(view, plan, stage), edit };
  };
  if (item === "narration") return section("audio");
  // The promise check sends the article back: its opening is what broke the promise.
  if (item === "article:body" || item === promiseItemKey) return section("article");
  const own = (roots: readonly string[]) => ({
    roots,
    edit: { config: view.revision.config, content: view.revision.content, regenerate: [item] },
  });
  if (/^shorts:\d+$/.test(item))
    return plan.recipes.some((row) => row.key === `${item}:prompts`)
      ? own([`${item}:prompts`])
      : undefined;
  // One narration chunk, by the key the Narration editor regenerates it by: its TTS requests
  // are the roots (`narration-retry.ts`).
  const chunk = plan.recipes
    .filter((row) => row.input.kind === "tts" && row.input.logicalKey === item)
    .map((row) => row.key);
  if (chunk.length > 0) return own(chunk);
  return plan.recipes.some((row) => row.key === item && row.kind === "provider")
    ? own([item])
    : undefined;
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

export function recoverySelection(plan: RevisionWorkPlan, stage: StageKind): RebuildSelection {
  return { kind: "selected", workKeys: stageWork(plan, stage) };
}

// Continue the run (or Resume): everything left to make, except after a Cancel, when only the
// stages the person took up again (`readmitted`: Try again, or Continue on the canceled run) go
// on, each as Try again would; the stages they canceled stay canceled.
export function resumeSelection(
  plan: RevisionWorkPlan,
  stages: readonly StageStanding[],
): RebuildSelection {
  const taken = stages.filter((stage) => readmitted(stage, stages));
  if (taken.length === 0) return { kind: "allAffected" };
  return { kind: "selected", workKeys: taken.flatMap((stage) => stageWork(plan, stage.kind)) };
}

// A stage's work left to make, or all of it when every piece would be reused.
function stageWork(plan: RevisionWorkPlan, stage: StageKind): readonly string[] {
  const roots = plan.work
    .filter((row) => row.stage === stage && row.disposition !== "reuse")
    .map((row) => row.key);
  return roots.length === 0
    ? plan.work.filter((row) => row.stage === stage).map((row) => row.key)
    : roots;
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
