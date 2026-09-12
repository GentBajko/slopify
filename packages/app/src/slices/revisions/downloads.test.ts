import { readFileSync, rmSync } from "node:fs";
import { unzipSync } from "fflate";
import { afterEach, expect, it } from "vitest";
import { findDownload } from "../storage/downloads.js";
import { outputPath } from "../storage/layout.js";
import { reconcileStorage } from "../storage/reconcile.js";
import { retainedOutput, retainedPiece } from "./downloads.fake.js";
import { findRevisionDownload, revisionImagesZip } from "./downloads.js";
import { mutationFixture } from "./mutation.fake.js";
import { saveRevision } from "./mutations.js";
import { projectSelected } from "./projection.js";
import { insertRevision, outputsForRevision } from "./repo.js";
import { restoreRevision } from "./restore.js";
import { getRevisionView } from "./view.js";

const closes: (() => void)[] = [];
async function fixture() {
  const h = await mutationFixture();
  closes.push(h.close);
  return h;
}
afterEach(() => {
  for (const close of closes.splice(0)) close();
});

it("downloads retained record IDs with the saved title after newer output and title changes", async () => {
  const h = await fixture();
  const old = retainedOutput(h.deps, h.base.revision, "audio_export", "old.wav", "old bytes");
  const replacement = retainedOutput(
    h.deps,
    h.base.revision,
    "audio_export",
    "new.wav",
    "new bytes",
  );
  const saved = await saveRevision(h.deps, {
    projectId: h.projectId,
    baseRevisionId: h.base.revision.id,
    idempotencyKey: "rename",
    edit: { config: { ...h.config, title: "New title" }, content: h.base.revision.content },
  });
  if (!saved.ok) throw new Error(JSON.stringify(saved));
  reconcileStorage(h.deps.db, h.deps.paths);
  const result = findRevisionDownload(h.deps, h.projectId, h.base.revision.id, old.recordId);
  expect(result).toMatchObject({
    ok: true,
    download: { filename: "saved-audio-export.wav", contentType: "audio/wav", bytes: 9 },
  });
  if (result.ok) expect(readFileSync(result.download.path, "utf8")).toBe("old bytes");
  expect(
    findRevisionDownload(h.deps, h.projectId, h.base.revision.id, replacement.recordId).ok,
  ).toBe(true);
  expect(findRevisionDownload(h.deps, h.projectId, h.base.revision.id, old.row.output.id)).toEqual({
    ok: false,
    reason: "unknown-asset",
  });
  expect(findRevisionDownload(h.deps, h.projectId, saved.view.revision.id, old.recordId)).toEqual({
    ok: false,
    reason: "unknown-asset",
  });
});

it("serves an original revision's unselected audio piece without concatenation after save and restart", async () => {
  const h = await fixture();
  const piece = retainedPiece(h.deps, h.base.revision, "submitted audio");
  const text = retainedPiece(h.deps, h.base.revision, null);
  const saved = await saveRevision(h.deps, {
    projectId: h.projectId,
    baseRevisionId: h.base.revision.id,
    idempotencyKey: "new-head",
    edit: { config: { ...h.config, title: "Changed" }, content: h.base.revision.content },
  });
  expect(saved.ok).toBe(true);
  expect(reconcileStorage(h.deps.db, h.deps.paths).orphanFiles).toBe(0);
  const result = findRevisionDownload(h.deps, h.projectId, h.base.revision.id, piece.recordId);
  expect(result).toMatchObject({
    ok: true,
    download: { filename: "saved-audio-chunk-1.mp3", contentType: "audio/mpeg" },
  });
  if (result.ok) expect(readFileSync(result.download.path, "utf8")).toBe("submitted audio");
  expect(findRevisionDownload(h.deps, h.projectId, h.base.revision.id, text.recordId)).toEqual({
    ok: false,
    reason: "unknown-asset",
  });
  h.deps.db.exec("INSERT INTO projects VALUES ('other','Other','16:9','{}','old','old')");
  insertRevision(h.deps.db, { ...h.base.revision, id: "other-revision", projectId: "other" });
  expect(findRevisionDownload(h.deps, "other", "other-revision", piece.recordId)).toEqual({
    ok: false,
    reason: "unknown-asset",
  });
  expect(findRevisionDownload(h.deps, h.projectId, "other-revision", piece.recordId)).toEqual({
    ok: false,
    reason: "unknown-asset",
  });
  expect(findRevisionDownload(h.deps, "gone", h.base.revision.id, piece.recordId)).toEqual({
    ok: false,
    reason: "unknown-project",
  });
});

