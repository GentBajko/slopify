import { constants, setPriority } from "node:os";
import { errorText } from "../../kernel/errors.js";
import type { Log } from "../../kernel/log.js";
import { bt709Tags } from "./colour.js";
import type { Look } from "./edit-list.js";
import { type VideoCodec, type VideoCodecChoice, videoCodecLabels } from "./edit-settings.js";
import { lookEncoding } from "./look.js";

// Settings → Production defaults → Rendering: how this computer encodes a video's picture.
// They change how a video is made, never what it is, so no recipe fingerprint carries them and
// a render reads them once as it starts (`renderMachine`). The finished video's codec is the
// project's (`edit-settings.ts`), and combines with them here.
export const videoEncoders = ["cpu", "nvidia"] as const;
export type VideoEncoder = (typeof videoEncoders)[number];
export const clipEncodeSpeeds = ["thorough", "fast"] as const;
export type ClipEncodeSpeed = (typeof clipEncodeSpeeds)[number];
export const renderPriorities = ["normal", "background"] as const;
export type RenderPriority = (typeof renderPriorities)[number];

// How many videos this computer renders at once. A render reads the whole picture track and
// encodes hours of it, so two at once cost more than twice one: they share the processor, the
// disk and the memory, and a long enough pair can leave the app with nothing to answer the
// page with. One at a time is the default; the rest wait their turn rather than being refused.
export const videoRenderConcurrencyMax = 4;

export interface RenderSettings {
  readonly videoEncoder: VideoEncoder;
  readonly clipEncodeSpeed: ClipEncodeSpeed;
  readonly renderPriority: RenderPriority;
  readonly videoRenderConcurrency: number;
}

// What one render encodes with. NVENC and SVT-AV1 run in their own ffmpeg (`bin`), since the
// bundled one has neither; `clipSpeed` is what the processor uses should the card fail
// mid-render. NVENC without a `codec` is H.264, as it always was.
export type VideoEncode =
  | { readonly kind: "x264"; readonly clipSpeed: ClipEncodeSpeed }
  | { readonly kind: "x265"; readonly clipSpeed: ClipEncodeSpeed }
  | { readonly kind: "svtav1"; readonly bin: string; readonly clipSpeed: ClipEncodeSpeed }
  | {
      readonly kind: "nvenc";
      readonly bin: string;
      readonly clipSpeed: ClipEncodeSpeed;
      readonly codec?: "hevc" | "av1";
    };

