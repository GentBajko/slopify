import type { Format } from "../../kernel/pipeline.js";
import type { DesignFormat } from "./model.js";
import { nearestFormat } from "./picture-size.js";

// The pixel frame each format is drawn at, and for the print formats the PDF page it fills
// at 300 dpi.
export interface Frame {
  readonly width: number;
  readonly height: number;
  readonly pdf?: { readonly widthMm: number; readonly heightMm: number } | undefined;
}

export const frames: Readonly<Record<DesignFormat, Frame>> = {
  a4: { width: 2480, height: 3508, pdf: { widthMm: 210, heightMm: 297 } },
  a3: { width: 3508, height: 4961, pdf: { widthMm: 297, heightMm: 420 } },
  flyer: { width: 1748, height: 2480, pdf: { widthMm: 148, heightMm: 210 } },
  square: { width: 1080, height: 1080 },
  portrait: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
  wide: { width: 1920, height: 1080 },
  // The brochure's cover is an A4 page; its inner pages are the document theme's own.
  brochure: { width: 2480, height: 3508, pdf: { widthMm: 210, heightMm: 297 } },
};

// One artwork serves every format: the provider shape every chosen format is closest to, or
// square when they pull different ways, so each crop loses as little as it can.
export function artworkAspect(formats: readonly DesignFormat[]): Format {
  const shapes = new Set(formats.map((format) => nearestFormat(frames[format])));
  const [only] = shapes;
  return shapes.size === 1 && only !== undefined ? only : "1:1";
}

export interface Crop {
  // The picture is scaled to exactly this size, then cut to the frame at (x, y).
  readonly scaleWidth: number;
  readonly scaleHeight: number;
  readonly x: number;
  readonly y: number;
}

// Cover-fit: the picture fills the frame, and what is cut off is cut around the focus point
// (0..1 on each axis of the picture), never past the picture's edge.
export function coverCrop(
  picture: { readonly width: number; readonly height: number },
  frame: Pick<Frame, "width" | "height">,
  focus: { readonly x: number; readonly y: number },
): Crop {
  const scale = Math.max(frame.width / picture.width, frame.height / picture.height);
  const scaleWidth = Math.max(frame.width, Math.round(picture.width * scale));
  const scaleHeight = Math.max(frame.height, Math.round(picture.height * scale));
  // The frame is centred on the focus point, then slid back inside the picture.
  const place = (size: number, window: number, at: number) =>
    Math.min(size - window, Math.max(0, Math.round(at * size - window / 2)));
  return {
    scaleWidth,
    scaleHeight,
    x: place(scaleWidth, frame.width, focus.x),
    y: place(scaleHeight, frame.height, focus.y),
  };
}
