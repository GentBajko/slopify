import { randomUUID } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { stagingPath } from "../storage/layout.js";
import { insertStagedFile } from "../storage/repo.js";
import { draftFixture, must } from "./draft.fake.js";
import {
  createDraft,
  discardDraft,
  forkDraft,
  listDrafts,
  readDraft,
  saveDraft,
} from "./service.js";

it("preserves incomplete values and rejects a stale writer after reopen", () => {
  const h = draftFixture();
  const id = randomUUID();
  try {
    const created = must(createDraft(h.deps, { id, document: h.document }));
    const document = {
      ...h.document,
      expectedWords: "",
      form: {
        ...h.document.form,
        title: "First tab",
        values: { unused: "Retained" },
        provided: { ...h.document.form.provided, article: "  # Draft\n\nUnfinished article  " },
        imagePrompts: [{ name: "", number: "NaN" }],
        subtitles: { ...h.document.form.subtitles, fontSize: "" },
      },
    };
    const input = { id, baseVersion: created.draft.version, mutationId: randomUUID(), document };
    const saved = must(saveDraft(h.deps, input));
    expect(must(saveDraft(h.deps, input)).draft.version).toBe(saved.draft.version);
    expect(
      saveDraft(h.deps, {
        ...input,
        mutationId: randomUUID(),
        document: { ...document, form: { ...document.form, title: "Second tab" } },
      }),
    ).toMatchObject({ ok: false, reason: "conflict" });
    h.reopen();
    expect(must(readDraft(h.deps, id)).draft.document).toEqual(document);
  } finally {
    h.close();
  }
});
it("replays creation and latest save but refuses a changed or older request", () => {
  const h = draftFixture();
  const id = randomUUID();
  try {
    const input = { id, document: h.document };
    const created = must(createDraft(h.deps, input));
    expect(must(createDraft(h.deps, input))).toEqual(created);
    expect(
      createDraft(h.deps, { ...input, document: { ...h.document, previewText: "changed" } }),
    ).toMatchObject({ ok: false, reason: "conflict" });
    const save = {
      id,
      baseVersion: 1,
      mutationId: randomUUID(),
      document: { ...h.document, previewText: "two" },
    };
    must(saveDraft(h.deps, save));
    expect(saveDraft(h.deps, { ...save, document: h.document })).toMatchObject({
      ok: false,
      reason: "conflict",
    });
    must(saveDraft(h.deps, { ...save, baseVersion: 2, mutationId: randomUUID() }));
    expect(saveDraft(h.deps, save)).toMatchObject({ ok: false, reason: "conflict" });
  } finally {
    h.close();
  }
});

it("retains unreadable metadata for discard and excludes started drafts", () => {
  const h = draftFixture();
  const id = randomUUID();
  try {
    must(createDraft(h.deps, { id, document: h.document }));
    h.deps.db.prepare("UPDATE play_drafts SET document_json='{}' WHERE id=?").run(id);
    expect(readDraft(h.deps, id)).toMatchObject({ ok: false, reason: "invalid-draft" });
    expect(listDrafts(h.deps)).toMatchObject([{ id, readable: false }]);
    expect(discardDraft(h.deps, { id, baseVersion: 2 })).toMatchObject({
      ok: false,
      reason: "conflict",
    });
    must(discardDraft(h.deps, { id, baseVersion: 1 }));
    expect(listDrafts(h.deps)).toEqual([]);
    must(createDraft(h.deps, { id, document: h.document }));
    h.deps.db.prepare("UPDATE play_drafts SET state='started' WHERE id=?").run(id);
    expect(listDrafts(h.deps)).toEqual([]);
    expect(readDraft(h.deps, id).ok).toBe(true);
  } finally {
    h.close();
  }
});

