---
generated_at_commit: d6a72d6428ff
generated_date: 2026-10-18
capstone_version: 7.0.1
content_hash: 2fd8a41b7e09
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
| `app` | `packages/app/vitest.config.ts:5` | `src/**/*.test.ts`, `test/**/*.test.ts` | node | 760 (703 in `src`, 57 in `test`) |
| `web` | `packages/web/vitest.config.ts:8` | `src/**/*.test.ts`, `src/**/*.test.tsx` | `happy-dom` | 297 |
| `extension` | `packages/extension/vitest.config.ts:5` | `test/**/*.test.ts` | `happy-dom` | 10 |
| `collector` | `packages/collector/vitest.config.ts:5` | `src/**/*.test.ts` | node | 1 |
| `site` | `packages/site/vitest.config.ts:5` | `*.test.js` (package root only) | node | 5 |

Total: 1,073 tracked `*.test.*` files, every one matched by an include rule above; no `*.spec.*` files exist.

- `vitest.tmpdir.ts:8-17`: global setup points `TMPDIR` at one `slopify-vitest-*` directory per run, inherited by workers, and removes it on teardown; fixtures create their data directories under `os.tmpdir()` and do not clean them individually.
- `packages/app/vitest.config.ts:11`: on `win32` only, `testTimeout` and `hookTimeout` are 30 000 ms; Linux keeps Vitest's 5 s default. many test files pass their own timeout (an `{ timeout }` option or a trailing numeric argument) (for example `packages/app/src/slices/rebuild/runtime-bundle-recovery.test.ts`).
- `packages/web/vitest.config.ts:6` resolves the same aliases as the web build (`packages/web/aliases.ts:13-17`): `@/` to `packages/web/src`, and `@app/*.js` to the app package's TypeScript source.
- Web test libraries: `@testing-library/dom`, `@testing-library/react`, `@testing-library/user-event`, `happy-dom` (`packages/web/package.json:32-38`); the extension declares `happy-dom` too since 4.0.
- No coverage provider or threshold is configured in any Vitest config or `package.json`.
- Platform skips: host-CLI socket tests use `it.skipIf(process.platform === "win32")` (`packages/app/src/adapters/host-cli/transport.test.ts:9`, `packages/app/test/host-cli-e2e.test.ts:140`); host folder-open tests run on Linux only (`packages/app/src/host-cli/open-folder.test.ts:47`). No `.only` or `.todo` markers exist.

### Placement

- Unit and slice tests sit beside the file they test, one test file per concern, often split by behavior with a suffix (`packages/app/src/slices/rebuild/runtime-export.test.ts`, `runtime-export-entries.test.ts`).
- `packages/app/test/*.test.ts` (51 files): composed tests that wire several slices, the runner and real SQLite together (`revision-rebuild.test.ts`, `revision-shorts.test.ts`, `backup-round-trip.test.ts`, `host-cli-e2e.test.ts`, `docker-launcher.test.ts`).
- `packages/app/test/e2e/*.test.ts` (6 files: `document`, `editable-projects`, `optional-outputs`, `play-drafts`, `review-checkpoints`, `skeleton`): boot the production app through `boot` from `packages/app/src/main.ts` on `127.0.0.1` port 0 and drive it over HTTP (`packages/app/test/e2e/skeleton.test.ts:9`, `packages/app/test/e2e/skeleton.test.ts:135`). Request helpers and zod response schemas live in sibling `*.http.ts` files (`packages/app/test/e2e/editable-projects.http.ts:15`).
- Extension tests live in `packages/extension/test/`, not beside `packages/extension/src/` (`packages/extension/vitest.config.ts:7`): ten files, among them `fill.test.ts`, `studio-pages.test.ts`, `video-picker.test.ts`, `schedule-fill.test.ts`, `upload-captions.test.ts`, `self-update.test.ts` and `pack-drift.test.ts` (the extension's copy of the upload pack keeps the app model's fields).
- Site tests sit at the package root and read the static pages, tokens and walkthrough steps (`packages/site/pages.test.js:4`, `packages/site/walkthrough.test.js:7`).

