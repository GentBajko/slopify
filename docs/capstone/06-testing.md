---
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: 318a9627abe8
paths_covered:
  - ":(top)package.json"
  - ":(top)vitest.config.ts"
  - ":(top)vitest.tmpdir.ts"
  - ":(top).github/**"
  - ":(top)packages/*/package.json"
  - ":(top)packages/*/vitest.config.ts"
  - ":(top)packages/web/aliases.ts"
  - ":(top)packages/app/scripts/**"
  - ":(top)packages/site/scripts/**"
  - ":(top)packages/app/test/**"
  - ":(top)packages/extension/test/**"
  - ":(top)packages/site/*.test.js"
  - ":(top)packages/*/src/**/*.test.ts"
  - ":(top)packages/web/src/**/*.test.tsx"
  - ":(top)packages/**/*.fake.ts"
  - ":(top)packages/**/*fixture*"
  - ":(top)packages/**/fixtures/**"
  - ":(top)packages/app/src/adapters/fake/**"
  - ":(top)packages/web/src/test-app.tsx"
  - ":(top)packages/web/src/play/review-test-harness.tsx"
---

# Testing

## Layout

### Runner and projects

One runner: Vitest (`vitest` `^4.1.11`, `package.json:23`). `npm test` runs `vitest run` from the repository root (`package.json:11`). The root config declares every `packages/*/vitest.config.ts` as a project and a global setup (`vitest.config.ts:5-7`).

| Project (`name`) | Config | Include | Environment | Test files |
| --- | --- | --- | --- | ---: |
| `app` | `packages/app/vitest.config.ts:5` | `src/**/*.test.ts`, `test/**/*.test.ts` | node | 564 (507 in `src`, 57 in `test`) |
| `web` | `packages/web/vitest.config.ts:8` | `src/**/*.test.ts`, `src/**/*.test.tsx` | `happy-dom` | 197 |
| `extension` | `packages/extension/vitest.config.ts:5` | `test/**/*.test.ts` | `happy-dom` | 1 |
| `collector` | `packages/collector/vitest.config.ts:5` | `src/**/*.test.ts` | node | 1 |
| `site` | `packages/site/vitest.config.ts:5` | `*.test.js` (package root only) | node | 5 |

Total: 768 tracked `*.test.*` files, every one matched by an include rule above; no `*.spec.*` files exist.

- `vitest.tmpdir.ts:8-16`: global setup points `TMPDIR` at one `slopify-vitest-*` directory per run, inherited by workers, and removes it on teardown; fixtures create their data directories under `os.tmpdir()` and do not clean them individually.
- `packages/app/vitest.config.ts:11`: on `win32` only, `testTimeout` and `hookTimeout` are 30 000 ms; Linux keeps Vitest's 5 s default. 40 test files set their own per-test timeout (for example `packages/app/src/slices/rebuild/runtime-bundle-recovery.test.ts`).
- `packages/web/vitest.config.ts:6` resolves the same aliases as the web build (`packages/web/aliases.ts:13-17`): `@/` to `packages/web/src`, and `@app/*.js` to the app package's TypeScript source.
- Web test libraries: `@testing-library/dom`, `@testing-library/react`, `@testing-library/user-event`, `happy-dom` (`packages/web/package.json:32-38`). No other package declares test-only libraries.
- No coverage provider or threshold is configured in any Vitest config or `package.json`.
- Platform skips: host-CLI socket tests use `it.skipIf(process.platform === "win32")` (`packages/app/src/adapters/host-cli/transport.test.ts:9`, `packages/app/test/host-cli-e2e.test.ts:140`); host folder-open tests run on Linux only (`packages/app/src/host-cli/open-folder.test.ts:47`). No `.only` or `.todo` markers exist.

### Placement

