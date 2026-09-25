---
generated_at_commit: 7bdb84e3f57e
generated_date: '2026-09-25'
capstone_version: 5.2.0
content_hash: d39a1574e067
paths_covered:
  - :(top)packages/web/src/routes/library.tsx
  - :(top)packages/web/src/routes/templates.tsx
  - :(top)packages/web/src/templates/**
  - :(top)packages/web/src/project/save-template.tsx
  - :(top)packages/web/src/router.tsx
---

# Templates

## Mode & job

Operate surface, the Library's Templates tab at `/templates`, for saving an acknowledged Play draft as a reusable setup, applying a versioned template into a fresh Play draft and deleting a template. Applying opens the new draft on Play for review and does not start generation (`packages/web/src/router.tsx`, `packages/web/src/routes/templates.tsx`).

## Composition

The Library page bar and tab links sit above the tab. Its LibraryToolbar holds one line (Apply creates a fresh draft to review) and Save a setup at right. Under it one StatusSlot (loading, list or apply errors) beside Refresh templates, then the templates as rows in one bordered list: name, version and updated date, Apply to Play and Delete (`packages/web/src/routes/templates.tsx`).

Save a setup opens a narrow Drawer with a saved Play draft select and a template name; its pinned footer holds a StatusSlot (Saving… or the error) and Save template.

The project page also exposes Save as template for its displayed revision; listing and application remain on this tab (`packages/web/src/project/save-template.tsx`).

## States

Draft and template queries each render loading, failure with a reload action and empty states. Pending actions disable relevant controls. A pending or uncertain Play Start blocks Apply. Successful save and delete are toasts ("Template saved.", "Template deleted."); apply failures keep the page and show in the StatusSlot (`packages/web/src/routes/templates.tsx`).

Delete opens a confirmation dialog stating that existing projects and drafts keep their setup. Repeated application of the same template version reuses its request identity until navigation succeeds (`packages/web/src/routes/templates.tsx`).

## Motion

The drawer enters with the 150 ms tick-in. Applying navigates to Play only after the new draft has been acknowledged, loaded and confirmed current (`packages/web/src/router.tsx`, `packages/web/src/routes/templates.tsx`).

## Copy

Primary labels are Templates, Save a setup, Save template, Apply to Play and Delete template. Explanatory copy says saved setups include checkpoint choices and require review before Start (`packages/web/src/routes/templates.tsx`).

## Not in play

Templates contain setup snapshots rather than project outputs or execution state. Scheduling a template lives on the Schedules tab; editing the applied setup lives on Play (`packages/web/src/router.tsx`, `packages/web/src/routes/templates.tsx`).
