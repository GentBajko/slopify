---
mockup: mockup/08-project.md
scenarios: [S4, S5, S6, S7, S8, S9, S10, S11, S16]
logic: [logic/01-pipeline-lifecycle.md, logic/06-research.md, logic/07-article-writing.md, logic/08-narration.md, logic/09-image-generation.md, logic/10-thumbnail-prompt-by-llm.md, logic/11-video-assembly.md, logic/12-reruns-and-edits.md, logic/13-cancel.md]
implements: [Q13, Q17, Q18]
assumed:
  - stage bodies open by default when done and collapse when pending
generated_date: 2026-09-02
capstone_version: 5.2.0
---

# 08 Project page

## Mode & job

Operate. Job: watch a run go on air, then act on any stage.

## Composition

Reference render (rundown part): `../assets/reference-play.html`. Back link "< Projects". Header rail: lamp, title (Barlow 700, 16 px), prompt name · format · started time in `--ink2`, the project state word, and Cancel (secondary outline) while running. Below, six stage rows in run order, each: lamp, glyph, name, a one-line summary in `--ink2` ("7 chapters researched · 41 sources", "Narrator M · chunk 3 of 8"), the state word at right, a thin meter under the row while running. Each row expands into its body (assumed: open when done, collapsed when pending):

- Research: the notes in a 75 ch measure; "Show instructions" toggle; Download.
- Article: the markdown rendered in a 75 ch measure; Edit (inline editor with Save & re-run from audio, Discard); Download; links to the sources and glossary files beside the title (`logic/08` §Q64); "Show instructions".
- Audio: three players when intro or outro exist (Intro, Body, Outro) with durations; Download each; Re-run with a Voice select beside it; Chunking shown as text.
- Images: a grid per image prompt, 6 columns at 1440 px, prompt name as an engraved header with "× N"; per image on hover and focus: Download, Regenerate, Delete; "Download all" and "Re-run stage" at the group's right; the thumbnail in its own single-cell group with its prompt text (LLM-written text editable, `logic/12` §Q104).
- Video: the player at the run's aspect, capped at 720 px tall; Download .mp4; Re-render.

## States

Per stage, the lamp plus the state word (`logic/01`, `logic/13`): PENDING (unlit, summary "Waits for …"), RUNNING (pulsing lamp, meter, streaming text or appearing images), DONE (steady dim lamp, body open), FAILED (red lamp; an error line spanning the row: the provider's verbatim text and the attempt count, `--red` on an 8% red tint, with "Retry stage" at its right, `logic/01` §Q10), CANCELED (amber lamp, "Retry stage"), PROVIDED (unlit lamp, state word PROVIDED, the original filename in the summary, no re-run), SKIPPED (unlit, row collapsed to one line).

- Key missing or CLI missing: the stage's Retry and Re-run controls disabled and labelled accordingly, with a Settings link (`logic/02` §Q13, §Q135).
- Running: every edit and re-run control disabled (`logic/12` §Q106); Cancel visible.
- Cancel: confirmation dialog ("Stops every running stage; finished outputs are kept."); on confirm all lamps go unlit at once and the project word reads CANCELED (`logic/13`).
- Article edit: the rendered text becomes an editor in place; Save & re-run from audio and Discard; Discard confirms (`03-experience.md`).
- Image delete on the last image: control disabled with the tooltip "At least one image must remain" (`logic/12` §Q103).
- Old video during a re-render: the player keeps the previous file and a line reads "Re-rendering · 42%" until the new file replaces it (`logic/12` §Q106).
- Deleted prompt: the header's prompt name carries "(deleted)" (`logic/15` §Q123).
- Loading: skeleton rows in the final shape.

## Motion

The signature interaction: a lamp lights and its state word flips when a stage starts (150 ms), the meter fills, article text streams, images fade in one by one (150 ms), the lamp settles on done. Reduced motion: lamps switch instantly, no fades.

## Copy

"Cancel run", "Retry stage", "Re-run", "Regenerate", "Delete", "Download", "Download all", "Re-render", "Edit", "Save & re-run from audio", "Discard", "Show instructions". Error lines are the provider's text, prefixed by the provider name.
