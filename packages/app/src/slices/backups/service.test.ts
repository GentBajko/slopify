import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Clock } from "../../kernel/clock.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import { insertProject } from "../admission/repo.js";
import { defaultBackupsDir } from "../storage/layout.js";
import { reconcileStorage } from "../storage/reconcile.js";
import { startupDelayMs } from "./schedule.js";
import { createBackupService } from "./service.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function install(start: string) {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-backups-")));
  ensureDirs(paths, { mode: 0o700 });
  let now = new Date(start);
  const clock: Clock = { now: () => now, sleep: () => Promise.resolve() };
  const db = openDb(paths.db);
  migrate(db, clock);
  cleanups.push(() => {
    db.close();
    rmSync(paths.dataDir, { recursive: true, force: true });
  });
  let next = 0;
  const service = createBackupService({
    db,
    paths,
    clock,
    ids: { next: () => `id${String(++next).padStart(4, "0")}` },
    appVersion: "2.5.0",
    log: { write: () => {} },
    location: { container: false, hostProjects: null },
    bootedAt: new Date(start),
    serverTimeZone: "UTC",
  });
  return {
    db,
    paths,
    service,
    at: (iso: string) => {
      now = new Date(iso);
    },
  };
}

function project(h: ReturnType<typeof install>, id: string): void {
  const at = "2026-09-20T00:00:00.000Z";
  insertProject(h.db, {
    id,
    title: "Rope knots",
    format: "16:9",
    config: {
      title: "Rope knots",
      format: "16:9",
      sources: {
        research: "off",
        article: "provide",
        audio: "off",
        images: "off",
        thumbnail: "off",
        video: "off",
      },
      imagePrompts: [],
      values: {},
      provided: { article: "Saved." },
      silenceGapSeconds: 0,
      imageSeconds: 15,
      zoomPercent: 22.5,
      motionStyle: "zoom",
      edgeSilenceSeconds: 0,
      rendered: {},
    },
    createdAt: at,
    updatedAt: at,
  });
  h.db
    .prepare(
      "INSERT INTO stages(id,project_id,kind,source,state) VALUES (?,?,'article','provide','provided')",
    )
    .run(`${id}-article`, id);
  mkdirSync(join(h.paths.projects, id), { recursive: true });
  writeFileSync(join(h.paths.projects, id, "article.md"), "# Rope knots\n");
}

const settings = { enabled: true, time: "03:00", timeZone: "UTC", keep: 2, folder: null };

describe("scheduled backups", () => {
  it("writes the Export everything archive into the default folder, keeps N, and records it", async () => {
    const h = install("2026-09-25T12:00:00.000Z");
    project(h, "01J00000000000000000000001");
    expect(h.service.save(settings)).toEqual({ ok: true });

    for (const day of ["26", "27", "28"]) {
      h.at(`2026-09-${day}T03:00:30.000Z`);
      await h.service.tick();
    }

    const folder = defaultBackupsDir(h.paths);
    expect(readdirSync(folder).toSorted()).toEqual([
      "slopify-backup-2026-09-27T030030Z.tar",
      "slopify-backup-2026-09-28T030030Z.tar",
    ]);
    const view = await h.service.view();
    expect(view.status).toMatchObject({
      lastResult: "succeeded",
      lastTrigger: "scheduled",
      lastSuccessFile: join(folder, "slopify-backup-2026-09-28T030030Z.tar"),
      detail: null,
    });
    expect(view.files).toHaveLength(2);
    expect(view.nextRunAt).toBe("2026-09-29T03:00:00.000Z");

    // Storage cleanup leaves the backups alone.
    reconcileStorage(h.db, h.paths);
    expect(readdirSync(folder)).toHaveLength(2);
  });

  it("waits while a project is being made, and says which", async () => {
    const h = install("2026-09-25T12:00:00.000Z");
    project(h, "01J00000000000000000000001");
    h.service.save(settings);
    h.db.prepare("UPDATE stages SET state='running'").run();
    h.at("2026-09-26T03:00:30.000Z");
    await h.service.tick();
    const view = await h.service.view();
    expect(view.status.lastResult).toBe("waiting");
    expect(view.status.detail).toContain('"Rope knots"');
    expect(view.files).toEqual([]);
    expect(view.overdue).toBe(true);
    expect(h.service.runNow()).toMatchObject({ ok: false, status: 409 });
  });

  it("catches up after a start when the slot passed while it was off", async () => {
    const h = install("2026-09-26T09:00:00.000Z");
    h.db
      .prepare("INSERT INTO settings(key,value) VALUES('backups.config',?)")
      .run(JSON.stringify({ ...settings, enabledAt: "2026-09-01T00:00:00.000Z" }));
    await h.service.tick();
    expect(readdirSync(h.paths.projects)).toEqual([]);
    h.at(new Date(Date.parse("2026-09-26T09:00:00.000Z") + startupDelayMs).toISOString());
    await h.service.tick();
    expect((await h.service.view()).status).toMatchObject({
      lastResult: "succeeded",
      lastTrigger: "catch-up",
    });
  });

  it("refuses a folder inside the projects folder and says why", () => {
    const h = install("2026-09-25T12:00:00.000Z");
    const saved = h.service.save({ ...settings, folder: join(h.paths.projects, "elsewhere") });
    expect(saved.ok).toBe(false);
    expect(saved.ok ? "" : saved.detail).toContain("projects folder");
  });

  it("records a plain failure when the folder cannot be created", async () => {
    const h = install("2026-09-25T12:00:00.000Z");
    const blocker = join(h.paths.dataDir, "a-file");
    writeFileSync(blocker, "x");
    h.service.save({ ...settings, folder: join(blocker, "Backups") });
    expect(h.service.runNow()).toEqual({ ok: true });
    while ((await h.service.view()).running)
      await new Promise<void>((resolve) => setImmediate(resolve));
    const status = (await h.service.view()).status;
    expect(status.lastResult).toBe("failed");
    expect(status.detail).toContain("is a file, not a folder");
    expect(status.detail).toContain("Settings → Backups");
  });
});
