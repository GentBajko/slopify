---
generated_date: 2026-09-02
capstone_version: 5.2.0
---

# Changelog

## 2026-09-03 - the support links move to the navbar
key: web/navbar-support
- User: "didn't I ask to put Github BMaC and Patreon on the navbar in every page on the app?" - and the earlier ask was "buttons like we did in the marketing page on every page of the app". The marketing page's placement is the masthead and it carries three links; they went into the app's footer and only two of them. Corrected: all three now sit in the app's top nav, right-aligned, in the masthead's own order, so every screen carries them. The footer goes back to its one line.
- The marketing footer was inconsistent with itself: the colophon's GitHub link was the only one of the three without an icon. It has one now, from the same mask the app uses.
- The accent is the mark's own green on the two donation links, so they read as something to press rather than another item of chrome. GitHub is a source link, not a donation, so its glyph takes the colour of the text beside it. The light theme darkens the accent to #5F8A2B for contrast, which is the token doing its job rather than the colour failing to apply - checked with computed styles, not by eye.
- Nine links in a 56 px bar do not fit forever: at 860 px "Intros & Outros" and "Buy Me a Coffee" wrapped and pushed the bar open. Found by resizing the real app rather than by reasoning about it. The links no longer wrap mid-phrase, and below 1100 px the three support labels stand down to their icons while keeping the same accessible name.
- Verified after: 1446 tests across 135 files, lint clean on 409, typecheck clean; the nav was screenshotted at 1440, 1024 and 860.

## 2026-09-03 - the hero recording, and the WSL browser
key: site/hero-and-wsl
- The recording landed, so the one asset this page was missing is no longer missing: `play-run.mp4` (31.1 s, 1152x648, 16:9, 60 fps, 11.1 MB), its poster, and an empty `play-run.vtt` cue list. The capture carries no audio stream, which is what the figcaption already claimed and what makes the next line free.
- User: "I would like an autoplay much more. And remove the controls from the player." Done, with three things that had to come with it. `muted` is not a preference - every browser refuses to autoplay audio, so without it the autoplay is silently blocked and the poster freezes instead; the silent capture makes it costless. `loop`, because a video with no controls that plays once can never be replayed. And `preload` moved from `none` to `metadata`, since a browser cannot autoplay what it has been told not to load.
- Reduced motion was the one case where a looping video is the wrong answer, and the page already honours it for the counter fades. `main.js` now hands the controls back and holds the poster frame for those visitors, so the page does not contradict its own accessibility floor. It does nothing for anyone else and nothing when the video is absent, which was still true when it was written.
- Checked rather than assumed: `moov` sits at byte 36 and `mdat` at 8481, so the file is already faststart and begins playing while it downloads - which matters for an 11 MB asset that now plays on arrival rather than on a click. The poster is 1152x648, the same frame size as the video.
- The poster is now nearly invisible: with autoplay it shows for an instant, and only persists for reduced-motion visitors. It was cut at second 14 at the user's request.
- WSL: the app opened a browser inside the distribution rather than the Windows one on screen. `process.platform` reads `linux` under WSL, so `openBrowser` took the `xdg-open` branch, and `wslview` is not installed by default. There is now a WSL check - `WSL_DISTRO_NAME` or `WSL_INTEROP` first, then `/proc/version`, because those variables are absent under `sudo` and in a shell a service started - and on WSL the opener crosses the interop boundary with `cmd.exe /c start`, reaching the Windows default browser.
- Writing that test found a real weakness: the guard against an unreadable `/proc/version` sat in the reader rather than around the injected call, so `isWsl` could still throw and take down the boot. A browser that will not open is a nuisance, never a reason to fail startup.
- Verified after: 1446 tests across 135 files, lint clean on 407, typecheck clean. `wrangler deploy --dry-run` reads 19 assets where it read 16.

## 2026-09-03 - the Nano Banana family, named as Google markets it
key: adapters/google-image-names
- User: "Why 3.1 flash? Latest is 3.8 flash and you did not include nano banana".
- Both halves settled against Google's live docs rather than a snapshot. `gemini-3.8-flash` is real, generally available 2026-09-02, and was twice called non-existent here on the strength of training data and a stale index - the live page should have been checked the first time it was questioned. It is also text-only: its documented output modality is text and image generation is listed "Not supported", so it cannot be an image model and offering it would have shipped a stage that failed on every call. It belongs to the LLM side, where Slopify has no direct Google provider yet.
- "Nano Banana" is Google's marketing name for the `gemini-*-image` family, not a separate model. One of the four was shipped, labelled with its API id, so it was invisible to anyone looking for the name they had actually heard. The picker now carries all four newest-first: Nano Banana 2 (`gemini-3.1-flash-image`), Nano Banana 2 Lite (`gemini-3.1-flash-lite-image`), Nano Banana Pro (`gemini-3-pro-image`), Nano Banana (`gemini-2.5-flash-image`). Imagen 4 is deprecated and left out.
- The image family's highest version is 3.1 even though the text side is on 3.8, which is exactly the confusion that made the question reasonable. A test now asserts every id this provider offers ends in `-image`, so a text-only model cannot be added here by accident.
- Verified in the built bundle, not just the source: all four ids and all four names are in the SPA a user downloads, and a grep for `gemini-3.8` finds nothing.
- Verified after: 1437 tests across 135 files, lint clean on 407, typecheck clean.

