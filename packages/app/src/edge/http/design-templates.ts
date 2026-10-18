import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { DesignResult } from "../../slices/designs/model.js";
import { type DesignDocument, designDocumentSchema } from "../../slices/designs/schema.js";
import { designAffectedSections, sampleNeedsPicture } from "../../slices/designs/sections.js";
import { freeSample } from "../../slices/designs/studio-kind.js";
import type { TemplateCheck } from "../../slices/designs/template-checks.js";
import {
  makeFromTemplate,
  quoteDocument,
  quoteTemplate,
  type TemplateMakeDeps,
} from "../../slices/designs/template-make.js";
import {
  createTemplate,
  getTemplate,
  listTemplates,
  markTemplateReady,
  saveTemplate,
} from "../../slices/designs/templates.js";
import { trashDesignTemplate } from "../../slices/trash/designs.js";
import { designRefused } from "./designs.js";
import { idParam } from "./ids.js";
import { onInvalid, problem } from "./problem.js";
import { jsonBody } from "./refusal.js";

// Library → Designs → Templates: design templates, their versions, Mark ready and one-off
// Make. The template editor's sample (Phase E, `sample.ts`) plugs in through `samples`.

export interface DesignTemplateRoutesDeps extends TemplateMakeDeps {
  // The checks that read fonts, providers and formats, added to the free ones at Mark ready.
  readonly checks?:
    | ((templateId: string, doc: DesignDocument) => Promise<readonly TemplateCheck[]>)
    | undefined;
  // Redraws the sample after a Save; absent, a Save only saves.
  readonly samples?:
    | {
        readonly afterSave: (input: {
          readonly templateId: string;
          readonly version: number;
          readonly before: DesignDocument;
          readonly after: DesignDocument;
          readonly sample: "make" | "skip";
          readonly acknowledgedHigh: number;
        }) => DesignResult<unknown>;
        // Make sample: starts a held, failed or missing sample at the price the person saw.
        readonly request?: (
          templateId: string,
          version: number,
          acknowledgedHigh: number,
        ) => DesignResult<unknown>;
        readonly state?: (templateId: string) => unknown;
      }
    | undefined;
  // A Save or Mark ready changed what the template's design schedules make, or when.
  readonly templateChanged?: ((templateId: string) => void) | undefined;
}

const sampleRequestSchema = z
  .object({ version: z.number().int().min(1), acknowledgedHigh: z.number().min(0).max(1000) })
  .strict();
const quoteBodySchema = z.object({ document: designDocumentSchema }).strict();

const notFoundRefusal = {
  reason: "not-found",
  message:
    "This design template no longer exists. Open Library → Designs → Templates to choose another.",
} as const;

