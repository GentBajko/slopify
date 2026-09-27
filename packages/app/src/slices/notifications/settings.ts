import type { DatabaseSync } from "node:sqlite";
import { readSetting, writeSetting } from "../settings/repo.js";
import { notificationUrlProblem } from "./rules.js";

// Its own row in the key/value `settings` table. Backups leave it out
// (`slices/storage/portable.ts`): an ntfy topic in the URL is as good as a password.
export const notificationUrlKey = "notificationUrl";

export type SaveNotificationUrlResult =
  | { readonly ok: true; readonly url: string | null }
  | { readonly ok: false; readonly message: string };

export function readNotificationUrl(db: DatabaseSync): string | null {
  const stored = readSetting(db, notificationUrlKey);
  if (stored === undefined) return null;
  let value: unknown;
  try {
    value = JSON.parse(stored);
  } catch {
    return null;
  }
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
    db.prepare("DELETE FROM settings WHERE key = ?").run(notificationUrlKey);
    return { ok: true, url: null };
  }
  writeSetting(db, notificationUrlKey, JSON.stringify(url));
  return { ok: true, url };
}