it("uses the registered asset path instead of a descriptor's path", async () => {
  const h = await fixture();
  const out = retainedOutput(h.deps, h.base.revision, "video", "safe.mp4", "owned bytes");
  h.deps.db
    .prepare("UPDATE revision_outputs SET descriptor=? WHERE id=?")
    .run(JSON.stringify({ ...out.row.output, path: "../../foreign.mp4" }), out.recordId);
  const result = findRevisionDownload(h.deps, h.projectId, h.base.revision.id, out.recordId);
  expect(result.ok).toBe(true);
  if (result.ok) expect(readFileSync(result.download.path, "utf8")).toBe("owned bytes");
});

it("zips only selected retained images in saved slideshow order, skipping missing files", async () => {
  const h = await fixture();
  const revision = {
    ...h.base.revision,
    content: { ...h.base.revision.content, imageOrder: ["second", "first", "missing"] },
  };
  h.deps.db
    .prepare("UPDATE project_revisions SET content=? WHERE id=?")
    .run(JSON.stringify(revision.content), revision.id);
  retainedOutput(h.deps, revision, "image", "old.png", "deselected", "image:first");
  retainedOutput(h.deps, revision, "image", "first.png", "first", "image:first");
  retainedOutput(h.deps, revision, "image", "second.jpg", "second", "image:second");
  const missing = retainedOutput(
    h.deps,
    revision,
    "image",
    "missing.png",
    "missing",
    "image:missing",
  );
  retainedOutput(h.deps, revision, "thumbnail", "thumbnail.webp", "thumb");
  retainedOutput(h.deps, revision, "video", "video.mp4", "excluded");
  rmSync(outputPath(h.deps.paths, h.projectId, missing.row.output.path));
  const result = revisionImagesZip(h.deps, h.projectId, revision.id);
  expect(result).toMatchObject({ ok: true, filename: "saved-images.zip" });
  if (!result.ok) throw new Error(result.reason);
  const entries = unzipSync(result.bytes);
  expect(Object.keys(entries)).toEqual([
    "saved-image-1.jpg",
    "saved-image-2.png",
    "saved-thumbnail.webp",
  ]);
  expect(Buffer.from(entries["saved-image-1.jpg"] ?? []).toString()).toBe("second");
  expect(Buffer.from(entries["saved-image-2.png"] ?? []).toString()).toBe("first");
  expect(revisionImagesZip(h.deps, h.projectId, "missing")).toEqual({
    ok: false,
    reason: "no-images",
  });
});

it("retains missing history through reconciliation and restore while reporting the file unavailable", async () => {
  const h = await fixture();
  const old = retainedOutput(h.deps, h.base.revision, "audio_export", "old.wav", "old");
  const saved = await saveRevision(h.deps, {
    projectId: h.projectId,
    baseRevisionId: h.base.revision.id,
    idempotencyKey: "save",
    edit: { config: { ...h.config, title: "Current" }, content: h.base.revision.content },
  });
  if (!saved.ok) throw new Error(JSON.stringify(saved));
  rmSync(outputPath(h.deps.paths, h.projectId, old.row.output.path));
  reconcileStorage(h.deps.db, h.deps.paths);
  expect(findRevisionDownload(h.deps, h.projectId, h.base.revision.id, old.recordId)).toEqual({
    ok: false,
    reason: "missing-file",
  });
  const restored = await restoreRevision(h.deps, {
    projectId: h.projectId,
    baseRevisionId: saved.view.revision.id,
    idempotencyKey: "restore",
    targetRevisionId: h.base.revision.id,
  });
  if (!restored.ok) throw new Error(JSON.stringify(restored));
  expect(restored.view.outputs.find((row) => row.assetId === old.row.assetId)?.available).toBe(
    false,
  );
  expect(
    getRevisionView(h.deps, h.projectId, h.base.revision.id)?.outputs.find(
      (row) => row.recordId === old.recordId,
    )?.available,
  ).toBe(false);
  expect(
    h.deps.db.prepare("SELECT id FROM project_assets WHERE id=?").get(old.row.assetId),
  ).toBeDefined();
});

it("leaves the atomic current download on the old export throughout a failed replacement", async () => {
  const h = await fixture();
  retainedOutput(h.deps, h.base.revision, "audio_export", "old.wav", "completed audio");
  projectSelected(h.deps.db, h.base.revision);
  retainedOutput(
    h.deps,
    h.base.revision,
    "audio_export",
    "failed.wav",
    "partial",
    "audio_export",
    false,
  );
  projectSelected(h.deps.db, h.base.revision);
  const result = findDownload(h.deps, h.projectId, "audio-export");
  expect(result.ok).toBe(true);
  if (result.ok) expect(readFileSync(result.download.path, "utf8")).toBe("completed audio");
  expect(
    outputsForRevision(h.deps.db, h.projectId, h.base.revision.id).filter((row) => row.selected),
  ).toHaveLength(1);
});
