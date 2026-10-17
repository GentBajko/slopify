import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { deleteSetting, readJsonSetting, writeSetting } from "../settings/repo.js";
import { notificationUrlProblem } from "./address.js";

// Its own row in the key/value `settings` table. Backups leave it out
// (`slices/storage/portable.ts`): an ntfy topic in the URL is as good as a password.
export const notificationUrlKey = "notificationUrl";

export type SaveNotificationUrlResult =
  | { readonly ok: true; readonly url: string | null }
  | { readonly ok: false; readonly message: string };

export function readNotificationUrl(db: DatabaseSync): string | null {
  const value = readJsonSetting(db, notificationUrlKey, z.unknown(), null);
  // A hand-edited row that no longer passes the rules is treated as not set rather than
  // POSTed to.
  return typeof value === "string" && value !== "" && notificationUrlProblem(value) === undefined
    ? value
    : null;
}

export function saveNotificationUrl(db: DatabaseSync, raw: string): SaveNotificationUrlResult {
  const problem = notificationUrlProblem(raw);
  if (problem !== undefined) return { ok: false, message: problem };
  const url = raw.trim();
  if (url === "") {
    deleteSetting(db, notificationUrlKey);
    return { ok: true, url: null };
  }
  writeSetting(db, notificationUrlKey, JSON.stringify(url));
  return { ok: true, url };
}
