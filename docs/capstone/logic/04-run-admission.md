---
absorbed_from:
  - features/2026-09-09-pausable-optional-runs@2026-09-10
  - features/2026-09-10-subtitles-fonts@2026-09-10
  - features/2026-09-10-play-redesign-drafts@2026-09-13
  - features/2026-09-10-review-checkpoints@2026-09-13
scenario: run-admission
mockup_row: S2
screens:
  - 06-play
  - 08-project
depends_on:
  - 01-pipeline-lifecycle
  - 02-provider-credentials
  - 03-placeholder-substitution
generated_at_commit: d83482c1175e
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: 315abec08507
paths_covered:
  - ":(top)packages/app/src/slices/play-drafts/**"
  - ":(top)packages/app/src/slices/admission/**"
  - ":(top)packages/app/src/slices/batch/**"
  - ":(top)packages/app/src/slices/channels/runs.ts"
  - ":(top)packages/app/src/slices/schedules/scheduler.ts"
  - ":(top)packages/app/src/edge/http/project-create.ts"
  - ":(top)packages/app/src/edge/http/planning.ts"
  - ":(top)packages/app/src/edge/http/drafts.ts"
  - ":(top)packages/web/src/play/**"
  - ":(top)packages/web/src/routes/play.tsx"
  - ":(top)packages/app/src/slices/subtitles/model.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-checkpoints.ts"
  - ":(top)packages/app/src/kernel/db/migrations/0006-play-drafts.sql"
  - ":(top)packages/app/src/slices/schedules/prepare.ts"
  - ":(top)packages/app/src/edge/http/schedules.ts"
---

# 04 Run admission

Play saves an editable draft before any project exists. The server reviews that exact saved version (rules, templates, channel branding, model/provider readiness, estimate) and stores a UUID-bound review; Start admits exactly the reviewed runs: one project, a sequential batch, or (Queue off) several projects started side by side. Existing-project Save/Rebuild is a separate workflow (12 Reruns and edits).

## Trigger & preconditions

- Entry points: Play Start `POST /api/drafts/:id/review` then `POST /api/drafts/:id/start` (`packages/app/src/edge/http/drafts.ts:113`, `packages/app/src/edge/http/drafts.ts:125`); a scheduled run, which creates a draft from the template, reviews it and starts it, unless a project prepared ahead for it exists (`packages/app/src/slices/schedules/scheduler.ts:171`); Schedules → a topic → Prepare, which makes that project ahead of its day (`prepareTopic`, `packages/app/src/slices/schedules/prepare.ts:65`, route `packages/app/src/edge/http/schedules.ts:220`); `POST /api/projects` with a whole draft, also used by onboarding's quick short (`createProject`, `packages/app/src/edge/http/project-create.ts:27`); `POST /api/projects/batch` (`packages/app/src/edge/http/planning.ts:85`).
- Play is one page: Title and keywords, Article, Narration, Images, Video and style, Outputs, Reviews and Channel are folded summary rows opened in place; review, estimate and the Start key sit in the right rail (`packages/web/src/play/setup-rows.ts:13`, `packages/web/src/routes/play.tsx:65`). With Article Off the Narration row is hidden (`packages/web/src/routes/play.tsx:417`).
- Opening, editing, autosaving and reviewing never start generation. Start requires a valid review of the page's current generation and no pending active upload (`packages/web/src/play/review-state.ts:216`).
- `POST /api/projects` and the batch endpoint refuse a draft with checkpoints (409): checkpoints need Play's review-and-start (`packages/app/src/edge/http/project-create.ts:30`, `packages/app/src/edge/http/planning.ts:92`).

## Steps

