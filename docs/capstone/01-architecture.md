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

# Architecture

## Layers

- `packages/app/src/kernel` owns DB, config, clocks, IDs, locks, logs, ports, and runner; it imports no slices, edge, or adapter registry. `biome.json:40-62` `packages/app/src/kernel/runner/index.ts:1-52`
- `packages/app/src/slices` owns feature modules and uses kernel contracts; it cannot import edge, adapters, or the adapter registry. `biome.json:66-87`
- `packages/app/src/adapters` implements provider, alignment, and FFmpeg integrations; it may import only approved kernel ports/utilities. `biome.json:95-116`
- `packages/app/src/edge` owns CLI, Hono routes, SSE hub, browser launcher, and update worker. `packages/app/src/edge/http/app.ts:69-91`
- `packages/web` is the React SPA; `packages/collector` is a separately deployed worker with D1; `packages/site` is a static marketing site. `packages/web/src/main.tsx:1-37` `packages/collector/src/index.ts:19-32` `packages/site/package.json:1-14`

## Module boundaries

- Ports are `LlmPort`, `TtsPort`, `ImagePort`, `SubtitleAligner`, and `Registry`; stages receive wrapped `StageProviders`, never adapters. `packages/app/src/kernel/ports/llm.ts:1-80` `packages/app/src/kernel/runner/providers.ts:1-59`
- Stage dispatch registers `research`, `article`, `audio`, `images`, `thumbnail`, and `video`. `packages/app/src/main.ts:331-386`
- Adapter registry registers LLM `openrouter`, `claude-code`, `codex`, `gemini`; TTS `elevenlabs`, `openai-tts`, `cartesia`, `inworld`; image `fal`, `replicate`, `openai-image`, `google-image`. `packages/app/src/adapter-registry.ts:51-89`
- Catalogue curation validates model, aspect, web-search, thinking, and TTS splitting capabilities. `packages/app/src/catalog/registry.ts:5-86`

## Entry points

- CLI: `packages/app/src/edge/cli.ts:1-39`; boot/server: `packages/app/src/main.ts:86-256`; HTTP listen: `packages/app/src/main.ts:431-445`.
- Batch timer: `packages/app/src/main.ts:218-236`; alignment worker: `packages/app/src/adapters/alignment/worker.ts:1-80`; update worker: `packages/app/src/edge/update-worker.ts:1-120`.
- Collector fetch worker: `packages/collector/src/index.ts:19-32`; site is static Wrangler output. `packages/site/package.json:1-14`

## Communication

- Hono registers `/api/health`, staging, project planning/project/preview/actions/subtitles, update, fonts, prompts, entries, telemetry, usage, settings, and providers. `packages/app/src/edge/http/app.ts:69-91`
- Project routes carry `RunDraft`, `ProjectListBody`, `ProjectBody`, and `CreatedProjectBody`; planning carries `CostEstimate` and `QueueEntry`; actions carry action-specific JSON. `packages/app/src/edge/http/projects.ts:64-158` `packages/app/src/edge/http/planning.ts:15-104` `packages/web/src/api.ts:68-87`
- Staging carries `StagedFile` or multipart `file`; prompts/entries carry `Prompt`/`PromptDraft` and `Entry`/`EntryDraft`; providers carry `ProviderStatus`, model arrays, and masked key status. `packages/app/src/edge/http/staging.ts:33-70` `packages/app/src/edge/http/prompts.ts:37-57` `packages/app/src/edge/http/entries.ts:34-52` `packages/app/src/edge/http/providers.ts:38-128`
- Project SSE `/api/events/projects/:id` carries `ProjectEvent` union: stage state/progress, article delta, LLM preview, image landed, project state/update. `packages/app/src/edge/http/app.ts:128-134` `packages/app/src/kernel/events.ts:3-71`
- Global SSE `/api/events/global` carries running count, staging events, and project state/update. `packages/app/src/edge/events/hub.ts:20-29` `packages/app/src/edge/events/hub.ts:119-141`
- Provider calls use an in-process queue capped at five globally and per-provider catalogue limits; LLM streams `LlmEvent`, TTS streams audio bytes, and images return `GeneratedImage`. `packages/app/src/kernel/runner/queue.ts:12-77` `packages/app/src/kernel/runner/providers.ts:79-222`
- Batch ordering is SQLite `batches`/`project_queue`, advanced by `pumpQueue`; no broker or external queue service exists. `packages/app/src/slices/batch/index.ts:19-57` `packages/app/src/main.ts:218-236`
- Telemetry posts `{events: CollectorEvent[]}` to collector `/events` and receives `{ok, accepted}`; site reads `{aggregates: Aggregates}` from `/aggregates`. `packages/app/src/slices/telemetry/collector-client.ts:1-90` `packages/collector/src/index.ts:43-78` `packages/collector/src/index.ts:102-117`

## Composition

- `boot()` constructs database, catalogue, registry, hub, telemetry, updater, runner, and Hono app; `wire()` injects stage implementations and provider wrappers. `packages/app/src/main.ts:86-214` `packages/app/src/main.ts:286-386`
- No DI container or service locator is used; dependencies are typed parameters and closures. `packages/app/src/main.ts:286-386`

## Frontend

- The local app serves a client-rendered React 19/Vite SPA and falls back SPA paths to `index.html`. `packages/web/src/main.tsx:1-37` `packages/app/src/edge/http/app.ts:142-150`
- Routes are `/`, `/play`, `/projects/$projectId`, prompts, entries, settings, and usage; prompt kind and entry category are URL search state. `packages/web/src/router.tsx:20-115` `packages/web/src/router.tsx:215-233`
- The client uses React Query, TanStack Router, Radix-based UI primitives, Tailwind styling, and Barlow fonts. `packages/web/src/main.tsx:20-37` `packages/web/package.json:19-31`
- The API seam is generated `hc<AppType>` at `${origin}/api`; EventSource carries SSE and same-origin URLs serve files. `packages/web/src/api.ts:60-132` `packages/web/src/events.ts:50-118`

### Planning and event payloads

Planning requests are `{draft: RunDraft, expectedWords?: number, items?: {title: string, values: Record<string,string>}[]}`; batch creation additionally requires `requestId: UUID`. Estimate returns `{estimates: CostEstimate[]}`; batch and queue listing return `{queue: QueueEntry[]}` (`packages/app/src/edge/http/planning.ts:15`). Provider catalogue status returns `{updatedAt, path, warning, source}`; refresh takes no body. Provider model listing returns `{models, allowsCustom: false, notice, warning?}` (`packages/app/src/edge/http/providers.ts:38`).

Project SSE payloads share projectId: stage.state adds stage/state/failureReason?; stage.progress adds stage/current/total; article.delta adds text; llm.preview adds stage/callId/text/label?/reset?; image.landed adds outputId/index; project.state adds state; project.updated has no extra field. Global running.count carries count. These are server-to-client events; the client sends no SSE body (`packages/app/src/kernel/events.ts:7`, `packages/web/src/events.ts:50`).
