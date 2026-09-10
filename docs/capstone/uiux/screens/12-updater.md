---
generated_at_commit: f4d66867e39f
generated_date: 2026-09-10
content_hash: accbad5ecbe4
paths_covered:
  - ":(top)packages/web/src/**"
  - ":(top)packages/site/**"
---

# Updater

## Mode & job
Operate overlay/control family for checking and applying a Slopify update. Source: packages/web/src/updates/widget.tsx:1-220; packages/web/src/updates/api.ts:1-120.

## Composition
The floating control shows only two circular arrows, with no visible button background or border. A small dot appears when an update is available and installation is inactive. It retains a 40-pixel hit area, accessible status label, focus outline and tooltip. The control opens a status panel with current/latest version, availability, check-again, and explicit update actions. Source: packages/web/src/updates/widget.tsx:1-220.

## States
Idle, checking, available, installing/restarting, unavailable, blocked, and error responses are represented by the updater API model and widget. Source: packages/app/src/updater/model.ts:1-27; packages/web/src/updates/widget.tsx:1-220.

## Motion
The same circular arrows spin during installation; reduced-motion disables the spin. Source: packages/web/src/updates/widget.tsx:1-220.

## Copy
The control uses explicit Check again and Update Slopify actions and displays blocked/error detail from the server response. Source: packages/web/src/updates/widget.tsx:1-220; packages/app/src/updater/model.ts:3-18.

## Not in play
Permission-denied is represented by the server API rather than a dedicated widget state. Source: packages/app/src/edge/http/update.ts:17-29.

A successful idle response clears the local Updating state even if the server version is unchanged (for example after a same-version restart). A changed activated version still requests one reload; the local update flag is cleared before that request.
