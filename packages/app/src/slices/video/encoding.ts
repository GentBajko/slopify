import { constants, setPriority } from "node:os";
import { errorText } from "../../kernel/errors.js";
import type { Log } from "../../kernel/log.js";
import type { Look } from "./edit-list.js";
import { lookEncoding } from "./look.js";

// Settings → Production defaults → Rendering: how this computer encodes a video's picture.
// They change how a video is made, never what it is, so no recipe fingerprint carries them and
// a render reads them once as it starts (`renderMachine`).
export const videoEncoders = ["cpu", "nvidia"] as const;
export type VideoEncoder = (typeof videoEncoders)[number];
export const clipEncodeSpeeds = ["thorough", "fast"] as const;
export type ClipEncodeSpeed = (typeof clipEncodeSpeeds)[number];
export const renderPriorities = ["normal", "background"] as const;
export type RenderPriority = (typeof renderPriorities)[number];

export interface RenderSettings {
  readonly videoEncoder: VideoEncoder;
  readonly clipEncodeSpeed: ClipEncodeSpeed;
  readonly renderPriority: RenderPriority;
}

// What one render encodes with. NVENC runs in its own ffmpeg (`bin`), since the bundled one
// has none; `clipSpeed` is what the processor uses should the card fail mid-render.
export type VideoEncode =
  | { readonly kind: "x264"; readonly clipSpeed: ClipEncodeSpeed }
  | { readonly kind: "nvenc"; readonly bin: string; readonly clipSpeed: ClipEncodeSpeed };

export interface RenderMachine {
  readonly encode: VideoEncode;
  readonly priority: RenderPriority;
}

// Today's render: x264 at its default preset, at normal priority.
export const defaultEncode: VideoEncode = { kind: "x264", clipSpeed: "thorough" };

// Clips that are joined by copying get the final encode's settings. Clips that will be decoded
// again under burned-in captions are kept closer to the source, so the second encode is not a
// visible second generation.
const intermediateCrf = "16";

// measured on two minutes of a real project (changelog.d/2026-10-13-render-settings.md): 20
// matches CRF 16's quality for the clips under captions; 28.5 makes the finished video about the
// size CRF 23 does, where NVENC scores about 2.5 VMAF below x264 (no NVENC setting tried closed
// that gap at that size).
export const nvencQuality = { intermediate: 20, final: 28.5 } as const;

// `final` is a picture someone watches (a clip joined by copying, a burned-in part, the join);
// `intermediate` is a clip decoded again under burned-in captions.
export function codecArgs(
  encode: VideoEncode,
  role: "intermediate" | "final",
  look: Look | undefined,
): string[] {
  if (encode.kind === "nvenc")
    return [
      "-c:v",
      "h264_nvenc",
      // The slowest, best preset, constant quality with no bitrate cap. No `-multipass`: measured,
      // a second full-resolution pass gave no better picture for its size on these videos.
      "-preset",
      "p7",
      "-tune",
      "hq",
      "-rc",
      "vbr",
      "-cq",
      String(nvencQuality[role]),
      "-b:v",
      "0",
      // x264's own keyframe interval, so a clip opens on its one keyframe as x264's do and the
      // clips still join by copying.
      "-g",
      "250",
      "-pix_fmt",
      "yuv420p",
    ];
  return [
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    ...lookEncoding(look),
    ...(role === "intermediate"
      ? [...(encode.clipSpeed === "fast" ? ["-preset", "veryfast"] : []), "-crf", intermediateCrf]
      : []),
  ];
}

export type NvencStatus =
  | { readonly available: true; readonly bin: string }
  | { readonly available: false; readonly reason: string };

// Runs a program to its end and answers what it printed on stdout; throws when it fails.
export type NvencExec = (bin: string, args: readonly string[]) => Promise<string>;

export const noNvenc = "No NVIDIA encoder found on this computer.";

// The renders' own settings on a tiny picture: a driver or card that refuses any of them fails
// here rather than in a render. NVENC refuses anything under about 145 pixels across.
const testArgs = [
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
  ...codecArgs({ kind: "nvenc", bin: "", clipSpeed: "thorough" }, "final", undefined),
  "-f",
  "null",
  "-",
];

// The filters a render runs in the NVENC ffmpeg besides the encoder.
const neededFilters = ["zoompan", "xfade", "ass"];

