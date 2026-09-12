import { randomUUID } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { stagingPath } from "../storage/layout.js";
import { insertStagedFile } from "../storage/repo.js";
import { must, reviewFixture } from "./draft.fake.js";
import { reviewDraft } from "./review.js";
import { createDraft, readDraft } from "./service.js";

it("reuses an unchanged review identity without creating work", async () => {
  const h = reviewFixture();
  try {
    const id = randomUUID();
    const view = must(createDraft(h.deps, { id, document: h.document }));
    const input = { id, baseVersion: view.draft.version };
    const first = must(await reviewDraft(h.deps, input));
    const second = must(await reviewDraft(h.deps, input));
    expect(second.id).toBe(first.id);
    expect(second.runs[0]?.draft.provided.article).toBe("A complete supplied article.");
    expect(must(readDraft(h.deps, id)).review).toEqual(first);
    for (const table of ["projects", "attempts", "revision_work"])
      expect(h.deps.db.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n).toBe(0);
  } finally {
    h.close();
  }
});

it("refuses a stale acknowledged version and missing active inputs", async () => {
  const h = reviewFixture();
  try {
    const id = randomUUID();
    must(
      createDraft(h.deps, {
        id,
        document: {
          ...h.document,
          form: { ...h.document.form, provided: { ...h.document.form.provided, article: "" } },
        },
      }),
    );
    expect(await reviewDraft(h.deps, { id, baseVersion: 2 })).toMatchObject({
      ok: false,
      reason: "conflict",
    });
    expect(await reviewDraft(h.deps, { id, baseVersion: 1 })).toMatchObject({
      ok: false,
      fields: expect.arrayContaining([{ field: "provided.article", message: expect.any(String) }]),
    });
  } finally {
    h.close();
  }
});

it("renders base and additional variants once with merged accepted values", async () => {
  const h = reviewFixture();
  try {
    h.deps.db
      .prepare(
        "INSERT INTO prompts VALUES (?, 'article', 'Story', 'About {{topic}} in {{place}}', ?, ?)",
      )
      .run("prompt", JSON.stringify(["topic", "place"]), "same");
    const model = h.deps.catalogue.read().llm[0];
    if (!model) throw new Error("Missing fixture model");
    const document = {
      ...h.document,
      expectedWords: "420",
      variants: [{ id: randomUUID(), title: "Second", values: { topic: " moon " } }],
      form: {
        ...h.document.form,
        sources: { ...h.document.form.sources, article: "generate" as const },
        articlePrompt: "Story",
        llm: { provider: model.provider, model: model.id },
        values: { topic: " sun ", place: " sky ", unused: "x".repeat(20000) },
      },
    };
    const id = randomUUID();
    must(createDraft(h.deps, { id, document }));
    const first = must(await reviewDraft(h.deps, { id, baseVersion: 1 }));
    expect(first.runs.map((r) => r.rendered.article)).toEqual([
      "About sun in sky",
      "About moon in sky",
    ]);
    expect(first.runs.map((r) => r.draft.title)).toEqual(["Supplied", "Second"]);
    expect(first.runs[0]?.draft.values).toEqual({ topic: "sun", place: "sky" });
    expect(first.estimates.map((e) => e.expectedWords)).toEqual([420, 420]);
    h.deps.db.prepare("UPDATE prompts SET body='New {{topic}} in {{place}}'").run();
    const next = must(await reviewDraft(h.deps, { id, baseVersion: 1 }));
    expect(next.id).not.toBe(first.id);
    expect(next.runs[0]?.rendered.article).toBe("New sun in sky");
  } finally {
    h.close();
  }
});

it.each(["", "0", "1.5", "100001", "oops"])("links invalid expected words %j", async (raw) => {
  const h = reviewFixture();
  try {
    const id = randomUUID();
    must(createDraft(h.deps, { id, document: { ...h.document, expectedWords: raw } }));
    expect(await reviewDraft(h.deps, { id, baseVersion: 1 })).toMatchObject({
      ok: false,
      fields: expect.arrayContaining([expect.objectContaining({ field: "expectedWords" })]),
    });
  } finally {
    h.close();
  }
});

it("admits 50 total runs and rejects 51 with a linked variant error", async () => {
  const h = reviewFixture();
  try {
    for (const count of [49, 50]) {
      const id = randomUUID();
      must(
        createDraft(h.deps, {
          id,
          document: {
            ...h.document,
            variants: Array.from({ length: count }, (_, index) => ({
              id: randomUUID(),
              title: `Variant ${index}`,
              values: {},
            })),
          },
        }),
      );
      const result = await reviewDraft(h.deps, { id, baseVersion: 1 });
      if (count === 49) expect(must(result).runs).toHaveLength(50);
      else
        expect(result).toMatchObject({
          ok: false,
          fields: [expect.objectContaining({ field: "variants" })],
        });
    }
  } finally {
    h.close();
  }
});

