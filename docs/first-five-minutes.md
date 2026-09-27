# The first five minutes

What a new install shows before anything is spent.

## First-run screen (`/welcome`)

Home opens it on a fresh install (`GET /api/onboarding` answers `show: true`). It is a guided
sequence of three steps (kit Tabs, with Back and Next in the action bar) that ends with a real
short being made:

1. **What you have**: the agent CLIs Slopify found (from the same provider statuses Settings
   shows) and who will narrate: a voice provider with a saved key, else the computer's built-in
   voice ("Narration uses your computer's built-in voice; add an ElevenLabs or OpenAI key later
   for a better one"). When nothing can narrate it says why, with **Add a voice key** (Settings →
   Providers) and **Check again** right there.
2. **Pick a style**: General or a starter pack (**Use this style**); **Add to library** installs
   a pack's prompts and Play template.
3. **Make your first short**: a topic and **Make a 60-second short**, with the same inline voice
   choice when needed. Once it starts, **Watch it being made** opens the project's live view;
   the samples ("Explore the sample", "See an audiobook", "Hear a podcast") and the one-time
   "Start Slopify when I log in" offer ([start-at-login.md](start-at-login.md)) sit below as
   extras.

Skip (`POST /api/onboarding/dismiss`) hides it for good; so does the first real project
(anything but the samples), even if that project is deleted later. Reading the screen's state
writes nothing: a real project made before the screen was recorded as done comes back as
`settle: true`, and Home records it with the same `POST /api/onboarding/dismiss`. Making the
short records it too.

## Make a 60-second short

