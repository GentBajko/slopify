import type { DatabaseSync } from "node:sqlite";
import type { Clock } from "../../kernel/clock.js";
import type { KeyProbe, KeyProbes } from "../../kernel/ports/key-probe.js";
import type { ProviderFamily } from "../../kernel/ports/model.js";
import { keyWithShared } from "../settings/keys.js";
import { type ProviderId, providerById } from "../settings/model.js";
import { probeRead } from "../settings/probe-read.js";
import { accountOf, writeListed } from "./repo.js";

// "Listed for you": which of Slopify's models the person's own key or CLI lists. Free reads
// only - a model list, or a model's own page - so it runs whenever a picker opens.

export interface ListingDeps {
  readonly db: DatabaseSync;
  readonly clock: Clock;
  readonly fetch: typeof globalThis.fetch;
  readonly probes: KeyProbes;
  // The catalogue's live models for a keyed provider, image-to-video ones included.
  readonly known: (provider: ProviderId, family: ProviderFamily) => readonly string[];
  // What a CLI says it offers (its own model list).
  readonly cliModels: (provider: ProviderId, family: ProviderFamily) => Promise<readonly string[]>;
}

export type ListingOutcome =
  | { readonly kind: "listed"; readonly listed: number; readonly of: number }
  | { readonly kind: "skipped"; readonly reason: "no-key" | "no-list" | "unreadable" };

// ceiling: a list longer than this many pages is read no further.
const maxPages = 10;

async function liveList(
  deps: ListingDeps,
  probe: KeyProbe,
  key: string,
): Promise<ReadonlySet<string> | undefined> {
  const list = probe.list;
  if (list === undefined) return undefined;
  const ids = new Set<string>();
  let page: string | undefined;
  for (let n = 0; n < maxPages; n += 1) {
    const answer = await probeRead(deps.fetch, list.url(page), probe.headers(key), true);
    if (answer === undefined || answer.status < 200 || answer.status >= 300) return undefined;
    const read = list.read(answer.body);
    if (read === undefined) return undefined;
    for (const id of read.ids) ids.add(id);
    if (read.next === undefined) break;
    page = read.next;
  }
  return ids;
}

// One read per model's own page: found, missing, or (no answer) left as it was.
async function modelPages(
  deps: ListingDeps,
  probe: KeyProbe,
  key: string,
  models: readonly string[],
): Promise<Map<string, boolean>> {
  const found = new Map<string, boolean>();
  const model = probe.model;
  if (model === undefined) return found;
  for (const id of models) {
    const answer = await probeRead(deps.fetch, model.url(id), probe.headers(key), false);
    if (answer === undefined) continue;
    if (answer.status >= 200 && answer.status < 300) found.set(id, true);
    else if (answer.status === 404) found.set(id, false);
  }
  return found;
}

export async function listedFor(deps: ListingDeps, provider: ProviderId): Promise<ListingOutcome> {
  const { family, auth } = providerById(provider);
  if (auth === "local") return { kind: "skipped", reason: "no-list" };
  const account = accountOf(deps.db, provider);
  if (account === undefined) return { kind: "skipped", reason: "no-key" };
  let models: Map<string, boolean>;
  if (auth === "cli") {
    let ids: readonly string[];
    try {
      ids = await deps.cliModels(provider, family);
    } catch {
      return { kind: "skipped", reason: "unreadable" };
    }
    models = new Map(ids.map((id) => [id, true]));
  } else {
    const probe = Object.hasOwn(deps.probes, provider) ? deps.probes[provider] : undefined;
    const key = keyWithShared(deps.db, provider);
    if (key === undefined) return { kind: "skipped", reason: "no-key" };
    const known = deps.known(provider, family);
    if (probe?.list !== undefined) {
      const live = await liveList(deps, probe, key);
      if (live === undefined) return { kind: "skipped", reason: "unreadable" };
      models = new Map(known.map((id) => [id, live.has(id)]));
    } else if (probe?.model !== undefined && probe.model.lists === undefined) {
      models = await modelPages(deps, probe, key, known);
    } else return { kind: "skipped", reason: "no-list" };
  }
  writeListed(deps.db, {
    provider,
    family,
    account,
    at: deps.clock.now().toISOString(),
    models,
  });
  return {
    kind: "listed",
    listed: [...models.values()].filter(Boolean).length,
    of: models.size,
  };
}

// ceiling: a provider's list is read at most this often for the same key or login, however
// many pickers open; a key saved, a CLI added or Check models forces a new read.
export const listingFreshMs = 6 * 60 * 60_000;

export interface Listing {
  readonly refresh: (provider: ProviderId, force?: boolean) => Promise<ListingOutcome | undefined>;
}

export function createListing(deps: ListingDeps): Listing {
  const last = new Map<ProviderId, { readonly account: string; readonly at: number }>();
  const running = new Map<ProviderId, Promise<ListingOutcome>>();
  return {
    refresh: (provider, force = false) => {
      const inFlight = running.get(provider);
      if (inFlight !== undefined) return inFlight;
      const account = accountOf(deps.db, provider);
      const seen = last.get(provider);
      const now = deps.clock.now().getTime();
      if (
        !force &&
        seen !== undefined &&
        seen.account === account &&
        now - seen.at < listingFreshMs
      )
        return Promise.resolve(undefined);
      const started = listedFor(deps, provider)
        .then((outcome) => {
          if (account !== undefined) last.set(provider, { account, at: now });
          return outcome;
        })
        .finally(() => running.delete(provider));
      running.set(provider, started);
      return started;
    },
  };
}
