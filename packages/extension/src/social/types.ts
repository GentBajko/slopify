// The posts as the Slopify app sends them (`packages/app/src/slices/social/model.ts`). Kept here
// as a copy rather than imported, so the extension builds on its own; `test/social-pack-drift.test.ts`
// fails when a field is added to one and not the other.

export const socialPlatforms = [
  "x",
  "linkedin",
  "instagram",
  "tiktok",
  "reddit",
  "bluesky",
] as const;
export type SocialPlatform = (typeof socialPlatforms)[number];

export const platformLabels: Readonly<Record<SocialPlatform, string>> = {
  x: "X",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  tiktok: "TikTok",
  reddit: "Reddit",
  bluesky: "Bluesky",
};

export const postTextSources = [
  "description",
  "summary",
  "title",
  "prompt",
  "custom",
  "none",
] as const;
export type PostTextSource = (typeof postTextSources)[number];

export const xTiers = ["free", "premium", "premium_plus"] as const;
export type XTier = (typeof xTiers)[number];

export interface PostMediaChoice {
  readonly video?: "long" | "short" | undefined;
  readonly short?: number | undefined;
  readonly thumbnail?: boolean | undefined;
  readonly pictures?: number | undefined;
  readonly designs?: readonly string[] | undefined;
}

export interface PostChoice {
  readonly text: PostTextSource;
  // The Library prompt (kind "post") when `text` is "prompt".
  readonly prompt?: string | undefined;
  // The text when `text` is "custom".
  readonly custom?: string | undefined;
  readonly media: PostMediaChoice;
  // How many hashtags go at the end (0 is none).
  readonly hashtags: number;
  // Whether the YouTube video's link goes into the post.
  readonly link: boolean;
}

export const redditPostKinds = ["link", "text", "media"] as const;
export type RedditPostKind = (typeof redditPostKinds)[number];

export interface RedditFields {
  readonly subreddit: string;
  readonly title: string;
  readonly flair: string;
  readonly kind: RedditPostKind;
}

export const postStates = [
  "none",
  "waiting",
  "filling",
  "filled",
  "scheduled",
  "posted",
  "failed",
] as const;
export type PostState = (typeof postStates)[number];

export const reportedStates = ["filling", "filled", "scheduled", "posted", "failed"] as const;
export type ReportedState = (typeof reportedStates)[number];

export const postMediaKinds = ["video", "short", "thumbnail", "picture", "design"] as const;
export type PostMediaKind = (typeof postMediaKinds)[number];

export const mediaShapes = ["original", "1:1", "4:5", "9:16", "16:9"] as const;
export type MediaShape = (typeof mediaShapes)[number];

export interface PostMedia {
  readonly kind: PostMediaKind;
  readonly file: string;
  readonly url: string;
  readonly filename: string;
  readonly contentType: string;
  // Null until a reshaped copy exists.
  readonly bytes: number | null;
  readonly shape: MediaShape;
  // The video's length, when known.
  readonly seconds?: number | undefined;
  // Alt text for a picture (its prompt's first sentence), when the site takes one.
  readonly alt?: string | undefined;
}

export const scheduleModes = ["native", "at-release", "now"] as const;
export type ScheduleMode = (typeof scheduleModes)[number];

export interface PostSchedule {
  readonly mode: ScheduleMode;
  // ISO; null when the post has no release time.
  readonly at: string | null;
}

// The warning codes Slopify sends; the extension only shows the sentences, so any code is
// taken (a newer Slopify may send one this copy doesn't list).
export type WarningCode = string;

export interface PostWarning {
  readonly code: WarningCode;
  readonly sentence: string;
}

export interface PostCount {
  readonly used: number;
  readonly max: number;
  readonly unit: "weighted" | "graphemes" | "characters";
}

export interface PostStatus {
  readonly state: PostState;
  readonly url: string | null;
  readonly message: string | null;
  // When it reached its state (ISO).
  readonly at: string | null;
  readonly by: "extension" | "person" | null;
}

export interface PostPack {
  readonly projectId: string;
  readonly projectTitle: string;
  readonly platform: SocialPlatform;
  readonly item: number;
  // The settings in force: the project's own pick when it changed one, else the template's.
  readonly choice: PostChoice;
  readonly chosenHere: boolean;
  // The words as they go into the site's form, hashtags and link included.
  readonly text: string;
  // The words before the person's hand edit; equal to `text` when there is none.
  readonly generated: string;
  readonly edited: boolean;
  readonly count: PostCount;
  readonly hashtags: readonly string[];
  readonly link: string | null;
  readonly media: readonly PostMedia[];
  // The site's AI label (Instagram, TikTok, X) goes on whenever the post has Slopify media.
  readonly aiLabel: boolean;
  readonly schedule: PostSchedule;
  readonly reddit?: RedditFields | undefined;
  readonly xTier?: XTier | undefined;
  readonly composeUrl: string;
  readonly warnings: readonly PostWarning[];
  readonly status: PostStatus;
}

export interface ActivePost {
  readonly pack: PostPack;
  readonly waiting: number;
}

export interface DuePost {
  readonly projectId: string;
  readonly projectTitle: string;
  readonly platform: SocialPlatform;
  readonly at: string;
  readonly late: boolean;
  readonly composeUrl: string;
}

export interface LinkLookup {
  readonly projectId: string;
  readonly platform: SocialPlatform;
  readonly profileUrl: string;
  // The post's first 40 characters, matched against the profile's posts.
  readonly start: string;
}

// A published post's link on each site (`limits.ts` in the app); the extension reports only links
// that match, as Slopify refuses any other.
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
