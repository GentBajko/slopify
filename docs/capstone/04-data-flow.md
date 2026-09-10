---
generated_at_commit: f4d66867e39f
generated_date: 2026-09-10
content_hash: 54e4b02083cb
paths_covered:
  - ":(top)packages/app/src/**"
  - ":(top)packages/web/src/**"
  - ":(top)packages/collector/**"
  - ":(top)packages/site/**"
---

# Data flow

## Lifecycles

1. **Boot:** CLI flags/environment become Config; boot creates private paths and the instance lock, resolves FFmpeg, opens/migrates SQLite, marks interrupted stages failed and reconciles storage. It creates the catalogue, registry, updater and runner before listening. The batch timer pumps only while the updater permits a mutation (`packages/app/src/edge/cli.ts:19`, `packages/app/src/main.ts:86`, `packages/app/src/main.ts:218`).
2. **One run:** Play assembles RunDraft and opens RunReview. POST `/api/projects/estimate` resolves saved templates and validates configuration without creating projects. Confirmation posts the draft to `/api/projects`; admission resolves fonts, validates fields, writes the project/stages/provided artifacts, then ticks the runner. Eligible research and saved-prompt images can run independently; article, narration and final export follow source-aware dependencies (`packages/web/src/routes/play.tsx:91`, `packages/app/src/edge/http/planning.ts:32`, `packages/app/src/edge/http/projects.ts:64`, `packages/app/src/slices/admission/start.ts:26`, `packages/app/src/kernel/runner/graph.ts:1`).
3. **Batch:** the same review covers up to 50 title/keyword variants. POST `/api/projects/batch` checks its UUID for an existing result, validates every run, and transactionally creates projects and queue rows. Shared staged inputs are copied into each project before the original staging metadata/files are consumed. The queue activates one batch project at a time. Failed/canceled/done projects advance after in-flight work drains; paused projects hold their position (`packages/app/src/edge/http/planning.ts:79`, `packages/app/src/slices/batch/index.ts:38`, `packages/app/src/slices/batch/index.ts:73`).
4. **Provider call:** a stage requests the wrapped LLM/TTS/image port. The global queue grants capacity before opening the attempt and idle timer; at most five calls run, with lower YAML limits per provider. Attempt retries retain the slot. Curation checks enabled model and capabilities before adapter work. Adapters translate streams/bytes into domain results; pieces and outputs commit as they land (`packages/app/src/kernel/runner/providers.ts:79`, `packages/app/src/kernel/runner/queue.ts:12`, `packages/app/src/catalog/registry.ts:7`, `packages/app/src/kernel/runner/attempt.ts:62`).
5. **Narration recovery:** the user can choose whole, paragraph, word-count or character-count chunks. Counted chunks end at the last sentence that fits; the default character budget is 3000 and is editable on Play or failed/paused runs. A changed active count resets unfinished narration, while saving the same effective count preserves pieces (`packages/app/src/slices/narration/chunk.ts:22`, `packages/app/src/slices/control/index.ts:184`). Then unfinished old chunk plans are split to the selected model's character limit; completed pieces and files remain. New filenames use piece IDs so reindexing cannot overwrite completed audio. Explicit voice/model/chunking edits on an unfinished audio stage clear that stage's prior partial narration; normal retry keeps it. Async continuation IDs survive automatic retries within the active call, not process restarts (`packages/app/src/slices/narration/plan.ts:12`, `packages/app/src/slices/narration/run.ts:148`, `packages/app/src/slices/control/index.ts:1`, `packages/app/src/kernel/runner/providers.ts:155`).
6. **Catalogue:** boot seeds a private YAML copy; reads reload valid local changes and retain last valid data on invalid edits. Settings may manually fetch published defaults, validate, back up and replace the file. Pickers poll local metadata every 30 seconds (`packages/app/src/catalog/store.ts:24`, `packages/web/src/components/catalogue.tsx:12`, `packages/web/src/lib/models.ts:30`).

## State

| State | Owner | Persistence |
|---|---|---|
| Projects, stages, pieces, attempts, outputs, pauses and batch order | SQLite repositories | Database; migrations in `packages/app/src/kernel/db/migrations/0001-init.sql:1` and subsequent migrations |
| Media, captions, fonts and acoustic model | Storage/font/alignment slices | Data directory; `packages/app/src/kernel/paths.ts:17` |
| Model limits, capabilities, prices | Catalogue store | Local YAML plus last valid in-memory value; `packages/app/src/catalog/store.ts:24` |
| Active calls, abort controllers, request queue, preview buffers | Runner and event layer | Process memory; `packages/app/src/kernel/runner/index.ts:48`, `packages/app/src/kernel/audio-preview.ts:1` |
| Server data versus unsaved form state | React Query versus component/session draft state | SPA cache and draft storage; `packages/web/src/routes/play.tsx:45` |
| Usage delivery and aggregates | App telemetry SQLite queue and collector D1 | `packages/app/src/slices/telemetry/flush.ts:1`, `packages/collector/src/index.ts:64` |

## Side-effect boundaries

Slices consume typed dependencies; DB work sits in repositories/transactions, provider HTTP and CLI work in adapters, and filesystem work in storage/font/subtitle/export modules. Boot injects these seams (`packages/app/src/main.ts:286`). Text splitting, estimate arithmetic and stage dependency derivation are pure functions (`packages/app/src/kernel/ports/text.ts:1`, `packages/app/src/slices/estimate/index.ts:21`, `packages/app/src/kernel/runner/graph.ts:1`).

## Failure paths

- Queued cancellation removes the waiter without starting a provider attempt. Provider timeout/retry failures become stage failures while completed pieces survive. Pause persists before aborting and draining calls; pause aborts return unfinished stages to pending (`packages/app/src/kernel/runner/queue.ts:37`, `packages/app/src/kernel/runner/attempt.ts:62`, `packages/app/src/kernel/runner/index.ts:235`).
- SQLite transactions roll back admission/batch rows. Filesystem copies made before a failed DB commit may be orphaned until boot reconciliation; events are not a durable outbox (`packages/app/src/slices/batch/index.ts:38`, `packages/app/src/slices/storage/reconcile.ts:1`).
- SSE disconnect drops transient delivery; reconnect fetches persisted state. Audio/LLM previews are bounded memory and cannot replace final outputs (`packages/web/src/events.ts:50`, `packages/app/src/edge/events/preview-cache.ts:1`).
- FFmpeg and subtitle failures retain the previous export through part/rollback files (`packages/app/src/slices/video/write-export.ts:1`). Catalogue errors retain the previous parsed value; refresh failures return an HTTP error (`packages/app/src/catalog/store.ts:38`, `packages/app/src/edge/http/providers.ts:41`).
- Retriable collector outages retain queued usage; terminal invalid batches are dropped. Collector event insertion and aggregate increments are separate statements, so a Worker death between them can lose an aggregate contribution (`packages/app/src/slices/telemetry/collector-client.ts:39`, `packages/collector/src/index.ts:64`).
