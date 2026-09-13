---
generated_at_commit: 7bdb84e3f57e
generated_date: '2026-09-13'
capstone_version: 5.2.0
content_hash: 2d16c7712ec0
paths_covered:
  - :(top)packages/web/src/routes/project.tsx
  - :(top)packages/web/src/project/**
  - :(top)packages/web/src/components/batch-queue.tsx
  - :(top)packages/web/src/router.tsx
  - :(top)packages/web/src/routes/settings.tsx
absorbed_from:
  - features/2026-09-10-editable-projects@2026-09-12
  - features/2026-09-10-review-checkpoints@2026-09-13
  - features/2026-09-10-project-templates@2026-09-13
---

# Project workspace

The progress area includes a Review checkpoints panel. It exposes held dependents, revision-bound approval, pending gate add/remove controls and explicit reload when another tab changes the gate set. Approval releases only the selected closure and never starts a rebuild.

## Mode & job

Monitor the current revision, inspect retained outputs, edit project inputs/content, and explicitly review/start affected work. The route composes header, revision workspace, batch queue, total progress, stage navigation and active stage body. `packages/web/src/routes/project.tsx:95`, `project/revision-workspace.tsx:29`.

## Composition

The header and revision actions precede progress. Desktop places stage navigation beside the active output; narrow layouts put navigation above it. The active body contains research/article text, narration, images, thumbnail or export. Downloads resolve current selected revision records through `RevisionMedia`; historical downloads belong to the inspected revision. `routes/project.tsx:105`, `project/revision-media.tsx`, `project/revision-history.tsx`.

Edit project opens an inline configuration/content form. Save changes commits a revision without starting generation; Discard changes closes the draft. Rebuild affected outputs is a separate action and unavailable while a draft/upload/rebuild review is open. The editor includes source modes, providers/models, prompt snapshots and keywords, frame format, narration chunking/entries, images and subtitle settings. Article remains required; optional outputs may change after completion. `project/revision-workspace.tsx:210`, `project/revision-form.tsx`, `project/revision-content.tsx`.

The content area supports direct article edits, image prompt/order/removal/replacement, narration text or replacement media, individual regeneration intent, and manual caption cue edits. Pending uploads prevent Save/Discard until cancellation or completion settles. Captions use the complete current narration duration, including generated entries and gaps; provided whole audio uses its body only. Missing/stale narration blocks cue editing; a completed final export is not required. After narration changes, retained cues display a review warning and remain correctable once current narration is complete. Applying cue corrections changes the draft; Save validates/rebinds their timeline. `project/revision-upload.tsx`, `project/image-editor.tsx`, `project/narration-editor.tsx`, `project/revision-caption-duration.ts:3`, `project/revision-content.tsx:218`.

Generated image previews use the current selected work-key record; supplied choices use their explicit retained asset. Missing, outdated, review-required and staged replacement states remain visible (`packages/web/src/project/image-preview.tsx:5`).

Rebuild review shows before/after input values, affected work with human labels and request text/settings, retained outputs, known/unknown costs and in-flight billing notices. Required provided-content confirmations and unknown-cost acknowledgement gate Start rebuild. Cancel rebuild dismisses review without admission. `project/rebuild-review.tsx:11`.

History lists retained revisions and opens their outputs and text parts. Research plans/chapters, article/narration text and legacy thumbnail prompts are readable even without a completed aggregate output. Restore creates a new current revision referencing the chosen history; no automatic generation starts. Restore is held while editing/uploading/reviewing. `project/revision-history.tsx:17`, `project/revision-workspace.tsx:169`.

## States

Selected outputs are Ready, Needs rebuild with retained output available, Provided content needs review, or Retained file missing. Errors remain inline. A newer revision does not replace a mounted unsaved draft: a status notice explains the change; reload/discard is explicit. Failed Save retains the draft and request identity; retries replay the same mutation. Stale rebuild previews close and require fresh review. `project/revision-workspace.tsx:60`, `project/revision-workspace.tsx:188`, `project/revision-requests.ts`.

Paused/canceled/recovered work resumes through current-revision dependency/cost review. In-flight results settle into their origin history and update the current revision only when still reserved for matching inputs. Live writing/audio and attempt counts are scoped to active revision work. `project/use-actions.ts`, `project/live-revision.ts`, `project/live-writing.tsx`, `project/live-audio.tsx`.

Subtitle preparation is separate from WAV encoding. Caption-file edits retain unchanged WAV/non-burned MP4 media; burn-in changes require a new visual render. Finished output and caption downloads remain available after failed replacement. Alignment recovery notes identify unmatched passages without claiming the audio changed. `project/body-video.tsx`.

Download actions have adjacent Open folder actions for server-owned media, archives and subtitles. Pending folder opens disable that action; errors remain inline. Folder paths are resolved on the server, not supplied by the browser. `project/open-folder.tsx`, `project/revision-api.ts`.

## Motion

SSE refreshes the current project, selected revision and scoped previews. The workspace uses inline pending states, active controls and the loading skeleton rather than replacing a mounted draft with remote state. `routes/project.tsx:152`, `project/use-live.ts`, `events.ts`.

## Copy

Actions distinguish Edit project, Save changes, Discard changes, Rebuild affected outputs, Start rebuild, Cancel rebuild and Restore this revision. Output status and warnings describe retained/missing/outdated media and uncertain costs. Revision and request identities stay in API paths/state; review renders human part labels. `project/revision-workspace.tsx`, `project/rebuild-review.tsx`, `project/output-label.ts`.

## Not in play

The header's Save as template action captures the displayed revision without rebuilding; template listing and Apply live on the Templates route. Schedule creation lives on the Schedules route, and backup/cleanup controls live in Settings (`packages/web/src/project/save-template.tsx`, `packages/web/src/router.tsx:55-65`, `packages/web/src/routes/settings.tsx:126-191`).
