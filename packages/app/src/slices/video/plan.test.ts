import { describe, expect, it } from "vitest";
import type { PlanInput } from "./plan.js";
import { audioTimeline, planRender } from "./plan.js";

function input(over: Partial<PlanInput> = {}): PlanInput {
  return {
    format: "16:9",
    gapSeconds: 3,
    edgeSeconds: 0,
    imageSeconds: 15,
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

describe("the edge silence", () => {
  it("opens and closes the timeline with it, around intro and outro alike", () => {
    const plan = planRender(
      input({
        edgeSeconds: 2,
        intro: { path: "/p/i.mp3", seconds: 2 },
        outro: { path: "/p/o.mp3", seconds: 4 },
      }),
    );
    expect(shape(plan)).toEqual([
      "edge:2",
      "intro:2",
      "gap:3",
      "body:10",
      "gap:3",
      "outro:4",
      "edge:2",
    ]);
    expect(plan.totalSeconds).toBe(26);
    expect(plan.audio[0]).toEqual({ kind: "edge", path: null, seconds: 2 });
  });

  it("adds nothing at zero", () => {
    expect(shape(planRender(input({ edgeSeconds: 0 })))).toEqual(["body:10"]);
  });

  it("takes a WAV's one-sample minimum rather than the video's one frame", () => {
    const body = { path: "/p/b.mp3", seconds: 1 };
    expect(audioTimeline({ gapSeconds: 0, edgeSeconds: 0.01, body }).map((s) => s.kind)).toEqual([
      "body",
    ]);
    expect(
      audioTimeline({ gapSeconds: 0, edgeSeconds: 0.01, body }, 1 / 48000).map((s) => s.kind),
    ).toEqual(["edge", "body", "edge"]);
  });

  it("leaves a silent video without any, since there is no audio to pad", () => {
    expect(planRender(input({ edgeSeconds: 2, body: undefined })).audio).toEqual([]);
  });
});

describe("the image slots", () => {
  const five = ["/1.png", "/2.png", "/3.png", "/4.png", "/5.png"];

  it("shows each silent image once for its seconds and omits the audio timeline", () => {
    const plan = planRender(input({ body: undefined, imageSeconds: 5 }));
    expect(plan.audio).toEqual([]);
    expect(plan.totalSeconds).toBe(15);
    expect(plan.images.map((slot) => slot.frames)).toEqual([150, 150, 150]);
  });

  it("cycles the images in order until the narration ends", () => {
    // 100 s at 15 s a slot: six full slots and a 10 s seventh.
    const plan = planRender(input({ body: { path: "/b.mp3", seconds: 100 }, images: five }));
    expect(plan.images.map((slot) => slot.path)).toEqual([
      "/1.png",
      "/2.png",
      "/3.png",
      "/4.png",
      "/5.png",
      "/1.png",
      "/2.png",
    ]);
    expect(plan.images.map((slot) => slot.index)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(plan.images.map((slot) => slot.frames)).toEqual([450, 450, 450, 450, 450, 450, 300]);
    expect(plan.images.reduce((sum, slot) => sum + slot.frames, 0)).toBe(plan.totalFrames);
  });

  it("cuts the last slot to what is left, never below one frame", () => {
    const plan = planRender(
      input({ body: { path: "/b.mp3", seconds: 30 + 1 / 30 }, images: five }),
    );
    expect(plan.images.map((slot) => slot.frames)).toEqual([450, 450, 1]);
  });

  it("keeps a whole number of slots when the timeline divides evenly", () => {
    const plan = planRender(input({ body: { path: "/b.mp3", seconds: 45 }, images: five }));
    expect(plan.images.map((slot) => slot.frames)).toEqual([450, 450, 450]);
  });

  it("holds a 108-minute narration to its slots rather than 21 minutes an image", () => {
    const plan = planRender(input({ body: { path: "/b.mp3", seconds: 108 * 60 }, images: five }));
    expect(plan.images).toHaveLength(432);
    expect(Math.max(...plan.images.map((slot) => slot.frames))).toBe(450);
  });

  it("gives a timeline shorter than one slot a single slot", () => {
    const plan = planRender(input({ body: { path: "/b.mp3", seconds: 4 }, images: five }));
    expect(plan.images).toEqual([{ path: "/1.png", index: 1, frames: 120, zoom: "in" }]);
  });

  it("alternates the zoom per slot, so a returning image may zoom the other way", () => {
    const plan = planRender(
      input({ body: { path: "/b.mp3", seconds: 60 }, images: ["/a.png", "/b.png", "/c.png"] }),
    );
    expect(plan.images.map((slot) => `${slot.path}:${slot.zoom}`)).toEqual([
      "/a.png:in",
      "/b.png:out",
      "/c.png:in",
      "/a.png:out",
    ]);
  });

  it("uses the seconds it is given", () => {
    const plan = planRender(input({ imageSeconds: 4 }));
    // 10 s at 4 s a slot: 120, 120 and a 60-frame third.
    expect(plan.images.map((slot) => slot.frames)).toEqual([120, 120, 60]);
    expect(plan.imageSeconds).toBe(4);
  });

  it("gives a single image every slot", () => {
    const plan = planRender(
      input({ body: { path: "/b.mp3", seconds: 40 }, images: ["/only.png"] }),
    );
    expect(plan.images.map((slot) => [slot.path, slot.frames, slot.zoom])).toEqual([
      ["/only.png", 450, "in"],
      ["/only.png", 450, "out"],
      ["/only.png", 300, "in"],
    ]);
  });

  it("refuses to plan a render with no images", () => {
    expect(() => planRender(input({ images: [] }))).toThrow(/at least one image/);
  });
});
