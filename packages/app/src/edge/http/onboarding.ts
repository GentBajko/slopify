import { randomUUID } from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { firstRunView } from "../../slices/onboarding/first-run.js";
import { installPack } from "../../slices/onboarding/install.js";
import { quickShortInputSchema } from "../../slices/onboarding/model.js";
import { packById, starterSet } from "../../slices/onboarding/packs.js";
import { planShortProviders, shortDraft } from "../../slices/onboarding/quick-short.js";
import {
  copySample,
  restoreSample,
  type SampleDeps,
  sampleProjectId,
} from "../../slices/onboarding/sample.js";
import {
  dismissFirstRun,
  recordShortRequest,
  shortRequestProject,
} from "../../slices/onboarding/state.js";
import { providerStatuses } from "../../slices/settings/readiness.js";
import { listVoices } from "../../slices/settings/repo.js";
import { projectTitle } from "../../slices/storage/repo.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";
import { createProject } from "./project-create.js";

const packParam = z.object({ id: z.string().min(1).max(40) });

// The first five minutes: the first-run screen's state, starter packs, "Make a 60-second
// short" and the bundled sample's Restore and Make my own copy.
export function onboardingRoutes(deps: AppDeps) {
  const statuses = () =>
    providerStatuses({ db: deps.db, probe: deps.probe, hostCliStatus: deps.hostCliStatus });
  const templates = { ...deps, uuid: randomUUID };
  const sample: SampleDeps = {
    db: deps.db,
    paths: deps.paths,
    clock: deps.clock,
    ids: deps.ids,
    log: deps.log,
    appVersion: deps.version,
    hasInflight: deps.runner.hasInflight,
    ...(deps.sampleArchive === undefined ? {} : { archive: deps.sampleArchive }),
  };
  return new Hono()
    .get("/", async (c) => {
      c.header("Cache-Control", "no-store");
      return c.json(firstRunView(deps.db, await statuses(), deps.clock.now().toISOString()));
    })
    .post("/dismiss", (c) => {
      dismissFirstRun(deps.db, deps.clock.now().toISOString());
      return c.json({ dismissed: true });
    })
    .post("/packs/:id", zValidator("param", packParam, onInvalid), (c) => {
      const installed = installPack(templates, c.req.valid("param").id);
      if (!installed.ok)
        return problem(c, {
          status: 404,
          title: titleOf(404),
          detail:
            "Slopify doesn't have that starter pack. Reload the page and pick one of the packs listed.",
        });
      return c.json(installed.value);
    })
    .post("/short", zValidator("json", quickShortInputSchema, onInvalid), async (c) => {
      const input = c.req.valid("json");
      const earlier = shortRequestProject(deps.db, input.requestId);
      if (earlier !== undefined && projectTitle(deps.db, earlier) !== undefined)
        return c.json({ projectId: earlier, replayed: true });
      const pack = input.packId === undefined ? starterSet : packById(input.packId);
      if (pack === undefined)
        return problem(c, {
          status: 404,
          title: titleOf(404),
          detail:
            "Slopify doesn't have that starter pack. Reload the page and pick one of the packs listed.",
        });
      const modelsFor = deps.modelsFor;
      if (modelsFor === undefined)
        return problem(c, {
          status: 503,
          title: titleOf(503),
          detail:
            "Slopify can't list the models on this machine right now. Restart Slopify and try again.",
        });
      const plan = await planShortProviders({
        statuses: await statuses(),
        voices: listVoices(deps.db),
        modelsFor,
        suggested: pack.voice,
      });
      if (!plan.ok)
        return problem(c, {
          status: 409,
          title: titleOf(409),
          detail: plan.gaps.map((gap) => gap.message).join(" "),
          extensions: { gaps: plan.gaps },
        });
      const installed = installPack(templates, pack.id, { template: false });
      if (!installed.ok)
        return problem(c, {
          status: 404,
          title: titleOf(404),
          detail:
            "Slopify doesn't have that starter pack. Reload the page and pick one of the packs listed.",
        });
      const created = await createProject(
        deps,
        shortDraft({
          topic: input.topic,
          pack,
          names: installed.value.prompts,
          providers: plan.providers,
        }),
      );
      if (!created.ok)
        return problem(c, {
          status: created.status,
          title: titleOf(created.status),
          detail:
            `${created.detail} ${created.fields.map((field) => field.message).join(" ")}`.trim(),
          ...(created.fields.length === 0 ? {} : { extensions: { fields: created.fields } }),
        });
      recordShortRequest(deps.db, input.requestId, created.project.id);
      return c.json({ projectId: created.project.id, replayed: false }, 201);
    })
    .get("/sample", (c) => c.json({ projectId: sampleProjectId(deps.db) ?? null }))
    .post("/sample/restore", async (c) => {
      const restored = await restoreSample(sample);
      if (!restored.ok)
        return problem(c, {
          status: restored.status,
          title: titleOf(restored.status),
          detail: restored.detail,
        });
      return c.json({ projectId: restored.projectId });
    })
    .post("/sample/copy", (c) => {
      const catalogue = deps.catalogue;
      const id = sampleProjectId(deps.db);
      if (catalogue === undefined || id === undefined)
        return problem(c, {
          status: 404,
          title: titleOf(404),
          detail:
            "The sample project isn't here. Bring it back with Settings → Backup & storage → Restore sample, then press Make my own copy.",
        });
      const copied = copySample({ ...sample, catalogue: catalogue.read() }, id);
      if (!copied.ok)
        return problem(c, {
          status: copied.status,
          title: titleOf(copied.status),
          detail: copied.detail,
        });
      deps.hub.emitGlobal({ type: "project.updated", projectId: copied.projectId });
      return c.json({ projectId: copied.projectId }, 201);
    });
}
