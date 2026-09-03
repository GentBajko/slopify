import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge knows Tailwind's own scales, not this project's. Left unextended it
// reads `text-small` as a colour, so `cn("text-small text-ink")` dropped every engraved
// and small size in the app; the same happened to the radius lock and the animations.
// The names below are the `--text-*`, `--radius-*`, `--animate-*` and `--font-*`
// namespaces of styles/index.css, without their prefixes.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["label", "small", "body", "row", "title", "wordmark", "counter"],
      radius: ["control", "panel"],
      animate: ["lamp-pulse", "dialog-in", "tick-in"],
      font: ["sans", "condensed"],
    },
  },
});

// The class merger every vendored shadcn component expects at `@/lib/utils`.
export function cn(...inputs: readonly ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const clock = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const day = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

// The "started 21:14" of the rundown header. Today's runs read as a time; older ones add
// the date, because a bare clock time on a week-old project says nothing.
export function startedAt(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  const sameDay = at.toDateString() === now.toDateString();
  return sameDay ? clock.format(at) : `${day.format(at)} ${clock.format(at)}`;
}
