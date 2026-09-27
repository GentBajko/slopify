import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import type { Clock } from "../../kernel/clock.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import type { RunConfig } from "../admission/model.js";
import { insertProject, listProjects, projectById, projectExists } from "../admission/repo.js";
import { queueEntries } from "../batch/index.js";
import { listVersions } from "../library/history.js";
import { entryByName, listEntries, listPrompts, promptByName } from "../library/repo.js";
import { createEntry, createPrompt, removeEntry, removePrompt } from "../library/save.js";
import { templateById, templateSummaries } from "../project-templates/repo.js";
import { dueSchedules, scheduleById } from "../schedules/repo.js";
import { projectDir } from "../storage/layout.js";
import type { TrashDeps } from "./model.js";
import {
  createTrashPurge,
  deleteNow,
  freeName,
  listTrash,
  purgeExpired,
  restoreItem,
  trashProject,
} from "./service.js";

const dayMs = 24 * 60 * 60_000;
const T1 = "00000000-0000-4000-8000-0000000000a1";
const T2 = "00000000-0000-4000-8000-0000000000a2";
const S1 = "00000000-0000-4000-8000-0000000000b1";

interface Harness extends TrashDeps {
  readonly ids: Ids;
  readonly advance: (ms: number) => void;
  readonly warnings: string[];
}

function harness(): Harness {
  let at = Date.parse("2026-09-27T10:00:00.000Z");
  const clock: Clock = { now: () => new Date(at), sleep: () => Promise.resolve() };
  const db = openDb(":memory:");
  migrate(db, fixedClock("2026-09-27T09:00:00.000Z"));
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-trash-")));
  ensureDirs(paths, { mode: 0o700 });
  const warnings: string[] = [];
  const log: Log = { write: (level, event) => void warnings.push(`${level}:${event}`) };
  let n = 0;
  return {
    db,
    paths,
    clock,
    log,
    warnings,
    ids: { next: () => `id${String(++n)}` },
    advance: (ms) => {
      at += ms;
    },
  };
}

function ok<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error(`Expected success, got ${JSON.stringify(result)}`);
  return result.value;
}

const config: RunConfig = {
  title: "Rope Tricks",
  format: "16:9",
  sources: {
    research: "off",
    article: "provide",
    audio: "generate",
    images: "off",
    thumbnail: "off",
    video: "off",
  },
  imagePrompts: [],
  values: { topic: "rope" },
  provided: {},
  silenceGapSeconds: 3,
  imageSeconds: 15,
  zoomPercent: 22.5,
  motionStyle: "zoom",
  edgeSilenceSeconds: 0,
  rendered: {},
};

function project(h: Harness, id: string, state = "done"): string {
  insertProject(h.db, {
    id,
    title: config.title,
    format: config.format,
    config,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  });
  h.db
    .prepare("INSERT INTO stages (id, project_id, kind, source, state) VALUES (?, ?, ?, ?, ?)")
    .run(`${id}-s`, id, "video", "generate", state);
  const dir = projectDir(h.paths, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "article.md"), "# Rope");
  return dir;
}

function template(h: Harness, id: string, name: string): void {
  h.db
    .prepare(
      "INSERT INTO project_templates(id,head_version,creation_hash,created_at) VALUES (?,1,'h',?)",
    )
    .run(id, "2026-09-01T00:00:00.000Z");
  h.db
    .prepare(
      "INSERT INTO project_template_revisions(template_id,version,name,document_json,created_at) VALUES (?,1,?,'{}',?)",
    )
    .run(id, name, "2026-09-01T00:00:00.000Z");
}

// A schedule as Delete leaves it: canceled, no next run, stamped.
function deletedSchedule(h: Harness, id: string, templateId: string): void {
  h.db
    .prepare(
      `INSERT INTO schedules (id,name,template_id,template_version,cadence_json,timezone,missed_policy,
       overlap_policy,items_json,status,version,creation_hash,created_at,updated_at,deleted_at)
       VALUES (?,'Weekly',?,1,'{"kind":"daily","time":"09:00"}','UTC','skip','skip','[]','canceled',3,'h',?,?,?)`,
    )
    .run(id, templateId, "2026-09-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z", now(h));
}

const now = (h: Harness): string => h.clock.now().toISOString();

