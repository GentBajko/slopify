import type { HelpEntry } from "../entry.js";

// Prompts (with intros and outros), Templates, PDF themes and Pronunciation. The PDF theme
// numbers (defaults and ranges) are the built-in Plain theme's and the save schema's, from
// packages/app/src/slices/document/theme.ts and theme-schema.ts.
export const libraryHelp = {
  // ── Prompts ──────────────────────────────────────────────────────────────────────────
  "library.prompt.body.article": {
    title: "Article prompt",
    body: "The instructions the AI writer gets to write the video's article, which becomes the narration. Each {{keyword}} of your own becomes a question on Create. One AI call per video, plus up to 3 more when the answer runs out of room; research notes go first when research ran. The answer's sources and pronunciation sections are never narrated.",
    tutorial: { page: "Prompts", anchor: "write-a-new-prompt" },
  },
  "library.prompt.body.image": {
    title: "Image prompt",
    body: "Sent as written to the image service, with the keywords filled in; no AI writer rewrites it. Create sets how many pictures each prompt makes (1 to 20, at most 60 a video), and each picture is one image call. Pictures show for 15 s each by default and repeat until the video ends.",
    tutorial: { page: "Prompts", anchor: "write-a-new-prompt" },
  },
  "library.prompt.body.thumbnail": {
    title: "Thumbnail prompt",
    body: "Sent to the image service to draw the thumbnail. When the AI writes the thumbnail's picture prompt, it first turns this into one using the title and article, one extra AI call. 1 thumbnail by default, or 3: the second a close-up, the third a wider shot, each one image call.",
    tutorial: { page: "Prompts", anchor: "write-a-new-prompt" },
  },
  "library.prompt.body.narration": {
    title: "Narration preparation prompt",
    body: "Tells the AI how the narration should be delivered. It only adds cues, such as a short speaking direction or a laugh or sigh, and never rewrites the words. One AI call each for the article, the intro and the outro. Works only with the Inworld TTS-2 voice model. With several speakers, each speaker on TTS-2 gets cues suited to their role.",
    tutorial: { page: "Create-Narration", anchor: "narration-preparation" },
  },
  "library.prompt.body.description": {
    title: "YouTube description prompt",
    body: "Tells the AI writer how to write the video's YouTube description, chapters, hashtags and tags from the timestamped transcript. One AI call per video. Each {{keyword}} of your own becomes a question on Create. A project that picks none uses the built-in wording.",
    tutorial: { page: "Prompts", anchor: "write-a-new-prompt" },
  },
  "library.prompt.body.shorts": {
    title: "Shorts prompt",
    body: "Tells the AI which moments of the video to cut into vertical shorts (3 of 60 to 120 s by default). One AI call picks them, then one per short writes its picture prompts, and each picture is one image call. A project that picks none uses the built-in wording.",
    tutorial: { page: "Prompts", anchor: "write-a-new-prompt" },
  },
  "library.prompt.body.review": {
    title: "Review prompt",
    body: "Tells the reviewer what to check in a finished article, set of images, narration, thumbnail or shorts, and when to flag or redo it. One reviewer call per item checked; pictures can only be judged by the Claude Code and Codex reviewers. A stage with none picked uses its own built-in wording.",
    tutorial: { page: "Prompts", anchor: "write-a-new-prompt" },
  },
  "library.prompt.body.script": {
    title: "Script prompt",
    body: "Used in place of an Article prompt when a video has several voices and writes a script. The AI writer answers with # section headings and Name: words turns, one speaker per paragraph; text in [square brackets] is not spoken. One AI call per video.",
    tutorial: { page: "Prompts", anchor: "write-a-new-prompt" },
  },
  "library.prompt.body.post": {
    title: "Post prompt",
    body: "Tells the AI writer how to write a post for X, LinkedIn, Instagram, TikTok, Reddit or Bluesky from the article. Slopify adds the site's length limit and the hashtags and link after it. One AI call per site that uses it. Pick it in a template's YouTube description and posts section.",
    tutorial: { page: "Posting-to-Social-Sites", anchor: "post-prompts" },
  },
  "library.prompt.photorealistic": {
    title: "Draws photorealistic pictures",
    body: "Turn on when this prompt's style looks like real photos or film. Copy for YouTube Studio then answers Yes to YouTube's AI use question (a realistic-looking scene that didn't happen) for videos and shorts drawn with it. Leave off for painterly or illustrated styles. Applies at once, apart from Save; a channel's Always Yes or Always No wins. Default: off.",
    tutorial: { page: "Prompts", anchor: "mark-an-image-prompt-as-photorealistic" },
  },
  // ── Rename in a list (Templates) ─────────────────────────────────────────────────────
  // ── Pronunciation ────────────────────────────────────────────────────────────────────
  "library.aliases": {
    title: "Pronunciation aliases",
    body: "Words the narrator says differently from how they are written, such as Dr. as Doctor. Only what the voice and narration preparation receive changes; the article and captions keep the written words. A project copies this list when it starts and uses it while Use narration aliases is on. Up to 1000 aliases, saved as a whole.",
    tutorial: { page: "Narration-Aliases-and-Glossary", anchor: "narration-aliases" },
  },
  // ── PDF themes ───────────────────────────────────────────────────────────────────────
  "library.theme.page.format": {
    title: "Paper size",
    body: "The page size of the PDF. A4 (210 × 297 mm) is used in most of the world; US Letter (216 × 279 mm) in the US and Canada. Pick the one your readers print on. Default: A4.",
    tutorial: { page: "Document-Themes", anchor: "page" },
  },
  "library.theme.page.margin": {
    title: "Margins",
    body: "Blank space kept on every edge of each page, in millimetres. Wider margins mean shorter lines and more pages. From 5 to 60 mm. Default: 22 mm.",
    tutorial: { page: "Document-Themes", anchor: "page" },
  },
  "library.theme.page.content-top": {
    title: "Text starts at",
    body: "How far from the top of the page the text begins on pages that carry the running header, in millimetres. Raise it when text crowds the header. From 5 to 80 mm. Default: 32 mm.",
    tutorial: { page: "Document-Themes", anchor: "page" },
  },
  "library.theme.background.image": {
    title: "Background",
    body: "Parchment texture stretches an aged-paper picture over every page. Flat colour fills each page with the Page colour, drawn slightly darker at the edges. Default: Flat colour.",
    tutorial: { page: "Document-Themes", anchor: "page" },
  },
  "library.theme.background.color": {
    title: "Page colour",
    body: "The colour of every page when Background is Flat colour; ignored with the parchment texture. Type a hex code like #fdfaf3 or use the picker. Default: #fdfaf3, a warm off-white.",
    tutorial: { page: "Document-Themes", anchor: "page" },
  },
  "library.theme.colors.heading": {
    title: "Heading colour",
    body: "The colour of headings, drop caps, the brand name and links. Type a hex code like #1f3a5f or use the picker. Default: #1f3a5f, a dark blue.",
    tutorial: { page: "Document-Themes", anchor: "colours" },
  },
  "library.theme.colors.text": {
    title: "Body text colour",
    body: "The colour of paragraphs, lists and bold or italic text. Keep it dark against the page colour so it reads and prints well. Default: #1a1a1a, near black.",
    tutorial: { page: "Document-Themes", anchor: "colours" },
  },
  "library.theme.colors.muted": {
    title: "Muted colour",
    body: "The colour of dates, bullets, quotes and the dotted lines on the contents page. Default: #555555, a mid grey.",
    tutorial: { page: "Document-Themes", anchor: "colours" },
  },
  "library.theme.colors.faint": {
    title: "Faint colour",
    body: "The colour of the running header and the page numbers, kept light so they stay out of the way. Default: #888888, a light grey.",
    tutorial: { page: "Document-Themes", anchor: "colours" },
  },
  "library.theme.fonts.body": {
    title: "Body font",
    body: "The font of paragraphs and lists. The first box picks the family, the second its weight or italic, the number adds space between letters in millimetres (-0.5 to 2). Cinzel is bundled and has no italics; Times, Helvetica and Courier are built into every PDF reader. Default: Cinzel Regular, 0.01 mm.",
    tutorial: { page: "Document-Themes", anchor: "fonts" },
  },
  "library.theme.fonts.strong": {
    title: "Bold text font",
    body: "The font of bold words inside paragraphs. Family, style and letter spacing in millimetres, as for Body. Default: Cinzel Bold, 0.02 mm.",
    tutorial: { page: "Document-Themes", anchor: "fonts" },
  },
  "library.theme.fonts.emphasis": {
    title: "Italic text font",
    body: "The font of italic words inside paragraphs. Cinzel has no italics, so the default borrows Times. Family, style and letter spacing in millimetres, as for Body. Default: Times Italic, 0 mm.",
    tutorial: { page: "Document-Themes", anchor: "fonts" },
  },
  "library.theme.fonts.heading": {
    title: "Heading font",
    body: "The font of the article's headings and of the contents, sources and closing page titles. Family, style and letter spacing in millimetres, as for Body. Default: Cinzel Bold, 0.02 mm.",
    tutorial: { page: "Document-Themes", anchor: "fonts" },
  },
  "library.theme.fonts.dramatic": {
    title: "Chapter numbers and brand font",
    body: 'The font of the big number in a heading like "Chapter 3:" and of the brand name on the title page. Family, style and letter spacing in millimetres, as for Body. Default: Cinzel Black, 0.03 mm.',
    tutorial: { page: "Document-Themes", anchor: "fonts" },
  },
  "library.theme.fonts.decorative": {
    title: "Tagline and link font",
    body: "The font of the tagline and the linked line on the title page, and of the link and closing line on the closing page. Default: Cinzel Medium, 0.015 mm.",
    tutorial: { page: "Document-Themes", anchor: "fonts" },
  },
  "library.theme.fonts.drop-cap": {
    title: "Drop cap font",
    body: "The font of the large first letter that starts a paragraph after a heading, when drop caps are on. Family, style and letter spacing in millimetres, as for Body. Default: Cinzel Black, 0 mm.",
    tutorial: { page: "Document-Themes", anchor: "fonts" },
  },
  "library.theme.fonts.footer": {
    title: "Header and page number font",
    body: "The font of the running header and the page numbers. Family, style and letter spacing in millimetres, as for Body. Default: Times Regular, 0 mm.",
    tutorial: { page: "Document-Themes", anchor: "fonts" },
  },
  "library.theme.sizes.title": {
    title: "Title size",
    body: "The size of the article's title on the title page, in points (1 pt is about 0.35 mm). From 6 to 72 pt. Default: 22 pt.",
    tutorial: { page: "Document-Themes", anchor: "text-sizes" },
  },
  "library.theme.sizes.brand": {
    title: "Brand size",
    body: "The size of the brand name on the title page, in points. Shown only when Branding has a brand name. From 6 to 72 pt. Default: 31 pt.",
    tutorial: { page: "Document-Themes", anchor: "text-sizes" },
  },
  "library.theme.sizes.section": {
    title: "Top-level heading size",
    body: "The size of top-level headings and of the contents, sources and closing page titles, in points. From 6 to 72 pt. Default: 19 pt.",
    tutorial: { page: "Document-Themes", anchor: "text-sizes" },
  },
  "library.theme.sizes.heading": {
    title: "Second-level heading size",
    body: "The size of second-level headings, the ones inside a top-level section, in points. From 6 to 72 pt. Default: 17 pt.",
    tutorial: { page: "Document-Themes", anchor: "text-sizes" },
  },
  "library.theme.sizes.subheading": {
    title: "Third-level heading size",
    body: "The size of third-level and deeper headings, in points. From 6 to 72 pt. Default: 13 pt.",
    tutorial: { page: "Document-Themes", anchor: "text-sizes" },
  },
  "library.theme.sizes.body": {
    title: "Body size",
    body: "The size of paragraphs, lists and the closing page text, in points. Bigger text means more pages. From 6 to 24 pt. Default: 10.5 pt.",
    tutorial: { page: "Document-Themes", anchor: "text-sizes" },
  },
  "library.theme.sizes.meta": {
    title: "Date and word count size",
    body: "The size of the date, word count and link lines under the title on the title page, in points. From 5 to 24 pt. Default: 10 pt.",
    tutorial: { page: "Document-Themes", anchor: "text-sizes" },
  },
  "library.theme.sizes.footer": {
    title: "Header and page number size",
    body: "The size of the running header and the page numbers, in points. From 5 to 24 pt. Default: 9 pt.",
    tutorial: { page: "Document-Themes", anchor: "text-sizes" },
  },
  "library.theme.spacing.body-line": {
    title: "Body line height",
    body: "The distance from one line of body text to the next, in millimetres. Raise it for airier pages, lower it to fit more on each page. From 3 to 20 mm. Default: 8 mm.",
    tutorial: { page: "Document-Themes", anchor: "spacing" },
  },
  "library.theme.spacing.heading-line": {
    title: "Heading line height",
    body: "The distance between the lines of a top- or second-level heading that wraps, in millimetres. From 3 to 30 mm. Default: 11 mm.",
    tutorial: { page: "Document-Themes", anchor: "spacing" },
  },
  "library.theme.spacing.subheading-line": {
    title: "Subheading line height",
    body: "The distance between the lines of a third-level heading that wraps, in millimetres. From 3 to 30 mm. Default: 9 mm.",
    tutorial: { page: "Document-Themes", anchor: "spacing" },
  },
  "library.theme.spacing.paragraph-gap": {
    title: "After a paragraph",
    body: "Extra space after each paragraph, as a share of a body line: 0.5 is half a line. From 0 to 3. Default: 0.5.",
    tutorial: { page: "Document-Themes", anchor: "spacing" },
  },
  "library.theme.spacing.heading-gap": {
    title: "Before a heading",
    body: "Extra space above each heading, as a share of a body line: 1 is one full line. From 0 to 5. Default: 1.",
    tutorial: { page: "Document-Themes", anchor: "spacing" },
  },
  "library.theme.spacing.item-gap": {
    title: "After a list item",
    body: "Extra space after each bulleted or numbered item, as a share of a body line. From 0 to 3. Default: 0.2.",
    tutorial: { page: "Document-Themes", anchor: "spacing" },
  },
  "library.theme.spacing.list-indent": {
    title: "List indent",
    body: "How far bulleted and numbered lists are pushed in from the left margin, in millimetres. From 0 to 30 mm. Default: 6 mm.",
    tutorial: { page: "Document-Themes", anchor: "spacing" },
  },
  "library.theme.spacing.quote-indent": {
    title: "Quote indent",
    body: "How far quotes are pushed in from the left margin, in millimetres. From 0 to 40 mm. Default: 8 mm.",
    tutorial: { page: "Document-Themes", anchor: "spacing" },
  },
  "library.theme.spacing.rule-width": {
    title: "Divider width",
    body: "The width of the short centred line a --- in the article becomes, in millimetres. From 0 to 150 mm. Default: 30 mm.",
    tutorial: { page: "Document-Themes", anchor: "spacing" },
  },
  "library.theme.drop-cap.enabled": {
    title: "Drop caps",
    body: "Starts the first paragraph after each heading with a large first letter that spans several lines, as in printed books. Turn it off for a plainer page. Default: on.",
    tutorial: { page: "Document-Themes", anchor: "drop-caps" },
  },
  "library.theme.drop-cap.lines": {
    title: "Drop cap lines tall",
    body: "How many lines of body text the large first letter spans. Default: 3 lines.",
    tutorial: { page: "Document-Themes", anchor: "drop-caps" },
  },
  "library.theme.drop-cap.scale": {
    title: "Drop cap letter size",
    body: "The size of the large first letter, as a multiple of the height of the lines it spans. From 1 to 5. Default: 3.",
    tutorial: { page: "Document-Themes", anchor: "drop-caps" },
  },
  "library.theme.drop-cap.gap": {
    title: "Gap beside the drop cap",
    body: "The space between the large first letter and the text beside it, in millimetres. From 0 to 20 mm. Default: 4 mm.",
    tutorial: { page: "Document-Themes", anchor: "drop-caps" },
  },
  "library.theme.drop-cap.min-length": {
    title: "Shortest paragraph",
    body: "A paragraph shorter than this many characters starts plainly, so a one-line paragraph never gets a huge letter. From 0 to 2000. Default: 50.",
    tutorial: { page: "Document-Themes", anchor: "drop-caps" },
  },
  "library.theme.drop-cap.min-room": {
    title: "Room needed",
    body: "With less than this share of the page left, a paragraph that starts with a drop cap moves to the next page. 0.25 is a quarter of the page. From 0 to 1. Default: 0.25.",
    tutorial: { page: "Document-Themes", anchor: "drop-caps" },
  },
  "library.theme.title-page.brand-y": {
    title: "Brand from top",
    body: "Where the brand name sits on the title page, measured from the top edge of the page in millimetres. From 10 to 200 mm. Default: 60 mm.",
    tutorial: { page: "Document-Themes", anchor: "title-page" },
  },
  "library.theme.title-page.tagline-offset": {
    title: "Tagline below brand",
    body: "The distance from the brand name down to the tagline, in millimetres. From 0 to 60 mm. Default: 10 mm.",
    tutorial: { page: "Document-Themes", anchor: "title-page" },
  },
  "library.theme.title-page.title-y": {
    title: "Title from top",
    body: "Where the article's title sits on the title page, measured from the top edge of the page in millimetres. From 10 to 250 mm. Default: 80 mm.",
    tutorial: { page: "Document-Themes", anchor: "title-page" },
  },
  "library.theme.title-page.title-line": {
    title: "Title line height",
    body: "The distance between the lines of a title that wraps, in millimetres. From 3 to 40 mm. Default: 10 mm.",
    tutorial: { page: "Document-Themes", anchor: "title-page" },
  },
  "library.theme.title-page.meta-offset": {
    title: "Details below title",
    body: "The distance from the title down to the date and word count, in millimetres, when there is no cover picture. From 0 to 100 mm. Default: 20 mm.",
    tutorial: { page: "Document-Themes", anchor: "title-page" },
  },
  "library.theme.title-page.meta-line": {
    title: "Details line height",
    body: "The distance between the date, word count and link lines on the title page, in millimetres. From 3 to 30 mm. Default: 10 mm.",
    tutorial: { page: "Document-Themes", anchor: "title-page" },
  },
  "library.theme.title-page.show-date": {
    title: "Show the date",
    body: 'Prints "Written on" and the date the PDF was made under the title on the title page. Default: on.',
    tutorial: { page: "Document-Themes", anchor: "title-page" },
  },
  "library.theme.title-page.show-word-count": {
    title: "Show the word count",
    body: "Prints the article's word count under the title on the title page. Default: on.",
    tutorial: { page: "Document-Themes", anchor: "title-page" },
  },
  "library.theme.title-page.cover": {
    title: "Thumbnail as cover",
    body: "Puts the project's thumbnail on the title page, between the title and the date, when the project has one. Without a thumbnail the page is laid out as if this were off. Default: on.",
    tutorial: { page: "Document-Themes", anchor: "title-page" },
  },
  "library.theme.title-page.cover-gap": {
    title: "Space around cover",
    body: "The space above and below the cover picture on the title page, in millimetres. From 0 to 40 mm. Default: 6 mm.",
    tutorial: { page: "Document-Themes", anchor: "title-page" },
  },
  "library.theme.title-page.cover-height": {
    title: "Cover height at most",
    body: "The tallest the cover picture may be, in millimetres. It keeps its shape and shrinks further when the page has less room. From 20 to 200 mm. Default: 110 mm.",
    tutorial: { page: "Document-Themes", anchor: "title-page" },
  },
  "library.theme.brand.name": {
    title: "Brand name",
    body: 'Your channel or brand, printed large at the top of the title page and before the title in the running header ("Brand | Title"). Leave it empty to show no brand. Default: empty.',
    tutorial: { page: "Document-Themes", anchor: "branding" },
  },
  "library.theme.brand.tagline": {
    title: "Tagline",
    body: "A short line under the brand name on the title page. Leave it empty to hide it. Default: empty.",
    tutorial: { page: "Document-Themes", anchor: "branding" },
  },
  "library.theme.brand.url": {
    title: "Website",
    body: "The web address the brand name and the title-page link open when clicked in the PDF. Leave it empty for no link. Default: empty.",
    tutorial: { page: "Document-Themes", anchor: "branding" },
  },
  "library.theme.brand.link-label": {
    title: "Link text",
    body: "The words of a linked line under the word count on the title page; it opens Website. Leave it empty to hide the line. Default: empty.",
    tutorial: { page: "Document-Themes", anchor: "branding" },
  },
  "library.theme.contents.enabled": {
    title: "Contents page",
    body: "Adds a table of contents after the title page, listing the article's headings with their page numbers. Each entry is a link to its page. Default: on.",
    tutorial: { page: "Document-Themes", anchor: "contents-page" },
  },
  "library.theme.contents.title": {
    title: "Contents page title",
    body: "The heading at the top of the contents page. Up to 300 characters. Default: Table of Contents.",
    tutorial: { page: "Document-Themes", anchor: "contents-page" },
  },
  "library.theme.contents.depth": {
    title: "Lists headings down to",
    body: "Which headings the contents page lists: only top-level ones, down to second-level, or down to third-level. Deeper lists take more room and can add a page. Default: Second level.",
    tutorial: { page: "Document-Themes", anchor: "contents-page" },
  },
  "library.theme.contents.title-offset": {
    title: "Contents title position",
    body: "The distance from the top margin down to the contents page title, in millimetres. From 0 to 100 mm. Default: 20 mm.",
    tutorial: { page: "Document-Themes", anchor: "contents-page" },
  },
  "library.theme.contents.first-entry-offset": {
    title: "First entry position",
    body: "The distance from the top margin down to the first entry of the contents, in millimetres. From 0 to 150 mm. Default: 40 mm.",
    tutorial: { page: "Document-Themes", anchor: "contents-page" },
  },
  "library.theme.contents.line": {
    title: "Contents line height",
    body: "The distance from one contents entry to the next, in millimetres. From 3 to 30 mm. Default: 8 mm.",
    tutorial: { page: "Document-Themes", anchor: "contents-page" },
  },
  "library.theme.contents.indent": {
    title: "Indent per level",
    body: "How much further in each deeper heading level is listed on the contents page, in millimetres. From 0 to 30 mm. Default: 5 mm.",
    tutorial: { page: "Document-Themes", anchor: "contents-page" },
  },
  "library.theme.header.enabled": {
    title: "Running header",
    body: 'Prints the brand and the article title ("Brand | Title") at the top of every page after the title page. Default: on.',
    tutorial: { page: "Document-Themes", anchor: "header-and-footer" },
  },
  "library.theme.header.top": {
    title: "Header from top",
    body: "The distance from the top edge of the page to the running header, in millimetres. From 3 to 60 mm. Default: 15 mm.",
    tutorial: { page: "Document-Themes", anchor: "header-and-footer" },
  },
  "library.theme.header.max-title": {
    title: "Header title at most",
    body: "A title longer than this many characters is cut short in the running header so it fits on one line. From 5 to 200. Default: 35.",
    tutorial: { page: "Document-Themes", anchor: "header-and-footer" },
  },
  "library.theme.footer.enabled": {
    title: "Page numbers",
    body: "Prints a page number at the bottom of every page after the title page. Default: on.",
    tutorial: { page: "Document-Themes", anchor: "header-and-footer" },
  },
  "library.theme.footer.text": {
    title: "Page number text",
    body: 'The words around the page number; {page} becomes the number, so "Page {page}" prints "Page 4". Default: Page {page}.',
    tutorial: { page: "Document-Themes", anchor: "header-and-footer" },
  },
  "library.theme.footer.bottom": {
    title: "Page number from the bottom",
    body: "The distance from the bottom edge of the page to the page number, in millimetres. From 3 to 60 mm. Default: 10 mm.",
    tutorial: { page: "Document-Themes", anchor: "header-and-footer" },
  },
  "library.theme.footer.reserve": {
    title: "Space kept above page number",
    body: "Space kept free above the page number, so body text always stops short of it, in millimetres. From 0 to 60 mm. Default: 15 mm.",
    tutorial: { page: "Document-Themes", anchor: "header-and-footer" },
  },
  "library.theme.sources.enabled": {
    title: "Sources page",
    body: "Adds a page listing the web links the article and its research used, each one clickable. Default: on.",
    tutorial: { page: "Document-Themes", anchor: "sources-page" },
  },
  "library.theme.sources.title": {
    title: "Sources page title",
    body: "The heading at the top of the sources page. Up to 300 characters. Default: Sources Consulted.",
    tutorial: { page: "Document-Themes", anchor: "sources-page" },
  },
  "library.theme.sources.title-offset": {
    title: "Sources title position",
    body: "The distance from the top margin down to the sources page title, in millimetres. From 0 to 100 mm. Default: 20 mm.",
    tutorial: { page: "Document-Themes", anchor: "sources-page" },
  },
  "library.theme.sources.body-offset": {
    title: "Sources list position",
    body: "The distance from the top margin down to the first source, in millimetres. From 0 to 150 mm. Default: 40 mm.",
    tutorial: { page: "Document-Themes", anchor: "sources-page" },
  },
  "library.theme.sources.line": {
    title: "Sources line height",
    body: "The distance between the lines of one source, in millimetres. From 3 to 30 mm. Default: 8 mm.",
    tutorial: { page: "Document-Themes", anchor: "sources-page" },
  },
  "library.theme.sources.gap": {
    title: "Gap between sources",
    body: "Extra space between one source and the next, in millimetres. From 0 to 20 mm. Default: 2 mm.",
    tutorial: { page: "Document-Themes", anchor: "sources-page" },
  },
  "library.theme.end-page.enabled": {
    title: "Closing page",
    body: "Adds a last page with your own text, such as an about section, a thank-you or a link to your site. Default: off.",
    tutorial: { page: "Document-Themes", anchor: "closing-page" },
  },
  "library.theme.end-page.title": {
    title: "Closing page title",
    body: "The heading at the top of the closing page. Up to 300 characters. Default: About.",
    tutorial: { page: "Document-Themes", anchor: "closing-page" },
  },
  "library.theme.end-page.lines": {
    title: "Closing page text",
    body: 'The closing page text, one line per row, up to 60 lines of 300 characters. A line starting with "•" becomes a muted bullet, one ending with ":" a bold label, an empty line a gap. Default: empty.',
    tutorial: { page: "Document-Themes", anchor: "closing-page" },
  },
  "library.theme.end-page.details": {
    title: "Add date, word and page counts",
    body: "Adds a Document Details list under your text: the date written, the total words and the total pages. Default: on.",
    tutorial: { page: "Document-Themes", anchor: "closing-page" },
  },
  "library.theme.end-page.link": {
    title: "Closing page link",
    body: "Adds a clickable line after your text: the words to show and the web address it opens. Leave the address empty to show the words without a link. Default: off.",
    tutorial: { page: "Document-Themes", anchor: "closing-page" },
  },
  "library.theme.end-page.closing": {
    title: "Closing line",
    body: "A last line after the text and the link, such as a sign-off, in the decorative font. Leave it empty to leave it out. Default: empty.",
    tutorial: { page: "Document-Themes", anchor: "closing-page" },
  },
  "library.theme.end-page.title-offset": {
    title: "Closing title position",
    body: "The distance from the top margin down to the closing page title, in millimetres. From 0 to 100 mm. Default: 20 mm.",
    tutorial: { page: "Document-Themes", anchor: "closing-page" },
  },
  "library.theme.end-page.body-offset": {
    title: "Closing text position",
    body: "The distance from the top margin down to the first line of the closing text, in millimetres. From 0 to 150 mm. Default: 40 mm.",
    tutorial: { page: "Document-Themes", anchor: "closing-page" },
  },
  "library.theme.metadata.author": {
    title: "PDF author",
    body: "The author a PDF reader shows in the document properties; it is not printed on the pages. {title} becomes the article title. Default: empty.",
    tutorial: { page: "Document-Themes", anchor: "pdf-details" },
  },
  "library.theme.metadata.subject": {
    title: "PDF subject",
    body: "The subject a PDF reader shows in the document properties. {title} becomes the article title. Default: {title}.",
    tutorial: { page: "Document-Themes", anchor: "pdf-details" },
  },
  "library.theme.metadata.keywords": {
    title: "PDF keywords",
    body: "Search words a PDF reader shows in the document properties, usually separated by commas. Up to 1000 characters. Default: empty.",
    tutorial: { page: "Document-Themes", anchor: "pdf-details" },
  },
  "library.theme.metadata.creator": {
    title: "PDF creator",
    body: "The app or person a PDF reader shows as the creator in the document properties. Default: empty.",
    tutorial: { page: "Document-Themes", anchor: "pdf-details" },
  },
  // ── Designs ──────────────────────────────────────────────────────────────────────────
  "library.design.show": {
    title: "Before and After",
    body: "Before shows the version this one was made from, After shows the version on show now, so you can compare an edit. It changes nothing: Continue from here, under Versions, picks the version the next edit starts from.",
  },
  "library.design.change": {
    title: "What to change",
    body: "Say in plain words what to change, such as: make the sky a warm sunset. Everything you don't mention should stay as it is. Each Edit is one paid picture from the model under Made with, at the price on the button. The result is a new version; the older ones are kept.",
  },
  "library.design.artwork": {
    title: "Describe the artwork",
    body: "What the AI draws behind your text. Describe the picture, not the words: Slopify sets your lines on top in real fonts. Keywords such as {{Event}} are filled with this piece's values. Each piece's artwork is one paid picture from the model under Made with, drawn once and cropped for every format.",
  },
  "library.design.ai-text": {
    title: "Let the AI draw the text",
    body: "Off: Slopify sets your lines over the picture in real fonts, spelled right and sharp in every format. On: the AI paints the words into the picture itself, so write them into the artwork's description; they may come out misspelled, and Slopify's own text is off. Default: off.",
  },
  "library.design.project": {
    title: "Keep in project",
    body: "Lists this design on a project's page, so its posters sit next to the video they belong to. It is only a link: nothing is added to the project's video. Choose No project to unlink it. Default: no project.",
  },
} as const satisfies Readonly<Record<string, HelpEntry>>;
