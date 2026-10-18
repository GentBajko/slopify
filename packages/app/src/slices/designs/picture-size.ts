import type { Format } from "../../kernel/pipeline.js";

export interface PictureSize {
  readonly width: number;
  readonly height: number;
}

// The width and height a PNG's IHDR or a JPEG's start-of-frame states; undefined for anything
// truncated or not one of the two.
export function pictureSize(bytes: Uint8Array): PictureSize | undefined {
  const size =
    bytes[0] === 0x89 && bytes[1] === 0x50
      ? pngSize(bytes)
      : bytes[0] === 0xff
        ? jpegSize(bytes)
        : undefined;
  return size !== undefined && size.width > 0 && size.height > 0 ? size : undefined;
}

function pngSize(bytes: Uint8Array): PictureSize | undefined {
  if (bytes.length < 24) return undefined;
  const ihdr = String.fromCharCode(...bytes.subarray(12, 16));
  if (ihdr !== "IHDR") return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

// Markers that carry no length: start of image, TEM and the restart markers.
const standalone = (marker: number): boolean =>
  marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);
// Every SOFn except DHT (C4), JPG (C8) and DAC (CC), which share the range.
const startOfFrame = (marker: number): boolean =>
  marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

function jpegSize(bytes: Uint8Array): PictureSize | undefined {
  if (bytes[1] !== 0xd8) return undefined;
  let at = 2;
  while (at + 1 < bytes.length) {
    if (bytes[at] !== 0xff) return undefined;
    let marker = bytes[at + 1] ?? 0;
    while (marker === 0xff && at + 2 < bytes.length) {
      at += 1;
      marker = bytes[at + 1] ?? 0;
    }
    if (standalone(marker)) {
      at += 2;
      continue;
    }
    // End of image or start of scan before any frame: no size to read.
    if (marker === 0xd9 || marker === 0xda) return undefined;
    if (at + 3 >= bytes.length) return undefined;
    const length = ((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0);
    if (length < 2) return undefined;
    if (startOfFrame(marker)) {
      if (at + 8 >= bytes.length || length < 7) return undefined;
      return {
        height: ((bytes[at + 5] ?? 0) << 8) | (bytes[at + 6] ?? 0),
        width: ((bytes[at + 7] ?? 0) << 8) | (bytes[at + 8] ?? 0),
      };
    }
    at += 2 + length;
  }
  return undefined;
}

const shapes: readonly { readonly format: Format; readonly ratio: number }[] = [
  { format: "16:9", ratio: 16 / 9 },
  { format: "1:1", ratio: 1 },
  { format: "9:16", ratio: 9 / 16 },
];

// The provider shape closest to the picture's, measured on a log scale so 2:1 and 1:2 are
// equally far from square.
export function nearestFormat(size: PictureSize): Format {
  const ratio = Math.log(size.width / size.height);
  let best: (typeof shapes)[number] = { format: "1:1", ratio: 1 };
  let distance = Number.POSITIVE_INFINITY;
  for (const shape of shapes) {
    const d = Math.abs(Math.log(shape.ratio) - ratio);
    if (d < distance) {
      best = shape;
      distance = d;
    }
  }
  return best.format;
}
