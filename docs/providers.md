# Providers and models

## First launch: no keys needed

On a first launch (no API key saved yet) Slopify looks for Claude Code, Codex and Gemini CLI on
the computer. If it finds any, Play and Settings → Providers say "You can make a video now, no
API keys needed", and a new draft on Play starts with the found tool picked for text (Claude
Code first, then Codex, then Gemini) and Codex for images. Narration can use the computer's own
**System voice** (below) with no key; a voice provider key gives a better one. Choose **Got it**
to hide the message. The same facts are at `GET /api/providers/first-run` for the guided setup
to build on.

## System voice (no key)

`system-voice` is a speech provider that uses what the computer already has, found at runtime
(`kernel/ports/system-speech.ts`, adapter `adapters/tts/system.ts`):

- **macOS**: `say` (voices from `say -v ?`), recorded to AIFF.
- **Windows**: System.Speech through PowerShell (`SpeechSynthesizer.SetOutputToWaveFile`, voices
  from `GetInstalledVoices`). The text, voice and file reach the script in environment
  variables, never inside it.
- **Linux**: Piper (only with voice models listed in `SLOPIFY_PIPER_VOICES`, `.onnx` paths
  separated by `:`), SVOX Pico (`pico2wave`), eSpeak NG or eSpeak, best first.

Its "models" are the programs found and its voices are theirs; each request speaks the text from
a file into a WAV/AIFF and converts it to mp3 with the app's ffmpeg. It costs nothing, has no row
in models.yaml (so older installs reading the published list are unaffected) and no key field.
Settings → Providers shows what was found or, when nothing was, why and the fix (install
espeak-ng); Settings → Voices lists its voices to add. Detection is cached for a minute. The
Docker image ships espeak-ng; an image without it says so and names `docker compose pull`.

## Keys, step by step

Every provider that takes a key has an info button beside its name in Settings → Providers:
where to sign up, the page that makes the key, what credit or billing it needs and which
permissions a restricted key must have. All links go to the provider's own pages.

**Test** (beside Save) makes the cheapest harmless call the key allows, such as reading the
account or the model list, so nothing is generated or billed. It says whether the key was
accepted and, if not, what to do. Only OpenRouter's check also shows missing credit; the others
report credit problems on the first real generation. A key pasted into the field is tested as
it stands, before **Save**; it is sent only to its provider and is not stored or logged. With
the field empty, Test checks the saved key. The tutorial's key steps link to the same key pages
as these guides.

One Gemini API key serves both Google providers: **Google Gemini** voices use the key saved for
Google images until you save one of their own. Gemini voices are its 30 prebuilt ones (Kore,
Puck, Charon…); Settings → Voices lists them to pick from instead of asking for an id. Gemini
answers with raw audio, which Slopify turns into MP3 with its own ffmpeg.

## Health check

**Check all** under Settings → Providers checks, for every provider: that the command-line tool
is installed (`--version`), new enough and signed in (`claude auth status`, `codex login
status`; Gemini CLI has no such command, so its sign-in is read from its own files:
`~/.gemini/settings.json` for the chosen method, `~/.gemini/oauth_creds.json` for a Google
sign-in, `GEMINI_API_KEY` in the environment or `~/.gemini/.env` for a key); that each saved key
passes Test; and that the models your templates, schedules, drafts and unfinished projects use
are still offered. For a keyed provider, **Model reachable** then asks the provider with the saved
key about each chosen model (its model page, or its model list for OpenRouter and ElevenLabs):
a model the key can't use is a problem, a provider that doesn't answer is a warning, and
Cartesia and Inworld, which have no such read, say they can't be checked. Nothing is generated or
billed. Each problem says how to fix it, and **Check again** on a provider's row checks that one
alone after a fix. Providers you have not set up and do not use are listed on one line.

## Models stay up to date

At start and then once a day Slopify checks the published catalogue (`models.yaml` on GitHub)
and OpenRouter's public model list, and folds them into the local `models.yaml`:

- new models appear in the pickers;
- prices follow the published list and OpenRouter's live prices;
- a model the published list drops or marks deprecated, or that OpenRouter no longer serves,
  is kept in the file with `deprecated: true` and hidden from the pickers;
- models you added to the file yourself, and models you switched off, are left alone, and a
  voice model keeps its local character limit, so existing projects are not re-split.

**Check now** in Settings → Models runs the check at once; **Replace with published file**
overwrites the local file instead (the previous one is kept as `models.yaml.previous`).
`SLOPIFY_NO_MODEL_REFRESH=1` turns the automatic check off.

## Retired models in use

Settings → Models → **Retired models in use** lists every template, schedule, draft and
project with steps still to run whose model is retired or no longer listed, with the
suggested replacement (the active model of the same provider whose ID shares the longest
start). Nothing changes by itself: a run that reaches a retired model stops and says so.
**Switch to <model>** changes that one choice; **Switch all** does every row it can. The same
flag and **Switch to <model>** button also show under the template's row in Library →
Templates and the schedule's row in Library → Schedules.
Switching a template saves a new version and moves the schedules that ran its latest version
along; a project gets a new saved version, as Edit project would. A schedule pinned to an
older template version, or a running project, is listed with what to do instead.
