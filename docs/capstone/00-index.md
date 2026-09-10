# Slopify: capstone index

Slopify: a self-hosted, single-user content pipeline (research → article → narration, with independent images and an optional MP4 or WAV export with locally timed English subtitles) for faceless YouTube channel operators, run with `npx @gentbajko/slopify@latest`. TypeScript on Node ≥ 26; one process: a Hono 4 API serving a React 19 SPA, an in-process pipeline runner, bundled ffmpeg as a child process, one SQLite file; plus a static marketing site and a serverless telemetry collector. Paradigm: functional core (pure slices) with a procedural shell (runner, adapters, edge).

## Module map

| Module | Entry point |
|---|---|
| CLI and boot sequence | `packages/app/src/edge/cli.ts:19` |
| Composition root | `packages/app/src/main.ts:86` |
| HTTP API and SSE | `packages/app/src/edge/http/*.ts`, `packages/app/src/edge/events/*.ts` |
| Stage-graph runner and retry wrapper | `packages/app/src/kernel/runner/` |
| CLI executable settings and launchers | `packages/app/src/slices/settings/cli-paths.ts`, `packages/app/src/kernel/cli-command.ts`, `packages/app/src/adapters/llm/` |
| Provider ports and adapters | `packages/app/src/kernel/ports/`, `packages/app/src/adapters/{llm,tts,image,alignment,fake}/` |
| Pipeline slices | `packages/app/src/slices/{research,article,narration,images,thumbnail,video,subtitles,fonts,reruns,cancel,control,admission,storage,library,settings,telemetry}/` |
| Curated model catalogue, pricing and limits | `packages/app/src/catalog/store.ts:24`, `packages/app/src/catalog/registry.ts:7` |
| Batch admission and scheduling | `packages/app/src/edge/http/planning.ts:32`, `packages/app/src/slices/batch/index.ts:73` |
| Request scheduling | `packages/app/src/kernel/runner/queue.ts:12` |
| Cost arithmetic | `packages/app/src/slices/estimate/index.ts:21` |
| App updates | `packages/app/src/updater/service.ts:1`, `packages/app/src/edge/http/update.ts:6` |
| SQLite and migrations | `packages/app/src/kernel/db/` |
| React SPA | `packages/web/src/main.tsx` |
| Marketing site | `packages/site/` |
| Telemetry collector | `packages/collector/src/index.ts` |

## Topic index

| Topic | File |
|---|---|
| architecture | [01-architecture.md](01-architecture.md) |
| models | [02-models.md](02-models.md) |
| conventions | [03-conventions.md](03-conventions.md) |
| data-flow | [04-data-flow.md](04-data-flow.md) |
| dependencies | [05-dependencies.md](05-dependencies.md) |
| testing | [06-testing.md](06-testing.md) |
| operations | [07-operations.md](07-operations.md) |
| glossary | [08-glossary.md](08-glossary.md) |
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

| interfaces | Absent: no sibling-repository protocol; vendor APIs are in dependencies and collector is in this monorepo. |
| logic | [logic/18-cost-review-batch.md](logic/18-cost-review-batch.md) |
| logic | [logic/19-catalogue-thinking.md](logic/19-catalogue-thinking.md) |
| logic | [logic/20-boot-cli-recovery.md](logic/20-boot-cli-recovery.md) |
| logic | [logic/21-app-updater.md](logic/21-app-updater.md) |

## Companion docs

| File | What it is |
|---|---|
| [mockup/README.md](mockup/README.md) | Mockup index: screens, journeys, scenarios handed to `logic`, assumed items |
| [mockup/01-marketing-page.md](mockup/01-marketing-page.md) | Screen: slopify.stream marketing page |
| [mockup/02-first-run-notice.md](mockup/02-first-run-notice.md) | Screen: once-per-machine telemetry notice |
| [mockup/03-settings.md](mockup/03-settings.md) | Screen: API keys, CLI executable paths, voices, playback settings |
| [mockup/04-prompts.md](mockup/04-prompts.md) | Screen: prompts list by kind |
| [mockup/05-prompt-editor.md](mockup/05-prompt-editor.md) | Screen: prompt editor with `{{keyword}}` slots |
| [mockup/06-play.md](mockup/06-play.md) | Screen: run configuration, subtitle fonts and play |
| [mockup/07-projects.md](mockup/07-projects.md) | Screen: projects list |
| [mockup/08-project.md](mockup/08-project.md) | Screen: project pipeline, subtitle restyling and downloads |
| [uiux/README.md](uiux/README.md) | UI/UX design index: direction, system, experience, assumed items |
| [uiux/01-direction.md](uiux/01-direction.md) | Design read, mode map, the control-room direction contract |
| [uiux/02-system.md](uiux/02-system.md) | Tokens: type, colour per theme, spacing, icons, motion, component library, implementation constraints |
| [uiux/03-experience.md](uiux/03-experience.md) | Interaction rules every screen applies |
| [implementation.md](implementation.md) | The approved build plan: module layout, load-bearing code sketches, 25-step build order with verifications, coverage table |
| [standards.md](standards.md) | Binding code standards the user set; outranks generic best practice |
| [changelog.md](changelog.md) | Append-only ledger of every stage run and its decisions |
| [uiux/screens/01-projects.md](uiux/screens/01-projects.md) | Observed implemented surface |
| [uiux/screens/02-play.md](uiux/screens/02-play.md) | Observed implemented surface |
| [uiux/screens/03-project.md](uiux/screens/03-project.md) | Observed implemented surface |
| [uiux/screens/04-prompts.md](uiux/screens/04-prompts.md) | Observed implemented surface |
| [uiux/screens/05-prompt-editor.md](uiux/screens/05-prompt-editor.md) | Observed implemented surface |
| [uiux/screens/06-entries.md](uiux/screens/06-entries.md) | Observed implemented surface |
| [uiux/screens/07-entry-editor.md](uiux/screens/07-entry-editor.md) | Observed implemented surface |
| [uiux/screens/08-settings.md](uiux/screens/08-settings.md) | Observed implemented surface |
| [uiux/screens/09-usage.md](uiux/screens/09-usage.md) | Observed implemented surface |
| [uiux/screens/10-marketing.md](uiux/screens/10-marketing.md) | Observed implemented surface |
| [uiux/screens/11-first-run-tutorial.md](uiux/screens/11-first-run-tutorial.md) | Observed implemented surface |
| [uiux/screens/12-updater.md](uiux/screens/12-updater.md) | Observed implemented surface |
| [capstone.json](capstone.json) | Shared reference configuration |
