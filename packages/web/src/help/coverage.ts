// For the screen walks (help/walk/*.test.tsx): every labelled form control on a rendered
// screen must have an info button beside it. "Beside" is exact: the nearest element around the
// control marked `data-help-scope` (a kit Field, a Switch or Segmented with a `tip`, a
// LabelledSwitch with a `tip`, or a row spreading `helpScope`) contains a `data-help-id`
// button. A control with no scope around it counts as unexplained.

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
    if (allow.some((rule) => (typeof rule === "string" ? rule === name : rule.test(name))))
      continue;
    const scope = control.closest("[data-help-scope]");
    if (scope?.querySelector("[data-help-id]") != null) continue;
    missing.push({ name, html: control.outerHTML.slice(0, 160) });
  }
  return missing;
}

// Self-explanatory controls every screen may carry without a tip.
export const selfExplanatory: readonly (string | RegExp)[] = [
  /^Search\b/i,
  /^Filter\b/i,
  /^Select (all|row|\S+ for)/i,
];
