import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { KeyboardEvent, ReactElement, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { IconButton } from "./button.js";
import { Player } from "./player.js";
import { Lamp } from "./status.js";

// Images and video live in a media frame: `screen` behind, a fixed aspect box so grids never
// jump, a caption line under it, actions on hover and focus, a status badge in the corner.
export type Aspect = "landscape" | "portrait" | "square";

const aspectClass: Readonly<Record<Aspect, string | undefined>> = {
  landscape: undefined,
  portrait: "sl-media__frame--portrait",
  square: "sl-media__frame--square",
};

export function MediaFrame({
  src,
  alt,
  kind = "image",
  poster,
  aspect = "landscape",
  title,
  meta,
  badge,
  actions,
  actionsShown = false,
  generating,
  onOpen,
  openLabel,
  className,
}: {
  // Absent while the media does not exist yet (generating, or empty).
  readonly src?: string;
  readonly alt: string;
  readonly kind?: "image" | "video";
  readonly poster?: string;
  readonly aspect?: Aspect;
  // The caption line: a bold title on the left, a meta value on the right.
  readonly title?: ReactNode;
  readonly meta?: ReactNode;
  readonly badge?: ReactNode;
  // Small buttons: Regenerate, Open full size, Download.
  readonly actions?: ReactNode;
  readonly actionsShown?: boolean;
  // What is being made, in words: "Codex is refining the image · 3 so far".
  readonly generating?: ReactNode;
  // Opens the lightbox. The whole frame becomes a button named `openLabel`.
  readonly onOpen?: () => void;
  readonly openLabel?: string;
  readonly className?: string;
}): ReactElement {
  const showing = generating === undefined || generating === null || generating === false;
  return (
    <figure className={cn("sl-media m-0", className)} data-slot="media-frame">
      <div className={cn("sl-media__frame", aspectClass[aspect])}>
        {showing && src !== undefined ? (
          kind === "video" ? (
            <video src={src} poster={poster} muted preload="metadata" aria-label={alt} />
          ) : (
            <img src={src} alt={alt} loading="lazy" decoding="async" />
          )
        ) : null}
        {showing ? null : (
          <div className="sl-media__generating" role="status">
            <Lamp tone="running" />
            <span>{generating}</span>
          </div>
        )}
        {onOpen !== undefined && showing && src !== undefined ? (
          <button
            type="button"
            className="sl-media__open"
            aria-label={openLabel ?? `Open ${alt} full size`}
            onClick={onOpen}
          />
        ) : null}
        {badge === undefined ? null : <span className="sl-media__badge">{badge}</span>}
        {actions === undefined ? null : (
          <div className={cn("sl-media__actions", actionsShown && "sl-media__actions--shown")}>
            {actions}
          </div>
        )}
      </div>
      {title === undefined && meta === undefined ? null : (
        <figcaption className="sl-media__caption">
          {title === undefined ? <span /> : <strong className="min-w-0 truncate">{title}</strong>}
          {meta === undefined ? null : <span className="shrink-0">{meta}</span>}
        </figcaption>
      )}
    </figure>
  );
}

// The one gallery grid: auto-fill 220px columns, or 150px portrait tiles for shorts. Compact
// is the same grid at 140px with a tighter gap, for a gallery inside a drawer, a side panel or
// a Home card. `list` makes it a list whose children are `<li>` tiles.
export function MediaGrid({
  shorts = false,
  density = "default",
  list = false,
  className,
  children,
  label,
}: {
  readonly shorts?: boolean;
  readonly density?: "default" | "compact";
  readonly list?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
  readonly label?: string;
}): ReactElement {
  const classes = cn(
    "sl-grid",
    shorts && "sl-grid--shorts",
    density === "compact" && "sl-grid--compact",
    list && "m-0 list-none p-0",
    className,
  );
  return list ? (
    <ul aria-label={label} className={classes} data-slot="media-grid">
      {children}
    </ul>
  ) : (
    <section aria-label={label} className={classes} data-slot="media-grid">
      {children}
    </section>
  );
}

export interface LightboxItem {
  readonly src: string;
  readonly alt: string;
  readonly kind?: "image" | "video";
  readonly poster?: string;
  readonly caption?: ReactNode;
}

// Full size on the scrim. Left and right arrows page, Esc closes, focus stays inside while
// it is open and returns to the tile that opened it.
export function Lightbox({
  items,
  index,
  onIndex,
  onClose,
  actions,
}: {
  readonly items: readonly LightboxItem[];
  // null while closed.
  readonly index: number | null;
  readonly onIndex: (next: number) => void;
  readonly onClose: () => void;
  readonly actions?: (item: LightboxItem, index: number) => ReactNode;
}): ReactElement {
  const item = index === null ? undefined : items[index];
  const count = items.length;
  const page = (step: number) => {
    if (index === null || count === 0) return;
    onIndex((index + step + count) % count);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      page(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      page(-1);
    }
  };
  return (
    <DialogPrimitive.Root
      open={item !== undefined}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          className="sl-lightbox sl-enter"
          onKeyDown={onKeyDown}
          aria-describedby={undefined}
        >
          {item === undefined || index === null ? null : (
            <>
              <div className="sl-lightbox__bar">
                <DialogPrimitive.Title className="m-0 text-small font-semibold">
                  {`${String(index + 1)} of ${String(count)} · ${item.alt}`}
                </DialogPrimitive.Title>
                <div className="sl-btn-row">
                  {actions?.(item, index)}
                  <IconButton label="Previous" onClick={() => page(-1)} disabled={count < 2}>
                    <ChevronLeftIcon aria-hidden="true" strokeWidth={1.75} />
                  </IconButton>
                  <IconButton label="Next" onClick={() => page(1)} disabled={count < 2}>
                    <ChevronRightIcon aria-hidden="true" strokeWidth={1.75} />
                  </IconButton>
                  <DialogPrimitive.Close asChild>
                    <IconButton label="Close">
                      <XIcon aria-hidden="true" strokeWidth={1.75} />
                    </IconButton>
                  </DialogPrimitive.Close>
                </div>
              </div>
              <div className="sl-lightbox__stage">
                {item.kind === "video" ? (
                  <Player
                    key={item.src}
                    src={item.src}
                    label={item.alt}
                    className="sl-lightbox__player"
                    {...(item.poster === undefined ? {} : { poster: item.poster })}
                  />
                ) : (
                  <img key={item.src} src={item.src} alt={item.alt} />
                )}
              </div>
              {item.caption === undefined ? (
                <span />
              ) : (
                <p className="sl-lightbox__caption">{item.caption}</p>
              )}
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
