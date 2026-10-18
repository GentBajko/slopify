---
scenario: home-attention-and-uploads
screens:
  - 01-projects
  - 03-project
  - 13-schedules
depends_on:
  - 01-pipeline-lifecycle
  - 23-review-checkpoints
  - 25-scheduled-jobs
  - 37-run-cost-and-eta
generated_at_commit: d447a799ebc5
generated_date: 2026-10-11
capstone_version: 7.0.1
content_hash: 6ec841b1647e
paths_covered:
  - ":(top)packages/app/src/edge/http/home.ts"
  - ":(top)packages/app/src/slices/uploads/**"
  - ":(top)packages/app/src/slices/fixes/**"
  - ":(top)packages/app/src/slices/schedules/agenda.ts"
  - ":(top)packages/app/src/kernel/db/migrations/0037-project-uploads.sql"
  - ":(top)packages/app/src/kernel/db/migrations/0044-project-set-aside.sql"
  - ":(top)packages/app/src/edge/http/projects.ts"
  - ":(top)packages/web/src/routes/home.tsx"
  - ":(top)packages/web/src/home/**"
  - ":(top)packages/web/src/calendar/attention.ts"
  - ":(top)packages/web/src/fixes/**"
  - ":(top)packages/web/src/project/fix-it.tsx"
  - ":(top)packages/web/src/routes/projects.tsx"
  - ":(top)packages/web/src/routes/projects-order.ts"
  - ":(top)packages/app/src/slices/admission/state-words.ts"
  - ":(top)packages/app/src/slices/reviews/holds.ts"
absorbed_from:
  - features/2026-09-30-slopify-mcp@2026-10-11
---

# 38 Home attention and uploads

Home (`/`) sorts the person's projects and schedules into what needs a decision, what is running, what is coming up, what is ready to upload and what this week cost. The calendar's **Needs you** list applies the server-side version of the same readings. **Mark uploaded** sets the project's upload mark, which is what takes it off Ready to upload; Slopify never uploads. The Studio extension's record of the YouTube videos an upload became (`youtube_videos`, 32-studio-upload-prep.md) is a separate table and does not set the mark. **Keep as is** takes a waiting run off Needs you until its next edit. Fix-its map a failed step's error to the one action that repairs it.

## Trigger & preconditions

- Home is `HomeRoute`, which reads the project list, schedules, templates, the calendar for the next eight local days and the first-run state (`packages/web/src/routes/home.tsx:53`, `:54`, `:55`, `:65`, `:67`). Everything is filtered to the channel picked in the rail, or every channel (`packages/web/src/routes/home.tsx:96`, `:110-118`).
- A fresh install navigates from Home to `/welcome` once per page load while the first-run state says `show` (`packages/web/src/routes/home.tsx:70-75`); onboarding owns that state.
- **This week** reads `GET /api/home/week?since=<ISO>&channelId=<id>` (`packages/app/src/edge/http/home.ts:25`, mounted at `packages/app/src/edge/http/app.ts:257`). `since` is the browser's own Monday 00:00 (`packages/web/src/home/api.ts:12`).
- **Mark uploaded** is `PUT /api/projects/:id/uploaded` with body `{ uploaded: boolean }` (strict) (`packages/app/src/edge/http/home.ts:93-111`, mounted at `packages/app/src/edge/http/app.ts:256`). The id must match `^[0-9A-Za-z_-]+$`, 1–64 characters (`packages/app/src/edge/http/ids.ts:3-9`).
- **Keep as is** is `PUT /api/projects/:id/set-aside` with body `{ setAside: boolean }` (strict), same id rule and mount (`packages/app/src/edge/http/home.ts:74-92`).
- Mark uploaded is offered on Home → Ready to upload and in the Projects list row; the Projects row alone offers **Undo upload mark**, for a day after marking (`packages/web/src/home/ready.tsx:85-94`, `packages/web/src/routes/projects-row.tsx:108-118`, `:124-136`).

## Steps

