---
host_cli_verified_at_commit: 9bd6517
absorbed_from:
  - features/2026-09-24-host-cli-bridge@2026-09-24
generated_at_commit: 7bdb84e3f57e
generated_date: '2026-09-13'
capstone_version: 5.2.0
content_hash: 6cd8484b5dcf
paths_covered:
  - :(top)packages/web/src/routes/settings.tsx
  - :(top)packages/web/src/components/catalogue.tsx
  - :(top)packages/web/src/components/provider-cli.tsx
  - :(top)packages/web/src/components/provider-keys.tsx
  - :(top)packages/web/src/components/voices.tsx
  - :(top)packages/web/src/components/theme.tsx
---

# Settings

## Mode & job
Operate surface for diagnostics, playback, provider readiness/keys, editable CLI paths, voices, catalogue status, appearance, backups and local storage cleanup (`packages/web/src/routes/settings.tsx:40-58`, `packages/web/src/routes/settings.tsx:126-191`, `packages/web/src/components/provider-cli.tsx`, `packages/web/src/components/catalogue.tsx`).

## Composition
The Settings heading and Download diagnostics action lead stacked rails for playback, provider keys/CLI paths, voices, catalogue, appearance and storage tools. Storage tools expose backup import/export, per-project usage and cleanup (`packages/web/src/routes/settings.tsx:40-58`, `packages/web/src/routes/settings.tsx:126-191`, `packages/web/src/routes/settings.tsx:250-350`).

## States
Host-managed Docker CLI rows display read-only commands and “Runs on your host” guidance; no path input/save appears. Native rows retain their existing form. Specific login/helper/version failures take precedence over generic missing-executable copy. The shared picker/project label helper distinguishes Sign In Required, Host Helper Unavailable, CLI Update Required and CLI Missing (`packages/web/src/components/provider-cli.tsx:84`, `packages/web/src/lib/provider-status.ts:3`). This scoped behavior was verified at desktop and 390 px width on 2026-09-24; unrelated chapter coverage keeps its historical stamp.

Input validation, provider key/path save/reset, readiness errors, voice loading, catalogue loading/error/refresh success, theme selection, backup confirmation, storage calculation and cleanup outcomes are represented (`packages/web/src/routes/settings.tsx:76-191`, `packages/web/src/components/provider-cli.tsx`, `packages/web/src/components/provider-keys.tsx`, `packages/web/src/components/catalogue.tsx`).

## Motion
No route-specific authored motion is implemented (`packages/web/src/routes/settings.tsx:40-350`).

## Copy
Primary copy is Settings, Download diagnostics and Storage tools; individual rails name playback, providers, voices, models/request limits and appearance (`packages/web/src/routes/settings.tsx:45-58`, `packages/web/src/routes/settings.tsx:126-191`, `packages/web/src/routes/settings.tsx:264-350`).

## Not in play
There is no app account login or host-service installer in Settings. Host CLI account/setup failures are displayed here, but their remedies run on the host (`packages/web/src/components/provider-cli.tsx:84`).
