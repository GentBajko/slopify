import { type PointerEvent, type ReactElement, useRef, useState } from "react";

// The lightbox's picture at a zoom: 1 fits it to the stage, 2 and 4 enlarge it about its centre,
// and a drag moves it while it is larger than the stage. A double click goes between fit and 2×.
export const zoomLevels = [1, 2, 4] as const;
export type Zoom = (typeof zoomLevels)[number];

export function nextZoom(zoom: Zoom, step: 1 | -1): Zoom {
  const at = zoomLevels.indexOf(zoom);
  return zoomLevels[Math.min(zoomLevels.length - 1, Math.max(0, at + step))] ?? 1;
}

export function ZoomImage({
  src,
  alt,
  zoom,
  onZoom,
}: {
  readonly src: string;
  readonly alt: string;
  readonly zoom: Zoom;
  readonly onZoom: (zoom: Zoom) => void;
}): ReactElement {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; from: { x: number; y: number } } | null>(null);
  const shown = zoom === 1 ? { x: 0, y: 0 } : offset;
  const onDown = (event: PointerEvent<HTMLImageElement>) => {
    if (zoom === 1) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, from: shown };
  };
  const onMove = (event: PointerEvent<HTMLImageElement>) => {
    const start = drag.current;
    if (start === null) return;
    setOffset({
      x: start.from.x + (event.clientX - start.x) / zoom,
      y: start.from.y + (event.clientY - start.y) / zoom,
    });
  };
  const onUp = () => {
    drag.current = null;
  };
  return (
    // The drag and double click repeat the bar's Zoom buttons and keys, the accessible way in.
    <img
      src={src}
      alt={alt}
      draggable={false}
      data-zoom={zoom}
      className={zoom === 1 ? "cursor-zoom-in" : "cursor-grab touch-none active:cursor-grabbing"}
      style={{
        transform: `scale(${String(zoom)}) translate(${String(shown.x)}px, ${String(shown.y)}px)`,
        transition: drag.current === null ? "transform 120ms ease-out" : "none",
      }}
      onDoubleClick={() => {
        setOffset({ x: 0, y: 0 });
        onZoom(zoom === 1 ? 2 : 1);
      }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    />
  );
}
