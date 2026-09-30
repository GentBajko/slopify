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
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: 141ff9d86edf
paths_covered:
  - ":(top)packages/app/src/edge/http/home.ts"
  - ":(top)packages/app/src/slices/uploads/**"
  - ":(top)packages/app/src/slices/fixes/**"
  - ":(top)packages/app/src/slices/schedules/agenda.ts"
  - ":(top)packages/app/src/kernel/db/migrations/0037-project-uploads.sql"
  - ":(top)packages/web/src/routes/home.tsx"
  - ":(top)packages/web/src/home/**"
  - ":(top)packages/web/src/calendar/attention.ts"
  - ":(top)packages/web/src/fixes/**"
  - ":(top)packages/web/src/project/fix-it.tsx"
  - ":(top)packages/web/src/routes/projects.tsx"
---

# 38 Home attention and uploads

Home (`/`) sorts the person's projects and schedules into what needs a decision, what is running, what is coming up, what is ready to upload and what this week cost. The calendar's **Needs you** list applies the server-side version of the same readings. **Mark uploaded** is the only way Slopify learns a video went to YouTube; it never uploads. Fix-its map a failed step's error to the one action that repairs it.

## Trigger & preconditions

- Home is `HomeRoute`, which reads the project list, schedules, templates, the calendar for the next eight local days and the first-run state (`packages/web/src/routes/home.tsx:40`, `:47`, `:55`, `:57`). Everything is filtered to the channel picked in the rail, or every channel (`packages/web/src/routes/home.tsx:86`, `:122`).
- A fresh install navigates from Home to `/welcome` once per page load while the first-run state says `show` (`packages/web/src/routes/home.tsx:60`); onboarding owns that state.
- **This week** reads `GET /api/home/week?since=<ISO>&channelId=<id>` (`packages/app/src/edge/http/home.ts:16`, mounted at `packages/app/src/edge/http/app.ts:198`). `since` is the browser's own Monday 00:00 (`packages/web/src/home/api.ts:11`).
- **Mark uploaded** is `PUT /api/projects/:id/uploaded` with body `{ uploaded: boolean }` (strict) (`packages/app/src/edge/http/home.ts:33`, mounted at `packages/app/src/edge/http/app.ts:197`). The id must match `^[0-9A-Za-z_-]+$`, 1–64 characters (`packages/app/src/edge/http/home.ts:23`).
- Mark uploaded is offered on Home → Ready to upload and in the Projects list row; the Projects row alone offers **Undo** (`packages/web/src/home/ready.tsx:72`, `packages/web/src/routes/projects.tsx:367`, `:380`).

## Steps

1. **Project status and progress.** `GET /api/projects` derives each project's `status` with `derive` and `progress` with `progressOf`, and attaches `uploadedAt` from `project_uploads` (`packages/app/src/edge/http/projects.ts:75`, `:85`). `derive`: paused → `paused`; any stage running or pending with a `retryAt` → `running`; any canceled → `canceled`; any failed → `partial` when the headline output was made, else `failed`; all satisfied → `done`; otherwise `pending` (`packages/app/src/kernel/runner/graph.ts:57`). `progressOf` averages per-stage share over stages not `provided`/`skipped`, 1 when none are asked (`packages/app/src/kernel/runner/graph.ts:111`).
2. **Home classifies** the channel's projects (`packages/web/src/routes/home.tsx:88`):
   - Running now: `status === "running"`; first three shown as live cards (`packages/web/src/routes/home.tsx:210`).
   - Queued: `pending` with `progress === 0` (`packages/web/src/home/running-more.tsx:8`); named in one line under Running now, first two titles then "and N more" (`packages/web/src/home/running-more.tsx:13`, `:26`).
   - Waiting for you: `pending` with `progress > 0` — the runner stopped at a checkpoint or held work (`packages/web/src/home/needs-you.tsx:46`).
   - Paused: `status === "paused"` (`packages/web/src/routes/home.tsx:91`).
   - Failed: `status === "failed"` only; `partial` is not listed here (`packages/web/src/routes/home.tsx:93`).
   - Held topics: schedules not deleted, in `hold` topic mode, with `topics.held > 0`, whose template belongs to the channel (`packages/web/src/routes/home.tsx:99`).
   - Ready to upload: `done` or `partial`, `sources.video !== "off"`, `uploadedAt === null` (`packages/web/src/home/ready.tsx:18`), minus the bundled sample projects (`packages/web/src/routes/home.tsx:95`).
