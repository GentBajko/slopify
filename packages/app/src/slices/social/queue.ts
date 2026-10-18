import type { DatabaseSync } from "node:sqlite";
import { platformLabels, type SocialPlatform } from "./model.js";
import { type PostRecord, postsIn, writeProgress } from "./repo.js";

// A post waits for the extension at most this long after Fill in <site> was pressed, unless
// its site has no scheduler and it waits for its release time (`due.ts`).
export const waitingMs = 24 * 60 * 60 * 1000;

// Posts left waiting longer than a day stop waiting, with the sentence that says why.
export function expireWaiting(
  db: DatabaseSync,
  now: Date,
  waitsForRelease: (post: PostRecord) => boolean,
): void {
  for (const post of postsIn(db, ["waiting"])) {
    if (waitsForRelease(post)) continue;
    const age = now.getTime() - Date.parse(post.waitingAt ?? "");
    if (Number.isFinite(age) && age <= waitingMs) continue;
    const site = platformLabels[post.platform];
    writeProgress(
      db,
      post,
      {
        ...post,
        state: "failed",
        message: `Fill in ${site} waited a day without the Slopify Studio extension taking it. Open ${site} in the browser where the extension is paired and allowed to post there, then press Fill in ${site} again.`,
      },
      now,
    );
  }
}

// The oldest waiting post for a site that can be filled now (of `projectId` when the tab Slopify
// opened names one); it becomes "filling" so another tab of the site doesn't take it too.
export function takeNext(
  db: DatabaseSync,
  platform: SocialPlatform,
  now: Date,
  readyNow: (post: PostRecord) => boolean,
  projectId?: string,
): { readonly post: PostRecord; readonly waiting: number } | undefined {
  const waiting = postsIn(db, ["waiting"], platform).filter(
    (post) => (projectId === undefined || post.projectId === projectId) && readyNow(post),
  );
  const [first] = waiting;
  if (first === undefined) return undefined;
  writeProgress(db, first, { ...first, state: "filling", message: null }, now);
  return { post: first, waiting: waiting.length - 1 };
}
