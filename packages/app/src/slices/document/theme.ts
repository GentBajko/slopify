import { legacyDiceMasterTheme } from "./legacy-dicemaster.js";
import {
  type DocumentSettings,
  type DocumentThemeName,
  defaultDocumentTheme,
  documentThemeOf,
  legacyDocumentTheme,
} from "./model.js";

// Everything about a generated PDF that isn't the article itself: page, fonts, sizes,
// spacing, drop caps, the title, contents, sources and closing pages, and the running
// header and footer. Every number the renderer draws with comes from here, so a theme
// editor only has to write this shape. Lengths are millimetres, sizes points, colours
// "#rrggbb" or "#rgb". Any `url` set to null drops that link and any brand text set to null
// hides it.
//
// Ported from the lore2script2 PDF generator; `plain` is its plain.json with neutral metadata.

export interface RGB {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

// "Cinzel" is bundled (assets/document/fonts) in the styles below; the other three are the
// PDF standard fonts every reader has.
export const fontFamilies = ["Cinzel", "times", "helvetica", "courier"] as const;
export type FontFamily = (typeof fontFamilies)[number];
export const fontStyles = ["normal", "medium", "bold", "black", "italic", "bolditalic"] as const;
export type FontStyle = (typeof fontStyles)[number];

export interface FontFace {
  readonly family: FontFamily;
  readonly style: FontStyle;
  // Extra space between letters, in millimetres.
  readonly letterSpacing: number;
}

export interface DocumentTheme {
  readonly page: {
    readonly format: "a4" | "letter";
    readonly margin: number;
    // Where text starts on a page that has the running header.
    readonly contentTop: number;
  };
  readonly background: {
    // "parchment" is the bundled texture stretched over every page; null is a flat colour.
    readonly image: "parchment" | null;
    // Flat page colour, drawn with slightly darker edges, when there is no image.
    readonly color: string;
  };
  readonly colors: {
    // Headings, drop caps, the brand name and links.
    readonly heading: string;
    readonly text: string;
    // Dates, bullets, quotes and dot leaders.
    readonly muted: string;
    // Running header and page numbers.
    readonly faint: string;
  };
  readonly fonts: {
    readonly body: FontFace;
    readonly strong: FontFace;
    readonly emphasis: FontFace;
    readonly heading: FontFace;
    // The big number of a "Chapter 3: …" heading, and the brand on the title page.
    readonly dramatic: FontFace;
    // Tagline and title-page link.
    readonly decorative: FontFace;
    readonly dropCap: FontFace;
    readonly footer: FontFace;
  };
  readonly sizes: {
    readonly brand: number;
    readonly title: number;
    // Level-1 headings and the titles of the contents, sources and closing pages.
    readonly section: number;
    // Level-2 headings.
    readonly heading: number;
    // Level-3 (and deeper) headings.
    readonly subheading: number;
    readonly body: number;
    readonly footer: number;
    readonly meta: number;
  };
  readonly spacing: {
    readonly bodyLine: number;
    readonly headingLine: number;
    readonly subheadingLine: number;
    // Space after a paragraph, as a share of a body line.
    readonly paragraphGap: number;
    // Space before a heading, as a share of a body line.
    readonly headingGap: number;
    // Space after a list item, as a share of a body line.
    readonly itemGap: number;
    readonly listIndent: number;
    readonly quoteIndent: number;
    // Width of the short centred line a `---` becomes.
    readonly ruleWidth: number;
  };
  readonly dropCap: {
    readonly enabled: boolean;
    // How many body lines the initial spans.
    readonly lines: 2 | 3 | 4;
    // The initial's size is this many times the height of the lines it spans.
    readonly scale: number;
    // Room between the initial and the text beside it.
    readonly gap: number;
    // Shorter paragraphs start plainly.
    readonly minLength: number;
    // With less than this share of the page left, the paragraph starts on the next page.
    readonly minRoom: number;
  };
  readonly titlePage: {
    readonly brandY: number;
    readonly taglineOffset: number;
    readonly titleY: number;
    readonly titleLine: number;
    readonly metaOffset: number;
    readonly metaLine: number;
    readonly showDate: boolean;
    readonly showWordCount: boolean;
    // The project's thumbnail, when it has one, between the title and the date.
    readonly cover: {
      readonly enabled: boolean;
      readonly gap: number;
      readonly maxHeight: number;
    };
  };
  readonly contents: {
    readonly enabled: boolean;
    readonly title: string;
    // Headings down to this level are listed.
    readonly depth: 1 | 2 | 3;
    readonly titleOffset: number;
    readonly firstEntryOffset: number;
    readonly line: number;
    readonly indent: number;
  };
  readonly header: {
    readonly enabled: boolean;
    readonly top: number;
    // A title wider than the header is cut to this many characters.
    readonly maxTitleCharacters: number;
  };
  readonly footer: {
    readonly enabled: boolean;
    readonly bottom: number;
    // Space kept free above the page number.
    readonly reserve: number;
    // "{page}" is replaced with the page number.
    readonly text: string;
  };
  readonly brand: {
    readonly name: string | null;
    readonly url: string | null;
    readonly tagline: string | null;
    // Linked line under the word count on the title page.
    readonly linkLabel: string | null;
  };
  readonly metadata: {
    // "{title}" is replaced with the document title.
    readonly author: string;
    readonly subject: string;
    readonly keywords: string;
    readonly creator: string;
  };
  readonly sources: {
    readonly enabled: boolean;
    readonly title: string;
    // From the top margin to the page title's baseline, and to the first entry's.
    readonly titleOffset: number;
    readonly bodyOffset: number;
    readonly line: number;
    readonly gap: number;
  };
  readonly endPage: {
    readonly enabled: boolean;
    readonly title: string;
    readonly titleOffset: number;
    readonly bodyOffset: number;
    // Lines starting with "•" render as muted bullets, lines ending in ":" as bold labels,
    // "" as a gap.
    readonly lines: readonly string[];
    // Appends the written-on date, word count and page count.
    readonly showDocumentDetails: boolean;
    readonly link: { readonly text: string; readonly url: string | null } | null;
    readonly closing: string | null;
  };
}

const cinzel = (style: FontStyle, letterSpacing: number): FontFace => ({
  family: "Cinzel",
  style,
  letterSpacing,
});

// The one built-in: an unbranded flat page. Its layout is the one Slopify has always drawn,
// written out in full rather than as changes to another theme.
const plain: DocumentTheme = {
  page: { format: "a4", margin: 22, contentTop: 32 },
  background: { image: null, color: "#fdfaf3" },
  colors: { heading: "#1f3a5f", text: "#1a1a1a", muted: "#555555", faint: "#888888" },
  fonts: {
    body: cinzel("normal", 0.01),
    strong: cinzel("bold", 0.02),
    // Cinzel has no italic, so emphasis borrows the standard serif's.
    emphasis: { family: "times", style: "italic", letterSpacing: 0 },
    heading: cinzel("bold", 0.02),
    dramatic: cinzel("black", 0.03),
    decorative: cinzel("medium", 0.015),
    dropCap: cinzel("black", 0),
    footer: { family: "times", style: "normal", letterSpacing: 0 },
  },
  sizes: {
    brand: 31,
    title: 22,
    section: 19,
    heading: 17,
    subheading: 13,
    body: 10.5,
    footer: 9,
    meta: 10,
  },
  spacing: {
    bodyLine: 8,
    headingLine: 11,
    subheadingLine: 9,
    paragraphGap: 0.5,
    headingGap: 1,
    itemGap: 0.2,
    listIndent: 6,
    quoteIndent: 8,
    ruleWidth: 30,
  },
  dropCap: { enabled: true, lines: 3, scale: 3, gap: 4, minLength: 50, minRoom: 0.25 },
  titlePage: {
    brandY: 60,
    taglineOffset: 10,
    titleY: 80,
    titleLine: 10,
    metaOffset: 20,
    metaLine: 10,
    showDate: true,
    showWordCount: true,
    cover: { enabled: true, gap: 6, maxHeight: 110 },
  },
  contents: {
    enabled: true,
    title: "Table of Contents",
    depth: 2,
    titleOffset: 20,
    firstEntryOffset: 40,
    line: 8,
    indent: 5,
  },
  header: { enabled: true, top: 15, maxTitleCharacters: 35 },
  footer: { enabled: true, bottom: 10, reserve: 15, text: "Page {page}" },
  brand: { name: null, url: null, tagline: null, linkLabel: null },
  metadata: { author: "", subject: "{title}", keywords: "", creator: "" },
  sources: {
    enabled: true,
    title: "Sources Consulted",
    titleOffset: 20,
    bodyOffset: 40,
    line: 8,
    gap: 2,
  },
  endPage: {
    enabled: false,
    title: "About",
    titleOffset: 20,
    bodyOffset: 40,
    lines: [],
    showDocumentDetails: true,
    link: null,
    closing: null,
  },
};

// Section-by-section overrides, merged one level deep onto a base theme. Arrays replace
// rather than merge.
export type DocumentThemeOverrides = {
  readonly [K in keyof DocumentTheme]?: Partial<DocumentTheme[K]>;
};

// A built-in by name. "dicemaster" is still read, from projects saved while it was built in,
// and gives exactly the values it gave then.
export function builtInTheme(name: DocumentThemeName): DocumentTheme {
  return resolveTheme({}, name === legacyDocumentTheme ? legacyDiceMasterTheme : plain);
}

// The theme a project's document is drawn with: its copy of a Library theme, or a built-in.
export function resolvedDocumentTheme(settings: DocumentSettings | undefined): DocumentTheme {
  const custom = settings?.custom;
  return custom === undefined
    ? builtInTheme(documentThemeOf(settings))
    : resolveTheme(custom.values as DocumentThemeOverrides);
}

export function defaultTheme(): DocumentTheme {
  return builtInTheme(defaultDocumentTheme);
}

// Unknown sections and keys throw, so a typo in a saved theme can't pass silently.
export function resolveTheme(
  overrides: DocumentThemeOverrides = {},
  base: DocumentTheme = plain,
): DocumentTheme {
  const theme = structuredClone(base) as unknown as Record<string, Record<string, unknown>>;
  for (const [section, values] of Object.entries(overrides)) {
    const target = theme[section];
    if (target === undefined)
      throw new Error(
        `Unknown document theme section "${section}" (expected one of: ${Object.keys(theme).join(", ")})`,
      );
    for (const [key, value] of Object.entries(values ?? {})) {
      if (!(key in target))
        throw new Error(
          `Unknown document theme setting "${section}.${key}" (expected one of: ${Object.keys(target).join(", ")})`,
        );
      target[key] = value;
    }
  }
  const resolved = theme as unknown as DocumentTheme;
  for (const [key, value] of Object.entries(resolved.colors)) parseHexColor(value, `colors.${key}`);
  parseHexColor(resolved.background.color, "background.color");
  return resolved;
}

export function parseHexColor(hex: string, label = "color"): RGB {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  const digits = match?.[1];
  if (digits === undefined)
    throw new Error(
      `Invalid document theme ${label} "${hex}": expected a hex color like "#8c1e14"`,
    );
  const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join("") : digits;
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}
