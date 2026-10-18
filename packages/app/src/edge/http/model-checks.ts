import { zValidator } from "@hono/zod-validator";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { providerFamilies } from "../../kernel/ports/model.js";
import { autoModes } from "../../slices/model-checks/model.js";
import { accountOf, markNoticesSeen, writeAuto } from "../../slices/model-checks/repo.js";
import { dollarsText } from "../../slices/model-checks/rules.js";
import type { CheckPlan } from "../../slices/model-checks/run.js";
import type { ModelChecks } from "../../slices/model-checks/service.js";
import { type ProviderId, providerById, providerIds } from "../../slices/settings/model.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";

const providerParam = z.object({ id: z.enum(providerIds) });
const modelList = z.string().min(1).max(200);
const estimateQuery = z.object({ models: z.string().max(10_000).optional() });
const checkBody = z
  .object({
    models: z.array(modelList).max(300).optional(),
    confirmedDollars: z.number().finite().nonnegative().optional(),
  })
  .strict();
const dismissBody = z
  .object({
    keys: z
      .array(
        z
          .object({
            provider: z.string().min(1).max(64),
            family: z.enum(providerFamilies),
            model: modelList,
          })
          .strict(),
      )
      .max(500),
  })
  .strict();
const autoBody = z.object({ auto: z.enum(autoModes) }).strict();

const notReady =
  "Model checks are not ready yet because Slopify is still starting. Wait a moment, reload the page and try again.";

export function estimateOf(plan: CheckPlan) {
  return {
    count: plan.targets.length,
    totalDollars: plan.totalDollars,
    unpriced: plan.unpriced,
    planAccounts: plan.planAccounts,
    text: dollarsText(plan.totalDollars, plan.unpriced),
    skipped: plan.skipped.map((one) => ({ model: one.model.model, reason: one.reason })),
  };
}

function unavailable(c: Context): Response {
  return problem(c, { status: 503, title: titleOf(503), detail: notReady });
}

function noAccount(c: Context, id: ProviderId): Response {
  const { displayName, auth } = providerById(id);
  return problem(c, {
    status: 400,
    title: titleOf(400),
    detail:
      auth === "key"
        ? `No ${displayName} key is saved, so its models can't be checked. Paste a key in Settings → Providers → ${displayName} and choose Save, then choose Check models in Settings → Models.`
        : `${displayName} is not set up, so its models can't be checked. Set it up in Settings → Providers, then choose Check models in Settings → Models.`,
  });
}

// The provider-scoped half: its estimate and its Check models button.
export function providerCheckRoutes(deps: AppDeps) {
  const checks = (): ModelChecks | undefined => deps.modelChecks;
  const models = (raw: string | undefined): readonly string[] | undefined =>
    raw === undefined || raw.trim() === ""
      ? undefined
      : raw
          .split(",")
          .map((one) => one.trim())
          .filter(Boolean);
  return new Hono()
    .get(
      "/:id/models/check/estimate",
      zValidator("param", providerParam, onInvalid),
      zValidator("query", estimateQuery, onInvalid),
      async (c) => {
        const service = checks();
        if (service === undefined) return unavailable(c);
        const { id } = c.req.valid("param");
        if (accountOf(deps.db, id) === undefined) return noAccount(c, id);
        c.header("Cache-Control", "no-store");
        const plan = await service.plan({
          trigger: "manual",
          provider: id,
          models: models(c.req.valid("query").models),
        });
        return c.json({ provider: id, ...estimateOf(plan) });
      },
    )
    .post(
      "/:id/models/check",
      zValidator("param", providerParam, onInvalid),
      zValidator("json", checkBody, onInvalid),
      async (c) => {
        const service = checks();
        if (service === undefined) return unavailable(c);
        const { id } = c.req.valid("param");
        if (accountOf(deps.db, id) === undefined) return noAccount(c, id);
        const body = c.req.valid("json");
        const name = providerById(id).displayName;
        const answer = await service.start(
          { trigger: "manual", provider: id, models: body.models },
          body.confirmedDollars,
        );
        if (!answer.ok && answer.reason === "running")
          return problem(c, {
            status: 409,
            title: titleOf(409),
            detail: `Slopify is already checking ${name}'s models. Wait for it to finish, then choose Check models again in Settings → Models.`,
          });
        if (!answer.ok) {
          const estimate = estimateOf(answer.plan);
          return problem(c, {
            status: 409,
            title: titleOf(409),
            detail: `Checking ${String(estimate.count)} ${name} model${estimate.count === 1 ? "" : "s"} costs ${estimate.text} at list price, and nothing was sent yet. Choose Check models in Settings → Models again and confirm the estimate to go ahead.`,
            extensions: { estimate },
          });
        }
        void answer.done.catch((error: unknown) => {
          deps.log.write("warn", "model-checks", {
            detail: `${id}: ${error instanceof Error ? error.message : String(error)}`,
          });
        });
        return c.json({ provider: id, started: true, ...estimateOf(answer.plan) }, 202);
      },
    );
}

// Settings → Models: what each provider's checks found, New for you, and Automatic checks.
export function modelCheckRoutes(deps: AppDeps) {
  return new Hono()
    .get("/", (c) => {
      const service = deps.modelChecks;
      if (service === undefined) return unavailable(c);
      c.header("Cache-Control", "no-store");
      return c.json(service.overview());
    })
    .post("/notices/dismiss", zValidator("json", dismissBody, onInvalid), (c) => {
      markNoticesSeen(deps.db, c.req.valid("json").keys);
      return c.body(null, 204);
    })
    .put("/auto", zValidator("json", autoBody, onInvalid), (c) => {
      const { auto } = c.req.valid("json");
      writeAuto(deps.db, auto);
      return c.json({ auto });
    });
}
