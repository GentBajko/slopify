---
generated_at_commit: 7bdb84e3f57e
generated_date: '2026-09-13'
capstone_version: 5.2.0
content_hash: aa3424eacdc2
paths_covered:
  - :(top)packages/*/src/**
  - :(top)packages/app/test/**
  - :(top)packages/site/public/**
  - :(top)packages/*/vitest.config.*
  - :(top)vitest.config.*
  - :(top)package*.json
  - :(top)packages/*/package.json
  - :(top).github/workflows/**
  - :(top)packages/site/*.test.js
absorbed_from:
  - features/2026-09-10-editable-projects@2026-09-12
  - features/2026-09-10-play-redesign-drafts@2026-09-13
  - features/2026-09-10-review-checkpoints@2026-09-13
---

# Testing

Review checkpoint acceptance covers zero/three gate setup, independent closure dispatch, typed approval/refusal/replay, add/remove before start, title-only Save carry, materialization retirement, pause/resume, restart recovery, late results, concurrent project tabs and secret-free resolver diagnostics (`packages/app/test/review-checkpoints-*.test.ts`, `packages/web/src/project/checkpoint-panel.test.tsx`).

Inspected source and test configuration at `7bdb84e3f57ec19c11e21b43cb6502a720156e9f` on 2026-09-13. Test-run evidence below identifies its own source checkpoint; the file inventory is the current checkout.

## Layout

`npm test` runs `vitest run` from the workspace root. Root Vitest discovers `packages/*/vitest.config.ts`. There are four configured projects: `app` includes `src/**/*.test.ts` and `test/**/*.test.ts`; `web` includes `src/**/*.test.ts` and `src/**/*.test.tsx` under `happy-dom`; `collector` includes `src/**/*.test.ts`; `site` includes root-level `*.test.js`. Application/unit tests are colocated with production modules, while composed application tests live under `packages/app/test` and real HTTP/media journeys under its `e2e` subdirectory. `package.json:11` `vitest.config.ts:3` `packages/app/vitest.config.ts:3` `packages/web/vitest.config.ts:5` `packages/collector/vitest.config.ts:3` `packages/site/vitest.config.ts:3` `packages/app/test/revision-rebuild.test.ts:11` `packages/app/test/e2e/editable-projects.test.ts:39`

The complete test-bearing directory inventory below contains 398 test files. Counts are file counts from the tracked tree, not instrumented statement/branch coverage. All listed test files match one of the four configured inclusion rules; no discovered `.spec.ts`, `.spec.tsx`, or `.spec.js` files sit outside them. Each row cites a concrete member, while the config pointers above establish runner inclusion.

| Directory | Test files | Example source |
| --- | ---: | --- |
| `packages/app/src` | 5 | `packages/app/src/adapter-registry-paths.test.ts:1` |
| `packages/app/src/adapters` | 2 | `packages/app/src/adapters/ffmpeg.test.ts:1` |
| `packages/app/src/adapters/alignment` | 7 | `packages/app/src/adapters/alignment/cache.test.ts:1` |
| `packages/app/src/adapters/image` | 6 | `packages/app/src/adapters/image/bytes.test.ts:1` |
| `packages/app/src/adapters/llm` | 7 | `packages/app/src/adapters/llm/claude-code.test.ts:1` |
| `packages/app/src/adapters/tts` | 5 | `packages/app/src/adapters/tts/cartesia.test.ts:1` |
| `packages/app/src/catalog` | 2 | `packages/app/src/catalog/registry.test.ts:1` |
| `packages/app/src/edge` | 3 | `packages/app/src/edge/open-browser.test.ts:1` |
| `packages/app/src/edge/events` | 3 | `packages/app/src/edge/events/hub.test.ts:1` |
| `packages/app/src/edge/http` | 32 | `packages/app/src/edge/http/actions.test.ts:1` |
| `packages/app/src/kernel` | 7 | `packages/app/src/kernel/audio-preview.test.ts:1` |
| `packages/app/src/kernel/config` | 1 | `packages/app/src/kernel/config/index.test.ts:1` |
| `packages/app/src/kernel/db` | 2 | `packages/app/src/kernel/db/migrate.test.ts:1` |
| `packages/app/src/kernel/ports` | 2 | `packages/app/src/kernel/ports/model.test.ts:1` |
| `packages/app/src/kernel/runner` | 10 | `packages/app/src/kernel/runner/attempt-repo.test.ts:1` |
| `packages/app/src/slices/admission` | 3 | `packages/app/src/slices/admission/rules.test.ts:1` |
| `packages/app/src/slices/article` | 5 | `packages/app/src/slices/article/continuation.test.ts:1` |
| `packages/app/src/slices/batch` | 2 | `packages/app/src/slices/batch/index.test.ts:1` |
| `packages/app/src/slices/cancel` | 1 | `packages/app/src/slices/cancel/index.test.ts:1` |
| `packages/app/src/slices/checkpoints` | 5 | `packages/app/src/slices/checkpoints/change.test.ts:1` |
| `packages/app/src/slices/control` | 2 | `packages/app/src/slices/control/index.test.ts:1` |
| `packages/app/src/slices/estimate` | 2 | `packages/app/src/slices/estimate/index.test.ts:1` |
| `packages/app/src/slices/fonts` | 3 | `packages/app/src/slices/fonts/catalog.test.ts:1` |
| `packages/app/src/slices/library` | 3 | `packages/app/src/slices/library/lint.test.ts:1` |
| `packages/app/src/slices/narration` | 5 | `packages/app/src/slices/narration/chunk.test.ts:1` |
| `packages/app/src/slices/play-drafts` | 12 | `packages/app/src/slices/play-drafts/attachments.test.ts:1` |
| `packages/app/src/slices/project-templates` | 1 | `packages/app/src/slices/project-templates/service.test.ts:1` |
| `packages/app/src/slices/rebuild` | 44 | `packages/app/src/slices/rebuild/attempt-origin.test.ts:1` |
| `packages/app/src/slices/reruns` | 2 | `packages/app/src/slices/reruns/cascade.test.ts:1` |
| `packages/app/src/slices/research` | 3 | `packages/app/src/slices/research/planner.test.ts:1` |
| `packages/app/src/slices/revisions` | 28 | `packages/app/src/slices/revisions/adopt-history.test.ts:1` |
| `packages/app/src/slices/settings` | 8 | `packages/app/src/slices/settings/cli-paths.test.ts:1` |
| `packages/app/src/slices/schedules` | 3 | `packages/app/src/slices/schedules/calendar.test.ts:1` |
| `packages/app/src/slices/storage` | 12 | `packages/app/src/slices/storage/asset-name.test.ts:1` |
| `packages/app/src/slices/subtitles` | 3 | `packages/app/src/slices/subtitles/captions.test.ts:1` |
| `packages/app/src/slices/telemetry` | 7 | `packages/app/src/slices/telemetry/collector-client.test.ts:1` |
| `packages/app/src/slices/thumbnail` | 1 | `packages/app/src/slices/thumbnail/by-llm.test.ts:1` |
| `packages/app/src/slices/video` | 5 | `packages/app/src/slices/video/audio-inputs.test.ts:1` |
| `packages/app/src/updater` | 8 | `packages/app/src/updater/candidate.test.ts:1` |
| `packages/app/test` | 26 | `packages/app/test/article-run.test.ts:1` |
| `packages/app/test/e2e` | 5 | `packages/app/test/e2e/editable-projects.test.ts:1` |
| `packages/collector/src` | 1 | `packages/collector/src/index.test.ts:1` |
| `packages/site` | 1 | `packages/site/main.test.js:1` |
| `packages/web/src` | 2 | `packages/web/src/events.test.ts:1` |
| `packages/web/src/components` | 7 | `packages/web/src/components/lamp.test.tsx:1` |
| `packages/web/src/lib` | 2 | `packages/web/src/lib/draft-lint.test.ts:1` |
| `packages/web/src/play` | 32 | `packages/web/src/play/admission.test.ts:1` |
| `packages/web/src/project` | 32 | `packages/web/src/project/api.test.ts:1` |
| `packages/web/src/routes` | 17 | `packages/web/src/routes/entries.test.tsx:1` |
| `packages/web/src/subtitles` | 2 | `packages/web/src/subtitles/config.test.ts:1` |
| `packages/web/src/tutorial` | 5 | `packages/web/src/tutorial/play-navigation.test.tsx:1` |
| `packages/web/src/updates` | 2 | `packages/web/src/updates/api.test.ts:1` |

Fixture-only directories contain captured provider responses under `packages/app/src/adapters/{image,llm,tts}/fixtures`; they are consumed by the adapter tests and are not separate Vitest suites. Other helper files live beside their callers, including `revision-rebuild.fake.ts`, `editable-projects.fixture.ts`, and web `test-app.tsx`. `packages/app/src/adapters/image/fal.test.ts:1` `packages/app/src/adapters/llm/claude-code.test.ts:1` `packages/app/src/adapters/tts/elevenlabs.test.ts:1` `packages/app/test/revision-rebuild.fake.ts:52` `packages/app/test/e2e/editable-projects.test.ts:13` `packages/web/src/test-app.tsx:18`

Ubuntu CI uses Node 26 and runs `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm audit --audit-level=high`. Windows CI uses Node 26, installs and builds, then executes the focused commands below. The media and revision selections are narrower than the root full suite. `.github/workflows/ci.yml:8` `.github/workflows/ci.yml:25`

```sh
node packages/app/scripts/install-smoke.mjs
npx vitest run packages/app/src/adapters/ffmpeg.test.ts packages/app/src/main.test.ts packages/app/test/e2e/skeleton.test.ts packages/app/test/e2e/optional-outputs.test.ts packages/app/test/e2e/editable-projects.test.ts packages/app/test/e2e/play-drafts.test.ts packages/app/test/e2e/review-checkpoints.test.ts packages/app/test/review-checkpoints-restart.test.ts packages/app/src/adapters/alignment packages/app/src/slices/fonts packages/app/src/edge/http/fonts.test.ts packages/app/src/slices/subtitles
npx vitest run packages/app/test/video-render.test.ts -t "real subtitle export"
npx vitest run packages/app/src/kernel/cli-command.test.ts packages/app/src/adapters/llm packages/app/src/slices/settings/cli-paths.test.ts packages/app/src/slices/settings/cli-status.test.ts packages/app/src/adapter-registry-paths.test.ts
npx vitest run packages/app/src/catalog packages/app/src/kernel/runner/queue.test.ts packages/app/src/slices/batch packages/app/src/slices/narration/plan.test.ts packages/app/src/slices/narration/chunk.test.ts packages/app/src/edge/open-folder.test.ts packages/app/src/edge/http/files.test.ts packages/app/src/edge/http/storage.test.ts packages/app/src/edge/http/diagnostics.test.ts packages/app/src/edge/http/schedules.test.ts packages/app/src/slices/schedules packages/app/src/slices/video/subtitle-only.test.ts
npx vitest run packages/app/src/slices/storage/assets.test.ts packages/app/src/slices/storage/prepare.test.ts packages/app/src/slices/storage/reconcile.test.ts packages/app/src/slices/revisions packages/app/src/slices/rebuild packages/app/test/revision-rebuild.test.ts packages/app/test/revision-narration.test.ts packages/app/test/revision-provided.test.ts packages/app/test/revision-restart.test.ts packages/app/test/revision-article-recovery.test.ts packages/app/test/revision-bundle-recovery.test.ts packages/app/test/revision-research-rebuild.test.ts
```

## Doubles

- Play draft fixtures use disposable on-disk SQLite, real migrations, a fixed clock and independent IDs; reopen tests close/reopen that database, and review catalogue fetch throws if used. Web creation-replay fixtures route injected fetch calls through real draft CRUD against temporary SQLite, while held responses exercise late acknowledgements. `packages/app/src/slices/play-drafts/draft.fake.ts:17` `packages/app/src/slices/play-drafts/draft.fake.ts:71` `packages/app/src/slices/play-drafts/draft.fake.ts:83` `packages/web/src/play/draft-sqlite-fixture.ts:19` `packages/web/src/play/draft-sqlite-fixture.ts:54`
- Play real-HTTP tests boot the production application on an ephemeral loopback port in a temporary directory, upload supplied audio/images, restart the same data directory, cancel the accepted Start response body and replay its receipt. Assertions inspect saved bytes, project/batch/receipt counts and zero provider attempts; this is supplied-input admission evidence, not a real paid-provider journey. `packages/app/test/e2e/play-drafts.test.ts:34` `packages/app/test/e2e/play-drafts.test.ts:52` `packages/app/test/e2e/play-drafts.test.ts:92` `packages/app/test/e2e/play-drafts.test.ts:120`
- Provider doubles implement the actual ports: `fakeLlm` yields scripted `LlmEvent` streams and records calls/messages; `fakeTts` returns scripted or real fixture bytes through `TtsAudio`; `fakeImage` returns fixture bytes and records `ImageRequest`s. Their options inject refusal, per-attempt failures, and clock-driven delays. `packages/app/src/adapters/fake/llm.ts:17` `packages/app/src/adapters/fake/llm.ts:46` `packages/app/src/adapters/fake/tts.ts:6` `packages/app/src/adapters/fake/tts.ts:25` `packages/app/src/adapters/fake/image.ts:6` `packages/app/src/adapters/fake/image.ts:24`
- Revision/rebuild fixtures inject IDs, clocks, temporary SQLite/data directories, catalogue readers, readiness, and duration probes. Composed revision tests connect the real `wireRunner` to fake `Registry` ports and real FFmpeg; held promises make the ordering of edits, responses, and publication explicit. `packages/app/src/slices/revisions/revision.fake.ts:1` `packages/app/src/slices/rebuild/service.fake.ts:1` `packages/app/test/revision-rebuild.fake.ts:52` `packages/app/test/revision-rebuild.test.ts:13`
- Queue tests hold callback promises and use abort controllers to prove the global five-request limit, lower provider limit, canceled waiting requests, and slot reuse. `packages/app/src/kernel/runner/queue.test.ts:5` `packages/app/src/kernel/runner/queue.test.ts:28` `packages/app/src/kernel/runner/queue.test.ts:45`
- Catalogue tests use temporary YAML files and injected fetch responses to check last-valid retention, validation before replacement, and backups. Registry tests use fake ports for thinking compatibility and reject oversized physical TTS requests before submission. `packages/app/src/catalog/store.test.ts:19` `packages/app/src/catalog/store.test.ts:29` `packages/app/src/catalog/registry.test.ts:34` `packages/app/src/catalog/registry.test.ts:60`
- The real-HTTP fixtures boot the app with an ephemeral loopback port and temporary data directory, stage files through HTTP, inspect revision responses and downloads, and restart the app. The original skeleton additionally follows SSE. Media fixtures use the bundled FFmpeg or generated PCM WAV bytes; their assertions check playable media and byte preservation rather than fake audio strings. `packages/app/test/e2e/editable-projects.test.ts:39` `packages/app/test/e2e/editable-projects.test.ts:50` `packages/app/test/e2e/skeleton.test.ts:42` `packages/app/src/slices/rebuild/runtime-export-native.test.ts:9` `packages/app/src/slices/rebuild/runtime-export-native.test.ts:26` `packages/app/src/slices/rebuild/runtime-export-native.test.ts:50`
- Alignment worker tests create temporary child-process scripts that reply through the actual IPC boundary, hang, exit unsuccessfully, or emit omissions. These test process/protocol behavior without running a downloaded speech model. The application also exposes the `SubtitleAligner` port for controlled alignment output in media tests. `packages/app/src/adapters/alignment/runner.test.ts:12` `packages/app/src/adapters/alignment/runner.test.ts:21` `packages/app/src/adapters/alignment/runner.test.ts:45` `packages/app/src/kernel/ports/subtitles.ts:9`
- Web fixtures render real components through Testing Library, React Query, `AppProvider`, and a memory router where needed. Their injected fetch handles a local route-answer table and their default `EventSourceLike` never opens a connection; individual tests supply deliberate live events. `packages/web/src/test-app.tsx:48` `packages/web/src/test-app.tsx:61` `packages/web/src/test-app.tsx:80` `packages/web/src/test-app.tsx:146` `packages/web/src/routes/project-revisions.test.tsx:1`
- Collector tests implement `CollectorDb`/`CollectorStatement` over an in-memory `node:sqlite` database and invoke `worker.fetch` directly. Website tests pass structural fetch and UI doubles to the public site's functions. Neither fixture proves the deployed Cloudflare binding or actual browser layout. `packages/collector/src/index.test.ts:11` `packages/collector/src/index.test.ts:58` `packages/site/main.test.js:23` `packages/site/main.test.js:66`

## Coverage shape

The inventory is broadest by direct test-file count in rebuild (44), Play UI (32), project UI (32), HTTP routes (30), retained revisions (28), and composed app tests outside e2e (26). Runner, adapters, storage, admission, settings, updater, templates, schedules and telemetry also have colocated suites. These counts describe test distribution, not measured coverage percentages; no coverage provider/threshold is configured in the root or package Vitest configs. `vitest.config.ts:3` `packages/app/vitest.config.ts:3` `packages/web/vitest.config.ts:5` `packages/collector/vitest.config.ts:3` `packages/site/vitest.config.ts:3`

- Play backend suites cover incomplete draft persistence, version conflicts and exact create/save replay; shared attachment ownership, upload allocation rollback and restart recovery; current template/catalogue/font review identity; readiness and exact Start replay; all-or-nothing batch creation on copy failure; and committed receipts surviving telemetry/cleanup/dispatch failures. `packages/app/src/slices/play-drafts/service.test.ts:16` `packages/app/src/slices/play-drafts/service.test.ts:49` `packages/app/src/slices/play-drafts/service.test.ts:151` `packages/app/src/slices/play-drafts/uploads.test.ts:185` `packages/app/src/slices/play-drafts/review-readiness.test.ts:35` `packages/app/src/slices/play-drafts/start.test.ts:21` `packages/app/src/slices/play-drafts/start.test.ts:148` `packages/app/src/slices/play-drafts/start.test.ts:185`
- Play mounted suites exercise debounce/acknowledgement races, lost-response retry identity, cross-draft late restores, conflict recovery, removal/replacement/upload races, persistent variants/raw numeric inputs, four-section navigation and exact control focus. Tutorial suites cover durable step IDs, queued transition replay, conflicts and revealing hidden Play controls before measurement; their navigation test asserts no Start request. These are happy-dom interaction assertions, not browser layout measurements. `packages/web/src/play/draft-session.test.tsx:28` `packages/web/src/play/draft-session.test.tsx:86` `packages/web/src/play/draft-recovery.test.tsx:24` `packages/web/src/play/draft-upload-races.test.tsx:41` `packages/web/src/play/review.test.tsx:85` `packages/web/src/play/sections.test.tsx:7` `packages/web/src/play/field-targets.test.tsx:42` `packages/web/src/tutorial/session.test.tsx:115` `packages/web/src/tutorial/session.test.tsx:159` `packages/web/src/tutorial/play-navigation.test.tsx:19` `packages/web/src/tutorial/play-navigation.test.tsx:45`
- Revision suites cover legacy adoption, Save/Restore idempotency/conflicts, immutable manifests/assets, staged replacements, typed validation, partial/late publication, bundle recovery, historical downloads, and deletion retention. Source-return regressions exercise provided → generated → provided transitions through actual Save and publication, including missing originals and unchanged dormant references. `packages/app/src/slices/revisions/adopt.test.ts:1` `packages/app/src/slices/revisions/mutations.test.ts:1` `packages/app/src/slices/revisions/mutations-projection.test.ts:7` `packages/app/src/slices/revisions/publish.test.ts:1` `packages/app/src/slices/revisions/mutations-source-return.test.ts:24` `packages/app/src/slices/storage/delete-history.test.ts:1`
- Rebuild suites exercise dependencies, physical-request reuse, bundle completeness, exact snapshot/readiness authority, provider-family selection, provided-content consent, and interrupted execution. Composed tests include edits during delayed responses, changed research outlines, partial/cached article results, accepted async-job recovery, and database reopen. `packages/app/src/slices/rebuild/runtime-bundle-recovery.test.ts:1` `packages/app/src/slices/rebuild/runtime-dependency-recovery.test.ts:1` `packages/app/src/slices/rebuild/service-thumbnail-readiness.test.ts:1` `packages/app/src/slices/rebuild/service-request-limits.test.ts:17` `packages/app/test/revision-rebuild.test.ts:13` `packages/app/test/revision-research-rebuild.test.ts:1` `packages/app/test/revision-article-recovery.test.ts:1` `packages/app/test/revision-restart.test.ts:1`
- Project UI suites exercise Save/rebuild separation, preserved edits after refusals, upload races, stable image previews and ordering, narration overrides, captions before final export, stale manual cue correction, and History's actual text payload variants. They render the relevant editor/workspace components; `happy-dom` does not establish visual fidelity in a real browser. `packages/web/src/project/revision-workspace.test.tsx:1` `packages/web/src/project/image-preview.test.tsx:83` `packages/web/src/project/revision-caption-recovery.test.tsx:97` `packages/web/src/project/revision-history.test.tsx:1` `packages/web/src/routes/project-revisions.test.tsx:1` `packages/web/vitest.config.ts:9`
- Batch/request queues and estimates have dedicated tests for durable order and transitions, concurrency/cancellation, known and unknown costs, and request-based pricing. Character chunking tests cover boundaries, internal spaces, Unicode, oversized sentences, empty input, persisted configuration, and UI input; Windows includes the sentence splitter. `packages/app/src/slices/batch/index.test.ts:1` `packages/app/src/kernel/runner/queue.test.ts:4` `packages/app/src/slices/estimate/index.test.ts:1` `packages/app/src/slices/estimate/requests.test.ts:1` `packages/app/src/slices/narration/chunk.test.ts:147` `packages/web/src/play/chunking.test.tsx:1` `.github/workflows/ci.yml:39`
- Scheduled-job suites cover timezone occurrence arithmetic, strict input rules, versioned pause/resume/update, transactional one-off claims, duplicate-tick protection, HTTP problem contracts and the Schedules form/action flow. `packages/app/src/slices/schedules/calendar.test.ts` `packages/app/src/slices/schedules/service.test.ts` `packages/app/src/edge/http/schedules.test.ts` `packages/web/src/routes/schedules.test.tsx`
- Portable-storage tests round-trip settings, libraries, voices, templates and staged bytes, and HTTP tests cover ZIP size/type/refusal contracts plus secret-free diagnostics. The package smoke script packs the current workspace, installs it under a temporary global prefix, and launches both the global bin and npm-exec path against `/api/health`; Windows CI runs it after the build. `packages/app/src/slices/storage/portable.test.ts:1` `packages/app/src/edge/http/storage.test.ts:1` `packages/app/src/edge/http/diagnostics.test.ts:1` `packages/app/scripts/install-smoke.mjs:14` `.github/workflows/ci.yml:33`
- Subtitle/font suites include cue/timing/style reuse, parsing/rejection of font uploads, local font selection, HTTP contracts, and real FFmpeg rendering. Native export tests additionally check short-clip duration inspection without byte modification and relative render records. `packages/app/src/slices/subtitles/prepare.test.ts:1` `packages/app/src/slices/fonts/sfnt.test.ts:1` `packages/app/src/slices/fonts/catalog.test.ts:23` `packages/app/src/edge/http/fonts.test.ts:1` `packages/app/test/video-render.test.ts:1` `packages/app/src/slices/rebuild/runtime-export-native.test.ts:26`
- `slices/images` has no colocated `.test.ts` file; its behavior is exercised through `packages/app/test/images-run.test.ts` and revision tests. The website and collector each have one direct test file. Runtime hosting, real third-party network behavior, and real-browser rendering are outside those structural doubles. `packages/app/test/images-run.test.ts:1` `packages/app/test/revision-rebuild.test.ts:13` `packages/site/main.test.js:1` `packages/collector/src/index.test.ts:8` `packages/web/src/test-app.tsx:18`
- No separately configured load, chaos, security, or browser accessibility audit project exists. This does not mean security/error/accessibility behaviors lack individual assertions; the configured projects are the four Vitest projects listed above. `vitest.config.ts:6` `packages/app/vitest.config.ts:4` `packages/web/vitest.config.ts:7` `packages/collector/vitest.config.ts:4` `packages/site/vitest.config.ts:4`

## Recorded verification

- Historical 0.8.1/open-folder checkpoint on 2026-09-10: 1,909 tests passed with one platform skip; lint, type checking and build passed. The preceding 0.8.1 entry records its audit and browser checks at 1440/390/320 pixels. These are dated release records, not a current-source audit/browser rerun. `docs/capstone/changelog.d/2026-09-10-release-081-open-folder.md:9` `docs/capstone/changelog.d/2026-09-10-release-081.md:7`
- Linux at `29b88494eb404ea36f797929599db6a6e4ac8603`: the latest full unchanged-source rerun passed **2,586 tests**, with **one existing skip**, in **320 files**. The initial full run failed the legacy-plan WAV reuse case by trying to launch its deliberately invalid FFmpeg sentinel. An isolated native-enabled rerun passed all four file cases, then the full rerun passed. The initial failure's cause was not established; a sandbox-only attempt failed with FFmpeg permission errors and is not a product regression result. Execution logs: `/tmp/slopify-r7-full-tests.log:13`, `/tmp/slopify-r7-legacy-wav-native-recheck.log:5`, `/tmp/slopify-r7-full-tests-recheck.log:9`; relevant test: `packages/app/src/slices/video/subtitle-only.test.ts:1`.
- Native Windows at prior `239418c71e614a63aa9497121d2e9de7ccc7138b`: build passed; media selection passed **98 tests in 19 files** and revision selection passed **470 tests with one skip in 82 files**, totaling **568 passes and one skip**. This verifies that earlier backend/media snapshot; only the web image-preview change followed, and no exact-`29b8849` Windows run is claimed. Execution log: `/tmp/slopify-r6-native.log:101` `/tmp/slopify-r6-native.log:146`.

The fixture suites test bounded local behaviors with injected providers and isolated data. Their passes do not establish every provider response, disk-failure ordering, deployed hosting behavior, or real-browser interaction; evidence for those checks must identify its own environment and source snapshot. `packages/app/test/revision-rebuild.fake.ts:52` `packages/app/test/e2e/editable-projects.test.ts:39` `packages/web/src/test-app.tsx:18` `packages/collector/src/index.test.ts:8`

Durable completion and verification record: [editable-project implementation](changelog.d/2026-09-12-implement-editable-projects.md). Temporary execution logs supplement that record while available.
