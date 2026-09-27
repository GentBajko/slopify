import type { HelpEntry } from "../entry.js";

// Play's setup, top to bottom, and the pieces Edit project draws with the same components
// (speakers, shorts, reviews, the establishing image, the language). Settings → Voices'
// table is here too, as it lives in the same voice components.
export const playHelp = {
  // Top of Play
  "play.template": {
    title: "Template",
    body: "Starts this video from a saved setup: prompts, voice, images, style, outputs and reviews. Picking one opens a fresh draft made from it and carries the topic you typed. No template starts from the default setup. Save a setup you like with Save as template in the right rail.",
  },
  "play.title": {
    title: "Title",
    body: "The video's name, shown on the project and in Projects. Write a keyword in double braces, like {{Topic}}, and the title becomes a pattern: you type the topic per video, and Add topic queues more videos from the same setup. Up to 200 characters.",
  },
  "play.title-pattern": {
    title: "Title pattern",
    body: "The title with its keywords in double braces, like D&D Lore: {{Topic}}. Each keyword in it is a topic you type at the top of Play, once per video, and templates save it empty. Change the pattern here; the topic values stay at the top.",
  },
  "play.topic": {
    title: "Topic",
    body: "What this video is about. The title names this keyword, so its value fills the title and every prompt that names it. Each video from this setup gets its own value, and a template leaves it empty. Up to 200 characters.",
  },
  "play.keyword": {
    title: "Keyword",
    body: "A value a picked prompt or the title asks for with {{name}}. You type it once and it fills every place that names it; the line under it lists where. Up to 200 characters. A keyword the title does not name is saved with a template.",
  },
  "play.more-videos": {
    title: "More videos from the same setup",
    body: "Add topic queues another video with everything else the same: only its title and keywords differ. Press a chip to change that video's keywords. Start queues all of them, and they run one at a time. One Start queues at most 50 videos.",
  },
  "play.drafts": {
    title: "Drafts",
    body: "Play saves every change to this draft on its own; nothing starts until you press the Play key. Drafts lists your saved setups to open again or discard. New draft starts an empty one and keeps this one in the list.",
  },
  "play.draft-conflict": {
    title: "Changed elsewhere",
    body: "This draft was saved from another tab or window since you opened it. Reload saved draft shows that version and drops your unsaved change. Save as a new draft keeps your version as a separate draft and leaves the other one alone.",
  },

  // Sources, one switch per stage
  "play.source.research": {
    title: "Research source",
    body: "Generate has the text model plan chapters, research each one on the web and combine the notes before the article is written: one call to plan, one per chapter and one to combine. Provide uses notes you paste. Off, the default, writes from the prompt alone.",
  },
  "play.source.article": {
    title: "Article source",
    body: "Generate has the text model write the article from the article prompt, one call. Provide narrates text you paste, word for word, with no text-model cost. The article is what the narration reads and the PDF lays out. Default: Generate.",
  },
  "play.source.audio": {
    title: "Narration source",
    body: "Generate reads the article aloud with a text-to-speech voice, charged by the provider per character. Provide uses an audio file you upload, as it is. Off makes a silent video with no captions, YouTube description or shorts. Default: Generate.",
  },
  "play.source.images": {
    title: "Images source",
    body: "Generate draws images from the ticked image prompts, one image-model call each. Provide uses your own PNG, JPEG or WebP files in the order you pick them. Off turns off the video too. Default: Generate.",
  },
  "play.source.thumbnail": {
    title: "Thumbnail source",
    body: "From prompt draws the thumbnail straight from the thumbnail prompt, one image call. Prompt by LLM first has the text model write the image prompt from yours, the title and the article, then draws it. Provide uses your own image. Default: Off.",
  },
  "play.source.video": {
    title: "Video source",
    body: "Generate renders the slideshow video on this computer from the images and narration; it costs no provider money, only time. Off leaves each finished stage to download on its own. It needs images, so it is Off while Images is Off. Default: Generate.",
  },
  "play.source.document": {
    title: "Document source",
    body: "Generate lays out a PDF of the article and title on this computer, in the theme you pick. It needs no provider and costs nothing. Default: Off.",
  },

  // Article row
  "play.article-prompt": {
    title: "Article prompt",
    body: "The Library prompt the text model is sent to write the article, with its keywords filled in. A Script prompt, used when several speakers read, asks for speaker turns instead. Write or change prompts on Prompts; View prompt shows the text.",
  },
  "play.provided.article": {
    title: "Article text",
    body: "The article you paste is narrated word for word, and no text model writes one. Include everything that should be read, headings too. The count under it helps you judge the length: about 150 words is one minute of narration.",
  },
  "play.provided.research": {
    title: "Research notes",
    body: "Notes you paste are given to the text model with the article prompt, in place of web research. Paste facts, sources and quotes the article should draw on. Nothing is looked up.",
  },
  "play.text-generation": {
    title: "Text generation",
    body: "One text model writes everything this run needs in words: the article, research, the thumbnail's image prompt, entries set to LLM, Narration Preparation, the YouTube description and picking shorts. Each is a separate call, counted in usage. Set the default under Settings.",
  },
  "play.llm.provider": {
    title: "LLM",
    body: "Who runs the text model: a command-line tool you are signed in to, such as Claude Code or Codex, or a keyed service such as OpenRouter, billed per token. A greyed provider says why it cannot be used; fix it under Settings.",
  },
  "play.llm.model": {
    title: "Text model",
    body: "The model the provider runs for every text step. Bigger models write better and cost more per token. Refresh asks the provider for its current list; Custom ID lets you type a model the list does not show.",
  },
  "play.llm.thinking": {
    title: "Thinking",
    body: "How long the model reasons before it answers, for models that offer it. Higher levels can write more carefully but take longer and use more tokens. Model default leaves it to the provider.",
  },

  // Narration row
  "play.tts.provider": {
    title: "TTS",
    body: "The text-to-speech service that reads the narration, charged by the provider per character of text. A greyed provider says why it cannot be used; add its key under Settings. Changing it clears the model and voice.",
  },
  "play.tts.model": {
    title: "TTS model",
    body: "The provider's speech model. Models differ in quality, languages, speed and price per character. Some features need a particular model: Narration Preparation needs Inworld TTS-2. Refresh asks the provider for its current list.",
  },
  "play.voice": {
    title: "Voice",
    body: "Who reads the narration. The list holds the voices you added under Settings → Voices for this provider, filtered to the project's language. With several speakers, this voice reads the intro and outro.",
  },
  "play.show-all-voices": {
    title: "Show all voices",
    body: "The voice list hides voices listed for other languages than the project's. Tick this to pick one anyway, for example a multilingual voice whose languages are listed wrong. A voice with unknown languages is always shown.",
  },
  "play.intro": {
    title: "Intro",
    body: "A Library entry read before the article. A text entry is read as written; an LLM entry is written by the text model for each video, one extra call. Off reads no intro. Write entries in Library → Entries.",
  },
  "play.outro": {
    title: "Outro",
    body: "A Library entry read after the article, such as a sign-off. A text entry is read as written; an LLM entry is written by the text model for each video, one extra call. Off reads no outro.",
  },
  "play.chunking": {
    title: "Chunking",
    body: "How the narration is split into text-to-speech requests. Whole sends it in one request; Paragraph sends one per paragraph; Every N words or characters ends each at a sentence end. Split when a provider refuses long text. Default: Whole. It changes the number of requests, not the characters charged.",
  },
  "play.chunking.count": {
    title: "Chunk size",
    body: "How long each text-to-speech request may be. Each request ends at the last whole sentence that fits, so a single longer sentence stays whole. Defaults: 500 words or 3000 characters, spaces included.",
  },
  "play.narration-preparation": {
    title: "Narration Preparation",
    body: "Has the text model add delivery directions and sounds, such as a sigh or a laugh, following the Library narration prompt you pick. One text-model call per narration chunk and per entry. Needs Inworld TTS-2. The article and captions stay unchanged. Default: Off.",
  },
  "play.pronunciation-glossary": {
    title: "Pronunciation Glossary",
    body: "Reads names with the IPA in the article's Pronunciation Glossary, such as Arda: /ˈɑɹdə/, with no extra text-model call. In your article prompt, ask for a glossary in slash-delimited standard-English IPA (Term: /IPA/), with an English approximation for foreign names; a line with sounds English lacks is read as plain text. Works with Inworld TTS-2 and TTS-2 Flash. The written text stays unchanged. Default: on.",
  },
  "play.share-glossary": {
    title: "Pronunciations from other projects",
    body: "Adds every term from your other projects' glossaries, copied when this project starts. This project's own glossary wins where they differ. Turn it off to use only this article's glossary. Default: on.",
  },
  "play.describe-figures": {
    title: "Describe tables and figures",
    body: "Instead of skipping tables, pictures, equations and code or reading them cell by cell, the text model writes a short spoken passage for each (a table's pattern, what a figure or equation means, what code does) and the narration says it in its place. One extra text-model call per block, in the estimate, kept for reuse. The article and PDF keep the real table; captions show what is said. Needs a text model. Default: on.",
  },
  "play.skip-code": {
    title: "Leave code out",
    body: "Drops code blocks from the narration instead of summarising each in a sentence or two. Tables, figures and equations are still described. Default: off.",
  },
  "play.narration-aliases": {
    title: "Narration aliases",
    body: "Says the words listed in Library → Aliases the way they are written there, such as Dr. as Doctor, with any generated voice. They are copied when the project starts. The article and captions keep the written words. Default: on.",
  },

  // Speakers
  "play.speakers.format": {
    title: "Speakers format",
    body: "Narration uses one voice. Audiobook, Podcast, Radio drama and Interview give lines to several speakers, each with a voice. Several speakers need the text model to write or split the script.",
  },
  "play.speakers.script": {
    title: "Script",
    body: "Write a script has the text model write speaker turns from a Script prompt, one Name: words paragraph each. Split the article keeps the article as written and has the text model hand its narration and dialogue to the speakers, one extra call.",
  },
  "play.speakers.add-from-cast": {
    title: "Add from the cast",
    body: "Adds a member of this channel's cast as a speaker, with their name and voice. Only members with a voice are listed. Edit the cast on the channel's page.",
  },
  "play.speakers.turn-gap": {
    title: "Gap between turns",
    body: "The pause between one speaker's turn and the next, from 0 to 1.2 seconds. Longer feels calmer; shorter feels like a lively talk. Default: 0.35 s.",
  },
  "play.speakers.name-tags": {
    title: "Speaker names on captions",
    body: "Puts the speaker's name before their captions, like Ada: and their words, so viewers know who is talking. On by default for a podcast or interview.",
  },
  "play.speakers.native-dialogue": {
    title: "One request for consecutive turns",
    body: "Sends back-to-back turns as one multi-speaker request where the provider has one (ElevenLabs v3), so the voices react to each other. Fewer requests, same characters charged. Other providers read each turn on its own.",
  },
  "play.speakers.audio-files": {
    title: "MP3 and M4B files",
    body: "Also saves the narration as an MP3 and an M4B audiobook file with a chapter marker at each chapter, beside the video. Made on this computer at no provider cost.",
  },
  "play.speaker.name": {
    title: "Speaker name",
    body: "The name the script uses for this speaker's turns (Name: words) and the one captions and the speaker panel show. Up to 40 characters.",
  },
  "play.speaker.role": {
    title: "Role",
    body: "What this speaker does in the format: narrator, host, guest or character. The text model is told each speaker's role when it writes or splits the script.",
  },
  "play.speaker.provider": {
    title: "Voice provider",
    body: "The text-to-speech service for this speaker, charged per character of their lines. Speakers may use different providers. Changing it clears the model and voice.",
  },
  "play.speaker.model": {
    title: "Voice model",
    body: "The provider's speech model for this speaker. Models differ in quality, languages and price per character. Pronunciations need an Inworld TTS-2 model.",
  },
  "play.speaker.voice": {
    title: "Speaker voice",
    body: "This speaker's voice, from the voices you added under Settings → Voices for their provider, filtered to the project's language. Press Audition to hear it read their first line.",
  },
  "play.speaker.pace": {
    title: "Pace",
    body: "How fast this speaker talks, from 0.8× to 1.2× of the voice's own speed. Default: Normal.",
  },
  "play.speaker.pronunciations": {
    title: "Speaker pronunciations",
    body: "One Term: /IPA/ per line, like the article's Pronunciation Glossary, for this speaker only. Used on Inworld TTS-2 voices, ahead of the glossary. A line with sounds the language does not use is skipped and read as ordinary text.",
  },
  "play.speaker.audition": {
    title: "Audition",
    body: "Speaks this speaker's first line in their voice so you can hear it before the run. It is one real text-to-speech request, charged by the provider at about the price shown on the button.",
  },

  // Images row
  "play.images.provider": {
    title: "Image provider",
    body: "Who draws the images, the thumbnail and the shorts' pictures: a keyed service such as fal.ai, billed per image, or a command-line tool you are signed in to. A greyed provider says why it cannot be used; fix it under Settings.",
  },
  "play.images.model": {
    title: "Image model",
    body: "The provider's image model. Models differ in quality, speed and price per image; the estimate in the right rail shows what this run costs. Refresh asks the provider for its current list.",
  },
  "play.images.effort": {
    title: "Effort",
    body: "How long an image agent, such as the Codex CLI, reasons before it draws. Higher effort can follow the prompt more closely but takes longer and uses more tokens. Model default leaves it to the provider.",
  },
  "play.image-prompts": {
    title: "Image prompts",
    body: "Tick the Library prompts that draw the video's images, and give each a number: how many images it makes, 1 to 20. A run makes at most 60 this way. Each image is one image-model call. The images play in the order you ticked the prompts.",
  },
  "play.reference": {
    title: "Establishing image",
    body: "Made first and never shown in the video. Every other image, the shorts' and, if ticked, the thumbnail is drawn with it as a reference, so characters, style and palette stay the same. From a prompt costs one more image; Upload uses yours. Changing it marks those images outdated. Default: Off.",
  },
  "play.reference.prompt": {
    title: "Establishing prompt",
    body: "The Library image prompt that draws the establishing image, its keywords filled like the others. Describe the characters, setting and style every other image should share.",
  },
  "play.reference.thumbnail": {
    title: "Thumbnail from the establishing image",
    body: "Draws the thumbnail with the establishing image as a reference too, so it matches the video. Untick it for a thumbnail drawn on its own. Default: on.",
  },
  "play.image-scale": {
    title: "More images for long videos",
    body: "Adds images as the narration gets longer, planned from the expected length when the run starts. The extra images are shared among the ticked prompts in order, up to 240 in all; each is one more image call. The line under it shows the count. Turning it on switches Motion from Zoom to Mix of both.",
  },
  "play.image-scale.rate": {
    title: "Image rate",
    body: "Give the rate as one image every N minutes of narration (0.25 to 60) or as N images per hour (1 to 240); switching keeps the same rate. Narration runs about 150 words a minute. Starts at one image every 2 minutes.",
  },

  // Video and style row
  "play.image-seconds": {
    title: "Seconds per image",
    body: "How long each image stays on screen, 1 to 600 seconds. When cuts follow the narration, it is the target and a cut waits for a sentence end. When images run out they start again. Default: 15.",
  },
  "play.zoom": {
    title: "Zoom",
    body: "How far each image zooms in or out over its time on screen, 0 to 50 percent. 0 keeps images still. Default: 22.5 percent.",
  },
  "play.motion": {
    title: "Motion",
    body: "How each image moves while on screen: Zoom in and out, Pan across, a Mix of both by turns, or Still. A mix keeps a long video watchable. Default: Zoom in and out.",
  },
  "play.edge-silence": {
    title: "Silence at start and end",
    body: "Quiet time before the narration starts and after it ends, 0 to 30 seconds. Default: 2.",
  },
  "play.silence-gap": {
    title: "Silence between segments",
    body: "Seconds of quiet between the intro and the narration, and between the narration and the outro, 0 to 30. It only matters when an intro or outro is set. Leave it empty to use the gap set in Settings, 3 seconds unless you changed it.",
  },
  "play.format": {
    title: "Frame format",
    body: "16:9 is a landscape video for YouTube and screens. 9:16 is a portrait video for phones. Images are drawn in this shape and captions are placed for it. Default: 16:9.",
  },
  "play.preview-text": {
    title: "Preview text",
    body: "The sample sentence the style preview shows in your caption font, size and position. It is only for the preview and never reaches the video; real captions come from the narration.",
  },

  // Outputs row
  "play.thumbnail-prompt": {
    title: "Thumbnail prompt",
    body: "The Library thumbnail prompt, keywords filled in. From prompt sends it to the image model as it is; Prompt by LLM gives it to the text model with the title and article to write the image prompt. Write prompts on Prompts.",
  },
  "play.thumbnail-count": {
    title: "Thumbnails",
    body: "Three makes two more thumbnails from the same prompt with different compositions, for YouTube's Test & compare. Each costs one more image, so 3 thumbnails are 3 image calls. You can remake each on its own on the project page. Default: 1.",
  },
  "play.youtube-description": {
    title: "YouTube description",
    body: "After subtitle timing, the text model writes a description with chapters at the narration's real times, hashtags at the end, and a separate list of tags, ready to copy. One text-model call. It runs beside the render. Needs narration. Default: off.",
  },
  "play.description-prompt": {
    title: "Description prompt",
    body: "The Library prompt the description is written from. Built-in asks for a short summary, 5 to 12 chapters, 3 to 5 hashtags and 15 to 25 tags. Write your own description prompt on Prompts to change the tone or add links.",
  },
  "play.shorts": {
    title: "Shorts",
    body: "After subtitle timing, the text model picks the best self-contained moments of the narration. Each becomes a vertical 1080×1920 clip with new images, big word-by-word captions and its own title, description and hashtags. It runs beside the render; its images are charged like any other. Needs narration. Default: off.",
  },
  "play.shorts.count": {
    title: "How many shorts",
    body: "How many shorts to cut from this video, 1 to 10. Each needs its own new images, so more shorts cost more image calls and render time. Default: 3.",
  },
  "play.shorts.length": {
    title: "Short length",
    body: "The shortest and longest a short may run, in seconds, between 15 and 180. The text model picks moments within these bounds. Default: 60 to 120.",
  },
  "play.shorts.prompt": {
    title: "Shorts prompt",
    body: "The Library prompt the text model follows to pick the moments and write each short's title, description and hashtags. Built-in picks moments that make sense alone and open on a hook.",
  },
  "play.shorts.image-style": {
    title: "Image style",
    body: "The Library image prompt the shorts' new vertical images are drawn from. Built-in draws cinematic, uncluttered images with the subject centred. Pick one of your image prompts to match the long video.",
  },
  "play.shorts.title-on-screen": {
    title: "Title on screen",
    body: "Keeps the short's title at the top for the whole clip, large and bold in the caption font, below where the apps draw their own buttons. Default: on.",
  },
  "play.shorts.speed": {
    title: "Speed",
    body: "Plays each short faster than the narration, 1.00× to 1.25× in steps of 0.05, with the pitch kept. A little faster suits short-form viewers. Default: 1.00×.",
  },
  "play.shorts.music-volume": {
    title: "Music volume",
    body: "How loud the background music plays under every short, 0 to 100 percent; it dips while the narrator speaks. Only used when you add a music file below. Default: 15.",
  },
  "play.shorts.full-video-link": {
    title: "Full video link",
    body: "Each short's description ends with a line pointing to the full video. Paste the video's link here; without it the line says [PASTE THE FULL VIDEO LINK HERE] for you to fill in.",
  },
  "play.document-theme": {
    title: "Theme",
    body: "How the PDF looks: a built-in theme or one of yours from Library → Documents. A theme of yours is copied into the project, so editing it later leaves this project alone until you pick it again. Edit themes opens the list.",
  },

  // Reviews panel
  "play.checkpoints": {
    title: "Review checkpoints",
    body: "Holds the run before a step so you can check and edit what came before it. Steps that do not depend on it carry on. Approve each checkpoint on the project page to continue. A step must be generated to have a checkpoint.",
  },
  "play.reviews": {
    title: "Automatic reviews",
    body: "A reviewer model checks each finished item and saves its verdict and reasons on the project page. Flag only marks a failed item; Flag and redo makes it again, up to the redos per item, then keeps and flags it. Each review is a text-model call, counted in usage. Default: Off.",
  },
  "play.reviews.provider": {
    title: "Reviewer",
    body: "Who runs the review model. Picture reviews, for images, the thumbnail and shorts, need Claude Code or Codex, which can look at images; other providers review text only.",
  },
  "play.reviews.model": {
    title: "Reviewer model",
    body: "The model that judges each item. A stronger model catches more but costs more per review. It can differ from the model that wrote the text.",
  },
  "play.reviews.retries": {
    title: "Redos per item",
    body: "How many times Flag and redo makes a failed item again before it keeps the last one and flags it, 0 to 5. Each redo costs the item again plus one more review. Default: 2.",
  },

  // Channel row
  "play.channel": {
    title: "Channel",
    body: "The channel this video belongs to. Its brand kit fills what this setup leaves at its default, and its cast of characters goes with the images. A draft that picks none runs in its template's channel, or the default one.",
  },
  "play.brand-kit": {
    title: "Channel's brand kit",
    body: "Fills what this setup leaves at its default from the channel: the caption font, intro, outro, document theme and ambient sound. What you set here wins. Turn it off to take none of it; the cast and language still apply. Default: on.",
  },
  "play.language": {
    title: "Language",
    body: "The language the article, narration, YouTube description and shorts titles are written in. Pick a voice that speaks it. Outside English, captions are timed with a free 248 MB model, downloaded once, where one exists. On Play, blank uses the channel's language.",
  },

  // Right rail and dialogs
  "play.estimate": {
    title: "Estimated cost",
    body: "What the providers are likely to charge for this run, in US dollars, from their published prices. Actual usage can differ, and the estimate does not cap spending.",
  },
  "play.expected-words": {
    title: "Expected article words",
    body: "How long you expect each generated article to be. It drives the cost estimate and how many images More images for long videos adds; the article's real length is used once it is written. About 150 words is one minute. Default: 1500.",
  },
  "play.refresh-review": {
    title: "Refresh review",
    body: "Asks the server to check the setup again and recalculate the estimate now, instead of waiting for you to pause typing. Use it after changing a prompt in the Library.",
  },
  "play.template-name": {
    title: "Template name",
    body: "The name the template is listed under on Play and Templates. The template keeps this setup's settings; the topic you typed and any extra videos are left out, as the list below says.",
  },
  "play.queue": {
    title: "Video queue",
    body: "Videos started together run one at a time, in this order. Pausing a project holds the queue; when one fails or is cancelled, the next one starts.",
  },

  // Settings → Voices
  "play.voices.name": {
    title: "Voice name",
    body: "The name you pick this voice by on Play and in Edit project. Only you see it.",
  },
  "play.voices.provider": {
    title: "Voice provider",
    body: "The text-to-speech service the voice ID belongs to. Only providers set up under Settings are listed.",
  },
  "play.voices.voice-id": {
    title: "Voice ID",
    body: "The provider's own id for the voice, copied from its voice library. It is not checked now; a wrong id fails when a run's narration uses it.",
  },
  "play.voices.languages": {
    title: "Voice languages",
    body: "The languages the voice speaks, as codes such as es, de. Play lists the voice only for projects in these languages. Blank asks the provider when it can say; a voice with unknown languages is offered for every language.",
  },
  "play.voices.real-person": {
    title: "Real person",
    body: "Turn this on for a voice cloned from, or made to sound like, a real person. Prepare upload then answers Yes to YouTube's AI use question for videos it narrates. An AI voice that imitates no one stays off.",
  },
} as const satisfies Readonly<Record<string, HelpEntry>>;
