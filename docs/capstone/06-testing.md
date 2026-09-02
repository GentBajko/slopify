---
mode: prescriptive
generated_date: 2026-09-02
capstone_version: 5.2.0
paths_covered:
  - "packages/app/src/**/*.test.ts"
  - "packages/app/test/**"
  - "packages/web/src/**/*.test.tsx"
  - "packages/collector/src/**/*.test.ts"
---

> Prescriptive: written from the design interview, not from code. Citations point at `architecture-interview.md §Q<n>` and planned paths; the runner, style, and coverage policy are `standards`'s and `stack`'s.

# Testing

## Layout

- Unit tests beside their module: `packages/app/src/slices/<slice>/*.test.ts`, `packages/app/src/kernel/**/*.test.ts` (§Q20). Pure functions (substitution, chunking, end-matter split, render plan, status derivation) carry the bulk.
- Integration tests in `packages/app/test/integration/`: boot the composition root against a temporary data directory and SQLite file, run slices through the runner with fake provider adapters, and render with the real bundled ffmpeg in CI (§Q20).
- One end-to-end smoke in `packages/app/test/e2e/skeleton.test.ts`: start the CLI on a random port, create a project with every stage Provided through the HTTP API, wait for `done` over SSE, assert the mp4 exists and downloads (§Q20, §Q30).
- `packages/web`: component tests for the Play form's admission states and the project page's lamp states; no browser e2e beyond the smoke above (§Q20).
- `packages/collector`: unit tests for dedup and aggregation.
- Exact run commands are recorded by `standards`/`stack`; the CI job runs them on Node 26 (§Q21).

## Doubles

- Ports: `packages/app/src/adapters/fake/{llm,tts,image}.ts`, in-memory adapters returning canned deltas, audio bytes with a declared duration, and image bytes; scriptable to fail on attempt n, to return a refusal, to stream or not, to report usage or not (§Q20, §Q28). These validate the seam's shape; provider semantics are never mocked past the interface.
- Clock and IDs: injectable (`kernel/clock.ts`, `kernel/ids.ts`) so retries, backoff, timestamps, and ULIDs are deterministic (§Q25).
- ffmpeg: real binary in integration and e2e; a stub spawner only in unit tests of the argument builder.
- Collector: an in-process fake HTTP endpoint in integration tests; never the live collector.
- No live provider calls in any suite (§Q28).

## Coverage shape

Planned emphasis: every logic scenario's branches and unhappy paths as tests (`logic/01`-`16` are the specification); the runner's graph, retry, resume, and cancel behaviour; substitution and admission rules; the render plan arithmetic. Light coverage by design: HTTP route wiring (covered by the smoke), the SPA's visual layer, the collector's hosting glue. No load, chaos, security, or accessibility suites (§Q20); accessibility is checked by the build-time constraints in `uiux/02-system.md`.
