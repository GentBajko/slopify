import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import type { ProviderFamily } from "../kernel/ports/model.js";
import { type Catalogue, type CatalogueModel, catalogueSchema } from "./schema.js";

export const catalogueSource =
  "https://raw.githubusercontent.com/GentBajko/slopify/main/packages/app/src/assets/models.yaml";
export interface CatalogueStore {
  readonly read: () => Catalogue;
  readonly models: (provider: string, family: ProviderFamily) => readonly CatalogueModel[];
  readonly refresh: () => Promise<void>;
  readonly status: () => {
    updatedAt: string;
    path: string;
    warning: string | null;
    source: string;
  };
}
export function parseCatalogue(text: string): Catalogue {
  if (Buffer.byteLength(text) > 1024 * 1024) throw new Error("Model catalogue exceeds 1 MB");
  return catalogueSchema.parse(parse(text, { maxAliasCount: 20, uniqueKeys: true }));
}
export function createCatalogueStore(deps: {
  readonly dataDir: string;
  readonly fetch: typeof globalThis.fetch;
  readonly bundled?: string;
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
        "Your models.yaml is unavailable or invalid. The last valid catalogue is still in use.";
    }
    return current;
  }
  async function refresh(): Promise<void> {
    const response = await deps.fetch(catalogueSource, {
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
        if (size > 1024 * 1024) throw new Error("Catalogue exceeds 1 MB");
        chunks.push(next.value);
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    const text = Buffer.concat(chunks).toString("utf8");
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
  return {
    read,
    models: (provider, family) =>
      read()[family].filter((m) => m.provider === provider && m.enabled && !m.deprecated),
    status: () => ({ updatedAt: read().updatedAt, path, warning, source: catalogueSource }),
    refresh: () => {
      refreshing ??= refresh().finally(() => {
        refreshing = undefined;
      });
      return refreshing;
    },
  };
}
