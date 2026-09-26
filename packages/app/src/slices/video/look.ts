import type { Card, EditList, Look } from "./edit-list.js";
import type { Atmosphere, ColorGrade, LookLevel } from "./edit-settings.js";

// The Look: filters appended to each clip's picture before it is encoded, so they cost one
// pass over frames that are being made anyway and the render stays clip by clip. Everything
// is ffmpeg's own filters with fixed numbers: no footage, no LUT files, and the same project
// renders the same frames every time.
//
// The colour grade is applied to each source before its picture is built (`gradeFilter`):
// once on a still, before zoompan turns it into frames, rather than on every frame. So the
// overlay and the vignette sit on graded colour. Order matters for the rest: the atmosphere
// first; then the vignette darkens both; the chapter card is drawn on top of that
// so its text stays clean; the grain last, over everything, as film grain is.

// ceiling: the owner's eye on test renders. Subtle darkens the corners a little, strong
// makes a clear frame of shadow.
const vignetteAngle: Readonly<Record<Exclude<LookLevel, "off">, string>> = {
  subtle: "0.45",
  strong: "0.75",
};
// Temporal noise on brightness only, so the grain moves like film and never tints.
const grainStrength: Readonly<Record<Exclude<LookLevel, "off">, number>> = {
  subtle: 8,
  strong: 16,
};

// The encoder settings a Look asks for: x264 smooths fine noise away at its default tuning,
// so grain is encoded with its grain tuning. Every clip of one render has the same Look, so
// the clips still join by copying.
export function lookEncoding(look: Look | undefined): readonly string[] {
  return look !== undefined && look.grain !== "off" ? ["-tune", "grain"] : [];
}
const grades: Readonly<Record<Exclude<ColorGrade, "none">, string>> = {
  // Golden highlights, a touch of amber in the mids, cooler shadows kept for depth.
  warm:
    "colorbalance=rs=0.02:bs=0.04:rm=0.08:gm=0.02:bm=-0.07:rh=0.07:gh=0.03:bh=-0.08," +
    "eq=saturation=1.12:contrast=1.04",
  // Blue-green shadows and mids, highlights barely touched.
  cold: "colorbalance=rs=-0.06:bs=0.08:rm=-0.05:gm=0.01:bm=0.06:rh=-0.02:bh=0.03,eq=saturation=0.9",
  desaturated: "eq=saturation=0.55:contrast=1.06",
  // The classic sepia matrix.
  sepia:
    "colorchannelmixer=rr=0.393:rg=0.769:rb=0.189:gr=0.349:gg=0.686:gb=0.168:br=0.272:bg=0.534:bb=0.131",
};

// The grade as a filter for a picture's source, or undefined for none: a still is graded once,
// a clip frame by frame.
export function gradeFilter(look: Look | undefined): string | undefined {
  return look === undefined || look.grade === "none" ? undefined : grades[look.grade];
}

export function hasLook(look: Look | undefined): boolean {
  return (
    look !== undefined &&
    (look.vignette !== "off" ||
      look.grain !== "off" ||
      look.grade !== "none" ||
      look.atmosphere !== "none")
  );
}

// The cards a clip at `start` of `count` frames shows any part of.
export function cardsIn(
  cards: readonly Card[] | undefined,
  start: number,
  count: number,
): readonly Card[] {
  return (cards ?? []).filter(
    (card) => card.startFrame < start + count && card.startFrame + card.frames > start,
  );
}

// Whether a clip's pixels depend on where it sits on the timeline: an atmosphere drifts with
// the video's clock and a card is drawn at its own time, so such a clip is never reused at
// another place.
export function placed(edit: Pick<EditList, "look" | "cards">, start: number, count: number) {
  return (
    (edit.look !== undefined && edit.look.atmosphere !== "none") ||
    cardsIn(edit.cards, start, count).length > 0
  );
}

// The filters that take the clip's picture from `input` to `output`, or undefined when there
// is nothing to add. `start` is the clip's first frame on the timeline. Cards are read from
// `cardsFile`, the clip's own script with its times counted from the clip's first frame
// (`cards.ts`), and `fonts/`, both in the render's working folder.
export function lookChain(
  edit: Pick<EditList, "width" | "height" | "fps" | "look" | "cards">,
  start: number,
  count: number,
  input: string,
  output: string,
  cardsFile = "cards.ass",
): string | undefined {
  const look = edit.look;
  const steps: string[] = [];
  let at = input;
  let n = 0;
  const next = (): string => {
    n += 1;
    return `[look${String(n)}]`;
  };
  const simple = (filters: readonly string[]): void => {
    if (filters.length === 0) return;
    const label = next();
    steps.push(`${at}${filters.join(",")}${label}`);
    at = label;
  };
  if (look !== undefined && look.atmosphere !== "none") {
    const texture = next();
    const blended = next();
    steps.push(`${atmosphereSource(edit, look.atmosphere, start)}${texture}`);
    // Laid over the picture by its alpha, in the picture's own YUV: converting every frame
    // to RGB for a screen blend doubled a clip's render time.
    steps.push(`${at}${texture}overlay=shortest=1:format=yuv420${blended}`);
    at = blended;
  }
  const after: string[] = [];
  if (look !== undefined && look.vignette !== "off")
    after.push(`vignette=angle=${vignetteAngle[look.vignette]}`);
  if (cardsIn(edit.cards, start, count).length > 0)
    after.push(`ass=filename=${cardsFile}:fontsdir=fonts`);
  if (look !== undefined && look.grain !== "off")
    after.push(`noise=c0s=${String(grainStrength[look.grain])}:c0f=t+u`);
  simple(after);
  if (steps.length === 0) return undefined;
  const last = steps.length - 1;
  steps[last] = `${(steps[last] ?? "").slice(0, -at.length)}${output}`;
  return steps.join(";");
}

