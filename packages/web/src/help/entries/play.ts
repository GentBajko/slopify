import type { HelpEntry } from "../entry.js";

// Create's settings, top to bottom, and the pieces a project's Edit settings draws with the
// same components (speakers, shorts, pauses and checks, the establishing image, the language).
// Settings → Voices' table is here too, as it lives in the same voice components.
export const playHelp = {
  // Top of Create
  "play.title": {
    title: "Title",
    body: "The project's name in Slopify, shown on the project and in Projects. For a YouTube video it is also the YouTube title unless the YouTube text writes its own, and YouTube takes at most 100 characters there, without < or >. Write a keyword in double braces, like {{Topic}}, and the title becomes a pattern: you type the topic per video, and Another topic queues more videos with the same settings. Up to 200 characters.",
    tutorial: { page: "Create-Overview", anchor: "the-topic-and-the-title" },
  },
  "play.title-pattern": {
    title: "Title pattern",
    body: "The title with its keywords in double braces, like History: {{Topic}}. Each keyword in it is a topic you type at the top of Create, once per video, and templates save it empty. Change the pattern here; the topic values stay at the top.",
    tutorial: { page: "Create-Overview", anchor: "the-topic-and-the-title" },
  },
  "play.keyword": {
    title: "Keyword",
    body: "A value a picked prompt or the title asks for with {{name}}. You type it once and it fills every place that names it; the line under it lists where. Up to 200 characters. A keyword the title does not name is saved with a template.",
    tutorial: { page: "Create-Overview", anchor: "keywords" },
  },

  // Article row
  "play.provided.article": {
    title: "Article text",
    body: "The article you paste is narrated word for word, and the AI writer writes none. Include everything that should be read, headings too. The count under it helps you judge the length: about 150 words is one minute of narration.",
    tutorial: { page: "Create-Article", anchor: "paste-your-own-article" },
  },
  "play.provided.research": {
    title: "Research notes",
    body: "Notes you paste are given to the AI writer with the article prompt, in place of web research. Paste facts, sources and quotes the article should draw on. Nothing is looked up.",
    tutorial: { page: "Create-Article", anchor: "give-your-own-research-notes" },
  },
  "play.llm.thinking": {
    title: "Thinking",
    body: "How long the model reasons before it answers, for models that offer it. Higher levels can write more carefully but take longer and use more tokens. Model default leaves it to the service.",
    tutorial: { page: "Create-Article", anchor: "written-by" },
  },

  // Narration row
  "play.voice-sample": {
    title: "Try a sample of your text",
    body: "Reads the passage you paste in the chosen voice, so you hear how it says your names before a run. Up to a few hundred characters, priced on the button; your Pronunciation list (Settings → Voices → Pronunciation) applies when the voice uses it, the Pronunciation Glossary and narration preparation don't. The sample is never reused in the run.",
    tutorial: { page: "Create-Narration" },
  },
  "play.show-all-voices": {
    title: "Show all voices",
    body: "The voice list hides voices listed for other languages than the project's. Tick this to pick one anyway, for example a multilingual voice whose languages are listed wrong. A voice with unknown languages is always shown.",
    tutorial: { page: "Create-Narration", anchor: "pick-a-voice" },
  },
  "play.intro": {
    title: "Intro",
    body: "One of your intros, read before the article. A written intro is read as it is; one the AI writes is written for each video, one extra AI call. Off reads no intro. Write intros under Prompts → Intros & outros.",
    tutorial: { page: "Create-Narration", anchor: "intro-and-outro" },
  },
  "play.outro": {
    title: "Outro",
    body: "One of your outros, read after the article, such as a sign-off. A written outro is read as it is; one the AI writes is written for each video, one extra AI call. Off reads no outro. Write outros under Prompts → Intros & outros.",
    tutorial: { page: "Create-Narration", anchor: "intro-and-outro" },
  },
  "play.pronunciation-glossary": {
    title: "Pronunciation Glossary",
    body: "Reads names with the IPA in the article's Pronunciation Glossary, such as Arda: /ˈɑɹdə/, with no extra AI call. In your article prompt, ask for a glossary in slash-delimited standard-English IPA (Term: /IPA/), with an English approximation for foreign names; a line with sounds English lacks is read as plain text. Works with Inworld TTS-2 and TTS-2 Flash. The written text stays unchanged. Default: on.",
    tutorial: { page: "Narration-Aliases-and-Glossary", anchor: "the-pronunciation-glossary" },
  },
  "play.share-glossary": {
    title: "Pronunciations from other projects",
    body: "Adds every term from your other projects' glossaries, copied when this project starts. This project's own glossary wins where they differ. Turn it off to use only this article's glossary. Default: on.",
    tutorial: { page: "Narration-Aliases-and-Glossary", anchor: "the-pronunciation-glossary" },
  },
  "play.describe-figures": {
    title: "Describe tables and figures",
    body: "Instead of skipping tables, pictures, equations and code or reading them cell by cell, the AI writer writes a short spoken passage for each (a table's pattern, what a figure or equation means, what code does) and the narration says it in its place. One extra AI call per block, in the estimate, kept for reuse. The article and PDF keep the real table; captions show what is said. Needs an AI writer. Default: on.",
    tutorial: { page: "Create-Narration", anchor: "tables-figures-and-code" },
  },
  "play.show-figures": {
    title: "Show tables and figures on screen",
    body: "Each table, figure, equation and code block the narration describes is also shown in the video while it is described: the article's own picture for a figure, a card drawn in your brand kit's title font and color for the rest. The images take turns around them, and Shorts that include one show it upright. Drawn on this computer at no cost. Needs Describe tables and figures. Default: on.",
    tutorial: { page: "Create-Narration", anchor: "tables-figures-and-code" },
  },
  "play.skip-code": {
    title: "Leave code out",
    body: "Drops code blocks from the narration instead of summarising each in a sentence or two. Tables, figures and equations are still described. Default: off.",
    tutorial: { page: "Create-Narration", anchor: "tables-figures-and-code" },
  },
  "play.narration-aliases": {
    title: "Narration aliases",
    body: "Says the words listed in Settings → Voices → Pronunciation the way they are written there, such as Dr. as Doctor, with any generated voice. They are copied when the project starts. The article and captions keep the written words. Default: on.",
    tutorial: { page: "Narration-Aliases-and-Glossary", anchor: "use-aliases-in-a-video" },
  },

  // Speakers
  "play.speakers.format": {
    title: "Speakers format",
    body: "Narration uses one voice. Audiobook, Podcast, Radio drama and Interview give lines to several speakers, each with a voice. Several speakers need the AI writer to write or split the script. A new Podcast or Interview starts with the channel's hosts (cast members marked as hosts, with a voice).",
    tutorial: { page: "Multiple-Voices", anchor: "formats" },
  },
  "play.speakers.script": {
    title: "Script",
    body: "Write a script has the AI writer write speaker turns from a Script prompt, one Name: words paragraph each. Split the article (audiobooks) keeps the article as written and has the AI writer hand its narration and dialogue to the speakers, one extra call. Adapt the article (podcasts, interviews, dramas) also keeps the article as written; one extra call rewrites it as a conversation for the speakers, kept beside it as the script.",
    tutorial: { page: "Multiple-Voices", anchor: "the-script" },
  },
  "play.speakers.add-from-cast": {
    title: "Add from the cast",
    body: "Adds a member of this channel's cast as a speaker, with their name and voice. Only members with a voice are listed. Edit the cast on the channel's page.",
    tutorial: { page: "Multiple-Voices", anchor: "speakers-from-a-channels-cast" },
  },
  "play.speakers.book": {
    title: "A chapter of a book",
    body: "Makes this audiobook one chapter of a book. The MP3 and M4B are tagged with the book as their album and the chapter as their track, so a player keeps the chapters together and in order. When the chapter is done, Make the next chapter on its project page starts the next one with the same speakers and settings.",
    tutorial: { page: "Multiple-Voices", anchor: "audiobooks-in-chapters" },
  },
  "play.speakers.book-title": {
    title: "Book title",
    body: "The book this chapter belongs to, the same for every chapter. It becomes the album of the MP3 and M4B files.",
    tutorial: { page: "Multiple-Voices", anchor: "audiobooks-in-chapters" },
  },
  "play.speakers.book-chapter": {
    title: "Chapter",
    body: "This chapter's number in the book, from 1 to 9999. It becomes the track number of the MP3 and M4B files.",
    tutorial: { page: "Multiple-Voices", anchor: "audiobooks-in-chapters" },
  },
  "play.speakers.turn-gap": {
    title: "Gap between turns",
    body: "The pause between one speaker's turn and the next, from 0 to 1.2 seconds. Longer feels calmer; shorter feels like a lively talk. Default: 0.35 s.",
    tutorial: { page: "Multiple-Voices", anchor: "run-wide-options" },
  },
  "play.speakers.name-tags": {
    title: "Speaker names on captions",
    body: "Puts the speaker's name before their captions, like Ada: and their words, so viewers know who is talking. On by default for a podcast or interview.",
    tutorial: { page: "Multiple-Voices", anchor: "run-wide-options" },
  },
  "play.speakers.native-dialogue": {
    title: "One request for consecutive turns",
    body: "Sends back-to-back turns as one multi-speaker request where the voice service has one (ElevenLabs v3 with up to 10 voices, Gemini TTS with 2), so the voices react to each other. Fewer requests, same characters charged. Other voice services read each turn on its own.",
    tutorial: { page: "Multiple-Voices", anchor: "run-wide-options" },
  },
  "play.speakers.audio-files": {
    title: "MP3 and M4B files",
    body: "Also saves the narration as an MP3 and an M4B audiobook file with a chapter marker at each chapter, beside the video. Made on this computer at no cost.",
    tutorial: { page: "Multiple-Voices", anchor: "run-wide-options" },
  },
  "play.speaker.name": {
    title: "Speaker name",
    body: "The name the script uses for this speaker's turns (Name: words) and the one captions and the speaker panel show. Up to 40 characters.",
    tutorial: { page: "Multiple-Voices", anchor: "speaker-options" },
  },
  "play.speaker.role": {
    title: "Role",
    body: "What this speaker does in the format: narrator, host, guest or character. The AI writer is told each speaker's role when it writes or splits the script.",
    tutorial: { page: "Multiple-Voices", anchor: "speaker-options" },
  },
  "play.speaker.pace": {
    title: "Pace",
    body: "How fast this speaker talks, from 0.8× to 1.2× of the voice's own speed. Default: Normal.",
    tutorial: { page: "Multiple-Voices", anchor: "speaker-options" },
  },

  // Images row
  "play.images.effort": {
    title: "Effort",
    body: "How long an image agent, such as the Codex CLI, reasons before it draws. Higher effort can follow the prompt more closely but takes longer and uses more tokens. Model default leaves it to the service.",
    tutorial: { page: "Create-Images", anchor: "drawing-with-the-codex-cli" },
  },
  "play.image-scale": {
    title: "More images for long videos",
    body: "Adds images as the narration gets longer, planned from the expected length when the run starts. The extra images are shared among the ticked prompts in order, up to 240 in all; each is one more image call. The line under it shows the count. Turning it on switches Motion from Zoom to Mix of both.",
    tutorial: { page: "Create-Images", anchor: "more-images-for-long-videos" },
  },
  "play.image-scenes": {
    title: "Scenes from the article",
    body: "Gives every image its own moment. The project's AI model reads the article once and writes a scene per image, from the opening to the ending in slideshow order. The scene goes where a prompt has {{Scene}}, or after its first paragraph. A thumbnail prompt with {{Scene}} gets a scene too: the article's most striking moment, a different one per thumbnail. Off, a {{Scene}} line is left out. One more AI call per run.",
    tutorial: { page: "Create-Images", anchor: "scenes-from-the-article" },
  },
  "play.image-scenes.keyword": {
    title: "Scenes on for one picture",
    body: "This picture's prompt uses {{Slopify_Scene}}, {{Slopify_Setting}} or {{Slopify_Mood}}, so it gets its own scene even with Scenes from the article off. That is one AI call per run, by the project's AI writer, shared by every picture. To stop it, remove the keyword from the prompt.",
    tutorial: { page: "Keywords-Slopify-Fills", anchor: "per-picture" },
  },
  "play.image-scale.rate": {
    title: "Image rate",
    body: "Give the rate as one image every N minutes of narration (0.25 to 60) or as N images per hour (1 to 240); switching keeps the same rate. Narration runs about 150 words a minute. Starts at one image every 2 minutes.",
    tutorial: { page: "Create-Images", anchor: "more-images-for-long-videos" },
  },

  // Video and style row
  "play.edge-silence": {
    title: "Silence at start and end",
    body: "Quiet time before the narration starts and after it ends, 0 to 30 seconds. Default: 2.",
    tutorial: { page: "Create-Video-and-Style", anchor: "images-and-cuts" },
  },
  "play.silence-gap": {
    title: "Silence between segments",
    body: "Seconds of quiet between the intro and the narration, and between the narration and the outro, 0 to 30. It only matters when an intro or outro is set. Leave it empty to use the gap set in Settings, 3 seconds unless you changed it.",
    tutorial: { page: "Create-Narration", anchor: "silence-at-the-edges-and-between-segments" },
  },

  // Outputs row
  "play.thumbnail-prompt": {
    title: "Thumbnail prompt",
    body: "Your thumbnail prompt, keywords filled in. From my thumbnail prompt sends it to the image service as it is; Let the AI write the prompt gives it to the AI writer with the title and article to write the image prompt. Write prompts on Prompts.",
    tutorial: { page: "Create-Extras", anchor: "thumbnail" },
  },
  "play.thumbnail-count": {
    title: "How many thumbnails",
    body: "Three makes two more thumbnails from the same prompt with different compositions, for YouTube's Test & compare. Each costs one more image, so 3 thumbnails are 3 image calls. You can make each again on its own on the project page. Default: 1.",
    tutorial: { page: "Create-Extras", anchor: "make-three-thumbnails-for-test--compare" },
  },
  "play.description-prompt": {
    title: "Description prompt",
    body: "The prompt the description is written from. Built-in asks for a short summary, 5 to 12 chapters, 3 to 5 hashtags and 15 to 25 tags. Write your own description prompt on Prompts to change the tone or add links.",
    tutorial: { page: "YouTube-Description", anchor: "turn-it-on" },
  },
  "play.shorts.title-on-screen": {
    title: "Title on screen",
    body: "Keeps the short's title at the top for the whole clip, large and bold in the caption font, below where the apps draw their own buttons. Default: on.",
    tutorial: { page: "Shorts", anchor: "options" },
  },
  "play.shorts.speed": {
    title: "Speed",
    body: "Plays each short faster than the narration, 1.00× to 1.25× in steps of 0.05, with the pitch kept. A little faster suits short-form viewers. Default: 1.00×.",
    tutorial: { page: "Shorts", anchor: "options" },
  },
  "play.shorts.music-volume": {
    title: "Music volume",
    body: "How loud the background music plays under every short, 0 to 100 percent; it dips while the narrator speaks. Only used when you add a music file below. Default: 15.",
    tutorial: { page: "Shorts", anchor: "add-background-music" },
  },
  "play.shorts.full-video-link": {
    title: "Full video link",
    body: "Each short's description ends with a line pointing to the full video. Paste the video's link here; without it the line says [PASTE THE FULL VIDEO LINK HERE] for you to fill in.",
    tutorial: { page: "Shorts", anchor: "options" },
  },

  // Channel row
  "play.language": {
    title: "Language",
    body: "The language the article, narration, YouTube description and shorts titles are written in. Pick a voice that speaks it. Outside English, captions are timed with a free 248 MB model, downloaded once, where one exists. In Create, blank uses the channel's language.",
    tutorial: { page: "Other-Languages", anchor: "pick-a-language-for-one-video" },
  },

  // Right rail and dialogs
  "play.template-name": {
    title: "Template name",
    body: "The name the template is listed under in Create and on Templates. The template keeps these settings; the topic you typed and any extra videos are left out, as the list below says.",
    tutorial: { page: "Create-Overview", anchor: "save-as-template" },
  },
  "play.queue": {
    title: "Video queue",
    body: "Videos started together run one at a time, in this order. Pausing a project holds the queue; when one fails or is canceled, the next one starts.",
    tutorial: { page: "Create-Overview", anchor: "the-video-queue" },
  },
} as const satisfies Readonly<Record<string, HelpEntry>>;