// Which ffmpeg can encode on an NVIDIA card, asked once and remembered until Slopify restarts.
// The bundled ffmpeg first, then the computer's own: unlike everything else, NVENC is the
// computer's (its driver and its ffmpeg), and only used when chosen in Settings.
export function createNvencProbe(deps: {
  readonly candidates: readonly string[];
  readonly exec: NvencExec;
  readonly log: Log;
}): () => Promise<NvencStatus> {
  let answer: Promise<NvencStatus> | undefined;
  return () => {
    answer ??= probe(deps).catch((error: unknown) => ({
      available: false as const,
      reason: `${noNvenc} (${errorText(error)})`,
    }));
    return answer;
  };
}

async function probe(deps: {
  readonly candidates: readonly string[];
  readonly exec: NvencExec;
  readonly log: Log;
}): Promise<NvencStatus> {
  let failed: string | undefined;
  for (const bin of new Set(deps.candidates)) {
    const encoders = await deps.exec(bin, ["-hide_banner", "-encoders"]).catch(() => "");
    if (!/^\s*V\S*\s+h264_nvenc\s/m.test(encoders)) continue;
    const filters = await deps.exec(bin, ["-hide_banner", "-filters"]).catch(() => "");
    const missing = neededFilters.filter(
      (name) => !new RegExp(`^\\s*\\S+\\s+${name}\\s`, "m").test(filters),
    );
    if (missing.length > 0) {
      failed = `the ffmpeg at ${bin} has NVENC but not the ${missing.join(", ")} filter a video needs`;
      continue;
    }
    try {
      await deps.exec(bin, testArgs);
      deps.log.write("info", "video.encoder", { detail: `NVENC works through ${bin}` });
      return { available: true, bin };
    } catch (error) {
      failed = `the ffmpeg at ${bin} lists NVENC but its test encode failed: ${errorText(error)}`;
    }
  }
  if (failed !== undefined) {
    deps.log.write("info", "video.encoder", { detail: failed });
    return { available: false, reason: `${noNvenc} (${failed})` };
  }
  return { available: false, reason: noNvenc };
}

// The render's machine settings, read as it starts. A card chosen but not working is a notice,
// never a failed render: the processor encodes it instead.
export async function renderMachine(deps: {
  readonly settings: RenderSettings;
  readonly nvenc: () => Promise<NvencStatus>;
  readonly log: Log;
  readonly projectId?: string | undefined;
}): Promise<{ readonly machine: RenderMachine; readonly notice?: string }> {
  const { settings } = deps;
  const cpu: VideoEncode = { kind: "x264", clipSpeed: settings.clipEncodeSpeed };
  if (settings.videoEncoder !== "nvidia")
    return { machine: { encode: cpu, priority: settings.renderPriority } };
  const status = await deps.nvenc();
  if (status.available)
    return {
      machine: {
        encode: { kind: "nvenc", bin: status.bin, clipSpeed: settings.clipEncodeSpeed },
        priority: settings.renderPriority,
      },
    };
  deps.log.write("warn", "video.encoder", {
    projectId: deps.projectId,
    detail: `NVIDIA encoder chosen but unavailable; encoding on the processor. ${status.reason}`,
  });
  return {
    machine: { encode: cpu, priority: settings.renderPriority },
    notice: nvencFallbackNotice(status.reason),
  };
}

export function nvencFallbackNotice(reason: string): string {
  return `This video was encoded on the processor because the NVIDIA graphics card encoder didn't work (${reason.replace(/\.$/, "")}). Check the NVIDIA driver, or choose Processor (x264) in Settings → Production defaults → Video encoder.`;
}

// Background renders run below normal priority: nice 10 on Linux and macOS, the below-normal
// class on Windows. Threads ffmpeg starts afterwards inherit it. Advisory: a system that
// refuses is logged and the render carries on.
export function setRenderPriority(
  pid: number,
  priority: RenderPriority,
  log: Log,
  set: (pid: number, priority: number) => void = setPriority,
): void {
  if (priority !== "background") return;
  try {
    set(pid, constants.priority.PRIORITY_BELOW_NORMAL);
  } catch (error) {
    log.write("warn", "video.priority", {
      detail: `could not lower the render's priority: ${errorText(error)}`,
    });
  }
}
