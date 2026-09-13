key: implement/2026-09-10-review-checkpoints@Q3

- What: Revision-bound review checkpoints let users hold Audio, Images or Video/export until explicit approval while independent work continues.
- Approach: Persist gate closures, reserved work keys, fingerprints and approval receipts in SQLite; enforce them in the runner and expose Play/project controls.
- Approach: Keep Save, gate changes, approval and rebuild as separate transactions so setup never dispatches providers.
- Alternative rejected: Stopping the whole project at a checkpoint would unnecessarily block independent work.
- Alternative rejected: Stage-only matching would block unrelated same-stage recipes, so decisions use reserved work keys.
- Out of scope: Reusable project templates and template lifecycle.
- Out of scope: Scheduled jobs, automatic approvals and arbitrary timeline editing.
- Out of scope: New provider integrations and release publication.
- Tasks: Completed durable schema, closure/fingerprint rules, runner authority, Play binding, HTTP routes, project panel, restart/pause recovery and acceptance coverage.
- Diff: `89db8f6..803bd55` across `packages/app/src/slices/checkpoints/**`, runner/rebuild/admission/control/HTTP integration, migration 0007, Play/project checkpoint UI and acceptance tests; `.github/workflows/ci.yml` and migration inventory updated.
- Chapters refreshed: `01-architecture.md` records the checkpoint slice and runner boundary; `02-models.md` records gate and receipt entities; `04-data-flow.md` records save/approval/recovery flow; `06-testing.md` records acceptance coverage; `07-operations.md` records migration/boot behavior.
- Scenarios absorbed: `logic/23-review-checkpoints.md` defines gate lifecycle, closures, refusal paths, restart and concurrent-edit rules; `logic/04-run-admission.md` and `logic/12-reruns-and-edits.md` record Play and revision integration.
- Screens absorbed: `mockup/06-play.md`, `mockup/08-project.md`, `uiux/screens/02-play.md`, and `uiux/screens/03-project.md` record checkpoint setup, summaries, project approval and reload focus; UIUX README/indexes link scenario 23.
- Review loop: Round 1 confirmed 8 findings fixed in `0f736c3`, `8945747` and `12d012e`; Round 2 confirmed 6 findings fixed in `0413497` and `2fc8b38`; Round 3 confirmed 2 findings fixed in `803bd55`; Round 3 and Round 4 then produced zero new confirmed findings. One Images source hypothesis was refuted. Final verdict: two consecutive dry rounds.
- Verification: Focused checkpoint/project/materialization suites passed 76 tests across 9 files; app, collector and web typechecks passed; backend and web review audits passed. No providers or user projects were used.
