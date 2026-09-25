---
generated_at_commit: 4cfe3473f74d
generated_date: 2026-09-13
capstone_version: 5.2.0
content_hash: e0a747f481e2
paths_covered:
  - ":(top)packages/app/src/**"
  - ":(top)packages/web/src/**"
  - ":(top)packages/collector/**"
  - ":(top)packages/site/**"
---

# Glossary

## Concepts

| Term | Meaning in Slopify | Implementation |
|---|---|---|
| Run, project | One Play submission represented by a project record and its stages and outputs. `packages/app/src/slices/admission/model.ts:54-68` | `slices/admission`, `projects` table |
| Stage | A pipeline unit such as research, article, audio, images, thumbnail, video, or document with a lifecycle state. `packages/app/src/kernel/pipeline.ts:10-36` | `stages`, `kernel/runner` |
| YouTube description | The Video stage's optional step: after subtitle timing, the text model writes a summary, a YouTube chapter list at the narration's real times, hashtags last, and a separate comma-separated tags list (`youtube_description`, `youtube_tags`). `packages/app/src/slices/youtube/answer.ts` | `slices/youtube`, `youtube:description` |
| Document | The optional seventh stage: the article laid out locally as a styled PDF (`document_pdf`) in the DiceMaster or Plain theme, with the thumbnail as its cover. `packages/app/src/slices/document/render.ts` | `slices/document`, `document:pdf` |
| Piece | A resumable sub-unit of work, such as an audio chunk or an individual image. `packages/app/src/kernel/runner/attempt.ts:31-38` `packages/app/src/slices/narration/plan.ts:1-12` | `stage_pieces` |
| Attempt | One provider call under the retry and timeout policy; the policy allows at most four attempts. `packages/app/src/kernel/runner/attempt.ts:8-19` | `attempts`, `kernel/runner/attempt.ts` |
| Provider port, adapter | A family interface and concrete provider implementation for LLM, TTS, image, or subtitle alignment work. `packages/app/src/kernel/ports/llm.ts:1-80` `packages/app/src/adapter-registry.ts:51-89` | `kernel/ports`, `adapters` |
| Catalogue | YAML-backed and refreshable model metadata containing supported models, capabilities, concurrency, and pricing. `packages/app/src/catalog/store.ts:9-79` `packages/app/src/assets/models.yaml:1-20` | `catalog`, `models.yaml` |
| Thinking | An optional LLM reasoning mode selected from the chosen catalogue model's supported modes. `packages/app/src/catalog/registry.ts:24-39` `packages/web/src/play/thinking.tsx:15-42` | `LlmCall.thinking`, catalogue `thinking` |
| Provider request queue | An in-process queue allowing at most five active provider calls globally and applying lower per-provider catalogue limits. `packages/app/src/kernel/runner/queue.ts:12-77` | `kernel/runner/queue.ts` |
| Batch queue | SQLite-persisted ordering of multiple project runs; one video project is activated at a time and pause holds its position. `packages/app/src/slices/batch/index.ts:19-57` | `batches`, `project_queue`, `slices/batch` |
| Estimate | A pre-run `CostEstimate` containing USD low/high totals, stage rows, unknown charges, catalogue date, and assumptions. `packages/app/src/slices/estimate/index.ts:4-19` `packages/app/src/slices/estimate/index.ts:72-125` | `POST /api/projects/estimate` |
| Continuation | A provider-issued async job token stored on the durable physical work piece. Retries and a later reviewed recovery can retrieve an accepted asynchronous job without submitting it again. `packages/app/src/kernel/runner/providers.ts:168` `packages/app/src/kernel/runner/attempt.ts:69` `packages/app/src/adapters/tts/inworld-async.ts:22` | `revision_work_pieces.continuation`, TTS `continuation.read/write` |
| Source | How a stage is fulfilled, including generated, provided, or disabled inputs. `packages/app/src/slices/admission/model.ts:54-68` | run draft and stage configuration |
| Slot, keyword | A `{{name}}` placeholder substituted from one run's values. `packages/app/src/slices/admission/substitute.ts:1-80` | `prompts.slots`, substitution slice |
| Entry | An intro or outro in text or LLM mode. `packages/app/src/slices/library/model.ts:1-80` | `entries` table |
| Provided output | User-supplied audio, images, thumbnail, or article staged before a run. `packages/app/src/slices/storage/staging.ts:1-80` | `staged_files`, storage slice |
| Render plan | Computed image slots, zoom, frame, and FPS passed to local FFmpeg assembly. `packages/app/src/slices/video/plan.ts:1-100` `packages/app/src/slices/video/ffmpeg.ts:1-80` | `render_params`, video slice |
| Telemetry event | A locally stored and queued usage event sent in batches to the collector. `packages/app/src/slices/telemetry/model.ts:1-80` `packages/app/src/slices/telemetry/flush.ts:1-110` | telemetry tables, collector |
| Data directory | Configured local directory containing SQLite, project files, staging files, and logs. `packages/app/src/kernel/paths.ts:1-80` | `kernel/paths` |
| Character chunking | Groups complete sentences up to a user-set character budget (default 3000); a single longer sentence stands alone, with provider limits applied afterwards. | `packages/app/src/slices/narration/chunk.ts:22` |
| Revision, head | An immutable saved project setup/content snapshot and the one revision currently selected by `project_heads`; older revisions and registered assets remain addressable. `packages/app/src/slices/revisions/model.ts:65` `packages/app/src/kernel/db/migrations/0004-project-revisions.sql:1` | `slices/revisions`, revision tables |
| Rebuild preview, admission | A saved dependency/reuse/cost review plus private execution snapshot, followed by an explicit idempotent grant that allows selected work to run. Saving a revision alone does not grant new generation. `packages/app/src/slices/rebuild/model.ts:23` `packages/app/src/slices/rebuild/service.ts:46` | `rebuild_previews`, `rebuild_admissions` |
| Work piece | A durable physical recipe request within revision work, carrying input/result JSON, fingerprints, continuation, generation token and dispatch state. It is distinct from the legacy projected `StagePiece`. `packages/app/src/slices/rebuild/work-records.ts:5` `packages/app/src/kernel/db/migrations/0005-revision-work.sql:23` | `revision_work_pieces` |
| Play draft | A durable incomplete four-section creation document with versioned saves, owned attachment references, a bound review and an exact Start receipt. `packages/app/src/slices/play-drafts/model.ts:22` `packages/app/src/kernel/db/migrations/0006-play-drafts.sql:1` | `slices/play-drafts`, Play draft tables |
| Review checkpoint | A revision-bound gate on audio, images or video. Its dependency closure stays held until the reviewed fingerprint is approved, while independent work can continue. `packages/app/src/slices/checkpoints/model.ts:12` `packages/app/src/slices/checkpoints/fingerprint.ts:8` | `review_checkpoints`, `review_checkpoint_approvals` |
| Project template | A named versioned Play document stripped of credentials and generated-media ownership, pinned by schedules or instantiated as a fresh editable draft. `packages/app/src/slices/project-templates/model.ts:6` `packages/app/src/slices/project-templates/setup.ts:8` | `project_templates`, `project_template_revisions` |
| Scheduled job | A local template-based recurrence with IANA timezone, missed/overlap policy, optional cost ceiling and durable occurrence history. It advances only while the Slopify process is running. `packages/app/src/slices/schedules/schema.ts:13` `packages/app/src/slices/schedules/scheduler.ts:25` | `schedules`, `schedule_runs` |
| Portable backup | A version-1 ZIP of settings, libraries, voices, template heads and referenced staged files. It excludes credentials, projects/revisions and schedules. `packages/app/src/slices/storage/portable.ts:45` `packages/app/src/slices/storage/portable.ts:85` | `/api/storage/export`, `/api/storage/import` |
| Update candidate | A privately installed exact package version started on the existing port/data directory behind an authenticated readiness/activation handoff before becoming the active managed entry. `packages/app/src/updater/plan.ts:15` `packages/app/src/updater/worker.ts:45` | `updates/`, detached update worker |
