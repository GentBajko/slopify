import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { stagingPath } from "../storage/layout.js";
import { insertStagedFile } from "../storage/repo.js";
import { draftFixture, must } from "./draft.fake.js";
import { createDraft, discardDraft, forkDraft, readDraft, saveDraft } from "./service.js";

it.each(["missing", "wrong-size", "unlinked"])(
  "marks %s completed bytes for reattachment",
  (failure) => {
    const h = draftFixture();
    const id = randomUUID();
    const attachmentId = randomUUID();
    try {
      const document = {
        ...h.document,
        form: {
          ...h.document.form,
          provided: { ...h.document.form.provided, audio: { attachmentId, name: "read.wav" } },
        },
      };
      must(createDraft(h.deps, { id, document }));
      const stagedId = h.deps.ids.next();
      insertStagedFile(h.deps.db, {
        id: stagedId,
        stageKind: "audio",
        path: stagedId,
        originalFilename: "read.wav",
        bytes: 3,
        state: "staged",
        createdAt: h.deps.clock.now().toISOString(),
      });
      if (failure === "wrong-size") writeFileSync(stagingPath(h.deps.paths, stagedId), "wrong");
      h.deps.db
        .prepare("UPDATE play_draft_attachments SET status='ready', staged_file_id=? WHERE id=?")
        .run(failure === "unlinked" ? null : stagedId, attachmentId);
      expect(must(readDraft(h.deps, id)).attachments).toMatchObject([
        { state: "reattach", name: "read.wav", stagedFileId: null },
      ]);
      h.reopen();
      expect(must(readDraft(h.deps, id)).attachments[0]?.state).toBe("reattach");
    } finally {
      h.close();
    }
  },
);

it("preserves order and makes unfinished and unsaved fork uploads reattach", () => {
  const h = draftFixture();
  const id = randomUUID();
  const first = { attachmentId: randomUUID(), name: "first.png" };
  const second = { attachmentId: randomUUID(), name: "second.png" };
  try {
    const document = {
      ...h.document,
      form: {
        ...h.document.form,
        provided: { ...h.document.form.provided, images: [first, second] },
      },
    };
    must(createDraft(h.deps, { id, document }));
    const stagedId = h.deps.ids.next();
    insertStagedFile(h.deps.db, {
      id: stagedId,
      stageKind: "images",
      path: stagedId,
      originalFilename: first.name,
      bytes: 0,
      state: "copying",
      createdAt: h.deps.clock.now().toISOString(),
    });
    h.deps.db
      .prepare("UPDATE play_draft_attachments SET staged_file_id=? WHERE id=?")
      .run(stagedId, first.attachmentId);
    expect(must(readDraft(h.deps, id)).attachments[0]?.state).toBe("copying");
    const reversed = {
      ...document,
      form: { ...document.form, provided: { ...document.form.provided, images: [second, first] } },
    };
    const saved = must(
      saveDraft(h.deps, { id, baseVersion: 1, mutationId: randomUUID(), document: reversed }),
    );
    expect(saved.draft.document.form.provided.images).toEqual([second, first]);
    const local = {
      ...reversed,
      previewText: "local unsaved text",
      form: {
        ...reversed.form,
        provided: {
          ...reversed.form.provided,
          images: [second, first, { attachmentId: randomUUID(), name: "local.png" }],
        },
      },
    };
    const fork = must(forkDraft(h.deps, { sourceId: id, id: randomUUID(), document: local }));
    expect(fork.draft.document.previewText).toBe("local unsaved text");
    expect(fork.attachments.map((a) => [a.name, a.state])).toEqual([
      [second.name, "reattach"],
      [first.name, "reattach"],
      ["local.png", "reattach"],
    ]);
    expect(fork.draft.document.form.provided.images.map((a) => a.name)).toEqual([
      second.name,
      first.name,
      "local.png",
    ]);
  } finally {
    h.close();
  }
});

it("refuses borrowing unrelated attachment IDs when forking", () => {
  const h = draftFixture();
  const id = randomUUID();
  try {
    must(createDraft(h.deps, { id, document: h.document }));
    const document = {
      ...h.document,
      form: {
        ...h.document.form,
        provided: {
          ...h.document.form.provided,
          thumbnail: { attachmentId: randomUUID(), name: "cover.png" },
        },
      },
    };
    must(createDraft(h.deps, { id: randomUUID(), document }));
    expect(forkDraft(h.deps, { sourceId: id, id: randomUUID(), document })).toMatchObject({
      ok: false,
      reason: "invalid-edit",
    });
  } finally {
    h.close();
  }
});

it("keeps durable Start receipts after explicit draft removal", () => {
  const h = draftFixture();
  const id = randomUUID();
  const reviewId = randomUUID();
  try {
    must(createDraft(h.deps, { id, document: h.document }));
    const result = { requestId: reviewId, projectIds: ["project"], queue: [], replayed: false };
    h.deps.db
      .prepare("INSERT INTO play_start_receipts VALUES (?,?,1,?,?,?)")
      .run(reviewId, id, "hash", JSON.stringify(result), h.deps.clock.now().toISOString());
    h.deps.db
      .prepare("UPDATE play_drafts SET state='started',start_id=? WHERE id=?")
      .run(reviewId, id);
    expect(must(readDraft(h.deps, id)).start).toEqual(result);
    must(discardDraft(h.deps, { id, baseVersion: 1 }));
    expect(h.deps.db.prepare("SELECT id FROM play_start_receipts").all()).toEqual([
      { id: reviewId },
    ]);
  } finally {
    h.close();
  }
});