3. **Needs you order** is waiting, paused, held schedules, then failed capped at four (`packages/web/src/routes/home.tsx:109`, `shownPerSection` `:31`). Only the first item's action is `primary` (`packages/web/src/routes/home.tsx:167`). The heading counts the list as built, so the count includes at most four failed (`packages/web/src/routes/home.tsx:157`).
4. **Item actions**:
   - Waiting: reads the project's checkpoints; the gate is the `held`/`pending-review` one whose `fingerprint` equals `currentFingerprint`. With a gate the button approves in place ("Approve the article and record", "Approve and draw the images", "Approve and render"), reusing one `idempotencyKey` until a reply arrives; without one it links **Open to continue** (`packages/web/src/home/needs-you.tsx:118`, `:84`, `:125`, `:182`). Approval rules are 23-review-checkpoints.md's.
   - Held topics: **Review topics** links to `/calendar` (`packages/web/src/home/needs-you.tsx:226`).
   - Paused: **Open to continue** (`packages/web/src/home/needs-you.tsx:254`).
   - Failed: reads the project, takes its first failed stage and its fix-it (step 6); `provider-settings` → Settings → Providers, `free-space` → Settings → Storage, `sign-in` → **Copy sign-in command** plus **Open to retry**, anything else → a link labelled with the fix or **Open to retry** (`packages/web/src/home/needs-you.tsx:278`, `:294`). The detail line is `shortReason` of the failure, or "The run stopped with an error." (`packages/web/src/home/needs-you.tsx:291`).
5. **Ready to upload item** shows **Prepare upload** (Studio pack, owned by the Studio upload scenario) and **Mark uploaded** (`packages/web/src/home/ready.tsx:71`). Four are shown (`packages/web/src/routes/home.tsx:249`).
6. **Fix-it mapping** `fixFor({ stage, kind, reason, provider })` is checked in this order (`packages/app/src/slices/fixes/rules.ts:56`):
   1. A CLI is identified (`claude-code`/`gemini` provider, `codex`/`codex-image` → `codex`, or the reason names "Codex CLI"/"Claude Code CLI"/"Gemini CLI") and the reason matches the signed-out pattern or `kind === "auth"` → `sign-in` with command `claude auth login`, `codex login` or `gemini` (`packages/app/src/slices/fixes/rules.ts:37`, `:43`, `:85`).
   2. Reason matches `ENOSPC`/no space/disk full → `free-space` (`packages/app/src/slices/fixes/rules.ts:45`, `:66`).
   3. `kind === "refusal"` or content-filter words → `refused`; `soften: true` with label "Soften and retry" for `images`/`thumbnail`, else "Edit the prompt" (`packages/app/src/slices/fixes/rules.ts:47`, `:54`, `:67`).
   4. Unknown/retired model wording → `switch-model` "Switch model" (`packages/app/src/slices/fixes/rules.ts:49`, `:71`).
   5. `kind` `auth`/`missing_key` or key-trouble wording → `provider-settings`, labelled with the provider's display name when known (`packages/app/src/slices/fixes/rules.ts:51`, `:72`).
   6. Otherwise no fix.
   The stage's provider comes from project config: `audio` → audio provider, `images`/`thumbnail` → images provider, `research`/`article` → LLM provider, others none (`packages/app/src/slices/fixes/rules.ts:99`). The rules file is pure and imported by the web bundle; consumers are the project page (`packages/web/src/project/fix-it.tsx:12`), Home, schedule topic failures (`packages/web/src/schedules/topic-failure.tsx:2`) and the cast editor (`packages/web/src/channels/cast-editor.tsx:1`).
