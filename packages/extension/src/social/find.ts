import type { FieldSelectors } from "../selectors.js";

// How the posting adapters find a site's controls. Each control is a `SiteSelectors`: CSS
// selectors tried in order (like YouTube Studio's `FieldSelectors`), optionally narrowed to the
// elements whose label or text matches `text`, and searched inside open shadow roots too where
// the site builds its form from web components (Reddit). `checked` is the date the selector
// was seen on the live site, or null where it comes from the site's help pages or an educated
// guess and still needs a live check by the person (docs/studio-extension.md lists them).

export interface SiteSelectors extends FieldSelectors {
  readonly text?: RegExp;
  readonly shadow?: true;
  readonly checked: string | null;
}

// Every root to search: the root itself and, when asked, each open shadow root below it.
function rootsOf(root: ParentNode, shadow: boolean): readonly ParentNode[] {
  if (!shadow) return [root];
  const roots: ParentNode[] = [root];
  for (let at = 0; at < roots.length; at++) {
    const current = roots[at];
    if (current === undefined) continue;
    for (const element of current.querySelectorAll("*"))
      if (element.shadowRoot !== null) roots.push(element.shadowRoot);
  }
  return roots;
}

// What a control says: its aria-label, else its text, with spaces collapsed.
export function labelOf(element: Element): string {
  const aria = element.getAttribute("aria-label");
  const text = aria !== null && aria.trim() !== "" ? aria : (element.textContent ?? "");
  return text.replace(/\s+/g, " ").trim();
}

function matches(field: SiteSelectors): (element: Element) => boolean {
  return (element) =>
    (field.exclude === undefined || element.closest(field.exclude) === null) &&
    (field.text === undefined ||
      field.text.test(labelOf(element)) ||
      field.text.test((element.textContent ?? "").replace(/\s+/g, " ").trim()));
}

// The first element any of a control's selectors finds.
export function findIn(root: ParentNode, field: SiteSelectors): Element | null {
  const roots = rootsOf(root, field.shadow === true);
  for (const selector of field.selectors)
    for (const within of roots) {
      const found = [...within.querySelectorAll(selector)].find(matches(field));
      if (found !== undefined) return found;
    }
  return null;
}

// Every element the first matching selector finds, in document order.
export function findAllIn(root: ParentNode, field: SiteSelectors): readonly Element[] {
  const roots = rootsOf(root, field.shadow === true);
  for (const selector of field.selectors) {
    const found = roots.flatMap((within) =>
      [...within.querySelectorAll(selector)].filter(matches(field)),
    );
    if (found.length > 0) return found;
  }
  return [];
}

// The controls of `needed` that are not on the page, by their labels ("the post's text box").
export function missingOf(root: ParentNode, needed: readonly SiteSelectors[]): readonly string[] {
  return needed.filter((field) => findIn(root, field) === null).map((field) => field.label);
}

// A switch or checkbox's state: aria-checked, or the input's own checked.
export function isOn(element: Element): boolean {
  if (element.getAttribute("aria-checked") === "true") return true;
  if (element.getAttribute("aria-pressed") === "true") return true;
  return (element as HTMLInputElement).checked === true;
}

// The switch (or checkbox) a label's text belongs to: the nearest one in the label's own
// block, looking up a few levels ("Add AI label" sits beside its switch, not around it).
export function switchNear(root: ParentNode, text: RegExp, shadow = false): Element | null {
  const switches =
    'input[type="checkbox"], [role="switch"], [role="checkbox"], input[role="switch"]';
  const roots = rootsOf(root, shadow);
  for (const within of roots)
    for (const control of within.querySelectorAll(switches))
      if (text.test(control.getAttribute("aria-label") ?? "")) return control;
  for (const within of roots)
    for (const element of within.querySelectorAll("label, span, div, p, h2, h3")) {
      const own = [...element.childNodes]
        .filter((node) => node.nodeType === 3)
        .map((node) => node.textContent ?? "")
        .join("")
        .replace(/\s+/g, " ")
        .trim();
      if (!text.test(own)) continue;
      let at: Element | null = element;
      for (let level = 0; at !== null && level < 6; level++, at = at.parentElement) {
        if (at.matches(switches)) return at;
        const found = at.querySelector(switches);
        if (found !== null) return found;
      }
    }
  return null;
}
