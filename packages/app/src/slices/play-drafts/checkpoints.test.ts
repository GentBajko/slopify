import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { must, reviewFixture } from "./draft.fake.js";
import { reviewDraft } from "./review.js";
import { createDraft, readDraft, saveDraft } from "./service.js";

it("persists incomplete checkpoint choices across reopen without admitting work", () => {
  const h = reviewFixture();
  try {
    const id = randomUUID();
    const document = {
      ...h.document,
      form: { ...h.document.form, title: "", checkpoints: ["audio"] as const },
    };
    const created = must(createDraft(h.deps, { id, document }));
    expect(created.draft.document.form.checkpoints).toEqual(["audio"]);
    h.reopen();
    expect(must(readDraft(h.deps, id)).draft.document.form.checkpoints).toEqual(["audio"]);
    for (const table of ["projects", "revision_work", "attempts", "review_checkpoints"])
      expect(h.deps.db.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n).toBe(0);
  } finally {
    h.close();
  }
});

it("binds review closures and changes only checkpoint fingerprints whose inputs changed", async () => {
  const h = reviewFixture();
  try {
    const tts = h.deps.catalogue.read().tts[0];
    const image = h.deps.catalogue.read().image[0];
    if (!tts || !image) throw new Error("Missing fixture catalogue");
    h.deps.db.exec("INSERT INTO prompts VALUES ('img','image','Picture','A forest','[]','now')");
    const id = randomUUID();
    const document = {
      ...h.document,
      form: {
        ...h.document.form,
        checkpoints: ["audio", "images"] as const,
        sources: {
          ...h.document.form.sources,
          audio: "generate" as const,
          images: "generate" as const,
        },
        audio: { provider: tts.provider, model: tts.id, voice: "voice" },
        images: { provider: image.provider, model: image.id },
        imagePrompts: [{ name: "Picture", number: "1" }],
      },
    };
    must(createDraft(h.deps, { id, document }));
    const first = must(await reviewDraft(h.deps, { id, baseVersion: 1 }));
    expect(first.runs[0]?.draft.checkpoints).toEqual(["audio", "images"]);
    expect(first.checkpointSet).toHaveLength(2);
    expect(first.checkpointSet?.find((gate) => gate.stage === "audio")?.workKeys).toContain(
      "export:wav",
    );
    const edited = {
      ...document,
      form: {
        ...document.form,
        provided: { ...document.form.provided, article: "A different narration." },
      },
    };
    const saved = must(
      saveDraft(h.deps, { id, baseVersion: 1, mutationId: randomUUID(), document: edited }),
    );
    expect(saved.review).toBeNull();
    const second = must(await reviewDraft(h.deps, { id, baseVersion: 2 }));
    expect(second.fingerprint).not.toBe(first.fingerprint);
    const fingerprint = (review: typeof first, stage: "audio" | "images") =>
      review.checkpointSet?.find((gate) => gate.stage === stage)?.fingerprint;
    expect(fingerprint(second, "audio")).not.toBe(fingerprint(first, "audio"));
    expect(fingerprint(second, "images")).toBe(fingerprint(first, "images"));
    for (const table of ["projects", "revision_work", "attempts", "review_checkpoints"])
      expect(h.deps.db.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n).toBe(0);
  } finally {
    h.close();
  }
});

it("keeps legacy drafts gate-free and refuses inactive or repeated choices", async () => {
  const h = reviewFixture();
  try {
    const id = randomUUID();
    must(createDraft(h.deps, { id, document: h.document }));
    expect(must(await reviewDraft(h.deps, { id, baseVersion: 1 })).checkpointSet ?? []).toEqual([]);
    must(
      saveDraft(h.deps, {
        id,
        baseVersion: 1,
        mutationId: randomUUID(),
        document: { ...h.document, form: { ...h.document.form, checkpoints: ["audio"] } },
      }),
    );
    expect(await reviewDraft(h.deps, { id, baseVersion: 2 })).toMatchObject({
      ok: false,
      fields: expect.arrayContaining([expect.objectContaining({ field: "checkpoints.audio" })]),
    });
    expect(
      createDraft(h.deps, {
        id: randomUUID(),
        document: { ...h.document, form: { ...h.document.form, checkpoints: ["audio", "audio"] } },
      }),
    ).toMatchObject({ ok: false, reason: "invalid-edit" });
  } finally {
    h.close();
  }
});
