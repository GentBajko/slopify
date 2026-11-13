import { describe, expect, it } from "vitest";
import type { Motion } from "./edit-list.js";
import { moveOf } from "./move.js";

const frame = { width: 1920, height: 1080 };
const zoomIn: Motion = { kind: "zoom", direction: "in", percent: 22.5 };
const zoomOut: Motion = { ...zoomIn, direction: "out" };
const pan = (from: [number, number], to: [number, number], percent = 22.5): Motion => ({
  kind: "pan",
  from: { x: from[0], y: from[1] },
  to: { x: to[0], y: to[1] },
  percent,
});
// The stills an image model makes, under the frame; a photograph, over it.
const made = { width: 1672, height: 941 };
const photo = { width: 4000, height: 2250 };

// `perspective`'s corners for a window of `w` by `h` whose top left is at `x`, `y`.
const corners = (x: string, y: string, w: string, h: string): string =>
  `x0='${x}':y0='${y}':x1='${x}+${w}':y1='${y}':x2='${x}':y2='${y}+${h}':x3='${x}+${w}':y3='${y}+${h}'`;

describe("moveOf", () => {
  it("leaves a still shot and a move of 0% alone", () => {
    expect(moveOf(frame, { kind: "still" }, 150, "on", made)).toBeUndefined();
    expect(moveOf(frame, { ...zoomIn, percent: 0 }, 150, "on", made)).toBeUndefined();
    expect(moveOf(frame, pan([0, 0.5], [1, 0.5], 0), 150, "on", made)).toBeUndefined();
  });

  it("samples a still with no more pixels than the frame from a base under the frame", () => {
    const z = "(1+0.225*on/149)";
    expect(moveOf(frame, zoomIn, 150, "on", made)).toEqual({
      base: { width: 1760, height: 990 },
      // The base sits top left of the frame; the window fills the frame.
      canvas: { width: 1920, height: 1080 },
      quad: corners(`(1760-1760/${z})/2`, `(990-990/${z})/2`, `1760/${z}`, `990/${z}`),
    });
  });

  it("samples a larger still from a base clear above the zoom, the frame top left of it", () => {
    const z = "(1+0.225*on/149)";
    expect(moveOf(frame, zoomIn, 150, "on", photo)).toEqual({
      base: { width: 2496, height: 1404 },
      canvas: { width: 2496, height: 1404 },
      quad: corners(
        `(2496-2496/${z})/2`,
        `(1404-1404/${z})/2`,
        `2496/${z}*2496/1920`,
        `1404/${z}*1404/1080`,
      ),
    });
  });

  it("treats a still whose size is unknown as a large one, so no detail is lost", () => {
    expect(moveOf(frame, zoomIn, 150, "on", undefined)?.base).toEqual({
      width: 2496,
      height: 1404,
    });
  });

  it("judges a still by the pixels the frame shows of it, whatever its shape", () => {
    const base = (still: { width: number; height: number }) =>
      moveOf(frame, zoomIn, 150, "on", still)?.base.width;
    // Cropped to the frame's shape, each of these is 1672 across or less.
    expect(base({ width: 1672, height: 3000 })).toBe(1760);
    expect(base({ width: 4000, height: 941 })).toBe(1760);
    expect(base({ width: 1760, height: 990 })).toBe(1760);
    // A still the size of the frame has more than the small base holds.
    expect(base({ width: 1920, height: 1080 })).toBe(2496);
    expect(base({ width: 1762, height: 992 })).toBe(2496);
  });

  it("keeps each base the frame's own shape with even sides", () => {
    const bases = (size: { width: number; height: number }) => [
      moveOf(size, zoomIn, 150, "on", { width: 1, height: 1 })?.base,
      moveOf(size, zoomIn, 150, "on", undefined)?.base,
    ];
    expect(bases({ width: 1080, height: 1920 })).toEqual([
      { width: 990, height: 1760 },
      { width: 1404, height: 2496 },
    ]);
    expect(bases({ width: 320, height: 180 })).toEqual([
      { width: 288, height: 162 },
      { width: 416, height: 234 },
    ]);
    expect(bases({ width: 1080, height: 1080 })).toEqual([
      { width: 992, height: 992 },
      { width: 1390, height: 1390 },
    ]);
  });

  it("sizes the larger base by the shot's own zoom", () => {
    expect(moveOf(frame, { ...zoomIn, percent: 10 }, 150, "on", photo)?.base).toEqual({
      width: 2240,
      height: 1260,
    });
  });

  it("zooms out from the far end, and holds on a one-frame shot rather than dividing by zero", () => {
    const window = (motion: Motion, frames: number) =>
      /x1='[^']*\+1760\/([^']+)'/.exec(moveOf(frame, motion, frames, "on", made)?.quad ?? "")?.[1];
    expect(window(zoomOut, 150)).toBe("(1.225-0.225*on/149)");
    expect(window({ ...zoomIn, percent: 10 }, 150)).toBe("(1+0.1*on/149)");
    expect(window(zoomIn, 1)).toBe("1");
    expect(window(zoomOut, 1)).toBe("1.225");
  });

  describe("a pan", () => {
    const at = (motion: Motion, frames = 150) => {
      const quad = moveOf(frame, motion, frames, "on", made)?.quad ?? "";
      return [/x0='([^']+)'/.exec(quad)?.[1], /y0='([^']+)'/.exec(quad)?.[1]];
    };

    it("holds the zoom and moves the window across the room it leaves", () => {
      expect(moveOf(frame, pan([0, 0.5], [1, 0.5]), 150, "on", made)?.quad).toBe(
        corners(
          "(1760-1760/1.225)*(0+1*on/149)",
          "(990-990/1.225)*(0.5)",
          "1760/1.225",
          "990/1.225",
        ),
      );
      expect(at(pan([1, 0.5], [0, 0.5]))).toEqual([
        "(1760-1760/1.225)*(1-1*on/149)",
        "(990-990/1.225)*(0.5)",
      ]);
      expect(at(pan([0.5, 0], [0.5, 1]), 450)).toEqual([
        "(1760-1760/1.225)*(0.5)",
        "(990-990/1.225)*(0+1*on/449)",
      ]);
      expect(at(pan([0.5, 1], [0.5, 0], 10))).toEqual([
        "(1760-1760/1.1)*(0.5)",
        "(990-990/1.1)*(1-1*on/149)",
      ]);
    });

    it("writes every share as exact decimal text, never float noise", () => {
      // 0.3 - 0.1 is 0.19999999999999998 in binary floating point.
      expect(at(pan([0.1, 0.7], [0.3, 0.2], 12.5))).toEqual([
        "(1760-1760/1.125)*(0.1+0.2*on/149)",
        "(990-990/1.125)*(0.7-0.5*on/149)",
      ]);
    });

    it("holds where it starts on a one-frame shot", () => {
      expect(at(pan([0, 0.5], [1, 0.5]), 1)).toEqual([
        "(1760-1760/1.225)*(0)",
        "(990-990/1.225)*(0.5)",
      ]);
    });
  });

  it("reads the shot's frame through the part of it a clip shows", () => {
    // A clip that starts 30 frames into the shot: its first frame is the shot's 31st.
    expect(moveOf(frame, zoomIn, 150, "(on+30)", made)?.quad).toContain(
      "x0='(1760-1760/(1+0.225*(on+30)/149))/2'",
    );
  });
});
