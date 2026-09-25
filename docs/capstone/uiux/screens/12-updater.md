---
generated_at_commit: 7bdb84e3f57e
generated_date: '2026-09-25'
capstone_version: 5.2.0
content_hash: 0c058efcc06e
paths_covered:
  - :(top)packages/web/src/updates/**
  - :(top)packages/web/src/components/shell.tsx
  - :(top)packages/web/src/components/version-prompt.tsx
---

# Updater

## Mode & job

App-wide Operate control for checking npm availability, installing an available Slopify update and recovering the browser after the local server restarts. It sits inline in the sticky header on every routed screen, between the support links and the Tutorial button (`packages/web/src/components/shell.tsx`, `packages/web/src/updates/widget.tsx`).

## Composition

The visible surface is a 32 px square header button (radius 4) containing only the 16 px two-arrow refresh glyph. An 8 px running-lamp dot appears at its top-right corner when an update is available. The `title` and accessible name report the installed version, installed-versus-newest versions and the current action/status. Keyboard focus uses the shared visible outline; an off-screen live region repeats the full state (`packages/web/src/updates/widget.tsx`).

## States

Idle click performs a fresh availability check. When an installable update is already known, click starts installation; discovering one during a check does not install on the same click. Checking, installing and restart recovery disable duplicate clicks. Busy projects and server block reasons remain in the title/action label. Errors tint the glyph amber and use an off-screen alert (`packages/web/src/updates/widget.tsx`).

The query polls every fifteen minutes and on window focus. Installing/restarting status uses the shorter reconnect interval. A persisted install/restart status recovers without a local mutation record; timeout reports that the update did not finish. Activation of a different current version reloads once, while an idle/error response at the accepted version clears the Updating state (`packages/web/src/updates/use-update.ts`).

A separate build-version prompt appears when an API response announces a different web build and offers Reload (`packages/web/src/components/version-prompt.tsx`).

## Motion

The arrows spin while checking or updating; `motion-reduce` removes the spin. Nothing else moves; the button keeps its header slot in every state (`packages/web/src/updates/widget.tsx`).

## Copy

The accessible sentence is `Slopify updates: <versions>. <action>`. Action text distinguishes checking, updating, reconnecting, blocked state, errors, click-to-check and click-to-install (`packages/web/src/updates/widget.tsx`).

## Not in play

There is no popover, progress panel, release-note viewer, floating control or automatic install on discovery. The browser control cannot update while the server reports running work (`packages/web/src/updates/widget.tsx`).
