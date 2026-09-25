import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { transact } from "../../kernel/db/tx.js";
import { startRun } from "../admission/start.js";
import { enqueueBatch } from "../batch/index.js";
import { draftFixture, must } from "../play-drafts/draft.fake.js";
import { createDraft, discardDraft, forkDraft, saveDraft } from "../play-drafts/service.js";
import { uploadDraftAttachment } from "../play-drafts/uploads.js";
import { stagingPath } from "./layout.js";
import { deleteStagedFile, stagedFileById } from "./repo.js";
import { discardStagedFile, dropStagedSource } from "./staging.js";
import { releaseStagedFile, stagedFileReferenced } from "./staging-refs.js";

it("retains shared bytes through direct deletion and discarding one owner, then releases the last owner", async () => {
  const h = draftFixture();
  try {
    const id = randomUUID();
    const attachmentId = randomUUID();
    const document = {
      ...h.document,
      form: {
        ...h.document.form,
        provided: { ...h.document.form.provided, images: [{ attachmentId, name: "image.png" }] },
      },
    };
    must(createDraft(h.deps, { id, document }));
    async function* content() {
      yield Buffer.from("shared");
    }
    const file = must(
      await uploadDraftAttachment(h.deps, { draftId: id, attachmentId, content: content() }),
    );
    if (file.stagedFileId === null) throw new Error("Missing staging id");
    const stagedId = file.stagedFileId;
    const storage = { ...h.deps, emit: () => undefined };
    const fork = must(forkDraft(h.deps, { sourceId: id, id: randomUUID(), document }));
    expect(stagedFileReferenced(h.deps.db, stagedId)).toBe(true);
    expect(discardStagedFile(storage, stagedId)).toEqual({ ok: false, reason: "in-use" });
    deleteStagedFile(h.deps.db, stagedId);
    dropStagedSource(storage, stagingPath(h.deps.paths, stagedId));
    releaseStagedFile(storage, stagedId);
    must(discardDraft(h.deps, { id, baseVersion: 1 }));
    expect(stagedFileById(h.deps.db, stagedId)).toBeDefined();
    expect(readFileSync(stagingPath(h.deps.paths, stagedId), "utf8")).toBe("shared");
    must(discardDraft(h.deps, { id: fork.draft.id, baseVersion: 1 }));
    expect(stagedFileById(h.deps.db, stagedId)).toBeUndefined();
    expect(existsSync(stagingPath(h.deps.paths, stagedId))).toBe(false);
  } finally {
    h.close();
  }
});

it.each(["single", "batch"])(
  "preserves owned image bytes through legacy %s admission",
  async (mode) => {
    const h = draftFixture();
    try {
      const id = randomUUID();
      const attachmentId = randomUUID();
      const document = {
        ...h.document,
        form: {
          ...h.document.form,
          provided: { ...h.document.form.provided, images: [{ attachmentId, name: "image.png" }] },
        },
      };
      must(createDraft(h.deps, { id, document }));
      async function* content() {
        yield Buffer.from("shared");
      }
      const file = must(
        await uploadDraftAttachment(h.deps, { draftId: id, attachmentId, content: content() }),
      );
      if (file.stagedFileId === null) throw new Error("Missing staging id");
      const draft = {
        title: "Legacy run",
        format: "16:9" as const,
        sources: {
          research: "off" as const,
          article: "provide" as const,
          audio: "off" as const,
          images: "provide" as const,
          thumbnail: "off" as const,
          video: "off" as const,
        },
        provided: { article: "Text", images: [file.stagedFileId] },
        imagePrompts: [],
        values: {},
        silenceGapSeconds: 3,
        imageSeconds: 15,
        edgeSilenceSeconds: 0,
      };
      const storage = { ...h.deps, emit: () => undefined };
      if (mode === "single") startRun(storage, draft, {});
      else
        enqueueBatch(storage, "legacy", [
          { draft, rendered: {} },
          { draft, rendered: {} },
        ]);
      expect(stagedFileById(h.deps.db, file.stagedFileId)).toBeDefined();
      expect(readFileSync(stagingPath(h.deps.paths, file.stagedFileId), "utf8")).toBe("shared");
    } finally {
      h.close();
    }
  },
);

it.each(["save", "discard"])(
  "retains bytes when an outer transaction rolls back draft %s",
  async (operation) => {
    const h = draftFixture();
    try {
      const id = randomUUID();
      const attachmentId = randomUUID();
      const document = {
        ...h.document,
        form: {
          ...h.document.form,
          provided: { ...h.document.form.provided, images: [{ attachmentId, name: "image.png" }] },
        },
      };
      must(createDraft(h.deps, { id, document }));
      async function* content() {
        yield Buffer.from("retained");
      }
      const file = must(
        await uploadDraftAttachment(h.deps, { draftId: id, attachmentId, content: content() }),
      );
      if (file.stagedFileId === null) throw new Error("Missing staging id");
      expect(() =>
        transact(h.deps.db, () => {
          if (operation === "discard") must(discardDraft(h.deps, { id, baseVersion: 1 }));
          else
            must(
              saveDraft(h.deps, {
                id,
                baseVersion: 1,
                mutationId: randomUUID(),
                document: h.document,
              }),
            );
          throw new Error("outer rollback");
        }),
      ).toThrow("outer rollback");
      expect(stagedFileReferenced(h.deps.db, file.stagedFileId)).toBe(true);
      expect(readFileSync(stagingPath(h.deps.paths, file.stagedFileId), "utf8")).toBe("retained");
    } finally {
      h.close();
    }
  },
);
