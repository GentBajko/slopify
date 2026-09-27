import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Catalogue } from "../../catalog/schema.js";
import { parseCatalogue } from "../../catalog/store.js";
import { insertProject, insertStage, projectById } from "../admission/repo.js";
import { runConfigSchema } from "../admission/schema.js";
import { draftFixture, must } from "../play-drafts/draft.fake.js";
import type { PlayDraftDocument } from "../play-drafts/model.js";
import { createDraft, readDraft } from "../play-drafts/service.js";
import { templateById } from "../project-templates/repo.js";
import { createTemplate, updateTemplate } from "../project-templates/service.js";
import { ensureBaseline } from "../revisions/index.js";
import { currentRevisionId, revisionById } from "../revisions/repo.js";
import { switchAllRetired, switchRetiredModel } from "./switch.js";
import { retiredModelUsage, suggestReplacement } from "./usage.js";

const retiredId = "google/gemini-3.1-pro-preview";
const bundled = parseCatalogue(
  readFileSync(new URL("../../assets/models.yaml", import.meta.url), "utf8"),
);
// The bundled list with one text model retired, as an automatic check would leave it.
const catalogue: Catalogue = {
  ...bundled,
  llm: bundled.llm.map((row) => (row.id === retiredId ? { ...row, deprecated: true } : row)),
};
const replacement = suggestReplacement(catalogue, "llm", {
  provider: "openrouter",
  model: retiredId,
});

function made(result: { readonly ok: boolean }): void {
  if (!result.ok) throw new Error(`Template fixture refused: ${JSON.stringify(result)}`);
}

let h: ReturnType<typeof draftFixture>;
beforeEach(() => {
  h = draftFixture();
});
afterEach(() => {
  h.close();
});

