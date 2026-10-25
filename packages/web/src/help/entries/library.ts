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
    body: "Words the narrator says differently from how they are written, such as Dr. as Doctor. Only what the voice and narration preparation receive changes; the article and captions keep the written words. A project copies this list when it starts and uses it while Use my Pronunciation list is on. Up to 1000 aliases, saved as a whole.",
    tutorial: { page: "Narration-Aliases-and-Glossary", anchor: "narration-aliases" },
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
  "library.design.text-position": {
    title: "Where the text sits",
    body: "Where Slopify places your lines on the picture: along the top, along the bottom, in the centre or in a column on the left. Every format uses the same place, fitted to its shape. Default: Bottom.",
  },
  "library.design.scrim": {
    title: "Behind the text",
    body: "What keeps the text readable over a busy picture. Band puts a dark strip the full width of the piece behind it, Soft darkens only the area behind the lines, None leaves the picture as it is. Default: Band.",
  },
  "library.design.lines": {
    title: "Lines",
    body: "The words Slopify sets on the piece, one line each, the first the largest. Keywords such as {{Event}} are filled with the piece's values. Up to 8 lines; remove one with its bin button. Size, font and colour are under Fine-tune lines.",
  },
  "library.design.line-style": {
    title: "Line size, font and colour",
    body: "Size picks the line's role: Headline is largest, then Subhead, Details and Small print. Font is any font in Settings → Fonts; Barlow is the default. Colour is the line's text colour. Default: white.",
  },
  "library.design.values": {
    title: "Keywords",
    body: "The words for each {{name}} in the artwork's description and the lines, for this piece. A keyword used as the schedule's date takes a date. Every keyword needs words before the artwork is made.",
  },
  "library.design.sample-values": {
    title: "Sample values",
    body: "Words for each {{name}} used to draw the template's sample, so you can see a finished piece while you design. Pieces a schedule makes use each row's own words instead. A keyword used as the schedule's date takes a date.",
  },
  "library.design.make-values": {
    title: "Keywords for this piece",
    body: "The words for each {{name}} in the template, for this one piece. They start as the template's sample values; change them as you like. Every keyword needs words. A keyword used as the schedule's date takes a date. Nothing here changes the template.",
  },
  "library.design.accept-unknown": {
    title: "Accept an unknown price",
    body: "Slopify can't work out what this piece's artwork costs, for example because the model has no listed price. Turn this on to make it anyway and pay whatever the provider charges. Make stays off until you do. Default: off.",
  },
  "library.design.formats": {
    title: "Formats",
    body: "The sizes the piece is drawn in: posters, a flyer, social pictures and a brochure. The artwork is made once and cropped for each, so more formats cost nothing more. A piece keeps at least one format. A4, A3, flyer and brochure also download as print PDFs.",
  },
  "library.design.focus": {
    title: "Crop focus",
    body: "Where each format centres its crop of the artwork. Across moves it left or right, Down moves it up or down; the middle of each slider is the picture's centre. Change it when a format cuts off a face or the subject. Default: centred.",
  },
  "library.design.brochure": {
    title: "Brochure",
    body: "The brochure's title and its inside pages, drawn as an A4 PDF after the cover. The pages are Markdown: # for a heading, a blank line between paragraphs, - for a list. Keywords such as {{Event}} are filled in.",
  },
  "library.design.project": {
    title: "Keep in project",
    body: "Lists this design on a project's page, so its posters sit next to the video they belong to. It is only a link: nothing is added to the project's video. Choose No project to unlink it. Default: no project.",
  },
  "library.design.template-name": {
    title: "Template name",
    body: "What Templates → Poster templates lists this template by. It is never printed on the pieces. Up to 200 characters.",
  },
  "library.design.source": {
    title: "Artwork",
    body: "Where each piece's picture comes from. The AI draws it for each piece: a new paid picture per piece, from the description below. My own picture: every piece uses the one picture you upload, for free. Default: the AI draws it.",
  },
  "library.design.date-field": {
    title: "Each piece's date is in",
    body: "The keyword that holds each row's date, such as {{Date}}. A schedule then makes each row's piece the set number of days before that date. No schedule: pieces are only made by hand.",
  },
  "library.design.days-ahead": {
    title: "Days ahead",
    body: "How many days before each row's date its piece is made, from 0 (on the day) to 90. A row added after that day is made at once, unless its date is over. Default: 7.",
  },
  "library.design.time": {
    title: "At",
    body: "The local time of day a piece is made, on the day Days ahead picks. It is read in this computer's timezone, and a piece is only made while Slopify is open. Default: 09:00.",
  },
  "library.design.spend": {
    title: "Spend ceiling",
    body: "The most one piece may cost, in US dollars, such as 1 or 0.50. Before each piece Slopify prices its artwork; when the price is over this, or can't be known, that piece isn't made and the row stays on the table with the reason. Leave it empty for no ceiling. Default: empty.",
  },
} as const satisfies Readonly<Record<string, HelpEntry>>;
