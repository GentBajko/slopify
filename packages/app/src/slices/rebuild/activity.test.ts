import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { imagesActivity, videoActivity } from "./activity.js";

// Just the three tables the answer reads: the head revision, its work and their keys.
function project(
  work: readonly [key: string, state: string, current?: number, total?: number][],
  kind = "video",
) {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE project_heads (project_id TEXT PRIMARY KEY, revision_id TEXT NOT NULL);
    CREATE TABLE revision_work (id TEXT PRIMARY KEY, project_id TEXT, kind TEXT, state TEXT,
      progress_current REAL, progress_total REAL);
    CREATE TABLE revision_work_reservations (revision_id TEXT, work_key TEXT, work_id TEXT);
    INSERT INTO project_heads VALUES ('p1', 'r1');
  `);
  for (const [at, [key, state, current, total]] of work.entries()) {
    db.prepare("INSERT INTO revision_work VALUES (?, 'p1', ?, ?, ?, ?)").run(
      `w${String(at)}`,
      kind,
      state,
      current ?? null,
      total ?? null,
    );
    db.prepare("INSERT INTO revision_work_reservations VALUES ('r1', ?, ?)").run(
      key,
      `w${String(at)}`,
    );
  }
  return db;
}

describe("what a running Video stage is doing", () => {
  it("counts the shorts' pictures on their own, not every step the stage has", () => {
    const db = project([
      ["subtitles:timing", "done"],
      ["shorts:pick", "done"],
      ["shorts:1:image:1", "done"],
      ["shorts:1:image:2", "running"],
      ["shorts:2:image:1", "pending"],
      ["shorts:1:render", "pending"],
      ["export:video", "pending"],
    ]);
    expect(videoActivity(db, "p1")).toEqual({
      label: "drawing the shorts' pictures",
      done: 1,
      total: 3,
    });
  });

  it("gives the render its own percentage, in whole numbers and never 100 while it runs", () => {
    const db = project([
      ["export:video", "running", 10.159999999999998, 22],
      ["shorts:1:render", "running"],
    ]);
    expect(videoActivity(db, "p1")).toEqual({ label: "rendering the video", percent: 46 });
  });

  it("says nothing when nothing runs", () => {
    expect(videoActivity(project([["export:video", "done"]]), "p1")).toBeUndefined();
  });
});

describe("what a running Images stage is doing", () => {
  it("counts the pictures and their checks apart, each once", () => {
    const db = project(
      [
        ["images:scenes", "done"],
        ["images:scenes:1", "done"],
        ["images:appearance", "done"],
        ["image:A", "done"],
        ["image:B", "done"],
        ["image:C", "running"],
        ["review:image:A", "done"],
        ["review:image:B", "running"],
        ["review:image:C", "pending"],
      ],
      "images",
    );
    expect(imagesActivity(db, "p1")).toEqual({
      label: "drawing and checking the pictures",
      done: 3,
      total: 6,
      parts: [
        { noun: "pictures", done: 2, total: 3 },
        { noun: "checked", done: 1, total: 3 },
      ],
    });
  });

  it("counts only the pictures when they are not checked", () => {
    const db = project(
      [
        ["image:A", "done"],
        ["image:B", "running"],
      ],
      "images",
    );
    expect(imagesActivity(db, "p1")).toEqual({
      label: "drawing the pictures",
      done: 1,
      total: 2,
      parts: [{ noun: "pictures", done: 1, total: 2 }],
    });
  });

  it("leaves the stage's own count while the scenes are still being written", () => {
    const db = project([["images:scenes:1", "running"]], "images");
    expect(imagesActivity(db, "p1")).toBeUndefined();
  });
});
