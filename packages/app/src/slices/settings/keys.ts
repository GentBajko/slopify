import type { DatabaseSync } from "node:sqlite";
import type { Clock } from "../../kernel/clock.js";
import type { ProviderId } from "./model.js";
import { providerById } from "./model.js";
import { deleteKey, hasKey, keyOf, upsertKey } from "./repo.js";

export interface KeysDeps {
  readonly db: DatabaseSync;
  readonly clock: Clock;
}

// `logic/02` step 1 says the field shows the key masked and points at
// `mockup/03-settings.md`, which draws it with nothing legible in it; the scenario's own
// invariant is that keys never appear outside a provider call. So the mask is a
// constant: it carries no character of the key and not even its length. Every response
// that reports a stored key reports this string and nothing else about the value.
export const keyMask = "••••••••••••";

export interface KeyStatus {
  readonly provider: ProviderId;
  readonly hasKey: boolean;
  readonly masked: string | null;
}

export function keyStatus(deps: KeysDeps, provider: ProviderId): KeyStatus {
  const stored = hasKey(deps.db, provider);
  return { provider, hasKey: stored, masked: stored ? keyMask : null };
}

export type SaveKeyResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "blank" | "cli-provider" };

export type RemoveKeyResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "absent" | "cli-provider" };

// What a provider call gets. The failure is an ordinary answer, not an exception: an
// attempt that finds no key fails immediately without retries (`logic/02` §Q13).
export type KeyLookup =
  | { readonly ok: true; readonly key: string }
  | { readonly ok: false; readonly reason: "key-missing" | "cli-provider" };

// `logic/02` step 1: trimmed, stored as given, overwriting any previous one. No format
// check and no test call (§Q11, §Q17, §Q18).
export function saveProviderKey(deps: KeysDeps, provider: ProviderId, key: string): SaveKeyResult {
  if (providerById(provider).auth === "cli") {
    return { ok: false, reason: "cli-provider" };
  }
  const trimmed = key.trim();
  if (trimmed === "") {
    return { ok: false, reason: "blank" };
  }
  try {
    upsertKey(deps.db, provider, trimmed, deps.clock.now().toISOString());
  } catch (error) {
    // The only statement in this app whose parameters include a key. node:sqlite names
    // columns and result codes, never bound values, but the error from this one call is
    // rewritten anyway so nothing derived from it can reach a log line or a 500 body.
    throw new Error(`the ${provider} key could not be stored: ${codeOf(error)}`);
  }
  return { ok: true };
}

export function removeProviderKey(deps: KeysDeps, provider: ProviderId): RemoveKeyResult {
  if (providerById(provider).auth === "cli") {
    return { ok: false, reason: "cli-provider" };
  }
  return deleteKey(deps.db, provider) ? { ok: true } : { ok: false, reason: "absent" };
}

// `logic/02` step 7: the key is read at the moment an attempt starts. This reads the row
// every time and hands back a plain string, so an attempt holds the value it started
// with and a save or a remove landing mid-run reaches the next attempt only (§Q16).
export function keyForAttempt(deps: KeysDeps, provider: ProviderId): KeyLookup {
  if (providerById(provider).auth === "cli") {
    return { ok: false, reason: "cli-provider" };
  }
  const key = keyOf(deps.db, provider);
  return key === undefined ? { ok: false, reason: "key-missing" } : { ok: true, key };
}

function codeOf(error: unknown): string {
  if (error instanceof Error && "errcode" in error && typeof error.errcode === "number") {
    return `sqlite error ${String(error.errcode)}`;
  }
  return "sqlite error";
}
