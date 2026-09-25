---
docker_project_folder_verified_at_commit: a472d513f12c
glossary_pronunciation_verified_at_commit: 6eeac3fd9043
host_cli_verified_at_commit: 9bd6517
absorbed_from:
  - features/2026-09-25-docker-project-folder@2026-09-25
  - features/2026-09-25-glossary-pronunciation@2026-09-25
  - features/2026-09-24-host-cli-bridge@2026-09-24
  - features/2026-09-24-narration-preparation@2026-09-24
  - features/2026-09-10-subtitles-fonts@2026-09-10
  - features/2026-09-10-editable-projects@2026-09-12
  - features/2026-09-10-play-redesign-drafts@2026-09-13
  - features/2026-09-10-project-templates@2026-09-13
generated_date: '2026-09-25'
capstone_version: 5.2.0
generated_at_commit: 7bdb84e3f57e
paths_covered:
  - :(top)packages/web/src/router.tsx
  - :(top)packages/web/src/components/shell.tsx
content_hash: ab4bdeb88cf7
---

# Slopify UI/UX design

The SPA has four top-level navigation destinations (Projects, Play, Library, Settings), three routed detail families, a first-run/tutorial overlay and an inline updater in the header. `packages/web/src/router.tsx` declares the routes; `packages/web/src/components/shell.tsx` declares the navigation order and the paths each destination stays lit for.

## Chapters

| Chapter | Mockup screen | Logic scenarios |
|---|---|---|
| [01-direction.md](01-direction.md) | all | all |
| [02-system.md](02-system.md) | all | all |
| [03-experience.md](03-experience.md) | all | 01, 02, 04, 12, 13, 17, 21-25 |
| [screens/01-projects.md](screens/01-projects.md) | 07 Projects | 01, 13, 14 |
| [screens/02-play.md](screens/02-play.md) | 06 Play, independent glossary preference | 04, 05, 08, 15, 17, 18, 22, 23 |
| [screens/03-project.md](screens/03-project.md) | 08 Project, retained pronunciation, clean scripts and saved host paths | 01, 08, 09, 11, 12, 14, 17, 23 |
| [screens/04-prompts.md](screens/04-prompts.md) | 04 Prompts (Library tab) | 15 |
| [screens/05-prompt-editor.md](screens/05-prompt-editor.md) | 05 Prompt editor | 03, 15 |
| [screens/06-entries.md](screens/06-entries.md) | Intros & Outros (Library tab) | 08, 15 |
| [screens/07-entry-editor.md](screens/07-entry-editor.md) | Intro/outro editor | 03, 08, 15 |
| [screens/08-settings.md](screens/08-settings.md) | 03 Settings; native paths and host-managed CLI status | 02, 16, 19-21 |
| [screens/09-usage.md](screens/09-usage.md) | Usage (Settings section) | 16 |
| [screens/10-marketing.md](screens/10-marketing.md) | 01 Marketing page | 16 |
| [screens/11-first-run-tutorial.md](screens/11-first-run-tutorial.md) | 02 First-run notice and guide | 02, 15, 22 |
| [screens/12-updater.md](screens/12-updater.md) | App-wide updater | 21 |
| [screens/13-schedules.md](screens/13-schedules.md) | 09 Schedules (Library tab) | 24, 25 |
| [screens/14-templates.md](screens/14-templates.md) | Templates (Library tab) | 22, 24 |

Library is one destination holding four tabs: Prompts, Intros & Outros, Templates and Schedules. A pathless layout route (`_library`, `packages/web/src/routes/library.tsx`) draws the Library page bar and tab links, so each tab keeps its own URL; `/library` redirects to `/prompts`. Usage is the last Settings section; `/usage` redirects to `/settings?section=usage`.

`packages/web/src/components/shell.tsx` mounts the sticky header (with the updater and tutorial launcher), the routed screen centred at 1200 px, the footer, appearance controller, first-run notice and version prompt in one persistent shell. Screen chapters describe only behavior rendered by the cited source.
