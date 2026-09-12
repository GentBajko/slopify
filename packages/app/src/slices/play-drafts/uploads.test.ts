import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { stagingPath } from "../storage/layout.js";
import { reconcileStorage } from "../storage/reconcile.js";
import { stagedFiles } from "../storage/repo.js";
import { stageUpload } from "../storage/staging.js";
import { draftFixture, must } from "./draft.fake.js";
import { createDraft, discardDraft, readDraft, saveDraft } from "./service.js";
import { uploadDraftAttachment } from "./uploads.js";

async function* content() {
  yield Buffer.from("owned staging bytes");
}
function owned(h: ReturnType<typeof draftFixture>, kind: "audio" | "images" = "images") {
  const id = randomUUID();
  const attachmentId = randomUUID();
  const ref = { attachmentId, name: kind === "audio" ? "audio.wav" : "image.png" };
  const document = {
    ...h.document,
    form: {
      ...h.document.form,
      provided: {
        ...h.document.form.provided,
        ...(kind === "images" ? { images: [ref] } : { audio: ref }),
      },
    },
  };
  must(createDraft(h.deps, { id, document }));
  return { id, attachmentId, document };
}
it.each(["audio", "images"] as const)(
  "retains completed owned %s bytes across restart",
  async (kind) => {
    const h = draftFixture();
    try {
      const o = owned(h, kind);
      const file = must(
        await uploadDraftAttachment(h.deps, {
          draftId: o.id,
          attachmentId: o.attachmentId,
          content: content(),
        }),
      );
      if (file.stagedFileId === null) throw new Error("Missing staged identity");
      h.reopen();
      reconcileStorage(h.deps.db, h.deps.paths);
      expect(readFileSync(stagingPath(h.deps.paths, file.stagedFileId))).toEqual(
        Buffer.from("owned staging bytes"),
      );
      expect(must(readDraft(h.deps, o.id))).toMatchObject({
        draft: { version: 1 },
        attachments: [{ state: "ready", name: kind === "audio" ? "audio.wav" : "image.png" }],
      });
    } finally {
      h.close();
    }
  },
);
it.each(["remove", "replace", "discard"])(
  "does not resurrect topology after %s during upload",
  async (operation) => {
    const h = draftFixture();
    let signal = () => {};
    let release = () => {};
    const waiting = new Promise<void>((resolve) => {
      signal = resolve;
    });
    const resumed = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      const o = owned(h);
      async function* delayed() {
        yield Buffer.from("first");
        signal();
        await resumed;
        yield Buffer.from("last");
      }
      const uploading = uploadDraftAttachment(h.deps, {
        draftId: o.id,
        attachmentId: o.attachmentId,
        content: delayed(),
      });
      await waiting;
      expect(must(readDraft(h.deps, o.id)).attachments[0]?.state).toBe("copying");
      if (operation === "discard") must(discardDraft(h.deps, { id: o.id, baseVersion: 1 }));
      else
        must(
          saveDraft(h.deps, {
            id: o.id,
            baseVersion: 1,
            mutationId: randomUUID(),
            document: {
              ...o.document,
              form: {
                ...o.document.form,
                provided: {
                  ...o.document.form.provided,
                  images:
                    operation === "replace"
                      ? [{ attachmentId: randomUUID(), name: "replacement.png" }]
                      : [],
                },
              },
            },
          }),
        );
      release();
      expect(await uploading).toMatchObject({ ok: false, reason: "not-found" });
      expect(stagedFiles(h.deps.db)).toEqual([]);
      expect(readdirSync(h.deps.paths.staging)).toEqual([]);
      if (operation !== "discard")
        expect(must(readDraft(h.deps, o.id)).attachments).toHaveLength(
          operation === "replace" ? 1 : 0,
        );
    } finally {
      release();
      h.close();
    }
  },
);
it("refuses duplicate and locked uploads before consuming content", async () => {
  const h = draftFixture();
  try {
    const o = owned(h);
    must(
      await uploadDraftAttachment(h.deps, {
        draftId: o.id,
        attachmentId: o.attachmentId,
        content: content(),
      }),
    );
    let consumed = false;
    async function* unexpected() {
      consumed = true;
      yield Buffer.from("bad");
    }
    const input = { draftId: o.id, attachmentId: o.attachmentId, content: unexpected() };
    expect(await uploadDraftAttachment(h.deps, input)).toMatchObject({
      ok: false,
      reason: "conflict",
    });
    for (const state of ["starting", "started"]) {
      h.deps.db.prepare("UPDATE play_drafts SET state=? WHERE id=?").run(state, o.id);
      expect(await uploadDraftAttachment(h.deps, input)).toMatchObject({
        ok: false,
        reason: state === "starting" ? "pending-start" : "already-started",
      });
    }
    expect(consumed).toBe(false);
  } finally {
    h.close();
  }
});
it.each(["empty", "failed"])(
  "keeps %s uploads actionable without partial bytes",
  async (failure) => {
    const h = draftFixture();
    try {
      const o = owned(h);
      async function* broken() {
        if (failure === "failed") {
          yield Buffer.from("partial");
          throw new Error("stream failed");
        }
      }
      const upload = uploadDraftAttachment(h.deps, {
        draftId: o.id,
        attachmentId: o.attachmentId,
        content: broken(),
      });
      if (failure === "failed") await expect(upload).rejects.toThrow("stream failed");
      else expect(await upload).toMatchObject({ ok: false, reason: "invalid-edit" });
      expect(must(readDraft(h.deps, o.id)).attachments).toMatchObject([
        { name: "image.png", state: "reattach", stagedFileId: null },
      ]);
      expect(stagedFiles(h.deps.db)).toEqual([]);
      expect(readdirSync(h.deps.paths.staging)).toEqual([]);
    } finally {
      h.close();
    }
  },
);
it("rolls back allocation and opens no file when binding throws", async () => {
  const h = draftFixture();
  try {
    let allocated = "";
    await expect(
      stageUpload(
        { ...h.deps, emit: () => undefined },
        {
          stageKind: "images",
          originalFilename: "image.png",
          content: content(),
          onAllocated: (file) => {
            allocated = file.id;
            throw new Error("binding refused");
          },
        },
      ),
    ).rejects.toThrow("binding refused");
    expect(stagedFiles(h.deps.db)).toEqual([]);
    expect(existsSync(stagingPath(h.deps.paths, allocated))).toBe(false);
  } finally {
    h.close();
  }
});

