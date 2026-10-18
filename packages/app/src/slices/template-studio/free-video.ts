import { defaultImageSeconds, defaultMotionStyle, defaultZoomPercent } from "../admission/rules.js";
import type { PlayDraftDocument } from "../play-drafts/schema.js";
import type { StylePreviewRequest } from "../style-preview/schema.js";

// The Video & captions sample: 30 seconds made by the style preview's renderer from the
// template's frame, captions, Look and picture timing, on the bundled sample's pictures and
// narration. Local and free; no provider is called.
export const videoSampleSeconds = 30;

function number(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = Number(raw);
  return raw === undefined || raw.trim() === "" || !Number.isFinite(value)
    ? fallback
    : Math.min(max, Math.max(min, value));
}

export function videoSampleRequest(document: PlayDraftDocument): StylePreviewRequest {
  const { form } = document;
  return {
    format: form.format,
    subtitles: {
      mode: form.subtitles.mode,
      fontId: /^[A-Za-z0-9_-]+$/.test(form.subtitles.fontId) ? form.subtitles.fontId : "default",
      fontSize: number(form.subtitles.fontSize, 48, 16, 120),
      position: form.subtitles.position,
    },
    ...(form.videoEdit === undefined ? {} : { videoEdit: form.videoEdit }),
    previewText: document.previewText.slice(0, 200),
    seconds: videoSampleSeconds,
    timing: {
      imageSeconds: number(form.imageSeconds, defaultImageSeconds, 1, 120),
      zoomPercent: number(form.zoomPercent, defaultZoomPercent, 0, 100),
      motionStyle: form.motionStyle ?? defaultMotionStyle,
    },
  };
}
