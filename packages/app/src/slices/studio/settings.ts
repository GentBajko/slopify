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

export function readStudioPlaylist(db: DatabaseSync): string | null {
  const stored = readSetting(db, studioPlaylistKey);
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

export function saveStudioPlaylist(db: DatabaseSync, raw: string): string | null {
  const value = raw.trim();
  if (value === "") {
    db.prepare("DELETE FROM settings WHERE key = ?").run(studioPlaylistKey);
    return null;
  }
  writeSetting(db, studioPlaylistKey, JSON.stringify(value));
  return value;
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

export function resetStudioPairing(db: DatabaseSync): StudioPairingView {
  const pairing: StudioPairingView = {
    token: randomBytes(24).toString("base64url"),
    origin: null,
    pairedAt: null,
  };
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
