import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  accountPatterns,
  fillUrl,
  limitsFor,
  linkPatterns,
  nativeSchedule,
  profileUrl,
  redditSubmitUrl,
} from "./limits.js";
import { socialPlatforms } from "./model.js";

describe("limitsFor", () => {
  it("gives X's free tier 280 weighted characters and 2:20 of video", () => {
    const limits = limitsFor("x");
    expect(limits).toMatchObject({ text: 280, unit: "weighted", videoSeconds: 140, pictures: 4 });
  });

  it("gives X Premium and Premium+ long posts and long videos", () => {
    expect(limitsFor("x", "premium").text).toBe(25_000);
    expect(limitsFor("x", "premium_plus").videoSeconds).toBe(3 * 3600);
  });

  it("ignores the X tier for the other sites", () => {
    expect(limitsFor("bluesky", "premium")).toEqual(limitsFor("bluesky"));
    expect(limitsFor("bluesky")).toMatchObject({ text: 300, unit: "graphemes", pictures: 4 });
  });

  it("puts the AI label only where the site has one", () => {
    const labelled = socialPlatforms.filter((platform) => limitsFor(platform).aiLabel);
    expect(labelled).toEqual(["x", "instagram", "tiktok"]);
  });

  it("schedules natively only on X, LinkedIn and TikTok", () => {
    expect(Object.keys(nativeSchedule).toSorted()).toEqual(["linkedin", "tiktok", "x"]);
  });
});

describe("redditSubmitUrl", () => {
  it("prefills the title, text and link in the subreddit's submit page", () => {
    const url = new URL(
      redditSubmitUrl({ subreddit: "videos", title: "A & B", text: "", url: "https://youtu.be/x" }),
    );
    expect(url.pathname).toBe("/r/videos/submit");
    expect(url.searchParams.get("title")).toBe("A & B");
    expect(url.searchParams.get("url")).toBe("https://youtu.be/x");
    expect(url.searchParams.has("text")).toBe(false);
  });

  it("opens the plain submit page when no subreddit is set", () => {
    expect(redditSubmitUrl({ subreddit: "", title: "T" })).toBe(
      "https://www.reddit.com/submit?title=T",
    );
  });
});

describe("linkPatterns", () => {
  const good: Record<string, string> = {
    x: "https://x.com/someone/status/1234567890",
    linkedin: "https://www.linkedin.com/feed/update/urn:li:activity:7123456789012345678/",
    instagram: "https://www.instagram.com/p/C0deAbC123/",
    tiktok: "https://www.tiktok.com/@someone/video/7123456789012345678",
    reddit: "https://www.reddit.com/r/videos/comments/abc123/a_title/",
    bluesky: "https://bsky.app/profile/someone.bsky.social/post/3kabcdef",
  };

  it.each(socialPlatforms)("accepts a %s post link", (platform) => {
    expect(linkPatterns[platform].test(good[platform] ?? "")).toBe(true);
  });

  it.each(socialPlatforms)("refuses another site's link for %s", (platform) => {
    expect(linkPatterns[platform].test("https://example.com/status/1")).toBe(false);
  });
});

describe("profileUrl", () => {
  it("reads the account the way each site writes it", () => {
    expect(profileUrl("x", { x: "@me" })).toBe("https://x.com/me");
    expect(profileUrl("reddit", { reddit: "u/me" })).toBe(
      "https://www.reddit.com/user/me/submitted/",
    );
    expect(profileUrl("tiktok", { tiktok: "@me" })).toBe("https://www.tiktok.com/@me");
    expect(profileUrl("linkedin", { linkedin: "in/me" })).toBe(
      "https://www.linkedin.com/in/me/recent-activity/all/",
    );
  });

  it("has no page without an account", () => {
    expect(profileUrl("bluesky", {})).toBeNull();
    expect(profileUrl("bluesky", { bluesky: "  " })).toBeNull();
  });
});

describe("accountPatterns", () => {
  it("refuses an address in place of a name", () => {
    expect(accountPatterns.x.test("https://x.com/me")).toBe(false);
    expect(accountPatterns.bluesky.test("me.bsky.social")).toBe(true);
  });
});

describe("browser-safe", () => {
  it.each(["model.ts", "limits.ts"])("%s imports nothing from Node", (file) => {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    expect(source).not.toMatch(/from "node:/);
    expect(source).not.toMatch(/from "\.\.\//);
  });
});

describe("fillUrl", () => {
  it("marks the post form Fill in <site> opens with the project and site, for the extension", () => {
    expect(fillUrl("https://x.com/compose/post", "p 1", "x")).toBe(
      "https://x.com/compose/post#slopify-post=p%201:x",
    );
    expect(fillUrl("https://www.reddit.com/submit?title=Fox#old", "p1", "reddit")).toBe(
      "https://www.reddit.com/submit?title=Fox#slopify-post=p1:reddit",
    );
  });
});
