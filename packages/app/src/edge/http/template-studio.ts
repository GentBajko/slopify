import { statSync } from "node:fs";
import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import type { DraftReviewDeps } from "../../slices/play-drafts/model.js";
import { playDraftDocumentSchema } from "../../slices/play-drafts/schema.js";
import { templateById } from "../../slices/project-templates/repo.js";
import { readSettings } from "../../slices/settings/playback.js";
import { providerStatuses } from "../../slices/settings/readiness.js";
import { getAnatomy } from "../../slices/template-studio/anatomy-view.js";
import {
  budgetRoom,
  readStudioSettings,
  studioSettingsSchema,
  writeStudioSettings,
} from "../../slices/template-studio/budget.js";
import {
  makeSamplesForAll,
  quoteSamplesForAll,
  samplesForAllSchema,
} from "../../slices/template-studio/for-all.js";
import { createFreeSamples, type FreeSamples } from "../../slices/template-studio/free.js";
import { enqueueJob } from "../../slices/template-studio/jobs.js";
import {
  type StudioRefusal,
  type StudioResult,
  templateSections,
} from "../../slices/template-studio/model.js";
import { quoteSample, quoteSave } from "../../slices/template-studio/quote.js";
import { markReady, markReadySchema } from "../../slices/template-studio/ready.js";
import {
  createUnknownAcks,
  makeSampleSchema,
  requestSample,
  saveStudio,
  saveStudioSchema,
  type UnknownAcks,
} from "../../slices/template-studio/save.js";
import {
  pronunciationsOf,
  quoteSayItAs,
  sayItAs,
  sayItAsSchema,
} from "../../slices/template-studio/say-it-as.js";
import { withDependents } from "../../slices/template-studio/sections.js";
import {
  createPriceCache,
  createReadinessCache,
  getStudio,
  getStudioChecks,
  type PriceCache,
  type StudioDeps,
} from "../../slices/template-studio/service.js";
import {
  fullScriptSchema,
  setFullScript,
  setSampleTopic,
  topicOf,
  topicSchema,
} from "../../slices/template-studio/topic.js";
import type { AppDeps } from "./app.js";
import { fileResponse } from "./byte-range.js";
import { onInvalid, problem, titleOf } from "./problem.js";

// Library → Templates → Open studio. Not `/api/studio`, which is the YouTube Studio pack.
const param = z.object({ id: z.uuid() });

// What `main.ts` builds once for the studio: its free samples, the run prices the sample job
// works out, and the sample loop's wake-up. A test without it gets samples that say how to
// get them.
export interface TemplateStudioService {
  readonly free: FreeSamples;
  readonly prices: PriceCache;
  readonly wake: () => void;
  // The narration the loudness sample's Before plays: Slopify's bundled sample.
  readonly loudnessSource?: string | undefined;
  readonly loudnessFile?: (
    hash: string,
  ) => { readonly path: string; readonly bytes: number } | undefined;
  readonly documentFile?: (
    hash: string,
  ) => { readonly path: string; readonly bytes: number } | undefined;
  // Play's review, which prices a sample; without it (and without `drafts`) no sample is
  // priced or made.
  readonly review?: DraftReviewDeps | undefined;
  // The unknown prices accepted on Save, which the sample loop reads.
  readonly acks?: UnknownAcks | undefined;
}

export function refusedStudio(
  c: Context,
  result: Extract<StudioResult<never>, { ok: false }>,
): Response {
  const status =
    result.reason === "not-found" ? 404 : result.reason === "invalid-input" ? 400 : 409;
  return problem(c, {
    status,
    title: titleOf(status),
    detail: result.message,
    extensions: { reason: result.reason },
  });
}

// What to price: a Save's document, a new sample topic, or the full script switched.
const quoteBody = z
  .object({
    document: playDraftDocumentSchema.optional(),
    topic: z.string().trim().min(1).max(300).optional(),
    fullScript: z.boolean().optional(),
  })
  .strict()
  .refine(
    (body) =>
      [body.document, body.topic, body.fullScript].filter((one) => one !== undefined).length === 1,
    { message: "Send one of document, topic or fullScript." },
  );

const unpriced =
  "This Slopify can't price or make paid samples because Play's review isn't available here. Restart Slopify; if it happens again, use Download diagnostics in Settings and report it.";

// A refusal that carries the new quote (a higher price, unknown prices, past the budget), so the
// page can show it on the button at once.
function refusedWithQuote(
  c: Context,
  result: { readonly reason: StudioRefusal; readonly message: string; readonly quote?: unknown },
): Response {
  const status =
    result.reason === "not-found" ? 404 : result.reason === "invalid-input" ? 400 : 409;
  return problem(c, {
    status,
    title: titleOf(status),
    detail: result.message,
    extensions: {
      reason: result.reason,
      ...(result.quote === undefined ? {} : { quote: result.quote }),
    },
  });
}

