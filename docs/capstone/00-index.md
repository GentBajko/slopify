# Slopify: capstone index

Slopify: a self-hosted, single-user content pipeline for faceless YouTube channel operators (research → article → narration → images → video, shorts, YouTube description and PDF document), with channels, schedules, automatic reviews and Studio upload prep; run with `npx @gentbajko/slopify@latest` or Docker Compose. TypeScript on Node ≥ 26; one process: a Hono 4 API serving a React 19 SPA, an in-process revision runner, bundled ffmpeg as a child process, one SQLite file; plus a static marketing site, a serverless telemetry collector and a YouTube Studio browser extension. Paradigm: functional core (pure slices) with a procedural shell (runner, adapters, edge).

## Module map

| Module | Entry point |
|---|---|
| CLI (install, update, flags) | `packages/app/src/edge/cli.ts:13` |
| Composition root (boot) | `packages/app/src/main.ts:225` |
| Runner wiring | `packages/app/src/main.ts:836` |
| HTTP app and router registry | `packages/app/src/edge/http/app.ts:226`, `packages/app/src/edge/http/app.ts:165` |
| SSE hub | `packages/app/src/edge/events/hub.ts:84` |
| Provider registry and adapters | `packages/app/src/adapter-registry.ts:60`, `packages/app/src/adapters/` |
| Model catalogue | `packages/app/src/catalog/store.ts:63` |
| Kernel: runner, providers, db, events, config | `packages/app/src/kernel/runner/index.ts:83`, `packages/app/src/kernel/runner/providers.ts:116`, `packages/app/src/kernel/db/index.ts:8`, `packages/app/src/kernel/events.ts:107`, `packages/app/src/kernel/config/index.ts:23` |
| Revision stage dispatch and recovery | `packages/app/src/slices/rebuild/runtime-run.ts:17` |
| Admission | `packages/app/src/slices/admission/start.ts:47` |
| Play drafts | `packages/app/src/slices/play-drafts/start.ts:24` |
| Schedules | `packages/app/src/slices/schedules/scheduler.ts:36` |
| Studio upload pack | `packages/app/src/slices/studio/pack.ts:57` |
| Other slices (45 total) | `packages/app/src/slices/` (table in [01-architecture.md](01-architecture.md)) |
| Docker install and host helper | `packages/app/src/edge/docker-install/`, `packages/app/src/edge/host-cli.ts:50` |
| Updater | `packages/app/src/updater/install.ts:18`, `packages/app/src/edge/update-worker.ts:5` |
| Alignment worker | `packages/app/src/adapters/alignment/worker.ts:17` |
| Sample build | `packages/app/src/sample-build/generate.ts:93` |
| Web SPA, router, shell, API client | `packages/web/src/main.tsx:24`, `packages/web/src/router.tsx:603`, `packages/web/src/components/shell.tsx:166`, `packages/web/src/api.ts:197` |
| Studio extension | `packages/extension/src/background.ts:129`, `packages/extension/src/content.ts:217`, `packages/extension/scripts/build.mjs:46` |
| Telemetry collector | `packages/collector/src/index.ts:21` |
| Marketing site | `packages/site/public/main.js:247` |

## Topic index

