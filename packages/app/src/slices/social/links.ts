import type { PostProgress } from "./state.js";

// How long after a post went out the extension looks it up on the person's profile, and for
// how long it keeps looking.
export const lookupAfterMs = 10 * 60 * 1000;
export const lookupForMs = 7 * 24 * 60 * 60 * 1000;
export const lookupStartLength = 40;

// A filled or scheduled post without its link, once it should be on the site.
export function lookupDue(progress: PostProgress, releaseAt: string | null, now: Date): boolean {
  if (progress.url !== null) return false;
  if (progress.state !== "filled" && progress.state !== "scheduled") return false;
  const from = Date.parse(
    progress.state === "scheduled" && releaseAt !== null ? releaseAt : (progress.filledAt ?? ""),
  );
  if (!Number.isFinite(from)) return false;
  const since = now.getTime() - from;
  return since >= lookupAfterMs && since <= lookupForMs;
}

// The post's first characters, as the profile page shows them, to find it among its posts.
export function lookupStart(text: string): string {
  return [...text.replace(/\s+/gu, " ").trim()].slice(0, lookupStartLength).join("");
}
