import { errorText } from "../../kernel/errors.js";
import type { Log } from "../../kernel/log.js";
import { type VideoCodec, videoCodecLabels } from "./edit-settings.js";
import { codecArgs, type NvencStatus, noNvenc, noSvtAv1, type VideoEncode } from "./encoding.js";

// Which of the computer's ffmpegs can encode what the bundled one cannot: NVENC on an NVIDIA
// card, and AV1 on the processor with SVT-AV1. Each is asked once, with a real test encode, and
// remembered until Slopify restarts.

// Runs a program to its end and answers what it printed on stdout; throws when it fails.
export type NvencExec = (bin: string, args: readonly string[]) => Promise<string>;

export const failedNvenc = "No working NVIDIA graphics card was found on this computer.";
const failedSvtAv1 = "No working ffmpeg with SVT-AV1 (libsvtav1) was found on this computer.";

// The renders' own settings on a tiny picture: a driver or card that refuses any of them fails
// here rather than in a render. NVENC refuses anything under about 145 pixels across.
function testArgs(encode: VideoEncode): string[] {
  return [
    "-hide_banner",
    "-nostdin",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=black:s=256x256:r=30:d=0.1",
    "-frames:v",
    "1",
    ...codecArgs(encode, "final", undefined),
    "-f",
    "null",
    "-",
  ];
}

// The filters a render runs in the computer's ffmpeg besides the encoder.
const neededFilters = ["zoompan", "perspective", "fillborders", "xfade", "ass"];

interface ProbeDeps {
  readonly candidates: readonly string[];
  readonly exec: NvencExec;
  readonly log: Log;
}

// Which ffmpeg can encode on an NVIDIA card. The bundled ffmpeg first, then the computer's own:
// unlike everything else, NVENC is the computer's (its driver and its ffmpeg), and only used
// when chosen in Settings. Asked for HEVC or AV1, the card that passed for H.264 is tested again
// with that codec's encoder, since older cards have no AV1 and the oldest no HEVC.
export function createNvencProbe(deps: ProbeDeps): (codec?: VideoCodec) => Promise<NvencStatus> {
  const answers = new Map<VideoCodec, Promise<NvencStatus>>();
  const ask = (codec: VideoCodec): Promise<NvencStatus> => {
    let answer = answers.get(codec);
    if (answer === undefined) {
      answer = (
        codec === "h264"
          ? probe(deps, {
              label: "NVENC",
              encoders: ["h264_nvenc"],
              test: (bin) => testArgs({ kind: "nvenc", bin, clipSpeed: "thorough" }),
              none: noNvenc,
              failed: failedNvenc,
            })
          : ask("h264").then((card) => cardCodec(deps, card, codec))
      ).catch((error: unknown) => ({
        available: false as const,
        reason: noNvenc,
        detail: errorText(error),
      }));
      answers.set(codec, answer);
    }
    return answer;
  };
  return (codec = "h264") => ask(codec);
}

async function cardCodec(
  deps: ProbeDeps,
  card: NvencStatus,
  codec: "hevc" | "av1",
): Promise<NvencStatus> {
  if (!card.available) return card;
  try {
    await deps.exec(
      card.bin,
      testArgs({ kind: "nvenc", bin: card.bin, clipSpeed: "thorough", codec }),
    );
    return card;
  } catch (error) {
    const detail = `the ${codec}_nvenc test encode through ${card.bin} failed: ${errorText(error)}`;
    deps.log.write("info", "video.encoder", { detail });
    return {
      available: false,
      reason: `This NVIDIA graphics card can't encode ${videoCodecLabels[codec]}.`,
      detail,
    };
  }
}

// Which ffmpeg encodes AV1 on the processor with SVT-AV1. It also encodes the clips that are
// decoded again under captions, which stay H.264, so it needs x264 as well.
export function createSvtAv1Probe(deps: ProbeDeps): () => Promise<NvencStatus> {
  let answer: Promise<NvencStatus> | undefined;
  return () => {
    answer ??= probe(deps, {
      label: "SVT-AV1",
      encoders: ["libsvtav1", "libx264"],
      test: (bin) => testArgs({ kind: "svtav1", bin, clipSpeed: "thorough" }),
      none: noSvtAv1,
      failed: failedSvtAv1,
    }).catch((error: unknown) => ({
      available: false as const,
      reason: noSvtAv1,
      detail: errorText(error),
    }));
    return answer;
  };
}

async function probe(
  deps: ProbeDeps,
  want: {
    // The first encoder is the one looked for; the rest are needed beside it.
    readonly label: string;
    readonly encoders: readonly [string, ...string[]];
    readonly test: (bin: string) => readonly string[];
    readonly none: string;
    readonly failed: string;
  },
): Promise<NvencStatus> {
  const listed = (output: string, name: string): boolean =>
    new RegExp(`^\\s*V\\S*\\s+${name}\\s`, "m").test(output);
  let failed: string | undefined;
  for (const bin of new Set(deps.candidates)) {
    const encoders = await deps.exec(bin, ["-hide_banner", "-encoders"]).catch(() => "");
    if (!listed(encoders, want.encoders[0])) continue;
    const lacking = want.encoders.slice(1).filter((name) => !listed(encoders, name));
    if (lacking.length > 0) {
      failed = `the ffmpeg at ${bin} has ${want.label} but not the ${lacking.join(", ")} encoder a video needs`;
      continue;
    }
    const filters = await deps.exec(bin, ["-hide_banner", "-filters"]).catch(() => "");
    const missing = neededFilters.filter(
      (name) => !new RegExp(`^\\s*\\S+\\s+${name}\\s`, "m").test(filters),
    );
    if (missing.length > 0) {
      failed = `the ffmpeg at ${bin} has ${want.label} but not the ${missing.join(", ")} filter a video needs`;
      continue;
    }
    try {
      await deps.exec(bin, want.test(bin));
      deps.log.write("info", "video.encoder", { detail: `${want.label} works through ${bin}` });
      return { available: true, bin };
    } catch (error) {
      failed = `the ffmpeg at ${bin} lists ${want.label} but its test encode failed: ${errorText(error)}`;
    }
  }
  if (failed !== undefined) {
    deps.log.write("info", "video.encoder", { detail: failed });
    return { available: false, reason: want.failed, detail: failed };
  }
  return { available: false, reason: want.none };
}
