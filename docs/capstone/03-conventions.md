---
generated_at_commit: 4cfe3473f74d
generated_date: 2026-09-13
capstone_version: 5.2.0
content_hash: 149e46c2276e
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

# Conventions

Research-document scope, verified at 735cf5b (2026-09-25): optional typed documents cross existing ports and strict schemas; empty collections are omitted to preserve old recipe identities. CLI input uses a closed stdin pipe. A fixed SDK reader owns request-only files and exposes IDs, not paths. Provider errors fail closed on uncertain delivery; no general local tools are enabled. Other observations below retain their historical checkpoint.

Observed source: `f4c4f7b3295a` (2026-09-13).

## Paradigm

- Slice modules use functions over domain data; runner, adapters, edge, and boot orchestrate I/O. `packages/app/src/slices/library/save.ts:34-123` `packages/app/src/kernel/runner/index.ts:105-187`
- Finite values use string-literal unions and `as const` arrays; no enum declarations occur in source. `packages/app/src/kernel/pipeline.ts:1-36` `packages/app/src/kernel/ports/model.ts:1-44`
- Features are vertical slices: admission, article, batch, cancel, checkpoints, control, estimate, fonts, images, library, narration, Play drafts, project templates, rebuilds, reruns, research, retained revisions, schedules, settings, storage, subtitles, telemetry, thumbnail, and video. The composition root wires these slices without a runtime container. `packages/app/src/main.ts:27` `packages/app/src/main.ts:63` `packages/app/src/main.ts:96`

## Typing

- Shared TypeScript settings are `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, `isolatedModules`, and `forceConsistentCasingInFileNames`. `tsconfig.base.json:2-13`
- Ports and domain contracts use interfaces/type aliases; runtime boundaries use Zod schemas for HTTP, catalogue, DB rows, provider responses, collector batches, and worker messages. `packages/app/src/kernel/ports/llm.ts:1-80` `packages/app/src/edge/http/planning.ts:15-29` `packages/collector/src/model.ts:46-75`
- A source search found zero explicit `any` annotations/assertions across app, web, collector, and site source. The checked roots were app/src, web/src, collector/src and site/public.
- Eight `as unknown as` assertions occur in tests: three HTTP dependency-fixture casts and five project summary/readiness fixture casts. `packages/app/src/edge/http/diagnostics.test.ts:17` `packages/app/src/edge/http/storage.test.ts:10` `packages/web/src/project/summary.test.ts:15` `packages/web/src/project/readiness.test.ts:10`
- Two `@ts-expect-error` suppressions occur in playback tests, both documenting intentionally invalid route-schema input. `packages/app/src/slices/settings/playback.test.ts:128` `packages/app/src/slices/settings/playback.test.ts:143`
- Eleven accessibility `biome-ignore` directives occur in web source: scrollable reading regions, live/retained media without standalone caption tracks, conditional/burned caption media, and the Play form keyboard shortcut container. `packages/web/src/project/body-article.tsx:77` `packages/web/src/project/body-video.tsx:46` `packages/web/src/project/revision-history.tsx:142` `packages/web/src/routes/play.tsx:236`

## Error handling

- Expected slice rule outcomes use discriminated result unions with `ok` and named failures. Draft, revision, template, checkpoint and schedule services return explicit conflict/not-found/invalid/readiness states rather than throwing for those expected branches. `packages/app/src/slices/play-drafts/model.ts:75` `packages/app/src/slices/project-templates/model.ts:8` `packages/app/src/slices/checkpoints/model.ts:43` `packages/app/src/slices/schedules/model.ts:9`
- HTTP validation errors use `application/problem+json` with status, title, instance, and structured issues; unexpected errors receive a correlation ID and generic client detail. `packages/app/src/edge/http/problem.ts:25-70`
- Provider failures are classified centrally; refusal, unsupported, and missing-key failures are terminal, while other failures retry up to four attempts. `packages/app/src/kernel/runner/attempt.ts:8-19` `packages/app/src/kernel/runner/attempt.ts:62-115`
- Provider error text is redacted before attempt storage or logging. `packages/app/src/kernel/runner/attempt.ts:119-145` `packages/app/src/kernel/log.ts:45-51`
- Logs are JSON lines with timestamp, level, event, optional project/stage/detail, date-based files, and mode `0600`. `packages/app/src/kernel/log.ts:5-42`

## Dependency injection

- `main.ts` constructs the database, clock, IDs, logger, hub, catalogue, adapter registry, updater, runner, schedule runner, and HTTP app, passing typed dependency objects and closures. `packages/app/src/main.ts:96` `packages/app/src/main.ts:137` `packages/app/src/main.ts:181` `packages/app/src/main.ts:231` `packages/app/src/main.ts:263`
- No DI container or service locator is used; tests inject fake ports, clocks, IDs, databases, event sources, provider readiness and HTTP answers through production interfaces. `packages/app/src/slices/play-drafts/draft.fake.ts:17` `packages/app/src/slices/rebuild/service.fake.ts:1` `packages/app/src/adapters/fake/llm.ts:17` `packages/web/src/test-app.tsx:19`
- Biome enforces kernel, slice, and adapter import restrictions. `biome.json:40-116`