it("reserves attachment ownership and rejects duplicates or kind changes atomically", () => {
  const h = draftFixture();
  const id = randomUUID();
  const attachmentId = randomUUID();
  const document = {
    ...h.document,
    form: {
      ...h.document.form,
      provided: { ...h.document.form.provided, audio: { attachmentId, name: "voice.wav" } },
    },
  };
  try {
    const made = must(createDraft(h.deps, { id, document }));
    expect(made.attachments).toMatchObject([
      { id: attachmentId, kind: "audio", state: "pending", name: "voice.wav" },
    ]);
    expect(createDraft(h.deps, { id: randomUUID(), document })).toMatchObject({
      ok: false,
      reason: "invalid-edit",
    });
    const save = {
      id,
      baseVersion: 1,
      mutationId: randomUUID(),
      document: {
        ...document,
        form: {
          ...document.form,
          provided: { ...document.form.provided, images: [{ attachmentId, name: "voice.wav" }] },
        },
      },
    };
    expect(saveDraft(h.deps, save)).toMatchObject({ ok: false, reason: "invalid-edit" });
    expect(
      saveDraft(h.deps, {
        ...save,
        document: {
          ...save.document,
          form: {
            ...save.document.form,
            provided: { ...save.document.form.provided, audio: null },
          },
        },
      }),
    ).toMatchObject({ ok: false, reason: "invalid-edit" });
    expect(must(readDraft(h.deps, id)).draft.version).toBe(1);
  } finally {
    h.close();
  }
});

it("forks ready shared bytes under independent IDs and retains stale local refs as reattach", () => {
  const h = draftFixture();
  const id = randomUUID();
  const attachmentId = randomUUID();
  const document = {
    ...h.document,
    form: {
      ...h.document.form,
      provided: { ...h.document.form.provided, images: [{ attachmentId, name: "picture.png" }] },
    },
  };
  try {
    must(createDraft(h.deps, { id, document }));
    const stagedId = h.deps.ids.next();
    insertStagedFile(h.deps.db, {
      id: stagedId,
      stageKind: "images",
      path: stagedId,
      originalFilename: "picture.png",
      bytes: 3,
      state: "staged",
      createdAt: h.deps.clock.now().toISOString(),
    });
    writeFileSync(stagingPath(h.deps.paths, stagedId), "abc");
    h.deps.db
      .prepare("UPDATE play_draft_attachments SET staged_file_id=?,status='ready' WHERE id=?")
      .run(stagedId, attachmentId);
    const fork = { sourceId: id, id: randomUUID(), document };
    const copied = must(forkDraft(h.deps, fork));
    expect(copied.attachments).toMatchObject([{ state: "ready", stagedFileId: stagedId }]);
    expect(copied.attachments[0]?.id).not.toBe(attachmentId);
    expect(must(forkDraft(h.deps, fork))).toEqual(copied);
    must(saveDraft(h.deps, { id, baseVersion: 1, mutationId: randomUUID(), document: h.document }));
    const stale = must(forkDraft(h.deps, { ...fork, id: randomUUID() }));
    expect(stale.attachments).toMatchObject([
      { state: "reattach", name: "picture.png", stagedFileId: null },
    ]);
    expect(stale.draft.document.form.provided.images).toHaveLength(1);
    expect(existsSync(stagingPath(h.deps.paths, stagedId))).toBe(true);
    expect(must(readDraft(h.deps, copied.draft.id)).attachments[0]?.state).toBe("ready");
  } finally {
    h.close();
  }
});

it("refuses writes during Start and rolls back document and refs on storage errors", () => {
  const h = draftFixture();
  const id = randomUUID();
  try {
    must(createDraft(h.deps, { id, document: h.document }));
    h.deps.db.exec(
      "CREATE TRIGGER fail_save BEFORE UPDATE ON play_drafts BEGIN SELECT RAISE(ABORT, 'disk failure'); END",
    );
    expect(() =>
      saveDraft(h.deps, {
        id,
        baseVersion: 1,
        mutationId: randomUUID(),
        document: { ...h.document, previewText: "unsaved" },
      }),
    ).toThrow("disk failure");
    expect(must(readDraft(h.deps, id)).draft.document).toEqual(h.document);
    h.deps.db.exec("DROP TRIGGER fail_save");
    h.deps.db
      .prepare("UPDATE play_drafts SET state='starting',review_id=? WHERE id=?")
      .run(randomUUID(), id);
    expect(
      saveDraft(h.deps, { id, baseVersion: 1, mutationId: randomUUID(), document: h.document }),
    ).toMatchObject({ ok: false, reason: "pending-start" });
    expect(
      forkDraft(h.deps, { sourceId: id, id: randomUUID(), document: h.document }),
    ).toMatchObject({ ok: false, reason: "pending-start" });
    expect(discardDraft(h.deps, { id, baseVersion: 1 })).toMatchObject({
      ok: false,
      reason: "pending-start",
    });
  } finally {
    h.close();
  }
});
