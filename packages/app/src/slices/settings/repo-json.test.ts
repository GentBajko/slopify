import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { cliBinary } from "./cli-paths.js";
import { deleteSetting, readJsonSetting, readSetting, writeSetting } from "./repo.js";

function freshDb() {
  const db = openDb(":memory:");
  migrate(db, fixedClock("2026-09-10T00:00:00.000Z"));
  return db;
}

describe("readJsonSetting", () => {
  it("reads a good row and falls back for an absent one", () => {
    const db = freshDb();
    writeSetting(db, "k", JSON.stringify(3));
    expect(readJsonSetting(db, "k", z.number(), 0)).toBe(3);
    expect(readJsonSetting(db, "missing", z.number(), 7)).toBe(7);
  });

  it("falls back and logs a warning naming the setting, never its value, for a damaged row", () => {
    const db = freshDb();
    writeSetting(db, "k", "{secret-not-json");
    const write = vi.fn();
    expect(readJsonSetting(db, "k", z.number(), 5, { write })).toBe(5);
    writeSetting(db, "k", JSON.stringify("sk-abcdefabcdefabcdefabcdef"));
    expect(readJsonSetting(db, "k", z.number(), 5, { write })).toBe(5);
    expect(write).toHaveBeenCalledTimes(2);
    const detail = String(write.mock.calls[1]?.[2]?.detail);
    expect(detail).toContain("setting k");
    expect(detail).not.toContain("sk-");
  });

  it("does not crash the CLI path lookup on a damaged row", () => {
    const db = freshDb();
    const warn = vi.spyOn(process, "emitWarning").mockImplementation(() => undefined);
    writeSetting(db, "cli.path.claude-code", "not json");
    expect(cliBinary(db, "claude-code")).toBe("claude");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("deleteSetting", () => {
  it("removes the row", () => {
    const db = freshDb();
    writeSetting(db, "k", "1");
    deleteSetting(db, "k");
    expect(readSetting(db, "k")).toBeUndefined();
  });
});
