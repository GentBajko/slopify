# The first five minutes

What a new install shows before anything is spent.

## First-run screen (`/welcome`)

Projects opens it on a fresh install (`GET /api/onboarding` answers `show: true`). It lists the
agent CLIs Slopify found (from the same provider statuses Settings shows), "Make a 60-second
short", "Explore the sample" and the starter packs. Skip (`POST /api/onboarding/dismiss`) hides
it for good; so does the first real project (anything but the sample), even if that project is
deleted later.

It also offers "Start Slopify when I log in" once, until it is answered there, in Settings →
General or in the terminal; see [start-at-login.md](start-at-login.md).

## Make a 60-second short

`POST /api/onboarding/short {topic, packId?, requestId}` picks the providers itself: the first
ready text CLI (Claude Code, Codex, Gemini, then OpenRouter), Codex for the images (else a keyed
image provider) and a keyed voice (a saved voice, else the pack's suggested OpenAI voice). A
missing piece is refused with the Settings screen that fixes it; CLIs can't speak, so a voice
key is always needed. It installs the pack's prompts (or the "Starter" set) and starts a
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

## The bundled sample

`packages/app/src/assets/sample/sample-project.tar` (about 22 MB) is a backup archive holding
one finished project, "The Library of Alexandria": a 2½-minute 1280×720 narrated video with burned-in
captions, chapter cards and the warm Look, two shorts, the article, the PDF, a YouTube
description with chapters, four images and a thumbnail. Boot imports it once
(`BootOptions.seedSample`, on in the CLI); deleting it keeps it deleted until Settings → Backup
& storage → Restore sample. It is read-only at the HTTP edge (every non-GET under
`/api/projects/:id/` is refused except revision prepare, rebuild preview, open folder and
delete), so nothing on it can reach a paid provider. "Make my own copy" clones every row and
file under new ids and re-stamps the fingerprints the new asset ids change, so the copy has
nothing to rebuild.

The archive is built by Slopify's own pipeline. The bundled one uses a folder of pre-made
narration and pictures:

    node packages/app/scripts/build-sample.mjs --assets <folder>   # needs ffmpeg and ImageMagick

The folder holds `narration.mp3`, the four scenes as `harbor.jpg`, `scrolls.jpg`,
`embers.jpg` and `disc.jpg`, the same four tall as `<scene>-vertical.jpg` for the shorts, and
`thumbnail.jpg` (the list is also at the top of `src/sample-build/generate.ts`). The narration
is the article's plain text, headings included, spoken once by Inworld's stock voice "Tristan"
on Realtime TTS-2 (2,335 characters, about $0.06 at the catalogue's $25 per million). The nine
pictures were painted by the Codex CLI with the app's own Codex image adapter:

    node --import ./scripts/ts-resolve.mjs src/sample-build/paint.ts <folder>   # from packages/app

The words are timed against the narration by the real English aligner, which downloads its
model on first use. The article is the maintainer's own text; the description, the shorts'
picks and their image prompts are scripted answers worked out from the real transcript
(`src/sample-build/script.ts`), under the provider names `sample-writer` and `sample-artist`
(model `codex-painted`). Everything after that (captions, render, shorts, PDF) is the real
code.

Without `--assets` the build needs no provider at all (CI): the pictures are procedural
ImageMagick art (`src/sample-build/art.ts`, model `procedural`), the narration is a quiet
ambient track, and the captions carry the words at a steady reading pace.