it.each(["  Original.png  ", "bad.png\n"])(
  "validates the saved filename without silently replacing %j",
  async (name) => {
    const h = draftFixture();
    try {
      const id = randomUUID();
      const attachmentId = randomUUID();
      const document = {
        ...h.document,
        form: {
          ...h.document.form,
          provided: { ...h.document.form.provided, images: [{ attachmentId, name }] },
        },
      };
      must(createDraft(h.deps, { id, document }));
      const result = await uploadDraftAttachment(h.deps, {
        draftId: id,
        attachmentId,
        content: content(),
      });
      if (name.endsWith("\n")) {
        expect(result).toMatchObject({ ok: false, reason: "invalid-edit" });
        expect(stagedFiles(h.deps.db)).toEqual([]);
      } else {
        expect(must(result).name).toBe(name);
        expect(stagedFiles(h.deps.db)[0]?.originalFilename).toBe(name);
      }
    } finally {
      h.close();
    }
  },
);

it("refuses invalid identities, missing attachments and another draft's attachment", async () => {
  const h = draftFixture();
  try {
    const first = owned(h);
    const second = owned(h);
    for (const [draftId, attachmentId, reason] of [
      ["invalid", first.attachmentId, "invalid-edit"],
      [first.id, "invalid", "invalid-edit"],
      [randomUUID(), first.attachmentId, "not-found"],
      [first.id, randomUUID(), "not-found"],
      [first.id, second.attachmentId, "not-found"],
    ]) {
      if (draftId === undefined || attachmentId === undefined)
        throw new Error("Invalid test identity");
      expect(
        await uploadDraftAttachment(h.deps, { draftId, attachmentId, content: content() }),
      ).toMatchObject({ ok: false, reason });
    }
    expect(stagedFiles(h.deps.db)).toEqual([]);
  } finally {
    h.close();
  }
});
