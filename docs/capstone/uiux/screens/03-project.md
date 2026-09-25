---
docker_project_folder_verified_at_commit: a472d51
glossary_pronunciation_verified_at_commit: 6eeac3fd9043
generated_at_commit: 7bdb84e3f57e
generated_date: '2026-09-25'
capstone_version: 5.2.0
content_hash: 2d16c7712ec0
paths_covered:
  - :(top)packages/web/src/routes/project.tsx
  - :(top)packages/web/src/project/**
  - :(top)packages/web/src/components/batch-queue.tsx
  - :(top)packages/web/src/router.tsx
  - :(top)packages/web/src/routes/settings.tsx
absorbed_from:
  - features/2026-09-25-docker-project-folder@2026-09-25
  - features/2026-09-25-glossary-pronunciation@2026-09-25
  - features/2026-09-24-narration-preparation@2026-09-24
  - features/2026-09-10-editable-projects@2026-09-12
  - features/2026-09-10-review-checkpoints@2026-09-13
  - features/2026-09-10-project-templates@2026-09-13
---

# Project workspace

## Glossary pronunciation editing

Scoped verification: `6eeac3f`, 2026-09-25. Generated Audio's provider editor reuses the labelled **Use Pronunciation Glossary** control; existing missing values remain off and provider switches preserve the dormant preference. Save alone never synthesizes. The control's InfoTip explains supported Inworld models, the supplied IPA format and independence from cue preparation. Current/History downloads keep clean narration text separate from exact TTS scripts; articles and subtitle spelling are unchanged (`packages/web/src/project/revision-providers.tsx:110`, `packages/web/src/play/pronunciation-glossary.tsx`, `packages/web/src/project/narration-downloads.tsx`).

## Mode & job

Monitor the current revision, inspect retained outputs, edit project inputs/content, and explicitly review/start affected work. The route composes the page bar, one status line, the rundown strip and the revision tabs (`packages/web/src/routes/project.tsx`, `project/revision-workspace.tsx`).

## Composition

- **Page bar** (`project/header.tsx`): back link to Projects, project lamp, title, state word (announced), meta (article prompt, format, start time), and a fixed control set: Save as template, one Pause/Resume toggle (Resume covers paused, failed, canceled and resumable pending; disabled when neither applies), Download (disabled until the primary output exists; when it does, the accent download link with Open folder beside it), and a More menu whose Cancel run opens its confirmation.
- **Status line**: one reserved StatusSlot under the bar for project-level refusals (with Dismiss) or the server's notice after an accepted action (`routes/project.tsx`).
- **Rundown strip** (`project/navigation.tsx` `RundownStrip`): a Run cell with percent and the Overall progress bar, then six stage cells (lamp, name, state word with live announcement, glyph and summary). It is the stage navigation, the overall progress and the output summary at once; selecting a stage opens the Output tab on it. The six cells scroll horizontally on narrow screens.
- **Tabs** (`project/revision-workspace.tsx`): Output, Edit (badge "· unsaved" while a draft exists), History, Checkpoints (badge "· N held"), and a Queue · N popover (`BatchQueueCount`) at the tab row's right, disabled when the queue is empty.
- **Output tab**: the active stage's block. Its header shows glyph, title, summary, progress text and state word over an always-drawn 2 px meter. A failed or canceled stage adds one failure row: message, attempts, an Error details popover, the unready-provider line with Open Settings, an InfoTip with the recovery explanation, and a SplitButton "Retry stage" whose menu holds "Re-run section" (confirmation dialog; enabled when `canRerunSection`). Stage refusals show inside the stage's own block with Dismiss. The body contains research/article text, narration, images, thumbnail or export; stages without output show a centred explanation (`project/stage-row.tsx`, `project/bodies.tsx`).
- **Edit tab**: the saved output status list (help behind the section InfoTip) and an ActionBar with Rebuild affected outputs and Edit project. Edit project replaces it with the form: a section sub-nav (Inputs, Article, Providers, Prompts, Subtitles, Images, Narration when audio generates, Captions, with count badges) beside one section; hidden sections stay mounted so uploads and unapplied edits survive a switch. A sticky ActionBar carries the status slot (newer revision available, waiting for uploads), the conflict reload action, Discard changes and Save changes (`project/revision-form.tsx`).
- **History tab**: retained revisions; restore feedback and the conflict reload show here (`project/revision-history.tsx`).
- **Checkpoints tab**: the checkpoint panel with held dependents, revision-bound approval, pending gate add/remove controls and explicit reload when another tab changes the gate set. Approval releases only the selected closure and never starts a rebuild (`project/checkpoint-panel.tsx`).
- **Rebuild review** opens in a Drawer ("Review affected rebuild") over whichever tab is showing, with Start rebuild and Cancel rebuild in a sticky footer (`project/rebuild-review.tsx`).

Downloads resolve current selected revision records through `RevisionMedia`; historical downloads belong to the inspected revision (`project/revision-media.tsx`, `project/revision-history.tsx`).

The editor includes source modes, providers/models, prompt snapshots and keywords, frame format, narration chunking/entries, images and subtitle settings. Article remains required; optional outputs may change after completion. Save changes commits a revision without starting generation; Discard changes closes the draft. Rebuild affected outputs is unavailable while a draft/upload/rebuild review is open.

The content sections support direct article edits, image prompt/order/removal/replacement, narration text or replacement media, individual regeneration intent, and manual caption cue edits. Pending uploads prevent Save/Discard until cancellation or completion settles. Captions use the complete current narration duration, including generated entries and gaps; provided whole audio uses its body only. Missing/stale narration blocks cue editing; a completed final export is not required. After narration changes, retained cues display a review warning and remain correctable once current narration is complete. Applying cue corrections changes the draft; Save validates/rebinds their timeline (`project/revision-upload.tsx`, `project/image-editor.tsx`, `project/narration-editor.tsx`, `project/revision-caption-duration.ts:3`, `project/revision-content.tsx`).

Image groups show the first 12 images with "Show all N images"; images load lazily. Generated image previews use the current selected work-key record; supplied choices use their explicit retained asset. Missing, outdated, review-required and staged replacement states remain visible (`packages/web/src/project/body-images.tsx`, `packages/web/src/project/image-preview.tsx`).

Rebuild review shows before/after input values, affected work with human labels and request text/settings, retained outputs, known/unknown costs and in-flight billing notices. Required provided-content confirmations and unknown-cost acknowledgement gate Start rebuild. Cancel rebuild or closing the drawer dismisses review without admission (`project/rebuild-review.tsx`).

Start displays "Starting rebuild…" while its request is pending. Refusals and transport errors appear inside the drawer with field details and receive keyboard focus. The review and acknowledgements survive a retryable failure; stale previews close and show the error in the Edit tab. The same request identity is reused when retrying an unchanged request (`project/revision-feedback.tsx`, `project/revision-workspace.tsx`).

History lists retained revisions and opens their outputs and text parts. Research plans/chapters, article/narration text and legacy thumbnail prompts are readable even without a completed aggregate output. Restore creates a new current revision referencing the chosen history; no automatic generation starts. Restore is held while editing/uploading/reviewing (`project/revision-history.tsx`, `project/revision-workspace.tsx`).

Generated Audio's editor retains optional Narration Preparation and a frozen prompt-body editor. Save does not modify the library or call providers. Current and historical Audio expose distinct Body/Intro/Outro narration text and TTS script links with revision-owned files, without audio-player or progress-count duplication (`packages/web/src/project/revision-narration.tsx`, `narration-downloads.tsx`, `revision-history.tsx`).

## States

Loading shows a skeleton matching the page bar, status line, rundown strip, tab row and sheet (`routes/project.tsx` `SkeletonRundown`). Selected outputs are Ready, Needs rebuild with retained output available, Provided content needs review, or Retained file missing. A newer revision does not replace a mounted unsaved draft: the action bar's status slot explains the change; reload/discard is explicit. Failed Save retains the draft and request identity; retries replay the same mutation. Stale rebuild previews close and require fresh review (`project/revision-workspace.tsx`, `project/revision-requests.ts`).

Paused/canceled/recovered work resumes through current-revision dependency/cost review. In-flight results settle into their origin history and update the current revision only when still reserved for matching inputs. Live writing/audio and attempt counts are scoped to active revision work (`project/use-actions.ts`, `project/live-revision.ts`, `project/live-writing.tsx`, `project/live-audio.tsx`).

Subtitle preparation is separate from WAV encoding. Caption-file edits retain unchanged WAV/non-burned MP4 media; burn-in changes require a new visual render. Finished output and caption downloads remain available after failed replacement. Alignment recovery notes identify unmatched passages without claiming the audio changed (`project/body-video.tsx`).

Download actions have adjacent Open folder actions for server-owned media, archives and subtitles. A pending request disables the action and reads Locating…. Native success opens the file manager. Managed Docker success opens a popover with a labelled readonly host path in a status region, selected on focus, and explains that the folder belongs to the machine running Slopify; errors show in the same popover. No desktop-opening claim is made for Docker. Paths are resolved from owned current/retained output records on the server, not supplied by the browser. The same component serves History, and downloads remain independent (`packages/web/src/project/open-folder.tsx`, `packages/web/src/project/revision-api.ts`, `packages/app/src/edge/http/folder-location.ts:13`).

## Motion

SSE refreshes the current project, selected revision and scoped previews. The Run bar and the stage meter animate their fill with a 200 ms transform; only the running lamp pulses. The workspace uses inline pending states, disabled controls and the loading skeleton rather than replacing a mounted draft with remote state (`routes/project.tsx`, `project/use-live.ts`, `events.ts`).

## Copy

Actions distinguish Save as template, Pause, Resume, Download, Cancel run, Retry stage, Re-run section, Edit project, Save changes, Discard changes, Rebuild affected outputs, Start rebuild, Cancel rebuild and Restore this revision. Output status and warnings describe retained/missing/outdated media and uncertain costs. Revision and request identities stay in API paths/state; review renders human part labels (`project/header.tsx`, `project/revision-workspace.tsx`, `project/rebuild-review.tsx`, `project/output-label.ts`).

## Not in play

Save as template captures the displayed revision without rebuilding; template listing and Apply live on the Library's Templates tab. Schedule creation lives on the Schedules tab, and backup/cleanup controls live in Settings (`packages/web/src/project/save-template.tsx`, `packages/web/src/router.tsx`, `packages/web/src/routes/settings.tsx`).
