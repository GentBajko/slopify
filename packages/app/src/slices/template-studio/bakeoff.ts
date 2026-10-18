import { z } from "zod";
import type { Catalogue } from "../../catalog/schema.js";
import { transact } from "../../kernel/db/tx.js";
import type { Log } from "../../kernel/log.js";
import type { Paths } from "../../kernel/paths.js";
import type { StageKind } from "../../kernel/pipeline.js";
import { projectExists } from "../admission/repo.js";
import { keepThinking } from "../model-upkeep/switch.js";
import type { PlayDraftDocument } from "../play-drafts/schema.js";
import { templateById } from "../project-templates/repo.js";
import { currentRevisionId } from "../revisions/repo.js";
import { getRevisionView } from "../revisions/view.js";
import { runCostOf } from "../run-cost/panel.js";
import {
  type BakeoffRow,
  type BakeoffSection,
  bakeoffOf,
  bakeoffSections,
  type CloneState,
  clonesOf,
  deleteBakeoffRow,
  insertBakeoff,
} from "./bakeoff-repo.js";
import { type BudgetRoom, budgetRoom, budgetWords, fitsBudget } from "./budget.js";
import { removeHiddenProject } from "./hidden.js";
import { enqueueJob, queuedJob, runningJob } from "./jobs.js";
import { type StudioRefusal, type StudioResult, sectionLabel } from "./model.js";
import { type QuoteDeps, quoteSample } from "./quote.js";
import { sampleOf, sampleVersions } from "./repo.js";
import { exceedsAcknowledged } from "./save.js";
import { sectionOfWork } from "./sections.js";

// Compare models: one section's sample made again on one or two other models, each on a hidden
// copy of the template's sample (`onboarding/copy.ts`), so its cost and speed sit beside the
// model the template uses now. Only that section's work runs on each copy. Nothing about the
// template changes: "Use this model" is a normal Save, and the copies are discarded after.

export const bakeoffModelSchema = z
  .object({
    provider: z.string().trim().min(1).max(100),
    model: z.string().trim().min(1).max(200),
  })
  .strict();
export type BakeoffModel = z.infer<typeof bakeoffModelSchema>;

export const bakeoffQuoteSchema = z
  .object({
    section: z.enum(bakeoffSections),
    // The models to compare with the one the template uses now: one or two.
    models: z.array(bakeoffModelSchema).min(1).max(2),
  })
  .strict();
export const bakeoffStartSchema = bakeoffQuoteSchema
  .extend({
    // The total high estimate the quote showed, and that steps with no price are accepted.
    acknowledgedHigh: z.number().finite().min(0).max(10_000),
    acknowledgedUnknown: z.boolean().optional(),
  })
  .strict();

// The stage each section's model works in, which its time is read from.
export const bakeoffStage: Readonly<Record<BakeoffSection, StageKind>> = {
  script: "article",
  voice: "audio",
  pictures: "images",
};

// The model a section is made with now, or undefined when no model makes it.
export function sectionModel(
  document: PlayDraftDocument,
  section: BakeoffSection,
): BakeoffModel | undefined {
  const { form } = document;
  const pick = (choice: { readonly provider: string; readonly model: string }) =>
    choice.provider === "" || choice.model === ""
      ? undefined
      : { provider: choice.provider, model: choice.model };
  switch (section) {
    case "script":
      return form.sources.article === "generate" ? pick(form.llm) : undefined;
    case "voice":
      return form.sources.audio === "generate" ? pick(form.audio) : undefined;
    case "pictures":
      return form.sources.images === "generate" ? pick(form.images) : undefined;
  }
}

// The template's setup with the section made with `model` and nothing else changed.
export function withModel(
  document: PlayDraftDocument,
  section: BakeoffSection,
  model: BakeoffModel,
  catalogue: Catalogue,
): PlayDraftDocument {
  const { form } = document;
  switch (section) {
    case "script": {
      const { thinking, ...rest } = form.llm;
      return {
        ...document,
        form: {
          ...form,
          llm: {
            ...rest,
            provider: model.provider,
            model: model.model,
            ...keepThinking(catalogue, model.provider, model.model, thinking),
          },
        },
      };
    }
    case "voice":
      return { ...document, form: { ...form, audio: { ...form.audio, model: model.model } } };
    case "pictures":
      return {
        ...document,
        form: { ...form, images: { ...form.images, provider: model.provider, model: model.model } },
      };
  }
}

