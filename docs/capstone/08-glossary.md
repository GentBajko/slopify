---
generated_at_commit: 3a9796eb7fec
generated_date: 2026-09-10
content_hash: e293a0b5e022
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
| Stage | A pipeline unit such as research, article, audio, images, thumbnail, or video with a lifecycle state. `packages/app/src/kernel/pipeline.ts:10-36` | `stages`, `kernel/runner` |
| Piece | A resumable sub-unit of work, such as an audio chunk or an individual image. `packages/app/src/kernel/runner/attempt.ts:31-38` `packages/app/src/slices/narration/plan.ts:1-12` | `stage_pieces` |
| Attempt | One provider call under the retry and timeout policy; the policy allows at most four attempts. `packages/app/src/kernel/runner/attempt.ts:8-19` | `attempts`, `kernel/runner/attempt.ts` |
| Provider port, adapter | A family interface and concrete provider implementation for LLM, TTS, image, or subtitle alignment work. `packages/app/src/kernel/ports/llm.ts:1-80` `packages/app/src/adapter-registry.ts:51-89` | `kernel/ports`, `adapters` |
| Catalogue | YAML-backed and refreshable model metadata containing supported models, capabilities, concurrency, and pricing. `packages/app/src/catalog/store.ts:9-79` `packages/app/src/assets/models.yaml:1-20` | `catalog`, `models.yaml` |
| Thinking | An optional LLM reasoning mode selected from the chosen catalogue model's supported modes. `packages/app/src/catalog/registry.ts:24-39` `packages/web/src/play/thinking.tsx:15-42` | `LlmCall.thinking`, catalogue `thinking` |
| Provider request queue | An in-process queue allowing at most five active provider calls globally and applying lower per-provider catalogue limits. `packages/app/src/kernel/runner/queue.ts:12-77` | `kernel/runner/queue.ts` |
| Batch queue | SQLite-persisted ordering of multiple project runs; one video project is activated at a time and pause holds its position. `packages/app/src/slices/batch/index.ts:19-57` | `batches`, `project_queue`, `slices/batch` |
| Estimate | A pre-run `CostEstimate` containing USD low/high totals, stage rows, unknown charges, catalogue date, and assumptions. `packages/app/src/slices/estimate/index.ts:4-19` `packages/app/src/slices/estimate/index.ts:72-125` | `POST /api/projects/estimate` |
| Continuation | A provider-issued async job token held during automatic retries of one call; it is not durable across process restarts. `packages/app/src/kernel/runner/providers.ts:170-190` `packages/app/src/adapters/tts/inworld-async.ts:22-70` | TTS `continuation.read/write` |
| Source | How a stage is fulfilled, including generated, provided, or disabled inputs. `packages/app/src/slices/admission/model.ts:54-68` | run draft and stage configuration |
| Slot, keyword | A `{{name}}` placeholder substituted from one run's values. `packages/app/src/slices/admission/substitute.ts:1-80` | `prompts.slots`, substitution slice |
| Entry | An intro or outro in text or LLM mode. `packages/app/src/slices/library/model.ts:1-80` | `entries` table |
| Provided output | User-supplied audio, images, thumbnail, or article staged before a run. `packages/app/src/slices/storage/staging.ts:1-80` | `staged_files`, storage slice |
| Render plan | Computed image slots, zoom, frame, and FPS passed to local FFmpeg assembly. `packages/app/src/slices/video/plan.ts:1-100` `packages/app/src/slices/video/ffmpeg.ts:1-80` | `render_params`, video slice |
| Telemetry event | A locally stored and queued usage event sent in batches to the collector. `packages/app/src/slices/telemetry/model.ts:1-80` `packages/app/src/slices/telemetry/flush.ts:1-110` | telemetry tables, collector |
| Data directory | Configured local directory containing SQLite, project files, staging files, and logs. `packages/app/src/kernel/paths.ts:1-80` | `kernel/paths` |
