---
absorbed_from:
  - features/2026-09-24-narration-preparation@2026-09-24
generated_at_commit: 7bdb84e3f57e
generated_date: '2026-09-13'
capstone_version: 5.2.0
content_hash: 2f3ace833a00
paths_covered:
  - :(top)packages/web/src/routes/prompts.tsx
  - :(top)packages/web/src/components/rail.tsx
  - :(top)packages/web/src/components/confirm.tsx
---

# Prompts

## Mode & job
Operate surface for browsing, creating, and deleting Article, Image, Thumbnail and Narration Preparation prompts. Source: packages/web/src/routes/prompts.tsx:32-57,125-201.

## Composition
The heading and kind sections lead into prompt rows, new-prompt actions, empty states, and row overflow menus; rows link into the editor. Source: packages/web/src/routes/prompts.tsx:57-201.

The fourth kind wraps with the existing tabs at narrow widths (`packages/web/src/routes/prompts.tsx`).

## States
Loading skeletons, empty kinds, prompt rows, and delete confirmation are rendered. Source: packages/web/src/routes/prompts.tsx:125-201.

## Motion
No route-specific motion found. Source: packages/web/src/routes/prompts.tsx:32-201.

## Copy
The primary heading is Prompts; delete confirmation names the selected prompt. Source: packages/web/src/routes/prompts.tsx:57,125.

## Not in play
Offline and permission-denied states are not rendered here. Source: packages/web/src/routes/prompts.tsx:32-201.
