import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { writeSampleRecord } from "../onboarding/state.js";
import { revisionFixture } from "../revisions/revision.fake.js";
import { storageUsage } from "./portable.js";
import {
  cleanUpAll,
  deleteAllOldVersions,
  keepOutputsOnly,
  outputRoles,
  projectStorage,
} from "./trim.js";

let close = (): void => {};
afterEach(() => {
  close();
  close = () => {};
});

function fixture() {
  const h = revisionFixture();
  close = h.close;
  const { db, paths } = h.deps;
  const dir = join(paths.projects, h.projectId);
  db.exec(
    `INSERT INTO project_revisions VALUES ('rev1','p1',NULL,NULL,'{}','{"provided":{"thumbnail":"a-upload"}}','{}','t')`,
  );
  const file = (path: string, bytes: number): void => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), Buffer.alloc(bytes));
  };
  const asset = (id: string, path: string, role: string, bytes: number): void => {
    file(path, bytes);
    db.prepare("INSERT INTO project_assets VALUES (?,'p1',?,?,'t')").run(id, path, bytes);
    db.prepare(
      "INSERT INTO revision_outputs VALUES (?,'p1','rev1',?,?,?,'f','ready',?,NULL,1,'t')",
    ).run(
      `o-${id}`,
      id,
      id,
      id,
      JSON.stringify({ id: `o-${id}`, projectId: "p1", stageKind: "video", role, path }),
    );
  };
  asset("a-video", "video.mp4", "video", 1000);
  asset("a-short", "shorts/short-01.mp4", "short_video", 400);
  asset("a-thumb", "thumbnail.png", "thumbnail", 50);
  asset("a-article", "article.md", "article_md", 10);
  asset("a-description", "description.txt", "youtube_description", 5);
  asset("a-pdf", "document.pdf", "document_pdf", 30);
  asset("a-image", "images/001.png", "image", 300);
  asset("a-body", "audio-body.mp3", "audio_body", 700);
  asset("a-render", "render.json", "render_params", 2);
  // Supplied by the user: named by the revision, so nothing could make it again.
  file("reference.png", 90);
  db.prepare("INSERT INTO project_assets VALUES ('a-upload','p1','reference.png',90,'t')").run();
  // Not named by any record: reconcile's to judge, never this.
  file("stray.bin", 7);
  db.prepare(
    "INSERT INTO stages (id,project_id,kind,source,state) VALUES ('s-video','p1','video','generate','done')",
  ).run();
  return { h, dir };
}

it("splits a project's size into outputs and working files", () => {
  const { h } = fixture();
  expect(projectStorage(h.deps, "p1")).toEqual({
    outputsBytes: 1000 + 400 + 50 + 10 + 5 + 30 + 300,
    workingBytes: 700 + 2 + 90 + 7,
    removableFiles: 2,
    removableBytes: 700 + 2,
    historyFiles: 0,
    historyBytes: 0,
    finished: true,
  });
  expect(storageUsage(h.deps).byProject[0]).toMatchObject({ id: "p1", removableBytes: 702 });
});

it("keeps every output and every supplied file, and says what it freed", () => {
  const { h, dir } = fixture();
  expect(keepOutputsOnly(h.deps, "p1")).toEqual({ ok: true, files: 2, bytesFreed: 702 });
  for (const kept of [
    "video.mp4",
    "shorts/short-01.mp4",
    "thumbnail.png",
    "article.md",
    "description.txt",
    "document.pdf",
    "images/001.png",
    "reference.png",
    "stray.bin",
  ])
    expect(existsSync(join(dir, kept)), kept).toBe(true);
  for (const gone of ["audio-body.mp3", "render.json"])
    expect(existsSync(join(dir, gone)), gone).toBe(false);
  // The records stay: the project page shows those files as missing, and a rebuild makes them.
  expect(h.deps.db.prepare("SELECT count(*) AS n FROM project_assets").get()).toEqual({ n: 10 });
  expect(keepOutputsOnly(h.deps, "p1")).toEqual({ ok: true, files: 0, bytesFreed: 0 });
});

it("never touches a project that is running, waiting or unfinished", () => {
  const { h, dir } = fixture();
  expect(keepOutputsOnly({ ...h.deps, hasInflight: () => true }, "p1")).toEqual({
    ok: false,
    reason: "not-finished",
  });
  h.deps.db.exec("UPDATE stages SET state='failed'");
  expect(keepOutputsOnly(h.deps, "p1")).toMatchObject({ ok: false, reason: "not-finished" });
  h.deps.db.exec(
    "INSERT INTO stages (id,project_id,kind,source,state) VALUES ('s-audio','p1','audio','generate','pending')",
  );
  h.deps.db.exec("UPDATE stages SET state='done' WHERE id='s-video'");
  expect(keepOutputsOnly(h.deps, "p1")).toMatchObject({ ok: false, reason: "not-finished" });
  expect(existsSync(join(dir, "images/001.png"))).toBe(true);
  expect(keepOutputsOnly(h.deps, "missing")).toEqual({ ok: false, reason: "no-project" });
});

it("counts the article, video, shorts, thumbnail, description and document as outputs", () => {
  for (const role of [
    "video",
    "short_video",
    "thumbnail",
    "article_md",
    "youtube_description",
    "document_pdf",
    "image",
    "animated_image",
    "short_image",
  ] as const)
    expect(outputRoles).toContain(role);
});

// A template studio sample keeps its working files: a later bake-off or resample reuses them,
// and stripping them would make the studio pay for them again.
it("leaves a template studio sample's files alone in Clean up everything and Delete all old versions", () => {
  const { h, dir } = fixture();
  const { db } = h.deps;
  db.exec(
    "INSERT INTO project_templates (id,head_version,creation_hash,created_at) VALUES ('t1',1,'h','t')",
  );
  db.exec(
    "INSERT INTO template_samples (template_id,project_id,topic,topic_source,full_script,created_at) VALUES ('t1','p1','Topic','fixed',0,'t')",
  );
  mkdirSync(join(dir, "History"), { recursive: true });
  writeFileSync(join(dir, "History", "old.png"), Buffer.alloc(5));
  expect(cleanUpAll(h.deps)).toEqual({ files: 0, bytesFreed: 0, skipped: 0 });
  expect(deleteAllOldVersions(h.deps)).toMatchObject({ projects: 0, files: 0, busy: 0 });
  for (const kept of ["audio-body.mp3", "render.json"])
    expect(existsSync(join(dir, kept)), kept).toBe(true);
});

it("leaves a bundled sample's files alone and counts nothing on it as removable", () => {
  const { h, dir } = fixture();
  writeSampleRecord(h.deps.db, { projectId: "p1", seededAt: "t" });
  mkdirSync(join(dir, "History"), { recursive: true });
  writeFileSync(join(dir, "History", "old.png"), Buffer.alloc(5));
  // Disk space's totals read these, so a sample adds nothing to Clean up everything's size.
  expect(projectStorage(h.deps, "p1")).toMatchObject({
    removableFiles: 0,
    removableBytes: 0,
    historyFiles: 0,
    historyBytes: 0,
  });
  expect(cleanUpAll(h.deps)).toEqual({ files: 0, bytesFreed: 0, skipped: 0 });
  expect(deleteAllOldVersions(h.deps)).toMatchObject({ projects: 0, files: 0, busy: 0 });
  for (const kept of ["audio-body.mp3", "render.json", "History/old.png"])
    expect(existsSync(join(dir, kept)), kept).toBe(true);
});
