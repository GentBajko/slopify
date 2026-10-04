import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { readSetting, writeSetting } from "../settings/repo.js";
import { studioFillQueuePrefix, studioPairing } from "./settings.js";

// What Fill in YouTube Studio chose, waiting for the extension: one entry per video or short,
// oldest first. Each new upload dialog in Studio is filled from the first entry, which then
// leaves the queue, so preparing several shorts in a row fills them one upload at a time.
// Kept in the settings table under the current pairing (`studio.fillQueue.<token hash>`), so a
// restart keeps it and a new pairing token starts with nothing waiting. An entry older than
// `fillQueueMs` is dropped as stale.

export const fillQueueMs = 24 * 60 * 60 * 1000;
// More would be a list nobody works through; the oldest leave first.
export const fillQueueMax = 50;

export interface FillEntry {
  readonly projectId: string;
  // null is the long video.
  readonly short: number | null;
  readonly at: string;
}

const entrySchema = z.object({
  projectId: z.string().min(1).max(64),
  short: z.number().int().min(1).max(99).nullable(),
  at: z.string(),
});

function queueKey(db: DatabaseSync): string {
  const hash = createHash("sha256").update(studioPairing(db).token).digest("hex").slice(0, 16);
  return `${studioFillQueuePrefix}${hash}`;
}

function write(db: DatabaseSync, key: string, entries: readonly FillEntry[]): void {
  if (entries.length === 0) db.prepare("DELETE FROM settings WHERE key = ?").run(key);
  else writeSetting(db, key, JSON.stringify(entries));
}

// The waiting entries, oldest first, without the stale ones.
export function readFillQueue(db: DatabaseSync, now: Date): readonly FillEntry[] {
  const stored = readSetting(db, queueKey(db));
  if (stored === undefined) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(stored);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((one) => {
    const parsed = entrySchema.safeParse(one);
    if (!parsed.success) return [];
    const age = now.getTime() - Date.parse(parsed.data.at);
    return Number.isFinite(age) && age <= fillQueueMs ? [parsed.data] : [];
  });
}

const same = (entry: FillEntry, projectId: string, short: number | null) =>
  entry.projectId === projectId && entry.short === short;

// Adds an item at the end; one already waiting keeps its place.
export function enqueueFill(
  db: DatabaseSync,
  projectId: string,
  short: number | null,
  now: Date,
): readonly FillEntry[] {
  const key = queueKey(db);
  const current = readFillQueue(db, now);
  if (current.some((entry) => same(entry, projectId, short))) {
    write(db, key, current);
    return current;
  }
  const next = [...current, { projectId, short, at: now.toISOString() }].slice(-fillQueueMax);
  write(db, key, next);
  return next;
}

// Takes an item out: filled by the extension, or removed by the person.
export function removeFill(
  db: DatabaseSync,
  projectId: string,
  short: number | null,
  now: Date,
): readonly FillEntry[] {
  const next = readFillQueue(db, now).filter((entry) => !same(entry, projectId, short));
  write(db, queueKey(db), next);
  return next;
}

// The popup's Upload or Upload all: only these wait, in this order, and anything left from an
// earlier pick is dropped, so Studio's upload dialogs never take more than was asked for.
export function fillOnly(
  db: DatabaseSync,
  items: readonly { readonly projectId: string; readonly short: number | null }[],
  now: Date,
): readonly FillEntry[] {
  const next = items
    .slice(0, fillQueueMax)
    .map((item) => ({ projectId: item.projectId, short: item.short, at: now.toISOString() }));
  write(db, queueKey(db), next);
  return next;
}
