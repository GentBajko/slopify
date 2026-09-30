---
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: 424f1b2d9b41
paths_covered:
  - ":(top)packages/web/src/whats-new/tour.tsx"
  - ":(top)packages/web/src/patch-notes/popup.tsx"
  - ":(top)packages/web/src/patch-notes/reader.tsx"
  - ":(top)packages/web/src/patch-notes/api.ts"
  - ":(top)packages/web/src/autostart/autostart-reminder.tsx"
  - ":(top)packages/web/src/autostart/api.ts"
  - ":(top)packages/web/src/autostart/use-install-kind.ts"
  - ":(top)packages/web/src/notifications/browser.ts"
  - ":(top)packages/web/src/notifications/sounds.ts"
  - ":(top)packages/web/src/notifications/use-run-notifications.ts"
  - ":(top)packages/web/src/notifications/watcher.ts"
  - ":(top)packages/app/src/slices/notifications/rules.ts"
  - ":(top)packages/app/src/slices/settings/whats-new.ts"
  - ":(top)packages/app/src/slices/patch-notes/seen.ts"
---

# Announcements

## Mode & job
Operate overlays owned by the app shell, not by any route: the What's new tour, the patch-notes popup, the start-at-login reminder, and run notifications with their chimes. All four mount once in `ShellContent` (`packages/web/src/components/shell.tsx:318`): `<AutostartReminder />`, `<WhatsNewTour />` and `<PatchNotesPopup />` render after `<FirstRunNotice />` and before `<VersionPrompt>` (`packages/web/src/components/shell.tsx:516-524`); `useRunNotifications()` runs at `packages/web/src/components/shell.tsx:325` and is fed by the shell's global event subscription (`projectState`, `reviewFlagged`, `scheduleTopics`) (`packages/web/src/components/shell.tsx:329-358`). `PatchNotesCommand` adds Ctrl+K "Show patch notes" (group "Go to", keywords "what's new", "changelog", "release notes", "version") that navigates to `/settings?section=patch-notes` (`packages/web/src/patch-notes/popup.tsx:84-96`, `packages/web/src/components/shell.tsx:365`).

The job: tell the person, once, what changed after an update; ask an updater once about start-at-login; and signal run starts, ends, held reviews and suggested topics while the page is open. The first-run notice and the interactive tutorial are in 11-first-run-tutorial; the update widget is in 12-updater; the Settings panels that control these (General, Notifications, Patch notes) are in 08-settings.

Stacking order (one popup at a time):

| Overlay | Waits for | Source |
|---|---|---|
| What's new tour | first-run notice `seen === true`; tutorial not active | `packages/web/src/whats-new/tour.tsx:145-147`, `packages/web/src/whats-new/tour.tsx:171` |
| Patch-notes popup | first-run notice seen; the tour's answer loaded and the tour not showing; tutorial not active | `packages/web/src/patch-notes/popup.tsx:24-47` |
| Autostart reminder | first-run notice seen; `readFirstRun().show === false`; path is not `/welcome` | `packages/web/src/autostart/autostart-reminder.tsx:20-26` |

## Composition
### What's new tour (`WhatsNewTour`, `packages/web/src/whats-new/tour.tsx:141`)
| Region | What renders | Kit / tokens |
|---|---|---|
| Frame | Non-modal `Drawer width="narrow"` (440px on `sm` and up, full width below), title `What's new in <major>.0` (`packages/web/src/whats-new/tour.tsx:181-185`, `packages/web/src/components/kit/drawer.tsx:69`) | `Drawer` (`packages/web/src/components/kit/drawer.tsx:9`), `bg-raised`, `--shadow-dialog` |
| Step counter | `<n> of <total>` in `text-label text-ink-3` (`packages/web/src/whats-new/tour.tsx:215`) | text tokens |
| Step | `h3` title in `text-title-3`, body in `text-ink-2` (`packages/web/src/whats-new/tour.tsx:216-217`) | text tokens |
| Step links | `ButtonLink` `Open <place>` to the step's route and search; on the last step also `TextLink` "Read the full patch notes" to `/settings?section=patch-notes&note=<current>`, which also closes the tour (`packages/web/src/whats-new/tour.tsx:218-234`) | `ButtonLink`, `TextLink` (`packages/web/src/components/kit/link.tsx`) |
| Footer | quiet "Close tour"; spacer; "Back" (disabled on step 1, reason "This is the first step"); primary "Next", or "Finish tour" on the last step (`packages/web/src/whats-new/tour.tsx:186-211`) | `Button` (`packages/web/src/components/kit/button.tsx:29`) |

Steps come from `whatsNewTours`, keyed by major version; only major 3 has a tour, and a major without an entry shows nothing (`packages/web/src/whats-new/tour.tsx:29-120`):

