---
glossary_pronunciation_verified_at_commit: 6eeac3fd9043
generated_at_commit: 7bdb84e3f57e
generated_date: '2026-09-25'
capstone_version: 5.2.0
content_hash: a67d2e78a040
paths_covered:
  - :(top)packages/web/src/routes/play.tsx
  - :(top)packages/web/src/play/**
  - :(top)packages/web/src/subtitles/**
  - :(top)packages/web/src/router.tsx
absorbed_from:
  - features/2026-09-25-glossary-pronunciation@2026-09-25
  - features/2026-09-24-narration-preparation@2026-09-24
  - features/2026-09-10-play-redesign-drafts@2026-09-13
  - features/2026-09-10-review-checkpoints@2026-09-13
---

# Play

## Glossary pronunciation control

Scoped verification: `6eeac3f`, 2026-09-25. Generated Audio's Advanced disclosure includes a native labelled **Use Pronunciation Glossary** checkbox; its explanation and example sit behind an InfoTip and in the checkbox's accessible description. Fresh Play initializes it true; absent saved values display off. The value persists across provider/source switches, but only generated Inworld TTS-2/Flash applies it; other choices disable it with one line saying the preference is retained. It introduces no new design token, auto-generation or glossary editor (`packages/web/src/play/pronunciation-glossary.tsx`, `packages/web/src/play/media-rails.tsx`, `packages/web/src/play/draft-state.ts:25`).

## Mode & job

Operate surface for configuring a durable local draft, reviewing resolved inputs/costs and explicitly admitting new project(s). `PlayRoute` handles destination navigation; `PlayForm` composes the page while shell-level `PlayDraftProvider` owns the draft (`packages/web/src/routes/play.tsx`, `packages/web/src/play/draft-context.tsx`).

## Composition

- PageBar "New run" with the draft title (or Untitled draft) as meta. Its actions are the drafts controls: a fixed-width save state word, Retry / Reload saved draft / Save as a new draft when the state needs them, a Drafts popover listing saved drafts, and New draft (`packages/web/src/play/draft-list.tsx`).
- The "Run setup" row: three numbered editor tabs Content, Outputs, Style, and a separate Review button at the right. Numbers express setup sequence, not execution progress. While Review is open the editor under it stays marked (`packages/web/src/play/section-navigation.tsx`).
- Desktop (1100 px and up): a flexible editor beside a 300 px sticky readiness rail headed "This run" (`packages/web/src/play/readiness-rail.tsx`). Rows Article, Narration, Images, Thumbnail, Export and Style each show a lamp, a one-line detail and a state word (Ready, Needs setup, Off, Provided); pressing a row reveals the blocking field. On Style only, the frame preview sits above the rail.
- Below 1100 px: one column; the rail becomes a compact row under the tabs, each item a lamp, label and state word, and Style's preview sits above its controls. Controls stay at least 44 px tall.
- Content groups title, article, keywords, text generation (help behind an InfoTip) and Research. Outputs groups Audio, Images, Thumbnail and Export rails with applicable sources and contextual provider/keyword links. The Export rail carries Seconds per image when a video is made and Silence at start and end when there is narration, each a short raw-text field with its help behind an InfoTip (`packages/web/src/play/stage-rails.tsx`). Rails reserve no gaps for empty rows (`packages/web/src/play/content-section.tsx`, `packages/web/src/play/outputs-section.tsx`).
- Generated Audio keeps TTS, model and voice visible. One "Audio Advanced · …" disclosure, whose summary lists non-default choices, holds chunking, intro/outro, Narration Preparation, Pronunciation Glossary, the Choose Text Generation in Content link (when preparation is on) and Settings (`packages/web/src/play/media-rails.tsx`).
- Style holds shaped ratios, captions, font/upload/size/five positions/sample. Preview uses shared renderer sizing/placement and a ready supplied image or neutral frame; it generates no asset (`packages/web/src/play/style-section.tsx`, `packages/web/src/play/output-preview.tsx`).
- A sticky ActionBar holds one StatusSlot (a save or list-loading error, or the blocker hint with Fix setup), Continue to the next editor tab (its place kept on Style), and the primary Review and start. It opens the Review drawer; nothing starts until Start run inside the drawer.
- Review is a Drawer over the last editor (`session.section` is still `"review"`). In order: intro line, setup errors as reveal buttons, the pending-upload action, the review error, Estimated cost (disclaimer behind an InfoTip, expected-words field, estimates), Review checkpoints (inline Before Audio / Images / Video / export checkboxes, help behind an InfoTip; per-stage detail is announced and shown only for errors), setup summary groups with resolved prompts, the batch editor, then a sticky footer with Refresh review and Start run / Queue N videos (`packages/web/src/play/review-section.tsx`, `packages/web/src/play/checkpoints.tsx`, `packages/web/src/play/review-summary.tsx`).

Narration Preparation lives in Audio Advanced: Off or a saved prompt, View/Create, keyword correction and the text-generation link; its help sits behind an InfoTip. Only Inworld TTS-2 supports it. Shared LLM controls remain visible with a supplied article when preparation is active. Review explains preparation calls and unknown added TTS characters; source switches preserve hidden choices without activating them (`packages/web/src/play/narration-preparation.tsx`, `content-section.tsx`, `review-summary.tsx`).

## States

- Raw incomplete and hidden values persist without automatic admission. Missing saved choices stay visible; explicit replacement/Off corrects them. Shared keyword inputs do not duplicate a placeholder across templates (`packages/web/src/play/pickers.tsx`, `packages/web/src/play/keywords.tsx`).
- Save states are honest acknowledgements: Unsaved, Saving, Saved, Couldn't save with Retry, Changed elsewhere with Reload saved draft / Save as a new draft. First-create/fork acknowledgement loss cannot grant stale content a newer write version. Confirmed Discard waits for submitted saves and resets only matching state after success (`packages/web/src/play/draft-list.tsx`, `packages/web/src/play/use-draft-session.ts`).
- Ready referenced media survives restart; stopped uploads expose Reattach/Remove. File/font ownership prevents late settlement into another choice/draft (`packages/web/src/play/use-draft-uploads.ts`, `packages/web/src/lib/form-drafts.tsx`).
- Audio Off disables active subtitle styling; Video Off allows files only. An unfinished font operation remains visible outside inactive controls with Keep current font, so Review locks always have an explicit corrective path. Fallback font preview is labelled (`packages/web/src/subtitles/controls.tsx`, `packages/web/src/subtitles/style-preview.tsx`).
- Review failures expose linked errors and exact focus/disclosure targets; checkpoint errors reveal inside the Review drawer. Input/template/catalogue change invalidates estimate authority; loading/failure/uploads block Start. A lost Start reply exposes Check Start result, recovering the same receipt rather than a fresh submission (`packages/web/src/play/field-targets.ts`, `packages/web/src/play/checkpoints.tsx`, `packages/web/src/play/review-state.ts`).

## Motion

Sticky readiness rail and action bar; the Review drawer enters with the 150 ms tick-in. Preview styles respect reduced motion. Tab order follows mounted controls; section/error navigation focuses explicitly (the Review drawer focuses its title unless a field inside was revealed), autosave/query refresh does not. Ctrl/Cmd+Enter opens Review and never starts work (`packages/web/src/routes/play.tsx`, `packages/web/src/components/kit/drawer.tsx`).

## Copy

New run; Run setup; Content; Outputs; Style; Review; Continue to…; Review and start; Fix setup; This run; Ready / Needs setup / Off / Provided; Start run / Queue N videos. Setup state never claims video-generation percentage. Unknown prices remain visible in the estimate; the actual-cost caveat sits behind its InfoTip. Narration source explanations distinguish silent MP4, combined WAV and individual outputs (`packages/web/src/play/sections.ts`, `packages/web/src/play/readiness-rail.tsx`, `packages/web/src/play/review-section.tsx`).

## Not in play

Template capture and schedule management live on the Library's Templates and Schedules tabs. Existing-project Save and Rebuild live on the project route. Preview and draft persistence do not call generation providers (`packages/web/src/router.tsx`, `packages/web/src/routes/play.tsx`, `packages/web/src/play/output-preview.tsx`).