it("requires the thumbnail-only image provider and generated-entry text provider", async () => {
  const h = reviewFixture();
  try {
    h.deps.db
      .prepare("INSERT INTO prompts VALUES ('p', 'thumbnail', 'Cover', 'Cover art', '[]', 'same')")
      .run();
    h.deps.db
      .prepare(
        "INSERT INTO entries VALUES ('e', 'intro', 'llm', 'Opening', 'Say hello', '[]', 'same')",
      )
      .run();
    const id = randomUUID();
    const tts = h.deps.catalogue.read().tts[0];
    if (!tts) throw new Error("Missing TTS fixture");
    must(
      createDraft(h.deps, {
        id,
        document: {
          ...h.document,
          form: {
            ...h.document.form,
            sources: { ...h.document.form.sources, audio: "generate", thumbnail: "from_prompt" },
            thumbnailPrompt: "Cover",
            intro: "Opening",
            audio: { provider: tts.provider, model: tts.id, voice: "voice" },
          },
        },
      }),
    );
    expect(await reviewDraft(h.deps, { id, baseVersion: 1 })).toMatchObject({
      ok: false,
      fields: expect.arrayContaining([
        expect.objectContaining({ field: "images" }),
        expect.objectContaining({ field: "llm" }),
      ]),
    });
  } finally {
    h.close();
  }
});

it("links variant errors to their controls and uses current settings", async () => {
  const h = reviewFixture();
  try {
    const id = randomUUID();
    const document = { ...h.document, variants: [{ id: randomUUID(), title: "", values: {} }] };
    must(createDraft(h.deps, { id, document }));
    expect(await reviewDraft(h.deps, { id, baseVersion: 1 })).toMatchObject({
      ok: false,
      fields: [expect.objectContaining({ field: "variants.0.title" })],
    });
    const nextId = randomUUID();
    must(createDraft(h.deps, { id: nextId, document: h.document }));
    h.deps.db.prepare("INSERT INTO settings VALUES ('silenceGapSeconds', '9')").run();
    const review = must(await reviewDraft(h.deps, { id: nextId, baseVersion: 1 }));
    expect(review.runs[0]?.draft.silenceGapSeconds).toBe(9);
  } finally {
    h.close();
  }
});
it("validates review boundaries and pending start state", async () => {
  const h = reviewFixture();
  try {
    expect(await reviewDraft(h.deps, { id: "bad", baseVersion: 1 })).toMatchObject({
      ok: false,
      reason: "invalid-edit",
    });
    expect(await reviewDraft(h.deps, { id: randomUUID(), baseVersion: 1 })).toMatchObject({
      ok: false,
      reason: "not-found",
    });
    const id = randomUUID();
    must(createDraft(h.deps, { id, document: h.document }));
    const review = must(await reviewDraft(h.deps, { id, baseVersion: 1 }));
    h.deps.db.prepare("UPDATE play_drafts SET state='starting' WHERE id=?").run(id);
    expect(await reviewDraft(h.deps, { id, baseVersion: 1 })).toMatchObject({
      ok: false,
      reason: "pending-start",
      reviewId: review.id,
    });
  } finally {
    h.close();
  }
});

it("resolves only owned ready attachment bytes and refuses vanished files", async () => {
  const h = reviewFixture();
  try {
    const id = randomUUID();
    const attachmentId = randomUUID();
    const document = {
      ...h.document,
      form: {
        ...h.document.form,
        sources: { ...h.document.form.sources, audio: "provide" as const },
        provided: { ...h.document.form.provided, audio: { attachmentId, name: "audio.wav" } },
      },
    };
    must(createDraft(h.deps, { id, document }));
    expect(await reviewDraft(h.deps, { id, baseVersion: 1 })).toMatchObject({
      ok: false,
      fields: [expect.objectContaining({ field: "provided.audio" })],
    });
    const stagedId = h.deps.ids.next();
    insertStagedFile(h.deps.db, {
      id: stagedId,
      stageKind: "audio",
      path: stagedId,
      originalFilename: "audio.wav",
      bytes: 3,
      state: "staged",
      createdAt: h.deps.clock.now().toISOString(),
    });
    writeFileSync(stagingPath(h.deps.paths, stagedId), "wav");
    h.deps.db
      .prepare("UPDATE play_draft_attachments SET status='ready',staged_file_id=? WHERE id=?")
      .run(stagedId, attachmentId);
    expect(
      must(await reviewDraft(h.deps, { id, baseVersion: 1 })).runs[0]?.draft.provided.audio,
    ).toBe(stagedId);
    rmSync(stagingPath(h.deps.paths, stagedId));
    expect(await reviewDraft(h.deps, { id, baseVersion: 1 })).toMatchObject({
      ok: false,
      fields: [expect.objectContaining({ field: "provided.audio" })],
    });
  } finally {
    h.close();
  }
});
