---
generated_date: 2026-09-30
capstone_version: 7.0.1
---

# Changelog 2026

## 2026-09-26 - docker-recovery-cleanup
### Docker updates keep one recovery volume

- The `--docker` launcher snapshots the data volume into `<volume>-recovery-<uuid>` before each update, and until now kept every one. After an update commits and passes its health check it now removes the older recovery volumes of this container and prints each one it removed (`Removed older recovery volume: <name>`). The newest is kept, as before.
- A volume is removed only when its name is exactly `<volume>-recovery-<uuid>`, its `io.slopify.transaction` label is that uuid, and that update's own record in the container's private folder names this container, data volume, Docker and backup and says the update is over. New recovery volumes also carry `io.slopify.installation` and `io.slopify.container` labels, which must agree. The live data volume, volumes of other containers or installations and recovery-shaped volumes without a record are never touched, and removal is never forced: a volume Docker refuses is kept, with the `docker volume rm` command to remove it later.
- `07-operations.md` and `02-models-docker.md` describe the rule and the labels.

## 2026-09-26 - dicemaster-retired
### DiceMaster is no longer a built-in document theme

- Plain is the only built-in document theme and the default. It has complete values of its own with no brand, neutral PDF metadata and no closing page; the parchment texture stays available as a background for any theme.
- New projects always save their theme. Projects saved with DiceMaster, or with the Document stage on and no theme, keep drawing exactly as before and keep their PDF fingerprints; Edit project shows it as "DiceMaster (retired, this project's look)" only while it is the current choice.
- Migration 0017 saves the old DiceMaster values as a Library → Documents theme named "DiceMaster" on installs that have used the Document stage, unless a theme of that name exists. Fresh installs get none.
- Projects on Plain will see their PDF marked outdated once: Plain's PDF keywords are now empty instead of "D&D, lore", and its unused closing page is neutral.

## 2026-09-26 - backup-import-timeout
### Backup import is no longer cut off after 5 minutes

- A large Import everything over a slow network could be cut off by Node's 5-minute request limit, which covers the whole upload. The server now switches that limit off and keeps it for every other request itself (408 after 5 minutes if the request still has not fully arrived); the backup import runs as long as bytes keep coming and is dropped only after 5 minutes without any.
- `07-operations.md`: Portable backup and diagnostics describes the limits.

## 2026-09-26 - backup-everything
### Export and import everything

- Settings → Backup & storage → Export everything writes one .tar with every project (its whole history and files, so it opens current in another install), prompts, intros and outros, document themes, templates with all their versions, schedules with their topic queues and run history, unstarted Play drafts, uploaded fonts, non-secret settings and the Usage history. Provider keys and the telemetry id are never included.
- The export streams from disk with its exact size announced, so a project with a two-hour video downloads with real progress and without the server holding it in memory. It waits while a project is being made and names the projects it is waiting for.
- Import a backup adds to the install and never replaces anything: projects already here are skipped, a library item whose name is taken comes in as "(imported)", settings only fill what is unset, schedules arrive paused, and Usage history is added once per backup. A backup from a newer Slopify is refused with "update first". Older settings-only .zip backups still import.

## 2026-09-25 - youtube-description
### YouTube description

- New optional step in the Video stage: after subtitle timing, the project's text model writes a YouTube description (a short summary, a chapter list YouTube turns into chapters, hashtags at the end) and a separate comma-separated list for YouTube's Tags field. It runs beside the render, so it doesn't make the video wait. Switch it on per project on Play's Export rail or in Edit project → Prompts; it is off by default and needs narration.
- Chapter times come from the narration's aligned words in the finished video (after the silence at the start, the intro and the gaps), so they match what viewers see. With captions off, the timing still runs for the chapters, and no caption files are made.
- Slopify checks the answer against YouTube's rules (first chapter at 0:00, at least three chapters of at least ten seconds, in order and before the end; tags within 500 characters, each within 100, no repeats) and asks the model again when it breaks one. It lays the description out itself, so the blank lines and the hashtag line are always where YouTube expects them.
- A new Description prompt kind in Library → Prompts, with a Use Built-in Starter button. Pick one per project like the article prompt, keywords included; with none picked the built-in prompt is used.
- The project page's Video stage shows a YouTube block with the description and tags, a Copy button for each and downloads of `description.txt` and `tags.txt`. Play's estimate and review include the extra LLM call.
- Editing the narration makes the description need a rebuild; changing its prompt or the text model affects only it; changing motion, zoom or images leaves it current. The upgrade widens the prompts table for the new kind (schema version 15) and keeps every saved prompt.

## 2026-09-25 - subtitle-mismatch-location
### Subtitle mismatches name the chunk

- When captions fail because the audio stops matching the text, the error now says where: the time into the narration, which narration chunk (for example "chunk 9 of 10", with its opening words), the words the text expected and what the audio had, and to regenerate that chunk in Edit project → Narration. Before, it only said the audio did not closely match.
- The Narration editor lists only the current chunks, in spoken order, so its numbers match the error. It used to also list chunks from an older narration, in storage order.
- A chunk queued for regeneration says so, with a Keep button to take it back.

## 2026-09-25 - seconds-per-image
### Seconds per image, zoom, and silence at start and end

- Each image now stays on screen for a set time, 15 seconds by default, and the images take turns in order until the video ends, starting over after the last. Before, the narration was split evenly across the images, so five images under a 108-minute narration each stayed up for about 21 minutes. The zoom keeps its full 100% to 122.5% travel within each slot, alternating in and out per slot; the last slot is cut to fit. Set it per project as Seconds per image (whole seconds, 1 to 600) on Play → Outputs → Export or Edit project → Inputs.
- How far each image zooms is now a per-project setting, Zoom (%), next to Seconds per image: 22.5 by default (100% to 122.5%, as before), 0 to 50 in half steps, and 0 keeps the images still.
- The exported MP4 and WAV now start and end with 2 seconds of silence, so the narration no longer starts and stops abruptly. Set it per project as Silence at start and end (0 to 30 seconds, in half seconds); 0 turns it off. Captions move with the lead-in.
- A silent video (narration Off) shows each image once for the seconds per image, instead of a fixed 5 seconds.
- Projects, revisions, drafts, templates and backups saved before this read as 15 seconds per image, a 22.5% zoom and 2 seconds of silence. Their finished videos and WAV exports show as needing a rebuild, and captioned projects redo their caption timing (manual captions ask for review, as after a silence-gap change). Narration and images are kept.
- Changing seconds per image or the zoom re-renders only the video. Changing the silence re-exports the MP4 or WAV and redoes caption timing, never narration or images.
- Long videos render in bounded memory: each distinct image clip is encoded once and the clips are joined in order, instead of one FFmpeg filtergraph with a chain per image, which grew with the video's length.

## 2026-09-25 - schedule-topic-queue
### Schedule topic queue

- A schedule takes a list of topics, one per line, and a keyword for them to fill, such as `{{Topic}}`. Each run starts one project with the first topic, then removes it; the run that uses the last topic completes the schedule. A run that fails before its project starts keeps the topic.
- The other template keywords get fixed values that every run uses (for example word counts 15000 and 18000), prefilled from the template.
- A scheduled project's title is filled from the same keywords, so a template titled `History at Bedtime: {{Topic}}` names each project after its topic. The form previews the next project's title.
- Runs no longer start the template's own saved setup alongside every item. Schedules saved with per-item variants become queues: each item runs on its own, titled as before.
- The list shows how many topics are left.

## 2026-09-25 - release-2.1.0
### Slopify 2.1.0

- **Much faster videos.** The slideshow renders each distinct image clip once and joins them, so a 108-minute video with burned-in captions renders in about 12 minutes instead of over 2 hours. Subtitle timing runs on all your CPU cores (up to 8 threads): 3.6 minutes instead of 24 for the same narration.
- **Seconds per image** (default 15): images cycle in order until the video ends instead of splitting the whole video equally. **Zoom (%)** (default 22.5) and **Motion** (Zoom in and out, Pan across, Mix of both, Still) control how each image moves. **Silence at start and end** (default 2 s) keeps narration from starting and ending abruptly. Existing videos show as needing a re-render; narration and images are kept.
- **Document (PDF):** an optional stage turns the article into a styled PDF with a contents page, sources and the thumbnail as cover, in DiceMaster or Plain themes.
- **YouTube description:** an optional step writes a description with chapter timestamps and hashtags, plus a tags list, from a Description prompt, ready to copy next to the video.
- **Open folder works in Docker** when the host helper is installed.

## 2026-09-25 - release-2.0.3
### Slopify 2.0.3

- Schedules take a list of topics and run one per scheduled run, filling a template keyword and the project title; see "Schedule topic queue".
- A caption failure says which narration chunk stopped matching its audio and what to regenerate; the Narration editor lists only current chunks, in order; see "Subtitle mismatches name the chunk".
- Every error a person can see says what failed, why and how to fix it; see "Clearer errors".

## 2026-09-25 - release-2.0.2
### Slopify 2.0.2

- Video with captions no longer fails with "The free subtitle model download was interrupted after 3 attempts". Every progress report re-derived the whole project, which took about 3 seconds on a long article, and the model download reported once per 16 KB chunk. The app froze, stopped reading the download, and the server closed the connection. Progress now adjusts only its own stage's meter, and the runner passes at most two reports a second per stage, dropping repeats.
- The subtitle model comes with the install. The Docker image ships it (Apache-2.0, notice in `/opt/slopify/models/english-subtitles`) and copies it into the data volume on first start; npm installs download it in the background as soon as the app starts. `SLOPIFY_NO_MODEL_PREFETCH=1` turns the start-up download off.
- A subtitle-model lock left behind by a crash no longer blocks captions in Docker, where the app is always process 1.
- Failed stages log the errors they wrap, so the log says why a download stopped, not only that it did.

## 2026-09-25 - release-2.0.1
### Slopify 2.0.1

- Resume after narration text changes: projects made before 1.6 failed Audio with "UNIQUE constraint failed: stage_pieces" when Resume re-prepared narration whose text had changed (for example, escapes such as `D\&D` removed). New preparation pieces now replace the old ones' positions instead of colliding with them; the old pieces stay in History.

## 2026-09-25 - release-2.0.0
### Slopify 2.0.0

- Console redesign: the app gets a fixed frame. One sticky header carries Projects, Play, Library and Settings, the running tally, the support links, the update button and the tutorial. Messages go into reserved status lines or toasts instead of pushing the page, and editing screens keep their Save or Start action pinned to the bottom of the window.
- Library: Prompts, Intros & Outros, Templates and Schedules are four tabs of one page. Rows open by name; the template and schedule forms open in a side drawer.
- Settings: one section at a time (Providers, Voices, Models, Playback & appearance, Backup & storage, Usage). Every provider is one aligned row; CLI paths sit behind Change path and help behind info buttons. Usage moved here; the old address redirects.
- Project page: a rundown strip shows overall progress and every stage in one row. Output, Edit, History and Checkpoints are tabs under it, with held checkpoints counted on their tab. The page bar keeps a fixed set of controls: Save as template, Pause/Resume, Download and a More menu with Cancel run. Edit project shows one section at a time with Save pinned. Rebuild review opens in a drawer. A failed stage shows one line with Retry stage and, in its menu, Re-run section. Large image sets show two rows until expanded.
- Play: Content, Outputs and Style are tabs; Review opens in a drawer beside the form with Start run pinned, and review checkpoints moved into it. A readiness rail replaces the summary column, and the frame preview shows on Style. Advanced audio options (chunking, intro and outro, narration preparation, pronunciation glossary) fold under one disclosure. Nothing starts until Start run.
- Breaking for bookmarks and scripts: `/usage` now redirects to `/settings?section=usage`, and `/library` opens Prompts. The floating update button is now in the header.
- Restart after a hard shutdown: the data-directory lock now records its process's start time, so a container whose app is always pid 1 no longer refuses to start on its own leftover lock.
- Docker upgrades: the launcher no longer refuses to update when stopped rollback containers from earlier launchers (`<name>-previous-<timestamp>`) still mount the data volume, and it recognises its own retained previous container however Docker orders that container's mounts.

## 2026-09-25 - release-2.0.0-verification
### Slopify 2.0.0 release verification

- Release tag: 2.0.0 at 45d4018, after candidate CI passed on main on Linux, Windows and Docker. Earlier tags on 3804973 and 5780215 were withdrawn before anything published: their release re-checks failed on slow-runner timeouts and on a launcher volume-claim bug, both fixed.
- Release workflow: https://github.com/GentBajko/slopify/actions/runs/36144687546, the first to verify the green main run instead of re-running CI; it took about six minutes.
- Release page: https://github.com/GentBajko/slopify/releases/tag/2.0.0, latest. It also carries the never-published 1.6.0 notes.
- npm: `latest` resolves to 2.0.0; shasum e49d2473adf15e8ec683fa322dfd647edf7b9c8a.
- GHCR: 2.0.0 and latest share sha256:ca79edbaa60f584358a5f088ba3e9d6ebc331ffedcc79a3db8e7d10143dc75b0 for linux/amd64 and linux/arm64.
- Local update: the machine had rebooted and the 1.5.1 container was crash-looping on its own stale pid-1 lock. A private database backup was taken inside `slopify-data` first. With the user's approval, the hand-made `slopify-pre-cli-bridge-2026-09-24` container and all seven older `slopify-previous-*` containers were removed; volumes were kept. The released launcher then updated the install: the app reports 2.0.0, is healthy on 127.0.0.1:6969, the host helper is active, and project files now live in `~/Slopify/Projects`, with recovery volume `slopify-data-recovery-4a33b126-…` and one stopped previous container retained.
- Preserved: one project (failed, awaiting rebuild), eight prompts, two voices, provider settings. The lock file now records the process start time.

## 2026-09-25 - release-1.6.0
### Slopify 1.6.0

- Glossary pronunciation: an opt-in Audio setting sends supplied article-glossary IPA to Inworld TTS without changing readable text, captions or transcripts. New projects default it on; existing projects stay off.
- Docker project folder: the managed Linux launcher moves generated project files to `~/Slopify/Projects` (or `--projects-dir`), with a verified copy, private journal and rollback. The database and credentials stay in the private `slopify-data` volume. Folder actions show the host path for current and historical outputs.
- Plain narration: narration text no longer carries Markdown escapes such as `D\&D`.
- Direct Resume and section reruns: Resume retries unfinished work for the saved revision without the mandatory cost review. Research, Article, Audio, Images, Thumbnail and Video each get a Rerun with a one-line confirmation; previous outputs stay in History. Repeated or retried requests reuse one request identity, so a lost response cannot start duplicate paid work. Adds migration 0012.
- Tests: the Vitest run now uses one temporary directory and removes it at exit.

## 2026-09-25 - release-1.5.0-verification
### Slopify 1.5.0 release verification

- Release tag: 1.5.0 at 8e59e7b68ca9127c2fb027eb7291b0762f6bfad5, pushed with main by non-forced atomic update.
- Candidate CI: https://github.com/GentBajko/slopify/actions/runs/36072095582 — Linux, Windows and Docker passed. Initial candidate exposed a five-second narration integration timeout; the targeted deadline correction passed the final Windows run.
- Release workflow: https://github.com/GentBajko/slopify/actions/runs/36072834996 — metadata, repeated platform verification, npm provenance publish and multi-platform Docker publication all passed.
- Release page: https://github.com/GentBajko/slopify/releases/tag/1.5.0 — public, stable, latest.
- npm: exact version and latest resolve to 1.5.0; shasum fe9f6c4b6fb59a56eb2b3e2b57a0e7ffe07d1320. Public metadata propagation was checked after the successful publish job; no duplicate publish was attempted.
- npm integrity: sha512-wCz6FL5Uf9v2wTlZIgEIjtWjdP92kW1hsR0kMIHx2fTQdw1H18wYNvHQjKIEhcZ+qYKrhexQffYyjqB87IYBAA==.
- GHCR: 1.5.0 and latest share sha256:47472e47f70dc414a2ccaffaee4921151907a80d0c08286e40731d303da42537, with linux/amd64 and linux/arm64 manifests plus attestations.
- Local checks: 440 test files, 3,395 passing tests and one skip; lint, typecheck, build and zero-vulnerability audit. Native package contents include the compiled reader/image collector. CI verifies the exact image and packed host helper with fake CLIs, real reader subprocesses and no provider charges.
- Environment incident: full /tmp caused an invalid local test run. Three inactive Slopify release-test copies were moved to a private ignored archive without deletion; the full suite then passed. Two local clean Docker builds hit npm registry timeouts; exact-candidate Docker build/smokes passed in CI.
- Recovery: a private database-copy rehearsal validated all six image mappings and all 13 legacy report reuses. The live transaction retained original attempts and report payloads and published the existing images through revision-owned assets, without generation.
- Backups: private pre-recovery and recovered/pre-update SQLite backups remain on the existing data volume; original Codex image files remain untouched.
- Local update: released npm launcher 1.5.0 ran outside the source workspace after idle checks and the verified image pull. Container and host helper both report 1.5.0 and are healthy/accepting; helper active calls remain zero.
- Preserved: one project, eight prompts, 13 reports, six recovered image assets, head revision, all attempt records, provider keys and settings; before/after hashes match. Research remains failed awaiting reviewed rebuild; article/audio/video remain pending, images and thumbnail are done.
- Rebuild proof: read-only planning in the updated container exposes 13 original report documents and reuses all 13 reports and all six recovered images. No paid work was admitted.
- Runtime: existing slopify-data volume, loopback port 6969, restart-always and socket-only read-only host bind remain. Previous container is retained stopped. Old standalone slopify.service remains absent; FFmpeg 7.0.2 runs from the image.
- Provider probes: Claude Code 2.1.281 and Codex 0.155.1 report signed in; Gemini 0.61.0 is installed with login status unknown. No paid generation or interactive authentication was used as a test.

## 2026-09-25 - plan: Video Recovery Implementation Plan

key: plan/2026-09-25-video-recovery@Q3

- Approved two source-only tasks: preserve planning context through local export admission, then retry interrupted subtitle-model transfers.
- File map: rebuild `service.ts`, `admission-repo.ts`, `service-reuse.test.ts`; alignment `cache.ts` and new `cache-retry.test.ts`.
- Pin strict typing, no new dependencies, exact request/revision authority, retained completed outputs, bounded abortable retry, private checksum-verified publication and isolated fake-provider verification.
- Use `codex/video-recovery`. No production restart, regeneration, release or broad stored-context rewrite is part of implementation verification.

## 2026-09-25 - plan: Plain Narration

key: plan/2026-09-25-plain-narration@Q1

- Authority: design/implementation approval delegated explicitly by the user; no additional question requested or fabricated.
- File map: `packages/app/src/slices/article/plain.ts` projects transformed prose; adjacent `plain.test.ts` covers punctuation, entities, genuine backslashes, paragraphs, lines and empty non-prose content.
- Task 1: test-first direct prose projection; retain helper signature and all existing call sites.
- Coverage: five requirements and five behavior rules mapped, with no forward dependency or placeholder; full pass rechecked spec, tasks and test cases.
- Constraints: strict typing, existing dependencies, no schema/API, no blanket backslash removal, no historical rewrite, no production/provider execution; source-only commit after article/narration/rebuild tests, typecheck, lint and diff checks.
- Task 1 proves R&D no longer acquires a narration backslash while paths and literal punctuation survive. Execution follows Docker storage under the user's ordered work.

## 2026-09-25 - plan: 2026-09-25-glossary-pronunciation
key: plan/2026-09-25-glossary-pronunciation@Q3

- `features/2026-09-25-glossary-pronunciation/plan.md`: user approved five test-first tasks covering 9 requirements, 12 behavior rules and 6 global constraints.
- Task 1: parse supplied glossary IPA and calculate whole-term source spans in `slices/narration/pronunciation.ts`.
- Task 2: preserve IPA and Unicode atoms in paired requests through `slices/narration/steering.ts`.
- Task 3: persist the optional audio preference through admission, drafts, templates, schedules and portable transfer.
- Task 4: integrate glossary gates, exact requests, clean transcripts, local text files and revision reuse in rebuild recipes/runtime.
- Task 5: expose the independent Audio control in Play and project editing with fresh-only defaults and saved-choice retention.
- Constraints: existing libraries and strict types; no migration or widened provider port; no pronunciation LLM call; old/off request identity preserved.
- Verification: isolated fake-provider/file/SQLite and UI tests, typecheck, lint and build; source-only task commits on a codex/ branch.
- Excluded from verification: production generation, restart, Docker changes, release and paid calls.

## 2026-09-25 - plan: Docker Project Folder

key: plan/2026-09-25-docker-project-folder@Q4

- Authority: the user explicitly delegated remaining design and implementation decisions; no further question or fabricated answer.
- Task 1: safe dedicated host paths and complete streamed tree verification.
- Task 2: private installation receipt, journal and authoritative storage reconciliation.
- Task 3: bounded Docker operations, verified user mapping, private-volume snapshot and reversible ownership.
- Task 4: stopped-source migration, atomic verified publication and journalled rollback/recovery.
- Task 5: packaged locked launcher, remembered projects directory and provisional activation.
- Task 6: owned current/history folder resolution with truthful host paths.
- Task 7: browser location display with native opening and downloads preserved.
- Task 8: disposable packed-install migration/rollback/ownership tests and consistent installation guidance.
- Coverage: all eleven requirements, seven behavior rules and their branches mapped to implementation and proof; no forward dependency or placeholder remains.
- Review corrections: preserve original projects during ownership conversion, retain independent private rollback material, verify complete bytes outside bounded control JSON, refresh cached default latest, pair image/launcher versions, retry individual health timeouts within the overall deadline.
- Boundaries: Linux local Docker only; refuse unsupported user-namespace mappings and unsafe paths. No production changes or provider generation during verification. Existing private data and retained history are never replaced by a portable settings archive.
- Execution: approved spec `7618de7de02e0c258e5db35f2246b34931c15905`; sequential source-only task commits after the pronunciation feature's review and wrap. No Docker source is implemented by this plan.

## 2026-09-25 - plan: Direct Resume and Section Reruns

key: plan/2026-09-25-direct-resume-reruns@Q4

- Authority: user delegated all remaining decisions and requested no further questions; no fabricated answer.
- Six tasks cover recovery selection and research epochs; durable receipts and credential generations; checked admission; HTTP and real-runner verification; browser request identity and refetch; section controls and responsive UX.
- All nine requirements, eight behavior rules and twelve constraints have implementation and verification coverage.
- Resume retries unfinished work with reuse, readiness, checkpoints and cancellation intact. It requires no cost-acceptance form and never silently approves changed supplied content or manual captions.
- Deliberate reruns retain immutable History, regenerate only the chosen section and affected dependents, and use a short consequence confirmation. Provided/off work remains unavailable.
- Save-then-admit recovery uses durable request identity; duplicate receipts do not unpause or authorize another attempt. Credential freshness uses a nonsecret generation marker.
- Main reviewed and approved spec `058bcb1064db152bcf7fd98faf464b2238b15ee3`. Task agents own source-only commits after verification; main verifies completion. No source or production change was made by planning.

## 2026-09-25 - native-subtitle-timing
### Faster subtitle timing

