import { type CSSProperties, type ReactElement, useEffect, useId, useState } from "react";
import { useApp } from "@/app-context";
import { parseHex } from "@/lib/hex-colour";
import { fontUrl } from "@/subtitles/api";

// A video frame drawn with the channel's look as it is being edited: a caption in the caption
// font, colour and outline, and the end screen text in the title font and colour, so "Caption
// outline" or "Title colour" can be seen before any video is made. A setting left Not set draws
// the usual white text with a dark outline, which a template may change.

const frameWidth = 1920;

// The family a picked font is drawn in once the browser has it; undefined for Not set, while
// it loads, or when the browser cannot read it (the app's own font stands in).
function useFontFamily(fontId: string): string | undefined {
  const { api } = useApp();
  const family = `channel-preview-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const url = fontId === "" ? undefined : fontUrl(api, fontId);
  const [loaded, setLoaded] = useState<string | undefined>();
  useEffect(() => {
    if (url === undefined || typeof FontFace === "undefined" || !document.fonts) return;
    let active = true;
    const font = new FontFace(family, `url(${JSON.stringify(url)})`);
    void font
      .load()
      .then((ready) => {
        if (!active) return;
        document.fonts.add(ready);
        setLoaded(url);
      })
      .catch(() => {
        if (active) setLoaded(undefined);
      });
    return () => {
      active = false;
      document.fonts.delete(font);
    };
  }, [family, url]);
  return url !== undefined && loaded === url ? family : undefined;
}

const fontOf = (family: string | undefined): string =>
  family === undefined ? "var(--font-sans), sans-serif" : `"${family}", sans-serif`;

export function BrandPreview({
  captionFontId,
  titleFontId,
  captionColor,
  captionOutlineColor,
  titleColor,
  endScreenText,
}: {
  readonly captionFontId: string;
  readonly titleFontId: string;
  readonly captionColor: string;
  readonly captionOutlineColor: string;
  readonly titleColor: string;
  readonly endScreenText: string;
}): ReactElement {
  const captionFamily = useFontFamily(captionFontId);
  const titleFamily = useFontFamily(titleFontId);
  const caption: CSSProperties = {
    position: "absolute",
    left: "50%",
    bottom: "8%",
    width: "86%",
    transform: "translateX(-50%)",
    fontFamily: fontOf(captionFamily),
    fontSize: `${(64 / frameWidth) * 100}cqw`,
    lineHeight: 1.2,
    color: parseHex(captionColor) ?? "#FFFFFF",
    WebkitTextStroke: `${(4 / frameWidth) * 100}cqw ${parseHex(captionOutlineColor) ?? "#101010"}`,
    paintOrder: "stroke fill",
  };
  const title: CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "40%",
    width: "86%",
    transform: "translate(-50%, -50%)",
    fontFamily: fontOf(titleFamily),
    fontSize: `${(120 / frameWidth) * 100}cqw`,
    fontWeight: 700,
    lineHeight: 1.1,
    color: parseHex(titleColor) ?? "#FFFFFF",
  };
  return (
    <figure className="m-0 flex min-w-0 flex-col gap-2 self-start">
      <div
        role="img"
        aria-label="Preview of the channel's captions and end screen text"
        className="sl-media__frame w-full text-center"
        style={{
          containerType: "inline-size",
          background: "linear-gradient(160deg, #3b4a5c 0%, #1d2530 55%, #0e1217 100%)",
        }}
      >
        <span style={title}>
          {endScreenText.trim() === "" ? "Your end screen text" : endScreenText}
        </span>
        <span style={caption}>Every story begins with a word.</span>
      </div>
      <figcaption className="text-small text-ink-2">
        How captions and the end screen text look in this channel's videos.
      </figcaption>
    </figure>
  );
}
