import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { transact } from "../../kernel/db/tx.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import type { RevisionDeps } from "../revisions/model.js";
import { insertAsset } from "../revisions/repo.js";
import { discardPreparedAssets } from "./assets.js";
import { outputPath, stagingPath } from "./layout.js";
import { prepareStagedFile, prepareText } from "./prepare.js";
import { insertStagedFile, stagedFileById } from "./repo.js";

let deps: RevisionDeps;
beforeEach(() => {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-prepare-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(":memory:");
  const clock = fixedClock("2026-09-10T00:00:00.000Z");
  migrate(db, clock);
  for (const id of ["p1", "p2"]) {
    db.prepare("INSERT INTO projects VALUES (?,'t','16:9','{}','old','old')").run(id);
    mkdirSync(join(paths.projects, id));
  }
  let next = 0;
  deps = {
    paths,
    db,
    clock,
    ids: { next: (): string => `id${++next}` },
    log: { write: (): void => {} },
  };
});
afterEach(() => {
  deps.db.close();
  rmSync(deps.paths.dataDir, { recursive: true, force: true });
});

function staged(state: "copying" | "staged" = "staged"): string {
  const source = stagingPath(deps.paths, "upload1");
  writeFileSync(source, "png bytes");
  insertStagedFile(deps.db, {
    id: "upload1",
    path: "upload1",
    stageKind: "images",
    originalFilename: "Shot One.PNG",
    bytes: 1,
    state,
    createdAt: "old",
  });
  return source;
}

