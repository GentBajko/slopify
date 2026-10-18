import type { PostChoice, RedditFields, SocialPlatform } from "./model.js";

// What each site gets when a template turns it on, as the owner chose: the summary with the
// video on X and LinkedIn, a 4:5 picture carousel on Instagram, the first short on TikTok, the
// summary with up to four pictures on Bluesky, and a link post on Reddit.
export const defaultChoices: Readonly<Record<SocialPlatform, PostChoice>> = {
  x: { text: "summary", media: { video: "long" }, hashtags: 2, link: false },
  linkedin: { text: "summary", media: { video: "long" }, hashtags: 3, link: false },
  instagram: { text: "summary", media: { pictures: 10 }, hashtags: 5, link: false },
  tiktok: { text: "summary", media: { video: "short", short: 1 }, hashtags: 5, link: false },
  bluesky: { text: "summary", media: { pictures: 4 }, hashtags: 2, link: false },
  reddit: { text: "none", media: {}, hashtags: 0, link: true },
};

export const defaultReddit = (title: string): RedditFields => ({
  subreddit: "",
  title,
  flair: "",
  kind: "link",
});
