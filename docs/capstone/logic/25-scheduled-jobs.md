---
absorbed_from:
  - features/2026-09-13-scheduled-jobs@2026-09-13
scenario: scheduled-jobs
mockup_row: S25
screens:
  - 09-schedules
depends_on:
  - 04-run-admission
  - 18-cost-review-batch
  - 22-play-drafts
  - 24-project-templates
generated_at_commit: d6a72d6428ff
generated_date: 2026-10-18
capstone_version: 7.0.1
content_hash: dc67b1009191
paths_covered:
  - ":(top)packages/app/src/slices/schedules/**"
  - ":(top)packages/app/src/slices/project-templates/setup.ts"
  - ":(top)packages/app/src/slices/project-templates/repo.ts"
  - ":(top)packages/app/src/slices/template-studio/schedule-gate.ts"
  - ":(top)packages/app/src/slices/template-studio/gate.ts"
  - ":(top)packages/app/src/slices/agents/attention-templates.ts"
  - ":(top)packages/app/src/slices/trash/service.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-store.ts"
  - ":(top)packages/app/src/slices/cancel/index.ts"
  - ":(top)packages/app/src/slices/channels/repo.ts"
  - ":(top)packages/app/src/slices/run-cost/meter.ts"
  - ":(top)packages/app/src/kernel/db/migrations/0009-scheduled-jobs.sql"
  - ":(top)packages/app/src/kernel/db/migrations/0010-retain-schedule-history.sql"
  - ":(top)packages/app/src/kernel/db/migrations/0026-schedule-topic-generation.sql"
  - ":(top)packages/app/src/edge/http/schedules.ts"
  - ":(top)packages/app/src/main.ts"
  - ":(top)packages/web/src/schedules/**"
  - ":(top)packages/app/src/kernel/db/migrations/0043-prepared-videos.sql"
  - ":(top)packages/app/src/kernel/db/migrations/0068-topic-scores.sql"
  - ":(top)packages/app/src/kernel/db/migrations/0073-schedule-design-kind.sql"
  - ":(top)packages/web/src/routes/calendar.tsx"
---

# 25 Scheduled jobs

A schedule is a local recurrence over a project template plus a queue of topics. Each due occurrence builds a fresh Play draft from the version of the template it may run, reviews it and starts it through the ordinary Play Start path while Slopify is running, unless a project prepared ahead for that topic (or an unfinished one of the same title) exists, which it continues instead (`packages/app/src/slices/schedules/scheduler.ts:171`). A schedule can also ask an LLM to refill its topic queue.

**The version a schedule runs** (4.0, owned by the template studio, 46-template-studio.md): until a version of the template is first marked ready in its studio, the template's newest version, exactly as in 3.x, and the Schedules screen says "Not checked in the studio". From the first Mark ready on, the template is gated: schedules run the newest version that is marked ready, carried over from one by Slopify (a retired-model switch, a rename on restore) or saved before the studio, and a newer version waits to be marked ready while they keep running the ready one (`packages/app/src/slices/template-studio/gate.ts:19-36`). The seam is `ScheduleDeps.template` (the runnable version), `.notReady` (the sentence when a gated template has nothing to run), `.templateHead` (the newest version, for keyword checks) and `.templateGate` (what the screen shows), wired in `main.ts:633-636` from `packages/app/src/slices/template-studio/schedule-gate.ts:22-57`. A design schedule's template is not a project template: it makes the newest ready design revision (`runnableDesignVersion`, `packages/app/src/slices/designs/gate.ts:26`), always gated.

## Trigger & preconditions

