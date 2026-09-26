import type { GeneratedImage, GeneratedVideo } from "../../kernel/ports/image.js";
import { providerError } from "../../kernel/ports/model.js";
import { describeBytes } from "./bytes.js";

// What the two image-to-video adapters share: the still goes up inline as a data URI (the
// render sends a small JPEG, `slices/rebuild/runtime-animate.ts`), and the clip comes back
// as a link that is downloaded inside the attempt, like an image.

export function dataUri(image: GeneratedImage): string {
  return `data:${image.mime};base64,${Buffer.from(image.bytes).toString("base64")}`;
}

// An MP4 (or MOV) names its box type at byte 4.
export function sniffVideo(bytes: Uint8Array): boolean {
  return bytes.length > 12 && Buffer.from(bytes.slice(4, 8)).toString("latin1") === "ftyp";
}

export interface VideoDownload {
  readonly fetch: typeof globalThis.fetch;
  readonly provider: string;
  readonly url: string;
  readonly signal: AbortSignal;
}

export async function downloadVideo(download: VideoDownload): Promise<GeneratedVideo> {
  const response = await download.fetch(download.url, { signal: download.signal });
  if (!response.ok)
    // The link is not quoted back: a delivery link carries its own signature.
    throw providerError({
      kind: "other",
      message: `${download.provider} made the video clip, but Slopify could not download it (error ${String(response.status)}). Check your internet connection, then use Retry stage.`,
    });
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!sniffVideo(bytes))
    throw providerError({
      kind: "other",
      message: `${download.provider} sent back something that is not an MP4 video clip (${describeBytes(bytes)}). Use Retry stage; if it keeps happening, choose another image-to-video model under Animate images in Edit project → Inputs → Look.`,
    });
  return { bytes, mime: "video/mp4" };
}
