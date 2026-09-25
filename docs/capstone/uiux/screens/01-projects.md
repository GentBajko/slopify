---
generated_at_commit: 7bdb84e3f57e
generated_date: '2026-09-25'
capstone_version: 5.2.0
content_hash: bd93047e0309
paths_covered:
  - :(top)packages/web/src/routes/projects.tsx
  - :(top)packages/web/src/components/rail.tsx
  - :(top)packages/web/src/components/confirm.tsx
  - :(top)packages/web/src/events.ts
  - :(top)packages/web/src/router.tsx
  - :(top)packages/web/src/components/batch-queue.tsx
---

# Projects

## Mode & job
Operate surface for selecting, creating, and deleting projects. Run configuration lives on Play and project detail lives at `/projects/$projectId` (`packages/web/src/routes/projects.tsx`, `packages/web/src/router.tsx`).

## Composition
A PageBar titled Projects carries the accent New run action. Under it the batch queue, when a batch is waiting, is a compact rail headed "Video queue · N remaining" with its help behind an InfoTip and a short scrollable list (`packages/web/src/components/batch-queue.tsx`). A rundown-style project list follows. Each row links to the project and exposes Delete in an overflow menu; running rows show a meter; narrow rows collapse prompt and timestamp fields while retaining status (`packages/web/src/routes/projects.tsx`).

## States
Loading uses six rundown-shaped skeleton rows; empty data shows the tutorial invite and No projects yet with a Play link. Query and delete errors render inline in red. Running rows disable Delete and explain that the run must be canceled first; confirmation states that project files are deleted (`packages/web/src/routes/projects.tsx`).

## Motion
No route-specific authored motion is implemented (`packages/web/src/routes/projects.tsx`).

## Copy
Primary labels are Projects and New run. Destructive confirmation asks `Delete "<title>"?` and names the file consequence (`packages/web/src/routes/projects.tsx`).

## Not in play
Permission-denied, filtering and pagination states are absent (`packages/web/src/routes/projects.tsx`).
