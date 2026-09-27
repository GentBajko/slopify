import type { Catalogue, CatalogueModel } from "./schema.js";

// What an automatic catalogue check found. Every change is reported, none is applied to a
// template, schedule, draft or project: a retired model is only flagged.
export const catalogueFamilies = ["llm", "image", "tts"] as const;
export type CatalogueFamily = (typeof catalogueFamilies)[number];
export interface CatalogueModelRef {
  readonly family: CatalogueFamily;
  readonly provider: string;
  readonly id: string;
  readonly name: string;
}
export interface CataloguePriceChange extends CatalogueModelRef {
  readonly before: CatalogueModel["pricing"];
  readonly after: CatalogueModel["pricing"];
}
export interface CatalogueChanges {
  readonly added: readonly CatalogueModelRef[];
  readonly retired: readonly CatalogueModelRef[];
  readonly priced: readonly CataloguePriceChange[];
}
export const noChanges: CatalogueChanges = { added: [], retired: [], priced: [] };

export function modelKey(family: CatalogueFamily, provider: string, id: string): string {
  return `${family}:${provider}:${id}`;
}

function ref(family: CatalogueFamily, model: CatalogueModel): CatalogueModelRef {
  return { family, provider: model.provider, id: model.id, name: model.name };
}

function samePricing(a: CatalogueModel["pricing"], b: CatalogueModel["pricing"]): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (key === "note") continue;
    const x = a[key as keyof typeof a];
    const y = b[key as keyof typeof b];
    // A price read back from per-token figures differs from the curated one only in rounding.
    if (typeof x === "number" && typeof y === "number") {
      if (Math.abs(x - y) > 1e-9 * Math.max(1, Math.abs(x), Math.abs(y))) return false;
    } else if (x !== y) return false;
  }
  return true;
}

// Folds the published catalogue into the local one instead of replacing it:
// - a published model replaces the local row (prices, names, capabilities), except that a model
//   the user switched off stays off and a speech model keeps its local character limit, which
//   decides how narration is split and so what existing projects count as up to date;
// - a published model the local file lacks is added;
// - a local model that was published before and no longer is, or that the published file marks
//   deprecated, is kept and marked deprecated, so pickers hide it and the places that use it can
//   be listed; a model the user added themselves (never published) is left alone.
export function mergeCatalogue(
  local: Catalogue,
  published: Catalogue,
  knownPublished: ReadonlySet<string>,
): {
  readonly catalogue: Catalogue;
  readonly changes: CatalogueChanges;
  readonly known: ReadonlySet<string>;
} {
  const added: CatalogueModelRef[] = [];
  const retired: CatalogueModelRef[] = [];
  const priced: CataloguePriceChange[] = [];
  const known = new Set(knownPublished);
  const merge = <T extends CatalogueModel>(
    family: CatalogueFamily,
    localRows: readonly T[],
    publishedRows: readonly T[],
  ): T[] => {
    const localByKey = new Map(
      localRows.map((row) => [modelKey(family, row.provider, row.id), row]),
    );
    const publishedKeys = new Set<string>();
    const rows: T[] = [];
    for (const row of publishedRows) {
      const key = modelKey(family, row.provider, row.id);
      publishedKeys.add(key);
      known.add(key);
      const before = localByKey.get(key);
      if (before === undefined) {
        added.push(ref(family, row));
        rows.push(row);
        continue;
      }
      let next: T = before.enabled ? row : { ...row, enabled: false };
      if ("tts" in before && "tts" in next)
        next = { ...next, tts: { ...next.tts, maxCharacters: before.tts.maxCharacters } };
      if (!before.deprecated && next.deprecated) retired.push(ref(family, next));
      if (!samePricing(before.pricing, next.pricing))
        priced.push({ ...ref(family, next), before: before.pricing, after: next.pricing });
      rows.push(next);
    }
    for (const row of localRows) {
      const key = modelKey(family, row.provider, row.id);
      if (publishedKeys.has(key)) continue;
      if (knownPublished.has(key) && !row.deprecated) {
        retired.push(ref(family, row));
        rows.push({ ...row, deprecated: true });
      } else rows.push(row);
    }
    return rows;
  };
  const catalogue: Catalogue = {
    schemaVersion: 1,
    updatedAt: published.updatedAt > local.updatedAt ? published.updatedAt : local.updatedAt,
    providers: { ...local.providers, ...published.providers },
    llm: merge("llm", local.llm, published.llm),
    image: merge("image", local.image, published.image),
    tts: merge("tts", local.tts, published.tts),
  };
  return { catalogue, changes: { added, retired, priced }, known };
}

// OpenRouter publishes its live model list and per-token prices without a key. Its prices
// replace the catalogue's for the OpenRouter models Slopify lists, and a listed model OpenRouter
// no longer serves is marked deprecated. An empty or unreadable answer changes nothing.
export interface OpenRouterListing {
  readonly id: string;
  readonly promptPerToken?: number | undefined;
  readonly completionPerToken?: number | undefined;
}
export function applyOpenRouterListing(
  catalogue: Catalogue,
  listing: readonly OpenRouterListing[],
): { readonly catalogue: Catalogue; readonly changes: CatalogueChanges } {
  if (listing.length === 0) return { catalogue, changes: noChanges };
  const byId = new Map(listing.map((row) => [row.id, row]));
  const retired: CatalogueModelRef[] = [];
  const priced: CataloguePriceChange[] = [];
  const llm = catalogue.llm.map((row) => {
    if (row.provider !== "openrouter" || row.deprecated) return row;
    const live = byId.get(row.id);
    if (live === undefined) {
      retired.push(ref("llm", row));
      return { ...row, deprecated: true };
    }
    const pricing = {
      ...row.pricing,
      ...(live.promptPerToken === undefined
        ? {}
        : { inputPerMillionTokens: perMillion(live.promptPerToken) }),
      ...(live.completionPerToken === undefined
        ? {}
        : { outputPerMillionTokens: perMillion(live.completionPerToken) }),
    };
    if (samePricing(row.pricing, pricing)) return row;
    priced.push({ ...ref("llm", row), before: row.pricing, after: pricing });
    return { ...row, pricing };
  });
  return { catalogue: { ...catalogue, llm }, changes: { added: [], retired, priced } };
}

function perMillion(perToken: number): number {
  return Math.round(perToken * 1_000_000 * 1_000_000) / 1_000_000;
}

export function combineChanges(a: CatalogueChanges, b: CatalogueChanges): CatalogueChanges {
  const priced = new Map<string, CataloguePriceChange>();
  for (const row of [...a.priced, ...b.priced]) {
    const key = modelKey(row.family, row.provider, row.id);
    const earlier = priced.get(key);
    priced.set(key, earlier === undefined ? row : { ...row, before: earlier.before });
  }
  return {
    added: [...a.added, ...b.added],
    retired: [...a.retired, ...b.retired],
    priced: [...priced.values()],
  };
}
