// Text as libass draws it literally: braces and backslashes escaped rather than read as
// override tags; code keeps its spaces, prose has them collapsed. Shared by the figure cards
// and the designs' text layer, so a name, date or price is drawn exactly as typed.
export function assText(value: string, keepSpaces = false): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}");
  return keepSpaces
    ? escaped.replace(/ {2,}/g, (run) => "\\h".repeat(run.length))
    : escaped.replace(/\s+/g, " ");
}

// #RRGGBB as ASS writes a colour: &HBBGGRR&. Anything else draws white.
export function assColour(hex: string): string {
  const match = /^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/.exec(hex);
  if (match === null) return "&HFFFFFF&";
  const [, r, g, b] = match;
  return `&H${(b ?? "").toUpperCase()}${(g ?? "").toUpperCase()}${(r ?? "").toUpperCase()}&`;
}
