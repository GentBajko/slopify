import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Catalogue } from "../../catalog/schema.js";
import { parseCatalogue } from "../../catalog/store.js";
import { insertProject, insertStage, projectById } from "../admission/repo.js";
import { runConfigSchema } from "../admission/schema.js";
import { draftFixture } from "../play-drafts/draft.fake.js";
import type { PlayDraftDocument } from "../play-drafts/model.js";
import { templateById } from "../project-templates/repo.js";
import { createTemplate } from "../project-templates/service.js";
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
