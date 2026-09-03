import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { Log, LogFields, LogLevel } from "../../kernel/log.js";
import { silenceGapSecondsMax } from "../admission/rules.js";
import type { PlaybackDeps } from "./playback.js";
import { readSettings, saveSettings } from "./playback.js";
import { writeSetting } from "./repo.js";

const clock = fixedClock("2026-09-02T10:00:00.000Z");

interface Harness {
  readonly deps: PlaybackDeps;
  readonly lines: string[];
}

function harness(): Harness {
  const db: DatabaseSync = openDb(":memory:");
  migrate(db, clock);
  const lines: string[] = [];
  const log: Log = {
    write: (level: LogLevel, event: string, fields?: LogFields): void => {
      lines.push(`${level} ${event} ${fields?.detail ?? ""}`);
    },
  };
  return { deps: { db, log }, lines };
}

describe("readSettings", () => {
  // Three seconds of silence, and the System theme.
  it("answers with the defaults on a fresh install", () => {
    expect(readSettings(harness().deps)).toEqual({ silenceGapSeconds: 3, appearance: "system" });
  });

  it("answers with what was saved", () => {
    const { deps } = harness();
    saveSettings(deps, { silenceGapSeconds: 0, appearance: "dark" });

    expect(readSettings(deps)).toEqual({ silenceGapSeconds: 0, appearance: "dark" });
  });

  // Only a hand-edited database can hold these. The settings page keeps working.
  it("falls back to the default and warns when a stored value is not JSON", () => {
    const { deps, lines } = harness();
    writeSetting(deps.db, "silenceGapSeconds", "three");

    expect(readSettings(deps).silenceGapSeconds).toBe(3);
    expect(lines).toEqual([`warn settings.invalid ${storedWarning("silenceGapSeconds")}`]);
  });

  it("falls back to the default and warns when a stored value is out of range", () => {
    const { deps, lines } = harness();
    writeSetting(deps.db, "silenceGapSeconds", JSON.stringify(silenceGapSecondsMax + 1));

    expect(readSettings(deps).silenceGapSeconds).toBe(3);
    expect(lines).toHaveLength(1);
  });

  it("falls back to the default and warns when the appearance is not one this build knows", () => {
    const { deps, lines } = harness();
    writeSetting(deps.db, "appearance", JSON.stringify("sepia"));

    expect(readSettings(deps).appearance).toBe("system");
    expect(lines).toEqual([`warn settings.invalid ${storedWarning("appearance")}`]);
  });

  // One row per setting, so a broken gap costs the gap and not the theme.
  it("keeps the other setting when one row is unreadable", () => {
    const { deps } = harness();
    saveSettings(deps, { silenceGapSeconds: 5, appearance: "light" });
    writeSetting(deps.db, "appearance", "{");

    expect(readSettings(deps)).toEqual({ silenceGapSeconds: 5, appearance: "system" });
  });
});

describe("saveSettings", () => {
  it("stores both values and hands back what it stored", () => {
    const { deps } = harness();

    expect(saveSettings(deps, { silenceGapSeconds: 7, appearance: "light" })).toEqual({
      ok: true,
      settings: { silenceGapSeconds: 7, appearance: "light" },
    });
  });

  it("overwrites a previous save", () => {
    const { deps } = harness();
    saveSettings(deps, { silenceGapSeconds: 7, appearance: "light" });
    saveSettings(deps, { silenceGapSeconds: 1, appearance: "dark" });

    expect(readSettings(deps)).toEqual({ silenceGapSeconds: 1, appearance: "dark" });
    expect(deps.db.prepare("SELECT count(*) AS n FROM settings").get()).toEqual({ n: 2 });
  });

  it("refuses a negative gap", () => {
    const { deps } = harness();

    const result = saveSettings(deps, { silenceGapSeconds: -1, appearance: "system" });

    expect(result).toEqual({
      ok: false,
      fields: [{ field: "silenceGapSeconds", message: gapMessage }],
    });
  });

  it("refuses a gap beyond the range", () => {
    const { deps } = harness();

    expect(
      saveSettings(deps, { silenceGapSeconds: silenceGapSecondsMax + 1, appearance: "system" }).ok,
    ).toBe(false);
  });

  it("refuses a fractional gap", () => {
    const { deps } = harness();

    expect(saveSettings(deps, { silenceGapSeconds: 2.5, appearance: "system" }).ok).toBe(false);
  });

  it("refuses an appearance this build does not have", () => {
    const { deps } = harness();

    const result = saveSettings(deps, {
      silenceGapSeconds: 3,
      // @ts-expect-error the route's schema stops this; the rule is the second gate.
      appearance: "sepia",
    });

    expect(result).toEqual({
      ok: false,
      fields: [{ field: "appearance", message: "Pick System, Light or Dark." }],
    });
  });

  it("names every bad field at once", () => {
    const { deps } = harness();

    const result = saveSettings(deps, {
      silenceGapSeconds: -1,
      // @ts-expect-error as above: both fields are wrong, both are reported.
      appearance: "sepia",
    });

    expect(result.ok ? [] : result.fields.map((field) => field.field)).toEqual([
      "silenceGapSeconds",
      "appearance",
    ]);
  });

  it("writes nothing when a field is refused", () => {
    const { deps } = harness();

    saveSettings(deps, { silenceGapSeconds: -1, appearance: "dark" });

    expect(readSettings(deps)).toEqual({ silenceGapSeconds: 3, appearance: "system" });
  });
});

const gapMessage = `The silence gap is a whole number of seconds between 0 and ${String(silenceGapSecondsMax)}.`;

function storedWarning(key: string): string {
  return `setting ${key} is not a value this build understands; using the default`;
}
