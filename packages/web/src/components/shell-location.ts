import { useLocation } from "@tanstack/react-router";
import { type RefObject, useEffect, useRef } from "react";
import { useCurrentChannel } from "@/channels/current";
import { recordLocation } from "./came-from.js";
import { setFallbackTitle, titleForPath } from "./document-title.js";

// What the shell does each time the address changes: names the browser tab after the
// destination, remembers the list a project was opened from (`came-from.ts`), and, when the
// screen itself changed, moves focus to its heading so a keyboard or screen-reader user starts
// at the top of the new screen instead of on a link that is no longer there. A change of
// section or filter on the same screen keeps focus where it is. Until the person has pressed a
// key or a pointer, a change of screen is the app's own (a fresh install's Home sending it on to
// Welcome) and keeps the browser's focus, as the first screen does: nothing was moved away from,
// and Chromium would ring the heading of a screen nobody has touched yet.
export function useShellLocation(main: RefObject<HTMLElement | null>): void {
  const pathname = useLocation({ select: (current) => current.pathname });
  const search = useLocation({ select: (current) => current.search });
  const channels = useCurrentChannel().channels;

  useEffect(() => {
    setFallbackTitle(titleForPath(pathname));
  }, [pathname]);

  useEffect(() => {
    recordLocation(
      pathname,
      search as Readonly<Record<string, unknown>>,
      (id) => channels.find((channel) => channel.id === id)?.name,
    );
  }, [pathname, search, channels]);

  const touched = useRef(false);
  useEffect(() => {
    const mark = () => {
      touched.current = true;
    };
    const options = { capture: true, passive: true } as const;
    window.addEventListener("pointerdown", mark, options);
    window.addEventListener("keydown", mark, options);
    return () => {
      window.removeEventListener("pointerdown", mark, options);
      window.removeEventListener("keydown", mark, options);
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `pathname` is the trigger: focus moves when the screen changes, read from the DOM once it has drawn.
  useEffect(() => {
    // The first screen, and any the app moved to before the person did anything, keep the
    // browser's own focus.
    if (!touched.current) return;
    const frame = requestAnimationFrame(() => {
      const region = main.current;
      if (region === null) return;
      // A dialog opened by the new screen keeps its own focus.
      if (document.activeElement?.closest('[role="dialog"]')) return;
      const heading = region.querySelector<HTMLElement>("h1");
      const target = heading ?? region;
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname, main]);
}
