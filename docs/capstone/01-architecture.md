---
content_hash: bc8ae7a8bf59
generated_at_commit: a3bf858ce7d1
absorbed_from:
 - features/2026-09-09-pausable-optional-runs@2026-09-10
 - features/2026-09-10-subtitles-fonts@2026-09-10
generated_date: 2026-09-10
capstone_version: 5.2.0
paths_covered:
 - "packages/app/src/**"
 - "packages/web/src/**"
 - "packages/site/**"
 - "packages/collector/src/**"
---

# Architecture

## Layers

Single-process modular monolith in `packages/app`, three layers with imports pointing inward only, enforced by the linter's import-boundary rule in CI (the tool is Biome's `noRestrictedImports` and `05-dependencies.md`):

| Layer | Planned directory | Contains | May import |
|---|---|---|---|
| kernel | `packages/app/src/kernel/` | `runner/` (the stage-graph runner of `logic/01`), `db/` (SQLite open, migrations, WAL), `ports/` (`LlmPort`, `TtsPort`, `ImagePort`, `SubtitleAligner` interfaces and adapter registry), `config/` (flags and `SLOPIFY_*` env), `clock.ts`, `ids.ts` (ULID), `log.ts` | nothing above it |
| slices | `packages/app/src/slices/` | `research/`, `article/`, `narration/`, `images/`, `thumbnail/`, `video/`, `subtitles/`, `fonts/`, `reruns/`, `cancel/`, `control/`, `library/`, `settings/`, `telemetry/`, `storage/`, `admission/` | kernel |
| edge | `packages/app/src/edge/` | `http/` (Hono routes per context), `events/` (SSE), `cli.ts` (the `slopify` entry) | slices, kernel |

Adapters live beside their port: `packages/app/src/adapters/llm/{openrouter,claude-code,codex}.ts`, `adapters/tts/*.ts`, `adapters/image/*.ts`, `adapters/alignment/*.ts`, `adapters/fake/*.ts`; the renderer `packages/app/src/slices/video/ffmpeg.ts` and the collector client `packages/app/src/slices/telemetry/collector-client.ts` are contained modules without ports.

The other packages: `packages/web` (React SPA), `packages/site` (static marketing page), `packages/collector` (serverless API + managed database). No package imports another's source; `app` consumes `web`'s build output as static files; `site` calls `collector` over HTTPS.

## Module boundaries