### Running targeted tests

All commands run from the repository root; the root config resolves each path to its project.

```sh
npx vitest run packages/app/src/slices/shorts              # one directory
npx vitest run packages/web/src/routes/home.test.tsx        # one file
npx vitest run packages/app/src/slices/rebuild/export-video-native.test.ts -t "burns"   # one named case
npx vitest run --project web                                # one project (names in the table above)
npm test                                                    # the whole suite
```

Filters used in CI take the same form (`.github/workflows/ci.yml:64-65`). Web tests import `@app/*` from source, so they need no app build; `npm run typecheck --workspace @slopify/web` builds the app's declarations first (`packages/web/package.json:9`).

### CI (`.github/workflows/ci.yml`)

Triggers: pushes to any branch and pull requests; tags do not trigger CI (`.github/workflows/ci.yml:3-7`). All jobs use Node 26 (`.github/workflows/ci.yml:17`) and carry a `timeout-minutes` cap (`check` 10, `test` 10, `windows` 20, `changes` 5, `container` 20; `.github/workflows/ci.yml:12`, `:31`, `:50`, `:77`, `:99`).

| Job | Runs | When | Site |
| --- | --- | --- | --- |
| `check` | `npm ci`, `npm run lint` (Biome), `npm run typecheck`, `npm run build`, `npm audit --audit-level=high` | every push/PR | `.github/workflows/ci.yml:10-25` |
| `test` | `npx vitest run --shard=N/5` on five parallel runners, `fail-fast: false` | every push/PR | `.github/workflows/ci.yml:29-43` |
| `changes` | `node packages/app/scripts/ci-changes.mjs` with full history and tags, `actions: read` permission and `GH_TOKEN` | every push/PR | `.github/workflows/ci.yml:71-90` |
| `windows` | build, `install-smoke.mjs`, one focused Vitest selection (FFmpeg, boot, CLI discovery/spawn, CLI paths/status, files/folders, assets, fonts, `e2e/skeleton`), then the real-FFmpeg export tests `export-video-native.test.ts` and `export-wav-join.test.ts` | `changes.windows == 'true'` | `.github/workflows/ci.yml:46-65` |
| `container` (matrix `image`, `docker-install`) | `npm ci --ignore-scripts`, build, `docker build -t slopify:smoke .`; `image` runs `container-smoke.sh` then `host-cli-smoke.mjs`; `docker-install` runs `docker-install-smoke.mjs` | `changes.docker == 'true'` | `.github/workflows/ci.yml:95-118` |

`ci-changes.mjs` sets `release` when `packages/app/package.json`'s version has no tag yet (`packages/app/scripts/ci-changes.mjs:25`). `windows` and `docker` are true only on such release pushes and only when files matching their path sets changed since that job last passed: `lastPassed` reads the GitHub Actions API for the newest successful `ci.yml` run on `main` since the last release tag whose jobs of that name all succeeded, and falls back to the last reachable release tag when none is found or the API is unreadable (`packages/app/scripts/ci-changes.mjs:65-93`, `:99-120`). A `package.json`/`package-lock.json` diff that only changes workspace versions does not count (`packages/app/scripts/ci-changes.mjs:36-59`). With no prior tag, everything runs (`packages/app/scripts/ci-changes.mjs:28-33`, `:95-96`).

Release (`.github/workflows/release.yml`), on `*.*.*` tags: `metadata` requires the tag to equal the app package version (`.github/workflows/release.yml:21`); `verify` requires a successful `ci.yml` run on `main` for the tagged SHA and runs no tests itself (`.github/workflows/release.yml:25-42`); then, in parallel after `verify`, npm publish with provenance, a Chrome Web Store upload of the extension, and a two-architecture GHCR image whose `container-merge` waits for both the images and the npm publish (`.github/workflows/release.yml:43-61`, `:66-83`, `:90-162`).

