---
generated_at_commit: 7bdb84e3f57e
generated_date: '2026-09-13'
capstone_version: 5.2.0
content_hash: bd93047e0309
paths_covered:
  - :(top)packages/web/src/routes/projects.tsx
  - :(top)packages/web/src/components/rail.tsx
  - :(top)packages/web/src/components/confirm.tsx
  - :(top)packages/web/src/events.ts
  - :(top)packages/web/src/router.tsx
---

# Projects

## Mode & job
Operate surface for selecting, creating, and deleting projects. Run configuration lives on Play and project detail lives at `/projects/$projectId` (`packages/web/src/routes/projects.tsx:36-56`, `packages/web/src/router.tsx:43-53`, `packages/web/src/router.tsx:87-91`).

## Composition
The page heading and accent New run action precede a rundown-style project list. Each row links to the project and exposes its Delete action in an overflow menu; narrow rows collapse prompt and timestamp fields while retaining status (`packages/web/src/routes/projects.tsx:24-31`, `packages/web/src/routes/projects.tsx:53-88`, `packages/web/src/routes/projects.tsx:124-185`).

## States
Loading uses six rundown-shaped skeleton rows; empty data shows No projects yet with a Play link. Query and delete errors render inline in red. Running rows disable Delete and explain that the run must be canceled first; confirmation states that project files are deleted (`packages/web/src/routes/projects.tsx:62-117`, `packages/web/src/routes/projects.tsx:168-185`).

## Motion
No route-specific authored motion is implemented (`packages/web/src/routes/projects.tsx:1-185`).

## Copy
Primary labels are Projects and New run. Destructive confirmation asks `Delete "<title>"?` and names the file consequence (`packages/web/src/routes/projects.tsx:53-56`, `packages/web/src/routes/projects.tsx:104-108`).

## Not in play
Permission-denied, filtering and pagination states are absent (`packages/web/src/routes/projects.tsx:36-185`).
