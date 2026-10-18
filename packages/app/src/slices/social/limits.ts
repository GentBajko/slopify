// What each site takes, as observed on the site (`checked` is the date, null where it was
// not seen yet and comes from the site's own help pages). Browser-safe.

import type { MediaShape, SocialAccounts, SocialPlatform, XTier } from "./model.js";

export interface PlatformLimits {
  readonly text: number;
  readonly unit: "weighted" | "graphemes" | "characters";
  readonly pictures: number;
  readonly videos: number;
  // Longest video the site takes, in seconds.
  readonly videoSeconds: number;
  // Whether one post may hold a video and pictures together.
  readonly mixes: boolean;
  // The shape pictures are reshaped to, and the shape a video should have.
  readonly pictureShape: MediaShape;
  readonly hashtags: number;
  readonly aiLabel: boolean;
  readonly checked: string | null;
  readonly source: string;
}

const free: PlatformLimits = {
  text: 280,
  unit: "weighted",
  pictures: 4,
  videos: 1,
  videoSeconds: 140,
  mixes: true,
  pictureShape: "original",
  hashtags: 10,
  aiLabel: true,
  checked: null,
  source: "help.x.com: posting limits, video length",
};

const xLimits: Readonly<Record<XTier, PlatformLimits>> = {
  free,
  premium: { ...free, text: 25_000, videoSeconds: 3 * 3600 },
  premium_plus: { ...free, text: 25_000, videoSeconds: 3 * 3600 },
};

const others: Readonly<Record<Exclude<SocialPlatform, "x">, PlatformLimits>> = {
  linkedin: {
    text: 3000,
    unit: "characters",
    pictures: 20,
    videos: 1,
    videoSeconds: 15 * 60,
    mixes: false,
    pictureShape: "original",
    hashtags: 5,
    aiLabel: false,
    checked: null,
    source: "linkedin.com/help: share an update, video specifications",
  },
  instagram: {
    text: 2200,
    unit: "characters",
    pictures: 20,
    videos: 1,
    videoSeconds: 15 * 60,
    mixes: true,
    pictureShape: "4:5",
    hashtags: 30,
    aiLabel: true,
    checked: "2026-10-18",
    source: "Instagram's Create new post dialog (caption counter 0/2,200, crop 4:5)",
  },
  tiktok: {
    text: 4000,
    unit: "characters",
    pictures: 35,
    videos: 1,
    videoSeconds: 60 * 60,
    mixes: false,
    pictureShape: "original",
    hashtags: 10,
    aiLabel: true,
    checked: "2026-10-18",
    source: "TikTok Studio's upload page (60 min videos, 35 photos, 4000 characters)",
  },
  reddit: {
    text: 40_000,
    unit: "characters",
    pictures: 20,
    videos: 1,
    videoSeconds: 15 * 60,
    mixes: false,
    pictureShape: "original",
    hashtags: 0,
    aiLabel: false,
    checked: null,
    source: "reddithelp.com: posting images and videos",
  },
  bluesky: {
    text: 300,
    unit: "graphemes",
    pictures: 4,
    videos: 1,
    videoSeconds: 3 * 60,
    mixes: false,
    pictureShape: "original",
    hashtags: 3,
    aiLabel: false,
    checked: "2026-10-18",
    source: "Bluesky's composer (counter starts at 300); 4 images or one video",
  },
};

export function limitsFor(platform: SocialPlatform, tier: XTier = "free"): PlatformLimits {
  return platform === "x" ? xLimits[tier] : others[platform];
}

// Reddit's title limit.
export const redditTitleMax = 300;
export const subredditPattern = /^[A-Za-z0-9][A-Za-z0-9_]{1,20}$/;

// Sites with their own scheduler, how far ahead it takes a time (ms). The extension sets it to
// the release time; outside the window it leaves "post now" and the pack warns.
export interface ScheduleWindow {
  readonly minMs: number;
  readonly maxMs: number;
  readonly checked: string | null;
}

const minute = 60_000;
const day = 24 * 60 * minute;

export const nativeSchedule: Readonly<Partial<Record<SocialPlatform, ScheduleWindow>>> = {
  x: { minMs: 5 * minute, maxMs: 540 * day, checked: null },
  linkedin: { minMs: 60 * minute, maxMs: 90 * day, checked: null },
  tiktok: { minMs: 15 * minute, maxMs: 10 * day, checked: null },
};

// How long before the release time the extension fills a post on a site without a scheduler,
// and how late it still fills one when the browser was closed.
export const fillBeforeMs = 2 * minute;
export const lateFillMs = 12 * 60 * minute;

