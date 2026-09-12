import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { draftFixture, must } from "./draft.fake.js";
import { createDraft, listDrafts, readDraft, saveDraft } from "./service.js";

it("reads attachment recovery state without mutating storage", () => {
  const h = draftFixture();
  const id = randomUUID();
  const attachmentId = randomUUID();
  try {
    must(
      createDraft(h.deps, {
        id,
        document: {
          ...h.document,
          form: {
            ...h.document.form,
            provided: { ...h.document.form.provided, audio: { attachmentId, name: "voice.wav" } },
          },
        },
      }),
    );
    h.deps.db
      .prepare("UPDATE play_draft_attachments SET status='ready' WHERE id=?")
      .run(attachmentId);
    h.deps.db.exec(
      "CREATE TRIGGER no_read_write BEFORE UPDATE ON play_draft_attachments BEGIN SELECT RAISE(ABORT,'read mutation'); END",
    );
    expect(must(readDraft(h.deps, id)).attachments[0]?.state).toBe("reattach");
  } finally {
    h.close();
  }
});
it("keeps invalid JSON available as unreadable draft metadata", () => {
  const h = draftFixture();
  const id = randomUUID();
  try {
    must(createDraft(h.deps, { id, document: h.document }));
    h.deps.db.exec("PRAGMA ignore_check_constraints=ON");
    h.deps.db.prepare("UPDATE play_drafts SET document_json='broken json' WHERE id=?").run(id);
    expect(readDraft(h.deps, id)).toMatchObject({ ok: false, reason: "invalid-draft" });
    expect(listDrafts(h.deps)).toMatchObject([{ id, readable: false }]);
  } finally {
    h.close();
  }
});
it("projects only the public review from the retained execution snapshot", () => {
  const h = draftFixture();
  const id = randomUUID();
  try {
    must(createDraft(h.deps, { id, document: h.document }));
    const review = {
      id: randomUUID(),
      draftId: id,
      draftVersion: 1,
      fingerprint: "fingerprint",
      runs: [],
      estimates: [],
    };
    const stored = {
      review,
      execution: { font: { path: "private-font-path" }, catalogue: {}, attachmentIdentity: [] },
    };
    h.deps.db
      .prepare("UPDATE play_drafts SET review_id=?,review_json=? WHERE id=?")
      .run(review.id, JSON.stringify(stored), id);
    const view = must(readDraft(h.deps, id));
    expect(view.review).toEqual(review);
    expect(JSON.stringify(view)).not.toContain("private-font-path");
  } finally {
    h.close();
  }
});

it("returns conflict when SQLite does not accept the compare-and-swap", () => {
  const h = draftFixture();
  const id = randomUUID();
  try {
    must(createDraft(h.deps, { id, document: h.document }));
    h.deps.db.exec(
      "CREATE TRIGGER ignore_save BEFORE UPDATE ON play_drafts BEGIN SELECT RAISE(IGNORE); END",
    );
    const document = {
      ...h.document,
      form: {
        ...h.document.form,
        provided: {
          ...h.document.form.provided,
          audio: { attachmentId: randomUUID(), name: "unsaved.wav" },
        },
      },
    };
    expect(
      saveDraft(h.deps, { id, baseVersion: 1, mutationId: randomUUID(), document }),
    ).toMatchObject({ ok: false, reason: "conflict" });
    expect(must(readDraft(h.deps, id)).attachments).toEqual([]);
  } finally {
    h.close();
  }
});

it("rolls back the document if attachment topology cannot be written", () => {
  const h = draftFixture();
  const id = randomUUID();
  try {
    must(createDraft(h.deps, { id, document: h.document }));
    h.deps.db.exec(
      "CREATE TRIGGER fail_topology BEFORE INSERT ON play_draft_attachments BEGIN SELECT RAISE(ABORT,'attachment disk failure'); END",
    );
    const document = {
      ...h.document,
      form: {
        ...h.document.form,
        provided: {
          ...h.document.form.provided,
          audio: { attachmentId: randomUUID(), name: "unsaved.wav" },
        },
      },
    };
    expect(() =>
      saveDraft(h.deps, { id, baseVersion: 1, mutationId: randomUUID(), document }),
    ).toThrow("attachment disk failure");
    expect(must(readDraft(h.deps, id)).draft).toMatchObject({ version: 1, document: h.document });
  } finally {
    h.close();
  }
});
