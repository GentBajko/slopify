import { randomUUID } from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import {
  defaultSpeechVoice,
  detectSpeechCached,
  primaryLanguage,
} from "../../kernel/ports/system-speech.js";
import { loudnessOfDefault } from "../../slices/loudness/model.js";
import { firstRunView } from "../../slices/onboarding/first-run.js";
import { fullVideoDraft } from "../../slices/onboarding/full-video.js";
import { installPack } from "../../slices/onboarding/install.js";
import {
  fullVideoInputSchema,
  quickShortInputSchema,
  sampleCopyInputSchema,
} from "../../slices/onboarding/model.js";
import { packById, starterSet } from "../../slices/onboarding/packs.js";
import {
  planShortProviders,
  type SystemVoicePick,
  shortDraft,
} from "../../slices/onboarding/quick-short.js";
import {
  copySample,
  restoreSamples,
  type SampleDeps,
  sampleProjectIds,
} from "../../slices/onboarding/sample.js";
import {
  dismissFirstRun,
  recordShortRequest,
  shortRequestProject,
} from "../../slices/onboarding/state.js";
import { systemVoiceProvider } from "../../slices/settings/model.js";
import { readSettings } from "../../slices/settings/playback.js";
import { providerStatuses } from "../../slices/settings/readiness.js";
import { listVoices } from "../../slices/settings/repo.js";
import { addVoice } from "../../slices/settings/voices.js";
import { projectTitle } from "../../slices/storage/repo.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";
import { createProject } from "./project-create.js";

const packParam = z.object({ id: z.string().min(1).max(40) });

// The first five minutes: the first-run screen's state, starter packs, "Make a 60-second
// short" and the bundled samples' Restore and Make my own copy.
export function onboardingRoutes(deps: AppDeps) {
  const statuses = () =>
    providerStatuses({
      db: deps.db,
      probe: deps.probe,
      hostCliStatus: deps.hostCliStatus,
      host: deps.speechHost,
    });
  const speech = () => detectSpeechCached(deps.probe, deps.speechHost ?? process);
  // The best speech program found and its English voice, for a short made without a voice key.
  const systemVoicePick = async (): Promise<SystemVoicePick | undefined> => {
    const engine = (await speech()).engines[0];
    const voice = engine === undefined ? undefined : defaultSpeechVoice(engine);
    return engine === undefined || voice === undefined
      ? undefined
      : { model: engine.id, voiceId: voice.id, name: voice.name };
  };
  const templates = { ...deps, uuid: randomUUID };
  const sample: SampleDeps = {
    db: deps.db,
    paths: deps.paths,
    clock: deps.clock,
    ids: deps.ids,
    log: deps.log,
    appVersion: deps.version,
    hasInflight: deps.runner.hasInflight,
    ...(deps.sampleArchives === undefined ? {} : { archives: deps.sampleArchives }),
  };
  return new Hono()
    .get("/", async (c) => {
      c.header("Cache-Control", "no-store");
      return c.json(firstRunView(deps.db, await statuses()));
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
        systemVoice: await systemVoicePick(),
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
      // The computer's voice is saved like any other, so Play and a later rebuild offer it.
      const audio = plan.providers.audio;
      if (
        plan.systemVoice &&
        !listVoices(deps.db).some(
          (voice) => voice.provider === audio.provider && voice.voiceId === audio.voice,
        )
      ) {
        const found = await speech();
        const spoken = found.engines
          .flatMap((engine) => engine.voices)
          .find((voice) => voice.id === audio.voice);
        const language = spoken === undefined ? undefined : primaryLanguage(spoken);
        addVoice(
          { db: deps.db, ids: deps.ids },
          {
            provider: systemVoiceProvider,
            name: `${spoken?.name ?? audio.voice} (computer voice)`,
            voiceId: audio.voice,
            ...(language === undefined ? {} : { languages: [language] }),
          },
        );
      }
      const created = await createProject(
        deps,
        shortDraft({
          topic: input.topic,
          pack,
          names: installed.value.prompts,
          providers: plan.providers,
          loudness: loudnessOfDefault(readSettings({ db: deps.db, log: deps.log }).loudness),
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
      // A real project now exists, so the first-run screen is done with.
      dismissFirstRun(deps.db, deps.clock.now().toISOString());
      return c.json({ projectId: created.project.id, replayed: false }, 201);
    })
    .post("/full-video", zValidator("json", fullVideoInputSchema, onInvalid), (c) => {
      const made = fullVideoDraft(templates, c.req.valid("json"));
      if (made.ok) return c.json(made.value, 201);
      if (made.reason === "not-found")
        return problem(c, {
          status: 404,
          title: titleOf(404),
          detail:
            "This short or its starter pack is no longer here, so Play couldn't be set up from it. Open Play and pick a template yourself.",
        });
      if (made.reason === "not-short")
        return problem(c, {
          status: 409,
          title: titleOf(409),
          detail:
            "This project is already a long video. Open Play to start another one on a new topic.",
        });
      return problem(c, {
        status: 409,
        title: titleOf(409),
        detail:
          "Slopify couldn't open a Play draft for the full video. Press Make the full video on this topic again; if it keeps failing, open Play and pick the pack's template in Library → Templates.",
        extensions: { reason: made.reason },
      });
    })
    .get("/sample", (c) => {
      const samples = sampleProjectIds(deps.db);
      return c.json({ projectId: samples.library, samples });
    })
    .post("/sample/restore", async (c) => {
      const restored = await restoreSamples(sample);
      if (!restored.ok)
        return problem(c, {
          status: restored.status,
          title: titleOf(restored.status),
          detail: restored.detail,
        });
      return c.json({ projectId: restored.samples.library, samples: restored.samples });
    })
    .post("/sample/copy", async (c) => {
      // Which sample to copy is in the body; without one, the Library of Alexandria.
      const body: unknown = await c.req.json().catch(() => ({}));
      const input = sampleCopyInputSchema.safeParse(body ?? {});
      if (!input.success)
        return problem(c, {
          status: 400,
          title: titleOf(400),
          detail: "Slopify couldn't tell which sample to copy. Reload the page and try again.",
        });
      const catalogue = deps.catalogue;
      const id = input.data.projectId ?? sampleProjectIds(deps.db).library ?? undefined;
      if (catalogue === undefined || id === undefined)
        return problem(c, {
          status: 404,
          title: titleOf(404),
          detail:
            "The sample project isn't here. Bring it back with Settings → Backup & storage → Restore samples, then press Make my own copy.",
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
