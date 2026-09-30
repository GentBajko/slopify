---
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: dde378005596
absorbed_from:
  - features/2026-09-10-play-redesign-drafts@2026-09-13
paths_covered:
  - ":(top)packages/app/src/slices/estimate/**"
  - ":(top)packages/app/src/slices/run-cost/**"
  - ":(top)packages/app/src/slices/batch/**"
  - ":(top)packages/app/src/slices/play-drafts/review.ts"
  - ":(top)packages/app/src/slices/play-drafts/review-inputs.ts"
  - ":(top)packages/app/src/slices/play-drafts/start.ts"
  - ":(top)packages/app/src/slices/play-drafts/start-repo.ts"
  - ":(top)packages/app/src/slices/schedules/scheduler.ts"
  - ":(top)packages/app/src/kernel/ports/plan-limits.ts"
  - ":(top)packages/app/src/kernel/runner/meter.ts"
  - ":(top)packages/app/src/kernel/runner/providers.ts"
  - ":(top)packages/app/src/kernel/db/migrations/0027-run-cost.sql"
  - ":(top)packages/app/src/kernel/db/migrations/0040-standalone-usage.sql"
  - ":(top)packages/app/src/edge/http/run-cost.ts"
  - ":(top)packages/app/src/edge/http/home.ts"
  - ":(top)packages/app/src/edge/http/planning.ts"
  - ":(top)packages/app/src/edge/http/drafts.ts"
  - ":(top)packages/web/src/play/run-review.tsx"
  - ":(top)packages/web/src/play/start-rail.tsx"
  - ":(top)packages/web/src/play/review-state.ts"
  - ":(top)packages/web/src/project/run-cost.tsx"
  - ":(top)packages/web/src/home/**"
---

# Cost review and batch scheduling

Before Start, Play's review prices the reviewed runs from the model catalogue. After Start, every successful provider call is priced as it lands and stored with the rates it used, feeding the project's Run cost tab and Home's "This week". CLI providers (Claude Code, Codex, Gemini) cost $0 on the user's plan; their API-equivalent is shown beside it, and a used-up plan allowance makes calls wait for the reset instead of failing. Several reviewed runs start as one sequential batch queue.

## Trigger & preconditions

- **Estimate:** the user opens Review in Play (or a Schedule fires). A draft has 1–50 runs including the base (at most 49 variants) and expected words 1–100000; a pending font upload blocks review (`packages/app/src/slices/play-drafts/review-inputs.ts:62-80`). `POST /api/projects/estimate` prices an ad-hoc planning body without a draft (`packages/app/src/edge/http/planning.ts:66-83`). Neither creates a project.
- **Run cost:** any provider call a stage makes after admission, and calls made outside a project for a schedule or channel (topics, episode summaries, cast pictures) (`packages/app/src/kernel/runner/meter.ts:36-53`).
- **Plan limits:** a call to a provider whose `planAccountOf` is `claude-code`, `codex` (also `codex-image`) or `gemini` (`packages/app/src/kernel/ports/plan-limits.ts:7-15`).
- **Batch:** Start on a reviewed draft with more than one run, or the legacy `POST /api/projects/batch` (`packages/app/src/slices/play-drafts/start.ts:148`, `packages/app/src/edge/http/planning.ts:84-124`).

## Steps

1. **Review.** `POST /api/drafts/:id/review` (`packages/app/src/edge/http/drafts.ts:114-124`) → `reviewDraft` gates on `baseVersion` and no pending Start, resolves inputs once without and once with the subtitle font, checks every provider/model/thinking choice against runtime model lists, and refuses `stale-review` when the two resolutions' bindings differ (`packages/app/src/slices/play-drafts/review.ts:20-70`). `resolveReviewInputs` applies the channel brand kit and cast, builds the base plus variant drafts, admits each, and freezes the catalogue read (`captured`) so every estimate and the later Start use the same catalogue (`packages/app/src/slices/play-drafts/review-inputs.ts:81-187`). In one transaction it re-resolves, rejects a changed fingerprint, returns the stored review when version and fingerprint match, else persists a new review UUID with runs and estimates plus the execution snapshot (catalogue, attachment identity, font) on `play_drafts` (`packages/app/src/slices/play-drafts/review.ts:85-131`).
2. **Estimate arithmetic.** `estimateRun` builds priced requests per stage (`packages/app/src/slices/estimate/index.ts:73-430`):
   - Research (generate): input = prompt chars + 6000, output 12000 chars. Article (generate): output = expected words × 6 chars. Intro/outro LLM text: output 2400.
   - Narration descriptions: one call per table/figure/equation/code block in a provided article; unknown for a generated article. Narration Preparation: one call per chunk and enabled text entry, unknown when the source length is not yet known; delivery-cue overhead always unknown.
   - Narration TTS: exact provided text, or an estimate of article chars + intro/outro; multi-speaker splits characters equally per speaker, plus a Speaker split LLM call when `source === "attribute"`.
   - Images: `plannedImageCount` images; Image scenes one call (120 output chars per image); establishing image when made from a prompt; one thumbnail image per variant for `from_prompt`/`prompt_by_llm`, plus a thumbnail-prompt call for `prompt_by_llm`.
   - YouTube description: one call on the timed transcript. Shorts (only when settings are valid): one picking call, one image-prompt call per short, images at `shortsImageUpperBound`. Animated images: one clip per animated image (`every`) or up to 12 chapter openers. Automatic reviews: one call per reviewed item on the reviewer's model; remakes are not priced.
   - Export/subtitles and Document are local, $0.
