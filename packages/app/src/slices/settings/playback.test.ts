import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { Log, LogFields, LogLevel } from "../../kernel/log.js";
import { silenceGapSecondsMax } from "../admission/rules.js";
import { defaultLoudness } from "../loudness/model.js";
import type { PlaybackDeps } from "./playback.js";
import { readSettings, saveSettings } from "./playback.js";
import { writeSetting } from "./repo.js";

const clock = fixedClock("2026-09-02T10:00:00.000Z");
const renderDefaults = {
  videoEncoder: "cpu",
  clipEncodeSpeed: "thorough",
  renderPriority: "background",
} as const;

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
    expect(readSettings(harness().deps)).toEqual({
      silenceGapSeconds: 3,
      appearance: "system",
      loudness: defaultLoudness,
      subtitleModel: "fp32",
      ...renderDefaults,
    });
  });

  it("answers with what was saved", () => {
    const { deps } = harness();
    saveSettings(deps, {
      silenceGapSeconds: 0,
      appearance: "dark",
      loudness: defaultLoudness,
      subtitleModel: "fp32",
      ...renderDefaults,
    });

    expect(readSettings(deps)).toEqual({
      silenceGapSeconds: 0,
      appearance: "dark",
      loudness: defaultLoudness,
      subtitleModel: "fp32",
      ...renderDefaults,
    });
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
    saveSettings(deps, {
      silenceGapSeconds: 5,
      appearance: "light",
      loudness: defaultLoudness,
      subtitleModel: "fp32",
      ...renderDefaults,
    });
    writeSetting(deps.db, "appearance", "{");

    expect(readSettings(deps)).toEqual({
      silenceGapSeconds: 5,
      appearance: "system",
      loudness: defaultLoudness,
      subtitleModel: "fp32",
      ...renderDefaults,
    });
  });
});

describe("saveSettings", () => {
  it("stores both values and hands back what it stored", () => {
    const { deps } = harness();

    expect(
      saveSettings(deps, {
        silenceGapSeconds: 7,
        appearance: "light",
        loudness: defaultLoudness,
        subtitleModel: "fp32",
        ...renderDefaults,
      }),
    ).toEqual({
      ok: true,
      settings: {
        silenceGapSeconds: 7,
        appearance: "light",
        loudness: defaultLoudness,
        subtitleModel: "fp32",
        ...renderDefaults,
      },
    });
  });

  it("overwrites a previous save", () => {
    const { deps } = harness();
    saveSettings(deps, {
      silenceGapSeconds: 7,
      appearance: "light",
      loudness: defaultLoudness,
      subtitleModel: "fp32",
      ...renderDefaults,
    });
    saveSettings(deps, {
      silenceGapSeconds: 1,
      appearance: "dark",
      loudness: defaultLoudness,
      subtitleModel: "fp32",
      ...renderDefaults,
    });

    expect(readSettings(deps)).toEqual({
      silenceGapSeconds: 1,
      appearance: "dark",
      loudness: defaultLoudness,
      subtitleModel: "fp32",
      ...renderDefaults,
    });
    expect(deps.db.prepare("SELECT count(*) AS n FROM settings").get()).toEqual({ n: 7 });
  });

  it("refuses a negative gap", () => {
    const { deps } = harness();

    const result = saveSettings(deps, {
      silenceGapSeconds: -1,
      appearance: "system",
      loudness: defaultLoudness,
      subtitleModel: "fp32",
      ...renderDefaults,
    });

    expect(result).toEqual({
      ok: false,
      fields: [{ field: "silenceGapSeconds", message: gapMessage }],
    });
  });

  it("refuses a gap beyond the range", () => {
    const { deps } = harness();

    expect(
      saveSettings(deps, {
        silenceGapSeconds: silenceGapSecondsMax + 1,
        appearance: "system",
        loudness: defaultLoudness,
        subtitleModel: "fp32",
        ...renderDefaults,
      }).ok,
    ).toBe(false);
  });

  it("refuses a fractional gap", () => {
    const { deps } = harness();

    expect(
      saveSettings(deps, {
        silenceGapSeconds: 2.5,
        appearance: "system",
        loudness: defaultLoudness,
        subtitleModel: "fp32",
        ...renderDefaults,
      }).ok,
    ).toBe(false);
  });

  it("refuses an appearance this build does not have", () => {
    const { deps } = harness();

    const result = saveSettings(deps, {
      silenceGapSeconds: 3,
      // @ts-expect-error the route's schema stops this; the rule is the second gate.
      appearance: "sepia",
      loudness: defaultLoudness,
      subtitleModel: "fp32",
      ...renderDefaults,
    });

    expect(result).toEqual({
      ok: false,
      fields: [{ field: "appearance", message: "Choose System, Light or Dark." }],
    });
  });

  it("names every bad field at once", () => {
    const { deps } = harness();

    const result = saveSettings(deps, {
      silenceGapSeconds: -1,
      // @ts-expect-error as above: both fields are wrong, both are reported.
      appearance: "sepia",
      loudness: defaultLoudness,
      subtitleModel: "fp32",
      ...renderDefaults,
    });

    expect(result.ok ? [] : result.fields.map((field) => field.field)).toEqual([
      "silenceGapSeconds",
      "appearance",
    ]);
  });

  it("writes nothing when a field is refused", () => {
    const { deps } = harness();

    saveSettings(deps, {
      silenceGapSeconds: -1,
      appearance: "dark",
      loudness: defaultLoudness,
      subtitleModel: "fp32",
      ...renderDefaults,
    });

    expect(readSettings(deps)).toEqual({
      silenceGapSeconds: 3,
      appearance: "system",
      loudness: defaultLoudness,
      subtitleModel: "fp32",
      ...renderDefaults,
    });
  });
});