1. Fresh draft defaults: Research Off, Article/Audio/Images/Video Generate, Thumbnail Off, Document absent (Off), 16:9, empty title/prompts/keywords, intro/outro "", chunking `whole`, subtitles Off/English/default font/size 48, seconds per image 15, edge silence 2, zoom 22.5 %, motion `zoom`, show figures on, pronunciation glossary/shared glossary/aliases/describe figures on, expected words 1500 (`packages/web/src/play/draft-state.ts:18`, `packages/app/src/slices/admission/rules.ts:45`, `packages/app/src/slices/subtitles/model.ts:34`). Provider rows start with the first-launch defaults when any were found (`withProviderDefaults`, `packages/web/src/play/draft-state.ts:80`). Incomplete raw values are saved.
2. Browser normalisation mirrors the server: Article not Generate forces Research Off; Images Off forces Video Off; Audio Off forces subtitles Off; Video Off turns burn-in captions into files (`normalizePlayForm`, `packages/web/src/play/draft-state.ts:97`; `normaliseDraft`, `packages/app/src/slices/admission/rules.ts:210`). Server normalisation also trims title and keyword values and drops intro/outro unless Audio is Generate (`packages/app/src/slices/admission/rules.ts:224`).
3. Review is requested automatically on mount and 800 ms after edits pause, when nothing local blocks it (`packages/web/src/play/start-rail.tsx:69`). The client first refreshes provider/model choices and flushes the draft (`packages/web/src/play/review-state.ts:158`).
4. Server review (`reviewDraft`, `packages/app/src/slices/play-drafts/review.ts:78`): refuse when a start is pending/finished or the base version differs (`packages/app/src/slices/play-drafts/review.ts:139`); resolve inputs (`resolveReviewInputs`, `packages/app/src/slices/play-drafts/review-inputs.ts:48`): font upload must be finished; expected words integer 1–100000; at most 49 variants (50 videos); apply the channel's brand kit and cast (`packages/app/src/slices/channels/runs.ts:21`, `packages/app/src/slices/channels/runs.ts:37`); pick template bodies; run `admit` per video with variant fields prefixed `Video N:`; check models against a captured catalogue; resolve and hash the subtitle font; compute estimates; reject checkpoints before a stage that is not Generate (Video checkpoint needs video or audio on) (`packages/app/src/slices/play-drafts/review-inputs.ts:188`); build the checkpoint set.
5. `admit` rules (`packages/app/src/slices/admission/rules.ts:96`): title 1–200 chars; each source must be in `allowedSources` — research/article/audio/images `off|generate|provide`, thumbnail `off|from_prompt|prompt_by_llm|provide`, video/document `off|generate` (`packages/app/src/slices/admission/rules.ts:86`); an LLM choice whenever `llmUses` lists a use (research, article, speaker attribution, narration preparation, LLM intro/outro, LLM thumbnail prompt, YouTube description, shorts) (`packages/app/src/slices/admission/rules.ts:407`); article prompt when Article Generate; TTS provider/model/voice when Audio Generate; 1–20 images per prompt, total ≤ 60 (`packages/app/src/slices/admission/rules.ts:240`); image provider when images, generated thumbnail, shorts or animation need one; thumbnail prompt for generated thumbnails; keyword values required, ≤ 200 chars, single line (`packages/app/src/slices/admission/rules.ts:368`); silence gap 0–30 s; seconds per image 1–600 integer and zoom 0–50 in 0.5 steps only while Video Generate; edge silence 0–30 in 0.5 steps unless Audio Off (`packages/app/src/slices/admission/rules.ts:63`).
6. Dependent-feature rules: subtitles, YouTube description and shorts need narration (`packages/app/src/slices/admission/rules.ts:159`, `packages/app/src/slices/admission/rules.ts:481`, `packages/app/src/slices/admission/rules.ts:531`); narration preparation needs Inworld TTS-2 (`packages/app/src/slices/admission/rules.ts:438`); Article Off forbids generated narration, the PDF, an LLM thumbnail prompt, captions, YouTube description, shorts and scenes-from-article (`articleOffFields`, `packages/app/src/slices/admission/rules.ts:642`); short mode requires 9:16, Video Generate, narration and images on, thumbnail/document Off and Shorts off (`shortModeFields`, `packages/app/src/slices/admission/short-mode.ts:16`); provided files must be staged and complete (see 05 Provided outputs).
7. Model readiness: after the font lookup and the runtime model check the inputs are resolved again without the font and must bind to the same inputs as the first, fontless resolve, else `stale-review`; the fontless comparison keeps a review with burned-in captions and a Before Video checkpoint from always reading as stale (`packages/app/src/slices/play-drafts/review.ts:44`, `packages/app/src/slices/play-drafts/review.ts:67-75`). The review row is written only while the draft is `active` at the base version; an unchanged fingerprint returns the existing review (`packages/app/src/slices/play-drafts/review.ts:100`, `packages/app/src/slices/play-drafts/review.ts:118`).
8. Start posts draft ID, base version and review ID (`packages/app/src/slices/play-drafts/start.ts:21`). The server replays a committed receipt first, then claims the draft `active` → `starting` (`packages/app/src/slices/play-drafts/start.ts:32`), rechecks provider readiness against the review's catalogue snapshot (`checkDraftReadiness`, `packages/app/src/slices/play-drafts/readiness.ts:59`), and in one transaction repeats local readiness (models, CLI path unchanged, API key present, voice saved; `packages/app/src/slices/play-drafts/readiness.ts:102`), creates one project, one queue entry and project per run, or (Queue off) one directly started project per run, admits checkpoints, writes the receipt and marks the draft `started` (`packages/app/src/slices/play-drafts/start.ts:127`).
9. After commit: record the start, release the draft's staged files, pump the queue for a batch or tick each project (`packages/app/src/slices/play-drafts/start.ts:114`). The client clears the draft and navigates to the first created project (`packages/web/src/routes/play.tsx:147`).

