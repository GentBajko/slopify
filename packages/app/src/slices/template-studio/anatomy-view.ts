import type { DatabaseSync } from "node:sqlite";
import type { Log } from "../../kernel/log.js";
import type { Paths } from "../../kernel/paths.js";
import { projectExists } from "../admission/repo.js";
import type { DraftReviewDeps } from "../play-drafts/model.js";
import { templateById } from "../project-templates/repo.js";
import { currentRevisionId } from "../revisions/repo.js";
import { getRevisionView } from "../revisions/view.js";
import { promptAnatomy, type Segment } from "./anatomy.js";
import type { StudioResult, TemplateSection } from "./model.js";
import { resolveSampleRun } from "./quote.js";
import { sampleOf } from "./repo.js";
import { sampleArticleInstruction, sampleDocument } from "./scope.js";
import { defaultSampleTopic } from "./service.js";

// GET /api/template-studio/:id/anatomy: each prompt a section sends, cut into its parts. The
// sample's own sent prompt when it was made from this setup, else the one it would send.

export interface AnatomyItem {
  readonly key: string;
  readonly label: string;
}

export interface AnatomyView {
  readonly section: TemplateSection;
  readonly items: readonly AnatomyItem[];
  readonly item: string | null;
  readonly segments: readonly Segment[];
  // The parts are read from the prompt the sample actually sent.
  readonly fromSample: boolean;
  readonly problem: string | null;
}

// The section a prompt is sent from, by its key in the run's rendered prompts.
export function sectionOfPrompt(key: string): TemplateSection | undefined {
  if (key === "article" || key === "intro" || key === "outro") return "script";
  if (key === "narration") return "voice";
  if (key.startsWith("imagePrompts.") || key === "referencePrompt") return "pictures";
  if (key.startsWith("thumbnail")) return "thumbnail";
  if (key === "description") return "upload";
  if (key === "shorts" || key === "shortsImage") return "shorts";
  if (key.startsWith("review.")) return "reviews";
  return undefined;
}

function labelOf(key: string, names: readonly string[]): string {
  if (key === "article") return "Article prompt";
  if (key === "intro") return "Intro";
  if (key === "outro") return "Outro";
  if (key === "narration") return "Narration prompt";
  if (key === "referencePrompt") return "Establishing image prompt";
  if (key.startsWith("imagePrompts.")) {
    const index = Number(key.slice("imagePrompts.".length));
    return `Image prompt ${names[index] ?? String(index + 1)}`;
  }
  if (key.startsWith("thumbnail")) return "Thumbnail prompt";
  if (key === "description") return "YouTube description prompt";
  if (key === "shorts") return "Shorts prompt";
  if (key === "shortsImage") return "Shorts picture prompt";
  if (key.startsWith("review.")) return `Review prompt (${key.slice("review.".length)})`;
  return key;
}

export interface AnatomyDeps {
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly log: Log;
  readonly review: DraftReviewDeps;
}

export async function getAnatomy(
  deps: AnatomyDeps,
  id: string,
  section: TemplateSection,
  item: string | undefined,
): Promise<StudioResult<AnatomyView>> {
  const template = templateById(deps.db, id);
  if (template === undefined)
    return {
      ok: false,
      reason: "not-found",
      message:
        "This template no longer exists; it may have been deleted. Go to Templates to see your templates.",
    };
  const record = sampleOf(deps.db, id);
  const fullScript = record?.fullScript ?? false;
  const resolved = await resolveSampleRun(
    deps.review,
    sampleDocument(template.document, {
      topic: record?.topic ?? defaultSampleTopic(deps.db),
      fullScript,
    }),
    fullScript,
  );
  const empty = (problem: string | null): StudioResult<AnatomyView> => ({
    ok: true,
    value: { section, items: [], item: null, segments: [], fromSample: false, problem },
  });
  if (!resolved.ok) return empty(resolved.problem);
  const { run } = resolved;
  const names = template.document.form.imagePrompts.map((prompt) => prompt.name);
  const items = Object.keys(run.templates)
    .filter((key) => sectionOfPrompt(key) === section)
    .map((key) => ({ key, label: labelOf(key, names) }));
  const chosen = items.find((one) => one.key === item) ?? items[0];
  if (chosen === undefined) return empty(null);
  const body = run.templates[chosen.key] ?? "";
  // What the sample sent, when its project still runs this very body.
  let sent: string | undefined;
  if (record !== undefined && projectExists(deps.db, record.projectId)) {
    const revisionId = currentRevisionId(deps.db, record.projectId);
    const view =
      revisionId === undefined
        ? undefined
        : getRevisionView(
            {
              db: deps.db,
              paths: deps.paths,
              log: deps.log,
              ids: { next: () => "" },
              clock: { now: () => new Date(), sleep: async () => undefined },
            },
            record.projectId,
            revisionId,
          );
    if (view?.revision.content.promptTemplates[chosen.key] === body)
      sent = view.revision.config.rendered[chosen.key];
  }
  return {
    ok: true,
    value: {
      section,
      items,
      item: chosen.key,
      segments: promptAnatomy({
        body,
        sent: sent ?? run.rendered[chosen.key],
        values: run.draft.values,
        appended:
          chosen.key === "article" && !fullScript
            ? [{ text: sampleArticleInstruction, by: "slopify" }]
            : [],
      }),
      fromSample: sent !== undefined,
      problem: null,
    },
  };
}
