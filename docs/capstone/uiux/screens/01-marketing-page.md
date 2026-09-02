---
mockup: mockup/01-marketing-page.md
scenarios: [S12]
logic: [logic/16-telemetry.md]
implements: [Q1, Q13, Q15, Q17, Q18]
assumed:
  - headline "Slop, on schedule." and the 16-word subtext are proposed copy
  - the hero screenshot is a placeholder slot until the built Play screen can be captured
generated_date: 2026-09-02
capstone_version: 5.2.0
---

# 01 Marketing page

## Mode & job

Persuade, with the "How to use" band as a Read section. Job: get the command copied. Dials 7 / 5 / 4 (§Q1).

## Composition

Five layout families, no repeats, single column below 900 px (§Q18):

1. **Split hero** (60 / 40, offset, not centred). Left: the mark at 96 px with the wordmark; headline "Slop, on schedule." (Barlow 800, 32 px, two lines at most); subtext, 16 words: "A prompt and a few keywords in. A narrated slideshow video out. Your keys, your machine, free."; the command block `npx slopify@latest` as an engraved-label plate with Copy as the only primary action. Right: the live tally board: five counters (videos made, audio hours, images made, tokens used, installs) in tabular Barlow 700 at 32 px with engraved labels beneath, on a `--panel` sheet. No trust logos, no eyebrows. Fits the first viewport at 1440×900.
2. **Screenshot band**: one real capture of the Play screen in the dark theme, full width, 6 px radius, with a one-line caption. Placeholder slot until the app exists (assumed).
3. **How to use**: a five-row rundown (Run it, Keys, Prompts, Play, Project), each row a lamp dot, a verb label, one sentence; rows share borders like the app's rails; no "Step 1/2/3" labels.
4. **Free statement**: a single wide line: "Free. Runs on your machine with your own keys." with the donation links (Patreon, Buy Me a Coffee) beside it.
5. **Footer**: telemetry sentence ("Anonymous usage stats power the counters above; nothing you write ever leaves your machine."), GitHub link, donation links again.

Focal moment: the Copy button beside the command; the tally board is the proof, not the hero.

## States

- Counters live: numbers change in place every 5 s (`logic/16` §Q133); a changed digit fades 150 ms; no rolling animation.
- Counters unavailable: dashes in place of numbers and the label "live stats unavailable" in `--ink2` (`logic/16` §Q133).
- Copy clicked: the button reads "Copied" for 2 s with a check icon; keyboard and screen readers get the same announcement.
- Loading: the tally board renders a skeleton of five bars in its final shape.
- Narrow: hero stacks, tally board becomes a two-column grid, screenshot scales.

## Motion

The tally digits' fade is the page's authored moment; the hero has no entrance choreography. Reduced motion: digits swap instantly.

## Copy

Register: deadpan, literal. Headline "Slop, on schedule."; button "Copy"; band title "How to use"; the free statement as written. Zero em-dashes. Donation links are named by service.
