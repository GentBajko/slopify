import { describe, expect, it } from "vitest";
import type { Shot } from "./edit-list.js";
import { editListVersion, readEditList } from "./edit-list.js";
import { panMinimumPercent } from "./motion.js";
import type { PlanInput } from "./plan.js";
import { audioTimeline, planRender, zoomRange } from "./plan.js";

function input(over: Partial<PlanInput> = {}): PlanInput {
  return {
    format: "16:9",
    gapSeconds: 3,
    edgeSeconds: 0,
    imageSeconds: 15,
    zoomPercent: 22.5,
    motionStyle: "zoom",
    body: { path: "/p/audio-body.mp3", seconds: 10 },
    images: ["/p/images/001.png", "/p/images/002.png", "/p/images/003.png"],
    output: "/p/video.mp4",
    ...over,
  };
}

// A shot's motion in a word: in, out, the pan's direction, or still.
function moves(shot: Shot): string {
  const { motion } = shot;
  if (motion.kind === "zoom") return motion.direction;
  if (motion.kind === "still") return "still";
  const way = (from: number, to: number, less: string, more: string) =>
    from === to ? "" : from < to ? `${less}>${more}` : `${more}>${less}`;
  return (
    way(motion.from.x, motion.to.x, "left", "right") ||
    way(motion.from.y, motion.to.y, "top", "bottom")
  );
}

function shape(plan: ReturnType<typeof planRender>): string[] {
  return plan.editList.audio.map((segment) => `${segment.kind}:${segment.seconds}`);
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

    expect(plan.editList.audio.map((segment) => segment.kind)).toEqual(["intro", "gap", "body"]);
  });

  it("gives a silence gap no file to read", () => {
    const plan = planRender(input({ intro: { path: "/p/i.mp3", seconds: 2 } }));
    expect(plan.editList.audio[1]).toEqual({ kind: "gap", path: null, seconds: 3 });
  });
});

describe("the frame", () => {
  it("renders 16:9 at 1920x1080 and 9:16 at 1080x1920, both at 30 fps", () => {
    expect(planRender(input()).editList).toMatchObject({ width: 1920, height: 1080, fps: 30 });
    expect(planRender(input({ format: "9:16" })).editList).toMatchObject({
      width: 1080,
      height: 1920,
    });
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
    expect(plan.editList.audio[0]).toEqual({ kind: "edge", path: null, seconds: 2 });
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
    expect(planRender(input({ edgeSeconds: 2, body: undefined })).editList.audio).toEqual([]);
  });
});