- Subtitle timing now runs the speech model on the native ONNX Runtime (`onnxruntime-node` 1.30.0, CPU; 1.30 also drops the vulnerable zip library 1.24's installer used) instead of single-threaded WebAssembly. A 109-minute narration took 3.6 minutes on a 32-thread machine, down from 24.3 minutes. All 15,370 words aligned the same way with no skipped passages; 85% of word times are identical and almost all others moved by one 20 ms frame, because the native engine computes the quantized model's numbers slightly differently from WebAssembly. Its results do not depend on the thread count.
- It uses one session per job with 8 threads, or one less than the computer's CPU count when that is smaller. On the benchmark clip that ran 37× realtime; 16 threads ran 31× and 32 threads 20×, so it never goes above 8. Set `SLOPIFY_SUBTITLE_THREADS` to try a different count.
- If the speech engine cannot load, subtitle timing says so and asks you to reinstall Slopify. Intel Macs have no build of the engine; there it asks you to turn subtitles off.
- `onnxruntime-web` is no longer a dependency. The Docker image still installs with `--ignore-scripts`: the engine's CPU files ship inside the npm package for Linux x64 and arm64.

## 2026-09-25 - map: Video Recovery Reference Refresh

key: map/video-recovery@4a83abd9a070

- Refresh scoped architecture, testing evidence and video/rebuild behavior at `4a83abd9a070`; update the logic index.
- Record consistent admission planning and configured-model execution context, bounded subtitle-model download retries, cancellation and verified publication.
- Preserve broad historical stamps and unrelated chapter drift; no dependency, deployment, public API or UI change is claimed.
- Verify index targets and source pointers for admission planning, retry boundaries and new regressions.

## 2026-09-25 - map: Video Recovery Baseline

key: map/video-recovery-baseline@35e13e49c532

- Added `01-architecture-recovery.md`, a scoped baseline for rebuild admission and subtitle-model caching; the broad historical map remains unchanged outside this verified scope.
- Recorded the difference between current planning metadata and the reduced persisted catalogue, plus the existing single-attempt model download behavior.
- Added the scoped chapter to the index. No source, production service or generated asset changed.

## 2026-09-25 - map-research-documents
### Research document reference refresh

- Key: map/research-documents@735cf5b.
- Scope: research architecture, document models and flow; conventions/dependency/testing/operations notes; research, article, images and rebuild scenarios and indexes. Other historical reference stamps remain unchanged.
- Behavior: complete original documents and retained editorial consolidation; request-only MCP access for host CLIs, stdin prompts, separately labelled API contents, complete-page checks and legacy chapter reuse.
- Verification: 3,395 tests passed locally; Linux CI and both Docker smokes passed. Windows CLI/reader tests passed; the existing media-test timeout was corrected separately before the final release gate.
- Recovery: six saved images published without generation; 13 original reports and attempt history preserved. Release and local-update outcome recorded separately.

## 2026-09-25 - map: Pronunciation baseline
key: map/pronunciation-baseline@9e439aa80dc9

- Add `01-architecture-narration.md` and `02-models-narration.md` for current article/glossary separation, physical TTS planning, persisted requests and clean transcript boundaries.
- Index both scoped chapters; broad historical reference drift remains outside this change.
- Record the absence of glossary substitution and the preparation-only clean-export branch; pronunciation remains unimplemented.

## 2026-09-25 - map: Glossary Pronunciation

key: map/narration@6eeac3fd9043

- Scoped refresh at source `6eeac3fd9043`; authoritative module map retained, with read-only architecture/models/testing deep-dives.
- `01-architecture-narration.md`: replace pre-pronunciation baseline with actual glossary gating, grouping, exact/clean requests, overrides and publication/download boundaries.
- `02-models-narration.md`: actual entities and fields, paired request text, optional configuration/source bindings, authority validation and existing JSON persistence.
- `06-testing.md`: scoped pronunciation inventory, fixtures, limits and final 3,636-pass acceptance evidence; broad historical stamps remain unchanged.
- `logic/08-narration.md`: supplied English IPA behavior, defaults, no-match/invalid paths, entry dependencies, provided bypass and clean outputs.
- `logic/12-reruns-and-edits.md`: used/unused invalidation, trusted source bindings, Restore classification and immutable receiving metadata.
- `mockup/06-play.md`: new-on/old-off labelled independent Audio preference.
- `mockup/08-project.md`: saved opt-in, validation and separate readable/script downloads.
- `uiux/screens/02-play.md`: accessible shared checkbox, inactive choices and unchanged design tokens.
- `uiux/screens/03-project.md`: explicit saved preference and retained clean/script projections.
- `logic/README.md`, `mockup/README.md` and `uiux/README.md`: indexed absorbed behavior with scoped verification stamps.
- `00-index.md`: refreshed companion descriptions; all links verified. No new interface topic or unrelated chapter refresh; no sibling-repository protocol changed.
- Existing map inventory is retained; no missing logic/UI surface needs extraction. Feature-branch fragments remain unfolded until the authorized main integration.

## 2026-09-25 - map: docker-storage-baseline
key: map/docker-storage-baseline@d5fd1db5e46a

- `01-architecture-docker.md`: records the existing Linux launcher, private volume, ownership, replacement and native folder-opening boundaries.
- `02-models-docker.md`: records current path/configuration/response fields and the absence of project-directory receipts or migration journals.
- `00-index.md`: indexes both scoped baseline chapters; no source or production state changed.
- Scope excludes unrelated stale chapters and new logic/UI extraction; existing storage/boot/project scenarios remain the later feature's absorption targets.

## 2026-09-25 - map: Docker Project Folder

key: map/docker@a472d513f12c

- Refreshed scoped architecture/models from verified source, including exact paths and content hashes; unrelated historical broad chapter stamps remain unchanged.
- Absorbed migration, retained history and host-location behavior into storage/boot logic and Project mockup/UI chapters; refreshed operations, tests and indexes.
- Scope: `01-architecture-docker.md`, `02-models-docker.md`, `07-operations.md`, `06-testing.md`, `logic/14-storage-and-downloads.md`, `logic/20-boot-cli-recovery.md`, `mockup/08-project.md`, `uiux/screens/03-project.md`, `logic/README.md`, `mockup/README.md`, `uiux/README.md`, `00-index.md`.
- Evidence: source identity/mount checks, safe-path reply mapping and launcher configuration were spot-checked; real rootful disposable migration/rollback and browser path selection were verified without production generation.
- No sibling-repository interface or design token change; no installed Quarry CLI. Feature state is retained locally.

## 2026-09-25 - implement: Video Recovery Implementation

key: implement/2026-09-25-video-recovery@Q3

- What: restore unchanged local export admission and recover temporary subtitle-model interruptions for retained Slopify projects.
- Approach: service and transactional admission use identical planning metadata; new invocations retain configured-model metadata. Retry the complete private, verified model transfer at most three times with one-/two-second abortable delays.
- Rejected: bypassing stale checks could authorize changed work; dropping subtitles changes requested output; bundling the model enlarges installation; retrying the whole pipeline risks duplicate provider charges.
- Out of scope: glossary IPA, host-visible Docker storage, plain-text escapes and one-click Resume remain separate requested changes.
- Out of scope: no production restart, database mutation, provider generation, model download, version bump, push or publication.
- Task 1: `d1fe940` preserves rebuild planning and new execution context; red/green plain and prepared narration tests retain output IDs, avoid provider readiness/calls and prove exact replay/runtime readiness.
- Task 2: `4a83abd` adds bounded fetch/body/408/429/5xx recovery, permanent-error refusal, cancellation and actionable exhaustion with original error causes.
- Diff: `packages/app/src/slices/rebuild/service.ts`, `admission-repo.ts`, `service-reuse.test.ts`; `packages/app/src/adapters/alignment/cache.ts`, `cache-retry.test.ts`.
- Verification: 318 passing tests in 57 rebuild/alignment files; workspace typecheck, scoped Biome, diff checks and release build passed. Build retains a non-blocking bundle-size warning. No full-suite, actual production video/restart or native Windows rerun claimed.
- Chapters refreshed: `01-architecture-recovery.md` records the as-built planning/cache boundary; `06-testing.md` records scoped red/green and regression evidence.
- Scenarios absorbed: `logic/11-video-assembly.md` distinguishes retryable model preparation from local encoding; `logic/12-reruns-and-edits.md` records consistent planning and retained completed outputs; `logic/README.md` updates their labels.
- Review loop: two fresh three-lens rounds; zero confirmed, fixed or refuted findings; two consecutive dry rounds. Static-review limits remain documented in local review history.
- Preserve the ignored feature folder as local implementation/review history. Changes remain on `codex/video-recovery`, not deployed.

## 2026-09-25 - implement-research-documents
### Research documents and Codex image collection

- Key: implement/2026-09-24-research-documents@Q4.
- What: preserve original research for the editor and article writer, repair Codex native image collection, and release/update Slopify 1.5.0.
- Approach: immutable report assets and legacy payload reuse; typed document contents in durable recipes; fixed request-only SDK stdio reader for CLIs; complete labelled HTTP messages for API providers; stdin for CLI prompts.
- Rejected: stdin-only delivery, because it does not give the writer independent originals.
- Rejected: removing editorial consolidation or supplying only its summary, because the user explicitly kept that step and wanted originals available too.
- Rejected: general filesystem/shell tools or mounted host credentials, because document access must stay request-scoped.
- Rejected: paid regeneration for image recovery; the original files were already present and verifiable.
- Out of scope: arbitrary attachments, a document browser, new providers/models and broader research-method changes.
- Out of scope: paid verification calls and automatic retries of the user's paused project.
- Task 1: froze ordered originals and editorial notes into requests, retained them across continuations, published new report assets and included document contents in audit/cost review.
- Task 2: implemented validated private workspaces, bounded read-only MCP pages, complete-read checks, stdin delivery and cleanup for Claude, Codex and Gemini.
- Task 3: verified strict host/API delivery, Unicode preservation, scope/tamper/failure cases, package contents and real CLI metadata-only connections.
- Task 4: rehearsed and recovered six saved images, preserved 13 completed reports, published 1.5.0 and updated the idle local Docker/container helper with hash-based data checks.
- Diff: packages/app/src/kernel/{ports,runner/providers.ts}; adapters/{llm,host-cli,image}; host-cli/runtime.ts and tests; slices/{research,rebuild}; composed host/research tests and fixture; packaged host smoke; app manifest/lockfile; scoped reference/ledger files.
- Architecture refreshed: 01-architecture-research.md describes provider isolation and document ownership.
- Models refreshed: 02-models-research.md records bounds, IDs, reader receipts and legacy compatibility.
- Flow refreshed: 04-data-flow-research.md records originals → editor → article/continuation delivery and failures.
- Conventions refreshed: 03-conventions.md adds the scoped typed-document and stdin rules.
- Dependencies refreshed: 05-dependencies.md records the official MCP SDK and JSONC parser.
- Testing refreshed: 06-testing.md records 3,395 passing tests, one skip, reader/host regressions and metadata-only real CLI checks.
- Operations refreshed: 07-operations.md records private Gemini CLI configuration, Claude's restricted document profile and native Codex artifact collection.
- Scenario absorbed: logic/06-research.md retains editorial consolidation and independent report assets.
- Scenario absorbed: logic/07-article-writing.md gives the writer and continuations originals plus notes.
- Scenario absorbed: logic/09-image-generation.md records session-bound artifact validation and no automatic replay after uncertain collection.
- Scenario absorbed: logic/12-reruns-and-edits.md records reviewed document inputs and unchanged chapter identities.
- Indexes refreshed: 00-index.md and logic/README.md identify the scoped references and scenarios.
- Review loop: two consecutive dry rounds after verification fixes; three confirmed/fixed findings (Claude safe-mode MCP exclusion, Gemini settings isolation, Windows composed-test deadline), two refuted concerns (chapter identity drift, arbitrary host reads), no unresolved implementation findings.
- Deviations: real CLI checks required restricted Claude document calls and private Gemini CLI home rather than the initial safe-mode/system-settings assumptions. The Windows integration test retains every assertion with a 30-second deadline.
- Local history: ignored feature plan/interview/review records are retained. Unrelated local planning fragments were not staged or folded.

## 2026-09-25 - implement: Glossary Pronunciation

key: implement/2026-09-25-glossary-pronunciation@Q3

- What: supplied article-glossary English IPA for generated Inworld narration, independently of optional cue preparation; fresh Play defaults on, existing missing/off configurations stay unchanged.
- Approach: parse the article's glossary with installed remark/GFM, validate exact terms and per-word IPA, preserve full-term logical boundaries and atomic physical tokens, then send exact text through existing provider ports.
- Rejected: whole-article IPA changes ordinary words; inferred or LLM-rewritten pronunciation adds cost/content risk; preparation-only coupling excludes Off and Flash; backfilling old configurations invalidates retained work.
- Out of scope: pronunciation inference, dictionary uploads, glossary editor, new providers and automatic regeneration; Docker storage, Markdown escaping and direct Resume are separately planned.
- Task 1: pure glossary parsing, whole-term matching, deduplication and validation.
- Task 2: paired clean/sent request planning with atomic IPA and exact character-limit accounting.
- Task 3: optional setting carried through admission, durable drafts, templates, schedules and transfer without backfill.
- Task 4: runtime recipe integration, provided-audio bypass, transcript/script separation and safe reuse.
- Task 5: independent Audio control in Play/project editing, defaults and persistence tests.
- Repair outcomes: matched terms survive logical boundaries and punctuation; Unicode-equivalent keys conflict consistently; English phoneme validation is explicit; saved merged overrides have server-derived source bindings; Restore recognizes narration work; reused/late audio binds clean metadata to the receiving revision without changing history.
- Verification: final full suite at `6eeac3f` passed 3,636 tests with one existing skip in 456 files (36.69 seconds). Workspace typecheck, lint and build passed before the final Unicode repair, whose app typecheck, scoped lint and 222 tests passed; each final review covered all 49 changed files, with additional legacy-compatibility and planner probes. Existing Vite bundle-size warning only. No production generation or migration occurred.
- Review loop: six rounds; twelve confirmed Important findings in rounds 1–4 fixed with red/green regressions; duplicate/refuted hypotheses recorded in the retained local ledger. Rounds 5 and 6 both dry across independent spec, quality and unhappy-path lenses.
- Refreshed `01-architecture-narration.md`: independent glossary transform, provider boundaries, exact/clean text, overrides and publication.
- Refreshed `02-models-narration.md`: glossary, spans, paired requests, source bindings, schemas and persistence.
- Updated `06-testing.md`: scoped pronunciation test inventory and dated verification, without falsely advancing historical broad stamps.
- Absorbed `logic/08-narration.md`: defaults, parsing/matching/refusals, provided bypass, atomic limits and clean outputs.
- Absorbed `logic/12-reruns-and-edits.md`: selective invalidation, authoritative merged overrides, Restore and retained metadata.
- Absorbed `mockup/06-play.md` and `mockup/08-project.md`: independent preference, old-value compatibility and files.
- Absorbed `uiux/screens/02-play.md` and `uiux/screens/03-project.md`: labelled shared control, dormant unsupported choices and no token change.
- Updated `logic/README.md`, `mockup/README.md`, `uiux/README.md` and `00-index.md` to identify the absorbed behavior.
- Feature folder retained by configuration; branch is included in the already-authorized combined release. `review retro` is available separately; it was not run.
- Diff (`5e2f359..6eeac3f`): `packages/app/src/edge/http/project-template-source.test.ts`, `packages/app/src/slices/admission/model.ts`, `packages/app/src/slices/admission/pronunciation-rules.test.ts`, `packages/app/src/slices/admission/rules.ts`, `packages/app/src/slices/admission/schema.test.ts`, `packages/app/src/slices/admission/schema.ts`, `packages/app/src/slices/narration/pronunciation-chunks.test.ts`, `packages/app/src/slices/narration/pronunciation-chunks.ts`, `packages/app/src/slices/narration/pronunciation.test.ts`, `packages/app/src/slices/narration/pronunciation.ts`, `packages/app/src/slices/narration/steering-pronunciation.test.ts`, `packages/app/src/slices/narration/steering.ts`, `packages/app/src/slices/play-drafts/convert.test.ts`, `packages/app/src/slices/play-drafts/convert.ts`, `packages/app/src/slices/play-drafts/schema.test.ts`, `packages/app/src/slices/play-drafts/schema.ts`, `packages/app/src/slices/rebuild/recipe-audio-parts.ts`, `packages/app/src/slices/rebuild/recipe-audio.ts`, `packages/app/src/slices/rebuild/recipe-preparation.ts`, `packages/app/src/slices/rebuild/recipe-pronunciation-chunks.test.ts`, `packages/app/src/slices/rebuild/recipe-pronunciation.test.ts`, `packages/app/src/slices/rebuild/recipe-text.ts`, `packages/app/src/slices/rebuild/runtime-export-inputs.ts`, `packages/app/src/slices/rebuild/runtime-narration-publication.ts`, `packages/app/src/slices/rebuild/runtime-narration-reuse.ts`, `packages/app/src/slices/rebuild/runtime-pronunciation-metadata.test.ts`, `packages/app/src/slices/rebuild/runtime-pronunciation-reuse.test.ts`, `packages/app/src/slices/rebuild/runtime-pronunciation.test.ts`, `packages/app/src/slices/rebuild/runtime-publication.ts`, `packages/app/src/slices/rebuild/transition-repo.test.ts`, `packages/app/src/slices/rebuild/transition-repo.ts`, `packages/app/src/slices/revisions/model.ts`, `packages/app/src/slices/revisions/mutation-assets.ts`, `packages/app/src/slices/revisions/mutations-narration-source-trust.test.ts`, `packages/app/src/slices/revisions/mutations-pronunciation-groups.test.ts`, `packages/app/src/slices/revisions/mutations.ts`, `packages/app/src/slices/revisions/rules.ts`, `packages/app/src/slices/revisions/schema.ts`, `packages/app/test/preparation-saved-workflows.test.ts`, `packages/app/test/revision-preparation-control.test.ts`, `packages/app/test/revision-preparation.fake.ts`, `packages/app/test/revision-pronunciation-authority.test.ts`, `packages/web/src/play/draft-compat.test.tsx`, `packages/web/src/play/draft-state.test.ts`, `packages/web/src/play/draft-state.ts`, `packages/web/src/play/media-rails.tsx`, `packages/web/src/play/pronunciation-glossary.test.tsx`, `packages/web/src/play/pronunciation-glossary.tsx`, `packages/web/src/project/revision-providers.tsx`, ``, `Changes:`.

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

## 2026-09-25 - groom: Video Recovery Design

key: groom/2026-09-25-video-recovery@Q3

- Approved catalogue-consistent rebuild validation and three bounded retries for transient subtitle-model download interruptions.
- Retain completed outputs, exact revision checks, private verified model caching, cancellation and atomic publication.
- Rejected bypassed stale checks, silent subtitle omission and broad provider retries; bundling the model was offered but not selected.
- One-click Resume, IPA, Docker project-folder access and literal plain-text conversion remain separate pending changes. No production generation or release is authorized by tests.

## 2026-09-25 - groom: Plain Narration

key: groom/2026-09-25-plain-narration@Q1

- What: remove Markdown serializer escapes from spoken/readable text without removing genuine literal backslashes.
- Authority: user's explicit character-escape fix and delegated no-question execution; inherited subagent mode.
- Evidence: transformed remark/GFM/strip-markdown AST already contains correct R&D; final Markdown serialization introduces the backslash.
- Decision: direct paragraph text projection, existing removal semantics and immutable article preserved; no dependency, API, schema or historical rewrite.
- Scope: five requirements/five behavior rules with isolated tests; implementation remains ordered after Docker project storage.

## 2026-09-25 - groom: Glossary pronunciation
key: groom/2026-09-25-glossary-pronunciation@Q3

- Formalize independent Use Pronunciation Glossary for Inworld TTS-2/Flash, enabled in fresh Play configurations and opt-in for saved work.
- Pin supplied glossary IPA only, single-word slash tokens, exact clean-text preservation, atomic request splitting and no extra LLM call.
- Preserve missing/off identities, completed outputs and explicit admission; no live generation or deployment during verification.
- Reject whole-article conversion, LLM rewriting and preparation-only coupling; host-visible files, escaping and one-click Resume remain separate pending changes.

## 2026-09-25 - groom: Docker project folder
key: groom/2026-09-25-docker-project-folder@Q4

- `features/2026-09-25-docker-project-folder/spec.md`: defines automatic host project storage, verified migration, retained history, private app state and truthful host folder access.
- Decision authority: the user explicitly delegated remaining decisions and requested no further questions; the selected subagent execution mode continues.
- Chosen: nested `/data/projects` bind plus private installation state; original source retained, copy verified before activation, remembered paths reused on updates.
- Rejected: whole-data exposure, duplicate export mirroring, manual bind/permission setup and a broad host desktop-command bridge.
- Out of scope: remote daemon/NAS sync, new platform launchers, paid generation in tests, and the independent escaping/Resume/stage-rerun changes.

## 2026-09-25 - groom: Direct Resume and Section Reruns

key: groom/2026-09-25-direct-resume-reruns@Q4

- What: direct Resume/Retry for unfinished work and deliberate section regeneration without mandatory cost acceptance.
- Authority: user requested these controls and explicitly delegated design/implementation decisions without further questions; inherited subagent execution.
- Decisions: reuse immutable recipes/admission/receipts, preserve checkpoints and provided/manual-caption review, retain all old files, rebuild only the selected affected closure.
- Rejected: reactivating destructive legacy reruns, unguarded retries, automatic provided-content approval or installation-triggered work.
- Evidence: HTTP controls currently refuse these actions; revisioned UI hides legacy reruns; current revision/admission infrastructure provides the safe integration boundary.
- Scope: nine requirements/eight behavior rules; isolated runtime/HTTP/UI verification, no production generation. Plan and implementation pending after the preceding ordered fixes.

## 2026-09-25 - fix-legacy-document-retry
### fix/legacy-document-retry — Slopify 1.5.1

- User requested a quick patch, publication and local Docker update; no new feature interview or full local CI rehearsal.
- `preview-retained.ts` replaces pre-document research/editor and article requests in the reviewed rebuild plan when they have no running call, accepted continuation, completed piece or cached answer. Admission creates a new invocation; old requests and attempt history remain intact.
- `preview-plan.ts` preserves the duplicate-charge warning when a reviewed replacement has a different fingerprint from a previously submitted request.
- `revision-document-upgrade.test.ts` covers failed/pending editor and article requests through the real runner with fake providers, report reuse, original attempt retention, and running/accepted/cached request preservation.
- Local verification: 52 focused test files, 289 passing tests; application typecheck and production build passed. Read-only planning against the installed project matched the scheduler fingerprint and retained all 13 reports and six images. No production generation was started.

## 2026-09-25 - edit-list-motion
### Motion: pan across, a mix, or still

- How each image moves in the video is now a per-project setting, Motion, next to Zoom (%) on Play → Outputs → Export and Edit project → Inputs. Zoom in and out is what videos did before and stays the default. Pan across slides a slightly zoomed crop over the image, taking turns left to right, right to left, top to bottom and bottom to top. Mix of both takes turns between a zoom and a pan. Still shows each image without moving.
- A pan uses the Zoom (%) as its crop, or 10% when the zoom is lower, so at 0% the pans still move while zooms keep the images still.
- The same project always moves its images the same way, so a re-render looks identical.
- Projects, revisions, drafts, templates and backups saved before this read as Zoom in and out, and their finished videos are kept as they are. Changing the motion re-renders only the video.
- The video render now works from an edit list: a versioned description of every shot, how it moves and the audio under it, recorded in `render.json` as `editList`. It replaces the `images` slots and the top-level `audio`, `width`, `height` and `fps` of a video's `render.json`; WAV exports keep their record as it was.

## 2026-09-25 - document-stage
### Document stage: the article as a styled PDF

- New optional stage, Document, after the article: it lays the project's article out as a PDF with a title page, a clickable table of contents, drop caps after headings, clickable links, a Sources page and the theme's closing page. It is made on your machine with no provider, key or charge, and runs beside narration and images instead of after them. Switch it on per project on Play (Generate or Off) or in Edit project → Inputs; it is Off by default.
- Two themes, DiceMaster (parchment page, Cinzel lettering, DiceMaster.io branding and closing page) and Plain (flat page, no branding). Every size, spacing, font, drop cap, page and header/footer value comes from one theme object, ready for a theme editor in the Library later.
- The article's markdown is read as markdown: headings become the contents, bold, italic, lists, quotes and links keep their meaning, and the "Sources Consulted" section moves to the Sources page, followed by any other link the research notes cite. The pronunciation glossary stays out of the PDF.
- When the project has a thumbnail (generated or uploaded), it becomes the cover on the title page. A thumbnail that isn't PNG, JPEG or WebP is left off rather than failing the document.
- The project page has a Document row with its state; its output offers Download, Open folder and Open PDF, which opens it in a new browser tab.
- Editing the article, the title or the theme marks the document as needing a rebuild; nothing else is affected. Resume, Retry stage and Re-run section work on it like any other stage.
- Existing projects get a Document stage that is switched off, so nothing shows as waiting. The upgrade rebuilds two database tables to allow the new stage (schema version 14) and keeps every row.
- The bundled Cinzel font ships with its SIL Open Font License beside it (`packages/app/src/assets/document/fonts/OFL.txt`). New dependency: jsPDF 4.2.1 (MIT; 4.2.1 fixes the advisories against earlier versions), for writing PDF files, which Node and the existing dependencies cannot do.

## 2026-09-25 - docker-open-folder
### Open folder in Docker

- In Docker, Open folder now opens the output folder in your file manager through the host helper (`POST /v1/open-folder`), as a native install does. The helper only opens folders inside a project folder the Docker launcher recorded, checks that folder is still the one it recorded, and refuses links, files and folders you don't own on the way down. It runs `xdg-open`; if that isn't installed, it says so and how to install it.
- Without the helper (API-only Docker, `--host-cli=off`) or with an older one, Open folder still shows the host path, and now explains why and that running the Docker launcher again (`npx @gentbajko/slopify@latest --docker`) sets the helper up.

## 2026-09-25 - clear-errors
### Clearer errors

Every error a person can see was rewritten to say what failed, the likely cause and exactly what to do, using the names on screen (Settings → Providers, Edit project → Narration, Retry stage, Re-run section, Download diagnostics) or the exact command.

- Stage failures start with the part that failed: "Image 3:", "Narration chunk 9 of 10, part 2 of 2:", "Research topic 4:", "Thumbnail:".
- Provider failures read the same for every provider: a rejected or expired key, no credits, rate limits, a provider outage, a content refusal, a dropped connection or an unreachable network each get their own sentence, with the provider's own words quoted after it. A failed model or voice list in Settings says to refresh the list.
- Internal checks a person cannot act on say "Slopify hit an internal error (…)", ask to retry, and point to Download diagnostics.
- Refusals when saving, starting, resuming, editing or scheduling name the field or button involved; conflicts say the project changed and to reload.
- The page says "Slopify isn't responding" when the app is stopped or restarting, and stops showing raw status codes or validation dumps.
- Terminal messages for installing and starting Slopify: a port in use gives the `--port` command, Docker not installed / not running / permission denied each get their fix, and a database from a newer Slopify says to update.
- Schedule run history shows sentences instead of reason codes such as "spend-limit".

## 2026-09-24 - release verification: 1.4.1
key: release-verification/1.4.1

- Released `1.4.1` from `19c8dff1850fabad240fcea77ad17881b09b55f2`; the reviewed release commit and annotated tag were pushed atomically to `main` without force.
- GitHub release: https://github.com/GentBajko/slopify/releases/tag/1.4.1 ; public, stable, published 2026-09-24T21:09:16Z.
- Candidate CI: https://github.com/GentBajko/slopify/actions/runs/36057143166 ; Linux, Windows and Docker checks passed.
- Release workflow: https://github.com/GentBajko/slopify/actions/runs/36057935276 ; metadata, Linux, Windows, Docker verification, npm publication and multi-architecture GHCR publication all succeeded.
- Local verification: 436 test files; 3368 tests passed, one skipped; lint, strict type checks, build and dependency audit passed. A disposable 390×844 browser check verified focused field-level errors beside Start, the pending label and retained cost acknowledgment. No real generation was used.
- npm: exact-version metadata and `latest` both report `1.4.1`. Public availability was verified after npm's processing delay; the package was not republished.
- Downloaded npm tarball: https://registry.npmjs.org/@gentbajko/slopify/-/slopify-1.4.1.tgz ; 1337694 bytes, SHA-1 `c456619e62a10dde5ec98585badd2bf0c7931eed`, matching the release job and registry. Package version, Docker launcher and rebuild readiness module verified. Signed provenance: https://search.sigstore.dev/?logIndex=2944421225 .
- GHCR: `ghcr.io/gentbajko/slopify:1.4.1` and `:latest` share index digest `sha256:2863927789aad072098e6465758e2d644d4e8e5d7abdd1b03a5843ae98ef65ca`.
- GHCR linux/amd64 manifest: `sha256:915b36d6c92949d77bbc5cc91f68e8a8027b1cb9bf50e29e0c795fbe1560fb8a`; linux/arm64 manifest: `sha256:72404aaad282230c80c6f23e95479c2faa61e64a56ad78f9f8865099030248ae`. Both include attestation manifests.
- With the user's approval, pulled the published image and ran `npx --yes @gentbajko/slopify@1.4.1 --docker` against the existing container and named data volume. Both the app and host helper report `1.4.1`; the container is healthy, bound to `127.0.0.1:6969`, with restart policy `always`. The helper is active/enabled, accepting work, and has zero active jobs.
- Private pre-update SQLite backup: `/data/slopify-pre-1.4.1-oOzIit/slopify.db`, directory mode 0700 and file mode 0600. SQLite integrity checks passed. Previous container retained stopped as `slopify-previous-20260924230952`.
- Post-update row comparisons with the backup confirmed unchanged prompts (8), settings (0), provider keys (1), voices (2), projects (1), Play drafts (3) and project assets (0). The `slopify-data` volume and read-only host-helper share remain the only mounts; no host credential or executable directories were mounted.
- Rechecked the user's saved rebuild review using read-only provider/model and local admission validation in the updated container: both error lists are empty, with zero rebuild admissions. Claude, Codex, Gemini and Codex Images retain host-managed CLI paths. No project was retried and no paid generation was started.
- Marketing was unchanged. Three unrelated Codex planning fragments remain untracked.

## 2026-09-24 - release verification: 1.4.0
key: release-verification/1.4.0

- Released `1.4.0` from `48a0f900624763ba7450a1c693080a7cee273eb7`; reviewed commits and matching annotated tag pushed without force to `main`.
- GitHub release: https://github.com/GentBajko/slopify/releases/tag/1.4.0 ; public, stable, published 2026-09-24T20:00:35Z.
- Candidate CI: https://github.com/GentBajko/slopify/actions/runs/36049621979 ; Linux, Windows and Docker checks passed after the isolated Windows WAV acceptance timeout correction.
- Release workflow: https://github.com/GentBajko/slopify/actions/runs/36050385475 ; metadata, Linux, Windows, Docker verification, trusted npm publication and multi-architecture GHCR publication all succeeded.
- Local verification: 435 test files; 3357 tests passed, one skipped; lint, strict type checks and build passed; dependency audit found zero vulnerabilities. Native installation/automatic FFmpeg recovery and disposable Docker persistence/host-helper smoke tests passed.
- Host-helper smoke verification used host child processes and fake generation, including image bytes stored in the project, helper restart, an alternate container UID and no automatic generation replay. Read-only real host CLI authentication/model discovery checks passed for Claude and Codex; Gemini authentication remains unknown rather than inferred from files.
- npm: `@gentbajko/slopify@1.4.0`; exact-version metadata and `latest` verified. npm initially reported package processing and public endpoints returned stale metadata/404s; publication was confirmed after processing completed.
- Downloaded npm tarball: https://registry.npmjs.org/@gentbajko/slopify/-/slopify-1.4.0.tgz ; 408 files, 1337459 bytes; SHA-1 `c4dd296f1cab5e876b5712f6fb652ba8748e62f6`, matching the release job. Package version and host helper/server/client modules verified without installation.
- npm integrity: `sha512-ZiomTgPgiFEI+jrwYrjCmw29XvLGn/jownd9dBuQrLuf68zrwon3FohKo4679PunuD1DQaXu1MulAeMUrh8y4w==`; signed SLSA provenance present, transparency record https://search.sigstore.dev/?logIndex=2943924397 .
- GHCR: `ghcr.io/gentbajko/slopify:1.4.0` and `:latest` share index digest `sha256:161338f4d40e85b1c32345a9b14c15b790b8cf79805c348038be6f878de53715`.
- GHCR linux/amd64 manifest: `sha256:e28b382597ed9881ab7a977465335d8a948f45b11540026248f9a059571bed69`.
- GHCR linux/arm64 manifest: `sha256:315af7bf8f48c4330f01c16efeb7c51fd33e72d6e357879e9b60ea7d95336232`; each platform also has an attestation manifest.
- Downloaded published amd64 image: version 1.4.0, host bridge protocol label 1, host helper/server/client files and bundled FFmpeg/README/LICENSE verified. An isolated network-disabled container encoded H.264 successfully and was automatically removed.
- Marketing: https://slopify.stream deployed using authenticated Wrangler; Cloudflare version `719cfeaf-6606-4401-a835-5509c9b0d980`; live HTML returned HTTP 200 and exactly matched committed source, including the Docker launcher and one-time host-helper permission guidance.
- Live HTML SHA-256: `8ff639419aa86bbdbb03b387b5ead12e7a4f75aaffd885ce015f3ebb9aca1ee8`.
- Boundaries: no paid provider calls, no production database edits, no persistent host-helper installation and no replacement or restart of the running Slopify Docker container. Three unrelated Codex planning fragments remain untracked.

## 2026-09-24 - release: Windows WAV acceptance budget
key: release/1.4.0-ci@51cb5cc

- Hosted CI 36048840386 passed Linux and Docker verification, including the packaged host helper. Windows installation passed, but the existing MP3-to-WAV acceptance test exceeded its default five-second timeout.
- Raised only that test's outer budget to 60 seconds; retained its 30-second completion poll, real FFmpeg work, PCM properties, download headers and RIFF/WAVE assertions. No runtime behavior or assertion was weakened.
- Publication stays gated on a passing hosted run of the corrected candidate. No 1.4.0 tag or package was published from the failed candidate.

## 2026-09-24 - release verification: 1.3.1
key: release-verification/1.3.1

- Released `1.3.1` from `7e8d1a97056676e207bdd42d5c80ba637ab6bbb6`; matching annotated tag and reviewed commits pushed without force to `main`.
- GitHub release: https://github.com/GentBajko/slopify/releases/tag/1.3.1 ; public, stable, published 2026-09-24T17:06:22Z.
- Release workflow: https://github.com/GentBajko/slopify/actions/runs/36030384891 ; metadata, Linux, Windows, container verification, trusted npm publication and multi-architecture GHCR publication all succeeded.
- Linux hosted verification: 418 files, 3250 tests passed and 1 skipped; lint/typecheck/build passed; dependency audit found zero vulnerabilities.
- Windows hosted verification: clean install smoke passed; five native/CLI/storage/revision test groups passed with 122, 1, 170, 117 and 530 passing tests respectively; skips remained platform-conditional.
- Local verification: lint checked 1036 files; typecheck/build passed; 3250 tests passed and 1 skipped; audit reported zero vulnerabilities; native preparation acceptance passed after the hosted timeout correction.
- Clean archive `7e8d1a9`: package install smoke and Docker smoke passed, including scripts-disabled native FFmpeg recovery/cache reuse, offline Docker startup/render and host CLI bridge persistence.
- npm: `@gentbajko/slopify@1.3.1`; public exact-version and `latest` endpoints plus dist-tags endpoint verified after the package-listing cache initially returned 1.2.1.
- npm tarball: https://registry.npmjs.org/@gentbajko/slopify/-/slopify-1.3.1.tgz ; 394 files; SHA-1 `39526fcc307a2894cd99470a6386afbae12c6fe7`, identical to the locally smoke-tested package.
- npm integrity: `sha512-6cwScigNncbBtt9h1+XEpO7FixbLYcL9WSyQezZ8uGNHMHSQNgMVlqcJVoiTnW/zwbk8iaCFazqk1P4Bgg6NUQ==`; signed SLSA provenance present, transparency record https://search.sigstore.dev/?logIndex=2942057057 .
- npm downloaded tarball: package version, narration validator/renderer/runtime, migration 0011, Codex image adapter and Docker launcher present; no test files or local feature/changelog documents.
- GHCR: `ghcr.io/gentbajko/slopify:1.3.1` and `:latest` share index digest `sha256:296a6d4daea08eabf52035141456de65c97d97e902f4caa4b01369aa010a68db`.
- GHCR linux/amd64 manifest: `sha256:9054eabd46cdda15dbe4198916f44e1fb9b0a9021965e0e4b2d854914ccce115`.
- GHCR linux/arm64 manifest: `sha256:6296e8c0dec01c4c0a6cb594cc6517ab0fefb1072e05bd682a11770a4302ef2c`; each platform also has an attestation manifest.
- Downloaded published amd64 image: version 1.3.1, bundled FFmpeg and README/LICENSE verified; an isolated network-disabled container rendered H.264 successfully and was automatically removed.
- Marketing: https://slopify.stream deployed using authenticated Wrangler; Cloudflare version `cadcdb36-8c53-48d2-9f92-9c2a702aa2a8`; live HTML and CSS returned HTTP 200 and exactly matched committed source.
- Live HTML SHA-256: `363771de2d049946cec3fe35f9855323a83ec8f8cede6f8341e1f386039c6a33`; CSS SHA-256: `d3602228fe8025fe20d209bfc50358c66435fee1ccddb991f79faab2d15d257c`.
- Prior attempt: tag 1.3.0 remains at `8b7354b325dcc1799aa164e0a841e190620a73fe`; its verification timeout prevented npm/GHCR publication. The unpublished draft was retargeted to 1.3.1.
- Boundaries: no paid provider calls, no production database edits and no replacement of the running Slopify Docker container. Three unrelated Codex planning fragments remain untracked.

## 2026-09-24 - release verification: 1.3.0 held
key: release-verification/1.3.0

- Tag `1.3.0` at `8b7354b325dcc1799aa164e0a841e190620a73fe` passed local verification and disposable package/container smoke.
- GitHub release workflow 36028706079 blocked publication: the two fresh/upgrade narration acceptance cases exceeded their 30-second timeout on hosted Linux and Windows. Docker, including offline FFmpeg startup/render, passed.
- Raised only the native acceptance/retry test budgets to 90 seconds; assertions and production behavior are unchanged. The existing tag is not rewritten. Correction proceeds as 1.3.1.
- Marketing Docker commands are committed and locally verified; Cloudflare deployment requires authentication. A live check still showed the previous website.

## 2026-09-24 - plan-research-documents
### Research documents plan

Key: plan/2026-09-24-research-documents@Q4

The user approved continuing inline through release and local update without further procedural interruptions. Keep editorial consolidation, preserve each original report, and give the article writer both. Four tasks cover immutable research documents, request-scoped read-only CLI delivery, host/API verification, and scoped recovery/release/update. No paid test generations, automatic retries or active-service restarts. The ignored feature plan records the file map and requirement coverage.

## 2026-09-24 - plan: 2026-09-24-narration-preparation
key: plan/2026-09-24-narration-preparation@Q3

- `features/2026-09-24-narration-preparation/plan.md`: approved eight-task inline implementation plan covering all 11 requirements and 12 behavior rules.
- Task 1: validate source-bound cue annotations with unchanged sentence text.
- Task 2: render persistent instructions into bounded physical TTS requests.
- Task 3: extend prompt storage, admission, drafts, templates and preserving migration.
- Task 4: execute preparation through revision-owned Audio LLM work and estimate both initial and rebuild costs.
- Task 5: publish separate clean narration and TTS scripts with clean caption input.
- Task 6: expose optional preparation and scoped text downloads in Audio.
- Task 7: verify complete execution, recovery, upgrades and UI; absorb affected references.
- Task 8: bump, publish and verify npm, GitHub and multi-architecture GHCR artifacts.
- File map: narration pure functions; library/admission/drafts/templates; revision recipes/runtime; storage roles; Play/project/prompt UI; migration and regression tests; affected reference chapters and release metadata.
- Constraints: Off preserves old identities; Inworld TTS-2 only; existing prompts remain untouched; no paid smoke calls or automatic production-container redeployment.
- Constraints: strict structural TypeScript, existing dependencies and attempt wrapper, exact-path commits preserving unrelated files, full CI verification before publication.

## 2026-09-24 - plan: 2026-09-24-host-cli-bridge
key: plan/2026-09-24-host-cli-bridge@Q4

- `features/2026-09-24-host-cli-bridge/plan.md`: eight dependency-ordered tasks cover authenticated host execution, cancellation, installer lifecycle, readiness, UI and disposable verification.
- Approved inline implementation against specification checksum `1b69367393de81c99d3445703ef1a16a0695df5c`.
- Release authorized after verification: bump, push and publish; no paid generation or live container replacement authorized.

## 2026-09-24 - plan: 2026-09-24-codex-image-provider
key: plan/2026-09-24-codex-image-provider@Q4

- docs/capstone/features/2026-09-24-codex-image-provider/plan.md maps 11 requirements, 11 behavior rules and four global constraints to five test-first tasks.
- File map covers local CLI discovery, API-only YAML filtering, admission and execution validation, an isolated Codex ImagePort adapter, shared executable readiness, provider UI, and media-publication tests.
- Tasks: discover installed CLI models without generation; make CLI choices independent of YAML; produce one validated image from an isolated Codex child; expose Codex as a shared-path image provider; verify ordinary media publication.
- Constraints pinned: no image API fallback or new dependency, no direct project writes or leaked credentials, preserved saved IDs, code-owned local concurrency, test-first commits on a feature branch, and no docs-area commits.

## 2026-09-24 - map: research handoff baseline
key: map/research-handoff-baseline@9259b89169be

- `01-architecture-research.md` splits out the current research/provider handoff, private CLI workspaces and absent document contract.
- `02-models-research.md` records Finding, Message and resolved input shapes; chapter text remains a revision piece payload, not a file asset.
- `04-data-flow-research.md` traces planner, chapter publication, synthesis and article input; the Claude stdin fix is explicitly uncommitted and undeployed.
- `00-index.md` indexes the scoped replacements; unrelated broad chapters retain their existing stale stamps and are not claimed refreshed.
- No interface chapter applies; all provider dependencies are vendors or modules of this monorepo.

## 2026-09-24 - map: narration preparation and requested installation fixes
key: map/narration-preparation@2026-09-24

- Refreshed feature-scoped architecture, models, data flow, testing and operations paragraphs from the implemented preparation/runtime/UI paths.
- Absorbed optional source-bound cues, strict validation, persistent steering, exact clean transcript, revision-owned retry and per-segment downloads into narration, prompt-management and subtitle scenarios.
- Updated prompt list/editor, Play, Project and experience references for the fourth prompt kind, explicit starter, Off-by-default Audio selection, frozen body, cost/refusal correction and separate current/history text links.
- Updated marketing references for the Linux Docker launcher and direct GHCR command, with narrow-screen copy behavior and localhost/data/restart guidance.
- Documented Codex image registration/shared executable and Docker's build-time FFmpeg installation; native first-launch recovery remains automatic when dependency scripts are disabled.
- Added absorption provenance and refreshed existing index descriptions. Broad historical snapshot stamps remain unchanged because unrelated chapter coverage was not re-audited.
- Verification: 418 test files, 3250 passed and 1 skipped; lint/typecheck/build passed; npm audit found zero vulnerabilities; disposable install/container tests passed, including offline Docker render/start and scripts-disabled native FFmpeg recovery.
- Browser checks: isolated empty app data, desktop and 390px controls, keyboard focus, starter, provided-article LLM correction, unsupported-model message and Codex image/provider choices; no paid generation or live database/container mutation.

## 2026-09-24 - map: narration-preparation-baseline
key: map/narration-preparation-baseline@17d541e14949

- `01-architecture.md`: verified the production revision Audio executor and absence of narration-preparation work at 1.2.1.
- `02-models.md`: verified narration configuration, recipe, library and strict persistence boundaries.
- `04-data-flow.md`: traced Markdown conversion, physical requests and subtitle transcripts.
- `logic/08-narration.md`: recorded absent steering state and current CLI-model readiness behavior.
- Chapter-wide snapshot stamps remain unchanged; this is a targeted narration baseline, not a full reference refresh.

## 2026-09-24 - map: host CLI bridge
key: map/host-cli-bridge@9bd6517

- Scoped refresh after host execution replaced mounted container executables. Unrelated historical broad stamps and reference coverage remain unchanged; no unrelated full-map regeneration.
- `01-architecture.md`: covered host-CLI behavior changed; host composition, socket protocol and app/host ownership.
- `02-models.md`: covered host-CLI behavior changed; host status, strict protocol limits and terminal unavailable.
- `04-data-flow.md`: covered host-CLI behavior changed; host execution, cancellation and container image publication.
- `06-testing.md`: covered host-CLI behavior changed; real-socket/fake-process and packaged Docker evidence, with live-call limits.
- `07-operations.md`: covered host-CLI behavior changed; consent, install/upgrade/rollback, private paths and disable/update commands.
- `logic/02-provider-credentials.md`: covered host-CLI behavior changed; host readiness and read-only paths.
- `logic/09-image-generation.md`: covered host-CLI behavior changed; host image-byte transfer and terminal uncertain failures.
- `logic/13-cancel.md`: covered host-CLI behavior changed; per-request host cancellation, cleanup and deadline ownership.
- `logic/19-catalogue-thinking.md`: covered host-CLI behavior changed; host CLI discovery distinct from YAML API catalogues.
- `logic/20-boot-cli-recovery.md`: covered host-CLI behavior changed; one-command helper setup, lifecycle and no container fallback.
- `mockup/03-settings.md`: covered host-CLI behavior changed; read-only host commands versus editable native paths.
- `uiux/screens/08-settings.md`: covered host-CLI behavior changed; host/login/helper error states without an installer UI.
- `logic/README.md`: covered host-CLI behavior changed; updated scenario descriptions.
- `mockup/README.md`: covered host-CLI behavior changed; updated Settings scope.
- `uiux/README.md`: covered host-CLI behavior changed; updated Settings scope.
- `00-index.md`: covered host-CLI behavior changed; host helper/module entries and Settings companion rows.
- No new external repository interface, screen, design token or dependency was added; those topics were not regenerated.
- Index refreshed last; source pointers and local links checked. Existing unrelated fragments remain untouched and no branch ledger folding was performed.

## 2026-09-24 - map: host CLI execution baseline
key: map/host-cli-baseline@1891c70d2017

- Rechecked the host-CLI portions of architecture, provider models and operations against source before designing a host execution bridge; unrelated broad chapter stamps remain historical.
- Recorded the existing Docker behavior accurately: read-only executable/model-cache mounts, CLI execution inside the container, separate HOME/login, and no host helper or transport.
- Corrected image-provider registration and dynamic CLI catalogue descriptions, plus ModelInfo.group and Readiness.issue fields.
- Added the existing Linux Docker launcher to the index module map. No new runtime behavior, service or container configuration was installed.
- Read-only host/container status checks confirmed that host Claude and Codex logins are available while their container logins are not. Only login booleans/method names were retained; credentials were not read or copied.
- Identified version-only readiness, repeated missing-login attempts, and generic Codex image error reporting as related implementation boundaries. Paid generation was not invoked.
- Fragments remain unfolded on the feature branch; pre-existing untracked fragments are untouched.

## 2026-09-24 - implement: narration preparation
key: implement/2026-09-24-narration-preparation@Q3

- What: optional source-preserving Inworld TTS-2 delivery preparation for documentary narration; original article prompts and saved content remain intact.
- Approach: the selected text LLM returns validated sentence-bound cues; deterministic rendering produces bounded exact TTS requests and separate clean transcripts inside the existing revision-owned Audio stage.
- Rejected: freely rewriting tagged prose cannot guarantee unchanged spoken content.
- Rejected: independently generated article, narration and TTS content can diverge.
- Rejected: fixed non-LLM tags do not respond to the narration's content.
- Rejected: automatic activation adds unrequested cost and latency to existing setups.
- Out of scope: rewriting or shortening saved documentary/article prompts.
- Out of scope: translation, pronunciation substitution, SSML, voice cloning and provider-authentication changes.
- Out of scope: steering formats other than Inworld TTS-2; Flash and other providers retain the plain path when preparation is Off.
- Out of scope: paid live LLM/TTS/image verification.
- Out of scope: replacing the running Docker container or changing its projects/data.
- Out of scope: unrelated earlier Codex planning fragments, retained untracked.
- User-added scope: include the existing Codex image adapter, register its image provider and share the Codex executable configuration; the original exclusion of that adapter was superseded by the explicit missing-provider request.
- User-added scope: marketing-page Docker commands and deployment, plus FFmpeg included in Docker and automatic native-install recovery verification.
- Task 1: strict source-bound cue validation and invalid-answer tests; commit b3f0fa0.
- Task 2: bounded physical rendering, persistent instructions, reset and one-shot behavior without text changes; commit ce9acf8.
- Task 3: optional selection, fourth prompt kind, preserving migration and saved-data compatibility; commit f6d47b3.
- Task 4: revision-owned preparation, wrapper retries, admitted dependencies and compatible reuse; commit 39bf754.
- Task 5: exact clean narration, separate TTS scripts and caption-safe scoped publications; commit f4cfefd.
- Task 6: optional Audio control, explicit starter, shared LLM correction, estimates and download/history UI; commit 747a463.
- Task 7: fresh/upgraded composed acceptance, saved workflows, restart/control tests, browser checks and scoped reference absorption; commit af7df90 and reference changes in 8b7354b.
- Task 8: corrected 1.3.1 publication and artifact verification; see `2026-09-24-release-1.3.1-verification.md`.
- Additions: Codex image registration 5b28ea4; Docker marketing 834668f; bundled FFmpeg and installation smoke c4b45a9.
- Release correction: 1.3.0 verification timed out before publication; 4a5b810 changes only native test budgets and 7e8d1a9 prepares 1.3.1. The 1.3.0 tag remains unchanged.
- Review loop: three full-diff rounds, including two consecutive dry rounds; four confirmed findings fixed and two suspected findings refuted.
- Review loop: two FFmpeg add-on passes ended dry; offline test tmpfs ownership corrected before successful repetition.
- Review loop: one hosted-test timeout finding fixed, followed by two dry passes; total five confirmed findings fixed, two refuted, no unresolved Important/Critical findings.
- Reference wrap: preserved broad historical stamps because only affected sections were re-audited; corrected duplicate marketing absorption metadata and validated all 22 changed YAML frontmatters.
- Verification: 418 test files, 3250 passed and 1 skipped; lint, typecheck, build and audit pass; clean 1.3.1 archive native install and offline Docker startup/render pass.
- Verification: desktop and 390px browser acceptance, keyboard focus, starter, correction states and Codex image selection; fake-provider/component tests cover downloads, saved workflows and retry boundaries.
- Local history: retained the completed ignored feature folder under the existing `delete_feature_folders: false` policy.
- Refreshed/absorbed `docs/capstone/01-architecture.md`: revision-owned Audio preparation, source/script separation and shared Codex image registration.
- Refreshed/absorbed `docs/capstone/02-models.md`: fourth prompt kind, optional fields, cue schema, clean request text, preparation work and download roles.
- Refreshed/absorbed `docs/capstone/04-data-flow.md`: validated preparation dependency, materialization, publication, compatible reuse and caption flow.
- Refreshed/absorbed `docs/capstone/06-testing.md`: cue, splitting, migration, runtime, restart, browser and installation verification.
- Refreshed/absorbed `docs/capstone/07-operations.md`: optional narration setup, built-in FFmpeg installation/recovery and release commands.
- Refreshed/absorbed `docs/capstone/logic/08-narration.md`: source-preserving optional cues, persistent direction, caps and retries.
- Refreshed/absorbed `docs/capstone/logic/15-prompt-management.md`: fourth prompt kind, explicit starter and frozen project/template copies.
- Refreshed/absorbed `docs/capstone/logic/17-subtitles.md`: persisted clean transcript selection without stripping source bracket spans.
- Refreshed/absorbed `docs/capstone/mockup/01-marketing-page.md`: Docker launcher/direct commands; retained both existing and new absorption provenance.
- Refreshed/absorbed `docs/capstone/mockup/04-prompts.md`: Narration Preparation library kind.
- Refreshed/absorbed `docs/capstone/mockup/05-prompt-editor.md`: explicit documentary starter and human-readable slots.
- Refreshed/absorbed `docs/capstone/mockup/06-play.md`: Off-by-default Audio selector, supported-model and shared-LLM correction.
- Refreshed/absorbed `docs/capstone/mockup/08-project.md`: preparation editing and separate segment-scoped current/history downloads.
- Refreshed/absorbed `docs/capstone/uiux/03-experience.md`: optional preparation and clean/script output journey.
- Refreshed/absorbed `docs/capstone/uiux/screens/02-play.md`: optional Audio field, readiness and cost-review states.
- Refreshed/absorbed `docs/capstone/uiux/screens/03-project.md`: revision preparation field and current/history text links.
- Refreshed/absorbed `docs/capstone/uiux/screens/04-prompts.md`: fourth prompt-kind treatment.
- Refreshed/absorbed `docs/capstone/uiux/screens/05-prompt-editor.md`: documentary starter replacement confirmation.
- Refreshed/absorbed `docs/capstone/uiux/screens/10-marketing.md`: Docker install/copy treatment at desktop and narrow widths.
- Refreshed/absorbed `docs/capstone/00-index.md`: updated existing companion/topic descriptions.
- Refreshed/absorbed `docs/capstone/logic/README.md`: narration, prompt and subtitle scenario descriptions.
- Refreshed/absorbed `docs/capstone/mockup/README.md`: changed screen descriptions.
- Refreshed/absorbed `docs/capstone/uiux/README.md`: changed experience/screen descriptions.
- Diff: `.github/workflows/ci.yml`.
- Diff: `Dockerfile`.
- Diff: `README.md`.
- Diff: `docs/capstone/00-index.md`.
- Diff: `docs/capstone/01-architecture.md`.
- Diff: `docs/capstone/02-models.md`.
- Diff: `docs/capstone/04-data-flow.md`.
- Diff: `docs/capstone/06-testing.md`.
- Diff: `docs/capstone/07-operations.md`.
- Diff: `docs/capstone/changelog.d/2026-09-24-groom-narration-preparation.md`.
- Diff: `docs/capstone/changelog.d/2026-09-24-map-narration-preparation-baseline.md`.
- Diff: `docs/capstone/changelog.d/2026-09-24-map-narration-preparation.md`.
- Diff: `docs/capstone/changelog.d/2026-09-24-plan-narration-preparation.md`.
- Diff: `docs/capstone/changelog.d/2026-09-24-release-1.3.0-verification.md`.
- Diff: `docs/capstone/logic/08-narration.md`.
- Diff: `docs/capstone/logic/15-prompt-management.md`.
- Diff: `docs/capstone/logic/17-subtitles.md`.
- Diff: `docs/capstone/logic/README.md`.
- Diff: `docs/capstone/mockup/01-marketing-page.md`.
- Diff: `docs/capstone/mockup/04-prompts.md`.
- Diff: `docs/capstone/mockup/05-prompt-editor.md`.
- Diff: `docs/capstone/mockup/06-play.md`.
- Diff: `docs/capstone/mockup/08-project.md`.
- Diff: `docs/capstone/mockup/README.md`.
- Diff: `docs/capstone/uiux/03-experience.md`.
- Diff: `docs/capstone/uiux/README.md`.
- Diff: `docs/capstone/uiux/screens/02-play.md`.
- Diff: `docs/capstone/uiux/screens/03-project.md`.
- Diff: `docs/capstone/uiux/screens/04-prompts.md`.
- Diff: `docs/capstone/uiux/screens/05-prompt-editor.md`.
- Diff: `docs/capstone/uiux/screens/10-marketing.md`.
- Diff: `package-lock.json`.
- Diff: `packages/app/README.md`.
- Diff: `packages/app/package.json`.
- Diff: `packages/app/scripts/container-smoke.sh`.
- Diff: `packages/app/scripts/install-smoke.mjs`.
- Diff: `packages/app/src/adapter-registry.test.ts`.
- Diff: `packages/app/src/adapter-registry.ts`.
- Diff: `packages/app/src/adapters/image/codex.test.ts`.
- Diff: `packages/app/src/adapters/image/codex.ts`.
- Diff: `packages/app/src/catalog/validate.ts`.
- Diff: `packages/app/src/edge/http/diagnostics.test.ts`.
- Diff: `packages/app/src/kernel/db/migrate.test.ts`.
- Diff: `packages/app/src/kernel/db/migrations/0011-narration-prompts.sql`.
- Diff: `packages/app/src/main.test.ts`.
- Diff: `packages/app/src/slices/admission/model.ts`.
- Diff: `packages/app/src/slices/admission/rules.test.ts`.
- Diff: `packages/app/src/slices/admission/rules.ts`.
- Diff: `packages/app/src/slices/admission/schema.ts`.
- Diff: `packages/app/src/slices/estimate/index.test.ts`.
- Diff: `packages/app/src/slices/estimate/index.ts`.
- Diff: `packages/app/src/slices/estimate/requests.ts`.
- Diff: `packages/app/src/slices/library/model.ts`.
- Diff: `packages/app/src/slices/library/slots.test.ts`.
- Diff: `packages/app/src/slices/library/slots.ts`.
- Diff: `packages/app/src/slices/narration/preparation.test.ts`.
- Diff: `packages/app/src/slices/narration/preparation.ts`.
- Diff: `packages/app/src/slices/narration/steering.test.ts`.
- Diff: `packages/app/src/slices/narration/steering.ts`.
- Diff: `packages/app/src/slices/play-drafts/convert.ts`.
- Diff: `packages/app/src/slices/play-drafts/readiness.ts`.
- Diff: `packages/app/src/slices/play-drafts/schema.test.ts`.
- Diff: `packages/app/src/slices/play-drafts/schema.ts`.
- Diff: `packages/app/src/slices/project-templates/from-project.ts`.
- Diff: `packages/app/src/slices/project-templates/service.test.ts`.
- Diff: `packages/app/src/slices/project-templates/setup.ts`.
- Diff: `packages/app/src/slices/rebuild/admission-repo.ts`.
- Diff: `packages/app/src/slices/rebuild/preview-details.test.ts`.
- Diff: `packages/app/src/slices/rebuild/preview-details.ts`.
- Diff: `packages/app/src/slices/rebuild/preview-plan.ts`.
- Diff: `packages/app/src/slices/rebuild/recipe-audio-parts.ts`.
- Diff: `packages/app/src/slices/rebuild/recipe-audio.ts`.
- Diff: `packages/app/src/slices/rebuild/recipe-input-schema.ts`.
- Diff: `packages/app/src/slices/rebuild/recipe-legacy.ts`.
- Diff: `packages/app/src/slices/rebuild/recipe-model.ts`.
- Diff: `packages/app/src/slices/rebuild/recipe-narration-text.ts`.
- Diff: `packages/app/src/slices/rebuild/recipe-preparation.test.ts`.
- Diff: `packages/app/src/slices/rebuild/recipe-preparation.ts`.
- Diff: `packages/app/src/slices/rebuild/recipe-provider-choice.ts`.
- Diff: `packages/app/src/slices/rebuild/recipe-validation.ts`.
- Diff: `packages/app/src/slices/rebuild/recipe-work.ts`.
- Diff: `packages/app/src/slices/rebuild/runtime-admission.ts`.
- Diff: `packages/app/src/slices/rebuild/runtime-export-inputs.ts`.
- Diff: `packages/app/src/slices/rebuild/runtime-local.ts`.
- Diff: `packages/app/src/slices/rebuild/runtime-materialize.ts`.
- Diff: `packages/app/src/slices/rebuild/runtime-narration-reuse.ts`.
- Diff: `packages/app/src/slices/rebuild/runtime-narration-text.test.ts`.
- Diff: `packages/app/src/slices/rebuild/runtime-narration-text.ts`.
- Diff: `packages/app/src/slices/rebuild/runtime-narration.fake.ts`.
- Diff: `packages/app/src/slices/rebuild/runtime-preparation.test.ts`.
- Diff: `packages/app/src/slices/rebuild/runtime-provider.ts`.
- Diff: `packages/app/src/slices/rebuild/runtime-publication.ts`.
- Diff: `packages/app/src/slices/rebuild/runtime-store.ts`.
- Diff: `packages/app/src/slices/rebuild/service.fake.ts`.
- Diff: `packages/app/src/slices/revisions/mutation.fake.ts`.
- Diff: `packages/app/src/slices/revisions/revision.fake.ts`.
- Diff: `packages/app/src/slices/revisions/rules.ts`.
- Diff: `packages/app/src/slices/settings/cli-paths.test.ts`.
- Diff: `packages/app/src/slices/settings/cli-paths.ts`.
- Diff: `packages/app/src/slices/settings/cli-status.ts`.
- Diff: `packages/app/src/slices/settings/model.ts`.
- Diff: `packages/app/src/slices/settings/readiness.test.ts`.
- Diff: `packages/app/src/slices/settings/readiness.ts`.
- Diff: `packages/app/src/slices/storage/asset-name.ts`.
- Diff: `packages/app/src/slices/storage/layout.ts`.
- Diff: `packages/app/src/slices/storage/model.ts`.
- Diff: `packages/app/src/slices/storage/portable.test.ts`.
- Diff: `packages/app/src/slices/storage/schema.ts`.
- Diff: `packages/app/test/preparation-saved-workflows.test.ts`.
- Diff: `packages/app/test/revision-preparation-control.test.ts`.
- Diff: `packages/app/test/revision-preparation-restart.test.ts`.
- Diff: `packages/app/test/revision-preparation-validation.test.ts`.
- Diff: `packages/app/test/revision-preparation.fake.ts`.
- Diff: `packages/app/test/revision-preparation.test.ts`.
- Diff: `packages/app/test/revision-rebuild.fake.ts`.
- Diff: `packages/site/install.test.js`.
- Diff: `packages/site/public/index.html`.
- Diff: `packages/site/public/styles.css`.
- Diff: `packages/web/src/components/provider-cli.test.tsx`.
- Diff: `packages/web/src/components/provider-cli.tsx`.
- Diff: `packages/web/src/lib/narration-starter.ts`.
- Diff: `packages/web/src/lib/prompt-kinds.ts`.
- Diff: `packages/web/src/play/admission.test.ts`.
- Diff: `packages/web/src/play/admission.ts`.
- Diff: `packages/web/src/play/content-section.tsx`.
- Diff: `packages/web/src/play/draft-state.test.ts`.
- Diff: `packages/web/src/play/draft-state.ts`.
- Diff: `packages/web/src/play/field-targets.ts`.
- Diff: `packages/web/src/play/media-rails.tsx`.
- Diff: `packages/web/src/play/narration-controls.test.tsx`.
- Diff: `packages/web/src/play/narration-preparation.test.tsx`.
- Diff: `packages/web/src/play/narration-preparation.tsx`.
- Diff: `packages/web/src/play/outputs-section.tsx`.
- Diff: `packages/web/src/play/pickers.test.tsx`.
- Diff: `packages/web/src/play/review-summary.tsx`.
- Diff: `packages/web/src/play/setup-summary.tsx`.
- Diff: `packages/web/src/play/state.ts`.
- Diff: `packages/web/src/project/body-audio.tsx`.
- Diff: `packages/web/src/project/narration-downloads.test.tsx`.
- Diff: `packages/web/src/project/narration-downloads.tsx`.
- Diff: `packages/web/src/project/output-label.ts`.
- Diff: `packages/web/src/project/readiness.test.ts`.
- Diff: `packages/web/src/project/readiness.ts`.
- Diff: `packages/web/src/project/revision-form.tsx`.
- Diff: `packages/web/src/project/revision-narration.test.tsx`.
- Diff: `packages/web/src/project/revision-narration.tsx`.
- Diff: `packages/web/src/project/revision-prompts.tsx`.
- Diff: `packages/web/src/project/revision-providers.tsx`.
- Diff: `packages/web/src/routes/prompt-editor.test.tsx`.
- Diff: `packages/web/src/routes/prompt-editor.tsx`.
- Diff: `packages/web/src/routes/prompts.tsx`.
- Diff: `packages/web/src/tutorial/model.ts`.

## 2026-09-24 - implement: host CLI bridge
key: implement/2026-09-24-host-cli-bridge@Q4

- What: Linux Docker users can use their existing host Claude Code, Codex and Gemini processes and logins for text/research and Codex images.
- Approach: exact-version host helper, dedicated systemd user service, authenticated bounded Unix-socket domain API; app retains attempts, queue and asset publication.
- Rejected: manual helper startup adds a reboot step.
- Rejected: executable mounts execute in the wrong environment.
- Rejected: credential mounts do not implement host execution.
- Rejected: arbitrary command RPC, privileged containers and Docker-socket access grant unnecessary host authority.
- Out of scope: Windows/macOS service installation, remote hosts, SSH and new login automation.
- Out of scope: new model/image engines, general host commands and copied provider credentials.
- Out of scope: paid canary generation, live container replacement and retries of the user's failed content.
- Release: user separately authorized version bump, push and publication after verification; 1.4.0 is the new-feature release.
- Task 1: terminal missing-login/unavailable failures without changing API retry rules.
- Task 2: host status, typed schemas and reused adapter composition.
- Task 3: private token/socket server, bounded routes and cancellation.
- Task 4: validated port clients without automatic replay or container fallback.
- Task 5: common host readiness injected into all provider/admission/rebuild/diagnostic callers.
- Task 6: one-command permission, stable helper install, service lifecycle and volume-preserving Docker reconciliation.
- Task 7: read-only host commands and distinct readiness labels; install guidance explains host helper versus API-only Docker.
- Task 8: real fake-CLI/socket acceptance, packed host/container image publication/restart, native/FFmpeg smoke and CI.
- Verification: final full suite 435 files, 3,357 passed and one skipped; lint, strict typecheck, build and zero-vulnerability audit passed. Native package and Docker smokes run against the 1.4.0 candidate. Temporary systemd unit verification passed; no persistent service installed.
- Verification: read-only real Claude 2.1.281 and Codex 0.155.1 signed-in; Gemini 0.61.0 auth unknown. All three installed model catalogues read successfully. Paid real-provider generation is not claimed tested.
- Review loop: four rounds; four confirmed findings fixed (two Important, two Minor), one refuted; final two rounds dry. Fixes cover rollback after setup cancellation, exposed private roots, exact NDJSON bounds and fixture permissions.
- Divergence: live socket detection refuses any listener conservatively, not only an authenticated helper; only an owned stale socket is removed.
- Divergence: cancellation/loss acceptance runs with real local sockets and child processes; the Docker harness separately proves package, mount, UID, image storage and restart behavior.
- Reference scope: absorbed this feature with explicit source checkpoint 9bd6517, preserving unrelated historical broad stamps instead of claiming a repository-wide refresh.
- Chapter/scenario: `01-architecture.md` — host composition, socket protocol and app/host ownership.
- Chapter/scenario: `02-models.md` — host status, strict protocol limits and terminal unavailable.
- Chapter/scenario: `04-data-flow.md` — host execution, cancellation and container image publication.
- Chapter/scenario: `06-testing.md` — real-socket/fake-process and packaged Docker evidence, with live-call limits.
- Chapter/scenario: `07-operations.md` — consent, install/upgrade/rollback, private paths and disable/update commands.
- Chapter/scenario: `logic/02-provider-credentials.md` — host readiness and read-only paths.
- Chapter/scenario: `logic/09-image-generation.md` — host image-byte transfer and terminal uncertain failures.
- Chapter/scenario: `logic/13-cancel.md` — per-request host cancellation, cleanup and deadline ownership.
- Chapter/scenario: `logic/19-catalogue-thinking.md` — host CLI discovery distinct from YAML API catalogues.
- Chapter/scenario: `logic/20-boot-cli-recovery.md` — one-command helper setup, lifecycle and no container fallback.
- Chapter/scenario: `mockup/03-settings.md` — read-only host commands versus editable native paths.
- Chapter/scenario: `uiux/screens/08-settings.md` — host/login/helper error states without an installer UI.
- Chapter/scenario: `logic/README.md` — updated scenario descriptions.
- Chapter/scenario: `mockup/README.md` — updated Settings scope.
- Chapter/scenario: `uiux/README.md` — updated Settings scope.
- Chapter/scenario: `00-index.md` — host helper/module entries and Settings companion rows.
- Diff: `.github/workflows/ci.yml`.
- Diff: `Dockerfile`.
- Diff: `README.md`.
- Diff: `packages/app/README.md`.
- Diff: `packages/app/scripts/container-smoke.sh`.
- Diff: `packages/app/scripts/docker-run.sh`.
- Diff: `packages/app/scripts/host-cli-smoke.mjs`.
- Diff: `packages/app/src/adapter-registry-host.test.ts`.
- Diff: `packages/app/src/adapter-registry.ts`.
- Diff: `packages/app/src/adapters/host-cli/index.test.ts`.
- Diff: `packages/app/src/adapters/host-cli/index.ts`.
- Diff: `packages/app/src/adapters/host-cli/transport.test.ts`.
- Diff: `packages/app/src/adapters/host-cli/transport.ts`.
- Diff: `packages/app/src/adapters/image/codex.test.ts`.
- Diff: `packages/app/src/adapters/image/codex.ts`.
- Diff: `packages/app/src/adapters/llm/claude-code-models.test.ts`.
- Diff: `packages/app/src/adapters/llm/claude-code-models.ts`.
- Diff: `packages/app/src/adapters/llm/claude-code.test.ts`.
- Diff: `packages/app/src/adapters/llm/claude-code.ts`.
- Diff: `packages/app/src/adapters/llm/cli-login-error.test.ts`.
- Diff: `packages/app/src/adapters/llm/cli-login-error.ts`.
- Diff: `packages/app/src/adapters/llm/codex.test.ts`.
- Diff: `packages/app/src/adapters/llm/codex.ts`.
- Diff: `packages/app/src/edge/cli.ts`.
- Diff: `packages/app/src/edge/docker.test.ts`.
- Diff: `packages/app/src/edge/docker.ts`.
- Diff: `packages/app/src/edge/host-cli.ts`.
- Diff: `packages/app/src/edge/http/actions.ts`.
- Diff: `packages/app/src/edge/http/app.ts`.
- Diff: `packages/app/src/edge/http/diagnostics.ts`.
- Diff: `packages/app/src/edge/http/host-cli.test.ts`.
- Diff: `packages/app/src/edge/http/host-cli.ts`.
- Diff: `packages/app/src/edge/http/providers.test.ts`.
- Diff: `packages/app/src/edge/http/providers.ts`.
- Diff: `packages/app/src/host-cli/environment.ts`.
- Diff: `packages/app/src/host-cli/install.test.ts`.
- Diff: `packages/app/src/host-cli/install.ts`.
- Diff: `packages/app/src/host-cli/paths.test.ts`.
- Diff: `packages/app/src/host-cli/paths.ts`.
- Diff: `packages/app/src/host-cli/runtime.test.ts`.
- Diff: `packages/app/src/host-cli/runtime.ts`.
- Diff: `packages/app/src/host-cli/server.test.ts`.
- Diff: `packages/app/src/host-cli/server.ts`.
- Diff: `packages/app/src/host-cli/service.test.ts`.
- Diff: `packages/app/src/host-cli/service.ts`.
- Diff: `packages/app/src/host-cli/status.test.ts`.
- Diff: `packages/app/src/host-cli/status.ts`.
- Diff: `packages/app/src/kernel/ports/host-cli.test.ts`.
- Diff: `packages/app/src/kernel/ports/host-cli.ts`.
- Diff: `packages/app/src/kernel/ports/model.ts`.
- Diff: `packages/app/src/kernel/runner/attempt.test.ts`.
- Diff: `packages/app/src/kernel/runner/attempt.ts`.
- Diff: `packages/app/src/main.ts`.
- Diff: `packages/app/src/slices/settings/cli-paths.ts`.
- Diff: `packages/app/src/slices/settings/cli-status.test.ts`.
- Diff: `packages/app/src/slices/settings/cli-status.ts`.
- Diff: `packages/app/src/slices/settings/model.ts`.
- Diff: `packages/app/src/slices/settings/readiness.test.ts`.
- Diff: `packages/app/src/slices/settings/readiness.ts`.
- Diff: `packages/app/test/docker-launcher.test.ts`.
- Diff: `packages/app/test/fixtures/host-cli.cjs`.
- Diff: `packages/app/test/host-cli-e2e.test.ts`.
- Diff: `packages/app/test/host-cli-readiness.test.ts`.
- Diff: `packages/site/install.test.js`.
- Diff: `packages/site/public/index.html`.
- Diff: `packages/web/src/components/provider-cli.test.tsx`.
- Diff: `packages/web/src/components/provider-cli.tsx`.
- Diff: `packages/web/src/lib/provider-status.test.ts`.
- Diff: `packages/web/src/lib/provider-status.ts`.
- Diff: `packages/web/src/play/pickers.test.tsx`.
- Diff: `packages/web/src/play/pickers.tsx`.
- Diff: `packages/web/src/project/readiness.test.ts`.
- Diff: `packages/web/src/project/readiness.ts`.
- Diff: `packages/web/src/routes/play.test.tsx`.
- Diff: `packages/web/src/routes/project.test.tsx`.
- Diff: `packages/app/package.json` and `package-lock.json` carry the separately authorized 1.4.0 bump.
- Local history: feature spec/plan/review remain ignored; three pre-existing Codex-image fragments remain untouched. Ledger fragments are retained on the feature branch.

## 2026-09-24 - groom: narration-preparation
key: groom/2026-09-24-narration-preparation@Q3

- `features/2026-09-24-narration-preparation/spec.md`: specified optional Audio preparation and separate Markdown, clean narration and Inworld TTS-2 script representations.
- Cue annotations preserve the source; free-form rewriting, independently generated representations and automatic activation were rejected.
- Preparation uses the shared LLM and existing revision/attempt boundaries; reviews account for additional calls.
- Other providers retain plain-text narration; pronunciation rewriting, translation, SSML and paid live smoke requests are outside scope.
- Existing prompts, completed projects and unrelated working files remain intact; publication does not authorize a live-container redeployment.

## 2026-09-24 - groom: real host CLI execution for Docker
key: groom/2026-09-24-host-cli-bridge@Q3

- Approved shape: one host-side helper managed by Slopify's existing Docker launcher, with a one-time startup/host-access confirmation; native installs remain unchanged.
- Host Claude Code, Codex and Gemini retain their existing logins. Text, research, metadata and Codex image operations run on the host; only typed results and validated image bytes cross the private connection.
- Rejected mounted-binary execution/credential copying because neither implements the requested host execution; rejected mandatory manual helper startup because it adds a recurring reboot step.
- Scoped the helper to authenticated Unix-socket operations, owned private workspaces, bounded streams, cancellation and terminal missing-login/uncertain transport errors. No arbitrary host commands or paths may be supplied by Docker.
- The dedicated helper does not re-enable the old native server. Automatic boot setup explains user lingering; data volume, prompts, settings and completed outputs remain retained.
- Fourteen requirements, twenty-one behavior rules and eight global constraints are formalized for planning. No runtime implementation, service installation, paid request, container replacement or release occurred in grooming.

## 2026-09-24 - groom: 2026-09-24-codex-image-provider
key: groom/2026-09-24-codex-image-provider@Q2

- docs/capstone/features/2026-09-24-codex-image-provider/spec.md defines a standalone Codex CLI image provider for slideshow and thumbnail work using the existing ImagePort and publication path.
- Chosen: explicit image-provider selection, independent of the text provider; the existing Codex login and executable path are reused.
- Rejected: coupling images to the text provider or switching to Codex as an automatic fallback; both would override an independent image choice.
- Rejected: direct writes into project folders or an API-billed image fallback; project ownership stays with Slopify and the local CLI path remains distinct.
- Open validation: a noninteractive local Codex CLI run must produce an image at a deterministic private path before implementation proceeds.

## 2026-09-24 - groom: 2026-09-24-codex-image-provider
key: groom/2026-09-24-codex-image-provider@Q4

- docs/capstone/features/2026-09-24-codex-image-provider/spec.md extends the standalone Codex CLI image provider with runtime model discovery for Claude Code, Codex and Gemini CLI.
- Chosen: the installed local CLIs supply their own model choices and admission data; `models.yaml` governs API-backed providers only, and legacy local-CLI rows in private copies are ignored.
- Chosen: Codex image generation exposes one adapter-owned built-in capability, without claiming selection of an underlying image model or adding an API-key fallback.
- Rejected: hard-coded CLI model lists, token-spending discovery prompts, the noncompliant Anthropic Agent SDK dependency and stale YAML fallback after discovery failure.
- Failure behavior: retain saved model IDs, warn when discovery fails or a saved ID is unavailable, and permit manual exact-ID entry for local LLMs.

## 2026-09-24 - fix: host CLI admission and rebuild feedback
key: fix/host-rebuild-readiness

- Reproduced the reported 1.4.0 failure using read-only validation of the user's saved review: provider/model checks passed, but final admission incorrectly compared host paths with container-local commands. No rebuild was admitted.
- Shared the native-only path-change check between rebuild and Play admission. Host-managed Claude, Codex, Gemini and Codex Images are covered by regression tests; native path-change refusals remain covered.
- Rebuild failures now show detailed, focused feedback beside Start rather than only a generic message above the review. Pending requests have a visible label; retryable failures preserve consent and the request identity. Stale/conflicting reviews close with focused recovery feedback.
- The initial regression run failed in all eight host admission cases and both feedback cases. Focused tests passed after the correction. No provider generation was used.
- Scope: no changes to credentials, pricing, consent requirements, retry limits, project content or host helper protocol. Patch version: 1.4.1.
- Verification: 436 test files, 3368 passing tests and one platform-conditional skip; lint, strict type checks and build passed; audit reported zero vulnerabilities. A disposable 390×844 browser check confirmed consent retention, the pending label, detailed errors beside Start and automatic focus. The test page and server were removed afterward.

## 2026-09-13 - scheduled local jobs
key: feature/scheduled-jobs
- Added durable one-off, daily and weekly schedules with IANA timezone occurrence calculation, explicit missed-run policy, skip-on-overlap claims and optional spend ceilings.
- Schedules are tied to immutable project-template revisions and can carry up to 49 keyword variants. Provided media is rejected for unattended execution; each dispatch reuses Play review, cost estimates, checkpoints and the provider-aware queue.
- Added restart recovery, transactional claims, idempotent run history and secret-free problem reasons. The Schedules screen keeps save separate from dispatch and exposes pause, resume, cancel, delete and expandable history controls.
- Verified with schedule service, calendar, scheduler, HTTP and UI tests plus app and web typechecks and focused Biome checks. Full-suite and release validation remain pending.

## 2026-09-13 - review: 1.0 release candidate
key: review/all@7bdb84e3f57e

- Replaced both review sections at source stamp `7bdb84e3f57e`.
- Backend: 0 critical, 0 important and 0 minor findings after resolving schedule lifecycle, portable import, updater, CLI and shutdown findings.
- Frontend: 0 critical, 0 important and 0 minor findings across 14 recorded surfaces after resolving the schedule editor findings.
- Live browser: yes; Play was exercised at desktop and mobile widths, with the remaining surfaces reviewed from their current screen references and source.

## 2026-09-13 - project-templates
key: implement/2026-09-10-project-templates@Q1
- **What**: named, versioned project templates for reusable Play setups.
- **Approach**: immutable template revisions snapshot selected prompt and entry bodies, keep keyword defaults and checkpoint choices, and create fresh drafts on Apply; project headers convert a selected current revision without rebuilding. Provided media is remapped for reattachment and template mutations use idempotent identities. Alternatives rejected: copying credentials, executable paths, generated outputs or media bytes would leak machine-owned state; copying approvals would bypass Review; mutating a template head would change existing drafts.
- **Out of scope**: scheduled execution, template sharing, credential storage and media-byte backup remain later 1.0 work.
- **Tasks**: migration and immutable repository; strict document/snapshot schemas; CRUD and project conversion services; non-dispatching HTTP routes; Templates screen; project-header Save as template; Play snapshot precedence; retry and navigation race recovery.
- **Diff**: `packages/app/src/edge/http/app.ts`, `packages/app/src/edge/http/project-template-source.test.ts`, `packages/app/src/edge/http/project-templates.test.ts`, `packages/app/src/edge/http/project-templates.ts`, `packages/app/src/kernel/db/migrate.test.ts`, `packages/app/src/kernel/db/migrations/0008-project-templates.sql`, `packages/app/src/main.test.ts`, `packages/app/src/slices/library/snapshot.ts`, `packages/app/src/slices/library/slots.ts`, `packages/app/src/slices/play-drafts/review-inputs.ts`, `packages/app/src/slices/play-drafts/schema.ts`, `packages/app/src/slices/project-templates/`, `packages/web/src/components/shell.tsx`, `packages/web/src/play/template-library.test.ts`, `packages/web/src/play/template-library.ts`, `packages/web/src/play/draft-context.tsx`, `packages/web/src/play/draft-recovery.test.tsx`, `packages/web/src/play/draft-session.test.tsx`, `packages/web/src/play/use-draft-session.ts`, `packages/web/src/project/header.tsx`, `packages/web/src/project/save-template.test.tsx`, `packages/web/src/project/save-template.tsx`, `packages/web/src/routes/play.tsx`, `packages/web/src/routes/project.tsx`, `packages/web/src/routes/templates.test.tsx`, `packages/web/src/routes/templates.tsx`, `packages/web/src/router.tsx`, `packages/web/src/templates/api.ts`.
- **Chapters refreshed**: `docs/capstone/01-architecture.md`; `docs/capstone/logic/README.md`; `docs/capstone/uiux/README.md`; `docs/capstone/uiux/03-experience.md`.
- **Scenarios absorbed**: `docs/capstone/logic/24-project-templates.md` records snapshot, Apply, lifecycle and recovery behavior.
- **Review loop**: two review lenses ran; two P2 Apply race findings were confirmed and fixed with explicit open results, stable retry identities and generation/unmount fences; backend snapshot review found no further confirmed issues; focused (47 tests), full suite (3004 passed, 1 skipped), lint, typecheck and build are green.

## 2026-09-13 - portable-diagnostics
---
date: 2026-09-13
kind: feature
---

### Portable backups, storage accounting and diagnostics

Settings now exposes a credential-free Slopify backup export/import, explicit orphan-file
cleanup, aggregate and per-project disk usage, and a downloadable secret-free diagnostics
bundle. Backups include templates, prompts, voices, settings and staged assets; provider keys,
telemetry and existing projects are left out. The boot migration expectation and focused tests
cover schema version 9 and restore behavior.

## 2026-09-13 - plan: review checkpoints
key: plan/2026-09-10-review-checkpoints@Q3

- File map: durable checkpoint migration and slice; closure/fingerprint rules; runner authority; Play draft/Review/Start integration; typed HTTP routes; Play and project UI; restart/pause integration; Linux/browser/Windows acceptance.
- Tasks: 9, in dependency order: persist identities; resolve closures; gate runner claims; bind drafts and Start; expose HTTP; configure Play; approve from project page; recover across restart; run final acceptance and absorb references.
- Pinned constraints: Article remains required; independent work continues; Save never approves or generates; approvals bind exact revision/fingerprint; existing Pause/Resume, queue, attempts, idempotency and provider boundaries remain; strict typing, typed outcomes, redacted secrets, disposable/fake acceptance and no new dependency.

## 2026-09-13 - plan: 2026-09-10-play-redesign-drafts
key: plan/2026-09-10-play-redesign-drafts@Q5

- `features/2026-09-10-play-redesign-drafts/plan.md`: approved 15-task implementation plan; user authorized execution with “Yep go”.
- Pinned: exact approved specification hash 852754d5ef5945ed7d81a8e099ad5a03861f6b5a.
- Execution: previously selected subagents; source-only task commits on codex/slopify-1.0.
- Pinned: raw incomplete editor values, SQLite CAS drafts, relational upload ownership and retained completed media.
- Pinned: review UUID is Start identity; pending intents exclude edits and duplicate admissions; original single/batch scheduling semantics preserved.
- Pinned: four freely navigable sections, one responsive renderer-based preview, explicit full-page cost review and persistent tutorial cursor.
- Constraints: strict typing/no any or enums, immutable slice input, typed refusals, injected dependencies, secret-free errors, existing libraries, append-only migrations and test-first source commits.
- Scope: no website change, version bump, push, publication or automatic docs commit; remaining 1.0 features retain their separate chains.
- Task 1: Durable editor documents, CAS CRUD and attachment topology.
- Task 2: Owned uploads and restart-safe staging.
- Task 3: Resolve and persist review from exact acknowledged inputs.
- Task 4: Durable Start intent and atomic one/batch receipt.
- Task 5: Typed HTTP draft/upload/review/start and owned preview file routes.
- Task 6: Persist a recoverable tutorial cursor.
- Task 7: Typed client and serializable form boundary.
- Task 8: One session owner, autosave, restore/conflicts and Drafts controls.
- Task 9: Four sections, content/output groups, one summary and exact error navigation.
- Task 10: Durable media/upload ownership and pending font lifetime.
- Task 11: Persistent responsive style preview without changing project editor behavior.
- Task 12: Full-page bound review, batch persistence and uncertain Start recovery.
- Task 13: Tutorial reload state and reveal-before-measurement.
- Task 14: Prove real app restart, asset retention and one-time admission.
- Task 15: Verify the approved layout, review the full diff and absorb references.
- File map: packages/app/src/kernel/db/migrations/0006-play-drafts.sql — Append durable draft, attachment and Start receipt tables — 1.
- File map: packages/app/src/slices/play-drafts/schema.ts, model.ts — Shared strict document, view, request and response contracts — 1.
- File map: packages/app/src/slices/play-drafts/repo.ts, service.ts — SQLite reads/CAS and create/save/fork/discard lifecycle — 1.
- File map: packages/app/src/slices/play-drafts/draft.fake.ts, schema.test.ts, service.test.ts — Disposable migrated database fixture and document/CAS proofs — 1.
- File map: packages/app/src/slices/play-drafts/uploads.ts, uploads.test.ts — Draft-scoped stream ownership and late completion — 2.
- File map: packages/app/src/slices/storage/staging-refs.ts, staging-refs.test.ts — Shared-reference-aware release — 2.
- File map: packages/app/src/slices/storage/staging.ts, repo.ts, reconcile.ts, reconcile.test.ts — Allocation binding, guarded deletion and restart retention — 2.
- File map: packages/app/src/slices/admission/start.ts; packages/app/src/slices/revisions/mutations.ts; packages/app/src/slices/batch/index.ts — Protect existing consumers and defer source cleanup through outer commit — 2,4.
- File map: packages/app/src/slices/play-drafts/review.ts, review.test.ts, convert.ts, convert.test.ts — Resolve acknowledged inputs and persist exact cost review — 3.
- File map: packages/app/src/slices/play-drafts/start.ts, start-repo.ts, readiness.ts, start.test.ts, readiness.test.ts — Pending intent, receipt lookup, atomic admission and replay — 4.
- File map: packages/app/src/edge/http/drafts.ts, draft-files.ts, drafts.test.ts; packages/app/src/edge/http/staging.ts — Validated local draft API and owned preview streams — 5.
- File map: packages/app/src/edge/http/app.ts; packages/app/src/main.ts — Register typed routes and inject existing runtime dependencies — 5,6.
- File map: packages/app/src/slices/settings/tutorial.ts, tutorial.test.ts — Stable tutorial cursor/settings persistence — 6.
- File map: packages/app/src/edge/http/tutorial.ts, tutorial.test.ts — Typed tutorial GET/PUT with version checks — 6.
- File map: packages/web/src/play/draft-api.ts, draft-api.test.ts — Parse server contracts and typed refusals — 7.
- File map: packages/web/src/play/draft-state.ts, draft-state.test.ts; state.ts — Raw editor DTO conversion and source normalization — 7.
- File map: packages/web/src/play/draft-context.tsx, use-draft-session.ts, draft-save.ts — One Shell-lived session, serialized saves and navigation — 8.
- File map: packages/web/src/play/draft-list.tsx, draft-list.test.tsx, draft-session.test.tsx — Restore/new/discard/conflict UI and race tests — 8.
- File map: packages/web/src/play/play-test-fixture.tsx — Schema-valid public HTTP/controller UI fixture — 8.
- File map: packages/web/src/components/shell.tsx; packages/web/src/lib/form-drafts.tsx — Mount new Play owner, retain prompt-editor drafts — 8.
- File map: packages/web/src/play/sections.ts, section-navigation.tsx, field-targets.ts — Finite section registry and explicit reveal/focus — 9.
- File map: packages/web/src/play/content-section.tsx, outputs-section.tsx, setup-summary.tsx — Approved Content/Outputs controls and readonly summary — 9.
- File map: packages/web/src/play/sections.test.tsx, field-targets.test.tsx — Source combinations, navigation and exact targets — 9.
- File map: packages/web/src/play/rail-frame.tsx, stage-rails.tsx, media-rails.tsx, keywords.tsx, pickers.tsx, provided.tsx, admission.ts, chunking.tsx — Reuse leaf controls, above-field labels, raw counts, origins and active validation — 9,10.
- File map: packages/web/src/play/cue-sheet.tsx — Remove retired cue-sheet composition after callers migrate — 9.
- File map: packages/web/src/routes/play.tsx, play.test.tsx — Four-section route composition and preserved run behaviors — 9,12.
- File map: packages/web/src/play/draft-uploads.ts, draft-uploads.test.tsx — Long-lived media/font ownership and locks — 10.
- File map: packages/web/src/subtitles/font-picker.tsx, controls.tsx, controls.test.tsx — Controlled Play upload branch and external preview option; preserve project defaults — 10,11.
- File map: packages/web/src/play/style-section.tsx, output-preview.tsx, style-section.test.tsx — Single responsive output preview and caption controls — 11.
- File map: packages/web/src/subtitles/style-preview.tsx — Shared arithmetic with controlled sample/ready image — 11.
- File map: packages/web/src/play/review-section.tsx, review-state.ts, review.test.tsx, start.test.tsx — Full-page cost review and duplicate-safe explicit Start — 12.
- File map: packages/web/src/play/run-review.tsx — Retain BatchEditor/cost rows, remove nested dialog — 12.
- File map: packages/web/src/tutorial/session-api.ts, session.test.tsx, play-navigation.test.tsx — Persist guide state and test reveal/reload — 13.
- File map: packages/web/src/tutorial/model.ts, context.tsx, runner.tsx, step-content.tsx, runner.test.tsx — Stable step IDs, section-aware guide and updated copy — 13.
- File map: packages/app/test/e2e/play-drafts.test.ts, play-drafts.http.ts; .github/workflows/ci.yml — Real app restart/receipt/media acceptance on Linux and Windows — 14.

## 2026-09-13 - map-windows-rebuild-timeouts
---
key: map/windows-rebuild-timeouts@4cfe3473f74d
date: 2026-09-13
---

Refreshed the reference after the Windows rebuild integration tests received scoped 30-second deadlines. Testing now records that exception; architecture, models, conventions, data flow, dependencies, operations, glossary, pipeline/narration/edit/checkpoint logic, and project mockup indexes were regenerated unchanged apart from current source stamps. All other indexed outputs were current and skipped.

## 2026-09-13 - map: Windows packed-install smoke
key: map/windows-install-smoke@dad071604385

- `07-operations.md` and `logic/20-boot-cli-recovery.md`: documented the platform-specific launch of npm's generated Windows command shim and refreshed exact source stamps.
- `00-index.md`: no inventory change was required.

## 2026-09-13 - map: release tag and Windows npm-exec smoke
key: map/release-tag-and-smoke@f4c4f7b3295a

- `01-architecture.md`, `03-conventions.md`, `05-dependencies.md`, `06-testing.md`, `07-operations.md`, and `logic/20-boot-cli-recovery.md`: refreshed exact source stamps after the release workflow and package-smoke changes.
- Recorded the plain `x.y.z` release tag contract and the separate direct-launch and cold npm-exec health deadlines.
- `00-index.md`: no inventory change was required.

## 2026-09-13 - map: all
key: map/all@7bdb84e3f57e

- `01-architecture.md` through `08-glossary.md`: refreshed source stamps and 1.0 runtime, storage, updater, CLI, schedule and release facts.
- `logic/` and `uiux/screens/`: refreshed implemented scenario and surface coverage, including retained schedule history and the schedule editor.
- `00-index.md`: added the Schedules and Templates surfaces and removed the superseded partial-refresh note.
- `review.md`: recorded the clean final audit after all release findings were resolved.
- `standards.md`: migrated the existing prescriptive rules into the current Capstone section schema without changing their authority.
- Interfaces remained absent because the repository has no sibling-repository protocol.

## 2026-09-13 - map: Play redesign final
key: map/play-redesign-final@89db8f6d8981

- Refreshed the five impacted topic references at source 89db8f6d8981: architecture, models, data flow, testing and operations.
- Absorbed durable draft behavior and the approved Play/tutorial layout into scenario, mockup and UI references and their indexes.
- Preserved editable-project facts and unrelated reference content. No downstream repository edge changed.
- Unrelated legacy map/check findings remain outside this feature refresh and belong to final release acceptance.

## 2026-09-13 - implement-review-checkpoints
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

## 2026-09-13 - implement: 2026-09-10-play-redesign-drafts
key: implement/2026-09-10-play-redesign-drafts@Q5

- What: A four-section Play workspace with durable local setup drafts, responsive media/subtitle preview and explicit reviewed admission.
- Approach: Reuse the existing SQLite, staging, provider/catalogue, cost and rendering boundaries; add versioned documents, attachment ownership and durable Start receipts without new dependencies.
- Alternative rejected: A long collapsible form retains the separation between editing controls and preview.
- Alternative rejected: An all-visible form retains crowding.
- Alternative rejected: Browser-only persistence cannot safely retain uploaded bytes through server restarts.
- Decision: Save incomplete raw editor values; server acknowledgement alone means Saved on this computer. Browser storage holds only the active draft ID.
- Decision: CAS conflicts retain local input and offer Reload or Save as new. Ready shared staging survives restarts and is released only after its last owner.
- Decision: Review resolves exact inputs and costs; only explicit Start/Queue admits work. Lost responses recover the same receipt, without a new chargeable identity.
- Limitation: Post-commit telemetry, staging release and dispatch failures are caught separately. Receipt replay does not repeat dispatch; broader execution recovery remains reliability work.
- Decision: Desktop shows editor plus sticky preview/summary. Below 1100 px Preview is an in-flow disclosure before the editor; the additional This run summary follows the section/action.
- Decision: Unfinished font uploads retain explicit Keep current font recovery even when audio or captions are inactive.
- Decision: The tutorial persists a stable server cursor and reveals hidden controls before spotlight measurement; it never starts a run.
- Out of scope: Review checkpoints.
- Out of scope: Reusable project templates.
- Out of scope: Scheduled/background jobs.
- Out of scope: Broader reliability/preflight, including the unresolved legacy WAV reuse test.
- Out of scope: Portability, backups and storage cleanup.
- Out of scope: Final 1.0 release acceptance.
- Out of scope: Website changes, version bump, push and publication.
- Task 1 completed: Durable editor documents, CAS CRUD and attachment topology.
- Task 2 completed: Owned uploads and restart-safe staging.
- Task 3 completed: Resolve and persist review from exact acknowledged inputs.
- Task 4 completed: Durable Start intent and atomic one/batch receipt.
- Task 5 completed: Typed HTTP draft/upload/review/start and owned preview file routes.
- Task 6 completed: Persist a recoverable tutorial cursor.
- Task 7 completed: Typed client and serializable form boundary.
- Task 8 completed: One session owner, autosave, restore/conflicts and Drafts controls.
- Task 9 completed: Four sections, content/output groups, one summary and exact error navigation.
- Task 10 completed: Durable media/upload ownership and pending font lifetime.
- Task 11 completed: Persistent responsive style preview without changing project editor behavior.
- Task 12 completed: Full-page bound review, batch persistence and uncertain Start recovery.
- Task 13 completed: Tutorial reload state and reveal-before-measurement.
- Task 14 completed: Prove real app restart, asset retention and one-time admission.
- Task 15 completed: Verify the approved layout, review the full diff and absorb references.
- Reference absorbed/refreshed: `01-architecture.md` — draft/tutorial HTTP contracts, dependency boundaries and Play composition.
- Reference absorbed/refreshed: `02-models.md` — draft documents, owned attachments, reviews, receipts and tutorial schemas.
- Reference absorbed/refreshed: `04-data-flow.md` — autosave, owned uploads, explicit review/admission and recovery lifecycles.
- Reference absorbed/refreshed: `06-testing.md` — draft/Play test inventory and real restart/Windows coverage.
- Reference absorbed/refreshed: `07-operations.md` — migration, retained staging, durable recovery and verification commands.
- Reference absorbed/refreshed: `logic/04-run-admission.md` — explicit bound Review and Start.
- Reference absorbed/refreshed: `logic/05-provided-outputs.md` — draft ownership and restart retention.
- Reference absorbed/refreshed: `logic/18-cost-review-batch.md` — reviewed keyword variants and same-identity batch admission.
- Reference absorbed/refreshed: `logic/22-play-drafts.md` — durable editing, conflicts, uploads, discard and uncertain Start.
- Reference absorbed/refreshed: `mockup/06-play.md` — four-section composition and responsive preview.
- Reference absorbed/refreshed: `uiux/01-direction.md` — approved Play control-room composition.
- Reference absorbed/refreshed: `uiux/03-experience.md` — autosave feedback, keyboard flow and durable tutorial.
- Reference absorbed/refreshed: `uiux/screens/02-play.md` — observed controls and responsive layout.
- Reference absorbed/refreshed: `uiux/screens/11-first-run-tutorial.md` — stable cursor and reveal-before-spotlight.
- Reference absorbed/refreshed: `logic/README.md` — draft scenario index.
- Reference absorbed/refreshed: `mockup/README.md` — draft companion link.
- Reference absorbed/refreshed: `uiux/README.md` — draft companion link.
- Reference absorbed/refreshed: `00-index.md` — draft module and companion references.
- Review loop: Nine full-diff rounds; twelve named confirmed finding groups fixed, plus the related upload-unmount lifetime case. Two pre-review accessibility corrections also landed. Rounds 8 and 9 had zero new confirmed findings at 89db8f6d89816b7e2457cb8abd6dade8acb42aa5.
- Review findings fixed: complete Review disclosure; exact error targets; missing selected image prompt; empty chunk count; upload prerequisite retry; raw numeric retention; draft timestamp; create/fork replay authority; actual Reload after lost creation acknowledgement; unavailable generic choices; confirmed discard recovery; inactive font recovery.
- Review refutation: One explicit narrow-summary layout hypothesis was refuted against the approved mockup and Task 11; the shipped arrangement is recorded above.
- Validation: Final Linux suite 362 files, 2,886 passed and one existing skip; affected font-recovery suite 260 passed; workspace types, lint and build passed.
- Validation: Native Windows draft/media/revision suites 695 passed and one existing skip on identical backend source; final exact-source web/app build passed.
- Validation: Real app restart/receipt tests plus actual browser save retry, lost acknowledgements, conflict fork, upload races, tutorial recovery, both themes at 1440 and 390 px, native 200% zoom and both aspect ratios.
- Scope limitation: Targeted reference absorption is complete; unrelated legacy map/schema drift is retained for release acceptance.
- Diff baseline: 29b88494eb404ea36f797929599db6a6e4ac8603..89db8f6d89816b7e2457cb8abd6dade8acb42aa5; 27 source commits, 140 paths.
- Diff: `.github/workflows/ci.yml`.
- Diff: `packages/app/src/edge/http/app.ts`.
- Diff: `packages/app/src/edge/http/draft-files.test.ts`.
- Diff: `packages/app/src/edge/http/draft-files.ts`.
- Diff: `packages/app/src/edge/http/draft-problem.ts`.
- Diff: `packages/app/src/edge/http/drafts.test.ts`.
- Diff: `packages/app/src/edge/http/drafts.ts`.
- Diff: `packages/app/src/edge/http/multipart.ts`.
- Diff: `packages/app/src/edge/http/staging.test.ts`.
- Diff: `packages/app/src/edge/http/staging.ts`.
- Diff: `packages/app/src/edge/http/tutorial.test.ts`.
- Diff: `packages/app/src/edge/http/tutorial.ts`.
- Diff: `packages/app/src/kernel/db/migrate.test.ts`.
- Diff: `packages/app/src/kernel/db/migrations/0006-play-drafts.sql`.
- Diff: `packages/app/src/main.test.ts`.
- Diff: `packages/app/src/main.ts`.
- Diff: `packages/app/src/slices/admission/start.ts`.
- Diff: `packages/app/src/slices/batch/index.test.ts`.
- Diff: `packages/app/src/slices/batch/index.ts`.
- Diff: `packages/app/src/slices/play-drafts/attachments.test.ts`.
- Diff: `packages/app/src/slices/play-drafts/convert.test.ts`.
- Diff: `packages/app/src/slices/play-drafts/convert.ts`.
- Diff: `packages/app/src/slices/play-drafts/creation-replay.test.ts`.
- Diff: `packages/app/src/slices/play-drafts/draft.fake.ts`.
- Diff: `packages/app/src/slices/play-drafts/model.ts`.
- Diff: `packages/app/src/slices/play-drafts/readiness.test.ts`.
- Diff: `packages/app/src/slices/play-drafts/readiness.ts`.
- Diff: `packages/app/src/slices/play-drafts/recovery.test.ts`.
- Diff: `packages/app/src/slices/play-drafts/repo.ts`.
- Diff: `packages/app/src/slices/play-drafts/review-inputs.ts`.
- Diff: `packages/app/src/slices/play-drafts/review-readiness.test.ts`.
- Diff: `packages/app/src/slices/play-drafts/review.test.ts`.
- Diff: `packages/app/src/slices/play-drafts/review.ts`.
- Diff: `packages/app/src/slices/play-drafts/schema.test.ts`.
- Diff: `packages/app/src/slices/play-drafts/schema.ts`.
- Diff: `packages/app/src/slices/play-drafts/service.test.ts`.
- Diff: `packages/app/src/slices/play-drafts/service.ts`.
- Diff: `packages/app/src/slices/play-drafts/start-repo.ts`.
- Diff: `packages/app/src/slices/play-drafts/start.test.ts`.
- Diff: `packages/app/src/slices/play-drafts/start.ts`.
- Diff: `packages/app/src/slices/play-drafts/uploads.test.ts`.
- Diff: `packages/app/src/slices/play-drafts/uploads.ts`.
- Diff: `packages/app/src/slices/revisions/mutations-media.test.ts`.
- Diff: `packages/app/src/slices/revisions/mutations.ts`.
- Diff: `packages/app/src/slices/settings/tutorial-schema.ts`.
- Diff: `packages/app/src/slices/settings/tutorial.test.ts`.
- Diff: `packages/app/src/slices/settings/tutorial.ts`.
- Diff: `packages/app/src/slices/storage/reconcile.test.ts`.
- Diff: `packages/app/src/slices/storage/reconcile.ts`.
- Diff: `packages/app/src/slices/storage/repo.ts`.
- Diff: `packages/app/src/slices/storage/staging-refs.test.ts`.
- Diff: `packages/app/src/slices/storage/staging-refs.ts`.
- Diff: `packages/app/src/slices/storage/staging.ts`.
- Diff: `packages/app/test/e2e/play-drafts.http.ts`.
- Diff: `packages/app/test/e2e/play-drafts.test.ts`.
- Diff: `packages/web/src/components/shell.tsx`.
- Diff: `packages/web/src/lib/form-drafts.tsx`.
- Diff: `packages/web/src/play/admission.test.ts`.
- Diff: `packages/web/src/play/admission.ts`.
- Diff: `packages/web/src/play/chunking-draft.test.tsx`.
- Diff: `packages/web/src/play/chunking.tsx`.
- Diff: `packages/web/src/play/content-section.tsx`.
- Diff: `packages/web/src/play/creation-replay.test.tsx`.
- Diff: `packages/web/src/play/cue-sheet.tsx`.
- Diff: `packages/web/src/play/draft-api.test.ts`.
- Diff: `packages/web/src/play/draft-api.ts`.
- Diff: `packages/web/src/play/draft-compat.test.tsx`.
- Diff: `packages/web/src/play/draft-context.tsx`.
- Diff: `packages/web/src/play/draft-discard-conflict.test.tsx`.
- Diff: `packages/web/src/play/draft-list.test.tsx`.
- Diff: `packages/web/src/play/draft-list.tsx`.
- Diff: `packages/web/src/play/draft-recovery.test.tsx`.
- Diff: `packages/web/src/play/draft-restore.ts`.
- Diff: `packages/web/src/play/draft-save.ts`.
- Diff: `packages/web/src/play/draft-session.test.tsx`.
- Diff: `packages/web/src/play/draft-sqlite-fixture.ts`.
- Diff: `packages/web/src/play/draft-state.test.ts`.
- Diff: `packages/web/src/play/draft-state.ts`.
- Diff: `packages/web/src/play/draft-upload-races.test.tsx`.
- Diff: `packages/web/src/play/draft-upload-retry.test.tsx`.
- Diff: `packages/web/src/play/draft-upload-test-fixture.ts`.
- Diff: `packages/web/src/play/draft-uploads.test.tsx`.
- Diff: `packages/web/src/play/draft-uploads.ts`.
- Diff: `packages/web/src/play/field-targets.test.tsx`.
- Diff: `packages/web/src/play/field-targets.ts`.
- Diff: `packages/web/src/play/font-recovery.test.tsx`.
- Diff: `packages/web/src/play/format-picker.tsx`.
- Diff: `packages/web/src/play/image-prompts-draft.test.tsx`.
- Diff: `packages/web/src/play/image-prompts.test.tsx`.
- Diff: `packages/web/src/play/image-prompts.tsx`.
- Diff: `packages/web/src/play/keywords.test.tsx`.
- Diff: `packages/web/src/play/keywords.tsx`.
- Diff: `packages/web/src/play/media-rails.tsx`.
- Diff: `packages/web/src/play/missing-options.test.tsx`.
- Diff: `packages/web/src/play/output-preview.tsx`.
- Diff: `packages/web/src/play/outputs-section.tsx`.
- Diff: `packages/web/src/play/pickers.tsx`.
- Diff: `packages/web/src/play/play-test-fixture.tsx`.
- Diff: `packages/web/src/play/provided.tsx`.
- Diff: `packages/web/src/play/rail-frame.tsx`.
- Diff: `packages/web/src/play/raw-numbers-draft.test.tsx`.
- Diff: `packages/web/src/play/refusal-focus.test.tsx`.
- Diff: `packages/web/src/play/review-section.tsx`.
- Diff: `packages/web/src/play/review-state.ts`.
- Diff: `packages/web/src/play/review-summary.test.tsx`.
- Diff: `packages/web/src/play/review-summary.tsx`.
- Diff: `packages/web/src/play/review-test-fixture.ts`.
- Diff: `packages/web/src/play/review-test-harness.tsx`.
- Diff: `packages/web/src/play/review.test.tsx`.
- Diff: `packages/web/src/play/run-review.tsx`.
- Diff: `packages/web/src/play/section-navigation.tsx`.
- Diff: `packages/web/src/play/sections.test.tsx`.
- Diff: `packages/web/src/play/sections.ts`.
- Diff: `packages/web/src/play/setup-summary.tsx`.
- Diff: `packages/web/src/play/stage-rails.tsx`.
- Diff: `packages/web/src/play/start.test.tsx`.
- Diff: `packages/web/src/play/state.ts`.
- Diff: `packages/web/src/play/style-section.test.tsx`.
- Diff: `packages/web/src/play/style-section.tsx`.
- Diff: `packages/web/src/play/switches.tsx`.
- Diff: `packages/web/src/play/thinking.tsx`.
- Diff: `packages/web/src/play/use-draft-session.ts`.
- Diff: `packages/web/src/play/use-draft-uploads.ts`.
- Diff: `packages/web/src/play/use-review-choices.ts`.
- Diff: `packages/web/src/routes/play.test.tsx`.
- Diff: `packages/web/src/routes/play.tsx`.
- Diff: `packages/web/src/subtitles/controls.test.tsx`.
- Diff: `packages/web/src/subtitles/controls.tsx`.
- Diff: `packages/web/src/subtitles/font-picker.tsx`.
- Diff: `packages/web/src/subtitles/style-preview.tsx`.
- Diff: `packages/web/src/tutorial/context.tsx`.
- Diff: `packages/web/src/tutorial/model.ts`.
- Diff: `packages/web/src/tutorial/play-navigation.test.tsx`.
- Diff: `packages/web/src/tutorial/runner.test.tsx`.
- Diff: `packages/web/src/tutorial/runner.tsx`.
- Diff: `packages/web/src/tutorial/session-api.ts`.
- Diff: `packages/web/src/tutorial/session.test.tsx`.
- Diff: `packages/web/src/tutorial/step-content.tsx`.
- Diff: `packages/web/src/tutorial/test-fixture.tsx`.
- Diff: `packages/web/src/tutorial/use-session.ts`.

## 2026-09-13 - groom: review checkpoints
key: groom/2026-09-10-review-checkpoints@Q3

- What: Durable, input-bound review gates for Audio, Images and Video/export, allowing independent branches to continue while a selected stage and its dependents wait.
- Approach: Store checkpoint state and approval fingerprints beside existing admitted work and ask the runner for a dispatch grant; reuse SQLite transactions, revision authority, queue and project controls.
- Alternative rejected: Browser-only flags lose state on restart and cannot protect dispatch across tabs or processes.
- Alternative rejected: Project-wide pause stops independent work and contradicts the accepted hold-only policy.
- Alternative rejected: A mutable stage boolean cannot prove that the approved inputs are the inputs being dispatched.
- Alternative rejected: Automatic approval at cost-review time removes the explicit inspection step.
- Decision: Save persists checkpoint choices without generation; explicit approval is required and is valid only for the reviewed revision and dependency fingerprint.
- Decision: Adding or removing a gate is allowed before its stage starts; running or submitted work keeps its originating authority and requires the existing revision/rebuild flow for changes.
- Out of scope: Reusable templates, scheduled execution, automatic approval, new providers, arbitrary timeline editing and release publication.

## 2026-09-12 - map: play-redesign-baseline
key: map/play-redesign-baseline@349b5e9093ac

- `01-architecture.md`: refreshed current revision invocation dispatch, provider registry, immutable-media and revision/rebuild/control HTTP contracts, event origins, queues and client boundaries.
- `02-models.md`: refreshed domain/API field tables and migrations0001–0005, including work authority, manifests, continuations, receipts and submission-aware review snapshots.
- `04-data-flow.md`: traced initial creation, uploads, Save/Restore, explicit rebuild, late publication, recovery, retained downloads and current failure boundaries.
- `logic/18-cost-review-batch.md`: refreshed resolved-template estimation, shared request pricing, initial revision admission, batch input consumption and queue behavior.
- `uiux/screens/02-play.md`: recorded the current two-column form, nested subtitle preview, review dialog, in-memory drafts and upload/batch persistence gaps; narrowed coverage globs.
- `00-index.md`: added the current revision/rebuild module entry; retained the complete local1.0 feature backlog row.
- Scope: refreshed references consumed by Play redesign; other stale chapters remain outside this focused baseline and are not claimed current.
- Source validation: read-only topic agents supplied factual reports at349b5e9; root checked cited paths/line bounds and production Play in a disposable browser. No providers or user project data used.
- Priority: user requested all remaining1.0 work with Play redesign first; editable-project Tasks1–16 are committed, Task17/final review and the other six queued capabilities remain incomplete.
- Map check: the five refreshed sources report zero changed files; the installed skill manifest version is unavailable, so version stamps are omitted per protocol and the checker still reports older-capstone metadata. Unrelated stale/schema findings remain.

## 2026-09-12 - map: editable-projects
key: map/editable-projects@29b88494eb40

- Refreshed the approved editable-project reference impact at29b8849 after two consecutive dry implementation-review rounds.
- Architecture, models, testing and operations used read-only topic agents; data flow and behavior/screen absorption were verified inline because a third concurrent agent exceeded capacity.
- Preserved current Play behavior as memory-only setup; proposed restart-safe drafts and redesigned layout remain unimplemented.
- Corrected stale documentation: finite recipe operations, supplied-source reactivation, matching research results, retained partial article text, media versus caption identity, live image/caption/history editor behavior.
- Preserved the unexplained one-off legacy WAV test failure and source-specific Linux/Windows verification limits.
- Scope: targeted refresh only; unrelated reference chapters are not claimed current by this entry.
- Updated `docs/capstone/01-architecture.md` for as-built retained revisions and their source/behavior references.
- Updated `docs/capstone/02-models.md` for as-built retained revisions and their source/behavior references.
- Updated `docs/capstone/04-data-flow.md` for as-built retained revisions and their source/behavior references.
- Updated `docs/capstone/06-testing.md` for as-built retained revisions and their source/behavior references.
- Updated `docs/capstone/07-operations.md` for as-built retained revisions and their source/behavior references.
- Updated `docs/capstone/logic/01-pipeline-lifecycle.md` for as-built retained revisions and their source/behavior references.
- Updated `docs/capstone/logic/05-provided-outputs.md` for as-built retained revisions and their source/behavior references.
- Updated `docs/capstone/logic/08-narration.md` for as-built retained revisions and their source/behavior references.
- Updated `docs/capstone/logic/09-image-generation.md` for as-built retained revisions and their source/behavior references.
- Updated `docs/capstone/logic/11-video-assembly.md` for as-built retained revisions and their source/behavior references.
- Updated `docs/capstone/logic/12-reruns-and-edits.md` for as-built retained revisions and their source/behavior references.
- Updated `docs/capstone/logic/14-storage-and-downloads.md` for as-built retained revisions and their source/behavior references.
- Updated `docs/capstone/logic/17-subtitles.md` for as-built retained revisions and their source/behavior references.
- Updated `docs/capstone/mockup/08-project.md` for as-built retained revisions and their source/behavior references.
- Updated `docs/capstone/uiux/screens/03-project.md` for as-built retained revisions and their source/behavior references.
- Updated `docs/capstone/uiux/03-experience.md` for as-built retained revisions and their source/behavior references.
- Updated `docs/capstone/logic/README.md` for as-built retained revisions and their source/behavior references.
- Updated `docs/capstone/mockup/README.md` for as-built retained revisions and their source/behavior references.
- Updated `docs/capstone/uiux/README.md` for as-built retained revisions and their source/behavior references.
- Updated `docs/capstone/00-index.md` for as-built retained revisions and their source/behavior references.

## 2026-09-12 - implement: 2026-09-10-editable-projects
key: implement/2026-09-10-editable-projects@Q4

- What: Existing projects can change configuration, article, narration, images and captions while retaining completed media and history.
- Approach: Immutable configuration/content revisions share registered media; exact physical request/dependency identities drive reuse and current publication authority.
- Alternative rejected: Copying a whole project per edit duplicates large media and fragments the editing workspace.
- Alternative rejected: Overwriting outputs in place cannot preserve reliable history or protect newer edits against late results.
- Decision: Save and Restore create revisions without admitting providers or rendering; explicit affected-output and cost review precedes Start rebuild.
- Decision: Already submitted affected work may still be billed and finishes under its origin; matching independent work continues. This does not promise exactly-once external submissions.
- Decision: Article stays required; optional sources may change after completion. Silent video is allowed; Video Off with Audio enabled produces WAV; both media Off retains article download.
- Decision: Narration reuse compares actual text/provider/model/voice/request context. Whole-request edits invalidate that logical request; chunks, intro and outro retain independent identities.
- Decision: Subtitle style/manual cues keep compatible narration and unchanged WAV/non-burned media; caption editing uses complete current narration without requiring a final export.
- Decision: Manual cues remain reviewable after narration changes and require explicit correction or input-bound reuse confirmation; alignment does not silently overwrite them.
- Decision: Restore creates a new current revision, and history has no automatic purge. Full-project deletion retains the existing explicit flow.
- Decision: Saved project prompt snapshots remain independent of the prompt library; unavailable original template provenance is exposed rather than reconstructed.
- Out of scope: Review checkpoints remain a separate feature; accepted policy holds the selected step and dependents while independent work continues.
- Out of scope: Complete Play redesign and restart-safe setup drafts remain first among the next features; current Play drafts are still memory-only.
- Out of scope: Reusable project templates and template lifecycle remain separate; future template changes must not mutate created projects.
- Out of scope: Local one-off/recurring schedules, background operation, timezone/missed-run/overlap/spend behavior remain separate.
- Out of scope: Expanded preflight, costs/diagnostics and reliability acceptance remain separate; retain the unexplained legacy WAV test failure for that work.
- Out of scope: Portability, backups and storage/history cleanup remain separate.
- Out of scope: Final installation/update/rollback acceptance, cross-app accessibility/wording and 1.0 publication remain separate.
- Out of scope: No new provider integration or free-form video timeline.
- Task 1 completed: Persist revisions, file identities, manifests and receipts.
- Task 2 completed: Compute exact request identities and reusable work.
- Task 3 completed: Build revision recipes and exact affected-work previews.
- Task 4 completed: Make every writer allocate immutable files.
- Task 5 completed: Adopt a lazy baseline without copying retained media.
- Task 6 completed: Persist work grants, reservations, and preview admission.
- Task 7 completed: Commit save/restore with CAS, receipts and safe publication.
- Task 8 completed: Pin runner context and defer revoked requests without canceling submitted work.
- Task 9 completed: Reuse narration by request identity and rebuild entry text independently.
- Task 10 completed: Admit explicit rebuilds once and preserve save-only semantics.
- Task 11 completed: Preserve history on restart, downloads and explicit deletion.
- Task 12 completed: Add validated revision and rebuild HTTP routes.
- Task 13 completed: Preserve client edits, isolate events and review rebuilds.
- Task 14 completed: Edit configuration and frozen prompts without lossy conversion.
- Task 15 completed: Edit narration pieces, images and manual caption cues.
- Task 16 completed: Prove late publication, retry, restart, and failure preservation end to end.
- Task 17 completed: Verify legacy upgrade, explicit rebuild, restore and WAV retention through the real app.
- Reference absorption: `docs/capstone/01-architecture.md` records revision boundaries, complete contracts/dispatch and current project editor.
- Reference absorption: `docs/capstone/02-models.md` records revision/work/asset entities, exact schema and public review/request contracts.
- Reference absorption: `docs/capstone/04-data-flow.md` records Save/Restore/admission, origin publication, physical reuse and failure paths.
- Reference absorption: `docs/capstone/06-testing.md` records test inventory, revision acceptance, Linux/Windows evidence and limits.
- Reference absorption: `docs/capstone/07-operations.md` records migration, workers, restart/queued batch recovery, retained storage and exact commands.
- Reference absorption: `docs/capstone/logic/01-pipeline-lifecycle.md` records current work authority, independent dispatch, recovery and retained results.
- Reference absorption: `docs/capstone/logic/05-provided-outputs.md` records typed supplied-asset validation, source reactivation and no implicit generation.
- Reference absorption: `docs/capstone/logic/08-narration.md` records logical/physical request identity, overrides, independent entries and continuation.
- Reference absorption: `docs/capstone/logic/09-image-generation.md` records stable image order, per-image regeneration/replacement and thumbnail readiness.
- Reference absorption: `docs/capstone/logic/11-video-assembly.md` records current narration/image timeline, immutable export bundles and caption-only reuse.
- Reference absorption: `docs/capstone/logic/12-reruns-and-edits.md` records save-only revisions, explicit review/start, granular dependencies and history restore.
- Reference absorption: `docs/capstone/logic/14-storage-and-downloads.md` records immutable registered assets, historical downloads, cleanup and deletion limits.
- Reference absorption: `docs/capstone/logic/17-subtitles.md` records local timing/cue/file recipes, manual review, font snapshots and retained WAV.
- Reference absorption: `docs/capstone/mockup/08-project.md` records current editor, retained media, History, explicit rebuild and progress composition.
- Reference absorption: `docs/capstone/uiux/screens/03-project.md` records as-built revision workspace states, image preview and caption correction.
- Reference absorption: `docs/capstone/uiux/03-experience.md` records draft conflicts, upload cancellation, explicit Save/rebuild and retained history.
- Reference absorption: `docs/capstone/logic/README.md` records implemented scenario index.
- Reference absorption: `docs/capstone/mockup/README.md` records revision journey and current project reference.
- Reference absorption: `docs/capstone/uiux/README.md` records restored observed screen references and current shared design chapter role.
- Reference absorption: `docs/capstone/00-index.md` records module and companion references for revisions and scenario index.
- Review loop: Nine complete original-diff rounds. Rounds 1–7 confirmed 12, 4, 3, 4, 3, 3 and 1 new issues respectively; all 30 fixed in scoped source commits.
- Review loop: Rounds 8 and 9 each had zero new confirmed findings across specification, code quality and failure/recovery lenses; two consecutive dry rounds close review at 29b8849.
- Review refutations: Round 8 recorded 22 and round 9 recorded 22 investigated/refuted or deduplicated hypotheses; these are dispositions, not 44 unique bugs. Prior fixed findings were excluded before counting each round.
- Review refutations: Rechecked manual-article preservation, manual-cue alignment bypass, active-entry dependencies, source reactivation, revision-scoped events/files, Save/Restore dispatch authority, mutation replay/cleanup, complete bundle dependencies and accepted-job retrieval. No new material defect survived those checks.
- Validation: Exact source29b8849 full Linux rerun passed 2586 tests with one existing skip across320files; build, typecheck and lint passed.
- Validation: Native Windows backend/media passed568tests with one skip at239418c; only browser image presentation changed afterward. This is not an exact29b8849 native rerun claim.
- Validation limitation: Initial29b8849 Linux run failed the legacy WAV reuse sentinel once; native-enabled isolated4/4 and unchanged-source full reruns passed. Cause remains unexplained, and no fix or environmental attribution is claimed.
- Validation: Real app acceptance uses temporary legacy SQLite/media and actual HTTP/FFmpeg for adoption, save-only staged inputs, explicit WAV rebuild, history restore and restart; provider behavior uses fake ports.
- Validation: Last clean review added44focused tests/10files and61focused tests/sixfiles; no live paid providers or real user projects were used.
- Release state: Source remains on codex/slopify-1.0 at29b8849, package0.8.5. No new push, tag, main merge, npm publication or website deployment belongs to this completion.
- Confirmed and fixed R1-01: Missing bundle member incorrectly reused.
- Confirmed and fixed R1-02: Invalid image edit throws before typed validation.
- Confirmed and fixed R1-03: Regenerated article reopens with earlier text.
- Confirmed and fixed R1-04: Audio Off retains hidden incompatible subtitle mode.
- Confirmed and fixed R1-05: Narration regeneration keeps provided replacement override.
- Confirmed and fixed R1-06: Explicit resumed article continuation remains held.
- Confirmed and fixed R1-07: Valid retained narration piece rejected as missing output descriptor.
- Confirmed and fixed R1-08: Recipe operation types accept arbitrary strings.
- Confirmed and fixed R1-09: Prepared-asset accumulator mutates a slice input.
- Confirmed and fixed R1-10: Inworld async request limit conflicts with rebuild readiness.
- Confirmed and fixed R1-11: Paid partial article result absent from origin history.
- Confirmed and fixed R1-12: Human rebuild review lacks actual changed input and stable part identity.
- Confirmed and fixed R2-01: Removed entry audio remains in export timeline.
- Confirmed and fixed R2-02: Deferred thumbnail image skips image-provider readiness.
- Confirmed and fixed R2-03: Cached completed article recovery requires unavailable provider.
- Confirmed and fixed R2-04: Partial publication ID violates client revision schema.
- Confirmed and fixed R3-01: Empty edited generated article is accepted as complete.
- Confirmed and fixed R3-02: Retained entry descriptor reused with wrong supplied-body role.
- Confirmed and fixed R3-03: Images Provide selection silently becomes Generate.
- Confirmed and fixed R4-01: Deferred thumbnail omits image catalogue snapshot.
- Confirmed and fixed R4-02: Export starts before incomplete subtitle dependency repairs.
- Confirmed and fixed R4-03: Retained instructions accepted as supplied thumbnail.
- Confirmed and fixed R4-04: Duration inspection falsely authorizes changed narration reuse.
- Confirmed and fixed R5-01: Caption-only duration inspection invalidates unchanged media.
- Confirmed and fixed R5-02: Moving retained image reference loses current media descriptor.
- Confirmed and fixed R5-03: Research rebuild stalls when a new outline shrinks.
- Confirmed and fixed R6-01: Caption editor depends on final export instead of complete narration.
- Confirmed and fixed R6-02: History decoder hides retained research text.
- Confirmed and fixed R6-03: Reactivating a dormant provided asset fails destination rebinding.
- Confirmed and fixed R7-01: Image editor ignores completed generated image descriptors.
- Source diff: `.github/workflows/ci.yml` (017b25c..29b8849).
- Source diff: `package-lock.json` (017b25c..29b8849).
- Source diff: `packages/app/package.json` (017b25c..29b8849).
- Source diff: `packages/app/src/adapter-registry.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/adapters/tts/inworld-async.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/adapters/tts/inworld-text.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/adapters/tts/inworld.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/adapters/tts/inworld.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/catalog/registry.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/catalog/registry.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/edge/events/hub.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/edge/events/hub.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/edge/events/preview-cache.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/edge/events/preview-cache.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/edge/events/visibility.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/edge/events/visibility.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/edge/http/actions.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/edge/http/actions.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/edge/http/app.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/edge/http/audio-preview.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/edge/http/audio-preview.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/edge/http/planning.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/edge/http/projects.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/edge/http/revision-adoption.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/edge/http/revision-controls.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/edge/http/revision-delete.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/edge/http/revision-files.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/edge/http/revision-files.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/edge/http/revisions-rebuild.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/edge/http/revisions.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/edge/http/revisions.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/edge/http/subtitles.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/kernel/audio-preview.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/kernel/audio-preview.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/kernel/db/migrate.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/kernel/db/migrations/0004-project-revisions.sql` (017b25c..29b8849).
- Source diff: `packages/app/src/kernel/db/migrations/0005-revision-work.sql` (017b25c..29b8849).
- Source diff: `packages/app/src/kernel/events.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/kernel/ports/llm.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/kernel/runner/attempt-repo.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/kernel/runner/attempt-repo.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/kernel/runner/attempt.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/kernel/runner/attempt.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/kernel/runner/index.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/kernel/runner/index.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/kernel/runner/providers.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/kernel/runner/providers.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/kernel/runner/work-attempt.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/kernel/runner/work-authority.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/kernel/runner/work.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/kernel/runner/work.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/main.activation.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/main.pipeline.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/main.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/main.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/admission/repo.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/admission/schema.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/admission/start.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/article/continuation.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/article/continuation.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/article/provided-entries.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/article/provided-entries.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/article/run.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/article/run.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/article/segments.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/batch/index.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/batch/revision-admission.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/cancel/index.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/control/control.fake.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/control/index.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/control/index.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/control/revision-control-schema.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/control/revision-control.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/control/revision-controls.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/estimate/index.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/estimate/index.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/estimate/requests.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/estimate/requests.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/images/run.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/narration/legacy-plan.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/narration/live.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/narration/plan.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/narration/plan.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/narration/reuse.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/narration/run.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/admission-repo.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/attempt-origin.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/dependencies.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/dependencies.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/legacy-admission.fake.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/model.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/model.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/narration-history.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/narration-reuse.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/preview-details.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/preview-details.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/preview-plan.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/preview-retained.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/provided-review.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/recipe-audio.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/recipe-audio.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/recipe-build.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/recipe-editor-intent.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/recipe-exports.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/recipe-fixture.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/recipe-input-schema.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/recipe-legacy-images.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/recipe-legacy.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/recipe-legacy.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/recipe-model.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/recipe-model.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/recipe-provider-choice.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/recipe-save-provenance.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/recipe-save.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/recipe-text.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/recipe-text.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/recipe-validation.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/recipe-visual.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/recipe-work.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/recipe-work.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/recipes.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/recipes.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/repo.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/repo.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/runtime-actions.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/runtime-actions.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/runtime-admission.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/runtime-admission.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/runtime-article.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/runtime-article.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/runtime-bundle-recovery.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/runtime-dependency-recovery.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/runtime-entry-reuse.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/runtime-export-entries.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/runtime-export-identity.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/runtime-export-inputs.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/runtime-export-native.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/runtime-export.fake.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/runtime-export.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/runtime-export.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/runtime-instructions.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/runtime-local.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/runtime-materialize.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/runtime-materialize.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/runtime-narration-history.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/runtime-narration-regenerate.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/runtime-narration-reuse.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/runtime-narration-reuse.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/runtime-narration.fake.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/runtime-plan.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/runtime-provider.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/runtime-provider.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/runtime-publication.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/runtime-publication.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/runtime-run.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/runtime-store.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/runtime-store.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/runtime-subtitles.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/runtime-subtitles.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/service-accepted.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/service-cached-article.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/service-concurrency.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/service-confirmations.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/service-future.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/service-readiness.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/service-request-limits.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/service-reuse.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/service-thumbnail-readiness.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/service-validation.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/service.fake.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/service.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/service.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/transition-repo.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/transition-repo.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/work-records.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/work-schema.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/rebuild/work.fake.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/reruns/index.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/research/run.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/research/run.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/adopt-assets.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/adopt-content.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/adopt-history.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/adopt-images.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/adopt-planning.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/adopt.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/adopt.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/download-permissions.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/downloads.fake.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/downloads.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/downloads.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/index.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/manifest-repo.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/model.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/mutation-assets.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/mutation-cues.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/mutation-prepare.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/mutation-prepare.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/mutation-request.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/mutation-work.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/mutation.fake.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/mutations-article-required.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/mutations-asset-kind.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/mutations-content.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/mutations-cue-voice.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/mutations-cues.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/mutations-image-source.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/mutations-media.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/mutations-projection.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/mutations-provided-role.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/mutations-retained-images.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/mutations-source-return.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/mutations-validation.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/mutations-work.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/mutations.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/mutations.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/projection.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/publication-bundles.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/publication-integrity.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/publication-model.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/publication-rules.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/publish.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/publish.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/repo.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/repo.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/restore.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/revision.fake.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/rules.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/rules.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/schema.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/schema.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/view.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/revisions/view.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/storage/assets.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/storage/assets.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/storage/delete-history.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/storage/delete-project.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/storage/delete-project.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/storage/downloads.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/storage/downloads.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/storage/prepare.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/storage/prepare.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/storage/reconcile.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/storage/reconcile.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/storage/repo.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/storage/schema.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/storage/staging.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/subtitles/prepare.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/thumbnail/run.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/video/audio-inputs.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/video/audio-inputs.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/video/export.fake.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/video/ffmpeg.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/video/run.ts` (017b25c..29b8849).
- Source diff: `packages/app/src/slices/video/subtitle-only.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/test/article-run.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/test/cancel.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/test/e2e/editable-projects.fixture.ts` (017b25c..29b8849).
- Source diff: `packages/app/test/e2e/editable-projects.http.ts` (017b25c..29b8849).
- Source diff: `packages/app/test/e2e/editable-projects.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/test/e2e/optional-outputs.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/test/e2e/skeleton.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/test/images-run.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/test/intro-outro-render.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/test/legacy-runner.ts` (017b25c..29b8849).
- Source diff: `packages/app/test/narration-run.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/test/provided-article.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/test/provided-entries.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/test/reruns.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/test/research-run.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/test/revision-article-recovery.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/test/revision-bundle-recovery.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/test/revision-narration.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/test/revision-provided.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/test/revision-rebuild.fake.ts` (017b25c..29b8849).
- Source diff: `packages/app/test/revision-rebuild.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/test/revision-research-rebuild.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/test/revision-restart.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/test/telemetry-counters.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/test/thumbnail-run.test.ts` (017b25c..29b8849).
- Source diff: `packages/app/test/video-render.test.ts` (017b25c..29b8849).
- Source diff: `packages/web/src/api.ts` (017b25c..29b8849).
- Source diff: `packages/web/src/events.test.ts` (017b25c..29b8849).
- Source diff: `packages/web/src/events.ts` (017b25c..29b8849).
- Source diff: `packages/web/src/play/pickers.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/play/thinking.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/api.test.ts` (017b25c..29b8849).
- Source diff: `packages/web/src/project/api.ts` (017b25c..29b8849).
- Source diff: `packages/web/src/project/body-article.test.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/body-article.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/body-audio.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/body-images.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/body-thumbnail.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/body-video.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/caption-editor.test.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/caption-editor.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/controls.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/header.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/image-editor.test.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/image-editor.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/image-preview.test.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/image-preview.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/live-audio.test.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/live-audio.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/live-revision.ts` (017b25c..29b8849).
- Source diff: `packages/web/src/project/live-writing.test.ts` (017b25c..29b8849).
- Source diff: `packages/web/src/project/live-writing.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/live.test.ts` (017b25c..29b8849).
- Source diff: `packages/web/src/project/narration-editor.test.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/narration-editor.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/narration-regeneration.test.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/open-folder.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/output-label.ts` (017b25c..29b8849).
- Source diff: `packages/web/src/project/parts.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/providers.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/rebuild-review.test.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/rebuild-review.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/revision-action-context.ts` (017b25c..29b8849).
- Source diff: `packages/web/src/project/revision-api.test.ts` (017b25c..29b8849).
- Source diff: `packages/web/src/project/revision-api.ts` (017b25c..29b8849).
- Source diff: `packages/web/src/project/revision-caption-duration.ts` (017b25c..29b8849).
- Source diff: `packages/web/src/project/revision-caption-recovery.test.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/revision-content.test.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/revision-content.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/revision-editor-test-fixtures.ts` (017b25c..29b8849).
- Source diff: `packages/web/src/project/revision-fixture.ts` (017b25c..29b8849).
- Source diff: `packages/web/src/project/revision-form-save.test.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/revision-form-state.test.ts` (017b25c..29b8849).
- Source diff: `packages/web/src/project/revision-form-state.ts` (017b25c..29b8849).
- Source diff: `packages/web/src/project/revision-form.test.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/revision-form.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/revision-history.test.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/revision-history.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/revision-media.test.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/revision-media.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/revision-prompts.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/revision-providers.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/revision-requests.test.ts` (017b25c..29b8849).
- Source diff: `packages/web/src/project/revision-requests.ts` (017b25c..29b8849).
- Source diff: `packages/web/src/project/revision-upload.test.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/revision-upload.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/revision-workspace.test.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/revision-workspace.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/stage-row.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/subtitles.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/use-actions.test.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/project/use-actions.ts` (017b25c..29b8849).
- Source diff: `packages/web/src/project/use-live.ts` (017b25c..29b8849).
- Source diff: `packages/web/src/queries.ts` (017b25c..29b8849).
- Source diff: `packages/web/src/routes/project-actions.test.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/routes/project-controls.test.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/routes/project-fixtures.ts` (017b25c..29b8849).
- Source diff: `packages/web/src/routes/project-live.test.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/routes/project-revision.fake.ts` (017b25c..29b8849).
- Source diff: `packages/web/src/routes/project-revisions.test.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/routes/project-subtitles.test.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/routes/project.test.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/routes/project.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/tutorial/runner.test.tsx` (017b25c..29b8849).
- Source diff: `packages/web/src/tutorial/step-content.tsx` (017b25c..29b8849).
- Documentation validation: All20 affected reference/index paths passed frontmatter/absorption/source-hash/link checks; five required topic contracts and100unique indexed entities passed; whitespace checks passed. Feature marked implemented locally after those outputs existed.
- Integration pending: Source commits remain local and refreshed docs remain dirty for normal branch integration. Feature scaffolding is retained until that branch is finished; no push/publication was performed.

## 2026-09-12 - groom: 2026-09-10-play-redesign-drafts
key: groom/2026-09-10-play-redesign-drafts@Q5

- `features/2026-09-10-play-redesign-drafts/spec.md`: formalized approved Play composition, durable draft/upload ownership, full-page review, and replay-safe Start requirements.
- Chosen: four freely navigable Content/Outputs/Style/Review sections with one responsive preview, matching the approved clickable mockup.
- Chosen: local server SQLite drafts, 500ms idle save, explicit conflicts and retained completed staged uploads across restarts.
- Chosen: exact reviewed-input binding and durable request identity for single and batch starts; uncertain responses cannot cause duplicate chargeable admissions.
- Rejected: all-visible controls retain crowding; collapsible long form separates controls from preview; browser-only persistence does not preserve server media.
- Prototype browser storage, illustrative model prices and simulated Start are demonstration mechanics, not production contracts.
- Deferred: checkpoints, templates, schedules/background, broader reliability/preflight, portability/storage and final release acceptance remain separate required release groups.
- Out of scope: website changes, release publication, version bump and automatic docs commits.

## 2026-09-10 - implement: local subtitles and fonts
key: implement/2026-09-10-subtitles-fonts@Q1
- What: Slopify0.6.0 adds free local English subtitles for new and existing narrated projects; the user chose to keep this release local after automatic approval review blocked publishing to an unnamed public destination.
- Approach: one local alignment port with a pinned MIT WASM runtime and lazy95MB Apache-2.0 wav2vec2 model;12second inference windows and bounded CTC preserve original word spelling and actual speech times. No paid caption API, Python or compiler required.
- Alternatives: native ONNX runtime rejected because default Linux CUDA downloads and IntelMac coverage weaken portability; heuristic text-duration allocation rejected because it cannot provide actual speech timing; paid subtitle services excluded by the request.
- Out of scope: languages beyond English, arbitrary transcript certainty, speech generation changes, subtitle editing/translation, model training, and a new timeline editor.
- Task1: website controls already deployed independently; package-generated zoom increased100→122.5% over unchanged slots in dd854de. Approved website footage unchanged.
- Task2: verified lazy model cache, abortable child inference, English normalization, mismatch detection and real narration proof.
- Task3: bundled Barlow/OFL, bounded system font discovery,32MiBTTF/OTF uploads, TTC face previews and per-export font snapshots.
- Task4: SRT/VTT/ASS artifacts, intro/body/outro timing and gaps, content-hash cache reuse, local final-stage rerender, paused saves, admission validation and rollback-safe export metadata commits.
- Task5: Play/project subtitle controls, font size/preview/upload, unsaved-change protection, actual-output-mode native VTT gating and interactive tutorial spotlight.
- Task6: version0.6.0, packaged worker/font/license/guide, website release copy and affected reference updates. Publication canceled by user; local branch retained.
- Diff: c4529f6..a3bf858; .github/workflows/ci.yml; package manifests/lock; app alignment/font/subtitle modules, admission/storage/video/API integration and tests; web Play/project/subtitle/tutorial surfaces; site index copy.
- Chapters refreshed:00-index,01-architecture,02-models,04-data-flow,05-dependencies,06-testing,07-operations.
- Scenarios absorbed:logic04-run-admission,11-video-assembly,14-storage-and-downloads,new17-subtitles; mockup01-marketing-page,06-play,08-project; uiux03-experience and README.
- Review: seven confirmed findings fixed (rendered mode metadata, async edit recheck, early missing-font refusal, hidden invalid styles, relative ffmpeg path, metadata-commit rollback and backup retention). Two subsequent independent review rounds reported no new material findings.
- Verification: canonical npmci,1662tests, lint, typecheck, production build, package contents and zero audit vulnerabilities. Actual68.3s/120word audio aligned17.7s;205s/360words aligned53.3s with728MiBpeakRSS. Real browser validates burned captions, system/uploaded fonts, SRT downloads and native VTT;1024px layout has no overflow. Whole-file media route's existing seek limitation remains; native captions work during ordinary playback.
- Remote status: no0.6push/tag/npm publication/site deployment, per user choice. Linux/Windows CI additions remain locally prepared.

## 2026-09-10 - subtitle omission recovery (unreleased)
key: subtitles/omission-recovery
- Add bounded resynchronization after short omitted transcript passages using existing local acoustic output; do not make paid requests or regenerate narration.
- Require four strong following words and cap both per-event and total omissions. Preserve rejection of wrong recordings, extra speech and weak anchors.
- Persist timestamped unmatched text in caption timing caches and export metadata; display a review note beside caption downloads. Version the timing cache for the new algorithm.
- Verification: 1,916 tests passed, one platform skip; lint, type checks and production build passed. An isolated real-audio excerpt that failed previously completed with 768 timed words and one omission note. No user project files or database were changed.
- logic/17-subtitles.md and uiux/screens/03-project.md absorb the implemented behavior.

## 2026-09-10 - release: 0.8.3
key: release/0.8.3
- Replace the update popover with one-click checking or installation and version/status hover text. Lift the floating icon above a visible footer and reserve space below the last content card.
- Reuse an unchanged WAV while preparing/replacing/removing subtitle sidecars; do not invoke the audio encoder or replace the WAV row. Validate source identities and recorded timeline, support existing older exports, and retain captions/audio on commit failure.
- Identify subtitle preparation in project progress. Uncached alignment remains necessary; provider narration is reused.
- Verification: 1,919 tests pass with one platform skip; lint, types, build and zero-vulnerability audit pass. Chrome verified footer clearance and click/hover behavior at 1440/390/320 pixels. A read-only check confirms Arda Article's existing WAV qualifies for reuse; its running process was not interrupted.
- logic/11-video-assembly.md, logic/17-subtitles.md, uiux/screens/03-project.md and uiux/screens/12-updater.md absorb the implemented behavior.

## 2026-09-10 - release: 0.8.2
key: release/0.8.2
- Publish bounded subtitle omission recovery and persistent review notes from e5a9c51.
- Clear the browser's accepted-update state when the server returns idle, even if its version is unchanged. Also clear that state before requesting reload after a changed version activates.
- Add a regression test proving the Updating indicator clears and Check again becomes usable for an idle, unchanged server.
- Bump the package, lockfile workspace entry and website release copy to 0.8.2.

## 2026-09-10 - release: 0.8.1
key: release/0.8.1
- User request: icon-only circular updater arrows plus availability dot; sentence-aware character chunking with a user-set count.
- Character mode is persisted on new jobs and editable on paused/failed narration. Defaults to 3000 Unicode characters including internal whitespace, with an integer input range 1–1,000,000. It retains the existing oversized-sentence behavior; hard provider limits remain a separate safeguard.
- Shared effective-chunk comparison resets unfinished narration when N changes and preserves pieces when it does not.
- Update trigger keeps its accessible label, focus indication and 40-pixel hit area; popover, polling and explicit installation behavior are unchanged.
- Verification: 1,904 tests pass with one platform skip; lint, types, build and zero-vulnerability audit pass. Chrome verified 1440/390/320-pixel layouts and availability-dot transitions without paid calls or installation.
- `02-models.md`: absorbed the implemented character-mode/update-control behavior.
- `04-data-flow.md`: absorbed the implemented character-mode/update-control behavior.
- `06-testing.md`: absorbed the implemented character-mode/update-control behavior.
- `08-glossary.md`: absorbed the implemented character-mode/update-control behavior.
- `logic/08-narration.md`: absorbed the implemented character-mode/update-control behavior.
- `uiux/screens/02-play.md`: absorbed the implemented character-mode/update-control behavior.
- `uiux/screens/03-project.md`: absorbed the implemented character-mode/update-control behavior.
- `uiux/screens/12-updater.md`: absorbed the implemented character-mode/update-control behavior.

## 2026-09-10 - release: 0.8.1 output folders
key: release/0.8.1/open-folder
- Added Open folder beside every shared chapter download, including image collections and subtitle exports.
- POST /api/projects/:id/open-folder resolves a recorded asset to its containing directory; invalid and missing assets do not invoke the native launcher. Cross-origin requests are refused.
- Native launch uses argument arrays with no shell. WSL translates the path through wslpath before invoking Windows Explorer; macOS uses open and Linux uses xdg-open.
- The frontend reports launcher failures inline and retains the download action.
- Coverage includes folder resolution, invalid assets, origin refusal, launcher failures, platform command arguments, and download UI interactions. Windows CI includes folder command and file route tests.
- uiux/screens/03-project.md absorbs the new download action.
- Verification: 1,909 tests pass with one platform skip; lint, type checking and production build pass. Native file managers were not launched by automated tests.

## 2026-09-10 - provider model catalogues
key: models/provider-catalogues@2026-09-10
- Request: automatically load provider model choices in Play and paused/failed project controls, with refresh and supported manual IDs.
- Backend contract: GET /api/providers/:id/models returns models, allowsCustom, optional origin notice and separate discovery warning; refresh=1 bypasses the five-minute cache. Failed loads preserve prior or bundled compatible choices. Provider origins include live APIs, installed CLI metadata/aliases and curated adapter lists.
- Frontend: removed duplicated model catalogues and sole-model defaults; added explicit TTS model selection. Provider-keyed queries avoid stale responses, preserve selected/saved IDs and retain usable choices through failures. fal and Replicate do not offer arbitrary custom IDs because model input schemas vary.
- References: logic/02-provider-credentials.md, mockup/06-play.md, 01-architecture.md, 02-models.md, 05-dependencies.md and 06-testing.md.
- Verification: 1,761 tests passed with one Windows-only skip; lint, strict type checking and production build passed. A real browser verified installed Codex/Gemini choices, custom IDs, refresh, saved selection and no page errors. Follow-up tutorial tests passed after the copy update.

## 2026-09-10 - project workspace, live previews and in-app updates
key: project/workspace-updates@2026-09-10
- Request: replace the unwieldy project detail layout, show total progress alongside stage progress, stream writing/audio where supported, and add a floating update control with periodic checks.
- Workspace: persistent stage navigation, focused output pane, direct final download, Run settings disclosure, bounded reading panes, collapsed subtitle/font controls and actionable failure recovery. Stage changes preserve unsaved drafts; the tutorial selects and exposes the relevant controls.
- Progress: equally weighted enabled stages combine completed and reported partial work; skipped stages are excluded and incomplete runs remain below 100%.
- Streaming: visible LLM deltas have separate logical call IDs and retry resets, with bounded reconnect replay. Narration previews consume existing MP3 streams, support concurrent parts and cancellation, and create no additional provider calls.
- Updating: fixed npm package and registry, 15-minute checks, explicit install, active-work/mutation barrier, detached staged installation, health-checked restart, candidate mutation lock, atomic activation and database rollback before activation. Original launchers follow the successful managed-install pointer.
- Verification: full suite passed 1,850 tests with one Windows-only skip, lint, strict type checks and the production build passed. Isolated process fixtures proved successful update handoff and failed-candidate database rollback. Chrome played narration at 0.408 seconds while only 57,344 of 401,283 bytes had arrived; cancellation cleared retained preview bytes. The real Test project shrank from 14,159 to 1,243 pixels at desktop, retaining drafts through stage changes and avoiding page overflow on mobile. Browser checks use existing outputs and local fixtures, with no paid provider generation or real npm self-update.
- Release: no version bump, public push, npm publication or website deployment is part of this change.
- Local installation: installed the verified 224-file tarball into the existing detached service on port 6969 after a private database backup. Both projects and stored data counts were preserved; the installed app passed Chrome checks for the workspace, updater, preview endpoint and 320-pixel settings layout. The local build retains version 0.6.1; it is not a new public release.

## 2026-09-10 - plan: 2026-09-10-editable-projects
key: plan/2026-09-10-editable-projects@Q4

- User approved the 17-task implementation plan and requested implementation.
- Retained revisions, immutable assets, explicit rebuild admission and request-level reuse precede the project/media/caption editors.
- The plan covers migration, late results, disk/DB failures, restart and Windows media acceptance without paid-provider calls.
- User selected fresh subagents per implementation task; the remaining seven 1.0 features stay queued.

## 2026-09-10 - map: release 0.8.0
key: map/all@3a9796eb7fec
- `01-architecture.md`: refresh for source/template drift.
- `02-models.md`: refresh for source/template drift.
- `03-conventions.md`: refresh for source/template drift.
- `04-data-flow.md`: refresh for source/template drift.
- `05-dependencies.md`: refresh for source/template drift.
- `06-testing.md`: refresh for source/template drift.
- `07-operations.md`: refresh for source/template drift.
- `08-glossary.md`: refresh for source/template drift.
- `logic/18-cost-review-batch.md`: fill observable scenario/surface coverage gap.
- `logic/19-catalogue-thinking.md`: fill observable scenario/surface coverage gap.
- `logic/20-boot-cli-recovery.md`: fill observable scenario/surface coverage gap.
- `logic/21-app-updater.md`: fill observable scenario/surface coverage gap.
- `uiux/screens/01-projects.md`: fill observable scenario/surface coverage gap.
- `uiux/screens/02-play.md`: fill observable scenario/surface coverage gap.
- `uiux/screens/03-project.md`: fill observable scenario/surface coverage gap.
- `uiux/screens/04-prompts.md`: fill observable scenario/surface coverage gap.
- `uiux/screens/05-prompt-editor.md`: fill observable scenario/surface coverage gap.
- `uiux/screens/06-entries.md`: fill observable scenario/surface coverage gap.
- `uiux/screens/07-entry-editor.md`: fill observable scenario/surface coverage gap.
- `uiux/screens/08-settings.md`: fill observable scenario/surface coverage gap.
- `uiux/screens/09-usage.md`: fill observable scenario/surface coverage gap.
- `uiux/screens/10-marketing.md`: fill observable scenario/surface coverage gap.
- `uiux/screens/11-first-run-tutorial.md`: fill observable scenario/surface coverage gap.
- `uiux/screens/12-updater.md`: fill observable scenario/surface coverage gap.
- `00-index.md`: refreshed module entry points and indexed every new scenario/screen.
- Architecture reference describes the implemented curated catalogue, cost review, durable batch scheduling, five-request cap and unfinished narration repair.
- Preserved interview-derived logic 01–17 and committed UI direction/system/experience; these remain design decisions, not generated observations.
- Interfaces topic absent: no sibling-repository protocol; external vendor APIs are documented under dependencies, and the collector is in this monorepo.
- Research artifact remains in gitignored features/2026-09-10-release-080/provider-research.md.
- Local checks: lint, strict types, 1,893 tests plus one platform skip, production build and zero audit vulnerabilities. No paid generation was run.
- Fragments remain unfolded on the release feature branch, per ledger rules.
- Map verification: all new index/source paths resolve; catalogue, batch and estimate citations were checked against source. The installed skill manifest is unavailable, so version stamps are omitted as instructed. The checker reports those missing version stamps and 12 pre-existing template-heading gaps in interview-derived documents; their decisions were preserved.
- Browser verification passed: pre-run review starts no jobs; confirmed article-only batch completed; 1440/390/320-pixel layouts fit; supported Gemini thinking choices and unknown CLI estimates work without paid calls.

## 2026-09-10 - map: editable-projects-baseline
key: map/editable-projects-baseline@017b25cc6c86

- `01-architecture.md`: refreshed current entrypoints, provider/stage registry, HTTP/SSE/IPC payloads, folder opening and WAV reuse wiring.
- `02-models.md`: added subtitle omission, alignment/preparation and audio export record fields; SQL schema unchanged.
- `04-data-flow.md`: recorded caption-only WAV reuse, internal omission recovery and host folder-opening paths.
- `uiux/screens/02-play.md`, `uiux/screens/03-project.md`: checked covered source drift and refreshed stamps; recorded internal omission review notes.
- `00-index.md`: added local feature backlog row and removed configuration from the document index.
- Refresh scope limited to reference chapters consumed by editable-project grooming; other stale chapters remain reported by map check.

## 2026-09-10 - inworld-subtitle-positions
### Inworld narration and subtitle positions

Adds Inworld TTS-2 and TTS-2 Flash to Settings, model selection, voices and narration. TTS-2 uses async synthesis above 4,000 characters, accepting up to 100,000 per job subject to account limits. Status activity extends the idle deadline and a per-call continuation prevents duplicate submission during automatic polling/download retries. Flash streams bounded text parts.

Adds five persisted subtitle positions, shared preview/render geometry, font and size preview beside controls in the actual output aspect ratio, and landscape/portrait format buttons. Existing projects default to bottom and reuse alignment for style changes.

Release 0.7.0 also includes the previously completed model catalogue, project workspace, live previews and app updater changes. Website and package documentation describe the final release.

Sources: https://docs.inworld.ai/tts/tts-models ; https://docs.inworld.ai/api-reference/ttsAPI/texttospeech/synthesize-speech-stream ; https://docs.inworld.ai/api-reference/ttsAPI/texttospeech/synthesize-speech-async ; https://docs.inworld.ai/api-reference/ttsAPI/texttospeech/get-async-operation .

## 2026-09-10 - groom: 2026-09-10-editable-projects
key: groom/2026-09-10-editable-projects@Q4

- `features/2026-09-10-editable-projects/spec.md`: approved revisioned project editing, retained assets, explicit rebuilds, granular output edits and concurrency behavior.
- Saving edits never starts generation; explicit rebuild previews dependencies and known/unknown provider charges.
- Shared immutable assets selected; complete project copies and in-place overwrites rejected.
- Independent work continues around checkpoints; selected steps and their dependents wait for approval.
- Seven linked features retain the rest of the accepted 1.0 scope: checkpoints, Play/drafts, templates, schedules, reliability/preflight, portability/storage, release readiness.

## 2026-09-10 - map: CLI executable paths and Gemini
key: map/cli-paths-gemini@2026-09-10
- Request: make installed Claude Code, Codex and Gemini CLI usable when the Slopify process cannot discover their command through PATH; provide editable per-provider paths in Settings.
- Backend: Gemini provider/catalog entry; optional ProviderStatus.cliPath; PUT /api/providers/:id/path; absolute-file validation, readable JavaScript entries, 4096-character cap, version-probe validation and blank reset. Values use generic settings keys cli.path.<provider>, with no migration. Concurrent saves serialize and failed candidates preserve the old path.
- Invocation: each new CLI call reads the latest saved override; in-flight calls keep their starting command. Shared Windows handling unwraps supported Node shims without shell-interpolating prompts and refuses unknown batch launchers with executable/JS guidance. Probes allow 15 seconds for startup.
- Gemini: explicit -p stream-json adapter with existing CLI login, curated 2.5 Pro/Flash/Flash-Lite choices, temporary context reset and trusted-folder map, no browser authentication, restricted tools and abort cleanup. No Gemini SDK or new package dependency added.
- Frontend: editable CLI rows with command/status, independent drafts, Checking/Saved states, inline failures, blank reset and provider-query refresh; tutorial setup mentions all three CLI choices.
- Reference outputs: logic/02-provider-credentials, 01-architecture, 02-models, 05-dependencies, 06-testing, 07-operations, mockup/03-settings. Source commit/hash stamps refreshed against local implementation 1fa45d743329.
- Local verification: 1,706 tests passed and one Windows-only test skipped; lint, typecheck, production build and inspection of the 202-file package passed. Browser checks verified all three path fields and saving without console errors or overflow.
- Activity: all three CLI adapters emit content-free activity events; the runner refreshes idle deadlines without forwarding reasoning/tool details as output.
- Local installation: existing port 6969 service updated from 0.5.1 to 0.6.0 after a private SQLite backup; projects preserved and all three verified CLI paths saved. Global slopify command installed from the local tarball; personal filesystem paths are omitted from the reference.
- Live requests: Codex gpt-5.6-sol succeeded in 13.3 seconds and Claude Haiku in 2.7 seconds. Gemini 0.16.0 launched and loaded its cached login, but Google license error #3501 blocked generation; it maps to unsupported with no automatic retry. Gemini was neither upgraded nor signed in again.
- Release status: 0.6.0 remains local under the user's existing choice; no push, tag, npm publication or site deployment is performed by this change.

## 2026-09-10 - implement: pausable optional runs
key: implement/2026-09-09-pausable-optional-runs@Q2
- What: Slopify 0.5.1 lets local users pause work, save different providers, skip every stage except Article, and export the media they selected.
- Approach: preserve the six stage rows, store pause separately, serialize project mutations, and share source-aware dependencies between scheduling and reruns. A separate pause table preserves existing project rows during upgrade.
- Media decision: the user chose silent video without audio and audio-only output without images. Images Off selects Video Off; silent slides last five seconds each. WAV combines the available narration segments and gaps.
- Review refinement: supplied narration is used as-is; selected entries apply to generated narration. A supplied Article prepares entry text during Audio, retaining that text on Article for retries and voice changes.
- Out of scope: no background-only video or configurable silent-slide timing.
- Out of scope: no automatic provider fallback or key-management changes.
- Out of scope: no replacement of completed outputs merely because provider settings changed; no new runtime dependency.
- Task 1 complete: normalize optional admission and ignore unused prompts, uploads, voices and keyword requirements.
- Task 2 complete: durable pause/resume, validated provider edits, partial-work preservation and independent image scheduling.
- Task 3 complete: real PCM WAV export, silent MP4 rendering and retained previous exports during failures.
- Task 4 complete: Play controls, provider editor, pause/resume and 19-step tutorial with the selected final download.
- Task 5 complete: integrated review, local tests/browser checks, package verification, push, Linux/Windows CI, v0.5.1 tag and successful npm publication workflow.
- Diff: d7d28c4..b5a3b22 changed .github/workflows/ci.yml, package version files, app HTTP/events, runner/database, admission/article/control/cancel/library/reruns/storage/video slices and tests, web shell/events/Play/project/tutorial surfaces and tests, and the reference files listed below.
- 01-architecture.md: control slice, per-project mutation queue, live configuration updates and the extended guide.
- 02-models.md: durable pause table, article checkpoints and audio_export role.
- 04-data-flow.md: independent scheduling, source-aware exports and cross-window updates.
- 06-testing.md: concurrency, provider changes, restart and real media export coverage.
- logic/01-pipeline-lifecycle.md: pause precedence, all-selected-stage completion and dependency rules.
- logic/04-run-admission.md: Article-only minimum, optional media combinations and inactive requirements.
- logic/08-narration.md: entry preparation for supplied articles and complete uploaded narration.
- logic/09-image-generation.md: immediate saved-prompt images and prewritten thumbnails.
- logic/11-video-assembly.md: silent MP4 and combined PCM WAV outputs.
- logic/12-reruns-and-edits.md: provider changes, retained work and source-aware invalidation.
- logic/13-cancel.md: durable pause/resume and cancellation when active work finishes during abort.
- logic/14-storage-and-downloads.md: WAV file, output role, URL and MIME type.
- mockup/06-play.md: Off choices, provided narration and final export controls.
- mockup/08-project.md: pause/provider controls, unsaved-change protection and WAV presentation.
- Review loop: lifecycle, optional-output and UI/API review passes identified and fixed catalog-lock timeout, dropped provided-content entries, misleading independent-stage copy, unsaved provider edits on Resume, stale mutation responses, actions updating another project's cache, and stale cross-window listings. Follow-up reviews reported no remaining concrete findings.
- Verification: 1,571 tests, lint, typecheck, production build, package checks and audit pass. Chrome checks cover the full guide and controls at 1440px/1024px. Windows CI found an equivalent ffmpeg channel-label difference in one test; corrected in b5a3b22. CI run34410489598 and publication run34410721672 succeeded for that exact commit.

## 2026-09-10 - release 0.5.1: pause and optional outputs
key: release/0.5.1
- Runs can pause and resume with a durable pause flag. Pause aborts and drains active work, preserves completed pieces and outputs, and prevents new claims across app restarts.
- Paused and failed projects can save text, image and narration provider/model choices, including a saved voice, before resuming separately. Provider validation has a deadline; per-project control queues protect concurrent edits, pause/resume and deletion. Changing unfinished narration's TTS choices clears partial audio to keep the voice consistent.
- Article is the only required stage. Research, Audio, Images, Thumbnail and Video can be Off. Images Off selects Video Off; active Audio then exports combined 48 kHz stereo PCM WAV. Audio Off with images produces a silent MP4 at five seconds per image. Audio and Video Off permits article-only completion.
- Saved-prompt images and prewritten thumbnails run immediately alongside research/writing. Only an LLM-written thumbnail waits for Article. Completion and rerun dependencies follow the selected outputs, so independent images neither wait for Article nor regenerate after text edits, and do not block or invalidate WAV exports.
- Disabled fields no longer require unused prompts, keywords or voices. Uploaded narration is used as-is; generated narration can add selected intro/outro entries even when the Article is supplied.
- The interactive tutorial now has 19 steps, explains Video selection and pause/provider controls, and highlights the actual MP4, WAV or Article download. Chrome checks at 1440px and 1024px cover the complete guide and new controls using simulated API responses.
- Added real-app WAV and silent-video download checks to both Linux and Windows CI, plus control-concurrency, restart, partial-preservation and provider-switch regressions. No runtime dependencies added.
- Verified locally with 1,571 tests, lint, typecheck, production build, package contents and a clean dependency audit. Provider edits must be saved or explicitly discarded before Resume; late action responses reconcile with server state and remain bound to their original project.

## 2026-09-09 - release 0.5.0
key: release/0.5.0
- The interactive first-video tutorial ships as 0.5.0, following the 0.4.3 first-run fixes. The guide is available from Tutorial in the navigation and from the empty Projects page.
- Includes preserved prompt and Play drafts, spotlight interaction with the actual controls, and the API-key-to-video walkthrough. The tutorial commit passed Linux and Windows CI before the version bump.

## 2026-09-09 - interactive first-video tutorial
key: web/interactive-tutorial
- Added a guide users can open from Tutorial in the navigation or Start tutorial on an empty Projects page.
- Eighteen steps walk through API keys, a saved voice, article and image prompts, `{{keyword}}` syntax, Play configuration, explicit generation, stage progress and video download. Copyable examples explain shared keywords and how image prompts use them.
- A spotlight dims the page around each real section, leaving its controls and select menus usable. It follows navigation, scrolling and resizing, supports keyboard interaction and provides Back, Skip and Exit.
- Progress waits for successful saves and actual project creation. The guide stores completion flags and resource IDs in memory, never API keys, and never submits a generation request itself.
- Prompt and Play drafts stay in memory across guide navigation. Pending saves finish before the guide advances; accepted generation clears Play for the next video.
- Verified with 1,496 tests, lint, typecheck and a production build. The complete Chrome walkthrough passes at 1440px and 1024px; narrow-screen scrolling and app dialogs were also checked using simulated API responses and no provider generation calls.

## 2026-09-09 - 0.4.3 repairs first-run generation failures
key: release/0.4.3
- Missing ffmpeg downloads are recovered with the existing ffmpeg-static installer into the app's data directory and verified before any provider work starts. Explicit overrides are checked without being replaced; download failures leave no completed cache entry.
- Claude Code content calls use a writing and research system prompt with personal coding customizations disabled, while retaining subscription login and managed policy.
- Google Interactions string error codes are parsed correctly. Explicitly zero image quota fails once with account/quota guidance; temporary limits honor Google's retry delay.
- Verified with 1,460 tests, lint, typecheck, production build, package contents and a real ffmpeg recovery download. Added Windows CI for startup, recovery and the real-render smoke.

## 2026-09-03 - the marketing page grows an install path
key: site/install-steps
- User: "we need to add npm i -g @gentbajko/slopify / slopify in the marketing page too as another option", after asking whether an alias could stand in for the npx command.
- No alias was needed or added: the package already declares `bin: {slopify: dist/edge/cli.js}`, so a global install puts a real `slopify` on the path. That works in any shell, in a script, and on PowerShell where a bash alias does nothing, and it answers no prompt because nothing is fetched at run time. An alias would have been the weakest of the three routes and the one most likely to generate support questions.
- `npx` stays the hero command: nothing to install is the right first impression. The global install sits under How to use as the line for anyone who will run it more than once, with `--yes` documented on the npx step for the prompt npm shows the first time.
- A Node step was added ahead of both, since npm arrives with Node and neither command works without it. The four routes first went in as one run-on sentence, which the user called mixed, and are now one labelled row per platform - Windows, macOS, Linux - so a reader takes their own line rather than parsing all of them.
- The two new copy buttons give up the accent fill. Green marks the one thing the page asks you to press, and three of them is none; they carry a `--line2` outline instead. The override had to move below `.key` in the file, because both are a single class and source order is what decides.
- The copy status line said "Install command copied" whatever was pressed. With three buttons it now names the command it copied.
- Verified after: 1446 tests across 135 files, lint clean on 409, typecheck clean; the rundown was rendered locally and read at each revision rather than reasoned about.

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
