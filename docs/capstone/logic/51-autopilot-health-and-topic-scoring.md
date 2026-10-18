---
scenario: autopilot-health-and-topic-scoring
screens:
- 15-home
- 08-settings
- 09-schedules
depends_on:
- 19-catalogue-thinking
- 25-scheduled-jobs
- 37-run-cost-and-eta
- 38-home-attention-and-uploads
- 39-notifications-and-live-events
generated_at_commit: d6a72d6428ff
generated_date: 2026-10-18
capstone_version: 7.0.1
content_hash: 51a3c9e07b24
paths_covered:
  - ":(top)packages/app/src/slices/autopilot/**"
  - ":(top)packages/app/src/autopilot-timers.ts"
  - ":(top)packages/app/src/adapters/account-limits.ts"
  - ":(top)packages/app/src/adapters/interest/**"
  - ":(top)packages/app/src/kernel/ports/interest.ts"
  - ":(top)packages/app/src/slices/schedules/score.ts"
  - ":(top)packages/app/src/slices/schedules/topic-scores.ts"
  - ":(top)packages/app/src/slices/schedules/rescore.ts"
  - ":(top)packages/app/src/slices/schedules/similar.ts"
  - ":(top)packages/app/src/slices/schedules/topics.ts"
  - ":(top)packages/app/src/edge/http/home.ts"
  - ":(top)packages/app/src/edge/http/schedules.ts"
  - ":(top)packages/app/src/edge/mcp/tools-projects.ts"
  - ":(top)packages/app/src/edge/mcp/tools-schedules.ts"
  - ":(top)packages/app/src/kernel/db/migrations/0067-autopilot.sql"
  - ":(top)packages/app/src/kernel/db/migrations/0068-topic-scores.sql"
  - ":(top)packages/web/src/home/autopilot.tsx"
  - ":(top)packages/web/src/home/api.ts"
  - ":(top)packages/web/src/notifications/settings-panel.tsx"
  - ":(top)packages/web/src/schedules/topic-score.tsx"
  - ":(top)packages/web/src/schedules/form.tsx"
---

# 51 Autopilot health and topic scoring

Two things that keep a channel's schedules honest without the person watching them. **Autopilot health** is Home's block that says how far ahead the schedules' content is and what is about to stop them (a CLI signed out, a plan or key running low, the disk filling, a queue of topics running out, topic finding failing, a template with no version marked ready, a model being retired), plus the last seven days and an optional Monday report sent to the Notification URL. **Topic scoring** is an opt-in per schedule that scores the topics a schedule finds, by how new they are next to what the library already covers and, when the person allows it, by public search interest, and keeps the queue in score order. Neither starts a run, spends money or reads a channel's analytics. Paths starting `slices/`, `edge/`, `adapters/` or `kernel/` are under `packages/app/src/`; routes are under `/api`.

## Trigger & preconditions

| Behavior | Trigger | Preconditions |
|---|---|---|
| Read the autopilot block | Home's Coming up opens it; `GET /api/home/autopilot?channelId=` and the agents' `get_autopilot` (`edge/http/home.ts:31-46`, `packages/web/src/home/autopilot.tsx:139`, `edge/mcp/tools-projects.ts:78-83`) | None; it reads the database and the hourly check's last answers and never asks a CLI or waits for one |
| The hourly check | `startAutopilot` in `main.ts:783`: first check 30 s after start, then every hour (`autopilot-timers.ts:18-19`, `:51-55`, `:67-71`) | Slopify running; stopped at shutdown (`main.ts:1121`) |
| Hide a warning | Hide beside a warning; `POST /api/home/autopilot/snooze {key}`; agents' `hide_autopilot_warning` (`edge/http/home.ts:48-53`, `packages/web/src/home/autopilot.tsx:99`, `edge/mcp/tools-projects.ts:85-90`) | `key` 1-300 characters, taken from a warning |
| Turn the weekly report on or off | Settings → Notifications → Weekly report; `GET/PUT /api/home/autopilot/weekly {enabled}`; agents' `set_weekly_report` (`edge/http/home.ts:54-60`, `packages/web/src/notifications/settings-panel.tsx:260-272`, `edge/mcp/tools-projects.ts:92-97`) | Off until turned on; sent only once a Notification URL is set |
| Send the weekly report | A timer looks every 15 min (`autopilot-timers.ts:20`, `:56-66`, `:72`); `sendWeeklyReport` (`slices/autopilot/notify.ts:14-39`) | Weekly report on, a Notification URL set, this ISO week not yet sent, and Monday 09:00 reached in this computer's time zone (`slices/autopilot/weekly.ts:92-102`) |
| Choose how a schedule ranks topics | Schedule form → Topic generation → Rank topics (Off, By what the library covers, Also by public search interest); `topicScoring` on create and update (`packages/web/src/schedules/form.tsx:106`, `:244`, `:622-643`, `slices/schedules/schema.ts:98-99`, `:140`, `:185`, `edge/mcp/tools-schedules.ts:27`) | Default `off`; left out of an update keeps the saved value (`slices/schedules/service.ts:343`) |
| Score topics as they are found | Find topics (`POST /:id/topics/generate`) or the scheduler's own refill (`slices/schedules/topics.ts:190-200`) | The schedule's `topicScoring` is not `off` |
| Rescore | Rescore beside the queue and the held list; `POST /api/schedules/:id/topics/score`; agents through the same route (`packages/web/src/schedules/topic-score.tsx:88-122`, `edge/http/schedules.ts:245-257`, `slices/schedules/rescore.ts:15-61`) | Ranking on for the schedule, else 409 |

