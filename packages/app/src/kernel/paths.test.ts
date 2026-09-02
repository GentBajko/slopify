import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ensureDirs, layout } from "./paths.js";

describe("layout", () => {
  it("places every part of the tree under the data directory", () => {
    const paths = layout("/data/slopify");

    expect(paths).toEqual({
      dataDir: "/data/slopify",
      db: "/data/slopify/slopify.db",
      projects: "/data/slopify/projects",
      staging: "/data/slopify/staging",
      logs: "/data/slopify/logs",
      lock: "/data/slopify/.lock",
    });
  });

  it("resolves a relative data directory to an absolute one", () => {
    expect(layout("relative-dir").dataDir).toBe(join(process.cwd(), "relative-dir"));
  });
});

describe("ensureDirs", () => {
  it("creates the tree owner-only and is repeatable", () => {
    const paths = layout(join(mkdtempSync(join(tmpdir(), "slopify-paths-")), "nested"));

    ensureDirs(paths, { mode: 0o700 });
    ensureDirs(paths, { mode: 0o700 });

    for (const dir of [paths.dataDir, paths.projects, paths.staging, paths.logs]) {
      expect(statSync(dir).isDirectory()).toBe(true);
      expect(statSync(dir).mode & 0o777).toBe(0o700);
    }
  });
});
