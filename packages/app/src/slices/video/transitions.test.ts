import { describe, expect, it } from "vitest";
import type { Shot } from "./edit-list.js";
import { segments, transitionHalves, withTransitions } from "./transitions.js";

const shot = (frames: number, path = "/a.png"): Shot => ({
  source: { kind: "image", path },
  frames,
  motion: { kind: "still" },
});

describe("transitionHalves", () => {
  it("takes the odd frame from the shot after", () => {
    expect(transitionHalves(18)).toEqual({ tail: 9, head: 9 });
    expect(transitionHalves(7)).toEqual({ tail: 3, head: 4 });
  });
});

describe("withTransitions", () => {
  it("gives every shot but the first the transition", () => {
    const planned = withTransitions([shot(90), shot(90), shot(90)], "crossfade", 18);
    expect(planned.map((one) => one.transition)).toEqual([
      undefined,
      { kind: "crossfade", frames: 18 },
      { kind: "crossfade", frames: 18 },
    ]);
  });

  it("shortens it where a shot is too short, and cuts where under two frames would be left", () => {
    const planned = withTransitions([shot(90), shot(9), shot(90), shot(2)], "wipe", 18);
    expect(planned.map((one) => one.transition?.frames)).toEqual([undefined, 4, 4, undefined]);
  });
});

describe("segments", () => {
  it("plays every frame of the timeline once, with the transitions between the shots", () => {
    for (const lengths of [[90, 90, 90], [90, 9, 90, 2, 45], [1], [300, 31, 17, 400]]) {
      for (const frames of [2, 7, 18, 60]) {
        const planned = withTransitions(
          lengths.map((length) => shot(length)),
          "fadeblack",
          frames,
        );
        const played = segments(planned);
        const total = lengths.reduce((sum, one) => sum + one, 0);
        expect(played.reduce((sum, one) => sum + one.count, 0)).toBe(total);
        // Back to back: each clip starts where the one before ended.
        let at = 0;
        for (const one of played) {
          expect(one.start).toBe(at);
          expect(one.count).toBeGreaterThan(0);
          at += one.count;
        }
      }
    }
  });

  it("takes the transition's frames from the two shots it joins", () => {
    const played = segments(withTransitions([shot(90), shot(90)], "slide", 18));
    expect(played).toEqual([
      { kind: "shot", shot: 0, from: 0, count: 81, start: 0 },
      { kind: "transition", from: 0, to: 1, count: 18, start: 81 },
      { kind: "shot", shot: 1, from: 9, count: 81, start: 99 },
    ]);
  });

  it("is the shots themselves without transitions", () => {
    expect(segments([shot(30), shot(45)])).toEqual([
      { kind: "shot", shot: 0, from: 0, count: 30, start: 0 },
      { kind: "shot", shot: 1, from: 0, count: 45, start: 30 },
    ]);
  });
});
