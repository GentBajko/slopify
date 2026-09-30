import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { ensureDirs, layout, type Paths, repoint } from "../../kernel/paths.js";
import { readSetting, writeSetting } from "../settings/repo.js";
import type { BusyProject } from "./backup-export.js";
import {
  createFilesService,
  type FilesDeps,
  filesLayoutOf,
  filesLocationKey,
  filesMoveKey,
  readFilesLocation,
  settleFilesLocation,
} from "./files-location.js";

// Every test runs in its own temporary HOME: never the real ~/Documents or ~/Slopify.
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function home(): { home: string; data: string; documents: string; db: DatabaseSync } {
  const root = mkdtempSync(join(tmpdir(), "slopify-files-"));
  roots.push(root);
  const db = openDb(":memory:");
  migrate(db, fixedClock("2026-09-27T10:00:00.000Z"));
  return { home: root, data: join(root, ".slopify"), documents: join(root, "Documents"), db };
}

describe("settleFilesLocation", () => {
  it("gives a new install <Documents>/Slopify and remembers it", async () => {
    const h = home();
    const location = await settleFilesLocation({
      db: h.db,
      dataDir: h.data,
      fresh: true,
      documents: async () => h.documents,
    });
    expect(location).toEqual({ kind: "root", root: join(h.documents, "Slopify") });
    expect(filesLayoutOf(location, h.data)).toEqual({
      projects: join(h.documents, "Slopify", "Projects"),
      backups: join(h.documents, "Slopify", "Backups"),
      exports: join(h.documents, "Slopify", "Exports"),
    });
    // The next start is no longer fresh and keeps what was decided.
    expect(
      await settleFilesLocation({ db: h.db, dataDir: h.data, fresh: false, documents: undefined }),
    ).toEqual(location);
  });

  it("keeps an existing install's files in the data dir, even when Documents is known", async () => {
    const h = home();
    const location = await settleFilesLocation({
      db: h.db,
      dataDir: h.data,
      fresh: false,
      documents: async () => h.documents,
    });
    expect(location).toEqual({ kind: "data-dir" });
    expect(JSON.parse(readSetting(h.db, filesLocationKey) ?? "")).toEqual({ kind: "data-dir" });
    expect(filesLayoutOf(location, h.data)).toEqual({
      projects: join(h.data, "projects"),
      backups: join(h.data, "projects", "Backups"),
      exports: null,
    });
  });

  it("never shares a Projects folder another install already fills", async () => {
    const h = home();
    mkdirSync(join(h.documents, "Slopify", "Projects", "01OTHERINSTALL"), { recursive: true });
    const location = await settleFilesLocation({
      db: h.db,
      dataDir: h.data,
      fresh: true,
      documents: async () => h.documents,
    });
    expect(location).toEqual({ kind: "root", root: join(h.documents, "Slopify 2") });
  });

  it("keeps a new install's files in the data dir when there is no Documents to ask", async () => {
    const h = home();
    expect(await settleFilesLocation({ db: h.db, dataDir: h.data, fresh: true })).toEqual({
      kind: "data-dir",
    });
  });

  it("says how to recover from a damaged setting", () => {
    const h = home();
    writeSetting(h.db, filesLocationKey, "{nope");
    expect(() => readFilesLocation(h.db)).toThrow(/files folder setting is damaged/);
  });
});

function legacy(h: ReturnType<typeof home>): Paths {
  const paths = layout(h.data);
  ensureDirs(paths, { mode: 0o700 });
  writeSetting(h.db, filesLocationKey, JSON.stringify({ kind: "data-dir" }));
  mkdirSync(join(paths.projects, "p1", "images"), { recursive: true });
  writeFileSync(join(paths.projects, "p1", "video.mp4"), "video bytes");
  writeFileSync(join(paths.projects, "p1", "images", "001.png"), "png");
  mkdirSync(paths.backups, { recursive: true });
  writeFileSync(join(paths.backups, "slopify-backup-2026-09-01T030000Z.tar"), "archive");
  return paths;
}

