---
absorbed_from:
  - features/2026-09-24-narration-preparation@2026-09-24
generated_at_commit: 7bdb84e3f57e
generated_date: '2026-09-25'
capstone_version: 5.2.0
content_hash: 2f3ace833a00
paths_covered:
  - :(top)packages/web/src/routes/library.tsx
  - :(top)packages/web/src/routes/prompts.tsx
  - :(top)packages/web/src/components/rail.tsx
  - :(top)packages/web/src/components/confirm.tsx
---

# Prompts

## Mode & job
Operate surface, the Library's Prompts tab at `/prompts?kind=`, for browsing, creating, duplicating and deleting Article, Image, Thumbnail and Narration Preparation prompts (`packages/web/src/routes/prompts.tsx`, `packages/web/src/routes/library.tsx`).

## Composition
The Library page bar and tab links sit above the tab. Its LibraryToolbar holds the kind switch (a toggle group that wraps at narrow widths) at left and New prompt at right. Prompt rows follow; each row links to the editor from its name, and its overflow menu holds Edit, Duplicate and Delete (`packages/web/src/routes/prompts.tsx`).

## States
Loading skeleton rows, query errors in a rail, the empty kind (one teaching line, no action of its own because New prompt is already in the toolbar), prompt rows and delete confirmation are rendered (`packages/web/src/routes/prompts.tsx`).

## Motion
No route-specific motion found (`packages/web/src/routes/prompts.tsx`).

## Copy
The page title is Library; the tab is Prompts. The empty kind reads `No <kind> prompts yet.` and explains keyword slots; delete confirmation names the selected prompt (`packages/web/src/routes/prompts.tsx`).

## Not in play
Offline and permission-denied states are not rendered here (`packages/web/src/routes/prompts.tsx`).
