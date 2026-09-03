import { CheckIcon } from "lucide-react";

// A save in Settings waits for the server and then confirms inline: the tick sits beside
// the button for two seconds and fades in over 150 ms (uiux/03-experience.md, feedback
// thresholds; uiux/screens/03-settings.md, Motion).
export const savedTickMs = 2000;

export function SavedTick() {
  return (
    <span className="inline-flex animate-tick-in items-center gap-1 text-label text-done motion-reduce:animate-none">
      <CheckIcon aria-hidden="true" className="size-[14px]" />
      Saved
    </span>
  );
}
