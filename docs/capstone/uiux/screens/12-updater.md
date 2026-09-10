---
generated_at_commit: f4d66867e39f
generated_date: 2026-09-10
content_hash: accbad5ecbe4
paths_covered:
  - ":(top)packages/web/src/**"
  - ":(top)packages/site/**"
---

# Updater

## Composition and action
The floating control contains two circular arrows and an availability dot. Its 40-pixel hit area has no visible background or border. Clicking checks the registry when no update is known; clicking a known installable update starts its download and installation directly. Discovering an update during a manual check does not install it on that same click. There is no popover (`packages/web/src/updates/widget.tsx`).

Hover text and the accessible label show the installed version, installed-versus-newest versions when applicable, and progress, blocked or error details. Checking and installation prevent duplicate clicks. Background polling remains every fifteen minutes, with rapid reconnection polling during installation (`updates/use-update.ts`).

## Placement and motion
The control floats 20 pixels above the viewport bottom until the footer enters view, then lifts to leave a 12-pixel gap above it. Scroll, resize and body-size changes recalculate placement. Main-content bottom padding keeps the final card clear too (`updates/footer-offset.ts`, `components/shell.tsx`). The arrows spin during checking and installation, respecting reduced motion.

## Completion
An idle server response clears the local Updating state even when its version is unchanged. A changed, activated version requests one reload. Failed installation remains visible in the tooltip and accessible alert; blocked updates explain the restriction and clicks only recheck availability.
