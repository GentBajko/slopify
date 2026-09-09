export interface FontSummary {
  readonly id: string;
  readonly name: string;
  readonly family: string;
  readonly source: "bundled" | "system" | "uploaded";
}

export interface ResolvedFont extends FontSummary {
  readonly path: string;
  readonly extension: ".ttf" | ".otf" | ".ttc";
  readonly assName: string;
  readonly faceIndex: number;
}

export const fontMaxBytes = 32 * 1024 * 1024;

export function fontSummary(font: ResolvedFont): FontSummary {
  return { id: font.id, name: font.name, family: font.family, source: font.source };
}