| Topic | File |
|---|---|
| architecture | [01-architecture.md](01-architecture.md) |
| architecture | [01-architecture-research.md](01-architecture-research.md) — research documents and provider handoff |
| architecture | [01-architecture-recovery.md](01-architecture-recovery.md) — one-click recovery, rebuild admission, subtitle-model caching |
| architecture | [01-architecture-narration.md](01-architecture-narration.md) — narration text, aliases, multi-voice, loudness, TTS |
| architecture | [01-architecture-docker.md](01-architecture-docker.md) — compose install, update transactions, host folder access |
| models | [02-models.md](02-models.md) |
| models | [02-models-research.md](02-models-research.md) — research payloads |
| models | [02-models-narration.md](02-models-narration.md) — spoken text, glossary, aliases, voices |
| models | [02-models-docker.md](02-models-docker.md) — install/update records, activation, folder replies |
| conventions | [03-conventions.md](03-conventions.md) |
| data-flow | [04-data-flow.md](04-data-flow.md) |
| data-flow | [04-data-flow-research.md](04-data-flow-research.md) — research, synthesis and writer handoff |
| dependencies | [05-dependencies.md](05-dependencies.md) |
| testing | [06-testing.md](06-testing.md) |
| operations | [07-operations.md](07-operations.md) |
| glossary | [08-glossary.md](08-glossary.md) |
| interfaces | Absent: no sibling-repository contract; vendor APIs are in dependencies, and collector, site and extension are in this monorepo. |
| logic | [logic/01-pipeline-lifecycle.md](logic/01-pipeline-lifecycle.md) |
| logic | [logic/02-provider-credentials.md](logic/02-provider-credentials.md) |
| logic | [logic/03-placeholder-substitution.md](logic/03-placeholder-substitution.md) |
| logic | [logic/04-run-admission.md](logic/04-run-admission.md) |
| logic | [logic/05-provided-outputs.md](logic/05-provided-outputs.md) |
| logic | [logic/06-research.md](logic/06-research.md) |
| logic | [logic/07-article-writing.md](logic/07-article-writing.md) |
| logic | [logic/08-narration.md](logic/08-narration.md) |
| logic | [logic/09-image-generation.md](logic/09-image-generation.md) |
| logic | [logic/10-thumbnail-prompt-by-llm.md](logic/10-thumbnail-prompt-by-llm.md) |
| logic | [logic/11-video-assembly.md](logic/11-video-assembly.md) |
| logic | [logic/12-reruns-and-edits.md](logic/12-reruns-and-edits.md) |
| logic | [logic/13-cancel.md](logic/13-cancel.md) |
| logic | [logic/14-storage-and-downloads.md](logic/14-storage-and-downloads.md) |
| logic | [logic/15-prompt-management.md](logic/15-prompt-management.md) |
| logic | [logic/16-telemetry.md](logic/16-telemetry.md) |
| logic | [logic/17-subtitles.md](logic/17-subtitles.md) |
| logic | [logic/18-cost-review-batch.md](logic/18-cost-review-batch.md) |
| logic | [logic/19-catalogue-thinking.md](logic/19-catalogue-thinking.md) |
| logic | [logic/20-boot-cli-recovery.md](logic/20-boot-cli-recovery.md) |
| logic | [logic/21-app-updater.md](logic/21-app-updater.md) |
| logic | [logic/22-play-drafts.md](logic/22-play-drafts.md) |
| logic | [logic/23-review-checkpoints.md](logic/23-review-checkpoints.md) |
| logic | [logic/24-project-templates.md](logic/24-project-templates.md) |
| logic | [logic/25-scheduled-jobs.md](logic/25-scheduled-jobs.md) |
| logic | [logic/26-document.md](logic/26-document.md) |
| logic | [logic/27-youtube-description.md](logic/27-youtube-description.md) |
| logic | [logic/28-shorts.md](logic/28-shorts.md) |
| logic | [logic/29-video-editing.md](logic/29-video-editing.md) |
| logic | [logic/30-channels-and-cast.md](logic/30-channels-and-cast.md) |
| logic | [logic/31-channel-memory.md](logic/31-channel-memory.md) |
| logic | [logic/32-studio-upload-prep.md](logic/32-studio-upload-prep.md) |
| logic | [logic/33-automatic-reviews.md](logic/33-automatic-reviews.md) |
| logic | [logic/34-speakers-and-voices.md](logic/34-speakers-and-voices.md) |
| logic | [logic/35-audio-levelling-and-ambient.md](logic/35-audio-levelling-and-ambient.md) |
| logic | [logic/36-style-preview.md](logic/36-style-preview.md) |
| logic | [logic/37-run-cost-and-eta.md](logic/37-run-cost-and-eta.md) |
| logic | [logic/38-home-attention-and-uploads.md](logic/38-home-attention-and-uploads.md) |
| logic | [logic/39-notifications-and-live-events.md](logic/39-notifications-and-live-events.md) |
| logic | [logic/40-trash-and-scheduled-backups.md](logic/40-trash-and-scheduled-backups.md) |
| logic | [logic/41-onboarding-and-sample.md](logic/41-onboarding-and-sample.md) |
| logic | [logic/42-in-app-help.md](logic/42-in-app-help.md) |
| logic | [logic/43-autostart.md](logic/43-autostart.md) |

## Companion docs

