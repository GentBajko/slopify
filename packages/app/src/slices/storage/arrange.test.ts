import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join, relative, sep } from "node:path";
import { expect, it } from "vitest";
import { attachPlaces } from "../../kernel/paths.js";
import { admitPendingRevision } from "../rebuild/legacy-admission.fake.js";
import { narrationCatalogue, narrationFixture } from "../rebuild/runtime-narration.fake.js";
import { saveRevision } from "../revisions/mutations.js";
import { arrangeChanged, arrangeProject, folderName, projectMarker } from "./arrange.js";
import { planBackup } from "./backup-export.js";
import { outputPath, projectDir } from "./layout.js";
import { createPlaces, recoverPlaces } from "./places.js";
import { reconcileStorage } from "./reconcile.js";
import { cleanUpAll, deleteOldVersions, keepOutputsOnly, projectStorage } from "./trim.js";

function filesUnder(root: string): string[] {
  return readdirSync(root, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join("/"))
    .toSorted();
}

// The fixture runs every stage but the video; its video work stays waiting. A finished project
// has nothing waiting to run.
function settle(h: { deps: { db: import("node:sqlite").DatabaseSync } }): void {
  h.deps.db.exec("UPDATE revision_work SET dispatch_state='held' WHERE state='pending'");
}

async function arranged() {
  const h = await narrationFixture("First paragraph.\n\nSecond paragraph.");
  await h.pump();
  settle(h);
  const places = createPlaces(h.deps.db);
  attachPlaces(h.deps.paths, places);
  const deps = { db: h.deps.db, paths: h.deps.paths, places, now: () => new Date() };
  return { h, places, deps };
}

