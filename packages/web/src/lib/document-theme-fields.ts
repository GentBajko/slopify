import type { DocumentTheme } from "@app/slices/document/theme.js";
import { fontFamilies, type fontStyles } from "@app/slices/document/theme.js";
import { documentThemeSchema } from "@app/slices/document/theme-schema.js";

// Every setting of a document theme, grouped as the editor shows them. The ranges are read
// off the schema the server checks a save with, so the form can't offer a value it refuses.

export type FieldPath = readonly string[];

interface Base {
  readonly path: FieldPath;
  readonly label: string;
  readonly help?: string;
}

export type ThemeField =
  | (Base & { readonly kind: "number"; readonly unit: string; readonly step: number })
  | (Base & { readonly kind: "color" })
  | (Base & { readonly kind: "text" })
  // An empty box saves null, which hides that line or link.
  | (Base & { readonly kind: "optional-text" })
  | (Base & { readonly kind: "toggle" })
  | (Base & {
      readonly kind: "choice";
      readonly options: readonly {
        readonly value: string | number | null;
        readonly label: string;
      }[];
    })
  | (Base & { readonly kind: "face" })
  | (Base & { readonly kind: "lines" })
  | (Base & { readonly kind: "link" });

export interface ThemeGroup {
  readonly title: string;
  readonly fields: readonly ThemeField[];
}

const mm = (path: FieldPath, label: string, help?: string): ThemeField => ({
  kind: "number",
  path,
  label,
  unit: "mm",
  step: 1,
  ...(help === undefined ? {} : { help }),
});
const pt = (path: FieldPath, label: string, help?: string): ThemeField => ({
  kind: "number",
  path,
  label,
  unit: "pt",
  step: 0.5,
  ...(help === undefined ? {} : { help }),
});
const share = (path: FieldPath, label: string, unit: string, help?: string): ThemeField => ({
  kind: "number",
  path,
  label,
  unit,
  step: 0.05,
  ...(help === undefined ? {} : { help }),
});
const toggle = (path: FieldPath, label: string, help?: string): ThemeField => ({
  kind: "toggle",
  path,
  label,
  ...(help === undefined ? {} : { help }),
});
const text = (path: FieldPath, label: string, help?: string): ThemeField => ({
  kind: "text",
  path,
  label,
  ...(help === undefined ? {} : { help }),
});
const optional = (path: FieldPath, label: string, help?: string): ThemeField => ({
  kind: "optional-text",
  path,
  label,
  ...(help === undefined ? {} : { help }),
});
const face = (key: string, label: string, help?: string): ThemeField => ({
  kind: "face",
  path: ["fonts", key],
  label,
  ...(help === undefined ? {} : { help }),
});

