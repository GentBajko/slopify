---
generated_date: '2026-09-13'
generated_at_commit: 4cfe3473f74d
capstone_version: 5.2.0
absorbed_from:
  - features/2026-09-24-narration-preparation@2026-09-24
  - features/2026-09-10-editable-projects@2026-09-12
  - features/2026-09-10-play-redesign-drafts@2026-09-13
  - features/2026-09-10-review-checkpoints@2026-09-13
paths_covered:
  - :(top)packages/web/src/**
  - :(top)packages/site/**
  - :(top)packages/app/src/**
  - :(top)packages/app/package.json
content_hash: 6c7688e07dfc
surfaces:
  - web
  - cli
---

# Slopify mockup

## Product brief

- **Purpose:** turn a prompt and keyword values into a narrated slideshow, silent video, WAV or article using local orchestration and the user's provider access (`packages/site/public/index.html:84`, `packages/web/src/play/review-summary.tsx:205`).
- **Audience:** people producing repeatable article-led media who want to configure, review, revise and download runs from a local browser interface (`packages/web/src/routes/play.tsx:235`, `packages/web/src/routes/project.tsx:1`).
- **Positioning:** “Your keys, your machine, free”; the package is MIT-licensed, installed with npx or globally with npm, and the global install launches as `slopify` (`packages/site/public/index.html:89`, `packages/site/public/index.html:94`, `packages/app/package.json:5`).
- **Success measures:** the product surfaces per-install Usage and public aggregate creation counters; no numeric release target is encoded in the product surfaces (`packages/site/public/index.html:170`, `packages/web/src/routes/usage.tsx:1`).
- **Commercial model:** the software has no paid application tier. Users bring provider keys or authenticated local CLIs and bear those provider costs; Review shows known estimates and unpriced charges (`packages/site/public/index.html:89`, `packages/web/src/play/review-section.tsx:11`).
- **Constraints:** Node 26 or newer; local SQLite/data-directory ownership; scheduled work runs only while Slopify is open; provider readiness and current catalogue choices are checked again at Start (`packages/app/package.json:13`, `packages/app/src/main.ts:96`, `packages/app/src/main.ts:303`, `packages/app/src/slices/play-drafts/start.ts:92`).
- **Non-goals:** no hosted account/project sync, payment ledger or machine wake-up scheduler is represented by the current routes (`packages/app/src/kernel/config/index.ts:20`, `packages/app/src/slices/schedules/scheduler.ts:25`).

`rule: logic (S<n>-...)` markers in screen files point to the single owning scenario below. Implemented behavior is detailed in the matching file under `../logic/`.

## Screens

| Screen | Journeys served | Implemented surface |
|---|---|---|
| [01 Marketing](01-marketing-page.md) | J1 | Static site, native/Docker commands and public counters |
| [02 First-run notice](02-first-run-notice.md) | J1, J2 | Local telemetry/tutorial entry |
| [03 Settings](03-settings.md) | J2, J6 | Keys, CLI paths, voices, catalogue, storage and diagnostics |
| [04 Prompts](04-prompts.md) | J2 | Four prompt kinds, including Narration Preparation |
| [05 Prompt editor](05-prompt-editor.md) | J2 | Prompt body, slots and explicit narration starter |
| [06 Play](06-play.md) | J2, J3, J4, J7 | Durable draft, optional narration preparation, Review and Start |
| [07 Projects](07-projects.md) | J3, J6 | Project list |
| [08 Project](08-project.md) | J3, J4, J5, J6, J7 | Progress, editors, rebuild, checkpoints and history |
| Templates (not separately drawn) | J7, J8 | `packages/web/src/routes/templates.tsx` |
| [09 Schedules](09-schedules.md) | J8 | Local recurring template admission |
| Entries (not separately drawn) | J2 | `packages/web/src/routes/entries.tsx` |
| Usage (not separately drawn) | J6 | `packages/web/src/routes/usage.tsx` |

## Journeys

| Journey | Path |
|---|---|
| J1 Discover and install | 01 → npx/global install → 02 → 03 |
| J2 First-run setup | 02 → 03 → 04/05 → 06 |
| J3 Make an output | 07 → 06 Content/Outputs/Style/Review → 08 → download |
| J4 Bring local content | 06 Provide → Review/Start → 08 |
| J5 Revise | 08 Edit → Save → Review affected rebuild → Start → History |
| J6 Revisit and maintain | 07 → 08; 03 for storage/diagnostics/update readiness |
| J7 Reuse setup | 06 or 08 → Templates → Apply to Play → Review/Start |
| J8 Run on a cadence | Templates → 09 → due admission → 07/08 |

## Scenarios for `logic`

| # | Behavior | Screens | Settled reference |
|---|---|---|---|
| S1 | Placeholder substitution | 05, 06 | [03](../logic/03-placeholder-substitution.md) |
| S2 | Run admission | 06 | [04](../logic/04-run-admission.md) |
| S3 | Provided outputs | 06, 08 | [05](../logic/05-provided-outputs.md) |
| S4 | Research | 06, 08 | [06](../logic/06-research.md) |
| S5 | Article writing | 08 | [07](../logic/07-article-writing.md) |
| S6 | Narration | 06, 08 | [08](../logic/08-narration.md) |
| S7 | Image generation | 06, 08 | [09](../logic/09-image-generation.md) |
| S8 | Video assembly | 06, 08 | [11](../logic/11-video-assembly.md) |
| S9 | Pipeline lifecycle | 07, 08 | [01](../logic/01-pipeline-lifecycle.md) |
| S10 | Project edits and retained revisions | 08 | [12](../logic/12-reruns-and-edits.md) |
| S11 | Pause, resume and cancel | 08 | [13](../logic/13-cancel.md) |
| S12 | Telemetry | 01, 02, 08 | [16](../logic/16-telemetry.md) |
| S13 | Provider credentials and voices | 03, 06 | [02](../logic/02-provider-credentials.md) |
| S14 | Storage and downloads | 03, 07, 08 | [14](../logic/14-storage-and-downloads.md) |
| S15 | Prompt management | 04, 05, 08 | [15](../logic/15-prompt-management.md) |
| S16 | Thumbnail prompt by LLM | 06, 08 | [10](../logic/10-thumbnail-prompt-by-llm.md) |
| S17 | Subtitles and fonts | 06, 08 | [17](../logic/17-subtitles.md) |
| S18 | Cost review and batch queue | 06 | [18](../logic/18-cost-review-batch.md) |
| S19 | Model catalogue and thinking | 03, 06, 08 | [19](../logic/19-catalogue-thinking.md) |
| S20 | Boot, CLI paths and recovery | 03, 06, 08 | [20](../logic/20-boot-cli-recovery.md) |
| S21 | In-app updater | Shell | [21](../logic/21-app-updater.md) |
| S22 | Play drafts and uploads | 06 | [22](../logic/22-play-drafts.md) |
| S23 | Review checkpoints | 06, 08 | [23](../logic/23-review-checkpoints.md) |
| S24 | Project templates | 06, 08, Templates | [24](../logic/24-project-templates.md) |
| S25 | Scheduled jobs | 09 | [25](../logic/25-scheduled-jobs.md) |

## Assumptions retained from discovery

The remaining explicit assumptions live on 01 Marketing, 02 First-run notice, 03 Settings, 04 Prompts, 05 Prompt editor and 07 Projects. They cover counter ordering, modal/landing presentation, provider row and masking presentation, prompt table actions/slot columns, prompt-editor slot display and project-list columns/delete placement. Implemented logic and UI chapters outrank these early wireframe assumptions where they differ.

## Open questions and deferrals

No unowned `rule: logic` marker remains in this mockup inventory. Templates, Entries and Usage are implemented routes without dedicated mockup screen chapters; their current compositions are documented by the UI/UX reference and source routes.
