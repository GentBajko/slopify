---
generated_at_commit: 7bdb84e3f57e
generated_date: '2026-09-13'
capstone_version: 5.2.0
content_hash: d39a1574e067
paths_covered:
  - :(top)packages/web/src/routes/templates.tsx
  - :(top)packages/web/src/templates/**
  - :(top)packages/web/src/project/save-template.tsx
  - :(top)packages/web/src/router.tsx
---

# Templates

## Mode & job

Operate surface at `/templates` for saving an acknowledged Play draft as a reusable setup, applying a versioned template into a fresh Play draft and deleting a template. Applying opens the new draft on Play for review and does not start generation (`packages/web/src/router.tsx:55-85`, `packages/web/src/routes/templates.tsx:18-124`).

## Composition

The 1440 px page begins with the Templates title and the explanation that Apply creates a fresh draft. A bounded Save a setup panel selects one saved Play draft and captures a template name. Below it, a rail-style list shows template name, version and updated time with Apply to Play and Delete actions (`packages/web/src/routes/templates.tsx:134-199`, `packages/web/src/routes/templates.tsx:227-271`).

The project page also exposes Save as template for its displayed revision; listing and application remain on this route (`packages/web/src/project/save-template.tsx`).

## States

Draft and template queries each render loading, failure with Retry and empty states. Pending actions disable relevant controls. A pending or uncertain Play Start blocks Apply and explains the refusal. Successful save/delete uses a status message; apply failures retain the page and expose the error (`packages/web/src/routes/templates.tsx:42-124`, `packages/web/src/routes/templates.tsx:197-235`).

Delete opens a confirmation dialog stating that existing projects and drafts keep their setup. Repeated application of the same template version reuses its request identity until navigation succeeds (`packages/web/src/routes/templates.tsx:98-124`, `packages/web/src/routes/templates.tsx:275-287`).

## Motion

No route-specific authored motion is implemented. Applying navigates to Play only after the new draft has been acknowledged, loaded and confirmed current (`packages/web/src/router.tsx:66-84`, `packages/web/src/routes/templates.tsx:84-124`).

## Copy

Primary labels are Templates, Save a setup, Save template and Apply to Play. Explanatory copy repeats that saved setups include checkpoint choices and require review before Start (`packages/web/src/routes/templates.tsx:134-151`, `packages/web/src/routes/templates.tsx:237-271`).

## Not in play

Templates contain setup snapshots rather than project outputs or execution state. Scheduling a template lives on `/schedules`; editing the applied setup lives on Play (`packages/web/src/router.tsx:55-85`, `packages/web/src/routes/templates.tsx:136-140`).
