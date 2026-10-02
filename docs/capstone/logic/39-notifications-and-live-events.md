---
scenario: notifications-and-live-events
screens:
  - 03-project
  - 08-settings
depends_on:
  - 01-pipeline-lifecycle
  - 12-reruns-and-edits
  - 23-review-checkpoints
  - 25-scheduled-jobs
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: 74fc29e77df2
paths_covered:
  - ":(top)packages/app/src/edge/events/**"
  - ":(top)packages/app/src/kernel/events.ts"
  - ":(top)packages/app/src/slices/notifications/**"
  - ":(top)packages/app/src/edge/http/settings.ts"
  - ":(top)packages/app/src/edge/http/app.ts"
  - ":(top)packages/app/src/main.ts"
  - ":(top)packages/web/src/event-mux.ts"
  - ":(top)packages/web/src/events.ts"
  - ":(top)packages/web/src/project/use-live.ts"
  - ":(top)packages/web/src/components/shell.tsx"
  - ":(top)packages/web/src/notifications/**"
---

# 39 Notifications and live events

The server pushes run events to open pages over Server-Sent Events from one in-process hub. Each browser page holds a single connection (the global stream, which carries every project's events) and fans it out to the views that show a project. The same events drive run notifications: the server POSTs to a Notification URL, and each browser shows its own notifications and plays run sounds.

## Trigger & preconditions

- Events are produced by the runner (`stage.state`, `stage.progress`, `project.state`, `running.count`), stage slices (`article.delta`, `llm.preview`, `image.landed`, `narration.piece`), cancel/control (`project.state`), edits and approvals (`project.updated`), automatic reviews (`review.flagged`), staging uploads (`staging.progress`/`staging.failed`) and schedules (`schedule.topics`) (`packages/app/src/kernel/events.ts:13`, `packages/app/src/kernel/runner/index.ts:103`, `:138`, `packages/app/src/slices/cancel/index.ts:177`, `packages/app/src/main.ts:518`, `:528`).
- Streams: `GET /api/events/global` and `GET /api/events/projects/:id`, both `streamSSE` (`packages/app/src/edge/http/app.ts:298`, `:301`). The project id is not validated; an unknown id simply receives nothing.
- The shell subscribes to the global stream on mount (`packages/web/src/components/shell.tsx:335`); a project view (project page, each Home "Running now" card) subscribes through `useLiveProject` (`packages/web/src/project/use-live.ts:21`, `packages/web/src/home/running-now.tsx:18`).
- Notification URL: `GET/PUT /api/settings/notifications`, `POST /api/settings/notifications/test` (`packages/app/src/edge/http/settings.ts:110`, `:111`, `:123`). Browser notifications and run sounds are per-browser `localStorage` switches in Settings → Notifications (`packages/web/src/notifications/settings-panel.tsx:29`).

## Steps

### Server hub

1. `main.ts` builds the hub with `presentEvent: eventPresenter(db)` and wraps it in `observedHub`, which hands every project event to the run notifier and the episode-memory watcher after the pages have it (`packages/app/src/main.ts:308`, `packages/app/src/edge/events/hub.ts:202`).
2. **Presenting** (`currentEvent`): `project.updated` and a `project.state` without origin pass; any other event passes only when its work is the head revision's own or was carried to it unchanged (reservation fingerprint equals the revision's fingerprint), and is re-labelled with the head `revisionId`; otherwise it is dropped (`packages/app/src/edge/events/visibility.ts:38`, `:8`). For `llm.preview`/`article.delta` the answer is cached one second per `(project, revision, work, piece)`, cache cleared above 512 keys (`packages/app/src/edge/events/visibility.ts:58`).
3. **Emit**: a presented event updates the preview cache and is written to that project's subscribers and to every global subscriber; a dropped `stage.state` still clears the cache (`packages/app/src/edge/events/hub.ts:180`). `emitGlobal` writes to global subscribers and remembers the latest `running.count` (`packages/app/src/edge/events/hub.ts:189`).
4. **Frames**: `event:` is the event type, `data:` is the JSON event, `id:` is a fresh id per frame (`packages/app/src/edge/events/hub.ts:105`). An idle stream gets an `event: ping` every 20 s (`packages/app/src/edge/events/hub.ts:99`, `:138`).
5. **Join replay**: a global subscriber first receives the last `running.count` (initially 0) and then every cached `llm.preview`; a project subscriber receives that project's cached previews (`packages/app/src/edge/events/hub.ts:151`, `:167`). The preview cache keeps visible response text only, the last 64 KiB per call, 8 calls per project, 16 projects, and drops a call when its stage's `stage.state` arrives for the same revision and work (`packages/app/src/edge/events/preview-cache.ts:3`, `:14`, `:32`, `:37`, `:43`).
6. `running.count` is the number of distinct projects with a stage in flight, emitted only when it changes (`packages/app/src/kernel/runner/index.ts:116`). `project.state` is emitted only when the derived state differs from the last announced one (`packages/app/src/kernel/runner/index.ts:129`).

