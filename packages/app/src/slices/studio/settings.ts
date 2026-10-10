import { randomBytes, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { readSetting, writeSetting } from "../settings/repo.js";
import {
  type PlaylistUse,
  playlistUses,
  type StudioPairingView,
  type StudioPlaylist,
  studioPlaylistMax,
} from "./model.js";

// Rows of the key/value `settings` table. The playlists travel with a backup; the
// pairing stays on this machine (`slices/storage/portable.ts`): its token is what lets the
// browser extension read a project's upload pack.
export const studioPlaylistKey = "studio.playlist";
export const studioPairingKey = "studio.pairing";

const pairingSchema = z.object({
  token: z.string().min(20),
  origin: z.string().nullable(),
  pairedAt: z.string().nullable(),
});

// A channel's own playlists are a row of their own, `studio.playlist.<channelId>`; a channel
// without one uses the default list above. Each playlist is ticked by default or not; a
// project's Prepare upload can change which it goes into. A row saved before lists existed
// holds one name, read as one playlist ticked by default.
export const studioChannelPlaylistPrefix = `${studioPlaylistKey}.`;

function playlistKey(channelId: string | undefined): string {
  return channelId === undefined ? studioPlaylistKey : `${studioChannelPlaylistPrefix}${channelId}`;
}

// Up to 20 playlists a list: Studio's own dialog shows every playlist of the channel, and a
// video in more than a handful of them is rare.
export const studioPlaylistsMax = 20;

export const studioPlaylistSchema = z.object({
  name: z.string().trim().min(1).max(studioPlaylistMax),
  byDefault: z.boolean(),
  for: z.enum(playlistUses).optional(),
});
// What a row holds: the list, or the one name a row held before lists.
export const storedPlaylistsSchema = z.union([
  z.string().max(studioPlaylistMax),
  z.array(studioPlaylistSchema).max(studioPlaylistsMax),
]);

// The playlists a channel's upload packs offer: the channel's own list, else the default.
// Without a channel, the default alone.
export function readStudioPlaylists(db: DatabaseSync, channelId?: string): StudioPlaylist[] {
  if (channelId !== undefined) {
    const own = storedPlaylists(db, playlistKey(channelId));
    if (own !== null) return own;
  }
  return storedPlaylists(db, studioPlaylistKey) ?? [];
}

// Every channel's own list, by channel id.
export function readChannelPlaylists(db: DatabaseSync): Record<string, StudioPlaylist[]> {
  const prefix = studioChannelPlaylistPrefix;
  const rows = db
    .prepare("SELECT key FROM settings WHERE substr(key, 1, ?) = ? ORDER BY key")
    .all(prefix.length, prefix) as { key: string }[];
  const out: Record<string, StudioPlaylist[]> = {};
  for (const { key } of rows) {
    const value = storedPlaylists(db, key);
    if (value !== null) out[key.slice(prefix.length)] = value;
  }
  return out;
}

function storedPlaylists(db: DatabaseSync, key: string): StudioPlaylist[] | null {
  const stored = readSetting(db, key);
  if (stored === undefined) return null;
  try {
    const parsed = storedPlaylistsSchema.safeParse(JSON.parse(stored));
    if (!parsed.success) return null;
    if (typeof parsed.data === "string")
      return parsed.data.trim() === "" ? null : [{ name: parsed.data.trim(), byDefault: true }];
    return parsed.data.length === 0 ? null : parsed.data;
  } catch {
    return null;
  }
}

// Why a list can't be saved, in words for Settings → YouTube Studio; undefined when it can.
export function studioPlaylistsProblem(list: readonly StudioPlaylist[]): string | undefined {
  const long = list.find((one) => one.name.trim().length > studioPlaylistMax);
  if (long !== undefined)
    return `The playlist name "${long.name.slice(0, 40)}…" is longer than YouTube allows (${String(studioPlaylistMax)} characters). Shorten it in Settings → YouTube Studio.`;
  const seen = new Set<string>();
  for (const one of list) {
    const key = one.name.trim().toLowerCase();
    if (seen.has(key))
      return `"${one.name.trim()}" is listed twice. Remove one in Settings → YouTube Studio.`;
    seen.add(key);
  }
  return undefined;
}

// Saves the default list, or a channel's own; an empty list clears it (the channel then uses
// the default again). Blank names are dropped.
export function saveStudioPlaylists(
  db: DatabaseSync,
  list: readonly StudioPlaylist[],
  channelId?: string,
): StudioPlaylist[] {
  const value = list
    .map((one) => ({
      name: one.name.trim(),
      byDefault: one.byDefault,
      // "all" is the default, so a list that never narrows stays as it was saved.
      ...(one.for === undefined || one.for === "all" ? {} : { for: one.for }),
    }))
    .filter((one) => one.name !== "");
  const key = playlistKey(channelId);
  if (value.length === 0) {
    db.prepare("DELETE FROM settings WHERE key = ?").run(key);
    return [];
  }
  writeSetting(db, key, JSON.stringify(value));
  return value;
}

// The playlists a project's uploads go into, when its Prepare upload changed them from the
// channel's defaults: one row, project id to names.
export const studioProjectPlaylistsKey = "studio.projectPlaylists";
export const storedProjectPlaylistsSchema = z.record(
  z.string().max(64),
  z.array(z.string().max(studioPlaylistMax)).max(studioPlaylistsMax),
);

function projectChoices(db: DatabaseSync): Record<string, string[]> {
  const stored = readSetting(db, studioProjectPlaylistsKey);
  if (stored === undefined) return {};
  try {
    const parsed = storedProjectPlaylistsSchema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

// The channel's playlists, each ticked as this project goes into it: the project's own choice
// when it made one (a playlist the channel no longer lists is dropped), else the defaults.
export function projectPlaylists(
  db: DatabaseSync,
  projectId: string,
  channelId?: string,
): { readonly name: string; readonly chosen: boolean; readonly for: PlaylistUse }[] {
  const list = readStudioPlaylists(db, channelId);
  const own = projectChoices(db)[projectId];
  return list.map((one) => ({
    name: one.name,
    for: one.for ?? "all",
    chosen:
      own === undefined
        ? one.byDefault
        : own.some((name) => name.toLowerCase() === one.name.toLowerCase()),
  }));
}

export function saveProjectPlaylists(
  db: DatabaseSync,
  projectId: string,
  names: readonly string[] | null,
): void {
  const { [projectId]: _previous, ...others } = projectChoices(db);
  const next = names === null ? others : { ...others, [projectId]: [...names] };
  if (Object.keys(next).length === 0)
    db.prepare("DELETE FROM settings WHERE key = ?").run(studioProjectPlaylistsKey);
  else writeSetting(db, studioProjectPlaylistsKey, JSON.stringify(next));
}

// The projects whose uploaded clips are real footage (filmed, not generated): ticked in the
// project's Prepare upload, under AI use. One row holding their ids; YouTube's second AI use
// case is footage of a real event or place altered by AI (`disclosure.ts`).
export const studioRealFootageKey = "studio.realFootage";
// "on" or "off": whether the extension posts and pins each video's comment once it is public.
export const autoCommentKey = "studio.autoComment";

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
