// Colour entry: one rule for every hex box in the app. Three or six hex digits, with or
// without the #, the way the document theme has always taken them; a partial value is kept as
// typed and simply not used until it is whole.

const hexPattern = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

// "#8c1e14" for "8C1E14", "#8c1e14" or "#abc" → "#aabbcc"; undefined while it is not a colour.
export function parseHex(text: string): string | undefined {
  const match = hexPattern.exec(text.trim());
  const digits = match?.[1];
  if (digits === undefined) return undefined;
  const six = digits.length === 3 ? [...digits].map((digit) => digit + digit).join("") : digits;
  return `#${six.toLowerCase()}`;
}

export const hexHint = "Write the colour as # and 3 or 6 hex digits, like #8c1e14 or #fff.";

export function hexProblem(text: string): string | undefined {
  if (text.trim() === "") return undefined;
  return parseHex(text) === undefined ? hexHint : undefined;
}

function channel(value: number): number {
  const share = value / 255;
  return share <= 0.03928 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

// The WCAG contrast ratio of two colours, 1 to 21; undefined when either is not a colour yet.
export function contrastRatio(one: string, other: string): number | undefined {
  const a = parseHex(one);
  const b = parseHex(other);
  if (a === undefined || b === undefined) return undefined;
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

// The warning under a colour used for text, or undefined when it reads well enough.
export function contrastWarning(
  colour: string,
  against: string,
  againstName: string,
  minimum: number,
): string | undefined {
  const ratio = contrastRatio(colour, against);
  if (ratio === undefined || ratio >= minimum) return undefined;
  return `Hard to read on ${againstName}: contrast ${ratio.toFixed(1)}:1, below the ${String(minimum)}:1 text needs. Pick a lighter or darker colour.`;
}