// Where each site's post form opens.
export const composeUrls: Readonly<Record<SocialPlatform, string>> = {
  x: "https://x.com/compose/post",
  linkedin: "https://www.linkedin.com/feed/?shareActive=true",
  instagram: "https://www.instagram.com/",
  tiktok: "https://www.tiktok.com/tiktokstudio/upload",
  reddit: "https://www.reddit.com/submit",
  bluesky: "https://bsky.app/",
};

// Reddit's submit page takes the title, text and link in its address.
export function redditSubmitUrl(fields: {
  readonly subreddit: string;
  readonly title: string;
  readonly text?: string | undefined;
  readonly url?: string | undefined;
}): string {
  const query = new URLSearchParams({ title: fields.title });
  if (fields.text !== undefined && fields.text !== "") query.set("text", fields.text);
  if (fields.url !== undefined && fields.url !== "") query.set("url", fields.url);
  const sub = fields.subreddit === "" ? "" : `/r/${encodeURIComponent(fields.subreddit)}`;
  return `https://www.reddit.com${sub}/submit?${query.toString()}`;
}

// A published post's link on each site, as the person pastes it or the extension reads it.
export const linkPatterns: Readonly<Record<SocialPlatform, RegExp>> = {
  x: /^https:\/\/(?:www\.)?(?:x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/status\/\d+(?:[/?#].*)?$/,
  linkedin:
    /^https:\/\/(?:www\.)?linkedin\.com\/(?:feed\/update\/urn:li:[A-Za-z]+:\d+|posts\/[^\s]+)\/?(?:[?#].*)?$/,
  instagram:
    /^https:\/\/(?:www\.)?instagram\.com\/(?:[A-Za-z0-9_.]+\/)?(?:p|reel)\/[A-Za-z0-9_-]+\/?(?:[?#].*)?$/,
  tiktok: /^https:\/\/(?:www\.)?tiktok\.com\/@[A-Za-z0-9_.]+\/(?:video|photo)\/\d+\/?(?:[?#].*)?$/,
  reddit:
    /^https:\/\/(?:www\.|old\.|new\.)?reddit\.com\/r\/[A-Za-z0-9_]+\/comments\/[a-z0-9]+(?:\/[^\s]*)?$/,
  bluesky: /^https:\/\/bsky\.app\/profile\/[^\s/]+\/post\/[a-z0-9]+\/?(?:[?#].*)?$/,
};

export const linkExamples: Readonly<Record<SocialPlatform, string>> = {
  x: "https://x.com/you/status/…",
  linkedin: "https://www.linkedin.com/feed/update/urn:li:activity:…",
  instagram: "https://www.instagram.com/p/…",
  tiktok: "https://www.tiktok.com/@you/video/…",
  reddit: "https://www.reddit.com/r/…/comments/…",
  bluesky: "https://bsky.app/profile/you.bsky.social/post/…",
};

// The account names as the channel stores them, each site's own way of writing one.
export const accountPatterns: Readonly<Record<SocialPlatform, RegExp>> = {
  x: /^@?[A-Za-z0-9_]{1,15}$/,
  linkedin: /^(?:in|company)\/[A-Za-z0-9-_%]{2,100}$/,
  instagram: /^@?[A-Za-z0-9_.]{1,30}$/,
  tiktok: /^@?[A-Za-z0-9_.]{2,24}$/,
  reddit: /^(?:u\/)?[A-Za-z0-9_-]{3,20}$/,
  bluesky: /^@?[A-Za-z0-9.-]{3,253}$/,
};

export const accountExamples: Readonly<Record<SocialPlatform, string>> = {
  x: "@yourname",
  linkedin: "in/your-name",
  instagram: "yourname",
  tiktok: "@yourname",
  reddit: "u/yourname",
  bluesky: "yourname.bsky.social",
};

// The page listing the account's own posts, where the extension finds a post's link.
export function profileUrl(platform: SocialPlatform, accounts: SocialAccounts): string | null {
  const raw = accounts[platform]?.trim() ?? "";
  if (raw === "") return null;
  const bare = raw.replace(/^@/, "").replace(/^u\//, "");
  switch (platform) {
    case "x":
      return `https://x.com/${bare}`;
    case "linkedin":
      return `https://www.linkedin.com/${bare}/recent-activity/all/`;
    case "instagram":
      return `https://www.instagram.com/${bare}/`;
    case "tiktok":
      return `https://www.tiktok.com/@${bare}`;
    case "reddit":
      return `https://www.reddit.com/user/${bare}/submitted/`;
    case "bluesky":
      return `https://bsky.app/profile/${bare}`;
  }
}
