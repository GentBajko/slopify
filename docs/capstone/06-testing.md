---
content_hash: e1434169b705
generated_at_commit: a3bf858ce7d1
absorbed_from:
 - features/2026-09-09-pausable-optional-runs@2026-09-10
 - features/2026-09-10-subtitles-fonts@2026-09-10
generated_date: 2026-09-10
capstone_version: 5.2.0
paths_covered:
 - "packages/app/src/**/*.test.ts"
 - "packages/app/src/adapters/alignment/**"
 - "packages/app/test/**"
 - "packages/web/src/**/*.test.tsx"
 - "packages/collector/src/**/*.test.ts"
---

> The runner, the style and the coverage policy are `standards.md`'s and
> `05-dependencies.md`'s; this chapter is the shape of the suite.

# Testing

## Layout

- Unit tests beside their module: `packages/app/src/slices/<slice>/*.test.ts`, `packages/app/src/kernel/**/*.test.ts`. Pure functions (substitution, chunking, end-matter split, render plan, status derivation) carry the bulk.
- Integration tests in `packages/app/test/integration/`: boot the composition root against a temporary data directory and SQLite file, run slices through the runner with fake provider adapters, and render with the real bundled ffmpeg in CI.
- The original end-to-end smoke in `packages/app/test/e2e/skeleton.test.ts`: start the CLI on a random port, create a project with every stage Provided through the HTTP API, wait for `done` over SSE, assert the mp4 exists and downloads.
- `packages/app/test/e2e/optional-outputs.test.ts` boots the real app and checks article-only completion, a provided MP3 converted into a downloadable PCM WAV, and a silent MP4 without an audio stream. These run in both Linux and Windows CI. Video-slice tests also cover intro/outro gaps, output replacement and retention after failed or aborted exports.
- Control tests cover durable pause, draining concurrent work, resume, serialized provider edits, catalog errors and unfinished narration reset. Runner tests assert independent image scheduling and source-aware dependencies.
- `packages/web`: component tests for the Play form's admission states and the project page's lamp states; no browser e2e beyond the smoke above.
- Tutorial tests exercise the real router, Settings, prompt editors and Play with fake API responses: notice gating, saved-key readiness, accepted/refused saves, keyword fields, delayed navigation, explicit project creation and finishing without generation. Spotlight tests cover keyboard boundaries, related select portals, missing anchors and geometry. The interactive walkthrough is also checked manually in Chrome at desktop and narrow viewport sizes with intercepted API responses, without real provider calls.
- `packages/collector`: unit tests for dedup and aggregation.
- Exact run commands are recorded by `standards`/`stack`; the CI job runs them on Node 26.

## Doubles

- Ports: `packages/app/src/adapters/fake/{llm,tts,image}.ts`, in-memory adapters returning canned deltas, audio bytes with a declared duration, and image bytes; scriptable to fail on attempt n, to return a refusal, to stream or not, to report usage or not. These validate the seam's shape; provider semantics are never mocked past the interface.
- Clock and IDs: injectable (`kernel/clock.ts`, `kernel/ids.ts`) so retries, backoff, timestamps, and ULIDs are deterministic.
- ffmpeg: real binary in integration and e2e; a stub spawner only in unit tests of the argument builder.
- Collector: an in-process fake HTTP endpoint in integration tests; never the live collector.
- Subtitle alignment: inject `SubtitleAligner` for deterministic export/timing tests; cache and worker tests use bounded fixtures and fake children. Real downloaded-model timing proofs are manual checks, separate from the normal unit suite (`packages/app/src/kernel/ports/subtitles.ts`, `adapters/alignment/*.test.ts`).
- No live provider calls in any suite.

## Coverage shape

Planned emphasis: every logic scenario's branches and unhappy paths as tests (`logic/01`-`17` are the specification); the runner's graph, retry, resume, and cancel behaviour; substitution and admission rules; the render plan arithmetic. Light coverage by design: HTTP route wiring (covered by the smoke), the SPA's visual layer, the collector's hosting glue. No load, chaos, security, or accessibility suites; accessibility is checked by the build-time constraints in `uiux/02-system.md`.

## Subtitle and font regressions

- `packages/app/src/slices/subtitles/{captions,prepare,model}.test.ts`: cue wrapping/timestamps, ASS/text escaping, invalid timing/style, intro/body/outro offsets including gaps, reuse after style/format changes and invalidation after audio changes.
- `packages/app/src/slices/fonts/*.test.ts`, `edge/http/fonts.test.ts`: bounded SFNT/name-table parsing, corrupt/traversal/oversize/multipart rejection, opaque-ID storage, system-directory fixtures, selected-face preview and actual FFmpeg font selection.
- `packages/app/src/adapters/alignment/*.test.ts`: exact model size/hash checks, corrupt cache and interrupted downloads, cross-process lock and aborted queue waits, child lifecycle, text normalization and CTC mismatch handling.
- `packages/app/src/edge/http/projects.test.ts` rejects unavailable active fonts before creating a project; `edge/http/actions.test.ts` covers final-stage-only changes, paused queuing and active-work rejection.
- `packages/app/test/video-render.test.ts` uses real bundled FFmpeg with fake word timing: visible burned captions, a relative executable override, WAV subtitle export, timing reuse, retention after alignment failure, and a database trigger that rejects a font output insert to verify rollback of previous media bytes/parameters/rows.
- `packages/web/src/routes/project-subtitles.test.tsx`, `routes/play.test.tsx`, `subtitles/config.test.ts`, `tutorial/runner.test.tsx`: shared controls, upload/preview/save states, actual-output native-track behavior, paused Save/Resume guidance, invalid hidden style normalization when Off, and the optional subtitle tutorial step.
- `.github/workflows/ci.yml` runs alignment/font/subtitle tests and the real subtitle-export regression in the Windows job as well as the normal Linux suite. Real-model manual proof measured 68 seconds of narration in 17.7 seconds and 205 seconds in 53 seconds, with about 728 MiB RSS on the proof machine; these are observed runs, not latency or memory guarantees.
