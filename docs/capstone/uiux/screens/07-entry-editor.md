---
generated_at_commit: 3a9796eb7fec
generated_date: 2026-09-10
content_hash: 40c8389cfe58
paths_covered:
  - ":(top)packages/web/src/**"
  - ":(top)packages/site/**"
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
