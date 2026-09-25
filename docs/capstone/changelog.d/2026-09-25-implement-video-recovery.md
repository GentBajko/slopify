## 2026-09-25 - implement: Video Recovery Implementation

key: implement/2026-09-25-video-recovery@Q3

- What: restore unchanged local export admission and recover temporary subtitle-model interruptions for retained Slopify projects.
- Approach: service and transactional admission use identical planning metadata; new invocations retain configured-model metadata. Retry the complete private, verified model transfer at most three times with one-/two-second abortable delays.
- Rejected: bypassing stale checks could authorize changed work; dropping subtitles changes requested output; bundling the model enlarges installation; retrying the whole pipeline risks duplicate provider charges.
- Out of scope: glossary IPA, host-visible Docker storage, plain-text escapes and one-click Resume remain separate requested changes.
- Out of scope: no production restart, database mutation, provider generation, model download, version bump, push or publication.
- Task 1: `d1fe940` preserves rebuild planning and new execution context; red/green plain and prepared narration tests retain output IDs, avoid provider readiness/calls and prove exact replay/runtime readiness.
- Task 2: `4a83abd` adds bounded fetch/body/408/429/5xx recovery, permanent-error refusal, cancellation and actionable exhaustion with original error causes.
- Diff: `packages/app/src/slices/rebuild/service.ts`, `admission-repo.ts`, `service-reuse.test.ts`; `packages/app/src/adapters/alignment/cache.ts`, `cache-retry.test.ts`.
- Verification: 318 passing tests in 57 rebuild/alignment files; workspace typecheck, scoped Biome, diff checks and release build passed. Build retains a non-blocking bundle-size warning. No full-suite, actual production video/restart or native Windows rerun claimed.
- Chapters refreshed: `01-architecture-recovery.md` records the as-built planning/cache boundary; `06-testing.md` records scoped red/green and regression evidence.
- Scenarios absorbed: `logic/11-video-assembly.md` distinguishes retryable model preparation from local encoding; `logic/12-reruns-and-edits.md` records consistent planning and retained completed outputs; `logic/README.md` updates their labels.
- Review loop: two fresh three-lens rounds; zero confirmed, fixed or refuted findings; two consecutive dry rounds. Static-review limits remain documented in local review history.
- Preserve the ignored feature folder as local implementation/review history. Changes remain on `codex/video-recovery`, not deployed.
