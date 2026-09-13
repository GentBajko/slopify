---
generated_at_commit: 7bdb84e3f57e
generated_date: '2026-09-13'
capstone_version: 5.2.0
content_hash: 0c058efcc06e
paths_covered:
  - :(top)packages/web/src/updates/**
  - :(top)packages/web/src/components/shell.tsx
  - :(top)packages/web/src/components/version-prompt.tsx
---

# Updater

## Mode & job

App-wide Operate control for checking npm availability, installing an available Slopify update and recovering the browser after the local server restarts. It stays mounted beside every routed screen (`packages/web/src/components/shell.tsx:153-171`, `packages/web/src/updates/widget.tsx:6-62`).

## Composition

The visible surface is a fixed 40 px circular hit area containing only the two-arrow refresh glyph. A 6 px green dot appears when an update is available. Hover text and the accessible name report the installed version, installed-versus-newest versions and the current action/status. The control floats 20 px from the lower-right viewport edge and moves above the footer with a 12 px gap when the footer enters view (`packages/web/src/updates/widget.tsx:12-60`, `packages/web/src/updates/footer-offset.ts:3-30`).

The shell reserves bottom padding for the control. Keyboard focus uses the shared visible accent outline; the icon-only button exposes the full state in `aria-label` and `title` (`packages/web/src/components/shell.tsx:153-164`, `packages/web/src/updates/widget.tsx:30-49`).

## States

Idle click performs a fresh availability check. When an installable update is already known, click starts installation; discovering one during a check does not install on the same click. Checking, installing and restart recovery disable duplicate clicks. Busy projects and server block reasons remain in the tooltip/action label. Errors use amber glyph text and an off-screen alert (`packages/web/src/updates/widget.tsx:10-62`).

The query polls every fifteen minutes and on window focus. Installing/restarting status uses the shorter reconnect interval. A persisted install/restart status recovers without a local mutation record; timeout reports that the update did not finish. Activation of a different current version reloads once, while an idle/error response at the accepted version clears the Updating state (`packages/web/src/updates/use-update.ts:23-137`).

A separate build-version prompt appears when an API response announces a different web build and offers Reload (`packages/web/src/components/version-prompt.tsx`).

## Motion

The arrows spin while checking or updating; `motion-reduce` removes the spin. Footer avoidance follows scroll, resize and body-size changes through `requestAnimationFrame` measurement (`packages/web/src/updates/widget.tsx:43-46`, `packages/web/src/updates/footer-offset.ts:5-29`).

## Copy

The accessible sentence is `Slopify updates: <versions>. <action>`. Action text distinguishes checking, updating, reconnecting, blocked state, errors, click-to-check and click-to-install (`packages/web/src/updates/widget.tsx:13-29`).

## Not in play

There is no popover, progress panel, release-note viewer or automatic install on discovery. The browser control cannot update while the server reports running work (`packages/web/src/updates/widget.tsx:10-38`).
