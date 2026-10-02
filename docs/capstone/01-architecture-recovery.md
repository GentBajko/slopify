---
generated_at_commit: d83482c1175e
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: 90822441e2be
paths_covered:
  - ":(top)packages/app/src/slices/rebuild/service*.ts"
  - ":(top)packages/app/src/slices/rebuild/preview-plan.ts"
  - ":(top)packages/app/src/slices/rebuild/admission-repo.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-plan.ts"
  - ":(top)packages/app/src/slices/rebuild/model.ts"
  - ":(top)packages/app/src/slices/rebuild/recovery*.ts"
  - ":(top)packages/app/src/slices/rebuild/review-redo.ts"
  - ":(top)packages/app/src/slices/rebuild/narration-retry.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-subtitles.ts"
  - ":(top)packages/app/src/slices/control/revision-control-schema.ts"
  - ":(top)packages/app/src/adapters/alignment/cache.ts"
  - ":(top)packages/app/src/adapters/alignment/index.ts"
  - ":(top)packages/app/src/adapters/alignment/prefetch.ts"
  - ":(top)packages/app/src/adapters/alignment/lock.ts"
  - ":(top)packages/app/src/adapters/alignment/multilingual.ts"
  - ":(top)packages/app/src/kernel/paths.ts"
  - ":(top)packages/app/src/edge/http/revisions.ts"
  - ":(top)packages/app/src/edge/http/actions.ts"
  - ":(top)packages/app/src/edge/http/reviews.ts"
  - ":(top)packages/app/src/main.ts"
  - ":(top)packages/web/src/project/api.ts"
  - ":(top)packages/web/src/project/revision-api.ts"
  - ":(top)packages/web/src/project/revision-workspace.tsx"
  - ":(top)packages/web/src/project/use-actions.ts"
  - ":(top)biome.json"
---

# Rebuild admission and subtitle-model recovery

Scope: how a rebuild or recovery action (Resume, Retry, Soften, Rerun, review Redo) becomes admitted revision work, and how the subtitle alignment model is cached and re-downloaded. Everything else is in [01-architecture.md](01-architecture.md).

## Layers

| Layer | Files in scope | Imports |
|---|---|---|
| edge/http | `packages/app/src/edge/http/revisions.ts`, `actions.ts`, `reviews.ts` | slices/rebuild services |
| slices/rebuild | `service.ts`, `service-readiness.ts`, `preview-plan.ts`, `admission-repo.ts`, `runtime-plan.ts`, `recovery.ts`, `recovery-repo.ts`, `recovery-selection.ts`, `recovery-conflict.ts`, `recovery-model.ts` under `packages/app/src/slices/rebuild/` | kernel, other slices (`control`, `revisions`, `settings`, `admission`); never edge or adapters (`biome.json:70`) |
| adapters/alignment | `packages/app/src/adapters/alignment/index.ts`, `cache.ts`, `prefetch.ts`, `lock.ts` | kernel/ports only (`biome.json:99`); `SubtitleAligner` port from `packages/app/src/kernel/ports/subtitles.ts` |

Dependency direction: edge → `recoverProject` / `previewRebuild` / `startRebuild` → `admitCheckedPreview` → `admitPreview` (SQLite transaction) → `runner.tick`. The rebuild runtime reaches the aligner only through the injected `alignSubtitles` dependency (`packages/app/src/slices/rebuild/runtime-subtitles.ts:100`).

## Module boundaries

