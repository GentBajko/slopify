---
absorbed_from:
  - features/2026-09-09-pausable-optional-runs@2026-09-10
  - features/2026-09-10-editable-projects@2026-09-12
scenario: pipeline-lifecycle
mockup_row: S9
screens:
  - 06-play
  - 08-project
depends_on: []
generated_at_commit: e9226a34aa8a
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: 0bd3282cd084
paths_covered:
  - ":(top)packages/app/src/kernel/pipeline.ts"
  - ":(top)packages/app/src/kernel/runner/**"
  - ":(top)packages/app/src/slices/admission/start.ts"
  - ":(top)packages/app/src/slices/batch/**"
  - ":(top)packages/app/src/slices/rebuild/**"
  - ":(top)packages/app/src/slices/revisions/**"
  - ":(top)packages/app/src/slices/trash/service.ts"
  - ":(top)packages/app/src/main.ts"
  - ":(top)packages/app/src/slices/reviews/model.ts"
  - ":(top)packages/app/src/slices/checkpoints/schema.ts"
  - ":(top)packages/app/src/kernel/db/migrations/0005-revision-work.sql"
  - ":(top)packages/app/src/kernel/db/migrations/0007-review-checkpoints.sql"
  - ":(top)packages/app/src/kernel/config/index.ts"
  - ":(top)packages/app/src/slices/admission/model.ts"
  - ":(top)packages/app/src/slices/play-drafts/start.ts"
---

# 01 Pipeline lifecycle

A project has seven stage rows (`research`, `article`, `audio`, `images`, `thumbnail`, `video`, `document`; `packages/app/src/kernel/pipeline.ts:11`), immutable revisions, revision-scoped desired work (`revision_work`, its pieces and reservations) and retained output manifests. Stage rows and the project state are projections of that work; dispatch authority lives only in `revision_work` (`packages/app/src/kernel/runner/work-authority.ts:21`, `packages/app/src/kernel/runner/work-authority.ts:31`).

## Trigger & preconditions

- Admission creates the project, its seven stages and the baseline revision in one transaction, then admits the baseline's work (`startRun`, `packages/app/src/slices/admission/start.ts:47`; `admitInitialRevision`, `packages/app/src/slices/rebuild/runtime-admission.ts:32`). Callers: reviewed Play Start, the batch queue, a scheduled run and `POST /api/projects` (see 04 Run admission).
- Each stage's initial state follows its source: `provide` → `provided`, `off` → `skipped`, anything else → `pending`. Exception: `video` Off with audio not Off starts `pending`, because the Video stage then exports the combined WAV (`packages/app/src/slices/admission/start.ts:38`, `packages/app/src/slices/admission/start.ts:102`).
- A saved edit creates another revision without generation; only a reviewed rebuild admits changed or missing work (`saveRevision`, `packages/app/src/slices/revisions/mutations.ts:58`; `startRebuild`, `packages/app/src/slices/rebuild/service.ts:84`).

## Steps