describe("the image shots", () => {
  const five = ["/1.png", "/2.png", "/3.png", "/4.png", "/5.png"];

  it("shows each silent image once for its seconds and omits the audio timeline", () => {
    const plan = planRender(input({ body: undefined, imageSeconds: 5 }));
    expect(plan.editList.audio).toEqual([]);
    expect(plan.totalSeconds).toBe(15);
    expect(plan.editList.shots.map((slot) => slot.frames)).toEqual([150, 150, 150]);
  });

  it("cycles the images in order until the narration ends", () => {
    // 100 s at 15 s a slot: six full slots and a 10 s seventh.
    const plan = planRender(input({ body: { path: "/b.mp3", seconds: 100 }, images: five }));
    expect(plan.editList.shots.map((slot) => slot.source.path)).toEqual([
      "/1.png",
      "/2.png",
      "/3.png",
      "/4.png",
      "/5.png",
      "/1.png",
      "/2.png",
    ]);
    expect(plan.editList.shots.map((slot) => slot.frames)).toEqual([
      450, 450, 450, 450, 450, 450, 300,
    ]);
    expect(plan.editList.shots.reduce((sum, slot) => sum + slot.frames, 0)).toBe(plan.totalFrames);
  });

  it("cuts the last slot to what is left, never below one frame", () => {
    const plan = planRender(
      input({ body: { path: "/b.mp3", seconds: 30 + 1 / 30 }, images: five }),
    );
    expect(plan.editList.shots.map((slot) => slot.frames)).toEqual([450, 450, 1]);
  });

  it("keeps a whole number of slots when the timeline divides evenly", () => {
    const plan = planRender(input({ body: { path: "/b.mp3", seconds: 45 }, images: five }));
    expect(plan.editList.shots.map((slot) => slot.frames)).toEqual([450, 450, 450]);
  });

  it("holds a 108-minute narration to its slots rather than 21 minutes an image", () => {
    const plan = planRender(input({ body: { path: "/b.mp3", seconds: 108 * 60 }, images: five }));
    expect(plan.editList.shots).toHaveLength(432);
    expect(Math.max(...plan.editList.shots.map((slot) => slot.frames))).toBe(450);
  });

  it("gives a timeline shorter than one slot a single slot", () => {
    const plan = planRender(input({ body: { path: "/b.mp3", seconds: 4 }, images: five }));
    expect(plan.editList.shots).toEqual([
      {
        source: { kind: "image", path: "/1.png" },
        frames: 120,
        motion: { kind: "zoom", direction: "in", percent: 22.5 },
      },
    ]);
  });

  it("alternates the zoom per slot, so a returning image may zoom the other way", () => {
    const plan = planRender(
      input({ body: { path: "/b.mp3", seconds: 60 }, images: ["/a.png", "/b.png", "/c.png"] }),
    );
    expect(plan.editList.shots.map((slot) => `${slot.source.path}:${moves(slot)}`)).toEqual([
      "/a.png:in",
      "/b.png:out",
      "/c.png:in",
      "/a.png:out",
    ]);
  });

  it("uses the seconds it is given", () => {
    const plan = planRender(input({ imageSeconds: 4 }));
    // 10 s at 4 s a slot: 120, 120 and a 60-frame third.
    expect(plan.editList.shots.map((slot) => slot.frames)).toEqual([120, 120, 60]);
    expect(plan.imageSeconds).toBe(4);
  });

  it("gives a single image every slot", () => {
    const plan = planRender(
      input({ body: { path: "/b.mp3", seconds: 40 }, images: ["/only.png"] }),
    );
    expect(plan.editList.shots.map((slot) => [slot.source.path, slot.frames, moves(slot)])).toEqual(
      [
        ["/only.png", 450, "in"],
        ["/only.png", 450, "out"],
        ["/only.png", 300, "in"],
      ],
    );
  });

  it("refuses to plan a render with no images", () => {
    expect(() => planRender(input({ images: [] }))).toThrow(/at least one image/);
  });
});

describe("the zoom range", () => {
  it("builds each end from whole thousandths, never float arithmetic", () => {
    expect(zoomRange(22.5)).toEqual({ from: "1", to: "1.225", by: "0.225" });
    expect(zoomRange(10)).toEqual({ from: "1", to: "1.1", by: "0.1" });
    expect(zoomRange(0.5)).toEqual({ from: "1", to: "1.005", by: "0.005" });
    expect(zoomRange(50)).toEqual({ from: "1", to: "1.5", by: "0.5" });
  });

  it("has none at 0%, so the stills stay still", () => {
    expect(zoomRange(0)).toBeUndefined();
  });

  it("is recorded in the plan", () => {
    expect(planRender(input({ zoomPercent: 10 })).zoomPercent).toBe(10);
  });
});

