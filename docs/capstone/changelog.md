---
generated_date: 2026-09-02
capstone_version: 5.2.0
---

# Changelog

## 2026-09-02 - build: plan
key: build/plan@Q3
- Plan approved as drafted (Q1): `implementation.md`, written from R1's verified APIs and four review passes (coverage, order, sketches, full re-check).
- Layout: one repo, four npm workspaces. `packages/app` (the `slopify` package: `edge/` CLI + Hono HTTP + SSE, `kernel/` config/db/ids/clock/log/paths/runner/ports, `slices/` one per logic scenario, `adapters/{llm,tts,image,fake}`), `packages/web` (Vite + React 19 + TanStack Router/Query + Tailwind 4 SPA), `packages/site` (static marketing page), `packages/collector` (Cloudflare Worker + D1). Biome `noRestrictedImports` enforces kernel -> slices -> edge.
- Build order: 25 steps. S0 scaffold (workspaces, tsconfig, Biome + boundary rule, committed `.githooks/pre-commit`, Vitest projects, CI with `npm audit`, LICENSE, README). Walking skeleton S1-S6 (architecture §Q30): boot with lock and migrations -> Hono skeleton with problem+json and SSE -> storage and staging -> admission, runner core, ffmpeg video -> telemetry, collector, site page -> web skeleton; at S6 a fully Provided project renders an mp4 through the UI and its event reaches the live counters. Then backend in logic-scenario order S7-S16, frontend in mockup/uiux screen order S17-S22, site and README S23, release pipeline S24.
- Per-step verification recorded in the plan's Build order table: unit and integration tests, `curl` checks, the `skeleton.test.ts` e2e, component tests, `wrangler deploy --dry-run`, and an `npx ./packages/app/slopify-*.tgz --no-open` smoke from the packed tarball at S24. Spikes: bundled ffmpeg zoom (S4), research and CLI stream parsing through three LLM adapters (S10).
- Coverage: 16 logic scenarios, 10 screens (8 mockup + intros/outros + usage), 10 module-map components, the `05-dependencies.md` picks, and `uiux/02-system.md`'s implementation constraints all map to steps; deferrals (music, captions, YouTube upload, Google/Azure TTS, Stability/Imagen, worker threads, OS keychain, multi-instance, run queue) carry the decisions that exclude them.
- Execution mode (Q2): `subagent`, one per step, dispatched fresh and serially, each verified before the next.
- Docs in git (Q3): `docs_in_git: true`; `capstone.json` written. Interviews, `capstone.json`, `features/`, and `review.md` stay ignored; the ledger is committed.

