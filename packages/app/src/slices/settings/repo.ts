import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { ProviderId, Voice } from "./model.js";
import { providerIds } from "./model.js";

// SQLITE_CONSTRAINT_UNIQUE. The extended result code node:sqlite puts on the error it
// throws when a UNIQUE index rejects a row.
const uniqueConstraint = 2067;

const keyRow = z.object({ key: z.string() });
const providerRow = z.object({ provider: z.enum(providerIds) });
// A row naming a provider this build does not know can only come from a hand-edited
// database or a downgrade. Parsing throws rather than hiding a voice the user saved.
const voiceRow = z.object({
  id: z.string(),
  provider: z.enum(providerIds),
  name: z.string(),
  voice_id: z.string(),
});
const settingRow = z.object({ value: z.string() });

export function upsertKey(
  db: DatabaseSync,
  provider: ProviderId,
  key: string,
  updatedAt: string,
): void {
  db.prepare(
    "INSERT INTO provider_keys (provider, key, updated_at) VALUES (?, ?, ?)" +
      " ON CONFLICT(provider) DO UPDATE SET key = excluded.key, updated_at = excluded.updated_at",
  ).run(provider, key, updatedAt);
}

export function deleteKey(db: DatabaseSync, provider: ProviderId): boolean {
  const result = db.prepare("DELETE FROM provider_keys WHERE provider = ?").run(provider);
  return Number(result.changes) > 0;
}

// The one place a key value leaves the database. Every caller reads it for a single
// provider call and holds it no longer (`logic/02` §Q16). Nothing under `edge/` calls
// this: a route asks the two functions below, which never select the `key` column.
export function keyOf(db: DatabaseSync, provider: ProviderId): string | undefined {
  const row = db.prepare("SELECT key FROM provider_keys WHERE provider = ?").get(provider);
  return row === undefined ? undefined : keyRow.parse(row).key;
}

// Presence without values: what readiness needs, in one statement.
export function keyedProviders(db: DatabaseSync): ReadonlySet<ProviderId> {
  const rows = db.prepare("SELECT provider FROM provider_keys").all();
  return new Set(rows.map((row) => providerRow.parse(row).provider));
}

export function hasKey(db: DatabaseSync, provider: ProviderId): boolean {
  return db.prepare("SELECT 1 FROM provider_keys WHERE provider = ?").get(provider) !== undefined;
}

export function insertVoice(db: DatabaseSync, voice: Voice): void {
  db.prepare("INSERT INTO voices (id, provider, name, voice_id) VALUES (?, ?, ?, ?)").run(
    voice.id,
    voice.provider,
    voice.name,
    voice.voiceId,
  );
}

export function listVoices(db: DatabaseSync): readonly Voice[] {
  return db
    .prepare("SELECT id, provider, name, voice_id FROM voices ORDER BY provider, name, voice_id")
    .all()
    .map((row) => toVoice(voiceRow.parse(row)));
}

export function deleteVoice(db: DatabaseSync, id: string): boolean {
  return Number(db.prepare("DELETE FROM voices WHERE id = ?").run(id).changes) > 0;
}

export function readSetting(db: DatabaseSync, key: string): string | undefined {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row === undefined ? undefined : settingRow.parse(row).value;
}

export function writeSetting(db: DatabaseSync, key: string, value: string): void {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?)" +
      " ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

export function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Error && "errcode" in error && error.errcode === uniqueConstraint;
}

function toVoice(row: z.infer<typeof voiceRow>): Voice {
  return { id: row.id, provider: row.provider, name: row.name, voiceId: row.voice_id };
}
