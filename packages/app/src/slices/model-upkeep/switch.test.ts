import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Catalogue } from "../../catalog/schema.js";
import { parseCatalogue } from "../../catalog/store.js";
import { insertProject, projectById } from "../admission/repo.js";
import { runConfigSchema } from "../admission/schema.js";
import { insertStage } from "../admission/stage-writes.js";
import { draftFixture } from "../play-drafts/draft.fake.js";
import type { PlayDraftDocument } from "../play-drafts/model.js";
import { templateById } from "../project-templates/repo.js";
import { createTemplate, updateTemplate } from "../project-templates/service.js";
import { gatesOf, writeGate } from "../template-studio/repo.js";
import { runnableTemplate } from "../template-studio/schedule-gate.js";
import { defaultVideoEdit } from "../video/edit-settings.js";
import {
  requestOf,
  type SwitchRequest,
  switchConfig,
  switchForm,
  switchRetiredModel,
} from "./switch.js";
import { retiredModelUsage } from "./usage.js";

// `switch.ts` on its own: the pure form and config rewrites for every slot, and the one-click
// switch for the cases the usage tests (usage.test.ts) don't reach.

const bundled = parseCatalogue(
  readFileSync(new URL("../../assets/models.yaml", import.meta.url), "utf8"),
);
const retiredId = "google/gemini-3.1-pro-preview";
const catalogue: Catalogue = {
  ...bundled,
  llm: bundled.llm.map((row) => (row.id === retiredId ? { ...row, deprecated: true } : row)),
};
const activeLlm =
  bundled.llm.find((row) => row.provider === "openrouter" && row.id !== retiredId && row.enabled)
    ?.id ?? "";

let h: ReturnType<typeof draftFixture>;
beforeEach(() => {
  h = draftFixture();
});
afterEach(() => {
  h.close();
});

const request = (over: Partial<SwitchRequest>): SwitchRequest => ({
  kind: "template",
  id: "t",
  slot: "llm",
  from: { provider: "openrouter", model: retiredId },
  to: activeLlm,
  ...over,
});

function form(): PlayDraftDocument["form"] {
  return {
    ...h.document.form,
    title: "Moon",
    llm: { provider: "openrouter", model: retiredId },
    audio: { provider: "elevenlabs", model: "old-voice", voice: "v1" },
    images: { ...h.document.form.images, provider: "fal", model: "old-image" },
    videoEdit: { ...defaultVideoEdit, animate: "every", animateModel: "old-video" },
  };
}

describe("switchForm", () => {
  it("replaces only the named slot's model", () => {
    const base = form();
    expect(activeLlm).not.toBe("");
    expect(switchForm(base, catalogue, request({}))?.llm).toEqual({
      provider: "openrouter",
      model: activeLlm,
    });
    const audio = switchForm(
      base,
      catalogue,
      request({ slot: "audio", from: { provider: "elevenlabs", model: "old-voice" }, to: "new" }),
    );
    expect(audio?.audio).toEqual({ provider: "elevenlabs", model: "new", voice: "v1" });
    expect(audio?.llm).toEqual(base.llm);
    const images = switchForm(
      base,
      catalogue,
      request({ slot: "images", from: { provider: "fal", model: "old-image" }, to: "new" }),
    );
    expect(images?.images.model).toBe("new");
    const animate = switchForm(
      base,
      catalogue,
      request({ slot: "animate", from: { provider: "fal", model: "old-video" }, to: "new" }),
    );
    expect(animate?.videoEdit?.animateModel).toBe("new");
    expect(animate?.images.model).toBe("old-image");
  });

  it("changes nothing when the form no longer picks the model", () => {
    const base = form();
    expect(
      switchForm(base, catalogue, request({ from: { provider: "openrouter", model: "other" } })),
    ).toBeUndefined();
    const still = { ...base, videoEdit: { ...defaultVideoEdit, animate: "off" as const } };
    expect(
      switchForm(
        still,
        catalogue,
        request({ slot: "animate", from: { provider: "fal", model: "" }, to: "new" }),
      ),
    ).toBeUndefined();
  });

  it("keeps a thinking level only where the new model offers it", () => {
    const thinking = {
      ...form(),
      llm: { provider: "openrouter", model: retiredId, thinking: "high" as const },
    };
    const switched = switchForm(thinking, catalogue, request({}));
    const offers = catalogue.llm.find((row) => row.id === activeLlm)?.llm.thinking?.high;
    expect(switched?.llm.thinking).toBe(offers === undefined ? undefined : "high");
  });
});