## Branches

- One reviewed run starts directly. More than one enters the batch queue, which runs one project at a time, unless the draft's `queue` is `false` (Play's Queue switch, shown only for more than one video; an absent value reads as queued): then every run is started at once as its own project (`packages/app/src/slices/play-drafts/start.ts:148-157`, `packages/app/src/slices/play-drafts/schema.ts:240`, `packages/app/src/slices/batch/index.ts:83`, `packages/web/src/play/start-rail.tsx:100-112`). The rail shows "Start run", "Queue N videos" or "Start N videos" (`startLabel`, `packages/web/src/play/review-state.ts:279-289`).
- A scheduled run first looks for a project to continue (`preparedProject`, `packages/app/src/slices/schedules/prepare.ts:135-165`): the newest prepared project for that schedule and filled title that is not trashed or canceled, else (only for a run with a topic) the newest untrashed project of the same title that has not ended (`done`/`partial`/`failed`/`canceled`). Found → `continuePrepared` drops the Before Video checkpoint the preparation added (a template's own stays), deletes the `prepared_videos` row, ticks the project, and the run is recorded `succeeded` with that project, with no review, estimate or spend-limit check (`packages/app/src/slices/schedules/prepare.ts:170-186`, `packages/app/src/slices/schedules/scheduler.ts:179-192`).
- Prepare (`prepareTopic`, `packages/app/src/slices/schedules/prepare.ts:65-112`) builds the same draft the day would (`scheduledDocument`, `:31-54`), refuses `already-prepared` when one exists, adds a Before Video checkpoint when the video is Generate and none is set (`heldBeforeVideo`, `:116-127`), reviews, applies the schedule's spend limit, starts it and records a `prepared_videos` row; a review refusal returns its field messages as `detail`.
- Checkpoints (Audio, Images, Video) are saved `held` with the reviewed start and hold only their closure (`packages/app/src/slices/rebuild/runtime-checkpoints.ts:10`).
- A scheduled run refuses dispatch with `spend-limit` when any estimate is unknown or the high estimate exceeds the schedule's limit (`packages/app/src/slices/schedules/scheduler.ts:198`).
- The channel is the one picked on Play, else the template's, else the default; its brand kit fills only values left at default unless "Use the channel's brand kit" is off; the channel language applies either way (`packages/app/src/slices/channels/runs.ts:21`, `packages/app/src/slices/channels/runs.ts:37`).
- A saved choice missing from the option list stays selectable as "(saved choice)"; nothing is silently substituted (`packages/web/src/play/pickers.tsx:114`).
- Refused fields open the row that owns them and focus the control; untouched fields show no error until a refusal or touch (`packages/web/src/routes/play.tsx:193`, `packages/web/src/routes/play.tsx:246`).

## Unhappy paths

- Invalid or missing active input: typed field errors, no project (`packages/app/src/slices/play-drafts/review-inputs.ts:32`).
- Edited after review: the client invalidates the review; the server returns `stale-review` for a version, fingerprint or review-ID mismatch (`packages/web/src/routes/play.tsx:118`, `packages/app/src/slices/play-drafts/start.ts:54`).
- Review's run count differs from the page's video count: the page is saved again and must be reviewed afresh (`packages/web/src/play/review-state.ts:190`).
- Start transport failure: the button becomes "Check Start result"; recovery reads the draft and adopts its committed start; `pending-start`/`already-started` also recover rather than resubmit (`packages/web/src/play/review-state.ts:249`, `packages/web/src/play/review-state.ts:257`).
- Readiness fails at Start: the claim is released and fields returned; created runs not matching the reviewed count (or a queue length other than the run count when queued, zero otherwise) throw `StartedRunMismatch`, roll back and return `stale-review` (`packages/app/src/slices/play-drafts/start.ts:99`, `packages/app/src/slices/play-drafts/start.ts:171-174`).
- A post-commit action failing is logged; the receipt stays authoritative (`packages/app/src/slices/play-drafts/start.ts:180`).
- Save conflict: status `conflict` offers Reload saved draft or Save as a new draft (`packages/web/src/play/draft-list.tsx:88`).
- Deleted subtitle font at review: `subtitles.fontId` error (`packages/app/src/slices/play-drafts/review.ts:31`).

## State transitions

Draft: `active` → `starting` → `started` (`packages/app/src/kernel/db/migrations/0006-play-drafts.sql:12`); a released claim returns to `active` (`releaseStartClaim`, `packages/app/src/slices/play-drafts/start-repo.ts:149`). A review exists only for an exact saved version and fingerprint. A committed receipt is replayed before any readiness or attachment check (`readStartReceipt`, `packages/app/src/slices/play-drafts/start-repo.ts:51`). Batch queue rows move `queued` → `active` → `finished` (`packages/app/src/slices/batch/index.ts:83`).

## Invariants

- Saving or reviewing never dispatches providers.
- One reviewed Start identity yields its original result, never duplicate projects (`packages/app/src/slices/play-drafts/start.ts:33`).
- Start creates exactly the reviewed number of runs or nothing (`packages/app/src/slices/play-drafts/start.ts:171-174`).
- A scheduled topic makes at most one project: its day continues a prepared or same-title unfinished project instead of starting another (`packages/app/src/slices/schedules/scheduler.ts:179-192`).
- An MP4 needs images; captions, description and shorts need narration; a short is vertical.
- Local admission idempotency is not an exactly-once billing guarantee for external providers.

## Outcomes & side effects

Drafts, reviews and start receipts are SQLite rows; Start creates project, stage, revision and work rows plus copied supplied media, then wakes execution. `POST /api/projects` records a `project.created` telemetry event (`packages/app/src/edge/http/project-create.ts:103`). A scheduled run records its request, estimate and project IDs (`packages/app/src/slices/schedules/scheduler.ts:221`); a continued prepared run records only the project ID (`:189`). See 22 Play drafts and 18 Cost review and batch.

## Dimensions not in play

- Editing an existing project: not part of Play (12 Reruns and edits).
- Recurring clock: configured on Schedules from a template (25 Scheduled jobs).
- Concurrency across tabs: drafts are CAS-versioned rows; no locking beyond version checks (`packages/app/src/slices/play-drafts/review.ts:153`).
- Money moved: none at admission; estimates only.
