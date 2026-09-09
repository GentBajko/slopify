---
absorbed_from:
 - features/2026-09-09-pausable-optional-runs@2026-09-10
 - features/2026-09-10-subtitles-fonts@2026-09-10
scenario: storage-and-downloads
mockup_row: S14
screens: [07-projects, 08-project]
depends_on: [01-pipeline-lifecycle, 05-provided-outputs, 12-reruns-and-edits]
generated_date: 2026-09-09
capstone_version: 5.2.0
---

# 14 Storage and downloads

Where everything lives on the user's machine, how downloads are named, and how a project is deleted.

## Trigger & preconditions

- Trigger: app launch (data directory resolution), any stage writing an output, a download click, Delete on a project.
- Preconditions for Delete: the project is not `running`.
- Actor: the single local user.

## Steps

1. Data directory: `~/.slopify/` by default, overridable by a launch flag or environment variable. Inside: the SQLite database (scenario 02), `projects/`, `staging/`, `fonts/` for uploaded fonts and `models/english-subtitles/` for verified local speech weights (scenario 17). Nothing is written next to where `npx` was run.
2. Project folder `projects/<id>/`: `article.md`, `article.txt` (narration source), `sources.txt`, `glossary.txt`, `research.txt`, audio files for body, intro, outro, images named `<prompt-name>-<index>`, the thumbnail, `video.mp4` or the combined `audio.wav`, `render.json` (scenario 11 parameters). Captioned exports also own a `captions-*` directory with SRT, VTT, ASS, word timing JSON and a copied font under `fonts/` (`packages/app/src/slices/subtitles/prepare.ts`). Provided files are copied in under the same names with their original filenames recorded (scenario 05).
3. Subtitle roles are `subtitles_srt`, `subtitles_vtt`, `subtitle_words`, `subtitle_ass`, `subtitle_font`; SRT/VTT download at `/files/<id>/subtitles-srt` and `/files/<id>/subtitles-vtt` with their text MIME types. WAV export uses output role `audio_export`, asset URL `/files/<id>/audio-export`, and `audio/wav` content type. Downloads: single files as `<title-slug>-<asset>.<ext>`; "download all" images as `<title-slug>-images.zip`, thumbnail included.
4. Delete project: refused while `running`; otherwise removes the database rows and the folder; irreversible; only from the app. Confirmation dialog is `uiux`'s.
5. Retention: projects are kept until the user deletes them; no automatic cleanup ever. Staging files never attached to a project are removed at app start (scenario 05).
6. Single instance: a second app instance on the same data directory refuses to start with an error.

## Branches

- Flag or environment variable set → that directory is used; unset → `~/.slopify/`.
- Project `running` → Delete disabled; otherwise enabled.

## Unhappy paths

- A replacement export fails while writing parameters or committing caption rows → the previous media/parameters are restored and old output rows remain. Failed restoration retains the `.previous` backup; successful replacement removes obsolete caption/font files (`packages/app/src/slices/video/write-export.ts`).
- Local write failure (disk full, permissions) → the writing stage fails with the OS error text; manual retry per scenario 01.
- Data directory not writable at launch → the app refuses to start with the path and the error (follows).
- Delete fails midway (a file locked) → the project stays listed with an error; Delete can be repeated. The delete itself stays irreversible.
- Download of a file that is missing on disk → error on the project page; the stage can be re-run (scenario 12).

## State transitions

- Project: any non-running state → deleted (gone from list and disk).
- Staged file: → discarded at app start when unattached (scenario 05).

## Invariants

- Every output of a project lives in its own folder.
- The app writes nowhere outside the data directory.
- A deleted project leaves no files or rows.

## Outcomes & side effects

- Downloads are served from the project folder; nothing is copied elsewhere.
- Deleting a project does not change telemetry already sent or counted (scenario 16).

## Dimensions not in play

- D1 authority: one local actor.
- D4 computation: nothing computed.
- D5 money: nothing charged.
- D6 limits: no cap on disk use or project count.
- D7 time: no retention clock; deletion is manual only.
- D10 external failure: no external call; local write failures handled above.
- D13 notification: no channel.
- D14 effects on others: deletion touches only the project itself.

## Font and model lifetime

System fonts are read from bounded standard OS directories; uploaded `.ttf`/`.otf` files are limited to 32 MiB, validated and stored by content hash. No raw path is accepted by the font API and no font-delete API exists (`packages/app/src/slices/fonts/`, `edge/http/fonts.ts`). Each completed caption export snapshots its selected font into the project, so later style changes can reuse that file after the system font is removed (`slices/subtitles/prepare.ts`). Deleting a project removes its caption snapshots and timing cache but leaves shared uploads and the verified model cache available to other projects.
