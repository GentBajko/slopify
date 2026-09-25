---
generated_at_commit: 4a83abd9a070
generated_date: 2026-09-25
content_hash: 0e4fe7ab93e18
absorbed_from: features/2026-09-25-video-recovery@2026-09-25
paths_covered:
  - ':(top)packages/app/src/adapters/alignment/**'
  - ':(top)packages/app/src/slices/rebuild/**'
  - ':(top)packages/app/src/edge/http/revisions.ts'
---

# Video Recovery Boundaries

This scoped chapter describes the recovery patch at `4a83abd9a070`, after version 1.5.1. It supplements the historical broad architecture chapter without claiming that unrelated modules were reverified or that the patch was deployed.

## Layers

The HTTP edge calls rebuild slice services. The slice plans revision work, validates readiness and writes admission records under project control. The injected runner executes local subtitle/export recipes or provider recipes. The alignment adapter owns downloading the pinned model, audio decoding and the alignment worker (`packages/app/src/edge/http/revisions.ts:65`, `packages/app/src/slices/rebuild/service.ts:23`, `packages/app/src/adapters/alignment/index.ts:10`).

## Module boundaries

- `preview-plan.ts` selects affected work and dependencies, stores exact recipes and computes the review fingerprint. Dependency traversal stops at reused outputs. `selectedCatalogue` filters model metadata to the selected recipe provider choices, with an additional TTS dependency for selected narration preparation (`packages/app/src/slices/rebuild/preview-plan.ts:55`, `:80`, `:226`).
- `service.ts` checks the persisted preview and readiness, then replans under project control with the current complete catalogue. It passes that same planning catalogue to `admission-repo.ts` for the transactional recheck. The selected snapshot still governs reviewed recipes, costs and readiness; it is not used to rederive omitted upstream chunk limits (`packages/app/src/slices/rebuild/service.ts:150`, `:158`, `packages/app/src/slices/rebuild/admission-repo.ts:86`).
- Admission binds reusable narration, rejoins matching unfinished reservations or creates new invocations. New invocations retain `executionCatalogue` for the revision's configured choices, including upstream narration metadata needed by local exports. Existing contexts and finished assets are not rewritten. Duplicate mutation identities return the saved receipt (`packages/app/src/slices/rebuild/admission-repo.ts:22`, `:89`, `:143`, `packages/app/src/slices/rebuild/runtime-plan.ts:15`).
- Provider readiness is derived from new submissions rather than every configured provider. Local-only selected work can proceed without another LLM, TTS or image call (`packages/app/src/slices/rebuild/service-readiness.ts:15`, `:37`).
- `prepareModel` first reuses a verified cached model, otherwise allows at most three complete transfer attempts. Fetch/read interruptions and HTTP 408/429/5xx retry after abortable one- and two-second delays; each fetch retains its five-minute timeout. Private staging, byte/SHA-256 verification and atomic publication remain inside each attempt. Cancellation, permanent HTTP failures and verification/filesystem errors do not become transfer retries. An errored reader is released without cancellation masking its original read error (`packages/app/src/adapters/alignment/cache.ts:34`, `:63`, `:98`, `:113`). Model preparation still precedes decoding and alignment (`packages/app/src/adapters/alignment/index.ts:16`).

## Entry points

`previewRebuild` and `startRebuild` are the service entry points for review and admission (`packages/app/src/slices/rebuild/service.ts:46`, `:79`). The local subtitle dispatcher handles timing, cues and files; export execution is separate (`packages/app/src/slices/rebuild/runtime-subtitles.ts:49`, `packages/app/src/slices/rebuild/runtime-export.ts:25`). `alignSubtitles` is the injected adapter; `prepareModel` is its cache boundary (`packages/app/src/adapters/alignment/index.ts:10`, `packages/app/src/adapters/alignment/cache.ts:34`).

## Communication

The existing HTTP contract is unchanged: preview accepts a base revision and all-affected or selected work; start accepts the base, mutation identity, preview ID, unknown-cost acknowledgment and provided-content confirmations. The corresponding responses are `RebuildPreview` and `RebuildAdmission`; stale or changed inputs produce a typed refusal (`packages/app/src/edge/http/revisions.ts:109`, `packages/app/src/slices/rebuild/model.ts:96`).

The private `ExecutionSnapshot` contains version 1, submission decisions, catalogue, exact recipes, dispositions, asset availability, provided-content reviews, desired anchors and narration ordinals. It is validated when loaded from `rebuild_previews.execution_json` (`packages/app/src/slices/rebuild/preview-plan.ts:23`, `packages/app/src/slices/rebuild/service.ts:123`).

`prepareModel` takes a cache directory, abort signal and optional progress callback, with injected model metadata, fetch and optional wait for tests. It returns a verified file path or throws. Exhausted transient attempts report a subtitle-model download error naming three attempts and preserve the last failure as a cause. It does not call a paid provider (`packages/app/src/adapters/alignment/cache.ts:16`, `:34`, `:57`).

## Composition

The app supplies catalogue, revision storage, provider readiness and runner to `RebuildDeps`. After a committed admission the service emits `project.updated` and wakes the runner; a wake failure leaves durable admitted work recorded (`packages/app/src/slices/rebuild/service.ts:23`, `:164`, `:172`). Tests replace provider/network boundaries while exercising actual revision planning, SQLite admission and file verification. Plain and prepared narration recovery asserts saved context, unchanged asset IDs, no new provider calls/readiness, materialization and exact admission replay (`packages/app/src/slices/rebuild/service-reuse.test.ts:69`). Transfer tests cover fetch/body/503 recovery, exhaustion, canceled backoff and permanent rejection (`packages/app/src/adapters/alignment/cache-retry.test.ts:25`).

## Frontend

No frontend implementation is covered by this scoped chapter. The existing project workspace calls the HTTP contract above; the separate one-click Resume request is not implemented by this first recovery patch.
