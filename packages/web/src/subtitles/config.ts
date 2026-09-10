import type { StageSource } from "@app/slices/admission/model.js";
import {
  defaultSubtitles,
  type SubtitleConfig,
  subtitleConfigSchema,
} from "@app/slices/subtitles/model.js";

export function subtitlesFor(
  value: SubtitleConfig | undefined,
  sources: {
    readonly audio: StageSource;
    readonly video: StageSource;
    readonly images: StageSource;
  },
): SubtitleConfig {
  const selected = { ...defaultSubtitles, ...value };
  const mode =
    sources.audio === "off"
      ? "off"
      : (sources.video === "off" || sources.images === "off") && selected.mode === "burn-in"
        ? "files"
        : selected.mode;
  if (mode !== "off") return { ...selected, mode };
  // Turning captions off hides their style inputs. Keep valid choices, but never
  // send an unfinished number or invalid font ID that the hidden inputs cannot fix.
  const font = subtitleConfigSchema.shape.fontId.safeParse(selected.fontId);
  const size = subtitleConfigSchema.shape.fontSize.safeParse(selected.fontSize);
  return {
    ...selected,
    mode,
    fontId: font.success ? font.data : defaultSubtitles.fontId,
    fontSize: size.success ? size.data : defaultSubtitles.fontSize,
  };
}

export function sameSubtitles(left: SubtitleConfig, right: SubtitleConfig): boolean {
  return (
    left.mode === right.mode &&
    left.language === right.language &&
    left.fontId === right.fontId &&
    left.fontSize === right.fontSize &&
    (left.position ?? "bottom") === (right.position ?? "bottom")
  );
}

export function validSubtitleStyle(value: SubtitleConfig): boolean {
  return (
    value.mode === "off" ||
    (value.fontId !== "" &&
      Number.isInteger(value.fontSize) &&
      value.fontSize >= 16 &&
      value.fontSize <= 120)
  );
}