function documentWith(model: string, thinking?: "high"): PlayDraftDocument {
  return {
    ...h.document,
    form: {
      ...h.document.form,
      title: "Moon",
      llm: { provider: "openrouter", model, ...(thinking === undefined ? {} : { thinking }) },
    },
  };
}
function schedule(id: string, templateId: string, version: number): void {
  h.deps.db
    .prepare(
      `INSERT INTO schedules (id,name,template_id,template_version,cadence_json,timezone,missed_policy,
        overlap_policy,spend_limit_cents,items_json,status,version,creation_hash,next_run_at,created_at,updated_at)
       VALUES (?,?,?,?,'{}','UTC','skip','skip',NULL,'[]','active',1,'h',NULL,'t','t')`,
    )
    .run(id, `Schedule ${version}`, templateId, version);
}
function project(id: string, states: readonly string[]): void {
  const config = runConfigSchema.parse({
    title: id,
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
  insertProject(h.deps.db, {
    id,
    title: id,
    format: "16:9",
    config,
    createdAt: "2026-09-12T00:00:00.000Z",
    updatedAt: "2026-09-12T00:00:00.000Z",
  });
  states.forEach((state, index) => {
    insertStage(h.deps.db, {
      id: `${id}-${index}`,
      projectId: id,
      kind: (["article", "research"] as const)[index] ?? "article",
      source: "generate",
      state: state as "pending",
      failureReason: null,
      attemptCount: 0,
      progressCurrent: null,
      progressTotal: null,
      startedAt: null,
      finishedAt: null,
    });
  });
}

describe("retired model usage", () => {
  it("suggests the closest active model of the same provider", () => {
    expect(replacement?.id).toMatch(/^google\/gemini-3\./);
    expect(replacement?.id).not.toBe(retiredId);
    expect(suggestReplacement(catalogue, "llm", { provider: "nobody", model: "x" })).toBeNull();
  });

  it("finds templates, schedules, drafts and projects with steps to run, and nothing else", () => {
    const templateId = randomUUID();
    made(
      createTemplate(h.deps, { id: templateId, name: "Weekly", document: documentWith(retiredId) }),
    );
    schedule(randomUUID(), templateId, 1);
    must(createDraft(h.deps, { id: randomUUID(), document: documentWith(retiredId) }));
    // A draft on an active model and a finished project are not listed.
    must(createDraft(h.deps, { id: randomUUID(), document: documentWith(replacement?.id ?? "") }));
    project("waiting", ["done", "failed"]);
    project("finished", ["done"]);
    project("busy", ["running"]);
    const usages = retiredModelUsage(h.deps.db, catalogue);
    expect(usages.map((usage) => [usage.kind, usage.name, usage.why])).toEqual([
      ["template", "Weekly", "retired"],
      ["schedule", "Schedule 1", "retired"],
      ["draft", "Moon", "retired"],
      ["project", "waiting", "retired"],
      ["project", "busy", "retired"],
    ]);
    expect(usages.every((usage) => usage.replacement?.id === replacement?.id)).toBe(true);
    expect(usages.find((usage) => usage.name === "busy")?.blocked).toMatch(/running/);
    expect(usages.find((usage) => usage.name === "waiting")?.blocked).toBeNull();
  });

  it("names a model that is not in the list at all as unlisted", () => {
    must(createDraft(h.deps, { id: randomUUID(), document: documentWith("vanished/model") }));
    expect(retiredModelUsage(h.deps.db, catalogue).map((usage) => usage.why)).toEqual(["unlisted"]);
  });
});

describe("switching a retired model", () => {
  it("gives a template a new version, moves the schedules that ran its latest version, and drops an unsupported thinking level", async () => {
    const templateId = randomUUID();
    made(
      createTemplate(h.deps, {
        id: templateId,
        name: "Weekly",
        document: documentWith(retiredId, "high"),
      }),
    );
    const following = randomUUID();
    schedule(following, templateId, 1);
    const to = replacement?.id ?? "";
    const result = await switchRetiredModel(h.deps, catalogue, {
      kind: "template",
      id: templateId,
      slot: "llm",
      from: { provider: "openrouter", model: retiredId },
      to,
    });
    expect(result).toEqual({ ok: true, changed: true });
    const head = templateById(h.deps.db, templateId);
    expect(head?.version).toBe(2);
    expect(head?.document.form.llm.model).toBe(to);
    const supportsHigh =
      catalogue.llm.find((row) => row.id === to)?.llm.thinking?.high !== undefined;
    expect(head?.document.form.llm.thinking).toBe(supportsHigh ? "high" : undefined);
    expect(
      h.deps.db.prepare("SELECT template_version FROM schedules WHERE id=?").get(following)
        ?.template_version,
    ).toBe(2);
    expect(retiredModelUsage(h.deps.db, catalogue)).toEqual([]);
  });

  it("refuses a schedule on an older template version and a model that is not active", async () => {
    const templateId = randomUUID();
    made(
      createTemplate(h.deps, { id: templateId, name: "Weekly", document: documentWith(retiredId) }),
    );
    made(
      updateTemplate(h.deps, {
        id: templateId,
        name: "Weekly",
        document: documentWith(retiredId),
        baseVersion: 1,
        mutationId: randomUUID(),
      }),
    );
    const old = randomUUID();
    schedule(old, templateId, 1);
    const from = { provider: "openrouter", model: retiredId };
    const blocked = await switchRetiredModel(h.deps, catalogue, {
      kind: "schedule",
      id: old,
      slot: "llm",
      from,
      to: replacement?.id ?? "",
    });
    expect(blocked).toMatchObject({ ok: false, message: expect.stringMatching(/older version/) });
    expect(
      retiredModelUsage(h.deps.db, catalogue).find((usage) => usage.kind === "schedule")?.blocked,
    ).toMatch(/Library → Schedules/);
    const wrong = await switchRetiredModel(h.deps, catalogue, {
      kind: "template",
      id: templateId,
      slot: "llm",
      from,
      to: retiredId,
    });
    expect(wrong).toMatchObject({
      ok: false,
      message: expect.stringMatching(/not an active model/),
    });
    expect(templateById(h.deps.db, templateId)?.version).toBe(2);
  });

  it("switches everything it can in one go and leaves what it cannot", async () => {
    const draftId = randomUUID();
    must(createDraft(h.deps, { id: draftId, document: documentWith(retiredId) }));
    project("waiting", ["pending"]);
    project("busy", ["running"]);
    const result = await switchAllRetired(h.deps, catalogue);
    expect(result).toEqual({ switched: 2, failed: [] });
    const draft = must(readDraft(h.deps, draftId)).draft;
    expect(draft.version).toBe(2);
    expect(draft.document.form.llm.model).toBe(replacement?.id);
    expect(projectById(h.deps.db, "waiting")?.config.llm?.model).toBe(replacement?.id);
    expect(projectById(h.deps.db, "busy")?.config.llm?.model).toBe(retiredId);
    expect(retiredModelUsage(h.deps.db, catalogue).map((usage) => usage.name)).toEqual(["busy"]);
    // Switching what was already switched changes nothing.
    expect(
      await switchRetiredModel(h.deps, catalogue, {
        kind: "draft",
        id: draftId,
        slot: "llm",
        from: { provider: "openrouter", model: retiredId },
        to: replacement?.id ?? "",
      }),
    ).toEqual({ ok: true, changed: false });
  });

  it("saves a new version of an edited project, the way Edit project does", async () => {
    project("edited", ["done", "failed"]);
    const baseline = await ensureBaseline(h.deps, "edited");
    expect(baseline.ok).toBe(true);
    const before = currentRevisionId(h.deps.db, "edited");
    const result = await switchRetiredModel(h.deps, catalogue, {
      kind: "project",
      id: "edited",
      slot: "llm",
      from: { provider: "openrouter", model: retiredId },
      to: replacement?.id ?? "",
    });
    expect(result).toEqual({ ok: true, changed: true });
    const after = currentRevisionId(h.deps.db, "edited");
    expect(after).not.toBe(before);
    expect(revisionById(h.deps.db, "edited", after ?? "")?.config.llm?.model).toBe(replacement?.id);
    expect(retiredModelUsage(h.deps.db, catalogue)).toEqual([]);
  });
});
