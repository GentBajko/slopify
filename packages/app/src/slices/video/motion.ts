import type { MotionStyle } from "../admission/model.js";
import type { Motion, Point } from "./edit-list.js";

// floor: a pan needs room to travel, and a crop of 100% leaves none. Below 10% the
// travel is a few percent of the frame over the whole shot, which reads as a wobble
// rather than a pan, so a pan uses the project's zoom or 10%, whichever is more; with
// Zoom (%) at 0 the pans still move and zoom motions keep the still still.
export const panMinimumPercent = 10;

const left: Point = { x: 0, y: 0.5 };
const right: Point = { x: 1, y: 0.5 };
const top: Point = { x: 0.5, y: 0 };
const bottom: Point = { x: 0.5, y: 1 };
// The order the pans take turns in: across one way, back, down, back up.
const pans: readonly (readonly [Point, Point])[] = [
  [left, right],
  [right, left],
  [top, bottom],
  [bottom, top],
];

// The motion for the slot at `at` (0-based) of the timeline. Everything turns on the
// slot's place and nothing else, so the same project plans the same list every time and
// a re-render is identical. Zoom: in, out, in, ... Pan: the four directions above in
// turn. Mixed: zoom and pan take turns, each keeping its own alternation, so the slots
// run zoom in, pan left to right, zoom out, pan right to left, zoom in, pan top to
// bottom, ...
export function motionFor(style: MotionStyle, at: number, zoomPercent: number): Motion {
  switch (style) {
    case "still":
      return { kind: "still" };
    case "zoom":
      return zoom(at, zoomPercent);
    case "pan":
      return pan(at, zoomPercent);
    case "mixed":
      return at % 2 === 0 ? zoom(at / 2, zoomPercent) : pan((at - 1) / 2, zoomPercent);
  }
}

function zoom(turn: number, percent: number): Motion {
  // Rounded to the half steps admission allows, which is what the renderer can write
  // exactly; 0% is no zoom at all.
  const halves = Math.round(percent * 2);
  if (halves <= 0) return { kind: "still" };
  return { kind: "zoom", direction: turn % 2 === 0 ? "in" : "out", percent: halves / 2 };
}

function pan(turn: number, percent: number): Motion {
  const [from, to] = pans[turn % pans.length] ?? [left, right];
  return {
    kind: "pan",
    from,
    to,
    percent: Math.max(Math.round(percent * 2) / 2, panMinimumPercent),
  };
}
