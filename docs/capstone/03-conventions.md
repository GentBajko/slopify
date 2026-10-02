---
generated_at_commit: 8e5bc8b8156d
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: 40103f2a0f66
paths_covered:
  - ":(top)packages/app/src/**"
  - ":(top)packages/app/test/**"
  - ":(top)packages/web/src/**"
  - ":(top)packages/collector/src/**"
  - ":(top)packages/extension/src/**"
  - ":(top)packages/*/tsconfig*.json"
  - ":(top)packages/*/vitest.config.ts"
  - ":(top)packages/*/package.json"
  - ":(top)tsconfig.base.json"
  - ":(top)biome.json"
  - ":(top)vitest.config.ts"
  - ":(top)vitest.tmpdir.ts"
  - ":(top)package.json"
  - ":(top).githooks/**"
  - ":(top).github/workflows/**"
  - ":(top)docs/design-system.md"
  - ":(top)docs/development.md"
---

# Conventions

## Paradigm

- Functions over plain data everywhere. Across `packages/{app,web,collector,extension}/src` there are 16 `class` declarations. 13 are `Error` subclasses such as `BackupImportRefused` (`packages/app/src/slices/storage/backup-import.ts:87`) and `StylePreviewError` (`packages/app/src/slices/style-preview/render.ts:34`). The other three are small stateful helpers, `CommandRegistry` (`packages/web/src/components/kit/command-palette.tsx:55`), `ByteReader` (`packages/app/src/slices/storage/tar.ts:229`) and `Walker` (`packages/app/src/slices/narration/blocks.ts:122`).
- Services are factory functions that close over a deps object. There are 44 exported `create*` factories and 8 exported `open*` functions in non-test app source (openers such as `openDb` and `openLog`, plus the `openAi*`/`openRouter*` adapter factories), for example `createScheduleRunner` (`packages/app/src/slices/schedules/scheduler.ts:35`), `createApp` (`packages/app/src/edge/http/app.ts:226`) and `openLog` (`packages/app/src/kernel/log.ts:25`).
- Finite sets are `as const` arrays with a derived union type. No `enum` declaration occurs in any package. Examples: `stageKinds`, `stageStates`, `projectStates` and `formats` (`packages/app/src/kernel/pipeline.ts:6-52`), `providerErrorKinds` (`packages/app/src/kernel/ports/model.ts:43`), `reviewModes` (`packages/app/src/slices/reviews/model.ts:13`) and `trashKinds` (`packages/app/src/slices/trash/model.ts:13`).
- The app is organised as vertical slices under `packages/app/src/slices/`, 45 directories: admission, article, backups, batch, cancel, channels, checkpoints, control, document, episodes, estimate, eta, fixes, fonts, images, library, loudness, model-upkeep, narration, notifications, onboarding, patch-notes, play-drafts, project-templates, rebuild, reruns, research, reviews, revisions, run-cost, schedules, settings, shorts, storage, studio, style-preview, subtitles, telemetry, thumbnail, trash, tutorials, uploads, video, voices and youtube. They sit on `kernel/` (ports, runner, db, log, pipeline vocabulary) and under `edge/` (HTTP, CLI, events). Provider implementations live in `adapters/`, and `main.ts` is the composition root.
- Pure rule modules are split from I/O. `reruns/cascade.ts` reads no row or file (`packages/app/src/slices/reruns/cascade.ts:9-11`), and `fixes/rules.ts` and `notifications/rules.ts` are pure so that the web bundle can import them (`packages/app/src/slices/fixes/rules.ts:4-6`, `packages/app/src/slices/notifications/rules.ts:3-5`). A module the browser also imports opens with a `Browser-safe:` comment (`packages/app/src/slices/reviews/model.ts:4`, `packages/app/src/slices/studio/model.ts:5`). The web package imports such modules through `@app/*` in 229 non-test files (`packages/web/tsconfig.json:15`).
- The web package is React function components (367 exported PascalCase functions in non-test `.tsx`). It uses TanStack Query for server state (121 files use `useQuery`/`useMutation`) and TanStack Router (`packages/web/src/router.tsx`, `packages/web/src/main.tsx:10-11`).
- The collector is one Cloudflare Worker default export (`packages/collector/src/index.ts:21`). The Studio extension is plain modules with no framework (`packages/extension/src/`). The marketing site is plain JS (`packages/site/public/`, shallow: not inventoried).
- Deliberate numeric bounds carry a `// ceiling:` comment that names the reason. There are 95 of them in non-test app source, for example `packages/app/src/slices/reviews/model.ts:33` and `packages/app/src/kernel/log.ts:17`.

