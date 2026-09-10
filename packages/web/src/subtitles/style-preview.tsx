import type { Format } from "@app/kernel/pipeline.js";
import { subtitleFrame, subtitlePlacement } from "@app/slices/subtitles/layout.js";
import type { SubtitleConfig } from "@app/slices/subtitles/model.js";
import { type ReactElement, useEffect, useId, useState } from "react";
import { useApp } from "@/app-context";
import { fontUrl } from "./api";

export function SubtitlePreview({
  value,
  format,
}: {
  readonly value: SubtitleConfig;
  readonly format: Format;
}): ReactElement {
  const { api } = useApp();
  const url = fontUrl(api, value.fontId);
  const family = `subtitle-preview-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (typeof FontFace === "undefined" || !document.fonts) return;
    let active = true;
    const font = new FontFace(family, `url(${JSON.stringify(url)})`);
    setFailed(false);
    void font
      .load()
      .then((loaded) => {
        if (active) document.fonts.add(loaded);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      document.fonts.delete(font);
    };
  }, [family, url]);
  const frame = subtitleFrame(format);
  const placement = subtitlePlacement(value.position ?? "bottom", frame.height);
  const fontSize = Number.isFinite(value.fontSize)
    ? Math.max(16, Math.min(120, value.fontSize))
    : 48;
  return (
    <figure className="min-w-0 self-start">
      <div className="mb-2 flex items-center justify-between gap-2 text-label text-ink2">
        <span>Style preview</span>
        <span>{format}</span>
      </div>
      <div
        role="img"
        aria-label="Subtitle style preview"
        data-format={format}
        data-position={value.position ?? "bottom"}
        className="relative mx-auto w-full overflow-hidden rounded-control border border-line2 bg-screen text-center text-white"
        style={{
          aspectRatio: `${frame.width} / ${frame.height}`,
          maxWidth: format === "9:16" ? 240 : 480,
          containerType: "inline-size",
        }}
      >
        <span
          style={{
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
          }}
        >
          Every story begins with a word.
        </span>
      </div>
      <figcaption className="mt-2 text-label text-ink3">
        {frame.width} × {frame.height} · Preview at reduced scale.
        {failed ? " Font preview unavailable; showing a fallback." : ""}
      </figcaption>
    </figure>
  );
}
