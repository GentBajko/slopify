import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { draftFixture, must } from "./draft.fake.js";
import { createDraft, forkDraft, readDraft, saveDraft } from "./service.js";

it.each(["create", "fork"])(
  "refuses %s replay after another writer advances its target",
  (kind) => {
    const h = draftFixture();
    try {
      const sourceId = randomUUID();
      must(createDraft(h.deps, { id: sourceId, document: h.document }));
      const input = { id: randomUUID(), sourceId, document: h.document };
      const replay = () =>
        kind === "create"
          ? createDraft(h.deps, { id: input.id, document: input.document })
          : forkDraft(h.deps, input);
      const first = must(replay());
      expect(must(replay())).toEqual(first);
      const document = {
        ...first.draft.document,
        form: {
          ...first.draft.document.form,
          provided: { ...first.draft.document.form.provided, article: "Other writer's article" },
        },
      };
      must(saveDraft(h.deps, { id: input.id, baseVersion: 1, mutationId: randomUUID(), document }));
      h.reopen();
      expect(replay()).toMatchObject({ ok: false, reason: "conflict", currentVersion: 2 });
      expect(must(readDraft(h.deps, input.id)).draft.document).toEqual(document);
    } finally {
      h.close();
    }
  },
);

it.each(["create", "fork"])(
  "refuses %s replay after target Start claims or consumes it",
  (kind) => {
    const h = draftFixture();
    try {
      const sourceId = randomUUID();
      must(createDraft(h.deps, { id: sourceId, document: h.document }));
      const input = { id: randomUUID(), sourceId, document: h.document };
      const replay = () =>
        kind === "create"
          ? createDraft(h.deps, { id: input.id, document: input.document })
          : forkDraft(h.deps, input);
      must(replay());
      for (const state of ["starting", "started"]) {
        h.deps.db
          .prepare("UPDATE play_drafts SET state=?,review_id=? WHERE id=?")
          .run(state, randomUUID(), input.id);
        expect(replay()).toMatchObject({ ok: false, reason: "conflict", currentVersion: 1 });
      }
    } finally {
      h.close();
    }
  },
);
