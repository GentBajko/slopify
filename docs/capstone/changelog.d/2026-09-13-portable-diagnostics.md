---
date: 2026-09-13
kind: feature
---

# Portable backups, storage accounting and diagnostics

Settings now exposes a credential-free Slopify backup export/import, explicit orphan-file
cleanup, aggregate and per-project disk usage, and a downloadable secret-free diagnostics
bundle. Backups include templates, prompts, voices, settings and staged assets; provider keys,
telemetry and existing projects are left out. The boot migration expectation and focused tests
cover schema version 9 and restore behavior.
