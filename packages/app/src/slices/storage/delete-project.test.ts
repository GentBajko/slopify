import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { Log } from "../../kernel/log.js";
import type { Paths } from "../../kernel/paths.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import { retainedOutput, retainedPiece } from "../revisions/downloads.fake.js";
import { mutationFixture } from "../revisions/mutation.fake.js";
import { saveRevision } from "../revisions/mutations.js";
import { insertRevision } from "../revisions/repo.js";
import type { DeleteDeps } from "./delete-project.js";
import { deleteProject } from "./delete-project.js";
import { projectDir } from "./layout.js";

vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs")>();
  return { ...fs, rmSync: vi.fn(fs.rmSync) };
});

const clock = fixedClock("2026-09-02T10:00:00.000Z");
const warnings: string[] = [];
const log: Log = {
  write: (level, event): void => {
    warnings.push(`${level}:${event}`);
  },
};

afterEach(() => {
  warnings.length = 0;
});

interface Harness extends DeleteDeps {
  readonly db: DatabaseSync;
  readonly paths: Paths;
}

function harness(): Harness {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-delete-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(":memory:");
  migrate(db, clock);
  return { db, paths, log };
}

function project(deps: Harness, id: string, states: readonly string[]): string {
  deps.db
    .prepare("INSERT INTO projects VALUES (?, 'Rope Tricks', '16:9', '{}', ?, ?)")
    .run(id, "2026-09-01", "2026-09-01");
  for (const [index, state] of states.entries()) {
    deps.db
      .prepare("INSERT INTO stages (id, project_id, kind, source, state) VALUES (?, ?, ?, ?, ?)")
      .run(`${id}-s${String(index)}`, id, kinds[index] ?? "video", "generate", state);
  }
  const dir = projectDir(deps.paths, id);
  mkdirSync(join(dir, "images"), { recursive: true });
  writeFileSync(join(dir, "article.md"), "# Rope");
  writeFileSync(join(dir, "images", "001.png"), "png");
  deps.db
    .prepare(
      "INSERT INTO outputs VALUES (?, ?, 'article', 'article_md', 'article.md', NULL, 6, NULL, NULL, ?)",
    )
    .run(`${id}-o1`, id, "2026-09-01");
  return dir;
}

const kinds = ["research", "article", "audio", "images", "thumbnail", "video"] as const;

describe("deleting a project", () => {
  it("removes its rows and its folder", () => {
    const deps = harness();
    const dir = project(deps, "p1", ["done", "done", "done", "done", "done", "done"]);

    expect(deleteProject(deps, "p1")).toEqual({ ok: true });

    expect(existsSync(dir)).toBe(false);
    expect(deps.db.prepare("SELECT count(*) AS n FROM projects").get()).toEqual({ n: 0 });
    // ON DELETE CASCADE, with foreign keys on: nothing of the project is left behind.
    expect(deps.db.prepare("SELECT count(*) AS n FROM stages").get()).toEqual({ n: 0 });
    expect(deps.db.prepare("SELECT count(*) AS n FROM outputs").get()).toEqual({ n: 0 });
  });

  it("leaves every other project alone", () => {
    const deps = harness();
    project(deps, "p1", ["done"]);
    const kept = project(deps, "p2", ["done"]);

    expect(deleteProject(deps, "p1")).toEqual({ ok: true });

    expect(existsSync(kept)).toBe(true);
    expect(deps.db.prepare("SELECT count(*) AS n FROM projects").get()).toEqual({ n: 1 });
  });

  it("refuses while the run is still going", () => {
    const deps = harness();
    const dir = project(deps, "p1", ["done", "running"]);

    expect(deleteProject(deps, "p1")).toEqual({ ok: false, reason: "running" });

    expect(existsSync(dir)).toBe(true);
    expect(deps.db.prepare("SELECT count(*) AS n FROM projects").get()).toEqual({ n: 1 });
  });

  it("deletes a failed or canceled run, which is not running", () => {
    const deps = harness();
    project(deps, "p1", ["failed"]);
    project(deps, "p2", ["canceled"]);

    expect(deleteProject(deps, "p1")).toEqual({ ok: true });
    expect(deleteProject(deps, "p2")).toEqual({ ok: true });
  });

  it("says so when no project has that id", () => {
    const deps = harness();

    expect(deleteProject(deps, "nope")).toEqual({ ok: false, reason: "no-project" });
  });

  it("succeeds when the project never wrote a folder", () => {
    const deps = harness();
    deps.db
      .prepare(
        "INSERT INTO projects VALUES ('p1', 'Rope', '16:9', '{}', '2026-09-01', '2026-09-01')",
      )
      .run();

    expect(deleteProject(deps, "p1")).toEqual({ ok: true });
    expect(deps.db.prepare("SELECT count(*) AS n FROM projects").get()).toEqual({ n: 0 });
  });

  it("leaves the project listed when the folder will not go, and logs why", () => {
    const deps = harness();
    const dir = project(deps, "p1", ["done"]);
    vi.mocked(rmSync).mockImplementationOnce(() => {
      throw new Error("EPERM: file is locked");
    });
    const result = deleteProject(deps, "p1");
    expect(result).toMatchObject({ ok: false, reason: "files", detail: "EPERM: file is locked" });
    expect(existsSync(dir)).toBe(true);
    expect(deps.db.prepare("SELECT count(*) AS n FROM projects").get()).toEqual({ n: 1 });
    expect(warnings).toEqual(["warn:project.delete"]);
  });
});