## 2026-09-03 - Google as its own image provider, and a local run
key: adapters/google-image
- User: "I have credits at google not at fal. Also we need a local run to be able to test without publishing."
- The correction it followed: the previous entry added Google's *models* hosted on fal, billed to a fal key. That was narrower than "add Google" reasonably reads, and was not flagged as such at the time. Google is now a fourth image provider of its own, keyed and billed separately, and the fal entries stay for anyone who prefers that host.
- Endpoint, auth and response were read from the API docs rather than assumed: `POST https://generativelanguage.googleapis.com/v1beta/interactions`, the key in an `x-goog-api-key` header rather than a query parameter that every proxy between here and Google would log, and the image returned as base64 in a `model_output` step's `content` beside any prose the model wrote. The part is found by type, not by index, so a model that narrates before it draws still works.
- `gemini-3.1-flash-image` is the one model listed, because it is the one the docs name. The field is free text, so a newer id can be typed before it is added.
- Aspect goes as the run's own `16:9` or `9:16`, so the closest supported size is exact and the render crops nothing - unlike OpenAI, whose 3:2 frames leave a sliver.
- The redactor needed no change: it already matches Google's `AIza` key prefix.
- Local run, so nothing has to be published to be tried: `npm start` builds and runs exactly what an install gets, and `npm run start:fresh` does the same against a throwaway `.slopify-local/` data directory. `npm run dev` is the Vite server for SPA iteration, proxying to a running app. No dependency was added for any of it.
- The drift guard from the previous entry now covers all four image providers, not just the two it was written for.
- A test bug found and fixed while writing it: the no-key case passed `undefined` to a defaulted parameter, which re-triggers the default, so it had been asserting against a request that *did* carry a key. The helper takes `null` for absent now.
- Verified after: 1436 tests across 135 files, lint clean on 407, typecheck clean. The built app was run locally and `/api/providers` lists `google-image`; the Settings screen was screenshotted showing Google as a fourth key row under Image generation.

## 2026-09-03 - fal: the Google image models
key: adapters/fal-google
- User: "we forgot to add Google Nano Banana and Flash 3.8 models to generate images".
- "Flash 3.8" does not exist. fal's catalogue, checked rather than assumed, carries `fal-ai/nano-banana`, `fal-ai/nano-banana-2` and `fal-ai/gemini-3.1-flash-image-preview` - Gemini 3.1 Flash Image. All three added; no id was invented to fill the name.
- Not a one-liner, exactly as the adapter's ceiling comment predicted: the three Google endpoints take `aspect_ratio` where the FLUX ones take an `image_size` enum, and everything else about the request is identical. Each catalogue entry now declares its aspect shape, and a model the map does not know falls back to `image_size` - the shape the adapter shipped with. The lookup is `Object.hasOwn`, because the model field is free text and a plain lookup would answer `constructor` from Object's prototype and send `[object Object]` as the frame.
- Near-miss: `packages/web/src/lib/models.ts` keeps a hand-copied duplicate of the catalogue, because the browser cannot import the adapters - they reach `node:fs` through `kernel/log.ts`. Adding the models to the adapter alone would have left the Play picker silently not offering them, and nothing guarded it. `models.test.ts` now reads the adapter source as text and asserts the two lists match; it was checked by deleting an entry and watching it fail, not by trusting a green run.
- `05-dependencies.md`: the fal row described a constraint that no longer holds and now describes the per-model aspect shape instead.
- Sweep correction the user prompted: the earlier de-citation pass matched lowercase `build S<n>` only, so `Build S13` and `Build S14` had survived in three rows of `05-dependencies.md`. Removed.
- Verified after: 1421 tests across 134 files, lint clean on 399, typecheck clean.

## 2026-09-03 - release 0.2.0
key: release/0.2.0
- Minor, not patch: the default port moved 4242 → 6969, so anyone upgrading from 0.1.0 finds nothing at the address they had bookmarked. Pre-1.0 puts a breaking change in the minor, and a patch bump would have understated it.
- Trusted publishing registered for `@gentbajko/slopify` against `GentBajko/slopify` / `release.yml` with publish permission, so the tag publishes over OIDC with provenance and no `NPM_TOKEN` exists to leak. The `v0.1.0` tag had failed with `ENEEDAUTH` and 0.1.0 was published by hand; this is the first release to go through CI as designed.
- CI npm is new enough: Node 26.8.1 ships npm 11.19.0, past the 11.5.1 that added OIDC publishing.
- Cloudflare deployed ahead of the tag, since the site and collector carry no version: collector `c54ec880`, site `c1d29ee4`. The live page was checked for the new port, the scoped install command and both donation links.

## 2026-09-03 - support links in the app, default port 6969
key: app/support-and-port
- User, before publishing: "add BMaC and Patreon buttons like we did in the marketing page on every page of the app", then "change the port to 69420".
- Support links: the two the marketing page carries now sit in the app's footer, which `Shell` renders under every route, so they are on all ten screens. `patreon.svg` and `buymeacoffee.svg` copied into `packages/web/src/assets/` and worn as masks by a new `SupportGlyph`, the same treatment the mark and the six stage glyphs already get - one copy of the artwork, taking its row's colour. Both open in a tab of their own: the app is a local server and a run may be in flight, so navigating the only tab away from it is never what the press meant.
- Verified by looking: footer screenshotted on Projects and on Settings, both themes, glyphs rendering and links underlined.
- Port: 69420 is not bindable. TCP ports are 16 bits, so the ceiling is 65535, and `parsePort` already refused anything above it - the app would have failed to start on its own default. Put to the user, who chose 6969: valid, and below Linux's ephemeral range (32768-60999), so the OS will never hand it to something else first.
- Changed in all ten places the number appears - `kernel/config`, the CLI docs in both READMEs, `packages/web/vite.config.ts`'s dev proxy, the marketing page's install section and options table, `01-architecture.md`, `07-operations.md`, and the tests that assert the URL. The `pid: 4242` in `claude-code.test.ts` is a process id, not a port, and was left alone.
- Verified after: 1411 tests, lint, typecheck and build clean; the built CLI boots on `http://127.0.0.1:6969` and answers `/api/health`.

