---
generated_date: '2026-09-25'
capstone_version: 5.2.0
generated_at_commit: 7bdb84e3f57e
paths_covered:
  - :(top)packages/web/src/styles/index.css
  - :(top)packages/web/src/components/shell.tsx
  - :(top)packages/web/src/routes/play.tsx
  - :(top)packages/site/**
content_hash: 9ee7978e0e9e
absorbed_from:
  - features/2026-09-10-play-redesign-drafts@2026-09-13
---

# 01 Direction

## Design read

- App surfaces (Operate): "Reading this as: a local production console for a solo faceless-channel operator, with a dense, calm, workmanlike language, leaning toward pro-tools panels; the slop humour is carried by the mark and the copy, never by the layout."
- slopify.stream (Persuade, with a Read section): "Reading this as: a one-page landing for the same operator, with a show-the-machine, no-hype language, leaning toward a product-sheet register."

## Mode map

| Screen | Mode | Dials (variance / motion / density) |
|---|---|---|
| 01 marketing page | Persuade; "How to use" section is Read | 7 / 5 / 4 |
| 02 first-run notice | Operate | 4 / 3 / 6 |
| 03 settings, with Usage as its last section | Operate | 4 / 3 / 6 |
| 06 play (flagship) | Operate | 4 / 3 / 6 |
| 07 projects | Operate | 4 / 3 / 6 |
| 08 project page | Operate | 4 / 3 / 6 |
| Library: 04 prompts, 09 intros and outros, templates, schedules | Operate | 4 / 3 / 6 |
| 05 prompt editor, intro/outro editor | Operate | 4 / 3 / 6 |

The app renders its control-room direction through shared matte surfaces, rail borders, Barlow faces, tally lamps and the green accent, inside one fixed 48 px header and a content column centred at 1200 px on every route (`packages/web/src/styles/index.css:7-63`, `packages/web/src/components/shell.tsx`). The landing carries the same palette and faces in a wider persuasive composition (`packages/site/public/styles.css:57-105`, `packages/site/public/styles.css:340-413`). Play uses a separate 1100 px composition breakpoint (`packages/web/src/routes/play.tsx`).

## Brand facts

Slopify is a self-aware pun on "slop", the pejorative for AI-generated media, and owns it. The mark is a gooey play triangle with a play triangle cut out as negative space, two bubbles, a bitten top edge, in slime green; assets in `assets/`. The slop lives in the mark and the copy; the interface is serious, which is the joke.

## The four sentences

1. Mechanism: one press turns a prompt and a handful of keywords into a narrated slideshow video: research, article, voice, images, cut, on the user's own keys, on the user's own machine.
2. Scene: a solo operator at a desk in the evening, second monitor beside a video editor, queueing the next video while the last one renders.
3. Cultural home: faceless-channel YouTube and its tooling (DAW and NLE transport bars and meters), the creator spreadsheet, and the meme culture that coined "slop", which this product answers by wearing the word.
4. What the flagship must prove: a saved setup leads through explicit Review to Start, with providers, outputs and estimated costs visible before admission.

## Struck

- The category rut: the AI-creator-tool look (dark dashboard, purple-to-blue gradient, glass cards, sparkle icons, glowing pill buttons, gradient headline text, sidebar plus card grid, "magic" copy).
- The brief's literal reading: goo everywhere. The mark spends the joke; no UI surface drips.
- The predictable opposite: the anti-AI monospace terminal.

## Candidates

The edit bay (matte console hardware); the control room (tally lamps and engraved signage); the composing room (paper and ink); the kitchen line (steel and thermal tickets, the one literal-adjacent candidate).

## The direction contract: the control room

**THESIS.** A video pipeline presented as a broadcast control room: every run is a rundown, every stage a lamp, and nothing is hidden. It refuses the category default of cards, sidebars, gradients, and "magic": the tool disappears into the task and the humour stays in the mark and the copy.

**OWN-WORLD.** Off-black matte surfaces in dark, off-white paper-board surfaces in light; engraved-label typography (Barlow Condensed, uppercase, tracked) beside plain Barlow values; tally lamps as the status language (unlit pending, pulsing slime running, steady dim green done, red failed, amber canceled); horizontal rails and rundown sheets instead of cards; one saturated fill per screen, the Play key or the active lamp; the mark's slime green as the only accent. Recognizable with all content removed by the rail rhythm, the lamp dots, and the small tracked labels.

**STORY.** Configure Content, Outputs and Style, open Review, then explicitly Start. Saved drafts let the operator return without reconstructing the setup. The project page carries the running stages and their lamps in one rundown strip.

**FIRST VIEWPORT (06 play, 1440 px).** The page bar reads New run with the draft title as meta and the drafts controls at its right. Under it the Run setup row holds three numbered editor tabs (Content, Outputs, Style) and a separate Review button. A flexible active editor sits beside a 300 px sticky readiness rail (Article, Narration, Images, Thumbnail, Export, Style, each a lamp and a state word), inside the shell's 1200 px column. Style alone adds the actual 16:9 or 9:16 frame preview above the rail. Below 1100 px the rail becomes a compact lamp row under the tabs and the Style preview sits above its controls. A sticky action bar keeps the blocker hint with Fix setup, Continue to the next tab and Review and start on screen; Review opens as a drawer and only its explicit Start run or Queue N videos admits work. See `screens/02-play.md` and `packages/web/src/routes/play.tsx`.

**Signature interaction: going on air.** The Review drawer presents the resolved setup, checkpoints and costs. Explicit Start creates the project; the project page then exposes each stage's state and progress in its rundown strip. Autosave, section navigation, the readiness rail and preview never start work.

**Honest risk.** Signage kitsch. The discipline: flat surfaces, no bevels, no fake screws; a lamp is a dot and a colour, a label is a type style; nothing else pretends to be hardware.

## Color strategy

Restrained (neutrals plus the one slime accent), the Operate floor, on every screen including the landing; lamp colours are the only semantic colours. Committed at page scale through the rails and the lamps, never as scattered accents.

## Theme

Use-scene sentence: "A solo operator at a desk in the evening, second monitor beside a video editor, watching runs progress for minutes at a time." It forces dark. A light theme ships as well at the user's decision; hierarchy parity and contrast floors hold in both. The theme follows the OS preference by default and a Settings control overrides it (assumed placement).

## Anti-default commitments

- No gradient anywhere, no glass, no glow beyond the lamp halo, no sparkle icon, no "magic" copy.
- No cards as page structure; rails, rundown sheets, and dividers group content.
- No serif, no monospace costume; tabular figures carry timecodes and counts.
- No decorative eyebrow labels or section numbers; Play numbers its three editor tabs to communicate setup order. No hero-metric template on the landing: the tally board is a real live instrument, not decoration.
- The premium-consumer palette and the AI-purple palette are not used.

## Alternates and canon declined

- The edit bay: transport rail and meters; the safest fit with their tools and the most guessable.
- The composing room: galley proofs and slug lines; best for article screens, fights the dark theme.
- The kitchen line: tickets on a rail; the funniest, wears thin by the hundredth video.
- The standing exit, the straight dark SaaS console: offered and declined.

## Calibration self-check

Guessable from the category alone: a purple-gradient AI dashboard. Guessable from category plus avoidance: a Linear-style dark console. The control room, with tally lamps, rundown sheets, engraved labels, and a dripping play key, is neither.