export const themeGroups: readonly ThemeGroup[] = [
  {
    title: "Page",
    fields: [
      {
        kind: "choice",
        path: ["page", "format"],
        label: "Paper size",
        options: [
          { value: "a4", label: "A4" },
          { value: "letter", label: "US Letter" },
        ],
      },
      mm(["page", "margin"], "Margins"),
      mm(["page", "contentTop"], "Text starts at", "From the top, on pages with the header."),
      {
        kind: "choice",
        path: ["background", "image"],
        label: "Background",
        options: [
          { value: "parchment", label: "Parchment texture" },
          { value: null, label: "Flat colour" },
        ],
      },
      {
        kind: "color",
        path: ["background", "color"],
        label: "Page colour",
        help: "Used when the background is a flat colour.",
      },
    ],
  },
  {
    title: "Colours",
    fields: [
      {
        kind: "color",
        path: ["colors", "heading"],
        label: "Headings",
        help: "Also drop caps, the brand name and links.",
      },
      { kind: "color", path: ["colors", "text"], label: "Body text" },
      {
        kind: "color",
        path: ["colors", "muted"],
        label: "Muted",
        help: "Dates, bullets, quotes and the dots in the contents.",
      },
      {
        kind: "color",
        path: ["colors", "faint"],
        label: "Faint",
        help: "Running header and page numbers.",
      },
    ],
  },
  {
    title: "Fonts",
    fields: [
      face("body", "Body"),
      face("strong", "Bold text"),
      face("emphasis", "Italic text"),
      face("heading", "Headings"),
      face("dramatic", "Chapter numbers and brand", 'The big number of a "Chapter 3:" heading.'),
      face("decorative", "Tagline and title-page link"),
      face("dropCap", "Drop caps"),
      face("footer", "Header and page numbers"),
    ],
  },
  {
    title: "Text sizes",
    fields: [
      pt(["sizes", "title"], "Title"),
      pt(["sizes", "brand"], "Brand"),
      pt(
        ["sizes", "section"],
        "Top-level headings",
        "Also the titles of the contents, sources and closing pages.",
      ),
      pt(["sizes", "heading"], "Second-level headings"),
      pt(["sizes", "subheading"], "Third-level headings"),
      pt(["sizes", "body"], "Body"),
      pt(["sizes", "meta"], "Date and word count"),
      pt(["sizes", "footer"], "Header and page numbers"),
    ],
  },
  {
    title: "Spacing",
    fields: [
      mm(["spacing", "bodyLine"], "Body line height"),
      mm(["spacing", "headingLine"], "Heading line height"),
      mm(["spacing", "subheadingLine"], "Subheading line height"),
      share(["spacing", "paragraphGap"], "After a paragraph", "× line"),
      share(["spacing", "headingGap"], "Before a heading", "× line"),
      share(["spacing", "itemGap"], "After a list item", "× line"),
      mm(["spacing", "listIndent"], "List indent"),
      mm(["spacing", "quoteIndent"], "Quote indent"),
      mm(["spacing", "ruleWidth"], "Divider width", "The short centred line a --- becomes."),
    ],
  },
  {
    title: "Drop caps",
    fields: [
      toggle(["dropCap", "enabled"], "Drop caps", "A large first letter after each heading."),
      {
        kind: "choice",
        path: ["dropCap", "lines"],
        label: "Lines tall",
        options: [
          { value: 2, label: "2 lines" },
          { value: 3, label: "3 lines" },
          { value: 4, label: "4 lines" },
        ],
      },
      share(["dropCap", "scale"], "Letter size", "× lines"),
      mm(["dropCap", "gap"], "Gap beside it"),
      {
        kind: "number",
        path: ["dropCap", "minLength"],
        label: "Shortest paragraph",
        unit: "chars",
        step: 10,
        help: "Shorter paragraphs start plainly.",
      },
      share(
        ["dropCap", "minRoom"],
        "Room needed",
        "of page",
        "With less room left, the paragraph starts on the next page.",
      ),
    ],
  },
  {
    title: "Title page",
    fields: [
      mm(["titlePage", "brandY"], "Brand from top"),
      mm(["titlePage", "taglineOffset"], "Tagline below brand"),
      mm(["titlePage", "titleY"], "Title from top"),
      mm(["titlePage", "titleLine"], "Title line height"),
      mm(["titlePage", "metaOffset"], "Details below title"),
      mm(["titlePage", "metaLine"], "Details line height"),
      toggle(["titlePage", "showDate"], "Show the date"),
      toggle(["titlePage", "showWordCount"], "Show the word count"),
      toggle(
        ["titlePage", "cover", "enabled"],
        "Thumbnail as cover",
        "When the project has a thumbnail.",
      ),
      mm(["titlePage", "cover", "gap"], "Space around cover"),
      mm(["titlePage", "cover", "maxHeight"], "Cover height at most"),
    ],
  },
  {
    title: "Branding",
    fields: [
      optional(["brand", "name"], "Brand name", "Leave empty to hide the brand."),
      optional(["brand", "tagline"], "Tagline"),
      optional(["brand", "url"], "Website", "Where the brand and its link go."),
      optional(["brand", "linkLabel"], "Link text", "The linked line under the word count."),
    ],
  },
  {
    title: "Contents page",
    fields: [
      toggle(["contents", "enabled"], "Contents page"),
      text(["contents", "title"], "Title"),
      {
        kind: "choice",
        path: ["contents", "depth"],
        label: "Lists headings down to",
        options: [
          { value: 1, label: "Top level" },
          { value: 2, label: "Second level" },
          { value: 3, label: "Third level" },
        ],
      },
      mm(["contents", "titleOffset"], "Title from top margin"),
      mm(["contents", "firstEntryOffset"], "First entry from top margin"),
      mm(["contents", "line"], "Line height"),
      mm(["contents", "indent"], "Indent per level"),
    ],
  },
  {
    title: "Header and footer",
    fields: [
      toggle(["header", "enabled"], "Running header", "The title at the top of each page."),
      mm(["header", "top"], "Header from top"),
      {
        kind: "number",
        path: ["header", "maxTitleCharacters"],
        label: "Header title at most",
        unit: "chars",
        step: 1,
      },
      toggle(["footer", "enabled"], "Page numbers"),
      text(["footer", "text"], "Page number text", "{page} becomes the page number."),
      mm(["footer", "bottom"], "From the bottom"),
      mm(["footer", "reserve"], "Space kept above it"),
    ],
  },
  {
    title: "Sources page",
    fields: [
      toggle(["sources", "enabled"], "Sources page", "The links the article and research used."),
      text(["sources", "title"], "Title"),
      mm(["sources", "titleOffset"], "Title from top margin"),
      mm(["sources", "bodyOffset"], "List from top margin"),
      mm(["sources", "line"], "Line height"),
      mm(["sources", "gap"], "Gap between sources"),
    ],
  },
  {
    title: "Closing page",
    fields: [
      toggle(["endPage", "enabled"], "Closing page"),
      text(["endPage", "title"], "Title"),
      {
        kind: "lines",
        path: ["endPage", "lines"],
        label: "Text",
        help: 'One line each. Start with "•" for a bullet, end with ":" for a bold label, leave a line empty for a gap.',
      },
      toggle(["endPage", "showDocumentDetails"], "Add date, word and page counts"),
      { kind: "link", path: ["endPage", "link"], label: "Link" },
      optional(["endPage", "closing"], "Closing line"),
      mm(["endPage", "titleOffset"], "Title from top margin"),
      mm(["endPage", "bodyOffset"], "Text from top margin"),
    ],
  },
  {
    title: "PDF details",
    fields: [
      text(
        ["metadata", "author"],
        "Author",
        "Shown in a PDF reader's document properties. {title} becomes the title.",
      ),
      text(["metadata", "subject"], "Subject"),
      text(["metadata", "keywords"], "Keywords"),
      text(["metadata", "creator"], "Creator"),
    ],
  },
];

