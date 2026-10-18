---
generated_at_commit: d6a72d6428ff
generated_date: 2026-10-18
capstone_version: 7.0.1
content_hash: 5be2c07a91d4
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

`packages/app/src` has four tiers plus a composition root. Dependency direction is enforced by Biome `noRestrictedImports` overrides (`biome.json:48`).

| Tier | Directories | May import | Enforcement |
| --- | --- | --- | --- |
| kernel | `packages/app/src/kernel/` (config, db, runner, ports, events, paths, clock, log, ids, lock, pipeline, `json-answer.ts`) | kernel only | Forbidden: `slices`, `edge`, `adapter-registry.js` (`biome.json:49-74`) |
| slices | `packages/app/src/slices/<feature>/` (53 directories) | kernel, other slices | Forbidden: `edge`; `adapters`, `kernel/ports/registry.js`, `adapter-registry.js` (`biome.json:75-103`). A grep of every slice file finds no `adapters/` or `edge/` import. |
| adapters | `packages/app/src/adapters/` (llm, tts, image, alignment, host-cli, interest, fake, `ffmpeg.ts`, `key-probes.ts`, and the shared helpers `model-access.ts`, `account-limits.ts`, `http-failure.ts`, `retry-after.ts`) | `kernel/ports/**`, `kernel/{clock,log,cli-command,errors}.js`, `kernel/clock.fake.js` | Everything else in kernel, plus slices, edge and the registry, is forbidden (`biome.json:104-138`) |
| edge | `packages/app/src/edge/` (CLI, `http/`, `mcp/`, `events/`, autostart, docker-install, `remote-access/`, open-folder, update worker, host-cli entry) | everything below | No Biome override; observed by imports in `packages/app/src/edge/http/app.ts` |
| composition root | `packages/app/src/main.ts`, `packages/app/src/adapter-registry.ts` | all tiers | `boot` wires adapters into slices through kernel ports (`packages/app/src/main.ts:298`); `autopilot-timers.ts`, `assistant-wiring.ts` and `model-checks.ts` beside it hold the wiring of the autopilot checks, the in-app assistant and the model checks |

Modules outside the tiers: `catalog/` (model catalogue store, its retirement dates `lifecycle.ts` read from `models-lifecycle.yaml`, the daily proposal builder `propose.ts` that `.github/workflows/catalogue.yml` runs through `packages/app/scripts/catalogue-build.ts`, and the curated registry wrapper, `packages/app/src/catalog/store.ts:67`, `packages/app/src/catalog/registry.ts:9`; it imports `slices/settings/model.js` at `packages/app/src/catalog/registry.ts:5` and has no Biome override), `updater/` (self-update service, `packages/app/src/updater/service.ts`), `host-cli/` (host helper server, install and status, `packages/app/src/host-cli/server.ts`), `sample-build/` (a script that builds the bundled sample with the pipeline, `packages/app/src/sample-build/generate.ts:93`).

The runner in `kernel/runner` imports only kernel modules; stage behaviour arrives as `RunnerDeps.runs` (`packages/app/src/kernel/runner/index.ts:58`), which `wireRunner` (`packages/app/src/main.ts:1212`) fills with `runRevisionInvocation` from `slices/rebuild` for every stage kind (`:1327`). Nineteen slices import `kernel/runner/*` from non-test code (type-only imports counted): admission, batch, cancel, checkpoints, control, episodes, model-checks, narration, notifications, play-drafts, rebuild, reruns, reviews, revisions, run-cost, schedules, settings, storage and template-studio. `storage` imports only `derive` from `kernel/runner/graph.js` (`packages/app/src/slices/storage/delete-project.ts:5`), and `admission` only the `StageProgress` type (`packages/app/src/slices/admission/repo.ts:4`).

The other packages sit beside the app:

- `packages/web` imports app source through the `@app/*` alias. `tsconfig.json` maps it to `../app/dist/*` for declarations (`packages/web/tsconfig.json:14`), and Vite rewrites it to `../app/src/*.ts` (`packages/web/aliases.ts:13`). Most imports are `import type`. Value imports are pure schema, rule and model modules, for example `slices/admission/substitute.js`, `slices/library/lint.js`, `slices/play-drafts/schema.js`, `slices/fixes/rules.js` and `edge/events/preview-cache.js` (`packages/web/src/event-mux.ts:2`).
- `packages/extension` imports nothing from the app. It keeps a copy of the upload-pack types (`packages/extension/src/pack.ts:1`) that mirrors `packages/app/src/slices/studio/model.ts:20`; the copy marks the fields an older app may omit as optional (`titles`, `alteredContent`, `playlists`, and the 3.3.0 fields `scheduleAt`, `captions`, `endScreenVideoId`, `relatedVideoId`, `pinnedComment`, `packages/extension/src/pack.ts:20`, `:33`-`:39`).
- `packages/site` and `packages/collector` import nothing from the other packages. The collector keeps its own Zod model (`packages/collector/src/model.ts`).

## Module boundaries

### Kernel

