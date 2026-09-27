# Roadmap to 3.0

3.0 is not a pile of new features. It is Slopify running a channel on its own, with the person
only approving. The measure for every item below: **how many manual steps does one published
video need?** Today it is dozens. The target is: approve the topic list, glance at a finished
video, press Publish in YouTube Studio.

Order: 2.5.0 ships first (reference image, Codex model choice, notifications, backups), then the
items below roughly in this order.

If only three things ship: the bundled sample project (captivating), the cast library inside
channels (consistency), and living within CLI limits (smooth forever).

## Headline items

These two came up again and again and are the first things a person notices:

- **Controls that say what they do.** Resume, Rebuild, Review, Retry stage and friends overlap
  and sit side by side. Replace them with one clear action per situation, named for its result
  ("Continue the run", "Remake 3 outdated images"), shown only when it applies, next to the thing
  it affects.
- **See it before you make it.** Picking a style (captions, font, the Look, transitions, chapter
  cards, Shorts layout) shows a real rendered preview: a few seconds of video with sample images
  and narration, not a description.

## The first five minutes

The goal: a new person is impressed before they have spent anything or waited an hour.

- **Works with what you have.** On first launch Slopify finds Claude Code, Codex and Gemini on
  the machine and says "you can make a video now, no API keys needed". Keys are optional extras.
- **A finished example is already there.** A bundled sample project (video, shorts, article,
  PDF) to play and poke at, including the editing tools, before generating anything.
- **The first thing you make is a short.** "Type a topic, get a 60-second short in about five
  minutes." The long video comes second, once they're hooked.
- **Watching it build is part of the show.** A live view: the article writing itself, images
  appearing one by one, the narration waveform growing as it speaks.
- **Starter packs by niche.** Sleep lore, true crime, history, science explainers: each a ready
  template, prompts, voice, style and art direction. Pick one, type a topic, go.

## 1. Automatic reviews

A reviewer model checks each stage before the run moves on, and sends the work back with its
reasons when it fails. The CLI providers (Claude Code, Codex) are the default reviewers: they are
vision-capable and cost nothing per call on a subscription.

- **Article**: follows the prompt's rules (length, structure, tone), no invented lore, no
  repeated sections.
- **Images**: no malformed hands, no stray text or letters, matches the brief, and matches the
  reference image (same character, palette, style).
- **Narration**: nothing missing or garbled compared with the article (word timing already
  finds omissions; the reviewer decides what matters).
- **Thumbnail and Shorts**: readable at phone size, the subject is clear.

Rules:
- A retry limit per item (default 2); after that the item is kept and flagged, never looped.
- Every verdict is saved with its reason and shown beside the item, so a person can overrule it.
- Built on the existing checkpoints: a review is a checkpoint that a model answers.
- Off, "flag only" or "flag and redo", per stage, in the template.

## 2. Schedules that find their own topics

When a schedule's queue runs empty, it can ask an LLM for the next topics instead of stopping.

- A **series brief** on the schedule: what the channel covers, the style, what "view-worthy"
  means ("D&D lore, documentary, famous villains and places first").
- Never repeats: the prompt includes every title Slopify has made or queued for that schedule,
  and results are checked against them (including near-duplicates).
