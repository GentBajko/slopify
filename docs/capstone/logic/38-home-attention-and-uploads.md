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
generated_at_commit: e9226a34aa8a
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: f795498a6a61
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
---

# 38 Home attention and uploads

Home (`/`) sorts the person's projects and schedules into what needs a decision, what is running, what is coming up, what is ready to upload and what this week cost. The calendar's **Needs you** list applies the server-side version of the same readings. **Mark uploaded** sets the project's upload mark, which is what takes it off Ready to upload; Slopify never uploads. The Studio extension's record of the YouTube videos an upload became (`youtube_videos`, 32-studio-upload-prep.md) is a separate table and does not set the mark. **Keep as is** takes a waiting run off Needs you until its next edit. Fix-its map a failed step's error to the one action that repairs it.

## Trigger & preconditions

- Home is `HomeRoute`, which reads the project list, schedules, templates, the calendar for the next eight local days and the first-run state (`packages/web/src/routes/home.tsx:40`, `:47`, `:55`, `:57`). Everything is filtered to the channel picked in the rail, or every channel (`packages/web/src/routes/home.tsx:86`, `:122`).
- A fresh install navigates from Home to `/welcome` once per page load while the first-run state says `show` (`packages/web/src/routes/home.tsx:60`); onboarding owns that state.
- **This week** reads `GET /api/home/week?since=<ISO>&channelId=<id>` (`packages/app/src/edge/http/home.ts:16`, mounted at `packages/app/src/edge/http/app.ts:198`). `since` is the browser's own Monday 00:00 (`packages/web/src/home/api.ts:11`).
- **Mark uploaded** is `PUT /api/projects/:id/uploaded` with body `{ uploaded: boolean }` (strict) (`packages/app/src/edge/http/home.ts:33`, mounted at `packages/app/src/edge/http/app.ts:197`). The id must match `^[0-9A-Za-z_-]+$`, 1–64 characters (`packages/app/src/edge/http/home.ts:23`).
- **Keep as is** is `PUT /api/projects/:id/set-aside` with body `{ setAside: boolean }` (strict), same id rule and mount (`packages/app/src/edge/http/home.ts:38`).
- Mark uploaded is offered on Home → Ready to upload and in the Projects list row; the Projects row alone offers **Undo** (`packages/web/src/home/ready.tsx:75`, `packages/web/src/routes/projects.tsx:374`, `:387`).

## Steps

1. **Project status and progress.** `GET /api/projects` derives each project's `status` with `derive` and `progress` with `progressOf`, and attaches `uploadedAt` from `project_uploads`, `setAside: true` when the project is kept as is on its current head revision, and the long video's `views`/`ctr` from `video_stats` when the extension has read them (`packages/app/src/edge/http/projects.ts:76`, `:88`, `:92`–`:98`). The single-project read attaches `setAside` the same way (`projects.ts:121`). `derive`: paused → `paused`; any stage running or pending with a `retryAt` → `running`; any canceled → `canceled`; any failed → `partial` when the headline output was made, else `failed`; all satisfied → `done`; otherwise `pending` (`packages/app/src/kernel/runner/graph.ts:57`). `progressOf` averages per-stage share over stages not `provided`/`skipped`, 1 when none are asked (`packages/app/src/kernel/runner/graph.ts:111`).
2. **Home classifies** the channel's projects (`packages/web/src/routes/home.tsx:88`):
   - Running now: `status === "running"`; first three shown as live cards (`packages/web/src/routes/home.tsx:210`).
   - Queued: `pending` with `progress === 0` (`packages/web/src/home/running-more.tsx:8`); named in one line under Running now, first two titles then "and N more" (`packages/web/src/home/running-more.tsx:13`, `:26`).
   - Waiting for you: `pending` with `progress > 0` and not kept as is — the runner stopped at a checkpoint or held work (`packages/web/src/home/needs-you.tsx:47`).
   - Paused: `status === "paused"` (`packages/web/src/routes/home.tsx:91`).
   - Failed: `status === "failed"` only; `partial` is not listed here (`packages/web/src/routes/home.tsx:93`).
   - Held topics: schedules not deleted, in `hold` topic mode, with `topics.held > 0`, whose template belongs to the channel (`packages/web/src/routes/home.tsx:99`).
   - Ready to upload: `done`, `partial`, or `pending` and kept as is; `sources.video !== "off"`; `uploadedAt === null` (`packages/web/src/home/ready.tsx:18`), minus the bundled sample projects (`packages/web/src/routes/home.tsx:95`).
