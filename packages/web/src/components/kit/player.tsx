import type { ReactElement, ReactNode, Ref } from "react";
import { cn } from "@/lib/utils";

// Video plays in a real player: the browser's own controls (keyboard, captions, fullscreen,
// picture in picture) inside a `screen` frame with the poster until it plays.
export function Player({
  src,
  poster,
  label,
  portrait = false,
  captions,
  ref,
  className,
  children,
}: {
  readonly src: string;
  readonly poster?: string;
  // The accessible name: "D&D Lore: Tiamat, final video".
  readonly label: string;
  readonly portrait?: boolean;
  // A WebVTT track, when there is one.
  readonly captions?: { readonly src: string; readonly lang: string; readonly label: string };
  readonly ref?: Ref<HTMLVideoElement>;
  readonly className?: string;
  // Extra <track> or <source> elements.
  readonly children?: ReactNode;
}): ReactElement {
  return (
    <div className={cn("sl-player", portrait && "sl-player--portrait", className)}>
      {/* biome-ignore lint/a11y/useMediaCaption: the track is passed when the video has one; burned-in captions need none. */}
      <video
        ref={ref}
        src={src}
        poster={poster}
        controls
        preload="metadata"
        playsInline
        aria-label={label}
      >
        {captions === undefined ? null : (
          <track
            kind="captions"
            src={captions.src}
            srcLang={captions.lang}
            label={captions.label}
          />
        )}
        {children}
      </video>
    </div>
  );
}