- HTTP under `/schedules`: list, create, read, update (`PUT /:id`), `pause`, `resume`, `cancel`, `DELETE /:id`; topics: `GET /:id/topics/held`, `POST /:id/topics/generate`, `approve-all`, `/:topicId/approve`, `/:topicId/reject`, `PUT /:id/topics/held/:topicId`, `PUT /:id/topics`, `move`, `transfer`; prepare ahead: `GET /:id/prepared`, `POST /:id/topics/prepare` (`packages/app/src/edge/http/schedules.ts:257-297`); plus `GET /calendar` (`packages/app/src/edge/http/schedules.ts:440-457`, `packages/app/src/edge/http/app.ts:243).
- Create input (`packages/app/src/slices/schedules/schema.ts:112-143`):
  - `id` UUID, `name` trimmed 1–200, `templateId` + `templateVersion`.
  - `cadence`: `once` (future ISO instant), `daily` (`HH:MM`), or `weekly` (`HH:MM` + 1–7 weekdays 0–6) (`packages/app/src/slices/schedules/calendar.ts:5`).
  - `templateKind` `project` (default) or `design`, and for a design schedule the cadence `by-date` (`time` only) and rows instead of topics (52-designs.md; `packages/app/src/slices/schedules/schema.ts:102-105`, `packages/app/src/slices/schedules/design-check.ts:14-64`).
  - `timezone`: any IANA name `Intl` accepts (`packages/app/src/slices/schedules/calendar.ts:25-31`).
  - `missedPolicy` `skip|run-once` (default `skip`); `overlapPolicy` fixed `skip`.
  - `spendLimitCents` nonnegative integer or null; the form asks for whole cents (`packages/web/src/schedules/form.tsx:195`).
  - `items` up to 500 topics `{title 1–200, values}`; `topicKeyword` (the template keyword each topic fills) or null; `values` (every-run keyword values, each ≤10000 chars); `brief` ≤4000 chars; `topicGeneration {mode off|queue|hold, keepAtLeast 1–100, llm|null}` (`packages/app/src/slices/schedules/schema.ts:36`, `:76`).
  - `topicScoring` `off` (default), `library` or `search`: how found topics are ranked; left out of an update it keeps the saved value (`packages/app/src/slices/schedules/schema.ts:98-99`, `:140`, `:185`, `packages/app/src/slices/schedules/service.ts:343`; 51-autopilot-health-and-topic-scoring.md).
- The template must exist and must not use supplied media: provided audio, images or thumbnail, shorts music while shorts are on, an uploaded ambient bed, or a provided establishing image while images generate (`packages/app/src/slices/schedules/service.ts:273-279`).
- `topicKeyword`, every-run `values` keys and each new or changed topic's keys must be keywords of the template (its title slots plus its stored values), of the version it runs or of the newest one, which may not be marked ready yet (`scheduleKeywords`, `packages/app/src/slices/schedules/topic-list.ts:238`); keywords Slopify fills itself (`Slopify_…`) are never fields, so they are not among them (47-builtin-keywords.md); titles ≤200 and topic values ≤2000 chars; unchanged saved topics are not rechecked (`packages/app/src/slices/schedules/service.ts:283-315`, `packages/app/src/slices/schedules/topic-list.ts:22`, `:75`).
- A `once` cadence in the past is `not-due` (`packages/app/src/slices/schedules/service.ts:76-77`).

## Steps

1. **Create** is idempotent on `id` via `creation_hash`; it records the version of the template it may run (`checkTemplate` answers `deps.template`'s version, `packages/app/src/slices/schedules/service.ts:260-281`) "for the record", computes `next_run_at` and saves `active`. Saving never runs anything (`packages/app/src/slices/schedules/service.ts:51-87`).
2. **Boot and timer.** `scheduleRunner.recover` clears topic-generation leases and fails `running` occurrences (after adopting project IDs from a Start receipt that committed); `settleTerminalScheduleRuns` freezes finished occurrences before the UI opens; a tick runs at boot and every 15 s under the updater's mutation lease, one in flight at a time (`packages/app/src/main.ts:650`, `:358`, `:651-659`, `:981-983`, `:253`, `packages/app/src/slices/schedules/scheduler.ts:95`).
3. **Tick** (`packages/app/src/slices/schedules/scheduler.ts:74`): recover stuck runs, start due topic generations in the background, then claim every `active`, non-deleted schedule with `next_run_at <= now` (`packages/app/src/slices/schedules/repo.ts:72`) and execute the claims concurrently.
4. **Claim** (`packages/app/src/slices/schedules/scheduler.ts:102`), in one transaction against the version read:
   - Missed: `skip` policy and now more than 60 s past the slot (`next-run.ts:11`, `scheduler.ts:115`).
   - Overlap: a `running` occurrence, or any project admitted by an unsettled occurrence still nonterminal (`packages/app/src/slices/schedules/repo.ts:341-371`).
   - No topic: generation on and the queue empty (`scheduler.ts:135-138`).
   - Not ready: with a topic, a gated template with no version marked ready (`notReadySentence`) skips the run: it is recorded `skipped` with "Not started: <template> has no version marked ready. Open it in Library → Templates → Open studio and press Mark ready.", nothing is spent and no topic is used (`scheduler.ts:139-142`, `:159`). The calendar shows such a run with `notReady` (`packages/app/src/slices/schedules/agenda.ts:92`, `schema.ts`), and the agents' attention list reports the schedule as `template-not-ready` (`packages/app/src/slices/agents/attention-templates.ts:12-44`).
   - Inserts one `schedule_runs` row, unique on `(schedule_id, scheduled_for)`; a duplicate insert drops the claim (`packages/app/src/slices/schedules/repo.ts:214-238`, `packages/app/src/kernel/db/migrations/0009-scheduled-jobs.sql:36`).
   - Advances `next_run_at` to the first occurrence after now; none left → `completed` (`scheduler.ts:116-123`).
5. **Execute** (`packages/app/src/slices/schedules/scheduler.ts:180`):
   - `scheduledDocument` reads the version the template may run (`deps.template`, `packages/app/src/slices/schedules/prepare.ts:37`; missing → `missing-template`) and builds `freshTemplateDraft` + first queued topic: values per `scheduledValues` (template values, then every-run values, then the topic's values, then the topic in `topicKeyword`); `variants: []`. The draft's title keeps its keywords when rendering it with those values gives `renderedTitle`'s result, so the project records the keyworded title as its `titlePattern` (scenario 27); otherwise the filled title is used (without a keyword the topic is the whole title) (`scheduler.ts:183-186`, `packages/app/src/slices/schedules/prepare.ts:32-55`, `packages/app/src/slices/schedules/topic-list.ts:32`, `:50`).
   - Prepared check: `preparedProject` looks up a live `prepared_videos` row for this schedule and the filled title (`scheduledTitle`) whose project is not canceled; else, only when the run has a topic, the newest live project of the same title whose state is not `done`/`partial`/`failed`/`canceled`. When one is found, `continuePrepared` runs, the occurrence records that project, removes the topic and is `succeeded`, with no draft, review, spend check or Start (`scheduler.ts:187-201`, `packages/app/src/slices/schedules/prepare.ts:143-178`).
   - `createDraft` (the draft carries the template's channel), `reviewDraft` at version 1 (`scheduler.ts:202-205`, `packages/app/src/slices/project-templates/setup.ts:73`).
   - Spend check: with a limit set, any estimate with `unknown > 0`, or the summed `high` × 100 above `spendLimitCents`, is `spend-limit` (`scheduler.ts:206-212`).
   - Persists the review ID and estimate on the run, then `startPlayDraft` (`scheduler.ts:213-218`, `:219-223`).
   - `recordRunDispatch` stores project IDs and removes the used topic from the queue by value in the same transaction, logging it as a `used` topic; the run that empties a generation-off queue completes the schedule (`packages/app/src/slices/schedules/repo.ts:272-295`, `:297-329`).
   - Marks the occurrence `succeeded`. This means admitted, not generated; stages continue through the runner (`scheduler.ts:231-235`).
6. **Settlement.** Every terminal project write and every cancel calls `settleScheduleRunsForProject`, which stamps `projects_settled_at` once all projects of an occurrence are terminal; that closes overlap accounting for good (`packages/app/src/slices/rebuild/runtime-store.ts:307`, `packages/app/src/slices/cancel/index.ts:143`, `packages/app/src/slices/schedules/repo.ts:378-405`). A trashed project counts as not active (`packages/app/src/slices/schedules/repo.ts:426-431`).
7. **Topic generation** (`packages/app/src/slices/schedules/topics.ts:78`):
   - Due when the schedule is active, the queue (plus held topics in `hold` mode) is below `min(keepAtLeast, 500)`, no live lease exists, and the last failure is at least 5 min old (`topics.ts:53-58`, `:61-70`).
   - Lease: `topics_generating_at`, taken only when empty or older than 15 min; released after the call (`topics.ts:103-114`, `:121-127`).
   - LLM: the schedule's own or the template's; one standalone call metered to the schedule's channel, 10 min timeout (`topics.ts:145-152`, `:155-158`, `packages/app/src/slices/run-cost/meter.ts:81-124`).
   - Prompt: the schedule brief, else the channel's series brief; asks for `min(wanted + 5, 50)` topics ranked most view-worthy first and lists every known title as forbidden (`topics.ts:167-172`, `:343-382`).
   - Known titles: this schedule's queued, held, rejected and used topics, and titles of live projects and existing videos in the schedule's channel (`topics.ts:303-330`).
   - Answer parsed as a JSON string array or one topic per line, each ≤200 chars (`topics.ts:385-404`); near-duplicates dropped (exact normalised match, word Jaccard ≥0.6, or containment ≥0.5; project titles match when all topic words appear, with a stricter clause rule for 1–2 word topics) (`packages/app/src/slices/schedules/similar.ts:16`, `:61`, `:79`, `:132`).
   - `queue` mode appends to `items`; `hold` mode inserts `schedule_topics` rows `held` with ranks and emits `schedule.topics` (UI event + notification) (`topics.ts:231-241`, `:242-253`, `packages/app/src/main.ts:640-643`).
   - **Generate topics now** forces a generation, ignoring the failure wait and asking for at least 5 even when full (`topics.ts:76-78`, `packages/web/src/schedules/held-topics.tsx:121`).
8. **Held topics**: approve (one, selection or all; optional rename) appends to the queue in rank order, refused past 500 (`queue-full`); reject records `rejected`; edit changes the title and per-topic keyword values checked against the template (`packages/app/src/slices/schedules/topics.ts:472`, `:506`, `:525`). Per-topic values of held topics live in settings key `schedules.held-topic-values` (`topics.ts:408`).
9. **Prepare ahead** (Schedules calendar → a queued run → Prepare; `packages/web/src/calendar/day-cell.tsx:212-274`): `POST /:id/topics/prepare` with `{topic}` (1–500 chars) → `prepareTopic` (`packages/app/src/slices/schedules/prepare.ts:66-120`):
   - The topic must be in the schedule's queue (`not-found` 404); the template must exist (`missing-template`) and, when gated, have a version marked ready (`not-ready` with the same sentence, `prepare.ts:79-80`); no prepared project, and no unfinished live project, of the same filled title may exist (`already-prepared`; the lookup is `preparedProject` with title matching on).
   - `heldBeforeVideo` adds a Before Video checkpoint when the draft generates video and has none (`added_checkpoint` 1); a draft without generated video gets no hold and runs to the end (`packages/app/src/slices/schedules/prepare.ts:124-135`).
   - It creates a draft, reviews it, applies the same spend check as a scheduled run (`spend-limit`), starts it through `startPlayDraft`, and inserts `prepared_videos(project_id, schedule_id, title, added_checkpoint, prepared_at)` (`packages/app/src/slices/schedules/prepare.ts:81-120`, `packages/app/src/kernel/db/migrations/0043-prepared-videos.sql:6-13`).
   - Answers 201 `{projectId, title}`; refusals are 409 (404 for `not-found`) with a sentence per reason, review field messages appended when present (`packages/app/src/edge/http/schedules.ts:262-297`).
   - The topic stays in the queue; it is used by the occurrence that continues the project.
   - On the day, `continuePrepared` removes the preparation's own Before Video checkpoint (when `added_checkpoint` is 1) through `changeCheckpoints` on the head revision, keeping any other checkpoint, deletes the `prepared_videos` row and ticks the runner (`packages/app/src/slices/schedules/prepare.ts:183-199`).
   - `GET /:id/prepared` lists the queued topics that have a prepared project (`preparedTopics`, `packages/app/src/slices/schedules/prepare.ts:202-215`); the calendar run carries `prepared` (project id or null) for a queued topic, by the same lookup, so an unfinished same-title project also shows, shown as "Prepared" with Open (`packages/app/src/slices/schedules/agenda.ts:117-122`, `packages/app/src/slices/schedules/schema.ts:221-223`, `packages/web/src/calendar/day-cell.tsx:194-195`, `:236-245`).
10. **Queue editing**: `PUT /:id/topics` replaces the whole queue; `move` reorders by position; `transfer` moves one topic to another open schedule's queue; all compare `baseVersion` (`packages/app/src/slices/schedules/topics.ts:603`, `:577`, `:630`).

## Branches

- **Cadence**: `once`, `daily`, `weekly` computed in the saved zone; a nonexistent local time resolves with Temporal `compatible` disambiguation; the search looks at most 8 days ahead (`packages/app/src/slices/schedules/calendar.ts:34`).
- **Missed occurrence**: `skip` → skipped run "Skipped because Slopify was not running at the scheduled time."; `run-once` → runs once, later missed slots are passed over when `next_run_at` is advanced past now (`packages/app/src/slices/schedules/scheduler.ts:115`, `:154-160`).
- **No queue, generation off**: every run uses the template version it may run; the schedule never completes on its own (`packages/app/src/slices/schedules/scheduler.ts:130`, `packages/app/src/slices/schedules/agenda.ts:90`).
- **Generation on, queue empty**: skipped with a reason naming held topics waiting approval, the last generation error, or a generation still pending (`packages/app/src/slices/schedules/scheduler.ts:172-178`); an emptied queue does not complete the schedule (`packages/app/src/slices/schedules/repo.ts:310-313`).
- **Topic scoring on** (`library` or `search`): topics a find returns are scored, the best kept, and the queue (or the held list) put in score order; topics the person added or moved keep their place; Rescore scores every queued and held topic again (`packages/app/src/slices/schedules/topics.ts:190-253`, `packages/app/src/slices/schedules/rescore.ts:15-61`; 51-autopilot-health-and-topic-scoring.md). Off, finding and ordering are as before it existed.
- **Design schedule** (`templateKind: design`): never reaches `execute`; a due run takes the row due soonest, makes its designed piece from the design template's ready version and removes the row; a row whose date is over is skipped, and a run that cannot start keeps its row and tries again the next day (`packages/app/src/slices/schedules/scheduler.ts:108-111`, `packages/app/src/slices/schedules/design-run.ts:24-155`; 52-designs.md).
- **Update**: allowed on `active`/`paused` only; `mutationId` replay; `active` recomputes the next slot from now; `paused` keeps it null or recomputes; saving clears a recorded generation failure (`packages/app/src/slices/schedules/service.ts:89-146`).
- **Pause** keeps `next_run_at`; **Resume** recomputes from now (none left → `completed`); **Cancel** from `active` or `paused` clears `next_run_at` (`packages/app/src/slices/schedules/service.ts:148-178`, `:180-185`, `:207-235`).
- **Delete** only after `completed`/`canceled` (`cancel-required`), sets `deleted_at` and puts it in Settings → Trash; the run history stays readable (`packages/app/src/slices/schedules/service.ts:187-205`, `packages/web/src/schedules/view.tsx:274`). Restore brings it back `paused` with no next run, refused when its template is in the trash or gone; removing for good sets `purged_at` and keeps the row as history (`packages/app/src/slices/trash/service.ts:212`, `:268`). Deleting a template a live schedule uses is refused (`packages/app/src/slices/project-templates/service.ts:122`).
- **Prepared or same-title project exists** → the occurrence continues it instead of starting another (step 5). A canceled prepared project, or a trashed one, does not count; a finished project of the same title does not count either, so the day makes a new video. A schedule run without a topic (template as saved) only continues a prepared project, never matches by title (`packages/app/src/slices/schedules/prepare.ts:143-178`).
- **Template edits** reach the next run only while the template is not gated: the scheduler, calendar, Prepare and topic checks read the version the template may run (`deps.template`, `packages/app/src/slices/schedules/model.ts:16-27`, `packages/app/src/slices/template-studio/schedule-gate.ts:41`), which is the head until a version is first marked ready and the newest ready, carried or legacy version after that. A Save in the studio, or any edit, makes a new head that waits for Mark ready; a rename or retired-model switch Slopify makes itself is carried, so the schedule is never stopped by it (`packages/app/src/slices/template-studio/repo.ts:232`). The Library's Used by still reads each template's head version for its schedules (`packages/app/src/slices/library/used-by.ts:176-192`).

## Unhappy paths

| Case | Recorded / shown | Site |
|---|---|---|
| Stale `baseVersion`, reused `mutationId` with a different body, canceled/completed/deleted target | `conflict` 409 | `packages/app/src/slices/schedules/service.ts:106-114` |
| Template with supplied media | `unsupported-media` with the exact Play fix | `packages/app/src/edge/http/schedules.ts:76-79` |
| Unknown keyword or oversized topic | `invalid-topics`, up to five named problems plus a count | `packages/app/src/slices/schedules/service.ts:286-315` |
| Review/readiness/Start refusal | Occurrence `failed` with the reason code, shown as a plain sentence on read; no second admission | `packages/app/src/slices/schedules/scheduler.ts:236-242`, `packages/app/src/slices/schedules/repo.ts:543-570` |
| Over spend limit or unknown price | `failed` "Not started: the estimated cost was above this schedule's spend limit…" | `packages/app/src/slices/schedules/repo.ts:543-570` |
| Process stops mid-run | Boot adopts receipt project IDs, then marks `failed` "Slopify was closed while this run was in progress…" | `packages/app/src/slices/schedules/repo.ts:433-470` |
| Tick throws | Logged `schedule.tick` "Scheduled jobs could not be advanced." | `packages/app/src/main.ts:651-659` |
| Generation fails (no template LLM, provider error, empty or all-duplicate answer) | `topics_failed_at` + `topics_error` "Couldn't generate topics: … Slopify tries again in 5 minutes…" | `packages/app/src/slices/schedules/topics.ts:135-144` |
| Second generation while one runs | `busy` 409 | `packages/app/src/slices/schedules/topics.ts:109-114` |
| Draft created then refused | The draft stays `active` and is listed under Play → Drafts | `packages/app/src/slices/schedules/scheduler.ts:202-205`, `packages/app/src/slices/play-drafts/repo.ts:44` |
| Gated template with no version marked ready | Occurrence `skipped` "Not started: … has no version marked ready…"; Prepare refuses `not-ready` | `packages/app/src/slices/schedules/scheduler.ts:141`, `packages/app/src/slices/schedules/prepare.ts:79-80` |
| Template changed to use supplied media after save | No run-time media check; the draft review refuses and the occurrence fails | `packages/app/src/slices/schedules/scheduler.ts:204-205` |

## State transitions

- Schedule: `active ↔ paused`; `active|paused → canceled`; `active → completed` (no next occurrence, or the queue emptied with generation off); `paused → completed` on Resume with no next occurrence; `completed|canceled → deleted` (tombstone) `→ paused` (trash restore) (`packages/app/src/slices/schedules/service.ts:148-235`, `packages/app/src/slices/schedules/scheduler.ts:123`, `packages/app/src/slices/trash/service.ts:227`). A deleted row must be `completed`/`canceled` with no next run (`packages/app/src/kernel/db/migrations/0010-retain-schedule-history.sql:48`).
- Occurrence: inserted `running` or `skipped` (overlap, a missed slot, no topic, or a gated template with nothing marked ready); `running → succeeded|failed` (`packages/app/src/slices/schedules/schema.ts:203`).
- Prepared video: none → `prepared_videos` row (Prepare) → removed when an occurrence continues it; the row cascades with its project's removal (`packages/app/src/kernel/db/migrations/0043-prepared-videos.sql:7`).
- Topic: queued item → `used` (run started or continued it); generated → `held` → queued (approve) or `rejected` (`packages/app/src/kernel/db/migrations/0026-schedule-topic-generation.sql:13`).

## Invariants

- At most one occurrence per `(schedule, scheduled_for)` and one per Start `request_id` (`packages/app/src/kernel/db/migrations/0009-scheduled-jobs.sql:36`).
- A run whose Start identity is recorded is never admitted twice: the review ID is stored before Start and Play's receipt replays (`packages/app/src/slices/schedules/repo.ts:256-266`, `packages/app/src/slices/play-drafts/start-repo.ts:66`).
- A topic is removed only by the run that started it, matched by value (`packages/app/src/slices/schedules/repo.ts:297-329`).
- `projects_settled_at` is written once; later project edits never reopen overlap (`packages/app/src/slices/schedules/repo.ts:378-405`).
- One topic generation per schedule at a time (lease), and none survives a restart (`packages/app/src/slices/schedules/topics.ts:644`).
- Schedule edits, history reads and the calendar submit no provider work; generation is the only LLM call outside a run.

## Outcomes & side effects

- Rows in `schedules`, `schedule_runs` (with estimate JSON), `schedule_topics` and `prepared_videos` (`packages/app/src/kernel/db/migrations/0043-prepared-videos.sql:6`, `packages/app/src/kernel/db/migrations/0009-scheduled-jobs.sql:1`, `packages/app/src/kernel/db/migrations/0026-schedule-topic-generation.sql:13`).
- A succeeded occurrence creates one draft (then `started`) and one project in the template's channel, or continues a prepared or same-title project and creates nothing.
- Prepare creates a draft (then `started`) and a project that runs up to its Before Video checkpoint, and a `prepared_videos` row; backups carry `prepared_videos` (`packages/app/src/slices/storage/backup-format.ts:72`).
- Held-topic generations notify through the UI event hub and the notifier (`packages/app/src/main.ts:640-643`).
- The calendar lists up to 92 days of upcoming runs with their topic source (`queued|held|generated|template`) and rendered title, running and finished projects with their needs, and the batch queue (`packages/app/src/slices/schedules/agenda.ts:35`, `:66`, `packages/app/src/slices/schedules/schema.ts:203`, `:281`). Schedules, runs and calendar refetch every 30 s in the web UI (`packages/web/src/schedules/api.ts:64`, `:273`).
- Shutdown stops ticks and aborts running generations (`packages/app/src/main.ts:1123-1124`).

## Dimensions not in play

- D1 Authority: single local user; schedules run as that user.
- D7 Time: nothing wakes a stopped machine or a closed Slopify; occurrences run only inside the live process (`packages/app/src/main.ts:981-983`).
- D5 Money: the spend limit gates admission only; no cost is enforced after a project starts.
- D13 Notification: no notification per occurrence; only held-topic generations and ordinary run notices.
- Media: scheduled runs never attach supplied files.