1. **Project status and progress.** `GET /api/projects` derives each project's `status` with `derive` and `progress` with `progressOf`, and attaches `uploadedAt` from `project_uploads`, `setAside: true` when the project is kept as is on its current head revision (`packages/app/src/edge/http/projects.ts:90-120`). The single-project read attaches `setAside` the same way (`projects.ts:144`). `derive`: paused → `paused`; any stage running or pending with a `retryAt` → `running`; any canceled → `canceled`; any failed → `partial` when the headline output was made, else `failed`; all satisfied → `done`; otherwise `pending` (`packages/app/src/kernel/runner/graph.ts:67`). `progressOf` averages per-stage share over stages not `provided`/`skipped`, 1 when none are asked (`packages/app/src/kernel/runner/graph.ts:164`).
2. **Home classifies** the channel's projects with the one state table the Projects list and the MCP tools also read (`packages/app/src/slices/admission/state-words.ts`; `packages/web/src/routes/home.tsx:96-118`). The holds come from the server's `projectHolds` (`packages/app/src/slices/reviews/holds.ts:60-152`), sent on each list row as `prepared`, `waitingForAgent`, `stopped`, `holding`, `stepFailed` and `stepFailures`:
   - Running now: `runningNow`, i.e. `running`, or parked on an External agent review (**Waiting for the agent**, not kept as is) (`state-words.ts:88-104`); such a run goes on by itself, so it is not in Needs you. The first three are live cards; "See all N running" links to the Projects Running filter (`packages/web/src/home/running-more.tsx:28`).
   - Queued: `queuedRun`, `pending` with none of its run done, nothing failed, not stopped and not waiting for the agent (`state-words.ts:61-72`, `:106-110`); named in one line under Running now, first two titles then "and N more" (`packages/web/src/home/running-more.tsx:6`, `:19-20`).
   - Needs you: `waitsForPerson`, a paused run, or a held run waiting for the person, i.e. not kept as is, not waiting for the agent and not Prepared (`state-words.ts:74-78`, `:117-121`). It holds runs **Waiting for your review** at a checkpoint of the person's, runs a restart **Stopped** (listed as their own kind, `packages/web/src/routes/home.tsx:119-129`), and paused runs (`:127-129`). A Prepared project held at its schedule's own Before Video hold waits for its day, and is not listed.
   - Failed: `failedRun`, a run that failed, or one whose step failed while it still waits for the agent, the person or its day (`stepFailed`); such a run reads by its wait while something can still move, and is listed both by that wait and here; it reads Failed only once nothing else can go on (`state-words.ts:123-131`, `:149-153`; `packages/web/src/routes/home.tsx:107-109`). `partial` is not listed here.
   - Held topics: schedules not deleted, in `hold` topic mode, with `topics.held > 0`, whose template belongs to the channel (`packages/web/src/routes/home.tsx:110-115`).
   - Ready to upload: `done`, `partial`, or `pending` and kept as is; `sources.video !== "off"`; `uploadedAt === null` (`packages/web/src/home/ready.tsx:19-27`), minus the bundled sample projects (`packages/web/src/routes/home.tsx:103-106`).
3. **Needs you order** is waiting and stopped runs, paused, held schedules, then failed capped at four (`packages/web/src/routes/home.tsx:120-131`, `shownPerKind` `packages/web/src/home/work-list.tsx:28`, `:49-52`). Only the first item's action is `primary` (`packages/web/src/home/work-list.tsx:78-94`). The heading counts every failed run, not only the four shown: "N decisions waiting · M ready to upload" (`packages/web/src/home/work-list.tsx:30-37`, `:71`).
4. **Item actions**:
   - Waiting: reads the project's checkpoints; the gate is the `held`/`pending-review` one whose `fingerprint` equals `currentFingerprint`. With a gate the button approves in place ("Approve the article and record", "Approve and draw the images", "Approve and render"), reusing one `idempotencyKey` until a reply arrives; without one it links **Open to continue** beside a quiet **Keep as is** (`packages/web/src/home/waiting-item.tsx:67-69`, `:27-31`, `:72-78`, `:132-149`). Approval rules are 23-review-checkpoints.md's.
   - Held topics: **Review topics** links to `/calendar` (`packages/web/src/home/needs-you.tsx:42-48`).
   - Paused: **Open to continue** (`packages/web/src/home/needs-you.tsx:115-121`).
   - Failed: reads the project, takes its first failed stage and its fix-it (step 6); `provider-settings` → Settings → Providers, `free-space` → Settings → Backup & storage, `sign-in` → **Copy sign-in command** plus **Open to retry**, anything else → a link labelled with the fix or **Open to retry** (`packages/web/src/home/failed-item.tsx:52-75`). The detail line is `shortReason` of the failure, or "The run stopped with an error." (`packages/web/src/home/failed-item.tsx:45-49`).
