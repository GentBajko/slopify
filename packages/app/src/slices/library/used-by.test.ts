import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { namesIn, usedBy, uses } from "./used-by.js";

const at = "2026-09-27T10:00:00.000Z";

function database(): DatabaseSync {
  const db = openDb(":memory:");
  migrate(db, fixedClock(at));
  return db;
}

function template(
  db: DatabaseSync,
  id: string,
  name: string,
  forms: readonly Record<string, unknown>[],
): void {
  db.prepare(
    "INSERT INTO project_templates (id,head_version,creation_hash,created_at) VALUES (?,?,?,?)",
  ).run(id, forms.length, "h", at);
  for (const [index, form] of forms.entries())
    db.prepare(
      "INSERT INTO project_template_revisions (template_id,version,name,document_json,created_at) VALUES (?,?,?,?,?)",
    ).run(id, index + 1, name, JSON.stringify({ schemaVersion: 1, form }), at);
}

function schedule(
  db: DatabaseSync,
  id: string,
  templateId: string,
  version: number,
  status: string,
): void {
  db.prepare(
    `INSERT INTO schedules (id,name,template_id,template_version,cadence_json,timezone,missed_policy,overlap_policy,items_json,status,version,creation_hash,created_at,updated_at)
     VALUES (?,?,?,?,'{}','UTC','skip','skip','[]',?,1,'h',?,?)`,
  ).run(id, `Schedule ${id}`, templateId, version, status, at, at);
}

function project(
  db: DatabaseSync,
  id: string,
  title: string,
  configs: readonly Record<string, unknown>[],
  head: number,
): void {
  db.prepare(
    "INSERT INTO projects (id,title,format,config,created_at,updated_at) VALUES (?,?,'16:9','{}',?,?)",
  ).run(id, title, at, at);
  for (const [index, config] of configs.entries())
    db.prepare(
      "INSERT INTO project_revisions (id,project_id,config,content,fingerprints,created_at) VALUES (?,?,?,'{}','{}',?)",
    ).run(`${id}-r${String(index)}`, id, JSON.stringify(config), at);
  db.prepare("INSERT INTO project_heads (project_id,revision_id) VALUES (?,?)").run(
    id,
    `${id}-r${String(head)}`,
  );
}

describe("namesIn", () => {
  it("reads every place a form or a run config names a Library item", () => {
    const form = {
      articlePrompt: "Essay",
      imagePrompts: [{ name: "Ink", number: "2" }],
      reference: { source: "prompt", prompt: "Cast sheet", thumbnail: true },
      shorts: { enabled: true, prompt: "Hooks", imagePrompt: "Vertical ink" },
      intro: "Hello",
      outro: "",
    };
    expect(namesIn(form, { item: "prompt", kind: "image", name: "x" })).toEqual([
      "Ink",
      "Cast sheet",
      "Vertical ink",
    ]);
    expect(namesIn(form, { item: "prompt", kind: "shorts", name: "x" })).toEqual(["Hooks"]);
    expect(namesIn(form, { item: "entry", category: "intro", name: "x" })).toEqual(["Hello"]);
    expect(namesIn(form, { item: "entry", category: "outro", name: "x" })).toEqual([]);
    // A run config holds the intro as `{ name, mode }`.
    expect(
      uses(
        { intro: { name: "hello", mode: "text" } },
        { item: "entry", category: "intro", name: "Hello" },
      ),
    ).toBe(true);
    expect(
      uses({ articlePrompt: "Essay" }, { item: "prompt", kind: "narration", name: "Essay" }),
    ).toBe(false);
  });
});

describe("usedBy", () => {
  it("lists the templates, live schedules and projects that name the prompt, with revision counts", () => {
    const db = database();
    // The template's head names it; an older version of another template did, but not now.
    template(db, "t1", "Weekly essay", [{ articlePrompt: "Essay" }]);
    template(db, "t2", "Changed", [{ articlePrompt: "Essay" }, { articlePrompt: "Other" }]);
    // A schedule runs the version it was saved with.
    schedule(db, "s1", "t2", 1, "active");
    schedule(db, "s2", "t2", 2, "active");
    schedule(db, "s3", "t1", 1, "canceled");
    // Two of three revisions used it, not the current one.
    project(db, "p1", "Cats", [{ articlePrompt: "essay" }, { articlePrompt: "Essay" }, {}], 2);
    project(db, "p2", "Dogs", [{ articlePrompt: "Other" }], 0);
    project(db, "p3", "Birds", [{ articlePrompt: "Essay" }], 0);

    const found = usedBy(db, { item: "prompt", kind: "article", name: "Essay" });

    expect(found.templates).toEqual([{ id: "t1", name: "Weekly essay" }]);
    expect(found.schedules).toEqual([{ id: "s1", name: "Schedule s1", status: "active" }]);
    expect(found.projects).toEqual(
      expect.arrayContaining([
        { id: "p1", title: "Cats", revisions: 2, totalRevisions: 3, current: false },
        { id: "p3", title: "Birds", revisions: 1, totalRevisions: 1, current: true },
      ]),
    );
    expect(found.projects).toHaveLength(2);
  });

  it("matches a name that is not plain ASCII, and nothing for an unused one", () => {
    const db = database();
    template(db, "t1", "Café", [{ intro: "Grüß Gott" }]);
    expect(usedBy(db, { item: "entry", category: "intro", name: "GRÜSS GOTT" }).templates).toEqual(
      [],
    );
    expect(usedBy(db, { item: "entry", category: "intro", name: "grüß gott" }).templates).toEqual([
      { id: "t1", name: "Café" },
    ]);
    expect(usedBy(db, { item: "prompt", kind: "article", name: "Nothing" })).toEqual({
      templates: [],
      schedules: [],
      projects: [],
    });
  });
});