describe("switchConfig", () => {
  const config = () =>
    runConfigSchema.parse({
      title: "Moon",
      format: "16:9",
      sources: {
        research: "off",
        article: "generate",
        audio: "off",
        images: "off",
        thumbnail: "off",
        video: "off",
      },
      llm: { provider: "openrouter", model: retiredId },
      imagePrompts: [],
      values: {},
      provided: {},
      silenceGapSeconds: 3,
      articlePrompt: "Story",
      rendered: { article: "Write about the moon." },
    });

  it("replaces the project's model and leaves a slot it doesn't use alone", () => {
    expect(switchConfig(config(), catalogue, request({ kind: "project" }))?.llm?.model).toBe(
      activeLlm,
    );
    expect(
      switchConfig(
        config(),
        catalogue,
        request({ slot: "audio", from: { provider: "elevenlabs", model: "x" }, to: "y" }),
      ),
    ).toBeUndefined();
    expect(
      switchConfig(
        config(),
        catalogue,
        request({ slot: "animate", from: { provider: "fal", model: "x" }, to: "y" }),
      ),
    ).toBeUndefined();
  });
});

describe("switchRetiredModel", () => {
  it("switches a schedule on its template's latest version through that template", async () => {
    const templateId = randomUUID();
    const made = createTemplate(h.deps, {
      id: templateId,
      name: "Weekly",
      document: { ...h.document, form: form() },
    });
    expect(made.ok).toBe(true);
    const scheduleId = randomUUID();
    h.deps.db
      .prepare(
        `INSERT INTO schedules (id,name,template_id,template_version,cadence_json,timezone,missed_policy,
          overlap_policy,spend_limit_cents,items_json,status,version,creation_hash,next_run_at,created_at,updated_at)
         VALUES (?,'Weekly run',?,1,'{}','UTC','skip','skip',NULL,'[]','active',1,'h',NULL,'t','t')`,
      )
      .run(scheduleId, templateId);
    const usage = retiredModelUsage(h.deps.db, catalogue).find((one) => one.kind === "schedule");
    expect(usage).toBeDefined();
    if (usage === undefined) return;
    const result = await switchRetiredModel(h.deps, catalogue, requestOf(usage));
    expect(result).toEqual({ ok: true, changed: true });
    expect(templateById(h.deps.db, templateId)?.document.form.llm.model).toBe(
      usage.replacement?.id,
    );
    expect(
      h.deps.db.prepare("SELECT template_version FROM schedules WHERE id=?").get(scheduleId)
        ?.template_version,
    ).toBe(2);
  });

  it("carries a runnable version's gate onto the version it makes, so its schedules keep running", async () => {
    const templateId = randomUUID();
    expect(
      createTemplate(h.deps, {
        id: templateId,
        name: "Weekly",
        document: { ...h.document, form: form() },
      }).ok,
    ).toBe(true);
    writeGate(h.deps.db, templateId, { version: 1, state: "ready", carriedFrom: null });
    const result = await switchRetiredModel(h.deps, catalogue, request({ id: templateId }));
    expect(result).toEqual({ ok: true, changed: true });
    expect(gatesOf(h.deps.db, templateId)).toEqual([
      { version: 1, state: "ready", carriedFrom: null },
      { version: 2, state: "carried", carriedFrom: 1 },
    ]);
  });

  it("carries no gate from a version that was never checked", async () => {
    const templateId = randomUUID();
    expect(
      createTemplate(h.deps, {
        id: templateId,
        name: "Weekly",
        document: { ...h.document, form: form() },
      }).ok,
    ).toBe(true);
    await switchRetiredModel(h.deps, catalogue, request({ id: templateId }));
    expect(templateById(h.deps.db, templateId)?.version).toBe(2);
    expect(gatesOf(h.deps.db, templateId)).toEqual([]);
  });

  // The head is the person's unchecked edit and an older ready version is what schedules run:
  // the switch must reach the version that runs, or the schedule keeps the retired model.
  function readyThenUnchecked(headForm: PlayDraftDocument["form"]): {
    readonly templateId: string;
    readonly scheduleId: string;
  } {
    const templateId = randomUUID();
    expect(
      createTemplate(h.deps, {
        id: templateId,
        name: "Weekly",
        document: { ...h.document, form: form() },
      }).ok,
    ).toBe(true);
    writeGate(h.deps.db, templateId, { version: 1, state: "ready", carriedFrom: null });
    expect(
      updateTemplate(h.deps, {
        id: templateId,
        name: "Weekly (edited)",
        document: { ...h.document, form: headForm },
        baseVersion: 1,
        mutationId: randomUUID(),
      }).ok,
    ).toBe(true);
    const scheduleId = randomUUID();
    h.deps.db
      .prepare(
        `INSERT INTO schedules (id,name,template_id,template_version,cadence_json,timezone,missed_policy,
          overlap_policy,spend_limit_cents,items_json,status,version,creation_hash,next_run_at,created_at,updated_at)
         VALUES (?,'Weekly run',?,2,'{}','UTC','skip','skip',NULL,'[]','active',1,'h',NULL,'t','t')`,
      )
      .run(scheduleId, templateId);
    return { templateId, scheduleId };
  }

  it("switches the ready version a schedule runs when the head is unchecked, keeping the head as the newest version", async () => {
    const { templateId, scheduleId } = readyThenUnchecked({ ...form(), title: "Edited" });
    const usage = retiredModelUsage(h.deps.db, catalogue).find(
      (one) => one.kind === "schedule" && one.id === scheduleId && one.slot === "llm",
    );
    expect(usage).toBeDefined();
    if (usage === undefined) return;
    expect(await switchRetiredModel(h.deps, catalogue, requestOf(usage))).toEqual({
      ok: true,
      changed: true,
    });
    // Version 3: what ran (version 1) with the model switched, carried so schedules run it.
    expect(gatesOf(h.deps.db, templateId)).toEqual([
      { version: 1, state: "ready", carriedFrom: null },
      { version: 3, state: "carried", carriedFrom: 1 },
    ]);
    const runs = runnableTemplate(h.deps.db, templateId);
    expect(runs?.version).toBe(3);
    expect(runs?.document.form.llm.model).toBe(usage.replacement?.id);
    expect(runs?.document.form.title).toBe("Moon");
    expect(runs?.name).toBe("Weekly");
    // Version 4: the person's unchecked edit, switched too, still the head and still unchecked.
    const head = templateById(h.deps.db, templateId);
    expect(head?.version).toBe(4);
    expect(head?.name).toBe("Weekly (edited)");
    expect(head?.document.form.title).toBe("Edited");
    expect(head?.document.form.llm.model).toBe(usage.replacement?.id);
    expect(retiredModelUsage(h.deps.db, catalogue).filter((one) => one.slot === "llm")).toEqual([]);
  });

  it("switches the version that runs even when the unchecked head already picks another model", async () => {
    const { templateId, scheduleId } = readyThenUnchecked({
      ...form(),
      title: "Edited",
      llm: { provider: "openrouter", model: activeLlm },
    });
    const usages = retiredModelUsage(h.deps.db, catalogue).filter((one) => one.slot === "llm");
    // Only the schedule still runs the retired model: the template's head doesn't pick it.
    expect(usages.map((one) => [one.kind, one.id])).toEqual([["schedule", scheduleId]]);
    const usage = usages[0];
    if (usage === undefined) return;
    expect(await switchRetiredModel(h.deps, catalogue, requestOf(usage))).toEqual({
      ok: true,
      changed: true,
    });
    expect(runnableTemplate(h.deps.db, templateId)?.document.form.llm.model).toBe(
      usage.replacement?.id,
    );
    const head = templateById(h.deps.db, templateId);
    expect(head?.version).toBe(4);
    expect(head?.document.form).toEqual({
      ...form(),
      title: "Edited",
      llm: { provider: "openrouter", model: activeLlm },
    });
    expect(gatesOf(h.deps.db, templateId).find((gate) => gate.version === 4)).toBeUndefined();
  });

  it("refuses what is gone or running, saying what to do", async () => {
    const gone = await switchRetiredModel(h.deps, catalogue, request({ id: randomUUID() }));
    expect(gone).toMatchObject({ ok: false, message: expect.stringMatching(/Reload Settings/) });
    const schedule = await switchRetiredModel(
      h.deps,
      catalogue,
      request({ kind: "schedule", id: randomUUID() }),
    );
    expect(schedule).toMatchObject({ ok: false, message: expect.stringMatching(/changed/) });

    insertProject(h.deps.db, {
      id: "busy",
      title: "busy",
      format: "16:9",
      config: runConfigSchema.parse({
        title: "busy",
        format: "16:9",
        sources: {
          research: "off",
          article: "generate",
          audio: "off",
          images: "off",
          thumbnail: "off",
          video: "off",
        },
        llm: { provider: "openrouter", model: retiredId },
        imagePrompts: [],
        values: {},
        provided: {},
        silenceGapSeconds: 3,
        articlePrompt: "Story",
        rendered: { article: "Write." },
      }),
      createdAt: "2026-09-12T00:00:00.000Z",
      updatedAt: "2026-09-12T00:00:00.000Z",
    });
    insertStage(h.deps.db, {
      id: "busy-0",
      projectId: "busy",
      kind: "article",
      source: "generate",
      state: "running",
      failureReason: null,
      attemptCount: 0,
      progressCurrent: null,
      progressTotal: null,
      startedAt: null,
      finishedAt: null,
    });
    const running = await switchRetiredModel(
      h.deps,
      catalogue,
      request({ kind: "project", id: "busy" }),
    );
    expect(running).toMatchObject({ ok: false, message: expect.stringMatching(/is running/) });
    expect(projectById(h.deps.db, "busy")?.config.llm?.model).toBe(retiredId);
  });

  it("builds the request a usage's Switch button sends", () => {
    expect(
      requestOf({
        key: "k",
        kind: "draft",
        id: "d1",
        name: "Moon",
        slot: "images",
        provider: "fal",
        model: "old",
        why: "unlisted",
        replacement: null,
        blocked: null,
      }),
    ).toEqual({
      kind: "draft",
      id: "d1",
      slot: "images",
      from: { provider: "fal", model: "old" },
      to: "",
    });
  });
});
