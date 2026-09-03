---
scenario: storage-and-downloads
mockup_row: S14
screens: [07-projects, 08-project]
depends_on: [01-pipeline-lifecycle, 05-provided-outputs, 12-reruns-and-edits]
generated_date: 2026-09-02
capstone_version: 5.2.0
---

# 14 Storage and downloads

Where everything lives on the user's machine, how downloads are named, and how a project is deleted.

## Trigger & preconditions

- Trigger: app launch (data directory resolution), any stage writing an output, a download click, Delete on a project.
- Preconditions for Delete: the project is not `running`.
- Actor: the single local user.

## Steps

1. Data directory: `~/.slopify/` by default, overridable by a launch flag or environment variable. Inside: the SQLite database (scenario 02), `projects/`, `staging/`. Nothing is written next to where `npx` was run.
2. Project folder `projects/<id>/`: `article.md`, `article.txt` (narration source), `sources.txt`, `glossary.txt`, `research.txt`, audio files for body, intro, outro, images named `<prompt-name>-<index>`, the thumbnail, `video.mp4`, `render.json` (scenario 11 parameters). Provided files are copied in under the same names with their original filenames recorded (scenario 05).
3. Downloads: single files as `<title-slug>-<asset>.<ext>`; "download all" images as `<title-slug>-images.zip`, thumbnail included.
4. Delete project: refused while `running`; otherwise removes the database rows and the folder; irreversible; only from the app. Confirmation dialog is `uiux`'s.
5. Retention: projects are kept until the user deletes them; no automatic cleanup ever. Staging files never attached to a project are removed at app start (scenario 05).
6. Single instance: a second app instance on the same data directory refuses to start with an error.

## Branches

- Flag or environment variable set → that directory is used; unset → `~/.slopify/`.
- Project `running` → Delete disabled; otherwise enabled.

## Unhappy paths

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
