---
generated_at_commit: 7bdb84e3f57e
generated_date: '2026-09-25'
capstone_version: 5.2.0
content_hash: d2a908ae5e6d
paths_covered:
  - :(top)packages/web/src/components/kit/page-bar.tsx
  - :(top)packages/web/src/routes/entry-editor.tsx
  - :(top)packages/web/src/components/editor-actions.tsx
  - :(top)packages/web/src/components/editor-states.tsx
  - :(top)packages/web/src/components/slot-body.tsx
  - :(top)packages/web/src/components/detected-slots.tsx
  - :(top)packages/web/src/lib/draft-lint.ts
---

# Entry editor

## Mode & job
Operate surface for creating, duplicating, editing and deleting one intro/outro entry. Header navigation keeps Library lit (`packages/web/src/routes/entry-editor.tsx`, `packages/web/src/components/shell.tsx`).

## Composition
A PageBar with the "< Intros & Outros" back link (returning to the entry's category) and the New entry or Edit entry title. The sheet holds Name with the Category and Mode switches (the mode hint under Mode), then Body with slot notices. The EditorActions bar is sticky at the viewport bottom: Delete at left (its place kept, hidden, before a row exists), one StatusSlot (the error, the Saved tick, or the reason Save is held), then Cancel and Save (`packages/web/src/routes/entry-editor.tsx`, `packages/web/src/components/editor-actions.tsx`).

## States
Loading, validation/slot notices, save pending/error, held Save and delete confirmation are represented (`packages/web/src/routes/entry-editor.tsx`).

## Motion
No route-specific motion found (`packages/web/src/routes/entry-editor.tsx`).

## Copy
The title is New entry or Edit entry and delete confirmation names the draft (`packages/web/src/routes/entry-editor.tsx`).

## Not in play
Offline and permission-denied states are not rendered (`packages/web/src/routes/entry-editor.tsx`).
