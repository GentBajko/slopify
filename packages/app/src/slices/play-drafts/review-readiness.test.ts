import { randomUUID } from "node:crypto";
import { copyFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { stringify } from "yaml";
import { missingFont } from "../fonts/catalog.js";
import type { ResolvedFont } from "../fonts/model.js";
import { must, reviewFixture } from "./draft.fake.js";
import { reviewDraft } from "./review.js";
import { createDraft, readDraft, saveDraft } from "./service.js";

function narrated(h: ReturnType<typeof reviewFixture>) {
  const tts = h.deps.catalogue.read().tts[0];
  if (!tts) throw new Error("Missing TTS fixture");
  return {
    ...h.document,
    form: {
      ...h.document.form,
      sources: { ...h.document.form.sources, audio: "generate" as const },
      audio: { provider: tts.provider, model: tts.id, voice: "voice" },
      subtitles: { ...h.document.form.subtitles, mode: "files" as const },
    },
  };
}
function heldFont(font: ResolvedFont) {
  let release: () => void = () => {
    throw new Error("Promise not initialized");
  };
  const promise = new Promise<ResolvedFont>((resolve) => {
    release = () => resolve(font);
  });
  return { promise, release };
}
it("changes review identity when local YAML changes with the same catalogue date", async () => {
  const h = reviewFixture();
  try {
    const id = randomUUID();
    must(createDraft(h.deps, { id, document: h.document }));
    const first = must(await reviewDraft(h.deps, { id, baseVersion: 1 }));
    const catalogue = h.deps.catalogue.read();
    writeFileSync(
      join(h.deps.paths.dataDir, "models.yaml"),
      stringify({
        ...catalogue,
        llm: catalogue.llm.map((model) => ({
          ...model,
          pricing: { ...model.pricing, inputPerMillionTokens: 12345 },
        })),
      }),
    );
    const second = must(await reviewDraft(h.deps, { id, baseVersion: 1 }));
    expect(second.id).not.toBe(first.id);
    expect(second.fingerprint).not.toBe(first.fingerprint);
    expect(second.estimates[0]?.catalogueDate).toBe(first.estimates[0]?.catalogueDate);
  } finally {
    h.close();
  }
});
it("coalesces concurrent font-await reviews to one UUID and keeps font paths private", async () => {
  const h = reviewFixture();
  try {
    const id = randomUUID();
    must(createDraft(h.deps, { id, document: narrated(h) }));
    const font = await h.deps.resolveFont("default");
    const hold = heldFont(font);
    let ids = 0;
    const deps = {
      ...h.deps,
      resolveFont: () => hold.promise,
      uuid: () => {
        ids++;
        return randomUUID();
      },
    };
    const first = reviewDraft(deps, { id, baseVersion: 1 });
    const second = reviewDraft(deps, { id, baseVersion: 1 });
    hold.release();
    const results = await Promise.all([first, second]);
    expect(
      must(results[0] ?? { ok: false, reason: "not-found", currentVersion: null, fields: [] }).id,
    ).toBe(
      must(results[1] ?? { ok: false, reason: "not-found", currentVersion: null, fields: [] }).id,
    );
    expect(ids).toBe(1);
    expect(JSON.stringify(must(readDraft(h.deps, id)))).not.toContain(font.path);
    expect(
      h.deps.db.prepare("SELECT review_json FROM play_drafts WHERE id=?").get(id)?.review_json,
    ).toContain(font.path);
  } finally {
    h.close();
  }
});
it.each(["font", "draft", "catalogue", "entry"] as const)(
  "rechecks %s changes during font readiness before persisting",
  async (change) => {
    const h = reviewFixture();
    try {
      const document = { ...narrated(h), form: { ...narrated(h).form, intro: "Opening" } };
      h.deps.db
        .prepare(
          "INSERT INTO entries VALUES ('e', 'intro', 'text', 'Opening', 'Hello', '[]', 'same')",
        )
        .run();
      const id = randomUUID();
      must(createDraft(h.deps, { id, document }));
      const bundled = await h.deps.resolveFont("default");
      const path = join(h.deps.paths.dataDir, "font.ttf");
      copyFileSync(bundled.path, path);
      const hold = heldFont({ ...bundled, path });
      const pending = reviewDraft(
        { ...h.deps, resolveFont: () => hold.promise },
        { id, baseVersion: 1 },
      );
      if (change === "font") rmSync(path);
      if (change === "draft")
        must(
          saveDraft(h.deps, {
            id,
            baseVersion: 1,
            mutationId: randomUUID(),
            document: { ...document, expectedWords: "800" },
          }),
        );
      if (change === "catalogue") {
        const catalogue = h.deps.catalogue.read();
        writeFileSync(
          join(h.deps.paths.dataDir, "models.yaml"),
          stringify({
            ...catalogue,
            tts: catalogue.tts.map((model) => ({
              ...model,
              pricing: { perMillionCharacters: 9876 },
            })),
          }),
        );
      }
      if (change === "entry")
        h.deps.db.prepare("UPDATE entries SET body='Changed without changing the date'").run();
      hold.release();
      const result = await pending;
      expect(result).toMatchObject({
        ok: false,
        reason: change === "font" ? "readiness" : "stale-review",
      });
      expect(must(readDraft(h.deps, id)).review).toBeNull();
      expect(h.deps.db.prepare("SELECT count(*) AS n FROM projects").get()?.n).toBe(0);
    } finally {
      h.close();
    }
  },
);
it("blocks unfinished font uploads and reports missing fonts while propagating infrastructure failure", async () => {
  const h = reviewFixture();
  try {
    const id = randomUUID();
    const document = narrated(h);
    must(createDraft(h.deps, { id, document }));
    expect(
      await reviewDraft(
        {
          ...h.deps,
          resolveFont: async () => {
            throw missingFont();
          },
        },
        { id, baseVersion: 1 },
      ),
    ).toMatchObject({
      ok: false,
      fields: [expect.objectContaining({ field: "subtitles.fontId" })],
    });
    await expect(
      reviewDraft(
        {
          ...h.deps,
          resolveFont: async () => {
            throw new Error("Filesystem broken");
          },
        },
        { id, baseVersion: 1 },
      ),
    ).rejects.toThrow("Filesystem broken");
    must(
      saveDraft(h.deps, {
        id,
        baseVersion: 1,
        mutationId: randomUUID(),
        document: { ...document, fontUpload: { operationId: randomUUID(), name: "font.ttf" } },
      }),
    );
    expect(await reviewDraft(h.deps, { id, baseVersion: 2 })).toMatchObject({
      ok: false,
      fields: [expect.objectContaining({ field: "fontUpload" })],
    });
  } finally {
    h.close();
  }
});
it("detects changed entry mode and deleted selected templates", async () => {
  const h = reviewFixture();
  try {
    const id = randomUUID();
    const document = {
      ...narrated(h),
      form: { ...narrated(h).form, intro: "Opening", subtitles: h.document.form.subtitles },
    };
    h.deps.db
      .prepare(
        "INSERT INTO entries VALUES ('e', 'intro', 'text', 'Opening', 'Hello', '[]', 'same')",
      )
      .run();
    must(createDraft(h.deps, { id, document }));
    const first = must(await reviewDraft(h.deps, { id, baseVersion: 1 }));
    expect(first.runs[0]?.rendered.intro).toBe("Hello");
    h.deps.db.prepare("UPDATE entries SET mode='llm'").run();
    expect(await reviewDraft(h.deps, { id, baseVersion: 1 })).toMatchObject({
      ok: false,
      fields: expect.arrayContaining([expect.objectContaining({ field: "llm" })]),
    });
    h.deps.db.prepare("DELETE FROM entries").run();
    expect(await reviewDraft(h.deps, { id, baseVersion: 1 })).toMatchObject({
      ok: false,
      fields: [expect.objectContaining({ field: "intro" })],
    });
  } finally {
    h.close();
  }
});