### Browser fan-out

7. `main.tsx` wraps `EventSource` in `createEventMux` (`packages/web/src/main.tsx:36`). A request for `/events/global` or `/events/projects/<id>` returns a stand-in; the first stand-in opens the one real connection, always to `/events/global` (a project URL is rewritten) (`packages/web/src/event-mux.ts:79`, `:83`). Any other URL opens a real `EventSource` as asked (`packages/web/src/event-mux.ts:82`).
8. The mux listens to the 13 named events; each frame is parsed for `projectId` and delivered to the global stand-in and to stand-ins for that project; frames that are not JSON are ignored; `ping` is never listened for (`packages/web/src/event-mux.ts:20`, `:62`).
9. A stand-in created after the connection opened gets its own `open` on the next microtask and the mux's cached previews for its project (the mux keeps its own `createPreviewCache`) (`packages/web/src/event-mux.ts:45`, `:92`). Closing the last stand-in closes the real connection (`packages/web/src/event-mux.ts:110`).
10. **Shell sink** (`subscribeGlobal`): `running.count` sets the top-bar tally ("N running") (`packages/web/src/events.ts:124`, `packages/web/src/components/shell.tsx:397`); `project.updated`/`project.state`/`stage.state`/`stage.progress` invalidate the project list, coalesced to once per second, and `project.state` also feeds the run watcher; `schedule.topics` feeds the watcher and invalidates schedules and calendar; `review.flagged` feeds the watcher and refreshes; staging events invalidate staging (`packages/web/src/events.ts:128`, `packages/web/src/components/shell.tsx:332`).
11. **Project sink** (`subscribeProject` + `useLiveProject`): events whose `revisionId` is not the loaded revision trigger a refetch and are dropped; `llm.preview` appends to the writing preview; `narration.piece` invalidates the waveform peaks; `article.delta` appends to the article text; `image.landed`/`project.updated`/`review.flagged` refetch; `stage.state`/`stage.progress`/`project.state` patch the cached project in place, and `stage.state` also refetches (`packages/web/src/events.ts:83`, `packages/web/src/project/use-live.ts:39`). Refetches are coalesced over 200 ms and invalidate the project, the list, checkpoints and reviews (`packages/web/src/project/use-live.ts:17`, `:30`). A step going `running` clears that step's writing preview, and the article text when the step is `article` (`packages/web/src/project/use-live.ts:65`).
12. **Reconnect**: every `open` after the first is a gap; the global sink invalidates every query, the project sink refetches (`packages/web/src/events.ts:163`, `packages/web/src/components/shell.tsx:350`). Nothing is replayed except the tally and previews.

### Notifications

