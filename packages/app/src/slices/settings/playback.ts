import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Log } from "../../kernel/log.js";
// The bound and the wire shape of a field error are admission's, and a run's gap is
// validated against the same number the settings page saves: one source, no drift.
import type { FieldError } from "../admission/rules.js";
import { silenceGapSecondsMax } from "../admission/rules.js";
import type { AppSettings } from "./model.js";
import { appearances, defaultSettings } from "./model.js";
import { readSetting, writeSetting } from "./repo.js";

export interface PlaybackDeps {
  readonly db: DatabaseSync;
  readonly log: Log;
}

export type SaveSettingsResult =
  | { readonly ok: true; readonly settings: AppSettings }
  | { readonly ok: false; readonly fields: readonly FieldError[] };

// The `settings` table is key/value, so each setting is its own row and a value the app
// does not understand costs only that one setting.
const silenceGapKey = "silenceGapSeconds";
const appearanceKey = "appearance";

const silenceGapValue = z.number().int().min(0).max(silenceGapSecondsMax);
const appearanceValue = z.enum(appearances);

export function readSettings(deps: PlaybackDeps): AppSettings {
  return {
    silenceGapSeconds: parsed(
      deps,
      silenceGapKey,
      silenceGapValue,
      defaultSettings.silenceGapSeconds,
    ),
    appearance: parsed(deps, appearanceKey, appearanceValue, defaultSettings.appearance),
  };
}

export function saveSettings(deps: PlaybackDeps, settings: AppSettings): SaveSettingsResult {
  const fields: FieldError[] = [];
  if (!silenceGapValue.safeParse(settings.silenceGapSeconds).success) {
    fields.push({
      field: "silenceGapSeconds",
      message: `The silence gap is a whole number of seconds between 0 and ${String(silenceGapSecondsMax)}.`,
    });
  }
  if (!appearanceValue.safeParse(settings.appearance).success) {
    fields.push({ field: "appearance", message: "Pick System, Light or Dark." });
  }
  if (fields.length > 0) {
    return { ok: false, fields };
  }
  writeSetting(deps.db, silenceGapKey, JSON.stringify(settings.silenceGapSeconds));
  writeSetting(deps.db, appearanceKey, JSON.stringify(settings.appearance));
  return { ok: true, settings };
}

// A stored value is JSON, and a hand-edited database is the only way it can be anything
// but what was saved. Such a row falls back to the default and says so in the log rather
// than reaching the app or taking the settings page down.
function parsed<T>(deps: PlaybackDeps, key: string, schema: z.ZodType<T>, fallback: T): T {
  const stored = readSetting(deps.db, key);
  if (stored === undefined) {
    return fallback;
  }
  const result = schema.safeParse(jsonOf(stored));
  if (result.success) {
    return result.data;
  }
  deps.log.write("warn", "settings.invalid", {
    detail: `setting ${key} is not a value this build understands; using the default`,
  });
  return fallback;
}

function jsonOf(stored: string): unknown {
  try {
    return JSON.parse(stored);
  } catch {
    // Not JSON at all: the same answer as JSON of the wrong shape, decided by the caller.
    return undefined;
  }
}
