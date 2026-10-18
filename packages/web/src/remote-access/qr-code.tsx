import type { ReactElement } from "react";
import { encode } from "uqr";

// A QR code of `text` as one SVG path, dark modules on white whatever the theme, since phone
// cameras read dark on light most reliably.
export function QrCode({
  text,
  label,
  size = 168,
}: {
  readonly text: string;
  readonly label: string;
  readonly size?: number;
}): ReactElement {
  const { data } = encode(text, { ecc: "M", border: 2 });
  const modules = data.length;
  const path = data
    .flatMap((row, y) => row.map((dark, x) => (dark ? `M${x} ${y}h1v1h-1z` : "")))
    .join("");
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${modules} ${modules}`}
      shapeRendering="crispEdges"
      className="shrink-0 rounded-sm"
    >
      <rect width={modules} height={modules} fill="white" />
      <path d={path} fill="black" />
    </svg>
  );
}
