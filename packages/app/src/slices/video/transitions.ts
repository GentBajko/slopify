import type { Shot, TransitionStyle } from "./edit-list.js";

// Transitions without a longer render. The slideshow is still encoded clip by clip and
// joined by the concat demuxer (`ffmpeg.ts`); a transition is one more short clip between
// two shots. The shot before gives up its last floor(T / 2) frames and the shot after its
// first ceil(T / 2), and the T-frame transition clip plays the first shot's picture from
// where it was cut, running on past its end, blended into the second's from half a
// transition before its start. Every frame of the timeline is still played exactly once, so
// the video stays as long as its sound.

// The frames a transition of `frames` takes from the shot before and the shot after.
export function transitionHalves(frames: number): { readonly tail: number; readonly head: number } {
  const tail = Math.floor(frames / 2);
  return { tail, head: frames - tail };
}

// Gives every shot after the first a transition of `frames` frames, shortened where a shot is
// too short to give up its share and still show at least one frame of its own, and left a
// hard cut where under two frames would remain.
export function withTransitions(
  shots: readonly Shot[],
  kind: TransitionStyle,
  frames: number,
): readonly Shot[] {
  return shots.map((shot, index) => {
    const before = shots[index - 1];
    if (before === undefined) return shot;
    const room = Math.floor((Math.min(before.frames, shot.frames) - 1) / 2);
    const length = Math.min(Math.round(frames), room);
    return length < 2 ? shot : { ...shot, transition: { kind, frames: length } };
  });
}

// One clip of the slideshow: part of one shot, or the transition into a shot.
export type Segment =
  | {
      readonly kind: "shot";
      readonly shot: number;
      // The shot's own frames this clip plays: from `from`, `count` of them.
      readonly from: number;
      readonly count: number;
      // Where the clip starts on the timeline.
      readonly start: number;
    }
  | {
      readonly kind: "transition";
      // The shot it leaves and the shot it enters; the entering one carries the transition.
      readonly from: number;
      readonly to: number;
      readonly count: number;
      readonly start: number;
    };

// The clips in timeline order, adding up to the shots' frames exactly.
export function segments(shots: readonly Shot[]): readonly Segment[] {
  const out: Segment[] = [];
  let start = 0;
  for (const [index, shot] of shots.entries()) {
    const entering = shot.transition;
    const leaving = shots[index + 1]?.transition;
    const head = entering === undefined ? 0 : transitionHalves(entering.frames).head;
    const tail = leaving === undefined ? 0 : transitionHalves(leaving.frames).tail;
    if (entering !== undefined) {
      const before = transitionHalves(entering.frames).tail;
      out.push({
        kind: "transition",
        from: index - 1,
        to: index,
        count: entering.frames,
        start: start - before,
      });
      start += head;
    }
    const count = shot.frames - head - tail;
    out.push({ kind: "shot", shot: index, from: head, count, start });
    start += count + tail;
  }
  return out;
}
