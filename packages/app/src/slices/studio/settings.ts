import { randomBytes, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { readSetting, writeSetting } from "../settings/repo.js";
import { type StudioPairingView, studioPlaylistMax } from "./model.js";

// Two rows of the key/value `settings` table. The playlist travels with a backup; the
// pairing stays on this machine (`slices/storage/portable.ts`): its token is what lets the
// browser extension read a project's upload pack.
export const studioPlaylistKey = "studio.playlist";
export const studioPairingKey = "studio.pairing";

const pairingSchema = z.object({
  token: z.string().min(20),
  origin: z.string().nullable(),
  pairedAt: z.string().nullable(),
});

// A channel's own playlist is a row of its own, `studio.playlist.<channelId>`; a channel
// without one uses the default above.
export const studioChannelPlaylistPrefix = `${studioPlaylistKey}.`;

function playlistKey(channelId: string | undefined): string {
  return channelId === undefined ? studioPlaylistKey : `${studioChannelPlaylistPrefix}${channelId}`;
}

// The playlist an upload pack names: the channel's own, else the default. Without a channel,
// the default alone.
export function readStudioPlaylist(db: DatabaseSync, channelId?: string): string | null {
  if (channelId !== undefined) {
    const own = storedPlaylist(db, playlistKey(channelId));
    if (own !== null) return own;
  }
  return storedPlaylist(db, studioPlaylistKey);
}

// Every channel's own playlist, by channel id.
export function readChannelPlaylists(db: DatabaseSync): Record<string, string> {
  const prefix = studioChannelPlaylistPrefix;
  const rows = db
    .prepare("SELECT key FROM settings WHERE substr(key, 1, ?) = ? ORDER BY key")
    .all(prefix.length, prefix) as { key: string }[];
  const out: Record<string, string> = {};
  for (const { key } of rows) {
    const value = storedPlaylist(db, key);
    if (value !== null) out[key.slice(prefix.length)] = value;
  }
  return out;
}

function storedPlaylist(db: DatabaseSync, key: string): string | null {
  const stored = readSetting(db, key);
  if (stored === undefined) return null;
  try {
    const value: unknown = JSON.parse(stored);
    return typeof value === "string" && value.trim() !== "" ? value : null;
  } catch {
    return null;
  }
}

export function studioPlaylistProblem(raw: string): string | undefined {
  return raw.trim().length > studioPlaylistMax
    ? `The playlist name is longer than YouTube allows (${String(studioPlaylistMax)} characters). Shorten it in Settings → YouTube Studio.`
    : undefined;
}

// Saves the default playlist, or a channel's own; empty clears it (the channel then uses the
// default again).
export function saveStudioPlaylist(
  db: DatabaseSync,
  raw: string,
  channelId?: string,
): string | null {
  const value = raw.trim();
  const key = playlistKey(channelId);
  if (value === "") {
    db.prepare("DELETE FROM settings WHERE key = ?").run(key);
    return null;
  }
  writeSetting(db, key, JSON.stringify(value));
  return value;
}

// The projects whose uploaded clips are real footage (filmed, not generated): ticked in the
// project's Prepare upload, under AI use. One row holding their ids; YouTube's second AI use
// case is footage of a real event or place altered by AI (`disclosure.ts`).
export const studioRealFootageKey = "studio.realFootage";

function realFootageIds(db: DatabaseSync): readonly string[] {
  const stored = readSetting(db, studioRealFootageKey);
  if (stored === undefined) return [];
  try {
    const value: unknown = JSON.parse(stored);
    return Array.isArray(value)
      ? value.filter((one): one is string => typeof one === "string")
      : [];
  } catch {
    return [];
  }
}

export function readRealFootage(db: DatabaseSync, projectId: string): boolean {
  return realFootageIds(db).includes(projectId);
}

export function saveRealFootage(db: DatabaseSync, projectId: string, on: boolean): void {
  const others = realFootageIds(db).filter((one) => one !== projectId);
  const next = on ? [...others, projectId].sort() : others;
  if (next.length === 0) db.prepare("DELETE FROM settings WHERE key = ?").run(studioRealFootageKey);
  else writeSetting(db, studioRealFootageKey, JSON.stringify(next));
}

// The pairing token, made on first read. One per install: a new one (Settings → YouTube
// Studio → New pairing token) forgets the extension that used the old one.
export function studioPairing(db: DatabaseSync): StudioPairingView {
  const stored = readSetting(db, studioPairingKey);
  if (stored !== undefined) {
    try {
      const parsed = pairingSchema.safeParse(JSON.parse(stored));
      if (parsed.success) return parsed.data;
    } catch {
      // A damaged row is replaced below.
    }
  }
  return resetStudioPairing(db);
}

// What is waiting to be filled in Studio is kept per pairing (`queue.ts`): one row,
// `studio.fillQueue.<token hash>`, so a new token starts with nothing waiting.
export const studioFillQueuePrefix = "studio.fillQueue.";

export function resetStudioPairing(db: DatabaseSync): StudioPairingView {
  const pairing: StudioPairingView = {
    token: randomBytes(24).toString("base64url"),
    origin: null,
    pairedAt: null,
  };
  db.prepare("DELETE FROM settings WHERE substr(key, 1, ?) = ?").run(
    studioFillQueuePrefix.length,
    studioFillQueuePrefix,
  );
  writeSetting(db, studioPairingKey, JSON.stringify(pairing));
  return pairing;
}

// A browser extension's own origin: Chrome's and Firefox's. Web pages never match.
export function isExtensionOrigin(origin: string | undefined): origin is string {
  return (
    origin !== undefined && /^(chrome-extension|moz-extension):\/\/[a-z0-9-]{1,64}$/.test(origin)
  );
}

export function tokenMatches(pairing: StudioPairingView, given: string | undefined): boolean {
  if (given === undefined) return false;
  const a = Buffer.from(pairing.token);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

// The token from an `Authorization: Bearer <token>` header.
export function bearerToken(header: string | undefined): string | undefined {
  const match = /^Bearer\s+(\S+)$/.exec(header ?? "");
  return match?.[1];
}

export type PairResult =
  | { readonly ok: true; readonly pairing: StudioPairingView }
  | { readonly ok: false; readonly reason: "bad-token" | "not-an-extension" };

// The extension pairs by sending the token from its own origin; that origin is then the only
// one the app answers across origins, until a new token is made.
export function pairStudioExtension(
  db: DatabaseSync,
  token: string | undefined,
  origin: string | undefined,
  now: Date,
): PairResult {
  const pairing = studioPairing(db);
  if (!tokenMatches(pairing, token)) return { ok: false, reason: "bad-token" };
  if (!isExtensionOrigin(origin)) return { ok: false, reason: "not-an-extension" };
  const next: StudioPairingView = { ...pairing, origin, pairedAt: now.toISOString() };
  writeSetting(db, studioPairingKey, JSON.stringify(next));
  return { ok: true, pairing: next };
}

// Whether a request may read upload packs: the right token, and, when the browser names its
// origin, the paired extension's. A request with no Origin (not from a web page at all) is
// judged on the token alone.
export function studioRequestAllowed(
  db: DatabaseSync,
  token: string | undefined,
  origin: string | undefined,
): boolean {
  const pairing = studioPairing(db);
  if (!tokenMatches(pairing, token)) return false;
  if (origin === undefined) return true;
  return pairing.origin !== null && origin === pairing.origin;
}