| File | What it is |
|---|---|
| [logic/README.md](logic/README.md) | Scenario map 01–43 and the rules every scenario shares |
| [mockup/README.md](mockup/README.md) | Mockup index: screens, journeys, scenarios handed to `logic`, assumed items |
| [mockup/01-marketing-page.md](mockup/01-marketing-page.md) | Screen: marketing page with native and Docker commands |
| [mockup/02-first-run-notice.md](mockup/02-first-run-notice.md) | Screen: once-per-machine telemetry notice |
| [mockup/03-settings.md](mockup/03-settings.md) | Screen: API keys, native executable paths, read-only host CLIs, voices, playback |
| [mockup/04-prompts.md](mockup/04-prompts.md) | Screen: prompt kinds including Narration Preparation |
| [mockup/05-prompt-editor.md](mockup/05-prompt-editor.md) | Screen: prompt editor with `{{keyword}}` slots |
| [mockup/06-play.md](mockup/06-play.md) | Screen: durable drafts, templates, Review and explicit Start |
| [mockup/07-projects.md](mockup/07-projects.md) | Screen: projects list |
| [mockup/08-project.md](mockup/08-project.md) | Screen: retained revisions, downloads, History and rebuild |
| [mockup/09-schedules.md](mockup/09-schedules.md) | Screen: local scheduled template runs |
| [uiux/README.md](uiux/README.md) | UI/UX design index: direction, system, experience |
| [uiux/01-direction.md](uiux/01-direction.md) | Design read, mode map, direction contract |
| [uiux/02-system.md](uiux/02-system.md) | Tokens, type, colour, spacing, icons, motion, component library |
| [uiux/03-experience.md](uiux/03-experience.md) | Interaction rules every screen applies |
| [uiux/screens/01-projects.md](uiux/screens/01-projects.md) | Observed: Projects board |
| [uiux/screens/02-play.md](uiux/screens/02-play.md) | Observed: Play rows, Start rail, Review drawer |
| [uiux/screens/03-project.md](uiux/screens/03-project.md) | Observed: project page, section rail, bodies, aside |
| [uiux/screens/04-prompts.md](uiux/screens/04-prompts.md) | Observed: Library prompts list and detail |
| [uiux/screens/05-prompt-editor.md](uiux/screens/05-prompt-editor.md) | Observed: prompt editor |
| [uiux/screens/06-entries.md](uiux/screens/06-entries.md) | Observed: intros/outros list and detail |
| [uiux/screens/07-entry-editor.md](uiux/screens/07-entry-editor.md) | Observed: entry editor |
| [uiux/screens/08-settings.md](uiux/screens/08-settings.md) | Observed: all 14 Settings sections |
| [uiux/screens/09-usage.md](uiux/screens/09-usage.md) | Observed: Settings → Usage |
| [uiux/screens/10-marketing.md](uiux/screens/10-marketing.md) | Observed: marketing site and channel page |
| [uiux/screens/11-first-run-tutorial.md](uiux/screens/11-first-run-tutorial.md) | Observed: 25-step tutorial |
| [uiux/screens/12-updater.md](uiux/screens/12-updater.md) | Observed: update widget and waiting state |
| [uiux/screens/13-schedules.md](uiux/screens/13-schedules.md) | Observed: /calendar, Coming weeks and Schedules tabs |
| [uiux/screens/14-templates.md](uiux/screens/14-templates.md) | Observed: templates list, history, packs |
| [uiux/screens/15-home.md](uiux/screens/15-home.md) | Observed: Home week board |
| [uiux/screens/16-welcome.md](uiux/screens/16-welcome.md) | Observed: /welcome, starter packs, samples |
| [uiux/screens/17-channels.md](uiux/screens/17-channels.md) | Observed: channels list and six channel tabs |
| [uiux/screens/18-document-themes.md](uiux/screens/18-document-themes.md) | Observed: document themes and editor |
| [uiux/screens/19-narration-aliases.md](uiux/screens/19-narration-aliases.md) | Observed: Library → Aliases |
| [uiux/screens/20-help-tutorials.md](uiux/screens/20-help-tutorials.md) | Observed: tutorials reader, search, info tips |
| [uiux/screens/21-command-palette.md](uiux/screens/21-command-palette.md) | Observed: Ctrl+K palette and shortcuts |
| [uiux/screens/22-announcements.md](uiux/screens/22-announcements.md) | Observed: What's new tour, patch notes, reminders, run notifications |
| [uiux/screens/23-studio-upload.md](uiux/screens/23-studio-upload.md) | Observed: Prepare upload drawer and extension UI |
| [standards.md](standards.md) | Binding code standards the user set; outranks generic best practice |
| [changelog.md](changelog.md) | Append-only ledger of every stage run and its decisions (newest 100) |
| [changelog-2026.md](changelog-2026.md) | Rotated 2026 ledger entries |
| [features/](features/) | Local working specifications and plans |
