import { fillBeforeMs, lateFillMs, nativeSchedule } from "./limits.js";
import type { SocialPlatform } from "./model.js";

// Sites without a scheduler: Instagram, Bluesky and Reddit. A post asked to fill there before
// its release time waits for it; the extension fills it about two minutes before, and still
// fills one up to twelve hours late when the browser was closed (flagged late).
export function waitsForRelease(platform: SocialPlatform): boolean {
  return nativeSchedule[platform] === undefined;
}

// Whether a waiting post can be filled now: always on a site with a scheduler, and on one
// without when it has no release time or its time is (nearly) here.
export function readyNow(platform: SocialPlatform, releaseAt: string | null, now: Date): boolean {
  if (!waitsForRelease(platform) || releaseAt === null) return true;
  const at = Date.parse(releaseAt);
  return !Number.isFinite(at) || at - fillBeforeMs <= now.getTime();
}

// A waiting post's fill time within the next `horizonMs`, or a late one still worth filling;
// undefined for one that is not due, or too late.
export function dueAt(
  platform: SocialPlatform,
  releaseAt: string | null,
  now: Date,
  horizonMs: number,
): { readonly at: string; readonly late: boolean } | undefined {
  if (!waitsForRelease(platform) || releaseAt === null) return undefined;
  const at = Date.parse(releaseAt);
  if (!Number.isFinite(at)) return undefined;
  const fill = at - fillBeforeMs;
  const from = now.getTime();
  if (at < from - lateFillMs || fill > from + horizonMs) return undefined;
  return { at: new Date(fill).toISOString(), late: at < from };
}

// Whether a post that waits for its release time has outlived it.
export function tooLate(platform: SocialPlatform, releaseAt: string | null, now: Date): boolean {
  if (!waitsForRelease(platform) || releaseAt === null) return false;
  const at = Date.parse(releaseAt);
  return Number.isFinite(at) && at < now.getTime() - lateFillMs;
}
