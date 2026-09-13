---
absorbed_from:
- features/2026-09-09-pausable-optional-runs@2026-09-10
- features/2026-09-10-subtitles-fonts@2026-09-10
- features/2026-09-10-editable-projects@2026-09-12
- features/2026-09-10-review-checkpoints@2026-09-13
- features/2026-09-10-project-templates@2026-09-13
screen: project page
journeys:
- J3-make-a-video
- J4-bring-your-own
- J5-revise
- J6-revisit
generated_date: '2026-09-13'
generated_at_commit: 7bdb84e3f57e
capstone_version: 5.2.0
paths_covered:
  - :(top)packages/web/src/project/**
  - :(top)packages/web/src/routes/project.tsx
  - :(top)packages/app/src/slices/revisions/**
  - :(top)packages/app/src/slices/rebuild/**
  - :(top)packages/app/src/slices/checkpoints/**
  - :(top)packages/app/src/slices/project-templates/**
content_hash: 99be2f08d405
---

# 08 Project page

One project workspace contains current outputs, a unified edit form, explicit rebuild review and retained revision history. Editing saves first; rebuilding starts only after a separate review and Start action.

## Layout

```text
Slopify navigation

< Projects
Project title                              Download final output
Status · aspect ratio · started            Pause / Cancel

Edit project     History     Rebuild affected outputs
Saved outputs: ready / needs rebuild / provided review / file missing

[Project edit form, revision history or rebuild review when opened]
Batch queue (when present)
Overall progress

Stage navigator          Selected stage workspace
Research                 Heading · status · progress
Article                  Retained output / live preview / downloads
Audio
Images
Thumbnail
Video or Audio export
```

The stage navigator remains sticky at the left on desktop and becomes a compact grid above the selected workspace on narrow screens. Each entry retains its status and summary. Initial selection follows a failed stage, an active stage, then completed export; an explicit user selection takes control until the project changes.

The overall bar excludes skipped stages, counts supplied/done stages as complete, and incorporates measured partial progress. It is execution progress rather than a time estimate. The header exposes the available MP4, WAV or article download.

## Elements

| Element | Action and destination |
|---|---|
| Pause / Resume / Cancel | Controls current project execution while preserving completed outputs |
| Overall progress and stage navigator | Shows aggregate work and opens one stage workspace |
| Edit project / Save changes | Opens the unified revision form and persists a new revision without rebuilding |
| Review affected rebuild / Start rebuild | Shows dependency/cost/reuse effects and explicitly admits reviewed work |
| Review checkpoint / Approve | Holds or releases one selected dependency closure |
| History / Restore this revision | Opens retained revision outputs or creates a new head from one |
| Download / Open folder | Retrieves a revision-specific file or reveals its host directory |
| Save as template | Captures the displayed current revision as reusable setup |

The route composes project controls, current revision editor, rebuild review, checkpoint controls, history and media workspaces from `packages/web/src/project/` (`packages/web/src/routes/project.tsx:1`).

## States

- **Pending/running:** overall and stage progress update; live text/audio appears only for matching current work.
- **Paused:** no new project work dispatches; provider/revision choices remain editable.
- **Failed/canceled:** retained completed outputs stay available and the affected rebuild flow offers reviewed continuation.
- **Needs rebuild:** current desired inputs differ from retained selected output; the old file remains visible.
- **Review held:** one checkpoint closure is held while independent stages can continue.
- **Editing/conflict:** local fields and uploads remain visible; Reload current revision explicitly resolves a changed head.
- **Rebuild review/uncertain Start:** reviewed costs, reuse and confirmations stay bound to the original request identity.
- **History/file missing:** the selected revision remains inspectable; unavailable files have no working download.

The displayed states are derived from revision projection, rebuild preview and checkpoint status rather than a mutable stage-only record (`packages/app/src/slices/revisions/projection.ts:1`, `packages/app/src/slices/rebuild/preview-plan.ts:1`, `packages/app/src/slices/checkpoints/index.ts:1`).

## Editing

The header includes **Save as template** when a current revision exists. It asks for a name and
captures setup and source text into a reusable template; it does not rebuild or change this
project.

Edit project opens the unified form using the current revision. Title, aspect ratio, source modes, project prompt snapshots and keywords, providers/models/voice, chunking, intro/outro, silence and subtitle controls remain part of this single save. Content editors support article text, individual images, logical narration groups and manual caption cues.

Article accepts Generate or Provide. Other stages can be disabled as their source rules permit. Silent video has Audio Off; Video Off with Audio enabled produces WAV. Disabling the last image also requires Video Off or a replacement. The saved prompt library remains unchanged; adopting another template or replacing saved rendered wording is explicit.

Generated images expose their prompt and explicit regeneration choice; provided replacements stage their bytes before Save. Images can be added, reordered or removed. Narration groups expose their retained text with text override, replacement audio and regeneration choices. Whole-request narration remains one group. Caption text/start/end edits preserve invalid draft values for correction and apply within the same save/rebuild flow.

Save changes commits the revision without provider requests or rendering. Discard changes drops the local draft. Uploads, font work and unapplied caption edits block Save until resolved. Remote revisions do not overwrite unsaved fields: a conflict offers Reload current revision and discard my draft. Missing saved models, voices or library entries remain visible instead of silently selecting replacements.

## Rebuild review

The progress view includes Review checkpoints beside stage meters. Pending Audio, Images and Video/export gates show their dependent closure and reviewed revision; Approve releases only that branch. Gate choices can be saved while the selected stage is pending, and Save never starts a rebuild.

Rebuild affected outputs is available after local edits are saved or discarded. It opens Review affected rebuild with changed input labels, affected work, retained outputs, known estimate range, unknown costs and any whole-request narration limitation. Supplied dependent content requires explicit reuse confirmation when its inputs changed. An already submitted request is identified as potentially billable.

Start rebuild is the only action here that admits work. Blocked work, missing required confirmations or unacknowledged unknown costs keep it disabled. Cancel rebuild closes the review without starting. A stale preview is refused and must be reviewed again. Retrying an uncertain Start preserves its request identity.

## History

History lists revision title, creation time and current marker. Selecting a revision exposes its retained outputs, earlier results, physical narration parts and retained text parts. Available files have Download and Open folder; image/thumbnail archives have Download all images. Media previews are bounded, and text uses wrapped retained content or a file download.

Missing files are labelled File missing and have no functioning download link. Restore this revision creates a new current revision referencing that history; it never rewrites or deletes the chosen revision and starts no work. Restore is disabled while an edit, upload or rebuild review is active.

Both current and historical downloads use revision-specific output records. Historical filenames retain their revision title. A title-only edit can share media while presenting a new current download name. Old completed media remains usable while a replacement is pending or failed.

## Stage workspaces and live state

Research and Article use bounded readable text regions with current downloads. Audio exposes completed narration segments and live part players when bytes are available. Images and Thumbnail show completed media and downloads. The final workspace chooses a video or WAV player according to available output; files-mode video captions use the VTT associated with that retained export.

Live writing shows response text with concurrent-call selection and Follow output. Live audio starts from the selected part's beginning, never autoplays, and makes no additional provider call. Current work ownership filters late preview events; an old revision cannot paint over a new revision.

Stages show pending, running, done, failed, provided or skipped. Outdated retained media remains visible with Needs rebuild rather than disappearing. Failed alignment, rendering or provider work retains previous successful output. Paused/interrupted work is continued through the explicit rebuild review; retired direct rerun/provider/subtitle controls do not bypass it.

Pause and Cancel retain completed outputs and carry revision-aware request identities. Error details stay expandable; actionable errors appear near the relevant form or review. The app-wide update affordance stays independent from project editing.

## Source and acceptance

The route is `packages/web/src/routes/project.tsx`; revision form, history, review, media and upload behavior is in `packages/web/src/project/`. Mounted route/editor tests cover current and historical files, conflicts, control identity, upload races, and caption validation. Disposable browser acceptance covers supplied article/audio/images, Save without admission, explicit local WAV, retained history, desktop and narrow layout. Real boot/upgrade/restore/restart acceptance is `packages/app/test/e2e/editable-projects.test.ts`.