export interface BakeoffQuote {
  readonly version: number;
  readonly section: BakeoffSection;
  readonly current: BakeoffModel;
  readonly models: readonly (BakeoffModel & {
    readonly high: number;
    readonly unknown: number;
    readonly onPlan: boolean;
    readonly usesPlan: boolean;
    readonly problem: string | null;
  })[];
  readonly high: number;
  readonly unknown: number;
  // Some copy runs a step on a CLI plan.
  readonly usesPlan: boolean;
  readonly budget: BudgetRoom;
  readonly fits: boolean;
  // Why this bake-off can't be made as asked, or null.
  readonly problem: string | null;
}

export interface BakeoffDeps extends QuoteDeps {
  readonly paths: Paths;
  readonly log: Log;
}

type Refused = Extract<StudioResult<never>, { ok: false }>;
const refuse = (reason: StudioRefusal, message: string): Refused => ({
  ok: false,
  reason,
  message,
});

const missingTemplate =
  "This template no longer exists; it may have been deleted. Go to Library → Templates to see your templates.";

// What the bake-off is made on: the template's newest version, with a current paid sample.
function basis(
  deps: Pick<BakeoffDeps, "db">,
  templateId: string,
  section: BakeoffSection,
  models: readonly BakeoffModel[],
):
  | Refused
  | {
      readonly ok: true;
      readonly document: PlayDraftDocument;
      readonly version: number;
      readonly current: BakeoffModel;
    } {
  const template = templateById(deps.db, templateId);
  if (template === undefined) return refuse("not-found", missingTemplate);
  const label = sectionLabel[section];
  const current = sectionModel(template.document, section);
  if (current === undefined)
    return refuse(
      "invalid-input",
      `No model makes ${label} in this template, so there is nothing to compare. Choose a model in ${label} and press Save first.`,
    );
  const sample = sampleOf(deps.db, templateId);
  const made = sampleVersions(deps.db, templateId).find(
    (one) => one.templateVersion === template.version,
  );
  if (sample === undefined || !projectExists(deps.db, sample.projectId) || made?.state !== "done")
    return refuse(
      "not-ready",
      `Compare models runs on the template's current sample, and version ${String(template.version)} has none yet. Press Save (or Make sample) in the studio, wait for it, then compare.`,
    );
  const seen = new Set<string>();
  for (const model of models) {
    const key = `${model.provider}:${model.model}`;
    if (model.provider === current.provider && model.model === current.model)
      return refuse(
        "invalid-input",
        `${model.model} is the model ${label} uses now; its figures come from the current sample. Pick another model to compare it with.`,
      );
    if (seen.has(key))
      return refuse("invalid-input", `${model.model} is picked twice. Pick each model once.`);
    seen.add(key);
    if (section === "voice" && model.provider !== current.provider)
      return refuse(
        "invalid-input",
        "A voice is chosen per provider, so voice models are compared within the template's voice provider. Pick models of that provider, or change the voice in Voice first.",
      );
  }
  return { ok: true, document: template.document, version: template.version, current };
}

export async function quoteBakeoff(
  deps: BakeoffDeps,
  templateId: string,
  input: z.infer<typeof bakeoffQuoteSchema>,
): Promise<StudioResult<BakeoffQuote>> {
  const base = basis(deps, templateId, input.section, input.models);
  if (!base.ok) return base;
  const catalogue = deps.review.catalogue.read();
  const models: BakeoffQuote["models"][number][] = [];
  for (const model of input.models) {
    const quoted = await quoteSample(deps, templateId, {
      document: withModel(base.document, input.section, model, catalogue),
      sections: [input.section],
    });
    if (!quoted.ok) return quoted;
    models.push({
      ...model,
      high: quoted.value.high,
      unknown: quoted.value.unknown,
      onPlan: quoted.value.onPlan,
      usesPlan: quoted.value.usesPlan,
      problem: quoted.value.problem,
    });
  }
  const high = models.reduce((sum, one) => sum + one.high, 0);
  const usesPlan = models.some((one) => one.usesPlan);
  const budget = budgetRoom(deps.db, deps.clock.now(), deps.timeZone);
  return {
    ok: true,
    value: {
      version: base.version,
      section: input.section,
      current: base.current,
      models,
      high,
      unknown: models.reduce((sum, one) => sum + one.unknown, 0),
      usesPlan,
      budget,
      fits: fitsBudget(budget, high, usesPlan),
      problem: models.find((one) => one.problem !== null)?.problem ?? null,
    },
  };
}

export type BakeoffStart =
  | { readonly ok: true; readonly value: { readonly id: string; readonly version: number } }
  | (Refused & { readonly quote?: BakeoffQuote | undefined });

