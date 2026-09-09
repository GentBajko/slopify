import { type RefObject, useEffect, useRef } from "react";
import { getOpenDialog, getTarget, relatedPortals } from "./spotlight-dom";

const focusable = 'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]';

export function useSpotlightInteraction(
  target: string,
  onClose: () => void,
  cardRef: RefObject<HTMLElement | null>,
  titleRef: RefObject<HTMLHeadingElement | null>,
) {
  const returnFocusRef = useRef(document.activeElement);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previousFocus = returnFocusRef.current;
    return () => {
      queueMicrotask(() => {
        if (previousFocus instanceof HTMLElement && previousFocus.isConnected && !cardRef.current) {
          previousFocus.focus({ preventScroll: true });
        }
      });
    };
  }, [cardRef]);

  // Capture at window level, before application handlers. The SVG also catches pointer
  // hits on its painted area, but keyboard and programmatic clicks need the same boundary.
  useEffect(() => {
    const roots = () => {
      const element = getTarget(target);
      return [element, cardRef.current, ...relatedPortals(element)].filter(
        (root): root is HTMLElement => root !== null,
      );
    };
    const allowed = (node: EventTarget | null) =>
      node instanceof Node && roots().some((root) => root.contains(node));
    const blockOutside = (event: Event) => {
      // An action in the target may open a real app dialog. Its own overlay and focus
      // scope take over immediately, even before the tutorial's next layout measurement.
      if (getOpenDialog()) return;
      if (allowed(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const focusInside = (event: FocusEvent) => {
      if (getOpenDialog()) return;
      if (allowed(event.target)) return;
      // Radix temporarily focuses its guards while a select portal opens/closes.
      if (
        event.target instanceof HTMLElement &&
        event.target.hasAttribute("data-radix-focus-guard")
      )
        return;
      titleRef.current?.focus({ preventScroll: true });
    };
    const keydown = (event: KeyboardEvent) => {
      if (getOpenDialog()) return;
      const portals = relatedPortals(getTarget(target));
      if (event.key === "Escape") {
        // Escape closes an open picker first; another Escape exits the guide.
        if (portals.length > 0) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") {
        if (!allowed(event.target)) blockOutside(event);
        return;
      }
      if (portals.length > 0) return;
      const controls = roots()
        .flatMap((root) => [root, ...root.querySelectorAll<HTMLElement>(focusable)])
        .filter(
          (node, index, all) =>
            all.indexOf(node) === index &&
            node.tabIndex >= 0 &&
            !node.matches(":disabled, [hidden], [aria-hidden='true']") &&
            !node.closest("[hidden], [inert]"),
        );
      if (controls.length === 0) return;
      const current = controls.indexOf(document.activeElement as HTMLElement);
      const next =
        current === -1
          ? event.shiftKey
            ? controls.length - 1
            : 0
          : (current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
      event.preventDefault();
      controls[next]?.focus();
    };
    const events = [
      "pointerdown",
      "pointerup",
      "mousedown",
      "mouseup",
      "click",
      "dblclick",
      "contextmenu",
    ];
    for (const event of events) window.addEventListener(event, blockOutside, true);
    window.addEventListener("keydown", keydown, true);
    window.addEventListener("focusin", focusInside, true);
    return () => {
      for (const event of events) window.removeEventListener(event, blockOutside, true);
      window.removeEventListener("keydown", keydown, true);
      window.removeEventListener("focusin", focusInside, true);
    };
  }, [target, cardRef, titleRef]);
}