| # | id | Title | Opens |
|---|---|---|---|
| 1 | home | Home | `/` |
| 2 | play | Play's one path | `/play` |
| 3 | reviews | Automatic reviews | `/play` |
| 4 | channels | Channels and cast | `/channels` |
| 5 | memory | Episodes that remember | `/channels` |
| 6 | calendar | The calendar | `/calendar` |
| 7 | run-cost | What a run cost | `/settings?section=usage` ("Open Usage") |
| 8 | studio | YouTube Studio prep | `/settings?section=studio` ("Open YouTube Studio settings") |
| 9 | voices | Multiple voices | `/play` |
| 10 | long-videos | Long videos stay watchable | `/play` |
| 11 | languages | Other languages | `/play` |
| 12 | trash | A trash bin | `/settings?section=trash` ("Open Trash") |

Whether it opens is the server's call: `readWhatsNew` shows it when the stored `whats-new.seen-major` is lower than the running major, or, before any close, when the machine row (written when the first-run notice is dismissed) carries an older major; a fresh install and a damaged stored value never show it (`packages/app/src/slices/settings/whats-new.ts:44-55`). The query never goes stale (`packages/web/src/whats-new/tour.tsx:129-135`).

### Patch-notes popup (`PatchNotesPopup`, `packages/web/src/patch-notes/popup.tsx:20`)
| Region | What renders | Kit / tokens |
|---|---|---|
| Frame | Non-modal `Drawer` (default `wide`, 560px on `sm` and up), title `What's new in <version>` (`packages/web/src/patch-notes/popup.tsx:54-57`, `packages/web/src/components/kit/drawer.tsx:69`) | `Drawer` |
| Note title | The due note's title, `text-small text-ink-3` (`packages/web/src/patch-notes/popup.tsx:71`) | text tokens |
| Body | `PatchNoteReader` for the due note, forced to one column with its contents list static (`packages/web/src/patch-notes/popup.tsx:72`); the reader is the kit `ReadingView` labelled "Patch notes" (contents from `##` headings, search, copy) with anchor prefix `patch-<id>-` (`packages/web/src/patch-notes/reader.tsx:9-40`) | `ReadingView` (`packages/web/src/components/kit/reading-view.tsx:202`) |
| Footer | `TextLink` "See all patch notes" to `/settings?section=patch-notes` (also closes); spacer; primary "Close notes" (`packages/web/src/patch-notes/popup.tsx:58-68`) | `TextLink`, `Button` |

Due note: the note whose version equals the running version, when that version is a newer release than the stored `patchNotes.seenVersion`, or, before any close, newer than the machine row's version; a damaged stored value opens nothing (`packages/app/src/slices/patch-notes/seen.ts:57-71`). On a major update the tour stands in for the notes: the popup stays hidden while the tour shows, and the tour's close sets the cached `due` to null (`packages/web/src/patch-notes/popup.tsx:27-36`, `packages/web/src/whats-new/tour.tsx:149-159`).

### Autostart reminder (`AutostartReminder`, `packages/web/src/autostart/autostart-reminder.tsx:16`)
| Region | What renders | Kit / tokens |
|---|---|---|
| Frame | Modal kit `Dialog`, open while `view.offer === true` and the gates above hold (`packages/web/src/autostart/autostart-reminder.tsx:22-35`) | `Dialog` (`packages/web/src/components/kit/dialog.tsx:13`) |
| Text | Title "Start Slopify when you log in?"; description "Have Slopify ready whenever you open your bookmark, without starting it from a terminal. Change it any time in Settings → General." (`packages/web/src/autostart/autostart-reminder.tsx:35-36`) | dialog header |
| Footer | secondary "No thanks" (`answerAutostart`, POST `/api/settings/autostart/answer`); primary, autofocused "Start when I log in" (`setAutostart(true)`, PUT `/api/settings/autostart`) (`packages/web/src/autostart/autostart-reminder.tsx:37-46`, `packages/web/src/autostart/api.ts:18-31`) | `Button` |

The view and mutations come from `useAutostart`, shared with Settings → General and the first-run screen (`packages/web/src/autostart/autostart-settings.tsx:25-38`). The shell's `useInstallKind` reads the same `["settings","autostart"]` view once (no retry) and remembers native vs Docker for later "Slopify isn't responding" messages; it renders nothing (`packages/web/src/autostart/use-install-kind.ts:10-22`).

### Run notifications and sounds (no rendered region)
Browser notifications, via `new Notification(...)` (`packages/web/src/notifications/browser.ts:112-159`):

