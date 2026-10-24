import {
  ChevronLeftIcon,
  ChevronRightIcon,
  Maximize2Icon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { type KeyboardEvent, type ReactElement, type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";
import { Button, IconButton } from "./button.js";
import { Player } from "./player.js";
import { Lamp } from "./status.js";
import { nextZoom, type Zoom, ZoomImage } from "./zoom-image.js";

// Images and video live in a media frame: `screen` behind, a fixed aspect box so grids never
// jump, a caption line under it, the frame's actions in a row under the caption (always shown,
// in words where the caller gives words), a status badge in the corner. A frame that opens
// full size says so with a visible "Full size" button in its top right corner; the picture
// itself opens it too. Nothing waits for the pointer to appear. "tall" is 4:5, Instagram's
// picture shape.
export type Aspect = "landscape" | "portrait" | "square" | "tall";

const aspectClass: Readonly<Record<Aspect, string | undefined>> = {
  landscape: undefined,
  portrait: "sl-media__frame--portrait",
  square: "sl-media__frame--square",
  tall: "sl-media__frame--tall",
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
  generating,
  onOpen,
  openLabel,
  openText = "Full size",
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
  // Small buttons in a row under the caption, named for their result in words: "Make this
  // image again", "Download". Always shown.
  readonly actions?: ReactNode;
  // What is being made, in words: "Codex is refining the image · 3 so far".
  readonly generating?: ReactNode;
  // Opens the lightbox, or the item's own page. The frame shows a visible button in its top
  // right corner (`openText`, "Full size" by default), named `openLabel` for screen readers,
  // and a press anywhere on the picture does the same.
  readonly onOpen?: () => void;
  readonly openLabel?: string;
  // The open button's visible words: "Open" for a frame that leads to the item's page.
  readonly openText?: string;
  readonly className?: string;
}): ReactElement {
  const showing = generating === undefined || generating === null || generating === false;
  const opens = onOpen !== undefined && showing && src !== undefined;
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
        {opens ? (
          <>
            {/* The picture as a pointer target; keyboards and screen readers use the button. */}
            <button
              type="button"
              className="sl-media__hit"
              tabIndex={-1}
              aria-hidden="true"
              onClick={onOpen}
            />
            <Button
              size="small"
              className="sl-media__open"
              aria-label={openLabel ?? `Open ${alt} full size`}
              onClick={onOpen}
            >
              <Maximize2Icon
                aria-hidden="true"
                strokeWidth={1.75}
                className="sl-media__open-icon"
              />
              {openText}
            </Button>
          </>
        ) : null}
        {badge === undefined ? null : <span className="sl-media__badge">{badge}</span>}
      </div>
      {title === undefined && meta === undefined ? null : (
        <figcaption className="sl-media__caption">
          {title === undefined ? <span /> : <strong className="min-w-0 truncate">{title}</strong>}
          {meta === undefined ? null : <span className="shrink-0">{meta}</span>}
        </figcaption>
      )}
      {actions === undefined ? null : <div className="sl-media__actions sl-btn-row">{actions}</div>}
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
  // The short name on the bar; the alt text otherwise. A long alt (an image's whole prompt) is
  // then said once, in the caption, instead of on the bar as well.
  readonly title?: string;
  readonly caption?: ReactNode;
}

// Full size on the scrim. Left and right arrows page, Esc closes, focus stays inside while
// it is open and returns to the tile that opened it. A picture zooms to 2× and 4× from the bar,
// with + and - (0 fits it again) or a double click, and is dragged to look around.
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
  const [zoom, setZoom] = useState<Zoom>(1);
  const picture = item !== undefined && item.kind !== "video";
  const page = (step: number) => {
    if (index === null || count === 0) return;
    setZoom(1);
    onIndex((index + step + count) % count);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const zoomKey = event.key === "+" || event.key === "=" ? 1 : event.key === "-" ? -1 : undefined;
    if (picture && zoomKey !== undefined) {
      event.preventDefault();
      setZoom((now) => nextZoom(now, zoomKey));
    } else if (picture && event.key === "0") {
      event.preventDefault();
      setZoom(1);
    } else if (event.key === "ArrowRight") {
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
        if (!open) {
          setZoom(1);
          onClose();
        }
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
                  {`${String(index + 1)} of ${String(count)} · ${item.title ?? item.alt}`}
                </DialogPrimitive.Title>
                <div className="sl-btn-row">
                  {actions?.(item, index)}
                  {picture ? (
                    <>
                      <IconButton
                        label="Zoom out"
                        disabled={zoom === 1}
                        onClick={() => setZoom((now) => nextZoom(now, -1))}
                      >
                        <ZoomOutIcon aria-hidden="true" strokeWidth={1.75} />
                      </IconButton>
                      <IconButton
                        label={`Zoom in${zoom === 1 ? "" : `, now ${String(zoom)}×`}`}
                        disabled={zoom === 4}
                        onClick={() => setZoom((now) => nextZoom(now, 1))}
                      >
                        <ZoomInIcon aria-hidden="true" strokeWidth={1.75} />
                      </IconButton>
                      <IconButton label="Fit" disabled={zoom === 1} onClick={() => setZoom(1)}>
                        <Maximize2Icon aria-hidden="true" strokeWidth={1.75} />
                      </IconButton>
                    </>
                  ) : null}
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
                  <ZoomImage
                    key={item.src}
                    src={item.src}
                    alt={item.alt}
                    zoom={zoom}
                    onZoom={setZoom}
                  />
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
