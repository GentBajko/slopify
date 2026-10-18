import { z } from "zod";
import type { Catalogue } from "../../catalog/schema.js";
import type { CostEstimate } from "../estimate/index.js";
import { estimateRequests } from "../estimate/requests.js";
import { fieldProblems, fillDocument, missingSentence, missingValues } from "./fields.js";
import type { DesignResult, DesignView } from "./model.js";
import { costChanged, costChangedMessage, quoteDesignImage } from "./quote.js";
import { designValuesSchema } from "./requests.js";
import type { DesignRunner } from "./runner.js";
import type { DesignDocument } from "./schema.js";
import { createDesign, type DesignDeps, designView, mutationHash } from "./service.js";
import { getTemplate, templateRevision } from "./templates.js";

// Make one piece from a design template: a design with the template version's settings and
// these values, its artwork started at once (the only paid step). Schedules and the template
// editor's sample make theirs the same way, naming what they made it for (`MakeOrigin`).

const id = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);
export const makeFromTemplateSchema = z
  .object({
    mutationId: z.string().min(8).max(100),
    values: designValuesSchema,
    acknowledgedHigh: z.number().min(0).max(1000),
    version: z.number().int().min(1).optional(),
    name: z.string().trim().min(1).max(200).optional(),
    projectId: id.optional(),
  })
  .strict();

export interface TemplateMakeDeps {
  readonly service: DesignDeps;
  readonly runner: DesignRunner;
  readonly catalogue: () => Catalogue;
}

export interface MakeOrigin {
  readonly sampleOf?: string | undefined;
  readonly scheduleId?: string | undefined;
  readonly scheduleRunId?: string | undefined;
}

const notFound = {
  ok: false,
  reason: "not-found",
  message:
    "This design template no longer exists. Open Library → Designs → Templates to choose another.",
} as const;

// What one piece made from this document costs: its artwork, or nothing when the template
// keeps its own picture.
export function quoteDocument(catalogue: Catalogue, doc: DesignDocument): CostEstimate {
  if (doc.picture.source !== "generate")
    return estimateRequests([{ kind: "local", stage: "Artwork" }], catalogue);
  return quoteDesignImage(catalogue, {
    provider: doc.picture.provider,
    model: doc.picture.model,
    purpose: "design-art",
    sendsPictures: doc.picture.castMemberIds.length > 0,
  });
}

export function quoteTemplate(
  deps: Pick<TemplateMakeDeps, "service" | "catalogue">,
  templateId: string,
): DesignResult<CostEstimate> {
  const template = getTemplate(deps.service.db, templateId);
  return template === undefined
    ? notFound
    : { ok: true, value: quoteDocument(deps.catalogue(), template.document) };
}

export function makeFromTemplate(
  deps: TemplateMakeDeps,
  templateId: string,
  raw: unknown,
  origin: MakeOrigin = {},
): DesignResult<DesignView> {
  const parsed = makeFromTemplateSchema.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      reason: "invalid",
      message: `The piece can't be made: ${parsed.error.issues[0]?.message ?? "a field is missing"}.`,
    };
  const input = parsed.data;
  const template = getTemplate(deps.service.db, templateId);
  if (template === undefined) return notFound;
  const revision = templateRevision(
    deps.service.db,
    templateId,
    input.version ?? template.headVersion,
  );
  if (revision === undefined)
    return {
      ok: false,
      reason: "not-found",
      message: "That version of the template doesn't exist. Reload the template.",
    };
  const doc = revision.document;
  const problem = fieldProblems(doc)[0];
  if (problem !== undefined) return { ok: false, reason: "invalid", message: problem.sentence };
  const missing = missingValues(doc, input.values);
  if (missing.length > 0)
    return { ok: false, reason: "missing-values", message: missingSentence(missing) };
  const quote = quoteDocument(deps.catalogue(), doc);
  if (costChanged(quote, input.acknowledgedHigh))
    return {
      ok: false,
      reason: "cost-changed",
      message: costChangedMessage(quote, "this piece"),
      current: quote,
    };
  const own = doc.picture.source === "picture" ? doc.picture.sha256 : undefined;
  if (doc.picture.source === "picture" && own === undefined)
    return {
      ok: false,
      reason: "invalid",
      message:
        "This template uses its own picture, but none is saved with it. Upload one under Picture, then press Make.",
    };
  const headline = fillDocument(doc, input.values).text.blocks.find(
    (block) => block.text.trim() !== "",
  )?.text;
  const made = createDesign(deps.service, {
    // From the request id, so a repeated request finds the design it made.
    id: `d${mutationHash({ templateId, mutationId: input.mutationId }).slice(0, 31)}`,
    mutationId: input.mutationId,
    kind: "design",
    name: (input.name ?? headline ?? revision.name).slice(0, 200),
    channelId: template.channelId,
    ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
    ...(own === undefined ? {} : { fromStepSha: own }),
    document: doc,
    values: input.values,
  });
  if (!made.ok) return made;
  deps.service.db
    .prepare(
      "UPDATE designs SET template_id=?, template_version=?, sample_of=?, schedule_id=?, schedule_run_id=? WHERE id=?",
    )
    .run(
      templateId,
      revision.version,
      origin.sampleOf ?? null,
      origin.scheduleId ?? null,
      origin.scheduleRunId ?? null,
      made.value.id,
    );
  if (own !== undefined) {
    const view = designView(deps.service.db, made.value.id);
    return view === undefined ? notFound : { ok: true, value: view };
  }
  return deps.runner.artwork(made.value.id, {
    mutationId: `${input.mutationId}:artwork`,
    acknowledgedHigh: input.acknowledgedHigh,
  });
}
