---
generated_at_commit: 3a9796eb7fec
generated_date: 2026-09-10
content_hash: beea3c3da582
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

## Paradigm

- Slice modules use functions over domain data; runner, adapters, edge, and boot orchestrate I/O. `packages/app/src/slices/library/save.ts:34-123` `packages/app/src/kernel/runner/index.ts:105-187`
- Finite values use string-literal unions and `as const` arrays; no enum declarations occur in source. `packages/app/src/kernel/pipeline.ts:1-36` `packages/app/src/kernel/ports/model.ts:1-44`
- Features are vertical slices: admission, article, batch, cancel, estimate, fonts, images, library, narration, reruns, research, settings, storage, subtitles, telemetry, thumbnail, and video. `packages/app/src/main.ts:39-68`

## Typing

- Shared TypeScript settings are `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, `isolatedModules`, and `forceConsistentCasingInFileNames`. `tsconfig.base.json:2-13`
- Ports and domain contracts use interfaces/type aliases; runtime boundaries use Zod schemas for HTTP, catalogue, DB rows, provider responses, collector batches, and worker messages. `packages/app/src/kernel/ports/llm.ts:1-80` `packages/app/src/edge/http/planning.ts:15-29` `packages/collector/src/model.ts:46-75`
- A source search found zero explicit `any` type usages across app, web, collector, and site source. The checked roots were app/src, web/src, collector/src and site/public.
- Five `as unknown as` assertions occur in web tests: one `ProjectSummary` fixture and four `RunConfig`/`ProviderStatus` fixtures or calls. `packages/web/src/project/summary.test.ts:15` `packages/web/src/project/readiness.test.ts:10-62`
- Two `@ts-expect-error` suppressions occur in playback tests, both documenting intentionally invalid route-schema input. `packages/app/src/slices/settings/playback.test.ts:128` `packages/app/src/slices/settings/playback.test.ts:143`
- Four accessibility `biome-ignore` directives occur in web source: three for scrollable/media elements and one for the form keyboard shortcut container. `packages/web/src/project/body-article.tsx:121` `packages/web/src/project/live-audio.tsx:102` `packages/web/src/project/body-audio.tsx:79` `packages/web/src/routes/play.tsx:270`

## Error handling

- Expected slice rule outcomes use discriminated result unions with `ok` and named failures such as `invalid`, `duplicate-name`, and `not-found`. `packages/app/src/slices/library/save.ts:29-34`
- HTTP validation errors use `application/problem+json` with status, title, instance, and structured issues; unexpected errors receive a correlation ID and generic client detail. `packages/app/src/edge/http/problem.ts:25-70`
- Provider failures are classified centrally; refusal, unsupported, and missing-key failures are terminal, while other failures retry up to four attempts. `packages/app/src/kernel/runner/attempt.ts:8-19` `packages/app/src/kernel/runner/attempt.ts:62-115`
- Provider error text is redacted before attempt storage or logging. `packages/app/src/kernel/runner/attempt.ts:119-145` `packages/app/src/kernel/log.ts:45-51`
- Logs are JSON lines with timestamp, level, event, optional project/stage/detail, date-based files, and mode `0600`. `packages/app/src/kernel/log.ts:5-42`

## Dependency injection

- `main.ts` constructs the database, clock, IDs, logger, hub, catalogue, adapter registry, updater, runner, and HTTP app, passing typed dependency objects and closures. `packages/app/src/main.ts:86-214` `packages/app/src/main.ts:286-386`
- No DI container or service locator is used; tests inject fake ports, clocks, IDs, databases, event sources, and HTTP answers through production interfaces. `packages/app/src/main.ts:286-386` `packages/app/src/adapters/fake/llm.ts:17-54` `packages/web/src/test-app.tsx:19-29`
- Biome enforces kernel, slice, and adapter import restrictions. `biome.json:40-116`
