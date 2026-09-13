---
generated_at_commit: 89db8f6d8981
generated_date: '2026-09-13'
content_hash: 2b9dab9b7f7b
paths_covered:
  - :(top)packages/app/src/slices/play-drafts/**
  - :(top)packages/app/src/slices/storage/**
  - :(top)packages/app/src/slices/settings/tutorial*
  - :(top)packages/web/src/play/**
  - :(top)packages/web/src/routes/play.tsx
  - :(top)packages/web/src/subtitles/**
  - :(top)packages/web/src/tutorial/**
absorbed_from:
  - features/2026-09-10-play-redesign-drafts@2026-09-13
---

# First-run and tutorial

## Mode & job

An initial notice gates first use; a spotlight guide explains actual Settings, prompt editor, Play and project controls. The guide has20 steps and uses stable IDs for persistence rather than storing an array position (`packages/web/src/components/notice.tsx`, `packages/web/src/tutorial/model.ts:17`, `packages/app/src/slices/settings/tutorial-schema.ts`).

## Composition

Spotlight geometry leaves the target accessible and darkens surrounding content. The guide shows title, progress, explanation, Back/Next and explicit finish/close actions. Play steps reveal Content (project/article/keywords), Outputs (audio/images/video), Style (subtitles) and Review (Start) before measuring the target (`packages/web/src/tutorial/runner.tsx`, `packages/web/src/tutorial/model.ts:115`, `packages/web/src/tutorial/spotlight.tsx`).

## States

The server stores a versioned cursor, resource IDs and readiness data in settings. Client restore converts the stable ID to the current step and revalidates referenced prompts/project. Progress writes serialize with CAS and preserve later local events; failed writes expose retry. Unreadable progress offers explicit reset rather than silent loss (`packages/app/src/slices/settings/tutorial.ts:48`, `packages/web/src/tutorial/use-session.ts:8`, `packages/web/src/tutorial/session-api.ts`).

Provider/voice loading failures, save-required prompt steps and incomplete controls keep explanatory readiness states visible. Audio Off permits continuing past optional subtitles; unfinished font recovery remains a real Play control. Project-created events that arrive during restore are retained (`packages/web/src/tutorial/step-content.tsx`, `packages/web/src/tutorial/use-session.ts:8`).

## Motion

Spotlight geometry tracks the visible target and handles unavailable anchors. Reveal opens the required Play section/disclosure before target measurement. Restoration and Back/Next keep the cursor aligned with real controls (`packages/web/src/tutorial/spotlight-geometry.ts`, `packages/web/src/tutorial/use-spotlight-measurement.ts`, `packages/web/src/tutorial/runner.tsx`).

## Copy

Progress remains N of20. Play wording follows Content/Outputs/Style/Review; subtitle styling is step17, and step18 explains review and explicit Start. Finish without generating is an available outcome (`packages/web/src/tutorial/model.ts:17`, `packages/web/src/tutorial/step-content.tsx`).

## Not in play

No credentials, font bytes or full Play form are tutorial progress. The guide never starts a project or generates subtitles/providers; execution still requires the user's explicit reviewed Start. First-run notice behavior is separate from saved tutorial state.