export interface RenderMachine {
  readonly encode: VideoEncode;
  readonly priority: RenderPriority;
  // Automatic's card AV1 only: what the render is made with, without a notice, should the card
  // fail mid-render. It is today's H.264 render.
  readonly fallback?: VideoEncode;
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

// measured on a real 3-minute stretch of a 1080p30 video, slow pan and zoom over dense
// engraving, each scoring about 94.4 VMAF against the H.264 file x264 makes today: SVT-AV1 at
// preset 6, CRF 36 is about 29% of its size at about 7x real time on 32 threads; av1_nvenc at
// CQ 34 about 44%; hevc_nvenc at CQ 27 about 59%. x265 at CRF 26 (preset medium) is not
// measured yet: a starting point expected to land near the same quality.
export const codecQuality = {
  svtav1Preset: 6,
  svtav1Crf: 36,
  av1Nvenc: 34,
  hevcNvenc: 27,
  x265Crf: 26,
} as const;

// measured on the first 24 shots of a real project, each still shown once (11.5 minutes, 32
// threads, changelog.d/2026-11-13-one-encode.md): clips that draw their own captions took
// 83 s at x264's default preset and 69 s at `faster`, for 1.2 VMAF less. That is the step
// Fast already was for clips encoded twice (118 s against 145 s, 0.7 VMAF less). `veryfast`
// cost 4.3 VMAF.
const captionedFastPreset = "faster";

// x264's own keyframe interval, so every clip, whatever its codec, opens on its one keyframe as
// x264's do and the clips still join by copying.
const keyframes = ["-g", "250"];

// HEVC in MP4 tagged hvc1 rather than hev1, which Apple's players and some browsers refuse.
const hvc1 = ["-tag:v", "hvc1"];

// `final` is a picture someone watches (a clip joined by copying, a burned-in part, the join);
// `intermediate` is a clip decoded again under burned-in captions, never watched, so it stays
// H.264 whatever the video's codec; `captioned` is a clip that draws its own captions, watched
// as it is.
export function codecArgs(
  encode: VideoEncode,
  role: "intermediate" | "final" | "captioned",
  look: Look | undefined,
): string[] {
  if (encode.kind === "nvenc") {
    const codec = role === "intermediate" ? undefined : encode.codec;
    return [
      "-c:v",
      `${codec ?? "h264"}_nvenc`,
      // The slowest, best preset, constant quality with no bitrate cap. No `-multipass`: measured,
      // a second full-resolution pass gave no better picture for its size on these videos.
      "-preset",
      "p7",
      "-tune",
      "hq",
      "-rc",
      "vbr",
      "-cq",
      String(
        codec === "hevc"
          ? codecQuality.hevcNvenc
          : codec === "av1"
            ? codecQuality.av1Nvenc
            : nvencQuality[role === "intermediate" ? "intermediate" : "final"],
      ),
      "-b:v",
      "0",
      ...keyframes,
      ...(codec === "hevc" ? hvc1 : []),
      "-pix_fmt",
      "yuv420p",
      ...bt709Tags,
    ];
  }
  if (encode.kind === "x265" || encode.kind === "svtav1") {
    if (role === "intermediate")
      return codecArgs({ kind: "x264", clipSpeed: encode.clipSpeed }, role, look);
    const common = ["-pix_fmt", "yuv420p", ...bt709Tags];
    return encode.kind === "x265"
      ? [
          "-c:v",
          "libx265",
          ...common,
          ...lookEncoding(look),
          "-preset",
          "medium",
          "-crf",
          String(codecQuality.x265Crf),
          ...keyframes,
          ...hvc1,
          // x265 reports every frame's statistics on stderr otherwise.
          "-x265-params",
          "log-level=error",
        ]
      : [
          "-c:v",
          "libsvtav1",
          ...common,
          "-preset",
          String(codecQuality.svtav1Preset),
          "-crf",
          String(codecQuality.svtav1Crf),
          ...keyframes,
        ];
  }
  const fast = encode.clipSpeed === "fast";
  return [
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    ...bt709Tags,
    ...lookEncoding(look),
    ...(role === "intermediate"
      ? [...(fast ? ["-preset", "veryfast"] : []), "-crf", intermediateCrf]
      : role === "captioned" && fast
        ? ["-preset", captionedFastPreset]
        : []),
  ];
}

// What the join adds when it copies the clips: copying keeps the codec but not its MP4 tag.
export function copyTag(encode: VideoEncode): readonly string[] {
  return encode.kind === "x265" || (encode.kind === "nvenc" && encode.codec === "hevc") ? hvc1 : [];
}

// The ffmpeg that encodes the picture: the computer's own for NVENC and SVT-AV1, else the
// bundled one.
export function encoderBin(encode: VideoEncode, bundled: string): string {
  return encode.kind === "nvenc" || encode.kind === "svtav1" ? encode.bin : bundled;
}

// Unavailable: `reason` is one plain sentence for a person, `detail` what the test printed (for
// a bug report, shown folded in Settings).
export type NvencStatus =
  | { readonly available: true; readonly bin: string }
  | { readonly available: false; readonly reason: string; readonly detail?: string };

// Said to a person who may have no NVIDIA card at all: stock ffmpeg builds list the NVIDIA
// encoder everywhere, so a failed test usually means there is no card, not a broken one. What
// the test printed goes under Details (`detail`), never into these sentences.
export const noNvenc = "No NVIDIA graphics card was found on this computer.";
export const noSvtAv1 = "No ffmpeg with SVT-AV1 (libsvtav1) was found on this computer.";

// The reason with the test's output, for the log and a run's notice.
export function nvencWhy(status: { readonly reason: string; readonly detail?: string }): string {
  return status.detail === undefined ? status.reason : `${status.reason} (${status.detail})`;
}

type Chosen = { readonly encode: VideoEncode; readonly notices: readonly string[] };

interface MachineDeps {
  readonly settings: RenderSettings;
  // Whether the card encodes `codec`; H.264 when left out (`encoder-probe.ts`).
  readonly nvenc: (codec?: VideoCodec) => Promise<NvencStatus>;
  readonly svtav1?: (() => Promise<NvencStatus>) | undefined;
  // The project's codec; shorts and the style preview leave it out and stay H.264.
  readonly codec?: VideoCodecChoice | undefined;
  readonly log: Log;
  readonly projectId?: string | undefined;
}

// The render's machine settings, read as it starts. Automatic is AV1 on the NVIDIA card
// whenever the card can encode it, whatever the Video encoder says, with today's H.264 as its
// `fallback`; without such a card it is today's H.264 render, said nowhere, since that is the
// ordinary way. An explicit encoder or codec chosen but not working is a notice, never a
// failed render: the processor encodes it instead, or H.264 does.
export async function renderMachine(
  deps: MachineDeps,
): Promise<{ readonly machine: RenderMachine; readonly notice?: string }> {
  if (deps.codec !== "auto") return chosenMachine({ ...deps, codec: deps.codec ?? "h264" });
  const today = await chosenMachine({ ...deps, codec: "h264" });
  const card = await deps.nvenc();
  if (!card.available) return today;
  const av1 = await deps.nvenc("av1");
  if (!av1.available) return today;
  return {
    machine: {
      encode: {
        kind: "nvenc",
        bin: av1.bin,
        clipSpeed: deps.settings.clipEncodeSpeed,
        codec: "av1",
      },
      priority: deps.settings.renderPriority,
      fallback: today.machine.encode,
    },
  };
}

async function chosenMachine(
  deps: MachineDeps & { readonly codec: VideoCodec },
): Promise<{ readonly machine: RenderMachine; readonly notice?: string }> {
  const { settings, codec } = deps;
  const clipSpeed = settings.clipEncodeSpeed;
  const warn = (detail: string): void =>
    deps.log.write("warn", "video.encoder", { projectId: deps.projectId, detail });
  const done = (chosen: Chosen) => ({
    machine: { encode: chosen.encode, priority: settings.renderPriority },
    ...(chosen.notices.length === 0 ? {} : { notice: chosen.notices.join(" ") }),
  });
  const cpu = async (): Promise<Chosen> => {
    if (codec === "h264") return { encode: { kind: "x264", clipSpeed }, notices: [] };
    if (codec === "hevc") return { encode: { kind: "x265", clipSpeed }, notices: [] };
    const svt = (await deps.svtav1?.()) ?? { available: false as const, reason: noSvtAv1 };
    if (svt.available) return { encode: { kind: "svtav1", bin: svt.bin, clipSpeed }, notices: [] };
    warn(`AV1 chosen but SVT-AV1 is unavailable; encoding H.264. ${nvencWhy(svt)}`);
    return { encode: { kind: "x264", clipSpeed }, notices: [svtav1FallbackNotice(nvencWhy(svt))] };
  };
  if (settings.videoEncoder !== "nvidia") return done(await cpu());
  const card = await deps.nvenc();
  if (!card.available) {
    warn(`NVIDIA encoder chosen but unavailable; encoding on the processor. ${nvencWhy(card)}`);
    const chosen = await cpu();
    return done({
      encode: chosen.encode,
      notices: [nvencFallbackNotice(nvencWhy(card)), ...chosen.notices],
    });
  }
  const h264 = { kind: "nvenc", bin: card.bin, clipSpeed } as const;
  if (codec === "h264") return done({ encode: h264, notices: [] });
  const own = await deps.nvenc(codec);
  if (own.available) return done({ encode: { ...h264, bin: own.bin, codec }, notices: [] });
  warn(`${videoCodecLabels[codec]} on the NVIDIA card is unavailable; encoding H.264 on it.`);
  return done({ encode: h264, notices: [cardCodecNotice(codec, nvencWhy(own))] });
}

export function nvencFallbackNotice(reason: string): string {
  return `This video was encoded on the processor because the NVIDIA graphics card encoder didn't work (${reason.replace(/\.$/, "")}). Check the NVIDIA driver, or choose Processor (x264) in Settings → Production defaults → Video encoder.`;
}

export function svtav1FallbackNotice(reason: string): string {
  return `This video was encoded as H.264 instead of AV1 because AV1 on the processor needs an ffmpeg with SVT-AV1 (${reason.replace(/\.$/, "")}). Install an ffmpeg built with SVT-AV1 and restart Slopify, or choose H.264 or HEVC under Video codec in the project's Video settings.`;
}

function cardCodecNotice(codec: VideoCodec, reason: string): string {
  return `This video was encoded as H.264 on the NVIDIA graphics card because it couldn't encode ${videoCodecLabels[codec]} (${reason.replace(/\.$/, "")}). Choose H.264${codec === "av1" ? " or HEVC" : ""} under Video codec in the project's Video settings, or Processor in Settings → Production defaults → Video encoder.`;
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