describe("the edit list", () => {
  it("is versioned plain JSON that reads back as itself", () => {
    const plan = planRender(
      input({ motionStyle: "mixed", intro: { path: "/p/i.mp3", seconds: 2 } }),
    );
    expect(plan.editList.version).toBe(editListVersion);
    expect(Object.keys(plan.editList)).toEqual([
      "version",
      "width",
      "height",
      "fps",
      "audio",
      "shots",
    ]);
    const recorded = JSON.parse(JSON.stringify(plan.editList));
    expect(recorded).toEqual(plan.editList);
    expect(readEditList(recorded)).toEqual(plan.editList);
  });

  it("is the same every time for the same project", () => {
    for (const motionStyle of ["zoom", "pan", "mixed", "still"] as const) {
      const long = input({ motionStyle, body: { path: "/b.mp3", seconds: 600 } });
      expect(JSON.stringify(planRender(long))).toBe(JSON.stringify(planRender(long)));
    }
  });

  it("refuses a list from another version, saying what to do", () => {
    const list = { ...planRender(input()).editList, version: 2 };
    expect(() => readEditList(list)).toThrow(
      "This video's edit list is version 2, and this Slopify reads version 1. Update Slopify, or use Re-run section on Video to plan it again.",
    );
    expect(() => readEditList(null)).toThrow(/version undefined/);
  });

  it("refuses a damaged list or one with a kind it does not know", () => {
    const list = planRender(input()).editList;
    const unknown = { ...list, shots: [{ ...list.shots[0], motion: { kind: "spin" } }] };
    expect(() => readEditList(unknown)).toThrow(/edit list is damaged \(shots\.0\.motion\.kind/);
    const offFrame = {
      ...list,
      shots: [
        {
          ...list.shots[0],
          motion: { kind: "pan", from: { x: 0, y: 0.5 }, to: { x: 2, y: 0.5 }, percent: 10 },
        },
      ],
    };
    expect(() => readEditList(offFrame)).toThrow(/shots\.0\.motion\.to\.x/);
  });
});

describe("the motion styles", () => {
  const eight = input({ body: { path: "/b.mp3", seconds: 8 * 15 } });
  const run = (over: Partial<PlanInput>) =>
    planRender({ ...eight, ...over }).editList.shots.map(moves);

  it("zooms in and out in turn by default, as every video did before the setting", () => {
    expect(run({})).toEqual(["in", "out", "in", "out", "in", "out", "in", "out"]);
  });

  it("pans across, back, down and back up in turn", () => {
    expect(run({ motionStyle: "pan" })).toEqual([
      "left>right",
      "right>left",
      "top>bottom",
      "bottom>top",
      "left>right",
      "right>left",
      "top>bottom",
      "bottom>top",
    ]);
  });

  it("mixes by taking turns, each keeping its own alternation", () => {
    expect(run({ motionStyle: "mixed" })).toEqual([
      "in",
      "left>right",
      "out",
      "right>left",
      "in",
      "top>bottom",
      "out",
      "bottom>top",
    ]);
  });

  it("keeps every image still", () => {
    expect(new Set(run({ motionStyle: "still" }))).toEqual(new Set(["still"]));
  });

  it("pans across the centre line at the project's zoom", () => {
    const [across, , down] = planRender({ ...eight, motionStyle: "pan" }).editList.shots;
    expect(across?.motion).toEqual({
      kind: "pan",
      from: { x: 0, y: 0.5 },
      to: { x: 1, y: 0.5 },
      percent: 22.5,
    });
    expect(down?.motion).toEqual({
      kind: "pan",
      from: { x: 0.5, y: 0 },
      to: { x: 0.5, y: 1 },
      percent: 22.5,
    });
  });

  it("still pans at 0% zoom, using the minimum, while the zooms stay still", () => {
    expect(panMinimumPercent).toBe(10);
    const shots = planRender({ ...eight, motionStyle: "mixed", zoomPercent: 0 }).editList.shots;
    expect(shots[0]?.motion).toEqual({ kind: "still" });
    expect(shots[1]?.motion).toMatchObject({ kind: "pan", percent: 10 });
    expect(
      planRender({ ...eight, motionStyle: "pan", zoomPercent: 5 }).editList.shots[0]?.motion,
    ).toMatchObject({ percent: 10 });
    expect(
      planRender({ ...eight, motionStyle: "pan", zoomPercent: 30 }).editList.shots[0]?.motion,
    ).toMatchObject({ percent: 30 });
  });

  it("keeps the stills still at 0% zoom in the zoom style", () => {
    expect(new Set(run({ zoomPercent: 0 }))).toEqual(new Set(["still"]));
  });

  it("is recorded in the plan", () => {
    expect(planRender(input({ motionStyle: "pan" })).motionStyle).toBe("pan");
  });
});