## 2026-09-03 - docs and comments made definitive
key: docs/definitive
- User: "capstone docs shouldn't be pointing to interviews. They should be definitive", after the same for source comments: "sweep the whole repo and check the comments. Compress/shorten them and remove what is absolutely not necessary."
- Why it mattered: all nine `*-interview.md` files are gitignored, so every `§Q<n>` in a committed file pointed at something nobody who clones the repo has. 1056 comment lines in `packages/` and 829 parenthetical citations across the docs were dangling.
- Source comments: every citation rewritten so the sentence stands alone, never deleted and left hanging. `logic/<n>`, `§Q<n>`, `01-architecture`, `06-testing Doubles`, `uiux/screens/*`, `mockup/*`, the build-step ids `S0`-`S24` and `scenario <n>` are all gone from `packages/`. 68 comments that were bare quotations of spec prose became plain statements. Comment lines 3894 → 3689; the measured facts and the `ceiling:` notes were kept, since cutting those removes information rather than verbosity.
- Docs: `source:` and `implements:` frontmatter dropped; the eight "> Prescriptive: written from the design interview, not from code" blockquotes and every `mode: prescriptive` key removed; `mockup/README.md`'s "§Q implemented" column replaced with **Built as**, naming the file that implements each screen; `uiux/README.md`'s `§Q` column dropped.
- Stale facts found while in there and corrected: `npx slopify@latest` and "CI publishes `slopify`" in seven places, but the package has been `@gentbajko/slopify` since npm refused the bare name; `build S3`/`S4`/`S12`/`S13`/`S14` in `05-dependencies.md`, pointing into the gitignored plan; `uiux/screens/*` in `08-glossary.md`, `mockup/06-play.md` and `logic/03`, deleted in the purge; `## Module map (planned)` on a codebase where every path exists.
- Defects introduced by the automated passes and fixed: five comment blocks left with an unbalanced quote, three "one that fails fails the whole stage", one lowercase brand auto-capitalised to `Fal`, and six doc lines the citation strip gutted (a `(, a two-way door)`, an `(assumed; irreversibility per).`, four table cells in `05-dependencies.md`).
- This entry edits the ledger's own history, which the append-only rule normally forbids; done on the user's explicit instruction ("Edit changelog too"), and limited to removing interview pointers - no entry reordered, none removed, no claim changed.
- Verified after: 1411 tests across 133 files, `biome check` clean on 396 files, `tsc --noEmit` clean in all three packages, 0 broken markdown links and 0 dangling doc paths.

## 2026-09-03 - uiux: assets and screens removed
key: uiux/purge
- User, before publishing: "the assets and screens folders need to be purged. Assets have to stay in the app not docs."
- Removed: `uiux/assets/` (logo-mark, favicon, six stage glyphs, `reference-play.html`, `reference-screens.html`) and `uiux/screens/` (the ten per-screen design chapters). Git history holds all of them.
- Checked before removing: the eight SVGs the app uses are byte-identical copies already in `packages/web/src/assets/`, so nothing was lost. `app-icon.svg` existed only under `docs/` and was moved to `packages/web/public/app-icon.svg` rather than deleted. No source file imports anything from `docs/`; the 51 files that mention `uiux/screens/*` do so in comments citing the chapter a decision came from, and those citations are now pointers into history.
- Repointed: `00-index.md` drops both companion rows; `uiux/README.md` drops the screens table and says where the assets now live; `02-system.md`'s icon section names `packages/web/src/assets/` and `packages/web/public/` instead of `assets/`, and its Binding visual reference section records that the reference governed every screen step and that its palette survives as `packages/web/src/styles/index.css`'s tokens.
- `uiux/` keeps `01-direction.md`, `02-system.md`, `03-experience.md` and its README. `docs/` never shipped to npm (`files: ["dist"]`), so this is repository hygiene rather than a change to what is published.
- Verified after: 1411 tests, lint, typecheck and build all clean; `packages/web/dist/` carries `app-icon.svg` and `favicon.svg`.