1. Build recipes from the selected revision, the retained manifest and the active source choices. Each recipe has a key, dependency keys and request/logical fingerprints (`buildRecipes`, `packages/app/src/slices/rebuild/recipe-build.ts:28`; `planRevisionWork`, `packages/app/src/slices/rebuild/recipe-work.ts:42`).
2. Admit: `admitInitialRevision` refuses when the head moved or the project already has work ("started twice"), then inserts one invocation per planned recipe, binding reusable narration first (`packages/app/src/slices/rebuild/runtime-admission.ts:37`, `packages/app/src/slices/rebuild/runtime-admission.ts:42`, `packages/app/src/slices/rebuild/runtime-admission.ts:60`). A rebuild admits under an idempotency receipt (`admissionReceipt`, `packages/app/src/slices/rebuild/admission-repo.ts:22`).
3. The runner is ticked only after commit (`packages/app/src/slices/admission/start.ts:45`). Stage readiness follows `deps`: research → article → audio/thumbnail; images have no dependency; video needs article, audio and images; document needs article and, optionally, thumbnail (`packages/app/src/kernel/runner/graph.ts:9`). `dependenciesOf` narrows it: a `from_prompt` thumbnail has none, a Video Off export needs article+audio, a document with thumbnail Off needs only article (`packages/app/src/kernel/runner/graph.ts:89`). `provided` and `skipped` release a dependency like `done` (`packages/app/src/kernel/runner/graph.ts:29`); a failed or canceled thumbnail still releases the document (`packages/app/src/kernel/runner/graph.ts:24`, `packages/app/src/kernel/runner/graph.ts:34`).
4. `claimWork` moves `revision_work` from `pending` to `running` only while `dispatch_state='allowed'` and the full work identity matches (`packages/app/src/kernel/runner/work-authority.ts:21`).
5. `runRevisionInvocation` walks the work's pieces in order, skipping `done` ones; a `deferred` input returns `held`. Pieces dispatch by key prefix: `subtitles:`, `export:`, `document:`, `review:`, `voices:`, `youtube:`, `shorts:`, `animate:`, provider (`llm`/`tts`/`image`) or local (`packages/app/src/slices/rebuild/runtime-run.ts:17`).
6. Provider calls go through `stageProviders`: a CLI plan-allowance wait sits outside the queue (`packages/app/src/kernel/runner/providers.ts:137`), then one app-wide FIFO queue admits at most 5 concurrent calls and at most `min(5, providerLimit)` per provider; waiting starts no attempt or idle timer (`createProviderQueue`, `packages/app/src/kernel/runner/queue.ts:12`). `maySubmit` re-checks authority before every physical request or retry: work and piece still `allowed`, and a reservation still owned by the current head's fingerprints (`packages/app/src/kernel/runner/work-authority.ts:31`, `packages/app/src/kernel/runner/work-authority.ts:49`).
7. `attempt` makes up to 4 attempts (waits 2 s, 8 s, 30 s); timeouts are 120 s for llm/tts, 300 s for image, 900 s for video (image-to-video) (`packages/app/src/kernel/runner/attempt.ts:14`, `packages/app/src/kernel/runner/attempt.ts:19`).
8. Results publish as immutable bytes to the originating revision; a compatible current reservation may select them (`commitRevisionOutputs`, `packages/app/src/slices/revisions/publish.ts:28`; `publicationAuthority`, `packages/app/src/slices/revisions/publication-rules.ts:13`).
9. Export builds MP4, silent MP4, combined WAV or nothing from the selected image order and active narration/caption timeline (`exportSnapshot`, `packages/app/src/slices/rebuild/runtime-export-inputs.ts:30`; `slideshowImages`, `packages/app/src/slices/rebuild/runtime-export.ts:258`).

## Branches

- Automatic reviews: per reviewed stage (`article`, `images`, `narration`, `thumbnail`, `shorts`) a reviewer model passes or fails each item in mode `off`, `flag` or `redo`; `redo` remakes a failed item up to `retries` (default 2, range 0–5) and then keeps it flagged (`packages/app/src/slices/reviews/model.ts:8`, `packages/app/src/slices/reviews/model.ts:13`, `packages/app/src/slices/reviews/model.ts:35`). Review pieces run as `review:` work (`packages/app/src/slices/rebuild/runtime-run.ts:35`). Shallow: review verdict logic in `packages/app/src/slices/reviews/` not inventoried here.
- Saving during active work retains matching reservations and revokes affected future dispatch; submitted work settles to its origin revision (`transitionRevisionWork`, `packages/app/src/slices/rebuild/transition-repo.ts:29`).
- A reviewed retry reuses complete compatible requests and retained files; an accepted asynchronous continuation is fetched on the same piece, not resubmitted (`bindNarrationReuse`, `packages/app/src/slices/rebuild/runtime-narration-reuse.ts:13`; `requiresNewSubmission`, `packages/app/src/slices/rebuild/preview-retained.ts:113`).
- Review checkpoints (Audio, Images, Video/export) hold only their dependency closure; independent work stays eligible (`admitReviewedCheckpoints`, `packages/app/src/slices/rebuild/runtime-checkpoints.ts:10`; `packages/app/src/slices/checkpoints/schema.ts:5`).
- A batch runs one project at a time: `pumpQueue` finishes entries whose status is `done`/`partial`/`failed`/`canceled`, stops at a paused one or one with calls in flight, and ticks the first remaining entry (`packages/app/src/slices/batch/index.ts:83`). Several videos from one reviewed Start go through that queue unless the draft turned Queue off, in which case each is started as its own run and they go side by side (`createReviewedRuns`, `packages/app/src/slices/play-drafts/start.ts:150-157`; scenario 04).
- A rename runs nothing: on the first save that changes the title, `keptSubject` stores the title the project was made with as `config.subjectTitle`, and no later edit drops it (`packages/app/src/slices/revisions/subject.ts:7-11`, called from `saveRevision`, `packages/app/src/slices/revisions/mutations.ts:93`). Every recipe fingerprint that takes the title reads `subjectOf(config)` = `subjectTitle ?? title` (`packages/app/src/slices/admission/model.ts:285-290`), so no planned work changes; a step that runs again for another reason uses the new name (scenario 12).

## Unhappy paths

