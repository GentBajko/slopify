import { describe, expect, it } from "vitest";
import {
  designFormatFor,
  type MediaSources,
  mediaFile,
  mediaFor,
  parseMediaFile,
} from "./media.js";

const file = (asset: string, ext: string, type: string) => ({
  asset,
  filename: `ep-${asset}.${ext}`,
  contentType: type,
  bytes: 10,
});
const sources: MediaSources = {
  projectId: "p1",
  format: "16:9",
  long: { ...file("video", "mp4", "video/mp4"), seconds: 600 },
  shorts: [
    { number: 1, file: { ...file("short-video-1", "mp4", "video/mp4"), seconds: 70 } },
    { number: 2, file: null },
  ],
  thumbnail: file("thumbnail", "png", "image/png"),
  pictures: [
    { ...file("image-1", "png", "image/png"), alt: "A lighthouse." },
    file("image-2", "png", "image/png"),
    file("image-3", "png", "image/png"),
  ],
  designs: [{ id: "d1", name: "Poster" }],
};

describe("mediaFile and parseMediaFile", () => {
  it("names an asset, a reshaped copy and a design's render, and reads them back", () => {
    expect(mediaFile("image-3", "original")).toBe("image-3");
    expect(mediaFile("image-3", "4:5")).toBe("image-3--4x5");
    expect(parseMediaFile("image-3--4x5")).toEqual({
      kind: "asset",
      asset: "image-3",
      shape: "4:5",
    });
    expect(parseMediaFile("short-video-1")).toEqual({
      kind: "asset",
      asset: "short-video-1",
      shape: "original",
    });
    expect(parseMediaFile("design--d_1--portrait")).toEqual({
      kind: "design",
      id: "d_1",
      format: "portrait",
    });
  });

  it.each(["../video", "image--7x9", "design--d1--a4", "IMAGE", "", "image-1--4x5--4x5"])(
    "refuses %s",
    (name) => {
      expect(parseMediaFile(name)).toBeUndefined();
    },
  );
});

describe("mediaFor", () => {
  it("puts the long video first with its length and the project's shape", () => {
    const { media, warnings } = mediaFor("x", { video: "long" }, sources);
    expect(warnings).toEqual([]);
    expect(media).toEqual([
      {
        kind: "video",
        file: "video",
        url: "/api/social/media/p1/video",
        filename: "ep-video.mp4",
        contentType: "video/mp4",
        bytes: 10,
        shape: "16:9",
        seconds: 600,
      },
    ]);
  });

  it("reshapes Instagram's pictures to 4:5 JPEGs made later, with their alt text", () => {
    const { media } = mediaFor("instagram", { pictures: 2 }, sources);
    expect(media.map((one) => [one.file, one.shape, one.bytes, one.contentType])).toEqual([
      ["image-1--4x5", "4:5", null, "image/jpeg"],
      ["image-2--4x5", "4:5", null, "image/jpeg"],
    ]);
    expect(media[0]?.alt).toBe("A lighthouse.");
    expect(media[0]?.filename).toBe("ep-image-1-4x5.jpg");
  });

  it("keeps pictures as they are on sites that take any shape", () => {
    const { media } = mediaFor("bluesky", { pictures: 9, thumbnail: true }, sources);
    expect(media.map((one) => one.file)).toEqual(["thumbnail", "image-1", "image-2", "image-3"]);
  });

  it("takes a short, upright", () => {
    const { media } = mediaFor("tiktok", { video: "short", short: 1 }, sources);
    expect(media[0]).toMatchObject({ kind: "short", file: "short-video-1", shape: "9:16" });
  });

  it("says what is missing: an unrendered short, a short that doesn't exist, no video yet", () => {
    expect(mediaFor("tiktok", { video: "short", short: 2 }, sources).warnings[0]?.sentence).toMatch(
      /Short 2 isn't rendered yet/,
    );
    expect(mediaFor("tiktok", { video: "short", short: 5 }, sources).warnings[0]?.sentence).toMatch(
      /has no short 5\. Pick another short for TikTok/,
    );
    const bare = { ...sources, long: null, thumbnail: null, pictures: [] };
    expect(
      mediaFor("x", { video: "long", thumbnail: true, pictures: 2 }, bare).warnings.map(
        (one) => one.code,
      ),
    ).toEqual(["media-missing", "media-missing", "media-missing"]);
  });

  it("draws a design in the site's format and refuses one of another project", () => {
    const { media, warnings } = mediaFor("instagram", { designs: ["d1", "d9"] }, sources);
    expect(media).toEqual([
      expect.objectContaining({ kind: "design", file: "design--d1--portrait", shape: "4:5" }),
    ]);
    expect(warnings[0]?.sentence).toMatch(/A design picked for this post is gone/);
    expect(designFormatFor("tiktok")).toBe("story");
    expect(designFormatFor("x")).toBe("square");
  });

  it("carries nothing when nothing is picked", () => {
    expect(mediaFor("reddit", {}, sources)).toEqual({ media: [], warnings: [] });
  });
});