7. **Fix-it buttons** (`FixActions`): `sign-in` → **Copy sign-in command** and **Check again**, which calls the provider health check and reads the "Signed in" check: `ok` → retries the step when a `retry` is given, `problem` → error toast, anything else → treated as unknown and retried (`packages/web/src/fixes/fix-actions.tsx:21`, `:62`, `:81`); `provider-settings` and `free-space` → Settings links; `refused`/`switch-model` → the caller's own `edit` node or nothing (`packages/web/src/fixes/fix-actions.tsx:119`).
8. **Mark uploaded** (`markUploaded`): 404 when the project row is missing; `uploaded: false` deletes the row and returns `uploadedAt: null`; `uploaded: true` inserts with `ON CONFLICT DO NOTHING` and returns the stored time (`packages/app/src/slices/uploads/repo.ts:10`). The client invalidates the project list on settle (`packages/web/src/home/ready.tsx:46`, `packages/web/src/routes/projects.tsx:142`).
9. **This week** (`weekSummary`): counts provider calls and cost since `since`, the API-equivalent of plan-billed calls, `video` outputs created since `since` (a remade video counts again), and each CLI plan's latest window readings, narrowed to one channel except plan standings (`packages/app/src/slices/run-cost/week.ts:65`, `:98`). Pricing and plan readings are 37-run-cost-and-eta.md's. Home shows videos, cost with "~$X via API" and "N calls without a price", and a meter per plan with a weekly percent, tone `waiting` at 80 % or more (`packages/web/src/home/week.tsx:15`, `:44`, `:58`). The query is stale after 30 s (`packages/web/src/home/api.ts:27`).
10. **Calendar attention**: `GET /api/calendar` (`calendarRange`, range ≤ 92 days) returns projects running or created before `to`, and terminal ones whose last stage finished inside the range (`packages/app/src/slices/schedules/agenda.ts:34`, `:184`, `:210`, `packages/app/src/slices/schedules/schema.ts:278`). Each carries (`packages/app/src/slices/schedules/agenda.ts:175`, `:216`):
    - `needs: "failed"` when failed; `"paused"` when paused; `"review"` when not canceled and the head revision has an unapproved `held`/`pending-review` checkpoint or a latest failed automatic-review verdict with no action and no redo under way (or a failed redo) (`packages/app/src/slices/schedules/agenda.ts:135`).
    - `readyToUpload: true` when `done`/`partial`, the config makes a video (unparseable or pre-sources config counts as yes), no upload mark and not a sample project (`packages/app/src/slices/schedules/agenda.ts:155`, `:217`).
    The web orders the calendar's Needs you list as projects with `needs`, then `readyToUpload` ones (`packages/web/src/calendar/attention.ts:72`), labels them failed → **Open to fix**, paused → **Open to continue**, review → "Waiting for your review" / **Open to review**, then a CLI limit wait line, then "Ready to upload" with **Prepare upload**, then the plain state word (`packages/web/src/calendar/attention.ts:29`), and heads it "N waiting for you · M ready to upload" (`packages/web/src/calendar/attention.ts:59`).

## Branches

- **Channel filter**: projects by `channelId`; held schedules and Coming up by their template's channel (`packages/web/src/routes/home.tsx:86`, `:104`, `:106`). This week passes the channel to the server (`packages/web/src/home/week.tsx:29`).
- **Home vs calendar "needs"**: Home lists `pending`-with-progress runs as Waiting and never lists automatic-review verdicts on their own; the calendar's `review` comes from checkpoint and verdict rows, and it does not mark a `pending` run without such a row (`packages/web/src/home/needs-you.tsx:46`, `packages/app/src/slices/schedules/agenda.ts:175`).
- **Sample projects**: Home and the calendar leave them out of Ready to upload (`packages/web/src/routes/home.tsx:98`, `packages/app/src/slices/schedules/agenda.ts:221`); the Projects list's `isReadyToUpload` does not, so the sample's row shows **Mark uploaded** (`packages/web/src/routes/projects.tsx:367`).
- **Undo**: only the Projects list shows an **Uploaded** badge with **Undo** (`uploaded: false`) (`packages/web/src/routes/projects.tsx:380`). Home's toast mentions the way back ("Projects still lists it") (`packages/web/src/home/ready.tsx:35`).
- **Projects list filters** reuse the same predicates: `waiting` = `isWaiting`, `ready` = `isReadyToUpload`, `queued` = `isQueued`; `failed` there includes `partial` (`packages/web/src/routes/projects.tsx:58`).
- **Command palette** registers "Approve …"/"Open the held run" per waiting item and "Mark uploaded" per ready item (`packages/web/src/home/needs-you.tsx:156`, `packages/web/src/home/ready.tsx:50`).
- **Empty states**: "Nothing is waiting for a decision"; Running now shows "Start the next video" only when nothing is running, loading or queued (`packages/web/src/routes/home.tsx:156`, `:203`).

## Unhappy paths

