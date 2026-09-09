---
content_hash: 53447512f1c6
generated_at_commit: a3bf858ce7d1
absorbed_from:
 - features/2026-09-09-pausable-optional-runs@2026-09-10
 - features/2026-09-10-subtitles-fonts@2026-09-10
generated_date: 2026-09-10
capstone_version: 5.2.0
paths_covered:
 - "packages/app/src/kernel/runner/**"
 - "packages/app/src/adapters/alignment/**"
 - "packages/app/src/edge/**"
 - "packages/app/src/slices/**"
 - "packages/web/src/**"
---

# Data flow

## Lifecycles

**Run** (`logic/01`, `logic/04`):
1. SPA `packages/web/src/routes/play.tsx` posts the RunConfig to `POST /api/projects` through the typed client.
2. `edge/http/projects.ts` validates the body and resolves any requested non-Off subtitle font before project creation or provider work → `slices/admission/startRun()`: validates per `logic/04`, renders prompts per `logic/03`, attaches staged files per `logic/05`, inserts `projects`, six `stages`, `outputs` for provided files in one SQLite transaction; responds 201 with the project.
3. `kernel/runner` picks up the project: starts saved-prompt images and a prewritten thumbnail immediately alongside research. Article waits for research; narration and an LLM-written thumbnail wait for Article. MP4 waits for Article, Audio, Images and Thumbnail; WAV waits for Article and Audio only. Dependencies accept `done`, `provided` or `skipped`; a persisted pause prevents all new claims (`logic/01`).
4. Each stage slice runs its steps, writing `stage_pieces`, `attempts`, `outputs`, and files under `projects/<id>/`, and emitting progress to `edge/events`.
5. `edge/events/projects.ts` pushes SSE events (`stage.state`, `stage.progress`, `article.delta`, `image.landed`) to subscribed pages; `edge/events/global.ts` pushes the running tally.
6. Every stage satisfied → project derived `done`, including article-only runs; `slices/telemetry` appends a `stage.completed` event per stage and flushes the queue (`logic/16`).

**Provider attempt** (`logic/01`):
1. A stage slice calls its port with domain inputs.
2. `kernel/runner/attempt.ts` wraps the call: attempt n of 4, backoff 2 s / 8 s / 30 s, Retry-After on 429, idle timeout 120 s for streams, 300 s for image calls, no timeout for the render; records an `attempts` row per try with outcome and error text.
3. Refusals and "web research unsupported" end the piece immediately without retries (`logic/09`, `logic/06`).
4. Exhaustion → stage `failed` with the verbatim error; the SSE event carries it to the page (`logic/01`).

**Telemetry event** (`logic/16`):
1. A slice calls `slices/telemetry/record(type, payload)` → row in `telemetry_events` with a ULID.
2. `slices/telemetry/flush()` runs at boot and after every record: batches undelivered rows to the collector's `POST /events`; on success marks `delivered_at`; on any failure leaves them queued silently (`logic/16`).
3. Collector dedups by event ID and adds to `aggregates`; the site polls `GET /aggregates` every 5 s (`logic/16`).

**Pause / resume / providers** (`logic/13`, `logic/12`): `POST /api/projects/:id/pause` persists the pause before aborting and draining active work. Interrupted stages return to pending and completed pieces remain. `PATCH /api/projects/:id/providers` validates and saves changed choices only while paused or failed; it does not resume. `POST /api/projects/:id/resume` clears the pause and retries unfinished stages. Control actions, output edits and deletion are serialized per project. `project.updated` invalidates the SPA query. The global event stream forwards project state/configuration changes to refresh project listings in other windows, even when the running tally is unchanged.

**Cancel** (`logic/13`): `POST /api/projects/:id/cancel` → `slices/cancel` aborts every in-flight attempt through an `AbortSignal` handed to adapters and the ffmpeg child, marks running stages `canceled`, keeps done pieces, discards partial streams and partial render files, emits SSE.

**Re-run** (`logic/12`): `POST /api/projects/:id/stages/:kind/rerun` (and edit, regenerate, delete-image, replace endpoints) → `slices/reruns` mutates outputs, marks dependents `pending`, and hands the project back to the runner, which cascades to a fresh render.

## State

| State | Where | Mutated by |
|---|---|---|
| Projects, pause controls, stages, attempts, pieces, outputs | SQLite (`kernel/db`), single writer in WAL mode | slices through `repo.ts` modules; the runner through `kernel/runner` |
| Files (article, audio, images, final exports, subtitle files/font snapshots, provided uploads) | `<data-dir>/projects/<id>/`, `<data-dir>/staging/` (`logic/14`) | `slices/storage` only; other slices ask it for paths |
| Speech model and uploaded fonts | `<data-dir>/models/english-subtitles/`, `<data-dir>/fonts/` | `adapters/alignment/cache.ts`, `slices/fonts/upload.ts` |
| Templates, keys, voices, settings | SQLite | `slices/library`, `slices/settings` |
| Telemetry queue, machine ID | SQLite | `slices/telemetry` |
| In-flight run state (abort controllers, child processes, SSE subscribers) | process memory in `kernel/runner` and `edge/events` | lost on process death, which is why boot marks running stages interrupted (`logic/01`) |
| Client server-state | the SPA's query cache, invalidated by SSE | the query library |
| Client UI state | React component state; the Play form's kept values for the tab session (`logic/04`) | the SPA |
| Collector aggregates | the managed database | the collector on each accepted event |

