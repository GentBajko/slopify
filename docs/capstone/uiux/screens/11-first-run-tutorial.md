---
generated_at_commit: 7bdb84e3f57e
generated_date: '2026-09-25'
capstone_version: 5.2.0
content_hash: 8fd18b27d198
paths_covered:
  - :(top)packages/web/src/tutorial/**
  - :(top)packages/web/src/components/notice.tsx
  - :(top)packages/web/src/components/shell.tsx
  - :(top)packages/app/src/slices/settings/tutorial*
absorbed_from:
  - features/2026-09-10-play-redesign-drafts@2026-09-13
---

# First-run and tutorial

## Mode & job

An initial notice gates first use; a spotlight guide explains actual Settings, prompt editor, Play and project controls. The guide starts from the header's Tutorial "?" button or the empty Projects invite, has 20 steps and uses stable IDs for persistence rather than storing an array position (`packages/web/src/components/notice.tsx`, `packages/web/src/tutorial/launcher.tsx`, `packages/web/src/tutorial/model.ts`, `packages/app/src/slices/settings/tutorial-schema.ts`).

## Composition

Spotlight geometry leaves the target accessible and darkens surrounding content. The guide shows title, progress, explanation, Back/Next and explicit finish/close actions. Settings steps open the providers section (voice step: the voices section) before measuring. Play steps reveal the Content, Outputs or Style tab and any disclosure, or open the Review drawer for Start, before measuring the target; the drawer is non-modal, so the spotlight can point into it (`packages/web/src/tutorial/runner.tsx`, `packages/web/src/tutorial/spotlight.tsx`, `packages/web/src/components/kit/drawer.tsx`).

## States

The server stores a versioned cursor, resource IDs and readiness data in settings. Client restore converts the stable ID to the current step and revalidates referenced prompts/project. Progress writes serialize with CAS and preserve later local events; failed writes expose retry. Unreadable progress offers explicit reset rather than silent loss (`packages/app/src/slices/settings/tutorial.ts:48`, `packages/web/src/tutorial/use-session.ts`, `packages/web/src/tutorial/session-api.ts`).

Provider/voice loading failures, save-required prompt steps and incomplete controls keep explanatory readiness states visible. Audio Off permits continuing past optional subtitles; unfinished font recovery remains a real Play control. Project-created events that arrive during restore are retained. On the project page the guide selects the Output tab (and the final output stage for the download step) (`packages/web/src/tutorial/step-content.tsx`, `packages/web/src/tutorial/use-session.ts`, `packages/web/src/routes/project.tsx`).

## Motion

Spotlight geometry tracks the visible target and handles unavailable anchors. Reveal opens the required Settings section, Play tab, drawer or disclosure before target measurement. Restoration and Back/Next keep the cursor aligned with real controls (`packages/web/src/tutorial/spotlight-geometry.ts`, `packages/web/src/tutorial/use-spotlight-measurement.ts`, `packages/web/src/tutorial/runner.tsx`).

## Copy

Progress remains N of 20. Play wording follows Content/Outputs/Style and the Review drawer; subtitle styling is step 17, and step 18 explains review and explicit Start. Step 19 targets the project page bar, status line and rundown strip; its copy names Pause, the Edit tab (Edit project, Save changes, Rebuild affected outputs), the History tab and Retry stage's menu. Finish without generating is an available outcome (`packages/web/src/tutorial/model.ts`, `packages/web/src/tutorial/step-content.tsx`).

## Not in play

No credentials, font bytes or full Play form are tutorial progress. The guide never starts a project or generates subtitles/providers; execution still requires the user's explicit reviewed Start. First-run notice behavior is separate from saved tutorial state.
