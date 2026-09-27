import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { bundledPatchNotesDir, listPatchNotes } from "../../slices/patch-notes/library.js";
import type { PatchNotesView } from "../../slices/patch-notes/seen.js";
import { draftFixture } from "../../slices/play-drafts/draft.fake.js";
import { insertMachine } from "../../slices/telemetry/repo.js";
import { patchNotesRoutes } from "./patch-notes.js";
import { whatsNewRoutes } from "./whats-new.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function notesDir(files: Readonly<Record<string, string>>): string {
  const dir = mkdtempSync(join(tmpdir(), "slopify-patch-notes-"));
  dirs.push(dir);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

const index = JSON.stringify([
  { id: "1.0-to-2.0", title: "Slopify 1.0 to 2.0", range: "1.0.1 to 2.0.0", date: "2026-09-25" },
  { id: "3.0.0", title: "Slopify 3.0.0", version: "3.0.0", date: "2026-09-27" },
  { id: "2.0-to-3.0", title: "Slopify 2.0 to 3.0", range: "2.0.1 to 3.0.0", date: "2026-09-27" },
]);

function withApp(
  files: Readonly<Record<string, string>>,
  run: (app: Hono, h: ReturnType<typeof draftFixture>) => Promise<void>,
): Promise<void> {
  const h = draftFixture();
  const deps = { db: h.deps.db, version: "3.0.0", patchNotesDir: notesDir(files) };
  const app = new Hono()
    .route("/api/patch-notes", patchNotesRoutes(deps))
    .route("/api/whats-new", whatsNewRoutes(deps));
  return run(app, h).finally(() => h.close());
}

async function view(app: Hono): Promise<PatchNotesView> {
  return (await (await app.request("/api/patch-notes")).json()) as PatchNotesView;
}

async function detail(response: Response): Promise<string> {
  return ((await response.json()) as { detail: string }).detail;
}

function updatedFrom(h: ReturnType<typeof draftFixture>, appVersion: string): void {
  insertMachine(h.deps.db, {
    machineId: "11111111-1111-4111-8111-111111111111",
    noticeSeenAt: "2026-01-01T00:00:00.000Z",
    appVersion,
  });
}

describe("GET /api/patch-notes", () => {
  it("lists the notes newest first, with the running version's note as current", async () => {
    await withApp({ "index.json": index }, async (app) => {
      const body = await view(app);
      expect(body.version).toBe("3.0.0");
      expect(body.current).toBe("3.0.0");
      expect(body.due).toBeNull();
      expect(body.notes.map((note) => note.id)).toEqual(["3.0.0", "2.0-to-3.0", "1.0-to-2.0"]);
    });
  });

  it("says a note is due once after an update, until it is closed", async () => {
    await withApp({ "index.json": index }, async (app, h) => {
      updatedFrom(h, "2.5.0");
      expect((await view(app)).due).toBe("3.0.0");
      const seen = await app.request("/api/patch-notes/seen", { method: "POST" });
      expect(seen.status).toBe(200);
      expect((await view(app)).due).toBeNull();
    });
  });

  it("is not due once the What's new tour that stands in for it was closed", async () => {
    await withApp({ "index.json": index }, async (app, h) => {
      updatedFrom(h, "2.5.0");
      await app.request("/api/whats-new/seen", { method: "POST" });
      expect((await view(app)).due).toBeNull();
    });
  });

  it("explains a build without its notes", async () => {
    await withApp({}, async (app) => {
      const response = await app.request("/api/patch-notes");
      expect(response.status).toBe(500);
      expect(await detail(response)).toContain("docs/patch-notes/index.json is missing");
    });
  });
});

describe("GET /api/patch-notes/:id", () => {
  it("answers a listed note's Markdown", async () => {
    await withApp({ "index.json": index, "3.0.0.md": "# Slopify 3.0.0\n" }, async (app) => {
      const response = await app.request("/api/patch-notes/3.0.0");
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/markdown");
      expect(await response.text()).toBe("# Slopify 3.0.0\n");
    });
  });

  it.each(["4.0.0", "..%2Findex", "index"])("refuses %s, which is not listed", async (id) => {
    await withApp({ "index.json": index, "index.md": "no" }, async (app) => {
      const response = await app.request(`/api/patch-notes/${id}`);
      expect(response.status).toBe(404);
      expect(await detail(response)).toContain("Settings → Patch notes");
    });
  });
});

describe("the bundled patch notes", () => {
  it("list a file for every entry, newest first", async () => {
    const dir = bundledPatchNotesDir();
    const notes = await listPatchNotes(dir);
    expect(notes.length).toBeGreaterThan(0);
    const h = draftFixture();
    try {
      const app = new Hono().route(
        "/api/patch-notes",
        patchNotesRoutes({ db: h.deps.db, version: "3.0.0", patchNotesDir: dir }),
      );
      for (const note of notes) {
        const response = await app.request(`/api/patch-notes/${note.id}`);
        expect(response.status, note.id).toBe(200);
        expect((await response.text()).startsWith("# "), note.id).toBe(true);
      }
    } finally {
      h.close();
    }
  });
});
