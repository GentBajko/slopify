// For the screen walks (help/walk/*.test.tsx): every labelled form control on a rendered
// screen is explained beside it, by one short visible sentence or, where the consequence needs a
// paragraph, an info button. "Beside" is exact: the nearest element around the control marked
// `data-help-scope` (a kit Field, a Switch, Segmented or LabelledSwitch with a `help` or a
// `tip`, or a row spreading `helpScope`) contains a visible help line marked `data-help-text`
// (kit Field's `help`, kit HelpLine) or a `data-help-id` info button. A control with no scope
// around it counts as unexplained; one whose label alone says what it does is named in the
// walk's allow list instead.
//
// The same pass holds three more rules on what a walk renders, each reported as one entry: no
// name a walk renders (a setting, button, link, tab, menu item or heading) uses
// jargon (TTS, LLM, STT, ASR, Chunking, Subtitles), and no button or link is named for the
// machinery (Render, Regenerate, Remake); an info button sits beside a field's label, never
// beside a button, a heading or a list row's title (a wrapper around either doesn't hide it),
// and one to a field; and each area of the screen has at most one enabled primary (lime)
// button.

const controlSelector = [
  "input:not([type=hidden])",
  "select",
  "textarea",
  "[role=switch]",
  "[role=checkbox]",
  "[role=radiogroup]",
  "[role=slider]",
  "[role=combobox]",
  "[role=group]",
].join(",");

// What a person never meets as a setting of its own: anything in a hidden branch, a file input
// (its upload button is the action), and a group that is not a choice (Segmented renders
// pressed buttons, a Radix ToggleGroup renders radios; any other group is only layout).
function skipped(control: Element): boolean {
  if (control.closest("[hidden],[aria-hidden=true],[inert]") !== null) return true;
  if (control instanceof HTMLInputElement && control.type === "file") return true;
  // A video or audio player's seek, volume and buttons play the media; they are not settings.
  if (control.closest("[data-slot=player], [data-slot=audio-player]") !== null) return true;
  if (control.getAttribute("role") === "group") {
    return ![...control.children].some(
      (child) => child.hasAttribute("aria-pressed") || child.getAttribute("role") === "radio",
    );
  }
  return false;
}

// A help line counts only when a sighted person can read it: words in it, and not hidden,
// collapsed or kept for screen readers alone.
function readable(line: Element): boolean {
  if (line.closest("[hidden],[aria-hidden=true],[inert],.sr-only") !== null) return false;
  if (line instanceof HTMLElement && line.style.display === "none") return false;
  return (line.textContent ?? "").trim() !== "";
}

function explained(scope: Element | null): boolean {
  if (scope === null) return false;
  if (scope.querySelector("[data-help-id]") !== null) return true;
  return [...scope.querySelectorAll("[data-help-text]")].some(readable);
}

// The name a screen reader would read, closely enough for this check: aria-labelledby,
// aria-label, a <label for>, a wrapping <label>, a button's own text, then placeholder/title.
function accessibleName(control: Element): string {
  const doc = control.ownerDocument;
  const labelledBy = control.getAttribute("aria-labelledby");
  if (labelledBy !== null && labelledBy.trim() !== "") {
    return labelledBy
      .split(/\s+/)
      .map((id) => doc.getElementById(id)?.textContent ?? "")
      .join(" ")
      .trim();
  }
  const label = control.getAttribute("aria-label");
  if (label !== null && label.trim() !== "") return label.trim();
  if (control.id !== "") {
    const forLabel = doc.querySelector(`label[for="${CSS.escape(control.id)}"]`);
    if (forLabel !== null) return (forLabel.textContent ?? "").trim();
  }
  const wrapping = control.closest("label");
  if (wrapping !== null) return (wrapping.textContent ?? "").trim();
  if (control.tagName === "BUTTON") return (control.textContent ?? "").trim();
  return (control.getAttribute("placeholder") ?? control.getAttribute("title") ?? "").trim();
}

export interface UnexplainedControl {
  readonly name: string;
  readonly html: string;
}

