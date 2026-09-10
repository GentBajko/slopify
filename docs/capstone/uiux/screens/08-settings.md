---
generated_at_commit: 3a9796eb7fec
generated_date: 2026-09-10
content_hash: 40c8389cfe58
paths_covered:
  - ":(top)packages/web/src/**"
  - ":(top)packages/site/**"
---

# Settings

## Mode & job
Operate surface for playback, provider readiness/keys, CLI paths, voices, catalogue status, and appearance settings. Source: packages/web/src/routes/settings.tsx:38-50; packages/web/src/components/catalogue.tsx; packages/web/src/components/provider-cli.tsx.

## Composition
The Settings heading leads stacked sections for playback, provider keys/CLI paths, voices, catalogue, and appearance. CatalogueSettings is a bordered Models and request limits panel with explanatory copy, local path, verified date, refresh button, and status/error text. Source: packages/web/src/routes/settings.tsx:38-50; packages/web/src/routes/settings.tsx:50-200.

## States
Input validation, provider key/path save/reset, readiness errors, voice loading, catalogue loading/error/refresh success, and theme selection are represented. Catalogue refresh polls every 30 seconds and invalidates provider-model queries after success. Source: packages/web/src/routes/settings.tsx:38-200; packages/web/src/components/provider-cli.tsx; packages/web/src/components/provider-keys.tsx; packages/web/src/components/catalogue.tsx.

## Motion
No route-specific motion found. Source: packages/web/src/routes/settings.tsx:38-200.

## Copy
The primary heading is Settings; section labels come from the playback, provider, voice, catalogue, and appearance components. Source: packages/web/src/routes/settings.tsx:41-50.

## Not in play
Permission-denied is not rendered. Source: packages/web/src/routes/settings.tsx:38-200.