const missingTemplate =
  "This template no longer exists; it may have been deleted. Go to Library → Templates to see your templates.";

function service(deps: AppDeps): TemplateStudioService {
  return (
    deps.templateStudio ?? {
      free: createFreeSamples({
        loudnessDefault: () => readSettings({ db: deps.db, log: deps.log }).loudness,
      }),
      prices: createPriceCache(),
      wake: () => undefined,
    }
  );
}

export function studioDeps(
  deps: Pick<AppDeps, "db" | "clock" | "paths" | "probe" | "hostCliStatus" | "speechHost" | "log">,
  studio: Pick<TemplateStudioService, "free" | "prices">,
): StudioDeps {
  return {
    db: deps.db,
    clock: deps.clock,
    paths: deps.paths,
    log: deps.log,
    free: studio.free,
    prices: studio.prices,
    // Probing the CLIs takes seconds: the studio's checks share one lookup for half a minute.
    providerStatuses: createReadinessCache(() =>
      providerStatuses({
        db: deps.db,
        probe: deps.probe,
        hostCliStatus: deps.hostCliStatus,
        host: deps.speechHost,
      }),
    ),
  };
}

export function templateStudioRoutes(deps: AppDeps) {
  const studio = service(deps);
  const read = studioDeps(deps, studio);
  const review = studio.review ?? deps.drafts;
  const acks = studio.acks ?? createUnknownAcks();
  const sayDeps = { db: deps.db, paths: deps.paths, ids: deps.ids, clock: deps.clock };
  const gone = (c: Context, detail: string) =>
    problem(c, { status: 404, title: titleOf(404), detail });
  const media = (
    c: Context,
    file: { readonly path: string; readonly bytes: number } | undefined,
    type: string,
    detail: string,
  ) =>
    file === undefined
      ? gone(c, detail)
      : fileResponse(c, file.path, file.bytes, {
          "content-type": type,
          "cache-control": "no-cache",
          "x-content-type-options": "nosniff",
        });
  return (
    new Hono()
      // Settings → Template studio: the samples' daily budget, and what was spent today.
      .get("/settings", (c) =>
        c.json({
          ...readStudioSettings(deps.db),
          today: budgetRoom(deps.db, deps.clock.now()),
        }),
      )
      .put("/settings", zValidator("json", studioSettingsSchema, onInvalid), (c) => {
        writeStudioSettings(deps.db, c.req.valid("json"));
        return c.json({
          ...readStudioSettings(deps.db),
          today: budgetRoom(deps.db, deps.clock.now()),
        });
      })
      // Settings → Template studio → Make samples for all: the total first, then each sample
      // that fits today's budget queued at its price, the rest waiting on the budget.
      .post("/samples-for-all/quote", async (c) => {
        if (review === undefined)
          return problem(c, { status: 503, title: titleOf(503), detail: unpriced });
        return c.json(await quoteSamplesForAll({ db: deps.db, clock: deps.clock, review, acks }));
      })
      .post("/samples-for-all", zValidator("json", samplesForAllSchema, onInvalid), async (c) => {
        if (review === undefined)
          return problem(c, { status: 503, title: titleOf(503), detail: unpriced });
        const result = await makeSamplesForAll(
          { db: deps.db, clock: deps.clock, review, acks },
          c.req.valid("json"),
        );
        if (!result.ok) return refusedWithQuote(c, result);
        studio.wake();
        for (const templateId of [...result.value.queued, ...result.value.held])
          deps.hub.emitGlobal({ type: "template.sample", templateId });
        return c.json(result.value, 202);
      })
      .get("/:id", zValidator("param", param, onInvalid), async (c) => {
        const result = await getStudio(read, c.req.valid("param").id);
        return result.ok ? c.json(result.value) : refusedStudio(c, result);
      })
      // A section's prompts, each cut into your words, your keywords, Slopify's and settings'.
      .get(
        "/:id/anatomy",
        zValidator("param", param, onInvalid),
        zValidator(
          "query",
          z.object({ section: z.enum(templateSections), item: z.string().max(200).optional() }),
          onInvalid,
        ),
        async (c) => {
          if (review === undefined)
            return problem(c, { status: 503, title: titleOf(503), detail: unpriced });
          const { section, item } = c.req.valid("query");
          const result = await getAnatomy(
            { db: deps.db, paths: deps.paths, log: deps.log, review },
            c.req.valid("param").id,
            section,
            item,
          );
          return result.ok ? c.json(result.value) : refusedStudio(c, result);
        },
      )
      // Mark ready: the newest version, once every check passes and every sample is current,
      // becomes the one its schedules run. Refused with each thing still to fix.
      .post(
        "/:id/ready",
        zValidator("param", param, onInvalid),
        zValidator("json", markReadySchema, onInvalid),
        async (c) => {
          const id = c.req.valid("param").id;
          const result = await markReady(read, id, c.req.valid("json"));
          if (!result.ok) {
            const status =
              result.reason === "not-found" ? 404 : result.reason === "invalid-input" ? 400 : 409;
            return problem(c, {
              status,
              title: titleOf(status),
              detail: result.message,
              extensions: { reason: result.reason, problems: result.problems },
            });
          }
          if (!result.value.replayed)
            deps.hub.emitGlobal({ type: "template.sample", templateId: id });
          return c.json(result.value);
        },
      )
      // Voice → Say it as: the names the sample's script says, each with its first line.
      .get("/:id/pronunciations", zValidator("param", param, onInvalid), (c) => {
        const id = c.req.valid("param").id;
        if (templateById(deps.db, id) === undefined) return gone(c, missingTemplate);
        return c.json(pronunciationsOf(sayDeps, id));
      })
      // What voicing the sample's lines that say a word again, the new way, costs.
      .post(
        "/:id/say-it-as/quote",
        zValidator("param", param, onInvalid),
        zValidator("json", sayItAsSchema.unwrap().pick({ written: true, spoken: true }), onInvalid),
        (c) => {
          if (review === undefined)
            return problem(c, { status: 503, title: titleOf(503), detail: unpriced });
          const result = quoteSayItAs(
            { ...sayDeps, review },
            c.req.valid("param").id,
            c.req.valid("json"),
          );
          return result.ok ? c.json(result.value) : refusedStudio(c, result);
        },
      )
      // Save a "Say it as": the Library alias, and the sample's lines that say it voiced again.
      .post(
        "/:id/say-it-as",
        zValidator("param", param, onInvalid),
        zValidator("json", sayItAsSchema, onInvalid),
        async (c) => {
          if (review === undefined)
            return problem(c, { status: 503, title: titleOf(503), detail: unpriced });
          const id = c.req.valid("param").id;
          const result = await sayItAs({ ...sayDeps, review, acks }, id, c.req.valid("json"));
          if (!result.ok) return refusedWithQuote(c, result);
          if (result.value.queued) studio.wake();
          deps.hub.emitGlobal({ type: "template.sample", templateId: id });
          return c.json(result.value);
        },
      )
      // The free checks, apart from the studio: they wait on the providers' readiness.
      .get("/:id/checks", zValidator("param", param, onInvalid), async (c) => {
        const result = await getStudioChecks(read, c.req.valid("param").id);
        return result.ok ? c.json(result.value) : refusedStudio(c, result);
      })
      // What a Save's sample would cost, before anything is spent. Prices only; nothing changes.
      .post(
        "/:id/quote",
        zValidator("param", param, onInvalid),
        zValidator("json", quoteBody, onInvalid),
        async (c) => {
          if (review === undefined)
            return problem(c, { status: 503, title: titleOf(503), detail: unpriced });
          const id = c.req.valid("param").id;
          const body = c.req.valid("json");
          const quoteDeps = { db: deps.db, clock: deps.clock, review };
          let result: Awaited<ReturnType<typeof quoteSample>>;
          if (body.document !== undefined) result = await quoteSave(quoteDeps, id, body.document);
          else if (body.topic !== undefined) {
            const named = topicOf(deps, id, body.topic);
            if (!named.ok)
              return problem(c, {
                status: 400,
                title: titleOf(400),
                detail: named.message,
                extensions: { reason: "invalid-input" },
              });
            result = await quoteSample(quoteDeps, id, { topic: named.topic, sections: "all" });
          } else
            result = await quoteSample(quoteDeps, id, {
              fullScript: body.fullScript,
              sections: withDependents(["script"]),
            });
          return result.ok ? c.json(result.value) : refusedStudio(c, result);
        },
      )
      // Save: the template's next version, with its sample queued at the price the person saw,
      // or without a sample. A higher price, an unaccepted unknown one, or a sample past today's
      // budget is refused with the new quote.
      .post(
        "/:id/save",
        zValidator("param", param, onInvalid),
        zValidator("json", saveStudioSchema, onInvalid),
        async (c) => {
          if (review === undefined)
            return problem(c, { status: 503, title: titleOf(503), detail: unpriced });
          const id = c.req.valid("param").id;
          const result = await saveStudio(
            { db: deps.db, clock: deps.clock, review, acks },
            id,
            c.req.valid("json"),
          );
          if (!result.ok) return refusedWithQuote(c, result);
          if (!result.value.replayed) {
            studio.wake();
            deps.hub.emitGlobal({ type: "template.sample", templateId: id });
          }
          return c.json(result.value);
        },
      )
      // The sample's topic: typed, the next one a schedule has queued, or back to the fixed one.
      .put(
        "/:id/topic",
        zValidator("param", param, onInvalid),
        zValidator("json", topicSchema, onInvalid),
        async (c) => {
          if (review === undefined)
            return problem(c, { status: 503, title: titleOf(503), detail: unpriced });
          const id = c.req.valid("param").id;
          const result = await setSampleTopic(
            { db: deps.db, clock: deps.clock, review, acks },
            id,
            c.req.valid("json"),
          );
          if (!result.ok) return refusedWithQuote(c, result);
          studio.wake();
          deps.hub.emitGlobal({ type: "template.sample", templateId: id });
          return c.json(result.value);
        },
      )
      // The sample's whole script, or back to the outline and first chapter.
      .post(
        "/:id/full-script",
        zValidator("param", param, onInvalid),
        zValidator("json", fullScriptSchema, onInvalid),
        async (c) => {
          if (review === undefined)
            return problem(c, { status: 503, title: titleOf(503), detail: unpriced });
          const id = c.req.valid("param").id;
          const result = await setFullScript(
            { db: deps.db, clock: deps.clock, review, acks },
            id,
            c.req.valid("json"),
          );
          if (!result.ok) return refusedWithQuote(c, result);
          studio.wake();
          deps.hub.emitGlobal({ type: "template.sample", templateId: id });
          return c.json(result.value);
        },
      )
      // Make sample: the current version's paid sample again, at the price the button showed.
      .post(
        "/:id/samples/make",
        zValidator("param", param, onInvalid),
        zValidator("json", makeSampleSchema, onInvalid),
        (c) => {
          const id = c.req.valid("param").id;
          const result = requestSample(
            { db: deps.db, clock: deps.clock, acks },
            id,
            c.req.valid("json"),
          );
          if (!result.ok) return refusedStudio(c, result);
          studio.wake();
          deps.hub.emitGlobal({ type: "template.sample", templateId: id });
          return c.json({ queued: true, ...result.value }, 202);
        },
      )
      // Make samples: the free ones (video, loudness, PDF, the schedule's cost) for the current
      // version, queued behind any other template's and made in the background.
      .post("/:id/free-samples", zValidator("param", param, onInvalid), (c) => {
        const template = templateById(deps.db, c.req.valid("param").id);
        if (template === undefined) return gone(c, missingTemplate);
        enqueueJob(deps.db, {
          templateId: template.id,
          templateVersion: template.version,
          ackHigh: 0,
          kind: "free",
          requestedAt: deps.clock.now().toISOString(),
        });
        studio.wake();
        deps.hub.emitGlobal({ type: "template.sample", templateId: template.id });
        return c.json({ queued: true, version: template.version }, 202);
      })
      .get(
        "/:id/loudness/:file",
        zValidator("param", param.extend({ file: z.enum(["before.mp3", "after.mp3"]) }), onInvalid),
        (c) => {
          const { id, file } = c.req.valid("param");
          const template = templateById(deps.db, id);
          if (template === undefined) return gone(c, missingTemplate);
          const notMade =
            "This loudness sample isn't made yet. Open the template's studio and press Make samples.";
          if (file === "before.mp3") {
            const source = studio.loudnessSource;
            const size =
              source === undefined ? undefined : statSync(source, { throwIfNoEntry: false });
            return media(
              c,
              source === undefined || size === undefined
                ? undefined
                : { path: source, bytes: size.size },
              "audio/mpeg",
              notMade,
            );
          }
          const hash = studio.free.loudnessHashOf(template.document);
          return media(
            c,
            hash === undefined ? undefined : studio.loudnessFile?.(hash),
            "audio/mpeg",
            hash === undefined
              ? "Level the volume is off for this template, so there is no levelled narration. Turn it on in Voice, then press Save."
              : notMade,
          );
        },
      )
      .get("/:id/document.pdf", zValidator("param", param, onInvalid), (c) => {
        const template = templateById(deps.db, c.req.valid("param").id);
        if (template === undefined) return gone(c, missingTemplate);
        return media(
          c,
          studio.documentFile?.(studio.free.documentHashOf(template.document)),
          "application/pdf",
          "This PDF sample isn't made yet. Open the template's studio and press Make samples.",
        );
      })
  );
}
