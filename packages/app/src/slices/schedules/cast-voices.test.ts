import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { RunDraft } from "../admission/model.js";
import { defaultChannelId } from "../channels/model.js";
import { createCastMember, updateCastMember } from "../channels/service.js";
import { must, startFixture } from "../play-drafts/draft.fake.js";
import { reviewDraft } from "../play-drafts/review.js";
import type { PlayDraftDocument } from "../play-drafts/schema.js";
import { createDraft } from "../play-drafts/service.js";
import { startPlayDraft } from "../play-drafts/start.js";
import { templateById } from "../project-templates/repo.js";
import { createTemplate } from "../project-templates/service.js";
import { providerIds } from "../settings/model.js";
import { insertVoice } from "../settings/repo.js";
import { defaultVoicesSettings } from "../voices/model.js";
import { createScheduleRunner } from "./scheduler.js";
import { createSchedule } from "./service.js";

// Every run takes a cast speaker's voice from the cast as it is when the run starts. Play does
// it in its review (`play-drafts/review-inputs.ts`); a schedule and a Play batch of variations
// must start with the same voices, not the ones saved in the template or the draft.
function voicedFixture() {
  const h = startFixture();
  const tts = h.deps.catalogue.read().tts[0];
  if (tts === undefined) throw new Error("Missing model");
  const provider = z.enum(providerIds).parse(tts.provider);
  h.deps.db
    .prepare("INSERT INTO provider_keys(provider,key,updated_at) VALUES (?,hex(randomblob(32)),?)")
    .run(provider, "now");
  insertVoice(h.deps.db, { id: "v1", provider, name: "Old", voiceId: "old" });
  insertVoice(h.deps.db, { id: "v2", provider, name: "New", voiceId: "new" });
  const voice = { provider, model: tts.id, voice: "old" };
  const castId = randomUUID();
  const channel = { db: h.deps.db, clock: h.deps.clock, uuid: randomUUID };
  expect(
    createCastMember(channel, defaultChannelId, {
      id: castId,
      kind: "character",
      name: "Ada",
      voice,
    }).ok,
  ).toBe(true);
  const document: PlayDraftDocument = {
    ...h.document,
    form: {
      ...h.document.form,
      sources: { ...h.document.form.sources, audio: "generate" },
      audio: voice,
      voices: {
        ...defaultVoicesSettings("podcast"),
        speakers: [
          { id: "cast-ada", name: "Ada", role: "host", voice, castId },
          { id: "sam", name: "Sam", role: "host", voice },
        ],
      },
    },
  };
  // The cast member's voice changes after the template or draft was saved.
  expect(
    updateCastMember(channel, castId, {
      kind: "character",
      name: "Ada",
      voice: { ...voice, voice: "new", pace: 1.1 },
      baseVersion: 1,
    }).ok,
  ).toBe(true);
  const deps = {
    ...h.deps,
    providers: async () => [
      {
        id: provider,
        family: "tts" as const,
        displayName: "TTS",
        readiness: { kind: "keyed" as const, hasKey: true },
      },
    ],
    modelsFor: async () => [{ id: tts.id, name: tts.name }],
  };
  const speakers = (projectId: string) =>
    (
      JSON.parse(
        String(h.deps.db.prepare("SELECT config FROM projects WHERE id=?").get(projectId)?.config),
      ) as RunDraft
    ).voices?.speakers.map((one) => [one.id, one.voice.voice, one.pace]);
  return { h, deps, document, speakers };
}
const refreshed = [
  ["cast-ada", "new", 1.1],
  ["sam", "old", undefined],
];

describe("cast voices on every start path", () => {
  it("a scheduled run starts with the cast's current voices", async () => {
    const { h, deps, document, speakers } = voicedFixture();
    try {
      const templateId = randomUUID();
      const scheduleId = randomUUID();
      expect(createTemplate(deps, { id: templateId, name: "Podcast", document }).ok).toBe(true);
      const scheduled = {
        ...deps,
        template: (id: string) => templateById(deps.db, id),
      };
      expect(
        createSchedule(scheduled, {
          id: scheduleId,
          name: "Daily podcast",
          templateId,
          templateVersion: 1,
          cadence: { kind: "daily", time: "00:01" },
          timezone: "UTC",
          missedPolicy: "skip",
          overlapPolicy: "skip",
          spendLimitCents: null,
          items: [{ title: "First topic", values: {} }],
        }).ok,
      ).toBe(true);
      await createScheduleRunner(scheduled).tick(new Date("2026-09-12T00:01:30.000Z"));
      const run = deps.db
        .prepare("SELECT status,error,project_ids_json FROM schedule_runs WHERE schedule_id=?")
        .get(scheduleId);
      expect(run).toMatchObject({ status: "succeeded", error: null });
      const [projectId] = JSON.parse(String(run?.project_ids_json)) as string[];
      expect(speakers(projectId ?? "")).toEqual(refreshed);
    } finally {
      h.close();
    }
  });

  it("every video of a Play batch starts with the cast's current voices", async () => {
    const { h, deps, document, speakers } = voicedFixture();
    try {
      const id = randomUUID();
      must(
        createDraft(deps, {
          id,
          document: {
            ...document,
            variants: [{ id: randomUUID(), title: "Second", values: {} }],
          },
        }),
      );
      const review = must(await reviewDraft(deps, { id, baseVersion: 1 }));
      const started = must(
        await startPlayDraft(deps, { draftId: id, baseVersion: 1, reviewId: review.id }),
      );
      expect(started.projectIds).toHaveLength(2);
      for (const projectId of started.projectIds) expect(speakers(projectId)).toEqual(refreshed);
    } finally {
      h.close();
    }
  });
});