## 2026-09-03 - build: all steps complete
key: build/all
- Steps S7-S24 complete, closing the plan: settings and provider readiness, the ports and the attempt wrapper, the prompt library, nine provider adapters across three families, all six pipeline stages, re-runs and cancel, telemetry counters and `/api/usage`, all ten screens, the marketing site, and the release pipeline.
- Final state: 1411 tests across 133 files, `biome check` clean on 395 files, `tsc --noEmit` clean in all three packages, `npm run build` clean, and the packed tarball boots outside the repository and serves the real SPA.
- **Shipping proof.** `npm pack` produces 155 files / 896.8 kB. Installed into `/tmp` with `npx./slopify-0.0.0.tgz --no-open`, it prints its URL, creates all 14 tables, answers `/api/health` with the version header, and serves the built SPA - the browser shows the full nav and the Play screen's six stage rails, with the shell correctly `aria-hidden` behind the first-run notice.
- **Defects found and fixed during the build, each by running the thing rather than reading about it.** Five errors in the recorded LLM research, the worst being that Claude Code reports `"subtype":"success"` alongside `"is_error":true` on API failures, so every failed call would have been stored as a finished article. Four in the TTS research: Cartesia's recorded `sonic-2` is retired and its version header was both stale and required. Three in the image research: Replicate's `Prefer: wait` caps at 60 s and then hands back a `starting` prediction, so every model slower than a minute would have failed. A nine-defect review of the runner (unguarded progress callback taking an uncaughtException and orphaning ffmpeg; file moves inside a rollback-able transaction; a shutdown path that was not a barrier; prototype keys bypassing slot validation). Intro and outro segment pieces written under the article stage's id but read under the audio stage's, so no video would ever have had an intro or an outro. `kernel/log.ts` not redacting Replicate's `r8_` key prefix. `cn()` silently dropping `text-small` across every screen since S6. The first-run notice promising less than the telemetry actually sends - no event timestamp, no `install` event, no event id.
- **Divergences from the plan, all recorded in `05-dependencies.md` or a `ceiling:` comment**: `@fastify/busboy` added at rung 5 after measuring undici's `formData()` at +1586 MiB RSS on a 512 MiB upload; `remark-gfm` added because strip-markdown cannot remove what remark never parsed; shadcn's own peers; TypeScript 7.0.2 rather than 5.x; ffmpeg 7.0.2 rather than the 6.1.1 the package tag claims; `kernel/{pipeline,events}.ts`, `kernel/db/tx.ts`, `kernel/runner/{attempt-repo,piece-repo,providers}.ts` and `adapter-registry.ts` added so the layers could hold; `trim=end_frame=1,setpts=PTS-STARTPTS` prepended to each ffmpeg image chain because `zoompan`'s `d=N` emits N frames per input frame.
- CI and the release workflow moved from Node 24 to 26: Node 26.0.0 shipped 2026-05-05, so the recorded "does not exist yet" reasoning expired. The whole suite was run on 26.8.1 before the pin changed.
- **Left for the user, and blocking a real launch rather than the build**: the Patreon and Buy Me a Coffee URLs (`*_URL_PLACEHOLDER`, ten occurrences); the hero recording for slopify.stream (`play-run.mp4`, its poster and its captions - wired, deliberately not faked); the D1 `database_id`, which only `wrangler d1 create` can produce; the `slopify.stream` zone on the Cloudflare account; and npm trusted publishing configured for this repository, without which the first `v*` tag fails with `ENEEDAUTH`.
- Deferred by the user, 2026-09-03: hovering a slopify.stream counter to reveal its top 5 models.

## 2026-09-03 - build: code (walking skeleton)
key: build/code
- Steps complete: S0 scaffold, S1 kernel and boot, S2 Hono edge and SSE, S3 storage slice, S4 admission/runner/video, S5 telemetry/collector/site, S6 web skeleton. The walking-skeleton slice runs: through a browser, a user dismisses the notice, pastes an article, uploads narration and three images, presses Play, watches the lamps reach done over SSE, plays the mp4 and downloads it byte-identical to the file on disk.
- Source created: `packages/app/src/{kernel,edge,slices,main.ts}`, `packages/web/src`, `packages/collector/src`, `packages/site/public`, plus `.github/workflows/{ci,release}.yml`, `.githooks/pre-commit`, `biome.json` carrying the kernel -> slices -> edge boundary rule (proven to fire), `vitest.config.ts` projects.
- Dependencies installed beyond the stack chapter's list: `@fastify/busboy` 3.2.2 (S3; the recorded rung-4 answer, Hono's `formData()`, buffers every part - measured +1586 MiB RSS on a 512 MiB upload, and `logic/05` caps no upload size), and shadcn's own peers `radix-ui`, `clsx`, `tailwind-merge`, `class-variance-authority` (S6; installed by its generator, not a separate decision). Both recorded in `05-dependencies.md`.
- Divergences from `implementation.md`: `layout()` lives in `kernel/paths.ts` alone rather than being duplicated in `slices/storage/layout.ts`; `kernel/{pipeline,events}.ts` and `kernel/db/tx.ts` were added so the runner could name the stage vocabulary without importing upward; the ffmpeg image chain gained `trim=end_frame=1,setpts=PTS-STARTPTS` because `zoompan`'s `d=N` emits N frames per input frame; `typescript@latest` resolved to 7.0.2 (the native compiler) rather than the 5.x the stack chapter assumed; `ffmpeg-static` 5.3.0 ships ffmpeg 7.0.2, not the 6.1.1 its release tag claims. Every one is recorded in `05-dependencies.md` or a `ceiling:` comment.
- Verified: 456 tests across 48 files, `biome check` clean on 155 files, `tsc --noEmit` clean in all three packages, `npm run build` clean. The zoom rule of `logic/11` was measured rather than eyeballed (a known-width rectangle reads 600 -> 690 px on image 1 and 544 -> 480 px on image 2, so 1.150 exactly, alternating).
- A 9-defect review pass ran against S4 before anything landed on top: an unguarded progress callback that would have taken an uncaughtException and orphaned an ffmpeg child, file moves inside a rollback-able transaction, a shutdown path that was not a barrier, prototype keys bypassing slot validation. All fixed, with the one finding rejected on `logic/13`'s authority (a stage whose output was stored in the same instant as a cancel stays `done`).
- Deferred by the user, 2026-09-03: hovering a slopify.stream counter to reveal its top 5 models. The event payload already carries `provider` and `model`, so picking it up costs a `(counter, provider, model)` table in the collector and an `/aggregates` extension.
- Remaining: S7-S24 (settings, attempt wrapper, library, provider adapters, the generate stages, re-runs and cancel, the full screens, the site, the release pipeline).

