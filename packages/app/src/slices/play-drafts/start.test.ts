import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { stringify } from "yaml";
import { stagedFiles } from "../storage/repo.js";
import { stageUpload } from "../storage/staging.js";
import { must, startFixture } from "./draft.fake.js";
import type { PlayDraftDocument } from "./model.js";
import { reviewDraft } from "./review.js";
import {
  createDraft,
  discardDraft,
  forkDraft,
  listDrafts,
  readDraft,
  saveDraft,
} from "./service.js";
import { startPlayDraft } from "./start.js";

it("replays one created project using the review UUID after reopen", async () => {
  const h = startFixture();
  const id = randomUUID();
  try {
    const view = must(createDraft(h.deps, { id, document: h.document }));
    const review = must(await reviewDraft(h.deps, { id, baseVersion: view.draft.version }));
    const input = { draftId: id, baseVersion: 1, reviewId: review.id };
    const results = await Promise.all([
      startPlayDraft(h.deps, input),
      startPlayDraft(h.deps, input),
    ]);
    const created = must(
      results[0] ?? { ok: false, reason: "not-found", currentVersion: null, fields: [] },
    );
    expect(results.filter((r) => r.ok && !r.value.replayed)).toHaveLength(1);
    h.reopen();
    expect(must(await startPlayDraft(h.deps, input))).toEqual({ ...created, replayed: true });
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM projects").get()?.n).toBe(1);
    expect(h.events).toHaveLength(1);
    expect(h.ticks).toHaveLength(1);
    expect(await startPlayDraft(h.deps, { ...input, draftId: randomUUID() })).toMatchObject({
      ok: false,
      reason: "conflict",
    });
  } finally {
    h.close();
  }
});
it("durably holds pending identity through discovery exceptions and refuses other edits", async () => {
  const h = startFixture();
  const id = randomUUID();
  try {
    must(createDraft(h.deps, { id, document: h.document }));
    const review = must(await reviewDraft(h.deps, { id, baseVersion: 1 }));
    const input = { draftId: id, baseVersion: 1, reviewId: review.id };
    const pending = startPlayDraft(h.deps, input);
    expect(must(readDraft(h.deps, id)).pendingStart?.reviewId).toBe(review.id);
    expect(listDrafts(h.deps).map((r) => r.id)).toContain(id);
    expect(
      saveDraft(h.deps, { id, baseVersion: 1, mutationId: randomUUID(), document: h.document }),
    ).toMatchObject({ reason: "pending-start" });
    expect(discardDraft(h.deps, { id, baseVersion: 1 })).toMatchObject({ reason: "pending-start" });
    expect(
      forkDraft(h.deps, { sourceId: id, id: randomUUID(), document: h.document }),
    ).toMatchObject({ reason: "pending-start" });
    expect(await reviewDraft(h.deps, { id, baseVersion: 1 })).toMatchObject({
      reason: "pending-start",
    });
    expect(await startPlayDraft(h.deps, { ...input, reviewId: randomUUID() })).toMatchObject({
      ok: false,
    });
    must(await pending);
  } finally {
    h.close();
  }
});