3. **Pricing a request.** Characters → tokens at ÷4; LLM rows are variable (low ×0.5, high ×1.5); TTS per million characters, or per minute at chars ÷ 6 ÷ 150 (variable); images `perImage` (fixed). Only enabled, non-deprecated catalogue models price; others give `null` (unknown). The system voice is $0. CLI LLM/image rows are $0 with `onPlan`, and an API range from `apiEquivalentOf` at the same assumptions; Codex images carry no API figure (`packages/app/src/slices/estimate/requests.ts:32-203`). Rows are grouped by stage; a group with any unknown member is unknown; totals sum known lows/highs and count unknown rows (`packages/app/src/slices/estimate/requests.ts:38-101`). Three fixed assumption sentences travel with every estimate (`packages/app/src/slices/estimate/requests.ts:47-51`).
4. **Showing the estimate.** The start rail's `RunReview` sums all runs: "Estimated total" or "Known subtotal" plus the count of unpriced stage charges; a folded "Cost by stage" lists each row as a range, "Unknown", or "$0 on your plan · ~$x via API"; assumptions and "Catalogue verified <date>" follow (`packages/web/src/play/run-review.tsx:46-136`, `packages/web/src/play/start-rail.tsx:108`). The Start button reads "Queue N videos" for N > 1, else "Start run" (`packages/web/src/play/review-state.ts:279-284`).
5. **Start.** `POST /api/drafts/:id/start` with `reviewId` → `startPlayDraft`: a stored receipt for the review id replays its result; otherwise the draft moves `active → starting` (`start_id = reviewId`) (`packages/app/src/slices/play-drafts/start.ts:24-69`). It re-checks readiness against the review's captured catalogue, then in one transaction creates exactly the reviewed runs: one run → `startRun`; several → `enqueueBatch`; admits reviewed checkpoints; inserts the Start receipt; marks the draft started. A created-count mismatch throws and rolls back (`packages/app/src/slices/play-drafts/start.ts:80-174`). After commit: record started, release the draft's staged files, and pump the queue or tick each project (`packages/app/src/slices/play-drafts/start.ts:114-121`).
6. **Batch creation.** `enqueueBatch` is idempotent on the batch id (the review id); inside one transaction it inserts `batches`, starts each run as a project, and inserts `project_queue(project_id, batch_id)`. Supplied staged inputs are released only when `retainStaged` is false (the legacy route); Play Start retains them and releases after commit (`packages/app/src/slices/batch/index.ts:41-79`).
7. **Queue pump.** `pumpQueue` walks unfinished, non-trashed entries in position order: an entry with an in-flight call stops the walk; `done`/`partial`/`failed`/`canceled` becomes `finished` and the walk continues; `paused` stops the walk (holds its place); otherwise the entry becomes `active`, the runner is ticked, and the walk stops. One batch video runs at a time (`packages/app/src/slices/batch/index.ts:20-30`, `packages/app/src/slices/batch/index.ts:81-101`).
8. **Metering.** After each successful provider call the runner records usage; a metering error is logged (`usage.record`) and never fails the call (`packages/app/src/kernel/runner/providers.ts:154-166`). `priceCall` prices from the catalogue read at that moment: CLI calls `on_plan = 1`, `cost = 0`, and for LLM calls `api_cost` from the API model the CLI's model maps to (Claude aliases to the newest listed family member, dated snapshots and `[1m]` suffixes stripped); system voice $0; LLM by tokens with cached input at its own rate; TTS per million characters only (per-minute voices stay unpriced); image and video `perImage × images` (`packages/app/src/slices/run-cost/pricing.ts:25-134`). The row goes to `provider_usage` with the rates JSON; plan windows reported by the CLI go to `plan_limit_readings` (`packages/app/src/slices/run-cost/meter.ts:27-69`). Calls outside a project go to `standalone_usage` under the schedule's template channel or the channel, falling back to the default channel (`packages/app/src/slices/run-cost/meter.ts:73-124`).
9. **Run cost tab.** `GET /api/projects/:id/run-cost` (404 for an unknown project) returns `runCostOf`: known cost, unpriced count, API-equivalent (null when no plan call), totals, per stage (with working time, including stages with no provider call) and per model (sorted by cost, then API equivalent), plan window use, current limit waits, and the latest catalogue date seen (`packages/app/src/edge/http/run-cost.ts:17-27`, `packages/app/src/slices/run-cost/panel.ts:154-233`). Window use sums increases between consecutive readings whose `resetsAt` agree within 5 minutes and counts the full reading after a rollover; `reported: false` when the CLI gave no windows (`packages/app/src/slices/run-cost/panel.ts:241-300`). Working time is the union of attempt intervals (parallel steps counted once; an unended attempt counts only while its work is `running`); the latest run is the current revision's, else the last revision that ran something (`packages/app/src/slices/run-cost/timing.ts:38-116`). The project page shows a one-line summary once the run ended (`packages/web/src/project/run-cost.tsx:45-78`).
10. **This week.** `GET /api/home/week?since=<ISO>&channelId=` sums `provider_usage` and `standalone_usage` rows since the browser's Monday 00:00, optionally narrowed to one channel (a deleted channel's rows count under the default channel); videos = `outputs` rows of role `video` created since then (a remade video counts again); plan standings are the latest weekly/5-hour reading per account across both tables, never narrowed by channel (`packages/app/src/edge/http/home.ts:9-21`, `packages/app/src/slices/run-cost/week.ts:65-148`, `packages/web/src/home/api.ts:10-14`).
11. **Plan limits.** Each CLI call first awaits `gate.ready` outside the provider queue (holding no slot); a call failing with `fault.planLimit` calls `gate.exhausted` and loops to wait and retry with a fresh set of attempts. Plan-limit failures are not retried in-call (`packages/app/src/kernel/runner/providers.ts:137-153`, `packages/app/src/kernel/runner/attempt.ts:139-148`). `exhausted` upserts `plan_limit_waits(account)` with `retry_at` = stated reset + 2 min, or now + 30 min when no future reset is given; an existing later `retry_at` is kept (`packages/app/src/slices/run-cost/limits.ts:94-120`). `ready` sleeps until `retry_at` (recording a `plan_limit_waiters` row per project/stage/account), and deletes the wait once past (`packages/app/src/slices/run-cost/limits.ts:71-93`). Waits are per account, so every project's calls to that CLI wait on the same reset while other providers proceed (`packages/app/src/slices/run-cost/limits.ts:9-12`). Lists show "Waiting for <plan> limits" from `limitWaitsByProject` (`packages/app/src/edge/http/projects.ts:79`, `packages/app/src/slices/schedules/agenda.ts:189`).

