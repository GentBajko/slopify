---
absorbed_from:
  - features/2026-09-09-pausable-optional-runs@2026-09-10
  - features/2026-09-10-subtitles-fonts@2026-09-10
  - features/2026-09-10-play-redesign-drafts@2026-09-13
  - features/2026-09-10-review-checkpoints@2026-09-13
screen: play (new project)
journeys:
  - J2-first-run-setup
  - J3-make-a-video
  - J4-bring-your-own
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

# 06 Play

Configure an editable local draft, review the resolved setup/costs, then explicitly start one run or queue keyword variants. Play creates new projects; editing a project's retained revisions remains on the project page.

## Layout

The existing application navigation sits above New run, draft save state, Drafts and New draft. Four directly reachable sections follow: Content, Outputs, Style and Review. Desktop uses a flexible editor plus a360px sticky preview/summary column inside a1320px maximum width. Rows/dividers group related choices; the page uses existing matte surfaces, Barlow type and green actions (`packages/web/src/routes/play.tsx:235`, `packages/web/src/play/section-navigation.tsx:3`).

## Content

Project title, generated article prompt or supplied article text, View/Create prompt, shared keyword values and origin labels, text provider/model/thinking and optional Research. Providing Article turns Research off. Text controls remain reachable when thumbnail or entries require them. Missing selected library choices remain visible until corrected (`packages/web/src/play/content-section.tsx:16`, `packages/web/src/play/pickers.tsx`).

## Outputs

Audio, Images, Thumbnail and Export have applicable Generate/Provide/Off choices. Audio includes provider/model/voice, intro/outro and Advanced Whole/Paragraph/Every N words/Every N characters controls. Image prompts have individual counts; supplied files retain names and order with Remove/Reattach actions. Export explains MP4, silent MP4, combined WAV or individual outputs. Active thumbnail generation can expose its own providers (`packages/web/src/play/outputs-section.tsx:9`, `packages/web/src/play/media-rails.tsx`).

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

## Not included

No checkpoints, reusable templates, clock scheduling, storage manager or release controls are implied by this screen. These remain separate1.0 features.
