---
glossary_pronunciation_verified_at_commit: 6eeac3fd9043
absorbed_from:
  - features/2026-09-25-glossary-pronunciation@2026-09-25
  - features/2026-09-24-narration-preparation@2026-09-24
  - features/2026-09-09-pausable-optional-runs@2026-09-10
  - features/2026-09-10-subtitles-fonts@2026-09-10
  - features/2026-09-10-play-redesign-drafts@2026-09-13
  - features/2026-09-10-review-checkpoints@2026-09-13
  - features/2026-09-10-project-templates@2026-09-13
screen: play (new project)
journeys:
  - J2-first-run-setup
  - J3-make-a-video
  - J4-bring-your-own
generated_date: '2026-09-13'
generated_at_commit: 7bdb84e3f57e
capstone_version: 5.2.0
paths_covered:
  - :(top)packages/app/src/slices/play-drafts/**
  - :(top)packages/app/src/slices/project-templates/**
  - :(top)packages/web/src/play/**
  - :(top)packages/web/src/routes/play.tsx
  - :(top)packages/web/src/routes/schedules.tsx
content_hash: fb14e2c26cf1
---

# 06 Play

## Pronunciation preference

Scoped verification: `6eeac3f`, 2026-09-25. Generated Audio exposes **Use Pronunciation Glossary**, a labelled checkbox with the example `Arda: /ˈɑɹdə/`. It explains that supplied IPA is applied without rewriting ordinary narration or making an extra LLM call. Fresh drafts enable it; restored drafts/templates with an absent value remain off. It is independent of Narration Preparation, active for Inworld TTS-2 and Flash, and retained but inactive for other providers or Audio Off/Provide. Provider switches, autosave/reload and template application preserve the choice (`packages/web/src/play/pronunciation-glossary.tsx:3`, `packages/web/src/play/media-rails.tsx:88`, `packages/web/src/play/draft-state.ts:25`).

Configure an editable local draft, review the resolved setup/costs, then explicitly start one run or queue keyword variants. Play creates new projects; editing a project's retained revisions remains on the project page.

## Layout

The existing application navigation sits above New run, draft save state, Drafts and New draft. Four directly reachable sections follow: Content, Outputs, Style and Review. Desktop uses a flexible editor plus a360px sticky preview/summary column inside a1320px maximum width. Rows/dividers group related choices; the page uses existing matte surfaces, Barlow type and green actions (`packages/web/src/routes/play.tsx:235`, `packages/web/src/play/section-navigation.tsx:3`).

## Elements

| Element | Action and destination |
|---|---|
| Drafts / New draft | Selects a durable setup or saves the current edits before opening a fresh one |
| Content / Outputs / Style / Review | Opens the named setup section without submitting work |
| Generate / Provide / Off controls | Changes the active source and reveals only applicable fields |
| Edit ↗ in Review | Returns to and focuses the owning setup field |
| Review draft | Flushes edits, refreshes provider/model choices and resolves cost/readiness |
| Start run / Queue videos | Submits the current review identity and opens the created project after confirmed admission |

The Review page includes a Run readiness group for each active LLM, TTS and image choice; unavailable providers, models or voices expose an Edit action (`packages/web/src/play/review-summary.tsx:147`, `packages/web/src/play/review-state.ts:151`).

## States

- **Incomplete draft:** raw inputs remain editable and autosaved; Review reveals applicable field errors.
- **Saving / Saved / Couldn't save / Changed elsewhere:** the page shows the draft write state and conflict recovery actions.
- **Reviewing:** current provider/model data and the saved draft are being resolved; Start remains unavailable.
- **Ready to start:** costs, assumptions, selected checkpoints and run readiness are visible.
- **Starting / uncertain:** the original review identity is retained while its receipt is recovered; a new chargeable identity is not offered.
- **Started:** confirmed project IDs replace the draft destination and navigation opens the project.

These states come from the draft and Review state machines (`packages/web/src/play/draft-save.ts:1`, `packages/web/src/play/review-state.ts:130`).

## Content

Project title, generated article prompt or supplied article text, View/Create prompt, shared keyword values and origin labels, text provider/model/thinking and optional Research. Providing Article turns Research off. Text controls remain reachable when thumbnail or entries require them. Missing selected library choices remain visible until corrected (`packages/web/src/play/content-section.tsx:16`, `packages/web/src/play/pickers.tsx`).

## Outputs

Audio, Images, Thumbnail and Export have applicable Generate/Provide/Off choices. Audio includes provider/model/voice, intro/outro and Advanced Whole/Paragraph/Every N words/Every N characters controls. Image prompts have individual counts; supplied files retain names and order with Remove/Reattach actions. Export explains MP4, silent MP4, combined WAV or individual outputs. Active thumbnail generation can expose its own providers (`packages/web/src/play/outputs-section.tsx:9`, `packages/web/src/play/media-rails.tsx`).

Narration Preparation appears under generated Audio, defaulting to Off. Selecting a saved prompt reveals View/Create and shared-keyword links, explains the extra LLM call per logical group/entry and shows an actionable Inworld TTS-2 compatibility error. Shared text-generation controls remain reachable for a supplied article. Hidden choices persist but are inactive with Audio Off/Provide. Review includes the frozen prompt, LLM cost and unknown steering-character overhead (`packages/web/src/play/narration-preparation.tsx`, `content-section.tsx`, `review-summary.tsx`).

## Style

Shaped16:9/9:16 selectors, subtitles Off/files/burn-in, font selection/upload, raw size input plus slider, five illustrated vertical positions and editable sample text. One renderer-based preview shows selected font/size/position against the first ready supplied image or neutral background. Files-mode captions explain player-controlled styling. No preview generation or alignment-model download is triggered here (`packages/web/src/play/style-section.tsx`, `packages/web/src/play/output-preview.tsx:23`, `packages/web/src/subtitles/controls.tsx`).

Failed/interrupted font uploads retain a visible filename/error when Audio or subtitles are Off. Keep current font explicitly clears the unfinished selection; it does not change saved style. Following either a server error or a client setup/upload warning reaches the corrective control (`packages/web/src/subtitles/controls.tsx:252`, `packages/web/src/play/review-state.ts:243`).

## Review

A full page, not a dialog: grouped Content/Outputs/Style choices and exact Edit links, resolved prompts, filenames/order, providers/models/thinking, narration chunking/entries, subtitle settings and optional persisted keyword variants. Expected words drives cost ranges; catalogue date, unknown charges, known subtotal and assumptions stay visible. Review checkpoints for Audio, Images and Video/export are summarized here, but approval remains an explicit project-page action. Start run/Queue N videos is the only action that creates work (`packages/web/src/play/review-section.tsx:11`, `packages/web/src/play/review-summary.tsx`).

## Draft and failure states

Drafts save locally in SQLite, including incomplete text, raw numbers, hidden selections, section, sample and batch rows. Save states are Unsaved/Saving/Saved/Couldn't save/Changed elsewhere. Retry keeps pending edits; Reload and Save as a new draft resolve conflicts. Drafts list title/last edit; Discard asks for confirmation and uses that displayed version. Browser storage holds only the selected ID; clearing it does not delete server drafts (`packages/web/src/play/draft-list.tsx`, `packages/web/src/play/use-draft-session.ts`, `packages/web/src/play/draft-restore.ts`).

Completed owned uploads survive restart. Interrupted/missing files expose Reattach/Remove; late removed/replaced/discarded uploads cannot replace newer work. Start uncertainty keeps the same reviewed identity until the original result is recovered. Only confirmed creation clears the active setup (`packages/web/src/play/use-draft-uploads.ts`, `packages/web/src/play/review-state.ts`).

## Narrow layout and keyboard

Below1100px the page has one column. Style places its sole expanded preview before controls; other sections have an in-flow Preview disclosure before controls. The additional read-only This run summary follows the active section/action. At390px navigation wraps into two rows and controls wrap without horizontal scrolling; narrow controls are at least44px high. The action area reserves layout/safe-area space. Desktop controls are at least40px. Ctrl/Cmd+Enter opens Review only; explicit navigation/error links set focus, autosave does not (`packages/web/src/routes/play.tsx:235`, `packages/web/src/play/output-preview.tsx:8`).

## Tutorial and destinations

The spotlight guide reveals the relevant section and disclosure before targeting a real control. Its stable cursor restores after reload. Settings/Create prompt return to the same draft. Start success goes to the created project. The guide never starts generation itself (`packages/web/src/tutorial/model.ts:115`, `packages/web/src/tutorial/use-session.ts:8`).

## Templates

The Templates navigation surface lists immutable setup snapshots. It can save an acknowledged
draft, apply a snapshot into a fresh draft, or delete a template. Apply returns to Play with
keywords and choices ready for Review; it never starts a run. Provided media is called out for
reattachment.

Schedules is a separate implemented screen that consumes saved template revisions; editing Play itself does not choose a recurrence (`packages/web/src/routes/schedules.tsx:133`).