function service(
  h: ReturnType<typeof home>,
  paths: Paths,
  over: Partial<FilesDeps> = {},
): ReturnType<typeof createFilesService> {
  return createFilesService({
    db: h.db,
    paths,
    documents: async () => h.documents,
    busy: () => [],
    freeBytes: async () => 1e12,
    ...over,
  });
}

describe("moving the files", () => {
  it("copies, checks and switches to Documents/Slopify, keeping the old folder", async () => {
    const h = home();
    const paths = legacy(h);
    const old = paths.projects;
    // The clip cache is disposable: a render makes its clips again rather than it being moved.
    mkdirSync(join(old, ".render-cache", "p1"), { recursive: true });
    writeFileSync(join(old, ".render-cache", "p1", "clip.mp4"), "clip");
    const files = service(h, paths);
    const before = await files.view();
    expect(before).toMatchObject({
      folder: old,
      inDataDir: true,
      inDocuments: false,
      documentsRoot: join(h.documents, "Slopify"),
    });
    expect(await files.move("documents")).toEqual({ ok: true });
    await files.idle();
    const root = join(h.documents, "Slopify");
    const after = await files.view();
    expect(after).toMatchObject({ folder: root, inDataDir: false, inDocuments: true });
    expect(after.move).toMatchObject({ phase: "done", oldFolder: old, totalFiles: 3, error: null });
    expect(paths.projects).toBe(join(root, "Projects"));
    expect(paths.backups).toBe(join(root, "Backups"));
    expect(readFileSync(join(root, "Projects", "p1", "video.mp4"), "utf8")).toBe("video bytes");
    expect(readFileSync(join(root, "Projects", "p1", "images", "001.png"), "utf8")).toBe("png");
    // Backups move beside Projects, not into it.
    expect(existsSync(join(root, "Backups", "slopify-backup-2026-09-01T030000Z.tar"))).toBe(true);
    expect(existsSync(join(root, "Projects", "Backups"))).toBe(false);
    expect(existsSync(join(root, "Projects", ".render-cache"))).toBe(false);
    // The old copy is untouched until the user deletes it.
    expect(readFileSync(join(old, "p1", "video.mp4"), "utf8")).toBe("video bytes");
    expect(readFilesLocation(h.db)).toEqual({ kind: "root", root });
    expect(readSetting(h.db, filesMoveKey)).toBeUndefined();
  });

  it("refuses while a project is being made, and changes nothing", async () => {
    const h = home();
    const paths = legacy(h);
    const busy: BusyProject[] = [{ id: "p1", title: "Deep sea" }];
    const files = service(h, paths, { busy: () => busy });
    const refused = await files.move("documents");
    expect(refused).toMatchObject({ ok: false, status: 409 });
    expect(refused.ok ? "" : refused.detail).toContain('"Deep sea"');
    expect(existsSync(join(h.documents, "Slopify"))).toBe(false);
    expect(readSetting(h.db, filesMoveKey)).toBeUndefined();
  });

  it("keeps the old folder when a project starts during the copy, then resumes", async () => {
    const h = home();
    const paths = legacy(h);
    const old = paths.projects;
    let calls = 0;
    const files = service(h, paths, {
      busy: () => (calls++ === 0 ? [] : [{ id: "p1", title: "Deep sea" }]),
    });
    expect(await files.move("documents")).toEqual({ ok: true });
    await files.idle();
    const failed = await files.view();
    expect(failed.move).toMatchObject({ phase: "failed" });
    expect(failed.move?.error).toContain("kept using the old folder");
    expect(paths.projects).toBe(old);
    expect(readFilesLocation(h.db)).toEqual({ kind: "data-dir" });
    // The half-done target isn't empty any more; the recorded move lets it continue there.
    const resumed = service(h, paths);
    expect((await resumed.view()).move).toMatchObject({
      phase: "interrupted",
      target: join(h.documents, "Slopify"),
    });
    expect(await resumed.move("documents")).toEqual({ ok: true });
    await resumed.idle();
    expect((await resumed.view()).move).toMatchObject({ phase: "done" });
    expect(paths.projects).toBe(join(h.documents, "Slopify", "Projects"));
  });

  it("recopies a file whose copy doesn't match the original", async () => {
    const h = home();
    const paths = legacy(h);
    const target = join(h.home, "Elsewhere");
    writeSetting(h.db, filesMoveKey, JSON.stringify({ target, from: { kind: "data-dir" } }));
    // Same size and time as the original but other bytes: only the hash check can tell.
    mkdirSync(join(target, "Projects", "p1"), { recursive: true });
    writeFileSync(join(target, "Projects", "p1", "video.mp4"), "VIDEO BYTES");
    const { utimesSync, statSync } = await import("node:fs");
    const original = statSync(join(paths.projects, "p1", "video.mp4"));
    utimesSync(join(target, "Projects", "p1", "video.mp4"), original.atime, original.mtime);
    const files = service(h, paths);
    expect(await files.move(target)).toEqual({ ok: true });
    await files.idle();
    expect((await files.view()).move).toMatchObject({ phase: "done" });
    expect(readFileSync(join(target, "Projects", "p1", "video.mp4"), "utf8")).toBe("video bytes");
  });

  it("moves again from one root to another, Exports included", async () => {
    const h = home();
    const first = join(h.documents, "Slopify");
    const paths = layout(h.data);
    writeSetting(h.db, filesLocationKey, JSON.stringify({ kind: "root", root: first }));
    repoint(paths, filesLayoutOf({ kind: "root", root: first }, h.data));
    mkdirSync(join(first, "Projects", "p1"), { recursive: true });
    writeFileSync(join(first, "Projects", "p1", "video.mp4"), "v");
    mkdirSync(join(first, "Exports"), { recursive: true });
    writeFileSync(join(first, "Exports", "saved.mp4"), "e");
    const files = service(h, paths);
    const next = join(h.home, "Videos", "Slopify");
    expect(await files.move(next)).toEqual({ ok: true });
    await files.idle();
    expect((await files.view()).move).toMatchObject({ phase: "done", oldFolder: first });
    expect(readFileSync(join(next, "Exports", "saved.mp4"), "utf8")).toBe("e");
    expect(paths.exports).toBe(join(next, "Exports"));
  });
});

