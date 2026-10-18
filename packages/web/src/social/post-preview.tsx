import { limitsFor } from "@app/slices/social/limits.js";
import { type PostMedia, type PostPack, platformLabels } from "@app/slices/social/model.js";
import { countFor } from "@app/slices/social/text.js";
import type { ReactElement, ReactNode } from "react";
import { useApp } from "@/app-context";
import { type Aspect, MediaFrame, MediaGrid } from "@/components/kit/media";
import { Badge } from "@/components/kit/status";
import { cn } from "@/lib/utils";
import { countLine } from "./words";

const mediaWords: Readonly<Record<PostMedia["kind"], string>> = {
  video: "Video",
  short: "Short",
  thumbnail: "Thumbnail",
  picture: "Picture",
  design: "Design",
};

function aspectOf(media: PostMedia): Aspect {
  if (media.shape === "9:16" || media.kind === "short") return "portrait";
  if (media.shape === "4:5") return "tall";
  if (media.shape === "1:1") return "square";
  return "landscape";
}

// A post as the site will show it: its words, counted the way the site counts them (live, while
// `text` is being typed), and its media in the shape it is sent in. `editor` takes the words'
// place where they can be changed (Prepare upload).
export function PostPreview({
  pack,
  text = pack.text,
  editor,
  className,
}: {
  readonly pack: PostPack;
  readonly text?: string;
  readonly editor?: ReactNode;
  readonly className?: string;
}): ReactElement {
  const { api } = useApp();
  const site = platformLabels[pack.platform];
  const unit = limitsFor(pack.platform, pack.xTier).unit;
  const count = { used: countFor(text, unit), max: pack.count.max, unit };
  const over = count.used > count.max;
  return (
    <section
      aria-label={`${site} post preview`}
      className={cn("flex min-w-0 flex-col gap-3 rounded-media border border-line p-3", className)}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="text-body font-semibold">{site}</span>
        {pack.aiLabel ? <Badge tone="info">AI label on</Badge> : null}
        <span className="flex-1" />
        <output
          aria-label={`${site} length`}
          className={cn("text-small tabular-nums", over ? "text-danger" : "text-ink-2")}
        >
          {countLine(count)}
        </output>
      </div>
      {editor ??
        (text === "" ? (
          <p className="m-0 text-small text-ink-3">No text.</p>
        ) : (
          <p className="m-0 whitespace-pre-wrap break-words text-small">{text}</p>
        ))}
      {pack.media.length === 0 ? null : (
        <MediaGrid density="compact" label={`${site} post media`}>
          {pack.media.map((one) => (
            <MediaFrame
              key={one.file}
              src={`${api.origin}${one.url}`}
              kind={one.kind === "video" || one.kind === "short" ? "video" : "image"}
              alt={one.alt ?? `${mediaWords[one.kind]}: ${one.filename}`}
              aspect={aspectOf(one)}
              title={mediaWords[one.kind]}
              meta={one.shape === "original" ? undefined : one.shape}
            />
          ))}
        </MediaGrid>
      )}
    </section>
  );
}
