---
generated_at_commit: 14480f26c13e
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: 7859106991d1
paths_covered:
  - ":(top)packages/app/src/slices/**"
  - ":(top)packages/app/src/edge/**"
  - ":(top)packages/app/src/main.ts"
  - ":(top)packages/app/src/kernel/config/**"
---

# Business logic index

One scenario file per externally triggerable capability. Runs flow from setup (Play drafts, templates, schedules, onboarding) through admission, the revision runner and its stages, to downloads, upload preparation, the Studio extension's work in YouTube Studio, and Home. Each file carries the eight scenario sections; this index carries the map and the rules every scenario shares.

## Trigger & preconditions

Open the scenario whose capability a change touches; `depends_on` in each file's frontmatter names the scenarios it relies on. Every project mutation route refuses the bundled sample project with 409 `sample-read-only` (`packages/app/src/edge/http/app.ts:292`).

## Steps

| Scenario | Reference |
|---|---|
| 01 Pipeline lifecycle: stages, dependency graph, retry tiers, provider queue | [01-pipeline-lifecycle.md](01-pipeline-lifecycle.md) |
| 02 Provider credentials, key tests, CLI paths and sign-in, system voice | [02-provider-credentials.md](02-provider-credentials.md) |
| 03 Placeholder substitution and shared keywords | [03-placeholder-substitution.md](03-placeholder-substitution.md) |
| 04 Run admission | [04-run-admission.md](04-run-admission.md) |
| 05 Provided outputs and uploads | [05-provided-outputs.md](05-provided-outputs.md) |
| 06 Research documents and editorial consolidation | [06-research.md](06-research.md) |
| 07 Article writing, Article Off | [07-article-writing.md](07-article-writing.md) |
| 08 Narration: preparation, glossary, aliases, multi-voice script, pauses, levelling, chunk retry | [08-narration.md](08-narration.md) |
| 09 Image generation, scenes, establishing image, regenerate | [09-image-generation.md](09-image-generation.md) |
| 10 Thumbnail prompt by LLM | [10-thumbnail-prompt-by-llm.md](10-thumbnail-prompt-by-llm.md) |
| 11 Video assembly and export mastering | [11-video-assembly.md](11-video-assembly.md) |
| 12 Project edits, reruns, redo | [12-reruns-and-edits.md](12-reruns-and-edits.md) |
| 13 Pause, resume, retry, soften, cancel | [13-cancel.md](13-cancel.md) |
| 14 Storage, downloads, files location | [14-storage-and-downloads.md](14-storage-and-downloads.md) |
| 15 Prompt management and history | [15-prompt-management.md](15-prompt-management.md) |
| 16 Telemetry | [16-telemetry.md](16-telemetry.md) |
| 17 Subtitles and fonts | [17-subtitles.md](17-subtitles.md) |
| 18 Cost estimate, plan limits, batch review | [18-cost-review-batch.md](18-cost-review-batch.md) |
| 19 Model catalogue, daily sync, retired models, thinking controls | [19-catalogue-thinking.md](19-catalogue-thinking.md) |
| 20 Boot, CLI install/update, recovery | [20-boot-cli-recovery.md](20-boot-cli-recovery.md) |
| 21 In-app and native updater | [21-app-updater.md](21-app-updater.md) |
| 22 Play drafts | [22-play-drafts.md](22-play-drafts.md) |
| 23 Review checkpoints | [23-review-checkpoints.md](23-review-checkpoints.md) |
| 24 Project templates, next chapter | [24-project-templates.md](24-project-templates.md) |
| 25 Scheduled jobs, topic generation, held topics | [25-scheduled-jobs.md](25-scheduled-jobs.md) |
| 26 Document (styled PDF) | [26-document.md](26-document.md) |
| 27 YouTube description, pinned comment, A/B titles | [27-youtube-description.md](27-youtube-description.md) |
| 28 Shorts | [28-shorts.md](28-shorts.md) |
| 29 Video editing: edit list, motion, cards, clips | [29-video-editing.md](29-video-editing.md) |
| 30 Channels, brand kit, cast | [30-channels-and-cast.md](30-channels-and-cast.md) |
| 31 Channel memory: episodes, existing videos | [31-channel-memory.md](31-channel-memory.md) |
| 32 Studio upload prep: pack, upload pick, extension fill, popup, upload confirmation, links | [32-studio-upload-prep.md](32-studio-upload-prep.md) |
| 33 Automatic reviews | [33-automatic-reviews.md](33-automatic-reviews.md) |
| 34 Speakers and voices | [34-speakers-and-voices.md](34-speakers-and-voices.md) |
| 35 Audio levelling and ambient bed | [35-audio-levelling-and-ambient.md](35-audio-levelling-and-ambient.md) |
| 36 Style preview | [36-style-preview.md](36-style-preview.md) |
| 37 Run cost and ETA | [37-run-cost-and-eta.md](37-run-cost-and-eta.md) |
| 38 Home attention, fix-its, Keep as is, Mark uploaded | [38-home-attention-and-uploads.md](38-home-attention-and-uploads.md) |
| 39 Notifications and live events | [39-notifications-and-live-events.md](39-notifications-and-live-events.md) |
| 40 Trash, export/import, scheduled backups | [40-trash-and-scheduled-backups.md](40-trash-and-scheduled-backups.md) |
| 41 Onboarding and bundled samples | [41-onboarding-and-sample.md](41-onboarding-and-sample.md) |
| 42 In-app help, What's new, patch notes | [42-in-app-help.md](42-in-app-help.md) |
| 43 Start at login | [43-autostart.md](43-autostart.md) |
| 44 Studio autopilot: posting plan and release calendar, Studio checks, Details touches, pinned comment, A/B tests on request, Studio numbers | [44-studio-autopilot.md](44-studio-autopilot.md) |

## Branches

Play starts projects from durable drafts (`packages/app/src/slices/play-drafts/start.ts:24`); Templates make fresh drafts (`packages/app/src/slices/project-templates/service.ts:136`); Schedules make drafts and projects from the template as it is at dispatch time, so an edit reaches the next run (`packages/app/src/slices/schedules/scheduler.ts:174`); onboarding makes the quick short (41).

## Unhappy paths

Validation, conflict and readiness failures leave the draft or revision in place for correction and answer problem+json with a fix sentence (see 03-conventions.md). Interrupted work is recovered at boot (20) and through one-click recovery (13).

## State transitions

Drafts: active → starting → started (22). Projects and stages: 01. Checkpoints: 23. Schedules: active, paused, canceled, completed (25). Trashed items: 40.

## Invariants

Saving setup or project edits dispatches no provider work; reviewed Start, rebuild Start, recovery, checkpoint approval and scheduler admission are the only authorities that admit work (04, 12, 13, 23, 25).

## Outcomes & side effects

Successful workflows persist SQLite state and project assets, then wake the runner (01). Downloads, history reads, catalogue reads and update checks submit no generation requests.

## Dimensions not in play

No accounts, remote sync or multi-user authorization. The default bind is `127.0.0.1` (`packages/app/src/kernel/config/index.ts:21`); a non-loopback bind prints a warning that anyone reaching the port controls the app and its keys (`packages/app/src/edge/cli.ts:108`).
