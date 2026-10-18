import type { SocialPlatform } from "./types.js";

// The pages of each site the extension may post on: its optional host permissions (granted with
// "Allow posting on <site>" in the options) and its content script's matches. Never required
// permissions: a required one added in an update would disable the installed extension until
// the person accepted it, and YouTube Studio would stop filling.
export const siteMatches: Readonly<Record<SocialPlatform, readonly string[]>> = {
  x: ["https://x.com/*"],
  linkedin: ["https://www.linkedin.com/*"],
  instagram: ["https://www.instagram.com/*"],
  tiktok: ["https://www.tiktok.com/*"],
  reddit: ["https://www.reddit.com/*"],
  bluesky: ["https://bsky.app/*"],
};

export const siteOrigins: readonly string[] = Object.values(siteMatches).flatMap((matches) =>
  matches.map((match) => match.replace("/*", "")),
);
