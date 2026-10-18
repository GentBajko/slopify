import type { coverCrop } from "./frames.js";

// The ffmpeg arguments that draw a piece and shrink a picture.

export function renderArgs(input: {
  readonly art: string;
  readonly crop: ReturnType<typeof coverCrop>;
  readonly frame: { readonly width: number; readonly height: number };
  readonly text: boolean;
  readonly output: string;
}): string[] {
  const { crop, frame } = input;
  const chain = [
    `scale=${String(crop.scaleWidth)}:${String(crop.scaleHeight)}:flags=lanczos`,
    `crop=${String(frame.width)}:${String(frame.height)}:${String(crop.x)}:${String(crop.y)}`,
    ...(input.text ? ["ass=filename=design.ass:fontsdir=fonts"] : []),
    "format=rgb24",
  ];
  return [
    ...["-hide_banner", "-nostdin", "-loglevel", "error", "-y", "-i", input.art],
    ...[
      "-filter_complex",
      `[0:v]${chain.join(",")}[v]`,
      "-map",
      "[v]",
      "-frames:v",
      "1",
      input.output,
    ],
  ];
}

// What a picture is shrunk to before it is sent to a provider again: at most 4096 pixels on
// its long side, as a JPEG.
export function shrinkArgs(input: string, output: string): string[] {
  return [
    ...["-hide_banner", "-nostdin", "-loglevel", "error", "-y", "-i", input],
    ...[
      "-vf",
      "scale=w='min(iw,4096)':h='min(ih,4096)':force_original_aspect_ratio=decrease",
      "-q:v",
      "3",
      output,
    ],
  ];
}
