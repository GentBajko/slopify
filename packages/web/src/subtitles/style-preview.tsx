import type { Format } from "@app/kernel/pipeline.js";
import { subtitleFrame, subtitlePlacement } from "@app/slices/subtitles/layout.js";
import type { SubtitleConfig } from "@app/slices/subtitles/model.js";
import { type CSSProperties, type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { Switch } from "@/components/kit/switch";
import { ShortsSafeZone } from "@/project/review-safe-zone";
import { fontUrl } from "./api";
import { usePreviewFont } from "./use-preview-font";

export function SubtitlePreview({
  value,
  format,
  sample = "Every story begins with a word.",
  backgroundUrl,
  showCaptions = true,
  maxFrameHeight,
}: {
  readonly sample?: string;
  readonly backgroundUrl?: string;
  readonly showCaptions?: boolean;
  readonly maxFrameHeight?: string;
  readonly value: SubtitleConfig;
  readonly format: Format;
}): ReactElement {
  const { api } = useApp();
  const url = fontUrl(api, value.fontId);
  const { family, failed } = usePreviewFont(url);
  // A 9:16 frame is a short: YouTube's own buttons and title cover parts of it on a phone.
  const [safeZone, setSafeZone] = useState(false);
  const portrait = format === "9:16";
  const frame = subtitleFrame(format);
  const placement = subtitlePlacement(value.position ?? "bottom", frame.height);
  const fontSize = Number.isFinite(value.fontSize)
    ? Math.max(16, Math.min(120, value.fontSize))
    : 48;
  const captionStyle: CSSProperties = {
    position: "absolute",
    left: "50%",
    top: `${(placement.y / frame.height) * 100}%`,
    width: `${((frame.width - 120) / frame.width) * 100}%`,
    transform: `translate(-50%, ${placement.translateY}%)`,
    fontFamily: `"${family}", sans-serif`,
    fontSize: `${(fontSize / frame.width) * 100}cqw`,
    lineHeight: 1.2,
    overflowWrap: "anywhere",
    WebkitTextStroke: `${(2.5 / frame.width) * 100}cqw #101010`,
    paintOrder: "stroke fill",
    textShadow: `0 ${100 / frame.width}cqw ${100 / frame.width}cqw #000`,
  };
  return (
    <figure className="min-w-0 self-start">
      <div className="mb-2 flex items-center justify-between gap-2 text-label text-ink-2">
        <span>Style preview</span>
        <span>{format}</span>
      </div>
      <div
        role="img"
        aria-label="Subtitle style preview"
        data-format={format}
        data-position={value.position ?? "bottom"}
        className="sl-media__frame mx-auto w-full text-center text-white"
        style={{
          aspectRatio: `${frame.width} / ${frame.height}`,
          maxWidth:
            format === "9:16"
              ? maxFrameHeight
                ? `min(240px, calc((${maxFrameHeight}) * 9 / 16))`
                : 240
              : format === "1:1"
                ? 360
                : 480,
          containerType: "inline-size",
        }}
      >
        {backgroundUrl ? (
          <img src={backgroundUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
        {showCaptions ? (
          <span role="note" aria-label="Caption sample" style={captionStyle}>
            {sample}
          </span>
        ) : null}
        {portrait && safeZone ? <ShortsSafeZone /> : null}
      </div>
      {portrait ? (
        <Switch
          checked={safeZone}
          onChange={setSafeZone}
          label="Show what YouTube covers on a phone"
          className="mt-2"
        />
      ) : null}
      <figcaption className="mt-2 text-label text-ink-3">
        {frame.width} × {frame.height} · Preview at reduced scale.
        {failed ? " Font preview unavailable; showing a fallback." : ""}
      </figcaption>
    </figure>
  );
}
