import type { BuiltInBed } from "./ambient-bed.js";
import type { AmbientBed } from "./edit-list.js";

// How the join mixes the ambient bed under the narration (`ffmpeg.ts`). Every value goes into
// an argument array, never a shell string.
//
// The built-in beds are shaped noise, made by ffmpeg's own anoisesrc with a fixed seed, so the
// same settings always render the same sound and nothing is downloaded or shipped:
// - rain: pink noise with the rumble and the fizz filtered off, a steady patter;
// - wind: brown noise kept low, swelling and dropping in slow gusts;
// - fire: a low brown-noise roar that flickers, with sparse velvet-noise crackle over it.
// Each is levelled to about -20 dBFS RMS before the bed's own level, so 0 dB is roughly as loud
// as a narration and the three sit alike at the same setting.
//
// The ducking is a sidechain compressor keyed by the narration itself, the Shorts' music does
// the same (`shorts/render.ts`): it follows the voice as it is, needs no word timing (which a
// run without captions, chapters or shorts never makes), and dips under an intro or outro too.
// ceiling: it dips once the voice passes about -34 dBFS, by up to 8:1, over 40 ms, and comes
// back over 900 ms after the voice stops: slower than the shorts' music, so a bed under a long
// narration settles rather than swelling in every pause between sentences.
const duck = "threshold=0.02:ratio=8:attack=40:release=900:makeup=1";

interface NoiseLayer {
  readonly source: string;
  readonly filters: string;
}

const presets: Readonly<Record<BuiltInBed, readonly NoiseLayer[]>> = {
  rain: [{ source: "anoisesrc=c=pink:a=1:seed=17", filters: "highpass=f=600,lowpass=f=9000" }],
  wind: [
    {
      source: "anoisesrc=c=brown:a=1:seed=29",
      filters: "highpass=f=60,lowpass=f=500,tremolo=f=0.15:d=0.6,volume=-1dB",
    },
  ],
  fire: [
    {
      source: "anoisesrc=c=brown:a=1:seed=41",
      filters: "highpass=f=80,lowpass=f=800,tremolo=f=6:d=0.25,volume=-3dB",
    },
    {
      source: "anoisesrc=c=velvet:a=1:seed=43",
      filters: "highpass=f=1500,lowpass=f=6000,volume=-22dB",
    },
  ],
};

// The inputs the bed adds after the join's own, for `seconds` of video.
export function bedInputs(bed: AmbientBed, seconds: number, sampleRate: number): string[] {
  if (bed.source.kind === "file")
    // Looped endlessly and cut to the video, so a file shorter than the video plays again.
    return ["-stream_loop", "-1", "-i", bed.source.path];
  return presets[bed.source.preset].flatMap((layer) => [
    "-f",
    "lavfi",
    "-t",
    seconds.toFixed(6),
    "-i",
    `${layer.source}:r=${String(sampleRate)}`,
  ]);
}

// The chains that turn the join's narration `voice` into `out` with the bed under it; `first`
// is the index of the bed's first input.
export function bedChains(
  bed: AmbientBed,
  first: number,
  seconds: number,
  format: string,
  voice: string,
  out: string,
): string[] {
  const chains: string[] = [];
  const layers = bed.source.kind === "file" ? [{ filters: "" }] : presets[bed.source.preset];
  layers.forEach((layer, at) => {
    chains.push(
      `[${String(first + at)}:a]${layer.filters === "" ? "" : `${layer.filters},`}${format},atrim=end=${seconds.toFixed(6)},asetpts=PTS-STARTPTS[bed${String(at)}]`,
    );
  });
  const joined =
    layers.length === 1
      ? "[bed0]anull"
      : `${layers.map((_layer, at) => `[bed${String(at)}]`).join("")}amix=inputs=${String(layers.length)}:duration=first:normalize=0`;
  const fadeIn = bed.fadeInSeconds > 0 ? `,afade=t=in:st=0:d=${bed.fadeInSeconds.toFixed(3)}` : "";
  // A tail of 0 still fades, over a moment, rather than cutting off mid-sound.
  const fadeOut = `,afade=t=out:st=${bed.fadeOutAt.toFixed(6)}:d=${Math.max(0.25, bed.fadeOutSeconds).toFixed(3)}`;
  chains.push(`${joined},volume=${String(bed.levelDb)}dB${fadeIn}${fadeOut}[bed]`);
  chains.push(`${voice}asplit=2[voice][key]`);
  chains.push(`[bed][key]sidechaincompress=${duck}[ducked]`);
  // The narration keeps its level; `normalize=0` stops amix halving both.
  chains.push(`[voice][ducked]amix=inputs=2:duration=first:dropout_transition=0:normalize=0${out}`);
  return chains;
}
