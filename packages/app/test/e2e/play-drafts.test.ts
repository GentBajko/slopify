import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { type Boot, boot } from "../../src/main.js";
import { draftViewSchema, playStartResultSchema } from "../../src/slices/play-drafts/schema.js";
import { stagedFiles } from "../../src/slices/storage/repo.js";
import { stagedFileSchema } from "../../src/slices/storage/schema.js";
import * as telemetry from "../../src/slices/telemetry/record.js";
import {
  bytes,
  counts,
  createSupplied,
  draftJson,
  draftRequest,
  filePath,
  inspect,
  media,
  originalOutputs,
  reviewInput,
  stagedBytes,
  suppliedDocument,
} from "./play-drafts.http.js";

const running = new Set<Boot>();
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const app of running) await stop(app);
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
async function start(dataDir?: string): Promise<Boot> {
  const directory = dataDir ?? mkdtempSync(join(tmpdir(), "slopify-play-e2e-"));
  if (!dataDir) roots.push(directory);
  const app = await boot({ port: 0, host: "127.0.0.1", dataDir: directory, open: false });
  running.add(app);
  return app;
}
async function stop(app: Boot): Promise<void> {
  await app.stop();
  running.delete(app);
}
const refusal = z.object({
  reason: z.string(),
  fields: z.array(z.object({ field: z.string(), message: z.string() })),
});
const problem = z.object({ status: z.number() });