export function unexplainedControls(
  root: Element,
  allow: readonly (string | RegExp)[] = [],
): UnexplainedControl[] {
  const missing: UnexplainedControl[] = [];
  for (const control of root.querySelectorAll(controlSelector)) {
    if (skipped(control)) continue;
    const name = accessibleName(control);
    if (name === "") continue;
    if (jargon.test(name)) {
      missing.push({ name: `Jargon in a label: ${name}`, html: control.outerHTML.slice(0, 160) });
      continue;
    }
    if (allow.some((rule) => (typeof rule === "string" ? rule === name : rule.test(name))))
      continue;
    if (explained(control.closest("[data-help-scope]"))) continue;
    missing.push({ name, html: control.outerHTML.slice(0, 160) });
  }
  return [...missing, ...badWords(root), ...misplacedTips(root), ...extraPrimaries(root)];
}

// Words a person who doesn't build software can't read. Say "voice", "writer", "captions"
// and "split into parts" instead. PDF and AI are words people know.
const jargon = /\b(TTS|LLM|STT|ASR|Subtitles?)\b|\bChunking\b/;
// An action named for the machinery instead of its result: say "Make … again".
const machineVerb = /^(Render|Re-render|Regenerate|Remake)\b/i;

function shown(element: Element): boolean {
  return element.closest("[hidden],[aria-hidden=true],[inert]") === null;
}

// Every other name a walk renders, beyond the settings checked above: a button's, a link's, a
// tab's, a menu item's, a heading's. Each name is reported once. A select's options are left
// out: they are data, where a service's own model name ("GPT-4o mini TTS") is a name.
function badWords(root: Element): UnexplainedControl[] {
  const found: UnexplainedControl[] = [];
  const reported = new Set<string>();
  const named = "button, a[href], [role=tab], [role=menuitem], h1, h2, h3, h4, h5, h6";
  for (const element of root.querySelectorAll(named)) {
    if (element.matches(controlSelector) || !shown(element)) continue;
    const name = (element.getAttribute("aria-label") ?? element.textContent ?? "")
      .replace(/\s+/g, " ")
      .trim();
    const action = element.matches("button, a[href], [role=menuitem]");
    const problem = jargon.test(name)
      ? `Jargon in a label: ${name}`
      : action && machineVerb.test(name)
        ? `Named for the machinery, not its result: ${name}`
        : undefined;
    if (problem === undefined || reported.has(problem)) continue;
    reported.add(problem);
    found.push({ name: problem, html: element.outerHTML.slice(0, 160) });
  }
  return found;
}

// Text that is only spacing, or a comment, is not something a tip sits beside.
function blank(node: Node): boolean {
  if (node.nodeType === Node.ELEMENT_NODE) return false;
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").trim() === "";
  return true;
}

function sibling(node: Node, side: "previous" | "next"): Node | null {
  let next = side === "previous" ? node.previousSibling : node.nextSibling;
  while (next !== null && blank(next))
    next = side === "previous" ? next.previousSibling : next.nextSibling;
  return next;
}

// The one meaningful child of a wrapper, or undefined when it holds more (or text).
function only(element: Element): Element | undefined {
  const children = [...element.childNodes].filter((node) => !blank(node));
  const [child] = children;
  return children.length === 1 && child instanceof Element ? child : undefined;
}

// What sits right beside a tip on one side: a wrapper that holds nothing but the tip doesn't
// hide its neighbour (`<span><InfoTip/></span>` after a button is after the button). Words
// before it (a tip ending a sentence) or nothing at all is undefined. A help scope, a label or
// a heading is as far as it looks.
function beside(tip: Element, side: "previous" | "next"): Element | undefined {
  let node: Element = tip;
  for (;;) {
    const next = sibling(node, side);
    if (next !== null) return next instanceof Element ? next : undefined;
    const parent = node.parentElement;
    if (parent === null || only(parent) !== node) return undefined;
    if (parent.matches("[data-help-scope], label, legend, h1, h2, h3, h4, h5, h6, [role=heading]"))
      return undefined;
    node = parent;
  }
}

const heading = "h1, h2, h3, h4, h5, h6, [role=heading]";

// What a tip's neighbour is, looking through wrappers that hold one element each: a button in
// a span is still a button.
function kind(neighbour: Element | undefined): string | undefined {
  for (let element = neighbour; element !== undefined; element = only(element)) {
    if (element.matches(kitButton)) return "a button";
    if (element.matches(heading)) return "a heading";
    if (element.matches(".sl-row__title")) return "a row's title";
  }
  return undefined;
}

