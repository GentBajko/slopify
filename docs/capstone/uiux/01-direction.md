---
generated_date: 2026-09-02
capstone_version: 5.2.0
implements: [Q1, Q2, Q3, Q4, Q5, Q6, Q7, Q8, Q9, Q10, Q11, Q12, Q13, Q14, Q19]
source: uiux-interview.md
---

# 01 Direction

## Design read

- App surfaces (Operate): "Reading this as: a local production console for a solo faceless-channel operator, with a dense, calm, workmanlike language, leaning toward pro-tools panels; the slop humour is carried by the mark and the copy, never by the layout." (§Q1)
- slopify.stream (Persuade, with a Read section): "Reading this as: a one-page landing for the same operator, with a show-the-machine, no-hype language, leaning toward a product-sheet register." (§Q1)

## Mode map

| Screen | Mode | Dials (variance / motion / density) |
|---|---|---|
| 01 marketing page | Persuade; "How to use" section is Read | 7 / 5 / 4 |
| 02 first-run notice | Operate | 4 / 3 / 6 |
| 03 settings | Operate | 4 / 3 / 6 |
| 04 prompts, 05 prompt editor | Operate | 4 / 3 / 6 |
| 06 play (flagship) | Operate | 4 / 3 / 6 |
| 07 projects | Operate | 4 / 3 / 6 |
| 08 project page | Operate | 4 / 3 / 6 |
| 09 intros and outros | Operate | 4 / 3 / 6 |
| 10 usage | Operate | 4 / 3 / 6 |

Dial reasoning (§Q1): the app is used for hours while runs progress, so density and calm outrank expression; the landing has one job, getting the command copied, so it affords asymmetry and one authored motion moment. Asymmetric layouts collapse to a single column below 900 px (§Q18).

## Brand facts

Slopify is a self-aware pun on "slop", the pejorative for AI-generated media, and owns it (§Q2). The mark is a gooey play triangle with a play triangle cut out as negative space, two bubbles, a bitten top edge, in slime green; assets in `assets/` (§Q5-§Q9). The slop lives in the mark and the copy; the interface is serious, which is the joke (§Q13).

## The four sentences (§Q10)

1. Mechanism: one press turns a prompt and a handful of keywords into a narrated slideshow video: research, article, voice, images, cut, on the user's own keys, on the user's own machine.
2. Scene: a solo operator at a desk in the evening, second monitor beside a video editor, queueing the next video while the last one renders.
3. Cultural home: faceless-channel YouTube and its tooling (DAW and NLE transport bars and meters), the creator spreadsheet, and the meme culture that coined "slop", which this product answers by wearing the word.
4. What the flagship must prove: a full video is one configured form and one button away, and nothing about the machine is hidden.

## Struck (§Q11)

- The category rut: the AI-creator-tool look (dark dashboard, purple-to-blue gradient, glass cards, sparkle icons, glowing pill buttons, gradient headline text, sidebar plus card grid, "magic" copy).
- The brief's literal reading: goo everywhere. The mark spends the joke; no UI surface drips.
- The predictable opposite: the anti-AI monospace terminal.

## Candidates (§Q12)

The edit bay (matte console hardware); the control room (tally lamps and engraved signage); the composing room (paper and ink); the kitchen line (steel and thermal tickets, the one literal-adjacent candidate).

## The direction contract: the control room (§Q13)

**THESIS.** A video pipeline presented as a broadcast control room: every run is a rundown, every stage a lamp, and nothing is hidden. It refuses the category default of cards, sidebars, gradients, and "magic": the tool disappears into the task and the humour stays in the mark and the copy.

**OWN-WORLD.** Off-black matte surfaces in dark, off-white paper-board surfaces in light; engraved-label typography (Barlow Condensed, uppercase, tracked) beside plain Barlow values; tally lamps as the status language (unlit pending, pulsing slime running, steady dim green done, red failed, amber canceled); horizontal rails and rundown sheets instead of cards; one saturated fill per screen, the Play key or the active lamp; the mark's slime green as the only accent. Recognizable with all content removed by the rail rhythm, the lamp dots, and the small tracked labels.

**STORY.** The visitor understands that a video is a rundown of six stages they control; believes nothing is hidden because every provider, prompt, and keyword is on the sheet before they press play; and does one thing: fills the sheet and presses the key, then watches the lamps light.

**FIRST VIEWPORT (06 play, 1440 px).** Two columns. Left: six stage rails stacked, each a full-width row: lamp, glyph, name, a segmented source switch styled as a hardware selector, then that stage's controls inline; a provided stage collapses to its filename, an Off stage to one line. Right, sticky: the cue sheet: video title, format, intro, outro, LLM provider and model; then Keywords with a centered "Common" header and its fields, then a "Text" | "Image" split with a vertical divider (§Q14); at the bottom the Play key, a large physical-looking key carrying the mark, the only saturated fill on the screen besides the lamps. Memory test: "the form with the lamps and the big green key with the dripping play logo".

**Signature interaction: going on air.** Pressing Play depresses the key; on the project page each stage's lamp lights when it starts, its state word flips to RUNNING, a thin meter under the row fills with k of N, and the lamp settles to steady on done. Cancel kills every lamp at once (§Q13).

**Honest risk.** Signage kitsch. The discipline: flat surfaces, no bevels, no fake screws; a lamp is a dot and a colour, a label is a type style; nothing else pretends to be hardware (§Q13).

## Color strategy

Restrained (neutrals plus the one slime accent), the Operate floor, on every screen including the landing; lamp colours are the only semantic colours (§Q17). Committed at page scale through the rails and the lamps, never as scattered accents.

## Theme (§Q3, §Q19)

Use-scene sentence: "A solo operator at a desk in the evening, second monitor beside a video editor, watching runs progress for minutes at a time." It forces dark. A light theme ships as well at the user's decision; hierarchy parity and contrast floors hold in both. The theme follows the OS preference by default and a Settings control overrides it (assumed placement).

## Anti-default commitments

- No gradient anywhere, no glass, no glow beyond the lamp halo, no sparkle icon, no "magic" copy (§Q11).
- No cards as page structure; rails, rundown sheets, and dividers group content (§Q13).
- No serif, no monospace costume; tabular figures carry timecodes and counts (§Q15).
- No eyebrow labels; no section numbers; no hero-metric template on the landing: the tally board is a real live instrument, not decoration.
- The premium-consumer palette and the AI-purple palette are not used.

## Alternates and canon declined (§Q13)

- The edit bay: transport rail and meters; the safest fit with their tools and the most guessable.
- The composing room: galley proofs and slug lines; best for article screens, fights the dark theme.
- The kitchen line: tickets on a rail; the funniest, wears thin by the hundredth video.
- The standing exit, the straight dark SaaS console: offered and declined.

## Calibration self-check

Guessable from the category alone: a purple-gradient AI dashboard. Guessable from category plus avoidance: a Linear-style dark console. The control room, with tally lamps, rundown sheets, engraved labels, and a dripping play key, is neither.