- Unit and slice tests sit beside the file they test, one test file per concern, often split by behavior with a suffix (`packages/app/src/slices/rebuild/runtime-export.test.ts`, `runtime-export-entries.test.ts`).
- `packages/app/test/*.test.ts` (51 files): composed tests that wire several slices, the runner and real SQLite together (`revision-rebuild.test.ts`, `revision-shorts.test.ts`, `backup-round-trip.test.ts`, `host-cli-e2e.test.ts`, `docker-launcher.test.ts`).
- `packages/app/test/e2e/*.test.ts` (6 files: `document`, `editable-projects`, `optional-outputs`, `play-drafts`, `review-checkpoints`, `skeleton`): boot the production app through `boot` from `packages/app/src/main.ts` on `127.0.0.1` port 0 and drive it over HTTP (`packages/app/test/e2e/skeleton.test.ts:9`, `packages/app/test/e2e/skeleton.test.ts:135`). Request helpers and zod response schemas live in sibling `*.http.ts` files (`packages/app/test/e2e/editable-projects.http.ts:15`).
- Extension tests live in `packages/extension/test/`, not beside `packages/extension/src/` (`packages/extension/vitest.config.ts:7`).
- Site tests sit at the package root and read the static pages, tokens and walkthrough steps (`packages/site/pages.test.js:11`, `packages/site/walkthrough.test.js:7`).

### Running targeted tests

All commands run from the repository root; the root config resolves each path to its project.

```sh
npx vitest run packages/app/src/slices/shorts              # one directory
npx vitest run packages/web/src/routes/home.test.tsx        # one file
npx vitest run packages/app/test/video-render.test.ts -t "real subtitle export"   # one named case
npx vitest run --project web                                # one project (names in the table above)
npm test                                                    # the whole suite
```

Filters used in CI take the same form (`.github/workflows/ci.yml:61-62`). Web tests import `@app/*` from source, so they need no app build; `npm run typecheck --workspace @slopify/web` builds the app's declarations first (`packages/web/package.json:9`).

### CI (`.github/workflows/ci.yml`)

Triggers: pushes to any branch and pull requests; tags do not trigger CI (`.github/workflows/ci.yml:3-7`). All jobs use Node 26 (`.github/workflows/ci.yml:16`).

| Job | Runs | When | Site |
| --- | --- | --- | --- |
| `check` | `npm ci`, `npm run lint` (Biome), `npm run typecheck`, `npm run build`, `npm audit --audit-level=high` | every push/PR | `.github/workflows/ci.yml:10-24` |
| `test` | `npx vitest run --shard=N/4` on four parallel runners, `fail-fast: false` | every push/PR | `.github/workflows/ci.yml:28-41` |
| `changes` | `node packages/app/scripts/ci-changes.mjs` with full history and tags | every push/PR | `.github/workflows/ci.yml:68-80` |
| `windows` | build, `install-smoke.mjs`, one focused Vitest selection (FFmpeg, boot, CLI discovery/spawn, CLI paths/status, files/folders, assets, fonts, `e2e/skeleton`), then `video-render.test.ts -t "real subtitle export"` | `changes.windows == 'true'` | `.github/workflows/ci.yml:44-62` |
| `container` (matrix `image`, `docker-install`) | `npm ci --ignore-scripts`, build, `docker build -t slopify:smoke .`; `image` runs `container-smoke.sh` then `host-cli-smoke.mjs`; `docker-install` runs `docker-install-smoke.mjs` | `changes.docker == 'true'` | `.github/workflows/ci.yml:85-107` |

`ci-changes.mjs` sets `release` when `packages/app/package.json`'s version has no tag yet (`packages/app/scripts/ci-changes.mjs:21-22`). `windows` and `docker` are true only on such release pushes and only when files matching their path sets changed since the last reachable release tag (`packages/app/scripts/ci-changes.mjs:64-79`); a `package.json`/`package-lock.json` diff that only changes workspace versions does not count (`packages/app/scripts/ci-changes.mjs:33-57`). With no prior tag, everything runs (`packages/app/scripts/ci-changes.mjs:59-62`).