describe("prepareStagedFile", () => {
  it("returns expected missing or copying outcomes without allocating files", () => {
    expect(
      prepareStagedFile(deps, { stagedFileId: "missing", projectId: "p1", role: "image" }),
    ).toEqual({ ok: false, reason: "unknown-staged-file" });
    staged("copying");
    expect(
      prepareStagedFile(deps, { stagedFileId: "upload1", projectId: "p1", role: "image" }),
    ).toEqual({ ok: false, reason: "still-copying" });
    expect(readdirSync(join(deps.paths.projects, "p1"))).toEqual([]);
  });

  it("copies and seals without writing rows or consuming staged content", () => {
    const source = staged();
    deps.db.exec("PRAGMA query_only=1");
    const result = prepareStagedFile(deps, {
      stagedFileId: "upload1",
      projectId: "p1",
      role: "image",
      index: 2,
    });
    expect(result).toEqual({
      ok: true,
      stagedFileId: "upload1",
      stagedSource: source,
      asset: {
        id: "id1",
        projectId: "p1",
        path: "assets/id1/002.png",
        bytes: 9,
        createdAt: "2026-09-10T00:00:00.000Z",
      },
      output: {
        id: "id2",
        projectId: "p1",
        stageKind: "images",
        role: "image",
        path: "assets/id1/002.png",
        originalFilename: "Shot One.PNG",
        bytes: 9,
        durationMs: null,
        meta: { index: 2 },
        createdAt: "2026-09-10T00:00:00.000Z",
      },
    });
    expect(readFileSync(source, "utf8")).toBe("png bytes");
    expect(stagedFileById(deps.db, "upload1")?.state).toBe("staged");
    if (!result.ok) throw new Error(result.reason);
    expect(readFileSync(outputPath(deps.paths, "p1", result.output.path), "utf8")).toBe(
      "png bytes",
    );
    for (const table of ["outputs", "project_assets", "revision_outputs", "revision_pieces"]) {
      expect(deps.db.prepare(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
    }
  });

  it("prepares the same source repeatedly across nested batch transactions", () => {
    const source = staged();
    const copies = transact(deps.db, () =>
      ["p1", "p1", "p2"].map((projectId) =>
        transact(deps.db, () => {
          const result = prepareStagedFile(deps, {
            stagedFileId: "upload1",
            projectId,
            role: "image",
          });
          if (!result.ok) throw new Error(result.reason);
          return result;
        }),
      ),
    );
    expect(new Set(copies.map(({ asset }) => asset.path)).size).toBe(3);
    for (const { asset } of copies) {
      expect(readFileSync(outputPath(deps.paths, asset.projectId, asset.path), "utf8")).toBe(
        "png bytes",
      );
    }
    expect(readFileSync(source, "utf8")).toBe("png bytes");
    expect(stagedFileById(deps.db, "upload1")).toBeDefined();
  });

  it("keeps staged content and earlier committed files after publication rolls back", () => {
    const source = staged();
    const first = prepareStagedFile(deps, {
      stagedFileId: "upload1",
      projectId: "p1",
      role: "image",
    });
    const second = prepareStagedFile(deps, {
      stagedFileId: "upload1",
      projectId: "p1",
      role: "image",
    });
    if (!first.ok || !second.ok) throw new Error("Expected prepared images");
    insertAsset(deps.db, first.asset);
    expect(() =>
      transact(deps.db, () => {
        insertAsset(deps.db, second.asset);
        throw new Error("publication failed");
      }),
    ).toThrow("publication failed");
    discardPreparedAssets(deps, [first.asset, second.asset]);
    expect(readFileSync(source, "utf8")).toBe("png bytes");
    expect(stagedFileById(deps.db, "upload1")).toBeDefined();
    expect(readFileSync(outputPath(deps.paths, "p1", first.asset.path), "utf8")).toBe("png bytes");
    expect(existsSync(outputPath(deps.paths, "p1", second.asset.path))).toBe(false);
  });

  it("cleans the new directory when the source cannot be copied", () => {
    const source = staged();
    rmSync(source);
    expect(() =>
      prepareStagedFile(deps, { stagedFileId: "upload1", projectId: "p1", role: "image" }),
    ).toThrow(/ENOENT/);
    expect(readdirSync(outputPath(deps.paths, "p1", "assets"))).toEqual([]);
    expect(stagedFileById(deps.db, "upload1")).toBeDefined();
  });

  it("cleans the new copy after seal fails while preserving the original error and source", () => {
    const source = staged();
    const failure = new Error("seal clock failed");
    const clock = {
      ...deps.clock,
      now: (): Date => {
        throw failure;
      },
    };
    expect(() =>
      prepareStagedFile(
        { ...deps, clock },
        { stagedFileId: "upload1", projectId: "p1", role: "image" },
      ),
    ).toThrow(failure);
    expect(readdirSync(outputPath(deps.paths, "p1", "assets"))).toEqual([]);
    expect(readFileSync(source, "utf8")).toBe("png bytes");
    expect(stagedFileById(deps.db, "upload1")).toBeDefined();
  });
});

describe("prepareText", () => {
  it("prepares separate UTF-8 assets without inserting rows", () => {
    deps.db.exec("PRAGMA query_only=1");
    const input = {
      projectId: "p1",
      stageKind: "article",
      role: "article_md",
      text: "å🎵",
    } as const;
    const first = prepareText(deps, input);
    const second = prepareText(deps, { ...input, text: "second" });
    expect(first.output).toEqual({
      id: "id2",
      projectId: "p1",
      stageKind: "article",
      role: "article_md",
      path: "assets/id1/article.md",
      originalFilename: null,
      bytes: 6,
      durationMs: null,
      meta: {},
      createdAt: "2026-09-10T00:00:00.000Z",
    });
    expect(first.asset.path).not.toBe(second.asset.path);
    expect(readFileSync(outputPath(deps.paths, "p1", first.asset.path), "utf8")).toBe("å🎵");
    expect(readFileSync(outputPath(deps.paths, "p1", second.asset.path), "utf8")).toBe("second");
    expect(deps.db.prepare("SELECT * FROM outputs").all()).toEqual([]);
    expect(deps.db.prepare("SELECT * FROM project_assets").all()).toEqual([]);
  });

  it("cleans prepared bytes if allocating the output ID fails", () => {
    let next = 0;
    const failure = new Error("output ID allocation failed");
    const ids = {
      next: (): string => {
        if (++next === 1) return "id1";
        throw failure;
      },
    };
    expect(() =>
      prepareText(
        { ...deps, ids },
        {
          projectId: "p1",
          stageKind: "article",
          role: "article_md",
          text: "article",
        },
      ),
    ).toThrow(failure);
    expect(readdirSync(outputPath(deps.paths, "p1", "assets"))).toEqual([]);
  });
});
