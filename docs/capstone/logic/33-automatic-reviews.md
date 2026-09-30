---
scenario: automatic-reviews
screens:
- 02-play
- 03-project
- 04-prompts
depends_on:
- 01-pipeline-lifecycle
- 04-run-admission
- 12-reruns-and-edits
- 15-prompt-management
- 17-subtitles
- 18-cost-review-batch
- 22-play-drafts
- 23-review-checkpoints
- 24-project-templates
- 28-shorts
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: 4de36fc56a6e
paths_covered:
  - ":(top)packages/app/src/slices/reviews/**"
  - ":(top)packages/app/src/slices/rebuild/review-redo.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-reviews.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-review.ts"
  - ":(top)packages/app/src/edge/http/reviews.ts"
  - ":(top)packages/app/src/kernel/db/migrations/0025-automatic-reviews.sql"
  - ":(top)packages/web/src/play/reviews.tsx"
  - ":(top)packages/web/src/project/review-verdict.tsx"
  - ":(top)packages/web/src/project/revision-reviews.tsx"
---

All paths below are relative to `packages/app/src/` unless they start with `packages/`.

## Trigger & preconditions

- Configured per project as `config.reviews` (`ReviewSettings`, `slices/reviews/model.ts:22-31`): one reviewer `provider` + `model` (+ optional `thinking`), optional `retries`, and a per-stage entry `{ mode, prompt? }` for the stages `article`, `images`, `narration`, `thumbnail`, `shorts` (`slices/reviews/model.ts:8`). Modes are `off` ("Off"), `flag` ("Flag only"), `redo` ("Flag and redo") (`slices/reviews/model.ts:13`, `:47-51`). A missing stage entry is `off` (`slices/reviews/model.ts:61-63`).
- Set in Play's Reviews section and Edit project → Reviews, which share one form (`packages/web/src/play/reviews.tsx`, `packages/web/src/project/revision-reviews.tsx:16-19`), and carried by project templates (`slices/project-templates/from-project.ts:238`).
- A stage is reviewed only while it makes something (`stageMakesItems`, `slices/reviews/rules.ts:22-37`): article when `sources.article === "generate"`, images when `sources.images === "generate"`, narration when `sources.audio === "generate"`, thumbnail when `sources.thumbnail` is `from_prompt` or `prompt_by_llm`, shorts when shorts are enabled and audio is not `off`. `activeReviewStages` = stages not `off` that make items (`slices/reviews/rules.ts:39-43`).
- Form → settings: stages that are `off` or make nothing are dropped; none left stores no `reviews` at all (`slices/reviews/model.ts:120-150`, `slices/play-drafts/convert.ts:182-192`). A picked Review prompt is stored by name; blank is the stage's built-in prompt (`slices/reviews/model.ts:18-19`).
- Admission and recipe validation run `reviewFields` (`slices/admission/rules.ts:170`, `slices/rebuild/recipe-validation.ts:30`); Play readiness checks the reviewer as its own LLM row (`slices/play-drafts/readiness.ts:53`).
- The run itself triggers each review: the review is a planned step that runs once the item it reviews is done (see Steps).

## Steps

1. **Validation** (`slices/reviews/rules.ts:60-91`), only when at least one stage is active:
   - Empty provider or model → field `reviews.provider`, "Automatic reviews need a reviewer model…".
   - `retries` set and not an integer in 0–5 (`reviewRetriesMin`/`Max`, `slices/reviews/model.ts:35-37`) → field `reviews.retries`. Non-numeric typed text is caught earlier by the form conversion (`slices/reviews/model.ts:134-149`).
   - Any active vision stage (`images`, `thumbnail`, `shorts`, `slices/reviews/model.ts:54`) with a provider outside `imageReviewers` = `claude-code`, `codex` (`slices/reviews/model.ts:59`) → field `reviews.provider` naming the stages. Play shows the same condition inline (`packages/web/src/play/reviews.tsx:95-96`, `:153-155`).
