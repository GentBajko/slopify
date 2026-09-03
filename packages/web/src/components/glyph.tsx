import type { StageKind } from "@app/kernel/pipeline.js";
import type { CSSProperties } from "react";
import coffee from "@/assets/buymeacoffee.svg";
import github from "@/assets/github.svg";
import logoMark from "@/assets/logo-mark.svg";
import patreon from "@/assets/patreon.svg";
import article from "@/assets/stage-article.svg";
import audio from "@/assets/stage-audio.svg";
import images from "@/assets/stage-images.svg";
import research from "@/assets/stage-research.svg";
import thumbnail from "@/assets/stage-thumbnail.svg";
import video from "@/assets/stage-video.svg";
import { cn } from "@/lib/utils";

// The mark and the six stage glyphs are used verbatim from `src/assets/`, worn as a mask
// rather than redrawn in JSX: the file stays the single copy and `bg-current` still lets
// the artwork take its row's colour.
const glyphs: Readonly<Record<StageKind, string>> = {
  research,
  article,
  audio,
  images,
  thumbnail,
  video,
};

// The URL is quoted: Vite inlines these SVGs as data URLs carrying single quotes, and an
// unquoted CSS url() token may hold neither quote character. Unquoted, the declaration is
// dropped and the element paints as an unmasked block.
function mask(url: string): CSSProperties {
  return {
    maskImage: `url("${url}")`,
    maskSize: "contain",
    maskRepeat: "no-repeat",
    maskPosition: "center",
  };
}

// The row already names the stage, so the glyph is decoration.
export function StageGlyph({
  kind,
  className,
}: {
  readonly kind: StageKind;
  readonly className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-glyph={kind}
      className={cn("block size-[22px] shrink-0 bg-current", className)}
      style={mask(glyphs[kind])}
    />
  );
}

// The wordmark is live text beside this, never a rasterised lockup.
export function Mark({ className }: { readonly className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-glyph="mark"
      className={cn("block size-[26px] shrink-0 bg-current", className)}
      style={mask(logoMark)}
    />
  );
}

const supportGlyphs = { github, patreon, coffee } as const;

export type SupportGlyphName = keyof typeof supportGlyphs;

// The link beside it names the destination, so the glyph is decoration.
export function SupportGlyph({
  name,
  className,
}: {
  readonly name: SupportGlyphName;
  readonly className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-glyph={name}
      className={cn("block size-[14px] shrink-0 bg-current", className)}
      style={mask(supportGlyphs[name])}
    />
  );
}
