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
- 49-promise-check
- 50-in-app-assistant
generated_at_commit: d6a72d6428ff
generated_date: 2026-10-18
capstone_version: 7.0.1
content_hash: 3dc9700c7548
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
  - ":(top)packages/app/src/slices/rebuild/runtime-agent-review.ts"
  - ":(top)packages/app/src/edge/http/external-reviews.ts"
  - ":(top)packages/app/src/kernel/db/migrations/0055-external-reviews.sql"
  - ":(top)packages/app/src/kernel/db/migrations/0059-external-review-canceled.sql"
  - ":(top)packages/app/src/kernel/db/migrations/0065-promise-and-assistant-reviews.sql"
  - ":(top)packages/app/src/slices/rebuild/review-promise.ts"
absorbed_from:
  - features/2026-09-30-slopify-mcp@2026-10-11
---

All paths below are relative to `packages/app/src/` unless they start with `packages/`. Since 4.0 there are six stages: the promise check (49-promise-check.md) reads the article's opening before the narration, and the in-app assistant (50-in-app-assistant.md) can Overrule and Redo as itself but never answers an external review.

## Trigger & preconditions

- Configured per project as `config.reviews` (`ReviewSettings`, `slices/reviews/model.ts:56-68`): one reviewer `provider` + `model` (+ optional `thinking`), optional `retries`, and a per-stage entry `{ mode, prompt? }` for the stages `article`, `images`, `narration`, `thumbnail`, `shorts` and `promise` (`slices/reviews/model.ts:12-19`; the Reviews rows list them in run order, article, promise, images, narration, thumbnail, shorts, `:21-29`). Modes are `off` ("Off"), `flag` ("Flag only"), `redo` ("Flag and redo") (`slices/reviews/model.ts:33`, `:85-89`). A missing stage entry is `off` (`slices/reviews/model.ts:99-101`).
- Who answers is the reviewer choice **Model** or **External agent (MCP)** (`reviewers`, `reviewerLabels`, `slices/reviews/model.ts:36-48`), stored as `reviewer: "agent"` only for the agent; absent is the model, so saved projects and their steps stay as they were (`slices/reviews/model.ts:61-63`, `reviewedByAgent` `:107-109`). The Reviews form shows the choice above the reviewer model (`packages/web/src/play/reviews.tsx:98`, `:117-124`). With the agent, provider and model are unused: validation asks for no reviewer model and no picture-capable reviewer (`slices/reviews/rules.ts:67-92`), Play readiness asks for no reviewer row (`slices/play-drafts/readiness.ts:59`), and every stage, the picture stages included, may be reviewed.
- Set in Play's Reviews section and Edit project → Reviews, which share one form (`packages/web/src/play/reviews.tsx`, `packages/web/src/project/revision-reviews.tsx:16-19`), and carried by project templates (`slices/project-templates/from-project.ts:239`).
- A stage is reviewed only while it makes something (`stageMakesItems`, `slices/reviews/rules.ts:23-39`): article and promise when `sources.article === "generate"`, images when `sources.images === "generate"`, narration when `sources.audio === "generate"`, thumbnail when `sources.thumbnail` is `from_prompt` or `prompt_by_llm`, shorts when shorts are enabled and audio is not `off`. `activeReviewStages` = stages not `off` that make items (`slices/reviews/rules.ts:41-45`).
- Form → settings: stages that are `off` or make nothing are dropped; none left stores no `reviews` at all (`slices/reviews/model.ts:160-191`, `slices/play-drafts/convert.ts:183-193`). A picked Review prompt is stored by name; blank is the stage's built-in prompt (`slices/reviews/model.ts:50-54`).
- Admission and recipe validation run `reviewFields` (`slices/admission/rules.ts:178`, `slices/rebuild/recipe-validation.ts:40`); Play readiness checks the reviewer as its own LLM row (`slices/play-drafts/readiness.ts:53`).
- The run itself triggers each review: the review is a planned step that runs once the item it reviews is done (see Steps).

## Steps