const atmosphereOpacity: Readonly<Record<Exclude<Atmosphere, "none">, string>> = {
  embers: "1",
  dust: "0.6",
  fog: "1",
};

// A still texture made once per clip, then moved: embers rise and drift left, dust wanders,
// fog rolls sideways along the bottom of the frame. `scroll` wraps the texture round, which
// leaves no seam for sparse specks, and the fog is mirrored side to side first so its wrap
// has none either. The scroll starts where the timeline has it at the clip's first frame, so
// the overlay runs on unbroken across cuts.
//
// The specks come from ffmpeg's `noise` (geq's random() repeats in visible columns): one
// grey level of uniform noise marks about 1% of the pixels, and multiplying by a second,
// flipped noise field thins them and varies their brightness. Everything is fixed numbers,
// so the texture is the same on every run.
function atmosphereSource(
  frame: Pick<EditList, "width" | "height" | "fps">,
  atmosphere: Exclude<Atmosphere, "none">,
  start: number,
): string {
  const { width, height, fps } = frame;
  const size = `${String(width)}x${String(height)}`;
  const grid = (divisor: number): string =>
    `${String(Math.max(2, Math.round(width / divisor)))}x${String(Math.max(2, Math.round(height / divisor)))}`;
  // A grey field of `grid` with about one pixel in a hundred lit, thinned by a second field
  // cut at `cut` and scaled by `gain`; into `label`, still the grid's size.
  const specks = (at: string, seed: number, cut: number, gain: number, label: string) =>
    `color=c=0x808080:s=${at}:r=${String(fps)}:d=1,format=gbrp,split[${label}a][${label}b];` +
    `[${label}a]noise=c0s=100:c0f=u:c0_seed=${String(seed)},lutrgb=g='if(eq(val,177),255,0)'[${label}c];` +
    `[${label}b]noise=c0s=100:c0f=u:c0_seed=${String(seed + 2)},` +
    `lutrgb=g='max(0,min(255,(val-${String(cut)})*${String(gain)}))',hflip,vflip[${label}d];` +
    `[${label}c][${label}d]blend=all_mode=multiply[${label}]`;
  // The green plane carries the texture; the mixer tints it into all three.
  const tint = (r: number, g: number, b: number): string =>
    `colorchannelmixer=rr=0:rg=${String(r)}:rb=0:gr=0:gg=${String(g)}:gb=0:br=0:bg=${String(b)}:bb=0`;
  // The texture as light over a transparent frame, made once before it loops: each pixel keeps
  // its hue at full brightness, and how bright it was (times the atmosphere's strength)
  // becomes how opaque it is, which is a screen blend's look for a dark background.
  const peak = "max(r(X,Y),max(g(X,Y),b(X,Y)))";
  const lit = (plane: string): string => `if(gt(${peak},0),255*${plane}(X,Y)/${peak},0)`;
  const light =
    `format=gbrap,geq=r='${lit("r")}':g='${lit("g")}':b='${lit("b")}':` +
    `a='${peak}*${atmosphereOpacity[atmosphere]}',format=yuva420p`;
  const moving = (h: number, v: number): string =>
    `${light},loop=loop=-1:size=1,setpts=N/(${String(fps)}*TB),` +
    `scroll=h=${String(h)}:v=${String(v)}:hpos=${position(h, start)}:vpos=${position(v, start)}`;
  if (atmosphere === "embers")
    // Small sparks and a few large soft glows, orange, rising.
    return (
      `${specks(grid(4), 7, 168, 24, "es")};${specks(grid(20), 3, 142, 7, "eb")};` +
      `[es]scale=${size}:flags=bicubic,gblur=sigma=1.3,lutrgb=g='min(255,val*2.4)'[esx];` +
      `[eb]scale=${size}:flags=bicubic,gblur=sigma=14,lutrgb=g='min(255,val*6)'[ebx];` +
      `[esx][ebx]blend=all_mode=addition,${tint(1, 0.48, 0.12)},${moving(0.0003, 0.0022)}`
    );
  if (atmosphere === "dust")
    // Fine warm-white motes drifting slowly across.
    return (
      `${specks(grid(3), 17, 160, 12, "ds")};` +
      `[ds]scale=${size}:flags=bicubic,gblur=sigma=1.1,lutrgb=g='min(255,val*2)',` +
      `${tint(1, 0.95, 0.85)},${moving(0.0005, -0.00025)}`
    );
  // Soft blotches from a tiny noise field blown up and blurred, faded out towards the top.
  return (
    `color=c=0x808080:s=${grid(80)}:r=${String(fps)}:d=1,format=gbrp,` +
    "noise=c0s=100:c0f=u:c0_seed=23," +
    `scale=${size}:flags=bicubic,gblur=sigma=70,lutrgb=g='max(0,min(255,(val-95)*3.2))',` +
    "geq=r='g(X,Y)*pow(Y/H,1.6)':g='g(X,Y)*pow(Y/H,1.6)':b='g(X,Y)*pow(Y/H,1.6)'," +
    "colorchannelmixer=rr=0.92:gg=0.95:bb=1,split[fa][fb];[fb]hflip[fc];[fa][fc]hstack," +
    `${moving(0.0006, 0)},crop=${String(width)}:${String(height)}:0:0`
  );
}

// Where a texture scrolling `speed` of its size per frame has got to by frame `start`.
function position(speed: number, start: number): string {
  const travelled = (((speed * start) % 1) + 1) % 1;
  return travelled.toFixed(6);
}
