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
  - features/2026-09-30-slopify-mcp@2026-10-11
generated_date: '2026-10-18'
capstone_version: 5.2.0
generated_at_commit: d6a72d6428ff
paths_covered:
  - :(top)packages/web/src/router.tsx
  - :(top)packages/web/src/components/shell.tsx
content_hash: ab4bdeb88cf7
---

# Slopify UI/UX design

The SPA has seven top-level navigation destinations (Home, Projects, Prompts, Templates, Calendar, Channels, Settings; Channels is listed only with two or more channels, and with one its pages light Settings), a lime Create key above them that opens Create at `/play`, an Assistant side panel, Search (the Ctrl+K palette), a Help menu and a Support menu at the rail's foot, routed detail families (a project, a channel, a prompt, an intro or outro, a PDF theme, a template's Edit template page, a design and a poster template), a first-run/tutorial overlay and an updater. `packages/web/src/router.tsx` declares the routes; `destinations` in `packages/web/src/components/shell.tsx` declares the destination order and the paths each stays lit for.

## Chapters

| Chapter | Mockup screen | Logic scenarios |
|---|---|---|
| [01-direction.md](01-direction.md) | all | all |
| [02-system.md](02-system.md) | all | all |
| [03-experience.md](03-experience.md) | all | 01, 02, 04, 12, 13, 17, 21-25 |
| [screens/01-projects.md](screens/01-projects.md) | 07 Projects | 01, 13, 14, 38, 45 |
| [screens/02-play.md](screens/02-play.md) | 06 Play, independent glossary preference | 04, 05, 08, 15, 17, 18, 22, 23, 33 |
| [screens/03-project.md](screens/03-project.md) | 08 Project, retained pronunciation, clean scripts and saved host paths | 01, 08, 09, 11, 12, 14, 17, 23, 33, 45 |
| [screens/04-prompts.md](screens/04-prompts.md) | 04 Prompts (Library tab) | 15 |
| [screens/05-prompt-editor.md](screens/05-prompt-editor.md) | 05 Prompt editor | 03, 15 |
| [screens/06-entries.md](screens/06-entries.md) | Intros & outros (Library tab) | 08, 15 |
| [screens/07-entry-editor.md](screens/07-entry-editor.md) | Intro/outro editor | 03, 08, 15 |
| [screens/08-settings.md](screens/08-settings.md) | 03 Settings; native paths and host-managed CLI status; Agents (MCP) | 02, 16, 19-21, 45 |
| [screens/09-usage.md](screens/09-usage.md) | Usage (Settings section) | 16 |
| [screens/10-marketing.md](screens/10-marketing.md) | 01 Marketing page | 16 |
| [screens/11-first-run-tutorial.md](screens/11-first-run-tutorial.md) | 02 First-run notice and guide | 02, 15, 22 |
| [screens/12-updater.md](screens/12-updater.md) | App-wide updater | 21 |
| [screens/13-schedules.md](screens/13-schedules.md) | 09 Schedules (Library tab) | 24, 25 |
| [screens/14-templates.md](screens/14-templates.md) | Templates (Library tab) | 22, 24 |
| [screens/15-home.md](screens/15-home.md) | Home week board | 38, 44 |
| [screens/16-welcome.md](screens/16-welcome.md) | Welcome, starter packs, samples | 41 |
| [screens/17-channels.md](screens/17-channels.md) | Channels list and tabs | 30, 31 |
| [screens/18-document-themes.md](screens/18-document-themes.md) | PDF themes and editor | 26 |
| [screens/19-narration-aliases.md](screens/19-narration-aliases.md) | Library → Narration aliases | 08 |
| [screens/20-help-tutorials.md](screens/20-help-tutorials.md) | Tutorials reader, search, info tips | 42 |
| [screens/21-command-palette.md](screens/21-command-palette.md) | Ctrl+K palette and shortcuts | 42 |
| [screens/22-announcements.md](screens/22-announcements.md) | What's new tour, patch notes, reminders | 39, 42 |
| [screens/23-studio-upload.md](screens/23-studio-upload.md) | Prepare upload drawer and extension UI | 32, 44 |
| [screens/24-ab-results.md](screens/24-ab-results.md) | Library → A/B results | 27, 44 |
| [screens/25-template-studio.md](screens/25-template-studio.md) | Template Studio | 46 |
| [screens/26-designs.md](screens/26-designs.md) | Designs gallery, editor, design templates, project Designs drawer | 52 |
| [screens/27-assistant.md](screens/27-assistant.md) | In-app Assistant panel | 50 |
| [screens/28-remote-access.md](screens/28-remote-access.md) | Settings → Remote access | 53 |
| [screens/29-settings-models.md](screens/29-settings-models.md) | Settings → Models: checks and model lists | 48 |

There is no Library destination any more: **Prompts** (`/prompts`, with the kinds of prompt down its left and Intros and Outros at their foot, `/entries` for those) and **Templates** (`/templates`, with the tabs Video templates and Poster templates; `/designs?tab=templates` redirects there) took its place, and `/library` redirects to `/prompts`. PDF themes (`/document-themes`) are reached from Create's PDF and Settings → Production defaults → PDF look and light Settings; narration aliases (`/narration-aliases`, titled Pronunciation) from Settings → Voices; A/B results (`/ab-results`, titled What worked on YouTube) from a channel's page. Schedules are the Calendar's Schedules tab. A template opens Edit template at `/templates/$templateId`; a design or a poster template opens at `/designs/$designId` or `/design-templates/$templateId`. Usage is a Settings page; `/usage` redirects to `/settings?section=usage`. Chapters 04, 06, 13, 14, 19, 24 and 25 below still describe the Library tabs and their old words, and 02, 03 and 08 the screens before the 4.0 overhaul; 01 (Projects) and 15 (Home) describe the current screens.

`packages/web/src/components/shell.tsx` mounts, from 768px up, the narrow rail (`--rail-width`, 76px) of icons with a word under each on every page: the logo, the lime Create key, the destinations, "N running" while runs are active, and at the foot Search, Assistant, Help and Support. Below 768px it mounts a top bar (logo, Search, Help) and a bottom bar with Home, Projects, Create in the centre, Prompts and More for the rest. The channel picker is not in the rail: with two or more channels, Home, Projects and Calendar show "Showing: <channel> ▾" in their page header. The shell also holds the routed screen, the Assistant panel, the appearance controller, the first-run notice and the version prompt. Screen chapters describe only behavior rendered by the cited source.