| Module | Public surface |
| --- | --- |
| `kernel/runner` | `createRunner` (`packages/app/src/kernel/runner/index.ts:89`) returns `Runner {tick, settled, abortProject, hasInflight?, abortAll, checkpoints?}` (`:67`). `StageContext` and `StageRun` are at `:44` and `:53`. `stageProviders` (`packages/app/src/kernel/runner/providers.ts:121`) wraps `StageProviders` (`:86`) so every LLM, TTS, image and animate call goes through `attempt` (`packages/app/src/kernel/runner/attempt.ts:74`). `createProviderQueue` is one app-wide queue of at most five calls, with lower per-provider limits (`packages/app/src/kernel/runner/queue.ts:10`). `standaloneLlm` and `standaloneImage` (`packages/app/src/kernel/runner/standalone.ts:105`, `:105`) serve provider calls that belong to no project. `ModelAccessRecorder` (`packages/app/src/kernel/runner/model-access.ts:14`) records what real calls teach about each model's access, and `checkModel` (`packages/app/src/kernel/runner/model-check.ts:73`) sends the one-word, spoken or small-square check requests that Settings → Models sends. |
| `kernel/ports` | `Registry {llm, tts, image, list}` (`packages/app/src/kernel/ports/registry.ts:17`). `ImagePort` has an optional `animate` for image-to-video (`packages/app/src/kernel/ports/image.ts:73`). There are also LLM, TTS, subtitle, host-cli, key-probe, plan-limit, system-speech, language and narration-alias ports, plus `assistant-cli.ts` (`RunAssistantCli`, the assistant's CLI turn), `interest.ts` (`TopicInterest`, public search interest for ranking topics) and `llm-documents.ts` (`packages/app/src/kernel/ports/`). |
| `kernel/db` | `openDb` (`packages/app/src/kernel/db/index.ts:8`) and `migrate` (`packages/app/src/kernel/db/migrate.ts:16`) over `node:sqlite`. There are 66 migration files in `packages/app/src/kernel/db/migrations/` (numbered up to 0074), the newest being `0074-template-bakeoffs.sql`. 0055–0057 add `external_reviews`, `agent_actions` (with its `idempotency_key`) and `project_starts`; 0059 adds the `canceled` state to `external_reviews`. 0063–0074 add `model_checks`; the template studio's `template_gates`, samples, jobs, bake-offs and spend; the assistant's sessions, messages and asks (and an `actor` on `agent_actions`); `autopilot_snoozes` and `topic_scores`; `designs`, their steps and templates; and a `promise` stage and `assistant` actor on reviews. `02-models.md` lists each. |
| `kernel/events` | The `ProjectEvent` union (`packages/app/src/kernel/events.ts:129`). It sits in the kernel so the runner and slices can produce events without importing `edge`. |
| `kernel/pipeline` | `formats` is `16:9, 9:16, 1:1` and `thumbnailAspect` maps `1:1` to `16:9` (`packages/app/src/kernel/pipeline.ts:6`, `:11-13`); `stageKinds` is `research, article, audio, images, thumbnail, video, document` (`packages/app/src/kernel/pipeline.ts:17`). |
| `kernel/config` | `configFrom` (`packages/app/src/kernel/config/index.ts:23`). The default port is 6969 (`:20`). |
| `kernel/json-answer` | `jsonBetween` (`packages/app/src/kernel/json-answer.ts:4`) parses the JSON an AI model's answer carries, bare, fenced or after a sentence; the scene and appearance answers (`slices/images`), generated topics (`slices/schedules/topics.ts`), short picks (`slices/shorts`) and the YouTube description answer read them through it. |

### Provider registry

`buildRegistry` (`packages/app/src/adapter-registry.ts:60`) holds every adapter. `curateRegistry` filters it through the catalogue (`packages/app/src/main.ts:411`).

| Family | Provider IDs |
| --- | --- |
| LLM | `openrouter`, `claude-code`, `codex`, `gemini` (the Antigravity CLI, command `agy`; `packages/app/src/adapter-registry.ts:76`) |
| TTS | `elevenlabs`, `openai-tts`, `cartesia`, `inworld`, `system-voice` (the computer's own speech program, `packages/app/src/adapters/tts/system.ts:33`) and `google-tts` (`packages/app/src/adapter-registry.ts:123`) |
| Image | `fal`, `replicate`, `openai-image`, `google-image`, `codex-image` (`packages/app/src/adapter-registry.ts:137`) |

In a Docker install, `claude-code`, `codex`, `gemini` and `codex-image` are replaced by clients of the host helper (`packages/app/src/adapter-registry.ts:157`, `packages/app/src/kernel/ports/host-cli.ts:8`). `01-architecture-docker.md` covers that.

### Slices

Every slice is a folder of plain modules with no `index` barrel requirement. Edge routers import individual files. The table uses each slice's own names. Stage slices (research, article, images, thumbnail, subtitles, video, shorts) hold only pure helpers (messages, plans, scene and caption rules, FFmpeg arguments) and have no edge consumer; the code that runs a stage is `rebuild`'s `runtime-*.ts` files. The earlier per-stage runners (`slices/<stage>/run.ts`) were deleted in 4.0.

| Slice | Purpose | Public surface | Edge consumers |
| --- | --- | --- | --- |
| admission | Validates a `RunDraft` and writes the project, its stages, the first revision and its work | `startRun` `packages/app/src/slices/admission/start.ts:51`; `runDraftSchema` `schema.ts:59` | actions, planning, projects, project-create, revisions, storage, studio |
| agents | Agents (Claude Code, Codex) driving Slopify over `/mcp`: the `person`/`agent` actor words, the setup lines, when an agent last connected, what agents changed (`agent_actions`), who last started a project (`project_starts`), and `needs_attention`, the agent's reading of Home's work list | `needsAttention` `packages/app/src/slices/agents/attention.ts:72`; `recordAgentAction` `repo.ts:51`; `recentAgentActions` `repo.ts:91`; `recordStart` `repo.ts:105`; `recordAgentConnection` `connection.ts:9`; `mcpPath`, `claudeAddCommand`, `codexConfig` `model.ts:9`, `:15`, `:20` | mcp, settings, revisions, projects, app (`actor.ts`, `starts.ts`) |
| assistant | The in-app assistant: chat sessions and messages, a turn run on this computer's Claude Code or Codex against `/mcp/assistant` with a per-turn token, the tools that need the person's Allow (`assistant_asks`), what it spent and which CLI it uses | `createAssistant` `packages/app/src/slices/assistant/turn.ts:133`; `isGated` `gate.ts:194`; `openAsk` `asks.ts:47`; `consumeGrant` `asks.ts:99`; `createTurnTokens` `tokens.ts:18` | assistant, mcp (`assistant.ts`), app, events hub |
| article | Article messages, continuations and end-matter split (the rebuild runtime writes and stores it) | `articleMessages` `packages/app/src/slices/article/continuation.ts:19`; `splitEndMatter` `split.ts:40` | none |
| autopilot | Hourly health checks that Home's autopilot block reads (keys, CLI sign-ins, disk, buffer of ready videos, schedules that can't run), snoozes, and the Monday weekly report | `createAutopilotHealth` `packages/app/src/slices/autopilot/signals.ts:145`; `warningsOf` `warnings.ts:57`; `bufferForecast` `buffer.ts:30`; `weeklyReport` `weekly.ts:38`; `sendWeeklyReport` `notify.ts:14` | home, app |
| backups | Scheduled and manual backups | `createBackupService` `packages/app/src/slices/backups/service.ts:55` | backups |
| batch | Queue that advances one batch project at a time | `enqueueBatch` `packages/app/src/slices/batch/index.ts:41`; `pumpQueue` `:83` | planning |
| cancel | Cancel, which aborts in-flight calls | `cancelProject` `packages/app/src/slices/cancel/index.ts:54` | actions |
| channels | Channels, cast members, cast images, channel branding of runs | `createChannel` `packages/app/src/slices/channels/service.ts:35`; `generateCastImage` `cast-images.ts:60`; `brandedRun` `runs.ts:90` | channels, channel-memory, planning, projects, project-create, studio, youtube-edits |
| checkpoints | Review checkpoints: gates, approvals, restart recovery | `approveCheckpoint` `packages/app/src/slices/checkpoints/repo.ts:146`; `changeCheckpoints` `change.ts:213`; `recoverCheckpointWork` `recovery.ts:125` | checkpoints, actions |
| control | Pause, resume, provider change, project-control lock | `pauseProject` `packages/app/src/slices/control/index.ts:96`; `withProjectControl` `lock.ts:7` | actions, checkpoints, projects, reviews, trash |
| designs | Designed pieces (posters, flyers, brochures): the design record and its steps, paid pictures through the attempt wrapper, text laid out with the font's own widths and drawn by a child ffmpeg, PDFs drawn in a forked worker, design templates with their samples and ready mark | `createDesign` `packages/app/src/slices/designs/service.ts:70`; `createDesignRunner` `runner.ts:75`; `createDesignRenderer` `render.ts:71`; `runPdfWorker` `pdf-runner.ts:10`; `markTemplateReady` `templates.ts:256` | designs, design-templates, events hub |
| document | PDF document stage: blocks, themes, jsPDF writer | `renderDocument` `packages/app/src/slices/document/render.ts:46`; `listDocumentThemes` `library.ts:31` | document-themes |
| episodes | Channel episode memory, which summarises finished projects | `createEpisodeMemoryWatcher` `packages/app/src/slices/episodes/summarize.ts:202`; `withEarlierEpisodes` `related.ts:93` | channel-memory |
| estimate | Cost estimate before Start | `estimateRun` `packages/app/src/slices/estimate/index.ts:82` | planning, auditions |
| eta | Time left on a running step | `stageEta` `packages/app/src/slices/eta/model.ts:32`; `stagesWithEta` `view.ts:8` | projects |
| fixes | Maps a named failure to its fix-it action; pure and shared with web | `fixFor` `packages/app/src/slices/fixes/rules.ts:58` | none (web only) |
| fonts | Font catalogue, upload, SFNT metadata | `resolveFont` `packages/app/src/slices/fonts/catalog.ts:29`; `uploadFont` `upload.ts:33` | fonts, planning, project-create |
| images | Image scenes, appearance and scaling (the rebuild runtime draws them) | `withScene` `packages/app/src/slices/images/scenes.ts:52`; `imageCountsOf` `scale.ts:98` | none |
| keywords | The `Slopify_` keywords Slopify fills itself: their specs, which prompt may use each, the facts copied when a run starts, the shared digest call and the checks that refuse an unknown one | `keywordSpecs` `packages/app/src/slices/keywords/specs.ts:24`; `fillKeywords` `fill.ts:25`; `keywordFactsFor` `facts.ts:30`; `keywordProblems` `rules.ts:32`; `digestMessages` `digest.ts:14` | keywords |
| library | Prompt and entry library: save, history, lint, used-by, rename propagation into templates and Play drafts | `createPrompt` `packages/app/src/slices/library/save.ts:44`; `lintPrompt` `lint.ts:15` | prompts, entries, planning, project-create |
| loudness | Loudness normalising and mastering | `normalizeFile` `packages/app/src/slices/loudness/loudnorm.ts:159`; `masterFile` `:219` | onboarding |
| model-checks | Which models work for the saved keys and CLIs: free listings, check calls (one per model, priced first), learning from real runs, standings for pickers only | `createModelChecks` `packages/app/src/slices/model-checks/service.ts:122`; `planChecks` `run.ts:72`; `listedFor` `listing.ts:71`; `pickerEntries` `rules.ts:88` | providers, model-checks |
| model-upkeep | Retired-model detection and switching | `switchRetiredModel` `packages/app/src/slices/model-upkeep/switch.ts:121`; `retiredModelUsage` `usage.ts:244` | providers |
| narration | Narration planning, chunking, pronunciation, aliases, peaks | `planNarration` `packages/app/src/slices/narration/plan.ts:55` | narration-peaks, pronunciations |
| notifications | Run notifications sent to a user-set URL | `createRunNotifier` `packages/app/src/slices/notifications/notifier.ts:50`; `createNotificationSender` `send.ts:13` | settings |
| onboarding | First run, starter packs, bundled sample projects | `seedSamples` `packages/app/src/slices/onboarding/sample.ts:75`; `installPack` `install.ts:35` | onboarding, app (sample read-only guard) |
| patch-notes | Patch notes shown once per version | `duePatchNote` `packages/app/src/slices/patch-notes/seen.ts:57` | patch-notes, whats-new |
| play-drafts | Durable Play drafts: save, fork, review, start | `createDraft` `packages/app/src/slices/play-drafts/service.ts:157`; `startPlayDraft` `start.ts:24`; `toAdmissionDraft` `convert.ts:66` | drafts, draft-files, project-templates |
| project-templates | Versioned templates, from-project, one-off | `createTemplate` `packages/app/src/slices/project-templates/service.ts:39`; `createTemplateFromProject` `from-project.ts:36` | project-templates |
| rebuild | Recipe planning and runtime execution for every stage, rebuild preview/start, recovery, retries, review redos | `runRevisionInvocation` `packages/app/src/slices/rebuild/runtime-run.ts:19`; `previewRebuild` `service.ts:51`; `startRebuild` `service.ts:84`; `recoverProject` `recovery.ts:62` | actions, projects, reviews, revisions |
| reruns | Retry, re-run, and marking downstream stages stale | `retryStage` `packages/app/src/slices/reruns/index.ts:72`; `redoPlan` `cascade.ts:44` | actions |
| research | Research planner, sub-agent and synthesis messages and checks (the rebuild runtime runs them) | `plannerMessages` `packages/app/src/slices/research/planner.ts:14`; `chaptersFrom` `planner.ts:39` | none; see `01-architecture-research.md` |
| reviews | Automatic review verdicts and outcomes; the Promise check (the written article's opening against the title and thumbnail, run by `rebuild/review-promise.ts`); External agent reviews (`external_reviews`), which wait 2 h for an agent's verdict and then pass without review | `parseVerdict` `packages/app/src/slices/reviews/verdict.ts:83`; `reviewOutcome` `outcome.ts:22`; `answerExternalReview` `external-repo.ts:82` (first verdict saved wins); `settleExternalReviews` `external-repo.ts:133`; `releaseDueReviews` `external-release.ts:27` | reviews, external-reviews |
| revisions | Immutable revisions: save, restore, publish outputs, views, downloads; a rename keeps the project's subject (`keptSubject` `subject.ts:7`, called at `mutations.ts:93`) | `saveRevision` `packages/app/src/slices/revisions/mutations.ts:58`; `restoreRevision` `restore.ts:24`; `getRevisionView` `view.ts:7` | revisions, revision-files, actions, audio-preview, narration-peaks, projects, reviews |
| run-cost | Usage metering, pricing, CLI plan-limit gate, plan usage readings (`plan-readings.ts`, `plan-use.ts`) and Home's week summary | `createUsageMeter` `packages/app/src/slices/run-cost/meter.ts:27`; `createLimitGate` `limits.ts:30` | run-cost, home, projects |
| schedules | Schedules, calendar, topic generation, scheduler, topics prepared ahead of their day (`prepared_videos`), topic scoring by public search interest (`topic-scores.ts`), design schedules (`design-agenda.ts`, `design-run.ts`) | `createScheduleRunner` `packages/app/src/slices/schedules/scheduler.ts:35`; `nextOccurrence` `calendar.ts:34`; `prepareTopic` `prepare.ts:65`; `continuePrepared` `prepare.ts:183` | schedules (and calendar) |
| settings | Keys, CLI paths and status, health, models, readiness, tutorial session | `providerStatuses` `packages/app/src/slices/settings/readiness.ts:23`; `checkProviderHealth` `health.ts:89` | settings, providers, diagnostics, onboarding, tutorial, whats-new, actions |
| shorts | Vertical shorts: clip picks, captions, render | `renderShort` `packages/app/src/slices/shorts/render.ts:241`; `checkPicks` `pick.ts:226` | none |
| storage | Staging, assets, backup export/import, reconcile, files location, project deletion | `reconcileStorage` `packages/app/src/slices/storage/reconcile.ts:15`; `createFilesService` `files-location.ts:184`; `importBackup` `backup-import.ts:163` | storage, storage-files, staging, files, open-folder, studio and others |
| studio | Upload pack, fill queue, pairing and AI disclosure for the Studio extension; posting plan, release calendar (one release time per long video and per short, `releases`) and Calendar → Releases, title/thumbnail pick, the YouTube videos uploads became with their A/B, finish and comment task states and Studio's checks, Studio numbers and A/B results, Content-list backfill | `uploadPack` `packages/app/src/slices/studio/pack.ts:62`; `packItem` `pack.ts:305`; `enqueueFill` `queue.ts:56`; `fillOnly` `queue.ts:87`; `readPlan` `plan.ts:55`; `seriesOf` `plan-model.ts:43`; `planReleases` `releases.ts:190`; `freeSlots` `releases.ts:164`; `setRelease` `releases.ts:260`; `scheduleOf` `releases.ts:286`; `releaseCalendar` `calendar.ts:71`; `writeUploadPick` `pick.ts:28`; `recordVideo` `videos.ts:73`; `confirmUpload` `videos.ts:94`; `waitingTasks` `videos.ts:148`; `setChecks` `videos.ts:195`; `saveAbResult` `stats.ts:27`; `abResults` `stats.ts:41`; `backfillVideos` `backfill.ts:17` | studio, projects (`longVideoStats`, `packages/app/src/edge/http/projects.ts:81`) |
| style-preview | Cached rendered caption and look previews | `createStylePreviews` `packages/app/src/slices/style-preview/service.ts:50` | style-preview |
| template-studio | Library → Templates → Open studio: sections and their settings, free and paid samples made one job at a time, the money rules (quote, acknowledged high, daily budget, CLI-plan switch), Mark ready and the version schedules run, Compare models bake-offs, template packs | `getStudio` `packages/app/src/slices/template-studio/service.ts:142`; `saveStudio` `save.ts:109`; `markReady` `ready.ts:107`; `createSampleRunner` `runner.ts:30`; `makePaidSample` `paid.ts:162`; `quoteBakeoff` `bakeoff.ts:210`; `exportPack` `pack.ts:183`; `importPack` `pack-import.ts:255`; `runnableTemplate` `schedule-gate.ts:41` | template-studio, project-templates, home, diagnostics, storage, app |
| subtitles | Cues and SRT/VTT/ASS text (the rebuild runtime times and writes them) | `captionCues` `packages/app/src/slices/subtitles/captions.ts:16`; `serializeAss` `captions.ts:120` | none |
| telemetry | Local counters and the collector flush | `record` `packages/app/src/slices/telemetry/record.ts:48`; `createFlusher` `flush.ts:79` | telemetry, usage, project-create |
| thumbnail | The message a thumbnail prompt is written from (the rebuild runtime draws the image) | `thumbnailMessages` `packages/app/src/slices/thumbnail/by-llm.ts:23` | none |
| trash | Settings → Trash with 30-day retention | `trashProject` `packages/app/src/slices/trash/service.ts:85`; `createTrashPurge` `:313` | trash, projects |
| tutorials | Bundled tutorial pages and search | `loadTutorials` `packages/app/src/slices/tutorials/library.ts:84`; `searchTutorials` `:179` | tutorials |
| uploads | Mark uploaded; Needs you's "Keep as is" (`project_set_aside`) | `markUploaded` `packages/app/src/slices/uploads/repo.ts:12`; `uploadedProjects` `:32`; `setAside` `:43`; `setAsideProjects` `:61` | home, projects, studio |
| video | Video render: FFmpeg plan, ambient bed, edits, cards; clips rendered in parallel and reused across renders | `planRender` `packages/app/src/slices/video/plan.ts:150`; `renderJobs` / `inPool` `pool.ts:33`, `:33`; `reuseClip` / `keepClip` / `pruneClips` `clip-cache.ts:78`, `:67`, `:78` | none |
| voices | Voices, cast voicing, languages, audition lines | `withCastVoices` `packages/app/src/slices/voices/cast.ts:66` | auditions |
| youtube | YouTube description, chapters, tags and hand edits; A/B title shape (only the title pattern's keywords change) | `assembleDescription` `packages/app/src/slices/youtube/answer.ts:165`; `composeDescription` `edits.ts:85`; `titleShape` / `keepsShape` `titles.ts:38`, `:38` | youtube-edits, settings |

The project and step state words (Queued, Running, Paused, Failed, Done with problems, Done, Canceled, and the held words Kept as is, Waiting for the agent, Stopped, Prepared, Waiting for your review) are one browser-safe table, `packages/app/src/slices/admission/state-words.ts` (`projectStateWord` `:113`, `heldStateWord` `:80`), read by the web and by the MCP tools.

`rebuild` is the hub slice: its non-test code imports 29 other slices. Every one of the seven stage IDs executes through `runRevisionInvocation` (`packages/app/src/main.ts:1327`). Recipe kinds and runtime dispatch are in `01-architecture-recovery.md` and `01-architecture-narration.md`.

### MCP edge (`edge/mcp/`)

`packages/app/src/edge/mcp/` turns the app's own `/api` into MCP tools. It holds no rules of its own: `createMcpServer` (`packages/app/src/edge/mcp/server.ts:22`) registers 258 tools and one prompt.

- 251 route tools: `routeTools` (`packages/app/src/edge/mcp/tools.ts:15`) is the union of eleven tables, each row a `RouteTool` naming one existing route (`packages/app/src/edge/mcp/route-tool.ts:8`). `callRoute` (`packages/app/src/edge/mcp/call-route.ts:55`) runs it.
- 7 bespoke tools that read or combine what no single route answers: `list_project_files` and `get_project_file` (`file-tools.ts:152`), `get_external_review` (`review-tools.ts:76`), `export_library` and `import_library` (`library-tools.ts:177`), `preview_remake_outdated` (`remake-tools.ts:108`) and `needs_attention` (`server.ts:32`).
- The prompt `attend` and the server instructions carry the routine an agent runs on a schedule (`packages/app/src/edge/mcp/instructions.ts:3`, `:22`), followed by a note about designs (`:19`).
- A second endpoint, `/mcp/assistant` (`assistantMcpPath`, `packages/app/src/edge/mcp/assistant.ts:46`), serves the in-app assistant. It offers `assistantRouteTools` (the route tools minus `assistantExcludedTools` and any tool that uploads a file, `:49`), the file, remake and attention tools, and three of its own: `search_wiki`, `read_wiki` and `current_screen`. It opens only for a running turn's bearer token (`:302`), refuses proxied requests and foreign origins like `/mcp`, records every call as "by assistant", and answers "waiting" for a tool in `assistantCostlyTools` or `assistantOutwardTools` (`packages/app/src/slices/assistant/gate.ts:78`, `:78`) until the person presses Allow, which makes the call once (`runAllowedCall`, `:182`).
- 92 `/api` routes are not offered, each with its reason (`excludedRoutes`, `packages/app/src/edge/mcp/excluded-routes.ts:24`): provider keys and key checks, the extension's pairing and `/api/studio/ext/*` routes, backups, the updater, host setup, all-projects cleanup, YouTube actions (queueing an upload for the extension, the auto-comment setting), live SSE streams, desktop windows, sound and picture previews, the person's tutorial and notices, retired revision-required routes, and `POST /api/projects` and `/batch` (projects start from Play drafts). `tools-parity.test.ts` enumerates `app.routes` and fails when a route is neither a tool nor excluded.

| Tool table | Tools | Route families |
| --- | ---: | --- |
| `tools-projects.ts` | 26 | `/api/projects` list, get, delete, estimate, queue, move-channel, run cost, uploaded, set-aside, outputs, checkpoints, reviews and `external-reviews/:reviewId/verdict`; `/api/storage/projects/:id`; `/api/home/week` |
| `tools-runs.ts` | 14 | `/api/projects/:id` pause, resume, cancel, stage retry/soften/rerun, revisions (prepare, list, view, narration chunks, save, restore), rebuild preview and start |
| `tools-publishing.ts` | 22 | `/api/projects/:id/youtube-edits` and `channel-links`; `/api/studio` packs, queue, releases, plan, lead hours, videos, A/B results |
| `tools-planning.ts` | 21 | `/api/drafts`, `/api/project-templates`, `/api/staging` |
| `tools-schedules.ts` | 24 | `/api/schedules`, `/api/calendar` |
| `tools-channels.ts` | 24 | `/api/channels` |
| `tools-library.ts` | 26 | `/api/prompts`, `/api/entries`, `/api/fonts`, `/api/document-themes`, `/api/pronunciations` |
| `tools-setup.ts` | 33 | `/api/settings` (incl. `/agents`, notifications, voices, channel links), `/api/providers` (status, models, catalogue, health), `/api/model-checks` and `/api/providers/:id/models/check` (with its estimate), `/api/settings/remote-access` (read only), `/api/studio/settings`, `/api/usage`, `/api/diagnostics`, `/api/auditions/quote` |
| `tools-storage.ts` | 15 | `/api/trash`, `/api/storage`, `/api/storage/files`, `/api/onboarding` |
| `tools-designs.ts` | 23 | `/api/designs` and `/api/design-templates` (list, create, edit, quote, make the picture or artwork, retry a step, set the version, sample, mark ready, make a design from a template) |
| `tools-template-studio.ts` | 23 | `/api/template-studio` (read a studio and its checks, quote and save, samples, sample topic and full script, Say it as, prompt anatomy, Mark ready, Compare models, template packs, studio settings) |

MCP annotations follow the route: `readOnlyHint` for a GET or an unrecorded call that sends nothing, `destructiveHint` for a DELETE or a confirmed action, `openWorldHint` when the call reaches outside Slopify (`packages/app/src/edge/mcp/server.ts:70`-`:72`). Project and stage answers gain a `stateWord` from `slices/admission/state-words.ts` (`packages/app/src/edge/mcp/state-shapes.ts:37`, `:50`).

### Web, extension, site, collector

- The web public surface is its route tree (`packages/web/src/router.tsx:792`). Only files under `packages/web/src/components/kit/` may write raw button, link-as-button and hit-area markup; `packages/web/src/kit-rules.test.ts:1` checks this, and `packages/web/src/click-budget.test.tsx` fails when a common task takes more clicks than its budget in `docs/design-system.md`.
- In the extension, the background worker makes every Slopify call except one: the hidden `video-frame.html` page fetches the upload's video file from `/api/studio/ext/files/...` with the pairing token and hands the `File` to the Studio page by `postMessage` (`packages/extension/src/video-frame.ts:36`, `:67`). The content scripts receive a `FillPayload` with thumbnails (and captions) already base64-encoded and never call Slopify themselves (`packages/extension/src/pack.ts:56`).
- The site is static assets with no server side (`packages/site/wrangler.jsonc:4`).
- The collector reads the D1 binding `DB` only (`packages/collector/wrangler.jsonc:24`).

## Entry points

| Process | Entry |
| --- | --- |
| Installed CLI `slopify` | `packages/app/src/edge/cli.ts:14` parses argv. It handles help and version, dispatches `--docker`, `install` and `update` to lazily imported `docker-install/run.js` and `native-update.js` (`:56`, `:71`), and otherwise calls `boot` (`:86`). The bin mapping is in `packages/app/package.json:17`. |
| App HTTP server | `boot(config)` (`packages/app/src/main.ts:298`) builds everything. `listen` serves `app.fetch` with `@hono/node-server` (`packages/app/src/main.ts:1353`). |
| MCP endpoints | `/mcp` on the same Hono app, host and port as the web page and `/api`: `app.route(mcpPath, mcpRoutes(...))` (`packages/app/src/edge/http/app.ts:441`, `packages/app/src/edge/mcp/http.ts:55`). Native and Docker alike; there is no stdio transport and no separate process. `/mcp/assistant` is mounted just before it (`:431`) for the in-app assistant and opens only for a running turn's token. Both refuse any request that came through a proxy (`agentsLocalOnly`, `packages/app/src/edge/mcp/http.ts:15`), so Tailscale serve never reaches them. |
| In-process timers | Batch queue every 1 s (`packages/app/src/main.ts:970`), schedules every 15 s (`:981`), retry wake-ups every 5 s (`:986`), which also settle External agent reviews past their 2 h deadline (`releaseReviews`, `:956`, `:991`; also run once at boot right after `listen`, `:969`), the model catalogue checked hourly and synced when a day has passed, together with the model checks' CLI look and weekly check (`:1034`), backups every 60 s (`:1038`), trash purge hourly (`:1064`), folder arranging every 5 s (`:1080`). The autopilot health check runs 30 s after start and then hourly, and its weekly report is looked at every 15 minutes (`packages/app/src/autopilot-timers.ts:16`-`:18`, `:67`-`:69`). The template studio's sample loop and the design runner are not timers: they wake when a job is queued. The telemetry flusher uses a debounced `setTimeout` (`packages/app/src/slices/telemetry/flush.ts:94`). None of these is a separate worker. |
| Alignment child | `fork` at `packages/app/src/adapters/alignment/runner.ts:24`. The child receives one IPC message at `packages/app/src/adapters/alignment/worker.ts:17`. |
| Update worker | Spawned with `node <worker> <planPath>` (`packages/app/src/updater/install.ts:18`). It reads the plan path at `packages/app/src/edge/update-worker.ts:5`. |
| Host CLI helper | `packages/app/src/edge/host-cli.ts:50` starts `startHostServer` on a Unix socket (`packages/app/src/host-cli/server.ts:10`). It runs on the Docker host. `01-architecture-docker.md` covers it. |
| Sample build script | `packages/app/src/sample-build/generate.ts:93` (`main`). |
| Browser SPA | `packages/web/src/main.tsx:24` (`start`), mounted on `#root` (`packages/web/index.html:11`). |
| Extension background worker | `packages/extension/src/background.ts:465` (`runtime.onMessage`). The manifest declares it as `background.service_worker` (`packages/extension/static/manifest.json:19`). An `alarms` alarm `slopify-ab-tests` fires every 15 minutes and on browser start runs `checkTasks` (`packages/extension/src/background.ts:172`-`:225`, `:490`, `:512`). |
| Extension Studio content script | `packages/extension/src/content.ts` on `https://studio.youtube.com/*` (`packages/extension/static/manifest.json:23`). On load it reads the URL hash: `#slopify-ab=<mode>` runs `runAb`, `#slopify-finish` runs `runFinish`, `#slopify-stats=1|2|3` runs `runStats`/`runAbRead`; otherwise a `MutationObserver` watches for the upload dialog and Studio's Content list (`packages/extension/src/content.ts:645`-`:658`, `:475`). On a Content list opened with `#slopify-checks` it sends the rows with `close:true` (`:578`-`:582`). |
| Extension watch-page content script | `packages/extension/src/comment.ts` on `https://www.youtube.com/watch*` (`packages/extension/static/manifest.json:28`); acts only on a `#slopify-comment&p=<project>&s=<short>` hash (`packages/extension/src/comment.ts:101`). |
| Extension toolbar popup | `packages/extension/src/popup.ts:290` (`start`), loaded by `static/popup.html` as `action.default_popup` (`packages/extension/static/manifest.json:54`). |
| Extension video frame | `packages/extension/src/video-frame.ts:86` posts `slopify-video-ready` to its Studio parent; `static/video-frame.html` is web-accessible to `https://studio.youtube.com/*` only (`packages/extension/static/manifest.json:45`). |
| Extension options page | `packages/extension/src/options.ts:1`, loaded by `static/options.html` (`packages/extension/static/manifest.json:44`). |
| Collector Worker | `export default { fetch }` at `packages/collector/src/index.ts:21`, deployed on `collector.slopify.stream` (`packages/collector/wrangler.jsonc:14`). |
| Public site | Static `packages/site/public/` on `slopify.stream` (`packages/site/wrangler.jsonc:9`). The module `main.js` starts at `packages/site/public/main.js:247`. |

## Communication

### App HTTP

`createApp` (`packages/app/src/edge/http/app.ts:290`) applies these middleware layers, in order:

- Funnel guard: a request Tailscale marks as Funnel traffic (public internet) is refused with 403 (`:310`, `viaFunnel`, `packages/app/src/edge/http/same-page.ts`). Slopify never turns Funnel on.
- `requestGuard` (`:320`, `packages/app/src/edge/http/request-guard.ts:66`): for a request made by the person (not an in-process agent or assistant call) the Host (and a loopback proxy's `X-Forwarded-Host`) must be a name Slopify answers to (loopback, an IP, the listen address, a `*.ts.net` name, this computer's name, the remote-access name or a name in `SLOPIFY_ALLOWED_HOSTS`), else 403 `foreign-host`. A change under `/api/` that carries an Origin must come from Slopify's own page at the very host and port the browser addressed (`fromSlopifyPage`, `same-page.ts`), else 403 `foreign-origin`; a form-typed body without an Origin needs the header `X-Slopify-Client`, else 403 `form-request`. The paired extension's `/api/studio/ext/*` routes are exempt.
- `remoteGuard` (`:328`, `packages/app/src/edge/http/remote-guard.ts:70`): for a proxied request, a Tailscale login other than the account that turned remote access on gets 403, and the writes in `hostOnlyWrites` (provider keys, a CLI's path, backup import, clean-ups that delete files, moving the Files folder, the backup folder, updates, start with this computer) are refused with 403 `host-only`. `/mcp*` is left to its own proxy refusal.
- Every response carries `X-Slopify-Version` unless an update candidate is locked (`:331`).
- Every non-GET `/api/*` request passes the Docker-installation gate, the shutdown gate and the updater mutation gate, or gets a 503 or 409 problem (`:336`).
- Writes to the bundled sample project are refused with 409 `reason:"sample-read-only"` (`:374`), and writes to a template studio's hidden sample project with 409 `reason:"template-sample"` (`:392`).
- Unknown `/api/*` paths return a problem+json 404 (`:417`).

`apiRoutes` mounts the chained registry under `/api` (`packages/app/src/edge/http/app.ts:405`, defined at `:219`), and `AppType` is exported for the typed client (`:213`). File routes mount at `/` (`:413`), and the SPA static fallback comes last (`:460`).

Except where a row says otherwise, requests and responses are JSON, and refusals are problem JSON (`packages/app/src/edge/http/problem.ts`). Named DTOs are defined in `02-models.md`.

| Mount | Router (definition) | Routes → payloads |
| --- | --- | --- |
| `/api/health` | inline `app.ts:222` | GET → `{status:"ok",version,uptimeMs}` |
| `/api/staging` | `stagingRoutes` `staging.ts:17` | GET → `{files:StagedFile[]}`; POST `/:kind` multipart `file` → `StagedFile`; DELETE `/:id` → 204 |
| `/api/storage/files` | `filesRoutes` `storage-files.ts:12` | GET → the files-location view; POST `/open` opens the folder |
| `/api/storage` | `storageRoutes` `storage.ts:32` | GET → `StorageUsage`; GET `/projects/:id`; POST `/projects/:id/keep-outputs` → `{ok,files,bytesFreed}`; GET `/export/summary`; GET `/export` → backup tar stream; PUT `/import` takes a tar (`application/x-tar`) or a settings ZIP → an import summary; POST `/cleanup` → reconciliation counts |
| `/api/backups` | `backupRoutes` `backups.ts:10` | GET → backups view; PUT schedule and folder → view; POST `/run` → 202 view |
| `/api/trash` | `trashRoutes` `trash.ts:84` | GET → `{items:TrashItem[]}`; POST `/:kind/:id/restore`; DELETE `/:kind/:id` |
| `/api/drafts` | `draftRoutes` `drafts.ts:50`, file routes `draft-files.ts:27` | GET → `{drafts:DraftSummary[]}`; POST `{id,document:PlayDraftDocument}` → `DraftView`; GET/PUT/DELETE `/:id`; POST `/:id/fork`, `/:id/review` → `PlayReview`, `/:id/start` → `PlayStartResult`; PUT/GET `/:id/attachments/:attachmentId/file` (multipart in, image bytes out). The browser validates both directions with shared Zod schemas (`packages/web/src/play/draft-api.ts`). |
| `/api/diagnostics` | `diagnosticsRoutes` `diagnostics.ts:11` | GET → no-store JSON download: versions, secret-free readiness, catalogue status |
| `/api/project-templates` | `projectTemplateRoutes` `project-templates.ts:47` | CRUD, POST `/from-project/:projectId`, POST `/:id/instantiate` → `DraftView` |
| `/api/template-studio` | `templateStudioRoutes` `template-studio.ts:188` | GET `/:id` → the studio view; GET `/:id/checks`; POST `/:id/quote`, `/:id/save`, `/:id/samples/make`, `/:id/free-samples`; GET/PUT `/settings` (daily budget, CLI plans); POST `/samples-for-all` and its `/quote`; sample topic, full-script, Say it as, GET `/:id/anatomy`; POST `/:id/ready`; `/:id/bakeoff` (GET, quote, start, DELETE); GET `/:id/pack` and `/:id/pack-samples`, POST `/packs/import`; GET `/:id/document.pdf`. Paid or removing calls refuse until their quote is acknowledged. |
| `/api/designs`, `/api/design-templates` | `designRoutes` `designs.ts:84`, `designTemplateRoutes` `design-templates.ts:82` | Designs: list, create, GET/PUT/DELETE `/:id`, `/:id/quote`, `/:id/artwork/quote`, `/:id/edit`, `/:id/artwork`, `/:id/steps/:stepId/retry`, PUT `/:id/head`, picture and `/:id/files/:file` bytes (PNG, or PDF drawn in the worker). Templates: CRUD, `/:id/quote`, `/:id/sample`, `/:id/ready`, `/:id/make` |
| `/api/schedules`, `/api/calendar` | `scheduleRoutes` `schedules.ts:110`, `calendarRoutes` `schedules.ts:440` | CRUD with `ScheduleSummary`; pause, resume, cancel; topic generate, held, approve, reject, move, transfer; GET `/:id/prepared` → `{prepared:{title,topic,projectId}[]}` (`:211`); POST `/:id/topics/prepare` `{topic}` → 201 `{projectId,title}`, or 404/409 problem with `reason` `not-found`, `already-prepared`, `missing-template`, `spend-limit` or a start refusal (`:216`); GET `/api/calendar?from&to` → upcoming runs |
| `/api/channels` | `channelRoutes` `channels.ts:40`, `channelMemoryRoutes` `channel-memory.ts:38` | Channel CRUD; AI disclosure; cast members and cast pictures (raw bytes in, 201; generate → 202); GET `/pictures/:sha256` → image bytes; PUT `/templates/:templateId`; episode memory; existing videos (POST takes a YouTube Studio export) |
| `/api/projects` | `planningRoutes` `planning.ts:33`, `projectRoutes` `projects.ts:46`, `checkpointRoutes` `checkpoints.ts:59`, `reviewRoutes` `reviews.ts:31`, `externalReviewRoutes` `external-reviews.ts:65`, `revisionRoutes` `revisions.ts:82`, `revisionFolderRoutes` `revision-files.ts:88`, `openFolderRoutes` `open-folder.ts:10`, `audioPreviewRoutes` `audio-preview.ts:19`, `narrationPeakRoutes` `narration-peaks.ts:25`, `runCostRoutes` `run-cost.ts:17`, `uploadedRoutes` `home.ts:70`, `actionRoutes` `actions.ts:37`, `subtitleRoutes` `subtitles.ts:8`, `youtubeEditRoutes` `youtube-edits.ts:33` | POST `/` `RunDraft` → 201 `{project,stages}`; GET `/` → `{projects}`; GET/DELETE `/:id` (DELETE moves the project to Trash); `/estimate` → `{estimates:CostEstimate[]}`; `/batch` and `/queue` → `{queue:QueueEntry[]}`; revisions prepare/list/view/save/restore → `RevisionView`; `/rebuild/preview` → `RebuildPreview`, `/rebuild` → 202 `RebuildAdmission`; pause, cancel, resume, retry, re-run, soften with `{baseRevisionId,idempotencyKey}`; checkpoints GET/PATCH/approve; reviews list, overrule, redo; POST `/:id/external-reviews/:reviewId/verdict` `{verdict,reasons}` (an agent's answer to an External agent review); `/audio-preview/:previewId` → growing `audio/mpeg`; `/narration/peaks` → `NarrationPeaks`; `/run-cost`; PUT `/:id/set-aside` `{setAside:boolean}` → `{setAside}` (`home.ts:75`); PUT `/:id/uploaded` `{uploaded:boolean}` → `{uploadedAt}` (`home.ts:94`); the list rows add `setAside?`, `views?` and `ctr?` (`projects.ts:92`-`:98`); YouTube edits and `/:id/channel-links`. Retired mutations (provider PATCH, article PUT, image DELETE, subtitles PATCH) return 409 `reason:"revision-required"`. |
| `/api/home` | `homeRoutes` `home.ts:21` | GET `/week?since&channel` → week's videos, spend, CLI plan windows |
| `/api/update` | `updateRoutes` `update.ts:7` | GET, POST, DELETE → `UpdateInfo`; GET `/ready` and POST `/activate` with the `X-Slopify-Update-Token` header |
| `/api/fonts`, `/api/prompts`, `/api/entries`, `/api/document-themes` | `fontsRoutes` `fonts.ts:25`, `promptRoutes` `prompts.ts:45`, `entryRoutes` `entries.ts:28`, `documentThemeRoutes` `document-themes.ts:25` | Library CRUD; history, restore, used-by; font multipart upload and `/:id/file` bytes; document theme POST `/preview` |
| `/api/pronunciations`, `/api/auditions` | `pronunciationRoutes` `pronunciations.ts:17`, `auditionRoutes` `auditions.ts:38` | Shared glossary and `/aliases`; audition `/quote` → `{estimate}`, POST speaks a confirmed line |
| `/api/telemetry`, `/api/usage` | `telemetryRoutes` `telemetry.ts:8`, `usageRoutes` `usage.ts:13` | Notice GET/POST → `{seen,appVersion}`; usage GET → `Usage` |
| `/api/settings/autostart` | `autostartRoutes` `autostart.ts:12` | GET, PUT, POST `/answer`: start-with-computer state |
| `/api/settings/remote-access` | `remoteAccessRoutes` `remote-access.ts:17` | GET → `RemoteAccessView` (state, address, QR text, fix); PUT `{enabled, httpsPort?}` applies Tailscale Serve for this server's loopback port. Person only |
| `/api/settings` | `settingsRoutes` `settings.ts:71` | GET/PUT `AppSettings`; `/channel-links`; `/notifications` and `/notifications/test`; GET `/agents` → `{lastConnectedAt, recent}`; `/voices` CRUD |
| `/api/studio` | `studioRoutes` `studio.ts:179` | Slopify page (writes refused with 403 from another origin by `samePage`, `:179`): GET `/settings` → `{playlists, channelPlaylists, pairing, autoComment}` (`:256`); PUT `/settings/auto-comment` `{on}` → `{autoComment}` (`:268`); GET/PUT `/plan` `PostingPlan` → `{plan, leadHours, series:string[]}` (the projects' non-empty series, sorted; `:227`, `:279`, `:280`); PUT `/settings/lead-hours` `{hours}` (1-168) → same body (`:286`); GET `/releases?weeks=1-8` (default 2) → `ReleaseCalendar`, after giving every finished project and every project already holding a release its times (`:302`); PUT `/releases/:projectId` `{short 0-99, at:ISO\|null, line?}` (null = not scheduled) → `{releases:Release[]}` (`:327`); PUT `/settings/playlists`; POST `/settings/pairing`; GET `/packs/:projectId` → `UploadPack` + `slotChoices:Slot[]` (up to 9 free long-video times of the project's series; also plans the project's releases, `:212`, `:234`, `:381`); PUT `/packs/:projectId/slot` `{slot:{row,longAt}\|null}` → pack + `slotChoices`, 409 when taken (`:389`); PUT `/packs/:projectId/real-footage`, `/pick` `{title,thumbnail}` (0-9), `/playlists` → `UploadPack` (`:423`, `:439`, `:454`); POST `/packs/:projectId/choose` `{short?}` → `{chosen, queue:FillQueueItem[]}` (`:468`); GET `/stats/:projectId` → `{stats:VideoStats[]}` (`:490`); GET `/ab-results` → `{results}` (`:493`); GET `/videos/:projectId` → `{videos:YoutubeVideo[]}`; PUT `/videos/:projectId` `{short?, link}` (empty link forgets) → `{videos}` (`:495`, `:501`); GET `/queue`, POST `/queue/remove`; GET `/extension/:file` → `application/zip` (`chrome.zip` or `firefox.zip`, `:539`). Cross-origin, paired extension only: see the extension table below. |
| `/api/style-preview` | `stylePreviewRoutes` `style-preview.ts:16` | POST settings → where the preview is; GET `/:file` → MP4 with byte ranges |
| `/api/tutorial` | `tutorialRoutes` `tutorial.ts:13` | GET, PUT `{baseVersion,mutationId,session}`, DELETE |
| `/api/whats-new`, `/api/patch-notes` | `whatsNewRoutes` `whats-new.ts:7`, `patchNotesRoutes` `patch-notes.ts:15` | GET and POST `/seen`; GET `/:id` → one patch note |
| `/api/tutorials` | `tutorialPagesRoutes` `tutorials.ts:17` | GET, GET `/search`, GET `/:page` → bundled tutorial pages |
| `/api/model-checks` | `modelCheckRoutes` `model-checks.ts:139` | GET → overview (standings, new-for-you, spend); POST `/notices/dismiss`; PUT `/auto`. Per-provider estimate and run are `providerCheckRoutes` `model-checks.ts:72` under `/api/providers/:id/models/check` |
| `/api/assistant`, `/api/keywords` | `assistantRoutes` `assistant.ts:48`, `keywordRoutes` `keywords.ts:14` | Assistant: GET → availability, CLI and the current session; POST `/sessions`, `/sessions/:id/messages`, `/sessions/:id/stop`, `/asks/:id` (Allow or Deny); PUT `/cli`. Person only (403 for an agent). Keywords: GET → every `Slopify_` keyword with its cost and places; GET `/facts/:projectId` |
| `/api/providers` | `providerRoutes` `providers.ts:48` | GET → `{providers:ProviderStatus[]}`; `/:id/models` → `ModelCatalog`; key PUT/DELETE/test; path PUT; catalogue check, refresh and retired switch; `/key-guides`; `/first-run`; `/health`; `/system-voice/voices` |
| `/api/onboarding` | `onboardingRoutes` `onboarding.ts:50` | GET state; POST `/dismiss`, `/packs/:id`, `/short`, `/full-video`; GET `/sample`; POST `/sample/restore`, `/sample/copy` |
| `/files/...` | `fileRoutes` `files.ts:24`, `revisionFileRoutes` `revision-files.ts:35` | Output bytes and `images.zip` for the current project and for any revision record |

Two routes serve agents' work in particular. `POST /api/projects/:id/external-reviews/:reviewId/verdict` (`externalReviewRoutes`, `packages/app/src/edge/http/external-reviews.ts:65`, `:72`, mounted at `app.ts:248`) takes `{verdict:"pass"|"fail", reasons[]}` (at most 10 reasons of 1–500 characters; a fail needs one) and answers 400 `reason:"invalid-verdict"` with the body to send instead, or refuses a second answer as already answered. `GET /api/settings/agents` (`packages/app/src/edge/http/settings.ts:152`) → `{lastConnectedAt, recent}` (the latest 20 agent actions) for Settings → Connections → Agents (MCP).

Routes learn who asked through Hono bindings: `actorOf(c)` (`packages/app/src/edge/http/actor.ts:11`) reads `c.env.actor`, which is `"agent"` only when the MCP endpoint made the request in-process with `agentBindings` (`:7`), and `"assistant"` only when `/mcp/assistant` did with `assistantBindings` (`:9`); the Node server passes its own bindings, so no network request can set it. `actorOf` is read by `reviews.ts`, `external-reviews.ts` and `starts.ts` (`startRecorder`, `packages/app/src/edge/http/starts.ts:35`, which writes `project_starts`).

### Agents (MCP)

`mcpRoutes` (`packages/app/src/edge/mcp/http.ts:55`) serves MCP Streamable HTTP, stateless:

- `POST /mcp` builds one `McpServer` and one `WebStandardStreamableHTTPServerTransport` per request, with no `sessionIdGenerator` and `enableJsonResponse: true`, and closes both after the answer (`packages/app/src/edge/mcp/http.ts:99`-`:111`). GET and DELETE answer 405 with a JSON-RPC error saying the endpoint keeps no session and no event stream (`:116`). A body over 48 MB answers 413 (`:84`) and a non-JSON body 400 (`:95`), each a JSON-RPC error sentence.
- No token. The Origin rule (`originAllowed`, `packages/app/src/edge/mcp/http.ts:27`): a request with no `Origin` header is accepted (CLI agents send none); an `Origin` whose hostname is `localhost`, `*.localhost`, `127.0.0.1` or `[::1]`, or equals the configured `--host` when that is not a wildcard, is accepted; anything else gets 403 with a sentence naming Settings → Connections → Agents (MCP). The port is not compared, because a container does not know its published port.
- An `initialize` message records `agents.lastConnectedAt` in the settings table (`recordAgentConnection`, `packages/app/src/slices/agents/connection.ts:9`; called at `http.ts:99`).
- A route tool calls the existing `/api` route in-process: `api: (request) => app.request(request, undefined, agentBindings)` (`packages/app/src/edge/http/app.ts:453`). The route's own validation, admission, sample read-only guard, shutdown and update gates, `baseRevisionId` + `idempotencyKey` check, SSE events and refusal sentences apply unchanged. `callRoute` checks path parameters first (no dots or slashes; the resolved path must equal the template), refuses a `confirm` tool until `confirmed: true` with the page's consequence sentence, and records every successful non-GET call not marked `unrecorded` in `agent_actions` (`packages/app/src/edge/mcp/call-route.ts:55`-`:107`).
- Material: text comes inline, images as MCP image content, audio and video as a `/files/<projectId>/<asset>` URL plus the local path (and word timing for narration). An external review's material is what the built-in reviewer gets.

The host helper (`hostCliRoutes`, `packages/app/src/edge/http/host-cli.ts:108`) is a separate Hono app on a Unix socket. It serves `/v1/health`, `/v1/status/:provider`, `/v1/models/:provider`, `/v1/llm/:provider` (NDJSON stream), `/v1/image` and `/v1/open-folder` (`:126`–`:354`), all behind a bearer token. `01-architecture-docker.md` has the payloads.

### Server-sent events

The two EventSource endpoints are `/api/events/global` and `/api/events/projects/:id` (`packages/app/src/edge/http/app.ts:406`, `:409`). The global stream carries every project event as well as `running.count`, `schedule.topics`, `staging.progress` and `staging.failed` (`packages/app/src/edge/events/hub.ts:35`, `:180`), and sends a heartbeat every 20 s (`:99`). Each frame is `{event:type, data:JSON, id}` (`packages/app/src/edge/events/hub.ts:43`).

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
| `review.auto-passed` | `reviewId, stage, itemKey, item?`: an External agent review got no verdict in its 2 h and passed without review; the notifier says "Passed without review" (`:89`) |
| `project.updated` | none (`:85`) |
| `running.count` (global) | `count` (`:90`) |
| `schedule.topics` (global) | `scheduleId, scheduleName, added, waiting` (`:98`) |

Senders: the runner and slices emit through `hub.emit` and `hub.emitGlobal`. `eventPresenter` (`packages/app/src/edge/events/visibility.ts:58`) re-labels or drops events that do not belong to the current revision. Receiver: the browser opens one real EventSource per page, and `createEventMux` (`packages/web/src/event-mux.ts:57`) hands project-scoped stand-ins to each view. `subscribeProject` and `subscribeGlobal` (`packages/web/src/events.ts:142`, `:117`) refetch on reconnect. `01-architecture-narration.md` covers live audio previews and peaks.

### Studio extension ↔ app

Every `/ext/*` call carries `authorization: Bearer <pairing token>`; `studioRequestAllowed` checks the token and the paired origin (`packages/app/src/slices/studio/settings.ts:259`-`:269`), and a refusal is a 401 problem (`packages/app/src/edge/http/studio.ts:211`). Send sites are in `packages/extension/src/background.ts` unless noted; receive sites in `packages/app/src/edge/http/studio.ts`.

| Channel | Payload out → in | Send / receive |
| --- | --- | --- |
| `POST /ext/pair` | no body → `{paired:true,origin}`; the extension origin is stored as the paired origin | `:295` / `:567` |
| `GET /ext/pack` | → `{pack:UploadPack, item:PackItem, waiting}` for the first fill-queue entry that still resolves (gone entries are dropped); 404 when none. The extension reads it as `ActivePack` (`packages/extension/src/pack.ts:47`). | `:73` / `:588` |
| `GET /ext/files/:projectId/:asset` | → file bytes, served only when the asset is a pack item's `video`, one of its `thumbnails` or its `captions` (`studio.ts:866`-`:875`) | thumbnails `:85`, captions `:255` (a non-OK answer leaves `captions` unset), video `packages/extension/src/video-frame.ts:36` / `:851` |
| `POST /ext/filled` | `{projectId, short:number\|null}` → `{waiting:number}` | `:272` / `:623` |
| `POST /ext/video` | `{projectId, short?, videoId}` (11-char id) → `{recorded:true}`; row `upload_state='filled'` | `:318` / `:807` |
| `POST /ext/video/done` | same body → `{confirmed:true}`; `confirmUpload` sets `upload_state='done'`, then `finish_state='waiting'` when the item has `relatedVideoId`, `endScreenVideoId` or `captions`, and `comment_state='waiting'` for the long video with a `pinnedComment` when setting `studio.autoComment` is `on` | `:327` / `:824` |
| `POST /ext/backfill` | `{videos:{title≤200, videoId, checks?≤100}[]≤200, close?}` (rows of Studio's Content list; `checks` is `ok` when the Restrictions cell reads None, else its text, `packages/extension/src/content.ts:555`-`:561`) → `{found:number}`; each row's `checks` is stored on its known video (`setChecks`, `studio.ts:712`-`:713`). The worker forwards only `videos` (`background.ts:435`-`:438`). | `:388` / `:639` |
| `GET /ext/ready` | → `{projects: ReadyProject[]}`: done/partial (or set-aside pending) projects not marked uploaded, each item `{kind, short, title, ready, uploaded, started, videoId?, scheduleAt?, uploadBy?}`, `uploadBy` = `scheduleAt` minus setting `studio.leadHours` (`studio.ts:671`-`:679`, `packages/extension/src/pack.ts:140`) | `:395` / `:650` |
| `POST /ext/upload` | `{projectId, short?}` → `{url}` (`studioUploadUrl`, `packages/app/src/slices/studio/model.ts:18`); the fill queue becomes just that item (`fillOnly`) | `:400` / `:688` |
| `POST /ext/upload-all` | `{projectId}` → `{url, count}`; every rendered short not `done` is queued in order | `:336` / `:705` |
| `GET /ext/packs/:projectId` | → `UploadPack` | `:250` / `:724` |
| `GET /ext/tasks` | → `{finish: WaitingTask[], comments: WaitingTask[], checks:boolean}`, `WaitingTask {projectId, short, videoId, item:PackItem}` (`packages/extension/src/pack.ts:162`); `checks` is true when a `done` video with a release still ahead has `checks` other than `ok` (`studio.ts:743`-`:752`) | `:158` / `:732` |
| `POST /ext/task-result` | `{task:"finish"\|"comment", projectId, short?, ok, message≤2000}` → `{ok:true}`; sets `finish_state`/`comment_state` to `done` or `failed` with the message | `:347` / `:759` |
| `GET /ext/known-videos` | → `{videos:{projectId, short, videoId}[]}` for every `done` video | `:222` / `:767` |
| `POST /ext/stats` | `{projectId, short?, videoId, abVariants?≤3}` (older extensions also send numbers; they are ignored) → `{ok:true}`; saves `ab_results` only when more than one variant arrived | `packages/extension/src/background.ts:398-410` / `packages/app/src/edge/http/studio.ts:890-906` |
| YouTube oEmbed `GET https://www.youtube.com/oembed?url=…` | no auth; an OK answer means the video is public | `:137` / YouTube |
| `runtime.sendMessage` inside the extension | `WorkerRequest` (`packages/extension/src/pack.ts:71`): `pair`, `status`, `payload`, `pack`, `filled`, `video`, `video-done`, `backfill`, `ready`, `upload`, `gone-list`, `gone-now`, `gone`, `upload-all`, `item`, `task-result`, `ab-result` → `WorkerAnswer {ok:true,value}\|{ok:false,message}` (`:188`); `payload` and `item` answer `FillPayload {projectId, waiting?, item, captions?, thumbnails:{filename,contentType,base64}[]}` (`:56`) | senders `packages/extension/src/content.ts:140`, `:191`, `:228`, `:238`, `:250`, `:334`, `:368`, `:417`, `:441`, `:496`, `:578`; `packages/extension/src/popup.ts:18`, `:202`, `:215`, `:228`, `:238`; `packages/extension/src/comment.ts:105`, `:111`; `packages/extension/src/options.ts:18`, `:30` / receiver `background.ts:465` (dispatch `answer`, `:340`); a `task-result`, a `gone`, a `backfill` with `close`, or an `ab-result` (which also opens the next A/B read), closes the sender's tab (`:473`-`:479`) |
| `window.postMessage` Studio page ↔ `video-frame.html` | `slopify-video-ready` → `VideoRequest {type:"slopify-video", id, projectId, asset, filename, contentType}` → `VideoAnswer` `slopify-video-file {id, file:File}` or `slopify-video-error {id, message}` | `packages/extension/src/content.ts:511`-`:529` / `packages/extension/src/video-frame.ts:15`, `:24`, `:67` |
| Background-opened tabs | `https://studio.youtube.com/video/<id>/edit#slopify-finish&p=&s=` (`:198`), `https://www.youtube.com/watch?v=<id>#slopify-comment&p=&s=` (`:205`), `https://studio.youtube.com/channel/<studioChannel>/videos/upload#slopify-checks` in the background at most every 2 h while `/ext/tasks` answers `checks:true` (`studioChannel` is stored by the Studio content script from any `/channel/UC…` page, `packages/extension/src/content.ts:561`-`:562`; `:134`, `:192`-`:206`), `https://studio.youtube.com/#slopify-gone` (`:148`), `…/edit#slopify-ab-read&p=&s=` (`:264`); the popup opens `…/edit#slopify-ab=<both\|titles\|thumbnails>&p=&s=0` (`packages/extension/src/popup.ts:245`) | parsed at `packages/extension/src/content.ts:756`-`:764`, `:579`, `packages/extension/src/comment.ts:104` |

`PackItem` (app side `packages/app/src/slices/studio/model.ts:43`) is `{kind:"video"|"short", short?, video:PackFile|null, title, titles, description, tags, thumbnails:PackFile[], audience:"not_made_for_kids", alteredContent, playlists, playlist, pickable?, scheduleAt?, captions?, endScreenVideoId?, relatedVideoId?, pinnedComment?, chapterNotice?}`; the extension's copy is `packages/extension/src/pack.ts:13`. CORS on `/ext/*` echoes only the paired extension origin (or any extension origin on `/ext/pair`) and never `*` (`allowOrigin`, `packages/app/src/edge/http/studio.ts:197`). Pairing accepts only a loopback base URL (`packages/extension/src/background.ts:322`). Host permissions are `http://127.0.0.1/*`, `http://localhost/*` and `https://www.youtube.com/oembed*`; permissions are `storage`, `clipboardWrite` and `alarms` (`packages/extension/static/manifest.json:12`-`:17`). The Studio content script fills the dialog, types the posting plan's time into the Visibility step (`fillSchedule`, `packages/extension/src/studio-pages.ts:219`), and never presses Next, Save or Publish (`packages/extension/src/content.ts:29`); the Details, Analytics and A/B pages never press Schedule, Publish or Set test (`packages/extension/src/studio-pages.ts:9`).

### Telemetry and site

| Channel | Payload | Send / receive |
| --- | --- | --- |
| App → collector `POST /events` | `{events:CollectorEvent[]}`, where `CollectorEvent {id,machineId,type,payload,createdAt}` (`packages/app/src/slices/telemetry/collector-client.ts:6`) → `{ok:true,accepted}`. The app reads only success or failure; failed events stay queued. | `packages/app/src/slices/telemetry/collector-client.ts:46` / `packages/collector/src/index.ts:25` |
| Site → collector `GET /aggregates` | no body → `{aggregates}`, painted into `[data-counter]` nodes | `packages/site/public/main.js:65` / `packages/collector/src/index.ts:28` |

The default collector URL is `https://collector.slopify.stream` (`packages/app/src/slices/telemetry/collector-client.ts:26`). On a loopback origin, the site uses a local collector (`packages/site/public/main.js:7`). The D1 tables are `events` and `aggregates` (`packages/collector/schema.sql:3`, `:15`).

### In-process channels

- Provider calls: `StageProviders.llm`, `tts`, `image` and `animate` → `AttemptResult<T>` or `{ok:false,reason:"held"}`, through the shared queue (`packages/app/src/kernel/runner/providers.ts:88`). Standalone calls (schedule topics, episode summaries, cast pictures) use `standaloneLlm` and `standaloneImage` with no queue slot and are metered through `createStandaloneMeter` (`packages/app/src/main.ts:432`); a design's pictures use `standaloneImage` too, with a `design` owner.
- Alignment IPC: `WorkerInput {modelPath,pcmPath,text}` → `progress`, `done {words}`, `omission` or `error` messages (`packages/app/src/adapters/alignment/protocol.ts`).
- Update IPC: the parent writes `UpdatePlan` to a file, the child sends `{type:"installed"}`, and the parent answers `{type:"handoff"}` or `{type:"abort"}` (`packages/app/src/updater/plan.ts`, `packages/app/src/updater/worker.ts`).
- Hub observers: `observedHub` (`packages/app/src/main.ts:382`) feeds `createRunNotifier` (run-finished and review-flagged notifications to the user's URL, `packages/app/src/slices/notifications/send.ts:13`) and the episode-memory watcher (`packages/app/src/main.ts:435`).
- Assistant turn: `createAssistant` (`packages/app/src/slices/assistant/turn.ts:133`) starts the person's Claude Code or Codex as a child process (`assistantCliRunner`, `packages/app/src/adapters/llm/assistant-cli.ts:380`) pointed at this server's own `/mcp/assistant` (`assistantSelfUrl`, `packages/app/src/assistant-wiring.ts`) with a one-turn bearer token (`createTurnTokens`, `tokens.ts:18`). At most two turns run at once, each stopped after 10 minutes (`turnsMax`, `turnTimeoutMs`, `turn.ts:63`-`:63`); its text, tool use and asks reach the page as `AssistantEvent`s on the global SSE stream.
- Design PDF worker: `runPdfWorker` (`packages/app/src/slices/designs/pdf-runner.ts:10`) forks `pdf-worker.js` with one job over IPC (advanced serialization), takes the PDF bytes back and kills the child on cancel or after 5 minutes (`pdfWorkerTimeoutMs`, `:8`); its picture and text rendering run in a child ffmpeg (`createDesignRenderer`, `render.ts:71`), one render at a time.
- Tailscale CLI: `createRemoteAccessService` (`packages/app/src/edge/remote-access/service.ts:55`) runs the `tailscale` command (`nodeTailscaleRun`, `packages/app/src/edge/remote-access/cli.ts:83`) through `guarded`, which asserts every call is a `serve` or status command and never `funnel` (`:33`, `:41`).

The app has no message broker, websocket or cross-process queue. Batch order, schedules, retries and trash are SQLite rows polled by the in-process timers.

## Composition

`boot` (`packages/app/src/main.ts:298`) runs these steps in order:

1. Checks a Docker install state is where the container expects it (`:302`), acquires the instance lock (`:315`) and prepares FFmpeg (`:319`).
2. Opens SQLite and runs `migrate` (`:325`, `:326`).
3. Settles the files location (Docker or native, `:329`), then readable project folders (`recoverPlaces`, `:347`) and the template studio's sample folders (`attachSamples`, `:352`).
4. Marks interrupted stages (`:356`), recovers checkpoint work (`:357`) and settles terminal schedule runs (`:358`).
5. Settles interrupted cast images (`:359`).
6. Reconciles storage (`:363`) unless an update candidate is still pending activation.
7. Builds the notifier (`createServerNotifier`, `packages/app/src/main.ts:373`, which keeps told failures in `told_failures` through `toldFailures`, `packages/app/src/slices/notifications/server.ts:17`, so a restart neither repeats a told "Step failed" notice nor loses one never told), the observed hub (`:382`; events of a template studio's hidden samples are `quiet`), the telemetry flusher (`:397`), the catalogue store (`:406`), the host-CLI client when `SLOPIFY_CONTAINER=1` or `SLOPIFY_HOST_CLI_DIR` is set (`:407`), and the curated registry (`:411`).
8. Builds the model-access recorder and standalone deps (`:427`, `:428`), the episode watcher (`:435`), audio previews, review redos and narration retries (`:443`-`:445`), the runner (`wireRunner`, `:446`), the updater (`:484`) and `RebuildDeps` (`:560`).
9. Wires the model checks (`wireModelChecks`, `packages/app/src/model-checks.ts:160`; `:576`), then resumes review redos, narration retries and plan-limit waits (`:589`-`:594`).
10. Builds the schedule runner with restart recovery (`:645`, `recover` `:650`), style previews, the template studio's free samples and sample loop (`:661`-`:703`, started at `:704`), the mutation lifecycle (`:705`), the files service (`:707`), backups (`:724`), samples (`:739`), autostart (`:744`) and the remote-access service (`:755`).
11. Starts the autopilot checks (`startAutopilot`, `:783`, in `packages/app/src/autopilot-timers.ts:23`), wires the assistant (`wireAssistant`, `:797`) and builds the design service, renderer, runner and samples (`:812`-`:861`).
12. Calls `createApp` (`:866`) with `webDist` and `extensionDist` pointing at the copied builds (`:938`, `:939`), then `listen` (`:953`) and the timers (`:970` onward).
13. Inside `createApp`, the `/mcp` and `/mcp/assistant` routes get the app's `db`, `paths`, `ids`, `clock`, `log`, `version`, `host` (the `--host` the Origin rule accepts) and `measureAudio`, plus `api`, the app itself called in-process with `agentBindings` or `assistantBindings` (`packages/app/src/edge/http/app.ts:431`-`:456`).
14. Right after `listen`, `releaseReviews` settles the External agent reviews whose 2 h deadline passed while the app was down (`:956`, `:969`); the 5 s retry timer runs it again on every tick (`:991`). After the timers, `remoteAccess.start()` puts Slopify's Tailscale address back when the switch is on; it is never awaited (`:1084`).

`wireRunner` (`packages/app/src/main.ts:1212`) injects the usage meter and limit gate (`:1256`), a provider queue sized from catalogue limits (`:1262`), SQLite attempts (`:1251`), the checkpoint authority, whose `decide` holds an item's dependents for a waiting review redo, then for a waiting External agent review (`agentReviewHold`, `packages/app/src/main.ts:1273`, `packages/app/src/slices/rebuild/runtime-agent-review.ts:131`), then for a checkpoint, and `runs` that map every `stageKinds` entry to `runRevisionInvocation` (`:1324`-`:1327`).

Shutdown (`packages/app/src/main.ts:1109`) runs in this order:

1. Closes the notifier and episode watcher, and clears every timer (`:1111`-`:1121`), stops the model checks and the autopilot checks.
2. Drains mutations with a 5 s deadline, then waits for the schedule, topic, studio-sample and backup work to finish; Slopify's Tailscale handler is removed with a 5 s deadline (`:1133`).
3. Stops running assistant turns (`:1155`), waits for a picture call already sent (`designRunner.idle`), aborts runner work, closes telemetry and SQLite, and releases the lock (`:1158`-`:1173`).

`installSignalShutdown` handles SIGINT and SIGTERM (`packages/app/src/edge/signal-shutdown.ts:3`).

The build composes packages in this order (`package.json:12`):

1. `@slopify/web` builds with `vite build`.
2. `@slopify/extension` builds six esbuild entry points (`background`, `comment`, `content`, `options`, `popup`, `video-frame`) into `dist/chrome`, `dist/firefox` and two zips (`packages/extension/scripts/build.mjs:46`, `:73`). `packages/extension/scripts/publish-chrome.mjs` uploads the Chrome zip to the Chrome Web Store from the release workflow and stops without failing when its environment variables are absent (`packages/extension/scripts/publish-chrome.mjs:1`-`:11`).
3. The app builds with `tsc`, then copies migrations, assets, `web/dist` → `app/dist/web` (`packages/app/scripts/copy-web.mjs`) and the extension zips → `app/dist/extension` (`packages/app/scripts/copy-extension.mjs:6`).

The site and collector deploy separately with `wrangler deploy` (`package.json:16`).

Browser composition: `start` (`packages/web/src/main.tsx:24`) builds the version watch, the API client (`createApi` over `watchingFetch`, with XHR uploads) and the event mux. It then renders `QueryClientProvider` → `AppProvider` → `RouterProvider` (`:44`). The root route renders `Shell` (`packages/web/src/router.tsx:61`), which nests `FormDraftsProvider` → `PlayDraftProvider` → `TutorialProvider` → `CommandPaletteProvider` → `CurrentChannelProvider` (`packages/web/src/components/shell.tsx:208`) around the route outlet (`:446`).

## Frontend

**Rendering model.** The web app is one client-rendered React 19 SPA built with Vite. It has no SSR and no second HTML entry (`packages/web/index.html:12`, `packages/web/vite.config.ts:13`). Hono serves `dist/web` as static files and falls back to `index.html` for client routes (`packages/app/src/edge/http/app.ts:460`, `:462`). In development, Vite proxies `/api` and `/files` to `http://127.0.0.1:6969` as an unbuffered stream so SSE works (`packages/web/vite.config.ts:18`). The public site (`packages/site/public/index.html`, `channel.html`) is hand-written static HTML with one module script (`packages/site/public/index.html:43`). The extension options page and toolbar popup are static HTML (`packages/extension/static/options.html`, `packages/extension/static/popup.html`).

**Routes.** The route tree is built with TanStack Router (`packages/web/src/router.tsx:792`):

| Path | Component | Notes |
| --- | --- | --- |
| `/` | `HomeRoute` | `router.tsx:90` |
| `/projects` | `ProjectsRoute` | search `show` filter, `:116` |
| `/projects/$projectId` | `ProjectRoute` | keyed by project id; opens drafts through the Play session, `:421`. Shorts and YouTube render inside the Video section, and a `shorts` or `youtube` section id opens `video` (`packages/web/src/routes/project.tsx:401`) |
| `/welcome` | `WelcomeRoute` | `:160` |
| `/play` | `PlayRoute` | `:166` |
| `/prompts`, `/entries`, `/templates`, `/designs`, `/document-themes`, `/narration-aliases`, `/ab-results` | children of the pathless `_library` layout (`LibraryLayout`, `:174`); `/ab-results` is `AbResultsRoute`, listing finished A/B tests from `GET /api/studio/ab-results` (`packages/web/src/routes/ab-results.tsx:72`), linked as Library → A/B results (`packages/web/src/routes/library.tsx:32`); `/designs` is `DesignsPage` (`?tab=`, `:232`) | `kind` and `category` are validated search params; `:431`, `:457`, `:275`, `:232`, `:495`, `:483`, `:489` |
| `/prompts/new`, `/prompts/$promptId`, `/entries/new`, `/entries/$entryId`, `/document-themes/new`, `/document-themes/$themeId` | editor routes | `:441`, `:451`, `:467`, `:477`, `:507`, `:515` |
| `/templates/$templateId` | `TemplateStudioRoutePage`: the template studio, `?section=` the section shown, `?compareProvider` and `?compareModel` open a Compare models run (`packages/web/src/template-studio/`) | `:378` |
| `/designs/$designId`, `/design-templates/$templateId` | `DesignPage`, `DesignTemplatePage` (a design template opens in the same studio rail) | `:253`, `:264` |
| `/library` | redirect → `/prompts?kind=article` | `:180` |
| `/channels`, `/channels/$channelId` | `ChannelsRoute`, `ChannelRoute` | channel tab in search, `:189`, `:199` |
| `/calendar` | `CalendarRoute` | validated tab search, `:300`; tabs Coming weeks, Releases (`?tab=releases`, `ReleasesView`, `packages/web/src/studio/releases-view.tsx:29`) and Schedules (`?tab=schedules`) (`packages/web/src/routes/calendar.tsx:51`, `:298`-`:300`) |
| `/schedules`, `/schedules/$scheduleId` | redirect → `/calendar?tab=schedules` | `:307`, `:315` |
| `/settings` | `SettingsRoute` | `section` and `note` search, `:541`; Settings → YouTube Studio holds the posting plan editor `PostingPlanSettings` (`packages/web/src/studio/settings-panel.tsx:31`, `packages/web/src/studio/posting-plan.tsx:53`); Settings → General holds Remote access (`packages/web/src/remote-access/`) and Settings → Models the model checks and Template studio budget |
| `/usage` | redirect → `/settings?section=usage` | `:586` |
| `/help`, `/help/tutorials` | redirect → `/help/tutorials/Home` | `:570`, `:577` |
| `/help/tutorials/$page` | `TutorialsRoute` | `:554` |
| `/design` | lazy `DesignRoute`, only when `import.meta.env.DEV` | `:780`, `:783` |

The shell rail has the destinations Home, Projects, Calendar, Channels, Library and Settings (`packages/web/src/components/shell.tsx:78`), an Assistant button that opens the assistant panel (`packages/web/src/assistant/panel.tsx`; `shell.tsx:328`, and in the phone bar `:424`), plus the New project key to `/play` (`:362`) and a phone bottom bar (`:443`).

**Component kit.** `packages/web/src/components/kit/` holds the design-system components. 323 non-test files import from it; 19 still import the older Radix/shadcn wrappers in `packages/web/src/components/ui/` (`packages/web/components.json:1`). The rules for using the kit are in `docs/capstone/standards.md:83` and `docs/design-system.md`.

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

- `createApi` (`packages/web/src/api.ts:212`) wraps `hc<AppType>` at `${origin}/api` (`:205`) and adds `xhrUpload` for multipart uploads with progress (`:225`). The Studio client calls (posting plan, lead hours, release calendar, stats, A/B results, project videos) are in the same file (`:539`-`:688`).
- `watchingFetch` reads `X-Slopify-Version` to prompt a reload on a version change (`packages/web/src/version.ts:53`).
- `http.ts` turns problem JSON into plain errors and `SaveResult` (`packages/web/src/http.ts:21`, `:42`).
- Feature API modules sit beside their screens and validate responses with shared Zod schemas imported through `@app`, for example `packages/web/src/play/draft-api.ts`.
- React Query keys are in `packages/web/src/queries.ts:21`.
- `packages/web/src/components/pdf-pages.tsx:62` renders document PDFs with `pdfjs-dist` and its worker.
- Browser storage holds only the active Play draft id (`slopify.play-draft`, `packages/web/src/play/draft-restore.ts:6`). Draft content lives on the server.

Web feature folders under `packages/web/src/` (shallow: listed, not inventoried file by file): `play/`, `project/`, `channels/`, `calendar/`, `schedules/`, `home/`, `library/`, `templates/`, `studio/`, `youtube/`, `video/`, `voices/`, `subtitles/`, `trash/`, `notifications/`, `onboarding/`, `tutorial/`, `tutorials/`, `help/`, `patch-notes/`, `whats-new/`, `updates/`, `autostart/`, `fixes/`, `language/`, `lib/`, `assets/`, `routes/`, `components/`, `styles/`.