| Case | Behavior | Site |
|---|---|---|
| Mark uploaded on a deleted project | 404 "This project no longer exists. Go back to Projects to pick another." | `packages/app/src/edge/http/home.ts:45` |
| Mark uploaded twice | First time kept (`ON CONFLICT DO NOTHING`); returns the stored time | `packages/app/src/slices/uploads/repo.ts:22` |
| Mark uploaded on the sample (Projects list) | The sample read-only guard answers 409 for any non-GET under `/api/projects/:id/*` except its exemptions; the row's toast says "wasn't changed: …" | `packages/app/src/edge/http/app.ts:277`, `:326`, `packages/web/src/routes/projects.tsx:137` |
| Mark uploaded request fails on Home | Toast "… wasn't marked uploaded: <message> Press Mark uploaded again." | `packages/web/src/home/ready.tsx:41` |
| Invalid `since`/`channelId` | 400 problem via `onInvalid` | `packages/app/src/edge/http/home.ts:9` |
| Unknown `channelId` on This week | No error; counts are zero for projects and standalone calls of a missing channel fold into the default channel | `packages/app/src/slices/run-cost/week.ts:92` |
| Projects, calendar or week fail to load | Inline alert naming what failed and "Reload the page" | `packages/web/src/routes/home.tsx:141`, `:223`, `packages/web/src/home/week.tsx:30` |
| Home approval not confirmed | Toast "Slopify didn't confirm the approval… Press the button again"; the same `idempotencyKey` is reused | `packages/web/src/home/needs-you.tsx:142`, `:125` |
| Approval refused | Toast "<title> wasn't approved: <message> Open the project to review it there." | `packages/web/src/home/needs-you.tsx:138` |
| Gate edited since load | No approve button; **Open to continue** | `packages/web/src/home/needs-you.tsx:118`, `:182` |
| Clipboard blocked on sign-in copy | Error toast telling the person to type the command | `packages/web/src/home/needs-you.tsx:285`, `packages/web/src/fixes/fix-actions.tsx:95` |
| Check again cannot reach the health check | Error toast naming Check all in Settings → Providers | `packages/web/src/fixes/fix-actions.tsx:84` |
| Invalid calendar range | 400 "Choose a range whose end is after its start and at most 92 days long." | `packages/app/src/edge/http/schedules.ts:320` |
| Failed step whose error matches no rule | No fix; Home links **Open to retry** | `packages/app/src/slices/fixes/rules.ts:81`, `packages/web/src/home/needs-you.tsx:315` |

## State transitions

- `project_uploads` row: absent → present on `uploaded: true`; present → absent on `uploaded: false` (`packages/app/src/slices/uploads/repo.ts:18`). No other state; the project's run state and config are untouched, so no fingerprint changes (`packages/app/src/kernel/db/migrations/0037-project-uploads.sql:1`).
- Home and the calendar move nothing else themselves; approval moves a checkpoint (see 23-review-checkpoints.md) and fix-its route to screens that move provider, storage or stage state.

## Invariants

- One upload mark per project (`project_id` primary key), deleted with the project (`ON DELETE CASCADE`) (`packages/app/src/kernel/db/migrations/0037-project-uploads.sql:5`).
- A marked project never appears in Ready to upload on Home, the calendar or the Projects filter (`packages/web/src/home/ready.tsx:22`, `packages/app/src/slices/schedules/agenda.ts:220`).
- A project whose config turns Video off is never Ready to upload (`packages/web/src/home/ready.tsx:21`, `packages/app/src/slices/schedules/agenda.ts:219`).
- Every failure the fix-it rules can name is named in `slices/fixes/rules.ts` only; the web renders, it does not re-derive (`packages/app/src/slices/fixes/rules.ts:4`).
- No provider call is made by Home reads, Mark uploaded, or the fix-it lookup; Check again calls only the provider health check.

## Outcomes & side effects

- `PUT …/uploaded` returns `{ uploadedAt }` and writes or deletes one `project_uploads` row; no event is emitted, so other tabs see it on their next project-list refetch (`packages/app/src/edge/http/home.ts:51`).
- `GET /home/week` returns `WeekSummary` `{ since, videos, calls, cost, unpriced, apiEquivalent, plans }` (`packages/app/src/slices/run-cost/week.ts:28`).
- Home lists refresh through the live event stream (see 39-notifications-and-live-events.md); Running now cards ride each project's stream (`packages/web/src/home/running-now.tsx:18`).

## Dimensions not in play

- D1 Authority: single local user; no roles.
- D5 Money: Mark uploaded and Home move no money; This week only reads recorded cost.
- D6 Limits: display caps only (four per section, three running cards, two queued titles, six coming-up runs) (`packages/web/src/routes/home.tsx:31`, `:234`).
- D7 Time: upload marks never expire; `uploaded_at` is the first mark's time.
- D12 Visibility: nothing leaves the machine; Slopify never uploads to YouTube.
- D13 Notification: Home sends none; run notifications are 39-notifications-and-live-events.md's.
- D15 Record: the upload mark is the only record; no history of unmarks.
