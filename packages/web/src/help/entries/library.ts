import type { HelpEntry } from "../entry.js";

// Library → Prompts, Intros & Outros, Templates, Documents and Aliases. The document theme
// numbers (defaults and ranges) are the built-in Plain theme's and the save schema's, from
// packages/app/src/slices/document/theme.ts and theme-schema.ts.
export const libraryHelp = {
  // ── Prompts ──────────────────────────────────────────────────────────────────────────
  "library.prompt.kind": {
    title: "Prompt kind",
    body: "What the prompt is for, which decides where Play offers it. Article writes the video's text, Image and Thumbnail describe pictures, Narration Preparation adds delivery cues, YouTube Description writes the description, Shorts picks the short clips, Review checks a finished stage, Script writes speaker turns for several voices.",
  },
  "library.prompt.name": {
    title: "Prompt name",
    body: "What Play and Edit project list this prompt by. Up to 200 characters, and unique within its kind. Templates remember a prompt by name, so after a rename they use the copy saved with them until you pick it again.",
  },
  "library.prompt.body.article": {
    title: "Article prompt",
    body: "The instruction the text model gets to write the video's article, which becomes the narration. Each {{keyword}} becomes a field on Play. One call on the project's LLM, plus up to 3 more when the answer runs out of room; research notes go first when research ran. The answer's sources and pronunciation sections are never narrated.",
  },
  "library.prompt.body.image": {
    title: "Image prompt",
    body: "Sent as written to the image model, with the keywords filled in; no text model rewrites it. Play sets how many pictures each prompt makes (1 to 20, at most 60 a run), and each picture is one image call. Pictures show for 15 s each by default and repeat until the video ends.",
  },
  "library.prompt.body.thumbnail": {
    title: "Thumbnail prompt",
    body: "Sent to the image model to draw the thumbnail. With Thumbnail set to Prompt by LLM, the text model first turns it into a picture prompt using the title and article, one extra call. 1 thumbnail by default, or 3: the second a close-up, the third a wider shot, each one image call.",
  },
  "library.prompt.body.narration": {
    title: "Narration Preparation prompt",
    body: "Tells the text model how the narration should be delivered. It only adds cues, such as a short speaking direction or a laugh or sigh, and never rewrites the words. One call each for the body, the intro and the outro. Works only with the Inworld TTS-2 voice model and a single voice.",
  },
  "library.prompt.body.description": {
    title: "YouTube Description prompt",
    body: "Tells the text model how to write the video's YouTube description, chapters, hashtags and tags from the timestamped transcript. One call per video. Each {{keyword}} becomes a field on Play. A project that picks none uses the Built-in wording.",
  },
  "library.prompt.body.shorts": {
    title: "Shorts prompt",
    body: "Tells the text model which moments of the video to cut into vertical shorts (3 of 60 to 120 s by default). One call picks them, then one call per short writes its picture prompts, and each picture is one image call. A project that picks none uses the Built-in wording.",
  },
  "library.prompt.body.review": {
    title: "Review prompt",
    body: "Tells the reviewer what to check in a finished article, set of images, narration, thumbnail or shorts, and when to flag or redo it. One reviewer call per item checked; pictures can only be judged by the Claude Code and Codex reviewers. A stage with none picked uses its own built-in wording.",
  },
  "library.prompt.body.script": {
    title: "Script prompt",
    body: "Used in place of an Article prompt when a run has several voices and writes a script. The text model answers with # section headings and Name: words turns, one speaker per paragraph; text in [square brackets] is not spoken. One call on the project's LLM.",
  },
  "library.prompt.starter": {
    title: "Starter text",
    body: "Fills the body with ready-made text to start from: the documentary delivery cues for Narration Preparation, or the Built-in wording YouTube Description and Shorts use when no prompt is picked. When the body already has text you confirm first. Nothing is saved until you choose Save.",
  },
  "library.prompt.photorealistic": {
    title: "Draws photorealistic pictures",
    body: "Turn on when this prompt's style looks like real photos or film. Prepare upload then answers Yes to YouTube's AI use question (a realistic-looking scene that didn't happen) for videos and shorts drawn with it. Leave off for painterly or illustrated styles. Applies at once, apart from Save; a channel's Always Yes or Always No wins. Default: off.",
  },
  "library.slots": {
    title: "Detected slots",
    body: "Every {{keyword}} in the body, listed as you type. Each becomes one field on Play, typed once and filled into every prompt that names it. Names are case-sensitive, so {{Topic}} and {{topic}} are two fields. A keyword the project title also names is typed per video and saved empty in templates.",
  },
  "library.used-by": {
    title: "Used by",
    body: "The templates, schedules and projects that name this item, matched by name within its kind. For a project it says how many of its revisions used it and whether the current one does. Projects keep their own text, so editing here changes only runs started later.",
  },
  "library.history": {
    title: "History",
    body: "Every save that changes the name or text adds a version, and every version is kept. Here you see the latest change with the changed words marked. Compare versions opens them all side by side, with Restore for an older one.",
  },
  "library.history.compare": {
    title: "Compare versions",
    body: "Pick any two saved versions to see them side by side, with the words that changed marked. Older and Newer can be any versions; a rename between them is said above the text.",
  },
  "library.history.versions": {
    title: "Versions",
    body: "Every saved version, newest first. Restore saves an older version again as a new version, so nothing after it is lost and History notes where it came from. Projects already made keep their text.",
  },
  // ── Intros & Outros ──────────────────────────────────────────────────────────────────
  "library.entry.category": {
    title: "Intro or outro",
    body: "An intro is narrated before the body of the video, an outro after it, in the same voice. Play offers each in its own picker. A name only needs to be unique within its category.",
  },
  "library.entry.name": {
    title: "Entry name",
    body: "What Play and Edit project list this intro or outro by. Up to 200 characters, and unique within its category.",
  },
  "library.entry.mode": {
    title: "Mode",
    body: "Text is narrated as written, with the keywords filled in and no extra call. LLM sends the body as an instruction to the project's text model, with the title, keyword values and article, and narrates the answer: one call per entry, and the run then needs an LLM. Default: Text.",
  },
  "library.entry.body": {
    title: "Entry body",
    body: "In Text mode, the words the narrator says; in LLM mode, the instruction whose answer is said. Each {{keyword}} becomes a field on Play. It is narrated as its own audio file with the run's voice, one voice request each.",
  },
  // ── Narration aliases ────────────────────────────────────────────────────────────────
  "library.aliases": {
    title: "Narration aliases",
    body: "Words the narrator says differently from how they are written, such as Dr. as Doctor. Only what the voice and Narration Preparation receive changes; the article and captions keep the written words. A project copies this list when it starts and uses it while Use narration aliases is on. Up to 1000 aliases, saved as a whole.",
  },
  "library.aliases.written": {
    title: "Written",
    body: "The word or phrase as it appears in the article, up to 200 characters. Spaces inside it match any spacing. Two aliases can't share a written form; where two overlap, the one starting first wins, then the longer.",
  },
  "library.aliases.spoken": {
    title: "Say it as",
    body: "What the narrator says instead, spelled the way it sounds, up to 500 characters. Only the audio changes. An alias wins over a Pronunciation Glossary entry for the same words.",
  },
  "library.aliases.whole-word": {
    title: "Whole word",
    body: "On: matches only where the written form stands as a word of its own, so it never fires inside a longer word. Off: matches inside other words too. Default: on.",
  },
  "library.aliases.match-case": {
    title: "Match case",
    body: "On: matches only with the same capital letters, so US is not us. Off: capitals are ignored. Default: off.",
  },
  // ── Templates ────────────────────────────────────────────────────────────────────────
  "templates.show-channel": {
    title: "Show templates of",
    body: "Shows only the templates of one channel, or of all. A template's channel is the one a draft made from it runs in. Choosing here changes nothing about the templates.",
  },
  "templates.apply": {
    title: "Use in Play",
    body: "Makes a new Play draft from the template and opens it in Play for you to review; nothing starts. Keywords the project title names start empty for this video's topic, and uploaded files keep their names but must be attached again. The template itself is unchanged.",
  },
  "templates.save": {
    title: "Save a setup",
    body: "Keeps a saved Play draft as a reusable template: every setting and checkpoint choice, plus a copy of each picked prompt and intro or outro. Keywords the project title names, like {{Topic}}, are saved empty; other keywords keep their values. Queued extra videos and uploaded fonts are left out.",
  },
  "templates.save.draft": {
    title: "Saved Play draft",
    body: "The Play draft whose setup the template keeps. Only drafts saved in Play are listed; open Play to prepare one first. The draft itself stays as it is.",
  },
  "templates.save.name": {
    title: "Template name",
    body: "What the template is called in this list and wherever you pick a template, such as a schedule. Up to 120 characters.",
  },
  "templates.edit": {
    title: "Edit a template",
    body: "Renames the template; the keywords it fills are listed below. Saving adds a version, and History keeps the old one. To change its settings, use it in Play, change the draft, then Save a setup.",
  },
  "templates.history": {
    title: "Template versions",
    body: "Every saved version of the template, newest first. Pick one to compare its setup with the current one. Restore saves the older setup again as a new version, so nothing is lost. Drafts and projects made from it keep their setup.",
  },
  "templates.save.channel": {
    title: "Template channel",
    body: "The channel the template belongs to, and the one a draft made from it runs in. Default: the draft's own channel, or its template's channel when it has none.",
  },
  // ── Document themes ──────────────────────────────────────────────────────────────────
  "library.themes.yours": {
    title: "Your themes",
    body: "Themes you made or copied from a built-in. Pick one on the Document row in Play or in Edit project. A project keeps its own copy of the settings, so editing or deleting a theme here never changes a PDF already made or queued.",
  },
  "library.themes.built-in": {
    title: "Built-in themes",
    body: "Looks that ship with Slopify and can't be changed. Plain is an unbranded flat page and what a new project gets. Copy one to make a theme of your own you can edit.",
  },
  "library.theme.name": {
    title: "Theme name",
    body: "What the theme is called on the Document row in Play and in Edit project. Up to 80 characters.",
  },
  "library.theme.preview": {
    title: "Preview",
    body: "A sample article laid out with this theme by the same renderer that makes a project's PDF, redrawn about half a second after you stop typing. It runs on your computer and costs nothing. Your projects use their own text and thumbnail.",
  },
  "library.theme.page.format": {
    title: "Paper size",
    body: "The page size of the PDF. A4 (210 × 297 mm) is used in most of the world; US Letter (216 × 279 mm) in the US and Canada. Pick the one your readers print on. Default: A4.",
  },
  "library.theme.page.margin": {
    title: "Margins",
    body: "Blank space kept on every edge of each page, in millimetres. Wider margins mean shorter lines and more pages. From 5 to 60 mm. Default: 22 mm.",
  },
  "library.theme.page.content-top": {
    title: "Text starts at",
    body: "How far from the top of the page the text begins on pages that carry the running header, in millimetres. Raise it when text crowds the header. From 5 to 80 mm. Default: 32 mm.",
  },
  "library.theme.background.image": {
    title: "Background",
    body: "Parchment texture stretches an aged-paper picture over every page. Flat colour fills each page with the Page colour, drawn slightly darker at the edges. Default: Flat colour.",
  },
  "library.theme.background.color": {
    title: "Page colour",
    body: "The colour of every page when Background is Flat colour; ignored with the parchment texture. Type a hex code like #fdfaf3 or use the picker. Default: #fdfaf3, a warm off-white.",
  },
  "library.theme.colors.heading": {
    title: "Heading colour",
    body: "The colour of headings, drop caps, the brand name and links. Type a hex code like #1f3a5f or use the picker. Default: #1f3a5f, a dark blue.",
  },
  "library.theme.colors.text": {
    title: "Body text colour",
    body: "The colour of paragraphs, lists and bold or italic text. Keep it dark against the page colour so it reads and prints well. Default: #1a1a1a, near black.",
  },
  "library.theme.colors.muted": {
    title: "Muted colour",
    body: "The colour of dates, bullets, quotes and the dotted lines on the contents page. Default: #555555, a mid grey.",
  },
  "library.theme.colors.faint": {
    title: "Faint colour",
    body: "The colour of the running header and the page numbers, kept light so they stay out of the way. Default: #888888, a light grey.",
  },
  "library.theme.fonts.body": {
    title: "Body font",
    body: "The font of paragraphs and lists. The first box picks the family, the second its weight or italic, the number adds space between letters in millimetres (-0.5 to 2). Cinzel is bundled and has no italics; Times, Helvetica and Courier are built into every PDF reader. Default: Cinzel Regular, 0.01 mm.",
  },
  "library.theme.fonts.strong": {
    title: "Bold text font",
    body: "The font of bold words inside paragraphs. Family, style and letter spacing in millimetres, as for Body. Default: Cinzel Bold, 0.02 mm.",
  },
  "library.theme.fonts.emphasis": {
    title: "Italic text font",
    body: "The font of italic words inside paragraphs. Cinzel has no italics, so the default borrows Times. Family, style and letter spacing in millimetres, as for Body. Default: Times Italic, 0 mm.",
  },
  "library.theme.fonts.heading": {
    title: "Heading font",
    body: "The font of the article's headings and of the contents, sources and closing page titles. Family, style and letter spacing in millimetres, as for Body. Default: Cinzel Bold, 0.02 mm.",
  },
  "library.theme.fonts.dramatic": {
    title: "Chapter numbers and brand font",
    body: 'The font of the big number in a heading like "Chapter 3:" and of the brand name on the title page. Family, style and letter spacing in millimetres, as for Body. Default: Cinzel Black, 0.03 mm.',
  },
  "library.theme.fonts.decorative": {
    title: "Tagline and link font",
    body: "The font of the tagline and the linked line on the title page, and of the link and closing line on the closing page. Default: Cinzel Medium, 0.015 mm.",
  },
  "library.theme.fonts.drop-cap": {
    title: "Drop cap font",
    body: "The font of the large first letter that starts a paragraph after a heading, when drop caps are on. Family, style and letter spacing in millimetres, as for Body. Default: Cinzel Black, 0 mm.",
  },
  "library.theme.fonts.footer": {
    title: "Header and page number font",
    body: "The font of the running header and the page numbers. Family, style and letter spacing in millimetres, as for Body. Default: Times Regular, 0 mm.",
  },
  "library.theme.sizes.title": {
    title: "Title size",
    body: "The size of the article's title on the title page, in points (1 pt is about 0.35 mm). From 6 to 72 pt. Default: 22 pt.",
  },
  "library.theme.sizes.brand": {
    title: "Brand size",
    body: "The size of the brand name on the title page, in points. Shown only when Branding has a brand name. From 6 to 72 pt. Default: 31 pt.",
  },
  "library.theme.sizes.section": {
    title: "Top-level heading size",
    body: "The size of top-level headings and of the contents, sources and closing page titles, in points. From 6 to 72 pt. Default: 19 pt.",
  },
  "library.theme.sizes.heading": {
    title: "Second-level heading size",
    body: "The size of second-level headings, the ones inside a top-level section, in points. From 6 to 72 pt. Default: 17 pt.",
  },
  "library.theme.sizes.subheading": {
    title: "Third-level heading size",
    body: "The size of third-level and deeper headings, in points. From 6 to 72 pt. Default: 13 pt.",
  },
  "library.theme.sizes.body": {
    title: "Body size",
    body: "The size of paragraphs, lists and the closing page text, in points. Bigger text means more pages. From 6 to 24 pt. Default: 10.5 pt.",
  },
  "library.theme.sizes.meta": {
    title: "Date and word count size",
    body: "The size of the date, word count and link lines under the title on the title page, in points. From 5 to 24 pt. Default: 10 pt.",
  },
  "library.theme.sizes.footer": {
    title: "Header and page number size",
    body: "The size of the running header and the page numbers, in points. From 5 to 24 pt. Default: 9 pt.",
  },
  "library.theme.spacing.body-line": {
    title: "Body line height",
    body: "The distance from one line of body text to the next, in millimetres. Raise it for airier pages, lower it to fit more on each page. From 3 to 20 mm. Default: 8 mm.",
  },
  "library.theme.spacing.heading-line": {
    title: "Heading line height",
    body: "The distance between the lines of a top- or second-level heading that wraps, in millimetres. From 3 to 30 mm. Default: 11 mm.",
  },
  "library.theme.spacing.subheading-line": {
    title: "Subheading line height",
    body: "The distance between the lines of a third-level heading that wraps, in millimetres. From 3 to 30 mm. Default: 9 mm.",
  },
  "library.theme.spacing.paragraph-gap": {
    title: "After a paragraph",
    body: "Extra space after each paragraph, as a share of a body line: 0.5 is half a line. From 0 to 3. Default: 0.5.",
  },
  "library.theme.spacing.heading-gap": {
    title: "Before a heading",
    body: "Extra space above each heading, as a share of a body line: 1 is one full line. From 0 to 5. Default: 1.",
  },
  "library.theme.spacing.item-gap": {
    title: "After a list item",
    body: "Extra space after each bulleted or numbered item, as a share of a body line. From 0 to 3. Default: 0.2.",
  },
  "library.theme.spacing.list-indent": {
    title: "List indent",
    body: "How far bulleted and numbered lists are pushed in from the left margin, in millimetres. From 0 to 30 mm. Default: 6 mm.",
  },
  "library.theme.spacing.quote-indent": {
    title: "Quote indent",
    body: "How far quotes are pushed in from the left margin, in millimetres. From 0 to 40 mm. Default: 8 mm.",
  },
  "library.theme.spacing.rule-width": {
    title: "Divider width",
    body: "The width of the short centred line a --- in the article becomes, in millimetres. From 0 to 150 mm. Default: 30 mm.",
  },
  "library.theme.drop-cap.enabled": {
    title: "Drop caps",
    body: "Starts the first paragraph after each heading with a large first letter that spans several lines, as in printed books. Turn it off for a plainer page. Default: on.",
  },
  "library.theme.drop-cap.lines": {
    title: "Drop cap lines tall",
    body: "How many lines of body text the large first letter spans. Default: 3 lines.",
  },
  "library.theme.drop-cap.scale": {
    title: "Drop cap letter size",
    body: "The size of the large first letter, as a multiple of the height of the lines it spans. From 1 to 5. Default: 3.",
  },
  "library.theme.drop-cap.gap": {
    title: "Gap beside the drop cap",
    body: "The space between the large first letter and the text beside it, in millimetres. From 0 to 20 mm. Default: 4 mm.",
  },
  "library.theme.drop-cap.min-length": {
    title: "Shortest paragraph",
    body: "A paragraph shorter than this many characters starts plainly, so a one-line paragraph never gets a huge letter. From 0 to 2000. Default: 50.",
  },
  "library.theme.drop-cap.min-room": {
    title: "Room needed",
    body: "With less than this share of the page left, a paragraph that starts with a drop cap moves to the next page. 0.25 is a quarter of the page. From 0 to 1. Default: 0.25.",
  },
  "library.theme.title-page.brand-y": {
    title: "Brand from top",
    body: "Where the brand name sits on the title page, measured from the top edge of the page in millimetres. From 10 to 200 mm. Default: 60 mm.",
  },
  "library.theme.title-page.tagline-offset": {
    title: "Tagline below brand",
    body: "The distance from the brand name down to the tagline, in millimetres. From 0 to 60 mm. Default: 10 mm.",
  },
  "library.theme.title-page.title-y": {
    title: "Title from top",
    body: "Where the article's title sits on the title page, measured from the top edge of the page in millimetres. From 10 to 250 mm. Default: 80 mm.",
  },
  "library.theme.title-page.title-line": {
    title: "Title line height",
    body: "The distance between the lines of a title that wraps, in millimetres. From 3 to 40 mm. Default: 10 mm.",
  },
  "library.theme.title-page.meta-offset": {
    title: "Details below title",
    body: "The distance from the title down to the date and word count, in millimetres, when there is no cover picture. From 0 to 100 mm. Default: 20 mm.",
  },
  "library.theme.title-page.meta-line": {
    title: "Details line height",
    body: "The distance between the date, word count and link lines on the title page, in millimetres. From 3 to 30 mm. Default: 10 mm.",
  },
  "library.theme.title-page.show-date": {
    title: "Show the date",
    body: 'Prints "Written on" and the date the PDF was made under the title on the title page. Default: on.',
  },
  "library.theme.title-page.show-word-count": {
    title: "Show the word count",
    body: "Prints the article's word count under the title on the title page. Default: on.",
  },
  "library.theme.title-page.cover": {
    title: "Thumbnail as cover",
    body: "Puts the project's thumbnail on the title page, between the title and the date, when the project has one. Without a thumbnail the page is laid out as if this were off. Default: on.",
  },
  "library.theme.title-page.cover-gap": {
    title: "Space around cover",
    body: "The space above and below the cover picture on the title page, in millimetres. From 0 to 40 mm. Default: 6 mm.",
  },
  "library.theme.title-page.cover-height": {
    title: "Cover height at most",
    body: "The tallest the cover picture may be, in millimetres. It keeps its shape and shrinks further when the page has less room. From 20 to 200 mm. Default: 110 mm.",
  },
  "library.theme.brand.name": {
    title: "Brand name",
    body: 'Your channel or brand, printed large at the top of the title page and before the title in the running header ("Brand | Title"). Leave it empty to show no brand. Default: empty.',
  },
  "library.theme.brand.tagline": {
    title: "Tagline",
    body: "A short line under the brand name on the title page. Leave it empty to hide it. Default: empty.",
  },
  "library.theme.brand.url": {
    title: "Website",
    body: "The web address the brand name and the title-page link open when clicked in the PDF. Leave it empty for no link. Default: empty.",
  },
  "library.theme.brand.link-label": {
    title: "Link text",
    body: "The words of a linked line under the word count on the title page; it opens Website. Leave it empty to hide the line. Default: empty.",
  },
  "library.theme.contents.enabled": {
    title: "Contents page",
    body: "Adds a table of contents after the title page, listing the article's headings with their page numbers. Each entry is a link to its page. Default: on.",
  },
  "library.theme.contents.title": {
    title: "Contents page title",
    body: "The heading at the top of the contents page. Up to 300 characters. Default: Table of Contents.",
  },
  "library.theme.contents.depth": {
    title: "Lists headings down to",
    body: "Which headings the contents page lists: only top-level ones, down to second-level, or down to third-level. Deeper lists take more room and can add a page. Default: Second level.",
  },
  "library.theme.contents.title-offset": {
    title: "Contents title position",
    body: "The distance from the top margin down to the contents page title, in millimetres. From 0 to 100 mm. Default: 20 mm.",
  },
  "library.theme.contents.first-entry-offset": {
    title: "First entry position",
    body: "The distance from the top margin down to the first entry of the contents, in millimetres. From 0 to 150 mm. Default: 40 mm.",
  },
  "library.theme.contents.line": {
    title: "Contents line height",
    body: "The distance from one contents entry to the next, in millimetres. From 3 to 30 mm. Default: 8 mm.",
  },
  "library.theme.contents.indent": {
    title: "Indent per level",
    body: "How much further in each deeper heading level is listed on the contents page, in millimetres. From 0 to 30 mm. Default: 5 mm.",
  },
  "library.theme.header.enabled": {
    title: "Running header",
    body: 'Prints the brand and the article title ("Brand | Title") at the top of every page after the title page. Default: on.',
  },
  "library.theme.header.top": {
    title: "Header from top",
    body: "The distance from the top edge of the page to the running header, in millimetres. From 3 to 60 mm. Default: 15 mm.",
  },
  "library.theme.header.max-title": {
    title: "Header title at most",
    body: "A title longer than this many characters is cut short in the running header so it fits on one line. From 5 to 200. Default: 35.",
  },
  "library.theme.footer.enabled": {
    title: "Page numbers",
    body: "Prints a page number at the bottom of every page after the title page. Default: on.",
  },
  "library.theme.footer.text": {
    title: "Page number text",
    body: 'The words around the page number; {page} becomes the number, so "Page {page}" prints "Page 4". Default: Page {page}.',
  },
  "library.theme.footer.bottom": {
    title: "Page number from the bottom",
    body: "The distance from the bottom edge of the page to the page number, in millimetres. From 3 to 60 mm. Default: 10 mm.",
  },
  "library.theme.footer.reserve": {
    title: "Space kept above page number",
    body: "Space kept free above the page number, so body text always stops short of it, in millimetres. From 0 to 60 mm. Default: 15 mm.",
  },
  "library.theme.sources.enabled": {
    title: "Sources page",
    body: "Adds a page listing the web links the article and its research used, each one clickable. Default: on.",
  },
  "library.theme.sources.title": {
    title: "Sources page title",
    body: "The heading at the top of the sources page. Up to 300 characters. Default: Sources Consulted.",
  },
  "library.theme.sources.title-offset": {
    title: "Sources title position",
    body: "The distance from the top margin down to the sources page title, in millimetres. From 0 to 100 mm. Default: 20 mm.",
  },
  "library.theme.sources.body-offset": {
    title: "Sources list position",
    body: "The distance from the top margin down to the first source, in millimetres. From 0 to 150 mm. Default: 40 mm.",
  },
  "library.theme.sources.line": {
    title: "Sources line height",
    body: "The distance between the lines of one source, in millimetres. From 3 to 30 mm. Default: 8 mm.",
  },
  "library.theme.sources.gap": {
    title: "Gap between sources",
    body: "Extra space between one source and the next, in millimetres. From 0 to 20 mm. Default: 2 mm.",
  },
  "library.theme.end-page.enabled": {
    title: "Closing page",
    body: "Adds a last page with your own text, such as an about section, a thank-you or a link to your site. Default: off.",
  },
  "library.theme.end-page.title": {
    title: "Closing page title",
    body: "The heading at the top of the closing page. Up to 300 characters. Default: About.",
  },
  "library.theme.end-page.lines": {
    title: "Closing page text",
    body: 'The closing page text, one line per row, up to 60 lines of 300 characters. A line starting with "•" becomes a muted bullet, one ending with ":" a bold label, an empty line a gap. Default: empty.',
  },
  "library.theme.end-page.details": {
    title: "Add date, word and page counts",
    body: "Adds a Document Details list under your text: the date written, the total words and the total pages. Default: on.",
  },
  "library.theme.end-page.link": {
    title: "Closing page link",
    body: "Adds a clickable line after your text: the words to show and the web address it opens. Leave the address empty to show the words without a link. Default: off.",
  },
  "library.theme.end-page.closing": {
    title: "Closing line",
    body: "A last line after the text and the link, such as a sign-off, in the decorative font. Leave it empty to leave it out. Default: empty.",
  },
  "library.theme.end-page.title-offset": {
    title: "Closing title position",
    body: "The distance from the top margin down to the closing page title, in millimetres. From 0 to 100 mm. Default: 20 mm.",
  },
  "library.theme.end-page.body-offset": {
    title: "Closing text position",
    body: "The distance from the top margin down to the first line of the closing text, in millimetres. From 0 to 150 mm. Default: 40 mm.",
  },
  "library.theme.metadata.author": {
    title: "PDF author",
    body: "The author a PDF reader shows in the document properties; it is not printed on the pages. {title} becomes the article title. Default: empty.",
  },
  "library.theme.metadata.subject": {
    title: "PDF subject",
    body: "The subject a PDF reader shows in the document properties. {title} becomes the article title. Default: {title}.",
  },
  "library.theme.metadata.keywords": {
    title: "PDF keywords",
    body: "Search words a PDF reader shows in the document properties, usually separated by commas. Up to 1000 characters. Default: empty.",
  },
  "library.theme.metadata.creator": {
    title: "PDF creator",
    body: "The app or person a PDF reader shows as the creator in the document properties. Default: empty.",
  },
} as const satisfies Readonly<Record<string, HelpEntry>>;