## Typing

- Every package extends `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, `isolatedModules`, `forceConsistentCasingInFileNames`, target ES2023 (`tsconfig.base.json:2-13`).
- Per-package module settings:

| Package | module / resolution | Emit | Config |
|---|---|---|---|
| app | `nodenext` / `nodenext`; relative imports carry `.js` | `tsc -p tsconfig.build.json` to `dist`, excluding `*.test.ts`, `*.fake.ts`, `adapters/fake`, `sample-build` | `packages/app/tsconfig.json:4-5`, `packages/app/tsconfig.build.json:8` |
| web | `preserve` / `bundler`, `jsx: react-jsx`, aliases `@/*` to `src/*` and `@app/*` to `../app/dist/*` | `noEmit` (Vite builds) | `packages/web/tsconfig.json:4-16` |
| collector | `preserve` / `bundler` | `noEmit` | `packages/collector/tsconfig.json:4-8` |
| extension | `preserve` / `bundler`, DOM libs | `noEmit` | `packages/extension/tsconfig.json:4-8` |

- `npm run typecheck` runs each workspace's `typecheck` (`package.json:10`). The web package's typecheck first builds the app's declaration files, because `@app/*` resolves to `dist` (`packages/web/package.json:9`, `packages/app/package.json:27`).
- Contracts are `interface`/`type` declarations (1,028 `interface` declarations across the packages). Runtime boundaries use Zod: 241 non-test app files import `zod`, 12 web files do, and 232 `zValidator(` call sites guard HTTP routes in `packages/app/src/edge/http/`. Zod schema constants are named `<thing>Schema` (154 exported), for example `trashItemSchema` (`packages/app/src/slices/trash/model.ts:16`) and `rebuildSelectionSchema` (`packages/app/src/slices/rebuild/model.ts:84`).
- Escape hatches, counted with grep over `packages/{app,web,collector,extension}/src`, `packages/app/test` and `packages/extension/test`:

| Hatch | Count | Where |
|---|---|---|
| explicit `any` | 1 | `packages/app/src/slices/storage/backup.test.ts:102` (`type Loose = any`, under a `biome-ignore`) |
| `as unknown as` | 43 | 36 in tests. Non-test: `packages/app/src/adapters/alignment/worker.ts:198-199` (ONNX runtime handles), `packages/app/src/slices/document/theme.ts:310,325` (theme merge), `packages/web/src/lib/document-theme-fields.ts:375,390`, `packages/web/src/routes/project.tsx:796` |
| other `as <Type>` assertions (lines matching `\w as [A-Z]\w*`, import/export lines excluded, non-test) | app 72, web 72, extension 6, collector 0 | for example DOM lookups in `packages/extension/src/options.ts:10`, and `response.json()` casts in `packages/web/src/http.ts:28` |
| `@ts-expect-error` | 2 | `packages/app/src/slices/settings/playback.test.ts:161,177` (deliberately invalid route input) |
| `@ts-ignore` / `@ts-nocheck` | 0 | |
| `biome-ignore` | 34 | `noArrayIndexKey` 12, `useSemanticElements` 6, `noNoninteractiveTabindex` 4, `noStaticElementInteractions` 3, `useExhaustiveDependencies` 3, `useKeyWithClickEvents` 2, `noTemplateCurlyInString` 2 (`packages/app/test/docker-launcher.test.ts:16,19`), `noAutofocus` 1, `noExplicitAny` 1. 31 are in `packages/web/src`, 11 of those in `components/kit/` |

## Error handling

- **Expected outcomes are values.** Slice services return discriminated unions `{ ok: true, value } | { ok: false, reason, message? }`. Non-test slice source has 569 `ok: false` sites, for example `VideoResult` (`packages/app/src/slices/channels/videos.ts:27-32`), `CheckpointRefusal` (`packages/app/src/slices/checkpoints/model.ts:43-44`) and `TrashRefusal`/`TrashResult` (`packages/app/src/slices/trash/model.ts:47-57`). Slices still use `throw` for faults: 373 `throw new` sites in non-test slice source.
- **Provider failures.** Adapters classify each failure once, into a `ProviderError` that carries a `fault.kind` from `providerErrorKinds`: `auth`, `missing_key`, `unavailable`, `rate_limit`, `refusal`, `unsupported`, `timeout`, `dropped`, `other` (`packages/app/src/kernel/ports/model.ts:43-70`). The attempt wrapper makes up to `attemptLimit = 4` attempts with backoff of 2 s, 8 s and 30 s. Per-kind timeouts are llm/tts 120 s, image 300 s and video 900 s (`packages/app/src/kernel/runner/attempt.ts:14-24`). `refusal`, `unsupported`, `auth`, `missing_key` and `unavailable` are terminal (`packages/app/src/kernel/runner/attempt.ts:29-35`). After in-call retries run out, `rate_limit`, `timeout` and `dropped` get persisted waits of about 2, 4, 8 and 16 minutes with ±25 % jitter (`packages/app/src/kernel/runner/retry-policy.ts:13-21`, `:40-53`). Slices never hold an adapter; Biome enforces this (`biome.json:82-89`).
- **Redaction.** Provider error text passes through `redact` before it reaches attempts, logs or the page (`packages/app/src/kernel/runner/attempt.ts:163,180,195`, `packages/app/src/kernel/log.ts:49-51`). `redact` matches key-like prefixes and `Bearer` tokens (`packages/app/src/kernel/log.ts:21-23`).
- **HTTP errors** are RFC 9457 `application/problem+json` (`packages/app/src/edge/http/problem.ts:29-42`). An unexpected error logs `correlationId method path: message` and sends the client a fixed sentence that names Download diagnostics in Settings plus the reference id (`packages/app/src/edge/http/problem.ts:44-65`), wired as Hono's `onError` (`packages/app/src/edge/http/app.ts:295`). A schema failure answers 400 with "reload the page" advice and an `errors[]` extension (`packages/app/src/edge/http/problem.ts:78-97`).
- **Web error surfacing.** `packages/web/src/http.ts` turns a response into a value or an `Error` whose message is the server's `detail` plus any `fields[]` (`packages/web/src/http.ts:58-73`). It invents no sentence of its own for server refusals. Its fallbacks are sentences too: `unreachable()` names the fix for Docker or native installs (`packages/web/src/http.ts:94-101`), `unexplained()` covers gateway and unknown statuses (`packages/web/src/http.ts:104-109`), and `understood()`/`unrecognised` handle a reply shaped for a newer server (`packages/web/src/http.ts:135-140`). Expected save refusals (400/409 with fields) come back as `SaveResult` values, not thrown errors (`packages/web/src/http.ts:20-22`, `:41-53`).
- **Message wording.** User-facing errors say what failed, why, and the one thing that fixes it, with the fix as the button (`docs/design-system.md:303-306`). Failures Slopify can name map to a fix-it action in one pure table, `fixFor` (`packages/app/src/slices/fixes/rules.ts:10`, `:58`). Info-tip copy is held to 8–75 words, with no "!" and no "I", by `packages/web/src/help/catalog.test.ts:55-65`.
- **Error chains.** `causedBy` joins an error's `cause` chain for the log; the page shows only the top sentence (`packages/app/src/kernel/errors.ts:1-12`).
- **Logging.** One JSON line per event (`ts`, `level`, `event`, optional `projectId`, `stage`, `detail`) goes to `slopify-YYYY-MM-DD.log` with mode `0600`. `LogFields` is a closed set of three strings, and `detail` is redacted (`packages/app/src/kernel/log.ts:5-45`).

## Dependency injection

- **App.** `boot` in `packages/app/src/main.ts:225` builds every dependency by hand and passes typed deps objects and closures, with no container or service locator. Steps: clock and ids (`:226-227`), `openDb` (`:252`), `openLog` (`:283`), the catalogue store (`:330`), the provider registry through `buildRegistry`/`curateRegistry` (`:335-336`), the schedule runner (`:533`), the HTTP app (`:599`) and the stage runner (`:907`).
- **Tests.** Tests inject doubles through the same deps shapes. Doubles are `*.fake.ts` files beside their subject (17 files, for example `packages/app/src/kernel/clock.fake.ts`, `packages/app/src/slices/rebuild/service.fake.ts`, `packages/web/src/routes/project-revision.fake.ts`), plus fake adapters in `packages/app/src/adapters/fake/{llm,tts,image}.ts`.
- **Web.** `AppDeps` (api, fetch, events and the rest) goes through `AppProvider`/`useApp` (`packages/web/src/app-context.tsx:10-32`). Tests build it with `testDeps(routes)` over `fakeFetch` (`packages/web/src/test-app.tsx:49`, `:69`).
- **Import layering** is enforced by Biome `noRestrictedImports` overrides. `kernel/**` may not import slices, edge or `adapter-registry.js` (`biome.json:44-66`). `slices/**` may not import edge, adapters, `kernel/ports/registry.js` or `adapter-registry.js` (`biome.json:69-95`). `adapters/**` may import only `kernel/ports` and `kernel/{clock,log,cli-command}` (`biome.json:98-127`). The web, collector and extension packages have no import restrictions.

## Web kit rules

`packages/web/src/components/kit/` holds the design-system primitives (`docs/design-system.md:49-114`). There are 191 non-test web files outside the kit that import from it. The kit is the only place allowed to write raw button classes and elements. `packages/web/src/kit-rules.test.ts` scans every non-test `.ts/.tsx` under `packages/web/src` outside `components/kit/` (`:20-25`) and enforces:

| Rule | Line |
|---|---|
| No import of `@/components/ui/button` or `@/components/ui/dialog` (the 2.x versions) | `packages/web/src/kit-rules.test.ts:54-60` |
| No hand-written `sl-btn*`, `sl-key*` or `buttonClass(` | `:62-68` |
| No `onClick` on an `<a>`: an action is a `Button`, a link goes somewhere | `:70-74` |
| No raw `<button>` except the rail search field (`className="sl-searchbtn"`) in `components/shell.tsx` | `:76-88` |
| A `ListRow` is selected through `onSelect`, never a button placed in its `title` | `:90-96` |
| No `onClick` on `li`, `tr`, `article` or `figure`: a row or card is one target | `:98-106` |
| Each `project/body-*.tsx` has at most one of `OpenFolder`/`OutputFolder`/`StageFiles`/`DownloadLink` | `:110-121` |
| No `FileLink` with `variant="quiet"` | `:126-132` |

- Button kinds: `ButtonVariant = "primary" | "secondary" | "quiet" | "destructive" | "icon"`, one meaning each (`packages/web/src/components/kit/button.tsx:5-9`). `disabledReason` becomes the tooltip of a disabled button (`:25-26`, `:43`). `IconButton` requires a `label` (`:54-76`). `PlayKey` is used only to start runs (`:78-80`).
- Kit modules: action-bar, audio-player, board, button, callout, command-palette, dialog (`Dialog`, `ConfirmDialog`), drawer, empty-state, facts, field (`Field`, `Input`, `Textarea`, `Select`), info-tip, layout (`PageHeader`, `Workspace`, `ListDetail`), link (`ButtonLink`, `TextLink`, `FileLink`), list-row, media, media-controls, menu, next-action, page-bar, player, popover, rail, reading-view, section-head, stats, status (`Lamp`, `Status`, `Badge`, `Chip`), steps, switch (`Switch`, `Segmented`), tabs and toast (`packages/web/src/components/kit/`). Kit behaviour is tested in `packages/web/src/components/kit/kit.test.tsx`.
- `packages/web/src/components/ui/` still holds Radix-based `dialog`, `dropdown-menu`, `input`, `label`, `picker`, `popover`, `select` and `toggle-group`, imported by 20 non-test files. Only its `button` and `dialog` are banned.
- Other source-scanning rule tests:
  - `packages/web/src/styles/grid.test.ts:21-31`: no arbitrary pixel spacing (`p-[10px]`, `gap-[6px]`) outside the kit.
  - `packages/web/src/styles/tokens.test.ts:19-34`: the two light-theme token blocks in `index.css` stay identical, and every light token has a dark default.
  - `packages/web/src/click-budget.test.tsx:15-20`: click budgets for five common tasks.
  - `packages/web/src/help/catalog.test.ts:41-75`: every help id a screen uses exists, and every Learn more link resolves.
- Class naming: kit CSS classes use the `sl-` prefix with BEM-style `__element` and `--modifier` (`packages/web/src/styles/kit.css:8`, `packages/web/src/components/kit/list-row.tsx:8-9`).

## Naming

- Every `.ts`/`.tsx` file name in `packages/{app,web,collector,extension}/src` and `packages/app/test` is lowercase kebab-case; a grep for other characters finds none.
- Suffixes: `*.test.ts(x)` for tests, `*.fake.ts` for doubles, `*-schema.ts`/`schema.ts` for Zod shapes, `model.ts` for a slice's vocabulary, `repo.ts` for SQL access and `service.ts` for orchestration (for example `packages/app/src/slices/trash/{model,service}.ts`, `packages/app/src/slices/backups/{model,repo,service}.ts`).
- SQL migrations are `NNNN-kebab-name.sql`: 40 files, the latest `0047-studio-autopilot.sql`, with gaps in the numbering (`packages/app/src/kernel/db/migrations/`).
- Identifiers follow the product's words: `trashDays`, `reviewModes`, `studioUploadUrl`, `earlierEpisodesMax`. Limits are `<thing>Max`/`<thing>Min` (`packages/app/src/slices/shorts/model.ts:32-35`, `packages/app/src/slices/backups/model.ts:11-13`). Result types are `<Slice>Result<T>` (`ChannelResult`, `TrashResult`, `ScheduleResult`, `DraftResult`).

## Tests and tooling

- Tests sit beside their source: app has 517 test files in `src/` against 670 non-test sources, and web 200 against 376. Cross-slice integration tests live in `packages/app/test/` (51 files, plus `test/e2e`). The extension's three tests (`fill`, `studio-pages`, `video-picker`) are in `packages/extension/test/`, and the site's are `packages/site/*.test.js`.
- Vitest runs as one root project list (`vitest.config.ts:4-8`) with a global setup that points `TMPDIR` at a per-run directory and removes it afterwards (`vitest.tmpdir.ts:8-17`). App tests are `src/**/*.test.ts` and `test/**/*.test.ts`, with a 30 s timeout on Windows only (`packages/app/vitest.config.ts:6-11`). Web and extension use `happy-dom` (`packages/web/vitest.config.ts:9-10`, `packages/extension/vitest.config.ts:6-7`).
- Biome 2 formats and lints: 2-space indent, line width 100, double quotes, semicolons, trailing commas, `recommended` rules, organize-imports on. `docs`, `dist`, `coverage` and the extension fixtures are excluded (`biome.json:9-48`). `npm run lint` is `biome check .` (`package.json:8`).
- The pre-commit hook runs `biome check --staged` (`.githooks/pre-commit:4`) and is enabled per clone with `git config core.hooksPath .githooks` (`docs/development.md:10`).
- CI runs lint, typecheck, build and `npm audit --audit-level=high` (`.github/workflows/ci.yml:19-25`), Vitest in 5 shards (`:35`, `:43`), then a Windows job (`:46-65`) and a two-way Docker smoke matrix (`:95-118`), each job with a `timeout-minutes` cap (`:12`, `:31`, `:50`, `:77`, `:99`).