5. **Ready to upload item** shows **Prepare upload** (Studio pack, owned by the Studio upload scenario) and **Mark uploaded** (`packages/web/src/home/ready.tsx:85-94`). Four are shown (`packages/web/src/home/work-list.tsx:28`, `:53`).
6. **Fix-it mapping** `fixFor({ stage, kind, reason, provider })` is checked in this order (`packages/app/src/slices/fixes/rules.ts:58`):
   1. A CLI is identified (`claude-code`/`gemini` provider, `codex`/`codex-image` → `codex`, or the reason names "Codex CLI"/"Claude Code CLI"/"Gemini CLI"/"Antigravity CLI") and the reason matches the signed-out pattern or `kind === "auth"` → `sign-in` with command `claude auth login`, `codex login` or `agy` for the Antigravity CLI (`packages/app/src/slices/fixes/rules.ts:37-40`, `:43`, `:87-92`).
   2. Reason matches `ENOSPC`/no space/disk full → `free-space` (`packages/app/src/slices/fixes/rules.ts:45`, `:68`).
   3. `kind === "refusal"` or content-filter words → `refused`; `soften: true` with label "Soften and retry" for `images`/`thumbnail`, and for `video` when the reason starts "Short N image M:" (a short's still), else "Edit the prompt" (`packages/app/src/slices/fixes/rules.ts:47`, `:54`, `:56`, `:70`).
   4. Unknown/retired model wording → `switch-model` "Switch model" (`packages/app/src/slices/fixes/rules.ts:49`, `:73`).
   5. `kind` `auth`/`missing_key` or key-trouble wording → `provider-settings`, labelled with the provider's display name when known (`packages/app/src/slices/fixes/rules.ts:51`, `:74`).
   6. Otherwise no fix.
   The stage's provider comes from project config: `audio` → audio provider, `images`/`thumbnail` → images provider, `research`/`article` → LLM provider, others none (`packages/app/src/slices/fixes/rules.ts:101`). The rules file is pure and imported by the web bundle; consumers are the project page (`packages/web/src/project/fix-it.tsx:12`), Home, schedule topic failures (`packages/web/src/schedules/topic-failure.tsx:2`) and the cast editor (`packages/web/src/channels/cast-editor.tsx:1`).
7. **Fix-it buttons** (`FixActions`): `sign-in` → **Copy sign-in command** and **Check again**, which calls the provider health check and reads the "Signed in" check: `ok` → retries the step when a `retry` is given, `problem` → error toast, anything else → treated as unknown and retried (`packages/web/src/fixes/fix-actions.tsx:21`, `:62`, `:81`); `provider-settings` and `free-space` → Settings links; `refused`/`switch-model` → the caller's own `edit` node or nothing (`packages/web/src/fixes/fix-actions.tsx:119`).
8. **Mark uploaded** (`markUploaded`): 404 when the project row is missing; `uploaded: false` deletes the row and returns `uploadedAt: null`; `uploaded: true` inserts with `ON CONFLICT DO NOTHING` and returns the stored time (`packages/app/src/slices/uploads/repo.ts:12`). The client invalidates the project list on settle (`packages/web/src/home/ready.tsx:60-62`, `packages/web/src/routes/projects.tsx:138-140`).
9. **Keep as is** (`setAside`, `packages/app/src/slices/uploads/repo.ts:65`): 404 when the project has no head revision; `setAside: true` upserts one `project_set_aside` row holding the current head `revision_id`; `false` deletes it. `setAsideProjects` counts a row only while its `revision_id` is still the head, so any edit that makes a new head brings the run back to Needs you without touching the row (`repo.ts:83`, `packages/app/src/kernel/db/migrations/0044-project-set-aside.sql:1`). The success toast offers **Undo** (`setAside: false`); the list is invalidated on settle (`packages/web/src/home/use-keep-as-is.ts:16-34`). A kept project reads "Kept as is" in the Projects list (`packages/web/src/project/summary.ts:82`) and on the project page, whose next action is **Prepare upload** when the video is ready, else none (`packages/web/src/project/next-action.ts:341-358`). Nothing is run or canceled; the project's stages stay as they are.
10. **This week** (`weekSummary`): counts provider calls and cost since `since`, the API-equivalent of plan-billed calls, `video` outputs created since `since` (a remade video counts again), and each CLI plan's latest window readings, narrowed to one channel except plan standings (`packages/app/src/slices/run-cost/week.ts:70`, `:119-124`). Pricing and plan readings are 37-run-cost-and-eta.md's. Home shows videos, cost with "~$X via API" and "N calls without a price", and a meter per plan with a weekly percent, tone `waiting` at 80 % or more (`packages/web/src/home/week.tsx:13`, `:42-48`, `:49-64`). The query is stale after 30 s (`packages/web/src/home/api.ts:28`).
10a. **The agent's reading** (`needs_attention`, `packages/app/src/slices/agents/attention.ts:72-119`) is Home's work list read by an agent: external reviews waiting for a verdict, flagged verdicts nobody acted on, checkpoints of the person's that hold a run now, failed steps (beside a wait too), paused runs, stopped runs, held topics, Late · upload now videos and the extension's failed finishing touches, oldest first. Kept as is projects, a Prepared project's own day hold and unreached checkpoints are left out, and runs waiting for the agent appear only as their external reviews. Its rules are 45-mcp-agent-access.md's.
11. **Calendar attention**: `GET /api/calendar` (`calendarRange`, range ≤ 92 days) returns projects running or created before `to`, and terminal ones whose last stage finished inside the range (`packages/app/src/slices/schedules/agenda.ts:40`, `:211`, `:253-258`, `packages/app/src/slices/schedules/schema.ts:362`). Each carries (`packages/app/src/slices/schedules/agenda.ts:262-284`):
    - `needs: "failed"` when failed; `"paused"` when paused; then, unless the project is kept as is or uploaded and reading Done, `"stopped"` for a run a restart stopped, and `"review"` when not canceled and a review checkpoint holds the run for the person (`holds.ts`) or its latest automatic-review verdict failed an item with no action and no redo under way (or a failed redo) (`packages/app/src/slices/schedules/agenda.ts:156-170`, `:192-207`).
    - `readyToUpload: true` when `done`/`partial`, the config makes a video (unparseable or pre-sources config counts as yes), no upload mark and not a sample project (`packages/app/src/slices/schedules/agenda.ts:174`, `:268-272`).
    Keep as is is read here: a kept-as-is project asks nothing (no `needs`, `setAside: true` is carried), and one in `pending` is never `readyToUpload` (`agenda.ts:203`, `:268-272`, `:285`).
    The web orders the calendar's Needs you list as projects with `needs`, then `readyToUpload` ones (`packages/web/src/calendar/attention.ts:75`), labels them failed → **Open to fix**, paused → **Open to continue**, review → "Waiting for your review" / **Open to review**, then a CLI limit wait line, then "Ready to upload" with **Prepare upload**, then the plain state word (`packages/web/src/calendar/attention.ts:24`), and heads it "N waiting for you · M ready to upload" (`packages/web/src/calendar/attention.ts:62`).

## Branches

- **Channel filter**: projects by `channelId`; held schedules and Coming up by their template's channel (`packages/web/src/routes/home.tsx:96`, `:110-118`). This week passes the channel to the server (`packages/web/src/home/week.tsx:29`).
- **Home vs calendar "needs"**: Home lists `pending`-with-progress runs as Waiting and never lists automatic-review verdicts on their own; the calendar's `review` comes from checkpoint and verdict rows, and it does not mark a `pending` run without such a row (`packages/web/src/home/waiting-item.tsx:59-69`, `packages/app/src/slices/schedules/agenda.ts:192-207`).
- **Sample projects**: Home and the calendar leave them out of Ready to upload (`packages/web/src/routes/home.tsx:103-106`, `packages/app/src/slices/schedules/agenda.ts:272`); the Projects list's `isReadyToUpload` does not, so the sample's row shows **Mark uploaded** (`packages/web/src/routes/projects-row.tsx:108-118`).
- **Undo**: Home's toast carries an **Undo** (`uploaded: false`) and mentions the way back ("Projects still lists it") (`packages/web/src/home/ready.tsx:46-52`); the Projects list shows an **Uploaded** badge with **Undo upload mark** only for a day after marking (`packages/web/src/routes/projects-row.tsx:37-44`, `:119-136`).
- **Kept as is**: off Waiting, onto Ready to upload when its video is made; any edit that moves the head revision undoes it (step 9).
- **Projects list filters** reuse the same predicates (`matches`, `packages/web/src/routes/projects-order.ts:19-45`): one **Running** filter = `runningNow` (running plus waiting for the agent; Home's "See all N running" opens it), **Queued** = `queuedRun`, **Needs you** = `waitsForPerson` (paused runs are here, not under Running), **Ready to upload** = `isReadyToUpload`, **Failed** = `failedRun` or `partial`, so a step failed beside a wait is listed under Failed while its row reads by the wait.
- **Command palette** registers "Approve …"/"Open the held run" per waiting item and "Mark uploaded" per ready item (`packages/web/src/home/waiting-item.tsx:104-114`, `packages/web/src/home/ready.tsx:64-71`).
- **Empty states**: with no work and nothing running or queued Home shows "Nothing needs you and nothing is running" (`packages/web/src/routes/home.tsx:215-219`); the Running now section is left out when nothing is running or queued (`:194`).

## Unhappy paths

| Case | Behavior | Site |
|---|---|---|
| Mark uploaded or Keep as is on a deleted project | 404 "This project no longer exists. Go back to Projects to pick another." | `packages/app/src/edge/http/home.ts:85-89`, `:104-108` |
| Keep as is request fails | Toast "<title> wasn't kept as is: <message> Press Keep as is again." | `packages/web/src/home/use-keep-as-is.ts:27-31` |
| Keep as is on the sample | The sample read-only guard answers 409, as for Mark uploaded | `packages/app/src/edge/http/app.ts:371-389` |
| Mark uploaded twice | First time kept (`ON CONFLICT DO NOTHING`); returns the stored time | `packages/app/src/slices/uploads/repo.ts:24-27` |
| Mark uploaded on the sample (Projects list) | The sample read-only guard answers 409 for any non-GET under `/api/projects/:id/*` except its exemptions; the row's toast says "wasn't changed: …" | `packages/app/src/edge/http/app.ts:371-389`, `:472`, `packages/web/src/routes/projects.tsx:134-137` |
| Mark uploaded request fails on Home | Toast "… wasn't marked uploaded: <message> Press Mark uploaded again." | `packages/web/src/home/ready.tsx:44` |
| Invalid `since`/`channelId` | 400 problem via `onInvalid` | `packages/app/src/edge/http/home.ts:14-17`, `:25` |
| Unknown `channelId` on This week | No error; counts are zero for projects and standalone calls of a missing channel fold into the default channel | `packages/app/src/slices/run-cost/week.ts:92` |
| Projects, calendar or week fail to load | Inline alert naming what failed and "Reload the page" | `packages/web/src/routes/home.tsx:169`, `:229`, `:237`, `packages/web/src/home/week.tsx:30` |
| Home approval not confirmed | Toast "Slopify didn't confirm the approval… Press the button again"; the same `idempotencyKey` is reused | `packages/web/src/home/waiting-item.tsx:89-94`, `:72-78` |
| Approval refused | Toast "<title> wasn't approved: <message> Open the project to review it there." | `packages/web/src/home/waiting-item.tsx:81-88` |
| Gate edited since load | No approve button; **Open to continue** | `packages/web/src/home/waiting-item.tsx:67-69`, `:132-140` |
| Clipboard blocked on sign-in copy | Error toast telling the person to type the command | `packages/web/src/home/failed-item.tsx:34-42`, `packages/web/src/fixes/fix-actions.tsx:95` |
| Check again cannot reach the health check | Error toast naming Check all in Settings → Providers | `packages/web/src/fixes/fix-actions.tsx:84` |
| Invalid calendar range | 400 "Choose a range whose end is after its start and at most 92 days long." | `packages/app/src/edge/http/schedules.ts:453` |
| Failed step whose error matches no rule | No fix; Home links **Open to retry** | `packages/app/src/slices/fixes/rules.ts:83`, `packages/web/src/home/failed-item.tsx:72-74` |

## State transitions

- `project_uploads` row: absent → present on `uploaded: true`; present → absent on `uploaded: false` (`packages/app/src/slices/uploads/repo.ts:20-27`). No other state; the project's run state and config are untouched, so no fingerprint changes (`packages/app/src/kernel/db/migrations/0037-project-uploads.sql:1`).
- `project_set_aside` row: absent → present (`setAside: true`, holding the head revision) → absent (`false`); it stops counting, without being deleted, once another revision becomes head (`packages/app/src/slices/uploads/repo.ts:65`, `:83`). The project's stages and run state are untouched.
- Home and the calendar move nothing else themselves; approval moves a checkpoint (see 23-review-checkpoints.md) and fix-its route to screens that move provider, storage or stage state.

## Invariants

- One upload mark per project (`project_id` primary key), deleted with the project (`ON DELETE CASCADE`) (`packages/app/src/kernel/db/migrations/0037-project-uploads.sql:5`). One set-aside row per project, likewise cascaded (`packages/app/src/kernel/db/migrations/0044-project-set-aside.sql:5`).
- A kept-as-is project is never Waiting on Home and never a Needs you count (`packages/app/src/slices/admission/state-words.ts:74-78`).
- A run waiting for the agent or Prepared at its own day hold is never in Needs you; a Stopped run always is (`packages/app/src/slices/admission/state-words.ts:74-78`, `:117-121`, `packages/app/src/slices/reviews/holds.ts:121-143`).
- A marked project never appears in Ready to upload on Home, the calendar or the Projects filter (`packages/web/src/home/ready.tsx:25`, `packages/app/src/slices/schedules/agenda.ts:271`).
- A project whose config turns Video off is never Ready to upload (`packages/web/src/home/ready.tsx:24`, `packages/app/src/slices/schedules/agenda.ts:270`).
- Every failure the fix-it rules can name is named in `slices/fixes/rules.ts` only; the web renders, it does not re-derive (`packages/app/src/slices/fixes/rules.ts:4`).
- No provider call is made by Home reads, Mark uploaded, Keep as is, or the fix-it lookup; Check again calls only the provider health check.

## Outcomes & side effects

- `PUT …/uploaded` returns `{ uploadedAt }` and writes or deletes one `project_uploads` row; no event is emitted, so other tabs see it on their next project-list refetch (`packages/app/src/edge/http/home.ts:109`). `PUT …/set-aside` returns `{ setAside }` the same way (`home.ts:90`).
- Backups carry `project_uploads` but leave `project_set_aside` out on purpose: a restored project shows on Needs you again (`packages/app/src/slices/storage/backup-format.ts:62`, `:73`).
- `GET /home/week` returns `WeekSummary` `{ since, videos, calls, cost, unpriced, apiEquivalent, plans }` (`packages/app/src/slices/run-cost/week.ts:28`).
- Home lists refresh through the live event stream (see 39-notifications-and-live-events.md); Running now cards ride each project's stream (`packages/web/src/home/running-now.tsx:18`).

## Dimensions not in play

- D1 Authority: single local user; no roles.
- D5 Money: Mark uploaded and Home move no money; This week only reads recorded cost.
- D6 Limits: display caps only (four per section, three running cards, two queued titles, six coming-up runs) (`packages/web/src/home/work-list.tsx:28`, `packages/web/src/routes/home.tsx:251`).
- D7 Time: upload marks never expire; `uploaded_at` is the first mark's time.
- D12 Visibility: nothing leaves the machine; Slopify never uploads to YouTube.
- D13 Notification: Home sends none; run notifications are 39-notifications-and-live-events.md's.
- D15 Record: the upload mark and the set-aside row are the only records; no history of unmarks or undos.
