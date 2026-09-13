---
generated_at_commit: 7bdb84e3f57e
generated_date: '2026-09-13'
capstone_version: 5.2.0
content_hash: a67d2e78a040
paths_covered:
  - :(top)packages/web/src/routes/play.tsx
  - :(top)packages/web/src/play/**
  - :(top)packages/web/src/subtitles/**
  - :(top)packages/web/src/router.tsx
absorbed_from:
  - features/2026-09-10-play-redesign-drafts@2026-09-13
  - features/2026-09-10-review-checkpoints@2026-09-13
---

# Play

The Outputs section includes keyboard-accessible checkpoint choices for Audio, Images and Video/export. The Review section summarizes the selected dependency closures; approval happens later on the project page.

## Mode & job

Operate surface for configuring a durable local draft, reviewing resolved inputs/costs and explicitly admitting new project(s). `PlayRoute` handles destination navigation; `PlayForm` composes the sections while shell-level `PlayDraftProvider` owns the draft (`packages/web/src/routes/play.tsx:25`, `packages/web/src/play/draft-context.tsx`).

## Composition

- New run plus save state/Drafts/New draft, followed by Content, Outputs, Style and Review navigation. All sections are reachable; numbers express setup sequence, not execution progress (`packages/web/src/routes/play.tsx:235`, `packages/web/src/play/section-navigation.tsx:3`).
- Desktop≥1100px: maximum1320px, flexible editor and360px sticky aside with28px gap/top24px. Exactly one full preview is mounted. Read-only This run summary has edit links and the current corrective action (`packages/web/src/routes/play.tsx:254`, `packages/web/src/play/setup-summary.tsx:5`).
- Below1100px: one column; Style's expanded preview precedes its controls, other sections use an in-flow Preview disclosure. The additional This run summary follows the active section/action. This records the shipped arrangement; the approved narrow mockup hid its larger summary and emphasized the Preview disclosure (`packages/web/src/routes/play.tsx:261`, `packages/web/src/play/output-preview.tsx:8`).
- Content groups title/article/keywords/text generation/Research. Outputs groups Audio/Images/Thumbnail/Export with applicable sources and contextual provider/keyword links. Advanced audio holds chunking/entries and exposes a nondefault summary (`packages/web/src/play/content-section.tsx:16`, `packages/web/src/play/outputs-section.tsx:9`).
- Style holds shaped ratios, captions, font/upload/size/five positions/sample. Preview uses shared renderer sizing/placement and a ready supplied image or neutral frame; it generates no asset (`packages/web/src/play/style-section.tsx`, `packages/web/src/play/output-preview.tsx:23`).
- Review is a full page with grouped exact choices/edit links, resolved prompts, ordered supplied names, providers/models/chunking/entries/style, variants and expected-word cost estimates. Explicit Start run/Queue N videos is the creation action (`packages/web/src/play/review-section.tsx:11`, `packages/web/src/play/review-summary.tsx`).

## States

- Raw incomplete and hidden values persist without automatic admission. Missing saved choices stay visible; explicit replacement/Off corrects them. Shared keyword inputs do not duplicate a placeholder across templates (`packages/web/src/play/pickers.tsx`, `packages/web/src/play/keywords.tsx`).
- Save states are honest acknowledgements: Unsaved, Saving, Saved, Couldn't save with Retry, Changed elsewhere with Reload/Save as new. First-create/fork acknowledgement loss cannot grant stale content a newer write version. Confirmed Discard waits for submitted saves and resets only matching state after success (`packages/web/src/play/draft-list.tsx`, `packages/web/src/play/use-draft-session.ts`).
- Ready referenced media survives restart; stopped uploads expose Reattach/Remove. File/font ownership prevents late settlement into another choice/draft (`packages/web/src/play/use-draft-uploads.ts`, `packages/web/src/lib/form-drafts.tsx`).
- Audio Off disables active subtitle styling; Video Off allows files only. An unfinished font operation remains visible outside inactive controls with Keep current font, so global Review locks always have an explicit corrective path. Fallback font preview is labelled (`packages/web/src/subtitles/controls.tsx:252`, `packages/web/src/subtitles/style-preview.tsx`).
- Review failures expose linked errors and exact focus/disclosure targets. Input/template/catalogue change invalidates estimate authority; loading/failure/uploads block Start. A lost Start reply exposes same-receipt recovery rather than a fresh submission (`packages/web/src/play/field-targets.ts`, `packages/web/src/play/review-state.ts`).

## Motion

Sticky aside on wide screens; otherwise ordinary document flow. Preview styles respect reduced motion. Tab order follows mounted controls; section/error navigation focuses explicitly, autosave/query refresh does not. Ctrl/Cmd+Enter opens Review and never starts work (`packages/web/src/routes/play.tsx`, `packages/web/src/subtitles/style-preview.tsx`).

## Copy

New run; Content; Outputs; Style; Review; Continue to…; This run; Start run/Queue N videos. Setup state never claims video-generation percentage. Unknown prices and actual-cost caveats remain visible. Narration source explanations distinguish silent MP4, combined WAV and individual outputs (`packages/web/src/play/sections.ts`, `packages/web/src/play/setup-summary.tsx`, `packages/web/src/play/review-section.tsx`).

## Not in play

Template capture and schedule management live on their own routes. Existing-project Save and Rebuild live on the project route. Preview and draft persistence do not call generation providers (`packages/web/src/router.tsx:55-65`, `packages/web/src/routes/play.tsx`, `packages/web/src/play/output-preview.tsx`).