describe("choosing another folder", () => {
  it("explains each folder it can't use", async () => {
    const h = home();
    const paths = legacy(h);
    const files = service(h, paths, { home: h.home, platform: "linux" });
    const detail = async (target: string) => {
      const result = await files.move(target);
      return result.ok ? "" : result.detail;
    };
    expect(await detail("Videos/Slopify")).toContain("full path");
    expect(await detail(join(h.data, "files"))).toContain("inside Slopify's data folder");
    expect(await detail("/usr/share/slopify")).toContain("system or shared folder");
    expect(await detail(h.home)).toContain("system or shared folder");
    mkdirSync(join(h.home, "Full", "Projects", "someone"), { recursive: true });
    expect(await detail(join(h.home, "Full"))).toContain("already has files");
    const tight = service(h, paths, { freeBytes: async () => 10 });
    const refused = await tight.move(join(h.home, "Small"));
    expect(refused.ok ? "" : refused.detail).toContain("isn't enough free space");
    expect(readSetting(h.db, filesMoveKey)).toBeUndefined();
  });

  it("refuses the folder the files are already in", async () => {
    const h = home();
    const root = join(h.documents, "Slopify");
    const paths = layout(h.data, filesLayoutOf({ kind: "root", root }, h.data));
    writeSetting(h.db, filesLocationKey, JSON.stringify({ kind: "root", root }));
    const result = await service(h, paths).move("documents");
    expect(result.ok ? "" : result.detail).toContain("already in");
  });
});

describe("in Docker", () => {
  it("shows the host folders and hands the move to the installer", async () => {
    const h = home();
    const paths = layout(h.data);
    const files = service(h, paths, {
      docker: { hostProjects: "/home/you/Slopify/Projects", hostBackups: null },
    });
    expect(await files.view()).toMatchObject({
      docker: true,
      folder: "/home/you/Slopify/Projects",
      dockerCommand: "npx @gentbajko/slopify@latest update --docker --projects-dir documents",
    });
    const refused = await files.move("documents");
    expect(refused).toMatchObject({ ok: false, status: 409 });
    expect(refused.ok ? "" : refused.detail).toContain("--projects-dir documents");
  });
});
