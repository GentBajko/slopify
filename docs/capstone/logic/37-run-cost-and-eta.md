---
scenario: run-cost-and-eta
screens: [01-projects, 03-project, 13-schedules]
depends_on: [01-pipeline-lifecycle, 13-cancel, 18-cost-review-batch, 19-catalogue-thinking, 20-boot-cli-recovery]
generated_at_commit: e9226a34aa8a
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: 03f80fef9597
paths_covered:
  - ":(top)packages/app/src/slices/run-cost/**"
  - ":(top)packages/app/src/slices/eta/**"
  - ":(top)packages/app/src/edge/http/run-cost.ts"
  - ":(top)packages/app/src/edge/http/home.ts"
  - ":(top)packages/app/src/kernel/ports/plan-limits.ts"
  - ":(top)packages/app/src/kernel/runner/providers.ts"
  - ":(top)packages/app/src/kernel/db/migrations/0027-run-cost.sql"
  - ":(top)packages/app/src/kernel/db/migrations/0040-standalone-usage.sql"
  - ":(top)packages/web/src/project/run-cost.tsx"
  - ":(top)packages/web/src/project/run-aside.tsx"
  - ":(top)packages/web/src/home/running-now.tsx"
  - ":(top)packages/web/src/home/api.ts"
---

# Run cost, plan limits and time left

What a run's provider calls actually cost (recorded as each call lands), the wait on a CLI's used-up plan allowance, Home's weekly totals, a running step's time left, and the run clock. The estimate shown before Start, and a schedule's spend ceiling, belong to `18-cost-review-batch.md`; the estimate reuses this scenario's `tokenCost` and `apiEquivalentOf` (`packages/app/src/slices/estimate/requests.ts:3`).

## Trigger & preconditions

- Metering: every successful provider call a stage makes through `ProviderDeps` (`packages/app/src/kernel/runner/providers.ts:155-167`, `:243-260`; wired at `packages/app/src/main.ts:877`). Calls made outside a project (schedule topics, channel episode summaries, cast pictures) go through `createStandaloneMeter` (`packages/app/src/main.ts:353`, `packages/app/src/kernel/runner/standalone.ts:198-208`).
- Plan-limit gate: every provider call to a provider that `planAccountOf` maps to an account — `claude-code`, `codex`/`codex-image` (one shared account), `gemini` (`packages/app/src/kernel/ports/plan-limits.ts:7-15`) — made by a project stage (`providers.ts:137-154`; wired `main.ts:878-883`).
- Reads (no authority check, local API):
  - `GET /api/projects/:id/run-cost` → `runCostOf` (`packages/app/src/edge/http/run-cost.ts:17-27`; mount `packages/app/src/edge/http/app.ts:196`).
  - `GET /api/home/week?since=<ISO>&channelId=<id?>` → `weekSummary` (`packages/app/src/edge/http/home.ts:9-20`; mount `app.ts:198`). The browser sends Monday 00:00 of the viewer's time zone (`packages/web/src/home/api.ts:10-25`).
  - `GET /api/projects/:id` attaches ETA fields to running stages via `stagesWithEta` (`packages/app/src/edge/http/projects.ts:123-128`).
  - `GET /api/projects` and the calendar agenda attach `limitWaits` per project via `limitWaitsByProject` (`projects.ts:82-101`, `packages/app/src/slices/schedules/agenda.ts:195`).

## Steps

### Pricing a call (`priceCall`, `packages/app/src/slices/run-cost/pricing.ts:77-134`)

