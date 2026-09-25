---
host_cli_verified_at_commit: 9bd6517
absorbed_from:
  - features/2026-09-24-host-cli-bridge@2026-09-24
generated_at_commit: 7bdb84e3f57e
generated_date: '2026-09-25'
capstone_version: 5.2.0
content_hash: 6cd8484b5dcf
paths_covered:
  - :(top)packages/web/src/routes/usage.tsx
  - :(top)packages/web/src/routes/settings.tsx
  - :(top)packages/web/src/components/catalogue.tsx
  - :(top)packages/web/src/components/provider-cli.tsx
  - :(top)packages/web/src/components/provider-keys.tsx
  - :(top)packages/web/src/components/voices.tsx
  - :(top)packages/web/src/components/theme.tsx
---

# Settings

## Mode & job
Operate surface for provider readiness/keys, CLI paths, voices, model catalogue, playback and appearance, backups, local storage cleanup and usage. `/settings?section=` picks one of providers, voices, models, playback, storage or usage; the default is providers (`packages/web/src/routes/settings.tsx`, `packages/web/src/router.tsx`).

## Composition
A PageBar titled Settings with Download diagnostics. Below it a left section list (Providers, Voices, Models, Playback & appearance, Backup & storage, Usage; a horizontal scroller below the medium breakpoint) beside one section on screen. Each section opens with a SectionHead whose help sits behind an InfoTip and whose actions sit at its right (`packages/web/src/routes/settings.tsx`, `packages/web/src/components/kit/section-head.tsx`).

Providers are grouped Text, Speech and Images. Each provider is one aligned row: name, lamp and state word, the key field or the command, then actions (`packages/web/src/components/provider-keys.tsx`, `packages/web/src/components/provider-cli.tsx`). Key rows keep Save, a fixed-width Saved tick slot and Remove; Remove is always rendered and disabled without a key. Inworld key help sits behind an InfoTip. CLI rows show the command truncated with the full text on hover; the editable path sits behind Change path (Close path while open) and a fixed-width Saved slot; CLI sign-in help sits behind an InfoTip beside the name.

Backup & storage carries Export backup, Import backup and Clean orphan files in its SectionHead, then stored totals and the five largest projects. Usage is the last section (`UsageBoard`, see `09-usage.md`).

## States
Host-managed Docker CLI rows display read-only commands and "Managed on host"; the sign-in InfoTip explains the host login; no path input/save appears. Native rows keep their path form. Specific login/helper/version failures take precedence over generic missing-executable copy; the state line is `aria-live`. The shared picker/project label helper distinguishes Sign In Required, Host Helper Unavailable, CLI Update Required and CLI Missing (`packages/web/src/components/provider-cli.tsx`, `packages/web/src/lib/provider-status.ts:3`).

Input validation, provider key/path save/remove, readiness errors, voice loading, catalogue loading/error, theme selection, storage calculation and failures are represented inline. Catalogue refresh, backup import and cleanup outcomes are toasts; their errors stay inline under the section (`packages/web/src/routes/settings.tsx`, `packages/web/src/components/catalogue.tsx`, `packages/web/src/components/provider-keys.tsx`).

## Motion
No route-specific authored motion is implemented (`packages/web/src/routes/settings.tsx`).

## Copy
Primary copy is Settings and Download diagnostics; the section list names Providers, Voices, Models, Playback & appearance, Backup & storage and Usage; provider groups read Text, Speech and Images (`packages/web/src/routes/settings.tsx`, `packages/web/src/components/provider-keys.tsx`).

## Not in play
There is no app account login or host-service installer in Settings. Host CLI account/setup failures are displayed here, but their remedies run on the host (`packages/web/src/components/provider-cli.tsx`).