// Compare: priced again first; a higher total, an unknown price not accepted or a total past
// today's budget is refused with the new quote, and nothing is spent.
export async function startBakeoff(
  deps: BakeoffDeps & { readonly uuid: () => string },
  templateId: string,
  input: z.infer<typeof bakeoffStartSchema>,
): Promise<BakeoffStart> {
  const existing = bakeoffOf(deps.db, templateId);
  if (existing !== undefined && (existing.state === "queued" || existing.state === "making"))
    return refuse(
      "conflict",
      "A bake-off of this template is still being made. Wait for it to finish, or discard it, then compare again.",
    );
  if (
    queuedJob(deps.db, templateId) !== undefined ||
    runningJob(deps.db)?.templateId === templateId
  )
    return refuse(
      "conflict",
      "A sample of this template is being made. Compare models once it is done: the bake-off runs on it.",
    );
  const quoted = await quoteBakeoff(deps, templateId, input);
  if (!quoted.ok) return quoted;
  const quote = quoted.value;
  if (quote.problem !== null) return { ...refuse("invalid-input", quote.problem), quote };
  const money = (value: number) => `$${value.toFixed(2)}`;
  if (exceedsAcknowledged(quote.high, input.acknowledgedHigh))
    return {
      ...refuse(
        "cost-changed",
        `Comparing now costs about ${money(quote.high)}, more than the ${money(input.acknowledgedHigh)} you saw. Press Compare again to accept the new price.`,
      ),
      quote,
    };
  if (quote.unknown > 0 && input.acknowledgedUnknown !== true)
    return {
      ...refuse(
        "cost-changed",
        `${String(quote.unknown)} ${quote.unknown === 1 ? "step has" : "steps have"} no known price. Press Compare again to accept that.`,
      ),
      quote,
    };
  if (!quote.fits)
    return {
      ...refuse(
        "over-budget",
        `${budgetWords(quote.budget, quote, "Comparing")}, or compare tomorrow.`,
      ),
      quote,
    };
  if (existing !== undefined) {
    const cleared = discardBakeoff(deps, templateId);
    if (!cleared.ok) return cleared;
  }
  const id = deps.uuid();
  const at = deps.clock.now().toISOString();
  transact(deps.db, () => {
    insertBakeoff(
      deps.db,
      {
        id,
        templateId,
        templateVersion: quote.version,
        section: input.section,
        ackHigh: quote.high,
        ackUnknown: quote.unknown > 0,
        createdAt: at,
      },
      quote.models.map((model) => ({
        provider: model.provider,
        model: model.model,
        quotedHigh: model.high,
      })),
    );
    enqueueJob(deps.db, {
      templateId,
      templateVersion: quote.version,
      ackHigh: quote.high,
      kind: "bakeoff",
      requestedAt: at,
    });
  });
  return { ok: true, value: { id, version: quote.version } };
}

// Discard: every copy goes, with its files. What the copies were charged today still counts
// against the sample budget. Refused while a copy still has work going.
export function discardBakeoff(
  deps: Pick<BakeoffDeps, "db" | "paths" | "log">,
  templateId: string,
): StudioResult<{ readonly removed: number }> {
  const row = bakeoffOf(deps.db, templateId);
  if (row === undefined) return { ok: true, value: { removed: 0 } };
  if (
    row.state === "making" ||
    (row.state === "queued" && runningJob(deps.db)?.templateId === templateId)
  )
    return refuse(
      "conflict",
      "The bake-off is still being made, and work already going is never stopped. Discard it once it finishes.",
    );
  let removed = 0;
  for (const clone of clonesOf(deps.db, row.id)) {
    if (clone.projectId === null || !projectExists(deps.db, clone.projectId)) continue;
    const gone = removeHiddenProject(deps, clone.projectId);
    if (!gone.ok)
      return refuse(
        "conflict",
        gone.reason === "running"
          ? "A model's copy still has work going. Discard the bake-off once it finishes."
          : "A model's copy couldn't be removed from disk. Close any program using Slopify's files, then press Discard again.",
      );
    removed += 1;
  }
  deleteBakeoffRow(deps.db, row.id);
  // A queued bake-off job has nothing left to make.
  if (row.state === "queued")
    deps.db
      .prepare(
        "DELETE FROM template_sample_jobs WHERE template_id=? AND state='queued' AND kind='bakeoff'",
      )
      .run(templateId);
  return { ok: true, value: { removed } };
}

export interface BakeoffOutput {
  readonly role: string;
  readonly url: string;
  readonly name: string;
}