Release (`.github/workflows/release.yml`), on `*.*.*` tags: `metadata` requires the tag to equal the app package version (`.github/workflows/release.yml:19-20`); `verify` requires a successful `ci.yml` run on `main` for the tagged SHA and runs no tests itself (`.github/workflows/release.yml:24-39`); then npm publish with provenance and a two-architecture GHCR image (`.github/workflows/release.yml:41-135`).

No pre-commit hook tooling (husky, lefthook, simple-git-hooks) is configured. Dependabot updates npm (root manifest only) and GitHub Actions weekly (`.github/dependabot.yml:9-16`).

### Smoke and maintenance scripts

These are not Vitest suites; each is run as a plain `node`/`bash` command.

| Script | What it proves | Run by |
| --- | --- | --- |
| `packages/app/scripts/install-smoke.mjs` | `npm pack` of `@gentbajko/slopify` (`:19`), global installs (with and without install scripts) and `npm exec` (`:63`) each start and answer `/api/health` within 210 s (`:108`, `:165`) | CI `windows` |
| `packages/app/scripts/container-smoke.sh` | on throwaway names (`:2`): image FFmpeg comes from the image (`:46`), bare image stays healthy (`:56`), compose install on a free port (`:68`), same-settings rerun is a no-op (`:90`), changed settings recreate with snapshot (`:94`), only the newest recovery volume is kept (`:102`), `update` no-op and recreate-from-volume (`:108`) | CI `container/image` |
| `packages/app/scripts/host-cli-smoke.mjs` | Linux only (`:13`); installs the host helper under a disposable prefix with fake `claude`/`codex`/`gemini` CLIs under a test `HOME` and checks the container reaches them; image from `SLOPIFY_SMOKE_IMAGE` (default `slopify:smoke`, `:18`); 15-minute limit (`:23`) | CI `container/image` |
| `packages/app/scripts/docker-install-smoke.mjs` | adopts an older `docker run` installation with the packaged install command, rolls a failing image back, reuses the data volume by name (`:1-3`); seeds data by running `packages/app/test/docker-projects-fixture.test.ts` with `SLOPIFY_DOCKER_FIXTURE_OUT` (`:131-138`); `SLOPIFY_SMOKE_KEEP=1` retains resources after failure (`:249`). Alias `npm run smoke:docker-install --workspace @gentbajko/slopify` (`packages/app/package.json:29`) | CI `container/docker-install` |
| `packages/app/scripts/validate-multilingual-alignment.mjs` | aligns one local audio file against its text and prints timing quality; downloads the alignment model on first run (`:2-12`) | manual only |
| `packages/app/scripts/build-sample.mjs` | rebuilds bundled sample archives from source; needs `ffmpeg` and `magick` (`:5-16`) | manual only |
| `packages/site/scripts/record-walkthrough.mjs` | boots the built app on a loopback port with a seeded data directory and records the site walkthrough video (`:2-12`) | manual only (`packages/site/package.json:9`) |

`packages/app/test/docker-projects-fixture.test.ts:10` also runs inside the normal suite; without `SLOPIFY_DOCKER_FIXTURE_OUT` it seeds into a temporary directory.

## Doubles

Provider ports are replaced by structural fakes that implement the real port interfaces; `vi.mock` module replacement appears in 17 files, limited to a few seams listed at the end.

**Provider fakes** (`packages/app/src/adapters/fake/`):

- `fakeLlm` (`packages/app/src/adapters/fake/llm.ts:51`) implements `LlmPort`: scripted `deltas` or a per-request `reply(req, attempt)`, optional `usage` (explicit `null` = provider that reports none), `gapMs` spent on an injected `clock` to drive idle timeouts, `failOnAttempt` keyed by 1-based attempt, `refuse`, `webSearchUnsupported` (`packages/app/src/adapters/fake/llm.ts:17-41`).
- `fakeTts` (`packages/app/src/adapters/fake/tts.ts:25`) implements `TtsPort`: audio as text `chunks`, or real bytes via `bytesFor` for tests that hand output to FFmpeg; same `gapMs`/`clock`/`failOnAttempt`/`refuse` options (`packages/app/src/adapters/fake/tts.ts:6-18`).
- `fakeImage` (`packages/app/src/adapters/fake/image.ts:35`) implements `ImagePort`: fixed `bytes`/`mime`, `takesMs` on the clock, `failOnAttempt`, `refuse`, and an optional `video` clip for animation with `failAnimateOnAttempt` (`packages/app/src/adapters/fake/image.ts:12-27`).

