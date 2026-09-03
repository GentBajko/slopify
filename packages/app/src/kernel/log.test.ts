import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Clock } from "./clock.js";
import { openLog } from "./log.js";

function fixedClock(iso: string): Clock {
  return { now: () => new Date(iso) };
}

function logsDir(): string {
  return mkdtempSync(join(tmpdir(), "slopify-log-"));
}

describe("openLog", () => {
  it("appends one JSON line per record, carrying the project and stage", () => {
    const dir = logsDir();
    const log = openLog(dir, fixedClock("2026-09-02T10:00:00.000Z"));

    log.write("info", "stage.started", { projectId: "01J", stage: "audio" });
    log.write("error", "stage.failed", { projectId: "01J", stage: "audio", detail: "boom" });

    const lines = readFileSync(join(dir, "slopify-2026-09-02.log"), "utf8").trimEnd().split("\n");
    expect(lines.map((line) => JSON.parse(line))).toEqual([
      {
        ts: "2026-09-02T10:00:00.000Z",
        level: "info",
        event: "stage.started",
        projectId: "01J",
        stage: "audio",
      },
      {
        ts: "2026-09-02T10:00:00.000Z",
        level: "error",
        event: "stage.failed",
        projectId: "01J",
        stage: "audio",
        detail: "boom",
      },
    ]);
  });

  it("omits fields that were not supplied", () => {
    const dir = logsDir();

    openLog(dir, fixedClock("2026-09-02T10:00:00.000Z")).write("info", "boot");

    const line = readFileSync(join(dir, "slopify-2026-09-02.log"), "utf8").trimEnd();
    expect(JSON.parse(line)).toEqual({
      ts: "2026-09-02T10:00:00.000Z",
      level: "info",
      event: "boot",
    });
  });

  it("rotates daily", () => {
    const dir = logsDir();
    let iso = "2026-09-02T23:59:59.000Z";
    const log = openLog(dir, { now: () => new Date(iso) });

    log.write("info", "before");
    iso = "2026-09-03T00:00:01.000Z";
    log.write("info", "after");

    expect(readdirSync(dir).sort()).toEqual(["slopify-2026-09-02.log", "slopify-2026-09-03.log"]);
  });

  it("redacts anything shaped like a provider key", () => {
    const dir = logsDir();
    const log = openLog(dir, fixedClock("2026-09-02T10:00:00.000Z"));

    log.write("error", "provider.error", {
      detail:
        "401 for sk-ant-api03-Zm9vYmFyYmF6cXV1eA and AIzaSyD1234567890abcdefghijklmno (Bearer hf_QWERTYUIOPasdfghjkl)",
    });

    const detail = readFileSync(join(dir, "slopify-2026-09-02.log"), "utf8");
    expect(detail).not.toContain("Zm9vYmFyYmF6cXV1eA");
    expect(detail).not.toContain("AIzaSyD1234567890abcdefghijklmno");
    expect(detail).not.toContain("QWERTYUIOPasdfghjkl");
    expect(JSON.parse(detail).detail).toContain("[redacted]");
  });

  // Every prefix a provider in the catalogue issues, in values no provider ever handed
  // out: only the shape matters, and a shape the redactor misses is a key in a log file.
  it("redacts the prefixes this build's providers use", () => {
    const dir = logsDir();
    const log = openLog(dir, fixedClock("2026-09-02T10:00:00.000Z"));

    log.write("error", "provider.error", {
      detail: [
        "sk-or-v1-000000000000000000",
        "sk_1111111111111111111111",
        "sk-proj-2222222222222222222",
        "r8_3333333333333333333333",
      ].join(" "),
    });

    const detail: unknown = JSON.parse(
      readFileSync(join(dir, "slopify-2026-09-02.log"), "utf8"),
    ).detail;
    expect(detail).toBe("[redacted] [redacted] [redacted] [redacted]");
  });

  it("keeps ordinary words that merely start with a key prefix", () => {
    const dir = logsDir();
    const log = openLog(dir, fixedClock("2026-09-02T10:00:00.000Z"));

    log.write("info", "stage.skipped", { detail: "skipped because research was off" });

    const line = readFileSync(join(dir, "slopify-2026-09-02.log"), "utf8");
    expect(JSON.parse(line).detail).toBe("skipped because research was off");
  });
});