it("refuses deletion while original revision work drains after head stages stop", () => {
  const deps = harness();
  const dir = project(deps, "p1", ["done", "failed"]);
  expect(deleteProject({ ...deps, hasInflight: (id) => id === "p1" }, "p1")).toEqual({
    ok: false,
    reason: "running",
  });
  expect(existsSync(dir)).toBe(true);
  expect(deleteProject({ ...deps, hasInflight: () => false }, "p1")).toEqual({ ok: true });
});

it("preserves all history after folder failure and removes only the chosen project's history on retry", async () => {
  const h = await mutationFixture();
  try {
    const old = retainedOutput(h.deps, h.base.revision, "audio_export", "old.wav", "old audio");
    retainedPiece(h.deps, h.base.revision, "late audio");
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: h.base.revision.id,
      idempotencyKey: "rename",
      edit: { config: { ...h.config, title: "New" }, content: h.base.revision.content },
    });
    expect(saved.ok).toBe(true);
    h.deps.db.exec("INSERT INTO projects VALUES ('other','Other','16:9','{}','old','old')");
    const other = { ...h.base.revision, id: "other-revision", projectId: "other" };
    insertRevision(h.deps.db, other);
    retainedOutput(h.deps, other, "video", "other.mp4", "other bytes");
    const before = h.deps.db.prepare("SELECT * FROM revision_outputs WHERE project_id='p1'").all();
    vi.mocked(rmSync).mockImplementationOnce(() => {
      throw new Error("EPERM: file is locked");
    });
    expect(deleteProject({ ...h.deps, log }, h.projectId)).toMatchObject({
      ok: false,
      reason: "files",
    });
    expect(h.deps.db.prepare("SELECT * FROM revision_outputs WHERE project_id='p1'").all()).toEqual(
      before,
    );
    expect(
      h.deps.db.prepare("SELECT id FROM project_assets WHERE id=?").get(old.row.assetId),
    ).toBeDefined();
    expect(
      h.deps.db.prepare("SELECT count(*) AS n FROM project_revisions WHERE project_id='p1'").get(),
    ).toEqual({ n: 2 });
    expect(deleteProject(h.deps, h.projectId)).toEqual({ ok: true });
    expect(existsSync(projectDir(h.deps.paths, h.projectId))).toBe(false);
    expect(existsSync(projectDir(h.deps.paths, "other"))).toBe(true);
    for (const table of [
      "project_revisions",
      "project_assets",
      "revision_outputs",
      "revision_pieces",
      "revision_work",
    ]) {
      expect(
        h.deps.db.prepare(`SELECT count(*) AS n FROM ${table} WHERE project_id='p1'`).get(),
      ).toEqual({ n: 0 });
    }
    expect(
      h.deps.db.prepare("SELECT count(*) AS n FROM project_assets WHERE project_id='other'").get(),
    ).toEqual({ n: 1 });
    expect(h.deps.db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally {
    h.close();
  }
});