13. **Rule** `noticeOf(previous, next)`: only a project previously `running` notifies; `done` → `ready`, `partial` → `partial`, `failed` → `failed`, `pending` → `waiting`; paused and canceled say nothing (`packages/app/src/slices/notifications/rules.ts:13`). Server and browser share this file (`packages/app/src/slices/notifications/rules.ts:3`).
14. **Texts**: "Video ready: T" / "Run finished: T" (no video); "Video ready with problems: T — reason"; "Run failed: T — reason"; "Waiting for you: T"; "Review needs a decision: T — reason"; "N new topics are waiting for you" pointing to Calendar → Suggested topics (`packages/app/src/slices/notifications/rules.ts:86`, `:56`, `:126`). A blank title reads "Untitled project"; `shortReason` keeps the first non-empty line, cut to 140 characters with "…" (`packages/app/src/slices/notifications/rules.ts:74`, `:77`).
15. **Server notifier** (`createRunNotifier`): remembers each project's last `failureReason` from `stage.state` (cleared when a stage runs), tracks the last `project.state` per project since boot, and on a notice reads the URL at that moment, the project's title and whether it makes a video, and POSTs (`packages/app/src/slices/notifications/notifier.ts:98`, `:40`, `packages/app/src/main.ts:292`). `review.flagged` notifies once per `verdictId` (`packages/app/src/slices/notifications/notifier.ts:52`); `schedule.topics` with `added > 0` notifies with no project link (`packages/app/src/slices/notifications/notifier.ts:124`, `packages/app/src/main.ts:530`).
16. **POST**: body is plain text `headline\ndetail\nlink\n`, passed through `redact`; `content-type: text/plain; charset=utf-8`, `redirect: "manual"`, 5 s timeout, response body cancelled unread, never retried (`packages/app/src/slices/notifications/rules.ts:145`, `packages/app/src/slices/notifications/notifier.ts:75`, `packages/app/src/slices/notifications/send.ts:11`, `:17`). The link is `http://<host>:<port>/projects/<id>`, with `0.0.0.0`, `::`, empty and `127.0.0.1` shown as `localhost` and IPv6 bracketed (`packages/app/src/slices/notifications/rules.ts:151`).
17. **Browser watcher** (`createRunWatcher`, one per shell): seeds each project's state from the project list when notifications or sounds turn on, never overwriting an event-set state; running/paused at seed counts as already started (`packages/web/src/notifications/watcher.ts:170`, `packages/web/src/notifications/use-run-notifications.ts:76`). A first `running` since the last end plays the start chime and shows "Started: T" (same tag as the run's later notice) (`packages/web/src/notifications/watcher.ts:130`, `packages/web/src/notifications/browser.ts:145`). An end or wait per `noticeOf` plays the end chime and shows the notice; clicking opens the project (`packages/web/src/notifications/watcher.ts:109`, `packages/web/src/notifications/use-run-notifications.ts:62`). The subject's reason is read from the project's first failed stage (`packages/web/src/notifications/use-run-notifications.ts:42`).
18. **One tab per transition**: `claimOnce(key)` records claims in `localStorage` (`slopify.notifications.sent`) for 60 s under the Web Lock `slopify-run-notification`; keys are `<project>:<state>`, `<project>:started`, `topics:<schedule>:<waiting>`, `review:<verdict>` (`packages/web/src/notifications/browser.ts:80`, `packages/web/src/notifications/watcher.ts:112`, `:119`, `:146`, `:158`). Notification tags `slopify-run-<project>` and `slopify-topics-<schedule>` make a later one replace an earlier one (`packages/web/src/notifications/browser.ts:120`, `:134`).
19. **Settings**: Browser notifications ask permission only from the switch's click; `browserNotificationsReady` = switch on and permission `granted` (`packages/web/src/notifications/browser.ts:53`, `:70`, `packages/web/src/notifications/settings-panel.tsx:54`). Run sounds default on (`localStorage` `slopify.notifications.sound` ≠ `off`) and play synthesized Web Audio chimes (start 784→1175 Hz, end 1047→1319→1568 Hz) through a −3 dB limiter; the audio context is unlocked on the first pointer or key press (`packages/web/src/notifications/sounds.ts:11`, `:43`, `:72`, `packages/web/src/notifications/use-run-notifications.ts:85`). The Notification URL form validates as the server does, saves on **Save**, and **Send test notification** POSTs the typed value without saving it (`packages/web/src/notifications/settings-panel.tsx:157`, `:209`, `:216`).
20. **URL rules** (`notificationUrlProblem`): empty clears; otherwise ≤ 2048 characters, absolute `http:`/`https:`, no user name or password (`packages/app/src/slices/notifications/rules.ts:161`). It is stored as JSON in the `settings` row `notificationUrl`; a stored value that no longer passes is read as unset (`packages/app/src/slices/notifications/settings.ts:13`, `:29`). Backups leave the row out (`packages/app/src/slices/storage/portable.ts:489`).

## Branches

- **Carried vs current work**: carried work's events are shown under the head revision; work the head no longer wants is invisible to pages but still reaches the notifier, which only acts on `project.state`, `stage.state` and `review.flagged` (`packages/app/src/edge/events/visibility.ts:35`, `packages/app/src/edge/events/hub.ts:202`).
- **Project without revisions**: an event passes only when it has neither `revisionId` nor `workId` (`packages/app/src/edge/events/visibility.ts:13`).
- **Watcher switches**: with notifications off and sounds on, only chimes; with notifications on and sounds off, only notifications; with both off, `observe` still records state but announces nothing (`packages/web/src/notifications/watcher.ts:129`, `:138`). Topics and review notices show no chime and need notifications on (`packages/web/src/notifications/watcher.ts:142`, `:152`).
- **Waiting then continuing** keeps one start: the `started` set clears only on `done`/`partial`/`failed`/`canceled` (`packages/web/src/notifications/watcher.ts:88`, `:136`).
- **Audio-only runs** say "Run finished" instead of "Video ready" (`packages/app/src/slices/notifications/rules.ts:90`).

## Unhappy paths

