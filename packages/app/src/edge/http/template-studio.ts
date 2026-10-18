import { statSync } from "node:fs";
import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { templateById } from "../../slices/project-templates/repo.js";
import { readSettings } from "../../slices/settings/playback.js";
import { providerStatuses } from "../../slices/settings/readiness.js";
import { createFreeSamples, type FreeSamples } from "../../slices/template-studio/free.js";
import { enqueueJob } from "../../slices/template-studio/jobs.js";
import type { StudioResult } from "../../slices/template-studio/model.js";
import {
  createPriceCache,
  getStudio,
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
    providerStatuses: () =>
      providerStatuses({
        db: deps.db,
        probe: deps.probe,
        hostCliStatus: deps.hostCliStatus,
        host: deps.speechHost,
      }),
  };
}

export function templateStudioRoutes(deps: AppDeps) {
  const studio = service(deps);
  const read = studioDeps(deps, studio);
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
      .get("/:id", zValidator("param", param, onInvalid), async (c) => {
        const result = await getStudio(read, c.req.valid("param").id);
        return result.ok ? c.json(result.value) : refusedStudio(c, result);
      })
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
