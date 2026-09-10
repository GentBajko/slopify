import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { transact } from "../../kernel/db/tx.js";
import type { LogFields } from "../../kernel/log.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import type { RevisionDeps } from "../revisions/model.js";
import { insertAsset } from "../revisions/repo.js";
import { allocateAsset, discardPreparedAssets, sealAsset, writeAsset } from "./assets.js";
import { outputPath } from "./layout.js";

let deps: RevisionDeps;
let warnings: (LogFields | undefined)[];
beforeEach(() => {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-assets-")));
  ensureDirs(paths, { mode: 0o700 });
  mkdirSync(join(paths.projects, "p1"));
  const db = openDb(":memory:");
  const clock = fixedClock("2026-09-10T00:00:00.000Z");
  migrate(db, clock);
  db.exec("INSERT INTO projects VALUES ('p1','t','16:9','{}','old','old')");
  let next = 0;
  warnings = [];
  deps = {
    paths,
    db,
    clock,
    ids: { next: (): string => `a${++next}` },
    log: {
      write: (_level, _event, fields): void => {
        warnings.push(fields);
      },
    },
  };
});
afterEach(() => {
  deps.db.close();
  rmSync(deps.paths.dataDir, { recursive: true, force: true });
});

it("allocates a different path for the same logical filename", () => {
  const first = writeAsset(deps, "p1", "article.md", Buffer.from("first"));
  const second = writeAsset(deps, "p1", "article.md", Buffer.from("second"));
  expect(first.path).not.toBe(second.path);
  expect(readFileSync(outputPath(deps.paths, "p1", first.path), "utf8")).toBe("first");
  expect(readFileSync(outputPath(deps.paths, "p1", second.path), "utf8")).toBe("second");
});

