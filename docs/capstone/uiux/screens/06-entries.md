---
generated_at_commit: 7bdb84e3f57e
generated_date: '2026-09-25'
capstone_version: 5.2.0
content_hash: a04caaa062b0
paths_covered:
  - :(top)packages/web/src/routes/library.tsx
  - :(top)packages/web/src/routes/entries.tsx
  - :(top)packages/web/src/components/rail.tsx
  - :(top)packages/web/src/components/confirm.tsx
---

# Intros and outros

## Mode & job
Operate surface, the Library's Intros & Outros tab at `/entries?category=`, for browsing, creating, duplicating and deleting intro/outro entries (`packages/web/src/routes/entries.tsx`, `packages/web/src/routes/library.tsx`).

## Composition
The Library page bar and tab links sit above the tab. Its LibraryToolbar holds the category switch at left and the new-entry action at right. Entry rows show a mode chip; each row links to the entry editor from its name, and its overflow menu holds Edit, Duplicate and Delete (`packages/web/src/routes/entries.tsx`).

## States
Loading skeletons, the empty category (one teaching line, no duplicate action button), mode chips, rows and delete confirmation are rendered (`packages/web/src/routes/entries.tsx`).

## Motion
No route-specific motion found (`packages/web/src/routes/entries.tsx`).

## Copy
The page title is Library; the tab is Intros & Outros; delete confirmation names the selected entry (`packages/web/src/routes/entries.tsx`).

## Not in play
Offline and permission-denied states are not rendered (`packages/web/src/routes/entries.tsx`).
