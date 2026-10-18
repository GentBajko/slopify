import { RefusedClick } from "../fill.js";
import { labelOf } from "./find.js";
import { platformLabels, type SocialPlatform } from "./types.js";

export { RefusedClick };

// The buttons the extension never presses on a site it posts to: the site's own Post, Share,
// Publish and final Schedule, Discard, and the account-setting prompts' Turn on and Allow. Each
// site lists its own by selector; the labels below are refused on every site, matched to a
// button's whole label (so X's "Schedule post", which only opens the date picker, and TikTok's
// "Schedule" radio, which is no button, stay allowed).
export interface Forbidden {
  readonly selectors: readonly string[];
  readonly labels: readonly RegExp[];
}

export const forbiddenEverywhere: readonly RegExp[] = [
  /^post$/i,
  /^post all$/i,
  /^share$/i,
  /^share now$/i,
  /^publish$/i,
  /^publish post$/i,
  /^schedule$/i,
  /^tweet$/i,
  /^reply$/i,
  /^discard$/i,
  /^discard post$/i,
  /^turn on$/i,
  /^allow$/i,
  /^delete$/i,
];

const buttonLike = 'button, [role="button"], input[type="submit"], input[type="button"]';

// Throws `RefusedClick` for a forbidden control, before anything is pressed.
export function refuse(element: Element, site: SocialPlatform, forbidden: Forbidden): void {
  const control = element.closest(buttonLike);
  const bySelector = forbidden.selectors.some((selector) => element.closest(selector) !== null);
  const label = control === null ? "" : labelOf(control);
  const byLabel =
    control !== null &&
    [...forbiddenEverywhere, ...forbidden.labels].some((pattern) => pattern.test(label));
  if (bySelector || byLabel)
    throw new RefusedClick(
      `Slopify stopped before pressing ${platformLabels[site]}'s ${label === "" ? "final" : `"${label}"`} button: it never posts, schedules or discards for you. Check the post and press it yourself.`,
    );
}

// Presses a control the way a mouse does (pointer and mouse events, then click), after
// refusing the site's forbidden ones.
export function pressOn(site: SocialPlatform, forbidden: Forbidden): (element: Element) => void {
  return (element) => {
    refuse(element, site, forbidden);
    const view = element.ownerDocument.defaultView;
    const box = element.getBoundingClientRect();
    const at: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0,
      clientX: box.left + box.width / 2,
      clientY: box.top + box.height / 2,
    };
    const Mouse = view?.MouseEvent ?? MouseEvent;
    const Pointer = view?.PointerEvent ?? Mouse;
    const pointer = { ...at, pointerId: 1, pointerType: "mouse", isPrimary: true };
    element.dispatchEvent(new Pointer("pointerdown", { ...pointer, buttons: 1 }));
    element.dispatchEvent(new Mouse("mousedown", { ...at, buttons: 1, detail: 1 }));
    element.dispatchEvent(new Pointer("pointerup", { ...pointer, buttons: 0 }));
    element.dispatchEvent(new Mouse("mouseup", { ...at, buttons: 0, detail: 1 }));
    if (typeof (element as HTMLElement).click === "function") (element as HTMLElement).click();
    else element.dispatchEvent(new Mouse("click", { ...at, buttons: 0, detail: 1 }));
  };
}
