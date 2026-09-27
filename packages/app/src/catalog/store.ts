import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import type { ProviderFamily } from "../kernel/ports/model.js";
import { isLocalCliProvider } from "../slices/settings/model.js";
import {
  applyOpenRouterListing,
  type CatalogueChanges,
  catalogueFamilies,
  combineChanges,
  mergeCatalogue,
  modelKey,
  noChanges,
  type OpenRouterListing,
} from "./merge.js";
import { type Catalogue, type CatalogueModel, catalogueSchema, isVideoModel } from "./schema.js";

export const catalogueSource =
  "https://raw.githubusercontent.com/GentBajko/slopify/main/packages/app/src/assets/models.yaml";
// OpenRouter's public model list: live ids and per-token prices, no key needed.
export const openRouterModelsSource = "https://openrouter.ai/api/v1/models";
// How often the automatic check runs; it also runs once at every start.
export const catalogueCheckIntervalMs = 24 * 60 * 60 * 1000;
export interface CatalogueSyncStatus {
  // When the last automatic or manual check finished; null before the first one.
  readonly checkedAt: string | null;
  // What that check changed in the local file.
  readonly changes: CatalogueChanges;
  // Why the last check could not finish, in words the user can act on.
  readonly warning: string | null;
}
export interface CatalogueStore {
  readonly read: () => Catalogue;
  // The image family leaves out the image-to-video models, which `videoModelsOf` lists.
  readonly models: (provider: string, family: ProviderFamily) => readonly CatalogueModel[];
  readonly refresh: () => Promise<void>;
  // The automatic check: folds the published catalogue and OpenRouter's live list into the
  // local file (see mergeCatalogue) and records what changed.
  readonly sync?: () => Promise<CatalogueSyncStatus>;
  // Whether a day has passed since the last check.
  readonly syncDue?: (now: number) => boolean;
  readonly status: () => {
    updatedAt: string;
    path: string;
    warning: string | null;
    source: string;
    sync?: CatalogueSyncStatus;
  };
}
export function parseCatalogue(text: string): Catalogue {
  if (Buffer.byteLength(text) > 1024 * 1024) throw new Error("Model catalogue exceeds 1 MB");
  const parsed = catalogueSchema.parse(parse(text, { maxAliasCount: 20, uniqueKeys: true }));
  return {
    ...parsed,
    providers: Object.fromEntries(
      Object.entries(parsed.providers).filter(([id]) => !isLocalCliProvider(id)),
    ),
    llm: parsed.llm.filter((row) => !isLocalCliProvider(row.provider)),
    image: parsed.image.filter((row) => !isLocalCliProvider(row.provider)),
    tts: parsed.tts.filter((row) => !isLocalCliProvider(row.provider)),
  };
}
export function createCatalogueStore(deps: {
  readonly dataDir: string;
  readonly fetch: typeof globalThis.fetch;
  readonly bundled?: string;
  readonly now?: () => Date;
}): CatalogueStore {
  const path = join(deps.dataDir, "models.yaml");
  const bundled =
    deps.bundled ?? readFileSync(new URL("../assets/models.yaml", import.meta.url), "utf8");
  let current = parseCatalogue(bundled);
  mkdirSync(deps.dataDir, { recursive: true, mode: 0o700 });
  if (!existsSync(path)) writeFileSync(path, bundled, { mode: 0o600, flag: "wx" });
  let stamp = "";
  let warning: string | null = null;
  let refreshing: Promise<void> | undefined;
  let syncing: Promise<CatalogueSyncStatus> | undefined;
  const syncPath = join(deps.dataDir, "models-sync.json");
  const now = deps.now ?? (() => new Date());
  function read(): Catalogue {
    try {
      const file = statSync(path);
      const next = `${file.mtimeMs}:${file.size}`;
      if (next !== stamp) {
        stamp = next;
        if (file.size > 1024 * 1024) throw new Error("Oversized catalogue");
        current = parseCatalogue(readFileSync(path, "utf8"));
        warning = null;
      }
    } catch {
      warning =
        "Your models.yaml file is missing or has a mistake, so Slopify is still using the last working model list. Fix the file, or use Replace with published file in Settings → Models.";
    }
    return current;
  }
  async function download(url: string, maxBytes: number): Promise<string> {
    const response = await deps.fetch(url, {
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
    if (!response.ok) throw new Error(`Catalogue update answered ${response.status}`);
    if (!response.body) throw new Error("Empty catalogue response");
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = response.body.getReader();
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > maxBytes) throw new Error("Download is too large");
        chunks.push(next.value);
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  async function refresh(): Promise<void> {
    const text = await download(catalogueSource, 1024 * 1024);
    const next = parseCatalogue(text);
    mkdirSync(deps.dataDir, { recursive: true, mode: 0o700 });
    // A manual refresh replaces the local catalogue; retain the previous text for recovery.
    if (existsSync(path)) writeFileSync(`${path}.previous`, readFileSync(path), { mode: 0o600 });
    writeFileSync(`${path}.next`, text, { mode: 0o600 });
    renameSync(`${path}.next`, path);
    current = next;
    stamp = "";
    warning = null;
    read();
  }
  function readSync(): SyncFile {
    try {
      const parsed: unknown = JSON.parse(readFileSync(syncPath, "utf8"));
      if (isSyncFile(parsed)) return parsed;
    } catch {
      // Absent or damaged: the first check starts from the bundled list below.
    }
    return { checkedAt: null, known: null, changes: noChanges, warning: null };
  }
  function writeSync(value: SyncFile): void {
    writeFileSync(`${syncPath}.next`, JSON.stringify(value), { mode: 0o600 });
    renameSync(`${syncPath}.next`, syncPath);
  }
  async function openRouterListing(): Promise<readonly OpenRouterListing[]> {
    try {
      return parseOpenRouterListing(
        JSON.parse(await download(openRouterModelsSource, 16 * 1024 * 1024)),
      );
    } catch {
      // Optional: the published catalogue still carries OpenRouter's curated prices.
      return [];
    }
  }
  async function sync(): Promise<CatalogueSyncStatus> {
    const saved = readSync();
    const local = read();
    if (warning !== null) {
      // Never overwrite a file the user is in the middle of fixing.
      writeSync({ ...saved, warning });
      return { checkedAt: saved.checkedAt, changes: saved.changes, warning };
    }
    let published: Catalogue;
    try {
      published = parseCatalogue(await download(catalogueSource, 1024 * 1024));
    } catch {
      const failed =
        "Slopify could not download the latest model list, so it is still using the one it has. Check your internet connection, then choose Check now in Settings → Models.";
      writeSync({ ...saved, warning: failed });
      return { checkedAt: saved.checkedAt, changes: saved.changes, warning: failed };
    }
    // Before the first check the models shipped with this version count as published, so a
    // model the user added to the file is never mistaken for a retired one.
    const known = new Set(saved.known ?? keysOf(parseCatalogue(bundled)));
    const merged = mergeCatalogue(local, published, known);
    const live = applyOpenRouterListing(merged.catalogue, await openRouterListing());
    const changes = combineChanges(merged.changes, live.changes);
    const text = `${syncedHeader}${stringify(live.catalogue, { aliasDuplicateObjects: false })}`;
    const next = parseCatalogue(text);
    if (JSON.stringify(next) !== JSON.stringify(local)) {
      if (existsSync(path)) writeFileSync(`${path}.previous`, readFileSync(path), { mode: 0o600 });
      writeFileSync(`${path}.next`, text, { mode: 0o600 });
      renameSync(`${path}.next`, path);
      current = next;
      stamp = "";
      read();
    }
    const status = { checkedAt: now().toISOString(), changes, warning: null };
    writeSync({ ...status, known: [...merged.known].sort() });
    return status;
  }
  return {
    sync: () => {
      syncing ??= sync().finally(() => {
        syncing = undefined;
      });
      return syncing;
    },
    syncDue: (at) => {
      const last = readSync().checkedAt;
      return last === null || at - Date.parse(last) >= catalogueCheckIntervalMs;
    },
    read,
    models: (provider, family) =>
      read()[family].filter(
        (m) => m.provider === provider && m.enabled && !m.deprecated && !isVideoModel(m),
      ),
    status: () => {
      const saved = readSync();
      return {
        updatedAt: read().updatedAt,
        path,
        warning,
        source: catalogueSource,
        sync: { checkedAt: saved.checkedAt, changes: saved.changes, warning: saved.warning },
      };
    },
    refresh: () => {
      refreshing ??= refresh().finally(() => {
        refreshing = undefined;
      });
      return refreshing;
    },
  };
}

const syncedHeader =
  "# Slopify's model list, kept up to date automatically from the published catalogue.\n" +
  "# Your edits are kept; retired models stay listed with deprecated: true.\n";

interface SyncFile extends CatalogueSyncStatus {
  // Every model the published catalogue has listed, so one that disappears can be told apart
  // from one the user added; null before the first check.
  readonly known: readonly string[] | null;
}
function isSyncFile(value: unknown): value is SyncFile {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  const changes = row.changes as Record<string, unknown> | undefined;
  return (
    (row.checkedAt === null || typeof row.checkedAt === "string") &&
    (row.known === null || Array.isArray(row.known)) &&
    (row.warning === null || typeof row.warning === "string") &&
    typeof changes === "object" &&
    changes !== null &&
    Array.isArray(changes.added) &&
    Array.isArray(changes.retired) &&
    Array.isArray(changes.priced)
  );
}
function keysOf(catalogue: Catalogue): string[] {
  return catalogueFamilies.flatMap((family) =>
    catalogue[family].map((row) => modelKey(family, row.provider, row.id)),
  );
}

// `{ data: [{ id, pricing: { prompt, completion } }] }`, prices in USD per token as strings.
// Rows that do not read cleanly are skipped; a negative price means "varies" and is ignored.
export function parseOpenRouterListing(value: unknown): readonly OpenRouterListing[] {
  if (typeof value !== "object" || value === null) return [];
  const data = (value as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  const price = (raw: unknown): number | undefined => {
    const number = typeof raw === "string" || typeof raw === "number" ? Number(raw) : Number.NaN;
    return Number.isFinite(number) && number >= 0 ? number : undefined;
  };
  const rows: OpenRouterListing[] = [];
  for (const row of data) {
    if (typeof row !== "object" || row === null) continue;
    const { id, pricing } = row as { id?: unknown; pricing?: unknown };
    if (typeof id !== "string" || id === "") continue;
    const prices = typeof pricing === "object" && pricing !== null ? pricing : {};
    rows.push({
      id,
      promptPerToken: price((prices as { prompt?: unknown }).prompt),
      completionPerToken: price((prices as { completion?: unknown }).completion),
    });
  }
  return rows;
}
