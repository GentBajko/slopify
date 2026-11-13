import type { Motion } from "./edit-list.js";
import { decimal, zoomRange } from "./plan.js";

// How a still moves. Each frame shows a window of the still: a zoom shrinks it about the
// centre, a pan slides it across the room the zoom leaves. `perspective` reads that window
// between whole pixels, so a move of a fraction of a pixel a frame advances by that fraction.
//
// zoompan, which did this before, can only land the window on a whole source pixel, and on
// every second one once the picture is 4:2:0 as the encoder asks. On a still enlarged four
// times that is a step of 0.61 of a frame pixel: a pan of 0.46 a frame stood still and jumped
// in turn, and a zoom's centre wandered by 0.45. Enlarging further costs the square of the
// factor and only halves the step.
//
// A sampler that interpolates is sharpest where a frame pixel lands on a source pixel and
// softer between. Where it reads the still at close to one to one, those places form wide
// bands that drift as the shot moves, and fine detail breathes: with the still at the frame's
// own size, the start of a zoom measured four and a half times zoompan's change in fine detail
// from frame to frame. So the still is first brought, once, to a base that keeps the sampler
// clear of one to one for the whole shot: under the frame for a still with no more pixels
// than that base holds, so it is only ever enlarged, and above the shot's whole zoom for any
// other, so it is only ever reduced and keeps the detail a larger still has. Both measured at
// or under zoompan's own change.
const smallShare = 0.92;
const clearOfOne = 1.05;

export interface StillSize {
  readonly width: number;
  readonly height: number;
}

// Each still's own size by its path, where its header could be read (`slideshow.ts`).
export type StillSizes = ReadonlyMap<string, StillSize>;

export interface Move {
  // What the still is brought to, once, before any frame is made.
  readonly base: StillSize;
  // What the sampler works on, and so writes: the frame, a small base top left of it, or a
  // large base, the frame top left of what comes out.
  readonly canvas: StillSize;
  // `perspective`'s four source corners at the frame it is on.
  readonly quad: string;
}

// The move of a shot, or undefined for one that does not move. `at` is the shot's frame as
// the filter counts it, 0 to frames-1; a one-frame shot has no span to divide by and holds
// where it starts.
export function moveOf(
  frame: StillSize,
  motion: Motion,
  frames: number,
  at: string,
  still: StillSize | undefined,
): Move | undefined {
  if (motion.kind === "still") return undefined;
  const range = zoomRange(motion.percent);
  if (range === undefined) return undefined;
  const small = shaped(frame, smallShare, -1);
  // What the frame shows of the still is the still cropped to the frame's shape.
  const fits =
    still !== undefined &&
    Math.min(still.width, (still.height * frame.width) / frame.height) <= small.width;
  const base = fits ? small : shaped(frame, clearOfOne * Number(range.to), 1);
  const canvas = fits ? { width: frame.width, height: frame.height } : base;
  const span = frames - 1;
  const zoom =
    motion.kind === "pan"
      ? range.to
      : span < 1
        ? motion.direction === "in"
          ? range.from
          : range.to
        : motion.direction === "in"
          ? `(${range.from}+${range.by}*${at}/${String(span)})`
          : `(${range.to}-${range.by}*${at}/${String(span)})`;
  // The window is the base over the zoom, so this is the room it has to travel in.
  const room = (side: number): string => `(${String(side)}-${String(side)}/${zoom})`;
  const x =
    motion.kind === "pan"
      ? `${room(base.width)}*(${travel(motion.from.x, motion.to.x, span, at)})`
      : `${room(base.width)}/2`;
  const y =
    motion.kind === "pan"
      ? `${room(base.height)}*(${travel(motion.from.y, motion.to.y, span, at)})`
      : `${room(base.height)}/2`;
  // The corners are where the canvas's own corners read from, and the window is to fill the
  // frame: on a canvas larger than the frame they lie that much further out.
  const reach = (side: number, whole: number, shown: number): string =>
    `${String(side)}/${zoom}${whole === shown ? "" : `*${String(whole)}/${String(shown)}`}`;
  const right = `${x}+${reach(base.width, canvas.width, frame.width)}`;
  const bottom = `${y}+${reach(base.height, canvas.height, frame.height)}`;
  return {
    base,
    canvas,
    quad: `x0='${x}':y0='${y}':x1='${right}':y1='${y}':x2='${x}':y2='${bottom}':x3='${right}':y3='${bottom}'`,
  };
}

// The size nearest `share` of the frame that keeps the frame's exact shape with both sides
// even, as 4:2:0 needs: under it when `step` is -1, over it when 1.
function shaped(frame: StillSize, share: number, step: -1 | 1): StillSize {
  const unit = divisor(frame.width, frame.height);
  const across = frame.width / unit;
  const down = frame.height / unit;
  let units = Math.max(1, step === -1 ? Math.floor(share * unit) : Math.ceil(share * unit));
  while ((across * units) % 2 !== 0 || (down * units) % 2 !== 0) units += units === 1 ? 1 : step;
  return { width: across * units, height: down * units };
}

function divisor(a: number, b: number): number {
  return b === 0 ? a : divisor(b, a % b);
}

// A share of the room from `from` to `to`, linear over the shot. Built in whole thousandths
// as decimal text, like the zoom, so 1 - 0.5 reads 0.5 and never 0.49999999999999994.
function travel(from: number, to: number, span: number, at: string): string {
  const start = Math.round(from * 1000);
  const by = Math.round(to * 1000) - start;
  if (span < 1 || by === 0) return decimal(start);
  return `${decimal(start)}${by > 0 ? "+" : "-"}${decimal(Math.abs(by))}*${at}/${String(span)}`;
}
