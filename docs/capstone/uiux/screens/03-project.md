---
generated_at_commit: f4d66867e39f
generated_date: 2026-09-10
content_hash: accbad5ecbe4
paths_covered:
  - ":(top)packages/web/src/**"
  - ":(top)packages/site/**"
---

# Project workspace

## Mode & job
Operate surface for monitoring a project, reviewing outputs, and editing controls. Source: packages/web/src/routes/project.tsx:27-79.

## Composition

Subtitle preparation is labeled separately from WAV encoding. Editing subtitle files on an unchanged audio-only project retains its WAV and updates only caption outputs.

When subtitle alignment recovers from a short missing passage, the final output shows a persistent expandable review note with each timestamp and unmatched transcript passage. Caption downloads remain available; the note explicitly says the audio is unchanged.

Every output Download action has an adjacent Open folder button, including the image archive and subtitle downloads. It opens the saved output directory on the server machine through its native file manager (Windows Explorer, including WSL; Finder; or Linux xdg-open). Pending state disables the folder action; failures appear inline and leave Download available. The API accepts an existing project asset, never an arbitrary client-supplied path.

Narration chunking offers Whole, Paragraph, Every N words and Every N characters. The selected counted mode displays a numeric field; character mode explains sentence boundaries and oversized-sentence behavior. Options wrap at narrow widths (`packages/web/src/play/chunking.tsx:7`).

The workspace centers the selected output/player and keeps stage navigation, rundown, live output, run settings, subtitle editing, and action controls around it. The final output chooses video, audio export, or article. Source: packages/web/src/routes/project.tsx:31-208; packages/web/src/project/.

## States
Loading skeleton, live stage progress, finished/failed/canceled status, pause/resume, retry, provider changes, subtitle save, output replacement, and retained prior output are represented by route and project components. Source: packages/web/src/routes/project.tsx:79-208; packages/web/src/routes/project-live.test.tsx; packages/web/src/routes/project-controls.test.tsx; packages/web/src/routes/project-subtitles.test.tsx.

## Motion
Live writing/audio and SSE state changes update the workspace. Source: packages/web/src/project/live-writing.tsx; packages/web/src/project/live-audio.test.tsx; packages/web/src/project/live.test.ts.

## Copy
The route composes project title, stage labels, output actions, and failure recovery messages from child components. Source: packages/web/src/routes/project.tsx:31-208.

## Not in play
The route does not render a separate permission-denied screen. Source: packages/web/src/routes/project.tsx:27-208.