export interface BakeoffEntry extends BakeoffModel {
  readonly slot: number | null;
  readonly state: CloneState | "current";
  readonly quotedHigh: number | null;
  // What it was charged, in US dollars, and how long its section took, in seconds; null until
  // known.
  readonly cost: number | null;
  readonly seconds: number | null;
  readonly failure: string | null;
  readonly outputs: readonly BakeoffOutput[];
  // The script's opening, for the script section.
  readonly article: string | null;
}

export interface BakeoffView {
  readonly id: string;
  readonly section: BakeoffSection;
  readonly version: number;
  // Made for an older version than the template's newest.
  readonly stale: boolean;
  readonly state: BakeoffRow["state"];
  readonly sentence: string | null;
  readonly entries: readonly BakeoffEntry[];
}

const openingChars = 1200;

function madeOn(
  deps: Pick<BakeoffDeps, "db" | "paths" | "log">,
  projectId: string,
  section: BakeoffSection,
): { readonly outputs: readonly BakeoffOutput[]; readonly article: string | null } {
  const revisionId = currentRevisionId(deps.db, projectId);
  if (revisionId === undefined) return { outputs: [], article: null };
  const view = getRevisionView(
    { ...deps, ids: { next: () => "" }, clock: { now: () => new Date(), sleep: async () => {} } },
    projectId,
    revisionId,
  );
  if (view === undefined) return { outputs: [], article: null };
  const outputs = view.outputs.flatMap((row): BakeoffOutput[] =>
    row.selected && row.available && row.state === "ready" && sectionOfWork(row.workKey) === section
      ? [
          {
            role: row.output.role,
            url: `/files/${encodeURIComponent(projectId)}/revisions/${encodeURIComponent(revisionId)}/${encodeURIComponent(row.recordId)}`,
            name: row.output.path.split("/").pop() ?? row.output.path,
          },
        ]
      : [],
  );
  return {
    outputs: section === "script" ? [] : outputs,
    article:
      section === "script" && view.articleMarkdown !== null
        ? view.articleMarkdown.slice(0, openingChars)
        : null,
  };
}

const secondsOf = (from: string | null, to: string | null): number | null =>
  from === null || to === null ? null : Math.max(0, (Date.parse(to) - Date.parse(from)) / 1000);

// The bake-off as the studio shows it: the model in use now (from the template's current
// sample), then each other model's copy, with what it made, cost and took.
export function bakeoffView(
  deps: Pick<BakeoffDeps, "db" | "paths" | "log">,
  templateId: string,
): BakeoffView | null {
  const row = bakeoffOf(deps.db, templateId);
  if (row === undefined) return null;
  const head = templateById(deps.db, templateId);
  const version = templateById(deps.db, templateId, row.templateVersion);
  const current = version === undefined ? undefined : sectionModel(version.document, row.section);
  const sample = sampleOf(deps.db, templateId);
  const entries: BakeoffEntry[] = [];
  if (current !== undefined && sample !== undefined && projectExists(deps.db, sample.projectId)) {
    const cost = runCostOf(deps.db, sample.projectId);
    const used = cost.byModel.filter(
      (one) => one.provider === current.provider && one.model === current.model,
    );
    const wall =
      cost.byStage.find((one) => one.stage === bakeoffStage[row.section])?.wallMs ?? null;
    entries.push({
      ...current,
      slot: null,
      state: "current",
      quotedHigh: null,
      cost: used.length === 0 ? null : used.reduce((sum, one) => sum + one.cost, 0),
      seconds: wall === null ? null : wall / 1000,
      failure: null,
      ...madeOn(deps, sample.projectId, row.section),
    });
  }
  for (const clone of clonesOf(deps.db, row.id)) {
    const exists = clone.projectId !== null && projectExists(deps.db, clone.projectId);
    entries.push({
      provider: clone.provider,
      model: clone.model,
      slot: clone.slot,
      state: clone.state,
      quotedHigh: clone.quotedHigh,
      cost:
        exists && clone.projectId !== null && clone.state !== "queued"
          ? runCostOf(deps.db, clone.projectId).cost
          : null,
      seconds: secondsOf(clone.startedAt, clone.finishedAt),
      failure: clone.failure,
      ...(exists && clone.projectId !== null && clone.state === "done"
        ? madeOn(deps, clone.projectId, row.section)
        : { outputs: [], article: null }),
    });
  }
  return {
    id: row.id,
    section: row.section,
    version: row.templateVersion,
    stale: head !== undefined && head.version !== row.templateVersion,
    state: row.state,
    sentence: row.sentence,
    entries,
  };
}