## 2026-09-02 - build: plan
key: build/plan
- Plan approved as drafted: `implementation.md`, written from the verified provider APIs and four review passes (coverage, order, sketches, full re-check).
- Layout: one repo, four npm workspaces. `packages/app` (the `slopify` package: `edge/` CLI + Hono HTTP + SSE, `kernel/` config/db/ids/clock/log/paths/runner/ports, `slices/` one per logic scenario, `adapters/{llm,tts,image,fake}`), `packages/web` (Vite + React 19 + TanStack Router/Query + Tailwind 4 SPA), `packages/site` (static marketing page), `packages/collector` (Cloudflare Worker +). Biome `noRestrictedImports` enforces kernel -> slices -> edge.
- Build order: 25 steps. S0 scaffold (workspaces, tsconfig, Biome + boundary rule, committed `.githooks/pre-commit`, Vitest projects, CI with `npm audit`, LICENSE, README). Walking skeleton S1-S6: boot with lock and migrations -> Hono skeleton with problem+json and SSE -> storage and staging -> admission, runner core, ffmpeg video -> telemetry, collector, site page -> web skeleton; at S6 a fully Provided project renders an mp4 through the UI and its event reaches the live counters. Then backend in logic-scenario order S7-S16, frontend in mockup/uiux screen order S17-S22, site and README S23, release pipeline S24.
- Per-step verification recorded in the plan's Build order table: unit and integration tests, `curl` checks, the `skeleton.test.ts` e2e, component tests, `wrangler deploy --dry-run`, and an `npx./packages/app/slopify-*.tgz --no-open` smoke from the packed tarball at S24. Spikes: bundled ffmpeg zoom (S4), research and CLI stream parsing through three LLM adapters (S10).
- Coverage: 16 logic scenarios, 10 screens (8 mockup + intros/outros + usage), 10 module-map components, the `05-dependencies.md` picks, and `uiux/02-system.md`'s implementation constraints all map to steps; deferrals (music, captions, YouTube upload, Google/Azure TTS, Stability/Imagen, worker threads, OS keychain, multi-instance, run queue) carry the decisions that exclude them.
- Execution mode: `subagent`, one per step, dispatched fresh and serially, each verified before the next.
- Docs in git: `docs_in_git: true`; `capstone.json` written. Interviews, `capstone.json`, `features/`, and `review.md` stay ignored; the ledger is committed.

## 2026-09-02 - readback: all
key: readback/all
- Every stage's decisions re-read in full against the stage-ownership table, so each one is recorded by the stage that owns it.
- Moved to their owning stage: SQLite as system of record → `01-architecture.md`; OpenRouter as LLM gateway → `05-dependencies.md`; the keyword layout → `uiux/03-experience.md`; the Usage page, the intro/outro library and the Play pickers, and the Chunking control, thumbnail modes and sources/glossary files → `mockup/`.
- Not moved: Node, Hono and React stay in `01-architecture.md` - frameworks are an architecture one-way door, versions are `05-dependencies.md`'s.
- Contradiction resolved: ESLint vs Biome for the boundary rule → Biome; `01-architecture.md`, `03-conventions.md` and `07-operations.md` reworded.
- Gap closed: CLI providers carry no key, so `logic/02` gained the installed / not-found rule and `mockup/03`, `06` were amended.
- Every relocation and resolution below carries its owning stage's entry.

## 2026-09-02 - logic: readback
key: logic/readback
- `logic/02-provider-credentials.md`: "Local agent CLI providers" section added (installed / not found, greying on Play, "CLI missing").
- `logic/03-placeholder-substitution.md`: group names Common / Text / Image; display cited to uiux (relocated).

## 2026-09-02 - mockup: readback
key: mockup/readback
- Taken over from `logic`: the Usage page; the intro/outro library with its pickers and narrated segments; the Chunking control, the thumbnail modes and the sources/glossary files. OpenRouter handed the other way, to the dependency picks.
- `mockup/06-play.md`: intro/outro pickers replace card toggles; Chunking control; keyword block Common / Text | Image with single-line fields.
- `mockup/03-settings.md`: outro card fields removed; Playback section (silence gap, Appearance); CLI provider rows with status.
- `mockup/08-project.md`: sources and glossary files; intro/body/outro players.
- `mockup/README.md`: rows for 09 and 10 pointing at uiux; amendments section marked applied.

## 2026-09-02 - uiux: readback
key: uiux/readback
- `uiux/screens/03-settings.md`, `06-play.md`, `08-project.md`: CLI provider status rows, greyed not-found providers, "CLI missing" control label.

## 2026-09-02 - architecture: readback
key: architecture/readback
- Taken over: SQLite as the system of record. Biome replaces the ESLint the boundary rule had named.
- `01-architecture.md`, `03-conventions.md`, `07-operations.md`: boundary rule reworded to Biome's `noRestrictedImports`; operations names Vitest, tsc, Biome commands.

## 2026-09-02 - stack: readback
key: stack/readback
- Taken over: OpenRouter as the LLM gateway.
- `05-dependencies.md`: the Biome row now carries the boundary rule.