`POST /api/onboarding/short {topic, packId?, requestId}` picks the providers itself: the first
ready text CLI (Claude Code, Codex, Gemini, then OpenRouter), Codex for the images (else a keyed
image provider) and a voice: a saved keyed voice, else the pack's suggested OpenAI voice when an
OpenAI key is saved, else the **system voice** (the best speech program found and its English
voice; see [providers.md](providers.md#system-voice-no-key)), which is then saved in Settings →
Voices so Play and a rebuild offer it. It refuses only when a piece is missing, naming the
screen or command that fixes it (for the voice: install espeak-ng, or add a key). It installs the pack's prompts (or the "Starter" set) and starts a
**short-mode** project (`RunDraft.mode: "short"`, `slices/admission/short-mode.ts`): 9:16, a
~150-word script, narration, 4 images at 15 s each, no thumbnail/PDF/shorts. The word timing
always runs and the Video stage renders the whole narration through the Shorts renderer with
word-by-word captions and the title on top (`slices/rebuild/runtime-export-short.ts`). The
short's values are added to the render fingerprint only in short mode, so long videos keep
their fingerprints. The same `requestId` returns the same project.

## Live view

The project page has a **Live** tab: the steps, the article as it is written, the images as
they land and the narration waveform. Claude Code's partial messages and Codex's
`item.updated` events now reach the panel as typed-ahead text (`LlmEvent` `partial`), which the
committed message replaces; the answer itself is still built from full messages only. Each
finished narration request emits `narration.piece`, and the tab reads
`GET /api/projects/:id/narration/peaks` (ffmpeg-decoded peaks of each finished piece, or of the
joined narration once it exists; cached per asset).

## Starter packs

Sleep lore, True crime, History and Science explainers (`slices/onboarding/packs.ts`): article,
60-second script, image, thumbnail, description and shorts prompts, all asking only for
`{{topic}}`, a suggested voice, captions, motion and the Look, and a Play template using them.
`POST /api/onboarding/packs/:id` (first-run screen, or Library → Templates → Add pack) is
idempotent: items the pack installed before are kept as they are (edited or not), a deleted one
comes back, and a prompt or template of yours with the same name is never touched; the pack's
copy gets " (2)". What each pack installed is remembered in the `onboarding.packs` setting.

## The bundled samples

Three backup archives in `packages/app/src/assets/sample/`, each holding one finished project
(all marked **Sample** in Projects):

- `sample-project.tar` (about 23.5 MB), "The Library of Alexandria": a 3-minute 1280×720
  narrated video with burned-in captions, chapter cards and the warm Look, two shorts, the
  article, the PDF, a YouTube description with chapters, four images and a thumbnail.
- `sample-audiobook.tar` (about 9.9 MB), "The Wind in the Willows: The River Bank": an
  audiobook (see [The demos](#the-demos)).
- `sample-podcast.tar` (about 8.9 MB), "The Antikythera Mechanism": a two-host podcast.

Boot imports each once (`BootOptions.seedSample`, on in the CLI; `seedSamples` in
`slices/onboarding/sample.ts`), and each is remembered on its own (`onboarding.sample`,
`onboarding.sample.audiobook`, `onboarding.sample.podcast`), so an install that had only the
first gets the demos once on its next start. Deleting one keeps it deleted until Settings →
Backup & storage → Restore samples, which puts all three back as they shipped. They are
read-only at the HTTP edge (every non-GET under `/api/projects/:id/` is refused except
revision prepare, rebuild preview, open folder and delete), so nothing on them can reach a paid
provider. "Make my own copy" (`POST /api/onboarding/sample/copy {projectId}`) clones every row
and file of that sample under new ids and re-stamps the fingerprints the new asset ids change,
so the copy has nothing to rebuild.

The archive is built by Slopify's own pipeline. The bundled one uses a folder of pre-made
narration and pictures:

    cd packages/app
    SAMPLE_RECORD=<folder>/turns.json node scripts/build-sample.mjs --assets <folder> /tmp/x.tar
    node --import ./scripts/ts-resolve.mjs src/sample-build/voices.ts --library <folder>
    node scripts/build-sample.mjs --assets <folder>   # needs ffmpeg and ImageMagick

The folder holds the four scenes as `harbor.jpg`, `scrolls.jpg`, `embers.jpg` and `disc.jpg`,
the same four tall as `<scene>-vertical.jpg` for the shorts, `thumbnail.jpg`, and the spoken
narration (the list is also at the top of `src/sample-build/generate.ts`). The narration is a
new run's: Inworld's stock voice "Tristan" on Realtime TTS-2, one request per paragraph
(headings included), each prepared with delivery cues from the sample's Narration Preparation
prompt ("a warm, unhurried history documentary"; the cues, such as `[narrate calmly, gently
setting a myth straight]` and a `[breathe]`, are the scripted writer's answers in
`src/sample-build/content.ts`), then levelled, paced (0.45 s between sentences) and mastered
like every new run ([loudness.md](loudness.md), [pauses.md](pauses.md)). The first build, with
`SAMPLE_RECORD`, lists the nine requests the pipeline sends (answering each with a quiet tone,
so that build fails at the captions and is thrown away); `voices.ts --library` speaks them
(2,879 characters, tags included, about $0.07 at the catalogue's $25 per million) and the
second build answers each request with its file. The nine pictures were painted by the Codex
CLI with the app's own Codex image adapter:

    node --import ./scripts/ts-resolve.mjs src/sample-build/paint.ts <folder>   # from packages/app

The words are timed against the narration by the real English aligner, which downloads its
model on first use. The article is the maintainer's own text; the delivery cues, the
description, the shorts' picks and their image prompts are scripted answers worked out from
what the pipeline sends (`src/sample-build/script.ts`), under the provider names
`sample-writer` and `sample-artist` (model `codex-painted`). Everything after that (captions,
render, shorts, PDF) is the real code. The archive re-encodes the video at CRF 30 and the
narration's pieces and joins as 48 kbps mono MP3.

Without `--assets` the build needs no provider at all (CI): the pictures are procedural
ImageMagick art (`src/sample-build/art.ts`, model `procedural`), the narration is a quiet
ambient track, and the captions carry the words at a steady reading pace.

## The demos

Two multi-voice projects ([multiple-voices.md](multiple-voices.md)), built through the same
pipeline as the Library sample: per-turn narration joined with the turn gap, delivery cues from
Narration Preparation, the real English aligner's word timing, speaker-tagged captions, the
render, a short, a YouTube description with chapters, and the MP3 and M4B with a chapter per
script section.

**Audiobook**, "The Wind in the Willows: The River Bank" (1:47): an abridged
excerpt of chapter I of Kenneth Grahame's *The Wind in the Willows* (1908, public domain,
Project Gutenberg eBook #289; the description cites it). The text is provided as written, with
its quotation marks, and the Audiobook format's **attribute** path hands its dialogue to the
speakers. Narrator "Winston" (mature, warm British storyteller), the Mole "Freddie" (young,
casual British) and the Rat "Ronald" (deep, confident British). Four painterly landscapes, one
short ("What?" to the end), captions with speaker names.

**Podcast**, "The Antikythera Mechanism" (1:44): a script written for the demo
(the 1901 find, the 82 fragments and 30-odd gears, the dials, the pin-and-slot moon, the 2005
scans). Hosts Nell "Naomi" (warm, grounded) and Theo "Jake" (amiable, curious), each with a
Codex-painted portrait (fictional people, painted in oil) in the speaker panel, per-speaker
caption colours and name tags. Four paintings, one short.

The voices are Inworld stock voices on Realtime TTS-2; each demo's turns carry delivery cues
(for example `[call out cheerfully across the water]`, `[say slowly, in amazed disbelief]`,
`[laugh]`, `[breathe]`) from the demo's Narration Preparation prompt, answered by the scripted
writer from `src/sample-build/demos.ts`. Both demos are levelled and mastered like every new
run, with the least pause between sentences inside a turn at 0.6 s for the audiobook and
0.35 s for the podcast. Speaking them took 31 requests and 3,377 characters, tags included
(about $0.08 at the catalogue's $25 per million). The twelve pictures (eight scenes, two tall
ones for the shorts and two portraits) were painted by the Codex CLI.

    cd packages/app
    node --import ./scripts/ts-resolve.mjs src/sample-build/paint.ts --demo audiobook <folder>
    node --import ./scripts/ts-resolve.mjs src/sample-build/voices.ts --demo audiobook <folder>
    node scripts/build-sample.mjs --demo audiobook --assets <folder>   # writes sample-audiobook.tar

`voices.ts` works out every request with the pipeline's own code (the script's turns, each
turn's cues as Inworld tags) and speaks the ones not yet in the folder inside the maintainer's
running Slopify container, where the Inworld key is saved: `container-voices.mjs` is copied to
the container's `/tmp`, opens the database read-only, hands the key to the installed app's
Inworld adapter and writes only MP3s, which are copied out before the folder in `/tmp` is
removed. A file is named by its voice and words, so editing the script speaks only the changed
turns. The build answers each TTS request with the file made for exactly that text and voice,
and fails if one is missing. The archive re-encodes the video at CRF 41, the MP3 and M4B as
64 kbps mono MP3 and 48 kbps mono AAC, and the narration's pieces and joins as 48 kbps mono
MP3, to stay under 10 MB.

These smaller encodes lift the peaks more than the pipeline's own (64 kbps AAC by 2 to 4 dB), so
with Level the volume on the sound is mastered again before them with the peaks held lower, and
an encode that still lands over its ceiling is made again with the sound held lower by the
overshoot (`src/sample-build/shrink.ts`). What the bundled files measure (September 2026 build):

| Sample | Narration pieces, spread before → after levelling | Video | Short(s) | MP3 / M4B |
| --- | --- | --- | --- | --- |
| Library of Alexandria | 9 paragraphs, 4.0 → 0.1 LU | −14.2 LUFS, −2.0 dBTP | −14.1 / −14.5 LUFS, −2.9 dBTP | none |
| Audiobook | 20 turns, 14.9 → 0.7 LU | −14.4 LUFS, −2.6 dBTP | −14.4 LUFS, −2.8 dBTP | −18.6 / −18.4 LUFS, −3.4 dBTP |
| Podcast | 11 turns, 9.5 → 0.2 LU | −14.2 LUFS, −2.1 dBTP | −14.2 LUFS, −3.2 dBTP | −18.6 / −18.3 LUFS, −3.1 / −3.4 dBTP |

Before levelling, the shipped videos measured −28.9 LUFS (Library), −24.4 LUFS (audiobook, turn
spread 16.5 LU) and −24.4 LUFS (podcast, 8.3 LU), and both demos' M4B peaked above 0 dBTP.

Without `--assets` a demo builds with no provider (CI): quiet tones for the turns (provider
`sample-voice`), procedural pictures and paced words, and no delivery cues.