describe("Play drafts through real restart and admission", () => {
  it.each([false, true])(
    "retains exact inputs and replays a lost accepted response after reboot (batch=%s)",
    async (batch) => {
      let app = await start();
      const fixture = media(app.paths.dataDir);
      const base = suppliedDocument(batch);
      const document = { ...base, form: { ...base.form, title: "" } };
      const view = await createSupplied(app, document, fixture);
      const path = `/api/drafts/${view.draft.id}`;
      const originalStaging = stagedBytes(app);
      const abandonedForm = new FormData();
      abandonedForm.set("file", new File([new Uint8Array(fixture.audio)], "abandoned.wav"));
      const abandoned = await draftRequest(
        app,
        "/api/staging/audio",
        stagedFileSchema,
        { method: "POST", body: abandonedForm },
        201,
      );
      await stop(app);
      app = await start(app.paths.dataDir);
      const restored = await draftRequest(app, path, draftViewSchema);
      expect(restored.draft.document).toEqual(document);
      expect(restored.attachments.every((file) => file.state === "ready")).toBe(true);
      expect(stagedBytes(app)).toEqual(originalStaging);
      expect(existsSync(join(app.paths.staging, abandoned.path))).toBe(false);
      for (const [index, image] of document.form.provided.images.entries())
        expect(await bytes(app, filePath(view.draft.id, image.attachmentId))).toEqual(
          fixture.images[index],
        );
      const readyDocument = { ...document, form: { ...document.form, title: "Supplied run" } };
      const ready = await draftRequest(app, path, draftViewSchema, {
        ...draftJson({
          baseVersion: restored.draft.version,
          mutationId: randomUUID(),
          document: readyDocument,
        }),
        method: "PUT",
      });
      const input = await reviewInput(app, ready);
      // The client deliberately never reads the successful Start body before losing its app instance.
      const lost = await fetch(`${app.url}${path}/start`, draftJson(input));
      expect(lost.status).toBe(201);
      await lost.body?.cancel();
      const firstIds = inspect(app, (db) =>
        db
          .prepare("SELECT id FROM projects ORDER BY created_at,id")
          .all()
          .map((row) => String(row.id)),
      );
      await stop(app);
      app = await start(app.paths.dataDir);
      const consumed = await draftRequest(app, path, draftViewSchema);
      expect(consumed.draft.document).toEqual(readyDocument);
      expect(consumed.start?.projectIds.toSorted()).toEqual(firstIds.toSorted());
      expect(consumed.attachments).toEqual([]);
      expect(stagedBytes(app)).toEqual([]);
      const replay = await draftRequest(
        app,
        `${path}/start`,
        playStartResultSchema,
        draftJson(input),
      );
      expect(replay).toMatchObject({
        requestId: input.reviewId,
        projectIds: consumed.start?.projectIds,
        replayed: true,
      });
      expect(counts(app)).toEqual({
        projects: batch ? 2 : 1,
        batches: batch ? 1 : 0,
        receipts: 1,
        attempts: 0,
      });
      expect(new Set(replay.queue.map((entry) => entry.batchId)).size).toBe(batch ? 1 : 0);
      expect(replay.projectIds[0]).toBe(consumed.start?.projectIds[0]);
      for (const id of replay.projectIds) await originalOutputs(app, id, fixture);
      await draftRequest(app, path, z.object({ discarded: z.literal(true) }), {
        ...draftJson({ baseVersion: input.baseVersion }),
        method: "DELETE",
      });
      const detached = await draftRequest(
        app,
        `${path}/start`,
        playStartResultSchema,
        draftJson(input),
      );
      expect(detached).toEqual(replay);
    },
    60000,
  );

  it("recovers interrupted copying as unavailable and never admits it", async () => {
    let app = await start();
    const fixture = media(app.paths.dataDir);
    const view = await createSupplied(app, suppliedDocument(), fixture);
    const image = view.attachments.find((file) => file.kind === "images");
    if (!image?.stagedFileId) throw new Error("Missing image fixture");
    const copying = inspect(app, (db) => {
      db.prepare("UPDATE staged_files SET state='copying' WHERE id=?").run(image.stagedFileId);
      return stagedFiles(db).find((file) => file.id === image.stagedFileId);
    });
    if (!copying) throw new Error("Missing staged fixture");
    writeFileSync(
      join(app.paths.staging, copying.path),
      fixture.images[0]?.subarray(0, 12) ?? Buffer.alloc(0),
    );
    await stop(app);
    app = await start(app.paths.dataDir);
    const recovered = await draftRequest(app, `/api/drafts/${view.draft.id}`, draftViewSchema);
    expect(recovered.attachments.find((file) => file.id === image.id)).toMatchObject({
      state: "reattach",
      stagedFileId: null,
    });
    expect((await fetch(`${app.url}${filePath(view.draft.id, image.id)}`)).status).toBe(404);
    expect(existsSync(join(app.paths.staging, copying.path))).toBe(false);
    const denied = await draftRequest(
      app,
      `/api/drafts/${view.draft.id}/review`,
      refusal,
      draftJson({ baseVersion: 1 }),
      400,
    );
    expect(denied.fields.some((field) => field.field.startsWith("provided.images"))).toBe(true);
    await draftRequest(
      app,
      `/api/drafts/${view.draft.id}/start`,
      refusal,
      draftJson({ baseVersion: 1, reviewId: randomUUID() }),
      409,
    );
    expect(counts(app)).toEqual({ projects: 0, batches: 0, receipts: 0, attempts: 0 });
  });

  it.each(["copy", "receipt-single", "receipt-batch"] as const)(
    "retains source bytes and draft after %s rollback, then retries successfully",
    async (failure) => {
      let app = await start();
      const fixture = media(app.paths.dataDir);
      const view = await createSupplied(
        app,
        suppliedDocument(failure === "receipt-batch"),
        fixture,
      );
      const input = await reviewInput(app, view);
      const before = stagedBytes(app);
      const blocker = join(app.paths.staging, "blocked-copy");
      if (failure === "copy") mkdirSync(blocker);
      inspect(app, (db) => {
        if (failure === "copy") {
          db.exec(
            `CREATE TRIGGER fail_copy AFTER INSERT ON outputs WHEN NEW.role='audio_body' BEGIN UPDATE staged_files SET path='blocked-copy' WHERE id=(SELECT staged_file_id FROM play_draft_attachments WHERE kind='images' ORDER BY id LIMIT 1); END`,
          );
        } else {
          db.exec(
            "CREATE TRIGGER fail_receipt BEFORE INSERT ON play_start_receipts BEGIN SELECT RAISE(ABORT,'forced outer admission rollback'); END",
          );
        }
      });
      await draftRequest(app, `/api/drafts/${view.draft.id}/start`, problem, draftJson(input), 500);
      expect(counts(app)).toEqual({ projects: 0, batches: 0, receipts: 0, attempts: 0 });
      expect(stagedBytes(app)).toEqual(before);
      const pending = await draftRequest(app, `/api/drafts/${view.draft.id}`, draftViewSchema);
      expect(pending.draft.document).toEqual(view.draft.document);
      expect(pending.pendingStart?.reviewId).toBe(input.reviewId);
      inspect(app, (db) =>
        db.exec(failure === "copy" ? "DROP TRIGGER fail_copy" : "DROP TRIGGER fail_receipt"),
      );
      await stop(app);
      app = await start(app.paths.dataDir);
      expect(stagedBytes(app)).toEqual(before);
      const retried = await draftRequest(
        app,
        `/api/drafts/${view.draft.id}/start`,
        playStartResultSchema,
        draftJson(input),
        201,
      );
      expect(retried.projectIds).toHaveLength(failure === "receipt-batch" ? 2 : 1);
      expect(counts(app).receipts).toBe(1);
      for (const id of retried.projectIds) await originalOutputs(app, id, fixture);
    },
    60000,
  );

  it.each(["file", "catalogue"] as const)(
    "refuses changed %s after review without creating or calling a provider",
    async (change) => {
      const app = await start();
      const fixture = media(app.paths.dataDir);
      const view = await createSupplied(app, suppliedDocument(), fixture);
      const input = await reviewInput(app, view);
      if (change === "file") {
        const file = inspect(app, (db) => stagedFiles(db).find((one) => one.stageKind === "audio"));
        if (!file) throw new Error("Missing supplied audio");
        rmSync(join(app.paths.staging, file.path));
      } else {
        const path = join(app.paths.dataDir, "models.yaml");
        writeFileSync(
          path,
          readFileSync(path, "utf8").replace(/updatedAt: .*/, 'updatedAt: "2099-01-01"'),
        );
      }
      const denied = await draftRequest(
        app,
        `/api/drafts/${view.draft.id}/start`,
        refusal,
        draftJson(input),
        409,
      );
      expect(denied.reason).toBe("stale-review");
      if (change === "file")
        expect(denied.fields).toEqual(
          expect.arrayContaining([expect.objectContaining({ field: "provided.audio" })]),
        );
      expect(
        (await draftRequest(app, `/api/drafts/${view.draft.id}`, draftViewSchema)).draft.document,
      ).toEqual(view.draft.document);
      expect(counts(app)).toEqual({ projects: 0, batches: 0, receipts: 0, attempts: 0 });
    },
  );

  it("returns an accepted result through notification failure and recovers its receipt at boot", async () => {
    let app = await start();
    const fixture = media(app.paths.dataDir);
    const view = await createSupplied(app, suppliedDocument(), fixture);
    const input = await reviewInput(app, view);
    const record = telemetry.record;
    let failures = 0;
    vi.spyOn(telemetry, "record").mockImplementation((deps, type, counters) => {
      if (type === "project.created") {
        failures++;
        throw new Error("Notification failed after commit");
      }
      return record(deps, type, counters);
    });
    const accepted = await draftRequest(
      app,
      `/api/drafts/${view.draft.id}/start`,
      playStartResultSchema,
      draftJson(input),
      201,
    );
    expect(failures).toBe(1);
    expect(accepted.replayed).toBe(false);
    await stop(app);
    vi.restoreAllMocks();
    app = await start(app.paths.dataDir);
    const replay = await draftRequest(
      app,
      `/api/drafts/${view.draft.id}/start`,
      playStartResultSchema,
      draftJson(input),
    );
    expect(replay).toEqual({ ...accepted, replayed: true });
    expect(counts(app)).toEqual({ projects: 1, batches: 0, receipts: 1, attempts: 0 });
    for (const id of replay.projectIds) await originalOutputs(app, id, fixture);
  }, 60000);
});
