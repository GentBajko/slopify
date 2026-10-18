import { statSync } from "node:fs";
import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import type { DraftReviewDeps } from "../../slices/play-drafts/model.js";
import { playDraftDocumentSchema } from "../../slices/play-drafts/schema.js";
import { templateById } from "../../slices/project-templates/repo.js";
import { readSettings } from "../../slices/settings/playback.js";
import { providerStatuses } from "../../slices/settings/readiness.js";
import {
  budgetRoom,
  readStudioSettings,
  studioSettingsSchema,
  writeStudioSettings,
} from "../../slices/template-studio/budget.js";
import { createFreeSamples, type FreeSamples } from "../../slices/template-studio/free.js";
import { enqueueJob } from "../../slices/template-studio/jobs.js";
import type { StudioResult } from "../../slices/template-studio/model.js";
import { quoteSave } from "../../slices/template-studio/quote.js";
import {
  createUnknownAcks,
  makeSampleSchema,
  requestSample,
  saveStudio,
  saveStudioSchema,
  type UnknownAcks,
} from "../../slices/template-studio/save.js";
import {
  createPriceCache,
  createReadinessCache,
  getStudio,
  getStudioChecks,
  type PriceCache,
  type StudioDeps,
} from "../../slices/template-studio/service.js";
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

const documentBody = z.object({ document: playDraftDocumentSchema }).strict();

const unpriced =
  "This Slopify can't price or make paid samples because Play's review isn't available here. Restart Slopify; if it happens again, use Download diagnostics in Settings and report it.";

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
  deps: Pick<AppDeps, "db" | "clock" | "probe" | "hostCliStatus" | "speechHost" | "log">,
  studio: Pick<TemplateStudioService, "free" | "prices">,
): StudioDeps {
  return {
    db: deps.db,
    clock: deps.clock,
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
      .get("/:id", zValidator("param", param, onInvalid), async (c) => {
        const result = await getStudio(read, c.req.valid("param").id);
        return result.ok ? c.json(result.value) : refusedStudio(c, result);
      })
      // The free checks, apart from the studio: they wait on the providers' readiness.
      .get("/:id/checks", zValidator("param", param, onInvalid), async (c) => {
        const result = await getStudioChecks(read, c.req.valid("param").id);
        return result.ok ? c.json(result.value) : refusedStudio(c, result);
      })
      // What a Save's sample would cost, before anything is spent. Prices only; nothing changes.
      .post(
        "/:id/quote",
        zValidator("param", param, onInvalid),
        zValidator("json", documentBody, onInvalid),
        async (c) => {
          if (review === undefined)
            return problem(c, { status: 503, title: titleOf(503), detail: unpriced });
          const result = await quoteSave(
            { db: deps.db, clock: deps.clock, review },
            c.req.valid("param").id,
            c.req.valid("json").document,
          );
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
          if (!result.ok)
            return problem(c, {
              status:
                result.reason === "not-found" ? 404 : result.reason === "invalid-input" ? 400 : 409,
              title: titleOf(
                result.reason === "not-found" ? 404 : result.reason === "invalid-input" ? 400 : 409,
              ),
              detail: result.message,
              extensions: {
                reason: result.reason,
                ...(result.quote === undefined ? {} : { quote: result.quote }),
              },
            });
          if (!result.value.replayed) {
            studio.wake();
            deps.hub.emitGlobal({ type: "template.sample", templateId: id });
          }
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
