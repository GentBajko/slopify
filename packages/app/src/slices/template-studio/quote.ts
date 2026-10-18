import type { DatabaseSync } from "node:sqlite";
import type { Clock } from "../../kernel/clock.js";
import { projectExists } from "../admission/repo.js";
import { type CostRow, estimateRun } from "../estimate/index.js";
import type { DraftReviewDeps, DraftView, ResolvedPlayRun } from "../play-drafts/model.js";
import { resolvePlayReview } from "../play-drafts/review.js";
import type { PlayDraftDocument } from "../play-drafts/schema.js";
import { templateById } from "../project-templates/repo.js";
import { type BudgetRoom, budgetRoom, fitsBudget } from "./budget.js";
import type { StudioResult, TemplateSection } from "./model.js";
import { sampleOf } from "./repo.js";
import { sampleDocument } from "./scope.js";
import { affectedSections } from "./sections.js";
import { defaultSampleTopic } from "./service.js";

// What a Save's sample costs, before anything is spent: Play's own estimate of the sample's run,
// limited to the sections the change outdates once a sample exists. "About": the rebuild that
// makes it prices its real work again, and waits when that comes out higher.

export interface SampleQuote {
  readonly version: number;
  // The first sample of a template makes every section.
  readonly first: boolean;
  readonly sections: readonly TemplateSection[];
  readonly rows: readonly CostRow[];
  readonly low: number;
  readonly high: number;
  // Rows with no known price, counted rather than read as free.
  readonly unknown: number;
  // Every priced row runs on a CLI plan: the Save costs plan usage, no money.
  readonly onPlan: boolean;
  // Some step runs on a CLI plan, which samples may use only when the person allows it.
  readonly usesPlan: boolean;
  readonly budget: BudgetRoom;
  readonly fits: boolean;
  // Why no sample can be made of this setup (Play's review refused it), or null.
  readonly problem: string | null;
}

export interface QuoteDeps {
  readonly db: DatabaseSync;
  readonly clock: Clock;
  readonly review: DraftReviewDeps;
  readonly timeZone?: string | undefined;
}

// The sample's single run as Play's review resolves it, on a draft that is never saved.
export async function resolveSampleRun(
  review: DraftReviewDeps,
  document: PlayDraftDocument,
  fullScript: boolean,
): Promise<
  | { readonly ok: true; readonly run: ResolvedPlayRun; readonly words: number }
  | { readonly ok: false; readonly problem: string }
> {
  const at = review.clock.now().toISOString();
  const view: DraftView = {
    draft: { id: review.uuid(), version: 1, createdAt: at, updatedAt: at, document },
    attachments: [],
    review: null,
    pendingStart: null,
    start: null,
  };
  const resolved = await resolvePlayReview(review, view, { unsaved: true });
  if (!resolved.ok)
    return {
      ok: false,
      problem:
        resolved.fields.length === 0
          ? "Play's review refused this setup, so no sample can be made. Open the template in Play (Use in Play) to see why."
          : `No sample can be made of this setup: ${[...new Set(resolved.fields.map(fieldSentence))].join(" ")}`,
    };
  const run = resolved.value.runs[0];
  if (run === undefined)
    return {
      ok: false,
      problem: "Play's review found no video to make, so no sample can be made.",
    };
  return {
    ok: true,
    run: { ...run, draft: { ...run.draft, sample: { fullScript } } },
    words: Number(document.expectedWords) || 1500,
  };
}

// A refused field in the studio's words: an empty keyword is named, with where it is filled.
export function fieldSentence(field: { readonly field: string; readonly message: string }): string {
  if (field.field.startsWith("values."))
    return `The keyword {{${field.field.slice("values.".length)}}} is empty. Fill it in Subject & research.`;
  return field.message;
}