| Module | Public surface | Boundary |
|---|---|---|
| `preview-plan.ts` | `executionSnapshotSchema` (`:23`), `planPreview` (`:55`), `reviewStillCovers` (`:278`) | Selects requested keys plus unreused dependencies; traversal stops at reused work (`:71`-`:88`). The snapshot catalogue is `selectedCatalogue(executionCatalogue(...))`: only models the selected recipes use, plus the TTS model when narration preparation is selected (`:143`, `:233`-`:255`) |
| `runtime-plan.ts` | `executionCatalogue(catalogue, config)` keeps the run's configured llm/audio/images models and providers (`:15`) | Used for the snapshot and for new invocations (`packages/app/src/slices/rebuild/admission-repo.ts:90`) |
| `service-readiness.ts` | `paidChoices` (`:15`) counts only provider recipes that are not reused and need a new submission; `checkReadiness` (`:37`) checks provider status and runtime model/thinking only for those; `localReadiness` (`:83`) | Local-only selections return no readiness fields and no provider lookup (`:46`) |
| `service.ts` | `RebuildDeps` (`:28`), `previewRebuild` (`:51`), `startRebuild` (`:84`), `admitCheckedPreview` (`:166`), `wakeRebuild` (`:210`) | `admitCheckedPreview` replans with the current full catalogue, requires `reviewStillCovers`, runs `localReadiness`, and refuses when a running reservation has a different fingerprint (`:180`-`:202`) |
| `admission-repo.ts` | `admissionReceipt` (`:22`), `admitPreview` (`:54`) | One `transact` (`:63`): replay check, persisted-preview hash check, replan with `planningCatalogue` (`:87`). Per recipe: `reuse` binds narration (`:100`); an unfinished reservation with the same fingerprint is rejoined and reset to `pending`/`allowed` (`:104`-`:133`); a running one with another fingerprint throws (`:135`); otherwise a new invocation is inserted with the execution catalogue and the saved anchor (`:139`-`:158`). Writes `rebuild_admissions`, `revision_provided_reviews`, unpauses the project (`:166`-`:186`) |
| `recovery.ts` | `recoverProject(deps, projectId, request, { pendingSuperseded? })` (`:59`) | Two project-control sections: prepare (`:87`-`:266`) and admit inside `transact` (`:287`-`:343`) |
| `recovery-repo.ts` | `recoveryKey` (`:26`), `recoveryAuthority` (`:29`, hash of control receipts and admissions), `readRecovery` (`:40`), `reserveRecovery` (`:76`), `rememberRecovery` (`:99`), `resumable` (`:118`) | Persists each request in `project_recovery_requests`; a key already used by a mutation, admission or control receipt is `idempotency-conflict` (`:48`-`:62`) |
| `recovery-selection.ts` | `sectionRoots` (`:8`), `redoTarget` (`:47`), `dependentClosure` (`:77`), `recoverySelection` (`:94`), `regenerationEdit` (`:106`) | Resume = `allAffected`; Retry = the stage's unreused keys (`:94`-`:104`) |
| `recovery-conflict.ts` | `activeConflict` (`:15`), `conflictRefusal` (`:47`) | Returns `running` or `accepted-job` |
| `adapters/alignment/cache.ts` | `ModelFile` (`:10`), `ModelDeps` (`:27`), `alignmentModel` (`:33`, 95 286 046 bytes, pinned revision), `prepareModel` (`:40`) | See Communication |
| `adapters/alignment/prefetch.ts` | `prefetchModel` (`:15`) | Clears a lock left under this pid, takes the worker lock, then `prepareModel` with the optional seed (`:17`-`:23`) |
| `adapters/alignment/lock.ts` | `claimWorker(cacheDir, signal)` (`:7`) | One model worker per data directory via `alignment-worker.lock` |

## Entry points

