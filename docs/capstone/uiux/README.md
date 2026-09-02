---
generated_date: 2026-09-02
capstone_version: 5.2.0
source: uiux-interview.md (Q1-Q19)
---

# Slopify UI/UX design

Committed frontend design: direction, system, experience rules, one chapter per screen. `stack` honours `02-system.md`; `build` implements `screens/` and the Implementation constraints. Every decision traces to `../uiux-interview.md §Q<n>` or is marked "assumed" here.

## Chapters

| Chapter | Mockup screen | Logic scenarios | §Q |
|---|---|---|---|
| [01-direction.md](01-direction.md) | all | all | Q1-Q14, Q19 |
| [02-system.md](02-system.md) | all | all | Q5, Q7-Q9, Q15-Q17, Q19 |
| [03-experience.md](03-experience.md) | all | 01, 02, 04, 12, 13 | Q4, Q18, Q19 |
| [screens/01-marketing-page.md](screens/01-marketing-page.md) | mockup/01 | 16 | Q1, Q13, Q15, Q17, Q18 |
| [screens/02-first-run-notice.md](screens/02-first-run-notice.md) | mockup/02 | 16 | Q4, Q13, Q18 |
| [screens/03-settings.md](screens/03-settings.md) | mockup/03 | 02, 11 | Q13, Q17, Q18, Q19 |
| [screens/04-prompts.md](screens/04-prompts.md) | mockup/04 | 03, 15 | Q13, Q18 |
| [screens/05-prompt-editor.md](screens/05-prompt-editor.md) | mockup/05 | 03, 15 | Q13, Q15, Q18 |
| [screens/06-play.md](screens/06-play.md) | mockup/06 | 02, 03, 04, 05, 08, 10 | Q13, Q14, Q17, Q18 |
| [screens/07-projects.md](screens/07-projects.md) | mockup/07 | 01, 14 | Q13, Q18 |
| [screens/08-project.md](screens/08-project.md) | mockup/08 | 01, 06-13 | Q13, Q17, Q18 |
| [screens/09-intros-outros.md](screens/09-intros-outros.md) | none (logic §Q90-§Q98) | 07, 08, 15 | Q13, Q18 |
| [screens/10-usage.md](screens/10-usage.md) | none (logic §Q119) | 16 | Q13, Q15, Q18 |

## Assets

`assets/`: `logo-mark.svg` (the mark, evenodd, `currentColor`), `favicon.svg`, `app-icon.svg`, `stage-research.svg`, `stage-article.svg`, `stage-audio.svg`, `stage-images.svg`, `stage-thumbnail.svg`, `stage-video.svg` (§Q5-§Q9). `assets/reference-play.html` is a reference sample of the Play screen and a project rundown in both themes, saved at the user's request (§Q19) as a build-time reference; it is not a generated chapter and the markdown wins where they disagree.

## Assumed

Items invented to complete a chapter; confirm or strike before `build`.

- 01: the headline "Slop, on schedule." and the 16-word subtext; the hero screenshot slot.
- 03: the Appearance control lives in the Playback rail.
- 08: stage bodies open when done and collapse when pending.
- 09, 10: the whole compositions, since no mockup exists for them; the per-stage token table on 10.
- System: the type scale (12 / 13 / 14 / 16 / 18 / 20 / 24 / 32 px), the light-theme values derived and contrast-checked here, the Lucide pick (§Q5, a two-way door).

## Pre-flight (design-time), run before writing

Design read declared with reasoned dials; mode per screen with Operate floored at Restrained; theme carries its use-scene sentence; contract blocks are decisions, alternates and the exit were offered; no banned face or palette (Barlow justified, no premium-consumer or AI-purple palette); calibration self-check passed; every mockup screen plus the two added ones has a chapter; every mockup state and every logic unhappy path surfacing on a screen has a styled treatment, empty, loading, and error included; every decision cites a §Q or is listed above; zero em-dashes and no eyebrow labels in any proposed copy.
