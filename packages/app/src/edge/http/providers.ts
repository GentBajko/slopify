import { randomUUID } from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { keyProbes } from "../../adapters/key-probes.js";
import { videoModelsOf } from "../../catalog/schema.js";
import { defaultSpeechVoice, detectSpeechCached } from "../../kernel/ports/system-speech.js";
import { switchAllRetired, switchRetiredModel } from "../../slices/model-upkeep/switch.js";
import { retiredModelUsage, usageKinds, usageSlots } from "../../slices/model-upkeep/usage.js";
import { cliPathMaxLength, saveCliPath } from "../../slices/settings/cli-paths.js";
import { dismissFirstRun, firstRunStatus } from "../../slices/settings/first-run.js";
import { checkProviderHealth } from "../../slices/settings/health.js";
import { keyGuides } from "../../slices/settings/key-guides.js";
import { testProviderKey } from "../../slices/settings/key-test.js";
import type { KeysDeps } from "../../slices/settings/keys.js";
import { keyStatus, removeProviderKey, saveProviderKey } from "../../slices/settings/keys.js";
import type { ProviderId } from "../../slices/settings/model.js";
import { isUncataloguedProvider, providerById, providerIds } from "../../slices/settings/model.js";
import { createModelCatalog } from "../../slices/settings/models.js";
import type { ReadinessDeps } from "../../slices/settings/readiness.js";
import { providerStatuses } from "../../slices/settings/readiness.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";

const providerParam = z.object({ id: z.enum(providerIds) });
const healthQuery = z.object({ provider: z.enum(providerIds).optional() });
// ceiling: no format check is allowed on a key, so the only thing said about the value is
// that it is a string of a length a key could plausibly have. Raise the bound if a provider
// ever issues something longer.
const pathBody = z.object({ path: z.string().max(cliPathMaxLength) });
const keyBody = z.object({ key: z.string().min(1).max(4096) });
const modelId = z.string().min(1).max(200);
const switchBody = z
  .object({
    kind: z.enum(usageKinds),
    id: z.string().min(1).max(64),
    slot: z.enum(usageSlots),
    from: z.object({ provider: z.string().min(1).max(64), model: modelId }).strict(),
    to: modelId,
  })
  .strict();
const noFetch =
  "Slopify cannot reach the internet from here yet because it is still starting. Wait a moment, reload the page and try again.";