1. The catalogue is read per call, so a refreshed catalogue prices the next call only (`packages/app/src/slices/run-cost/meter.ts:20-21`, `:30`).
2. Local CLI provider (`isLocalCliProvider`): `onPlan: true`, `cost: 0`. For `llm` calls only, `apiEquivalentOf` finds the OpenRouter-listed API model and `apiCost` = `tokenCost` of the reported tokens; images from Codex get no API price (`pricing.ts:79-95`).
3. `apiEquivalentOf` (`pricing.ts:45-75`): strips `[...]` context tags and `-YYYYMMDD` suffixes; `claude-code` maps `opus|sonnet|haiku|fable[-major[-minor]]` to `anthropic/claude-<name>-<major>[.<minor>]`, an alias with no version to the numerically newest listed `anthropic/claude-<name>-*`; `codex`/`codex-image` → `openai/<model>`; `gemini` → `google/<model>`; empty or `codex-imagegen` → none.
4. System voice provider: cost 0, no rates (`pricing.ts:96-98`).
5. Other providers: looked up in the catalogue family (`video` uses the `image` family) by provider+model (`pricing.ts:99-103`).
   - `llm`: `tokenCost` = ((in − cached)·input + cached·(cachedInput ?? input) + out·output) / 1,000,000, cached clamped to 0..in; null if input or output rate is missing (`pricing.ts:25-40`), or if tokens were not reported (`:107-112`).
   - `tts`: characters / 1,000,000 × `perMillionCharacters`; a per-minute voice stays unpriced (`:113-120`).
   - `image`/`video`: `perImage` × `images` (default 1) (`:121-125`).
   - A model the catalogue does not price gives `cost: null` — unknown, never free (`pricing.ts:5-7`).
6. The stored `price_json` holds `{catalogue: updatedAt, model, ...rates}` (`pricing.ts:93`, `:132`).

### Recording (`createUsageMeter`, `meter.ts:27-69`)

