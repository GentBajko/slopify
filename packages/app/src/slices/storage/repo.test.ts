import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { Clock } from "../../kernel/clock.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { Output, StagedFile } from "./model.js";
import {
  deleteStagedFile,
  insertOutput,
  insertStagedFile,
  markStagedFileCopied,
  outputsOf,
  projectTitle,
  stagedFileById,
  stagedFiles,
} from "./repo.js";

const clock: Clock = { now: () => new Date("2026-09-02T10:00:00.000Z") };

function migrated(): DatabaseSync {
  const db = openDb(":memory:");
  migrate(db, clock);
  db.exec("INSERT INTO projects VALUES ('p1','Hello World','16:9','{}','2026-09-01','2026-09-01')");
  return db;
}

const image: Output = {
  id: "o1",
  projectId: "p1",
  stageKind: "images",
  role: "image",
  path: "images/001.png",
  originalFilename: "shot one.png",
  bytes: 12,
  durationMs: null,
  meta: { index: 1, promptName: "Cinematic" },
  createdAt: "2026-09-02T10:00:00.000Z",
};

const staged: StagedFile = {
  id: "s1",
  stageKind: "audio",
  path: "s1",
  originalFilename: "take one.mp3",
  bytes: 0,
  state: "copying",
  createdAt: "2026-09-02T10:00:00.000Z",
};

describe("outputs", () => {
  it("round-trips an output with its meta parsed back to an object", () => {
    const db = migrated();

    insertOutput(db, image);

    expect(outputsOf(db, "p1")).toEqual([image]);
  });

  it("round-trips an output with no original filename, duration, or meta", () => {
    const db = migrated();
    const article: Output = {
      ...image,
      id: "o2",
      stageKind: "article",
      role: "article_md",
      path: "article.md",
      originalFilename: null,
      meta: {},
    };

    insertOutput(db, article);

    expect(outputsOf(db, "p1")).toEqual([article]);
  });

  it("has nothing for a project with no outputs", () => {
    expect(outputsOf(migrated(), "p1")).toEqual([]);
  });

  it("keeps insertion order, which is slideshow order for images", () => {
    const db = migrated();
    insertOutput(db, { ...image, id: "o2", path: "images/002.png", meta: { index: 2 } });
    insertOutput(db, image);

    expect(outputsOf(db, "p1").map((output) => output.id)).toEqual(["o2", "o1"]);
  });
});

describe("staged files", () => {
  it("records a copy in progress, then its finished size", () => {
    const db = migrated();

    insertStagedFile(db, staged);
    expect(stagedFiles(db)).toEqual([staged]);

    markStagedFileCopied(db, "s1", 4096);

    expect(stagedFileById(db, "s1")).toEqual({ ...staged, bytes: 4096, state: "staged" });
  });

  it("has nothing for an id it never recorded", () => {
    expect(stagedFileById(migrated(), "missing")).toBeUndefined();
  });

  it("forgets a staged file that is discarded", () => {
    const db = migrated();
    insertStagedFile(db, staged);

    deleteStagedFile(db, "s1");

    expect(stagedFiles(db)).toEqual([]);
  });
});

describe("projectTitle", () => {
  it("reads the title a download name is built from", () => {
    expect(projectTitle(migrated(), "p1")).toBe("Hello World");
  });

  it("has none for a project that does not exist", () => {
    expect(projectTitle(migrated(), "gone")).toBeUndefined();
  });
});
