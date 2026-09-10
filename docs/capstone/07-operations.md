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

# Operations

## Processes

| Process | Command/config | Source |
|---|---|---|
| App build/start | `npm run build`; `node packages/app/dist/edge/cli.js` | `package.json:8-17`; `packages/app/package.json:24-27` |
| Web dev/build | `npm run dev`; `vite build` in web workspace | `package.json:8-17`; `packages/web/package.json:6-9` |
| Collector | `wrangler dev/deploy`; local/remote D1 schema commands | `packages/collector/package.json:6-12` |
| Site | `wrangler deploy` / `--dry-run` | `packages/site/package.json:6-8` |

The app is a single Node process containing HTTP, runner, SSE, provider adapters and child processes (`packages/app/src/main.ts:83-142`).

## Configuration

CLI flags take precedence over environment, then defaults (`packages/app/src/kernel/config/index.ts:24`).

| Variable | Default | Consuming code | Documentation |
|---|---|---|---|
| SLOPIFY_PORT | 6969 | `packages/app/src/kernel/config/index.ts:25` | app README |
| SLOPIFY_HOST | 127.0.0.1 | `packages/app/src/kernel/config/index.ts:26` | app README |
| SLOPIFY_DATA_DIR | ~/.slopify | `packages/app/src/kernel/config/index.ts:27` | app README |
| SLOPIFY_NO_OPEN | false | `packages/app/src/kernel/config/index.ts:35` | app README |
| SLOPIFY_FFMPEG / FFMPEG_BIN | unset; bundled/recovered FFmpeg | `packages/app/src/adapters/ffmpeg.ts:1` | app README |
| SLOPIFY_COLLECTOR_URL | collector.slopify.stream | `packages/app/src/slices/telemetry/collector-client.ts:26` | test seam |
| CODEX_HOME | CLI default home | `packages/app/src/adapters/llm/codex-models.ts:29` | local metadata fallback |
| SLOPIFY_UPDATE_TOKEN | <redacted> | `packages/app/src/main.ts:158` | internal candidate protocol |
| SLOPIFY_UPDATE_PENDING / SLOPIFY_UPDATE_FAILED | unset | `packages/app/src/main.ts:160` | internal candidate protocol |
| SLOPIFY_SKIP_MANAGED_UPDATE | unset | `packages/app/src/updater/forward.ts:9` | internal launcher bypass |
| PATH / platform home and font-directory variables | inherited | `packages/app/src/kernel/cli-command.ts:33`, `packages/app/src/slices/fonts/discovery.ts:30` | OS integration |

Saved CLI paths are SQLite settings, not environment values. Provider selections live in project configuration. Provider keys are stored in SQLite `provider_keys` (`packages/app/src/kernel/db/migrations/0001-init.sql:11`).

Boot creates user-only paths, acquires the instance lock, prepares FFmpeg, opens/migrates SQLite, marks interrupted stages, reconciles storage, creates the catalogue and registry, and wires the runner (`packages/app/src/main.ts:83-142`).

## Infrastructure

The data directory contains SQLite, projects, staging, logs, fonts, alignment models and managed updates (`packages/app/src/kernel/paths.ts`). The collector Worker is `slopify-collector`, entry `src/index.ts`, custom domain `collector.slopify.stream`, D1 binding `DB` (`packages/collector/wrangler.jsonc:3-27`). The site serves `./public` at `slopify.stream` (`packages/site/wrangler.jsonc:3-10`).

## Developer workflow

Workspace scripts provide lint, typecheck, tests, build, start, web development and Cloudflare deployment (`package.json:8-17`). App build runs TypeScript and copies migrations/assets/web output (`packages/app/package.json:24-27`). Migrations are forward-only and run at boot (`packages/app/src/kernel/db/migrate.ts`). Model catalogue refresh uses the GitHub raw source, validates YAML/size, retains `.previous`, atomically renames `.next`, and keeps the last valid value on failure (`packages/app/src/catalog/store.ts:7-8,20-22,54-92`).