**Captured provider responses:** `packages/app/src/adapters/image/fixtures/` (fal, Google, OpenAI image, Replicate: success, 401/422/429, NSFW, truncated), `packages/app/src/adapters/llm/fixtures/` (Claude Code and Codex `.jsonl` streams, OpenRouter SSE `.txt`), `packages/app/src/adapters/tts/fixtures/` (Cartesia, ElevenLabs, OpenAI error bodies). Real adapters parse these in their colocated tests. `packages/app/src/slices/narration/fixtures/cleopatra-glossary.md` feeds `pronunciation.test.ts`.

**Fake CLIs and processes:** `packages/app/test/fixtures/host-cli.cjs` is a scripted host CLI read by `packages/app/test/host-cli-e2e.test.ts:49`. Claude Code adapter tests write throwaway executable scripts that answer the stream-JSON control protocol (`packages/app/src/adapters/llm/claude-code-models.test.ts:25-40`).

**Clock and runner seams:**

- `fixedClock`, `manualClock` (`packages/app/src/kernel/clock.fake.ts:7`, `:28`).
- `standaloneOver` builds a slice's deps around the real standalone call over a fake provider, because slices may not hold a `Registry` (`packages/app/src/kernel/runner/standalone.fake.ts:9-11`).
- `recordingCounter` replaces the telemetry recorder and keeps counters without writing rows (`packages/app/src/slices/telemetry/record.fake.ts:3-18`).

**Database and storage fixtures** (real SQLite via `openDb` + `migrate`, temporary data directories, fixed clock, sequential IDs):

| Fixture | Site | Builds |
| --- | --- | --- |
| `harness`, `deferred` | `packages/app/src/slices/control/control.fake.ts:62`, `:159` | project with chosen stage states on disk SQLite |
| `revisionFixture(upgradeFrom10)` | `packages/app/src/slices/revisions/revision.fake.ts:33` | `RevisionDeps` over in-memory SQLite; optional replay of migrations ≤ 0010 to test upgrades |
| `mutationFixture`, `imageFixture`, `publicationFor`, `preparedOutput` | `packages/app/src/slices/revisions/mutation.fake.ts:12-81` | Save/publication inputs |
| `retainedOutput`, `retainedPiece` | `packages/app/src/slices/revisions/downloads.fake.ts:11`, `:47` | retained historical outputs |
| `createRebuildDeps`, `serviceFixture`, `paidServiceFixture` | `packages/app/src/slices/rebuild/service.fake.ts:9-72` | rebuild service deps |
| `recipe-fixture.ts` (`config`, `content`, `catalogue`, `emptyView`, `readyView`, `workFor`) | `packages/app/src/slices/rebuild/recipe-fixture.ts:5-137` | pure recipe inputs |
| `exportFixture`, `narrationFixture`, `workFixture`, `admitPendingRevision` | `packages/app/src/slices/rebuild/runtime-export.fake.ts:22`, `runtime-narration.fake.ts:67`, `work.fake.ts:5`, `legacy-admission.fake.ts:9` | runtime stage inputs |
| `exportFixture`, `inspectMedia`, `wavParts` | `packages/app/src/slices/video/export.fake.ts:19-149` | real bundled FFmpeg (`:17`) and media inspection |
| `draftFixture`, `reviewFixture`, `startFixture` | `packages/app/src/slices/play-drafts/draft.fake.ts:20-141` | Play drafts through review and Start |
| `composedFixture`, `deferred`, `tone`, `save`, `start` | `packages/app/test/revision-rebuild.fake.ts:22-113` | real `wireRunner` over fake `Registry` ports and real FFmpeg; held promises order edits, responses and publication |
| `preparationFixture` | `packages/app/test/revision-preparation.fake.ts:6` | narration preparation composition |
| `legacyAttempts`, `legacyStage` | `packages/app/test/legacy-runner.ts:6-16` | pre-revision storage for old slice composition tests |
| `seedLegacy`, `verifyPcmWav` | `packages/app/test/e2e/editable-projects.fixture.ts:33`, `:174` | legacy project on disk for real-HTTP tests |