- Ports: `LlmPort.complete(messages, options) → AsyncIterable<delta> + usage`, `TtsPort.synthesize(text, voiceId, options) → audio stream + duration`, `ImagePort.generate(prompt, size, options) → image bytes + metadata`. Each adapter declares capabilities (`streams`, `reportsUsage`, `webSearch` for LLM; `streams` for TTS; supported sizes for image). Domain types only cross the seam; vendor payloads never leave the adapter. Adapter kinds for `LlmPort`: HTTP gateway (OpenRouter, key from settings) and local agent CLI (Claude Code, Codex: spawned non-interactively with streaming structured output, authenticated by the CLI's own login, reported `installed` when the binary resolves on PATH).
- Slices expose one function per scenario step to the edge (`startRun`, `retryStage`, `pauseProject`, `resumeProject`, `changeProviders`, `cancelProject`, `editArticle`,...) and to the runner; they never import each other's internals; shared rules live in the kernel (`ids`, `clock`, `db`) or in `slices/admission/` and `slices/storage/`, which every stage calls.
- Edge routes hold no rules: they validate the request shape, call one slice function, and map results and errors to responses.
- `packages/web` may only talk to `app` through the typed API client.

## Entry points

| Process | Entry | Command |
|---|---|---|
| Local app | `packages/app/src/edge/cli.ts` (`bin: slopify`) | `npx @gentbajko/slopify@latest [--port 6969] [--host 127.0.0.1] [--data-dir ~/.slopify] [--no-open]` |
| Collector | `packages/collector/src/index.ts` | deployed as serverless functions |
| Marketing site | `packages/site/` static build | deployed as static files |

`cli.ts`: parse flags and env → resolve the data directory and refuse a second instance (`logic/14`) → open SQLite, run migrations → mark stages found `running` as `failed` "interrupted" (`logic/01`) → clean unattached staging files (`logic/05`) → build ports and registry → start Hono on `host:port` → print the URL → open the browser unless `--no-open` → on SIGINT stop the server and exit (the interrupted mark happens at the next boot). No cron. Subtitle alignment forks a short-lived Node child process running ONNX Runtime WASM; it is created only for enabled subtitles (`packages/app/src/adapters/alignment/runner.ts`).

## Communication

- Browser ↔ app: JSON over HTTP under `/api/<context>/...` (`projects`, `prompts`, `entries`, `settings`, `usage`, `providers`, `fonts`), RFC 9457 `application/problem+json` errors, no versioning, no pagination. Files under `/files/<projectId>/<asset>`. Live updates over SSE: `/api/events/projects/<id>` (stage status, progress, streamed article text, image landed, and `project.updated` to refresh saved provider choices and pause state) and `/api/events/global` (running tally). Uploads stage through `POST /api/staging` with progress events (`logic/05`).
- App → providers: HTTPS through the HTTP adapters; local CLIs through child processes with structured stdout.
- App → ffmpeg: child process with arguments built by `slices/video/ffmpeg.ts`; progress parsed from stdout into render percentage (`logic/11`).
- App → collector: HTTPS `POST /events` batches from the local queue, idempotent by event ID (`logic/16`).
- Site → collector: HTTPS `GET /aggregates` every 5 s (`logic/16`).
- No message broker, no queue service, no webhooks.

## Composition

`packages/app/src/main.ts` is the composition root: it constructs `db`, `clock`, `ids`, `log`, the adapter registry from settings, the runner, each slice with its dependencies as constructor or function parameters, and the Hono app with routes and SSE hubs. No DI container. `slices/control/lock.ts` keeps a per-database, per-project promise queue so pause, resume, provider edits, output mutations and deletion cannot race each other.

## Frontend

- Rendering model: client-rendered SPA (React 19, Vite build) served as static files by the local Hono server; client-side routing for Projects, Play, Prompts, Intros & Outros, Settings, Usage, Project; no SSR, no islands. Marketing page: static site generation with a client-side fetch of the live counters.
- Client entry: `packages/web/src/main.tsx`; one bundle plus route-level code splitting; initial bundle under 250 kB gzipped.
- State: server state through a query library invalidated by SSE events; UI state in component state; the Play form's tab-session memory in the SPA (`uiux/03-experience.md`).
- Form drafts: the Shell's `FormDraftsProvider` retains unsaved prompt edits by editor identity and the Play configuration in memory across route changes. Successful saves clear the corresponding prompt draft, and project creation resets Play. This lets tutorial Back and Settings navigation preserve unfinished work; nothing is written to browser storage.
- Design system: shadcn/ui restyled to `uiux/02-system.md`'s tokens on Radix primitives.
- API-client seam: the client generated from Hono's route types (its RPC client); no hand-rolled fetch layer.
- Versioning: server and SPA ship in one package; the API returns a version header and the SPA offers a reload on mismatch. No mobile app, no offline sync.
- Getting started: `packages/web/src/tutorial/` owns an optional 20-step guide, opened from navigation or the empty Projects page. It routes through real Settings, prompt editors, Play and the created project. Video selection explains silent slideshows, WAV export and article-only runs. A dedicated subtitle step exposes the actual mode, font upload, preview and size controls; it never runs alignment. The final spotlight follows the selected output. Completion uses provider/voice readiness, form validity flags and confirmed save/create IDs; it never captures API keys or starts generation. The spotlight follows `data-tour` anchors across scrolling, resizing and routed content, allowing interaction with the active section and its select menus while dimming the rest. Back, Skip and Exit remain available outside pending saves; the guide waits for the first-run notice to be dismissed.

## Local subtitles and fonts

- `packages/app/src/kernel/ports/subtitles.ts` defines `SubtitleAligner`, passed from `main.ts` into the existing video slice. `slices/subtitles/prepare.ts` derives the spoken transcript, fingerprints audio/text/gaps, reuses word timing when unchanged, snapshots the font, and prepares SRT/VTT/ASS assets. Subtitles add no stage and make no paid provider request (`logic/17`).
- `adapters/alignment/` owns verified model download/cache, decoded 16 kHz PCM, a per-cache process lock, and abortable child-process inference using `onnxruntime-web/wasm`. The model is lazy; app boot and Subtitle Off do not download it (`adapters/alignment/index.ts`, `cache.ts`, `runner.ts`).
- `slices/fonts/` owns bounded system discovery, SFNT metadata validation, opaque font IDs, custom TTF/OTF uploads and preview extraction; `edge/http/fonts.ts` exposes list/upload/file routes. Bundled Barlow and its OFL/source records ship from `src/assets/fonts/` into `dist/assets/fonts/` (`scripts/copy-assets.mjs`).
- `packages/web/src/subtitles/` supplies shared mode/font/size controls for Play and the final project stage. `project/subtitles.tsx` saves through `PATCH /api/projects/:id/subtitles`; `project/body-video.tsx` uses saved output metadata for native VTT tracks, preventing double captions on burned exports.
