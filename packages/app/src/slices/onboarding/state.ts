import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { readSetting, writeSetting } from "../settings/repo.js";
import type { SampleId } from "./model.js";

// What the first five minutes remember, in the settings table: whether the first-run screen
// was dismissed, which project is the bundled sample, and which library rows each installed
// starter pack became. None of these keys is in a portable backup's settings, so another
// install decides its own first run.

export const dismissedKey = "onboarding.dismissed";
export const sampleKey = "onboarding.sample";
export const packsKey = "onboarding.packs";
export const shortRequestsKey = "onboarding.short-requests";

const sampleRecord = z.object({
  projectId: z.string(),
  seededAt: z.string(),
});
export type SampleRecord = z.infer<typeof sampleRecord>;

const packRecord = z.object({
  installedAt: z.string(),
  prompts: z.record(z.string(), z.string()),
  voice: z.string().optional(),
  template: z.string().optional(),
});
export type PackRecord = z.infer<typeof packRecord>;
const packRecords = z.record(z.string(), packRecord);

// A request id → the project it started, so a repeated "Make a 60-second short" (a double
// click, a retried request) returns the same project instead of starting another.
const shortRequests = z.record(z.string(), z.string());
// ceiling: only a retry of a recent click needs its answer.
const shortRequestsKept = 20;

function readJson<T>(db: DatabaseSync, key: string, schema: z.ZodType<T>): T | undefined {
  const raw = readSetting(db, key);
  if (raw === undefined) return undefined;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function firstRunDismissed(db: DatabaseSync): boolean {
  return readSetting(db, dismissedKey) !== undefined;
}

export function dismissFirstRun(db: DatabaseSync, at: string): void {
  if (!firstRunDismissed(db)) writeSetting(db, dismissedKey, at);
}

// Each bundled sample is remembered on its own ("The Library of Alexandria" under the key it
// always had), so a demo added in a later version is seeded once on an install that already
// has the first.
const sampleKeyOf = (id: SampleId): string => (id === "library" ? sampleKey : `${sampleKey}.${id}`);

export function readSampleRecord(
  db: DatabaseSync,
  id: SampleId = "library",
): SampleRecord | undefined {
  return readJson(db, sampleKeyOf(id), sampleRecord);
}

export function writeSampleRecord(
  db: DatabaseSync,
  record: SampleRecord,
  id: SampleId = "library",
): void {
  writeSetting(db, sampleKeyOf(id), JSON.stringify(record));
}

export function readPackRecords(db: DatabaseSync): Readonly<Record<string, PackRecord>> {
  return readJson(db, packsKey, packRecords) ?? {};
}

export function writePackRecord(db: DatabaseSync, packId: string, record: PackRecord): void {
  writeSetting(db, packsKey, JSON.stringify({ ...readPackRecords(db), [packId]: record }));
}

export function shortRequestProject(db: DatabaseSync, requestId: string): string | undefined {
  return readJson(db, shortRequestsKey, shortRequests)?.[requestId];
}

export function recordShortRequest(db: DatabaseSync, requestId: string, projectId: string): void {
  const kept = Object.entries(readJson(db, shortRequestsKey, shortRequests) ?? {}).slice(
    -(shortRequestsKept - 1),
  );
  writeSetting(
    db,
    shortRequestsKey,
    JSON.stringify(Object.fromEntries([...kept, [requestId, projectId]])),
  );
}