2. **Library prompts**: each active stage's picked Review prompt (kind `review`) is resolved into `config.rendered["review.<stage>"]` like other prompts (`slices/library/slots.ts:112-122`, `slices/reviews/model.ts:74-76`). The `review` prompt kind was added to the `prompts` CHECK by `kernel/db/migrations/0025-automatic-reviews.sql:4-16`.
3. **Planning** (`withReviews`, `slices/rebuild/recipe-reviews.ts:32-82`, called from `slices/rebuild/recipe-build.ts:51`): with no active stage the recipe list is returned unchanged. Otherwise one step `review:<itemKey>` (`reviewKey`, `slices/reviews/model.ts:81-83`) is added per reviewed item, a local operation `review-v1` whose values are stage, item key, input identities, provider, model, thinking, rendered prompt (blank for built-in), mode and retries, marked `{ kind: "provider" }` so readiness, charge warning and estimate treat it as a paid LLM call (`slices/rebuild/recipe-reviews.ts:41-70`). Items per stage (`slices/rebuild/recipe-reviews.ts:84-126`):

   | Stage | Item key | Inputs | Runs in stage |
   |---|---|---|---|
   | article | `article:body` (provider-made only) | the article | article |
   | images | every `image:*` step whose input is an image | the image, plus `reference:image` when present | images |
   | thumbnail | `thumbnail:image` or `thumbnail:image:N` (provider-made) | the thumbnail | thumbnail |
   | narration | `narration` (`narrationItemKey`) | `subtitles:timing`, plus the article | audio |
   | shorts | `shorts:N` for each `shorts:N:render` | the render | video |

   Stage mapping: `slices/rebuild/recipe-reviews.ts:130-143`.