**Web** (`packages/web/src/test-app.tsx`): component tests never reach a server (`packages/web/src/test-app.tsx:19-20`).

- `fakeFetch(routes)` answers a route table with `jsonAnswer`, `problemAnswer`, `emptyAnswer` (`packages/web/src/test-app.tsx:27-49`); `silentEvents` is an `EventSourceLike` that never opens (`:62`); `testDeps` combines them into `AppDeps` at origin `http://slopify.test` (`:24`, `:69`).
- `renderApp` mounts under `QueryClientProvider` (retries off) and `AppProvider` (`packages/web/src/test-app.tsx:174`, `:188-194`); `renderRouted` adds a memory-history TanStack router whose routes mirror `router.tsx` so `Link`s resolve (`:80`, `:180`).
- Navigation helpers: `openEditSection`, `openProjectSection`, `openProjectTab`, `openProjectEditor`, `downloadItem` (`packages/web/src/test-app.tsx:201-229`).
- Feature fixtures beside their tests: `playRoutes`, `draftView` (`packages/web/src/play/play-test-fixture.tsx:93`, `:292`); `sqliteSessionFixture` routes fetch through real draft CRUD on temporary SQLite (`packages/web/src/play/draft-sqlite-fixture.ts:19`); `mountSupplied` (`packages/web/src/play/draft-upload-test-fixture.ts:8`); `reviewFixture` (`packages/web/src/play/review-test-fixture.ts:7`); `reviewHarness` (`packages/web/src/play/review-test-harness.tsx:27`); project-page `stage`/`output`/`body` rows (`packages/web/src/routes/project-fixtures.ts:10-51`); `revisionRouteFixture` (`packages/web/src/routes/project-revision.fake.ts:8`); `revisionView` (`packages/web/src/project/revision-fixture.ts:2`); editor fixtures (`packages/web/src/project/revision-editor-test-fixtures.ts:5-80`); tutorial `mount`/`start`/`skipTo`/`fill` (`packages/web/src/tutorial/test-fixture.tsx:79-311`).

**Other packages:**

- Collector: `d1()` implements the Worker's `CollectorDb` port over in-memory `node:sqlite` with `schema.sql`, and tests call `worker.fetch` directly (`packages/collector/src/index.test.ts:8-13`).
- Extension: `fill.test.ts` loads a captured YouTube Studio upload page (`packages/extension/test/fixtures/studio-upload.html`) under happy-dom (`packages/extension/test/fill.test.ts:15`).
- Site: tests read `packages/site` HTML/CSS/JS and walkthrough steps from disk (`packages/site/tokens.test.js:1`, `packages/site/walkthrough.test.js:7`).

**`vi.mock` seams:** the alignment adapter in composed video tests (`packages/app/test/revision-shorts.test.ts:31`, `revision-video-edit.test.ts:32`, `revision-youtube.test.ts:10`); FFmpeg and font discovery in rebuild runtime tests (`packages/app/src/slices/rebuild/runtime-export.test.ts:12-20`, `packages/app/src/slices/fonts/catalog.test.ts:13`); batch dispatch (`packages/app/src/slices/play-drafts/start-run-count.test.ts:9`); `node:fs` (`packages/app/src/slices/revisions/download-permissions.test.ts:8`); `StylePreview` and tutorial context in web route tests (`packages/web/src/click-budget.test.tsx:23-24`, `packages/web/src/routes/play.test.tsx:22-24`).