## 2026-09-02 - stack: all
key: stack/all
- `05-dependencies.md`: rewritten with every pick, version floor, licence, pricing, and the no-dependency rows answered by the ladder.
- Picks: npm workspaces; `node:sqlite`; zod 4 + @hono/zod-validator; Vite 8 / tsc + tsx; TanStack Router 1; TanStack Query 5; Tailwind 4 + @fontsource Barlow; Vitest 4 + Testing Library + happy-dom; Biome 2 (boundary rule via noRestrictedImports); ulid; react-markdown + remark/strip-markdown; fflate; TTS ElevenLabs / OpenAI / Cartesia; images fal.ai / Replicate / OpenAI; web grounding per adapter; Cloudflare Workers + D1; plain-HTML site on Cloudflare; npm version + tag → Actions publish with provenance, Dependabot.
- Replaced from the architecture draft: ESLint boundary rule → Biome; Vercel-class hosting → Cloudflare (Hobby is non-commercial); "a query library / a validation library" → named picks.
- No dependency by the ladder: workspaces, SQLite driver, migrations, CLI args, browser opening, logging, HTTP client and SSE parsing, uploads, the marketing page.
- Rejected: better-sqlite3, valibot, arktype, Rsbuild, tsdown, react-router (second), wouter (licence), SWR, Google Fonts CDN, node:test as sole runner, jsdom, ESLint + Prettier, pino, openai SDK, remove-markdown, yazl, archiver, changesets, Vercel, Astro.
- Deferred: Google/Azure TTS, Stability/Imagen adapters, own ffmpeg platform packages.
- Research facts dated 2026-09-02; prices are vendor page quotes on that day.

## 2026-09-02 - standards: all
key: standards/all
- `standards.md`: binding rules for typing, libraries, paradigm, error handling, organization, testing, tooling, process, agent rules.
- Decision: all nine domains adopted as offered from `code-craft.md` and the architecture decisions; no override of the craft file.
- Withdrawn: a licence charging companies but not individuals; MIT stands; PolyForm Small Business 1.0.0, BSL 1.1 + Additional Use Grant, and AGPL + commercial examined and recorded for later.
- Ruled out: none of the domains.

## 2026-09-02 - architecture: all
key: architecture/all
- `00-index.md`: rewritten with the one-liner, planned module map, and the eight topic rows.
- `01-architecture.md` … `08-glossary.md`: written ahead of the code, with the globs each covers in `paths_covered`.
- One-way doors: single-process modular monolith (rejected daemon+UI and worker-thread variants); vertical slices on a kernel (rejected layered); three provider ports with HTTP and local-agent-CLI adapters for LLM; SQLite system of record, collector owns aggregates; SSE not WebSocket; SPA + static marketing site, no SSR; monorepo of app/web/site/collector.
- Runtime and frameworks: TypeScript, Node ≥ 26 (24 rejected in favour of 26 one month before its LTS), Hono 4.13, React 19.2 (versions checked via Context7 and npm on 2026-09-02).
- ffmpeg: bundled per platform through an npm dependency, spawned directly; fluent-ffmpeg (deprecated), ffmpeg.wasm (too slow, 2 GB cap), native libav bindings rejected.
- Security posture: plain-text keys with user-only permissions, 127.0.0.1 bind with a warned `--host`; collector rate limit + dedup, inflation accepted.
- Walking skeleton: boot → fully Provided project → mp4 → one telemetry event on the site. Spikes: research via three LLM adapters, bundled ffmpeg zoom on three OSes, CLI streaming parse.
- Deferred with triggers: worker threads, OS keychain, multi-instance, music/captions/upload, run queue.
- Accepted red flags: logs-only observability, no restore drills, best-effort collector.
- Not applicable, recorded: multi-tenant, compliance-heavy, legacy/migration, public API modules; testing/conventions details deferred to `standards` and `stack`.
- Cross-stage: local agent CLI providers need an "installed / not found" rule in `logic/02` and a Settings treatment in `uiux`; carried as an open thread into the readback.

## 2026-09-02 - uiux: all
key: uiux/all
- `uiux/01-direction.md`: read and mode map, the four sentences, strikes, candidates, the control-room contract (THESIS / OWN-WORLD / STORY / FIRST VIEWPORT), signature interaction, risk, colour strategy, theme, anti-defaults, alternates declined.
- `uiux/02-system.md`: Barlow + Barlow Condensed, dark and light palettes with contrast ratios, locked slime accent #9BCB4F, lamp colours, spacing and radius locks, Lucide, motion, shadcn/ui restyled, implementation constraints.
- `uiux/03-experience.md`: navigation, feedback thresholds, stop-and-confirm dialogs (seven actions), error recovery, disclosure, input burden, keyboard, accessibility floor, copy register.
- `uiux/screens/01-10`: one chapter per mockup screen plus intros-outros and usage (no mockup; assumed compositions).
- `uiux/assets/`: logo-mark.svg, favicon.svg, app-icon.svg, six stage glyphs; `reference-play.html` (both themes) saved at the user's request as a build reference, overriding the markdown-only authoring rule for this one asset.
- Decision: direction = the control room; alternates (edit bay, composing room, kitchen line) and the standing exit declined.
- Decision: mark = gooey play triangle with negative play cut-out and bubbles, slime green; per-glyph drips removed.
- Decision: dark from the use scene plus a light theme added at the gate.
- Decision: keywords in the cue sheet as Common on top, Text | Image split, superseding the flat tag rail proposed in between.
- Open: marketing headline and hero screenshot are proposals; Appearance control placement assumed; type scale and Lucide chosen by the stage.

## 2026-09-02 - logic: 16-telemetry
key: logic/16-telemetry
- `logic/16-telemetry.md`: machine ID on notice dismissal, per-stage events with counters and never-list, counting rules, queued deduplicated delivery, Usage page from the local log, marketing refresh 5 s.
- `logic/01-pipeline-lifecycle.md`: research progress now cites scenario 06's "k of N chapters".
- `mockup/README.md`: amendments gain the Usage page and the exact notice content.
- Decision: all seven offered defaults accepted unchanged; per-event IDs for deduplication.
- Ruled out: D1, D5, D6, D13.