Batch planning estimates before confirmation, validates up to 50 items, transactionally creates queue entries, and pumps projects sequentially (`packages/app/src/edge/http/planning.ts:15-31,60-108`; `packages/app/src/slices/batch/index.ts:38-90`). Provider execution is globally capped at five concurrent calls with per-provider catalogue limits (`packages/app/src/kernel/runner/queue.ts:10-34`; `packages/app/src/main.ts:330-337`).

## Subtitle operation

`onnxruntime-web` provides local WASM alignment; the model cache verifies pinned weights and uses a filesystem lock (`packages/app/src/adapters/alignment/cache.ts`; `packages/app/src/adapters/alignment/lock.ts`). Font discovery and uploads are owned by `packages/app/src/slices/fonts/`. Subtitle preparation and video export write captions/font snapshots, render a part file, and replace final rows with rollback handling (`packages/app/src/slices/subtitles/prepare.ts`; `packages/app/src/slices/video/write-export.ts`).

## CLI discovery and provider operation

Saved CLI paths and 15-second readiness probes cover Claude, Codex and Gemini (`packages/app/src/slices/settings/cli-paths.ts`; `packages/app/src/slices/settings/cli-status.ts`). The launcher resolves recognized Windows Node shims and rejects unknown batch scripts without shell interpolation (`packages/app/src/kernel/cli-command.ts`). Claude uses stream JSON, safe mode and strict MCP configuration (`packages/app/src/adapters/llm/claude-code.ts:20-78`). Production model choices come from the validated YAML catalogue. Legacy discovery can read Codex `CODEX_HOME/models_cache.json` (`packages/app/src/adapters/llm/codex-models.ts:20-44`). The Gemini discovery fallback parses installed metadata and aliases (`packages/app/src/adapters/llm/gemini-models.ts:6-75`).

## In-app updates

The updater checks npm registry state, obtains a mutation barrier, installs an exact stable version under `<data-dir>/updates/<version>`, starts a detached candidate with a token, checks readiness, and atomically activates the candidate (`packages/app/src/updater/service.ts:21-74`; `packages/app/src/updater/plan.ts:28-119`; `packages/app/src/updater/worker.ts:32-142`). Pre-activation failure restores the previous entry/database; activation state is stored in `updates/current.json` (`packages/app/src/updater/install-flow.ts`; `packages/app/src/updater/plan.ts:83-119`).

## Live previews and recovery

LLM previews and narration audio previews are bounded process-memory state and are invalidated on retry, interruption, completion expiry or shutdown (`packages/app/src/edge/events/preview-cache.ts`; `packages/app/src/kernel/audio-preview.ts`). Pause persists before aborting work; completed pieces survive and unfinished stages return to pending (`packages/app/src/edge/http/actions.ts:158-184`; `packages/app/src/kernel/runner/index.ts:235-260`). Cancel retains committed outputs and does not tick the project (`packages/app/src/edge/http/actions.ts:176-184`). Telemetry delivery failures leave rows queued locally (`packages/app/src/slices/telemetry/`; `packages/app/src/main.ts:107-116`).

## Release commands

`npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm audit --audit-level=high` are the Linux CI gate. Windows additionally runs actual FFmpeg/subtitle/CLI checks and catalogue/queue/batch/recovery suites (`.github/workflows/ci.yml:1`). A pushed `v*` tag runs `npm publish --provenance --access public --workspace @gentbajko/slopify` through npm trusted publishing (`.github/workflows/release.yml:1`). Website and collector deploy independently through `npm run deploy --workspace @slopify/site` and `npm run deploy --workspace @slopify/collector`; `npm run deploy:check` dry-runs both (`package.json:18`).

There is no container configuration. Start the packaged app with `npx @gentbajko/slopify@latest`; process detachment belongs to the host shell/service manager. The HTTP healthcheck is `/api/health` (`packages/app/src/edge/http/app.ts:68`).