4. **Gating**: every recipe that depends on one of an item's gate keys gets the review step added to its `dependsOn`, except steps upstream of the review itself (the word timing the narration review reads) (`slices/rebuild/recipe-reviews.ts:71-80`, `:145-157`). The narration gates are the timing step and its own dependencies (`slices/rebuild/recipe-reviews.ts:114-117`). The narration review forces the word-timing step to exist and to run even when captions are off (`slices/rebuild/recipe-exports.ts:43`, `slices/rebuild/runtime-store.ts:56`).
5. **Execution** (`executeReviewRecipe`, `slices/rebuild/runtime-review.ts:51-147`, dispatched from `slices/rebuild/runtime-run.ts:36`):
   - A piece already `done` returns done; `maySubmit` false returns `held` (`:57-63`).
   - Values are parsed against the positional tuple (`:32-42`); a mismatch throws "a review step was set up wrongly" (`:70-73`).
   - Material is gathered per stage (`reviewMaterial`, `:177-337`), texts clipped at 60,000 characters with "[... cut for length]" (`:45`, `:339-341`):
     - article: rendered article prompt, research notes (or provided research), the article (`:214-233`);
     - images/thumbnail: video title (thumbnail only), the image brief, attached image(s) "the image to review"/"the thumbnail to review" and "the establishing image it must match" (`:234-269`);
     - narration: spoken text (intro/body/outro transcripts, else the article's plain text, `:152-169`), what the timing heard, omission gaps with times, count of words with confidence < 0.3 (`:270-303`);
     - shorts: the short's title from `shorts:pick` and up to 6 stills attached (`:304-335`).
   - Attempt number (`nextAttempt`, `slices/reviews/outcome.ts:6-17`): 1 with no earlier verdict; the same item fingerprint keeps the earlier attempt; a previous `redo` outcome with no user action and `redoState` not `failed` gives previous + 1; anything else restarts at 1.
   - One LLM call on the reviewer, web search off, images attached when any, a `check` that rejects answers `parseVerdict` refuses (`slices/rebuild/runtime-review.ts:87-100`). Prompt: system role "quality reviewer of Slopify", material framed as data not instructions, answer rules (`slices/reviews/verdict.ts:19-52`). The instruction is the library prompt or `defaultReviewPrompts[stage]` (`slices/rebuild/runtime-review.ts:209`, `slices/reviews/model.ts:180-191`).
   - Verdict format (`slices/reviews/verdict.ts:7-17`, `:63-95`): exactly `{"verdict":"pass"|"fail","reasons":[...]}`, strict, optionally inside one ```` ```json ```` fence; reasons 1–500 characters each, at most 10; a `fail` with no reason is refused.
   - Outcome (`reviewOutcome`, `slices/reviews/outcome.ts:22-31`): pass → `passed`; fail in `flag` mode → `flagged`; fail in `redo` mode → `redo` while `attempt <= retries`, else `flagged`. Default retries 2 (`slices/reviews/model.ts:35`, `:65-67`).
   - The verdict is saved (`saveVerdict`, `slices/reviews/repo.ts:48-80`) with `redoState: "pending"` when the outcome is `redo` (`slices/rebuild/runtime-review.ts:105-122`), and published as the step's payload `{ verdictId, passed, reasons, outcome, attempt }` (`:123-129`). A `flagged` outcome emits `review.flagged` with the first reason (`:131-139`, `kernel/events.ts:71-83`). Usage is counted as `stage.completed` (`:140-145`).
6. **Hold while a redo waits** (`reviewHold`, `slices/rebuild/review-redo.ts:18-42`, wired as the checkpoint authority's first decision in `main.ts:891-895`): work in the same revision that contains a key in the review step's dependent closure is `held` with checkpoint ids `review:<verdictId>` while that verdict's `redo_state` is `pending`.
7. **Automatic redo** (`createReviewRedos`, `slices/rebuild/review-redo.ts:49-90`): `kick` runs after every finished work item of a project (`main.ts:364-369`) and once at boot for all projects (`main.ts:486-487`). For each `pending` verdict not already in flight it calls `startRedo` → `makeAgain` (`:100-128`): `recoverProject` with the current head as base, a stable idempotency key per verdict (`redoKey`, sha256 of `review-redo:<id>` shaped as a UUID, `:132-135`), action `{ kind: "redo", item }`, and `pendingSuperseded: true` so admitted-but-unstarted work does not block it (`slices/rebuild/recovery-conflict.ts:12-33`). Success sets `redo_state = 'started'`; refusal sets `failed` with `redoRefusal` text (`:137-150`). A `project.updated` event is emitted; the runner is ticked in `finally` (`:74-81`). The redone item is a new project version whose new review step starts at attempt+1 (Step 5).
8. **Project page** (`GET /api/projects/:id/reviews`, `edge/http/reviews.ts:45-57`): each item's latest verdict (`latestReviews`, `slices/reviews/view.ts:22-47`) with `current` true only when the verdict's item fingerprint matches the selected output of `reviewedOutputKey(itemKey)` (`subtitles:timing` for narration, `shorts:N:render` for a short, else the item key, `slices/reviews/view.ts:5-9`), its `outputId`, and the count of verdicts for the item. The web client keeps only `current` ones (`packages/web/src/project/review-verdict.tsx:15-22`) and shows a badge (`:35-54`) and reasons with "Try N" or "Kept after N tries: the redo limit was reached." (`:60-82`) beside the article, images and thumbnail sections (`packages/web/src/project/body-article.tsx:45`, `body-images.tsx:535-543`, `body-thumbnail.tsx:184-192`).
9. **Overrule** (`POST /api/projects/:id/reviews/:verdictId/overrule`, `edge/http/reviews.ts:58-86`): refused 409 when `redoStarting(verdictId)` (`slices/rebuild/review-redo.ts:94-98`). `actOnVerdict` (`slices/reviews/repo.ts:161-185`) sets `action = 'overruled'`, `action_at`; for a `pending` redo it also clears `redo_state` in the same guarded UPDATE, releasing held work. The runner is ticked and `project.updated` emitted.
10. **Redo by hand** (`POST /api/projects/:id/reviews/:verdictId/redo`, body `revisionControlSchema`, `edge/http/reviews.ts:87-119`): `recoverProject` with action `{ kind: "redo", item: verdict.itemKey }` (the same path as More → make it again), then `actOnVerdict(..., "redone")`; 202 with the recovery result. The web client sends the page's `revisionId` as base and a fresh UUID idempotency key (`packages/web/src/project/review-verdict.tsx:99-111`).

## Branches

- All stages `off` or none making items → no review steps, no gating, no validation; the project plans as one without reviews (`slices/rebuild/recipe-reviews.ts:37-38`, `slices/reviews/rules.ts:63`).
- Library prompt picked vs blank → rendered prompt vs built-in `defaultReviewPrompts` (`slices/rebuild/recipe-reviews.ts:57-61`, `slices/rebuild/runtime-review.ts:209`).
- Images stage with an establishing image (`reference:image`) → it is an input and attached; without, only the image (`slices/rebuild/recipe-reviews.ts:98-103`, `slices/rebuild/runtime-review.ts:246-266`).
- Thumbnail stage making three thumbnails → three review steps (`slices/rebuild/recipe-reviews.ts:104-108`).
- Mode `flag` → never redone; mode `redo` → redone while attempts ≤ retries (`slices/reviews/outcome.ts:28-30`). With retries 0 a failure is flagged at once.
- Thinking set → `thinkingConfig` from the saved catalogue entry for provider+model, else null (`slices/rebuild/runtime-review.ts:82-91`).
- Overrule on a `pending` redo → calls it off; on no redo → records the action only (`slices/reviews/repo.ts:172-182`).
- UI buttons (`packages/web/src/project/review-verdict.tsx:119-145`): hidden when the verdict passed or already has an action; Overrule disabled while `redoState === "started"` or while the project is busy unless a redo is waiting; Redo disabled while busy or while a redo is pending/started.

## Unhappy paths

- Malformed/empty/non-JSON verdict → `check` rejects, the provider wrapper retries like any failed attempt; if the final answer still fails parsing the step throws the reason, which ends with "choose another reviewer model in Edit project → Reviews, then use Try again" (`slices/reviews/verdict.ts:58-95`, `slices/rebuild/runtime-review.ts:96-103`).
- Provider call not ok → step returns `held` (`slices/rebuild/runtime-review.ts:101`).
- Reviewed output missing on disk or not selected → throws "The <what> this review looks at is missing…" with the stage-specific fix (`slices/rebuild/runtime-review.ts:200-203`, `:216-217`, `:237-243`, `:272-276`, `:306-307`, `:324-325`).
- Same review step asked again (retried step whose answer was saved but not published) → upsert on `(project_id, review_fingerprint)` replaces the answer and clears `action`, `action_at`, `redo_error` (`slices/reviews/repo.ts:46-55`, `kernel/db/migrations/0025-automatic-reviews.sql:37`). A save that cannot be read back throws an internal-error sentence (`slices/reviews/repo.ts:74-79`).
- Automatic redo refused: `running` → "work that depends on it was already running. Use Redo beside it once the run has finished."; `readiness` → the field messages + "Fix that in Settings → Providers"; `conflict`/`control-changed` → "the project changed at the same moment (an edit, Pause or Cancel)"; other → generic (`slices/rebuild/review-redo.ts:137-150`). The verdict stays flagged-with-error (`redo_state = 'failed'`) and held work is released because only `pending` verdicts hold (`slices/rebuild/review-redo.ts:24-27`). An exception sets `failed` with an internal-error sentence and is logged as `review.redo` (`:62-73`). A deleted project → `failed`, "The project no longer exists." (`:110-114`).
- App restart between a verdict and its redo → boot `kick` starts the pending redo; the stable idempotency key returns the first attempt's answer if it already ran (`main.ts:486-487`, `slices/rebuild/review-redo.ts:130-135`). The in-memory `running`/`starting` sets are not persisted (`slices/rebuild/review-redo.ts:54`, `:94`).
- Overrule while a redo is being started or already started → 409 "This verdict can't be overruled: it passed, or Slopify has already started making the item again…"; overrule of a passed verdict → same 409 (`edge/http/reviews.ts:60-77`, `slices/reviews/repo.ts:170-179`). Unknown verdict id → 404 "This review no longer exists…" (`edge/http/reviews.ts:27-33`).
- Manual Redo: rebuild service not yet bound → 503 "Redo is not ready yet…" (`edge/http/reviews.ts:95-101`); redo pending/started → 409 (`:102-109`); recovery refused → 404/400/409 with a lead sentence per reason (`running`, `readiness`, `conflict`/`control-changed`, `invalid-selection`) plus field messages and `currentRevisionId` (`:121-151`).
- Sample project → overrule/redo POSTs are refused 409 `sample-read-only` by the project-route guard (`edge/http/app.ts:277-292`, `:326`).
- A verdict about an output since replaced is `current: false` and hidden from the page (`slices/reviews/view.ts:11-14`, `packages/web/src/project/review-verdict.tsx:21`).
- A redone item that keeps failing: attempts count up until `attempt > retries`, then it is kept and flagged (`slices/reviews/outcome.ts:19-21`).

## State transitions

`review_verdicts` row (`kernel/db/migrations/0025-automatic-reviews.sql:20-40`):

| From | Event | To | Where |
|---|---|---|---|
| (none) | review answered | `outcome` passed / flagged / redo; `redo_state` null or `pending` | `slices/rebuild/runtime-review.ts:104-122` |
| `redo_state = pending` | automatic redo accepted | `started` | `slices/rebuild/review-redo.ts:125` |
| `redo_state = pending` | redo refused / threw / project gone | `failed` + `redo_error` | `slices/rebuild/review-redo.ts:67-72`, `:112`, `:126` |
| `redo_state = pending` | Overrule | `action = overruled`, `redo_state` null | `slices/reviews/repo.ts:172-179` |
| failed verdict, no pending/started redo | Overrule | `action = overruled` | `slices/reviews/repo.ts:181` |
| any verdict without pending/started redo | manual Redo accepted | `action = redone` | `edge/http/reviews.ts:115` |
| any | same review fingerprint re-answered | row replaced, action cleared | `slices/reviews/repo.ts:52-55` |

Forbidden: overruling a passed verdict; overruling or redoing while `redo_state = started`; a manual Redo while `pending` (`slices/reviews/repo.ts:170-174`, `edge/http/reviews.ts:102-109`). Rows cascade-delete with their project (`kernel/db/migrations/0025-automatic-reviews.sql:22`).

## Invariants

- A stubborn item never loops: at most `retries` automatic redos per item chain, then flagged (`slices/reviews/outcome.ts:19-31`).
- One verdict per review step fingerprint per project (`kernel/db/migrations/0025-automatic-reviews.sql:37`).
- Dependents of a reviewed item never run before its review has answered (`slices/rebuild/recipe-reviews.ts:27-31`), and never run on an item whose redo is still pending (`slices/rebuild/review-redo.ts:15-17`).
- A redo already under way owns the item; Overrule cannot cancel it (`slices/reviews/repo.ts:157-160`, `edge/http/reviews.ts:68-69`).
- A flagged item is kept; the run continues past it (`kernel/events.ts:71-73`, `slices/rebuild/runtime-review.ts:130`).
- The reviewer's material is presented as data, never instructions (`slices/reviews/verdict.ts:40`).
- Pictures are only sent to `claude-code` or `codex` (`slices/reviews/model.ts:56-59`, `slices/reviews/rules.ts:80-89`).

## Outcomes & side effects

- Passed: badge "Review passed" (or "Redone after review" when attempt > 1) (`packages/web/src/project/review-verdict.tsx:39-42`); run continues.
- Flagged: item kept, `review.flagged` event; the notifier turns it into "Review needs a decision: <title> — <reason>" telling the user to press Overrule or Redo (`slices/notifications/notifier.ts:107-110`, `slices/notifications/rules.ts:39-65`).
- Redo: a new project version regenerating the item and its dependents through the recovery path (see 12-reruns-and-edits.md).
- Cost: one LLM call per reviewed item per attempt. The pre-run estimate adds one "Reviews" request per item (images count, shorts count, else 1) with input = prompt length + material (article: article + prompt chars; narration: 2.1 × article chars; others: 1,500) + 800 and output 400; redos are stated as not priced (`slices/estimate/index.ts:382-406`).

## Dimensions not in play

- Money beyond provider calls: none.
- Multi-user permissions: none; any caller of the local API may overrule or redo.
- Time limits on a pending decision: none; a flagged item waits indefinitely.
- Reviewing research, document, description, video render: not implemented; only the five stages exist (`slices/reviews/model.ts:8`).
- Audio listening by the reviewer: absent; the narration review reads the word timing's transcript, not audio.