1. **Validation** (`slices/reviews/rules.ts:62-94`), only when at least one stage is active:
   - Empty provider or model → field `reviews.provider`, "Automatic reviews need a reviewer model…".
   - `retries` set and not an integer in 0–5 (`reviewRetriesMin`/`Max`, `slices/reviews/model.ts:73-74`) → field `reviews.retries`. Non-numeric typed text is caught earlier by the form conversion (`slices/reviews/model.ts:174-190`).
   - Any active vision stage (`images`, `thumbnail`, `shorts`, `slices/reviews/model.ts:92`) with a provider outside `imageReviewers` = `claude-code`, `codex` (`slices/reviews/model.ts:97`) → field `reviews.provider` naming the stages. Play shows the same condition inline (`packages/web/src/play/reviews.tsx:95-96`, `:153-155`).
2. **Library prompts**: each active stage's picked Review prompt (kind `review`) is resolved into `config.rendered["review.<stage>"]` like other prompts (`slices/library/slots.ts:110-118`, `slices/reviews/model.ts:111-114`). The `review` prompt kind was added to the `prompts` CHECK by `kernel/db/migrations/0025-automatic-reviews.sql:4-16`.
3. **Planning** (`withReviews`, `slices/rebuild/recipe-reviews.ts:34-117`, called from `slices/rebuild/recipe-build.ts:90`): with no active stage the recipe list is returned unchanged. Otherwise one step `review:<itemKey>` (`reviewKey`, `slices/reviews/model.ts:122-124`) is added per reviewed item, a local operation `review-v1` whose values are stage, item key, input identities, provider, model, thinking, rendered prompt (blank for built-in), mode and retries, marked `{ kind: "provider" }` so readiness, charge warning and estimate treat it as a paid LLM call (`slices/rebuild/recipe-reviews.ts:49-105`). A template studio sample reviews each stage's first item only (`:42-47`). Items per stage (`slices/rebuild/recipe-reviews.ts:119-172`):

   | Stage | Item key | Inputs | Runs in stage |
   |---|---|---|---|
   | article | `article:body` (provider-made only) | the article | article |
   | promise | `promise` (provider-made article only; 49-promise-check.md) | the article, plus `thumbnail:prompt` when a model writes the thumbnail brief | article |
   | images | every `image:*` step whose input is an image | the image, plus `reference:image` when present | images |
   | thumbnail | `thumbnail:image` or `thumbnail:image:N` (provider-made) | the thumbnail | thumbnail |
   | narration | `narration` (`narrationItemKey`) | `subtitles:timing`, plus the article | audio |
   | shorts | `shorts:N` for each `shorts:N:render` | the render | video |

   Stage mapping: `slices/rebuild/recipe-reviews.ts:176-190`.
