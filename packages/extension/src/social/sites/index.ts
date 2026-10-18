import type { Site } from "../site.js";
import type { SocialPlatform } from "../types.js";
import { bluesky } from "./bluesky.js";
import { instagram } from "./instagram.js";
import { linkedin } from "./linkedin.js";
import { reddit } from "./reddit.js";
import { tiktok } from "./tiktok.js";
import { x } from "./x.js";

// The six sites the extension posts on, by platform, and the site a page belongs to.
export const sites: Readonly<Record<SocialPlatform, Site>> = {
  x,
  linkedin,
  instagram,
  tiktok,
  reddit,
  bluesky,
};

export function siteFor(hostname: string): Site | undefined {
  return Object.values(sites).find((site) =>
    site.matches.some((match) => new URL(match.replace("/*", "/")).hostname === hostname),
  );
}