## Coverage shape

File counts by directory (tracked `*.test.*` files, not instrumented coverage).

| Area | Test files | Heaviest directories |
| --- | ---: | --- |
| `packages/app/src/slices` | 322 | `rebuild` 90, `revisions` 34, `storage` 17, `narration` 15, `play-drafts` 15, `video` 15, `settings` 11, `voices` 10 |
| `packages/app/src/edge` | 73 | `http` 56, `edge` root 6, `docker-install` 4, `events` 4, `autostart` 3 |
| `packages/app/src/adapters` | 50 | `llm` 15, `alignment` 13, `image` 9, `tts` 8, `host-cli` 2, root 3 |
| `packages/app/src/kernel` | 32 | `runner` 14, `ports` 7, root 7, `db` 3, `config` 1 |
| `packages/app/src` other | 30 | `host-cli` 9, `updater` 9, root 7, `catalog` 5 |
| `packages/app/test` | 57 | composed 51, `e2e` 6 |
| `packages/web/src` | 197 | `project` 52, `play` 46, `routes` 28, `components` 10 (+ `kit` 4), `tutorial` 7, root 7, `help/walk` 5, `schedules` 5 |
| `packages/site`, `packages/collector`, `packages/extension` | 5 / 1 / 1 | — |

Remaining app slices each carry 1–8 colocated test files: `admission`, `article`, `backups`, `batch`, `cancel`, `channels`, `checkpoints`, `control`, `document`, `episodes`, `estimate`, `eta`, `fixes`, `fonts`, `images`, `library`, `loudness`, `model-upkeep`, `notifications`, `onboarding`, `patch-notes`, `project-templates`, `reruns`, `research`, `reviews`, `run-cost`, `schedules`, `shorts`, `studio`, `style-preview`, `subtitles`, `telemetry`, `thumbnail`, `trash`, `tutorials`, `youtube`. Remaining web directories with tests: `autostart`, `calendar`, `channels`, `fixes`, `help`, `language`, `lib`, `library`, `notifications`, `patch-notes`, `studio`, `styles`, `subtitles`, `trash`, `tutorials`, `updates`, `video`, `voices`, `whats-new`, `youtube`.

Directories with no test file of their own:

- `packages/app/src/slices/uploads` (one file, `repo.ts`).
- `packages/app/src/sample-build` (12 files; maintainer tooling run by `build-sample.mjs`).
- `packages/app/src/assets`, `packages/web/src/assets` (static assets).
- `packages/web/src/home` (8 files); its screen is rendered by `packages/web/src/routes/home.test.tsx`.
- `packages/web/src/onboarding`, `packages/web/src/templates` (3 files each); exercised through route tests such as `packages/web/src/routes/welcome.test.tsx`.
- `packages/extension/src` (7 files); covered by `packages/extension/test/fill.test.ts`.

Cross-cutting web suites: `packages/web/src/click-budget.test.tsx:1-6` fails when one of five common tasks exceeds its click budget; `packages/web/src/styles/grid.test.ts` and `tokens.test.ts` enforce the spacing scale and design tokens; `packages/web/src/components/kit/*.test.tsx` cover the shared kit.

Boundaries of the suite, as facts:

- All provider calls are faked or replayed from fixtures; no test calls a paid provider.
- Media tests use the bundled FFmpeg and real bytes (`packages/app/src/slices/video/export.fake.ts:17`, `packages/app/src/slices/video/figure-card.test.ts:17`); speech-alignment model inference is replaced by the mocked adapter in composed tests and by scripted child processes written by `packages/app/src/adapters/alignment/runner.test.ts:17`.
- Web and extension tests run under happy-dom; no real-browser, visual or layout test runner is configured.
- Docker behavior is exercised only by the CI smoke scripts; Vitest Docker-install tests inject a fake `Engine` (`packages/app/src/edge/docker-install/apply.test.ts:35`).
- No load, fuzz or mutation testing is configured.