- Two modes: queue them directly, or hold them for approval (a notification says "5 new topics
  are waiting for you").
- Topics can be refilled early, e.g. keep at least 10 queued.
- Every keyword per topic, not just one: each queued topic can set any keyword that isn't
  fixed for the schedule, entered one per line, as a table, or pasted as YAML/JSON.

## 3. YouTube Studio prep in one click

No Data API upload (unverified apps are locked to private). Instead, fill in Studio in the
person's own browser.

- A small browser extension. **Prepare upload** on a finished video opens Studio's upload page;
  after the person drops the video in, the extension fills the title, description with chapters,
  tags, thumbnail, audience ("not made for kids"), and playlist from Slopify.
- The person presses Publish. Slopify never publishes.
- Shorts get the same, one per short.
- Studio changes its page from time to time, so the filler is kept small, tested against a
  saved copy of the page, and fails loudly ("Couldn't find the Tags field — fill it by hand;
  the text is copied") instead of half-filling.
- An **upload pack** fallback without the extension: files plus every text, each with a Copy
  button, in the order Studio asks for them.

## 4. Smoothness of the flow

Everything that made a run harder than it should be. Each is small; together they are the point
of 3.0.

**Play**
- One path from topic to queue: pick a template, type the topic, Start. Everything else is
  folded away unless it needs attention.
- The review is always current (2.5.0 fixed the grey button); Start explains itself when it
  can't start.
- Keywords behave the same everywhere: in the title, prompts, templates and schedules, with one
  list of what each keyword feeds.
- Saving a template never stores one-off values (the topic you typed), only the settings.
- Everything that can be set in Edit project can be set in Play, and the other way round.

**While a run is going**
- A home screen: what is running and its step, what is coming up (schedules), what needs you,
  and what is ready to upload.
- Honest progress and time left for every stage, including CLI image jobs that take minutes.
- Notifications for finished, failed and waiting (2.5.0), and for reviews that need a decision.

**When something goes wrong**
- Every failure says what failed, why, and the one button that fixes it, on the step itself.
- Retries that don't need a person: rate limits, timeouts and a CLI that dropped are retried
  on their own with backoff, and only reported when they keep failing.
- A failed step never blocks unrelated steps (a thumbnail failure doesn't stop the video).

**Setup**
- First run: a guided setup that ends with a real short test video, not a settings page.
- Health check on the providers page: each CLI signed in, each key valid, the model reachable.
- Updating Slopify waits for running work by itself and says when it will update.
- Files in Documents: new installs keep projects, backups and exports in the system's own
  Documents folder under Slopify (Windows known folder incl. OneDrive, macOS ~/Documents, Linux
  xdg-user-dir), with "Move to Documents/Slopify" and "Choose another folder" for existing installs.
- "Start Slopify when I log in": one switch (Settings and the first-run screen, offered by the
  installer too) using each system's per-user login mechanism, no admin rights or systemctl:
  Windows Startup/Run entry, macOS LaunchAgent, Linux XDG autostart; Docker installs check that
  Docker itself starts at login and say where to turn that on.

## 5. A real design, not a pile of screens

The app works, but it doesn't look or feel designed. 3.0 gets one visual language, applied
everywhere, before any new screen is added.

**One theme**
- A defined identity: palette, type scale, spacing scale, radii, elevation, motion. Written down
  once (tokens + a short style guide) and used by every screen and by slopify.stream, so the app
  and the site look like the same product.

**Buttons mean one thing each**
- A small, fixed set: primary (one per area), secondary, quiet, destructive, icon. Same look =
  same kind of action, everywhere.
- Actions are buttons, links go somewhere. No actions disguised as plain text, no links dressed
  as buttons.
- Actions sit in the same place on every screen (e.g. top right of a section), in the same
  order.

**Use the screen**
- No card inside a card. Sections are separated by space and headings, not nested borders.
- Layouts use the full width on a desktop: two or three columns where content allows (settings
  beside preview, list beside detail), so the common tasks need little or no scrolling.
- Everything sits on one grid; labels, fields and buttons line up.

**Every control explains itself**
- An info button with a short popup on every setting, option and non-obvious action: what it
  does, when to change it, the default, and what it costs or slows. All help text lives in one
  catalogue; a test fails when a control on the main screens has none.

**Media looks like media**
- Images and videos get proper frames: consistent aspect boxes, rounded corners, a caption
  line, hover actions, a lightbox for full size, a real player for video with the poster.
- Galleries (images, shorts, thumbnails) use one grid component.

**Fewer clicks**
- Every common task is counted in clicks, and the count goes down: queue a video, regenerate
  an image, copy the description, edit a prompt, change a schedule's topics.
- Library actions (edit, duplicate, delete, use in Play) are visible on each row, not hidden
  in menus.
- Inline editing where it is safe; menus only for the rare actions.
- Keyboard shortcuts for the frequent ones.

**Installing and updating**
- Replace the layered Docker scripts with one clean setup: a single image, one compose file,
  one install command, one update command, with the host CLI bridge designed in rather than
  glued on. Same for the native install.

How it is done: an audit screen by screen against these rules (with screenshots before and
after), then fixes, with the kit components enforcing the rules so new screens can't drift.

## 6. Every day after that

- **Channels as the main object.** Brand kit (fonts, colours, intro/outro, end screen), a cast
  library (reference images per character and place, used automatically when a topic mentions
  them, so a character looks the same in video 1 and video 40), the series brief, templates and
  schedule, all in one place. Builds on the establishing image.
- **A calendar.** The coming weeks of uploads on one screen: drag to reorder topics, see what is
  ready and what needs you. Replaces separate schedule, queue and batch screens; a batch is just
  "put these on the calendar".
- **Living within CLI limits.** Slopify knows when Codex or Claude limits reset, pauses when they
  run out and continues when they return: "Waiting for Codex limits (resets at 14:00)", never a
  failure.
- **Ctrl+K for everything.** A command palette: "tiamat regenerate image 3", "new video",
  "schedule". The fastest path is typing.
- **Three thumbnails per video,** for YouTube's Test & Compare; Studio prep uploads all three.
- **Fix-it buttons.** Every known failure (CLI signed out, disk full, a prompt refused by a
  filter) comes with a button that fixes it or walks through it.
- **Storage that looks after itself.** Finished projects offer to drop their working files and
  keep the outputs, showing how much space it frees.
- **Prompt history.** Each Library prompt keeps its versions, with a side-by-side diff and "used
  by these 12 videos".

## 7. Knowing what a run cost, and keeping providers current

- **Step-by-step key setup.** For every provider that needs an API key: where to sign up, which
  page makes the key, which permissions or billing it needs, and a Test button, shown right where
  the key is pasted.
- **Honest cost estimate before, and the real cost after.** The estimate before Start, and a
  Run cost panel at the end of every project showing what it actually cost, per stage.
- **CLI runs are counted too.** For Claude Code, Codex and Gemini: which models were used, how
  much of the weekly (and 5-hour) limit the run took, and what the same work would have cost
  through the API.
- **Usage end to end.** Next to the cost: tokens in and out per model, narration characters,
  images per model, video/animation seconds, and time per stage.
- **Providers and models always up to date.** Model lists, prices and capabilities refresh on
  their own from the providers and the published catalogue; new models appear, retired ones are
  flagged with a one-click switch on templates and schedules that use them.

## 8. Reading and editing what was made

- **Text that is pleasant to read.** Article, sources, research and narration text in Projects
  shown as a proper reading view (typography, headings, table of contents, width that suits
  reading), with copy and search, not a raw box.
- **Hand-editable description and tags.** The YouTube description, chapters, hashtags and tags
  can be edited by hand and survive regeneration where they were changed. Placeholders such as
  `{{Patreon}}` or `{{Previous video}}` fill from saved channel links.

## 9. Multiple voices

Scripts with several speakers, for all four formats: audiobook (narrator plus character voices
for dialogue), podcast (two hosts, optional guest), radio drama (narrator plus a full cast) and
interview/debate.

- **A script, not an article.** A "script" prompt kind writes speaker turns; for audiobooks the
  LLM can instead attribute the dialogue of an existing text to speakers.
- **Speakers are cast.** Each speaker has a voice (provider + voice), pace and pronunciations,
  stored on the cast entry, so a character sounds the same in every episode; a channel's hosts
  are recurring cast.
- **Narration per turn** in that speaker's voice with natural gaps; native multi-speaker models
  (ElevenLabs dialogue, Gemini two-speaker) used where they exist.
- **Voice auditions** before a run: each speaker reads one of their own lines; swap cheaply.
- **Speaker-aware video.** Podcasts: speaker portraits from the cast, the active speaker lit,
  name labels, captions coloured per speaker. Audiobooks and drama: the image flow, with speaker
  tags on dialogue captions. Word timing and captions follow speaker changes.
- **Audio files.** MP3 and M4B with chapter markers, beside the YouTube video. Books are a series
  of chapter projects sharing cast and voices. Nothing is published automatically.

## 9b. Other languages

A project can be made in another language end to end.

- A language picker in Play, Edit project, templates and channels.
- Article, narration prep, description, tags and Shorts titles written in that language; the
  pronunciation glossary accepts that language's phonemes; voices filtered to ones that speak it.
- Word timing: English keeps today's model and fingerprints; other languages use a permissively
  licensed multilingual CTC model (see [multilingual-timing.md](multilingual-timing.md)),
  downloaded on first use, with per-language text normalisation and number spelling. Languages
  it can't align fall back to sentence-level subtitles with a plain explanation.
- Caption fonts that cover the language's script.

## 9c. Channel essentials

- **YouTube's AI disclosure.** Studio prep (pack and extension) sets "altered or synthetic
  content" correctly for every video and Short, with the answer shown in the upload pack.
- **Ambient sound under long videos.** An optional bed (rain, fire, wind, or your own file)
  under the whole narration, ducked under the voice, with a fade-out tail after the narration
  ends; per template and channel.
- **Episode memory.** Each finished episode leaves a short summary on its channel; the article
  prompt of a new episode gets the summaries of related episodes (shared cast, topic overlap)
  so episodes don't contradict each other and can refer back naturally.
- **Existing uploads count.** Paste or import the channel's existing video titles once; topic
  suggestions and duplicate checks skip them too.
- **More images for long videos.** An images-per-hour setting (or "every N minutes") that
  scales the image count with the narration length, with pan/zoom variety so long videos stay
  watchable.
- **A trash bin.** Deleted projects, prompts, templates and schedules stay recoverable for 30
  days before they are removed for good.
- **"What's new in 3.0".** A short in-app tour on the first launch after updating; the existing
  tutorial updated for the new screens.
- **Backups carry everything new:** prompt history, channels, cast pictures, narration aliases.
- **Chapters follow YouTube's rules:** first at 0:00, at least three, each at least 10 s, checked
  and fixed before the description is shown.

## 10. Being picked up by others

For career and donations, not growth at any cost.

- The site's walkthrough video is current, recorded by a script so it stays current.
- A polished first ten minutes (the guided setup above).
- A donation link on the site, the README and in Settings → About.
- A short "how I run my channel with it" page.

## Not in 3.0

- YouTube API through the user's own Google project (upload prep after a manual upload, real analytics and revenue in Slopify): after 3.0.

- Thumbnail titles typeset by Slopify over the model's art (later).
- Approving from a phone over the home network (later).

- YouTube Data API upload (see above).
- A timeline editor for moving images by hand; worth its own release later.
- Performance analytics feeding topic choice (it pulls toward YouTube's APIs again); maybe later
  as an import of a CSV exported from Studio.
