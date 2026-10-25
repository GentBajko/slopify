import type { HelpEntry } from "../entry.js";

// Create's settings, top to bottom, and the pieces a project's Edit settings draws with the
// same components (speakers, shorts, pauses and checks, the establishing image, the language).
// Settings → Voices' table is here too, as it lives in the same voice components.
export const playHelp = {
  // Top of Create
  "play.title": {
    title: "Title",
    body: "The project's name in Slopify, shown on the project and in Projects. For a YouTube video it is also the YouTube title unless the YouTube text writes its own, and YouTube takes at most 100 characters there, without < or >. Write a keyword in double braces, like {{Topic}}, and the title becomes a pattern: you type the topic per video, and Another topic queues more videos with the same settings. Up to 200 characters.",
    tutorial: { page: "Play-Overview", anchor: "title-title-pattern-and-topic" },
  },
  "play.title-pattern": {
    title: "Title pattern",
    body: "The title with its keywords in double braces, like History: {{Topic}}. Each keyword in it is a topic you type at the top of Create, once per video, and templates save it empty. Change the pattern here; the topic values stay at the top.",
    tutorial: { page: "Play-Overview", anchor: "title-title-pattern-and-topic" },
  },
  "play.keyword": {
    title: "Keyword",
    body: "A value a picked prompt or the title asks for with {{name}}. You type it once and it fills every place that names it; the line under it lists where. Up to 200 characters. A keyword the title does not name is saved with a template.",
    tutorial: { page: "Play-Overview", anchor: "keywords" },
  },

  // Sources, one switch per stage
  "play.source.research": {
    title: "Research",
    body: "Let the AI research has the AI plan chapters, look each one up on the web and combine the notes before the article is written: one call to plan, one per chapter and one to combine. Paste my notes uses notes you paste. Off, the default, writes from the prompt alone.",
    tutorial: { page: "Play-Title-and-Article", anchor: "research" },
  },
  "play.source.article": {
    title: "Article source",
    body: "Write it for me has the text model write the article from the article prompt, one call. Use my text as written narrates text you paste, word for word, with no text-model cost. Adapt my text has the article prompt rewrite text you paste, one call. No text is for images only. The article is what the narration reads and the PDF lays out. Default: Write it for me.",
    tutorial: { page: "Play-Title-and-Article", anchor: "choose-where-the-article-comes-from" },
  },
  "play.source.audio": {
    title: "Narration",
    body: "AI voice reads the article aloud with the voice you pick, charged by the voice service per character. My own audio file uses a file you upload, as it is. Off makes a silent video with no captions, YouTube description or shorts. Default: AI voice.",
    tutorial: { page: "Play-Narration", anchor: "choose-where-the-narration-comes-from" },
  },
  "play.source.images": {
    title: "Images",
    body: "Made by AI draws images from the ticked image prompts, one paid image call each. My own images uses your PNG, JPEG or WebP files in the order you pick them. None turns the video off too. Default: Made by AI.",
    tutorial: { page: "Play-Images", anchor: "choose-where-the-images-come-from" },
  },
  "play.source.thumbnail": {
    title: "Thumbnail",
    body: "From my thumbnail prompt draws it straight from your thumbnail prompt, one image call. Let the AI write the prompt first has the AI write the image prompt from yours, the title and the article, then draws it. Upload mine uses your own picture. Default: None.",
    tutorial: { page: "Play-Outputs", anchor: "thumbnail" },
  },
  "play.source.video": {
    title: "Video",
    body: "Make the video puts the slideshow together on this computer from the images and narration; it costs no provider money, only time. Off (sound only) keeps the narration as one audio file and leaves each other stage to download on its own. It needs images. Default: Make the video.",
    tutorial: { page: "Play-Video-and-Style", anchor: "choose-whether-to-render-a-video" },
  },
  "play.source.document": {
    title: "PDF of the article",
    body: "Make a PDF lays out the article and title on this computer, in the theme you pick. It needs no provider and costs nothing. Default: Off.",
    tutorial: { page: "PDF-Documents", anchor: "make-a-pdf" },
  },

  // Article row
  "play.provided.article": {
    title: "Article text",
    body: "The article you paste is narrated word for word, and no text model writes one. Include everything that should be read, headings too. The count under it helps you judge the length: about 150 words is one minute of narration.",
    tutorial: { page: "Play-Title-and-Article", anchor: "paste-your-own-article" },
  },
  "play.provided.research": {
    title: "Research notes",
    body: "Notes you paste are given to the text model with the article prompt, in place of web research. Paste facts, sources and quotes the article should draw on. Nothing is looked up.",
    tutorial: { page: "Play-Title-and-Article", anchor: "give-your-own-research-notes" },
  },
  "play.llm.provider": {
    title: "Written by",
    body: "Who writes: a command-line tool you are signed in to, such as Claude Code or Codex, or a keyed service such as OpenRouter, billed per token. A greyed service says why it cannot be used; fix it under Settings.",
    tutorial: { page: "Play-Title-and-Article", anchor: "text-generation" },
  },
  "play.llm.model": {
    title: "Writing model",
    body: "The model the service runs for every writing step. Bigger models write better and cost more per token. Settings → Models refreshes the list and checks whether a model works for your key.",
    tutorial: { page: "Play-Title-and-Article", anchor: "text-generation" },
  },
  "play.llm.thinking": {
    title: "Thinking",
    body: "How long the model reasons before it answers, for models that offer it. Higher levels can write more carefully but take longer and use more tokens. Model default leaves it to the provider.",
    tutorial: { page: "Play-Title-and-Article", anchor: "text-generation" },
  },

  // Narration row
  "play.tts.provider": {
    title: "Voice service",
    body: "The service that reads the narration aloud, charged per character of text. A greyed service says why it cannot be used; add its key under Settings. Changing it clears the model and voice.",
    tutorial: { page: "Play-Narration", anchor: "pick-a-voice" },
  },
  "play.tts.model": {
    title: "Voice model",
    body: "The voice service's speech model. Models differ in quality, languages, speed and price per character. Some features need a particular model: narration preparation needs Inworld TTS-2. Settings → Models refreshes the list.",
    tutorial: { page: "Play-Narration", anchor: "pick-a-voice" },
  },
  "play.voice": {
    title: "Voice",
    body: "Who reads the narration. The list holds the voices you added under Settings → Voices for this voice service, filtered to the project's language. With several speakers, this voice reads the intro and outro.",
    tutorial: { page: "Play-Narration", anchor: "pick-a-voice" },
  },
  "play.voice-sample": {
    title: "Try a sample of your text",
    body: "Reads the passage you paste in the chosen voice, so you hear how it says your names before a run. Up to a few hundred characters, priced on the button; Library → Narration aliases apply when the voice uses them, the Pronunciation Glossary and narration preparation don't. The sample is never reused in the run.",
    tutorial: { page: "Play-Narration" },
  },
  "play.show-all-voices": {
    title: "Show all voices",
    body: "The voice list hides voices listed for other languages than the project's. Tick this to pick one anyway, for example a multilingual voice whose languages are listed wrong. A voice with unknown languages is always shown.",
    tutorial: { page: "Play-Narration", anchor: "pick-a-voice" },
  },
  "play.intro": {
    title: "Intro",
    body: "A Library entry read before the article. A text entry is read as written; an LLM entry is written by the text model for each video, one extra call. Off reads no intro. Write entries in Library → Intros & outros.",
    tutorial: { page: "Play-Narration", anchor: "intro-and-outro" },
  },
  "play.outro": {
    title: "Outro",
    body: "A Library entry read after the article, such as a sign-off. A text entry is read as written; an LLM entry is written by the text model for each video, one extra call. Off reads no outro.",
    tutorial: { page: "Play-Narration", anchor: "intro-and-outro" },
  },
  "play.pronunciation-glossary": {
    title: "Pronunciation Glossary",
    body: "Reads names with the IPA in the article's Pronunciation Glossary, such as Arda: /ˈɑɹdə/, with no extra text-model call. In your article prompt, ask for a glossary in slash-delimited standard-English IPA (Term: /IPA/), with an English approximation for foreign names; a line with sounds English lacks is read as plain text. Works with Inworld TTS-2 and TTS-2 Flash. The written text stays unchanged. Default: on.",
    tutorial: { page: "Narration-Aliases-and-Glossary", anchor: "the-pronunciation-glossary" },
  },
  "play.share-glossary": {
    title: "Pronunciations from other projects",
    body: "Adds every term from your other projects' glossaries, copied when this project starts. This project's own glossary wins where they differ. Turn it off to use only this article's glossary. Default: on.",
    tutorial: { page: "Narration-Aliases-and-Glossary", anchor: "the-pronunciation-glossary" },
  },
  "play.describe-figures": {
    title: "Describe tables and figures",
    body: "Instead of skipping tables, pictures, equations and code or reading them cell by cell, the text model writes a short spoken passage for each (a table's pattern, what a figure or equation means, what code does) and the narration says it in its place. One extra text-model call per block, in the estimate, kept for reuse. The article and PDF keep the real table; captions show what is said. Needs a text model. Default: on.",
    tutorial: { page: "Play-Narration", anchor: "tables-figures-and-code" },
  },
  "play.show-figures": {
    title: "Show tables and figures on screen",
    body: "Each table, figure, equation and code block the narration describes is also shown in the video while it is described: the article's own picture for a figure, a card drawn in your brand kit's title font and color for the rest. The images take turns around them, and Shorts that include one show it upright. Drawn on this computer at no cost. Needs Describe tables and figures. Default: on.",
    tutorial: { page: "Play-Outputs", anchor: "show-tables-and-figures-on-screen" },
  },
  "play.skip-code": {
    title: "Leave code out",
    body: "Drops code blocks from the narration instead of summarising each in a sentence or two. Tables, figures and equations are still described. Default: off.",
    tutorial: { page: "Play-Narration", anchor: "tables-figures-and-code" },
  },
  "play.narration-aliases": {
    title: "Narration aliases",
    body: "Says the words listed in Library → Narration aliases the way they are written there, such as Dr. as Doctor, with any generated voice. They are copied when the project starts. The article and captions keep the written words. Default: on.",
    tutorial: { page: "Narration-Aliases-and-Glossary", anchor: "use-aliases-in-a-video" },
  },

  // Speakers
  "play.speakers.format": {
    title: "Speakers format",
    body: "Narration uses one voice. Audiobook, Podcast, Radio drama and Interview give lines to several speakers, each with a voice. Several speakers need the text model to write or split the script. A new Podcast or Interview starts with the channel's hosts (cast members marked as hosts, with a voice).",
    tutorial: { page: "Multiple-Voices", anchor: "formats" },
  },
  "play.speakers.script": {
    title: "Script",
    body: "Write a script has the text model write speaker turns from a Script prompt, one Name: words paragraph each. Split the article (audiobooks) keeps the article as written and has the text model hand its narration and dialogue to the speakers, one extra call. Adapt the article (podcasts, interviews, dramas) also keeps the article as written; one extra call rewrites it as a conversation for the speakers, kept beside it as the script.",
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
    body: "Sends back-to-back turns as one multi-speaker request where the provider has one (ElevenLabs v3 with up to 10 voices, Gemini TTS with 2), so the voices react to each other. Fewer requests, same characters charged. Other providers read each turn on its own.",
    tutorial: { page: "Multiple-Voices", anchor: "run-wide-options" },
  },
  "play.speakers.audio-files": {
    title: "MP3 and M4B files",
    body: "Also saves the narration as an MP3 and an M4B audiobook file with a chapter marker at each chapter, beside the video. Made on this computer at no provider cost.",
    tutorial: { page: "Multiple-Voices", anchor: "run-wide-options" },
  },
  "play.speaker.name": {
    title: "Speaker name",
    body: "The name the script uses for this speaker's turns (Name: words) and the one captions and the speaker panel show. Up to 40 characters.",
    tutorial: { page: "Multiple-Voices", anchor: "speaker-options" },
  },
  "play.speaker.role": {
    title: "Role",
    body: "What this speaker does in the format: narrator, host, guest or character. The text model is told each speaker's role when it writes or splits the script.",
    tutorial: { page: "Multiple-Voices", anchor: "speaker-options" },
  },
  "play.speaker.pace": {
    title: "Pace",
    body: "How fast this speaker talks, from 0.8× to 1.2× of the voice's own speed. Default: Normal.",
    tutorial: { page: "Multiple-Voices", anchor: "speaker-options" },
  },

  // Images row
  "play.images.provider": {
    title: "Image service",
    body: "Who draws the images, the thumbnail and the shorts' pictures: a keyed service such as fal.ai, billed per image, or a command-line tool you are signed in to. A greyed service says why it cannot be used; fix it under Settings.",
    tutorial: { page: "Play-Images", anchor: "pick-the-image-provider-and-model" },
  },
  "play.images.model": {
    title: "Image model",
    body: "The image service's model. Models differ in quality, speed and price per image; the estimate in the right rail shows what this run costs. Settings → Models refreshes the list.",
    tutorial: { page: "Play-Images", anchor: "pick-the-image-provider-and-model" },
  },
  "play.images.effort": {
    title: "Effort",
    body: "How long an image agent, such as the Codex CLI, reasons before it draws. Higher effort can follow the prompt more closely but takes longer and uses more tokens. Model default leaves it to the provider.",
    tutorial: { page: "Play-Images", anchor: "drawing-with-the-codex-cli" },
  },
  "play.image-scale": {
    title: "More images for long videos",
    body: "Adds images as the narration gets longer, planned from the expected length when the run starts. The extra images are shared among the ticked prompts in order, up to 240 in all; each is one more image call. The line under it shows the count. Turning it on switches Motion from Zoom to Mix of both.",
    tutorial: { page: "Play-Images", anchor: "more-images-for-long-videos" },
  },
  "play.image-scenes": {
    title: "Scenes from the article",
    body: "Gives every image its own moment. The project's AI model reads the article once and writes a scene per image, from the opening to the ending in slideshow order. The scene goes where a prompt has {{Scene}}, or after its first paragraph. A thumbnail prompt with {{Scene}} gets a scene too: the article's most striking moment, a different one per thumbnail. Off, a {{Scene}} line is left out. One more AI call per run.",
    tutorial: { page: "Play-Images", anchor: "scenes-from-the-article" },
  },
  "play.image-scenes.keyword": {
    title: "Scenes on for one picture",
    body: "This picture's prompt uses {{Slopify_Scene}}, {{Slopify_Setting}} or {{Slopify_Mood}}, so it gets its own scene even with Scenes from the article off. That is one AI call per run on the project's text model, shared by every picture. To stop it, remove the keyword from the prompt.",
    tutorial: { page: "Keywords-Slopify-Fills", anchor: "per-picture" },
  },
  "play.image-scale.rate": {
    title: "Image rate",
    body: "Give the rate as one image every N minutes of narration (0.25 to 60) or as N images per hour (1 to 240); switching keeps the same rate. Narration runs about 150 words a minute. Starts at one image every 2 minutes.",
    tutorial: { page: "Play-Images", anchor: "more-images-for-long-videos" },
  },

  // Video and style row
  "play.image-seconds": {
    title: "Seconds per image",
    body: "How long each image stays on screen, 1 to 600 seconds. When cuts follow the narration, it is the target and a cut waits for a sentence end. When images run out they start again. Default: 15.",
    tutorial: { page: "Play-Video-and-Style", anchor: "timing-and-motion" },
  },
  "play.zoom": {
    title: "Zoom",
    body: "How far each image zooms in or out over its time on screen, 0 to 50 percent. 0 keeps images still. Default: 22.5 percent.",
    tutorial: { page: "Play-Video-and-Style", anchor: "timing-and-motion" },
  },
  "play.motion": {
    title: "Motion",
    body: "How each image moves while on screen: Zoom in and out, Pan across, a Mix of both by turns, or Still. A mix keeps a long video watchable. Default: Zoom in and out.",
    tutorial: { page: "Play-Video-and-Style", anchor: "timing-and-motion" },
  },
  "play.edge-silence": {
    title: "Silence at start and end",
    body: "Quiet time before the narration starts and after it ends, 0 to 30 seconds. Default: 2.",
    tutorial: { page: "Play-Video-and-Style", anchor: "timing-and-motion" },
  },
  "play.silence-gap": {
    title: "Silence between segments",
    body: "Seconds of quiet between the intro and the narration, and between the narration and the outro, 0 to 30. It only matters when an intro or outro is set. Leave it empty to use the gap set in Settings, 3 seconds unless you changed it.",
    tutorial: { page: "Play-Narration", anchor: "silence-at-the-edges-and-between-segments" },
  },

  // Outputs row
  "play.thumbnail-prompt": {
    title: "Thumbnail prompt",
    body: "The Library thumbnail prompt, keywords filled in. From my thumbnail prompt sends it to the image service as it is; Let the AI write the prompt gives it to the AI writer with the title and article to write the image prompt. Write prompts on Prompts.",
    tutorial: { page: "Play-Outputs", anchor: "thumbnail" },
  },
  "play.thumbnail-count": {
    title: "How many thumbnails",
    body: "Three makes two more thumbnails from the same prompt with different compositions, for YouTube's Test & compare. Each costs one more image, so 3 thumbnails are 3 image calls. You can remake each on its own on the project page. Default: 1.",
    tutorial: { page: "Play-Outputs", anchor: "make-three-thumbnails-for-test--compare" },
  },
  "play.description-prompt": {
    title: "Description prompt",
    body: "The Library prompt the description is written from. Built-in asks for a short summary, 5 to 12 chapters, 3 to 5 hashtags and 15 to 25 tags. Write your own description prompt on Prompts to change the tone or add links.",
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
  "play.document-theme": {
    title: "Theme",
    body: "How the PDF looks: a built-in theme or one of yours from Library → PDF themes. A theme of yours is copied into the project, so editing it later leaves this project alone until you pick it again. Edit themes opens the list.",
    tutorial: { page: "PDF-Documents", anchor: "options" },
  },

  // Channel row
  "play.channel": {
    title: "Channel",
    body: "The channel this video belongs to. Its brand kit fills what these settings leave at their default, and its cast of characters goes with the images. A draft that picks none runs in its template's channel, or the default one.",
    tutorial: { page: "Play-Overview", anchor: "channel-row" },
  },
  "play.brand-kit": {
    title: "Channel's brand kit",
    body: "Fills what these settings leave at their default from the channel: the caption font, intro, outro, PDF theme and ambient sound. What you set here wins. Turn it off to take none of it; the cast and language still apply. Default: on.",
    tutorial: { page: "Play-Overview", anchor: "channel-row" },
  },
  "play.language": {
    title: "Language",
    body: "The language the article, narration, YouTube description and shorts titles are written in. Pick a voice that speaks it. Outside English, captions are timed with a free 248 MB model, downloaded once, where one exists. In Create, blank uses the channel's language.",
    tutorial: { page: "Other-Languages", anchor: "pick-a-language-for-one-video" },
  },

  // Right rail and dialogs
  "play.template-name": {
    title: "Template name",
    body: "The name the template is listed under in Create and on Templates. The template keeps these settings; the topic you typed and any extra videos are left out, as the list below says.",
    tutorial: { page: "Play-Overview", anchor: "save-as-template" },
  },
  "play.queue": {
    title: "Video queue",
    body: "Videos started together run one at a time, in this order. Pausing a project holds the queue; when one fails or is canceled, the next one starts.",
    tutorial: { page: "Play-Overview", anchor: "the-video-queue" },
  },
} as const satisfies Readonly<Record<string, HelpEntry>>;