No pre-commit hook tooling (husky, lefthook, simple-git-hooks) is configured. Dependabot updates npm (root manifest only) and GitHub Actions weekly (`.github/dependabot.yml:9-16`).

### Smoke and maintenance scripts

These are not Vitest suites; each is run as a plain `node`/`bash` command.

| Script | What it proves | Run by |
| --- | --- | --- |
| `packages/app/scripts/install-smoke.mjs` | `npm pack` of `@gentbajko/slopify` (`:19`), two global installs (with and without install scripts) run one after another over npm's shared cache (`:21-48`), then they and `npm exec` (`:66`) each start and answer `/api/health` within 210 s (`:118`, `:175`) | CI `windows` |
| `packages/app/scripts/container-smoke.sh` | on throwaway names (`:2`): image FFmpeg comes from the image (`:46`), bare image stays healthy (`:56`), compose install on a free port (`:68`), same-settings rerun is a no-op (`:90`), changed settings recreate with snapshot (`:94`), only the newest recovery volume is kept (`:102`), `update` no-op and recreate-from-volume (`:108`); an MCP `initialize` POST to `/mcp` through the published port, with no token, answers as `slopify` (`:77`-`:81`) | CI `container/image` |
| `packages/app/scripts/host-cli-smoke.mjs` | Linux only (`:13`); installs the host helper under a disposable prefix with fake `claude`/`codex`/`agy` CLIs under a test `HOME` and checks the container reaches them; image from `SLOPIFY_SMOKE_IMAGE` (default `slopify:smoke`, `:18`); 15-minute limit (`:23`) | CI `container/image` |
| `packages/app/scripts/docker-install-smoke.mjs` | adopts an older `docker run` installation with the packaged install command, rolls a failing image back, reuses the data volume by name (`:1-3`); seeds data by running `packages/app/test/docker-projects-fixture.test.ts` with `SLOPIFY_DOCKER_FIXTURE_OUT` (`:131-138`); `SLOPIFY_SMOKE_KEEP=1` retains resources after failure (`:249`). Alias `npm run smoke:docker-install --workspace @gentbajko/slopify` (`packages/app/package.json:29`) | CI `container/docker-install` |
| `packages/app/scripts/validate-multilingual-alignment.mjs` | aligns one local audio file against its text and prints timing quality; downloads the alignment model on first run (`:2-12`) | manual only |
| `packages/app/scripts/build-sample.mjs` | rebuilds bundled sample archives from source; needs `ffmpeg` and `magick` (`:5-16`) | manual only |
| `packages/site/scripts/record-walkthrough.mjs` | boots the built app on a loopback port with a seeded data directory and records the site walkthrough video (`:2-12`) | manual only (`packages/site/package.json:9`) |

`packages/app/test/docker-projects-fixture.test.ts:10` also runs inside the normal suite; without `SLOPIFY_DOCKER_FIXTURE_OUT` it seeds into a temporary directory.

## Doubles

Provider ports are replaced by structural fakes that implement the real port interfaces; `vi.mock` module replacement appears in 18 files, limited to a few seams listed at the end.

**Provider fakes** (`packages/app/src/adapters/fake/`):

- `fakeLlm` (`packages/app/src/adapters/fake/llm.ts:51`) implements `LlmPort`: scripted `deltas` or a per-request `reply(req, attempt)`, optional `usage` (explicit `null` = provider that reports none), `gapMs` spent on an injected `clock` to drive idle timeouts, `failOnAttempt` keyed by 1-based attempt, `refuse`, `webSearchUnsupported` (`packages/app/src/adapters/fake/llm.ts:17-41`).
- `fakeTts` (`packages/app/src/adapters/fake/tts.ts:25`) implements `TtsPort`: audio as text `chunks`, or real bytes via `bytesFor` for tests that hand output to FFmpeg; same `gapMs`/`clock`/`failOnAttempt`/`refuse` options (`packages/app/src/adapters/fake/tts.ts:6-18`).
- `fakeImage` (`packages/app/src/adapters/fake/image.ts:35`) implements `ImagePort`: fixed `bytes`/`mime`, `takesMs` on the clock, `failOnAttempt`, `refuse`, and an optional `video` clip for animation with `failAnimateOnAttempt` (`packages/app/src/adapters/fake/image.ts:12-27`).