3. **Needs you order** is waiting, paused, held schedules, then failed capped at four (`packages/web/src/routes/home.tsx:109`, `shownPerSection` `:31`). Only the first item's action is `primary` (`packages/web/src/routes/home.tsx:167`). The heading counts the list as built, so the count includes at most four failed (`packages/web/src/routes/home.tsx:157`).
4. **Item actions**:
   - Waiting: reads the project's checkpoints; the gate is the `held`/`pending-review` one whose `fingerprint` equals `currentFingerprint`. With a gate the button approves in place ("Approve the article and record", "Approve and draw the images", "Approve and render"), reusing one `idempotencyKey` until a reply arrives; without one it links **Open to continue** beside a quiet **Keep as is** (`packages/web/src/home/needs-you.tsx:119`, `:85`, `:126`, `:204`, `:213`). Approval rules are 23-review-checkpoints.md's.
   - Held topics: **Review topics** links to `/calendar` (`packages/web/src/home/needs-you.tsx:258`).
   - Paused: **Open to continue** (`packages/web/src/home/needs-you.tsx:286`).
   - Failed: reads the project, takes its first failed stage and its fix-it (step 6); `provider-settings` → Settings → Providers, `free-space` → Settings → Storage, `sign-in` → **Copy sign-in command** plus **Open to retry**, anything else → a link labelled with the fix or **Open to retry** (`packages/web/src/home/needs-you.tsx:310`, `:326`). The detail line is `shortReason` of the failure, or "The run stopped with an error." (`packages/web/src/home/needs-you.tsx:323`).
