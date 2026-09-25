import type { StageContext } from "../../kernel/runner/index.js";
import type { RevisionDeps } from "../revisions/model.js";
import { executionPlan, executionView, savedCatalogue } from "./runtime-plan.js";
import type { WorkPiece } from "./work-records.js";

// What a failed step is called on screen, so its error says which image, chunk or topic to
// fix. Worked out only after a failure: numbering a narration chunk means building the plan.
// Undefined for steps that name their own place (captions, export) or have no single one.
export function pieceLabel(
  deps: RevisionDeps,
  context: StageContext,
  piece: Pick<WorkPiece, "key">,
): string | undefined {
  const { key } = piece;
  if (key === "thumbnail:image" || key.startsWith("thumbnail:")) return "Thumbnail";
  if (key === "article:body") return "Article";
  if (key === "entry:intro:text") return "Intro text";
  if (key === "entry:outro:text") return "Outro text";
  if (key === "research:planner") return "Research plan";
  if (key === "research:notes") return "Research notes";
  const topic = /^research:chapter:(\d+)$/.exec(key);
  if (topic !== null) return `Research topic ${topic[1] ?? ""}`;
  const view = () => executionView(deps, context.work.projectId, context.work.revisionId);
  if (key.startsWith("image:")) {
    const at = view()?.revision.content.imageOrder.indexOf(key.slice("image:".length)) ?? -1;
    return at === -1 ? "An image" : `Image ${String(at + 1)}`;
  }
  const narration =
    /^(?:narration:prepare:(?:intro|body|outro):)?audio:(intro|body|outro)(?::(.+))?$/.exec(key);
  if (narration === null) return undefined;
  const segment = narration[1] ?? "body";
  const prefix =
    segment === "body" ? "Narration" : `${segment === "intro" ? "Intro" : "Outro"} narration`;
  if (narration[2] === undefined || narration[2] === "concat" || narration[2] === "future")
    return prefix;
  return narrationChunk(deps, context, segment, key, prefix) ?? prefix;
}

function narrationChunk(
  deps: RevisionDeps,
  context: StageContext,
  segment: string,
  key: string,
  prefix: string,
): string | undefined {
  const row = deps.db
    .prepare("SELECT recipe_context FROM revision_work WHERE id=?")
    .get(context.work.workId);
  const view = executionView(deps, context.work.projectId, context.work.revisionId);
  if (row?.recipe_context === null || row === undefined || view === undefined) return undefined;
  const plan = executionPlan(deps, view, savedCatalogue(row.recipe_context));
  const concat = plan.recipes.find(
    (recipe) => recipe.key === (segment === "body" ? "audio:body:concat" : `audio:${segment}`),
  );
  if (concat === undefined) return undefined;
  // Parts are `<chunk>:<n>`; the chunk is everything before the last colon.
  const chunkOf = (part: string) => part.slice(0, part.lastIndexOf(":"));
  const chunks = [...new Set(concat.dependsOn.map(chunkOf))];
  const preparing = key.startsWith("narration:prepare:");
  const chunk = preparing ? key.slice(key.indexOf("audio:")) : chunkOf(key);
  const at = chunks.indexOf(chunk);
  if (at === -1) return undefined;
  const label = `${prefix} chunk ${String(at + 1)} of ${String(chunks.length)}`;
  if (preparing) return `${label} (preparing its text)`;
  const parts = concat.dependsOn.filter((part) => chunkOf(part) === chunk);
  return parts.length > 1
    ? `${label}, part ${String(parts.indexOf(key) + 1)} of ${String(parts.length)}`
    : label;
}
