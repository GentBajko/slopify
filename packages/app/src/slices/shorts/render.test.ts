import { expect, it } from "vitest";
import { shortAudioArgs, shortEditList } from "./render.js";

const timeline = [
  { kind: "edge" as const, path: null, seconds: 1 },
  { kind: "body" as const, path: "/body.wav", seconds: 40 },
];

function filter(args: readonly string[]): string {
  return args[args.indexOf("-filter_complex") + 1] ?? "";
}

it("cuts the clip's sound as before when no speed or music is set", () => {
  const args = shortAudioArgs(timeline, 0.5, 20.5, "/clip.wav");
  expect(args).toEqual(shortAudioArgs(timeline, 0.5, 20.5, "/clip.wav", { speed: 1 }));
  expect(filter(args)).toBe(
    "[0:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a0];[1:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a1];[a0][a1]concat=n=2:v=0:a=1[joined];[joined]atrim=start=0.500000:end=20.500000,asetpts=PTS-STARTPTS[a]",
  );
});

it("speeds the narration up with its pitch kept", () => {
  expect(filter(shortAudioArgs(timeline, 0.5, 20.5, "/clip.wav", { speed: 1.25 }))).toMatch(
    /atrim=start=0\.500000:end=20\.500000,asetpts=PTS-STARTPTS,atempo=1\.2500\[a\]$/,
  );
});

it("loops the music to the clip, fades it, and ducks it under the narration", () => {
  const args = shortAudioArgs(timeline, 0.5, 20.5, "/clip.wav", {
    speed: 1.25,
    music: { path: "/music.mp3", volume: 15 },
  });
  // Looped endlessly as the third input, after the two narration segments.
  expect(args.slice(args.indexOf("/music.mp3") - 3, args.indexOf("/music.mp3") + 1)).toEqual([
    "-stream_loop",
    "-1",
    "-i",
    "/music.mp3",
  ]);
  const chains = filter(args).split(";");
  // 20 s of narration at 1.25× is 16 s of short: the music is cut there, at 15% of its level,
  // fading in over the first second and out over the last two.
  expect(chains).toContain(
    "[joined]atrim=start=0.500000:end=20.500000,asetpts=PTS-STARTPTS,atempo=1.2500,asplit=2[voice][key]",
  );
  expect(chains).toContain(
    "[2:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,atrim=end=16.000000,asetpts=PTS-STARTPTS,volume=0.1500,afade=t=in:st=0:d=1,afade=t=out:st=14.000000:d=2[bed]",
  );
  // The narration is the key that pushes the music down while it speaks.
  expect(chains).toContain(
    "[bed][key]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=400:makeup=1[ducked]",
  );
  expect(chains.at(-1)).toBe(
    "[voice][ducked]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]",
  );
});

it("holds each image for its share of the clip, whatever the speed", () => {
  const shots = (seconds: number, imageSeconds: number) =>
    shortEditList({
      audioPath: "/clip.wav",
      seconds,
      images: ["/1.png", "/2.png", "/3.png"],
      imageSeconds,
      motionStyle: "still",
      zoomPercent: 0,
    }).shots.map((shot) => shot.frames);
  // 25 s at 10 s per image, and the same clip at 1.25×: three images either way, each a
  // fifth shorter.
  expect(shots(25, 10)).toEqual([300, 300, 150]);
  expect(shots(20, 8)).toEqual([240, 240, 120]);
});
