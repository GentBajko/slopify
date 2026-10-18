import type { DatabaseSync } from "node:sqlite";
import { readJsonSetting, writeSetting } from "../settings/repo.js";
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
  return readJsonSetting(db, configKey, storedConfigSchema, defaultConfig(fallbackTimeZone));
}

export function writeConfig(db: DatabaseSync, config: BackupConfig): void {
  writeSetting(db, configKey, JSON.stringify(storedConfigSchema.parse(config)));
}

export function readStatus(db: DatabaseSync): BackupStatus {
  return readJsonSetting(db, statusKey, backupStatusSchema, emptyStatus);
}

export function writeStatus(db: DatabaseSync, status: BackupStatus): void {
  writeSetting(db, statusKey, JSON.stringify(backupStatusSchema.parse(status)));
}
