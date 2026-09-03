---
scenario: provided-outputs
mockup_row: S3
screens: [06-play, 08-project]
depends_on: [01-pipeline-lifecycle, 03-placeholder-substitution, 04-run-admission]
generated_date: 2026-09-02
capstone_version: 5.2.0
---

# 05 Provided outputs

What a stage set to Provide accepts, how the content is staged, validated, and attached, and what the run records for it.

## Trigger & preconditions

- Trigger: on `mockup/06-play.md`, a stage's source is set to Provide and text is pasted or a file is picked.
- Preconditions: none. Provide needs no key, prompt, provider, or model for that stage.
- Actor: the single local user.

## Steps

1. Text stages (research notes, article): accept pasted text; trim; reject empty. Strip markdown syntax to plain text and store that as the narration source; a markdown copy for display is optional. No length cap.
2. Audio: accept one file of any format the video renderer decodes (`for: stack`); no size or duration limit.
3. Images: accept png, jpg, webp; 1 to 60 files; no size cap; slideshow order = selection order, re-orderable; any image removable from the list before Play.
4. Thumbnail: one file, same formats as images.
5. Staging: a picked file starts copying into local staging storage immediately, in the background, with progress on the form; many files copy in parallel; audio, images, and thumbnail may copy at the same time; navigating between app pages does not interrupt it.
6. Validation runs the moment a paste or file lands: an unreadable or undecodable file, an empty paste, or an image count outside 1-60 is marked in place and Play stays disabled per scenario 04.
7. Research forced Off: when article is Provide, the research stage is hidden and marked skipped at run start, since research only feeds article writing.
8. On Play: staged files are attached to the new project's storage (layout: scenario 14); the stage is marked provided per scenario 01 step 1, recording the original filenames; no prompt or slot is recorded for it, while keywords shared with generating stages are still recorded per scenario 03.

## Branches

- Single-file slots (audio, thumbnail): a second pick replaces the first.
- Article Provide → research Off and hidden; article Generate → research as chosen.
- Images Provide → no image prompts, Number, image provider, or model required (scenario 04).

## Unhappy paths

- Undecodable file or empty paste → rejected in place; Play disabled.
- Upload still copying when Play is pressed → Play disabled until every staged file is complete (follows from scenario 04's "content present").
- Browser tab closed mid-copy → in-flight copies abort; staged files never attached to a project are deleted on the next app start.
- Attaching to the project fails at Play (disk error) → no project; error on Play (scenario 04).
- Image aspect ratio differs from the chosen format → accepted here; fitting is scenario 11's (video-assembly).

## State transitions

- Staged file: copying → staged → attached (at Play) or discarded (tab closed, removed by the user, or cleanup at app start).
- Stage: marked `provided` at project creation (scenario 01); never `running` afterwards.

## Invariants

- A provided stage is never regenerated (scenario 01 forbids `provided` → `running`).
- A run never starts with a provided stage whose content is missing or still copying.
- The narration source of an article is always plain text.

## Outcomes & side effects

- Success: the project holds the provided content and the provided marks; downstream stages consume it exactly as generated output (scenario 01 step 4-5).
- The project page shows the provided content with its original filename and no prompt.
- Staging directory grows until cleanup on app start (scenario 14 names the location).

## Dimensions not in play

- D1 authority: one local actor.
- D4 computation: nothing computed.
- D5 money: nothing charged.
- D7 time: nothing expires; cleanup is event-driven at app start, not timed.
- D10 failure of external calls: no external call; local copy failures are the only failures.
- D13 notification: no channel.
- D14 effects on others: nothing outside the draft run is touched.
