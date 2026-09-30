import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cacheKey, keepClip, pruneClips, reuseClip } from "./clip-cache.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "slopify-clip-cache-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("cacheKey", () => {
  it("names a clip by its run, not where the run writes it", () => {
    const image = join(root, "image.png");
    writeFileSync(image, "one");
    const args = (output: string): string[] => ["-i", image, "-vf", "zoompan", output];
    expect(cacheKey("ffmpeg", args("/a/c1.mp4"), "/a/c1.mp4")).toBe(
      cacheKey("ffmpeg", args("/b/c9.mp4"), "/b/c9.mp4"),
    );
    const before = cacheKey("ffmpeg", args("/a/c1.mp4"), "/a/c1.mp4");
    expect(cacheKey("other-ffmpeg", args("/a/c1.mp4"), "/a/c1.mp4")).not.toBe(before);
    expect(cacheKey("ffmpeg", args("/a/c1.mp4"), "/a/c1.mp4", ["card"])).not.toBe(before);
    expect(
      cacheKey("ffmpeg", ["-i", image, "-vf", "zoompan,crop", "/a/c1.mp4"], "/a/c1.mp4"),
    ).not.toBe(before);
  });

  it("changes when an input file changes on disk", () => {
    const image = join(root, "image.png");
    writeFileSync(image, "one");
    const args = ["-i", image, "/a/c1.mp4"];
    const before = cacheKey("ffmpeg", args, "/a/c1.mp4");
    writeFileSync(image, "a different picture");
    expect(cacheKey("ffmpeg", args, "/a/c1.mp4")).not.toBe(before);
  });
});

describe("keepClip and reuseClip", () => {
  it("keeps a finished clip and puts it back for the next render", () => {
    const cache = join(root, ".render-cache", "p1");
    const work = join(root, "render-1");
    mkdirSync(work);
    writeFileSync(join(work, "c1.mp4"), "clip bytes");
    expect(reuseClip(cache, "k1", join(work, "again.mp4"))).toBe(false);
    keepClip(cache, "k1", join(work, "c1.mp4"));
    rmSync(work, { recursive: true });
    mkdirSync(work);
    expect(reuseClip(cache, "k1", join(work, "c4.mp4"))).toBe(true);
    expect(readFileSync(join(work, "c4.mp4"), "utf8")).toBe("clip bytes");
    expect(readdirSync(cache)).toEqual(["k1.mp4"]);
  });
});

describe("pruneClips", () => {
  const limits = { mostBytes: 25, leastFree: 0 };

  it("keeps only the clips the render used", () => {
    const cache = join(root, "p1");
    mkdirSync(cache);
    for (const name of ["k1.mp4", "k2.mp4", "k3.99.part"]) writeFileSync(join(cache, name), "x");
    pruneClips(cache, new Set(["k1"]), limits);
    expect(readdirSync(cache)).toEqual(["k1.mp4"]);
  });

  it("lets the least recently rendered projects go until the caches fit", () => {
    const at = (name: string, seconds: number): string => {
      const dir = join(root, name);
      mkdirSync(dir);
      writeFileSync(join(dir, "k.mp4"), "0123456789");
      utimesSync(dir, seconds, seconds);
      return dir;
    };
    at("oldest", 1000);
    at("older", 2000);
    const current = at("current", 500);
    pruneClips(current, new Set(["k"]), limits);
    expect(readdirSync(root).toSorted()).toEqual(["current", "older"]);
    expect(statSync(join(current, "k.mp4")).size).toBe(10);
  });

  it("gives up even its own clips when the disk runs short", () => {
    const cache = join(root, "p1");
    mkdirSync(cache);
    writeFileSync(join(cache, "k.mp4"), "x");
    pruneClips(cache, new Set(["k"]), { mostBytes: 25, leastFree: Number.MAX_SAFE_INTEGER });
    expect(readdirSync(root)).toEqual([]);
  });
});
