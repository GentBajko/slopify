import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { providerFamilies } from "../../kernel/ports/model.js";
import {
  isLocalCliProvider,
  type ProviderId,
  providerById,
  sharedKeyOf,
} from "../settings/model.js";
import { readSetting, writeSetting } from "../settings/repo.js";
import {
  type AutoMode,
  autoKey,
  autoModes,
  checkVerdicts,
  type ModelCheckRow,
  type ModelKey,
  verdictSources,
} from "./model.js";
import { type IncomingVerdict, mergeVerdict } from "./rules.js";

const checkRow = z.object({
  provider: z.string(),
  family: z.enum(providerFamilies),
  model: z.string(),
  account: z.string(),
  listed: z.number().nullable(),
  listed_at: z.string().nullable(),
  verdict: z.enum(checkVerdicts).nullable(),
  verdict_source: z.enum(verdictSources).nullable(),
  sentence: z.string().nullable(),
  checked_at: z.string().nullable(),
  cost: z.number(),
  first_works_at: z.string().nullable(),
  notice_seen: z.number(),
});
const generationRow = z.object({ credential_generation: z.string() });

function toRow(raw: unknown): ModelCheckRow {
  const row = checkRow.parse(raw);
  return {
    provider: row.provider,
    family: row.family,
    model: row.model,
    account: row.account,
    listed: row.listed === null ? null : row.listed === 1,
    listedAt: row.listed_at,
    verdict: row.verdict,
    verdictSource: row.verdict_source,
    sentence: row.sentence,
    checkedAt: row.checked_at,
    cost: row.cost,
    firstWorksAt: row.first_works_at,
    noticeSeen: row.notice_seen === 1,
  };
}

export function readChecks(db: DatabaseSync, provider?: string): readonly ModelCheckRow[] {
  const rows =
    provider === undefined
      ? db.prepare("SELECT * FROM model_checks ORDER BY provider, family, model").all()
      : db
          .prepare("SELECT * FROM model_checks WHERE provider = ? ORDER BY family, model")
          .all(provider);
  return rows.map(toRow);
}

function readOne(db: DatabaseSync, key: ModelKey): ModelCheckRow | undefined {
  const raw = db
    .prepare("SELECT * FROM model_checks WHERE provider = ? AND family = ? AND model = ?")
    .get(key.provider, key.family, key.model);
  return raw === undefined ? undefined : toRow(raw);
}

// A row of another key or login is started over before anything is written to it.
function ensure(db: DatabaseSync, key: ModelKey, account: string): ModelCheckRow | undefined {
  const found = readOne(db, key);
  if (found !== undefined && found.account === account) return found;
  db.prepare(
    "INSERT INTO model_checks (provider, family, model, account) VALUES (?, ?, ?, ?)" +
      " ON CONFLICT(provider, family, model) DO UPDATE SET account = excluded.account," +
      " listed = NULL, listed_at = NULL, verdict = NULL, verdict_source = NULL, sentence = NULL," +
      " checked_at = NULL, cost = 0, first_works_at = NULL, notice_seen = 0",
  ).run(key.provider, key.family, key.model, account);
  return undefined;
}

export interface ListedWrite {
  readonly provider: string;
  readonly family: ModelKey["family"];
  readonly account: string;
  readonly at: string;
  // Each catalogue model, and whether the key's live list names it.
  readonly models: ReadonlyMap<string, boolean>;
}

export function writeListed(db: DatabaseSync, write: ListedWrite): void {
  const update = db.prepare(
    "UPDATE model_checks SET listed = ?, listed_at = ? WHERE provider = ? AND family = ? AND model = ?",
  );
  for (const [model, listed] of write.models) {
    ensure(db, { provider: write.provider, family: write.family, model }, write.account);
    update.run(listed ? 1 : 0, write.at, write.provider, write.family, model);
  }
}

export interface VerdictWrite extends ModelKey, IncomingVerdict {
  readonly account: string;
  readonly cost: number;
}

export function writeVerdict(db: DatabaseSync, write: VerdictWrite): ModelCheckRow {
  const previous = ensure(db, write, write.account);
  const merged = mergeVerdict(previous, write);
  const firstWorks =
    previous?.firstWorksAt ?? (merged.verdict === "works" ? merged.checkedAt : null);
  // A model a run already used is no news to the person who chose it.
  const seen =
    (previous?.noticeSeen ?? false) ||
    (previous?.firstWorksAt == null && firstWorks !== null && write.source === "run");
  db.prepare(
    "UPDATE model_checks SET verdict = ?, verdict_source = ?, sentence = ?, checked_at = ?," +
      " cost = cost + ?, first_works_at = ?, notice_seen = ?" +
      " WHERE provider = ? AND family = ? AND model = ?",
  ).run(
    merged.verdict,
    merged.verdictSource,
    merged.sentence,
    merged.checkedAt,
    write.cost,
    firstWorks,
    seen ? 1 : 0,
    write.provider,
    write.family,
    write.model,
  );
  const stored = readOne(db, write);
  if (stored === undefined) throw new Error("model_checks row vanished during its write");
  return stored;
}

export function markNoticesSeen(db: DatabaseSync, keys: readonly ModelKey[] | "all"): void {
  if (keys === "all") {
    db.prepare("UPDATE model_checks SET notice_seen = 1 WHERE first_works_at IS NOT NULL").run();
    return;
  }
  const update = db.prepare(
    "UPDATE model_checks SET notice_seen = 1 WHERE provider = ? AND family = ? AND model = ?",
  );
  for (const key of keys) update.run(key.provider, key.family, key.model);
}

// Whose models a row describes. A keyed provider's is its key's generation (a new key starts
// over), the shared key's for Gemini speech without its own; a CLI's and the system voice's is
// the provider itself, since the CLI's login is not Slopify's to tell apart. Undefined: no key.
export function accountOf(db: DatabaseSync, provider: ProviderId): string | undefined {
  if (isLocalCliProvider(provider) || providerById(provider).auth !== "key") return provider;
  const generation = (id: ProviderId): string | undefined => {
    const raw = db
      .prepare("SELECT credential_generation FROM provider_keys WHERE provider = ?")
      .get(id);
    return raw === undefined
      ? undefined
      : `${id}:${generationRow.parse(raw).credential_generation}`;
  };
  const shared = sharedKeyOf[provider];
  return generation(provider) ?? (shared === undefined ? undefined : generation(shared));
}

export function readAuto(db: DatabaseSync): AutoMode {
  const value = readSetting(db, autoKey);
  return autoModes.find((mode) => mode === value) ?? "free";
}

export function writeAuto(db: DatabaseSync, mode: AutoMode): void {
  writeSetting(db, autoKey, mode);
}