| Case | Behavior | Site |
|---|---|---|
| Browser drops the SSE socket | `EventSource` reconnects by itself; missed events are not replayed; pages refetch on the next `open` | `packages/web/src/events.ts:28`, `:163` |
| Write to a dead subscriber | The rejection drops the subscriber and logs `sse.write` warn | `packages/app/src/edge/events/hub.ts:104` |
| Heartbeat write fails | Subscriber dropped | `packages/app/src/edge/events/hub.ts:141` |
| Six-connection browser limit | Avoided: one connection per page for every project view | `packages/app/src/edge/events/hub.ts:31`, `packages/web/src/event-mux.ts:5` |
| Frame payload type ≠ frame name | Ignored | `packages/web/src/events.ts:173` |
| Notification URL times out / unreachable / non-2xx | Logged `notification.failed` warn with a reason that never repeats the URL; run unaffected | `packages/app/src/slices/notifications/notifier.ts:79`, `packages/app/src/slices/notifications/send.ts:44` |
| Notifier throws while observing | Caught and logged; the event still reached the pages | `packages/app/src/slices/notifications/notifier.ts:117` |
| URL saved mid-run | Used from the next transition on (read at send time) | `packages/app/src/slices/notifications/notifier.ts:11` |
| Invalid URL on save | 400 "The Notification URL wasn't saved: … Fix it in Settings → Notifications → Notification URL, then press Save." with field `url` | `packages/app/src/edge/http/settings.ts:113` |
| Test with empty or invalid URL | 400 "The test notification wasn't sent: …" | `packages/app/src/edge/http/settings.ts:124` |
| Test not delivered | 502 with the send failure and where to fix it; logged `notification.test` | `packages/app/src/edge/http/settings.ts:137` |
| Browser permission denied / unsupported | Settings sentence naming the site settings or a Notification URL instead | `packages/web/src/notifications/browser.ts:58` |
| Permission prompt dismissed | "…the permission prompt was dismissed. Turn Browser notifications on again and choose Allow." | `packages/web/src/notifications/settings-panel.tsx:72` |
| Site storage blocked | Switch reads back off with an explanation; claims fall back to each tab deciding alone, tags fold repeats | `packages/web/src/notifications/settings-panel.tsx:67`, `packages/web/src/notifications/browser.ts:98` |
| Browser allows notifications only from installed apps | Test shows "couldn't be shown… Set a Notification URL below instead." | `packages/web/src/notifications/settings-panel.tsx:24`, `:100` |
| Browser notification can't be shown during a run | `console.warn` only | `packages/web/src/notifications/use-run-notifications.ts:69` |
| Shutdown | `notifier.close()` stops new notifications before stages are aborted | `packages/app/src/main.ts:754` |
| Server restart | Notifier state resets; a project not seen `running` since boot sends nothing on its next end | `packages/app/src/slices/notifications/notifier.ts:34`, `packages/app/src/slices/notifications/rules.ts:17` |

## State transitions

- Subscriber: joined → dropped on abort, write failure or heartbeat failure (`packages/app/src/edge/events/hub.ts:125`).
- Mux connection: none → open on first stand-in → closed when the last stand-in closes (`packages/web/src/event-mux.ts:54`, `:110`).
- Notification URL setting: unset ↔ set (empty save deletes the row) (`packages/app/src/slices/notifications/settings.ts:33`).
- Browser switches: off ↔ on per browser; sounds start on (`packages/web/src/notifications/browser.ts:30`, `packages/web/src/notifications/sounds.ts:19`).
- No run state is moved by this scenario.

## Invariants

- A page holds at most one SSE connection to Slopify regardless of how many project views it shows (`packages/web/src/event-mux.ts:5`).
- Pages never see events from work the head revision does not want (`packages/app/src/edge/events/visibility.ts:35`).
- Replayed previews carry visible response text only, never prompts or reasoning (`packages/app/src/edge/events/preview-cache.ts:3`).
- A run never waits on or fails because of a notification (`packages/app/src/slices/notifications/notifier.ts:21`, `packages/app/src/slices/notifications/send.ts:1`).
- Notification bodies hold only the title, the event, the provider's short reason and the project link, passed through `redact`; the URL never appears in logs or error text (`packages/app/src/slices/notifications/rules.ts:143`, `packages/app/src/slices/notifications/send.ts:42`).
- A Notification URL with credentials is never stored (`packages/app/src/slices/notifications/rules.ts:174`).

## Outcomes & side effects

- SSE frames to open pages; list, project, checkpoint, review, schedule, calendar and staging queries invalidated in the browser.
- One POST per notice to the Notification URL; browser notifications and chimes in one tab.
- Log lines `sse.write`, `notification.failed`, `notification.test` (warn).
- The episode-memory watcher observes the same events (owned by the channel-memory scenario) (`packages/app/src/main.ts:316`).

## Dimensions not in play

- D1 Authority: no authentication on the streams or settings; single local user.
- D5 Money: nothing charged; notifications and events make no provider calls.
- D6 Limits: no rate limit on notifications; one per transition per project.
- D7 Time: no quiet hours or digest; claims expire after 60 s.
- D10 Failure: no retry of a failed POST and no outbox; a missed notification is only logged.
- D15 Record: no notification history is stored.
