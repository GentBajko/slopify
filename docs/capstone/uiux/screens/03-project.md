---
generated_at_commit: 3a9796eb7fec
generated_date: 2026-09-10
content_hash: 40c8389cfe58
paths_covered:
  - ":(top)packages/web/src/**"
  - ":(top)packages/site/**"
---

# Project workspace

## Mode & job
Operate surface for monitoring a project, reviewing outputs, and editing controls. Source: packages/web/src/routes/project.tsx:27-79.

## Composition
The workspace centers the selected output/player and keeps stage navigation, rundown, live output, run settings, subtitle editing, and action controls around it. The final output chooses video, audio export, or article. Source: packages/web/src/routes/project.tsx:31-208; packages/web/src/project/.

## States
Loading skeleton, live stage progress, finished/failed/canceled status, pause/resume, retry, provider changes, subtitle save, output replacement, and retained prior output are represented by route and project components. Source: packages/web/src/routes/project.tsx:79-208; packages/web/src/routes/project-live.test.tsx; packages/web/src/routes/project-controls.test.tsx; packages/web/src/routes/project-subtitles.test.tsx.

## Motion
Live writing/audio and SSE state changes update the workspace. Source: packages/web/src/project/live-writing.tsx; packages/web/src/project/live-audio.test.tsx; packages/web/src/project/live.test.ts.

## Copy
The route composes project title, stage labels, output actions, and failure recovery messages from child components. Source: packages/web/src/routes/project.tsx:31-208.

## Not in play
The route does not render a separate permission-denied screen. Source: packages/web/src/routes/project.tsx:27-208.
