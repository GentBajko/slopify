---
generated_at_commit: 3a9796eb7fec
generated_date: 2026-09-10
content_hash: 40c8389cfe58
paths_covered:
  - ":(top)packages/web/src/**"
  - ":(top)packages/site/**"
---

# First-run and tutorial

## Mode & job
Operate overlay family that gates first use and guides Settings, prompt editors, Play, and the first project. Source: packages/web/src/components/notice.tsx:1-120; packages/web/src/tutorial/runner.tsx:1-181.

## Composition
The notice overlays the application until dismissed; the tutorial uses a Spotlight anchored to named controls and shows title, step progress, content, Back/Next, and skip/close actions. Source: packages/web/src/components/notice.tsx:1-120; packages/web/src/tutorial/runner.tsx:147-181.

## States
Notice gating, provider/voice loading errors, disabled Next while readiness conditions are unmet, save-required editor steps, and final Finish tutorial/skip actions are rendered. Source: packages/web/src/tutorial/runner.tsx:101-181.

## Motion
Spotlight geometry follows the current target and supports missing anchors through tutorial spotlight components. Source: packages/web/src/tutorial/spotlight.tsx; packages/web/src/tutorial/spotlight-geometry.ts.

## Copy
Progress reads “N of N · First project”; save and Play steps name the required action. Source: packages/web/src/tutorial/runner.tsx:150-167.

## Not in play
Tutorial does not generate providers or write browser storage. Source: packages/web/src/tutorial/context.tsx:20-35.