| Entry | Site |
|---|---|
| `POST /api/projects/:id/rebuild/preview` → `previewRebuild` | `packages/app/src/edge/http/revisions.ts:148` |
| `POST /api/projects/:id/rebuild` → `startRebuild` (202) | `packages/app/src/edge/http/revisions.ts:159` |
| `POST /api/projects/:id/resume` → `recoverProject({ kind: "resume" })` | `packages/app/src/edge/http/actions.ts:244` |
| `POST /api/projects/:id/stages/:kind/retry` | `packages/app/src/edge/http/actions.ts:259` |
| `POST /api/projects/:id/stages/:kind/soften` (marks the stage's `softenableKeys` - refused Images/Thumbnail prompts, or refused short stills `shorts:N:image:M` of Video - then retry; 409 when none) | `packages/app/src/edge/http/actions.ts:271`, `:276`; `packages/app/src/slices/rebuild/soften.ts:32`, `:36` |
| `POST /api/projects/:id/stages/:kind/rerun` | `packages/app/src/edge/http/actions.ts:295` |
| `POST /api/projects/:id/reviews/:verdictId/redo` → `{ kind: "redo", item }` | `packages/app/src/edge/http/reviews.ts:88` |
| In-process callers of `recoverProject` | restart resume (`packages/app/src/main.ts:492`), review redos (`packages/app/src/slices/rebuild/review-redo.ts:115`), narration retries (`packages/app/src/slices/rebuild/narration-retry.ts:126`; a `running` refusal leaves the retry pending until the project's running step finishes and `onFinished` kicks it again, `:143`) |
| Subtitle alignment | `alignSubtitles` (`packages/app/src/adapters/alignment/index.ts:12`), called from `executeSubtitleRecipe` (`packages/app/src/slices/rebuild/runtime-subtitles.ts:74`, `:117`) |
| Startup model prefetch | `packages/app/src/main.ts:736` |

## Communication

| Channel | Payload in | Payload out |
|---|---|---|
| rebuild preview | `previewRebuildSchema`: `{ baseRevisionId, request: { kind: "allAffected" } \| { kind: "selected", workKeys: string[1..10000] } }` (`packages/app/src/slices/rebuild/model.ts:96`, `:84`) | `{ ok: true, value: RebuildPreview }` or refusal (`packages/app/src/slices/rebuild/model.ts:69`) |
| rebuild start | `startRebuildSchema`: `{ baseRevisionId, idempotencyKey: uuid, previewId, acknowledgeUnknownCosts: boolean, confirmedProvidedWorkKeys: string[] }` (`packages/app/src/slices/rebuild/model.ts:103`) | `{ ok: true, value: RebuildAdmission }` = `{ revisionId, admissionId, workIds, replayed }` (`packages/app/src/slices/rebuild/model.ts:62`); refusal reasons `no-project`, `conflict`, `stale-preview`, `invalid-selection`, `review-required`, `cost-ack-required`, `readiness` (`:73`) |
| recovery routes | `revisionControlSchema`: `{ baseRevisionId, idempotencyKey: uuid }` (`packages/app/src/slices/control/revision-control-schema.ts:3`); action `resume` \| `retry{stage}` \| `rerun{stage}` \| `redo{item}` (`packages/app/src/slices/rebuild/recovery-model.ts:6`) | `recoveryResultSchema`: admission + `warnings: string[]`, or refusal with reasons adding `no-revision`, `idempotency-conflict`, `invalid-edit`, `running`, `accepted-job`, `control-changed`, and optional `intentRevisionId`/`currentRevisionId` (`packages/app/src/slices/rebuild/recovery-model.ts:20`); HTTP 202 / 404 / 400 / 409 (`packages/app/src/edge/http/actions.ts:141`-`:165`) |
| `ExecutionSnapshot` (stored in `rebuild_previews.execution_json`) | `{ version: 1, submissions[{key, submit, uncertain}], catalogue, recipes[{key, stage, kind, requestFingerprint, fingerprint, logicalFingerprint, dependsOn, unresolved, deferred, input}], dispositions, assets[{id, path, available}], reviews[{key, fingerprint}], anchors, ordinals }` (`packages/app/src/slices/rebuild/preview-plan.ts:23`) | Parsed on start (`packages/app/src/slices/rebuild/service.ts:133`) and inside admission (`packages/app/src/slices/rebuild/admission-repo.ts:84`) |
| admission event | `deps.emit(projectId, { type: "project.updated" })` then `runner.tick(projectId)` (`packages/app/src/slices/rebuild/service.ts:160`, `:233`; `packages/app/src/slices/rebuild/recovery.ts:346`) | A tick failure is logged; admitted work stays recorded (`packages/app/src/slices/rebuild/service.ts:234`-`:238`) |

Recovery flow in `recoverProject`: read or reserve the request row (`packages/app/src/slices/rebuild/recovery.ts:89`, `:121`); refuse `control-changed` when the authority stamp moved (`:132`); for rerun/redo save a regeneration revision through `saveRevision` with a `beforeCommit` conflict check (`:152`); build the selection (`:196`), plan (`:208`), refuse unreviewed provided content (`:213`), blocked work (`:220`) and video/document reruns whose provider inputs are unfinished (`:229`); store the preview (`:254`). Readiness runs outside the lock (`:272`). The admit section re-reads the receipt (`:289`), rechecks authority (`:301`), the provider credential-generation stamp (`:305`) and conflicts, then calls `admitCheckedPreview` with key `recovery:<key>:admit` (`:320`). Every outcome is written back via `rememberRecovery`, so a repeated request returns the stored result.

Subtitle model: `prepareModel` returns the cached file when size and SHA-256 match (`packages/app/src/adapters/alignment/cache.ts:47`), else a verified seed copy (`:48`), else up to three download attempts (`:51`). Only `SubtitleModelDownloadInterrupted` errors retry, after `attempt × 1000` ms abortable waits (`:56`-`:61`); these come from fetch rejection (`:84`), HTTP 408/429/5xx (`:97`) and body read failure (`:112`). Other HTTP statuses, size/hash mismatch and filesystem errors throw at once. Each attempt stages into a private `.alignment-download-*` dir, verifies bytes and hash, then renames atomically (`:73`-`:151`). Per-attempt timeout is `model.timeoutMs ?? 300_000` (`:81`); the multilingual model sets 1 200 000 ms (`packages/app/src/adapters/alignment/multilingual.ts:15`). Exhaustion throws a three-attempt message with the last failure as `cause` (`:65`). A read error releases the reader without `cancel()` so the original error surfaces (`:105`-`:129`). `alignSubtitles` takes the worker lock before preparing the model, then decodes and aligns (`packages/app/src/adapters/alignment/index.ts:18`-`:47`); sentence-timed languages use no model (`:14`, `:58`). The cache directory is `subtitleModelDir(dataDir, language)` (`packages/app/src/kernel/paths.ts:78`). No paid provider is called.

## Composition

- `RebuildDeps` is assembled in `packages/app/src/main.ts:470` (db, paths, ids, clock, log, runner, catalogue, `measureAudio`, `providers`, `modelsFor`, `emit`).
- The aligner is injected as `alignSubtitles: aligner = alignSubtitles` into the runner's execution deps (`packages/app/src/main.ts:850`, `:866`); `sample-build` substitutes its own.
- Startup prefetch runs `prefetchModel({ cacheDir: subtitleModelDir(...), seed: options.subtitleModelSeed })` when `prefetchSubtitleModel` is set; failure is logged and non-fatal (`packages/app/src/main.ts:735`-`:744`).
- Tests: admission/recovery in `packages/app/src/slices/rebuild/recovery.test.ts`, `service-reuse.test.ts`, `service-*.test.ts`; download retries in `packages/app/src/adapters/alignment/cache-retry.test.ts:25`; prefetch locking in `packages/app/src/adapters/alignment/prefetch.test.ts:26`.

## Frontend

The web client calls these routes through `previewProjectRebuild` / `startProjectRebuild` (`packages/web/src/project/revision-api.ts:183`, `:199`, used by `packages/web/src/project/revision-workspace.tsx:227`, `:243`) and `resumeRun` / `retryStage` / `softenStage` / `rerunStage` via `recoveryRun` (`packages/web/src/project/api.ts:64`, `:202`), with Resume wired in `packages/web/src/project/use-actions.ts:203`. Screen detail lives in the uiux map.
