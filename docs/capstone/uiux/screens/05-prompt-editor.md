---
generated_at_commit: 3a9796eb7fec
generated_date: 2026-09-10
content_hash: 40c8389cfe58
paths_covered:
  - ":(top)packages/web/src/**"
  - ":(top)packages/site/**"
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