**Captured provider responses:** `packages/app/src/adapters/image/fixtures/` (fal, Google, OpenAI image, Replicate: success, 401/422/429, NSFW, truncated), `packages/app/src/adapters/llm/fixtures/` (Claude Code and Codex `.jsonl` streams, OpenRouter SSE `.txt`), `packages/app/src/adapters/tts/fixtures/` (Cartesia, ElevenLabs, OpenAI error bodies). Real adapters parse these in their colocated tests. `packages/app/src/slices/narration/fixtures/cleopatra-glossary.md` feeds `pronunciation.test.ts`.

**Fake CLIs and processes:** `packages/app/test/fixtures/host-cli.cjs` is a scripted host CLI read by `packages/app/test/host-cli-e2e.test.ts:49`. Claude Code adapter tests write throwaway executable scripts that answer the stream-JSON control protocol (`packages/app/src/adapters/llm/claude-code-models.test.ts:25-40`).

**Clock and runner seams:**

- `fixedClock`, `manualClock` (`packages/app/src/kernel/clock.fake.ts:7`, `:28`).
- `reapStandIns` and `exitsWith` (`packages/app/src/adapters/llm/stand-in-cli.fake.ts:15`, `:9`): the stand-in CLIs a test spawns (Claude Code, Codex, the assistant's CLI) end with the test worker that started them, and a test fails if one survives it.
- `standaloneOver` builds a slice's deps around the real standalone call over a fake provider, because slices may not hold a `Registry` (`packages/app/src/kernel/runner/standalone.fake.ts:9-11`).

**Database and storage fixtures** (real SQLite via `openDb` + `migrate`, temporary data directories, fixed clock, sequential IDs):

| Fixture | Site | Builds |
| --- | --- | --- |
| `harness`, `deferred` | `packages/app/src/slices/control/control.fake.ts:56`, `:153` | project with chosen stage states on disk SQLite |
| `revisionFixture(upgradeFrom10)` | `packages/app/src/slices/revisions/revision.fake.ts:33` | `RevisionDeps` over in-memory SQLite; optional replay of migrations ≤ 0010 to test upgrades |
| `mutationFixture`, `imageFixture`, `publicationFor`, `preparedOutput` | `packages/app/src/slices/revisions/mutation.fake.ts:12-81` | Save/publication inputs |
| `retainedOutput`, `retainedPiece` | `packages/app/src/slices/revisions/downloads.fake.ts:11`, `:47` | retained historical outputs |
| `createRebuildDeps`, `serviceFixture`, `paidServiceFixture` | `packages/app/src/slices/rebuild/service.fake.ts:9-72` | rebuild service deps |
| `recipe-fixture.ts` (`config`, `content`, `catalogue`, `emptyView`, `readyView`, `workFor`) | `packages/app/src/slices/rebuild/recipe-fixture.ts:5-137` | pure recipe inputs |
| `exportFixture`, `narrationFixture`, `workFixture`, `admitPendingRevision` | `packages/app/src/slices/rebuild/runtime-export.fake.ts:22`, `runtime-narration.fake.ts:67`, `work.fake.ts:5`, `legacy-admission.fake.ts:9` | runtime stage inputs |
| `binary`, `inspectMedia`, `wavParts` | `packages/app/src/slices/video/export.fake.ts:6-17` | real bundled FFmpeg (`:6`) and media inspection |
| `draftFixture`, `reviewFixture`, `startFixture` | `packages/app/src/slices/play-drafts/draft.fake.ts:20-141` | Play drafts through review and Start |
| `composedFixture`, `deferred`, `tone`, `save`, `start` | `packages/app/test/revision-rebuild.fake.ts:22-113` | real `wireRunner` over fake `Registry` ports and real FFmpeg; held promises order edits, responses and publication |
| `preparationFixture` | `packages/app/test/revision-preparation.fake.ts:6` | narration preparation composition |
| `seedLegacy`, `verifyPcmWav` | `packages/app/test/e2e/editable-projects.fixture.ts:33`, `:174` | an older-version project on disk for real-HTTP tests |
| `reviewOver`, `paidDocument`, `paidSetup`, `paidSampleDeps` | `packages/app/src/slices/template-studio/studio.fake.ts:16`, `:45`, `:56`, `:104` | Play's review over a test database on the bundled model list; a paid template setup (an OpenRouter article, ElevenLabs narration); the paid-sample loop with test keys and a runner that finishes or fails at once. Nothing is sent |
| `designHarness`, `pngOf`, `solidPng`, `designCatalogue`, `poster` | `packages/app/src/slices/designs/designs.fake.ts:38`, `:19`, `:111`, `:89`; `document.fake.ts:4` | designs over a test database with a fake picture generator, real decodable PNGs for jsPDF and ffmpeg, and a four-field gig poster |
| `fakeTailscale`, `othersProxy`, `fakeDns` | `packages/app/src/edge/remote-access/tailscale.fake.ts:37`, `:105`, `:18` | a `tailscale` that keeps serve settings per host and port the way tailscaled does and refuses anything but `status` and `serve`; someone else's serve setting on a port |
| `catalogue` | `packages/app/src/slices/model-checks/catalogue.fake.ts:5` | a small model list with every pricing shape a check meets |
| `still`, `quiet`, `model` | `packages/app/test/revision-reviews-stages.fake.ts:41`, `:60`, `:78` | the automatic reviews of article, narration, thumbnail and shorts over the real runner with one scripted text model; no provider or CLI is called |
| `mcpFixture`, `connectAgent`, `routeCallDeps` | `packages/app/src/edge/mcp/mcp.fake.ts:17`, `:53`, `:69` | the whole app (`createApp`) over a `revisionFixture` database with one project, optionally with the rebuild service; an SDK `Client` connected in-process through `StreamableHTTPClientTransport` whose `fetch` is `app.request`; `callRoute`'s deps over a fake `api` and an empty migrated database, for tests of one call |

**Web** (`packages/web/src/test-app.tsx`): component tests never reach a server (`packages/web/src/test-app.tsx:19-20`).

- `fakeFetch(routes)` answers a route table with `jsonAnswer`, `problemAnswer`, `emptyAnswer` (`packages/web/src/test-app.tsx:27-49`); `silentEvents` is an `EventSourceLike` that never opens (`:62`); `testDeps` combines them into `AppDeps` at origin `http://slopify.test` (`:24`, `:69`).
- `renderApp` mounts under `QueryClientProvider` (retries off) and `AppProvider` (`packages/web/src/test-app.tsx:184`, `:197-208`); `renderRouted` adds a memory-history TanStack router whose routes mirror `router.tsx` so `Link`s resolve (`:81`, `:180`).
- Navigation helpers: `openEditSection`, `openProjectSection`, `openProjectTab`, `openProjectEditor`, `downloadItem` (`packages/web/src/test-app.tsx:201-229`).
- Feature fixtures beside their tests: `playRoutes`, `draftView` (`packages/web/src/play/play-test-fixture.tsx:93`, `:292`); `sqliteSessionFixture` routes fetch through real draft CRUD on temporary SQLite (`packages/web/src/play/draft-sqlite-fixture.ts:19`); `mountSupplied` (`packages/web/src/play/draft-upload-test-fixture.ts:8`); `reviewFixture` (`packages/web/src/play/review-test-fixture.ts:7`); `reviewHarness` (`packages/web/src/play/review-test-harness.tsx:27`); project-page `stage`/`output`/`body` rows (`packages/web/src/routes/project-fixtures.ts:14-51`); `revisionRouteFixture` (`packages/web/src/routes/project-revision.fake.ts:11`); `revisionView` (`packages/web/src/project/revision-fixture.ts:2`); editor fixtures (`packages/web/src/project/revision-editor-test-fixtures.ts:5-80`); tutorial `mount`/`start`/`skipTo`/`fill` (`packages/web/src/tutorial/test-fixture.tsx:79-317`).

**MCP tools** (`packages/app/src/edge/mcp/*.test.ts`, 12 files): tools are exercised as an agent sees them, through `connectAgent` over `mcpFixture`, or one call at a time with `routeCallDeps`.

- `tools-parity.test.ts` enumerates `app.routes` and fails when an `/api` route is neither a tool nor in `excludedRoutes`, when an excluded route is also offered or no longer exists, when two tools share a name, when credentials, pairing, backups, the updater, host setup or YouTube actions are offered, and when a page-confirmed action lacks `confirm` (`packages/app/src/edge/mcp/tools-parity.test.ts:25`, `:36`, `:41`, `:87`).
- `http.test.ts`: an agent connects with no token and the connection time is recorded; a request from a web page at another address is refused and records nothing; loopback origins and the configured host are accepted and nothing else; GET and DELETE answer 405; a non-JSON body is refused with a sentence (`packages/app/src/edge/mcp/http.test.ts:26`, `:42`, `:55`, `:67`, `:76`).
- `call-route.test.ts`: path parameters, query and body reach the route; refusals pass through, a schema refusal names the wrong arguments; `confirmed: true` is asked before sending anything; agent changes are recorded once per `idempotencyKey` (`packages/app/src/edge/mcp/call-route.test.ts:30`-`:268`). Beside it, `file-tools`, `review-tools`, `library-tools`, `remake-tools`, `state-shapes`, `instructions`, `attribution`, `tools-projects` and `tools-setup` tests cover the bespoke tools and the answer shapes.
- Slice side: `packages/app/src/slices/agents/attention.test.ts` checks `needs_attention` (every kind oldest first, in-flight retries, what is left out, one unreadable row skipped and logged); `packages/app/src/slices/reviews/external-repo.test.ts` checks the External agent review rules (first verdict wins, auto-pass at the deadline including paused projects, canceled runs never pass, Trash, superseded and replaced standings).
- Composed: `packages/app/test/mcp-narration-fix.test.ts` and `packages/app/test/mcp-chunk-fix.test.ts` run the real runner (`composedFixture`) and fix a failed narration chunk through MCP the way the error says, voicing only that chunk again and continuing the run; `revision-agent-reviews.test.ts` and `revision-agent-reviews-shutdown.test.ts` run External agent reviews end to end (waiting, auto-pass after 2 h, restart, cancel, redo).
- Backups: `packages/app/src/slices/storage/backup-new-tables.test.ts` lists every table as carried or in `leftOut`; `external_reviews`, `agent_actions`, `project_starts`, `told_failures`, `model_checks`, the assistant's chats, `autopilot_snoozes`, `topic_scores` and the template studio's samples, jobs, bake-offs and spend are left out; designs and design templates are carried. A new table fails the test until it is put in one list or the other.
- Model standings never gate a run: `packages/app/src/catalog/registry.compat.test.ts` checks that a model marked not on the plan still validates and reaches the provider, and that no file a run goes through imports `slices/model-checks`.
- The assistant: `packages/app/src/edge/mcp/assistant.test.ts` drives `/mcp/assistant` with a turn token: only a running turn's token opens it, a page at another address is refused, a costly or outward tool answers "waiting" and records an ask, Allow makes the call once as the assistant (`runAllowedCall`), a card never shows a secret, and a tool that changes something and is in none of the ask-first lists or `assistantFreeTools` fails the test (`:325`). `packages/app/src/slices/assistant/turn.test.ts` runs turns over a fake CLI runner: one turn per chat and two at once, Stop, the time limit, shutdown, the ask-first card and the follow-up after Allow or Don't; `packages/app/src/adapters/llm/` tests parse captured streams (`fixtures/claude-code-assistant.jsonl`, `codex-assistant.jsonl`).
- The request guard and remote access: `packages/app/src/edge/http/request-guard.test.ts` covers the names Slopify answers to, a request from another page, a sandboxed page or a form, and a page served through the person's own proxy (cross-site pages and other ports still refused, `X-Forwarded-Host` trusted only from this computer, host setup and agents kept off the proxy); `packages/app/src/edge/remote-access/service.test.ts` runs the service over `fakeTailscale` (turn on and off, the account kept as the only one let in, a taken port, a setting someone else made, Funnel never run, each problem with its fix, Docker, start and stop removing and restoring only Slopify's own handler).
- Template studio and designs: `packages/app/src/slices/template-studio/` (23 test files) covers the sample loop (one job at a time across templates), quotes and the acknowledged high, the daily budget (a removed sample's spend still counts), Mark ready and the version schedules run, bake-offs and template packs; `packages/app/src/slices/designs/` (19) covers the renderer, the PDF worker, steps, budgets and design templates. Neither calls a provider: pictures come from a fake generator.
- Keywords: `packages/app/src/slices/keywords/wiki.test.ts` reads `docs/wiki/Keywords-Slopify-Fills.md` and fails when the page does not explain every `Slopify_` keyword and the two old names (`{{Scene}}`, `{{Appearance}}`); `recipe-keywords-compat.test.ts` keeps a snapshot so existing prompts mean what they did.
- Autopilot: `packages/app/src/slices/autopilot/` tests the hourly signals, the buffer forecast, the warnings, snoozes and the weekly report; `packages/app/src/autopilot-timers.test.ts` checks the timer wiring.
- The daily catalogue script: `packages/app/src/catalog/catalogue-build.test.ts` runs `scripts/catalogue-build.ts` against a saved OpenRouter listing (`src/catalog/fixtures/openrouter-models.json`), checks the files parse with the v1 schema, and that a second run proposes nothing.

**Other packages:**

- Collector: `d1()` implements the Worker's `CollectorDb` port over in-memory `node:sqlite` with `schema.sql`, and tests call `worker.fetch` directly (`packages/collector/src/index.test.ts:8-13`).
- Extension: `fill.test.ts` loads a captured YouTube Studio upload page (`packages/extension/test/fixtures/studio-upload.html`) under happy-dom (`packages/extension/test/fill.test.ts:16`); `studio-pages.test.ts` and `video-picker.test.ts` test the Studio-page helpers and the file picker.
- Site: tests read `packages/site` HTML/CSS/JS and walkthrough steps from disk (`packages/site/tokens.test.js:1`, `packages/site/walkthrough.test.js:7`).

**`vi.mock` seams:** the alignment adapter in composed video tests (`packages/app/test/revision-shorts.test.ts:31`, `revision-video-edit.test.ts:32`, `revision-youtube.test.ts:10`); FFmpeg and font discovery in rebuild runtime tests (`packages/app/src/slices/rebuild/runtime-export.test.ts:12-20`, `packages/app/src/slices/fonts/catalog.test.ts:13`); batch dispatch (`packages/app/src/slices/play-drafts/start-run-count.test.ts:9`); recovery in the narration-retry wait test (`packages/app/src/slices/rebuild/narration-retry-wait.test.ts:11`); `node:fs` (`packages/app/src/slices/revisions/download-permissions.test.ts:8`, `packages/app/src/slices/storage/delete-project.test.ts:20`); `StylePreview` and tutorial context in web route tests (`packages/web/src/click-budget.test.tsx:23-24`, `packages/web/src/routes/play.test.tsx:22-24`).

## Coverage shape

File counts by directory (tracked `*.test.*` files, not instrumented coverage).

| Area | Test files | Heaviest directories |
| --- | ---: | --- |
| `packages/app/src/slices` | 469 | `rebuild` 116, `revisions` 37, `template-studio` 23, `storage` 23, `designs` 19, `video` 17, `narration` 17, `schedules` 16, `play-drafts` 16, `settings` 12, `voices` 10, `reviews` 9 |
| `packages/app/src/edge` | 104 | `http` 72, `mcp` 14, `edge` root 6, `docker-install` 4, `events` 4, `autostart` 3, `remote-access` 1 |
| `packages/app/src/adapters` | 56 | `llm` 16, `alignment` 14, `image` 9, `tts` 8, `host-cli` 2, `interest` 1, root 6 |
| `packages/app/src/kernel` | 37 | `runner` 16, `ports` 7, root 9, `db` 4, `config` 1 |
| `packages/app/src` other | 37 | `catalog` 10, `updater` 9, `host-cli` 8, root 10 |
| `packages/app/test` | 57 | composed 51, `e2e` 6 |
| `packages/web/src` | 297 | `project` 69, `play` 55, `routes` 33, `components` 33, `schedules` 12, `lib` 11, `help` 10, `tutorial` 7, `notifications` 6, `channels` 6, `template-studio` 5, `home` 5, root 7 |
| `packages/site`, `packages/collector`, `packages/extension` | 5 / 1 / 10 | — |

Remaining app slices each carry 1–8 colocated test files: `admission`, `article`, `assistant`, `autopilot`, `backups`, `batch`, `cancel`, `channels`, `checkpoints`, `control`, `document`, `episodes`, `estimate`, `eta`, `fixes`, `fonts`, `images`, `keywords`, `library`, `loudness`, `model-checks`, `model-upkeep`, `notifications`, `onboarding`, `patch-notes`, `project-templates`, `reruns`, `research`, `reviews`, `run-cost`, `shorts`, `studio`, `style-preview`, `subtitles`, `telemetry`, `thumbnail`, `trash`, `tutorials`, `youtube`. Remaining web directories with tests: `assistant`, `autostart`, `calendar`, `channels`, `designs`, `fixes`, `home`, `language`, `lib`, `library`, `notifications`, `patch-notes`, `remote-access`, `studio`, `styles`, `subtitles`, `trash`, `tutorials`, `updates`, `video`, `voices`, `whats-new`, `youtube`.

Directories with no test file of their own:

- `packages/app/src/slices/uploads` (one file, `repo.ts`).
- `packages/app/src/sample-build` (12 files; maintainer tooling run by `build-sample.mjs`).
- `packages/app/src/assets`, `packages/web/src/assets` (static assets).
- `packages/web/src/onboarding`, `packages/web/src/templates` (3 files each); exercised through route tests such as `packages/web/src/routes/welcome.test.tsx`.
- `packages/extension/src` (11 files); covered by the three suites in `packages/extension/test/`.

Cross-cutting web suites: `packages/web/src/kit-rules.test.ts` scans every non-test source outside `components/kit/` and fails on a hand-built button, a link that looks like a button, an `onClick` on a row or a raw checkbox (`docs/design-system.md`); `packages/web/src/click-budget.test.tsx:15-20` fails when one of five common tasks exceeds its click budget; `packages/web/src/styles/grid.test.ts` and `tokens.test.ts` enforce the spacing scale and design tokens; `packages/web/src/components/kit/*.test.tsx` cover the shared kit.

Boundaries of the suite, as facts:

- All provider calls are faked or replayed from fixtures; no test calls a paid provider.
- Media tests use the bundled FFmpeg and real bytes (`packages/app/src/slices/video/export.fake.ts:17`, `packages/app/src/slices/video/figure-card.test.ts:17`); speech-alignment model inference is replaced by the mocked adapter in composed tests and by scripted child processes written by `packages/app/src/adapters/alignment/runner.test.ts:17`.
- Web and extension tests run under happy-dom; no real-browser, visual or layout test runner is configured.
- Docker behavior is exercised only by the CI smoke scripts; Vitest Docker-install tests inject a fake `Engine` (`packages/app/src/edge/docker-install/apply.test.ts:35`).
- No load, fuzz or mutation testing is configured.
