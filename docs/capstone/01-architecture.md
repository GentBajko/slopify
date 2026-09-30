---
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: b612630c0e76
paths_covered:
  - ":(top)packages/app/src/**"
  - ":(top)packages/app/scripts/copy-*.mjs"
  - ":(top)packages/web/src/**"
  - ":(top)packages/web/*.ts"
  - ":(top)packages/web/index.html"
  - ":(top)packages/web/components.json"
  - ":(top)packages/extension/**"
  - ":(top)packages/site/**"
  - ":(top)packages/collector/**"
  - ":(top)package.json"
  - ":(top)packages/*/package.json"
  - ":(top)biome.json"
---

# Architecture

Repo-wide chapter for the npm-workspaces monorepo (`package.json:4`): `packages/app` (the published `@gentbajko/slopify` server and CLI, `packages/app/package.json:2`), `packages/web` (the React SPA it serves), `packages/extension` (the Slopify Studio browser extension), `packages/site` (the public static site) and `packages/collector` (the telemetry Worker). Scoped companions go deeper and are not repeated here: research handoff in `01-architecture-research.md`, video recovery in `01-architecture-recovery.md`, narration text boundaries in `01-architecture-narration.md`, Docker install, storage and host helper in `01-architecture-docker.md`.

## Layers

`packages/app/src` has four tiers plus a composition root. Dependency direction is enforced by Biome `noRestrictedImports` overrides (`biome.json:42`).

| Tier | Directories | May import | Enforcement |
| --- | --- | --- | --- |
| kernel | `packages/app/src/kernel/` (config, db, runner, ports, events, paths, clock, log, ids, lock, pipeline) | kernel only | Forbidden: `slices`, `edge`, `adapter-registry.js` (`biome.json:44`) |
| slices | `packages/app/src/slices/<feature>/` (45 directories) | kernel, other slices | Forbidden: `edge`; `adapters`, `kernel/ports/registry.js`, `adapter-registry.js` (`biome.json:70`). A grep of every slice file finds no `adapters/` or `edge/` import. |
| adapters | `packages/app/src/adapters/` (llm, tts, image, alignment, host-cli, fake, `ffmpeg.ts`, `key-probes.ts`) | `kernel/ports/**`, `kernel/{clock,log,cli-command}.js`, `kernel/clock.fake.js` | Everything else in kernel, plus slices, edge and the registry, is forbidden (`biome.json:99`) |
| edge | `packages/app/src/edge/` (CLI, `http/`, `events/`, autostart, docker-install, open-folder, update worker, host-cli entry) | everything below | No Biome override; observed by imports in `packages/app/src/edge/http/app.ts` |
| composition root | `packages/app/src/main.ts`, `packages/app/src/adapter-registry.ts` | all tiers | `boot` wires adapters into slices through kernel ports (`packages/app/src/main.ts:225`) |

Modules outside the tiers: `catalog/` (model catalogue store and curated registry wrapper, `packages/app/src/catalog/store.ts:63`, `packages/app/src/catalog/registry.ts:9`; it imports `slices/settings/model.js` at `packages/app/src/catalog/registry.ts:5` and has no Biome override), `updater/` (self-update service, `packages/app/src/updater/service.ts`), `host-cli/` (host helper server, install and status, `packages/app/src/host-cli/server.ts`), `sample-build/` (a script that builds the bundled sample with the pipeline, `packages/app/src/sample-build/generate.ts:93`).

The runner in `kernel/runner` imports only kernel modules; stage behaviour arrives as `RunnerDeps.runs` (`packages/app/src/kernel/runner/index.ts:55`), which `wireRunner` fills from `slices/rebuild` (`packages/app/src/main.ts:945`). Nineteen slices import `kernel/runner/*` directly: article, batch, cancel, checkpoints, control, episodes, images, narration, play-drafts, rebuild, reruns, research, revisions, run-cost, schedules, settings, subtitles, thumbnail and video.

The other packages sit beside the app:

- `packages/web` imports app source through the `@app/*` alias. `tsconfig.json` maps it to `../app/dist/*` for declarations (`packages/web/tsconfig.json:14`), and Vite rewrites it to `../app/src/*.ts` (`packages/web/aliases.ts:13`). Most imports are `import type`. Value imports are pure schema, rule and model modules, for example `slices/admission/substitute.js`, `slices/library/lint.js`, `slices/play-drafts/schema.js`, `slices/fixes/rules.js` and `edge/events/preview-cache.js` (`packages/web/src/event-mux.ts:2`).
- `packages/extension` imports nothing from the app. It keeps a copy of the upload-pack types (`packages/extension/src/pack.ts:1`) that mirrors `packages/app/src/slices/studio/model.ts:20`.
- `packages/site` and `packages/collector` import nothing from the other packages. The collector keeps its own Zod model (`packages/collector/src/model.ts`).

## Module boundaries

### Kernel

| Module | Public surface |
| --- | --- |
| `kernel/runner` | `createRunner` (`packages/app/src/kernel/runner/index.ts:83`) returns `Runner {tick, settled, abortProject, hasInflight?, abortAll, checkpoints?}` (`:64`). `StageContext` and `StageRun` are at `:44` and `:53`. `stageProviders` (`packages/app/src/kernel/runner/providers.ts:116`) wraps `StageProviders` (`:86`) so every LLM, TTS, image and animate call goes through `attempt` (`packages/app/src/kernel/runner/attempt.ts:73`). `createProviderQueue` is one app-wide queue of at most five calls, with lower per-provider limits (`packages/app/src/kernel/runner/queue.ts:10`). `standaloneLlm` and `standaloneImage` (`packages/app/src/kernel/runner/standalone.ts:43`, `:93`) serve provider calls that belong to no project. |
| `kernel/ports` | `Registry {llm, tts, image, list}` (`packages/app/src/kernel/ports/registry.ts:17`). `ImagePort` has an optional `animate` for image-to-video (`packages/app/src/kernel/ports/image.ts:57`). There are also LLM, TTS, subtitle, host-cli, key-probe, plan-limit, system-speech, language and narration-alias ports (`packages/app/src/kernel/ports/`). |
| `kernel/db` | `openDb` (`packages/app/src/kernel/db/index.ts:8`) and `migrate` (`packages/app/src/kernel/db/migrate.ts:16`) over `node:sqlite`. There are 35 migrations in `packages/app/src/kernel/db/migrations/`, the newest being `0042-narration-retries.sql`. |
| `kernel/events` | The `ProjectEvent` union (`packages/app/src/kernel/events.ts:107`). It sits in the kernel so the runner and slices can produce events without importing `edge`. |
| `kernel/pipeline` | `stageKinds` is `research, article, audio, images, thumbnail, video, document` (`packages/app/src/kernel/pipeline.ts:11`). |
| `kernel/config` | `configFrom` (`packages/app/src/kernel/config/index.ts:23`). The default port is 6969 (`:20`). |