## Branches

- One reviewed run → an ordinary independent project, never in the batch queue; several → one batch, one video at a time (`packages/app/src/slices/play-drafts/start.ts:148-152`).
- Legacy `POST /api/projects/batch`: refused 409 when the draft has checkpoints; replays the queue for a known `requestId`; refuses a missing subtitle font (400) and field errors (400) (`packages/app/src/edge/http/planning.ts:84-124`).
- Schedules: each due occurrence creates a fresh draft from the template, reviews it and starts it. With `spendLimitCents` set, a run whose summed high estimate × 100 exceeds it, or whose estimate has any unknown row, fails `spend-limit`; without a limit nothing is capped (`packages/app/src/slices/schedules/scheduler.ts:172-208`, `packages/app/src/edge/http/schedules.ts:70-71`).
- CLI vs keyed: CLI calls always cost $0 and carry an API figure only for LLM calls with a catalogue mapping; keyed calls carry cost or null (`packages/app/src/slices/run-cost/pricing.ts:77-95`).
- Plan-limit wait after restart: stages waiting when the app stopped are marked interrupted; `resumeAfterRestart` resumes their projects unless paused, and clears `plan_limit_waiters` (`packages/app/src/slices/run-cost/limits.ts:124-158`, `packages/app/src/main.ts:492`).

## Unhappy paths