5. **Ready to upload item** shows **Prepare upload** (Studio pack, owned by the Studio upload scenario) and **Mark uploaded** (`packages/web/src/home/ready.tsx:74`). Four are shown (`packages/web/src/routes/home.tsx:249`).
6. **Fix-it mapping** `fixFor({ stage, kind, reason, provider })` is checked in this order (`packages/app/src/slices/fixes/rules.ts:58`):
   1. A CLI is identified (`claude-code`/`gemini` provider, `codex`/`codex-image` → `codex`, or the reason names "Codex CLI"/"Claude Code CLI"/"Gemini CLI") and the reason matches the signed-out pattern or `kind === "auth"` → `sign-in` with command `claude auth login`, `codex login` or `gemini` (`packages/app/src/slices/fixes/rules.ts:37`, `:43`, `:87`).
   2. Reason matches `ENOSPC`/no space/disk full → `free-space` (`packages/app/src/slices/fixes/rules.ts:45`, `:68`).
   3. `kind === "refusal"` or content-filter words → `refused`; `soften: true` with label "Soften and retry" for `images`/`thumbnail`, and for `video` when the reason starts "Short N image M:" (a short's still), else "Edit the prompt" (`packages/app/src/slices/fixes/rules.ts:47`, `:54`, `:56`, `:70`).
   4. Unknown/retired model wording → `switch-model` "Switch model" (`packages/app/src/slices/fixes/rules.ts:49`, `:73`).
   5. `kind` `auth`/`missing_key` or key-trouble wording → `provider-settings`, labelled with the provider's display name when known (`packages/app/src/slices/fixes/rules.ts:51`, `:74`).
   6. Otherwise no fix.
   The stage's provider comes from project config: `audio` → audio provider, `images`/`thumbnail` → images provider, `research`/`article` → LLM provider, others none (`packages/app/src/slices/fixes/rules.ts:101`). The rules file is pure and imported by the web bundle; consumers are the project page (`packages/web/src/project/fix-it.tsx:12`), Home, schedule topic failures (`packages/web/src/schedules/topic-failure.tsx:2`) and the cast editor (`packages/web/src/channels/cast-editor.tsx:1`).
7. **Fix-it buttons** (`FixActions`): `sign-in` → **Copy sign-in command** and **Check again**, which calls the provider health check and reads the "Signed in" check: `ok` → retries the step when a `retry` is given, `problem` → error toast, anything else → treated as unknown and retried (`packages/web/src/fixes/fix-actions.tsx:21`, `:62`, `:81`); `provider-settings` and `free-space` → Settings links; `refused`/`switch-model` → the caller's own `edit` node or nothing (`packages/web/src/fixes/fix-actions.tsx:119`).
8. **Mark uploaded** (`markUploaded`): 404 when the project row is missing; `uploaded: false` deletes the row and returns `uploadedAt: null`; `uploaded: true` inserts with `ON CONFLICT DO NOTHING` and returns the stored time (`packages/app/src/slices/uploads/repo.ts:10`). The client invalidates the project list on settle (`packages/web/src/home/ready.tsx:49`, `packages/web/src/routes/projects.tsx:144`).
9. **Keep as is** (`setAside`, `packages/app/src/slices/uploads/repo.ts:43`): 404 when the project has no head revision; `setAside: true` upserts one `project_set_aside` row holding the current head `revision_id`; `false` deletes it. `setAsideProjects` counts a row only while its `revision_id` is still the head, so any edit that makes a new head brings the run back to Needs you without touching the row (`repo.ts:61`, `packages/app/src/kernel/db/migrations/0044-project-set-aside.sql:1`). The success toast offers **Undo** (`setAside: false`); the list is invalidated on settle (`packages/web/src/home/needs-you.tsx:158`–`:176`). A kept project reads "Kept as is" in the Projects list (`packages/web/src/routes/projects.tsx:87`) and on the project page, whose next action is **Prepare upload** when the video is ready, else none (`packages/web/src/project/next-action.ts:311`). Nothing is run or canceled; the project's stages stay as they are.
10. **This week** (`weekSummary`): counts provider calls and cost since `since`, the API-equivalent of plan-billed calls, `video` outputs created since `since` (a remade video counts again), and each CLI plan's latest window readings, narrowed to one channel except plan standings (`packages/app/src/slices/run-cost/week.ts:65`, `:98`). Pricing and plan readings are 37-run-cost-and-eta.md's. Home shows videos, cost with "~$X via API" and "N calls without a price", and a meter per plan with a weekly percent, tone `waiting` at 80 % or more (`packages/web/src/home/week.tsx:15`, `:44`, `:58`). The query is stale after 30 s (`packages/web/src/home/api.ts:27`).
11. **Calendar attention**: `GET /api/calendar` (`calendarRange`, range ≤ 92 days) returns projects running or created before `to`, and terminal ones whose last stage finished inside the range (`packages/app/src/slices/schedules/agenda.ts:35`, `:190`, `:216`, `packages/app/src/slices/schedules/schema.ts:281`). Each carries (`packages/app/src/slices/schedules/agenda.ts:181`, `:222`):
    - `needs: "failed"` when failed; `"paused"` when paused; `"review"` when not canceled and the head revision has an unapproved `held`/`pending-review` checkpoint or a latest failed automatic-review verdict with no action and no redo under way (or a failed redo) (`packages/app/src/slices/schedules/agenda.ts:141`).
    - `readyToUpload: true` when `done`/`partial`, the config makes a video (unparseable or pre-sources config counts as yes), no upload mark and not a sample project (`packages/app/src/slices/schedules/agenda.ts:161`, `:223`).
    Keep as is is not read here: a kept-as-is project with an open checkpoint still carries `needs: "review"`, and one in `pending` is never `readyToUpload` (`agenda.ts:222`–`:227`).
    The web orders the calendar's Needs you list as projects with `needs`, then `readyToUpload` ones (`packages/web/src/calendar/attention.ts:72`), labels them failed → **Open to fix**, paused → **Open to continue**, review → "Waiting for your review" / **Open to review**, then a CLI limit wait line, then "Ready to upload" with **Prepare upload**, then the plain state word (`packages/web/src/calendar/attention.ts:29`), and heads it "N waiting for you · M ready to upload" (`packages/web/src/calendar/attention.ts:59`).

## Branches

- **Channel filter**: projects by `channelId`; held schedules and Coming up by their template's channel (`packages/web/src/routes/home.tsx:86`, `:104`, `:106`). This week passes the channel to the server (`packages/web/src/home/week.tsx:29`).
- **Home vs calendar "needs"**: Home lists `pending`-with-progress runs as Waiting and never lists automatic-review verdicts on their own; the calendar's `review` comes from checkpoint and verdict rows, and it does not mark a `pending` run without such a row (`packages/web/src/home/needs-you.tsx:47`, `packages/app/src/slices/schedules/agenda.ts:181`).
- **Sample projects**: Home and the calendar leave them out of Ready to upload (`packages/web/src/routes/home.tsx:98`, `packages/app/src/slices/schedules/agenda.ts:227`); the Projects list's `isReadyToUpload` does not, so the sample's row shows **Mark uploaded** (`packages/web/src/routes/projects.tsx:374`).
- **Undo**: only the Projects list shows an **Uploaded** badge with **Undo** (`uploaded: false`) (`packages/web/src/routes/projects.tsx:387`). Home's toast mentions the way back ("Projects still lists it") (`packages/web/src/home/ready.tsx:38`).
- **Kept as is**: off Waiting, onto Ready to upload when its video is made; any edit that moves the head revision undoes it (step 9).
- **Projects list filters** reuse the same predicates: `waiting` = `isWaiting`, `ready` = `isReadyToUpload`, `queued` = `isQueued`; `failed` there includes `partial` (`packages/web/src/routes/projects.tsx:58`).
- **Command palette** registers "Approve …"/"Open the held run" per waiting item and "Mark uploaded" per ready item (`packages/web/src/home/needs-you.tsx:178`, `packages/web/src/home/ready.tsx:53`).
- **Empty states**: "Nothing is waiting for a decision"; Running now shows "Start the next video" only when nothing is running, loading or queued (`packages/web/src/routes/home.tsx:156`, `:203`).

## Unhappy paths

| Case | Behavior | Site |
|---|---|---|
| Mark uploaded or Keep as is on a deleted project | 404 "This project no longer exists. Go back to Projects to pick another." | `packages/app/src/edge/http/home.ts:48`, `:68` |
| Keep as is request fails | Toast "<title> wasn't kept as is: <message> Press Keep as is again." | `packages/web/src/home/needs-you.tsx:169` |
| Keep as is on the sample | The sample read-only guard answers 409, as for Mark uploaded | `packages/app/src/edge/http/app.ts:277` |
| Mark uploaded twice | First time kept (`ON CONFLICT DO NOTHING`); returns the stored time | `packages/app/src/slices/uploads/repo.ts:22` |
| Mark uploaded on the sample (Projects list) | The sample read-only guard answers 409 for any non-GET under `/api/projects/:id/*` except its exemptions; the row's toast says "wasn't changed: …" | `packages/app/src/edge/http/app.ts:277`, `:326`, `packages/web/src/routes/projects.tsx:139` |
| Mark uploaded request fails on Home | Toast "… wasn't marked uploaded: <message> Press Mark uploaded again." | `packages/web/src/home/ready.tsx:44` |
| Invalid `since`/`channelId` | 400 problem via `onInvalid` | `packages/app/src/edge/http/home.ts:9` |
| Unknown `channelId` on This week | No error; counts are zero for projects and standalone calls of a missing channel fold into the default channel | `packages/app/src/slices/run-cost/week.ts:92` |
| Projects, calendar or week fail to load | Inline alert naming what failed and "Reload the page" | `packages/web/src/routes/home.tsx:141`, `:223`, `packages/web/src/home/week.tsx:30` |
| Home approval not confirmed | Toast "Slopify didn't confirm the approval… Press the button again"; the same `idempotencyKey` is reused | `packages/web/src/home/needs-you.tsx:143`, `:126` |
| Approval refused | Toast "<title> wasn't approved: <message> Open the project to review it there." | `packages/web/src/home/needs-you.tsx:139` |
| Gate edited since load | No approve button; **Open to continue** | `packages/web/src/home/needs-you.tsx:119`, `:204` |
| Clipboard blocked on sign-in copy | Error toast telling the person to type the command | `packages/web/src/home/needs-you.tsx:317`, `packages/web/src/fixes/fix-actions.tsx:95` |
| Check again cannot reach the health check | Error toast naming Check all in Settings → Providers | `packages/web/src/fixes/fix-actions.tsx:84` |
| Invalid calendar range | 400 "Choose a range whose end is after its start and at most 92 days long." | `packages/app/src/edge/http/schedules.ts:358` |
| Failed step whose error matches no rule | No fix; Home links **Open to retry** | `packages/app/src/slices/fixes/rules.ts:83`, `packages/web/src/home/needs-you.tsx:347` |

## State transitions

- `project_uploads` row: absent → present on `uploaded: true`; present → absent on `uploaded: false` (`packages/app/src/slices/uploads/repo.ts:18`). No other state; the project's run state and config are untouched, so no fingerprint changes (`packages/app/src/kernel/db/migrations/0037-project-uploads.sql:1`).
- `project_set_aside` row: absent → present (`setAside: true`, holding the head revision) → absent (`false`); it stops counting, without being deleted, once another revision becomes head (`packages/app/src/slices/uploads/repo.ts:43`, `:61`). The project's stages and run state are untouched.
- Home and the calendar move nothing else themselves; approval moves a checkpoint (see 23-review-checkpoints.md) and fix-its route to screens that move provider, storage or stage state.

## Invariants

- One upload mark per project (`project_id` primary key), deleted with the project (`ON DELETE CASCADE`) (`packages/app/src/kernel/db/migrations/0037-project-uploads.sql:5`). One set-aside row per project, likewise cascaded (`packages/app/src/kernel/db/migrations/0044-project-set-aside.sql:5`).
- A kept-as-is project is never Waiting on Home and never a Needs you count (`packages/web/src/home/needs-you.tsx:47`).
- A marked project never appears in Ready to upload on Home, the calendar or the Projects filter (`packages/web/src/home/ready.tsx:25`, `packages/app/src/slices/schedules/agenda.ts:226`).
- A project whose config turns Video off is never Ready to upload (`packages/web/src/home/ready.tsx:24`, `packages/app/src/slices/schedules/agenda.ts:225`).
- Every failure the fix-it rules can name is named in `slices/fixes/rules.ts` only; the web renders, it does not re-derive (`packages/app/src/slices/fixes/rules.ts:4`).
- No provider call is made by Home reads, Mark uploaded, Keep as is, or the fix-it lookup; Check again calls only the provider health check.

## Outcomes & side effects

- `PUT …/uploaded` returns `{ uploadedAt }` and writes or deletes one `project_uploads` row; no event is emitted, so other tabs see it on their next project-list refetch (`packages/app/src/edge/http/home.ts:74`). `PUT …/set-aside` returns `{ setAside }` the same way (`home.ts:54`).
- Backups carry `project_uploads` but leave `project_set_aside` out on purpose: a restored project shows on Needs you again (`packages/app/src/slices/storage/backup-format.ts:62`, `:73`).
- `GET /home/week` returns `WeekSummary` `{ since, videos, calls, cost, unpriced, apiEquivalent, plans }` (`packages/app/src/slices/run-cost/week.ts:28`).
- Home lists refresh through the live event stream (see 39-notifications-and-live-events.md); Running now cards ride each project's stream (`packages/web/src/home/running-now.tsx:18`).

## Dimensions not in play

- D1 Authority: single local user; no roles.
- D5 Money: Mark uploaded and Home move no money; This week only reads recorded cost.
- D6 Limits: display caps only (four per section, three running cards, two queued titles, six coming-up runs) (`packages/web/src/routes/home.tsx:31`, `:234`).
- D7 Time: upload marks never expire; `uploaded_at` is the first mark's time.
- D12 Visibility: nothing leaves the machine; Slopify never uploads to YouTube.
- D13 Notification: Home sends none; run notifications are 39-notifications-and-live-events.md's.
- D15 Record: the upload mark and the set-aside row are the only records; no history of unmarks or undos.
