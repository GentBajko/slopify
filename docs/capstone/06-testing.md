---
generated_at_commit: f4d66867e39f
generated_date: 2026-09-10
content_hash: fbc488ce49d2
paths_covered:
  - ":(top)packages/app/src/**"
  - ":(top)packages/web/src/**"
  - ":(top)packages/collector/**"
  - ":(top)packages/site/**"
  - ":(top)package*.json"
  - ":(top)packages/*/package.json"
  - ":(top)biome.json"
  - ":(top)tsconfig*.json"
  - ":(top).github/workflows/**"
---

# Testing

## Layout

- Root Vitest runs project configs under `packages/*/vitest.config.ts`; `npm test` invokes `vitest run`. Source: `vitest.config.ts:1-7`; `package.json:8-15`.
- App includes `src/**/*.test.ts` and `test/**/*.test.ts`; web includes `.test.ts/.test.tsx` under `src` in `happy-dom`; collector includes `src/**/*.test.ts`. Source: `packages/app/vitest.config.ts:3-8`; `packages/web/vitest.config.ts:5-12`; `packages/collector/vitest.config.ts:3-8`.
- App test directories cover adapters, catalog, edge, kernel, updater, slices, integration-style `packages/app/test`, and `test/e2e/{skeleton,optional-outputs}.test.ts`; web covers components, routes, Play, project, subtitles, tutorial, updates; collector uses `src/index.test.ts`. Source: repository test-file inventory.
- CI runs `npm ci`, lint, typecheck, `npm test`, build, and audit on Node 26. Windows additionally runs FFmpeg, e2e, alignment, font, subtitle, CLI, LLM, settings, and real subtitle-export suites. Source: `.github/workflows/ci.yml:7-38`.
- The e2e skeleton boots the real app on an ephemeral localhost port, generates temporary FFmpeg audio/images, stages them over HTTP, watches SSE, and verifies the finished media. Source: `packages/app/test/e2e/skeleton.test.ts:42-84,133-180`.
- Release verification on 2026-09-10: 1,904 tests passed, one platform skip; lint, type checking, build and audit passed. Browser tests use isolated local fixtures and do not start paid generation.

## Doubles

- Fake LLM/TTS/image adapters provide canned streams/bytes and controllable failures through kernel ports. Source: `packages/app/src/adapters/fake/{llm,tts,image}.ts`; `packages/app/src/kernel/ports/llm.ts:48-64`.
- Tests inject clocks, IDs, fetch functions, runners, and temporary data directories for deterministic retries, timestamps, catalogue refreshes, and filesystem state. Source: `packages/app/src/kernel/clock.ts`; `packages/app/src/kernel/ids.ts`; `packages/app/src/catalog/store.test.ts:19-38`.
- FFmpeg is real in integration/e2e tests; skeleton fixtures are generated with the same static binary used by rendering. Source: `packages/app/test/e2e/skeleton.test.ts:23-74`.
- Subtitle alignment is injected as `SubtitleAligner`; alignment tests use bounded fixtures and fake children. Source: `packages/app/src/kernel/ports/subtitles.ts:7-15`; `packages/app/src/adapters/alignment/*.test.ts`.
- Catalogue tests use temporary YAML and fake HTTP responses for validation, reload, recovery, replacement, and backups. Source: `packages/app/src/catalog/store.test.ts:7-39`.
- Web tests use Testing Library/`happy-dom`; model-picker tests fake API responses for cache, refresh, warnings, saved IDs, custom IDs, and provider races. Source: `packages/web/vitest.config.ts:7-10`; `packages/web/src/play/model-picker.test.tsx:52-225`.
- Batch tests use temporary SQLite and fake runner/storage dependencies. Source: `packages/app/src/slices/batch/index.test.ts:57-133`.
- Estimate tests use a temporary catalogue and typed drafts for stage prices, unknown CLI costs, image/thumbnail counts, and uncertainty. Source: `packages/app/src/slices/estimate/index.test.ts:9-65`.
- Thinking tests use a fake `LlmPort` and assert forwarding/rejection before provider calls. Source: `packages/app/src/catalog/registry.test.ts:31-57`.
- Queue tests use held promises and abort controllers for capacity, independent providers, cancellation, and slot release. Source: `packages/app/src/kernel/runner/queue.test.ts:4-67`.
- No suite makes live paid provider calls. Source: `packages/app/src/catalog/registry.test.ts:58-109`.

## Coverage shape

- Highest coverage is in pipeline rules, runner graph/attempts/pieces, retries/resume/cancel, adapters, admission/substitution, narration, storage, subtitles/fonts, updater, and telemetry. Source: repository test-file inventory under `packages/app/src`.
- Catalogue coverage includes schema limits, local recovery, refresh replacement, curation, thinking, image compatibility, and TTS splitting. Source: `packages/app/src/catalog/{store,registry}.test.ts:8-109`.
- Batch/queue coverage includes durable ordering, one active project, paused/finished transitions, rollback, provider concurrency, and cancellation. Source: `packages/app/src/slices/batch/index.test.ts:57-133`; `packages/app/src/kernel/runner/queue.test.ts:4-67`.
- Estimate coverage checks USD rows, unknown charges, catalogue date, assumptions, generated-length ranges, image counts, and thumbnail pricing. Source: `packages/app/src/slices/estimate/index.ts:21-137`; `packages/app/src/slices/estimate/index.test.ts:30-65`.
- Thinking coverage spans port types, catalogue maps, registry conversion, admission schemas, provider-change validation, and adapter requests. Source: `packages/app/src/kernel/ports/llm.ts:41-57`; `packages/app/src/slices/control/providers.ts:10-108`.
- Subtitle/font regressions cover cue/timing/style reuse, font parsing/upload rejection, system fonts, HTTP contracts, and real FFmpeg export. Source: `packages/app/src/slices/subtitles/*.test.ts`; `packages/app/src/slices/fonts/*.test.ts`; `.github/workflows/ci.yml:35-38`.
- HTTP wiring, SPA visual details, and collector hosting glue have lighter direct coverage. Source: repository test-file inventory; `packages/collector/src/index.test.ts`.
- No configured load, chaos, security, or accessibility Vitest suite exists. Source: `vitest.config.ts:3-7`; package Vitest configs.

Character-mode tests cover exact boundaries, internal spaces, Unicode, oversized sentences, empty input, API validation/persistence and changed-count recovery. Browser verification covers 1440/390/320-pixel layout, editable character budgets, icon-only updater and the availability dot, without generation or update requests (`packages/app/src/slices/narration/chunk.test.ts:147`, `packages/app/src/edge/http/projects.test.ts:1`, `packages/web/src/play/chunking.test.tsx:1`). Windows runs the sentence-segmentation suite (`.github/workflows/ci.yml:39`).