// The kit's buttons, button-looking links and Play key, by the marks the kit puts on them
// (components/kit/button.tsx, link.tsx); their classes are the kit's own to write.
const kitButton = "[data-slot=button], [data-slot=button-link], [data-slot=play-key]";
const kitPrimary = [
  "[data-slot=button][data-variant=primary]",
  "[data-slot=button-link][data-variant=primary]",
  "[data-slot=play-key]",
].join(",");

// An info button sits beside a field's label, where the question comes up, and alone: never
// beside a button (the button's name says what it does), a heading or a list row's title, and
// never a second one in the same field.
function misplacedTips(root: Element): UnexplainedControl[] {
  const found: UnexplainedControl[] = [];
  const perScope = new Map<Element, number>();
  for (const tip of root.querySelectorAll("[data-help-id]")) {
    if (!shown(tip)) continue;
    const name = tip.getAttribute("aria-label") ?? tip.getAttribute("data-help-id") ?? "";
    const after = kind(beside(tip, "previous"));
    const before = kind(beside(tip, "next"));
    if (tip.parentElement?.closest(heading) != null) {
      found.push({
        name: `Info button inside a heading: ${name}`,
        html: tip.outerHTML.slice(0, 160),
      });
    } else if (after !== undefined) {
      found.push({
        name: `Info button after ${after}: ${name}`,
        html: tip.outerHTML.slice(0, 160),
      });
    } else if (before !== undefined) {
      found.push({
        name: `Info button before ${before}: ${name}`,
        html: tip.outerHTML.slice(0, 160),
      });
    }
    const scope = tip.closest("[data-help-scope]");
    if (scope === null) continue;
    const count = (perScope.get(scope) ?? 0) + 1;
    perScope.set(scope, count);
    if (count === 2)
      found.push({
        name: `Two info buttons in one field: ${name}`,
        html: scope.outerHTML.slice(0, 160),
      });
  }
  return found;
}

// The lime marks the one thing to do next, so an area has one: the page itself, each rail,
// the shell's navigation, each dialog, and each card or row of a list (its own next step). A
// disabled primary wears no lime and doesn't count.
function extraPrimaries(root: Element): UnexplainedControl[] {
  const found: UnexplainedControl[] = [];
  const seen = new Map<Element | null, string>();
  for (const key of root.querySelectorAll(kitPrimary)) {
    if (!shown(key)) continue;
    if (key.matches(":disabled, [aria-disabled=true]")) continue;
    const area = key.closest(
      "[role=dialog], [role=alertdialog], nav, aside, li, article, [data-area]",
    );
    const name = (key.getAttribute("aria-label") ?? key.textContent ?? "").trim();
    const first = seen.get(area);
    if (first === undefined) seen.set(area, name);
    else
      found.push({
        name: `Second primary in one area: ${name} (after ${first})`,
        html: key.outerHTML.slice(0, 160),
      });
  }
  return found;
}

// Self-explanatory controls every screen may carry without a help line or a tip. "Showing:" is
// the page header's channel picker (channels/current.tsx): like a filter, it only narrows what
// the page shows.
export const selfExplanatory: readonly (string | RegExp)[] = [
  /^Search\b/i,
  /^Filter\b/i,
  /^Sort\b/i,
  /^Select (all|row|\S+ for)/i,
  /^Showing:$/,
];

// Create's stage editors (play/), and Edit template's, which draw the same ones. A stage's
// switch is named for its stage and says in words what each choice makes and what it costs
// ("Narration: Off | AI voice (paid per character) | My own audio file"). A service group's
// Service and Model are named by the group ("Read by Service"), and its line under them says
// what the picked model's state is once there is one; the Voice select says what to do next in
// its first entry.
export const stageEditors: readonly (string | RegExp)[] = [
  /^(Research|Article|Narration|Images|Video)$/,
  /^(.+ is read|Read|Intro and outro read|Written|Images|Drawn|Checked) by (Service|Model)$/,
  /^(Voice|Intro and outro voice)$/,
];
