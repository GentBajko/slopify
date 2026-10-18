import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Log } from "../../kernel/log.js";
import { englishSubtitleModels } from "../../kernel/ports/subtitles.js";
// The bound and the wire shape of a field error are admission's, and a run's gap is
// validated against the same number the settings page saves: one source, no drift.
import type { FieldError } from "../admission/rules.js";
import { silenceGapSecondsMax } from "../admission/rules.js";
import { loudnessFields } from "../loudness/model.js";
import type { AppSettings } from "./model.js";
import { appearances, defaultSettings } from "./model.js";
import { readJsonSetting, writeSetting } from "./repo.js";

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
const loudnessKey = "loudness";
const subtitleModelKey = "subtitleModel";

const silenceGapValue = z.number().int().min(0).max(silenceGapSecondsMax);
const appearanceValue = z.enum(appearances);
const subtitleModelValue = z.enum(englishSubtitleModels);
const loudnessValue = z.object({
  enabled: z.boolean(),
  videoLufs: z.number(),
  audioFilesLufs: z.number(),
});

export function readSettings(deps: PlaybackDeps): AppSettings {
  return {
    silenceGapSeconds: parsed(
      deps,
      silenceGapKey,
      silenceGapValue,
      defaultSettings.silenceGapSeconds,
    ),
    appearance: parsed(deps, appearanceKey, appearanceValue, defaultSettings.appearance),
    loudness: parsed(deps, loudnessKey, loudnessValue, defaultSettings.loudness),
    subtitleModel: parsed(
      deps,
      subtitleModelKey,
      subtitleModelValue,
      defaultSettings.subtitleModel,
    ),
  };
}

export function saveSettings(deps: PlaybackDeps, settings: AppSettings): SaveSettingsResult {
  const fields: FieldError[] = [];
  if (!silenceGapValue.safeParse(settings.silenceGapSeconds).success) {
    fields.push({
      field: "silenceGapSeconds",
      message: `Enter a whole number of seconds between 0 and ${String(silenceGapSecondsMax)}.`,
    });
  }
  if (!appearanceValue.safeParse(settings.appearance).success) {
    fields.push({ field: "appearance", message: "Choose System, Light or Dark." });
  }
  if (!loudnessValue.safeParse(settings.loudness).success) {
    fields.push({ field: "loudness", message: "Choose whether new runs level the volume." });
  } else {
    fields.push(...loudnessFields(settings.loudness));
  }
  if (!subtitleModelValue.safeParse(settings.subtitleModel).success) {
    fields.push({
      field: "subtitleModel",
      message:
        "Choose Most accurate, Balanced or Smallest in Settings → Production defaults → Subtitle timing model.",
    });
  }
  if (fields.length > 0) {
    return { ok: false, fields };
  }
  writeSetting(deps.db, silenceGapKey, JSON.stringify(settings.silenceGapSeconds));
  writeSetting(deps.db, appearanceKey, JSON.stringify(settings.appearance));
  writeSetting(deps.db, loudnessKey, JSON.stringify(settings.loudness));
  writeSetting(deps.db, subtitleModelKey, JSON.stringify(settings.subtitleModel));
  return { ok: true, settings };
}

// A stored value is JSON, and a hand-edited database is the only way it can be anything
// but what was saved. Such a row falls back to the default and says so in the log rather
// than reaching the app or taking the settings page down.
function parsed<T>(deps: PlaybackDeps, key: string, schema: z.ZodType<T>, fallback: T): T {
  return readJsonSetting(deps.db, key, schema, fallback, deps.log);
}