describe("prompts and intro/outro entries in the trash", () => {
  it("leave every list and lookup, keep their history and free their name", () => {
    const h = harness();
    const prompt = ok(createPrompt(h, { kind: "article", name: "Explainer", body: "x" }));
    ok(removePrompt(h, prompt.id));

    expect(listPrompts(h.db)).toEqual([]);
    expect(promptByName(h.db, "article", "explainer")).toBeUndefined();
    expect(listVersions(h.db, "prompt", prompt.id)).toHaveLength(1);
    // The name is free again while the old one waits in the trash.
    ok(createPrompt(h, { kind: "article", name: "Explainer", body: "y" }));
    expect(listTrash(h)).toEqual([
      {
        kind: "prompt",
        id: prompt.id,
        name: "Explainer",
        detail: "article",
        deletedAt: "2026-09-27T10:00:00.000Z",
        purgeAt: "2026-10-27T10:00:00.000Z",
        daysLeft: 30,
      },
    ]);
  });

  it("come back under a suffixed name when a live one took theirs", () => {
    const h = harness();
    const first = ok(createPrompt(h, { kind: "image", name: "Photo", body: "a" }));
    ok(removePrompt(h, first.id));
    ok(createPrompt(h, { kind: "image", name: "Photo", body: "b" }));
    const second = ok(createPrompt(h, { kind: "image", name: "Photo (restored)", body: "c" }));
    ok(removePrompt(h, second.id));
    ok(createPrompt(h, { kind: "image", name: "Photo (Restored)", body: "d" }));

    expect(ok(restoreItem(h, "prompt", first.id))).toEqual({
      kind: "prompt",
      id: first.id,
      name: "Photo (restored 2)",
      renamedFrom: "Photo",
    });
    expect(promptByName(h.db, "image", "Photo (restored 2)")?.body).toBe("a");
    // The rename is a version of its own in History.
    expect(listVersions(h.db, "prompt", first.id)[0]?.name).toBe("Photo (restored 2)");
    expect(listTrash(h).map((item) => item.id)).toEqual([second.id]);
  });

  it("come back as they were when the name is still free", () => {
    const h = harness();
    const entry = ok(createEntry(h, { category: "intro", mode: "text", name: "Hi", body: "Hi." }));
    ok(removeEntry(h, entry.id));
    expect(listEntries(h.db)).toEqual([]);

    expect(ok(restoreItem(h, "entry", entry.id)).renamedFrom).toBeNull();
    expect(entryByName(h.db, "intro", "hi")?.id).toBe(entry.id);
    expect(listTrash(h)).toEqual([]);
  });

  it("go for good with Delete now, history and all", () => {
    const h = harness();
    const prompt = ok(createPrompt(h, { kind: "article", name: "Gone", body: "x" }));
    ok(removePrompt(h, prompt.id));

    expect(deleteNow(h, "prompt", prompt.id)).toEqual({ ok: true, value: null });
    expect(h.db.prepare("SELECT count(*) AS n FROM prompts").get()).toEqual({ n: 0 });
    expect(listVersions(h.db, "prompt", prompt.id)).toEqual([]);
    // A live prompt is not in the trash, so Delete now does not reach it.
    const live = ok(createPrompt(h, { kind: "article", name: "Live", body: "x" }));
    expect(deleteNow(h, "prompt", live.id)).toEqual({ ok: false, reason: "not-found" });
  });
});

describe("templates in the trash", () => {
  it("leave the lists and come back renamed as a new version when the name is taken", () => {
    const h = harness();
    template(h, T1, "Weekly show");
    h.db.prepare("UPDATE project_templates SET deleted_at=? WHERE id=?").run(now(h), T1);
    template(h, T2, "weekly show");

    expect(templateSummaries(h.db).map((one) => one.id)).toEqual([T2]);
    expect(listTrash(h).map((item) => [item.kind, item.name])).toEqual([
      ["template", "Weekly show"],
    ]);

    expect(ok(restoreItem(h, "template", T1)).name).toBe("Weekly show (restored)");
    const heads = h.db.prepare("SELECT head_version FROM project_templates WHERE id=?").get(T1);
    expect(heads).toEqual({ head_version: 2 });
    expect(templateSummaries(h.db).map((one) => one.name)).toEqual([
      "weekly show",
      "Weekly show (restored)",
    ]);
  });

  it("are removed for good with their versions", () => {
    const h = harness();
    template(h, T1, "Old");
    h.db.prepare("UPDATE project_templates SET deleted_at=? WHERE id=?").run(now(h), T1);

    expect(deleteNow(h, "template", T1)).toEqual({ ok: true, value: null });
    expect(h.db.prepare("SELECT count(*) AS n FROM project_template_revisions").get()).toEqual({
      n: 0,
    });
    expect(templateById(h.db, T1)).toBeUndefined();
  });
});

describe("schedules in the trash", () => {
  it("come back paused with no next run, and never due until resumed", () => {
    const h = harness();
    template(h, T1, "Show");
    deletedSchedule(h, S1, T1);
    expect(listTrash(h).map((item) => [item.kind, item.id])).toEqual([["schedule", S1]]);

    ok(restoreItem(h, "schedule", S1));

    expect(scheduleById(h.db, S1)).toMatchObject({
      status: "paused",
      nextRunAt: null,
      deletedAt: null,
      version: 4,
    });
    expect(dueSchedules(h.db, "2030-01-01T00:00:00.000Z")).toEqual([]);
  });

  it("wait for their template: restored first from the trash, never once it is gone", () => {
    const h = harness();
    template(h, T1, "Show");
    deletedSchedule(h, S1, T1);
    h.db.prepare("UPDATE project_templates SET deleted_at=? WHERE id=?").run(now(h), T1);

    expect(restoreItem(h, "schedule", S1)).toEqual({ ok: false, reason: "template-in-trash" });
    ok(deleteNow(h, "template", T1));
    expect(restoreItem(h, "schedule", S1)).toEqual({ ok: false, reason: "template-gone" });
  });

  it("leave the trash with Delete now but keep their row and run history", () => {
    const h = harness();
    template(h, T1, "Show");
    deletedSchedule(h, S1, T1);

    expect(deleteNow(h, "schedule", S1)).toEqual({ ok: true, value: null });
    expect(listTrash(h)).toEqual([]);
    expect(scheduleById(h.db, S1)?.deletedAt).not.toBeNull();
    expect(restoreItem(h, "schedule", S1)).toEqual({ ok: false, reason: "not-found" });
  });
});

