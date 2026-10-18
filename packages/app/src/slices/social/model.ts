// Posting a project's work to X, LinkedIn, Instagram, TikTok, Reddit and Bluesky. Slopify never
// posts: the Slopify Studio extension fills each site's own post form and the person presses
// Post. Browser-safe: the project page, Template Studio and the extension read these names.

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

// Where a post's words come from. "description" is the YouTube description without its
// chapters, "summary" the article's digest summary, "prompt" a Library prompt of kind "post"
// (a paid AI call), "custom" a short text with {{Slopify_…}} keywords, "none" no words.
export const postTextSources = [
  "description",
  "summary",
  "title",
  "prompt",
  "custom",
  "none",
] as const;
export type PostTextSource = (typeof postTextSources)[number];

// The X subscription of the channel's account: it only changes which warnings a post gets.
export const xTiers = ["free", "premium", "premium_plus"] as const;
export type XTier = (typeof xTiers)[number];

export const xTierLabels: Readonly<Record<XTier, string>> = {
  free: "Free",
  premium: "Premium",
  premium_plus: "Premium+",
};

// What a post carries besides its words. Any mix is allowed; the pack warns when a mix does not
// fit the site. `short` is the 1-based short number when `video` is "short"; `pictures` is how
// many of the project's images, in their order; `designs` are Library → Designs ids made for
// this project.
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

// The project's generating settings (revision `config.social`, Template Studio's Upload pack):
// which sites the project posts to and what each gets. Absent is no posting, as every project
// saved before it.
export type SocialSettings = Partial<Record<SocialPlatform, PostChoice>>;

export const redditPostKinds = ["link", "text", "media"] as const;
export type RedditPostKind = (typeof redditPostKinds)[number];

// A Reddit post's own fields, kept per project (Prepare upload).
export interface RedditFields {
  readonly subreddit: string;
  readonly title: string;
  readonly flair: string;
  readonly kind: RedditPostKind;
}

// Where a post stands. "waiting": the person pressed Fill in <site>; "filling": the extension
// took it; "filled": the form is filled and waits for the person's Post; "scheduled": the site
// will post it at the release time; "posted": it is on the site; "failed": the fill stopped.
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

// What the extension reports after a fill (`POST /api/social/ext/result`).
export const reportedStates = ["filling", "filled", "scheduled", "posted", "failed"] as const;
export type ReportedState = (typeof reportedStates)[number];

export const postMediaKinds = ["video", "short", "thumbnail", "picture", "design"] as const;
export type PostMediaKind = (typeof postMediaKinds)[number];

export const mediaShapes = ["original", "1:1", "4:5", "9:16", "16:9"] as const;
export type MediaShape = (typeof mediaShapes)[number];

// One file of a post. `file` is its name for `/api/social/media/<projectId>/<file>` (the page)
// and `/api/social/ext/files/<projectId>/<file>` (the extension); a reshaped picture is made
// the first time it is asked for.
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

// How the post meets the release time: the site's own scheduler set to it, the extension
// filling it when it is due (the person presses Post), or posted when the person presses it.
export const scheduleModes = ["native", "at-release", "now"] as const;
export type ScheduleMode = (typeof scheduleModes)[number];

export interface PostSchedule {
  readonly mode: ScheduleMode;
  // ISO; null when the post has no release time.
  readonly at: string | null;
}

export const warningCodes = [
  "text-cut",
  "too-many-pictures",
  "video-too-long",
  "video-and-pictures",
  "no-media",
  "subreddit-missing",
  "title-missing",
  "release-past",
  "release-outside-window",
  "no-release",
  "media-missing",
  "text-missing",
  "full-video",
  "too-many-videos",
] as const;
export type WarningCode = (typeof warningCodes)[number];

// A warning never blocks a fill: it says what doesn't fit and how to fix it.
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

// One platform's post as Prepare upload shows it and the extension fills it.
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

// The routes' answer for a project (`GET /api/social/packs/:projectId`). `platforms` lists the
// sites the project posts to, in the order above; empty when it posts nowhere.
export interface PostPacks {
  readonly projectId: string;
  readonly packs: readonly PostPack[];
}

// The extension's answer for a fill (`GET /api/social/ext/next`).
export interface ActivePost {
  readonly pack: PostPack;
  readonly waiting: number;
}

// A post the extension fills when it is due (`GET /api/social/ext/due`): sites without a
// scheduler. `late` is true when its time passed (at most 12 hours ago).
export interface DuePost {
  readonly projectId: string;
  readonly projectTitle: string;
  readonly platform: SocialPlatform;
  readonly at: string;
  readonly late: boolean;
  readonly composeUrl: string;
}

// A post the extension looks up on the person's profile page (`GET /api/social/ext/find-links`).
export interface LinkLookup {
  readonly projectId: string;
  readonly platform: SocialPlatform;
  readonly profileUrl: string;
  // The post's first 40 characters, matched against the profile's posts.
  readonly start: string;
}

// The person's account on each site, only to find a published post's link; never a login.
export type SocialAccounts = Partial<Record<SocialPlatform, string>>;