| Event | Headline | Body | Tag | Click opens |
|---|---|---|---|---|
| run starts (first `running` not already seen started) | `Started: <title>` | "Slopify is working on it. You'll hear a different chime when it ends." | `slopify-run-<projectId>` | `/projects/$projectId` |
| `running` → `done`, video | `Video ready: <title>` | "Open the project to watch it." | `slopify-run-<projectId>` | project |
| `running` → `done`, no video | `Run finished: <title>` | "Open the project to see its files." | same | project |
| `running` → `partial` | `Video ready with problems: <title>` / `Run finished with problems: <title>`, `— <reason>` when known | "Open the project to see which step failed and the button that fixes it." | same | project |
| `running` → `failed` | `Run failed: <title>` (`— <reason>`) | "Open the project to see what stopped it and press Retry." | same | project |
| `running` → `pending` | `Waiting for you: <title>` | "Open the project to review the held step or press Continue the run." | same | project |
| `review.flagged` | `Review needs a decision: <title>` (`— <reason>`) | `The automatic review flagged <item> and kept it. Open the project and press Overrule to keep it or Redo to make it again.` | `slopify-run-<projectId>` | project |
| schedule topics added | `<n> new topic(s) is/are waiting for you` | `Open Calendar → Suggested topics → <schedule> to queue or reject it/them.` plus `<m> are waiting in all.` | `slopify-topics-<scheduleId>` | `/calendar` |

Texts come from the shared server rules (`packages/app/src/slices/notifications/rules.ts:56-135`); an empty title reads "Untitled project", a reason is its first non-empty line cut to 140 characters with `…` (`packages/app/src/slices/notifications/rules.ts:74-84`). Paused and canceled say nothing; a project first seen already finished says nothing (`packages/app/src/slices/notifications/rules.ts:9-30`). Clicking focuses the window, navigates, and closes the notification (`packages/web/src/notifications/browser.ts:122-126`, `packages/web/src/notifications/use-run-notifications.ts:35-66`).

Sounds: a start chime (784 Hz then 1175 Hz) and an end chime (1047, 1319, 1568 Hz, longer), synthesized with Web Audio sine plus triangle partials through a limiter; no audio files (`packages/web/src/notifications/sounds.ts:41-99`). The end chime plays on every end/wait transition that is announced; the start chime on a run start (`packages/web/src/notifications/watcher.ts:109-122`). Review and topics events play no chime (`packages/web/src/notifications/watcher.ts:141-169`).

## States
| State | Trigger | Rendered |
|---|---|---|
| Tour hidden | `show !== true`, no tour for the major, or tutorial active | nothing (`packages/web/src/whats-new/tour.tsx:171`) |
| Tour first step | index 0 | Back disabled, tooltip "This is the first step" (`packages/web/src/whats-new/tour.tsx:192-199`) |
| Tour last step | last index | primary reads "Finish tour"; "Read the full patch notes" link shown; the notes list is fetched only now (`packages/web/src/whats-new/tour.tsx:163-168`, `packages/web/src/whats-new/tour.tsx:205-233`) |
| Tour closing | `markWhatsNewSeen` pending (POST `whats-new/seen`) | Close tour and Next/Finish disabled (`packages/web/src/whats-new/tour.tsx:188`, `packages/web/src/whats-new/tour.tsx:203`) |
| Tour close failed | mutation error | `role="alert"` `text-danger`: `Slopify could not save that you closed this tour: <message> Press Close tour to try again.`; the tour stays open (`packages/web/src/whats-new/tour.tsx:235-239`) |
| Tour closed | mutation succeeds | tour query set to the server's `{show:false}`; cached patch notes `due` set to null (`packages/web/src/whats-new/tour.tsx:151-157`) |
| Notes hidden | nothing due, gates not met | nothing (`packages/web/src/patch-notes/popup.tsx:47`) |
| Notes loading | note Markdown in flight | "Loading the patch notes…" in `text-ink-3` (`packages/web/src/patch-notes/reader.tsx:38`) |
| Notes load error | note query error | danger `Callout` "These patch notes did not load", `<message> Press Try again, or reload the page.`, button "Try again" refetches (`packages/web/src/patch-notes/reader.tsx:21-30`) |
| Notes closing | `markPatchNotesSeen` pending | "Close notes" disabled (`packages/web/src/patch-notes/popup.tsx:64`) |
| Notes close failed | mutation error | `role="alert"`: `Slopify could not save that you closed these patch notes: <message> Press Close notes to try again.` (`packages/web/src/patch-notes/popup.tsx:73-77`) |
| Reminder busy | `turn` or `decline` pending | both buttons disabled; Esc/scrim close ignored while busy (`packages/web/src/autostart/autostart-reminder.tsx:27-34`) |
| Reminder dismissed | Esc or scrim | counts as "No thanks": `decline.mutate()` (`packages/web/src/autostart/autostart-reminder.tsx:32-34`) |
| Reminder error | either mutation rejects | `role="alert"` `text-small text-danger` with the server's sentence (`packages/web/src/autostart/autostart-reminder.tsx:48-52`, `packages/web/src/autostart/api.ts:5-6`) |
| Notifications off | `slopify.notifications.browser` not `"on"` in localStorage, or permission not `granted` | no Notification is created (`packages/web/src/notifications/browser.ts:22-55`) |
| Sounds off | `slopify.notifications.sound === "off"` | no chime; default is on, and unreadable storage reads on (`packages/web/src/notifications/sounds.ts:11-17`) |
| Page not yet clicked | browser keeps audio suspended | the first `pointerdown` or `keydown` resumes the AudioContext (`packages/web/src/notifications/sounds.ts:65-70`, `packages/web/src/notifications/use-run-notifications.ts:84-86`) |
| Several tabs open | same transition heard by each | one tab wins via `claimOnce` (Web Locks `slopify-run-notification` plus a 60 s localStorage claim map `slopify.notifications.sent`); the tag folds any repeat (`packages/web/src/notifications/browser.ts:78-110`, `packages/web/src/notifications/browser.ts:116-121`) |
| Seeding | notifications or sounds turned on, or page load with either on | one projects fetch records current states; running/paused projects count as already started, so their start is not announced (`packages/web/src/notifications/watcher.ts:170-182`, `packages/web/src/notifications/use-run-notifications.ts:76-83`) |
| Notification failure | subject fetch or show throws | `console.warn("Slopify couldn't show a run notification.")`; nothing on screen (`packages/web/src/notifications/use-run-notifications.ts:67-71`) |

