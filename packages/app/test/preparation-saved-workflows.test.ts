import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { runConfigSchema } from "../src/slices/admission/schema.js";
import { createPrompt } from "../src/slices/library/save.js";
import { must, startFixture } from "../src/slices/play-drafts/draft.fake.js";
import { reviewDraft } from "../src/slices/play-drafts/review.js";
import { createDraft, readDraft, saveDraft } from "../src/slices/play-drafts/service.js";
import { startPlayDraft } from "../src/slices/play-drafts/start.js";
import { templateById } from "../src/slices/project-templates/repo.js";
import { createTemplate, instantiateTemplate } from "../src/slices/project-templates/service.js";
import { createScheduleRunner } from "../src/slices/schedules/scheduler.js";
import { createSchedule } from "../src/slices/schedules/service.js";
import { providers } from "../src/slices/settings/model.js";
import { insertVoice } from "../src/slices/settings/repo.js";
import { exportPortable, importPortable } from "../src/slices/storage/portable.js";

it.each([undefined, false, true])(
  "reviews and schedules portable preparation with pronunciation preference %s after restart",
  async (preference) => {
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
      const audio = {
        provider: "inworld",
        model: "inworld-tts-2",
        voice: "v",
        ...(preference === undefined ? {} : { usePronunciationGlossary: preference }),
      };
      const document = {
        ...source.document,
        form: {
          ...source.document.form,
          narrationPrompt: "Delivery",
          sources: { ...source.document.form.sources, audio: "generate" as const },
          llm: { provider: llm.provider, model: llm.id },
          audio,
          values: { "Delivery Style": "calm" },
        },
      };
      const draftId = randomUUID();
      const created = must(createDraft(source.deps, { id: draftId, document }));
      const edited = { ...document, form: { ...document.form, title: "Saved pronunciation" } };
      must(
        saveDraft(source.deps, {
          id: draftId,
          baseVersion: created.draft.version,
          mutationId: randomUUID(),
          document: edited,
        }),
      );
      source.reopen();
      const reopened = must(readDraft(source.deps, draftId));
      expect(reopened.draft.document.form.audio).toStrictEqual(audio);
      expect(Object.hasOwn(reopened.draft.document.form.audio, "usePronunciationGlossary")).toBe(
        preference !== undefined,
      );
      expect(source.ticks).toEqual([]);
      expect(source.deps.db.prepare("SELECT count(*) AS n FROM attempts").get()?.n).toBe(0);
      const templateId = randomUUID();
      expect(
        createTemplate(source.deps, {
          id: templateId,
          name: "Prepared",
          document: reopened.draft.document,
        }).ok,
      ).toBe(true);
      const local = instantiateTemplate(source.deps, { templateId, version: 1, id: randomUUID() });
      if (!local.ok) throw new Error(JSON.stringify(local));
      expect(local.value.draft.document.form.audio).toStrictEqual(audio);
      expect(source.deps.db.prepare("SELECT count(*) AS n FROM projects").get()?.n).toBe(0);
      expect(source.ticks).toEqual([]);
      const archive = exportPortable({
        ...source.deps,
        now: () => source.deps.clock.now().toISOString(),
      });
      expect(
        importPortable(
          { ...target.deps, now: () => target.deps.clock.now().toISOString() },
          archive,
        ).templates,
      ).toBe(1);
      target.deps.db.exec("DELETE FROM prompts");
      target.reopen();
      expect(templateById(target.deps.db, templateId, 1)?.document.form.audio).toStrictEqual(audio);
      expect(target.ticks).toEqual([]);
      expect(target.deps.db.prepare("SELECT count(*) AS n FROM projects").get()?.n).toBe(0);
      expect(target.deps.db.prepare("SELECT count(*) AS n FROM attempts").get()?.n).toBe(0);
      const draft = instantiateTemplate(target.deps, { templateId, version: 1, id: randomUUID() });
      if (!draft.ok) throw new Error(JSON.stringify(draft));
      expect(draft.value.draft.document.form.audio).toStrictEqual(audio);
      expect(Object.hasOwn(draft.value.draft.document.form.audio, "usePronunciationGlossary")).toBe(
        preference !== undefined,
      );
      const review = must(
        await reviewDraft(target.deps, { id: draft.value.draft.id, baseVersion: 1 }),
      );
      expect(review.runs[0]?.draft.sources.article).toBe("provide");
      // With the glossary on, the run shares pronunciations unless the draft turned it off.
      expect(review.runs[0]?.draft.audio).toStrictEqual(
        preference === true ? { ...audio, shareGlossary: true } : audio,
      );
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
      expect(target.ticks).toEqual([]);
      expect(target.deps.db.prepare("SELECT count(*) AS n FROM projects").get()?.n).toBe(0);
      expect(target.deps.db.prepare("SELECT count(*) AS n FROM attempts").get()?.n).toBe(0);
      await createScheduleRunner(deps).tick(new Date("2026-09-12T00:01:30.000Z"));
      expect(
        target.deps.db
          .prepare("SELECT status,error FROM schedule_runs WHERE schedule_id=?")
          .get(scheduleId),
      ).toEqual({ status: "succeeded", error: null });
      const config = String(target.deps.db.prepare("SELECT config FROM projects").get()?.config);
      const scheduled = runConfigSchema.parse(JSON.parse(config));
      expect(scheduled).toMatchObject({
        narrationPrompt: "Delivery",
        rendered: { narration: "Use calm delivery." },
      });
      expect(scheduled.audio).toStrictEqual(
        preference === true ? { ...audio, shareGlossary: true } : audio,
      );
      expect(Object.hasOwn(scheduled.audio ?? {}, "usePronunciationGlossary")).toBe(
        preference !== undefined,
      );
      expect(target.deps.db.prepare("SELECT count(*) AS n FROM attempts").get()?.n).toBe(0);
      expect(target.ticks).toHaveLength(1);
    } finally {
      source.close();
      target.close();
    }
  },
);