## 2026-09-02 - logic: 15-prompt-management
key: logic/15-prompt-management
- `logic/15-prompt-management.md`: one rule set for prompts and intro/outro entries; name unique per kind; lint blocks Save; projects isolated from edits and deletes; duplicate naming; sort by name; no history.
- Decision: all five offered defaults accepted unchanged.
- Ruled out: D1, D4, D5, D6, D7, D8, D10, D11, D13.

## 2026-09-02 - logic: 14-storage-and-downloads
key: logic/14-storage-and-downloads
- `logic/14-storage-and-downloads.md`: `~/.slopify/` data directory (overridable), project folder layout, download names, delete rules, no automatic cleanup, single instance per directory.
- Decision: projects kept until deleted from the app; never cleaned automatically.
- Volunteered: a Usage page showing this install's own telemetry; settled in scenario 16, recorded for `uiux`.
- Ruled out: D1, D4, D5, D6, D7, D10, D13, D14.

## 2026-09-02 - logic: 13-cancel
key: logic/13-cancel
- `logic/13-cancel.md`: project-level cancel, immediate abort, kept vs discarded outputs, `canceled` state, resume via Retry, telemetry of completed calls only.
- `logic/01-pipeline-lifecycle.md`: `canceled` stage state and transitions added; project status derivation includes it.
- Decision: all five offered defaults accepted unchanged; completion wins over cancel in a race.
- Ruled out: D1, D4, D5, D6, D7, D13, D14.

## 2026-09-02 - logic: 12-reruns-and-edits
key: logic/12-reruns-and-edits
- `logic/12-reruns-and-edits.md`: article edit effects, per-stage re-runs, single-image regenerate/delete, stored-prompt edits, replacement uploads, automatic cascade, no version history.
- Decision: cascade is automatic to a fresh render; the stale-video alternative rejected.
- Decision: replaced outputs deleted, no history; old video downloadable until the new render finishes.
- Ruled out: D1, D4, D5, D7, D10, D13.

## 2026-09-02 - logic: 11-video-assembly
key: logic/11-video-assembly
- `logic/11-video-assembly.md`: timeline intro / gap / body / gap / outro, slideshow across the whole video, equal slots, alternate zoom 100↔115%, cover-crop, 1920×1080 / 1080×1920 at 30 fps, render failure without retries.
- Decision: intros and outros are narrated segments from a separate library (Text or LLM mode), not silent cards; supersedes mockup.
- Decision: silence gap between segments is a Settings field, default 3 s.
- `logic/01`, `02`, `03`, `04`, `07`, `08`: amended in place for intro/outro text writing, narration, keyword fields, admission, and the Settings change.
- `mockup/README.md`: "Amendments from logic" section added for `uiux`.
- Rejected: silent title/outro cards (default, withdrawn).
- Ruled out: D1, D5, D6, D10, D13.

## 2026-09-02 - logic: 10-thumbnail-prompt-by-llm
key: logic/10-thumbnail-prompt-by-llm
- `logic/10-thumbnail-prompt-by-llm.md`: new scenario: thumbnail template as LLM instruction, inputs, one written image prompt, image call per scenario 09, resume rules.
- `logic/04-run-admission.md`: LLM row also required when the thumbnail source is Prompt by LLM.
- `mockup/README.md`: Scenarios table gains S16; `mockup/06-play.md`: thumbnail control reads Off / From prompt / Prompt by LLM / Provide.
- Decision: all five offered defaults accepted unchanged.
- Ruled out: D1, D4, D5, D6, D13.

## 2026-09-02 - logic: 09-image-generation
key: logic/09-image-generation
- `logic/09-image-generation.md`: aspect-sized requests, Number parallel sends, deterministic slideshow order, per-image retries with resume, refusal without retries, thumbnail-from-prompt, storage fields.
- `logic/01-pipeline-lifecycle.md`: step 6 amended: image-generation calls time out at 300 s.
- Decision: all seven offered defaults accepted unchanged.
- Ruled out: D1, D4, D5, D13.

## 2026-09-02 - logic: 08-narration
key: logic/08-narration
- `logic/08-narration.md`: end-matter split into sources and glossary files, three chunking modes (Whole / Per paragraph / Every ~N words, default 500), parallel synthesis, in-order concatenation, chunk-level retries with resume, storage.
- Decision: the IPA glossary is a downloadable file only, never sent to the TTS.
- Decision: chunking is the user's per-run choice; supersedes the offered automatic paragraph chunking.
- Surfaced for `uiux`: Chunking control on Play's audio block; sources and glossary files on the project page.
- Ruled out: D1, D5, D6, D13.

## 2026-09-02 - logic: 07-article-writing
key: logic/07-article-writing
- `logic/07-article-writing.md`: message composition with research notes, streaming, up to 3 continuation calls, markdown + plain-text narration source + stored messages, failure rules.
- `logic/01-pipeline-lifecycle.md`: step 6 amended: the 120s timeout is an idle timeout between chunks for streaming calls.
- Decision: word-range misses accepted as written; the app never counts words.
- Decision: partial streamed text discarded on failure; retry regenerates the whole article.
- Ruled out: D1, D4, D5, D6, D8, D13.

## 2026-09-02 - logic: 06-research
key: logic/06-research
- `logic/06-research.md`: planner → one web-grounded sub-agent per chapter → editorial synthesis; built-in instruction; notes end with Sources; resumable retry; progress "k of N chapters".
- Decision: research requires web grounding; unsupported model fails the stage, no fallback.
- Decision: one sub-agent per chapter, chapters from the article prompt's section guide, planner proposes when absent, no cap.
- Decision: whole stage fails on one exhausted sub-agent; manual retry resumes from completed sub-agents, refining scenario 01's from-scratch retry for this stage.
- Rejected: single-call research (accepted then superseded).
- Ruled out: D1, D5, D7, D13.

