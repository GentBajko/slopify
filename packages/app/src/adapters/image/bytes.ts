import type { GeneratedImage } from "../../kernel/ports/image.js";
import { providerError } from "../../kernel/ports/model.js";

// Two of the three image providers answer with a link rather than with bytes, so fetching
// that link is part of the provider call and belongs inside the attempt with it: a URL
// that 404s or hands back an HTML error page is a failed attempt, not a corrupt file on
// disk. It sits beside the adapters, as `retry-after.ts` does, because the rule is the
// port's - `GeneratedImage` is a PNG or a JPEG and nothing else - rather than any one
// vendor's. Nothing else is shared between the three adapters.

const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const jpeg = [0xff, 0xd8, 0xff] as const;
// Not a format the port carries, but the likeliest wrong answer: it is what most
// diffusion models return by default, so naming it turns a puzzling failure into one
// sentence the user can act on.
const riff = [0x52, 0x49, 0x46, 0x46] as const;
const webp = [0x57, 0x45, 0x42, 0x50] as const;

// The bytes decide, never the Content-Type header. A CDN in front of an expired link
// serves `image/png` over an HTML error page often enough to be worth not trusting, and
// the mime is stored with the file and becomes its extension (`logic/09` step 3).
export function sniffImage(bytes: Uint8Array): GeneratedImage["mime"] | undefined {
  if (startsWith(bytes, png, 0)) {
    return "image/png";
  }
  return startsWith(bytes, jpeg, 0) ? "image/jpeg" : undefined;
}

// What to call what arrived when it is not an image, without echoing bytes that may be a
// signed URL, a key quoted back, or a megabyte of HTML.
export function describeBytes(bytes: Uint8Array): string {
  if (bytes.length === 0) {
    return "an empty body";
  }
  if (startsWith(bytes, riff, 0) && startsWith(bytes, webp, 8)) {
    return "a WebP image";
  }
  return `${String(bytes.length)} bytes beginning ${hex(bytes)}`;
}

export interface ImageDownload {
  readonly fetch: typeof globalThis.fetch;
  // The provider's own name, so the sentence the stage shows says who failed.
  readonly provider: string;
  readonly url: string;
  readonly signal: AbortSignal;
}

export async function downloadImage(download: ImageDownload): Promise<GeneratedImage> {
  const response = await download.fetch(download.url, { signal: download.signal });
  if (!response.ok) {
    // `other`, so the attempt wrapper retries it: a link that is not ready yet or a CDN
    // hiccup is exactly the transient failure the retry policy exists for. The URL is not
    // quoted back - a fal or Replicate delivery link carries its own signature.
    throw providerError({
      kind: "other",
      message: `${download.provider} answered ${String(response.status)} for the image it said it had made`,
    });
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const mime = sniffImage(bytes);
  if (mime === undefined) {
    throw providerError({
      kind: "other",
      message: `${download.provider}'s image link answered with ${describeBytes(bytes)} rather than a PNG or a JPEG`,
    });
  }
  return { bytes, mime };
}

function startsWith(bytes: Uint8Array, magic: readonly number[], at: number): boolean {
  if (bytes.length < at + magic.length) {
    return false;
  }
  return magic.every((byte, index) => bytes[at + index] === byte);
}

function hex(bytes: Uint8Array): string {
  return [...bytes.slice(0, 4)].map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
}
