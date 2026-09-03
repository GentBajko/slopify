import { CheckIcon } from "lucide-react";
import { useEffect, useRef } from "react";

// A save in Settings waits for the server and then confirms inline: the tick sits beside
// the button for two seconds and fades in over 150 ms.
export const savedTickMs = 2000;

// An editor confirms the write with the tick and then goes back to the list it came from. The
// delay is the tick's own duration, which is why it is timed here and not in either editor.
// `leave` is held in a ref so a render between the save and the return - an invalidated list
// arriving, say - cannot restart the two seconds by handing this a new closure.
export function useLeaveWhenSaved(saved: boolean, leave: () => void): void {
  const latest = useRef(leave);
  useEffect(() => {
    latest.current = leave;
  });
  useEffect(() => {
    if (!saved) {
      return;
    }
    const timer = setTimeout(() => {
      latest.current();
    }, savedTickMs);
    return () => {
      clearTimeout(timer);
    };
  }, [saved]);
}

export function SavedTick() {
  return (
    <span className="inline-flex animate-tick-in items-center gap-1 text-label text-done motion-reduce:animate-none">
      <CheckIcon aria-hidden="true" className="size-[14px]" />
      Saved
    </span>
  );
}
