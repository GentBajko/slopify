---
generated_at_commit: f4c4f7b3295a
generated_date: '2026-09-13'
capstone_version: 5.2.0
content_hash: f9cf47bb782f
paths_covered:
  - :(top)packages/app/src/**
  - :(top)packages/web/src/**
  - :(top)packages/collector/**
  - :(top)packages/site/**
  - :(top)package*.json
  - :(top)packages/*/package.json
  - :(top)biome.json
  - :(top)tsconfig*.json
  - :(top).github/workflows/**
  - :(top)README.md
  - :(top)packages/app/README.md
  - :(top).githooks/**
  - :(top)packages/app/scripts/**
  - :(top)packages/web/vite.config.ts
absorbed_from:
  - features/2026-09-10-editable-projects@2026-09-12
  - features/2026-09-10-play-redesign-drafts@2026-09-13
  - features/2026-09-10-review-checkpoints@2026-09-13
---

# Operations

Migration `0007-review-checkpoints.sql` adds durable gate and approval tables. Boot recovery restores held/released checkpoint authority against the current project head. The project PATCH/approve routes publish secret-free project events; approval wakes the in-process runner only after its transaction commits.

Observed source: `f4c4f7b3295a` (2026-09-13). Commands below describe the repository and its packaged entry points; they do not assert that a deployment has occurred. The app requires Node.js 26 or newer (`packages/app/package.json:13`).

## Processes

There are no repository container commands or Compose services. The app server owns HTTP, SSE, the stage runner, batch pumping, local schedule ticks, telemetry flushing and provider dispatch in one Node process; media, CLI-provider, alignment and update work can create child processes (`packages/app/src/main.ts:96`, `packages/app/src/main.ts:292`, `packages/app/src/main.ts:303`, `packages/app/src/main.ts:411`).

| Process | Exact local command or internal launch | Dependencies and ownership | Source |
|---|---|---|---|
| App build and start | `npm start` expands to `npm run build && node packages/app/dist/edge/cli.js` | Builds the SPA, then app; uses writable data directory, SQLite, FFmpeg and available provider credentials | `package.json:12`, `package.json:13`, `packages/app/src/main.ts:86` |
| Already-built app | `node packages/app/dist/edge/cli.js` | Supports `--host`, `--port`, `--data-dir`, `--no-open`; opens the browser unless disabled | `packages/app/src/edge/cli.ts:9` |
| Fresh repository data directory | `npm run start:fresh` | Builds, then starts with `--data-dir .slopify-local`; it does not erase an existing directory | `package.json:14` |
| Installed package CLI | `npx @gentbajko/slopify@latest`; alternatively `npm install -g @gentbajko/slopify` then `slopify` | Package bin maps to `dist/edge/cli.js`; a newer activated managed installation may be forwarded to | `packages/app/package.json:16`, `packages/app/README.md:17`, `packages/site/public/index.html:133`, `packages/app/src/updater/forward.ts:8` |
| SPA development | `npm run dev` from root; equivalent `npm run dev --workspace @slopify/web` | Runs Vite; `/api` and `/files` proxy to the separately running app at `http://127.0.0.1:6969`; Vite port is not set in this config | `package.json:15`, `packages/web/package.json:7`, `packages/web/vite.config.ts:10` |
| Collector development | `npm run schema:local --workspace @slopify/collector`, then `npm run dev --workspace @slopify/collector` | D1 schema applied to Wrangler's local copy; `wrangler dev` serves the Worker, documented at `http://127.0.0.1:8787` | `packages/collector/package.json:8`, `README.md:151` |
| Collector deployment | `npm run deploy --workspace @slopify/collector`; dry run `npm run deploy:check --workspace @slopify/collector` | Wrangler, configured Cloudflare account/domain and D1 binding; schema application is a separate command | `packages/collector/package.json:10`, `packages/collector/wrangler.jsonc:3` |
| Marketing deployment | `npm run deploy --workspace @slopify/site`; dry run `npm run deploy:check --workspace @slopify/site` | Wrangler uploads static `public/` assets; no application server or build script in this workspace | `packages/site/package.json:6`, `packages/site/wrangler.jsonc:9` |
| English alignment worker | Internal `fork(<dist>/adapters/alignment/worker.js, [], options)` using the current Node executable | Parent passes validated input over IPC; requires cached ONNX model and decoded PCM, uses one WASM thread, and has no HTTP port or standalone CLI input | `packages/app/src/adapters/alignment/runner.ts:9`, `packages/app/src/adapters/alignment/runner.ts:20`, `packages/app/src/adapters/alignment/worker.ts:13`, `packages/app/src/adapters/alignment/worker.ts:31` |
| Update worker | Internal `node <dist>/edge/update-worker.js <planPath>` with an IPC channel | Detached child requires a plan and connected parent; installs with npm, waits for handoff, then starts/validates the candidate | `packages/app/src/updater/install.ts:18`, `packages/app/src/edge/update-worker.ts:5` |
| npm update installer | Resolved npm executable plus `installArgs(directory, version)`; installs `@gentbajko/slopify@<version>` with explicit prefix, registry, cache and private npm configuration arguments | Child of update worker; production dependencies only, fixed version, no global/workspace install, no audit/funding prompts; 15-minute timeout | `packages/app/src/updater/worker.ts:129`, `packages/app/src/updater/plan.ts:34` |
| Update candidate | Internal `node <installedEntry> --host <host> --port <port> --data-dir <dataDir> --no-open` | Detached Node child, same application port/data directory, update environment protocol and `logs/updates.log`; starts after the previous listener shuts down | `packages/app/src/updater/plan.ts:60`, `packages/app/src/updater/worker.ts:45` |
| Managed-version forwarding | Internal `node <activeEntry> <original CLI arguments>` | Inherits stdio and forwards to a newer valid activated install; does not detach the normal CLI | `packages/app/src/updater/forward.ts:8` |
| FFmpeg installer and media children | Internal `node <resolved ffmpeg-static/install.js>` when recovery is needed; verification `<ffmpeg> -version`; media execution uses generated argument arrays | Installer downloads into private data-dir staging, verifies and renames into `bin/`; rendering, probing and PCM decoding execute the resolved binary, without a shell | `packages/app/src/adapters/ffmpeg.ts:21`, `packages/app/src/adapters/ffmpeg.ts:54`, `packages/app/src/adapters/ffmpeg.ts:79`, `packages/app/src/slices/video/ffmpeg.ts:45`, `packages/app/src/adapters/alignment/audio.ts:11` |
| CLI text providers | Resolved `claude` plus `claudeCodeArgs(request)`, `codex` plus `codexArgs(request)`, or `gemini` plus `geminiArgs(request, allowlist)` | Argument-array launches; installed/logged-in CLI or saved executable path required. Arguments depend on prompt, model, thinking and web-search selection | `packages/app/src/adapters/llm/run-cli.ts:63`, `packages/app/src/adapters/llm/claude-code.ts:43`, `packages/app/src/adapters/llm/codex.ts:33`, `packages/app/src/adapters/llm/gemini.ts:23` |
| Browser/folder integration | Browser: `open <url>`, `cmd /c start "" <url>`, `cmd.exe /c start "" <url>` on WSL, or `xdg-open <url>`. Folder: `explorer.exe <path>`, `open <path>`, or `xdg-open <path>`; WSL first runs `wslpath -w <path>` | Host graphical session/integration utilities; browser failure does not fail app boot | `packages/app/src/edge/open-browser.ts:32`, `packages/app/src/edge/open-folder.ts:8` |

`SIGINT` awaits app shutdown. Normal packaged startup has no daemon/detach flag; detachment is external to its four CLI options (`packages/app/src/edge/cli.ts:9`, `packages/app/src/edge/cli.ts:42`).

## Configuration

CLI flags override their environment counterparts, then defaults. `--no-open` unconditionally disables opening; otherwise empty, `0` and `false` are false and other nonempty values are true. Ports must be integers from 1 to 65535 and data paths resolve against the current working directory (`packages/app/src/kernel/config/index.ts:23`).

The inventory distinguishes application inputs from values deliberately set for children. Provider keys are SQLite values, not environment configuration consumed by Slopify's provider adapters (`packages/app/src/slices/settings/repo.ts:18`, `packages/app/src/kernel/db/migrations/0001-init.sql:11`).

| Variable | Default | Consuming code or child environment writer | Documented where |
|---|---|---|---|
| SLOPIFY_PORT | `6969` | `packages/app/src/kernel/config/index.ts:24` | `README.md:68`, `packages/app/README.md:49` |
| SLOPIFY_HOST | `127.0.0.1` | `packages/app/src/kernel/config/index.ts:25` | `README.md:69`, `packages/app/README.md:50` |
| SLOPIFY_DATA_DIR | `<os.homedir()>/.slopify` | `packages/app/src/kernel/config/index.ts:26` | `README.md:70`, `packages/app/README.md:51` |
| SLOPIFY_NO_OPEN | Unset; browser opens | `packages/app/src/kernel/config/index.ts:34` | `README.md:71`, `packages/app/README.md:52` |
| SLOPIFY_FFMPEG | Unset; bundled/recovered FFmpeg | `packages/app/src/adapters/ffmpeg.ts:22`; legacy resolver `packages/app/src/slices/video/ffmpeg.ts:26` | `README.md:72`, `packages/app/README.md:53` |
| FFMPEG_BIN | Unset; lower-priority explicit binary override at boot; recovery sets its temporary installer target | `packages/app/src/adapters/ffmpeg.ts:22`, `packages/app/src/adapters/ffmpeg.ts:55` | Runtime remedy in `packages/app/src/adapters/ffmpeg.ts:75` |
| SLOPIFY_COLLECTOR_URL | `https://collector.slopify.stream` | `packages/app/src/slices/telemetry/collector-client.ts:29` | Source comment at `packages/app/src/slices/telemetry/collector-client.ts:23` identifies a test seam; invalid/non-HTTP override falls back |
| CODEX_HOME | `<os.homedir()>/.codex` | `packages/app/src/adapters/llm/codex-models.ts:32` | Source-only fallback for `models_cache.json` |
| SLOPIFY_UPDATE_TOKEN | <redacted> | `packages/app/src/main.ts:166`; set on candidate children by `packages/app/src/updater/worker.ts:56` | Internal update protocol |
| SLOPIFY_UPDATE_PENDING | Unset; inactive unless equal to `1` | `packages/app/src/main.ts:168`; child writer `packages/app/src/updater/worker.ts:57` | Internal candidate activation protocol |
| SLOPIFY_UPDATE_FAILED | Unset; inactive unless equal to `1` | `packages/app/src/main.ts:180`; child writer `packages/app/src/updater/worker.ts:58` | Internal rollback notice |
| SLOPIFY_SKIP_MANAGED_UPDATE | Unset; bypass only when equal to `1`; candidate children set it | `packages/app/src/updater/forward.ts:9`, `packages/app/src/updater/worker.ts:55` | Internal launcher bypass |
| PATH | Inherited; empty search path fallback | Case-insensitive lookup in `packages/app/src/kernel/cli-command.ts:33` and `packages/app/src/adapters/llm/gemini-models.ts:74`; npm search in `packages/app/src/updater/plan.ts:136` | OS integration, source comments |
| WINDIR | `C:\Windows` | `packages/app/src/slices/fonts/discovery.ts:16` | Source-only Windows system font root |
| LOCALAPPDATA | Unset; per-user Windows font directory omitted | `packages/app/src/slices/fonts/discovery.ts:17` | Source-only Windows font discovery |
| XDG_DATA_HOME | `<os.homedir()>/.local/share` | `packages/app/src/slices/fonts/discovery.ts:24` | Source-only Linux font discovery |
| WSL_DISTRO_NAME | Unset; presence indicates WSL on Linux | `packages/app/src/edge/open-browser.ts:16` | Source comment; `/proc/version` is the additional detection fallback |
| WSL_INTEROP | Unset; presence indicates WSL on Linux | `packages/app/src/edge/open-browser.ts:16` | Source comment; shared browser/folder detection |
| npm_config_update_notifier | Set to `false` for the installer child | `packages/app/src/updater/worker.ts:137` | Internal npm environment; npm is its consumer |
| GEMINI_CLI_SYSTEM_SETTINGS_PATH | Child-only temporary `settings.json` | `packages/app/src/adapters/llm/gemini-workspace.ts:96` | Internal Gemini child configuration |
| GEMINI_CLI_TRUSTED_FOLDERS_PATH | Child-only temporary `trusted-folders.json` | `packages/app/src/adapters/llm/gemini-workspace.ts:97` | Internal Gemini workspace trust |
| NO_BROWSER | Set to `true` for Gemini children | `packages/app/src/adapters/llm/gemini-workspace.ts:98`; logged-out prompt detection in `packages/app/src/adapters/llm/gemini.ts:138` | Internal Gemini headless-login handling |
| GEMINI_SYSTEM_MD | Child-only temporary `writing.md` | `packages/app/src/adapters/llm/gemini-workspace.ts:99` | Internal writing-role context |
| GEMINI_WRITE_SYSTEM_MD | Set to `false` for Gemini children | `packages/app/src/adapters/llm/gemini-workspace.ts:100` | Internal Gemini configuration |
| GEMINI_CLI_NO_RELAUNCH | Set to `true` for Gemini children | `packages/app/src/adapters/llm/gemini-workspace.ts:101` | Internal Gemini configuration |
| DB | Required Cloudflare D1 binding; no environment-string default | `packages/collector/src/index.ts:26` | `packages/collector/wrangler.jsonc:23` |

Home directories use Node's `os.homedir()`; the application does not parse a separate home override besides SLOPIFY_DATA_DIR/CODEX_HOME/XDG_DATA_HOME. Child environments otherwise inherit the parent. Saved CLI paths live in SQLite settings; provider/model/voice choices live in saved run configurations (`packages/app/src/kernel/config/index.ts:1`, `packages/app/src/adapters/llm/run-cli.ts:63`, `packages/app/src/slices/settings/cli-paths.ts:35`, `packages/app/src/slices/admission/model.ts:80`).

## Infrastructure

| Service/storage | Configuration, ports and persistence | Health/profile/container details | Source |
|---|---|---|---|
| Local app | Default `127.0.0.1:6969`; serves SPA, HTTP API, SSE and files | `GET /api/health`; no login; CLI warns when host differs from `127.0.0.1`; no container image or profile | `packages/app/src/kernel/config/index.ts:20`, `packages/app/src/edge/http/app.ts:76`, `packages/app/src/edge/cli.ts:31` |
| SPA dev proxy | `/api` and `/files` target `http://127.0.0.1:6969` | Dev only; packaged app serves copied build directly | `packages/web/vite.config.ts:10`, `packages/app/src/edge/http/app.ts:156` |
| SQLite | `<data-dir>/slopify.db`, WAL mode, foreign keys enabled, 5-second busy timeout; DB/WAL/SHM chmod `0600` where present | Embedded `node:sqlite`; no database container or external database port | `packages/app/src/kernel/paths.ts:17`, `packages/app/src/kernel/db/index.ts:8` |
| Project/staging/log directories | `<data-dir>/projects`, `staging`, `logs`, `.lock`; startup ensures directories at `0700` | Single-instance lock and startup reconciliation | `packages/app/src/kernel/paths.ts:17`, `packages/app/src/kernel/paths.ts:29`, `packages/app/src/main.ts:89` |
| Model catalogue | `<data-dir>/models.yaml`; bundled YAML seeds it; `.previous` retained on refresh and `.next` renamed atomically | Local modification detected by modification time and size; invalid content retains last valid catalogue | `packages/app/src/catalog/store.ts:24`, `packages/app/src/catalog/store.ts:38`, `packages/app/src/catalog/store.ts:81` |
| Local subtitle/font assets | `<data-dir>/models/english-subtitles`, uploaded `<data-dir>/fonts`; system font files discovered separately | Pinned model size/hash verification, filesystem alignment lock; per-request temporary decoded PCM removed after use | `packages/app/src/slices/rebuild/runtime-subtitles.ts:83`, `packages/app/src/slices/fonts/upload.ts:43`, `packages/app/src/adapters/alignment/cache.ts:24`, `packages/app/src/adapters/alignment/index.ts:14` |
| Recovered FFmpeg | `<data-dir>/bin/ffmpeg-static-<version>-<platform>-<arch>` | Uses dependency installer and verifies executable; no write into the npx installation cache | `packages/app/src/adapters/ffmpeg.ts:35` |
| Managed updates | `<data-dir>/updates/<version>`, `updates/current.json`, private install npm cache/configs and pre-update DB copies; log at `logs/updates.log` | Candidate readiness/activation protocol; no continuously running update daemon | `packages/app/src/updater/plan.ts:28`, `packages/app/src/updater/plan.ts:34`, `packages/app/src/updater/worker.ts:18` |
| Telemetry collector | Cloudflare Worker `slopify-collector`, entry `src/index.ts`, compatibility date `2026-08-01`, custom domain `collector.slopify.stream`; D1 binding `DB`, database name `slopify-collector` | Observability enabled; no configured Compose profile/image/volume/healthcheck. `/events` ingestion and `/aggregates` counters are its application endpoints | `packages/collector/wrangler.jsonc:3`, `packages/collector/wrangler.jsonc:14`, `packages/collector/wrangler.jsonc:22`, `packages/collector/src/index.ts:20` |
| Marketing site | Cloudflare static assets Worker `slopify-site`, `./public`, compatibility date `2026-08-01`, custom domain `slopify.stream` | No server-side entry, configured container/profile or healthcheck | `packages/site/wrangler.jsonc:3` |

The repository contains no Dockerfile or Compose manifest. Remote provider APIs, npm registry, the catalogue's GitHub raw URL and the pinned Hugging Face model URL are network dependencies used by the relevant features; they are not locally provisioned services (`packages/app/src/adapter-registry.ts:1`, `packages/app/src/updater/model.ts:30`, `packages/app/src/catalog/store.ts:7`, `packages/app/src/adapters/alignment/cache.ts:24`).

## Developer workflow

| Action | Exact command | Definition/evidence |
|---|---|---|
| Install development dependencies | `npm install`; CI reproducible install `npm ci` | `README.md:136`, `.github/workflows/ci.yml:15` |
| Install repository hook | `git config core.hooksPath .githooks` once per clone | `README.md:137`; hook executes `npx --no-install biome check --staged --no-errors-on-unmatched` at `.githooks/pre-commit:4` |
| Lint/format check | `npm run lint` → `biome check .` | `package.json:9`; there is no separate format script |
| Type checking | `npm run typecheck` → workspace typechecks where present | `package.json:10`; web first emits app declarations through `packages/web/package.json:9` |
| Tests | `npm test` → `vitest run` | `package.json:11` |
| Build release artifacts | `npm run build` | SPA Vite build first, then app TypeScript and migration/assets/web copy scripts: `package.json:12`, `packages/app/package.json:25`, `packages/app/scripts/copy-migrations.mjs:1`, `packages/app/scripts/copy-assets.mjs:1`, `packages/app/scripts/copy-web.mjs:1` |
| Smoke packed install surfaces | `node packages/app/scripts/install-smoke.mjs` after `npm run build` | Packs the app into a temporary archive, globally installs it under a temporary prefix, then launches both the global `slopify` bin and npm-exec form until `/api/health` answers. Windows invokes npm's generated `.cmd` shim through `ComSpec`; other platforms execute the installed bin directly: `packages/app/scripts/install-smoke.mjs:14` |
| Dependency audit | `npm audit --audit-level=high` | `.github/workflows/ci.yml:22` |
| App migrations | `node packages/app/dist/edge/cli.js --data-dir <directory> --no-open` after build starts the app and applies pending migrations | No standalone migration script; boot calls migrate before recovery. SQL files sort by filename, each runs transactionally, and newer unsupported DB versions are refused: `packages/app/src/main.ts:99`, `packages/app/src/kernel/db/migrate.ts:10` |
| Collector local schema | `npm run schema:local --workspace @slopify/collector` | `wrangler d1 execute slopify-collector --local --file=schema.sql`: `packages/collector/package.json:9` |
| Collector remote schema | `npm run schema:remote --workspace @slopify/collector` | `wrangler d1 execute slopify-collector --remote --file=schema.sql`: `packages/collector/package.json:12` |
| Validate Cloudflare deployment artifacts | `npm run deploy:check` | Collector then site `wrangler deploy --dry-run`: `package.json:17` |
| Deploy Cloudflare artifacts | `npm run deploy` | Collector then site: `package.json:16`; D1 schema is not applied by this script |
| Publish package | `npm publish --provenance --access public --workspace @gentbajko/slopify` | Release workflow verifies a pushed plain `x.y.z` tag exactly matches the package version, reruns CI, then publishes through npm trusted publishing/OIDC: `.github/workflows/release.yml:3`, `.github/workflows/release.yml:11`, `.github/workflows/release.yml:23` |

The collector's initial setup is documented as Wrangler login, D1 creation, configured database identity, remote schema application and deployment. The checked-in Wrangler config already supplies a database identity; the README's placeholder replacement is initial-setup prose (`README.md:183`, `packages/collector/wrangler.jsonc:23`). Marketing counters choose local collector port 8787 on loopback origins; the README records an observed Wrangler browser-polling disconnect separately from production behavior (`README.md:157`, `packages/site/public/main.js:7`).

## Subtitle operation

Alignment uses local `onnxruntime-web` WASM with pinned English model weights. The model cache verifies byte count and SHA-256; an alignment lock serializes workers. The parent waits for child close before temporary audio cleanup, including on Windows (`packages/app/src/adapters/alignment/cache.ts:24`, `packages/app/src/adapters/alignment/lock.ts:7`, `packages/app/src/adapters/alignment/runner.ts:39`).

Revision subtitle/export execution prepares immutable caption, font and media assets and publishes complete bundles transactionally. Subtitle sidecar/style work can reuse unchanged WAV or non-burned MP4 assets; burn-in produces replacement media when rendering is needed. Legacy subtitle/export helpers remain in source, separate from revision runtime publication (`packages/app/src/slices/rebuild/runtime-subtitles.ts:49`, `packages/app/src/slices/rebuild/runtime-export.ts:25`, `packages/app/src/slices/rebuild/runtime-publication.ts:76`, `packages/app/src/slices/revisions/publish.ts:27`, `packages/app/src/slices/video/write-subtitles.ts:12`).

## CLI discovery and provider operation

Saved executable paths and 15-second readiness probes cover Claude Code, Codex and Gemini. The launcher resolves supported Windows Node shims and refuses unknown batch commands; process argv is passed without shell interpolation (`packages/app/src/slices/settings/cli-paths.ts:35`, `packages/app/src/slices/settings/cli-status.ts:22`, `packages/app/src/kernel/cli-command.ts:11`, `packages/app/src/adapters/llm/run-cli.ts:63`).

Claude uses JSON streaming with partial-message activity, safe mode, a writing role and strict MCP configuration. Codex 0.149.1+ runs JSON execution in a private temporary directory with user rules, local tools and account connectors disabled. Gemini receives temporary workspace/system configuration and a restricted tool/MCP configuration. Cancel/shutdown gives each CLI one second for graceful exit and one second after force-killing its POSIX process group or Windows process tree (`packages/app/src/adapters/llm/claude-code.ts:43`, `packages/app/src/adapters/llm/codex.ts:33`, `packages/app/src/adapters/llm/gemini-workspace.ts:10`, `packages/app/src/adapters/llm/gemini.ts:23`).

Production model choices come from validated YAML. Enabled, non-deprecated models are selected by family/provider; manual refresh obtains the configured GitHub raw source with a 15-second timeout and 1 MB limit, and keeps the previous file. Legacy discovery helpers still read Codex model cache and installed Gemini metadata/aliases (`packages/app/src/catalog/store.ts:7`, `packages/app/src/catalog/store.ts:54`, `packages/app/src/catalog/store.ts:94`, `packages/app/src/adapters/llm/codex-models.ts:29`, `packages/app/src/adapters/llm/gemini-models.ts:6`).

Batch planning estimates before confirmation, validates up to 50 items and transactionally creates queued projects. Batch pumping runs at one-second intervals and processes one batch item at a time: paused items hold the queue; done/failed/canceled items release it after in-flight calls drain. Provider dispatch separately permits at most five concurrent calls globally, bounded further by each provider's catalogue limit (`packages/app/src/edge/http/planning.ts:15`, `packages/app/src/slices/batch/index.ts:38`, `packages/app/src/slices/batch/index.ts:76`, `packages/app/src/main.ts:254`, `packages/app/src/main.ts:355`, `packages/app/src/kernel/runner/queue.ts:12`).

Schedules are local-only and require the app process to be running. Migration 0010 removes schedule/template cascade deletion, adds terminal tombstones and records when admitted projects settle; boot marks abandoned scheduled runs failed and freezes terminal occurrences. A 15-second scheduler tick under the updater mutation gate claims due rows before handing fresh template drafts to Play review/Start and the existing provider-aware queue. One-off, daily and weekly occurrences are calculated in the saved IANA timezone. Missed occurrences follow the saved skip/run-once policy, overlapping runs are skipped, and an optional spend ceiling refuses unknown or over-limit estimates (`packages/app/src/kernel/db/migrations/0009-scheduled-jobs.sql:1`, `packages/app/src/main.ts:291`, `packages/app/src/slices/schedules/scheduler.ts:1`).

## In-app updates

The updater checks npm registry version state and obtains a mutation barrier before installation. It installs an exact stable version under the private update tree, releases the old listener, backs up SQLite, starts a detached candidate with the internal token protocol, verifies readiness and atomically writes the active installation pointer. Pre-activation failure can stop the candidate, restore the database and restart the previous entry; post-commit activation acknowledgement failure is reported for restart (`packages/app/src/updater/service.ts:21`, `packages/app/src/updater/install-flow.ts:1`, `packages/app/src/updater/worker.ts:18`, `packages/app/src/updater/plan.ts:111`).

The worker's npm installation has a 15-minute timeout. Candidate startup waits up to 60 seconds, using authenticated readiness checks; npm absence disables in-app installation without preventing the app from starting (`packages/app/src/updater/worker.ts:129`, `packages/app/src/updater/worker.ts:146`, `packages/app/src/main.ts:155`).

The browser checks every 15 minutes while idle and every two seconds after an accepted install or persisted installing/restarting status. It stops presenting recovery after 120 seconds with a restart instruction, and reloads only after a different activated version answers in an idle/error state (`packages/web/src/updates/api.ts:8`, `packages/web/src/updates/use-update.ts:79`, `packages/web/src/updates/use-update.ts:84`, `packages/web/src/updates/use-update.ts:94`).

## Live previews and recovery

LLM text previews and narration streaming previews are bounded process-memory state. Revision/work visibility prevents stale origin events appearing as current progress. These caches are not durable saved output; shutdown clears audio previews and closes the hub (`packages/app/src/edge/events/preview-cache.ts:1`, `packages/app/src/edge/events/visibility.ts:1`, `packages/app/src/kernel/audio-preview.ts:59`, `packages/app/src/main.ts:274`).

Pause/cancel validate current revision and idempotency identity and persist their control before aborting. Completed outputs are retained. Old direct Resume/Retry routes require a rebuild review, and provider/article/image mutation routes require the revision editor (`packages/app/src/slices/control/revision-control.ts:25`, `packages/app/src/slices/control/index.ts:122`, `packages/app/src/slices/cancel/index.ts:55`, `packages/app/src/edge/http/actions.ts:146`).

Telemetry starts flushing pending rows after boot. Offline/retriable failures leave rows queued; non-retriable refusals are classified separately, so it is not correct to describe every delivery failure as retained indefinitely (`packages/app/src/main.ts:267`, `packages/app/src/slices/telemetry/collector-client.ts:57`, `packages/app/src/slices/telemetry/flush.ts:1`).

## Revisions, restart and retained storage

Migrations 0004/0005 add retained revisions, asset/manifests, durable work/pieces/reservations, mutation/control receipts and rebuild previews/admissions. Existing projects adopt a baseline lazily; new single/batch admissions initialize revision and execution context transactionally (`packages/app/src/kernel/db/migrations/0004-project-revisions.sql:1`, `packages/app/src/kernel/db/migrations/0005-revision-work.sql:1`, `packages/app/src/slices/revisions/adopt.ts:31`, `packages/app/src/slices/admission/start.ts:28`, `packages/app/src/slices/batch/index.ts:38`).

Save/Restore advance the project head with compare-and-swap while retaining prior revisions and media; Save does not start provider calls. Explicit rebuild previews/admission govern affected work, and repeated mutation/admission keys replay recorded results. Committed publication retains its origin result and selects it for current state only when reservation and dependency authority match (`packages/app/src/slices/revisions/mutations.ts:206`, `packages/app/src/slices/revisions/restore.ts:17`, `packages/app/src/slices/rebuild/service.ts:30`, `packages/app/src/slices/rebuild/repo.ts:16`, `packages/app/src/slices/revisions/publication-rules.ts:13`).

Boot marks interrupted stages, then runs `recoverWork` before dispatch wiring. Unfinished revision pieces/work are held for explicit reviewed resumption, except projects still marked `queued` in the batch queue. Recovery leaves completed pieces and saved continuation data intact; an unknown submitted result participates in preview warnings before a new submission (`packages/app/src/main.ts:100`, `packages/app/src/slices/rebuild/repo.ts:95`, `packages/app/src/slices/rebuild/preview-retained.ts:96`, `packages/app/src/slices/rebuild/preview-retained.ts:140`).

Storage reconciliation retains all registered project assets and legacy output/piece files. It removes unregistered project files. Referenced completed Play uploads survive startup when disk size matches recorded bytes; interrupted or missing files become reattach entries, and unreferenced staging files/rows are removed. No automatic revision-history purge is implemented here (`packages/app/src/slices/storage/reconcile.ts:69`). Revision downloads require project-owned registered records and reflect missing files as unavailable. Explicit project deletion refuses running or draining work, removes the directory first and deletes cascading records only after filesystem success (`packages/app/src/slices/storage/reconcile.ts:14`, `packages/app/src/slices/revisions/downloads.ts:1`, `packages/app/src/slices/storage/delete-project.ts:36`).

## Portable backup and diagnostics

Settings exposes storage totals, per-project sizes, cleanup, a portable ZIP export/import, and a diagnostics JSON download. The backup contains settings, prompts, entries, voices, current template revisions and present staged files. It excludes provider keys, projects/revision history, schedules, logs, update installations and the model cache. Import is capped at 100 MiB and preserves existing templates with colliding IDs while upserting other resource IDs (`packages/app/src/edge/http/storage.ts:7`, `packages/app/src/slices/storage/portable.ts:45`, `packages/app/src/slices/storage/portable.ts:85`, `packages/app/src/slices/storage/portable.ts:135`, `packages/web/src/routes/settings.tsx:52`, `packages/web/src/routes/settings.tsx:139`).

Diagnostics is a no-store attachment containing app/schema/Node/platform metadata, secret-free provider readiness, project count and catalogue status. It does not include API-key values, project content, prompts, output paths or logs (`packages/app/src/edge/http/diagnostics.ts:10`).

## Play drafts and tutorial recovery

Migration 0006 adds `play_drafts`, `play_draft_attachments` and `play_start_receipts` to the existing app SQLite database. Draft content, section, variants and expected-word input live in the app data directory; browser localStorage remembers only the active draft identifier. An empty visit creates no record, the first edit starts creation, and subsequent edits debounce saves for 500 ms. Only acknowledged generations are reported saved; failed or conflicting writes retain local input and offer Retry, Reload saved draft or Save as a new draft (`packages/app/src/kernel/db/migrations/0006-play-drafts.sql:1`, `packages/web/src/play/draft-restore.ts:6`, `packages/web/src/play/use-draft-session.ts:77`, `packages/web/src/play/use-draft-session.ts:156`, `packages/web/src/play/draft-list.tsx:116`).

Completed attachment bytes are retained by server ownership rather than browser storage. Fork creates independent attachment IDs sharing ready staged files; discard removes the draft and releases only unshared files. Start copies supplied inputs into every project before releasing draft ownership. Metadata deletion and byte cleanup both respect other draft references, including when a revision Save consumes the same staged input; cleanup defers during an outer transaction or active copy. Missing/interrupted uploads require reattachment instead of being admitted as complete (`packages/app/src/slices/play-drafts/service.ts:212`, `packages/app/src/slices/play-drafts/service.ts:266`, `packages/app/src/slices/play-drafts/start.ts:95`, `packages/app/src/slices/storage/repo.ts:93`, `packages/app/src/slices/storage/staging-refs.ts:14`, `packages/app/src/slices/revisions/mutations.ts:188`, `packages/app/src/slices/storage/reconcile.ts:69`).

Current Play uses draft Review and Start endpoints for both single runs and batches. Review binds saved inputs, current templates/catalogue and owned files without creating projects. Explicit Start claims the review identity, checks readiness, then atomically creates project/queue/revision work records, its receipt and the draft ownership transition. A lost response or restart reuses that receipt before resolving consumed staging; conflicting identity cannot create another run. Uncaught readiness/infrastructure failures can leave a durable pending claim, and the browser restores it as uncertain until the same Start is resolved. Post-commit telemetry, cleanup or runner-notification failures are logged without invalidating receipt success (`packages/app/src/edge/http/drafts.ts:113`, `packages/app/src/slices/play-drafts/review.ts:49`, `packages/app/src/slices/play-drafts/start.ts:31`, `packages/app/src/slices/play-drafts/start.ts:91`, `packages/app/src/slices/play-drafts/start.ts:95`, `packages/app/src/slices/play-drafts/start.ts:133`, `packages/app/src/slices/play-drafts/start-repo.ts:66`, `packages/web/src/play/review-state.ts:128`, `packages/web/src/play/review-state.ts:212`).

The Drafts list excludes started records; confirmed creation clears the active browser identifier and navigates to the first created project, while durable receipts remain available even after explicit draft deletion. Malformed or unsupported draft content is preserved as unreadable metadata for recovery/discard (`packages/app/src/slices/play-drafts/repo.ts:43`, `packages/web/src/play/use-draft-session.ts:310`, `packages/web/src/routes/play.tsx:126`, `packages/app/src/kernel/db/migrations/0006-play-drafts.sql:29`, `packages/app/src/slices/play-drafts/service.ts:104`, `packages/app/src/slices/play-drafts/service.ts:146`).

Tutorial progress uses the server settings key `tutorial.session`, with schema/version and exact mutation replay checks. Browser transitions are serialized, restored step IDs map to current tutorial positions, and stored prompt/project IDs are checked before resume. Unreadable progress is retained until explicit Restart deletes the record; save conflicts report an error without replacing the other writer. Play targets reveal their owning section before spotlight measurement (`packages/app/src/slices/settings/tutorial.ts:34`, `packages/app/src/slices/settings/tutorial.ts:57`, `packages/app/src/slices/settings/tutorial.ts:80`, `packages/web/src/tutorial/use-session.ts:33`, `packages/web/src/tutorial/use-session.ts:84`, `packages/web/src/tutorial/runner.tsx:86`).

## Release commands and CI

Linux CI runs `npm ci`, lint, typecheck, the full Vitest suite, build and high-severity audit on Node 26. Windows CI builds, then runs separate native FFmpeg/alignment/font/subtitle, CLI-provider, catalogue/queue/batch, optional-output, Play draft restart/admission and retained-revision/rebuild/restart suites. The Windows media command includes `packages/app/test/e2e/play-drafts.test.ts` (`.github/workflows/ci.yml:35`). The last Windows command includes both revision slices and seven production revision integration files; its complete exact path list lives in the workflow (`.github/workflows/ci.yml:8`, `.github/workflows/ci.yml:24`, `.github/workflows/ci.yml:40`).

Pushed plain `x.y.z` tags trigger the package release workflow. Metadata requires the tag to equal the stable package version, the reusable CI workflow runs Linux and Windows verification, and only then does the publish job install, build and publish through npm trusted publishing with provenance. Cloudflare deployment remains a separate workspace command (`.github/workflows/release.yml:3`, `.github/workflows/release.yml:13`, `.github/workflows/release.yml:23`, `package.json:16`).
