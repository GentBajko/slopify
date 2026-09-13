---
generated_at_commit: 803bd5555d76
generated_date: '2026-09-13'
absorbed_from:
  - features/2026-09-10-editable-projects@2026-09-12
  - features/2026-09-10-play-redesign-drafts@2026-09-13
  - features/2026-09-10-review-checkpoints@2026-09-13
paths_covered:
  - :(top)packages/app/src/slices/play-drafts/**
  - :(top)packages/app/src/slices/storage/**
  - :(top)packages/app/src/slices/settings/tutorial*
  - :(top)packages/web/src/play/**
  - :(top)packages/web/src/routes/play.tsx
  - :(top)packages/web/src/subtitles/**
  - :(top)packages/web/src/tutorial/**
content_hash: 2b9dab9b7f7b
---

# Business logic index

These scenarios describe the implemented app. Editable-project behavior is absorbed in scenarios 01, 05, 08, 09, 11, 12, 14 and 17. Review checkpoint behavior is absorbed in scenario 23. Project templates are absorbed in scenario 24, and scheduled jobs in scenario 25.

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
| Cost review and batch scheduling | [18-cost-review-batch.md](18-cost-review-batch.md) |
| Model catalogue reload and thinking controls | [19-catalogue-thinking.md](19-catalogue-thinking.md) |
| Local boot, CLI and runtime recovery | [20-boot-cli-recovery.md](20-boot-cli-recovery.md) |
| In-app updater | [21-app-updater.md](21-app-updater.md) |
| Play drafts, uploads and uncertain Start | [22-play-drafts.md](22-play-drafts.md) |
| Review checkpoints and approval gates | [23-review-checkpoints.md](23-review-checkpoints.md) |
| Project templates | [24-project-templates.md](24-project-templates.md) |
| Scheduled jobs | [25-scheduled-jobs.md](25-scheduled-jobs.md) |

Play now uses durable local drafts, explicit Review/Start and four setup sections. See [draft lifecycle](22-play-drafts.md).
Templates preserve reusable Play setups without credentials, generated outputs or media bytes. See [project templates](24-project-templates.md).
Schedules create fresh projects from template revisions on a local cadence with durable claims and history. See [scheduled jobs](25-scheduled-jobs.md).
