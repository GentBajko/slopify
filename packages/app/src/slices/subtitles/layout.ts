import type { Format } from "../../kernel/pipeline.js";
import type { SubtitleConfig } from "./model.js";

export function subtitleFrame(format: Format): { readonly width: number; readonly height: number } {
  return format === "9:16" ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
}

// ASS and the browser preview share anchors. Edge positions keep the existing
// 60-pixel safe margin; interior positions center both single and multiline cues.
export function subtitlePlacement(
  position: SubtitleConfig["position"],
  height: number,
): { readonly y: number; readonly alignment: 2 | 5 | 8; readonly translateY: number } {
  switch (position) {
    case "top":
      return { y: 60, alignment: 8, translateY: 0 };
    case "upper-middle":
      return { y: height / 4, alignment: 5, translateY: -50 };
    case "center":
      return { y: height / 2, alignment: 5, translateY: -50 };
    case "lower-middle":
      return { y: (height * 3) / 4, alignment: 5, translateY: -50 };
    case "bottom":
      return { y: height - 60, alignment: 2, translateY: -100 };
  }
}
