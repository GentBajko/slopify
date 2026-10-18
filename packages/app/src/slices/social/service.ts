import { projectById } from "../admission/repo.js";
import { projectChannelId } from "../channels/repo.js";
import { channelSocial } from "./channel.js";
import { dueAt, readyNow, tooLate, waitsForRelease } from "./due.js";
import { profileUrl } from "./limits.js";
import { lookupDue, lookupStart } from "./links.js";
import {
  type ActivePost,
  type DuePost,
  type LinkLookup,
  type PostPack,
  platformLabels,
  type ReportedState,
  type SocialPlatform,
} from "./model.js";
import { packFor } from "./pack.js";
import { expireWaiting, takeNext } from "./queue.js";
import { postsIn, readPost, writeProgress } from "./repo.js";
import type { SourceDeps } from "./sources.js";
import { askFill, pasteLink, reportFill } from "./state.js";

export type Refused = {
  readonly ok: false;
  readonly status: 404 | 409 | 400;
  readonly sentence: string;
};

const notPosting = (platform: SocialPlatform): Refused => ({
  ok: false,
  status: 404,
  sentence: `This project doesn't post to ${platformLabels[platform]}. Turn ${platformLabels[platform]} on in the post's settings under Prepare upload, or in Edit project → Upload pack.`,
});

// The release time a waiting post fills at, read from its pack.
function releaseOf(deps: SourceDeps, projectId: string, platform: SocialPlatform, now: Date) {
  return packFor(deps, projectId, platform, now)?.schedule.at ?? null;
}

// Fill in <site>: the post waits for the extension (on a site without a scheduler, for its
// release time when that is still ahead).
export function fillPost(
  deps: SourceDeps,
  projectId: string,
  platform: SocialPlatform,
  now: Date,
): { readonly ok: true; readonly pack: PostPack; readonly waitsForRelease: boolean } | Refused {
  const before = packFor(deps, projectId, platform, now);
  if (before === undefined) return notPosting(platform);
  const asked = askFill(readPost(deps.db, { projectId, platform }), platform, now);
  if (!asked.ok) return { ok: false, status: 409, sentence: asked.sentence };
  writeProgress(deps.db, { projectId, platform }, asked.progress, now);
  const pack = packFor(deps, projectId, platform, now) ?? before;
  return {
    ok: true,
    pack,
    waitsForRelease: !readyNow(platform, pack.schedule.at, now),
  };
}

// The person pasted the post's link, or removed it.
export function setPostLink(
  deps: SourceDeps,
  projectId: string,
  platform: SocialPlatform,
  url: string | null,
  now: Date,
): { readonly ok: true } | Refused {
  if (packFor(deps, projectId, platform, now) === undefined) return notPosting(platform);
  const pasted = pasteLink(readPost(deps.db, { projectId, platform }), platform, url, now);
  if (!pasted.ok) return { ok: false, status: 400, sentence: pasted.sentence };
  writeProgress(deps.db, { projectId, platform }, pasted.progress, now);
  return { ok: true };
}

const waits =
  (deps: SourceDeps, now: Date) => (post: { projectId: string; platform: SocialPlatform }) =>
    waitsForRelease(post.platform) &&
    !tooLate(post.platform, releaseOf(deps, post.projectId, post.platform, now), now);

// The extension's next post for a site: the oldest waiting one that can be filled now, of
// `projectId` when the tab Slopify opened names it.
export function nextPost(
  deps: SourceDeps,
  platform: SocialPlatform,
  now: Date,
  projectId?: string,
): ActivePost | undefined {
  expireWaiting(deps.db, now, waits(deps, now));
  for (;;) {
    const taken = takeNext(
      deps.db,
      platform,
      now,
      (post) => readyNow(platform, releaseOf(deps, post.projectId, platform, now), now),
      projectId,
    );
    if (taken === undefined) return undefined;
    const pack = packFor(deps, taken.post.projectId, platform, now);
    if (pack !== undefined) return { pack, waiting: taken.waiting };
    // The project or its post is gone: it stops waiting, and the next one is taken.
    writeProgress(deps.db, taken.post, { ...taken.post, state: "none", waitingAt: null }, now);
  }
}

export function reportPost(
  deps: SourceDeps,
  report: {
    readonly projectId: string;
    readonly platform: SocialPlatform;
    readonly state: ReportedState;
    readonly url?: string | undefined;
    readonly message?: string | undefined;
  },
  now: Date,
): { readonly ok: true; readonly pack: PostPack | undefined } | Refused {
  const { projectId, platform } = report;
  if (projectById(deps.db, projectId) === undefined)
    return {
      ok: false,
      status: 404,
      sentence: "This project no longer exists in Slopify, so nothing was recorded.",
    };
  const reported = reportFill(readPost(deps.db, { projectId, platform }), platform, report, now);
  if (!reported.ok)
    return {
      ok: false,
      status: reported.reason === "bad-link" ? 400 : 409,
      sentence: reported.sentence,
    };
  writeProgress(deps.db, { projectId, platform }, reported.progress, now);
  return { ok: true, pack: packFor(deps, projectId, platform, now) };
}

// Waiting posts on sites without a scheduler whose release is within `horizonMs` (or passed
// at most 12 hours ago), for the extension's alarms.
export function duePosts(deps: SourceDeps, now: Date, horizonMs: number): readonly DuePost[] {
  return postsIn(deps.db, ["waiting"]).flatMap((post) => {
    const pack = packFor(deps, post.projectId, post.platform, now);
    const due =
      pack === undefined ? undefined : dueAt(post.platform, pack.schedule.at, now, horizonMs);
    return pack === undefined || due === undefined
      ? []
      : [
          {
            projectId: post.projectId,
            projectTitle: pack.projectTitle,
            platform: post.platform,
            at: due.at,
            late: due.late,
            composeUrl: pack.composeUrl,
          },
        ];
  });
}

// Filled or scheduled posts without their link, once they should be on the site, with the
// profile page to find them on (the channel's account there).
export function linksToFind(deps: SourceDeps, now: Date): readonly LinkLookup[] {
  return postsIn(deps.db, ["filled", "scheduled"]).flatMap((post) => {
    const pack = packFor(deps, post.projectId, post.platform, now);
    if (pack === undefined || !lookupDue(post, pack.schedule.at, now)) return [];
    const { accounts } = channelSocial(deps.db, projectChannelId(deps.db, post.projectId));
    const profile = profileUrl(post.platform, accounts);
    return profile === null || pack.text.trim() === ""
      ? []
      : [
          {
            projectId: post.projectId,
            platform: post.platform,
            profileUrl: profile,
            start: lookupStart(pack.text),
          },
        ];
  });
}
