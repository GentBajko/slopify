import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { createPrompt } from "../src/slices/library/save.js";
import { must, startFixture } from "../src/slices/play-drafts/draft.fake.js";
import { reviewDraft } from "../src/slices/play-drafts/review.js";
import { startPlayDraft } from "../src/slices/play-drafts/start.js";
import { templateById } from "../src/slices/project-templates/repo.js";
import { createTemplate, instantiateTemplate } from "../src/slices/project-templates/service.js";
import { createScheduleRunner } from "../src/slices/schedules/scheduler.js";
import { createSchedule } from "../src/slices/schedules/service.js";
import { providers } from "../src/slices/settings/model.js";
import { insertVoice } from "../src/slices/settings/repo.js";
import { exportPortable, importPortable } from "../src/slices/storage/portable.js";

it("reviews and schedules portable frozen preparation prompts after library deletion and restart", async () => {
  const source = startFixture();
  const target = startFixture();
  try {
    const llm = source.deps.catalogue.read().llm[0];
    if (!llm) throw new Error("Missing text model");
    expect(
      createPrompt(source.deps, {
        kind: "narration",
        name: "Delivery",
        body: "Use {{Delivery Style}} delivery.",
      }).ok,
    ).toBe(true);
    insertVoice(source.deps.db, { id: "v", name: "Voice", provider: "inworld", voiceId: "v" });
    const document = {
      ...source.document,
      form: {
        ...source.document.form,
        narrationPrompt: "Delivery",
        sources: { ...source.document.form.sources, audio: "generate" as const },
        llm: { provider: llm.provider, model: llm.id },
        audio: { provider: "inworld", model: "inworld-tts-2", voice: "v" },
        values: { "Delivery Style": "calm" },
      },
    };
    const templateId = randomUUID();
    expect(createTemplate(source.deps, { id: templateId, name: "Prepared", document }).ok).toBe(
      true,
    );
    const archive = exportPortable({
      ...source.deps,
      now: () => source.deps.clock.now().toISOString(),
    });
    expect(
      importPortable({ ...target.deps, now: () => target.deps.clock.now().toISOString() }, archive)
        .templates,
    ).toBe(1);
    target.deps.db.exec("DELETE FROM prompts");
    target.reopen();
    const draft = instantiateTemplate(target.deps, { templateId, version: 1, id: randomUUID() });
    if (!draft.ok) throw new Error(JSON.stringify(draft));
    const review = must(
      await reviewDraft(target.deps, { id: draft.value.draft.id, baseVersion: 1 }),
    );
    expect(review.runs[0]?.draft.sources.article).toBe("provide");
    expect(review.runs[0]?.rendered.narration).toBe("Use calm delivery.");
    expect(review.runs[0]?.templates.narration).toBe("Use {{Delivery Style}} delivery.");
    const input = { draftId: draft.value.draft.id, baseVersion: 1, reviewId: review.id };
    expect(await startPlayDraft(target.deps, input)).toMatchObject({
      ok: false,
      reason: "readiness",
      fields: expect.arrayContaining([expect.objectContaining({ field: "llm" })]),
    });
    expect(target.deps.db.prepare("SELECT count(*) AS n FROM projects").get()?.n).toBe(0);
    const deps = {
      ...target.deps,
      providers: async () =>
        providers
          .filter((provider) => [llm.provider, "inworld"].includes(provider.id))
          .map((provider) => ({
            ...provider,
            readiness: { kind: "cli" as const, installed: true },
          })),
      template: (id: string, version: number) => templateById(target.deps.db, id, version),
    };
    const scheduleId = randomUUID();
    expect(
      createSchedule(deps, {
        id: scheduleId,
        name: "Prepared schedule",
        templateId,
        templateVersion: 1,
        cadence: { kind: "once", at: "2026-09-12T00:01:00.000Z" },
        timezone: "UTC",
        missedPolicy: "skip",
        overlapPolicy: "skip",
        spendLimitCents: null,
        items: [],
      }).ok,
    ).toBe(true);
    await createScheduleRunner(deps).tick(new Date("2026-09-12T00:01:30.000Z"));
    expect(
      target.deps.db
        .prepare("SELECT status,error FROM schedule_runs WHERE schedule_id=?")
        .get(scheduleId),
    ).toEqual({ status: "succeeded", error: null });
    const config = String(target.deps.db.prepare("SELECT config FROM projects").get()?.config);
    expect(JSON.parse(config)).toMatchObject({
      narrationPrompt: "Delivery",
      rendered: { narration: "Use calm delivery." },
    });
    expect(target.deps.db.prepare("SELECT count(*) AS n FROM attempts").get()?.n).toBe(0);
    expect(target.ticks).toHaveLength(1);
  } finally {
    source.close();
    target.close();
  }
});