## Steps

### Autopilot health (`slices/autopilot/signals.ts`, `buffer.ts`, `warnings.ts`)

1. **The hourly probes** (`createAutopilotHealth`, `collectProbes`, `slices/autopilot/signals.ts:121-165`). Three things are asked outside the database, each cut off after 15 s so the check always ends (`probeTimeoutMs`, `:24`, `within`, `:100-119`): whether each CLI an active schedule uses is signed in, the OpenRouter key's limit and what is left, and the free space of the data directory's disk. The answers are held in memory (`latest`), one check at a time (`refresh` shares a running one, `:149-163`). A probe that fails or times out is left out and logged `autopilot.probe`; its warning is not shown rather than guessed. Before the first check ends `checkedAt` is null and these three kinds of warning do not show.
   - Which CLIs are worth asking (`clisInUse`, `:76-98`): the CLIs named by the model choices of the templates and schedules that active, non-deleted video schedules use, and of a schedule's own topic finding while its mode is not off. `codex-image` counts as Codex. A design schedule is left out entirely (`makesVideos`, `:70-73`).
   - Sign-in (`autopilot-timers.ts:41-44`): through the host CLI bridge's `status` when there is one, else the installed command's own login reader. Names and fixes: Claude Code `claude auth login`, Codex `codex login`, Antigravity CLI `agy` (`signals.ts:26-30`).
   - The key and the disk: `openRouterKeyLimit` and `diskSpaceAt` (`adapters/account-limits.ts:14`, `:30`).