4. **Gating**: every recipe that depends on one of an item's gate keys gets the review step added to its `dependsOn`, except steps upstream of the review itself (the word timing the narration review reads; the thumbnail brief the promise check reads) (`slices/rebuild/recipe-reviews.ts:106-115`, `:192-204`). The article and promise reviews gate on the article step itself; the narration gates are the timing step and its own dependencies (`slices/rebuild/recipe-reviews.ts:133-165`). The narration review forces the word-timing step to exist and to run even when captions are off (`slices/rebuild/recipe-exports.ts:47`, `slices/rebuild/runtime-store.ts:57`).
5. **Execution** (`executeReviewRecipe`, `slices/rebuild/runtime-review.ts:53-147`, dispatched from `slices/rebuild/runtime-run.ts:50-53`):
   - A piece already `done` returns done; `maySubmit` false returns `held` (`:57-63`).
   - Values are parsed against the positional tuple (`:32-42`); a mismatch throws "a review step was set up wrongly" (`:70-73`).
   - Material is gathered per stage (`reviewMaterial`, `:177-337`), texts clipped at 60,000 characters with "[... cut for length]" (`:45`, `:339-341`):
     - article: rendered article prompt, research notes (or provided research), the article (`:214-233`);
     - promise: the video title, the thumbnail brief, the opening (first ~30 s of the spoken article) and the whole article (`:240-259`; 49-promise-check.md);
     - images/thumbnail: video title (thumbnail only), the image brief, attached image(s) "the image to review"/"the thumbnail to review" and "the establishing image it must match" (`:234-269`);
     - narration: spoken text (intro/body/outro transcripts, else the article's plain text, `:152-169`), what the timing heard, omission gaps with times, count of words with confidence < 0.3 (`:270-303`);
     - shorts: the short's title from `shorts:pick` and up to 6 stills attached (`:304-335`).
   - Attempt number (`nextAttempt`, `slices/reviews/outcome.ts:6-17`): 1 with no earlier verdict; the same item fingerprint keeps the earlier attempt; a previous `redo` outcome with no user action and `redoState` not `failed` gives previous + 1; anything else restarts at 1.
   - One LLM call on the reviewer, web search off, images attached when any, a `check` that rejects answers `parseVerdict` refuses (`slices/rebuild/runtime-review.ts:87-100`). Prompt: system role "quality reviewer of Slopify", material framed as data not instructions, answer rules (`slices/reviews/verdict.ts:19-52`). The instruction is the library prompt or `defaultReviewPrompts[stage]` (`slices/rebuild/runtime-review.ts:215`, `slices/reviews/model.ts:224-237`).
   - Verdict format (`slices/reviews/verdict.ts:7-17`, `:63-95`): exactly `{"verdict":"pass"|"fail","reasons":[...]}`, strict, optionally inside one ```` ```json ```` fence; reasons 1–500 characters each, at most 10; a `fail` with no reason is refused.
   - Outcome (`reviewOutcome`, `slices/reviews/outcome.ts:22-31`): pass → `passed`; fail in `flag` mode → `flagged`; fail in `redo` mode → `redo` while `attempt <= retries`, else `flagged`. Default retries 2 (`slices/reviews/model.ts:72`, `:103-105`).
   - The verdict is saved (`saveVerdict`, `slices/reviews/repo.ts:54-86`) with `redoState: "pending"` when the outcome is `redo` (`slices/rebuild/runtime-review.ts:105-122`), and published as the step's payload `{ verdictId, passed, reasons, outcome, attempt }` (`:123-129`). A `flagged` outcome emits `review.flagged` with the first reason (`:131-139`, `kernel/events.ts:71-83`). Usage is counted as `stage.completed` (`slices/rebuild/runtime-review.ts:142-147`).
6. **Hold while a redo waits** (`reviewHold`, `slices/rebuild/review-redo.ts:19-43`, wired as the checkpoint authority's first decision in `main.ts:1269-1272`): work in the same revision that contains a key in the review step's dependent closure is `held` with checkpoint ids `review:<verdictId>` while that verdict's `redo_state` is `pending`.
7. **Automatic redo** (`createReviewRedos`, `slices/rebuild/review-redo.ts:50-91`): `kick` runs after every finished work item of a project (`main.ts:444-449`) and once at boot for all projects (`main.ts:589`). For each `pending` verdict not already in flight it calls `startRedo` → `makeAgain` (`slices/rebuild/review-redo.ts:114-142`): `recoverProject` with the current head as base, a stable idempotency key per verdict (`redoKey`, sha256 of `review-redo:<id>` shaped as a UUID, `slices/rebuild/review-redo.ts:146-149`), action `{ kind: "redo", item }`, and `pendingSuperseded: true` so admitted-but-unstarted work does not block it (`slices/rebuild/recovery-conflict.ts:12-33`). Success sets `redo_state = 'started'`; refusal sets `failed` with `redoRefusal` text (`slices/rebuild/review-redo.ts:139-140`, `:151-162`). A `project.updated` event is emitted (`:141`); the runner is ticked in `finally` (`:75-82`). The redone item is a new project version whose new review step starts at attempt+1 (Step 5).
8. **Project page** (`GET /api/projects/:id/reviews`, `edge/http/reviews.ts:55-67`): each item's latest verdict (`latestReviews`, `slices/reviews/view.ts:24-49`) with `current` true only when the verdict's item fingerprint matches the selected output of `reviewedOutputKey(itemKey)` (`subtitles:timing` for narration, `shorts:N:render` for a short, else the item key, `slices/reviews/view.ts:6-11`), its `outputId`, and the count of verdicts for the item. The web client keeps only `current` ones (`packages/web/src/project/review-verdict.tsx:15-22`) and shows a badge (`:35-60`) and reasons with "Try N" or "Kept after N tries: the redo limit was reached." (`:66-88`) beside the article, images and thumbnail sections (`packages/web/src/project/body-article.tsx:50`, `body-images.tsx:545-553`, `body-thumbnail.tsx:184-192`).
9. **Overrule** (`POST /api/projects/:id/reviews/:verdictId/overrule`, `edge/http/reviews.ts:68-101`): refused 409 when `redoStarting(verdictId)` (`slices/rebuild/review-redo.ts:95-99`). `actOnVerdict` (`slices/reviews/repo.ts:168-205`) sets `action = 'overruled'`, `action_at`; for a `pending` redo it also clears `redo_state` in the same guarded UPDATE, releasing held work. The runner is ticked and `project.updated` emitted.
10. **Redo by hand** (`POST /api/projects/:id/reviews/:verdictId/redo`, body `revisionControlSchema`, `edge/http/reviews.ts:102-161`): `recoverProject` with action `{ kind: "redo", item: verdict.itemKey }` (the same path as More → make it again), then `actOnVerdict(..., "redone")`; 202 with the recovery result. The web client sends the page's `revisionId` as base and a fresh UUID idempotency key (`packages/web/src/project/review-verdict.tsx:121-128`).
11. **First decision stands** (`actOnVerdict`, `slices/reviews/repo.ts:168-205`): Overrule and Redo record who decided in `action_by` (`person`, `agent` when the call came through `/mcp`, or `assistant` when it came through `/mcp/assistant`, `edge/http/reviews.ts:79-86`, `:141-148`, `edge/http/actor.ts:11-15`). A verdict that already has an action refuses a second Overrule or Redo with 409 `decided`, "This verdict was already decided: the item was kept as it is / sent to be made again[ by an agent / by the assistant], so nothing changed. Reload the project page (or call needs_attention)…", for the person and an agent alike (`edge/http/reviews.ts:38-43`, `:87-92`, `:114-121`); the same Redo sent again with its idempotency key gets its first answer back (`:116-120`).

### External agent reviewer

12. **Planning** (`slices/rebuild/recipe-reviews.ts:48-79`): with `reviewer: "agent"` each review step is the local operation `review-agent-v1` with values stage, item key, input identities, rendered prompt, mode and retries, and no provider marker: no provider call, nothing to be ready, no charge. The estimate shows one "Reviews" line, "An external agent answers each review through MCP; no API fee." (`slices/estimate/index.ts:438-440`). Gating is Step 4's.
13. **Waiting** (`executeAgentReviewRecipe`, `slices/rebuild/runtime-agent-review.ts:33-86`, dispatched from `slices/rebuild/runtime-run.ts:51-52`): a piece already `done` is done and `maySubmit` false is `held`, as in Step 5. With no row for its fingerprint, or one whose earlier wait was superseded or canceled, the step gathers exactly what the built-in reviewer would get (`reviewMaterial`, pictures kept by their stored path) and saves an `external_reviews` row `waiting` with `waiting_since` now and `deadline_at` two hours later (`externalReviewWaitMs`, `slices/reviews/external-model.ts:11`; `openExternalReview`, `slices/reviews/external-repo.ts:18-49`), emits `project.updated` and returns `waiting`. A step asked again keeps its row. The stage's other pieces still run (`slices/rebuild/runtime-run.ts:67-70`); `agentReviewHold` stops the runner claiming work whose only unfinished pieces are reviews waiting for an agent, with checkpoint ids `agent-review:<reviewId>` (`slices/rebuild/runtime-agent-review.ts:134-155`), asked after the redo hold (`main.ts:1269-1275`). The run reads **Waiting for the agent** (`slices/reviews/holds.ts:121-127`; 45-mcp-agent-access.md).
14. **Material for the agent**: `get_external_review` returns the review's instruction, material sections, picture names and the pictures as MCP image content, its deadline and its standing: while waiting, how to answer; otherwise the standing's sentence (`edge/mcp/review-tools.ts:31-88`, `closedReviewSentences`, `slices/reviews/external-model.ts:57-70`).
15. **Verdict** (`submit_review_verdict` = `POST /api/projects/:id/external-reviews/:reviewId/verdict`, `edge/http/external-reviews.ts:72-119`): the body is the reviewer model's own format, `{verdict: "pass"|"fail", reasons}`, strict, each reason trimmed 1–500 characters, at most 10, a `fail` needs one (`verdictAnswerSchema`, `slices/reviews/verdict.ts:9-25`). The in-app assistant is refused first: 403 "The assistant can't answer this review: it waits for the agent you connected in Settings → Connections → Agents (MCP)…" (`edge/http/external-reviews.ts:79-87`, `slices/reviews/external-model.ts:5-8`). `answerExternalReview` reads the review and saves `answered`, the verdict, `answered_by` (`person` or `agent`) and `answered_at` in one transaction, then lets the parked work be claimed again (`releaseParkedWork`; a paused project stays put until Resume) (`slices/reviews/external-repo.ts:64-117`). The route ticks the runner, emits `project.updated` and answers `{ review: { id, state } }`.
16. **Outcome**: when the step runs again it applies Step 5's rules to the saved verdict: attempt, then `passed` / `flagged` / `redo`, saved with `answered_by = 'agent'` (or `person`) and published; a `flagged` outcome emits `review.flagged` with `byAgent: true` (`slices/rebuild/runtime-agent-review.ts:87-131`). Redo, Overrule and the hold while a redo waits are Steps 6–11's.
17. **Deadline** (`releaseDueReviews`, `slices/reviews/external-release.ts:23-51`), run once at boot after the server listens and then every 5 s on the retry timer (`main.ts:954-969`, `:986-997`): `settleExternalReviews` first marks waiting reviews the current version no longer wants as `superseded`, then each still-waiting review past `deadline_at` whose work is not canceled and whose project is not in the Trash, oldest first, becomes `auto-passed` with `answered_at` and its parked work is released (`slices/reviews/external-repo.ts:128-162`). Each one emits `review.auto-passed` (with the item's name), `project.updated` and a runner tick; a failure while announcing one is logged `review.deadline` and the others go on. The step then saves outcome `auto-passed`, passed with no reasons, `answered_by = 'nobody'` (`slices/rebuild/runtime-agent-review.ts:87-113`). The deadline is a row, so a restart loses nothing.

## Branches

- All stages `off` or none making items → no review steps, no gating, no validation; the project plans as one without reviews (`slices/rebuild/recipe-reviews.ts:38-40`, `slices/reviews/rules.ts:65`).
- Library prompt picked vs blank → rendered prompt vs built-in `defaultReviewPrompts` (`slices/rebuild/recipe-reviews.ts:53-59`, `slices/rebuild/runtime-review.ts:215`).
- Images stage with an establishing image (`reference:image`) → it is an input and attached; without, only the image (`slices/rebuild/recipe-reviews.ts:144-148`, `slices/rebuild/runtime-review.ts:266-286`).
- Thumbnail stage making three thumbnails → three review steps (`slices/rebuild/recipe-reviews.ts:150-154`).
- Mode `flag` → never redone; mode `redo` → redone while attempts ≤ retries (`slices/reviews/outcome.ts:28-30`). With retries 0 a failure is flagged at once.
- Thinking set → `thinkingConfig` from the saved catalogue entry for provider+model, else null (`slices/rebuild/runtime-review.ts:82-91`).
- Overrule on a `pending` redo → calls it off; on no redo → records the action only (`slices/reviews/repo.ts:182-202`).
- Reviewer Model → Steps 3–5; External agent (MCP) → Steps 12–17, with the same outcome, redo and overrule rules once a verdict is in.
- Where an external review stands (`reviewStanding`, `slices/reviews/external-waiting.ts:29-54`), checked in this order, each with its own sentence (`closedReviewSentences`, `slices/reviews/external-model.ts:57-70`):
  - `answered` / `auto-passed`: a verdict is already kept.
  - `canceled`: Cancel closed it while it waited (`stopWaitingReviews`, `slices/reviews/external-repo.ts:51-57`, called from `slices/cancel/index.ts:119`), or its step reads canceled; a canceled run's reviews never pass. Retried or continued, the step asks again and the review waits a fresh two hours (`slices/reviews/external-repo.ts:16-30`; `slices/rebuild/runtime-agent-review.ts:56`). If its item was meanwhile made again and the new review waits, it reads `superseded`.
  - `superseded`: its item was made again or edited and the new review of the same item waits; `replaced-pending` while no new review waits yet (the item is still being made again, or an edit was saved but the run not continued) (`slices/reviews/external-waiting.ts:45-66`). A review is wanted only while the current version reserves its step with the same fingerprint (`wantedBy`, `:7-14`).
  - `trashed`: its project is in the Trash; it takes no verdict and does not pass, and waits again once restored (`:53`).
  - otherwise `waiting`.
- Paused project: a review still waits and still passes at its deadline, but nothing of the run starts until Resume, because releasing parked work leaves a paused project's work alone (`slices/reviews/external-repo.ts:59-63`, `:128-130`).
- Badges (`statusOf`, `packages/web/src/project/review-verdict.tsx:35-64`): auto-passed → "Passed without review" with "No agent answered within 2 hours, so it went ahead without review." (`:40`, `:80-83`); an agent's pass → "Passed by agent" ("Redone after agent review" after a redo); an agent's flag → "Flagged by agent"; an Overrule → "Accepted by agent", "Accepted by assistant" or "Accepted by you"; a Redo → "Made again by agent", "Made again by assistant" or "Being made again" (`packages/web/src/project/review-verdict.tsx:45-60`). The promise check's verdict carries a "Promise check" label beside the chip (`:195`).
- UI buttons (`packages/web/src/project/review-verdict.tsx:103-170`): hidden when the verdict passed or already has an action; Overrule disabled while `redoState === "started"` or while the project is busy unless a redo is waiting; Redo disabled while busy or while a redo is pending/started.

## Unhappy paths

- Malformed/empty/non-JSON verdict → `check` rejects, the provider wrapper retries like any failed attempt; if the final answer still fails parsing the step throws the reason, which ends with "choose another reviewer model in Edit project → Reviews, then use Try again" (`slices/reviews/verdict.ts:58-95`, `slices/rebuild/runtime-review.ts:96-103`).
- Provider call not ok → step returns `held` (`slices/rebuild/runtime-review.ts:101`).
- Reviewed output missing on disk or not selected → throws "The <what> this review looks at is missing…" with the stage-specific fix (`slices/rebuild/runtime-review.ts:200-203`, `:216-217`, `:237-263`, `:292-296`, `:326-327`, `:344-345`).
- Same review step asked again (retried step whose answer was saved but not published) → upsert on `(project_id, review_fingerprint)` replaces the answer and clears `action`, `action_at`, `redo_error` (`slices/reviews/repo.ts:54-62`, `kernel/db/migrations/0025-automatic-reviews.sql:37`). A save that cannot be read back throws an internal-error sentence (`slices/reviews/repo.ts:83-85`).
- Automatic redo refused: `running` → "work that depends on it was already running. Use Redo beside it once the run has finished."; `readiness` → the field messages + "Fix that in Settings → Providers"; `conflict`/`control-changed` → "the project changed at the same moment (an edit, Pause or Cancel)"; other → generic (`slices/rebuild/review-redo.ts:151-162`). The verdict stays flagged-with-error (`redo_state = 'failed'`) and held work is released because only `pending` verdicts hold (`slices/rebuild/review-redo.ts:25-28`). An exception sets `failed` with an internal-error sentence and is logged as `review.redo` (`:63-74`). A deleted project → `failed`, "The project no longer exists." (`:124-128`).
- App restart between a verdict and its redo → boot `kick` starts the pending redo; the stable idempotency key returns the first attempt's answer if it already ran (`main.ts:588-589`, `slices/rebuild/review-redo.ts:144-149`). The in-memory `running`/`starting` sets are not persisted (`slices/rebuild/review-redo.ts:55`, `:95`).
- Overrule while a redo is being started or already started → 409 "This verdict can't be overruled: it passed, or Slopify has already started making the item again…"; overrule of a passed verdict → same 409 (`edge/http/reviews.ts:68-92`, `slices/reviews/repo.ts:180-181`). Unknown verdict id → 404 "This review no longer exists…" (`edge/http/reviews.ts:32-37`).
- Manual Redo: rebuild service not yet bound → 503 "Redo is not ready yet…" (`edge/http/reviews.ts:122-127`); redo pending/started → 409 (`:97-104`); recovery refused → 404/400/409 with a lead sentence per reason (`running`, `readiness`, `conflict`/`control-changed`, `invalid-selection`) plus field messages and `currentRevisionId` (`:116-144`).
- Sample project → overrule/redo POSTs are refused 409 `sample-read-only` by the project-route guard (`edge/http/app.ts:371-389`); a Template Studio sample's hidden project is refused 409 `template-sample` on every project route (`:390-401`).
- A verdict about an output since replaced is `current: false` and hidden from the page (`slices/reviews/view.ts:13-16`, `packages/web/src/project/review-verdict.tsx:21`).
- A redone item that keeps failing: attempts count up until `attempt > retries`, then it is kept and flagged (`slices/reviews/outcome.ts:19-21`).
- External verdict that breaks the rules (no body, not JSON, empty or over-long reason, more than 10, a fail with none) → 400 `invalid-verdict` "The verdict wasn't saved: <what was wrong>. Call submit_review_verdict again with body {verdict…}"; said before the review is looked up, and the review keeps waiting (`edge/http/external-reviews.ts:17-59`, `:67-71`).
- Two agents answer at once → the first saved wins; the second, and any verdict after the review stopped waiting, gets 409 "The verdict wasn't saved. This review was already answered, so it takes no other verdict…" (or the auto-passed, superseded, replaced-pending, canceled or trashed sentence), with `reason` naming the standing (`slices/reviews/external-repo.ts:78-101`, `edge/http/external-reviews.ts:95-107`). A verdict on a review whose item was just replaced marks it `superseded` there and then (`slices/reviews/external-repo.ts:97-100`).
- Unknown review id → 404 "This review doesn't exist: the project may have been deleted. Call needs_attention…" (`edge/http/external-reviews.ts:96-102`).
- Waking the runner after a verdict fails → logged `review.wake`; the verdict stays saved (`edge/http/external-reviews.ts:108-115`).
- A review whose saved material can no longer be read still passes at its deadline: settling reads plain columns only (`slices/reviews/external-repo.ts:131-133`). Pictures missing on disk are left out of `get_external_review` (`edge/mcp/review-tools.ts:42-48`).
- No agent ever answers → the review auto-passes after two hours with a notice (Step 17; 39-notifications-and-live-events.md).

## State transitions

`review_verdicts` row (`kernel/db/migrations/0025-automatic-reviews.sql:20-40`):

| From | Event | To | Where |
|---|---|---|---|
| (none) | review answered | `outcome` passed / flagged / redo; `redo_state` null or `pending` | `slices/rebuild/runtime-review.ts:104-122` |
| `redo_state = pending` | automatic redo accepted | `started` | `slices/rebuild/review-redo.ts:139` |
| `redo_state = pending` | redo refused / threw / project gone | `failed` + `redo_error` | `slices/rebuild/review-redo.ts:68-73`, `:126`, `:140` |
| `redo_state = pending` | Overrule | `action = overruled`, `redo_state` null | `slices/reviews/repo.ts:182-189` |
| failed verdict, no pending/started redo | Overrule | `action = overruled` | `slices/reviews/repo.ts:190-202` |
| any verdict without pending/started redo | manual Redo accepted | `action = redone` | `edge/http/reviews.ts:110` |
| any | same review fingerprint re-answered | row replaced, action cleared | `slices/reviews/repo.ts:54-62` |

Forbidden: overruling a passed verdict; overruling or redoing while `redo_state = started`; a manual Redo while `pending` (`slices/reviews/repo.ts:179-183`, `edge/http/reviews.ts:135`); a second Overrule or Redo once `action` is set (`slices/reviews/repo.ts:178-179`). Rows cascade-delete with their project (`kernel/db/migrations/0025-automatic-reviews.sql:22`). Migration 0055 rebuilt the table with `answered_by` (`model` | `agent` | `person` | `nobody`, existing rows `model`), `action_by` (`person` | `agent`) and the outcome `auto-passed` (`kernel/db/migrations/0055-external-reviews.sql:26-56`). Migration 0065 copied both review tables again: `stage` may be `promise`, and `review_verdicts.action_by` may be `assistant`; `external_reviews.answered_by` also allows `assistant`, though nothing writes it, since the assistant never answers one (`kernel/db/migrations/0065-promise-and-assistant-reviews.sql:4-58`).

`external_reviews` row (`kernel/db/migrations/0055-external-reviews.sql:5-25`, state `canceled` added by `0059-external-review-canceled.sql:1-29`), one per project and review fingerprint:

| From | Event | To | Where |
|---|---|---|---|
| (none) | agent review step runnable | `waiting`, deadline +2 h | `slices/rebuild/runtime-agent-review.ts:56-85` |
| `waiting` | first valid verdict | `answered` + verdict, `answered_by`, `answered_at` | `slices/reviews/external-repo.ts:102-104` |
| `waiting` | deadline passed, work not canceled, project not in Trash | `auto-passed` | `slices/reviews/external-repo.ts:139-150` |
| `waiting` | current version no longer wants it (rerun or edit) | `superseded` | `slices/reviews/external-repo.ts:136-138`, `:97-100` |
| `waiting` | Cancel | `canceled` | `slices/reviews/external-repo.ts:53-57` |
| `superseded` / `canceled` | its step asked again | `waiting`, verdict cleared, fresh deadline | `slices/reviews/external-repo.ts:22-30` |

Forbidden: `answered` or `auto-passed` back to `waiting`; a verdict on any state but a wanted, live, untrashed `waiting` one (`slices/reviews/external-waiting.ts:36-54`).

## Invariants

- A stubborn item never loops: at most `retries` automatic redos per item chain, then flagged (`slices/reviews/outcome.ts:19-31`).
- One verdict per review step fingerprint per project (`kernel/db/migrations/0025-automatic-reviews.sql:37`).
- Dependents of a reviewed item never run before its review has answered (`slices/rebuild/recipe-reviews.ts:28-32`), and never run on an item whose redo is still pending (`slices/rebuild/review-redo.ts:16-18`).
- A redo already under way owns the item; Overrule cannot cancel it (`slices/reviews/repo.ts:164-167`, `edge/http/reviews.ts:70-78`).
- A flagged item is kept; the run continues past it (`kernel/events.ts:71-73`, `slices/rebuild/runtime-review.ts:130`).
- The reviewer's material is presented as data, never instructions (`slices/reviews/verdict.ts:40`).
- Pictures are only sent to `claude-code` or `codex` (`slices/reviews/model.ts:94-97`, `slices/reviews/rules.ts:81-90`); an external agent is shown them through MCP instead.
- One verdict per external review: read and answered in one transaction (`slices/reviews/external-repo.ts:78-92`); one decision per flagged verdict (`slices/reviews/repo.ts:179`).
- A canceled run's external reviews never pass, and a trashed project's neither pass nor take a verdict (`slices/reviews/external-waiting.ts:16-21`, `slices/reviews/external-repo.ts:128-143`).
- An auto-passed review is its own outcome, never shown as an agent's pass (`slices/rebuild/runtime-agent-review.ts:91-93`, `packages/web/src/project/review-verdict.tsx:40`).

## Outcomes & side effects

- Passed: badge "Review passed" (or "Redone after review" when attempt > 1) (`packages/web/src/project/review-verdict.tsx:39-42`); run continues.
- Flagged: item kept, `review.flagged` event; the notifier turns it into "Review needs a decision: <title> — <reason>" telling the user to press Overrule or Redo (`slices/notifications/notifier.ts:108-111`, `slices/notifications/rules.ts:39-65`).
- Redo: a new project version regenerating the item and its dependents through the recovery path (see 12-reruns-and-edits.md).
- Cost: one LLM call per reviewed item per attempt. The pre-run estimate adds one "Reviews" request per item (images count, shorts count, else 1) with input = prompt length + material (article: article + prompt chars; promise: article chars + 1,500; narration: 2.1 × article chars; others: 1,500) + 800 and output 400; redos are stated as not priced (`slices/estimate/index.ts:435-470`). With the External agent reviewer: no charge (`slices/estimate/index.ts:438-440`).
- External agent: `external_reviews` rows; events `review.auto-passed` (`kernel/events.ts:86-98`) and `project.updated`; the notice "Passed without review: no agent answered in 2 h" naming the project and item (`autoPassNoticeText`, `slices/notifications/rules.ts:97-110`); a flagged notice from an agent's verdict reads "· by agent" and "An agent's review flagged …" (`slices/notifications/rules.ts:70-80`); a flagged promise check names "the article's opening (promise check)" (`slices/notifications/rules.ts:67`, `:87`). An agent's verdicts, overrules and redos are also recorded as its actions, the assistant's as "by assistant" (45-mcp-agent-access.md, 50-in-app-assistant.md); the assistant must ask before `redo_review` and may call `overrule_review` freely (`slices/assistant/gate.ts:61-62`, `:100`). Backups leave `external_reviews` out (a restored project asks its waiting reviews again); `review_verdicts` travels (`slices/storage/backup-new-tables.test.ts:54-68`).

## Dimensions not in play

- Money beyond provider calls: none.
- Multi-user permissions: none; any caller of the local API may overrule or redo. The person and an agent have the same powers; only the attribution differs.
- Time limits on a pending decision: none for a flagged item, which waits indefinitely; an external review waiting for its verdict passes after two hours.
- Reviewing research, document, description, video render: not implemented; only the six stages exist (`slices/reviews/model.ts:12-19`).
- Audio listening by the reviewer: absent; the narration review reads the word timing's transcript, not audio.
