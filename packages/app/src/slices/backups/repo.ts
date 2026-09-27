import type { DatabaseSync } from "node:sqlite";
import { readSetting, writeSetting } from "../settings/repo.js";
import {
  type BackupConfig,
  type BackupStatus,
  backupStatusSchema,
  configKey,
  defaultConfig,
  emptyStatus,
  statusKey,
  storedConfigSchema,
} from "./model.js";

// A value this build cannot read (hand-edited, or written by a newer Slopify) falls back to
// the default rather than stopping the app; the next save writes a good one.
export function readConfig(db: DatabaseSync, fallbackTimeZone: string): BackupConfig {
  const parsed = storedConfigSchema.safeParse(parseJson(readSetting(db, configKey)));
  return parsed.success ? parsed.data : defaultConfig(fallbackTimeZone);
}

export function writeConfig(db: DatabaseSync, config: BackupConfig): void {
  writeSetting(db, configKey, JSON.stringify(storedConfigSchema.parse(config)));
}

export function readStatus(db: DatabaseSync): BackupStatus {
  const parsed = backupStatusSchema.safeParse(parseJson(readSetting(db, statusKey)));
  return parsed.success ? parsed.data : emptyStatus;
}

export function writeStatus(db: DatabaseSync, status: BackupStatus): void {
  writeSetting(db, statusKey, JSON.stringify(backupStatusSchema.parse(status)));
}

function parseJson(value: string | undefined): unknown {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