it("names a finished project's folder after its title and puts every file in its place", async () => {
  const { h, deps } = await arranged();
  try {
    const before = h.view();
    const stored = before.outputs
      .filter((row) => row.selected)
      .map((row) => row.output.path)
      .concat(
        before.pieces
          .filter((row) => row.selected && row.piece.kind === "chunk")
          .map((row) => JSON.parse(row.piece.payload ?? "{}").file ?? ""),
      )
      .filter((path) => path !== "");
    const content = new Map(
      stored.map((path) => [path, readFileSync(outputPath(h.deps.paths, h.projectId, path))]),
    );

    const result = arrangeProject(deps, h.projectId);
    expect(result.skipped).toBeUndefined();
    expect(result.moved).toBeGreaterThan(0);
    const root = projectDir(h.deps.paths, h.projectId);
    expect(root).toBe(
      join(
        h.deps.paths.projects,
        folderName("Saved", () => false),
      ),
    );
    expect(existsSync(join(h.deps.paths.projects, h.projectId))).toBe(false);
    const files = filesUnder(root);
    // Everything Slopify made is under Upload, Working or History now; nothing under assets/.
    expect(
      files.filter((file) => file !== projectMarker && !/^(Upload|Working|History)\//u.test(file)),
    ).toEqual([]);
    expect(files.some((file) => file.startsWith("Working/Narration/"))).toBe(true);
    // Every stored path still reads the same bytes through the stored path.
    for (const [path, bytes] of content)
      expect(readFileSync(outputPath(h.deps.paths, h.projectId, path))).toEqual(bytes);
    expect(
      h
        .view()
        .outputs.filter((row) => row.selected)
        .every((row) => row.available),
    ).toBe(true);

    // Startup cleanup keeps all of it, and a second pass moves nothing.
    expect(reconcileStorage(h.deps.db, h.deps.paths).orphanFiles).toBe(0);
    expect(filesUnder(root)).toEqual(files);
    expect(arrangeProject(deps, h.projectId).moved).toBe(0);
  } finally {
    h.close();
  }
}, 30000);

it("moves the replaced version to History and gives the new one the current names", async () => {
  const { h, deps } = await arranged();
  try {
    arrangeProject(deps, h.projectId);
    const root = projectDir(h.deps.paths, h.projectId);
    const first = filesUnder(root).filter((file) => file.startsWith("Working/Narration/"));
    const base = h.view();
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: base.revision.id,
      idempotencyKey: "voice",
      edit: {
        config: {
          ...base.revision.config,
          audio: { provider: "openai-tts", model: "tts", voice: "other" },
        },
        content: base.revision.content,
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    admitPendingRevision(h.deps, saved.view, narrationCatalogue);
    await h.pump();
    settle(h);
    arrangeProject(deps, h.projectId);
    const files = filesUnder(root);
    // The current narration has the same names as before, never "(2)"; the old one is History.
    expect(files.filter((file) => file.startsWith("Working/Narration/"))).toEqual(first);
    expect(
      files.some((file) =>
        /^History\/[0-9]{4}-[0-9]{2}-[0-9]{2}\/Working\/Narration\//u.test(file),
      ),
    ).toBe(true);
    expect(files.some((file) => / \([0-9]+\)\./u.test(file))).toBe(false);
    expect(
      h
        .view()
        .outputs.filter((row) => row.selected)
        .every((row) => row.available),
    ).toBe(true);
    expect(reconcileStorage(h.deps.db, h.deps.paths).orphanFiles).toBe(0);
  } finally {
    h.close();
  }
}, 30000);

it("arranges a finished project whose only waiting rows are deferred stand-ins", async () => {
  const { h, deps } = await arranged();
  try {
    // A finished run keeps its "…:future" stand-ins pending; they never run.
    const work = h.deps.db
      .prepare(
        "SELECT w.id FROM revision_work w JOIN revision_work_pieces p ON p.work_id=w.id WHERE w.project_id=? LIMIT 1",
      )
      .get(h.projectId);
    h.deps.db
      .prepare("UPDATE revision_work SET state='pending',dispatch_state='allowed' WHERE id=?")
      .run(String(work?.id));
    h.deps.db
      .prepare("UPDATE revision_work_pieces SET work_key='shorts:future' WHERE work_id=?")
      .run(String(work?.id));
    expect(arrangeProject(deps, h.projectId).skipped).toBeUndefined();
  } finally {
    h.close();
  }
}, 30000);

it("leaves a project alone while any of it may run", async () => {
  const { h, deps } = await arranged();
  try {
    h.deps.db
      .prepare(
        "UPDATE revision_work SET state='running' WHERE project_id=? AND rowid=(SELECT min(rowid) FROM revision_work WHERE project_id=?)",
      )
      .run(h.projectId, h.projectId);
    expect(arrangeProject(deps, h.projectId).skipped).toBe("busy");
    expect(existsSync(join(h.deps.paths.projects, h.projectId))).toBe(true);
    expect(arrangeChanged(deps)).toEqual([]);
  } finally {
    h.close();
  }
}, 30000);

it("settles a move a crash cut short, from what is on disk", async () => {
  const { h, deps, places } = await arranged();
  try {
    arrangeProject(deps, h.projectId);
    const path =
      h.view().outputs.find((row) => row.selected && row.output.role === "audio_body")?.output
        .path ?? "";
    const at = outputPath(h.deps.paths, h.projectId, path);
    // Recorded as moving to History, and the rename happened: the move counts.
    places.moves.file(
      h.projectId,
      path,
      "History/2026-01-01/body.mp3",
      places.placeOf(h.projectId, path),
    );
    mkdirSync(join(projectDir(h.deps.paths, h.projectId), "History/2026-01-01"), {
      recursive: true,
    });
    renameSync(at, join(projectDir(h.deps.paths, h.projectId), "History/2026-01-01/body.mp3"));
    expect(recoverPlaces(h.deps.db, h.deps.paths)).toBe(1);
    const after = createPlaces(h.deps.db);
    expect(after.placeOf(h.projectId, path)).toBe("History/2026-01-01/body.mp3");
    // Recorded, but the rename never happened: the move is taken back.
    after.moves.file(h.projectId, path, "Working/elsewhere.mp3", "History/2026-01-01/body.mp3");
    expect(recoverPlaces(h.deps.db, h.deps.paths)).toBe(1);
    expect(createPlaces(h.deps.db).placeOf(h.projectId, path)).toBe("History/2026-01-01/body.mp3");
  } finally {
    h.close();
  }
}, 30000);

it("finds a readable folder and its files again from its marker when the database lost them", async () => {
  const { h, deps } = await arranged();
  try {
    arrangeProject(deps, h.projectId);
    const root = projectDir(h.deps.paths, h.projectId);
    const files = filesUnder(root);
    // A database from before the folder was arranged.
    h.deps.db.prepare("DELETE FROM file_places WHERE project_id=?").run(h.projectId);
    h.deps.db.prepare("DELETE FROM project_folders WHERE project_id=?").run(h.projectId);
    const fresh = createPlaces(h.deps.db);
    attachPlaces(h.deps.paths, fresh);
    expect(reconcileStorage(h.deps.db, h.deps.paths).orphanFiles).toBe(0);
    expect(filesUnder(root)).toEqual(files);
    expect(projectDir(h.deps.paths, h.projectId)).toBe(root);
    expect(
      h
        .view()
        .outputs.filter((row) => row.selected)
        .every((row) => row.available),
    ).toBe(true);
  } finally {
    h.close();
  }
}, 30000);

it("makes folder names every system accepts", () => {
  const free = () => false;
  expect(folderName("Lolth | D&D Lore To Sleep To", free)).toBe("Lolth - D&D Lore To Sleep To");
  expect(folderName('What? "Why" <now>: yes/no.', free)).toBe("What Why now - yes - no");
  expect(folderName("CON", free)).toBe("CON (project)");
  expect(folderName("Backups", free)).toBe("Backups (project)");
  expect(folderName(".hidden", free)).toBe("Project hidden");
  const used = new Set(["Saved", "Saved (2)"]);
  expect(folderName("Saved", (name) => used.has(name))).toBe("Saved (3)");
});

// A backup lists files by the paths their rows hold, as every version before readable folders
// wrote it, so any install (older or newer) restores them where its rows look.
it("backs up an arranged project's files under their stored paths", async () => {
  const { h, deps } = await arranged();
  try {
    arrangeProject(deps, h.projectId);
    const plan = planBackup({ ...h.deps, appVersion: "test" });
    const prefix = `files/projects/${h.projectId}/`;
    const files = plan.members.filter(
      (member): member is typeof member & { kind: "file"; path: string } =>
        member.kind === "file" && member.name.startsWith(prefix),
    );
    const stored = new Set(
      h.deps.db
        .prepare("SELECT path FROM project_assets WHERE project_id=?")
        .all(h.projectId)
        .map((row) => String(row.path)),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const name = file.name.slice(prefix.length);
      expect(name).not.toMatch(/^(Upload|Working|History)\//u);
      expect(name).not.toBe(projectMarker);
      expect(stored.has(name)).toBe(true);
      expect(existsSync(file.path)).toBe(true);
    }
  } finally {
    h.close();
  }
}, 30000);

it("keeps outputs only on an arranged project by where its files are", async () => {
  const { h, deps } = await arranged();
  try {
    arrangeProject(deps, h.projectId);
    h.deps.db.exec("UPDATE stages SET state='done'");
    const before = projectStorage(h.deps, h.projectId);
    expect(before.removableFiles).toBeGreaterThan(0);
    const result = keepOutputsOnly(h.deps, h.projectId);
    expect(result).toMatchObject({ ok: true, files: before.removableFiles });
    expect(projectStorage(h.deps, h.projectId).removableFiles).toBe(0);
    // Nothing outside the project folder's own files went, and cleanup still finds nothing.
    expect(reconcileStorage(h.deps.db, h.deps.paths).orphanFiles).toBe(0);
  } finally {
    h.close();
  }
}, 30000);

it("deletes old versions: History's made files go, the person's own file and the current version stay", async () => {
  const { h, deps } = await arranged();
  try {
    arrangeProject(deps, h.projectId);
    const base = h.view();
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: base.revision.id,
      idempotencyKey: "voice-history",
      edit: {
        config: {
          ...base.revision.config,
          audio: { provider: "openai-tts", model: "tts", voice: "other" },
        },
        content: base.revision.content,
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    admitPendingRevision(h.deps, saved.view, narrationCatalogue);
    await h.pump();
    settle(h);
    arrangeProject(deps, h.projectId);
    const root = projectDir(h.deps.paths, h.projectId);
    const day = readdirSync(join(root, "History"))[0] ?? "";
    writeFileSync(join(root, "History", day, "my notes.txt"), "mine");
    const before = projectStorage(h.deps, h.projectId);
    expect(before.historyFiles).toBeGreaterThan(0);
    expect(deleteOldVersions(h.deps, h.projectId)).toEqual({
      ok: true,
      files: before.historyFiles,
      bytesFreed: before.historyBytes,
    });
    expect(filesUnder(join(root, "History"))).toEqual([`${day}/my notes.txt`]);
    expect(projectStorage(h.deps, h.projectId).historyFiles).toBe(0);
    expect(
      h
        .view()
        .outputs.filter((row) => row.selected)
        .every((row) => row.available),
    ).toBe(true);
    expect(reconcileStorage(h.deps.db, h.deps.paths).orphanFiles).toBe(0);
  } finally {
    h.close();
  }
}, 30000);

it("cleans up every finished project's old versions and working files at once", async () => {
  const { h, deps } = await arranged();
  try {
    arrangeProject(deps, h.projectId);
    h.deps.db.exec("UPDATE stages SET state='done'");
    const before = projectStorage(h.deps, h.projectId);
    expect(before.removableFiles).toBeGreaterThan(0);
    const result = cleanUpAll(h.deps);
    expect(result.files).toBe(before.removableFiles);
    expect(result.skipped).toBe(0);
    const after = projectStorage(h.deps, h.projectId);
    expect([after.removableFiles, after.historyFiles]).toEqual([0, 0]);
    expect(reconcileStorage(h.deps.db, h.deps.paths).orphanFiles).toBe(0);
  } finally {
    h.close();
  }
}, 30000);