## 2026-09-02 - readback: all
key: readback/all@Q135
- Read: mockup-, logic-, uiux-, architecture-, standards-, stack-interview.md in full against core.md's Stage ownership table.
- Relocated: SQLite (logic §Q17 → architecture §Q34); OpenRouter (mockup §Q16 → stack §Q3); keyword layout (logic §Q26 → uiux §Q14, already re-decided there; logic copy annotated); Usage page (logic §Q119 → mockup §Q29); intro/outro library and Play pickers (logic §Q90, §Q91, §Q98 → mockup §Q30); Chunking control, thumbnail modes, sources/glossary files (logic §Q65, §Q78, §Q64 → mockup §Q31).
- Not moved: Node, Hono, React named in architecture §Q4 (frameworks are an architecture one-way door; versions are stack's).
- Contradiction: architecture §Q16 ESLint vs stack C9 Biome → architecture gave way (§Q35); chapters reworded.
- Gap: CLI providers without keys (architecture §Q10) → logic §Q135 adds the installed / not-found rule; logic/02, mockup 03/06, uiux 03/06/08 amended.
- Every relocation and resolution below carries its owning stage's entry.

## 2026-09-02 - logic: readback
key: logic/readback@Q135
- `logic/02-provider-credentials.md`: "Local agent CLI providers" section added (installed / not found, greying on Play, "CLI missing") (Q135).
- `logic/03-placeholder-substitution.md`: group names Common / Text / Image; display cited to uiux (Q26 relocated).
- Interview: Q17, Q26, Q64, Q65, Q78, Q90, Q91, Q98, Q119 annotated as relocated in their surface part.

## 2026-09-02 - mockup: readback
key: mockup/readback@Q31
- `mockup-interview.md`: Q29 (Usage page), Q30 (intro/outro library, pickers, narrated segments), Q31 (Chunking control, thumbnail modes, sources/glossary files) appended with their sources; Q16 annotated (OpenRouter relocated to stack).
- `mockup/06-play.md`: intro/outro pickers replace card toggles; Chunking control; keyword block Common / Text | Image with single-line fields.
- `mockup/03-settings.md`: outro card fields removed; Playback section (silence gap, Appearance); CLI provider rows with status.
- `mockup/08-project.md`: sources and glossary files; intro/body/outro players.
- `mockup/README.md`: rows for 09 and 10 pointing at uiux; amendments section marked applied.

## 2026-09-02 - uiux: readback
key: uiux/readback@Q19
- `uiux/screens/03-settings.md`, `06-play.md`, `08-project.md`: CLI provider status rows, greyed not-found providers, "CLI missing" control label (logic Q135).

## 2026-09-02 - architecture: readback
key: architecture/readback@Q35
- `architecture-interview.md`: Q34 (SQLite, relocated from logic §Q17), Q35 (Biome replaces the ESLint naming of §Q16).
- `01-architecture.md`, `03-conventions.md`, `07-operations.md`: boundary rule reworded to Biome's `noRestrictedImports`; operations names Vitest, tsc, Biome commands.

## 2026-09-02 - stack: readback
key: stack/readback@Q3
- `stack-interview.md`: Q3 (OpenRouter, relocated from mockup §Q16).
- `05-dependencies.md`: Biome row now cites architecture §Q35.

## 2026-09-02 - stack: all
key: stack/all@Q2
- `05-dependencies.md`: rewritten with every pick, version floor, licence, pricing, and the no-dependency rows answered by the ladder.
- Picks: npm workspaces; `node:sqlite`; zod 4 + @hono/zod-validator; Vite 8 / tsc + tsx; TanStack Router 1; TanStack Query 5; Tailwind 4 + @fontsource Barlow; Vitest 4 + Testing Library + happy-dom; Biome 2 (boundary rule via noRestrictedImports); ulid; react-markdown + remark/strip-markdown; fflate; TTS ElevenLabs / OpenAI / Cartesia; images fal.ai / Replicate / OpenAI; web grounding per adapter; Cloudflare Workers + D1; plain-HTML site on Cloudflare; npm version + tag → Actions publish with provenance, Dependabot (Q2).
- Replaced from the architecture draft: ESLint boundary rule → Biome; Vercel-class hosting → Cloudflare (Hobby is non-commercial); "a query library / a validation library" → named picks.
- No dependency by the ladder: workspaces, SQLite driver, migrations, CLI args, browser opening, logging, HTTP client and SSE parsing, uploads, the marketing page (Q2).
- Rejected: better-sqlite3, valibot, arktype, Rsbuild, tsdown, react-router (second), wouter (licence), SWR, Google Fonts CDN, node:test as sole runner, jsdom, ESLint + Prettier, pino, openai SDK, remove-markdown, yazl, archiver, changesets, Vercel, Astro.
- Deferred: Google/Azure TTS, Stability/Imagen adapters, own ffmpeg platform packages.
- Research facts dated 2026-09-02 in `stack-interview.md` §R1; prices are vendor page quotes on that day.

## 2026-09-02 - standards: all
key: standards/all@Q10
- `standards.md`: binding rules for typing, libraries, paradigm, error handling, organization, testing, tooling, process, agent rules.
- Decision: all nine domains adopted as offered from `code-craft.md` and the architecture decisions; no override of the craft file (Q1-Q9).
- Withdrawn: a licence charging companies but not individuals; MIT stands; PolyForm Small Business 1.0.0, BSL 1.1 + Additional Use Grant, and AGPL + commercial examined and recorded for later (Q10).
- Ruled out: none of the domains.

## 2026-09-02 - architecture: all
key: architecture/all@Q33
- `00-index.md`: rewritten with the one-liner, planned module map, and the eight topic rows.
- `01-architecture.md` … `08-glossary.md`: written `mode: prescriptive` from `architecture-interview.md`; planned globs in `paths_covered`; `map` rewrites them once code exists.
- One-way doors: single-process modular monolith (Q8; rejected daemon+UI and worker-thread variants); vertical slices on a kernel (Q9; rejected layered); three provider ports with HTTP and local-agent-CLI adapters for LLM (Q10, Q33); SQLite system of record, collector owns aggregates (Q11); SSE not WebSocket (Q12); SPA + static marketing site, no SSR (Q13); monorepo of app/web/site/collector (Q14).
- Runtime and frameworks: TypeScript, Node ≥ 26 (Q4, Q4a: 24 rejected in favour of 26 one month before its LTS), Hono 4.13, React 19.2 (versions checked via Context7 and npm on 2026-09-02).
- ffmpeg: bundled per platform through an npm dependency, spawned directly; fluent-ffmpeg (deprecated), ffmpeg.wasm (too slow, 2 GB cap), native libav bindings rejected (Q26).
- Security posture: plain-text keys with user-only permissions, 127.0.0.1 bind with a warned `--host` (Q6); collector rate limit + dedup, inflation accepted (Q7).
- Walking skeleton: boot → fully Provided project → mp4 → one telemetry event on the site (Q30). Spikes: research via three LLM adapters, bundled ffmpeg zoom on three OSes, CLI streaming parse (Q29).
- Deferred with triggers: worker threads, OS keychain, multi-instance, music/captions/upload, run queue (Q31).
- Accepted red flags: logs-only observability, no restore drills, best-effort collector (Q32).
- Not applicable, recorded: multi-tenant, compliance-heavy, legacy/migration, public API modules; testing/conventions details deferred to `standards` and `stack`.
- Cross-stage: local agent CLI providers need an "installed / not found" rule in `logic/02` and a Settings treatment in `uiux`; logged in `logic-interview.md` open threads for the readback (Q10).

## 2026-09-02 - uiux: all
key: uiux/all@Q19
- `uiux/01-direction.md`: read and mode map, the four sentences, strikes, candidates, the control-room contract (THESIS / OWN-WORLD / STORY / FIRST VIEWPORT), signature interaction, risk, colour strategy, theme, anti-defaults, alternates declined.
- `uiux/02-system.md`: Barlow + Barlow Condensed, dark and light palettes with contrast ratios, locked slime accent #9BCB4F, lamp colours, spacing and radius locks, Lucide, motion, shadcn/ui restyled, implementation constraints.
- `uiux/03-experience.md`: navigation, feedback thresholds, stop-and-confirm dialogs (seven actions), error recovery, disclosure, input burden, keyboard, accessibility floor, copy register.
- `uiux/screens/01-10`: one chapter per mockup screen plus intros-outros and usage (no mockup; assumed compositions).
- `uiux/assets/`: logo-mark.svg, favicon.svg, app-icon.svg, six stage glyphs; `reference-play.html` (both themes) saved at the user's request as a build reference, overriding the markdown-only authoring rule for this one asset.
- Decision: direction = the control room; alternates (edit bay, composing room, kitchen line) and the standing exit declined (Q13).
- Decision: mark = gooey play triangle with negative play cut-out and bubbles, slime green; per-glyph drips removed (Q5-Q9).
- Decision: dark from the use scene plus a light theme added at the gate (Q3, Q19).
- Decision: keywords in the cue sheet as Common on top, Text | Image split (Q14), superseding the flat tag rail proposed in between.
- Open: marketing headline and hero screenshot are proposals; Appearance control placement assumed; type scale and Lucide chosen by the stage.

## 2026-09-02 - logic: 16-telemetry
key: logic/16-telemetry@Q134
- `logic/16-telemetry.md`: machine ID on notice dismissal, per-stage events with counters and never-list, counting rules, queued deduplicated delivery, Usage page from the local log, marketing refresh 5 s.
- `logic/01-pipeline-lifecycle.md`: research progress now cites scenario 06's "k of N chapters".
- `mockup/README.md`: amendments gain the Usage page and the exact notice content.
- Decision: all seven offered defaults accepted unchanged (Q127-Q133); per-event IDs for deduplication (Q134).
- Ruled out: D1, D5, D6, D13 (Q134).

## 2026-09-02 - logic: 15-prompt-management
key: logic/15-prompt-management@Q126
- `logic/15-prompt-management.md`: one rule set for prompts and intro/outro entries; name unique per kind; lint blocks Save; projects isolated from edits and deletes; duplicate naming; sort by name; no history.
- Decision: all five offered defaults accepted unchanged (Q121-Q125).
- Ruled out: D1, D4, D5, D6, D7, D8, D10, D11, D13 (Q126).

## 2026-09-02 - logic: 14-storage-and-downloads
key: logic/14-storage-and-downloads@Q120
- `logic/14-storage-and-downloads.md`: `~/.slopify/` data directory (overridable), project folder layout, download names, delete rules, no automatic cleanup, single instance per directory.
- Decision: projects kept until deleted from the app; never cleaned automatically (Q118).
- Volunteered: a Usage page showing this install's own telemetry (Q119); settled in scenario 16, recorded for `uiux`.
- Ruled out: D1, D4, D5, D6, D7, D10, D13, D14 (Q120).

## 2026-09-02 - logic: 13-cancel
key: logic/13-cancel@Q113
- `logic/13-cancel.md`: project-level cancel, immediate abort, kept vs discarded outputs, `canceled` state, resume via Retry, telemetry of completed calls only.
- `logic/01-pipeline-lifecycle.md`: `canceled` stage state and transitions added; project status derivation includes it (Q111).
- Decision: all five offered defaults accepted unchanged (Q108-Q112); completion wins over cancel in a race (Q113).
- Ruled out: D1, D4, D5, D6, D7, D13, D14 (Q113).

## 2026-09-02 - logic: 12-reruns-and-edits
key: logic/12-reruns-and-edits@Q107
- `logic/12-reruns-and-edits.md`: article edit effects, per-stage re-runs, single-image regenerate/delete, stored-prompt edits, replacement uploads, automatic cascade, no version history.
- Decision: cascade is automatic to a fresh render; the stale-video alternative rejected (Q102).
- Decision: replaced outputs deleted, no history; old video downloadable until the new render finishes (Q106).
- Ruled out: D1, D4, D5, D7, D10, D13 (Q107).

## 2026-09-02 - logic: 11-video-assembly
key: logic/11-video-assembly@Q100
- `logic/11-video-assembly.md`: timeline intro / gap / body / gap / outro, slideshow across the whole video, equal slots, alternate zoom 100↔115%, cover-crop, 1920×1080 / 1080×1920 at 30 fps, render failure without retries.
- Decision: intros and outros are narrated segments from a separate library (Text or LLM mode), not silent cards; supersedes mockup §Q19 (Q90, Q91, Q94, Q97, Q98).
- Decision: silence gap between segments is a Settings field, default 3 s (Q95, Q99).
- `logic/01`, `02`, `03`, `04`, `07`, `08`: amended in place for intro/outro text writing, narration, keyword fields, admission, and the Settings change.
- `mockup/README.md`: "Amendments from logic" section added for `uiux`.
- Rejected: silent title/outro cards (Q86 default, withdrawn by Q90).
- Ruled out: D1, D5, D6, D10, D13 (Q100).

## 2026-09-02 - logic: 10-thumbnail-prompt-by-llm
key: logic/10-thumbnail-prompt-by-llm@Q83
- `logic/10-thumbnail-prompt-by-llm.md`: new scenario (added Q35): thumbnail template as LLM instruction, inputs, one written image prompt, image call per scenario 09, resume rules.
- `logic/04-run-admission.md`: LLM row also required when the thumbnail source is Prompt by LLM (Q81).
- `mockup/README.md`: Scenarios table gains S16; `mockup/06-play.md`: thumbnail control reads Off / From prompt / Prompt by LLM / Provide (Q78).
- Decision: all five offered defaults accepted unchanged (Q78-Q82).
- Ruled out: D1, D4, D5, D6, D13 (Q83).

## 2026-09-02 - logic: 09-image-generation
key: logic/09-image-generation@Q77
- `logic/09-image-generation.md`: aspect-sized requests, Number parallel sends, deterministic slideshow order, per-image retries with resume, refusal without retries, thumbnail-from-prompt, storage fields.
- `logic/01-pipeline-lifecycle.md`: step 6 amended: image-generation calls time out at 300 s (Q77).
- Decision: all seven offered defaults accepted unchanged (Q70-Q76).
- Ruled out: D1, D4, D5, D13 (Q77).

## 2026-09-02 - logic: 08-narration
key: logic/08-narration@Q69
- `logic/08-narration.md`: end-matter split into sources and glossary files, three chunking modes (Whole / Per paragraph / Every ~N words, default 500), parallel synthesis, in-order concatenation, chunk-level retries with resume, storage.
- Decision: the IPA glossary is a downloadable file only, never sent to the TTS (Q64, Q69).
- Decision: chunking is the user's per-run choice; supersedes the offered automatic paragraph chunking (Q65).
- Surfaced for `uiux`: Chunking control on Play's audio block; sources and glossary files on the project page (Q64, Q65).
- Ruled out: D1, D5, D6, D13 (Q69).

## 2026-09-02 - logic: 07-article-writing
key: logic/07-article-writing@Q62
- `logic/07-article-writing.md`: message composition with research notes, streaming, up to 3 continuation calls, markdown + plain-text narration source + stored messages, failure rules.
- `logic/01-pipeline-lifecycle.md`: step 6 amended: the 120s timeout is an idle timeout between chunks for streaming calls (Q62).
- Decision: word-range misses accepted as written; the app never counts words (Q58).
- Decision: partial streamed text discarded on failure; retry regenerates the whole article (Q60).
- Ruled out: D1, D4, D5, D6, D8, D13 (Q62).

## 2026-09-02 - logic: 06-research
key: logic/06-research@Q55
- `logic/06-research.md`: planner → one web-grounded sub-agent per chapter → editorial synthesis; built-in instruction; notes end with Sources; resumable retry; progress "k of N chapters".
- Decision: research requires web grounding; unsupported model fails the stage, no fallback (Q47).
- Decision: one sub-agent per chapter, chapters from the article prompt's section guide, planner proposes when absent, no cap (Q53, Q55).
- Decision: whole stage fails on one exhausted sub-agent; manual retry resumes from completed sub-agents, refining scenario 01's from-scratch retry for this stage (Q54).
- Rejected: single-call research (Q49 accepted then superseded by Q52).
- Ruled out: D1, D5, D7, D13 (Q55).

## 2026-09-02 - logic: 05-provided-outputs
key: logic/05-provided-outputs@Q45
- `logic/05-provided-outputs.md`: per-stage acceptance rules, plain-text narration source, background and concurrent staging, validation timing, research forced Off with a provided article, attach-and-record rules.
- Decision: no size, duration, or length caps on user-provided content; principle "local app, let them do what they want" (Q38).
- Decision: pasted markdown is stripped to plain text for narration; markdown display copy optional (Q37).
- Decision: uploads stage immediately in the background and survive page switches; tab close aborts; orphaned staging cleaned at app start (Q44, Q45).
- Carried to scenario 12: deleting generated images; uploading replacement outputs onto an existing project (Q39, Q44).
- Surfaced for `stack`: accepted audio/image formats follow the video renderer (Q38).
- Ruled out: D1, D4, D5, D7, D10, D13, D14 (Q45).

## 2026-09-02 - logic: 04-run-admission
key: logic/04-run-admission@Q36
- `logic/04-run-admission.md`: required set, limits (Number 1-20, ≤60 images, title ≤200), images mandatory, live-disabled Play, fresh-form defaults, one project per click, form values kept per tab session.
- Decision: all seven offered defaults accepted unchanged (Q28-Q34).
- Decision: kept form values are tab-session state; restart returns defaults (Q36).
- Scenario list: `thumbnail-prompt-by-llm` added after `image-generation` (Q35); mockup README row S16 to be added when it is written.
- Ruled out: D1, D5, D7, D10, D13, D14 (Q36).

## 2026-09-02 - logic: 03-placeholder-substitution
key: logic/03-placeholder-substitution@Q27
- `logic/03-placeholder-substitution.md`: slot grammar, lint with Save block, no escape, Generate-only field collection, Common / Article | Image grouping, value rules (200 chars, single-line), rendering and record rules, invariants.
- Decision: cap raised from 30 to 200 characters after one objection citing mockup §Q7 text areas (Q22, Q26).
- Decision: fields are single-line inputs; supersedes the text areas drawn in `mockup/06-play.md` (Q26).
- Surfaced for `uiux`: Keywords block composition (Common on top, Article | Image columns) (Q26).
- Ruled out: D1, D4, D5, D7, D9, D10, D11, D13, D14 (Q27).

## 2026-09-02 - logic: 02-provider-credentials
key: logic/02-provider-credentials@Q18
- `logic/02-provider-credentials.md`: key save/remove rules, greyed-out unkeyed providers, model-fetch block, "Key missing" on affected projects, mid-run key swap, voice field rules, invariants.
- Decision: keys stored without a test call or format check (Q11, Q17).
- Decision: model list fetch failure blocks Play for that provider; no cache, no typed fallback (Q15).
- Decision: in-flight attempts keep the key they started with (Q16).
- Surfaced for `architecture`/`stack`: local SQLite as the store for keys and all app data (Q17).
- Ruled out: D1, D4, D5, D7, D11, D13 (Q18).

## 2026-09-02 - logic: 01-pipeline-lifecycle
key: logic/01-pipeline-lifecycle@Q10
- `logic/01-pipeline-lifecycle.md`: execution graph (fan-out after article), stage and project states, retry policy, interruption rule, progress signals, invariants.
- Decision: fan-out after article over strictly sequential (Q2).
- Decision: 4 attempts per provider call (3 retries), 2s/8s/30s backoff, Retry-After on 429, 120s timeout except video render (Q4, Q10).
- Decision: manual retry only; no auto-resume after an interrupted process (Q5, Q7).
- Decision: unlimited parallel projects, no queue (Q8).
- Decision: provider error text shown verbatim on the failed stage (Q10).
- Ruled out: D1, D3, D5, D13 not in play for this scenario (Q10).

## 2026-09-02 - mockup: all
key: mockup/all@Q28
- `mockup/01-marketing-page.md`: slopify.stream single page; install command, how-to-use, live counters, donation links; serves J1.
- `mockup/02-first-run-notice.md`: once-per-machine telemetry notice, dismiss only; J1, J2.
- `mockup/03-settings.md`: API key per provider by category, voice list (name, provider, ID), outro card text; J1, J2.
- `mockup/04-prompts.md`, `mockup/05-prompt-editor.md`: three prompt kinds (article, image, thumbnail), `{{keyword}}` bodies; J2.
- `mockup/06-play.md`: one run per play; Generate/Provide per stage; per-run LLM/TTS/image provider and model, voice, format, cards, keywords; J2, J3, J4.
- `mockup/07-projects.md`: project list with status; J3, J6.
- `mockup/08-project.md`: stage-by-stage view with downloads, re-runs, cancel; J3-J6.
- `mockup/README.md`: screens, six journeys, 15 scenarios S1-S15 handed to `logic`, stack handoffs, assumed list.
- Purpose: one-run pipeline (research → article → TTS → images/thumbnail → slideshow video) for AI-slop YouTube channel operators; personal tool, single user is success (Q1-Q3).
- Distribution: self-hosted local web app via `npx slopify@latest` plus public marketing page (Q21); supersedes hosted web (Q4).
- Access: no login (Q22); supersedes single-owner login (Q5).
- Commercial model: free, BYO provider keys and spend; donation links on marketing page, app footer, README (Q20, Q23).
- Telemetry: anonymous machine ID, usage counters, no opt-out, first-run notice; live aggregates on the marketing page (Q25-Q27).
- Dropped: saved title list and title batches (Q8 → Q9, Q10).
- Deferred to later, not rejected: background music, burned-in captions, YouTube upload (Q18).
- Surfaced for `stack`: OpenRouter as LLM gateway (Q16); TTS and image providers unnamed.
- Left open for `logic`: the 15 scenario rows in `mockup/README.md`, including substitution rules, narration of end matter and IPA hints, slideshow timing, failure and re-run semantics, telemetry counters.
- Vague at the gate: nothing quantified beyond "every few seconds" for counter refresh (Q27); marketing counter set and the wireframe conveniences recorded as assumed in `mockup/README.md`.