- Review: invalid input → `invalid-edit`; version or document changed → `stale-review`; pending Start → `pending-start`; missing font → field `subtitles.fontId`; missing model / unsupported thinking → field errors; a concurrent write between resolve and persist → `conflict` (`packages/app/src/slices/play-drafts/review.ts:24-140`).
- Start: another review already starting → `pending-start`; draft started → `already-started`; stale identity → `stale-review` and the claim is released; readiness failures return fields without creating anything; a lost reply is recovered by replaying the receipt for the same review id (`packages/app/src/slices/play-drafts/start.ts:32-113`).
- Estimate: a model not in the catalogue, disabled or deprecated, or lacking a rate prices `null` and is counted unknown, never $0 (`packages/app/src/slices/estimate/requests.ts:161-203`). Invalid shorts or animation settings are simply not priced (`packages/app/src/slices/estimate/index.ts:327-333`, `packages/app/src/slices/estimate/index.ts:360-361`).
- Metering failure is logged and swallowed; the call's answer stands (`packages/app/src/kernel/runner/providers.ts:154-166`). A failed call is never metered (`packages/app/src/kernel/runner/meter.ts:5-7`).
- Plan-limit wait cut short by cancel, pause or shutdown ends through the abort signal and leaves the waiter row for the next boot to interpret (`packages/app/src/slices/run-cost/limits.ts:53-68`). A write failure to `plan_limit_waits` is logged and rethrown (`packages/app/src/slices/run-cost/limits.ts:113-116`). A resume that fails after restart logs "use Continue the run on the project page" (`packages/app/src/slices/run-cost/limits.ts:147-152`).
- Batch: a trashed queue entry is invisible to the pump, so the queue moves past it; restoring puts it back in place (`packages/app/src/slices/batch/index.ts:20-30`).

## State transitions

- Draft: `active → starting → started`; a released claim returns to `active`, and a stale one also clears the stored review (`packages/app/src/slices/play-drafts/start.ts:61-67`, `packages/app/src/slices/play-drafts/start-repo.ts:140-160`).
- Queue entry: `queued → active → finished`; `paused` holds `queued`/`active` in place (`packages/app/src/slices/batch/index.ts:83-101`).
- Plan wait per account: none → waiting (`plan_limit_waits` row) → cleared once `retry_at` passes; a later hit only moves `retry_at` forward (`packages/app/src/slices/run-cost/limits.ts:94-112`).
- Usage rows are append-only; `provider_usage`, `plan_limit_readings` and `plan_limit_waiters` cascade with their project's removal (`packages/app/src/kernel/db/migrations/0027-run-cost.sql:5-58`).

## Invariants

- Start creates exactly the reviewed runs or nothing (`packages/app/src/slices/play-drafts/start.ts:124-172`).
- A confirmed Start identity returns one recorded result (`packages/app/src/slices/play-drafts/start.ts:33-34`).
- Estimate and Start use the catalogue captured at review (`packages/app/src/slices/play-drafts/start.ts:82-91`).
- A stored call cost is never re-priced by a later catalogue change (`packages/app/src/kernel/db/migrations/0027-run-cost.sql:1-4`).
- Unknown pricing is counted and shown, never treated as zero, in the estimate, the Run cost tab and This week (`packages/app/src/slices/run-cost/panel.ts:27-35`, `packages/app/src/slices/run-cost/week.ts:33-34`).
- At most one batch video is active at a time; ordinary single runs stay independent.
- A plan-limit wait holds no provider-queue slot (`packages/app/src/kernel/runner/providers.ts:138-139`).

## Outcomes & side effects

Review persists a durable resolved snapshot and makes no provider call. Start creates projects, revisions, copied media and optional queue entries, then dispatches. Each successful provider call writes one usage row (and a plan reading when reported). Plan exhaustion writes a per-account wait and a log line (`plan-limits`). The Run cost tab, This week and the estimate are read-only.

## Dimensions not in play

- Payment: no estimate or reading moves money, queries a provider balance or enforces a cap in Play; the only cap is a schedule's optional `spendLimitCents`, checked against the estimate before its run starts (`packages/app/src/slices/schedules/scheduler.ts:192-198`).
- Actual-spend cap: nothing stops a running project when its recorded cost grows.
- Currency: all figures are USD (`packages/app/src/slices/run-cost/panel.ts:79`).
- Notifications: no outbound notification is sent for estimates, costs or plan waits.
- Telemetry: usage rows never leave the machine; they are separate from the anonymous telemetry log (`packages/app/src/slices/run-cost/meter.ts:24-26`).