// The return type is inferred so Hono keeps the route types the SPA's client is
// generated from; see stagingRoutes.
export function providerRoutes(deps: AppDeps) {
  const keys: KeysDeps = { db: deps.db, clock: deps.clock };
  const readiness: ReadinessDeps = {
    db: deps.db,
    probe: deps.probe,
    hostCliStatus: deps.hostCliStatus,
    host: deps.speechHost,
  };
  const catalog = createModelCatalog({
    load: deps.modelsFor ?? (() => Promise.reject(new Error("Model catalog unavailable"))),
    fallback: deps.fallbackModelsFor ?? (() => []),
    now: () => deps.clock.now().getTime(),
    report: (provider) =>
      deps.log.write("warn", "model-catalog", { detail: `Could not load models for ${provider}` }),
  });

  const upkeep = () => ({ ...deps, uuid: deps.drafts?.uuid ?? randomUUID });

  return (
    new Hono()
      // The step lists Settings → Providers shows beside each key field.
      .get("/key-guides", (c) => c.json({ guides: keyGuides }))
      // What the first launch found, and the providers Play picks by default.
      .get("/first-run", async (c) => {
        c.header("Cache-Control", "no-store");
        return c.json(
          await firstRunStatus(
            { db: deps.db, ...(deps.modelsFor === undefined ? {} : { modelsFor: deps.modelsFor }) },
            await providerStatuses(readiness),
          ),
        );
      })
      .post("/first-run/dismiss", (c) => {
        dismissFirstRun(deps.db);
        return c.body(null, 204);
      })
      // "Check all": every CLI signed in, every key valid, every chosen model still offered.
      // `?provider=codex` checks that one only (a sign-in fix-it's Check again).
      .post("/health", zValidator("query", healthQuery, onInvalid), async (c) => {
        if (deps.fetch === undefined)
          return problem(c, { status: 503, title: titleOf(503), detail: noFetch });
        const catalogue = deps.catalogue;
        return c.json(
          await checkProviderHealth(
            {
              ...readiness,
              clock: deps.clock,
              fetch: deps.fetch,
              probes: keyProbes,
              ...(catalogue === undefined ? {} : { catalogue: () => catalogue.read() }),
              ...(deps.modelsFor === undefined ? {} : { modelsFor: deps.modelsFor }),
              ...(deps.cliLogin === undefined ? {} : { login: deps.cliLogin }),
            },
            c.req.valid("query").provider,
          ),
        );
      })
      // Checks for new, repriced and retired models now instead of waiting for the daily check.
      .post("/catalogue/check", async (c) => {
        if (!deps.catalogue?.sync)
          return problem(c, {
            status: 503,
            title: titleOf(503),
            detail:
              "The model list (models.yaml) is not loaded yet. Wait a moment and reload the page; if it stays like this, restart Slopify.",
          });
        await deps.catalogue.sync();
        return c.json(deps.catalogue.status());
      })
      // Every template, schedule, draft and unfinished project still using a retired model.
      .get("/catalogue/retired", (c) => {
        c.header("Cache-Control", "no-store");
        return c.json({
          usages:
            deps.catalogue === undefined ? [] : retiredModelUsage(deps.db, deps.catalogue.read()),
        });
      })
      .post("/catalogue/retired/switch", zValidator("json", switchBody, onInvalid), async (c) => {
        if (deps.catalogue === undefined)
          return problem(c, { status: 503, title: titleOf(503), detail: noFetch });
        const result = await switchRetiredModel(
          upkeep(),
          deps.catalogue.read(),
          c.req.valid("json"),
        );
        if (!result.ok)
          return problem(c, { status: 409, title: titleOf(409), detail: result.message });
        return c.json(result);
      })
      .post("/catalogue/retired/switch-all", async (c) => {
        if (deps.catalogue === undefined)
          return problem(c, { status: 503, title: titleOf(503), detail: noFetch });
        return c.json(await switchAllRetired(upkeep(), deps.catalogue.read()));
      })
      .get("/catalogue", (c) =>
        c.json(
          deps.catalogue?.status() ?? {
            warning:
              "The model list (models.yaml) is not loaded yet. Wait a moment and reload the page; if it stays like this, restart Slopify.",
          },
        ),
      )
      .post("/catalogue/refresh", async (c) => {
        if (!deps.catalogue)
          return problem(c, {
            status: 503,
            title: titleOf(503),
            detail:
              "The model list (models.yaml) is not loaded yet. Wait a moment and reload the page; if it stays like this, restart Slopify.",
          });
        try {
          await deps.catalogue.refresh();
        } catch {
          return problem(c, {
            status: 502,
            title: titleOf(502),
            detail:
              "Slopify could not download the latest model list. Your current list is still in use; check your internet connection and try Refresh again.",
          });
        }
        return c.json(deps.catalogue.status());
      })
      // What Settings draws its rails from and Play its dropdowns: every provider, with
      // the one fact that decides whether it is selectable.
      .get("/", async (c) => c.json({ providers: await providerStatuses(readiness) }))
      // The system voice's speech programs and their voices, for Settings → Voices' picker.
      .get("/system-voice/voices", async (c) => {
        const found = await detectSpeechCached(deps.probe, deps.speechHost ?? process);
        return c.json({
          engines: found.engines.map((engine) => ({
            id: engine.id,
            name: engine.name,
            voices: engine.voices,
            defaultVoice: defaultSpeechVoice(engine)?.id ?? null,
          })),
          issue: found.issue ?? null,
        });
      })
      .get("/:id/models", zValidator("param", providerParam, onInvalid), async (c) => {
        const { id } = c.req.valid("param");
        // Animate images lists the provider's image-to-video models, which only the catalogue
        // names.
        if (c.req.query("video") === "1")
          return c.json({
            models: deps.catalogue === undefined ? [] : videoModelsOf(deps.catalogue.read(), id),
            allowsCustom: false,
          });
        if (deps.catalogue && !isUncataloguedProvider(id))
          return c.json({
            models: deps.catalogue.models(id, providerById(id).family).map((m) => ({
              ...m,
              ...("llm" in m && m.llm.thinking
                ? { thinkingModes: Object.keys(m.llm.thinking) }
                : {}),
            })),
            allowsCustom: false,
            notice:
              "Curated active models from models.yaml. Edit it locally or refresh in Settings.",
            warning: deps.catalogue.status().warning ?? undefined,
          });
        const result = await catalog.get(
          id,
          providerById(id).family,
          c.req.query("refresh") === "1",
        );
        c.header("Cache-Control", "no-store");
        return c.json(result);
      })
      .put(
        "/:id/path",
        zValidator("param", providerParam, onInvalid),
        zValidator("json", pathBody, onInvalid),
        async (c) => {
          const result = await saveCliPath(
            readiness,
            c.req.valid("param").id,
            c.req.valid("json").path,
          );
          if (!result.ok)
            return problem(c, {
              status: 400,
              title: titleOf(400),
              detail: result.message,
              extensions: { fields: [{ field: "path", message: result.message }] },
            });
          catalog.invalidate(c.req.valid("param").id);
          return c.json(result.status);
        },
      )
      .put(
        "/:id/key",
        zValidator("param", providerParam, onInvalid),
        zValidator("json", keyBody, onInvalid),
        (c) => {
          const { id } = c.req.valid("param");
          const result = saveProviderKey(keys, id, c.req.valid("json").key);
          if (!result.ok) {
            return refusal(c, id, result.reason);
          }
          catalog.invalidate(id);
          // The response says a key is stored and shows the mask, never the value.
          return c.json(keyStatus(keys, id));
        },
      )
      // The Test button: the cheapest read the provider offers, answered in plain words. With
      // a `key` in the body, that pasted key is tried instead of the saved one and is neither
      // stored nor logged; with no body, the saved key is.
      .post("/:id/key/test", zValidator("param", providerParam, onInvalid), async (c) => {
        const { id } = c.req.valid("param");
        if (providerById(id).auth !== "key") return refusal(c, id, "cli-provider");
        if (deps.fetch === undefined)
          return problem(c, { status: 503, title: titleOf(503), detail: noFetch });
        const raw: unknown = await c.req.json().catch(() => undefined);
        const candidate = raw === undefined ? undefined : keyBody.safeParse(raw);
        if (candidate !== undefined && !candidate.success)
          return problem(c, {
            status: 400,
            title: titleOf(400),
            detail: `The pasted ${providerById(id).displayName} key could not be tested: it is empty or longer than any key. Paste the whole key in Settings → Providers → ${providerById(id).displayName}, then choose Test again.`,
          });
        return c.json(
          await testProviderKey(
            { db: deps.db, clock: deps.clock, fetch: deps.fetch, probes: keyProbes },
            id,
            candidate?.data.key,
          ),
        );
      })
      .delete("/:id/key", zValidator("param", providerParam, onInvalid), (c) => {
        const { id } = c.req.valid("param");
        const result = removeProviderKey(keys, id);
        if (!result.ok) {
          return refusal(c, id, result.reason);
        }
        catalog.invalidate(id);
        return c.body(null, 204);
      })
  );
}

function refusal(
  c: Context,
  id: ProviderId,
  reason: "blank" | "cli-provider" | "absent",
): Response {
  const name = providerById(id).displayName;
  if (reason === "cli-provider") {
    return problem(c, {
      status: 400,
      title: titleOf(400),
      detail:
        providerById(id).auth === "local"
          ? `${name} is your computer's own speech, so it has no API key to save. It works as soon as a speech program is installed.`
          : `${name} signs in through its own command-line tool, so it has no API key to save here. Sign in with that tool on your computer instead.`,
    });
  }
  if (reason === "absent") {
    return problem(c, {
      status: 404,
      title: titleOf(404),
      detail: `There is no saved API key for ${name}, so there is nothing to remove.`,
    });
  }
  return problem(c, {
    status: 400,
    title: titleOf(400),
    detail: "This API key cannot be saved yet. Paste the key and try again.",
    extensions: {
      fields: [{ field: "key", message: "Paste the API key from your provider's account page." }],
    },
  });
}