7. One `provider_usage` row per successful call: project, stage, kind, provider, model, tokens (in/out/cached), characters, images, seconds, size, quality, `wall_ms`, `on_plan`, `cost`, `api_model`, `api_cost`, `price_json`, `created_at` (`meter.ts:32-59`; table `packages/app/src/kernel/db/migrations/0027-run-cost.sql:5-28`).
8. When the call has a plan account and the CLI reported windows, a `plan_limit_readings` row stores `{before?, after?}` windows (`meter.ts:60-66`; `0027-run-cost.sql:32-39`). Window kinds come from minutes: 300 → `five_hour`, 10080 → `weekly`, else `other` (`plan-limits.ts:46-50`).
9. Standalone calls write `standalone_usage` with owner kind/id, the resolved channel (a schedule's template channel, else the default channel), purpose, and the reading inline (`meter.ts:73-124`; `packages/app/src/kernel/db/migrations/0040-standalone-usage.sql:8-35`).

### Waiting on a plan limit (`createLimitGate`, `packages/app/src/slices/run-cost/limits.ts:29-122`)

10. Before each gated call, `ready(account)` reads `plan_limit_waits.retry_at`; none → proceed; past → delete the row and proceed (`limits.ts:71-83`).
11. Future → register the waiter (`plan_limit_waiters` INSERT OR IGNORE, keyed project+stage+account; an in-memory count so parallel calls of one stage show one wait) and emit `project.updated` on first insert, then sleep until `retry_at` and loop (`limits.ts:42-51`, `:84-92`; emit `main.ts:882`). The wait happens outside the provider queue, holding no slot (`providers.ts:138-139`).
12. A call failing with `fault.planLimit` (Claude Code, Codex text and image, Gemini adapters: `packages/app/src/adapters/llm/claude-code.ts:274-283`, `packages/app/src/adapters/llm/codex.ts:271-272`, `packages/app/src/adapters/image/codex.ts:322-323`, `packages/app/src/adapters/llm/gemini.ts:160`) is not retried by the attempt loop (`packages/app/src/kernel/runner/attempt.ts:139-147`); `exhausted(hit)` stores the wait and the call loops back to `ready` with a fresh attempt set (`providers.ts:143-152`).
13. `exhausted` sets `retry_at` = stated reset + 2 min (`resetMarginMs`) when the reset is in the future, else now + 30 min (`recheckMs`); the upsert only moves `retry_at` later, never earlier (`limits.ts:15-17`, `:94-112`). An info log line records the wait (`:117-119`).
14. On a completed sleep the last waiter of the key deletes its `plan_limit_waiters` row and emits `project.updated` (`limits.ts:55-68`).

### Run cost tab (`runCostOf`, `packages/app/src/slices/run-cost/panel.ts:154-233`)

15. All `provider_usage` rows of the project, in order, are summed into a total, per stage and per (provider, model, kind) (`panel.ts:155-199`). Per line: `calls`, known `cost` (null cost adds 0 and increments `unpriced`), `apiEquivalent` summed over on-plan rows (null when none), `apiUnpriced` for on-plan rows without an API price, and usage totals (`panel.ts:136-152`).
16. Stages that ran without provider calls still appear with their working time (`panel.ts:200-202`). `byStage` follows pipeline order; `byModel` sorts by cost desc, then API equivalent desc, then provider and model (`:218-228`).
17. `catalogueDate` is the catalogue date of the last priced row (`panel.ts:198`, `:235-239`).
18. Plan use per account with calls (`planUses`, `panel.ts:272-300`): readings' `before` and `after` arrays in order form a sequence; `windowUse` sums, per window kind, positive increases between consecutive readings whose `resetsAt` match within 5 min, or the whole current percentage when the window rolled over; `nowPercent` is the last reading (`panel.ts:243-270`). `reported: false` when no readings exist.
19. `waits` lists waits only for stages whose state is `running` (`panel.ts:323-357`).

### Working time and the run clock (`projectTiming`, `packages/app/src/slices/run-cost/timing.ts:51-112`)

20. Attempt intervals per stage: an attempt without `ended_at` counts up to `now` only while its `revision_work` state is `running`, else as zero length (`timing.ts:79-83`). Overlapping intervals count once (`coveredMs`, `:38-49`), so review waits, plan-limit waits and pauses between attempts do not count.
21. A run is one revision's attempts; work reserved into the current revision (`revision_work_reservations`) counts toward the current revision (`timing.ts:63-72`, `:87-97`). The latest run is the current revision's, else the revision with the most recent attempt start; `current` says which (`:99-108`).
22. `totals.wallMs` is all attempts covered once; `byStage` per stage (`timing.ts:102-111`, `panel.ts:208-216`).
23. `RunClock` shows "Working for …" (adding elapsed time since the fetch while `running`) or "… of work so far", ticking each second, only for the current run of a project not in `done`/`partial`/`failed`/`canceled` (`packages/web/src/project/run-cost.tsx:78`, `:84-113`). `RunCostSummary` shows "This run cost $X" / "Spent so far", "plus unpriced calls", "~$Y via API", work time only once the run ended and something was recorded (`run-cost.tsx:45-62`).
24. The run cost query sits under the project's query key, so every project event refetch refreshes it; project queries refetch every 15 s while running or pending (`packages/web/src/queries.ts:28-29`, `:60-80`).

### Time left (`packages/app/src/slices/eta/`)

25. `stagesWithEta` reads history only when a stage is running (`packages/app/src/slices/eta/view.ts:14-15`) and adds `typicalSeconds` (rounded), `etaBasis`, `etaSeconds` (`view.ts:16-32`; fields `packages/app/src/slices/admission/model.ts:331-335`).
26. `readStageHistory`: up to 400 most recent `done` stages with start and finish; seconds = finish − start (>0); `units` = `progress_total` when >0 (`packages/app/src/slices/eta/history.ts:8`, `:31-50`). The step's model key is `provider/model` of `llm` (research, article), `audio` (audio), `images` (images, thumbnail), none for other stages (`packages/app/src/slices/eta/model.ts:75-87`).
27. `typicalSeconds`: pool = same kind and model if at least 2 samples (`ownModelMinimum`), else same kind; with a known unit count and counted samples, median(seconds / units) × units; else median seconds; no samples → undefined (`history.ts:11`, `:52-62`, `:75-81`).
28. `stageEta` (`model.ts:32-47`): not running → none. Progress counted (`current > 0`, `total > 0`) → `progress`, seconds = spent / current × (total − current), 0 when complete. Else typical known and positive → `history` with typical − spent, or `overdue` once spent ≥ typical. Else `unknown`.
29. The browser recomputes `stageEta` every second on the project page and Home's Running now from the stage rows' `typicalSeconds` (`packages/web/src/project/run-aside.tsx:70-75`, `packages/web/src/home/running-now.tsx:59-77`). Running now's line is "<count> of <total> · <eta>"; a stage reporting a named activity shows that instead ("Rendering the video (45%) · <eta>", or the activity alone while the basis is unknown) (`runningDetail`, `running-now.tsx:64`; `activityText`, `packages/web/src/project/summary.ts:105`). `etaLabel`: "time left unknown", "taking longer than usual", "finishing up" (≤0 s), "under a minute left", "about N min left", "about H h [M min] left" (`model.ts:51-64`).

### Home "This week" (`weekSummary`, `packages/app/src/slices/run-cost/week.ts:65-103`)

30. Sums calls, known cost, unpriced count and API equivalent over `provider_usage` and `standalone_usage` rows with `created_at >= since` (`week.ts:74-96`). With `channelId`, project rows count when the project's channel (default when unset) matches; standalone rows whose channel no longer exists count under the default channel (`week.ts:66-69`, `:92-95`).
31. `videos` counts `outputs` with role `video` created since, a remade video counting again (`week.ts:97-101`).
32. Plan standings are never narrowed by channel: per account, the newest of the last 20 readings (project or standalone) that parses and has windows, taking `after` else `before`, giving weekly and 5-hour percent and weekly reset (`week.ts:62-64`, `:114-148`).

## Branches

- On-plan versus keyed versus system voice pricing: steps 2, 4, 5.
- Progress versus history versus overdue versus unknown ETA: step 28.
- Own-model versus same-kind history pool: step 27.
- Stated reset in the future versus absent/past: step 13.
- Channel filter on Home: step 30; plan standings ignore it.

## Unhappy paths

| Case | Behavior | Cite |
|---|---|---|
| Metering throws (DB error) | Logged `usage.record` at warn; the call's result stands | `providers.ts:155-167`, `standalone.ts:198-208` |
| Provider call fails | Not metered: only `result.ok` records | `providers.ts:243-245` |
| Provider reports no usage | Row stored with null tokens; `cost: null` (unpriced) for keyed LLMs | `pricing.ts:107-111`, `meter.ts:44-46` |
| Catalogue lacks the model or rate | `cost: null`; counted in `unpriced`, shown as "plus unpriced calls" / "Plus N calls the model catalogue has no price for." | `pricing.ts:103-125`, `panel.ts:142`, `packages/web/src/project/run-cost.tsx:60`, `:181-183` |
| Catalogue refreshed mid-run | Earlier rows keep their stored cost and rates | `meter.ts:20-21`, `0027-run-cost.sql:1-4` |
| Stored wait write fails | Logged `plan-limits` at error and rethrown to the calling stage | `limits.ts:113-116` |
| CLI names a reset already past (clock skew) | Recheck in 30 min | `limits.ts:97-98` |
| Allowance still used up after waking | The call fails again with a plan limit and stores a new wait | `limits.ts:78` |
| Cancel/pause during a wait | Sleep aborts; the waiter row stays; the row is hidden because the stage is no longer `running` | `limits.ts:53-63`, `panel.ts:327-332` |
| App stops during a wait | Boot deletes all `plan_limit_waiters` and resumes each project whose waiting stage is `failed`/`interrupted` and not paused, via a `resume` recovery; a refused resume is logged with "use Continue the run on the project page" | `limits.ts:128-158`, `main.ts:491-505` |
| Unknown project on run-cost | 404 "This project no longer exists. Go back to Projects to pick another." | `run-cost.ts:20-25` |
| Invalid `since`/`channelId`/`id` | 400 via `onInvalid` | `home.ts:9-12`, `run-cost.ts:9` |
| Attempt left open by a crash | Counts zero time, so the clock never runs on | `timing.ts:79-82` |
| Unparseable reading JSON shape | Skipped | `panel.ts:285-286`, `week.ts:127-128` |
| Stage waiting on a plan limit | Still `running`; the history ETA keeps counting the wait and turns `overdue` (no wait awareness in `stageEta`) | `model.ts:32-47` |
| Standalone calls hitting a plan limit | No gate: `StandaloneDeps` has a meter but no `LimitGate` | `packages/app/src/kernel/runner/standalone.ts:18-24` |

## State transitions

- `plan_limit_waits` per account: absent → waiting (`exhausted`) → later `retry_at` only (`exhausted` again) → deleted on the first `ready` past `retry_at` (`limits.ts:79-81`, `:101-112`).
- `plan_limit_waiters` per (project, stage, account): absent → present (sleep begins) → deleted on a completed sleep, or at boot (`limits.ts:45-50`, `:64-66`, `:142`).
- `provider_usage`, `plan_limit_readings`, `standalone_usage`: append-only; no code updates or deletes a row, except the cascade on project delete for the two project tables (`0027-run-cost.sql:7`, `:34`).
- ETA and run clock hold no state; both are derived per read.

## Invariants

- A cost is fixed when its call lands; later catalogue changes never rewrite it (`0027-run-cost.sql:1-4`).
- An unpriced call is never treated as zero known cost: it is counted apart (`pricing.ts:5-7`, `panel.ts:29-31`).
- A CLI call's own cost is $0; its API figure is reported separately as `apiEquivalent` (`pricing.ts:13-19`).
- One wait per account, shared by every project; the wait never moves earlier (`limits.ts:9-12`, `:105`).
- A shown wait always belongs to a running stage (`panel.ts:327`).
- Time left is never invented: without progress or history the basis is `unknown` (`model.ts:1-7`).

## Outcomes & side effects

- Rows in `provider_usage`, `plan_limit_readings`, `standalone_usage`; `plan_limit_waits`/`plan_limit_waiters` rows while waiting.
- `project.updated` hub events when a stage starts or ends a wait (`limits.ts:23-24`, `main.ts:882`).
- Backups carry `provider_usage`, `plan_limit_readings` and `standalone_usage`; `plan_limit_waits` and `plan_limit_waiters` are left out (`packages/app/src/slices/storage/backup-format.ts:69-77`, `:109`; `packages/app/src/slices/storage/backup-export.ts:368`).
- Log lines: `plan-limits` info/warn/error, `usage.record` warn.

## Dimensions not in play

- D1 Authority: no per-user rule; reads and metering are local and unauthenticated.
- D3 Input: only the id param and `since`/`channelId` query are validated (`run-cost.ts:9`, `home.ts:9-12`).
- D5 Money: amounts are recorded in USD (`panel.ts:79`) and nothing is charged, refunded or capped here; spend ceilings are in `18-cost-review-batch.md`.
- D6 Limits: no Slopify-side spend limit on a running project; the only limit is the CLI plan allowance the CLI itself reports.
- D12 Visibility: data never leaves the machine and is independent of the telemetry notice (`meter.ts:24-26`).
- D13 Notification: no user notification on a plan-limit wait beyond the page refresh event and the "Waiting for … limits" lines (`packages/web/src/home/running-now.tsx:98-99`).
- D15 Record and audit: retention of usage rows is the project's lifetime (cascade); `standalone_usage` has no link to its schedule or channel and survives their deletion (`0040-standalone-usage.sql:4-5`).
