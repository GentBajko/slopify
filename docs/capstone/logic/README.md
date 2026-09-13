---
generated_at_commit: 7bdb84e3f57e
capstone_version: 5.2.0
generated_date: '2026-09-13'
absorbed_from:
  - features/2026-09-10-editable-projects@2026-09-12
  - features/2026-09-10-play-redesign-drafts@2026-09-13
  - features/2026-09-10-review-checkpoints@2026-09-13
paths_covered:
  - :(top)packages/app/src/**
  - :(top)packages/web/src/**
content_hash: c3017bd35918
---

# Business logic index

The logic map follows a run from local setup through reviewed admission, retained revisions, exports, templates and scheduled instantiation. The server wires drafts, templates, schedules, the runner and the update service during boot (`packages/app/src/main.ts:137`, `packages/app/src/main.ts:263`).

## Trigger & preconditions

Use a scenario when changing one of the listed workflows. Article is the only required content output; active optional stages determine the provider, media and checkpoint requirements applied by admission (`packages/app/src/slices/admission/rules.ts:17`, `packages/app/src/slices/play-drafts/start.ts:92`).

## Steps

| Scenario | Reference |
|---|---|
| 01 Pipeline lifecycle | [01-pipeline-lifecycle.md](01-pipeline-lifecycle.md) |
| 02 Provider credentials and voices | [02-provider-credentials.md](02-provider-credentials.md) |
| 03 Placeholder substitution | [03-placeholder-substitution.md](03-placeholder-substitution.md) |
| 04 Run admission | [04-run-admission.md](04-run-admission.md) |
| 05 Provided outputs | [05-provided-outputs.md](05-provided-outputs.md) |
| 06 Research | [06-research.md](06-research.md) |
| 07 Article writing | [07-article-writing.md](07-article-writing.md) |
| 08 Narration | [08-narration.md](08-narration.md) |
| 09 Image generation | [09-image-generation.md](09-image-generation.md) |
| 10 Thumbnail prompt by LLM | [10-thumbnail-prompt-by-llm.md](10-thumbnail-prompt-by-llm.md) |
| 11 Video assembly | [11-video-assembly.md](11-video-assembly.md) |
| 12 Project edits and retained revisions | [12-reruns-and-edits.md](12-reruns-and-edits.md) |
| 13 Pause, resume and cancel | [13-cancel.md](13-cancel.md) |
| 14 Storage and downloads | [14-storage-and-downloads.md](14-storage-and-downloads.md) |
| 15 Prompt management | [15-prompt-management.md](15-prompt-management.md) |
| 16 Telemetry | [16-telemetry.md](16-telemetry.md) |
| 17 Subtitles and fonts | [17-subtitles.md](17-subtitles.md) |
| 18 Cost review and batch queue | [18-cost-review-batch.md](18-cost-review-batch.md) |
| 19 Model catalogue and thinking controls | [19-catalogue-thinking.md](19-catalogue-thinking.md) |
| 20 Local boot, CLI and recovery | [20-boot-cli-recovery.md](20-boot-cli-recovery.md) |
| 21 In-app updater | [21-app-updater.md](21-app-updater.md) |
| 22 Play drafts and uploads | [22-play-drafts.md](22-play-drafts.md) |
| 23 Review checkpoints | [23-review-checkpoints.md](23-review-checkpoints.md) |
| 24 Project templates | [24-project-templates.md](24-project-templates.md) |
| 25 Scheduled jobs | [25-scheduled-jobs.md](25-scheduled-jobs.md) |

## Branches

Play creates projects from durable drafts, Templates creates fresh drafts from immutable template revisions, and Schedules creates fresh drafts and projects from saved template versions on a local cadence (`packages/app/src/slices/play-drafts/start.ts:110`, `packages/app/src/slices/project-templates/service.ts:117`, `packages/app/src/slices/schedules/scheduler.ts:96`).

## Unhappy paths

Typed validation, conflicts and readiness failures preserve the draft or revision for correction. Startup recovery marks interrupted work and recovers checkpoint and schedule state before normal timers resume (`packages/app/src/slices/play-drafts/start.ts:54`, `packages/app/src/main.ts:113`, `packages/app/src/main.ts:267`).

## State transitions

Drafts move through active, starting and started; project work has revision-scoped reservations and attempts; schedules move among active, paused, canceled and completed while keeping run history (`packages/app/src/slices/play-drafts/start.ts:61`, `packages/app/src/slices/schedules/service.ts:110`).

## Invariants

Saving setup or project edits does not dispatch provider work. Reviewed Start, rebuild Start, checkpoint approval and scheduler admission are the explicit authorities described by their respective scenarios (`packages/app/src/slices/play-drafts/review.ts:49`, `packages/app/src/slices/play-drafts/start.ts:24`).

## Outcomes & side effects

Successful workflows persist local SQLite state and project assets, then wake the runner. Downloads, history reads, model-catalogue reads and update checks do not themselves submit generation requests (`packages/app/src/main.ts:110`, `packages/app/src/slices/play-drafts/start.ts:136`).

## Dimensions not in play

The mapped product has no account, remote project synchronization or multi-user authorization layer. The default listener is loopback and a non-loopback bind prints a warning that anyone reaching it controls the app and keys (`packages/app/src/kernel/config/index.ts:20`, `packages/app/src/edge/cli.ts:31`).