export const faceFamilies: readonly {
  readonly value: (typeof fontFamilies)[number];
  readonly label: string;
}[] = fontFamilies.map((value) => ({
  value,
  label: { Cinzel: "Cinzel", times: "Times", helvetica: "Helvetica", courier: "Courier" }[value],
}));

// Cinzel ships in four weights and no italics; the standard fonts in regular, bold and the
// two italics. The renderer takes the nearest for anything else, so only real ones are offered.
export function faceStyles(
  family: string,
): readonly { readonly value: string; readonly label: string }[] {
  const labels: Record<(typeof fontStyles)[number], string> = {
    normal: "Regular",
    medium: "Medium",
    bold: "Bold",
    black: "Black",
    italic: "Italic",
    bolditalic: "Bold italic",
  };
  const offered =
    family === "Cinzel"
      ? (["normal", "medium", "bold", "black"] as const)
      : (["normal", "bold", "italic", "bolditalic"] as const);
  return offered.map((value) => ({ value, label: labels[value] }));
}

export function valueAt(theme: DocumentTheme, path: FieldPath): unknown {
  let at: unknown = theme;
  for (const key of path) at = (at as Record<string, unknown> | null)?.[key];
  return at;
}

export function withValue(theme: DocumentTheme, path: FieldPath, value: unknown): DocumentTheme {
  const [head, ...rest] = path;
  if (head === undefined) return value as DocumentTheme;
  const current = (theme as unknown as Record<string, unknown>)[head];
  return {
    ...theme,
    [head]: rest.length === 0 ? value : withValue(current as DocumentTheme, rest, value),
  } as DocumentTheme;
}

interface Ranged {
  readonly minValue?: number | null;
  readonly maxValue?: number | null;
  readonly shape?: Record<string, unknown>;
}

// The schema's min and max for a number setting.
export function rangeOf(path: FieldPath): { readonly min: number; readonly max: number } {
  let at: Ranged | undefined = documentThemeSchema as unknown as Ranged;
  for (const key of path) at = at?.shape?.[key] as Ranged | undefined;
  return { min: at?.minValue ?? 0, max: at?.maxValue ?? 1000 };
}

// Where a refused save marked a field: "values.page.margin" is the Margins box.
export function fieldKey(path: FieldPath): string {
  return `values.${path.join(".")}`;
}