## Motion
- Both drawers enter with `animate-tick-in` (opacity fade, 150ms ease-out), off under reduced motion; they leave without a transition (`packages/web/src/components/kit/drawer.tsx:70`, `packages/web/src/styles/index.css:90`, `packages/web/src/styles/index.css:190-194`).
- The reminder dialog enters with `dialog-in` (200ms fade and 4px rise) (`packages/web/src/styles/index.css:89`, `packages/web/src/styles/index.css:198-203`).
- Tour steps swap in place with no transition (`packages/web/src/whats-new/tour.tsx:214-240`).

## Copy
- Tour: title `What's new in <major>.0`; buttons "Close tour", "Back", "Next", "Finish tour"; links `Open <place>`, "Read the full patch notes" (`packages/web/src/whats-new/tour.tsx:184-231`). Step bodies are single sentences naming the screen and control, e.g. "Slopify never uploads. Prepare upload on a finished project lists everything Studio asks for, and the browser extension can fill it in for you." (`packages/web/src/whats-new/tour.tsx:85`).
- Patch notes: title `What's new in <version>`; "See all patch notes", "Close notes" (`packages/web/src/patch-notes/popup.tsx:56-66`).
- Reminder: "Start Slopify when you log in?", "No thanks", "Start when I log in" (`packages/web/src/autostart/autostart-reminder.tsx:35-44`).
- Errors say what failed and the button to press again (`packages/web/src/whats-new/tour.tsx:237`, `packages/web/src/patch-notes/popup.tsx:75`, `packages/web/src/patch-notes/reader.tsx:28`).
- Test notification text (sent from Settings → Notifications): "Slopify test notification" / "Notifications work. You'll get one when a run finishes, fails or waits for you, and when a review needs your decision." (`packages/app/src/slices/notifications/rules.ts:137-141`).

## Not in play
- An in-app notification center, bell or unread count: absent; announcements are the drawers, the dialog and OS notifications only (`packages/web/src/components/shell.tsx:516-524`).
- Toasts for run transitions: not raised by the watcher; it only calls `Notification` and plays chimes (`packages/web/src/notifications/use-run-notifications.ts:29-74`).
- Permission prompt on page load: absent; `requestNotificationPermission` is called only from the Settings toggle's click (`packages/web/src/notifications/browser.ts:68-76`).
- Notifications for pause and cancel: not sent (`packages/app/src/slices/notifications/rules.ts:9-12`).
- A tour for majors other than 3: absent (`packages/web/src/whats-new/tour.tsx:30-120`).
- Reopening the tour after it is closed: no control; the stored major only rises (`packages/app/src/slices/settings/whats-new.ts:57-69`). Past patch notes stay readable in Settings → Patch notes (`packages/web/src/patch-notes/popup.tsx:83-96`).
- Server-side delivery (Notification URL / ntfy): a server feature configured in Settings → Notifications, sharing these texts (`packages/app/src/slices/notifications/rules.ts:143-147`); not a UI surface here.
