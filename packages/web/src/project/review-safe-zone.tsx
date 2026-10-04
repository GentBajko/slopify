import type { ReactElement } from "react";

// Where the YouTube Shorts player covers a 9:16 short in the phone app: the top bar, the
// title, channel and description over the bottom third, and the column of Like, Comment and
// Share buttons down the right. Approximate, from YouTube's Shorts layout on a phone; words and
// faces placed inside the clear area stay readable.
const covered = [
  { label: "Top bar", top: 0, left: 0, width: 100, height: 12 },
  { label: "Buttons", top: 38, left: 84, width: 16, height: 30 },
  { label: "Title and channel", top: 68, left: 0, width: 100, height: 32 },
] as const;

export function ShortsSafeZone(): ReactElement {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
      {covered.map((area) => (
        <div
          key={area.label}
          className="absolute flex items-center justify-center border border-dashed border-danger bg-danger-tint/60 text-label text-ink"
          style={{
            top: `${String(area.top)}%`,
            left: `${String(area.left)}%`,
            width: `${String(area.width)}%`,
            height: `${String(area.height)}%`,
          }}
        >
          <span className="rounded-control bg-surface/80 px-1">{area.label}</span>
        </div>
      ))}
    </div>
  );
}
