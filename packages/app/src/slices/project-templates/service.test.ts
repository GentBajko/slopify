import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { createPrompt, updatePrompt } from "../library/save.js";
import { draftFixture, must, reviewFixture } from "../play-drafts/draft.fake.js";
import { reviewDraft } from "../play-drafts/review.js";
import {
  createTemplate,
  deleteTemplate,
  instantiateTemplate,
  listTemplates,
  readTemplate,
  updateTemplate,
} from "./service.js";

it("reviews frozen prompt bodies after library deletion and renders new keywords once", async () => {
  const h = reviewFixture();
  try {
    const prompt = createPrompt(h.deps, {
      kind: "article",
      name: "Story",
      body: "About {{topic}}",
    });
    if (!prompt.ok) throw new Error("Prompt fixture failed");
    const model = h.deps.catalogue.read().llm[0];
    if (!model) throw new Error("Missing fixture model");
    const id = randomUUID();
    const document = {
      ...h.document,
      form: {
        ...h.document.form,
        sources: { ...h.document.form.sources, article: "generate" as const },
        articlePrompt: "Story",
        llm: { provider: model.provider, model: model.id },
        values: { topic: "{{moon}}" },
      },
    };
    expect(createTemplate(h.deps, { id, name: "Series", document }).ok).toBe(true);
    h.deps.db.prepare("DELETE FROM prompts WHERE id=?").run(prompt.value.id);
    const created = instantiateTemplate(h.deps, { templateId: id, id: randomUUID(), version: 1 });
    if (!created.ok) throw new Error("Instantiation failed");
    const reviewed = must(
      await reviewDraft(h.deps, { id: created.value.draft.id, baseVersion: 1 }),
    );
    expect(reviewed.runs[0]?.rendered.article).toBe("About {{moon}}");
    expect(reviewed.runs[0]?.templates.article).toBe("About {{topic}}");
  } finally {
    h.close();
  }
});

it("retains immutable setup snapshots and instantiates a fresh unreviewed draft", () => {
  const h = draftFixture();
  try {
    const prompt = createPrompt(h.deps, {
      kind: "article",
      name: "Story",
      body: "Write {{topic}}.",
    });
    if (!prompt.ok) throw new Error("Fixture prompt failed");
    const document = {
      ...h.document,
      form: {
        ...h.document.form,
        articlePrompt: "Story",
        checkpoints: ["audio" as const],
        values: { topic: "Arda" },
      },
    };
    const id = randomUUID();
    const saved = createTemplate(h.deps, { id, name: "Channel", document });
    expect(saved.ok).toBe(true);
    updatePrompt(h.deps, prompt.value.id, {
      kind: "article",
      name: "Story",
      body: "Changed {{topic}}.",
    });
    const updated = updateTemplate(h.deps, {
      id,
      baseVersion: 1,
      mutationId: randomUUID(),
      name: "Renamed",
      document,
    });
    expect(updated.ok).toBe(true);
    const old = readTemplate(h.deps, id, 1);
    if (!old.ok) throw new Error("Missing template revision");
    expect(old.value.document.librarySnapshot?.prompts[0]?.body).toBe("Write {{topic}}.");
    const draftId = randomUUID();
    const draft = instantiateTemplate(h.deps, { templateId: id, id: draftId, version: 1 });
    if (!draft.ok) throw new Error("Template instantiation failed");
    expect(draft.value.draft.document.form.checkpoints).toEqual(["audio"]);
    expect(draft.value.review).toBeNull();
    expect(draft.value.start).toBeNull();
    expect(draft.value.draft.document.librarySnapshot?.prompts[0]?.body).toBe("Write {{topic}}.");
    expect(instantiateTemplate(h.deps, { templateId: id, id: draftId, version: 1 })).toEqual(draft);
    expect(instantiateTemplate(h.deps, { templateId: id, id: draftId, version: 2 }).ok).toBe(false);
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM projects").get()?.n).toBe(0);
    expect(deleteTemplate(h.deps, { id, baseVersion: 1 }).ok).toBe(false);
    expect(deleteTemplate(h.deps, { id, baseVersion: 2 }).ok).toBe(true);
    expect(listTemplates(h.deps)).toEqual([]);
  } finally {
    h.close();
  }
});

it("rejects unknown credential fields and stale updates; remaps attachments for reattachment", () => {
  const h = draftFixture();
  try {
    const id = randomUUID();
    expect(
      createTemplate(h.deps, { id, name: "Bad", document: { ...h.document, credentials: {} } }).ok,
    ).toBe(false);
    const attachmentId = randomUUID();
    const document = {
      ...h.document,
      fontUpload: { operationId: randomUUID(), name: "font.ttf" },
      form: {
        ...h.document.form,
        provided: { ...h.document.form.provided, audio: { attachmentId, name: "intro.wav" } },
      },
    };
    expect(createTemplate(h.deps, { id, name: "Setup", document }).ok).toBe(true);
    expect(
      updateTemplate(h.deps, {
        id,
        baseVersion: 2,
        mutationId: randomUUID(),
        name: "Stale",
        document,
      }).ok,
    ).toBe(false);
    const mutationId = randomUUID();
    const input = { id, baseVersion: 1, mutationId, name: "Updated", document };
    expect(updateTemplate(h.deps, input).ok).toBe(true);
    expect(updateTemplate(h.deps, input).ok).toBe(true);
    expect(updateTemplate(h.deps, { ...input, name: "Different" }).ok).toBe(false);
    const result = instantiateTemplate(h.deps, { templateId: id, id: randomUUID(), version: 2 });
    if (!result.ok) throw new Error("Instantiation failed");
    expect(result.value.draft.document.fontUpload).toBeNull();
    expect(result.value.attachments[0]?.id).not.toBe(attachmentId);
    expect(result.value.attachments[0]?.state).toBe("reattach");
    expect(result.value.attachments[0]?.stagedFileId).toBeNull();
    h.reopen();
    expect(readTemplate(h.deps, id).ok).toBe(true);
  } finally {
    h.close();
  }
});