describe("the subtitle timing model", () => {
  // A property of this computer's install, not of a project: the most accurate model unless
  // someone picked another one.
  it("is the most accurate model on a fresh install", () => {
    expect(readSettings(harness().deps).subtitleModel).toBe("fp32");
  });

  it("keeps each choice that was saved", () => {
    for (const subtitleModel of ["fp16", "int8", "fp32"] as const) {
      const { deps } = harness();
      saveSettings(deps, { ...readSettings(deps), subtitleModel });
      expect(readSettings(deps).subtitleModel).toBe(subtitleModel);
    }
  });

  it("refuses a model this build does not have, and says where to choose one", () => {
    const { deps } = harness();

    const result = saveSettings(deps, {
      ...readSettings(deps),
      // @ts-expect-error a client from another build can still send it.
      subtitleModel: "fp8",
    });

    expect(result).toEqual({
      ok: false,
      fields: [
        {
          field: "subtitleModel",
          message:
            "Choose Most accurate, Balanced or Smallest in Settings → Production defaults → Subtitle timing model.",
        },
      ],
    });
    expect(readSettings(deps).subtitleModel).toBe("fp32");
  });

  it("falls back to the most accurate model and warns when the stored choice is unknown", () => {
    const { deps, lines } = harness();
    writeSetting(deps.db, "subtitleModel", JSON.stringify("q4"));

    expect(readSettings(deps).subtitleModel).toBe("fp32");
    expect(lines).toEqual([`warn settings.invalid ${storedWarning("subtitleModel")}`]);
  });
});

describe("the render settings", () => {
  // The processor, thorough clips, and renders behind the computer's other programs.
  it("encodes on the processor, thoroughly, in the background on a fresh install", () => {
    expect(readSettings(harness().deps)).toMatchObject(renderDefaults);
  });

  it("keeps each choice that was saved", () => {
    const { deps } = harness();
    const chosen = {
      videoEncoder: "nvidia",
      clipEncodeSpeed: "fast",
      renderPriority: "normal",
    } as const;
    expect(saveSettings(deps, { ...readSettings(deps), ...chosen }).ok).toBe(true);
    expect(readSettings(deps)).toMatchObject(chosen);
  });

  it("refuses values this build does not have, naming where to choose", () => {
    const { deps } = harness();

    const result = saveSettings(deps, {
      ...readSettings(deps),
      // @ts-expect-error a client from another build can still send it.
      videoEncoder: "amd",
      // @ts-expect-error a client from another build can still send it.
      clipEncodeSpeed: "ludicrous",
      // @ts-expect-error a client from another build can still send it.
      renderPriority: "realtime",
    });

    expect(result).toEqual({
      ok: false,
      fields: [
        {
          field: "videoEncoder",
          message:
            "Choose Processor (x264) or NVIDIA graphics card (NVENC) in Settings → Production defaults → Video encoder.",
        },
        {
          field: "clipEncodeSpeed",
          message: "Choose Thorough or Fast in Settings → Production defaults → Clip encoding.",
        },
        {
          field: "renderPriority",
          message:
            "Choose Normal or Background in Settings → Production defaults → Render priority.",
        },
      ],
    });
    expect(readSettings(deps)).toMatchObject(renderDefaults);
  });

  it("falls back to the default and warns when a stored choice is unknown", () => {
    const { deps, lines } = harness();
    writeSetting(deps.db, "videoEncoder", JSON.stringify("amd"));

    expect(readSettings(deps).videoEncoder).toBe("cpu");
    expect(lines).toEqual([`warn settings.invalid ${storedWarning("videoEncoder")}`]);
  });
});

const gapMessage = `Enter a whole number of seconds between 0 and ${String(silenceGapSecondsMax)}.`;

function storedWarning(key: string): string {
  return `setting ${key} is not a value this build understands; using the default`;
}