Compute is stateless apart from the in-flight run state above; there is no session.

## Side-effect boundaries

- Network: provider adapters, the lazy verified speech-model download in `adapters/alignment/cache.ts`, and `slices/telemetry/collector-client.ts`; narration and transcripts stay local during subtitle alignment.
- Child processes: `adapters/llm/claude-code.ts`, `adapters/llm/codex.ts` (agent CLIs) and `slices/video/ffmpeg.ts`, plus local decode/inference children in `adapters/alignment/{audio,runner}.ts`; all receive an `AbortSignal`.
- Filesystem: `slices/storage` supplies project/staging/download paths; font, subtitle, alignment and video modules write their owned files through these paths or the data directory; `kernel/log` writes logs.
- Database: `kernel/db` opened once in `main.ts`; slices receive the handle.
- Browser: `cli.ts` opens the URL once at boot.
- Everything else is pure: substitution (`slices/admission/substitute.ts` per `logic/03`), chunking (`slices/narration/chunk.ts` per `logic/08`), end-matter split (`slices/narration/split.ts`), the render plan (`slices/video/plan.ts` per `logic/11`), status derivation.

## Failure paths

- Provider error, timeout, rate limit: the attempt wrapper above; after 4 attempts the stage fails with verbatim text; siblings continue; done outputs are kept (`logic/01`).
- Interrupted process: at the next boot running stages in paused projects return to pending; other running stages become failed "interrupted"; persisted pauses prevent scheduling; in-flight memory is gone; staged uploads never attached are deleted (`logic/01`, `logic/05`).
- SSE disconnect: the browser reconnects automatically; on reconnect the page refetches the project and resumes from current state; events are not replayed.
- Disk write failure: the writing stage fails with the OS error (`logic/14`); the transaction that created a project rolls back and Play shows the error (`logic/04`).
- Collector unreachable: events stay queued; the pipeline never waits on telemetry (`logic/16`).
- Partial failure between non-atomic steps: a stage's pieces are recorded individually so a retry resumes from completed pieces (`logic/06`, `logic/08`, `logic/09`, `logic/10`); an output file written but its row not committed is orphaned on disk and removed by the boot cleanup of the project folder against `outputs` (planned in `slices/storage/reconcile.ts`).
- Cancel racing completion: a stored output stays `done` (`logic/13`).
- Second instance on the same data directory: refused at boot (`logic/14`).
- Real-time delivery: SSE only; no fan-out beyond the open pages of one local browser.
- Background jobs: the in-process runner; poison handling is the failed-stage state awaiting a human retry; no dead-letter queue exists or is needed.

## Subtitle export lifecycle

1. Play normalizes Audio Off to Subtitle Off and Video/Images Off to files mode; inactive invalid style fields fall back to schema defaults. New-project admission rejects unavailable active fonts before any project/provider work (`packages/web/src/subtitles/config.ts`, `packages/app/src/edge/http/projects.ts`).
2. The final video stage loads actual intro/body/outro audio and spoken text. `slices/subtitles/prepare.ts` hashes each segment's audio bytes, text and duration, the included gaps and an alignment-version key; `transcript.ts` reads generated TTS chunks or the saved article text.
3. On a timing-cache miss, `adapters/alignment/index.ts` acquires the model-cache lock, downloads/verifies pinned weights if needed, decodes audio and runs acoustic alignment in an abortable WASM child. Relative word times are offset by the complete audio timeline, including gaps. A font/size/format-only change reuses matching word timings (`slices/subtitles/prepare.ts`).
4. New caption files and a selected-font snapshot are prepared in a fresh project `captions-*` directory. FFmpeg reads fixed relative ASS/font names with that directory as its working directory; explicit relative executable paths are resolved against app launch cwd (`slices/video/ffmpeg.ts`).
5. `slices/video/write-export.ts` renders into a part file, checks cancellation, retains rollback copies of the prior media/parameters, then transactionally replaces final-export and caption rows. A synchronous file/DB failure restores prior playback and removes uncommitted captions; a failed restoration retains its backup. Success removes superseded assets and records actual `subtitlesMode` on the MP4/WAV output.
6. `PATCH /api/projects/:id/subtitles` serializes with other project actions, rejects active work (rechecked after asynchronous font resolution), updates config and resets only the video stage. Unpaused projects tick immediately; paused projects wait for Resume. `project.updated` refreshes saved configuration in open pages (`edge/http/subtitles.ts`).