describe("projects in the trash", () => {
  it("leave every list, lookup and the batch queue, keeping their files", () => {
    const h = harness();
    const dir = project(h, "p1", "pending");
    project(h, "p2", "pending");
    h.db.prepare("INSERT INTO batches(id, created_at) VALUES ('b', ?)").run(now(h));
    h.db
      .prepare("INSERT INTO project_queue(project_id, batch_id) VALUES ('p1','b'),('p2','b')")
      .run();

    expect(trashProject(h, "p1")).toEqual({ ok: true, value: null });

    expect(listProjects(h.db).map((one) => one.id)).toEqual(["p2"]);
    expect(projectById(h.db, "p1")).toBeUndefined();
    expect(projectExists(h.db, "p1")).toBe(false);
    expect(queueEntries(h.db).map((entry) => entry.projectId)).toEqual(["p2"]);
    expect(existsSync(dir)).toBe(true);
    expect(trashProject(h, "p1")).toEqual({ ok: false, reason: "not-found" });

    ok(restoreItem(h, "project", "p1"));
    expect(queueEntries(h.db).map((entry) => entry.projectId)).toEqual(["p1", "p2"]);
  });

  it("refuses a project whose run is still going, as Delete always did", () => {
    const h = harness();
    project(h, "p1", "running");
    project(h, "p2", "done");

    expect(trashProject(h, "p1")).toEqual({ ok: false, reason: "running" });
    expect(trashProject({ ...h, hasInflight: (id) => id === "p2" }, "p2")).toEqual({
      ok: false,
      reason: "running",
    });
    expect(trashProject(h, "nope")).toEqual({ ok: false, reason: "not-found" });
  });

  it("are removed for good with their folder by Delete now", () => {
    const h = harness();
    const dir = project(h, "p1");
    ok(trashProject(h, "p1"));

    expect(deleteNow(h, "project", "p1")).toEqual({ ok: true, value: null });
    expect(existsSync(dir)).toBe(false);
    expect(h.db.prepare("SELECT count(*) AS n FROM projects").get()).toEqual({ n: 0 });
    expect(h.db.prepare("SELECT count(*) AS n FROM project_trash").get()).toEqual({ n: 0 });
  });

  it("are never removed by Delete now while not in the trash", () => {
    const h = harness();
    const dir = project(h, "p1");
    expect(deleteNow(h, "project", "p1")).toEqual({ ok: false, reason: "not-found" });
    expect(existsSync(dir)).toBe(true);
  });
});

describe("the daily purge", () => {
  it("removes what has been in the trash 30 days, files included, and keeps the rest", () => {
    const h = harness();
    const oldDir = project(h, "old");
    ok(trashProject(h, "old"));
    const prompt = ok(createPrompt(h, { kind: "article", name: "Old prompt", body: "x" }));
    ok(removePrompt(h, prompt.id));
    template(h, T1, "Show");
    deletedSchedule(h, S1, T1);
    h.advance(10 * dayMs);
    const newDir = project(h, "new");
    ok(trashProject(h, "new"));

    h.advance(20 * dayMs - 1);
    expect(purgeExpired(h)).toEqual({ removed: 0, kept: 0 });

    h.advance(1);
    expect(purgeExpired(h)).toEqual({ removed: 3, kept: 0 });
    expect(existsSync(oldDir)).toBe(false);
    expect(existsSync(newDir)).toBe(true);
    expect(listTrash(h).map((item) => [item.id, item.daysLeft])).toEqual([["new", 10]]);
    // The schedule's history row stays; it has only left the trash.
    expect(scheduleById(h.db, S1)).toBeDefined();
  });

  it("runs once at start, then once a day", () => {
    const h = harness();
    const purge = createTrashPurge(h);
    project(h, "p1");
    ok(trashProject(h, "p1"));

    expect(purge.tick()).toEqual({ removed: 0, kept: 0 });
    h.advance(31 * dayMs - 60_000);
    // A day has passed since the first purge, so this one runs and finds the project due.
    expect(purge.tick()).toEqual({ removed: 1, kept: 0 });
    h.advance(60 * 60_000);
    expect(purge.tick()).toBeUndefined();
  });
});

describe("freeName", () => {
  it("counts up and keeps the name within the limit", () => {
    const taken = new Set(["a", "a (restored)"]);
    expect(freeName("a", 200, (name) => taken.has(name))).toBe("a (restored 2)");
    expect(freeName("abcdefghij", 14, () => false)).toBe("abcdefghij");
    expect(freeName("abcdefghij", 14, (name) => name === "abcdefghij")).toBe("abc (restored)");
  });
});
