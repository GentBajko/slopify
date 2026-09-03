---
generated_date: 2026-09-02
capstone_version: 5.2.0
source: uiux-interview.md (Q1-Q19)
---

# Slopify UI/UX design

Committed frontend design: direction, system, experience rules. `stack` honours `02-system.md`; `build` implemented the Implementation constraints. The per-screen chapters and the design assets were removed once the screens were built (see the ledger, 2026-09-03); the code in `packages/web/src/routes/` and `packages/web/src/play/` is now the description of every screen, and git history holds the chapters. Every decision traces to `../uiux-interview.md §Q<n>` or is marked "assumed" here.

## Chapters

| Chapter | Mockup screen | Logic scenarios | §Q |
|---|---|---|---|
| [01-direction.md](01-direction.md) | all | all | Q1-Q14, Q19 |
| [02-system.md](02-system.md) | all | all | Q5, Q7-Q9, Q15-Q17, Q19 |
| [03-experience.md](03-experience.md) | all | 01, 02, 04, 12, 13 | Q4, Q18, Q19 |

## Assets

Design assets now live with the code that serves them: `packages/web/src/assets/` (the mark, the favicon, the six stage glyphs), `packages/web/public/` (`favicon.svg`, `app-icon.svg`), and `packages/site/public/assets/`. `uiux/` keeps no copies.

## Assumed

Items invented to complete a chapter; confirm or strike before `build`.

- 01: the headline "Slop, on schedule." and the 16-word subtext; the hero screenshot slot.
- 03: the Appearance control lives in the Playback rail.
- 08: stage bodies open when done and collapse when pending.
- 09, 10: the whole compositions, since no mockup exists for them; the per-stage token table on 10.
- System: the type scale (12 / 13 / 14 / 16 / 18 / 20 / 24 / 32 px), the light-theme values derived and contrast-checked here, the Lucide pick (§Q5, a two-way door).

## Pre-flight (design-time), run before writing

Design read declared with reasoned dials; mode per screen with Operate floored at Restrained; theme carries its use-scene sentence; contract blocks are decisions, alternates and the exit were offered; no banned face or palette (Barlow justified, no premium-consumer or AI-purple palette); calibration self-check passed; every mockup screen plus the two added ones has a chapter; every mockup state and every logic unhappy path surfacing on a screen has a styled treatment, empty, loading, and error included; every decision cites a §Q or is listed above; zero em-dashes and no eyebrow labels in any proposed copy.
