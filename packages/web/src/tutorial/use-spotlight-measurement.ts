import { type RefObject, useLayoutEffect, useState } from "react";
import { boxOf, getOpenDialog, getTarget, relatedPortals } from "./spotlight-dom";
import type { Box } from "./spotlight-geometry";

interface Measurement {
  readonly key: string;
  readonly target: Box | null;
  readonly portals: readonly Box[];
  readonly width: number;
  readonly height: number;
  readonly cardHeight: number;
  readonly modalOpen: boolean;
}

export function useSpotlightMeasurement(
  key: string,
  target: string,
  cardRef: RefObject<HTMLElement | null>,
  titleRef: RefObject<HTMLHeadingElement | null>,
  overlayRef: RefObject<HTMLDivElement | null>,
  spacerRef: RefObject<HTMLDivElement | null>,
) {
  const [measurement, setMeasurement] = useState<Measurement>(() => ({
    key,
    target: null,
    portals: [],
    width: window.innerWidth,
    height: window.innerHeight,
    cardHeight: 260,
    modalOpen: getOpenDialog() !== null,
  }));
  // Route loaders and conditional form controls can mount after the instruction card.
  // Observe structure/layout only; no input values are read or copied by the tutorial.
  useLayoutEffect(() => {
    let frame = 0;
    let scrollFrame = 0;
    let scrolled: HTMLElement | null = null;
    let observed: HTMLElement | null = null;
    const raised = new Map<HTMLElement, string>();
    const resize = new ResizeObserver(() => schedule());
    const restorePortals = (active: Set<HTMLElement>) => {
      for (const [element, previous] of raised) {
        if (!active.has(element)) {
          element.style.zIndex = previous;
          raised.delete(element);
        }
      }
    };
    const measure = () => {
      frame = 0;
      const element = getTarget(target);
      if (element !== observed) {
        if (observed) resize.unobserve(observed);
        if (element) resize.observe(element);
        observed = element;
      }
      const box = element ? boxOf(element) : null;
      if (element && box && scrolled !== element) {
        scrolled = element;
        cancelAnimationFrame(scrollFrame);
        // Let the measured card and its extra document scrolling room commit first.
        // Centering before that commit can strand a short form behind a bottom dock.
        scrollFrame = requestAnimationFrame(() => {
          scrollFrame = 0;
          if (!element.isConnected) return;
          element.scrollIntoView({ block: "start", inline: "nearest", behavior: "instant" });
          measure();
        });
      }
      const portals = relatedPortals(element);
      const active = new Set<HTMLElement>();
      for (const portal of portals) {
        const layer = portal.closest<HTMLElement>("[data-radix-popper-content-wrapper]") ?? portal;
        active.add(layer);
        if (!raised.has(layer)) {
          raised.set(layer, layer.style.zIndex);
          layer.style.zIndex = "102";
        }
      }
      restorePortals(active);
      const next: Measurement = {
        key,
        target: box,
        portals: portals.map(boxOf).filter((box): box is Box => box !== null),
        width: window.innerWidth,
        height: window.innerHeight,
        cardHeight: cardRef.current?.getBoundingClientRect().height || 260,
        modalOpen: getOpenDialog() !== null,
      };
      setMeasurement((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
    };
    function schedule() {
      if (!frame) frame = requestAnimationFrame(measure);
    }
    const mutations = new MutationObserver((records) => {
      if (
        records.some(
          (record) =>
            !overlayRef.current?.contains(record.target) && record.target !== spacerRef.current,
        )
      ) {
        schedule();
      }
    });
    mutations.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "id",
        "class",
        "style",
        "hidden",
        "aria-controls",
        "data-state",
        "data-tour",
      ],
    });
    if (cardRef.current) resize.observe(cardRef.current);
    resize.observe(document.documentElement);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    measure();
    if (!getOpenDialog()) titleRef.current?.focus({ preventScroll: true });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(scrollFrame);
      resize.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      restorePortals(new Set());
    };
  }, [key, target, cardRef, titleRef, overlayRef, spacerRef]);

  return measurement;
}