- Provider fault, first tier: `refusal`, `unsupported`, `auth`, `missing_key` and `unavailable` are terminal and never retried in-call (`packages/app/src/kernel/runner/attempt.ts:28`). A Retry-After above 60 s is not slept in-call (`packages/app/src/kernel/runner/attempt.ts:39`).
- Provider fault, second tier: after in-call attempts run out on `rate_limit`, `timeout` or `dropped`, the work returns to `pending` with a persisted `retry_at` — up to 4 waits of ~2/4/8/16 min (base 2 min, ×2, ±25 % jitter); a provider Retry-After is the floor, and one above 60 min is reported instead of waited (`packages/app/src/kernel/runner/retry-policy.ts:13`, `packages/app/src/kernel/runner/retry-policy.ts:40`; `deferWork`, `packages/app/src/kernel/runner/work-authority.ts:82`). Due waits are cleared and ticked unless the project is paused (`dueRetries`, `packages/app/src/kernel/runner/work-authority.ts:105`).
- A failing piece is marked `failed` (or `pending` when aborted) and the error is prefixed with the piece label; completed sibling pieces stay `done` (`packages/app/src/slices/rebuild/runtime-run.ts:51`).
- Restart: stage rows left `running` become `failed`/`interrupted`, or `pending` when the project is paused; nothing auto-resumes (`markInterruptedStages`, `packages/app/src/main.ts:1017`). Boot then recovers checkpoint work and reconciles storage, deferring reconciliation during an update activation (`packages/app/src/main.ts:275`, `packages/app/src/main.ts:282`).
- Missing retained bytes stay visible as unavailable and need an explicit affected rebuild (`retainedPreviewPlan`, `packages/app/src/slices/rebuild/preview-retained.ts:9`).
- A stage-finish write failure leaves the row `running`; the next boot marks it interrupted (`packages/app/src/kernel/runner/index.ts:155`).

## State transitions

- Stage states: `pending`, `running`, `done`, `failed`, `canceled`, `provided`, `skipped` (`packages/app/src/kernel/pipeline.ts:22`).
- Project state is derived by `derive`: persisted pause → `paused`; any running stage or pending stage with `retry_at` → `running`; any canceled → `canceled`; any failed → `partial` if the first asked-for headline stage (video, else audio, else article) is `done`, otherwise `failed`; all satisfied → `done`; else `pending` (`packages/app/src/kernel/runner/graph.ts:52`, `packages/app/src/kernel/runner/graph.ts:57`). A supplied headline does not count as made (`packages/app/src/kernel/runner/graph.ts:83`).
- `revision_work.state`: `pending` → `running` (claim) → `done`/`failed`, or back to `pending` with `retry_at` (defer); `dispatch_state` is `held`, `allowed` or `draining`; finishing to `pending` resets dispatch to `held` (`packages/app/src/kernel/db/migrations/0005-revision-work.sql:14`, `packages/app/src/kernel/runner/work-authority.ts:59`).
- Checkpoint states: `configured`, `pending-review`, `held`, `released`, `satisfied`, `invalidated`, `canceled` (`packages/app/src/kernel/db/migrations/0007-review-checkpoints.sql:9`).
- Trash: a project enters `project_trash`, refused while the run is busy; queued, checkpointed or restart-leftover work is simply not picked up; purge after 30 days (`trashProject`, `packages/app/src/slices/trash/service.ts:73`; `packages/app/src/slices/trash/service.ts:286`).

## Invariants

- Every provider attempt and published output belongs to a durable work identity (`packages/app/src/kernel/runner/work-authority.ts:5`).
- Current revision ownership, not completion order, decides selection (`packages/app/src/kernel/runner/work-authority.ts:49`, `packages/app/src/slices/revisions/publication-rules.ts:13`).
- A project is admitted at most once initially (`packages/app/src/slices/rebuild/runtime-admission.ts:42`).
- Opening Play, saving, restoring, downloading, applying a template or editing a schedule never itself dispatches a provider call; only admission and reviewed rebuild insert work (`packages/app/src/slices/revisions/restore.ts:24`, `packages/app/src/slices/rebuild/service.ts:166`).
- A paused project's deferred retries are not woken except by Resume (`packages/app/src/kernel/runner/work-authority.ts:105`).

## Outcomes & side effects

Admission persists execution state and wakes the runner; outputs are immutable per revision. Stage transitions emit project events, including `retryAt` and `failureKind` on deferred work (`packages/app/src/kernel/runner/index.ts:180`). Run notifications are sent through `createRunNotifier` (`packages/app/src/main.ts:292`). Save and Restore persist revisions without generation. Trash is reversible for 30 days; Delete now removes immediately (`deleteNow`, `packages/app/src/slices/trash/service.ts:236`).

## Dimensions not in play

- Multi-user ownership: none; the server binds `127.0.0.1:6969` by default (`packages/app/src/kernel/config/index.ts:20`).
- Remote worker orchestration: none; one in-process runner and one provider queue (`packages/app/src/kernel/runner/queue.ts:10`).
- Exactly-once billing with external providers: not guaranteed; idempotency holds at Slopify's request, admission and publication boundaries (`packages/app/src/slices/rebuild/admission-repo.ts:22`).
