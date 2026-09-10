---
generated_at_commit: 3a9796eb7fec
generated_date: 2026-09-10
content_hash: 40c8389cfe58
paths_covered:
  - ":(top)packages/web/src/**"
  - ":(top)packages/site/**"
---

# Projects

## Mode & job
Operate surface for selecting, creating, and deleting projects. Source: packages/web/src/routes/projects.tsx:36-53,104-185.

## Composition
Project heading and rows are the focal content; each row links to the project and exposes overflow actions. Source: packages/web/src/routes/projects.tsx:53-185.

## States
Loading uses six grid-shaped skeleton rows; empty data shows No projects yet with a Play link; query and delete errors render red alerts; running rows disable Delete and say Cancel the run first; confirmation states project files are deleted. Source: packages/web/src/routes/projects.tsx:62-117,168-207.

## Motion
No route-specific authored motion found in this file. Source: packages/web/src/routes/projects.tsx:1-207.

## Copy
Primary heading is Projects; deletion asks Delete "<title>"?. Source: packages/web/src/routes/projects.tsx:53,104.

## Not in play
Offline and permission-denied states are not rendered in this route file. Source: packages/web/src/routes/projects.tsx:36-207.
