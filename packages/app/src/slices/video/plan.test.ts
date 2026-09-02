import { describe, expect, it } from "vitest";
import type { PlanInput } from "./plan.js";
import { planRender } from "./plan.js";

function input(over: Partial<PlanInput> = {}): PlanInput {
  return {
    format: "16:9",
    gapSeconds: 3,
    body: { path: "/p/audio-body.mp3", seconds: 10 },
    images: ["/p/images/001.png", "/p/images/002.png", "/p/images/003.png"],
    output: "/p/video.mp4",
    ...over,
  };
}

function shape(plan: ReturnType<typeof planRender>): string[] {
  return plan.audio.map((segment) => `${segment.kind}:${segment.seconds}`);
}

describe("the audio timeline", () => {
  it("is body alone when neither an intro nor an outro was picked", () => {
    const plan = planRender(input());
    expect(shape(plan)).toEqual(["body:10"]);
    expect(plan.totalSeconds).toBe(10);
  });

  it("is intro, gap, body, gap, outro when both were picked", () => {
    const plan = planRender(
      input({
        intro: { path: "/p/audio-intro.mp3", seconds: 2 },
        outro: { path: "/p/audio-outro.mp3", seconds: 4 },
      }),
    );

    expect(shape(plan)).toEqual(["intro:2", "gap:3", "body:10", "gap:3", "outro:4"]);
    expect(plan.totalSeconds).toBe(22);
  });

  it("drops the leading gap with the intro and the trailing gap with the outro", () => {
    expect(shape(planRender(input({ intro: { path: "/p/i.mp3", seconds: 2 } })))).toEqual([
      "intro:2",
      "gap:3",
      "body:10",
    ]);
    expect(shape(planRender(input({ outro: { path: "/p/o.mp3", seconds: 4 } })))).toEqual([
      "body:10",
      "gap:3",
      "outro:4",
    ]);
  });

  it("inserts no silence at all when the gap setting is zero", () => {
    const plan = planRender(
      input({
        gapSeconds: 0,
        intro: { path: "/p/i.mp3", seconds: 2 },
        outro: { path: "/p/o.mp3", seconds: 4 },
      }),
    );

    expect(shape(plan)).toEqual(["intro:2", "body:10", "outro:4"]);
    expect(plan.totalSeconds).toBe(16);
  });

  it("drops a gap too short to hold a frame", () => {
    // 0.0004 s is under a frame at 30 fps: ffmpeg would be handed -t 0.000 and produce an
    // anullsrc input with no samples that still counted in concat=n=.
    const plan = planRender(
      input({
        gapSeconds: 0.0004,
        intro: { path: "/p/i.mp3", seconds: 2 },
        outro: { path: "/p/o.mp3", seconds: 4 },
      }),
    );

    expect(shape(plan)).toEqual(["intro:2", "body:10", "outro:4"]);
    expect(plan.gapSeconds).toBe(0.0004);
  });

  it("keeps a gap of exactly one frame", () => {
    const plan = planRender(input({ gapSeconds: 1 / 30, intro: { path: "/p/i.mp3", seconds: 2 } }));

    expect(plan.audio.map((segment) => segment.kind)).toEqual(["intro", "gap", "body"]);
  });

  it("gives a silence gap no file to read", () => {
    const plan = planRender(input({ intro: { path: "/p/i.mp3", seconds: 2 } }));
    expect(plan.audio[1]).toEqual({ kind: "gap", path: null, seconds: 3 });
  });
});

describe("the frame", () => {
  it("renders 16:9 at 1920x1080 and 9:16 at 1080x1920, both at 30 fps", () => {
    expect(planRender(input())).toMatchObject({ width: 1920, height: 1080, fps: 30 });
    expect(planRender(input({ format: "9:16" }))).toMatchObject({ width: 1080, height: 1920 });
  });
});

describe("the image slots", () => {
  it("splits the timeline evenly and lets the last image absorb the rounding", () => {
    // 10 s at 30 fps is 300 frames over three images: 100, 100, 100.
    expect(planRender(input()).images.map((slot) => slot.frames)).toEqual([100, 100, 100]);
    // 10.1 s rounds to 303 frames: 101, 101, 101.
    expect(
      planRender(input({ body: { path: "/p/a.mp3", seconds: 10.1 } })).images.map(
        (slot) => slot.frames,
      ),
    ).toEqual([101, 101, 101]);
    // 7 s is 210 frames over four images: 52, 52, 52 and 54 for the last.
    expect(
      planRender(
        input({
          body: { path: "/p/a.mp3", seconds: 7 },
          images: ["/a.png", "/b.png", "/c.png", "/d.png"],
        }),
      ).images.map((slot) => slot.frames),
    ).toEqual([52, 52, 52, 54]);
  });

  it("gives a single image the whole timeline", () => {
    const plan = planRender(input({ images: ["/only.png"] }));
    expect(plan.images).toEqual([{ path: "/only.png", index: 1, frames: 300, zoom: "in" }]);
  });

  it("alternates the zoom, odd images in and even images out", () => {
    expect(planRender(input()).images.map((slot) => slot.zoom)).toEqual(["in", "out", "in"]);
  });

  it("keeps the slideshow order it was handed", () => {
    expect(planRender(input()).images.map((slot) => slot.path)).toEqual([
      "/p/images/001.png",
      "/p/images/002.png",
      "/p/images/003.png",
    ]);
  });

  it("gives every image a frame even when there are more images than frames", () => {
    const many = Array.from({ length: 40 }, (_value, index) => `/i${index}.png`);
    const plan = planRender(input({ body: { path: "/p/a.mp3", seconds: 1 }, images: many }));

    expect(plan.images.every((slot) => slot.frames >= 1)).toBe(true);
    expect(plan.images).toHaveLength(40);
  });

  it("refuses to plan a render with no images", () => {
    expect(() => planRender(input({ images: [] }))).toThrow(/at least one image/);
  });
});
