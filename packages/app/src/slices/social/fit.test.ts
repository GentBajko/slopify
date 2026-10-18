import { describe, expect, it } from "vitest";
import { mediaWarnings, redditWarnings, scheduleFor } from "./fit.js";
import type { PostMedia } from "./model.js";

const video = (seconds: number, shape: PostMedia["shape"] = "16:9"): PostMedia => ({
  kind: "video",
  file: "video",
  url: "u",
  filename: "v.mp4",
  contentType: "video/mp4",
  bytes: 1,
  shape,
  seconds,
});
const picture: PostMedia = {
  kind: "picture",
  file: "image-1",
  url: "u",
  filename: "i.png",
  contentType: "image/png",
  bytes: 1,
  shape: "original",
};
const short: PostMedia = { ...video(60, "9:16"), kind: "short", file: "short-video-1" };
const codes = (list: readonly { readonly code: string }[]) => list.map((one) => one.code);

describe("mediaWarnings", () => {
  it("warns X Free about a long video and names Premium, but not X Premium", () => {
    const free = mediaWarnings("x", [video(600)], "free");
    expect(codes(free)).toEqual(["video-too-long"]);
    expect(free[0]?.sentence).toMatch(
      /^X Free takes videos up to 2 min 20 s; this one is 10 min\. .*Channels → Brand → Posting/,
    );
    expect(mediaWarnings("x", [video(600)], "premium")).toEqual([]);
  });

  it("warns about too many pictures, saying which go in", () => {
    const warnings = mediaWarnings("bluesky", Array(5).fill(picture), "free");
    expect(warnings[0]?.sentence).toMatch(/up to 4 pictures per post; this one has 5\. .*first 4/);
  });

  it("warns where a video and pictures can't share a post, but not on X", () => {
    expect(codes(mediaWarnings("linkedin", [video(60), picture], "free"))).toEqual([
      "video-and-pictures",
    ]);
    expect(mediaWarnings("x", [video(60), picture], "free")).toEqual([]);
  });

  it("warns about two videos", () => {
    expect(codes(mediaWarnings("x", [video(60), short], "premium"))).toContain("too-many-videos");
  });

  it("needs media on TikTok and Instagram, and a short rather than the 16:9 video on TikTok", () => {
    expect(codes(mediaWarnings("instagram", [], "free"))).toEqual(["no-media"]);
    expect(codes(mediaWarnings("tiktok", [video(60)], "free"))).toEqual(["full-video"]);
    expect(mediaWarnings("tiktok", [short], "free")).toEqual([]);
  });

  it("leaves a video of unknown length alone", () => {
    const { seconds: _seconds, ...unknown } = video(1);
    expect(mediaWarnings("bluesky", [unknown], "free")).toEqual([]);
  });
});

describe("redditWarnings", () => {
  it("names a missing subreddit and title", () => {
    expect(codes(redditWarnings({ subreddit: "", title: " ", flair: "", kind: "link" }))).toEqual([
      "subreddit-missing",
      "title-missing",
    ]);
    expect(redditWarnings({ subreddit: "a", title: "T", flair: "", kind: "link" })).toEqual([]);
  });
});

describe("scheduleFor", () => {
  const now = new Date("2026-10-18T10:00:00.000Z");
  const inHours = (hours: number) => new Date(now.getTime() + hours * 3_600_000).toISOString();

  it("uses the site's scheduler at the release time", () => {
    expect(scheduleFor("x", inHours(5), now)).toEqual({
      schedule: { mode: "native", at: inHours(5) },
      warnings: [],
    });
  });

  it("fills at release time on a site without a scheduler", () => {
    expect(scheduleFor("instagram", inHours(5), now).schedule).toEqual({
      mode: "at-release",
      at: inHours(5),
    });
  });

  it("posts now, saying why, without a release time, after it, or outside the site's window", () => {
    expect(scheduleFor("bluesky", null, now)).toMatchObject({
      schedule: { mode: "now", at: null },
      warnings: [{ code: "no-release" }],
    });
    expect(scheduleFor("x", inHours(-1), now).warnings[0]?.code).toBe("release-past");
    const far = scheduleFor("tiktok", inHours(24 * 11), now);
    expect(far.schedule.mode).toBe("now");
    expect(far.warnings[0]?.sentence).toMatch(
      /TikTok schedules posts only 15 min to 10 days ahead/,
    );
    expect(scheduleFor("linkedin", inHours(0.5), now).warnings[0]?.code).toBe(
      "release-outside-window",
    );
  });
});