### Provider registry

`buildRegistry` (`packages/app/src/adapter-registry.ts:60`) holds every adapter. `curateRegistry` filters it through the catalogue (`packages/app/src/main.ts:335`).

| Family | Provider IDs |
| --- | --- |
| LLM | `openrouter`, `claude-code`, `codex`, `gemini` (`packages/app/src/adapter-registry.ts:76`) |
| TTS | `elevenlabs`, `openai-tts`, `cartesia`, `inworld`, `system-voice` (the computer's own speech program, `packages/app/src/adapters/tts/system.ts:33`) and `google-tts` (`packages/app/src/adapter-registry.ts:105`) |
| Image | `fal`, `replicate`, `openai-image`, `google-image`, `codex-image` (`packages/app/src/adapter-registry.ts:137`) |

In a Docker install, `claude-code`, `codex`, `gemini` and `codex-image` are replaced by clients of the host helper (`packages/app/src/adapter-registry.ts:155`, `packages/app/src/kernel/ports/host-cli.ts:8`). `01-architecture-docker.md` covers that.

### Slices

Every slice is a folder of plain modules with no `index` barrel requirement. Edge routers import individual files. The table uses each slice's own names. Stage slices (research, article, images, thumbnail, subtitles, video, shorts) have no edge consumer; they are reached through `rebuild`.

| Slice | Purpose | Public surface | Edge consumers |
| --- | --- | --- | --- |
| admission | Validates a `RunDraft` and writes the project, its stages, the first revision and its work | `startRun` `packages/app/src/slices/admission/start.ts:47`; `runDraftSchema` `schema.ts:59` | actions, planning, projects, project-create, revisions, storage, studio |
| article | Article stage: writes, splits and stores text | `runArticle` `packages/app/src/slices/article/run.ts:41`; `splitEndMatter` `split.ts:40` | none |
| backups | Scheduled and manual backups | `createBackupService` `packages/app/src/slices/backups/service.ts:55` | backups |
| batch | Queue that advances one batch project at a time | `enqueueBatch` `packages/app/src/slices/batch/index.ts:41`; `pumpQueue` `:83` | planning |
| cancel | Cancel, which aborts in-flight calls | `cancelProject` `packages/app/src/slices/cancel/index.ts:58` | actions |
| channels | Channels, cast members, cast images, channel branding of runs | `createChannel` `packages/app/src/slices/channels/service.ts:34`; `generateCastImage` `cast-images.ts:59`; `brandedRun` `runs.ts:90` | channels, channel-memory, planning, projects, project-create, studio, youtube-edits |
| checkpoints | Review checkpoints: gates, approvals, restart recovery | `approveCheckpoint` `packages/app/src/slices/checkpoints/repo.ts:146`; `changeCheckpoints` `change.ts:213`; `recoverCheckpointWork` `recovery.ts:125` | checkpoints, actions |
| control | Pause, resume, provider change, project-control lock | `pauseProject` `packages/app/src/slices/control/index.ts:102`; `withProjectControl` `lock.ts:7` | actions, checkpoints, projects, reviews, trash |
| document | PDF document stage: blocks, themes, jsPDF writer | `renderDocument` `packages/app/src/slices/document/render.ts:46`; `listDocumentThemes` `library.ts:31` | document-themes |
| episodes | Channel episode memory, which summarises finished projects | `createEpisodeMemoryWatcher` `packages/app/src/slices/episodes/summarize.ts:201`; `withEarlierEpisodes` `related.ts:93` | channel-memory |
| estimate | Cost estimate before Start | `estimateRun` `packages/app/src/slices/estimate/index.ts:73` | planning, auditions |
| eta | Time left on a running step | `stageEta` `packages/app/src/slices/eta/model.ts:32`; `stagesWithEta` `view.ts:8` | projects |
| fixes | Maps a named failure to its fix-it action; pure and shared with web | `fixFor` `packages/app/src/slices/fixes/rules.ts:56` | none (web only) |
| fonts | Font catalogue, upload, SFNT metadata | `resolveFont` `packages/app/src/slices/fonts/catalog.ts:28`; `uploadFont` `upload.ts:33` | fonts, planning, project-create |
| images | Image stage: scenes, appearance, scaling | `runImages` `packages/app/src/slices/images/run.ts:54` | none |
| library | Prompt and entry library: save, history, lint, used-by | `createPrompt` `packages/app/src/slices/library/save.ts:41`; `lintPrompt` `lint.ts:11` | prompts, entries, planning, project-create |
| loudness | Loudness normalising and mastering | `normalizeFile` `packages/app/src/slices/loudness/loudnorm.ts:154`; `masterFile` `:219` | onboarding |
| model-upkeep | Retired-model detection and switching | `switchRetiredModel` `packages/app/src/slices/model-upkeep/switch.ts:117`; `retiredModelUsage` `usage.ts:227` | providers |
| narration | Narration planning, chunking, pronunciation, aliases, peaks | `runNarration` `packages/app/src/slices/narration/run.ts:71`; `planNarration` `plan.ts:55` | narration-peaks, pronunciations |
| notifications | Run notifications sent to a user-set URL | `createRunNotifier` `packages/app/src/slices/notifications/notifier.ts:33`; `createNotificationSender` `send.ts:13` | settings |
| onboarding | First run, starter packs, bundled sample projects | `seedSamples` `packages/app/src/slices/onboarding/sample.ts:76`; `installPack` `install.ts:35` | onboarding, app (sample read-only guard) |
| patch-notes | Patch notes shown once per version | `duePatchNote` `packages/app/src/slices/patch-notes/seen.ts:57` | patch-notes, whats-new |
| play-drafts | Durable Play drafts: save, fork, review, start | `createDraft` `packages/app/src/slices/play-drafts/service.ts:157`; `startPlayDraft` `start.ts:24`; `toAdmissionDraft` `convert.ts:65` | drafts, draft-files, project-templates |
| project-templates | Versioned templates, from-project, one-off | `createTemplate` `packages/app/src/slices/project-templates/service.ts:39`; `createTemplateFromProject` `from-project.ts:35` | project-templates |
| rebuild | Recipe planning and runtime execution for every stage, rebuild preview/start, recovery, retries, review redos | `runRevisionInvocation` `packages/app/src/slices/rebuild/runtime-run.ts:17`; `previewRebuild` `service.ts:51`; `startRebuild` `service.ts:84`; `recoverProject` `recovery.ts:59` | actions, projects, reviews, revisions |
| reruns | Retry, re-run, and marking downstream stages stale | `retryStage` `packages/app/src/slices/reruns/index.ts:70`; `redoPlan` `cascade.ts:44` | actions |
| research | Research stage: planner, sub-agents, synthesis | `runResearch` `packages/app/src/slices/research/run.ts:50` | none; see `01-architecture-research.md` |
| reviews | Automatic review verdicts and outcomes | `parseVerdict` `packages/app/src/slices/reviews/verdict.ts:63`; `reviewOutcome` `outcome.ts:22` | reviews |
| revisions | Immutable revisions: save, restore, publish outputs, views, downloads | `saveRevision` `packages/app/src/slices/revisions/mutations.ts:57`; `restoreRevision` `restore.ts:24`; `getRevisionView` `view.ts:7` | revisions, revision-files, actions, audio-preview, narration-peaks, projects, reviews |
| run-cost | Usage metering, pricing, CLI plan-limit gate | `createUsageMeter` `packages/app/src/slices/run-cost/meter.ts:27`; `createLimitGate` `limits.ts:29` | run-cost, home, projects |
| schedules | Schedules, calendar, topic generation, scheduler | `createScheduleRunner` `packages/app/src/slices/schedules/scheduler.ts:36`; `nextOccurrence` `calendar.ts:29` | schedules (and calendar) |
| settings | Keys, CLI paths and status, health, models, readiness, tutorial session | `providerStatuses` `packages/app/src/slices/settings/readiness.ts:23`; `checkProviderHealth` `health.ts:89` | settings, providers, diagnostics, onboarding, tutorial, whats-new, actions |
| shorts | Vertical shorts: clip picks, captions, render | `renderShort` `packages/app/src/slices/shorts/render.ts:241`; `checkPicks` `pick.ts:216` | none |
| storage | Staging, assets, backup export/import, reconcile, files location, project deletion | `reconcileStorage` `packages/app/src/slices/storage/reconcile.ts:14`; `createFilesService` `files-location.ts:183`; `importBackup` `backup-import.ts:159` | storage, storage-files, staging, files, open-folder, studio and others |
| studio | Upload pack, fill queue, pairing and AI disclosure for the Studio extension | `uploadPack` `packages/app/src/slices/studio/pack.ts:57`; `enqueueFill` `queue.ts:64` | studio |
| style-preview | Cached rendered caption and look previews | `createStylePreviews` `packages/app/src/slices/style-preview/service.ts:49` | style-preview |
| subtitles | Cues and SRT/VTT/ASS files | `prepareSubtitles` `packages/app/src/slices/subtitles/prepare.ts:71` | none |
| telemetry | Local counters and the collector flush | `record` `packages/app/src/slices/telemetry/record.ts:42`; `createFlusher` `flush.ts:78` | telemetry, usage, project-create |
| thumbnail | Thumbnail stage: LLM-written prompt, then image | `runThumbnail` `packages/app/src/slices/thumbnail/run.ts:58` | none |
| trash | Settings → Trash with 30-day retention | `trashProject` `packages/app/src/slices/trash/service.ts:73`; `createTrashPurge` `:313` | trash, projects |
| tutorials | Bundled tutorial pages and search | `loadTutorials` `packages/app/src/slices/tutorials/library.ts:83`; `searchTutorials` `:179` | tutorials |
| uploads | Mark uploaded | `markUploaded` `packages/app/src/slices/uploads/repo.ts:10` | home |
| video | Video render: FFmpeg plan, ambient bed, edits, cards | `renderVideo` `packages/app/src/slices/video/run.ts:36`; `planRender` `plan.ts:149` | none |
| voices | Voices, cast voicing, languages, audition lines | `withCastVoices` `packages/app/src/slices/voices/cast.ts:66` | auditions |
| youtube | YouTube description, chapters, tags and hand edits | `assembleDescription` `packages/app/src/slices/youtube/answer.ts:158`; `composeDescription` `edits.ts:85` | youtube-edits, settings |

`rebuild` is the hub slice: it imports 26 other slices. Every one of the seven stage IDs executes through `runRevisionInvocation` (`packages/app/src/main.ts:945`). Recipe kinds and runtime dispatch are in `01-architecture-recovery.md` and `01-architecture-narration.md`.

### Web, extension, site, collector

- The web public surface is its route tree (`packages/web/src/router.tsx:603`). Only files under `packages/web/src/components/kit/` may write raw button, link-as-button and hit-area markup; `packages/web/src/kit-rules.test.ts:1` checks this.
- In the extension, only the background worker talks to Slopify. The content script receives a `FillPayload` with thumbnails already base64-encoded and never calls Slopify itself (`packages/extension/src/pack.ts:44`).
- The site is static assets with no server side (`packages/site/wrangler.jsonc:4`).
- The collector reads the D1 binding `DB` only (`packages/collector/wrangler.jsonc:24`).

## Entry points

| Process | Entry |
| --- | --- |
| Installed CLI `slopify` | `packages/app/src/edge/cli.ts:13` parses argv. It handles help and version, dispatches `--docker`, `install` and `update` to lazily imported `docker-install/run.js` and `native-update.js` (`:55`, `:70`), and otherwise calls `boot` (`:85`). The bin mapping is in `packages/app/package.json:17`. |
| App HTTP server | `boot(config)` (`packages/app/src/main.ts:225`) builds everything. `listen` serves `app.fetch` with `@hono/node-server` (`packages/app/src/main.ts:967`). |
| In-process timers | Batch queue every 1 s (`packages/app/src/main.ts:657`), schedules every 15 s (`:668`), retry wake-ups every 5 s (`:673`), catalogue sync checked hourly (`:700`), backups every 60 s (`:703`), trash purge hourly (`:729`). The telemetry flusher uses a debounced `setTimeout` (`packages/app/src/slices/telemetry/flush.ts:94`). None of these is a separate worker. |
| Alignment child | `fork` at `packages/app/src/adapters/alignment/runner.ts:24`. The child receives one IPC message at `packages/app/src/adapters/alignment/worker.ts:17`. |
| Update worker | Spawned with `node <worker> <planPath>` (`packages/app/src/updater/install.ts:18`). It reads the plan path at `packages/app/src/edge/update-worker.ts:5`. |
| Host CLI helper | `packages/app/src/edge/host-cli.ts:50` starts `startHostServer` on a Unix socket (`packages/app/src/host-cli/server.ts:20`). It runs on the Docker host. `01-architecture-docker.md` covers it. |
| Sample build script | `packages/app/src/sample-build/generate.ts:93` (`main`). |
| Browser SPA | `packages/web/src/main.tsx:24` (`start`), mounted on `#root` (`packages/web/index.html:11`). |
| Extension background worker | `packages/extension/src/background.ts:129` (`runtime.onMessage`). The manifest declares it as `background.service_worker` (`packages/extension/static/manifest.json:15`). |
| Extension content script | `packages/extension/src/content.ts` on `https://studio.youtube.com/*` (`packages/extension/static/manifest.json:19`). A `MutationObserver` watches for the upload dialog (`packages/extension/src/content.ts:217`). |
| Extension options page | `packages/extension/src/options.ts:1`, loaded by `static/options.html` (`packages/extension/static/manifest.json:25`). |
| Collector Worker | `export default { fetch }` at `packages/collector/src/index.ts:21`, deployed on `collector.slopify.stream` (`packages/collector/wrangler.jsonc:14`). |
| Public site | Static `packages/site/public/` on `slopify.stream` (`packages/site/wrangler.jsonc:9`). The module `main.js` starts at `packages/site/public/main.js:247`. |

## Communication

### App HTTP

`createApp` (`packages/app/src/edge/http/app.ts:226`) applies four middleware layers:

- Every response carries `X-Slopify-Version` (`:230`).
- Every non-GET `/api/*` request passes the Docker-installation gate, the shutdown gate and the updater mutation gate, or gets a 503 or 409 problem (`:235`).
- Writes to the bundled sample project are refused with 409 `reason:"sample-read-only"` (`:277`).
- Unknown `/api/*` paths return a problem+json 404 (`:309`).

`apiRoutes` mounts the chained registry under `/api` (`packages/app/src/edge/http/app.ts:165`), and `AppType` is exported for the typed client (`:159`). File routes mount at `/` (`:305`), and the SPA static fallback comes last (`:314`).

Except where a row says otherwise, requests and responses are JSON, and refusals are problem JSON (`packages/app/src/edge/http/problem.ts`). Named DTOs are defined in `02-models.md`.

| Mount | Router (definition) | Routes → payloads |
| --- | --- | --- |
| `/api/health` | inline `app.ts:168` | GET → `{status:"ok",version,uptimeMs}` |
| `/api/staging` | `stagingRoutes` `staging.ts:17` | GET → `{files:StagedFile[]}`; POST `/:kind` multipart `file` → `StagedFile`; DELETE `/:id` → 204 |
| `/api/storage/files` | `filesRoutes` `storage-files.ts:11` | GET → the files-location view; POST `/open` opens the folder |
| `/api/storage` | `storageRoutes` `storage.ts:33` | GET → `StorageUsage`; GET `/projects/:id`; POST `/projects/:id/keep-outputs` → `{ok,files,bytesFreed}`; GET `/export/summary`; GET `/export` → backup tar stream; PUT `/import` takes a tar (`application/x-tar`) or a settings ZIP → an import summary; POST `/cleanup` → reconciliation counts |
| `/api/backups` | `backupRoutes` `backups.ts:10` | GET → backups view; PUT schedule and folder → view; POST `/run` → 202 view |
| `/api/trash` | `trashRoutes` `trash.ts:50` | GET → `{items:TrashItem[]}`; POST `/:kind/:id/restore`; DELETE `/:kind/:id` |
| `/api/drafts` | `draftRoutes` `drafts.ts:50`, file routes `draft-files.ts:27` | GET → `{drafts:DraftSummary[]}`; POST `{id,document:PlayDraftDocument}` → `DraftView`; GET/PUT/DELETE `/:id`; POST `/:id/fork`, `/:id/review` → `PlayReview`, `/:id/start` → `PlayStartResult`; PUT/GET `/:id/attachments/:attachmentId/file` (multipart in, image bytes out). The browser validates both directions with shared Zod schemas (`packages/web/src/play/draft-api.ts`). |
| `/api/diagnostics` | `diagnosticsRoutes` `diagnostics.ts:10` | GET → no-store JSON download: versions, secret-free readiness, catalogue status |
| `/api/project-templates` | `projectTemplateRoutes` `project-templates.ts:52` | CRUD, POST `/from-project/:projectId`, POST `/:id/instantiate` → `DraftView` |
| `/api/schedules`, `/api/calendar` | `scheduleRoutes` `schedules.ts:89`, `calendarRoutes` `schedules.ts:311` | CRUD with `ScheduleSummary`; pause, resume, cancel; topic generate, held, approve, reject, move, transfer; GET `/api/calendar?from&to` → upcoming runs |
| `/api/channels` | `channelRoutes` `channels.ts:38`, `channelMemoryRoutes` `channel-memory.ts:37` | Channel CRUD; AI disclosure; cast members and cast pictures (raw bytes in, 201; generate → 202); GET `/pictures/:sha256` → image bytes; PUT `/templates/:templateId`; episode memory; existing videos (POST takes a YouTube Studio export) |
| `/api/projects` | `planningRoutes` `planning.ts:33`, `projectRoutes` `projects.ts:41`, `checkpointRoutes` `checkpoints.ts:41`, `reviewRoutes` `reviews.ts:26`, `revisionRoutes` `revisions.ts:86`, `revisionFolderRoutes` `revision-files.ts:60`, `openFolderRoutes` `open-folder.ts:10`, `audioPreviewRoutes` `audio-preview.ts:19`, `narrationPeakRoutes` `narration-peaks.ts:32`, `runCostRoutes` `run-cost.ts:17`, `uploadedRoutes` `home.ts:33`, `actionRoutes` `actions.ts:46`, `subtitleRoutes` `subtitles.ts:15`, `youtubeEditRoutes` `youtube-edits.ts:33` | POST `/` `RunDraft` → 201 `{project,stages}`; GET `/` → `{projects}`; GET/DELETE `/:id` (DELETE moves the project to Trash); `/estimate` → `{estimates:CostEstimate[]}`; `/batch` and `/queue` → `{queue:QueueEntry[]}`; revisions prepare/list/view/save/restore → `RevisionView`; `/rebuild/preview` → `RebuildPreview`, `/rebuild` → 202 `RebuildAdmission`; pause, cancel, resume, retry, re-run, soften with `{baseRevisionId,idempotencyKey}`; checkpoints GET/PATCH/approve; reviews list, overrule, redo; `/audio-preview/:previewId` → growing `audio/mpeg`; `/narration/peaks` → `NarrationPeaks`; `/run-cost`; PUT `/uploaded` → `{uploadedAt}`; YouTube edits and `/:id/channel-links`. Retired mutations (provider PATCH, article PUT, image DELETE, subtitles PATCH) return 409 `reason:"revision-required"`. |
| `/api/home` | `homeRoutes` `home.ts:16` | GET `/week?since&channel` → week's videos, spend, CLI plan windows |
| `/api/update` | `updateRoutes` `update.ts:6` | GET, POST, DELETE → `UpdateInfo`; GET `/ready` and POST `/activate` with the `X-Slopify-Update-Token` header |
| `/api/fonts`, `/api/prompts`, `/api/entries`, `/api/document-themes` | `fontsRoutes` `fonts.ts:25`, `promptRoutes` `prompts.ts:44`, `entryRoutes` `entries.ts:32`, `documentThemeRoutes` `document-themes.ts:32` | Library CRUD; history, restore, used-by; font multipart upload and `/:id/file` bytes; document theme POST `/preview` |
| `/api/pronunciations`, `/api/auditions` | `pronunciationRoutes` `pronunciations.ts:17`, `auditionRoutes` `auditions.ts:38` | Shared glossary and `/aliases`; audition `/quote` → `{estimate}`, POST speaks a confirmed line |
| `/api/telemetry`, `/api/usage` | `telemetryRoutes` `telemetry.ts:8`, `usageRoutes` `usage.ts:13` | Notice GET/POST → `{seen,appVersion}`; usage GET → `Usage` |
| `/api/settings/autostart` | `autostartRoutes` `autostart.ts:12` | GET, PUT, POST `/answer`: start-with-computer state |
| `/api/settings` | `settingsRoutes` `settings.ts:71` | GET/PUT `AppSettings`; `/channel-links`; `/notifications` and `/notifications/test`; `/voices` CRUD |
| `/api/studio` | `studioRoutes` `studio.ts:82` | Same-origin: `/settings`, `/settings/playlists`, `/settings/pairing`, `/packs/:projectId` (+ `/real-footage`, `/playlists`, `/choose`), `/queue`, `/queue/remove`, GET `/extension/:file` → `application/zip` (`chrome.zip` or `firefox.zip`). Cross-origin, paired extension only: see the extension table below. |
| `/api/style-preview` | `stylePreviewRoutes` `style-preview.ts:16` | POST settings → where the preview is; GET `/:file` → MP4 with byte ranges |
| `/api/tutorial` | `tutorialRoutes` `tutorial.ts:13` | GET, PUT `{baseVersion,mutationId,session}`, DELETE |
| `/api/whats-new`, `/api/patch-notes` | `whatsNewRoutes` `whats-new.ts:7`, `patchNotesRoutes` `patch-notes.ts:20` | GET and POST `/seen`; GET `/:id` → one patch note |
| `/api/tutorials` | `tutorialPagesRoutes` `tutorials.ts:22` | GET, GET `/search`, GET `/:page` → bundled tutorial pages |
| `/api/providers` | `providerRoutes` `providers.ts:48` | GET → `{providers:ProviderStatus[]}`; `/:id/models` → `ModelCatalog`; key PUT/DELETE/test; path PUT; catalogue check, refresh and retired switch; `/key-guides`; `/first-run`; `/health`; `/system-voice/voices` |
| `/api/onboarding` | `onboardingRoutes` `onboarding.ts:50` | GET state; POST `/dismiss`, `/packs/:id`, `/short`, `/full-video`; GET `/sample`; POST `/sample/restore`, `/sample/copy` |
| `/files/...` | `fileRoutes` `files.ts:27`, `revisionFileRoutes` `revision-files.ts:20` | Output bytes and `images.zip` for the current project and for any revision record |

The host helper (`hostCliRoutes`, `packages/app/src/edge/http/host-cli.ts:107`) is a separate Hono app on a Unix socket. It serves `/v1/health`, `/v1/status/:provider`, `/v1/models/:provider`, `/v1/llm/:provider` (NDJSON stream), `/v1/image` and `/v1/open-folder` (`:126`–`:354`), all behind a bearer token. `01-architecture-docker.md` has the payloads.

### Server-sent events

The two EventSource endpoints are `/api/events/global` and `/api/events/projects/:id` (`packages/app/src/edge/http/app.ts:298`, `:301`). The global stream carries every project event as well as `running.count`, `schedule.topics`, `staging.progress` and `staging.failed` (`packages/app/src/edge/events/hub.ts:35`, `:180`), and sends a heartbeat every 20 s (`:99`). Each frame is `{event:type, data:JSON, id}` (`packages/app/src/edge/events/hub.ts:43`).

| Event | Fields beyond `projectId` and optional `EventOrigin {revisionId,workId,workPieceId}` (`packages/app/src/kernel/events.ts:7`) |
| --- | --- |
| `stage.state` | `stage, state, failureReason?, failureKind?, retryAt?` (`:13`) |
| `stage.progress` | `stage, current, total` (`:25`) |
| `article.delta` | `text` (`:33`) |
| `llm.preview` | `stage, callId, label?, text, reset?` (`:39`) |
| `image.landed` | `outputId, index` (`:49`) |
| `narration.piece` | `key, durationMs:number\|null` (`:58`) |
| `project.state` | `state` (`:65`) |
| `review.flagged` | `verdictId, stage, itemKey, reason?` (`:74`) |
| `project.updated` | none (`:85`) |
| `running.count` (global) | `count` (`:90`) |
| `schedule.topics` (global) | `scheduleId, scheduleName, added, waiting` (`:98`) |

Senders: the runner and slices emit through `hub.emit` and `hub.emitGlobal`. `eventPresenter` (`packages/app/src/edge/events/visibility.ts:58`) re-labels or drops events that do not belong to the current revision. Receiver: the browser opens one real EventSource per page, and `createEventMux` (`packages/web/src/event-mux.ts:45`) hands project-scoped stand-ins to each view. `subscribeProject` and `subscribeGlobal` (`packages/web/src/events.ts:83`, `:117`) refetch on reconnect. `01-architecture-narration.md` covers live audio previews and peaks.

### Studio extension ↔ app

| Channel | Payload out → in | Send / receive |
| --- | --- | --- |
| `POST /api/studio/ext/pair`, header `authorization: Bearer <pairing token>` | no body → `{paired:true,origin}`; the extension origin is stored as the paired origin | `packages/extension/src/background.ts:104` / `packages/app/src/edge/http/studio.ts:262` |
| `GET /api/studio/ext/pack`, bearer | → `ActivePack {pack:{projectId,projectTitle}, item:PackItem, waiting}` | `packages/extension/src/background.ts:59` / `packages/app/src/edge/http/studio.ts:283` |
| `GET /api/studio/ext/files/:projectId/:asset`, bearer | → thumbnail bytes (only thumbnails from a pack) | `packages/extension/src/background.ts:64` / `packages/app/src/edge/http/studio.ts:332` |
| `POST /api/studio/ext/filled`, bearer | `{projectId, short:number\|null}` → `{waiting:number}` | `packages/extension/src/background.ts:81` / `packages/app/src/edge/http/studio.ts:318` |
| `runtime.sendMessage` inside the extension | `WorkerRequest` = `{type:"pair",base,token}` \| `{type:"status"}` \| `{type:"payload"}` \| `{type:"filled",projectId,short}` → `WorkerAnswer {ok:true,value}\|{ok:false,message}`; `payload` answers `FillPayload {projectId,waiting?,item,thumbnails:{filename,contentType,base64}[]}` | senders `packages/extension/src/content.ts:135`, `:181`, `packages/extension/src/options.ts:18`, `:29` / receiver `packages/extension/src/background.ts:129`; types `packages/extension/src/pack.ts:44`, `:58`, `:83` |

`PackItem` is `{kind:"video"|"short", short?, video:PackFile|null, title, description, tags, thumbnails:PackFile[], audience:"not_made_for_kids", alteredContent?, playlists?, playlist, chapterNotice?}` (`packages/extension/src/pack.ts:13`, mirroring `packages/app/src/slices/studio/model.ts:37`). CORS on `/ext/*` echoes only the paired extension origin and never `*` (`packages/app/src/edge/http/studio.ts:104`). Pairing accepts only a loopback base URL (`packages/extension/src/background.ts:98`). Host permissions are `http://127.0.0.1/*` and `http://localhost/*` (`packages/extension/static/manifest.json:13`). The content script fills the Studio dialog and does not publish (`packages/extension/src/content.ts:174`).

### Telemetry and site

| Channel | Payload | Send / receive |
| --- | --- | --- |
| App → collector `POST /events` | `{events:CollectorEvent[]}`, where `CollectorEvent {id,machineId,type,payload,createdAt}` (`packages/app/src/slices/telemetry/collector-client.ts:6`) → `{ok:true,accepted}`. The app reads only success or failure; failed events stay queued. | `packages/app/src/slices/telemetry/collector-client.ts:46` / `packages/collector/src/index.ts:25` |
| Site → collector `GET /aggregates` | no body → `{aggregates}`, painted into `[data-counter]` nodes | `packages/site/public/main.js:65` / `packages/collector/src/index.ts:28` |

The default collector URL is `https://collector.slopify.stream` (`packages/app/src/slices/telemetry/collector-client.ts:26`). On a loopback origin, the site uses a local collector (`packages/site/public/main.js:7`). The D1 tables are `events` and `aggregates` (`packages/collector/schema.sql:3`, `:15`).

### In-process channels

- Provider calls: `StageProviders.llm`, `tts`, `image` and `animate` → `AttemptResult<T>` or `{ok:false,reason:"held"}`, through the shared queue (`packages/app/src/kernel/runner/providers.ts:86`). Standalone calls (schedule topics, episode summaries, cast pictures) use `standaloneLlm` and `standaloneImage` with no queue slot and are metered through `createStandaloneMeter` (`packages/app/src/main.ts:105`).
- Alignment IPC: `WorkerInput {modelPath,pcmPath,text}` → `progress`, `done {words}`, `omission` or `error` messages (`packages/app/src/adapters/alignment/protocol.ts`).
- Update IPC: the parent writes `UpdatePlan` to a file, the child sends `{type:"installed"}`, and the parent answers `{type:"handoff"}` or `{type:"abort"}` (`packages/app/src/updater/plan.ts`, `packages/app/src/updater/worker.ts`).
- Hub observers: `observedHub` (`packages/app/src/main.ts:308`) feeds `createRunNotifier` (run-finished and review-flagged notifications to the user's URL, `packages/app/src/slices/notifications/send.ts:13`) and the episode-memory watcher (`packages/app/src/main.ts:355`).

The app has no message broker, websocket or cross-process queue. Batch order, schedules, retries and trash are SQLite rows polled by the in-process timers.

## Composition

`boot` (`packages/app/src/main.ts:225`) runs these steps in order:

1. Acquires the instance lock (`:242`) and prepares FFmpeg (`:246`).
2. Opens SQLite and runs `migrate` (`:253`).
3. Settles the files location (Docker or native, `:256`).
4. Recovers checkpoint work (`:276`) and settles terminal schedule runs (`:277`).
5. Settles interrupted cast images (`:278`).
6. Reconciles storage (`:282`).
7. Builds the notifier (`:291`), the observed hub (`:308`), the telemetry flusher (`:321`), the catalogue store (`:330`), the host-CLI client when `SLOPIFY_CONTAINER=1` or `SLOPIFY_HOST_CLI_DIR` is set (`:332`), and the curated registry (`:335`).
8. Builds the episode watcher (`:355`), audio previews, review redos and narration retries (`:363`), the updater (`:399`), and the schedule runner with restart recovery (`:533`, `:538`).
9. Builds the mutation lifecycle (`:547`), the files service (`:549`) and backups (`:566`), seeds samples (`:581`), and builds autostart (`:586`).
10. Calls `createApp` with `webDist` and `extensionDist` pointing at the copied builds (`:599`, `:642`), then `listen` and the timers (`:656`).

`wireRunner` (`packages/app/src/main.ts:836`) injects the usage meter and limit gate (`:877`), a provider queue sized from catalogue limits (`:884`), SQLite attempts, the checkpoint authority, and `runs` that map every `stageKinds` entry to `runRevisionInvocation` (`:945`).

Shutdown (`packages/app/src/main.ts:752`) runs in this order:

1. Closes the notifier and episode watcher, and clears every timer (`:756`).
2. Drains mutations with a 5 s deadline, then waits for the schedule, topic and backup work to finish.
3. Aborts runner work, closes telemetry and SQLite, and releases the lock (`:797`).

`installSignalShutdown` handles SIGINT and SIGTERM (`packages/app/src/edge/signal-shutdown.ts:3`).

The build composes packages in this order (`package.json:12`):

1. `@slopify/web` builds with `vite build`.
2. `@slopify/extension` builds with esbuild into `dist/chrome`, `dist/firefox` and two zips (`packages/extension/scripts/build.mjs:46`, `:70`).
3. The app builds with `tsc`, then copies migrations, assets, `web/dist` → `app/dist/web` (`packages/app/scripts/copy-web.mjs`) and the extension zips → `app/dist/extension` (`packages/app/scripts/copy-extension.mjs:6`).

The site and collector deploy separately with `wrangler deploy` (`package.json:16`).

Browser composition: `start` (`packages/web/src/main.tsx:24`) builds the version watch, the API client (`createApi` over `watchingFetch`, with XHR uploads) and the event mux. It then renders `QueryClientProvider` → `AppProvider` → `RouterProvider` (`:40`). The root route renders `Shell` (`packages/web/src/router.tsx:38`), which nests `FormDraftsProvider` → `PlayDraftProvider` → `TutorialProvider` → `CommandPaletteProvider` → `CurrentChannelProvider` (`packages/web/src/components/shell.tsx:166`) around the route outlet (`:495`).

## Frontend

**Rendering model.** The web app is one client-rendered React 19 SPA built with Vite. It has no SSR and no second HTML entry (`packages/web/index.html:12`, `packages/web/vite.config.ts:13`). Hono serves `dist/web` as static files and falls back to `index.html` for client routes (`packages/app/src/edge/http/app.ts:314`). In development, Vite proxies `/api` and `/files` to `http://127.0.0.1:6969` as an unbuffered stream so SSE works (`packages/web/vite.config.ts:18`). The public site (`packages/site/public/index.html`, `channel.html`) is hand-written static HTML with one module script (`packages/site/public/index.html:43`). The extension options page is static HTML (`packages/extension/static/options.html`).

**Routes.** The route tree is built with TanStack Router (`packages/web/src/router.tsx:603`):

| Path | Component | Notes |
| --- | --- | --- |
| `/` | `HomeRoute` | `router.tsx:62` |
| `/projects` | `ProjectsRoute` | search `show` filter, `:68` |
| `/projects/$projectId` | `ProjectRoute` | keyed by project id; opens drafts through the Play session, `:250`, `:429` |
| `/welcome` | `WelcomeRoute` | `:85` |
| `/play` | `PlayRoute` | `:91` |
| `/prompts`, `/entries`, `/templates`, `/document-themes`, `/narration-aliases` | children of the pathless `_library` layout (`LibraryLayout`) | `kind` and `category` are validated search params; `:99`, `:256`, `:279`, `:153`, `:310`, `:304` |
| `/prompts/new`, `/prompts/$promptId`, `/entries/new`, `/entries/$entryId`, `/document-themes/new`, `/document-themes/$themeId` | editor routes | `:263`, `:273`, `:288`, `:298`, `:321`, `:329` |
| `/library` | redirect → `/prompts?kind=article` | `:105` |
| `/channels`, `/channels/$channelId` | `ChannelsRoute`, `ChannelRoute` | channel tab in search, `:114`, `:124` |
| `/calendar` | `CalendarRoute` | validated tab search, `:175` |
| `/schedules`, `/schedules/$scheduleId` | redirect → `/calendar?tab=schedules` | `:182`, `:190` |
| `/settings` | `SettingsRoute` | `section` and `note` search, `:355` |
| `/usage` | redirect → `/settings?section=usage` | `:400` |
| `/help`, `/help/tutorials` | redirect → `/help/tutorials/Home` | `:384`, `:391` |
| `/help/tutorials/$page` | `TutorialsRoute` | `:368` |
| `/design` | lazy `DesignRoute`, only when `import.meta.env.DEV` | `:590`, `:599` |

The shell rail has the destinations Home, Projects, Calendar, Channels, Library and Settings (`packages/web/src/components/shell.tsx:70`), plus the New project key to `/play` (`:413`) and a phone bottom bar (`:499`).

**Component kit.** `packages/web/src/components/kit/` holds the design-system components. 186 non-test files import from it; 20 still import the older Radix/shadcn wrappers in `packages/web/src/components/ui/` (`packages/web/components.json:1`). The rules for using the kit are in `docs/capstone/standards.md:83` and `docs/design-system.md`.

| File | Exports |
| --- | --- |
| `action-bar.tsx` | `ActionBar`, `StatusSlot` |
| `audio-player.tsx` | `AudioPlayer` |
| `board.tsx` | `Board`, `BoardColumn` |
| `button.tsx` | `Button`, `buttonClass` (variants primary, secondary, quiet, destructive, icon) |
| `callout.tsx` | `Callout` |
| `command-palette.tsx` | `CommandRegistry`, `useCommand`, `useSearchShortcut` |
| `dialog.tsx` | `Dialog`, `ConfirmDialog` |
| `drawer.tsx` | `Drawer` |
| `empty-state.tsx` | `EmptyState` |
| `facts.tsx` | `Facts`, `Fact` |
| `field.tsx` | `Field`, `useField`, `Input`, `Textarea` |
| `info-tip.tsx` | `InfoTip`, `helpScope` |
| `layout.tsx` | `PageHeader`, `Workspace`, `ListDetail`, `Rule` |
| `link.tsx` | `ButtonLink`, `TextLink`, `FileLink`, `IconFileLink` |
| `list-row.tsx` | `List`, `ListRow`, `hitArea` |
| `media.tsx`, `media-controls.tsx`, `media-stub.ts`, `player.tsx` | `MediaFrame`, `MediaGrid`, lightbox, `Player`, `playbackRates`, `playerTime` |
| `menu.tsx`, `popover.tsx` | Radix menu and popover wrappers |
| `next-action.tsx` | `NextAction` |
| `page-bar.tsx` | `PageBar` |
| `rail.tsx` | `Rail`, `RailLink`, `RailButton` |
| `reading-view.tsx` | `ReadingView`, `splitSections` |
| `section-head.tsx` | `SectionHead` |
| `stats.tsx` | `Stats`, `Stat`, `Meter`, table columns |
| `status.tsx` | `Lamp`, `Status`, badge tones |
| `steps.tsx` | `Steps` |
| `switch.tsx` | `Switch`, `Segmented` |
| `tabs.tsx` | `Tabs`, `TabLinks`, `TabPanel` |
| `toast.tsx` | `ToastProvider` |

There is no barrel file; components are imported by file.

**Styles.** Styles use Tailwind v4 through `@tailwindcss/vite` (`packages/web/vite.config.ts:13`):

- `packages/web/src/styles/index.css` imports Tailwind, `kit.css` and `shell.css` (`:1`), and declares tokens in `@theme static` (`:13`). Examples are `--color-ground`, `surface`, `raised`, `accent` (lime), and the status colours.
- Dark is the default. Light applies under `prefers-color-scheme: light` unless `data-theme="dark"` is set (`:116`), or when `data-theme="light"` is set (`:147`). `data-theme` is written by `packages/web/src/components/theme.tsx`.
- Fonts are Barlow, Barlow Condensed and JetBrains Mono from `@fontsource`, imported in `packages/web/src/main.tsx:1`.
- `packages/web/src/styles/tokens.test.ts` checks the tokens against the design system.

**API client seam.**

- `createApi` (`packages/web/src/api.ts:197`) wraps `hc<AppType>` at `${origin}/api` (`:200`) and adds `xhrUpload` for multipart uploads with progress (`:220`).
- `watchingFetch` reads `X-Slopify-Version` to prompt a reload on a version change (`packages/web/src/version.ts:53`).
- `http.ts` turns problem JSON into plain errors and `SaveResult` (`packages/web/src/http.ts:24`, `:41`).
- Feature API modules sit beside their screens and validate responses with shared Zod schemas imported through `@app`, for example `packages/web/src/play/draft-api.ts`.
- React Query keys are in `packages/web/src/queries.ts:21`.
- `packages/web/src/components/pdf-pages.tsx:62` renders document PDFs with `pdfjs-dist` and its worker.
- Browser storage holds only the active Play draft id (`slopify.play-draft`, `packages/web/src/play/draft-restore.ts:6`). Draft content lives on the server.

Web feature folders under `packages/web/src/` (shallow: listed, not inventoried file by file): `play/`, `project/`, `channels/`, `calendar/`, `schedules/`, `home/`, `library/`, `templates/`, `studio/`, `youtube/`, `video/`, `voices/`, `subtitles/`, `trash/`, `notifications/`, `onboarding/`, `tutorial/`, `tutorials/`, `help/`, `patch-notes/`, `whats-new/`, `updates/`, `autostart/`, `fixes/`, `language/`, `lib/`, `assets/`, `routes/`, `components/`, `styles/`.
