---
scenario: run-cost-and-eta
screens: [01-projects, 03-project, 13-schedules]
depends_on: [01-pipeline-lifecycle, 13-cancel, 18-cost-review-batch, 19-catalogue-thinking, 20-boot-cli-recovery]
generated_at_commit: d6a72d6428ff
generated_date: 2026-10-18
capstone_version: 7.0.1
content_hash: 03f80fef9597
paths_covered:
  - ":(top)packages/app/src/slices/run-cost/**"
  - ":(top)packages/app/src/slices/eta/**"
  - ":(top)packages/app/src/edge/http/run-cost.ts"
  - ":(top)packages/app/src/edge/http/home.ts"
  - ":(top)packages/app/src/kernel/ports/plan-limits.ts"
  - ":(top)packages/app/src/kernel/runner/providers.ts"
  - ":(top)packages/app/src/kernel/runner/standalone.ts"
  - ":(top)packages/app/src/adapters/account-limits.ts"
  - ":(top)packages/web/src/project/plan-share.ts"
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

- Metering: every successful provider call a stage makes through `ProviderDeps` (`packages/app/src/kernel/runner/providers.ts:160-172`, `:259-274`; wired at `packages/app/src/main.ts:1254`). Calls made outside a project (schedule topics, channel episode summaries, cast pictures, a design's picture edits and artwork) go through `createStandaloneMeter` (`packages/app/src/main.ts:432`, `packages/app/src/kernel/runner/standalone.ts:217-227`).
- Plan-limit gate: every provider call to a provider that `planAccountOf` maps to an account — `claude-code`, `codex`/`codex-image` (one shared account), `gemini` (the Antigravity CLI; `packages/app/src/kernel/ports/plan-limits.ts:7-15`) — made by a project stage (`providers.ts:139-159`; wired `main.ts:1256-1261`).
- Reads (no authority check, local API):
  - `GET /api/projects/:id/run-cost` → `runCostOf` (`packages/app/src/edge/http/run-cost.ts:17-27`; mount `packages/app/src/edge/http/app.ts:255`).
  - `GET /api/home/week?since=<ISO>&channelId=<id?>` → `weekSummary` (`packages/app/src/edge/http/home.ts:9-20`; mount `app.ts:257`). The browser sends Monday 00:00 of the viewer's time zone (`packages/web/src/home/api.ts:10-25`).
  - `GET /api/projects/:id` attaches ETA fields to running stages via `stagesWithEta` (`packages/app/src/edge/http/projects.ts:123-128`).
  - `GET /api/projects` and the calendar agenda attach `limitWaits` per project via `limitWaitsByProject` (`projects.ts:82-101`, `packages/app/src/slices/schedules/agenda.ts:195`).

## Steps

### Pricing a call (`priceCall`, `packages/app/src/slices/run-cost/pricing.ts:78-135`)

1. The catalogue is read per call, so a refreshed catalogue prices the next call only (`packages/app/src/slices/run-cost/meter.ts:20-21`, `:30`).
2. Local CLI provider (`isLocalCliProvider`): `onPlan: true`, `cost: 0`. For `llm` calls only, `apiEquivalentOf` finds the OpenRouter-listed API model and `apiCost` = `tokenCost` of the reported tokens; images from Codex get no API price (`pricing.ts:80-96`).
3. `apiEquivalentOf` (`pricing.ts:45-76`): strips `[...]` context tags and `-YYYYMMDD` suffixes; `claude-code` maps `opus|sonnet|haiku|fable[-major[-minor]]` to `anthropic/claude-<name>-<major>[.<minor>]`, an alias with no version to the numerically newest listed `anthropic/claude-<name>-*`; `codex`/`codex-image` → `openai/<model>`; `gemini` → `google/<slug>` with a trailing `-low|-medium|-high` effort suffix removed (`pricing.ts:73-75`); empty or `codex-imagegen` → none.
4. System voice provider and the bundled samples' stand-in providers (`sample-writer`, `sample-artist`, `sample-voice`): cost 0, no rates (`pricing.ts:97-99`, `packages/app/src/slices/settings/model.ts:84-87`). A sample project's calls stored with no price before are read as free in the Run cost tab (`panel.ts:112-120`), and the tab words them "$0 · sample, free" (`packages/web/src/project/run-cost.tsx`).
5. Other providers: looked up in the catalogue family (`video` uses the `image` family) by provider+model (`pricing.ts:100-104`).
   - `llm`: `tokenCost` = ((in − cached)·input + cached·(cachedInput ?? input) + out·output) / 1,000,000, cached clamped to 0..in; null if input or output rate is missing (`pricing.ts:25-40`), or if tokens were not reported (`:108-113`).
   - `tts`: characters / 1,000,000 × `perMillionCharacters`; a per-minute voice stays unpriced (`:113-120`).
   - `image`/`video`: `perImage` × `images` (default 1) (`:121-125`).
   - A model the catalogue does not price gives `cost: null` — unknown, never free (`pricing.ts:5-7`).
6. The stored `price_json` holds `{catalogue: updatedAt, model, ...rates}` (`pricing.ts:94`, `:133`).

### Recording (`createUsageMeter`, `meter.ts:27-77`)

7. One `provider_usage` row per successful call: project, stage, kind, provider, model, tokens (in/out/cached), characters, images, seconds, size, quality, `wall_ms`, `on_plan`, `cost`, `api_model`, `api_cost`, `price_json`, `created_at` (`meter.ts:33-60`; table `packages/app/src/kernel/db/migrations/0027-run-cost.sql:5-28`).
8. When the call has a plan account and the CLI reported windows, a `plan_limit_readings` row stores `{before?, after?, usageId}`: the windows, and the id of the call's own `provider_usage` row, so the tab later knows when that call ran and how many tokens it used (`meter.ts:61-74`; `0027-run-cost.sql:32-39`). Window kinds come from minutes: 300 → `five_hour`, 10080 → `weekly`, else `other` (`plan-limits.ts:46-50`).
9. Standalone calls write `standalone_usage` with owner kind (`schedule`, `channel` or `design`; purposes `topics`, `episode-summary`, `cast-image`, `picture-edit`, `design-art`; `kernel/runner/meter.ts:36-48`) and id, the resolved channel (a schedule's template channel, a design's own channel, else the default channel; `meter.ts:125-137`), purpose, and the reading inline (`meter.ts:81-136`; `packages/app/src/kernel/db/migrations/0040-standalone-usage.sql:8-35`).

### Waiting on a plan limit (`createLimitGate`, `packages/app/src/slices/run-cost/limits.ts:30-123`)

10. Before each gated call, `ready(account)` reads `plan_limit_waits.retry_at`; none → proceed; past → delete the row and proceed (`limits.ts:72-84`).
11. Future → register the waiter (`plan_limit_waiters` INSERT OR IGNORE, keyed project+stage+account; an in-memory count so parallel calls of one stage show one wait) and emit `project.updated` on first insert, then sleep until `retry_at` and loop (`limits.ts:43-52`, `:85-93`; emit `main.ts:1260`). The wait happens outside the provider queue, holding no slot (`providers.ts:143-144`).
12. A call failing with `fault.planLimit` (Claude Code, Codex text and image, Antigravity adapters: `packages/app/src/adapters/llm/claude-code.ts:282-291`, `packages/app/src/adapters/llm/codex.ts:281-282`, `packages/app/src/adapters/image/codex.ts:359-360`, `packages/app/src/adapters/llm/antigravity.ts:262-282`) is not retried by the attempt loop (`packages/app/src/kernel/runner/attempt.ts:140-148`); `exhausted(hit)` stores the wait and the call loops back to `ready` with a fresh attempt set (`providers.ts:148-157`).
13. `exhausted` sets `retry_at` = stated reset + 2 min (`resetMarginMs`) when the reset is in the future, else now + 30 min (`recheckMs`); the upsert only moves `retry_at` later, never earlier (`limits.ts:16-18`, `:95-113`). An info log line records the wait (`:118-120`).
14. On a completed sleep the last waiter of the key deletes its `plan_limit_waiters` row and emits `project.updated` (`limits.ts:56-69`).

### Run cost tab (`runCostOf`, `packages/app/src/slices/run-cost/panel.ts:130-213`)

15. All `provider_usage` rows of the project, in order, are summed into a total, per stage and per (provider, model, kind) (`panel.ts:131-175`). Per line: `calls`, known `cost` (null cost adds 0 and increments `unpriced`, except a sample stand-in's, which is free), `apiEquivalent` summed over on-plan rows (null when none), `apiUnpriced` for on-plan rows without an API price, and usage totals (`panel.ts:110-128`).
16. Stages that ran without provider calls still appear with their working time (`panel.ts:176-178`). `byStage` follows pipeline order; `byModel` sorts by cost desc, then API equivalent desc, then provider and model (`:198-208`).
17. `catalogueDate` is the catalogue date of the last priced row (`panel.ts:174`, `:215-219`).
18. Plan use per account with calls (`planUses`, `slices/run-cost/plan-readings.ts:91-131`; the window arithmetic is `windowUse`, `slices/run-cost/plan-use.ts:76-176`). A plan's readings are account-wide: they move with every use of the account, this project's or not, so a run is charged only what its own calls took:
    - Each of the project's readings is matched through its `usageId` to its call's start (`created_at − wall_ms`), end and tokens; for the account it also loads every call on it, from any project or schedule or design, since the project's first call less 15 minutes (`beforeGapMs`), with their readings (`plan-readings.ts:54-89`, `:135-175`).
    - A call with a before and an after reading is charged `after − before` when no other call on the account overlapped it in time. Overlapping calls with known tokens split the rise by tokens. A call whose share cannot be told apart (an overlap with a call that reported no tokens, or none of its own) is counted as `shared` and charged nothing. Claude Code reports its windows once, after the call, so such a call takes the account's latest reading within the 15 minutes before it as its "before" (`pointBefore`, `plan-use.ts:96-153`, `:178-201`).
    - A window rolled over within a call when the reading dropped or the stated reset passed; across calls only when the stated reset passed or a drop came with a reset moved on by more than an hour, because parallel calls report out of order (`rolledOver`, `newWindow`, `plan-use.ts:203-244`). The account's own rise is measured from the readings' range, per window, at most 100 (`accountRise`, `:209-232`).
    - Each window answers `usedPercent` (null when no call's share could be told apart; never above `accountPercent` or 100), `basis` `measured` / `split` / `shared` / `approximate`, `sharedCalls`, `fromPercent`, `accountPercent`, `rolledOver`, `nowPercent` and `resetsAt` (`plan-use.ts:14-30`, `:160-176`). `approximate` is a project whose readings were stored before `usageId` was kept: only the account's rise is known, so it is said to be shared with other use. `reported: false` when no readings exist (`plan-readings.ts:17-25`, `:118-129`).
    - The tab words it from `plan-share.ts`: the big number "5%", "~5%" (split), "at least 5%", "up to 45%" or "Shared", its label, "This run used 5% of your weekly Codex limit, from each call's own readings.", and beside it the account's own reading "Claude weekly: 34% → 61% while this ran (all use on this account) · resets Tue 14:00." (`packages/web/src/project/plan-share.ts:8-66`, `packages/web/src/project/run-cost.tsx:176-181`, `:272`).
19. `waits` lists waits only for stages whose state is `running` (`panel.ts:242-276`).

### Working time and the run clock (`projectTiming`, `packages/app/src/slices/run-cost/timing.ts:51-117`)

20. Attempt intervals per stage: an attempt without `ended_at` counts up to `now` only while its `revision_work` state is `running`, else as zero length (`timing.ts:84-88`). Overlapping intervals count once (`coveredMs`, `:38-49`), so review waits, plan-limit waits and pauses between attempts do not count.
21. A run is one revision's attempts; work reserved into the current revision (`revision_work_reservations`) counts toward the current revision (`timing.ts:68-77`, `:92-102`). The latest run is the current revision's, else the revision with the most recent attempt start; `current` says which (`:104-113`).
22. `totals.wallMs` is all attempts covered once; `byStage` per stage (`timing.ts:107-116`, `panel.ts:188-196`).
23. `RunClock` shows "Working for …" (adding elapsed time since the fetch while `running`) or "… of work so far", ticking each second, only for the current run of a project not in `done`/`partial`/`failed`/`canceled` (`packages/web/src/project/run-cost.tsx:81`, `:87-129`). `RunCostSummary` shows "This run cost $X" / "Spent so far", "plus unpriced calls", "~$Y via API", work time only once the run ended and something was recorded (`run-cost.tsx:48-65`).
24. The run cost query sits under the project's query key, so every project event refetch refreshes it; project queries refetch every 15 s while running or pending (`packages/web/src/queries.ts:28-29`, `:70-91`).

### Time left (`packages/app/src/slices/eta/`)

25. `stagesWithEta` reads history only when a stage is running (`packages/app/src/slices/eta/view.ts:14-15`) and adds `typicalSeconds` (rounded), `etaBasis`, `etaSeconds` (`view.ts:16-32`; fields `packages/app/src/slices/admission/model.ts:362-366`).
26. `readStageHistory`: up to 400 most recent `done` stages with start and finish; seconds = finish − start (>0); `units` = `progress_total` when >0 (`packages/app/src/slices/eta/history.ts:8`, `:31-50`). The step's model key is `provider/model` of `llm` (research, article), `audio` (audio), `images` (images, thumbnail), none for other stages (`packages/app/src/slices/eta/model.ts:75-87`).
27. `typicalSeconds`: pool = same kind and model if at least 2 samples (`ownModelMinimum`), else same kind; with a known unit count and counted samples, median(seconds / units) × units; else median seconds; no samples → undefined (`history.ts:11`, `:52-62`, `:75-81`).
28. `stageEta` (`model.ts:32-47`): not running → none. Progress counted (`current > 0`, `total > 0`) → `progress`, seconds = spent / current × (total − current), 0 when complete. Else typical known and positive → `history` with typical − spent, or `overdue` once spent ≥ typical. Else `unknown`.
29. The browser recomputes `stageEta` every second on the project page and Home's Running now from the stage rows' `typicalSeconds` (`packages/web/src/project/run-aside.tsx:74-79`, `packages/web/src/home/running-now.tsx:53-71`). Running now's line is "<count> of <total> · <eta>"; a stage reporting a named activity shows that instead ("Rendering the video (45%) · <eta>", or the activity alone while the basis is unknown) (`runningDetail`, `running-now.tsx:58`; `activityText`, `packages/web/src/project/summary.ts:113`). `etaLabel`: "time left unknown", "taking longer than usual", "finishing up" (≤0 s), "under a minute left", "about N min left", "about H h [M min] left" (`model.ts:51-64`).

### Home "This week" (`weekSummary`, `packages/app/src/slices/run-cost/week.ts:70-135`)

30. Sums calls, known cost, unpriced count and API equivalent over `provider_usage` and `standalone_usage` rows with `created_at >= since` (`week.ts:79-116`). With `channelId`, project rows count when the project's channel (default when unset) matches; standalone rows whose channel no longer exists count under the default channel (`week.ts:71-74`, `:112-115`).
31. `videos` counts `outputs` with role `video` created since, a remade video counting again, but never the video of a Template Studio sample or bake-off copy (`week.ts:117-124`). The studio's samples are hidden projects: their calls count in `cost` and `calls` for the whole account but never for a channel, and their cost is also reported apart as `studioCost`, with the spend kept for copies removed since (`template_studio_spend`) (`week.ts:85-105`, `:125-134`; `packages/web/src/home/week.tsx`). Design pictures are standalone rows counted under the design's channel (Step 9).
32. Plan standings are never narrowed by channel: per account, the newest of the last 20 readings (project or standalone) that parses and has windows, taking `after` else `before`, giving weekly and 5-hour percent and weekly reset (`week.ts:67-69`, `:146-180`).

### Account limits that can stop work (read, not enforced)

33. The autopilot's hourly check (51-autopilot-health-and-topic-scoring.md) reads two more limits that can stop scheduled runs and shows them as Home warnings; neither gates a call. The OpenRouter key's own spending limit and what is left of it: `GET https://openrouter.ai/api/v1/key` with the saved key, answering `limit` and `limit_remaining` (null for a key with no limit; a non-2xx or an unreadable answer throws with the status only and the check skips it). The free space of the disk the data folder is on (`statfs`) (`packages/app/src/adapters/account-limits.ts:14-38`, `packages/app/src/autopilot-timers.ts:16-50`). The warnings say when a CLI plan window is nearly used up (from Step 32's standings), when the key has little left ("so runs that use OpenRouter stop when it runs out") and when the disk is low (`packages/app/src/slices/autopilot/warnings.ts:79-100`). An exhausted OpenRouter key fails the call like any provider failure, and a used-up CLI plan still makes the call wait (Steps 10-14).
34. The HTTP provider adapters share one failure helper: the status decides the kind (401/403 `auth`, 429 `rate_limit`, 5xx `dropped`, the rest `other`), a 429's `Retry-After` replaces the fixed backoff, and a missing key is `missing_key`, which is terminal (`packages/app/src/adapters/http-failure.ts:22-63`). `access` on a fault (the account can't use the model, `packages/app/src/adapters/model-access.ts:20-35`) never changes the kind, so a run fails or waits exactly as before.

## Branches

- On-plan versus keyed versus system voice pricing: steps 2, 4, 5.
- Progress versus history versus overdue versus unknown ETA: step 28.
- Own-model versus same-kind history pool: step 27.
- Stated reset in the future versus absent/past: step 13.
- Channel filter on Home: step 30; plan standings ignore it, and a Template Studio sample's spend is in no channel's total (step 31).
- Plan use basis `measured` / `split` / `shared` / `approximate`: step 18.

## Unhappy paths

| Case | Behavior | Cite |
|---|---|---|
| Metering throws (DB error) | Logged `usage.record` at warn; the call's result stands | `providers.ts:160-172`, `standalone.ts:217-227` |
| Provider call fails | Not metered: only `result.ok` records. A refusal that says the account can't use the model is learned for the model pickers, which change nothing here (48-model-lists-and-checks.md) | `providers.ts:257-259` |
| Provider reports no usage | Row stored with null tokens; `cost: null` (unpriced) for keyed LLMs | `pricing.ts:108-112`, `meter.ts:45-47` |
| Catalogue lacks the model or rate | `cost: null`; counted in `unpriced`, shown as "plus unpriced calls" / "Plus N calls the model catalogue has no price for." | `pricing.ts:104-126`, `panel.ts:117`, `packages/web/src/project/run-cost.tsx:63`, `:197-199` |
| Catalogue refreshed mid-run | Earlier rows keep their stored cost and rates | `meter.ts:20-21`, `0027-run-cost.sql:1-4` |
| Stored wait write fails | Logged `plan-limits` at error and rethrown to the calling stage | `limits.ts:114-117` |
| CLI names a reset already past (clock skew) | Recheck in 30 min | `limits.ts:98-99` |
| Allowance still used up after waking | The call fails again with a plan limit and stores a new wait | `limits.ts:79` |
| Cancel/pause during a wait | Sleep aborts; the waiter row stays; the row is hidden because the stage is no longer `running` | `limits.ts:54-64`, `panel.ts:246-251` |
| App stops during a wait | Boot deletes all `plan_limit_waiters` and resumes each project whose waiting stage is `failed`/`interrupted` and not paused, via a `resume` recovery, except a Template Studio sample, which the studio's own recovery resumes after checking its budget; a refused resume is logged with "use Continue the run on the project page" | `limits.ts:130-161`, `main.ts:593-607` |
| Unknown project on run-cost | 404 "This project no longer exists. Go back to Projects to pick another." | `run-cost.ts:20-24` |
| Invalid `since`/`channelId`/`id` | 400 via `onInvalid` | `home.ts:14-17`, `run-cost.ts:9` |
| Attempt left open by a crash | Counts zero time, so the clock never runs on | `timing.ts:84-87` |
| Unparseable reading JSON shape | Skipped | `plan-readings.ts:67-71`, `week.ts:159-160` |
| Stage waiting on a plan limit | Still `running`; the history ETA keeps counting the wait and turns `overdue` (no wait awareness in `stageEta`) | `model.ts:32-47` |
| Standalone calls hitting a plan limit | No gate: `StandaloneDeps` has a meter but no `LimitGate` | `packages/app/src/kernel/runner/standalone.ts:20-28` |

## State transitions

- `plan_limit_waits` per account: absent → waiting (`exhausted`) → later `retry_at` only (`exhausted` again) → deleted on the first `ready` past `retry_at` (`limits.ts:80-82`, `:102-113`).
- `plan_limit_waiters` per (project, stage, account): absent → present (sleep begins) → deleted on a completed sleep, or at boot (`limits.ts:46-51`, `:65-67`, `:145`).
- `provider_usage`, `plan_limit_readings`, `standalone_usage`: append-only; no code updates or deletes a row, except the cascade on project delete for the two project tables (`0027-run-cost.sql:7`, `:34`).
- ETA and run clock hold no state; both are derived per read.

## Invariants

- A cost is fixed when its call lands; later catalogue changes never rewrite it (`0027-run-cost.sql:1-4`).
- An unpriced call is never treated as zero known cost: it is counted apart (`pricing.ts:5-7`, `panel.ts:32-34`).
- A CLI call's own cost is $0; its API figure is reported separately as `apiEquivalent` (`pricing.ts:13-19`).
- One wait per account, shared by every project; the wait never moves earlier (`limits.ts:10-13`, `:106`).
- A shown wait always belongs to a running stage (`panel.ts:246`).
- Time left is never invented: without progress or history the basis is `unknown` (`model.ts:1-7`).

## Outcomes & side effects

- Rows in `provider_usage`, `plan_limit_readings`, `standalone_usage`; `plan_limit_waits`/`plan_limit_waiters` rows while waiting.
- `project.updated` hub events when a stage starts or ends a wait (`limits.ts:24-25`, `main.ts:1260`).
- Backups carry `provider_usage`, `plan_limit_readings` and `standalone_usage`; `plan_limit_waits` and `plan_limit_waiters` are left out (`packages/app/src/slices/storage/backup-format.ts:72-80`, `:112`; `packages/app/src/slices/storage/backup-export.ts:379`).
- Log lines: `plan-limits` info/warn/error, `usage.record` warn.

## Dimensions not in play

- D1 Authority: no per-user rule; reads and metering are local and unauthenticated.
- D3 Input: only the id param and `since`/`channelId` query are validated (`run-cost.ts:9`, `home.ts:14-17`).
- D5 Money: amounts are recorded in USD (`panel.ts:62`) and nothing is charged, refunded or capped here; spend ceilings are in `18-cost-review-batch.md`.
- D6 Limits: no Slopify-side spend limit on a running project; the only limit is the CLI plan allowance the CLI itself reports. Two other account limits are read, not enforced (next section).
- D12 Visibility: data never leaves the machine and is independent of the telemetry notice (`meter.ts:24-26`).
- D13 Notification: no user notification on a plan-limit wait beyond the page refresh event and the "Waiting for … limits" lines (`packages/web/src/home/running-now.tsx:96-97`).
- D15 Record and audit: retention of usage rows is the project's lifetime (cascade); `standalone_usage` has no link to its schedule or channel and survives their deletion (`0040-standalone-usage.sql:4-5`).
