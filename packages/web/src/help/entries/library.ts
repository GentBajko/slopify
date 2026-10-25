import type { HelpEntry } from "../entry.js";

// Prompts (with intros and outros), Templates and Pronunciation. The PDF look editor carries no
// info buttons: each section's one line says what its settings place and in what unit.
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
    body: "Words the narrator says differently from how they are written, such as Dr. as Doctor. Only what the voice and narration preparation receive changes; the article and captions keep the written words. A project copies this list when it starts and uses it while Use your pronunciation list is on. Up to 1000 aliases, saved as a whole.",
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
  "library.design.project": {
    title: "Keep in project",
    body: "Lists this design on a project's page, so its posters sit next to the video they belong to. It is only a link: nothing is added to the project's video. Choose No project to unlink it. Default: no project.",
  },
} as const satisfies Readonly<Record<string, HelpEntry>>;
