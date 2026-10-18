import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { readJsonSetting, writeSetting } from "../settings/repo.js";
import { studioPairing } from "../studio/settings.js";
import { type PostingExtension, type SocialPlatform, socialPlatforms } from "./model.js";

const sitesKey = "social.extensionSites";
const stored = z.object({ sites: z.array(z.enum(socialPlatforms)), at: z.string() });

// The sites the extension says it may post on, as it last reported them.
export function writeExtensionSites(
  db: DatabaseSync,
  sites: readonly SocialPlatform[],
  now: Date,
): void {
  writeSetting(db, sitesKey, JSON.stringify({ sites: [...new Set(sites)], at: now.toISOString() }));
}

export function postingExtension(db: DatabaseSync): PostingExtension {
  const seen = readJsonSetting(db, sitesKey, stored, undefined);
  return {
    paired: studioPairing(db).origin !== null,
    sites: seen?.sites ?? null,
    seenAt: seen?.at ?? null,
  };
}
