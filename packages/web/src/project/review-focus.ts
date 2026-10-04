import { type RefObject, useEffect, useSyncExternalStore } from "react";

// The one piece the project page asked Edit project to show: "narration:<chunk key>" or
// "image:<image key>". The editor holding that piece scrolls it into view and focuses its
// field once it is on screen, then the request is spent.
let wanted: string | undefined;
const listeners = new Set<() => void>();

export function focusPiece(key: string | undefined): void {
  wanted = key;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ceiling: frames to wait for the Edit tab and its section to show the piece.
const frames = 60;

export function usePieceFocus(key: string, target: RefObject<HTMLElement | null>): boolean {
  const current = useSyncExternalStore(
    subscribe,
    () => wanted,
    () => undefined,
  );
  const asked = current === key;
  useEffect(() => {
    if (!asked) return;
    let left = frames;
    let handle = 0;
    const attempt = () => {
      const element = target.current;
      // Hidden until its tab and section show: an element with no box cannot take focus.
      if (element !== null && element.getClientRects().length > 0) {
        element.scrollIntoView({ block: "center" });
        element.focus({ preventScroll: true });
        if (wanted === key) focusPiece(undefined);
        return;
      }
      left -= 1;
      if (left > 0) handle = requestAnimationFrame(attempt);
    };
    handle = requestAnimationFrame(attempt);
    return () => cancelAnimationFrame(handle);
  }, [asked, key, target]);
  return asked;
}