## 2026-09-02 - logic: 05-provided-outputs
key: logic/05-provided-outputs
- `logic/05-provided-outputs.md`: per-stage acceptance rules, plain-text narration source, background and concurrent staging, validation timing, research forced Off with a provided article, attach-and-record rules.
- Decision: no size, duration, or length caps on user-provided content; principle "local app, let them do what they want".
- Decision: pasted markdown is stripped to plain text for narration; markdown display copy optional.
- Decision: uploads stage immediately in the background and survive page switches; tab close aborts; orphaned staging cleaned at app start.
- Carried to scenario 12: deleting generated images; uploading replacement outputs onto an existing project.
- Surfaced for `stack`: accepted audio/image formats follow the video renderer.
- Ruled out: D1, D4, D5, D7, D10, D13, D14.

## 2026-09-02 - logic: 04-run-admission
key: logic/04-run-admission
- `logic/04-run-admission.md`: required set, limits (Number 1-20, ≤60 images, title ≤200), images mandatory, live-disabled Play, fresh-form defaults, one project per click, form values kept per tab session.
- Decision: all seven offered defaults accepted unchanged.
- Decision: kept form values are tab-session state; restart returns defaults.
- Scenario list: `thumbnail-prompt-by-llm` added after `image-generation`; mockup README row S16 to be added when it is written.
- Ruled out: D1, D5, D7, D10, D13, D14.

## 2026-09-02 - logic: 03-placeholder-substitution
key: logic/03-placeholder-substitution
- `logic/03-placeholder-substitution.md`: slot grammar, lint with Save block, no escape, Generate-only field collection, Common / Article | Image grouping, value rules (200 chars, single-line), rendering and record rules, invariants.
- Decision: cap raised from 30 to 200 characters after one objection citing mockup text areas.
- Decision: fields are single-line inputs; supersedes the text areas drawn in `mockup/06-play.md`.
- Surfaced for `uiux`: Keywords block composition (Common on top, Article | Image columns).
- Ruled out: D1, D4, D5, D7, D9, D10, D11, D13, D14.

## 2026-09-02 - logic: 02-provider-credentials
key: logic/02-provider-credentials
- `logic/02-provider-credentials.md`: key save/remove rules, greyed-out unkeyed providers, model-fetch block, "Key missing" on affected projects, mid-run key swap, voice field rules, invariants.
- Decision: keys stored without a test call or format check.
- Decision: model list fetch failure blocks Play for that provider; no cache, no typed fallback.
- Decision: in-flight attempts keep the key they started with.
- Surfaced for `architecture`/`stack`: local SQLite as the store for keys and all app data.
- Ruled out: D1, D4, D5, D7, D11, D13.

## 2026-09-02 - logic: 01-pipeline-lifecycle
key: logic/01-pipeline-lifecycle
- `logic/01-pipeline-lifecycle.md`: execution graph (fan-out after article), stage and project states, retry policy, interruption rule, progress signals, invariants.
- Decision: fan-out after article over strictly sequential.
- Decision: 4 attempts per provider call (3 retries), 2s/8s/30s backoff, Retry-After on 429, 120s timeout except video render.
- Decision: manual retry only; no auto-resume after an interrupted process.
- Decision: unlimited parallel projects, no queue.
- Decision: provider error text shown verbatim on the failed stage.
- Ruled out: D1, D3, D5, D13 not in play for this scenario.

## 2026-09-02 - mockup: all
key: mockup/all
- `mockup/01-marketing-page.md`: slopify.stream single page; install command, how-to-use, live counters, donation links; serves J1.
- `mockup/02-first-run-notice.md`: once-per-machine telemetry notice, dismiss only; J1, J2.
- `mockup/03-settings.md`: API key per provider by category, voice list (name, provider, ID), outro card text; J1, J2.
- `mockup/04-prompts.md`, `mockup/05-prompt-editor.md`: three prompt kinds (article, image, thumbnail), `{{keyword}}` bodies; J2.
- `mockup/06-play.md`: one run per play; Generate/Provide per stage; per-run LLM/TTS/image provider and model, voice, format, cards, keywords; J2, J3, J4.
- `mockup/07-projects.md`: project list with status; J3, J6.
- `mockup/08-project.md`: stage-by-stage view with downloads, re-runs, cancel; J3-J6.
- `mockup/README.md`: screens, six journeys, 15 scenarios S1-S15 handed to `logic`, stack handoffs, assumed list.
- Purpose: one-run pipeline (research → article → TTS → images/thumbnail → slideshow video) for AI-slop YouTube channel operators; personal tool, single user is success.
- Distribution: self-hosted local web app via `npx slopify@latest` plus public marketing page; supersedes hosted web.
- Access: no login; supersedes single-owner login.
- Commercial model: free, BYO provider keys and spend; donation links on marketing page, app footer, README.
- Telemetry: anonymous machine ID, usage counters, no opt-out, first-run notice; live aggregates on the marketing page.
- Dropped: saved title list and title batches.
- Deferred to later, not rejected: background music, burned-in captions, YouTube upload.
- Surfaced for `stack`: OpenRouter as LLM gateway; TTS and image providers unnamed.
- Left open for `logic`: the 15 scenario rows in `mockup/README.md`, including substitution rules, narration of end matter and IPA hints, slideshow timing, failure and re-run semantics, telemetry counters.
- Vague at the gate: nothing quantified beyond "every few seconds" for counter refresh; marketing counter set and the wireframe conveniences recorded as assumed in `mockup/README.md`.
