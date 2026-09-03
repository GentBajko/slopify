---
generated_date: 2026-09-02
capstone_version: 5.2.0
source: uiux-interview.md (Q1-Q19)
---

# Slopify UI/UX design

Committed frontend design: direction, system, experience rules. `stack` honours
`02-system.md`; `build` implemented the Implementation constraints.

Three chapters remain. The ten per-screen chapters and the design assets were removed
on 2026-09-03 once every screen was built (see the ledger). `packages/web/src/routes/`
and `packages/web/src/play/` now describe the screens, `packages/web/src/styles/index.css`
carries the palette, and git history holds what was deleted. Every decision here traces
to `../uiux-interview.md §Q<n>` or is listed under Assumed below.

## Chapters

| Chapter | Mockup screen | Logic scenarios | §Q |
|---|---|---|---|
| [01-direction.md](01-direction.md) | all | all | Q1-Q14, Q19 |
| [02-system.md](02-system.md) | all | all | Q5, Q7-Q9, Q15-Q17, Q19 |
| [03-experience.md](03-experience.md) | all | 01, 02, 04, 12, 13 | Q4, Q18, Q19 |

## Assets

Design assets now live with the code that serves them: `packages/web/src/assets/` (the mark, the favicon, the six stage glyphs), `packages/web/public/` (`favicon.svg`, `app-icon.svg`), and `packages/site/public/assets/`. `uiux/` keeps no copies.

## Assumed, and what became of each

These were invented to complete a chapter rather than taken from an answer. `build`
settled all of them by shipping them; each now has code to read instead of a claim to
confirm.

- The marketing headline "Slop, on schedule." and its subtext: live in
  `packages/site/public/index.html`.
- The hero slot on that page: **still open**, and now a video of a real run rather than
  the screenshot originally assumed. `play-run.mp4`, its poster and its captions are
  wired and absent.
- The Appearance control sitting in the Playback rail: built that way in
  `packages/web/src/routes/settings.tsx`.
- Stage bodies opening when done and collapsing when pending: built that way in
  `packages/web/src/project/`.
- The Intros & Outros and Usage compositions, invented because no mockup covered them:
  `packages/web/src/routes/entries.tsx` and `usage.tsx`.
- The type scale, the derived light-theme values and the Lucide pick (§Q5, a two-way
  door): all in `packages/web/src/styles/index.css`. The light values were measured
  rather than trusted during `build`; one row of `02-system.md` was corrected as a
  result, and no pair fails its floor.
