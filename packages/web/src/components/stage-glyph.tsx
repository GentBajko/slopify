import type { StageKind } from "@app/kernel/pipeline.js";
import article from "@/assets/stage-article.svg";
import audio from "@/assets/stage-audio.svg";
import images from "@/assets/stage-images.svg";
import research from "@/assets/stage-research.svg";
import thumbnail from "@/assets/stage-thumbnail.svg";
import video from "@/assets/stage-video.svg";
import { cn } from "@/lib/utils";

// The six glyphs come from docs/capstone/uiux/assets/ verbatim (uiux/02-system.md), so
// they are worn as a mask rather than redrawn in JSX: the file stays the single copy and
// `bg-current` still lets the stroke take the row's colour. The row already names the
// stage, so the glyph is decoration.
const glyphs: Readonly<Record<StageKind, string>> = {
  research,
  article,
  audio,
  images,
  thumbnail,
  video,
};

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
      style={{
        maskImage: `url(${glyphs[kind]})`,
        maskSize: "contain",
        maskRepeat: "no-repeat",
        maskPosition: "center",
      }}
    />
  );
}
