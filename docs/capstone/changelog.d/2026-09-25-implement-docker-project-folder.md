## 2026-09-25 - implement: Docker Project Folder

key: implement/2026-09-25-docker-project-folder@Q4

- What: managed Linux Docker installations save current and retained project files in an ordinary private host folder, separate from database, credentials, logs and staging.
- Approach: keep the private named volume; bind only projects; serialize typed migration with private receipt/journals, complete SHA-256 verification, atomic publication, verified ownership, bounded health/activation and recoverable replacement.
- Rejected: binding all data exposes private state; export mirroring creates a second incomplete history tree; manual bind/permission setup fails automatic installation; rewriting stored paths widens migration; a host desktop command bridge is unnecessary.
- Out of scope: general sync, remote daemons/NAS, new desktop launchers, treating arbitrary folder edits as inputs, public credentials, provider regeneration, arbitrary host commands, narration and recovery-control changes.
- Task 1: safe project-tree identity, streaming digest, path validation and copy verification.
- Task 2: strict configuration, receipt/journal schemas, private persistence and remembered destination selection.
- Task 3: Docker daemon/volume identity, ownership probe, fixed helper operations, container lifecycle and claims.
- Task 4: journalled migration, retained snapshots, source authority, rollback and committed activation.
- Task 5: packaged locked launcher, argument handling and CLI/helper integration.
- Task 6: verified current/history folder-location API retaining native opening and downloads.
- Task 7: browser host-location display and selectable path, including API-only installations.
- Task 8: packed-package migration/rollback/recreation smoke, CI and consistent native/Docker/site installation guidance.
- Review repairs: exact committed-container authority before restart; source absence/identity/digest preserved across failures; stopped foreign claims refused; verified leftover copy-readers cleaned; rollback completion persisted; actual bind permissions checked; long configured volume names supported.
- Verification: full suite at `2d451fd` passed 3,740 tests with one existing skip in 464 files (37.34 seconds); build, rebuilt-image normal smoke and packed rootful migration/rollback/reader/repeat/recreation smoke passed with zero provider attempts. At `5dadabe`, 122 scoped tests and workspace lint/types passed; final boundary repair passed 67 tests, app types, Biome and diff checks.
- Verification limit: real rootful UID-1000 ownership was exercised; rootless mapping/refusal paths have fake-command coverage, not a real rootless-daemon run. Production remained unchanged.
- Review loop: seven full-feature rounds, sixteen unique confirmed findings fixed; rounds six and seven dry across independent spec, quality and unhappy-path lenses at `a472d513f12c`.
- Refreshed/absorbed `01-architecture-docker.md`: launcher boundaries, complete contracts and transactional recovery.
- Refreshed/absorbed `02-models-docker.md`: configuration, receipt, journal, identities and strict folder DTOs.
- Refreshed/absorbed `07-operations.md`: commands, defaults, overrides, private/host storage and recovery.
- Refreshed/absorbed `06-testing.md`: test layout, fake boundaries and dated isolated Docker evidence.
- Refreshed/absorbed `logic/14-storage-and-downloads.md`: current/history host paths and retained bytes.
- Refreshed/absorbed `logic/20-boot-cli-recovery.md`: migration ownership, activation and refusal/recovery rules.
- Refreshed/absorbed `mockup/08-project.md`: truthful saved host-location surface.
- Refreshed/absorbed `uiux/screens/03-project.md`: selectable saved path and native/Docker behavior.
- Refreshed/absorbed `logic/README.md`: index references to implemented host-folder behavior.
- Refreshed/absorbed `mockup/README.md`: index references to implemented host-folder behavior.
- Refreshed/absorbed `uiux/README.md`: index references to implemented host-folder behavior.
- Refreshed/absorbed `00-index.md`: index references to implemented host-folder behavior.
- Diff: `.github/workflows/ci.yml`, `README.md`, `packages/app/README.md`, `packages/app/package.json`, `packages/app/scripts/container-smoke.sh`, `packages/app/scripts/docker-projects-smoke.mjs`, `packages/app/scripts/docker-run.sh`, `packages/app/src/edge/cli.ts`, `packages/app/src/edge/docker-launch.ts`, `packages/app/src/edge/docker-projects/activation.test.ts`, `packages/app/src/edge/docker-projects/activation.ts`, `packages/app/src/edge/docker-projects/claims.test.ts`, `packages/app/src/edge/docker-projects/claims.ts`, `packages/app/src/edge/docker-projects/committed.ts`, `packages/app/src/edge/docker-projects/engine.test.ts`, `packages/app/src/edge/docker-projects/engine.ts`, `packages/app/src/edge/docker-projects/install.fake.ts`, `packages/app/src/edge/docker-projects/install.test.ts`, `packages/app/src/edge/docker-projects/install.ts`, `packages/app/src/edge/docker-projects/recover.ts`, `packages/app/src/edge/docker-projects/state.test.ts`, `packages/app/src/edge/docker-projects/state.ts`, `packages/app/src/edge/docker-projects/tree.test.ts`, `packages/app/src/edge/docker-projects/tree.ts`, `packages/app/src/edge/docker-projects/volume.ts`, `packages/app/src/edge/docker.ts`, `packages/app/src/edge/http/app.ts`, `packages/app/src/edge/http/files.test.ts`, `packages/app/src/edge/http/folder-location-schema.ts`, `packages/app/src/edge/http/folder-location.test.ts`, `packages/app/src/edge/http/folder-location.ts`, `packages/app/src/edge/http/open-folder.ts`, `packages/app/src/edge/http/revision-files.test.ts`, `packages/app/src/edge/http/revision-files.ts`, `packages/app/src/main.ts`, `packages/app/test/docker-launcher.test.ts`, `packages/app/test/docker-projects-fixture.test.ts`, `packages/site/install.test.js`, `packages/site/public/index.html`, `packages/web/src/project/open-folder.test.tsx`, `packages/web/src/project/open-folder.tsx`, `packages/web/src/project/revision-api.ts`.
- Feature folder retained under configuration; source and documentation are included in the already-authorized combined release. Final local migration is deferred until publication. `review retro` is available separately and was not run.
