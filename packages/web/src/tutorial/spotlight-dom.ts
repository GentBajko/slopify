import type { Box } from "./spotlight-geometry";

const portalSelector = '[data-slot="select-content"], [data-slot="dropdown-menu-content"]';

export function getTarget(selector: string): HTMLElement | null {
  try {
    return document.querySelector<HTMLElement>(selector);
  } catch {
    return null;
  }
}

export function getOpenDialog(): HTMLElement | null {
  return (
    [
      ...document.querySelectorAll<HTMLElement>('[data-slot="dialog-content"][data-state="open"]'),
    ].at(-1) ?? null
  );
}

/** Only permit portal controls whose trigger belongs to this step's actual target. */
export function relatedPortals(target: HTMLElement | null): HTMLElement[] {
  if (!target) return [];
  const triggers = [target, ...target.querySelectorAll<HTMLElement>("[aria-controls]")];
  const ids = new Set(
    triggers.flatMap((trigger) => (trigger.getAttribute("aria-controls") ?? "").split(" ")),
  );
  return [...document.querySelectorAll<HTMLElement>(portalSelector)].filter((portal) =>
    ids.has(portal.id),
  );
}

export function boxOf(element: HTMLElement): Box | null {
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0
    ? { left: box.left, top: box.top, width: box.width, height: box.height }
    : null;
}
