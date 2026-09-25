---
absorbed_from:
  - features/2026-09-24-narration-preparation@2026-09-24
generated_at_commit: 7bdb84e3f57e
generated_date: '2026-09-25'
capstone_version: 5.2.0
content_hash: 31fdc6e29ada
paths_covered:
  - :(top)packages/web/src/components/kit/page-bar.tsx
  - :(top)packages/web/src/routes/prompt-editor.tsx
  - :(top)packages/web/src/components/editor-actions.tsx
  - :(top)packages/web/src/components/editor-states.tsx
  - :(top)packages/web/src/components/slot-body.tsx
  - :(top)packages/web/src/components/detected-slots.tsx
  - :(top)packages/web/src/lib/draft-lint.ts
---

# Prompt editor

## Mode & job
Operate surface for creating, duplicating, editing and deleting one prompt. Header navigation keeps Library lit (`packages/web/src/routes/prompt-editor.tsx`, `packages/web/src/components/shell.tsx`).

## Composition
A PageBar with the "< Prompts" back link (returning to the prompt's kind) and the New prompt or Edit prompt title. The sheet holds Name beside the Kind switch, then Body with detected-slot notices; a detected-slots aside sits beside the sheet on wide screens. The EditorActions bar is sticky at the viewport bottom: Delete at left (its place kept, hidden, before a row exists), one StatusSlot (the error, the Saved tick, or the reason Save is held), then Cancel and Save (`packages/web/src/routes/prompt-editor.tsx`, `packages/web/src/components/editor-actions.tsx`).

Narration Preparation shows Use Documentary Starter on the Body label's own row, so switching Kind never moves the body. It fills only the unsaved body; replacing nonempty text requires confirmation. Cancel keeps the original text and Save remains explicit. The starter describes cue-only documentary delivery, not article rewriting (`packages/web/src/routes/prompt-editor.tsx`, `packages/web/src/lib/narration-starter.ts`).

## States
Loading, validation/slot notices, save pending/error, held Save (`aria-disabled` with the reason described by the status slot) and delete confirmation are represented (`packages/web/src/routes/prompt-editor.tsx`, `packages/web/src/components/editor-actions.tsx`).

## Motion
No route-specific motion found (`packages/web/src/routes/prompt-editor.tsx`).

## Copy
The title is New prompt or Edit prompt; the delete dialog names the draft; the starter confirmation says nothing is saved until Save (`packages/web/src/routes/prompt-editor.tsx`).

## Not in play
Offline and permission-denied states are not rendered (`packages/web/src/routes/prompt-editor.tsx`).
