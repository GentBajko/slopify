---
absorbed_from:
  - features/2026-09-24-narration-preparation@2026-09-24
generated_at_commit: 7bdb84e3f57e
generated_date: '2026-09-25'
capstone_version: 5.2.0
content_hash: 485e2f1187a0
paths_covered:
  - :(top)packages/site/**
---

# Marketing page

## Mode & job
Persuade surface for the package landing page. Source: packages/site/public/index.html:1-220; packages/site/public/main.js:1-220.

## Composition
The static page opens with positioning, three install options (npx, global npm and the Linux Docker launcher) and copy actions, followed by a real-app showcase recording, live aggregate tally, workflow explanation and footer links (`packages/site/public/index.html:1-220`).

A Docker guide offers the launcher and a separate direct GHCR command, copy controls, localhost binding, restart/data defaults, host-CLI guidance and a README link. Commands wrap on narrow screens without changing the copied string (`packages/site/public/index.html`, `styles.css`, `install.test.js`).

## States
All install commands have clipboard success and blocked-copy fallback states. Live aggregates render numbers or dashes and expose Live/Off status; the static page has no authenticated state (`packages/site/public/main.js:57-82`, `packages/site/public/main.js:142-170`).

## Motion
The showcase autoplays and loops without controls. Reduced-motion holds the poster frame, restores native controls and leaves playback to the visitor; tally changes use a 150 ms opacity fade (`packages/site/public/main.js:120-130`, `packages/site/public/main.js:172-185`).

## Copy
Primary copy states the prompt-to-video outcome, local-key premise, cheeky call to contribute to internet enshittification, and both `npx` and global npm installation paths (`packages/site/public/index.html:1-220`).

## Not in play
Application permission and offline states are not represented by this static site. Source: packages/site/public/index.html:1-220.
