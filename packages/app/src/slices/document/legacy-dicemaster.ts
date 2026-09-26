import type { DocumentTheme, FontFace, FontStyle } from "./theme.js";

// The DiceMaster look, the built-in default before 2.3.0. It is one brand's look (DiceMaster.io),
// not one Slopify offers, so no picker and no built-in list shows it any more. It stays in the
// code for two reasons only: a project saved with `document: { theme: "dicemaster" }`, or
// with the Document stage on and no theme at all, must keep drawing (and fingerprinting) exactly
// as it did, or its PDF would read as outdated; and migration 0017 copies these values into
// Library → Documents as a saved "DiceMaster" theme, which a test holds to this literal.
//
// Ported from the lore2script2 PDF generator's stock DiceMaster.io look, value for value. Do not
// edit it: any change reaches the documents of every project that still uses it.

const cinzel = (style: FontStyle, letterSpacing: number): FontFace => ({
  family: "Cinzel",
  style,
  letterSpacing,
});

export const legacyDiceMasterTheme: DocumentTheme = {
  page: { format: "a4", margin: 22, contentTop: 32 },
  background: { image: "parchment", color: "#f5ebd7" },
  colors: { heading: "#8c1e14", text: "#000000", muted: "#50463c", faint: "#786e5f" },
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
  // lore2script2 scaled its Cinzel sizes and line heights (by 1.1, 1.05 and 1.2) and
  // rounded; these are the results.
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
  brand: {
    name: "DiceMaster.io",
    url: "https://dicemaster.io/",
    tagline: "Let us Handle the Crunch, You Focus on the Story",
    linkLabel: "Visit DiceMaster.io",
  },
  metadata: {
    author: "Created with DiceMaster.io",
    subject: "{title} - Powered by DiceMaster.io",
    keywords: "D&D, DnD, Dungeons and Dragons, lore, script, tabletop, RPG, TTRPG, DiceMaster.io",
    creator: "DiceMaster.io - The AI-Powered Virtual Tabletop",
  },
  sources: {
    enabled: true,
    title: "Sources Consulted",
    titleOffset: 20,
    bodyOffset: 40,
    line: 8,
    gap: 2,
  },
  endPage: {
    enabled: true,
    title: "About DiceMaster.io",
    titleOffset: 20,
    bodyOffset: 40,
    lines: [
      "About DiceMaster.io:",
      "• Character Engine - Form-driven creation with automatic leveling",
      "• Automated Rules Engine - D&D mechanics and spells run automatically",
      "• AI-Generated NPCs - Instant personalities with full stat blocks",
      "• Granular Inventory Tracking - Live gear & condition management",
      "• Real-Time Rule Guidance - Context-aware clarifications",
      "• Dynamic Storytelling AI - On-the-fly narration & dialogue",
      "• True-Physics Dice - RNG-driven rolls with animated suspense",
      "• Cinematic Combat Module - Positional tracking & narrative summaries",
      "• Voice Commands - Seamless STT/TTS multimodal interaction",
      "• AI Dungeon Master Layer - Rules adjudication & encounter balancing",
    ],
    showDocumentDetails: true,
    link: { text: "Visit DiceMaster.io", url: "https://dicemaster.io/" },
    closing: "Experience the future of tabletop RPGs!",
  },
};
