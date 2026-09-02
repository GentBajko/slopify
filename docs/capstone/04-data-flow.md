---
mode: prescriptive
generated_date: 2026-09-02
capstone_version: 5.2.0
paths_covered:
  - "packages/app/src/kernel/runner/**"
  - "packages/app/src/edge/**"
  - "packages/app/src/slices/**"
  - "packages/web/src/**"
---

> Prescriptive: written from the design interview, not from code. Citations point at `architecture-interview.md §Q<n>`, the logic scenarios, and planned paths.

# Data flow

## Lifecycles

**Run** (`logic/01`, `logic/04`):
1. SPA `packages/web/src/routes/play.tsx` posts the RunConfig to `POST /api/projects` through the typed client (§Q27).
2. `edge/http/projects.ts` validates the body → `slices/admission/startRun()`: validates per `logic/04`, renders prompts per `logic/03`, attaches staged files per `logic/05`, inserts `projects`, six `stages`, `outputs` for provided files in one SQLite transaction; responds 201 with the project.
3. `kernel/runner` picks up the project: walks the graph research → article → {audio ∥ images ∥ thumbnail} → video, starting a stage when its dependencies are `done`, `provided`, or `skipped` (§Q12; `logic/01` §Q2).
4. Each stage slice runs its steps, writing `stage_pieces`, `attempts`, `outputs`, and files under `projects/<id>/`, and emitting progress to `edge/events` (§Q12).
5. `edge/events/projects.ts` pushes SSE events (`stage.state`, `stage.progress`, `article.delta`, `image.landed`) to subscribed pages; `edge/events/global.ts` pushes the running tally.
6. Video `done` → project derived `done`; `slices/telemetry` appends a `stage.completed` event per stage and flushes the queue (`logic/16`).

**Provider attempt** (`logic/01` §Q4, §Q62, §Q77):
1. A stage slice calls its port with domain inputs.
2. `kernel/runner/attempt.ts` wraps the call: attempt n of 4, backoff 2 s / 8 s / 30 s, Retry-After on 429, idle timeout 120 s for streams, 300 s for image calls, no timeout for the render; records an `attempts` row per try with outcome and error text.
3. Refusals and "web research unsupported" end the piece immediately without retries (`logic/09` §Q74, `logic/06` §Q47).
4. Exhaustion → stage `failed` with the verbatim error; the SSE event carries it to the page (`logic/01` §Q10).

**Telemetry event** (`logic/16`):
1. A slice calls `slices/telemetry/record(type, payload)` → row in `telemetry_events` with a ULID.
2. `slices/telemetry/flush()` runs at boot and after every record: batches undelivered rows to the collector's `POST /events`; on success marks `delivered_at`; on any failure leaves them queued silently (§Q7; `logic/16` §Q130).
3. Collector dedups by event ID and adds to `aggregates`; the site polls `GET /aggregates` every 5 s (`logic/16` §Q133).

**Cancel** (`logic/13`): `POST /api/projects/:id/cancel` → `slices/cancel` aborts every in-flight attempt through an `AbortSignal` handed to adapters and the ffmpeg child, marks running stages `canceled`, keeps done pieces, discards partial streams and partial render files, emits SSE.

**Re-run** (`logic/12`): `POST /api/projects/:id/stages/:kind/rerun` (and edit, regenerate, delete-image, replace endpoints) → `slices/reruns` mutates outputs, marks dependents `pending`, and hands the project back to the runner, which cascades to a fresh render.

## State

| State | Where | Mutated by |
|---|---|---|
| Projects, stages, attempts, pieces, outputs | SQLite (`kernel/db`), single writer in WAL mode (§Q25) | slices through `repo.ts` modules; the runner through `kernel/runner` |
| Files (article, audio, images, video, provided uploads) | `<data-dir>/projects/<id>/`, `<data-dir>/staging/` (`logic/14`) | `slices/storage` only; other slices ask it for paths |
| Templates, keys, voices, settings | SQLite | `slices/library`, `slices/settings` |
| Telemetry queue, machine ID | SQLite | `slices/telemetry` |
| In-flight run state (abort controllers, child processes, SSE subscribers) | process memory in `kernel/runner` and `edge/events` | lost on process death, which is why boot marks running stages interrupted (`logic/01` §Q7) |
| Client server-state | the SPA's query cache, invalidated by SSE (§Q27) | the query library |
| Client UI state | React component state; the Play form's kept values for the tab session (`logic/04` §Q36) | the SPA |
| Collector aggregates | the managed database | the collector on each accepted event |

Compute is stateless apart from the in-flight run state above; there is no session.

## Side-effect boundaries

- Network: only the three ports' adapters (`packages/app/src/adapters/**`) and `slices/telemetry/collector-client.ts` (§Q10).
- Child processes: `adapters/llm/claude-code.ts`, `adapters/llm/codex.ts` (agent CLIs) and `slices/video/ffmpeg.ts` (§Q10, §Q26); all receive an `AbortSignal`.
- Filesystem: `slices/storage` (project folders, staging, downloads) and `kernel/log` (log files) (§Q23).
- Database: `kernel/db` opened once in `main.ts`; slices receive the handle (§D9).
- Browser: `cli.ts` opens the URL once at boot (§Q17).
- Everything else is pure: substitution (`slices/admission/substitute.ts` per `logic/03`), chunking (`slices/narration/chunk.ts` per `logic/08`), end-matter split (`slices/narration/split.ts`), the render plan (`slices/video/plan.ts` per `logic/11`), status derivation.

## Failure paths

- Provider error, timeout, rate limit: the attempt wrapper above; after 4 attempts the stage fails with verbatim text; siblings continue; done outputs are kept (`logic/01`).
- Interrupted process: at the next boot every `running` stage → `failed` "interrupted"; in-flight memory is gone; staged uploads never attached are deleted (`logic/01` §Q7, `logic/05` §Q44).
- SSE disconnect: the browser reconnects automatically; on reconnect the page refetches the project and resumes from current state; events are not replayed (§Q12).
- Disk write failure: the writing stage fails with the OS error (`logic/14` §Q118); the transaction that created a project rolls back and Play shows the error (`logic/04` §Q36).
- Collector unreachable: events stay queued; the pipeline never waits on telemetry (`logic/16` §Q130).
- Partial failure between non-atomic steps: a stage's pieces are recorded individually so a retry resumes from completed pieces (`logic/06` §Q54, `logic/08` §Q66, `logic/09` §Q73, `logic/10` §Q82); an output file written but its row not committed is orphaned on disk and removed by the boot cleanup of the project folder against `outputs` (planned in `slices/storage/reconcile.ts`).
- Cancel racing completion: a stored output stays `done` (`logic/13` §Q113).
- Second instance on the same data directory: refused at boot (`logic/14` §Q118).
- Real-time delivery: SSE only; no fan-out beyond the open pages of one local browser.
- Background jobs: the in-process runner; poison handling is the failed-stage state awaiting a human retry; no dead-letter queue exists or is needed.
