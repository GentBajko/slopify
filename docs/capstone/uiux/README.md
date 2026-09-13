---
absorbed_from:
  - features/2026-09-10-subtitles-fonts@2026-09-10
  - features/2026-09-10-editable-projects@2026-09-12
  - features/2026-09-10-play-redesign-drafts@2026-09-13
generated_date: '2026-09-13'
generated_at_commit: 803bd5555d76
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

# Slopify UI/UX design

The frontend design: direction, system, experience rules. `05-dependencies.md` honours
`02-system.md`, and the shipped SPA implements the Implementation constraints.

The three shared design chapters remain authoritative for direction, tokens and interaction rules. The observed [screen references](screens/03-project.md) were restored by mapping the shipped UI; they describe current code, including the retained-revision project editor and review checkpoint panel. `packages/web/src/routes/` and `packages/web/src/play/` implement the screens; `packages/web/src/styles/index.css` carries the palette. The planned Play redesign is separate from these observed references.

## Chapters

| Chapter | Mockup screen | Logic scenarios |
|---|---|---|
| [01-direction.md](01-direction.md) | all | all |
| [02-system.md](02-system.md) | all | all |
| [03-experience.md](03-experience.md) | all | 01, 02, 04, 12, 13, 17 |
| [screens/02-play.md](screens/02-play.md) | 06 Play, current implementation | 04, 05, 17, 18, 23 |
| [screens/03-project.md](screens/03-project.md) | 08 Project, retained revisions, explicit rebuild and checkpoints | 01, 08, 09, 11, 12, 14, 17, 23 |

## Assets

Design assets now live with the code that serves them: `packages/web/src/assets/` (the mark, the favicon, the six stage glyphs), `packages/web/public/` (`favicon.svg`, `app-icon.svg`), and `packages/site/public/assets/`. `uiux/` keeps no copies.

## Assumed, and what became of each

These were invented to complete a chapter rather than decided outright. All of them were
settled by shipping; each now has code to read instead of a claim to confirm.

- The marketing headline "AI Slop, on demand." and its subtext: live in
 `packages/site/public/index.html`.
- The hero slot: an existing 1920×1080 silent edited recording of real app controls and a completed project. `packages/site/public/assets/play-run.mp4`, its poster and VTT are present. Normal controls are hidden; reduced motion pauses the recording and restores them (`packages/site/public/index.html`, `main.js`). The 0.6 change keeps that footage unchanged.
- The Appearance control sitting in the Playback rail: built that way in
 `packages/web/src/routes/settings.tsx`.
- Project stage navigation selects one visible workspace while stage bodies remain mounted to preserve local/player state: `packages/web/src/routes/project.tsx`.
- The Intros & Outros and Usage compositions, invented because no mockup covered them:
 `packages/web/src/routes/entries.tsx` and `usage.tsx`.
- The type scale, the derived light-theme values and the Lucide icon pick, a two-way door:
 all in `packages/web/src/styles/index.css`. The light values were measured
 rather than trusted during `build`; one row of `02-system.md` was corrected as a
 result, and no pair fails its floor.

Subtitle controls live in `packages/web/src/subtitles/`, reused by Play and the final project stage. Scenario [17](../logic/17-subtitles.md) records their modes, font lifecycle and save/export behavior. The [project screen reference](screens/03-project.md) records current revision editing, History, explicit rebuild review and caption correction without a finished export.

Play now uses durable local drafts, explicit Review/Start and four setup sections. See [draft lifecycle](../logic/22-play-drafts.md).

Review checkpoints are documented in [scenario 23](../logic/23-review-checkpoints.md) and use the existing project panel language and focus/reload behavior.
