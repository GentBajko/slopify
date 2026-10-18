// What doesn't fit a site, as plain sentences with the fix. A warning never blocks a fill: the
// site itself has the last word, and the person may know better. Pure.

import { limitsFor, nativeSchedule } from "./limits.js";
import {
  type PostMedia,
  type PostSchedule,
  type PostWarning,
  platformLabels,
  type RedditFields,
  type SocialPlatform,
  type XTier,
  xTierLabels,
} from "./model.js";

function duration(seconds: number): string {
  const whole = Math.round(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = whole % 60;
  const parts = [
    ...(hours > 0 ? [`${String(hours)} h`] : []),
    ...(minutes > 0 ? [`${String(minutes)} min`] : []),
    ...(rest > 0 || whole === 0 ? [`${String(rest)} s`] : []),
  ];
  return parts.join(" ");
}

export function mediaWarnings(
  platform: SocialPlatform,
  media: readonly PostMedia[],
  tier: XTier,
): readonly PostWarning[] {
  const site = platformLabels[platform];
  const limits = limitsFor(platform, tier);
  const warnings: PostWarning[] = [];
  const videos = media.filter((one) => one.kind === "video" || one.kind === "short");
  const stills = media.length - videos.length;
  if (videos.length > limits.videos)
    warnings.push({
      code: "too-many-videos",
      sentence: `${site} takes one video per post. Keep the video or the short in the post's media, not both.`,
    });
  if (stills > limits.pictures)
    warnings.push({
      code: "too-many-pictures",
      sentence: `${site} takes up to ${String(limits.pictures)} pictures per post; this one has ${String(stills)}. The extension puts in the first ${String(limits.pictures)}; pick fewer in the post's media to choose which.`,
    });
  if (!limits.mixes && videos.length > 0 && stills > 0)
    warnings.push({
      code: "video-and-pictures",
      sentence: `${site} doesn't take a video and pictures in one post. Keep either the video or the pictures in the post's media.`,
    });
  for (const video of videos) {
    if (video.seconds === undefined || video.seconds <= limits.videoSeconds) continue;
    const tierHint =
      platform === "x" && tier === "free"
        ? ` If the channel's X account has Premium, set it in Channels → Brand → Posting.`
        : "";
    warnings.push({
      code: "video-too-long",
      sentence: `${platform === "x" ? `X ${xTierLabels[tier]}` : site} takes videos up to ${duration(limits.videoSeconds)}; this one is ${duration(video.seconds)}. Post a short instead, or the link to the video.${tierHint}`,
    });
  }
  if ((platform === "tiktok" || platform === "instagram") && media.length === 0)
    warnings.push({
      code: "no-media",
      sentence: `${site} posts need a video or pictures. Pick a short or pictures in the post's media.`,
    });
  if (platform === "tiktok" && videos.some((one) => one.kind === "video" && one.shape === "16:9"))
    warnings.push({
      code: "full-video",
      sentence:
        "TikTok shows a 16:9 video small, between bars. Pick a short (9:16) in the post's media.",
    });
  return warnings;
}

export function redditWarnings(fields: RedditFields): readonly PostWarning[] {
  const warnings: PostWarning[] = [];
  if (fields.subreddit === "")
    warnings.push({
      code: "subreddit-missing",
      sentence:
        "The subreddit isn't set, so Reddit will ask where to post. Type it in the post's Subreddit box (like videos, without r/).",
    });
  if (fields.title.trim() === "")
    warnings.push({
      code: "title-missing",
      sentence: "Reddit posts need a title. Type one in the post's Title box.",
    });
  return warnings;
}

// When the post goes out, from the YouTube item it carries: the site's scheduler at the release
// time, the extension filling it at release time on a site without one, or now.
export function scheduleFor(
  platform: SocialPlatform,
  releaseAt: string | null,
  now: Date,
): { readonly schedule: PostSchedule; readonly warnings: readonly PostWarning[] } {
  const site = platformLabels[platform];
  if (releaseAt === null)
    return {
      schedule: { mode: "now", at: null },
      warnings: [
        {
          code: "no-release",
          sentence: `This project has no release time, so the post goes out when you press Post on ${site}. Give it a time in the project's Release block to post with the video.`,
        },
      ],
    };
  const at = Date.parse(releaseAt);
  const ahead = at - now.getTime();
  if (!Number.isFinite(at) || ahead <= 0)
    return {
      schedule: { mode: "now", at: releaseAt },
      warnings: [
        {
          code: "release-past",
          sentence: `The release time has passed, so the post goes out when you press Post on ${site}.`,
        },
      ],
    };
  const window = nativeSchedule[platform];
  if (window === undefined)
    return { schedule: { mode: "at-release", at: releaseAt }, warnings: [] };
  if (ahead < window.minMs || ahead > window.maxMs)
    return {
      schedule: { mode: "now", at: releaseAt },
      warnings: [
        {
          code: "release-outside-window",
          sentence: `${site} schedules posts only ${duration(window.minMs / 1000)} to ${String(Math.round(window.maxMs / 86_400_000))} days ahead, so the extension leaves it to post now. Fill it in again when the release time is within that window, or press Post at the release time.`,
        },
      ],
    };
  return { schedule: { mode: "native", at: releaseAt }, warnings: [] };
}