async function reviewed(
  h: ReturnType<typeof startFixture>,
  document: PlayDraftDocument = h.document,
) {
  const id = randomUUID();
  must(createDraft(h.deps, { id, document }));
  const review = must(await reviewDraft(h.deps, { id, baseVersion: 1 }));
  return { draftId: id, baseVersion: 1, reviewId: review.id };
}
async function audioDocument(h: ReturnType<typeof startFixture>, batch = false) {
  const attachmentId = randomUUID();
  const document = {
    ...h.document,
    variants: batch ? [{ id: randomUUID(), title: "Second", values: {} }] : [],
    form: {
      ...h.document.form,
      sources: { ...h.document.form.sources, audio: "provide" as const },
      provided: { ...h.document.form.provided, audio: { attachmentId, name: "voice.wav" } },
    },
  };
  const id = randomUUID();
  must(createDraft(h.deps, { id, document }));
  const upload = await stageUpload(h.deps, {
    stageKind: "audio",
    originalFilename: "voice.wav",
    content: (async function* () {
      yield new TextEncoder().encode("audio");
    })(),
  });
  if (!upload.ok) throw new Error("Upload failed");
  h.deps.db
    .prepare("UPDATE play_draft_attachments SET status='ready',staged_file_id=? WHERE id=?")
    .run(upload.file.id, attachmentId);
  const review = must(await reviewDraft(h.deps, { id, baseVersion: 1 }));
  return {
    input: { draftId: id, baseVersion: 1, reviewId: review.id },
    upload: upload.file,
    document,
  };
}
it.each(["draft", "catalogue", "file"] as const)(
  "refuses changed %s after claim without creation",
  async (change) => {
    const h = startFixture();
    try {
      const { input, upload } = await audioDocument(h);
      const pending = startPlayDraft(h.deps, input);
      if (change === "draft")
        h.deps.db
          .prepare(
            "UPDATE play_drafts SET document_json=json_set(document_json,'$.expectedWords','2000') WHERE id=?",
          )
          .run(input.draftId);
      if (change === "file") fs.rmSync(join(h.deps.paths.staging, upload.path));
      if (change === "catalogue")
        fs.writeFileSync(
          join(h.deps.paths.dataDir, "models.yaml"),
          stringify({ ...h.deps.catalogue.read(), updatedAt: "2099-01-01" }),
        );
      expect(await pending).toMatchObject({ ok: false, reason: "stale-review" });
      expect(must(readDraft(h.deps, input.draftId))).toMatchObject({
        pendingStart: null,
        review: null,
      });
      expect(h.deps.db.prepare("SELECT * FROM projects").all()).toHaveLength(0);
    } finally {
      h.close();
    }
  },
);
it("rolls back every project, stage, queue and receipt on the second real file copy failure", async () => {
  const h = startFixture();
  try {
    const { input, upload } = await audioDocument(h, true);
    let blocked = false;
    const deps = {
      ...h.deps,
      ids: {
        next: () => {
          const id = h.deps.ids.next();
          if (
            !blocked &&
            h.deps.db.prepare("SELECT count(*) AS n FROM project_queue").get()?.n === 1
          ) {
            blocked = true;
            fs.mkdirSync(join(h.deps.paths.projects, id, "audio-body.wav"), { recursive: true });
          }
          return id;
        },
      },
    };
    await expect(startPlayDraft(deps, input)).rejects.toThrow();
    expect(blocked).toBe(true);
    for (const table of ["projects", "stages", "batches", "project_queue", "play_start_receipts"])
      expect(h.deps.db.prepare(`SELECT * FROM ${table}`).all()).toHaveLength(0);
    expect(must(readDraft(h.deps, input.draftId)).pendingStart?.reviewId).toBe(input.reviewId);
    expect(stagedFiles(h.deps.db)).toHaveLength(1);
    expect(fs.readFileSync(join(h.deps.paths.staging, upload.path), "utf8")).toBe("audio");
    h.reopen();
    const created = must(await startPlayDraft(h.deps, input));
    expect(created.projectIds).toHaveLength(2);
    expect(created.queue).toHaveLength(2);
    expect(h.events).toHaveLength(2);
  } finally {
    h.close();
  }
});
it("keeps successful receipt authoritative when cleanup, telemetry or dispatch fails", async () => {
  const h = startFixture();
  try {
    const { input, upload } = await audioDocument(h);
    const warn = vi.fn();
    const created = must(
      await startPlayDraft(
        {
          ...h.deps,
          log: { write: warn },
          recordStarted: () => {
            const path = join(h.deps.paths.staging, upload.path);
            fs.rmSync(path);
            fs.mkdirSync(path);
            fs.writeFileSync(join(path, "held"), "held");
            throw new Error("telemetry failed");
          },
          runner: {
            ...h.deps.runner,
            tick: () => {
              throw new Error("dispatch failed");
            },
          },
        },
        input,
      ),
    );
    expect(warn).toHaveBeenCalledTimes(3);
    expect(must(await startPlayDraft(h.deps, input))).toEqual({ ...created, replayed: true });
    expect(h.events).toHaveLength(0);
    expect(h.ticks).toHaveLength(0);
    expect(must(readDraft(h.deps, input.draftId)).start?.projectIds).toEqual(created.projectIds);
  } finally {
    h.close();
  }
});
it("releases inactive attachments only after committing and preserves fork owners", async () => {
  const h = startFixture();
  try {
    const { input, upload, document } = await audioDocument(h);
    const fork = must(forkDraft(h.deps, { sourceId: input.draftId, id: randomUUID(), document }));
    must(
      saveDraft(h.deps, {
        id: input.draftId,
        baseVersion: 1,
        mutationId: randomUUID(),
        document: {
          ...document,
          form: { ...document.form, sources: { ...document.form.sources, audio: "off" } },
        },
      }),
    );
    const review = must(await reviewDraft(h.deps, { id: input.draftId, baseVersion: 2 }));
    must(await startPlayDraft(h.deps, { ...input, baseVersion: 2, reviewId: review.id }));
    expect(stagedFiles(h.deps.db)).toHaveLength(1);
    expect(must(readDraft(h.deps, fork.draft.id)).attachments[0]?.state).toBe("ready");
    must(discardDraft(h.deps, { id: fork.draft.id, baseVersion: 1 }));
    expect(fs.existsSync(join(h.deps.paths.staging, upload.path))).toBe(false);
  } finally {
    h.close();
  }
});
it("retains a pending identity through discovery failure and unlocks on expected readiness refusal", async () => {
  const h = startFixture();
  try {
    const model = h.deps.catalogue.read().tts[0];
    if (!model) throw new Error("Missing model");
    const document = {
      ...h.document,
      form: {
        ...h.document.form,
        sources: { ...h.document.form.sources, audio: "generate" as const },
        audio: { provider: model.provider, model: model.id, voice: "voice" },
      },
    };
    const input = await reviewed(h, document);
    await expect(
      startPlayDraft(
        {
          ...h.deps,
          providers: async () => {
            throw new Error("discovery failed");
          },
        },
        input,
      ),
    ).rejects.toThrow("discovery failed");
    h.reopen();
    expect(must(readDraft(h.deps, input.draftId)).pendingStart?.reviewId).toBe(input.reviewId);
    expect(await startPlayDraft(h.deps, input)).toMatchObject({ ok: false, reason: "readiness" });
    expect(must(readDraft(h.deps, input.draftId)).pendingStart).toBeNull();
    expect(
      saveDraft(h.deps, { id: input.draftId, baseVersion: 1, mutationId: randomUUID(), document }),
    ).toMatchObject({ ok: true });
  } finally {
    h.close();
  }
});
it("retains the claim when synchronous identity resolution fails", async () => {
  const h = startFixture();
  try {
    const input = await reviewed(h);
    await expect(
      startPlayDraft(
        {
          ...h.deps,
          catalogue: {
            ...h.deps.catalogue,
            read: () => {
              throw new Error("catalogue I/O failed");
            },
          },
        },
        input,
      ),
    ).rejects.toThrow("catalogue I/O failed");
    expect(must(readDraft(h.deps, input.draftId)).pendingStart?.reviewId).toBe(input.reviewId);
    must(await startPlayDraft(h.deps, input));
  } finally {
    h.close();
  }
});
it("refuses an inconsistent stored execution snapshot", async () => {
  const h = startFixture();
  try {
    const input = await reviewed(h);
    h.deps.db
      .prepare(
        "UPDATE play_drafts SET review_json=json_set(review_json,'$.review.runs[0].draft.title','Unreviewed') WHERE id=?",
      )
      .run(input.draftId);
    expect(await startPlayDraft(h.deps, input)).toMatchObject({
      ok: false,
      reason: "stale-review",
    });
    expect(h.deps.db.prepare("SELECT * FROM projects").all()).toHaveLength(0);
  } finally {
    h.close();
  }
});
