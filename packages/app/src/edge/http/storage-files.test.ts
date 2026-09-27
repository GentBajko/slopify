import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import { busyProjects } from "../../slices/storage/backup-export.js";
import { createFilesService } from "../../slices/storage/files-location.js";
import type { AppDeps } from "./app.js";
import { filesRoutes } from "./storage-files.js";

it("shows the folder, refuses a move while a stage runs, and opens the folder", async () => {
  const home = mkdtempSync(join(tmpdir(), "slopify-files-http-"));
  const db = openDb(":memory:");
  try {
    migrate(db, fixedClock("2026-09-27T10:00:00.000Z"));
    const paths = layout(join(home, ".slopify"));
    ensureDirs(paths, { mode: 0o700 });
    const opened: string[] = [];
    const files = createFilesService({
      db,
      paths,
      documents: async () => join(home, "Documents"),
      busy: () => busyProjects({ db }),
      openFolder: async (path) => {
        opened.push(path);
      },
    });
    const app = new Hono().route(
      "/api/storage/files",
      filesRoutes({ files, log: { write: () => {} } } as unknown as AppDeps),
    );
    const view = await app.request("/api/storage/files");
    expect(await view.json()).toMatchObject({
      docker: false,
      folder: paths.projects,
      inDataDir: true,
      documentsRoot: join(home, "Documents", "Slopify"),
      move: null,
    });

    db.prepare("INSERT INTO projects VALUES ('p1','Deep sea','16:9','{}','t','t')").run();
    db.prepare(
      "INSERT INTO stages (id,project_id,kind,source,state) VALUES ('s1','p1','video','generate','running')",
    ).run();
    const refused = await app.request("/api/storage/files/move", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: "documents" }),
    });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ detail: expect.stringContaining('"Deep sea"') });

    const open = await app.request("/api/storage/files/open", { method: "POST" });
    expect(await open.json()).toEqual({ opened: true, path: paths.projects });
    expect(opened).toEqual([paths.projects]);
  } finally {
    db.close();
    rmSync(home, { recursive: true, force: true });
  }
});
