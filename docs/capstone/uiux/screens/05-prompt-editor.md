---
generated_at_commit: 7bdb84e3f57e
generated_date: '2026-09-13'
capstone_version: 5.2.0
content_hash: 31fdc6e29ada
paths_covered:
  - :(top)packages/web/src/routes/prompt-editor.tsx
  - :(top)packages/web/src/components/editor-actions.tsx
  - :(top)packages/web/src/components/editor-states.tsx
  - :(top)packages/web/src/components/slot-body.tsx
  - :(top)packages/web/src/components/detected-slots.tsx
  - :(top)packages/web/src/lib/draft-lint.ts
---

# Prompt editor

## Mode & job
Operate surface for editing and deleting one prompt. Source: packages/web/src/routes/prompt-editor.tsx:34-35,154-270.

## Composition
The editor heading and back link precede name/body fields, detected-slot notices, Save, and Delete in a single editor column. Source: packages/web/src/routes/prompt-editor.tsx:154-270.

## States
Loading, validation/slot notices, save pending/error, and delete confirmation are represented. Source: packages/web/src/routes/prompt-editor.tsx:154-270.

## Motion
No route-specific motion found. Source: packages/web/src/routes/prompt-editor.tsx:34-270.

## Copy
The heading is derived from prompt kind and the delete dialog names the draft. Source: packages/web/src/routes/prompt-editor.tsx:154,253.

## Not in play
Offline and permission-denied states are not rendered. Source: packages/web/src/routes/prompt-editor.tsx:34-270.