const sectionOfRow: Readonly<Record<string, TemplateSection>> = {
  Research: "subject",
  Article: "script",
  "Intro / outro text": "script",
  "Narration descriptions": "voice",
  "Narration Preparation": "voice",
  "Delivery cue overhead": "voice",
  Narration: "voice",
  "Speaker split": "voice",
  "Conversation script": "voice",
  Images: "pictures",
  "Image scenes": "pictures",
  "Establishing image": "pictures",
  Thumbnail: "thumbnail",
  "Thumbnail prompt": "thumbnail",
  "Export / subtitles": "video",
  "Animated images": "video",
  "YouTube description": "upload",
  Posts: "upload",
  Shorts: "shorts",
  Reviews: "reviews",
  Document: "document",
};

export function totals(
  rows: readonly CostRow[],
): Pick<SampleQuote, "low" | "high" | "unknown" | "onPlan" | "usesPlan"> {
  const priced = rows.filter((row) => row.high !== null && row.high > 0);
  return {
    low: rows.reduce((sum, row) => sum + (row.low ?? 0), 0),
    high: rows.reduce((sum, row) => sum + (row.high ?? 0), 0),
    unknown: rows.filter((row) => row.high === null).length,
    onPlan: rows.some((row) => row.onPlan === true) && priced.every((row) => row.onPlan === true),
    usesPlan: rows.some((row) => row.onPlan === true),
  };
}

export async function quoteSave(
  deps: QuoteDeps,
  templateId: string,
  document: PlayDraftDocument,
): Promise<StudioResult<SampleQuote>> {
  return quoteSample(deps, templateId, { document });
}

// What a sample costs: of a Save (`document`, the sections it outdates), of a new topic (every
// section) or of the full script switched (the script and what follows it).
export async function quoteSample(
  deps: QuoteDeps,
  templateId: string,
  ask: {
    readonly document?: PlayDraftDocument | undefined;
    readonly topic?: string | undefined;
    readonly fullScript?: boolean | undefined;
    readonly sections?: readonly TemplateSection[] | "all" | undefined;
  },
): Promise<StudioResult<SampleQuote>> {
  const template = templateById(deps.db, templateId);
  if (template === undefined)
    return {
      ok: false,
      reason: "not-found",
      message:
        "This template no longer exists; it may have been deleted. Go to Library → Templates to see your templates.",
    };
  const document = ask.document ?? template.document;
  const sample = sampleOf(deps.db, templateId);
  const fullScript = ask.fullScript ?? sample?.fullScript ?? false;
  const scoped = sampleDocument(document, {
    topic: ask.topic ?? sample?.topic ?? defaultSampleTopic(deps.db),
    fullScript,
  });
  const budget = budgetRoom(deps.db, deps.clock.now(), deps.timeZone);
  const first =
    ask.sections === "all" || sample === undefined || !projectExists(deps.db, sample.projectId);
  const sections = first
    ? ([] as TemplateSection[])
    : Array.isArray(ask.sections)
      ? ask.sections
      : affectedSections(template.document, document).filter((section) => section !== "schedule");
  const resolved = await resolveSampleRun(deps.review, scoped, fullScript);
  if (!resolved.ok)
    return {
      ok: true,
      value: {
        version: template.version,
        first,
        sections,
        rows: [],
        low: 0,
        high: 0,
        unknown: 0,
        onPlan: false,
        usesPlan: false,
        budget,
        fits: false,
        problem: resolved.problem,
      },
    };
  const estimate = estimateRun(
    resolved.run.draft,
    resolved.run.rendered,
    resolved.words,
    deps.review.catalogue,
  );
  const wanted = new Set(sections);
  const rows = first
    ? estimate.rows
    : estimate.rows.filter((row) => {
        const section = sectionOfRow[row.stage];
        // A row the studio can't place is counted: a quote may be high, never low.
        return section === undefined || wanted.has(section);
      });
  const sum = totals(rows);
  return {
    ok: true,
    value: {
      version: template.version,
      first,
      sections,
      rows,
      ...sum,
      budget,
      fits: fitsBudget(budget, sum.high, sum.usesPlan),
      problem: null,
    },
  };
}
