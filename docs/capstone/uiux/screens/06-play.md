---
mockup: mockup/06-play.md
scenarios: [S1, S2, S3, S13]
logic: [logic/02-provider-credentials.md, logic/03-placeholder-substitution.md, logic/04-run-admission.md, logic/05-provided-outputs.md, logic/08-narration.md, logic/10-thumbnail-prompt-by-llm.md]
implements: [Q13, Q14, Q17, Q18]
assumed: []
generated_date: 2026-09-02
capstone_version: 5.2.0
---

# 06 Play

## Mode & job

Operate; the flagship. Job: configure one run and press the key with nothing hidden.

## Composition

Reference render: `../assets/reference-play.html` (both themes). At 1440 px, two columns, 1fr and 480 px, 24 px gap (§Q13, §Q14):

- **Left, the stage rails.** Page title "New run" with the one-line hint "Six stages. Generate any of them, or provide the output yourself and the stage is skipped." Six rails share borders: lamp (unlit here), stage glyph, name, the source segmented switch (Research: Off / Generate / Provide; Article, Audio, Images: Generate / Provide; Thumbnail: Off / From prompt / Prompt by LLM / Provide; Video: no switch, one line "Rendered from the stages above · intro · body · outro · gaps"), then that source's controls inline, right-aligned: Article prompt select; TTS provider, Voice, Chunking (Whole / Paragraph / Every N words with an N input); image Provider, Model, and the prompt tick list with a Number input per ticked prompt; Thumbnail prompt select. Provide shows a paste area or a file drop with staged filenames and per-file progress (`logic/05`).
- **Right, the sticky cue sheet.** "Cue sheet" engraved header; Video title; Format segmented (16:9 / 9:16), Intro select, Outro select on one row; LLM provider and Model on one row (hidden when nothing needs an LLM, `logic/04`); Keywords: a centered "Common" header with rules, its fields full width; below, "Text" | "Image" headers with a vertical divider and stacked fields (§Q14); then the Play key: full width, 56 px tall, accent fill, `--accent-ink` "PLAY" in Barlow 800 with the mark at 22 px, a 4 px `--accent-edge` base that compresses on press.

Focal moment: the Play key. Below 900 px: rails, then the cue sheet, then Play sticky at the bottom (§Q18).

## States

- Fresh: defaults per `logic/04` §Q32; Off and provided rails collapsed to one line; Play disabled with the label "Play" dimmed at 45% and a hint above it naming the first missing item ("Pick an article prompt to play").
- Configured and valid: Play enabled; the hint disappears.
- Invalid field: `--red` border and a one-line message below the field ("Fill maxWords to play"); Play disabled (`logic/04` §Q29).
- Unkeyed provider: greyed option in the select with "add key in Settings" as its description; a not-found CLI provider greyed with "not found on PATH" (`logic/02` §Q12, §Q135).
- Model list fetch failed: the Model select shows the error text as its value and Play is disabled for that provider (`logic/02` §Q15).
- No voices saved: Voice select reads "No voices. Add one in Settings." and Play disabled (`logic/02`, `logic/04`).
- Upload staging: a progress bar under each filename; Play disabled until all complete (`logic/05` §Q44); rejected file: `--red` row with the reason and a Remove control.
- Provided article: research rail hidden (`logic/05` §Q41).
- Another project running: the top-bar tally shows it; Play stays enabled (`logic/01` §Q8).
- Submitting: the key depresses, then the page changes to the project (`logic/04` §Q33); double click impossible while disabled.
- Local creation failure: inline error above the key with the OS message (`logic/04` §Q36).

## Motion

Switch marker slide 150 ms; rail expand and collapse 200 ms; the Play press 3 px; nothing on load.

## Copy

"New run", stage names as in the rails, "Generate" / "Provide" / "Off" / "From prompt" / "Prompt by LLM", "Cue sheet", "Video title", "Format", "Intro", "Outro", "LLM", "Model", "Common", "Text", "Image", "PLAY". Hints name the next action, never the rule.