export function designTemplateRoutes(deps: DesignTemplateRoutesDeps | undefined) {
  const unavailable = (c: Parameters<typeof problem>[0]) =>
    problem(c, {
      status: 503,
      detail:
        "Design templates aren't available in this copy of Slopify. Restart Slopify; if it keeps happening, reinstall it.",
    });
  return new Hono()
    .get("/", (c) =>
      deps === undefined ? unavailable(c) : c.json({ templates: listTemplates(deps.service.db) }),
    )
    .post("/", async (c) => {
      if (deps === undefined) return unavailable(c);
      const result = createTemplate(deps.service, await jsonBody(c));
      return result.ok ? c.json(result.value, 201) : designRefused(c, result);
    })
    .get("/:id", zValidator("param", idParam, onInvalid), (c) => {
      if (deps === undefined) return unavailable(c);
      const template = getTemplate(deps.service.db, c.req.valid("param").id);
      return template === undefined
        ? designRefused(c, {
            reason: "not-found",
            message:
              "This design template no longer exists. Open Library → Designs → Templates to choose another.",
          })
        : c.json({ ...template, sample: deps.samples?.state?.(template.id) ?? null });
    })
    .put("/:id", zValidator("param", idParam, onInvalid), async (c) => {
      if (deps === undefined) return unavailable(c);
      const id = c.req.valid("param").id;
      const body = await jsonBody(c);
      const result = saveTemplate(deps.service, id, body);
      if (!result.ok) return designRefused(c, result);
      const { template, saved, before } = result.value;
      if (saved) deps.templateChanged?.(id);
      const asked = z
        .object({
          sample: z.enum(["make", "skip"]).optional(),
          acknowledgedHigh: z.number().optional(),
        })
        .catch({})
        .parse(body);
      const sample =
        deps.samples === undefined || !saved
          ? null
          : deps.samples.afterSave({
              templateId: id,
              version: template.headVersion,
              before,
              after: template.document,
              sample: asked.sample ?? "skip",
              acknowledgedHigh: asked.acknowledgedHigh ?? 0,
            });
      return c.json({
        template,
        saved,
        sample: sample === null ? null : sample.ok ? sample.value : { refused: sample.message },
      });
    })
    .delete("/:id", zValidator("param", idParam, onInvalid), (c) => {
      if (deps === undefined) return unavailable(c);
      const result = trashDesignTemplate(deps.service, c.req.valid("param").id);
      return result.ok
        ? c.body(null, 204)
        : designRefused(c, {
            reason: "not-found",
            message:
              "This design template no longer exists. Open Library → Designs → Templates to choose another.",
          });
    })
    .post("/:id/quote", zValidator("param", idParam, onInvalid), async (c) => {
      if (deps === undefined) return unavailable(c);
      const id = c.req.valid("param").id;
      const body = await jsonBody(c);
      // With a document: what saving it would cost the editor's sample (only a changed
      // picture is paid). Without: what one piece from the newest version costs.
      if (typeof body === "object" && body !== null && Object.keys(body).length > 0) {
        const parsed = quoteBodySchema.safeParse(body);
        if (!parsed.success)
          return designRefused(c, {
            reason: "invalid",
            message: `The template can't be priced: ${parsed.error.issues[0]?.message ?? "a field is missing"}.`,
          });
        const template = getTemplate(deps.service.db, id);
        if (template === undefined) return designRefused(c, notFoundRefusal);
        const sample = deps.samples?.state?.(id) as
          | { readonly designId?: string | null; readonly state?: string }
          | null
          | undefined;
        const sections = designAffectedSections(template.document, parsed.data.document);
        const makesPicture =
          sampleNeedsPicture(sections) ||
          sample === null ||
          sample === undefined ||
          sample.designId == null ||
          sample.state === "failed";
        const quote = makesPicture
          ? quoteDocument(deps.catalogue(), parsed.data.document)
          : freeSample(deps.catalogue());
        return c.json({ ...quote, sections, makesPicture });
      }
      const result = quoteTemplate(deps, id);
      return result.ok ? c.json(result.value) : designRefused(c, result);
    })
    .post("/:id/sample", zValidator("param", idParam, onInvalid), async (c) => {
      if (deps === undefined) return unavailable(c);
      const request = deps.samples?.request;
      if (request === undefined) return unavailable(c);
      const parsed = sampleRequestSchema.safeParse(await jsonBody(c));
      if (!parsed.success)
        return designRefused(c, {
          reason: "invalid",
          message:
            "Say which version to make a sample of and the price you saw, then press Make sample.",
        });
      const result = request(
        c.req.valid("param").id,
        parsed.data.version,
        parsed.data.acknowledgedHigh,
      );
      return result.ok ? c.json(result.value, 202) : designRefused(c, result);
    })
    .post("/:id/ready", zValidator("param", idParam, onInvalid), async (c) => {
      if (deps === undefined) return unavailable(c);
      const id = c.req.valid("param").id;
      const checks = deps.checks;
      const result = await markTemplateReady(
        deps.service,
        id,
        await jsonBody(c),
        checks === undefined ? undefined : (doc) => checks(id, doc),
      );
      if (result.ok) {
        deps.templateChanged?.(id);
        return c.json(result.value);
      }
      return result.reason === "not-ready"
        ? problem(c, {
            status: 409,
            detail: result.message,
            extensions: { reason: result.reason, checks: result.current },
          })
        : designRefused(c, result);
    })
    .post("/:id/make", zValidator("param", idParam, onInvalid), async (c) => {
      if (deps === undefined) return unavailable(c);
      const result = makeFromTemplate(deps, c.req.valid("param").id, await jsonBody(c));
      return result.ok ? c.json(result.value, 202) : designRefused(c, result);
    });
}
