---
generated_at_commit: 7bdb84e3f57e
generated_date: '2026-09-13'
capstone_version: 5.2.0
content_hash: d2a908ae5e6d
paths_covered:
  - :(top)packages/web/src/routes/entry-editor.tsx
  - :(top)packages/web/src/components/editor-actions.tsx
  - :(top)packages/web/src/components/editor-states.tsx
  - :(top)packages/web/src/components/slot-body.tsx
  - :(top)packages/web/src/components/detected-slots.tsx
  - :(top)packages/web/src/lib/draft-lint.ts
---

# Entry editor

## Mode & job
Operate surface for editing and deleting one intro/outro entry. Source: packages/web/src/routes/entry-editor.tsx:33-34,138-264.

## Composition
The editor heading, back link, category/mode controls, name/body fields, slot notices, Save, and Delete actions form a single column. Source: packages/web/src/routes/entry-editor.tsx:138-264.

## States
Loading, validation/slot notices, save pending/error, and delete confirmation are represented. Source: packages/web/src/routes/entry-editor.tsx:138-264.

## Motion
No route-specific motion found. Source: packages/web/src/routes/entry-editor.tsx:33-264.

## Copy
The heading is derived from entry state and delete confirmation names the draft. Source: packages/web/src/routes/entry-editor.tsx:138,247.

## Not in play
Offline and permission-denied states are not rendered. Source: packages/web/src/routes/entry-editor.tsx:33-264.