2. **The forecast** (`autopilotView`, `signals.ts:169-273`; `bufferForecast`, `slices/autopilot/buffer.ts:30-79`). It looks `forecastDays` = 60 days ahead (`slices/autopilot/model.ts:88`) at the runs the calendar lists for live video schedules in the chosen channel, leaving out runs whose template has no version it may run (`notReady`).
   - Each unpaused run is a slot, in time order. A slot with a run made ahead (Prepare) is covered by it; any other slot takes the next finished video not yet uploaded and not set aside (the calendar's look back of 91 days, `signals.ts:182-192`), and the first slot with none left is the gap (`buffer.ts:41-54`).
   - `daysAhead` is whole days from now to that gap; with no gap it is the days to the window's end and `coveredBeyondWindow` is true, so it is a floor. With no runs ahead it is null. `coveredUntil` is the last covered run; `readyCount` is the ready videos plus the runs made ahead.
   - A paused schedule's runs fill nothing and it never runs dry: it waits for Resume (`buffer.ts:93`).
   - `runsDryAt` per schedule (`scheduleForecast`, `:81-120`): with topic generation Off, the occurrence after the last queued run when the whole queue fits the window (with an empty queue it runs its template as saved and never runs dry); Hold, the first run whose topic is not an approved queued one; Queue, null unless topic finding is failing, then the first run not on a queued topic. The block's `runsDryAt` is the earliest of them.
   - Home shows it as a line such as "9 days of content ready · the queue runs dry on Oct 30" (`packages/web/src/home/autopilot.tsx:22-23`).
3. **The warnings** (`warningsOf`, `slices/autopilot/warnings.ts:57-141`). Each says what is wrong, why it stops the autopilot, and where the fix is, with a `fix` that opens Providers, plan usage, Backup & storage, the schedule or the templates list. Thresholds are in `slices/autopilot/model.ts:90-97`.

   | Key | Severity | Raised when |
   |---|---|---|
   | `cli-signed-out:<id>` | problem | a probed CLI answers signed out ("Open a terminal on this computer, run "claude auth login" and sign in.") |
   | `plan-low:<plan name>` | warning | a CLI plan's weekly or 5-hour share is at least 80% (`lowPercent`), from the stored plan readings (`run-cost/week.ts`) |
   | `openrouter-low` | problem at $0 left, else warning | the key has a limit and less than 20% of it is left |
   | `disk-low` | problem under 5 GB free, else warning | free space under 5 GB (`diskLowBytes`) or under 10% of the disk (`diskLowShare`) |
   | `template-not-ready:<schedule id>` | problem | an active schedule's template has no version marked ready (`template-studio/schedule-gate.ts`, through `notReadySentence`) |
   | `topics-failing:<schedule id>` | problem | topic generation is not off and the last find failed (`topics.error`), with that error |
   | `few-topics:<schedule id>:<n>` | warning | generation is off and 1 or 2 topics are left (`fewTopicsLeft` = 3); the count is in the key, so it shows again as it falls |
   | `retired:<kind>:<id>:<model>` | warning | an active template or schedule picks a model being retired or no longer offered (`model-upkeep/usage.ts`, `retiredModelUsage`), naming its replacement |

   Paused schedules raise none of the schedule warnings. Problems sort before warnings.
4. **Hide** (`slices/autopilot/repo.ts:9-27`). Hide writes `autopilot_snoozes(warning_key, until)` for seven days (`snoozeDays`, `edge/http/home.ts:50`); each read removes ended rows. A warning whose key changes shows again at once; one still true after a week comes back.
5. **The last seven days** (`weeklyReport`, `slices/autopilot/weekly.ts:38-81`): videos finished, the failed steps (the first 10 named with the project, step and reason, the rest counted), the cost and unpriced calls, the API equivalent and each CLI plan's windows. It is the same stored calls Home's This week reads (`run-cost/week.ts`), for one channel or all; nothing is estimated. Template samples are left out (`notTemplateSample`).

### The weekly report (`slices/autopilot/notify.ts`, `weekly.ts`)

6. Every 15 minutes `sendWeeklyReport` returns early as `off` (switch off), `not-due`, or `no-url` (no Notification URL). Due means the ISO week ("2026-W42", in this computer's time zone, UTC when the zone is unknown) is not the one last sent and it is Monday from 09:00 or any later day (`weeklyDue`, `weekly.ts:92-102`), so a Slopify that was off on Monday sends it when it next runs that week.
7. The text is "Slopify last week: N videos made, N steps failed" with the cost, the plans' weekly use and up to three failures, ending "Open each project and use the button beside the failed step." (`weeklyNoticeText`, `weekly.ts:106-126`). It goes by the Notification URL's own sender (`webhookBody`, `notifications/send.ts`), the same single-shot POST as a run notice (39-notifications-and-live-events.md).
8. A send that fails is logged `autopilot.weekly` with the sender's own reason and tried again at the next quarter hour; one that went out stores the week (`autopilot.weekly-sent-for`, `slices/autopilot/repo.ts:5-6`, `:39-46`) and is not sent again.

### Topic scoring (`slices/schedules/score.ts`, `topic-scores.ts`, `rescore.ts`)

9. **The score** (`topicScore`, `score.ts:129-141`): 0-100, kept as `topic_scores(schedule_id, topic_key, title, score, interest, novelty, reasons, pinned, scored_at)` (`kernel/db/migrations/0068-topic-scores.sql`). The key is the topic's normalised title (`topicKey`, `score.ts:52-54`), so a recased or repunctuated topic keeps its score.
   - **Novelty** (`noveltyOf`, `score.ts:64-75`): 1 when nothing the library holds resembles the topic, down to 0 for the same topic. The comparison set is the schedule's queued, held, turned-down and used topics and the titles of its channel's projects and earlier videos (`knownTitles`, `slices/schedules/topics.ts:303-330`), with the topic itself left out of its own comparison (`topic-scores.ts:141-144`). Overlap is shared words over all words (filler words and a plural s dropped, `similar.ts:19-53`); a known title holding every word of the topic covers it fully (`score.ts:56-62`).
   - **Interest** (`interestOf`, `:80-85`), only with `search`: 60% Wikipedia article views last month (log-scaled, ten million views as the ceiling) and 40% how many of up to ten search suggestions name the topic (a suggestion names it when it holds every word, `readingOf`, `:19-35`).
   - **Score** (`scoreOf`, `:87-89`): novelty alone with `library` or when no search answered; otherwise 60% interest and 40% novelty. `reasons` are the lines the score chip shows: "Search: N of 10 suggestions match", "Wikipedia: 12k views last month" or "no article found", "Search interest unknown: no connection to Google, DuckDuckGo or Wikipedia", and "Library: new; nearest “…” (N% overlap)" or "already covered by “…”" (`reasonsOf`, `:98-127`).
10. **Where interest comes from** (`createSearchInterest`, `adapters/interest/search-interest.ts:37-134`, built at `main.ts:638-639`): keyless public calls only, sending the topic's title and its language code and nothing else: Google's search suggestions (DuckDuckGo's when Google does not answer) and the Wikipedia article's views for the last whole month. Google Trends is not asked (it refuses keyless calls). Each call is cut off after 4 s (`interestRequestMs`); the port never throws and answers `ok: false` only when neither service answered (`kernel/ports/interest.ts`). It reads no channel's analytics.
11. **When topics are found** (`slices/schedules/topics.ts:190-253`): the LLM's suggestions are scored outside the database transaction, three at a time and for at most 15 s in all (`scoreTopics`, `topic-scores.ts:16-19`, `:105-154`); topics search did not read in time are scored by novelty alone and say so. Inside the transaction the candidates are checked again against what is there now, the best-scored are kept up to the wanted count and the queue's room (`:208-212`), their scores are saved, and the queue is put in score order (`rankedItems`, `:238`). With Hold they are held in score order (`rankHeld`, `:252`, `:278-289`). With scoring `off` nothing is scored and the LLM's own order is kept, as before.
12. **Order** (`orderQueue`, `score.ts:143-157`): topics the person added or moved keep their place at the front in their own order, then the scored ones, best first; equal scores keep their order. Moving a topic pins it (`pinTopic`, `topics.ts:596`, `topic-scores.ts:86-91`), so scoring leaves it where it was put.
13. **Rescore** (`rescoreTopics`, `slices/schedules/rescore.ts:15-61`): every queued and held topic is scored again now, the scores saved with `pinNew` so a topic that had no score (one the person added) is scored where it stands, then the queue and held list are put in order in one transaction. `scoring off` answers 409 "Topic ranking is off for this schedule. Choose how to rank topics under Edit → Topic generation → Rank topics, save, then rescore." (`:23-29`, `edge/http/schedules.ts:248-254`). Search ranking may take up to 15 s.
14. **Shown** (`GET /api/schedules/:id` and `GET /:id/topics/held`, `edge/http/schedules.ts:143-147`, `:235-242`): `scores` by normalised title with the score and reasons, only while ranking is on; the page shows "Score N" and a popover of the reasons beside each queued and held topic (`packages/web/src/schedules/topic-score.tsx:27-31`, `:40-80`), and agents read the same in `get_schedule` (`edge/mcp/tools-schedules.ts:21`). The search choice's label says it "Sends each new topic's title to Google, DuckDuckGo and Wikipedia. Nothing else leaves this computer." (`packages/web/src/schedules/form.tsx:627`).

## Branches

- **Channel filter**: Home passes the selected channel; the forecast, warnings and report then cover that channel's schedules, projects and failed steps (`signals.ts:176-180`, `:185-192`, `weekly.ts:44-59`).
- **Generation mode**: Off, Hold and Queue each decide when a schedule runs dry (Step 2); only Off with 1-2 topics left raises `few-topics`.
- **Scoring mode**: `off` leaves finding and ordering exactly as before scoring existed; `library` never asks anything outside this computer; `search` asks the three public services.
- **Design schedules**: absent from the forecast, the probes and every warning (`signals.ts:70-73`, `:178-180`, `:196`).
- **Docker**: the CLI probes use the host CLI bridge's status (`autopilot-timers.ts:42-44`).

## Unhappy paths

- A CLI sign-in probe, the OpenRouter call or the disk read that fails or hangs: logged `autopilot.probe` with the reason, no warning for it that hour (`signals.ts:100-119`).
- `POST /api/home/autopilot/snooze` or `PUT .../weekly` with a body that is not `{key}` / `{enabled: boolean}` → 400 through `onInvalid` (`edge/http/home.ts:64-66`).
- The weekly report with no Notification URL: nothing is sent and nothing is marked, so it goes out the quarter hour after one is saved; a failing URL is logged and retried each quarter hour until the week's report is out (`notify.ts:20-38`).
- A hung `autopilot.check` or `autopilot.weekly` run that throws: logged `error` with the cause; the timers keep going (`autopilot-timers.ts:51-66`).
- Search ranking while offline or a service refusing: the topic is scored by novelty alone with the line "Search interest unknown: no connection to Google, DuckDuckGo or Wikipedia"; finding topics never fails for it (`topic-scores.ts:105-154`, `score.ts:117-118`).
- Rescore on a schedule that was deleted meanwhile → not found; changed during the search → rescored against the schedule as it is when the transaction opens (`rescore.ts:20-22`, `:42-46`).
- A model warning needs the catalogue: without one, `retired` is empty (`signals.ts:241-259`).

## State transitions

- `autopilot_snoozes`: absent ↔ hidden until a date; ended rows are deleted on read (`repo.ts:9-27`).
- Settings `autopilot.weekly-notify` (false ↔ true, default false) and `autopilot.weekly-sent-for` (the last ISO week sent) (`repo.ts:5-6`, `:29-46`).
- A schedule's `topic_scoring`: `off` ↔ `library` ↔ `search` on any save; a topic's `topic_scores` row: created when scored, replaced when scored again (its `pinned` kept), pinned when the person moves it, removed with the schedule (`ON DELETE CASCADE`).
- The probes' answers are memory only: empty after a start until the first check ends.

## Invariants

- Home's autopilot block never starts a CLI, a provider call or a run, and a request for it never waits on a probe (`edge/http/home.ts:28-31`, `signals.ts:144-165`).
- A warning's `key` is stable for the same problem, so Hide holds for a week and no longer when the problem changes (`model.ts:45-46`).
- A paused schedule raises no warning and never "runs dry"; a design schedule is never part of the forecast.
- Scoring never reads a channel's analytics; `library` sends nothing off this computer; `search` sends only the topic's title and a two-letter language to Google (or DuckDuckGo) and Wikipedia (`score.ts:1-3`, `search-interest.ts:4-6`).
- Scoring never holds up or fails finding topics: the whole search is bounded at 15 s and scored by novelty beyond that (`topic-scores.ts:16-19`).
- A topic the person added or moved keeps its place against any score (`orderQueue`, `score.ts:143-157`).
- The weekly report goes at most once per ISO week and only when the person turned it on.

## Outcomes & side effects

- Tables: `autopilot_snoozes` (`0067-autopilot.sql`), `topic_scores` and `schedules.topic_scoring` (`0068-topic-scores.sql`). Neither table is in the backup's table list (`slices/storage/backup-format.ts:95-120`), so a restored install starts with every schedule's ranking scores empty and no warning hidden; `schedules.topic_scoring` itself travels with the schedule. The two weekly settings are settings rows.
- Outside calls: the hourly sign-in probes, one OpenRouter key call, a disk read; with `search`, up to four public requests per topic (two suggestion services, the Wikipedia opensearch and the pageviews API); the weekly report's one POST.
- Log lines: `autopilot.probe`, `autopilot.check`, `autopilot.weekly` (warn/error), never the Notification URL.
- Agents: `get_autopilot`, `hide_autopilot_warning`, `set_weekly_report`, and `topicScoring` on `create_schedule` / `update_schedule` (`edge/mcp/tools-schedules.ts:27`); the weekly switch's read is `get_autopilot`'s `weeklyNotify` (`edge/mcp/excluded-routes.ts:33`).

## Recorded differences from the feature spec

- No feature spec was groomed for these; the intent is in `changelog.d/2026-10-18-*` and `standards.md`. Autopilot health only reports: what each warning says to do stays the person's, and nothing fixes a sign-in or a queue by itself.
- Topic scoring uses public search interest and the library only, never a channel's own analytics (the app builds for any destination, not for one channel's numbers).

## Dimensions not in play

- D1 Authority: one local user; Hide and the weekly switch are open to agents (`hide_autopilot_warning`, `set_weekly_report`), called in-process as the agent like any other route (`edge/mcp/call-route.ts`).
- D5 Money: none; no provider is called, the cost lines are stored calls already made, and scoring is free.
- D7 Time: checks run hourly and the report quarter-hourly while Slopify runs; nothing runs while it is closed (the report is sent at the next start that week).
- D13 Notification: only the weekly report; the warnings are shown on Home, not sent.
- D15 Record: the latest probe answers are kept in memory only; the scores are kept per topic, with no history of earlier scores.