describe("immutable asset allocation", () => {
  it.each([
    "",
    ".",
    "..",
    "../article.md",
    "dir/article.md",
    "dir\\article.md",
    "nul\0.txt",
    "tab\t.txt",
    "line\n.txt",
    "delete\x7f.txt",
    "a:b",
    "a<b",
    "a>b",
    'a"b',
    "a|b",
    "a?b",
    "a*b",
    "article.",
    "article ",
    "CON",
    "con.txt",
    "PRN.wav",
    "AUX",
    "NUL.png",
    "COM1",
    "LPT9.txt",
    "com¹.txt",
    "lpt².txt",
    "CONIN$",
    "CONOUT$.txt",
  ])("rejects unsafe basename %j without allocating an ID or directory", (filename) => {
    let called = false;
    const ids = {
      next: (): string => {
        called = true;
        return "a1";
      },
    };
    expect(() => allocateAsset({ ...deps, ids }, "p1", filename)).toThrow();
    expect(called).toBe(false);
    expect(readdirSync(join(deps.paths.projects, "p1"))).toEqual([]);
  });

  it("rejects an unsafe generated ID before making directories", () => {
    const ids = { next: (): string => "../elsewhere" };
    expect(() => allocateAsset({ ...deps, ids }, "p1", "article.md")).toThrow();
    expect(readdirSync(join(deps.paths.projects, "p1"))).toEqual([]);
  });

  it("preserves an existing allocation on ID collision", () => {
    const fixed = { ...deps, ids: { next: (): string => "a1" } };
    const first = writeAsset(fixed, "p1", "article.md", Buffer.from("first"));
    expect(() => writeAsset(fixed, "p1", "article.md", Buffer.from("second"))).toThrow();
    expect(readFileSync(outputPath(deps.paths, "p1", first.path), "utf8")).toBe("first");
  });

  it("seals measured bytes and a timestamp without inserting rows", () => {
    const pending = allocateAsset(deps, "p1", "audio.wav");
    writeFileSync(pending.absolutePath, Buffer.from("å🎵"), { mode: 0o644 });
    expect(sealAsset(deps, pending)).toEqual({
      id: pending.id,
      projectId: "p1",
      path: pending.path,
      bytes: 6,
      createdAt: "2026-09-10T00:00:00.000Z",
    });
    if (process.platform !== "win32")
      expect(statSync(pending.absolutePath).mode & 0o777).toBe(0o600);
    expect(deps.db.prepare("SELECT * FROM project_assets").all()).toEqual([]);
  });

  it("rejects a directory as an asset", () => {
    const pending = allocateAsset(deps, "p1", "audio.wav");
    mkdirSync(pending.absolutePath);
    expect(() => sealAsset(deps, pending)).toThrow();
  });

  it("cleans its allocation after a write fails while keeping older bytes", () => {
    const first = writeAsset(deps, "p1", "article.md", Buffer.from("first"));
    expect(() => writeAsset(deps, "p1", "a".repeat(5000), Buffer.from("second"))).toThrow();
    expect(readdirSync(outputPath(deps.paths, "p1", "assets"))).toEqual([first.id]);
    expect(readFileSync(outputPath(deps.paths, "p1", first.path), "utf8")).toBe("first");
  });

  it("cleans its allocation after sealing fails and preserves the original error", () => {
    const failure = new Error("clock failed during seal");
    const clock = {
      ...deps.clock,
      now: (): Date => {
        throw failure;
      },
    };
    expect(() => writeAsset({ ...deps, clock }, "p1", "article.md", Buffer.from("second"))).toThrow(
      failure,
    );
    expect(readdirSync(outputPath(deps.paths, "p1", "assets"))).toEqual([]);
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "logs a failed cleanup while rethrowing the original write failure",
    () => {
      const assets = outputPath(deps.paths, "p1", "assets");
      const failure = new Error("clock failed during seal");
      const clock = {
        ...deps.clock,
        now: (): Date => {
          chmodSync(assets, 0o500);
          throw failure;
        },
      };
      try {
        expect(() =>
          writeAsset({ ...deps, clock }, "p1", "article.md", Buffer.from("second")),
        ).toThrow(failure);
        expect(warnings).toEqual([
          expect.objectContaining({
            projectId: "p1",
            detail: expect.stringMatching(/EACCES|EPERM/),
          }),
        ]);
      } finally {
        chmodSync(assets, 0o700);
      }
    },
  );
});

describe("discardPreparedAssets", () => {
  it("falls back to a warning when the cleanup logger is unavailable", () => {
    const pending = allocateAsset(deps, "p1", "article.md");
    writeFileSync(pending.absolutePath, "kept");
    const failure = new Error("log is unavailable");
    const log = {
      write: (): void => {
        throw failure;
      },
    };
    const warning = vi.spyOn(process, "emitWarning").mockImplementation(() => {});
    try {
      expect(() =>
        discardPreparedAssets({ ...deps, log }, [{ ...pending, path: "wrong" }]),
      ).not.toThrow();
      expect(warning).toHaveBeenCalledWith(expect.stringContaining("log is unavailable"));
      expect(readFileSync(pending.absolutePath, "utf8")).toBe("kept");
    } finally {
      warning.mockRestore();
    }
  });

  it("removes pending and rolled-back prepared assets but retains registered assets", () => {
    const committed = writeAsset(deps, "p1", "article.md", Buffer.from("kept"));
    insertAsset(deps.db, committed);
    const prepared = writeAsset(deps, "p1", "article.md", Buffer.from("rolled back"));
    expect(() =>
      transact(deps.db, () => {
        insertAsset(deps.db, prepared);
        throw new Error("rollback");
      }),
    ).toThrow("rollback");
    const pending = allocateAsset(deps, "p1", "partial.wav");
    writeFileSync(pending.absolutePath, "partial");
    discardPreparedAssets(deps, [committed, prepared, pending]);
    expect(readFileSync(outputPath(deps.paths, "p1", committed.path), "utf8")).toBe("kept");
    expect(existsSync(outputPath(deps.paths, "p1", `assets/${prepared.id}`))).toBe(false);
    expect(existsSync(outputPath(deps.paths, "p1", `assets/${pending.id}`))).toBe(false);
  });

  it("keeps a registered descendant even when adopted under a different ID", () => {
    const pending = allocateAsset(deps, "p1", "article.md");
    const nested = outputPath(deps.paths, "p1", `assets/${pending.id}/legacy`);
    mkdirSync(nested);
    writeFileSync(join(nested, "audio.wav"), "kept");
    insertAsset(deps.db, {
      id: "legacy-id",
      projectId: "p1",
      path: `assets/${pending.id}/legacy/audio.wav`,
      bytes: 4,
      createdAt: "old",
    });
    discardPreparedAssets(deps, [pending]);
    expect(readFileSync(join(nested, "audio.wav"), "utf8")).toBe("kept");
  });

  it("keeps a directory when its ID is registered with another path", () => {
    const pending = allocateAsset(deps, "p1", "article.md");
    writeFileSync(pending.absolutePath, "kept");
    insertAsset(deps.db, { ...pending, path: "legacy.md", bytes: 4, createdAt: "old" });
    discardPreparedAssets(deps, [pending]);
    expect(readFileSync(pending.absolutePath, "utf8")).toBe("kept");
  });

  it("rejects a mismatched path without deleting an allocated directory", () => {
    const pending = allocateAsset(deps, "p1", "article.md");
    writeFileSync(pending.absolutePath, "kept");
    discardPreparedAssets(deps, [{ ...pending, path: "article.md" }]);
    expect(readFileSync(pending.absolutePath, "utf8")).toBe("kept");
    expect(warnings).toEqual([expect.objectContaining({ projectId: "p1" })]);
  });
});
