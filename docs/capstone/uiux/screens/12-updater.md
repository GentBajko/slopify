---
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: 9fbb2685a760
paths_covered:
  - ":(top)packages/web/src/updates/**"
  - ":(top)packages/web/src/components/version-prompt.tsx"
  - ":(top)packages/web/src/version.ts"
---

# Updater

## Mode & job

App-wide Operate control for checking npm for a newer Slopify, installing it, waiting for running work, cancelling a waiting update and bringing the tab back after the server restarts (`packages/web/src/updates/widget.tsx:9-75`, `packages/web/src/updates/use-update.ts:29-177`). A second, separate surface, `VersionPrompt`, tells a tab that the server it talks to was replaced underneath it (`packages/web/src/components/version-prompt.tsx:6-32`). Both are mounted by the Shell on every route (`packages/web/src/components/shell.tsx:436-441`, `shell.tsx:487`, `shell.tsx:520-524`).

## Composition

**Update widget.** One kit `IconButton` (variant `icon`), `size-8`, holding a 16px lucide `RefreshCw` glyph (`widget.tsx:48-62`). An 8px `bg-accent` dot sits at its top-right when an update is available and nothing is installing or waiting (`widget.tsx:63-68`). The button's `aria-label` and `title` are the full sentence (the kit sets `title` from `label` when no `tip` is given) (`widget.tsx:45-49`, `packages/web/src/components/kit/button.tsx:54-76`). A visually hidden live region repeats the sentence as `role="status"`, or `role="alert"` when there is an error (`widget.tsx:70-72`).

Placement: at ≥768px it sits in the sidebar foot row after "Free. Your keys, your machine.", followed by the Tutorials book link and the tutorial launcher; below 768px it sits in the phone top bar with the same two neighbours (`shell.tsx:304`, `shell.tsx:431-441`, `shell.tsx:474-489`). Settings → About points at it: "Updates: the circular-arrows button at the foot of the sidebar (at the top on a phone)." (`packages/web/src/routes/settings-about.tsx:53-54`).

**Version prompt.** A kit `Dialog`, `dismissible={false}`, title "Slopify was updated", description "This tab was loaded before the update. Version <v> is running now; reload to catch up.", with one autofocused primary "Reload" button (`version-prompt.tsx:14-31`). It opens when `X-Slopify-Version` on any response differs from the first version the tab saw (`packages/web/src/version.ts:1-49`, `version.ts:53-60`).

## States

Server statuses are `idle`, `checking`, `waiting`, `installing`, `restarting`, `error`; the payload also carries `canUpdate`, `blockedReason`, `error`, `pendingVersion` and `waitingFor` (`packages/app/src/updater/model.ts:3-18`).

| State | Condition | Click does | Glyph / sentence action | Source |
|---|---|---|---|---|
| Idle, nothing new | `available` false | Forced check (`GET /api/update?refresh=1`) | "Click to check for updates." | `widget.tsx:40-44`, `widget.tsx:51-55`, `updates/api.ts:16-28` |
| Available | `available`, `canUpdate`, no block | Install (`POST /api/update`) | Accent dot; "Click to download and install the update." | `widget.tsx:42-43`, `widget.tsx:53`, `api.ts:40-47` |
| Blocked | `blockedReason` set and not waiting | Forced check | The server's block reason as the action | `widget.tsx:14`, `widget.tsx:40-41` |
| Checking | Query fetching, refresh pending, or status `checking` | Disabled | Spinning glyph; "Checking for updates…" | `use-update.ts:157`, `widget.tsx:38-39`, `widget.tsx:50` |
| Installing / updating | Install pending, accepted version held, or status `installing`/`restarting` | Disabled | Spinning glyph; "Updating…" | `use-update.ts:141-146`, `widget.tsx:36-37` |
| Reconnecting | Updating and the status query errors | Disabled | "Reconnecting after update…" | `use-update.ts:159`, `widget.tsx:34-35` |
| Waiting for work | Status `waiting` | Cancel (`DELETE /api/update`) | "Update to <v> will install when '<project>' finishes." (or "…when the running work finishes.") + " Click to cancel the update."; one info toast when waiting begins | `widget.tsx:15-25`, `widget.tsx:32-33`, `widget.tsx:52`, `widget.tsx:77-83`, `api.ts:30-38` |
| Error | Recovery timeout, install/refresh/cancel error, query error or `status.error` | Forced check or install as above | Glyph tinted `text-waiting`; the error text as action; live region becomes `alert` | `use-update.ts:147-152`, `widget.tsx:56`, `widget.tsx:70` |
| Recovery timeout | Updating for 120 s | — | "The update did not finish. Restart Slopify (in Docker, restart the container), reload this page, and try again." | `use-update.ts:110-120`, `api.ts:12-14` |
| New version active | Status `idle`/`error` with a `currentVersion` different from the accepted one | — | Page reloads once | `use-update.ts:122-139` |

Polling: every 15 min and always on window focus; every 5 s while waiting; every 2 s while checking, installing, restarting or holding an accepted version, until the recovery timeout (`use-update.ts:36-52`, `api.ts:7-14`). Every request times out after 20 s and none is retried; a failed install re-reads status instead (`api.ts:21`, `use-update.ts:51`, `use-update.ts:77-82`). Discovering an update during a check does not install on the same click (`widget.tsx:51-55`).

The version prompt has one state: open with Reload, or absent (`version-prompt.tsx:12-16`).

## Motion

The glyph spins (`animate-spin`) while checking or updating; `motion-reduce:animate-none` stops it (`widget.tsx:58-62`). The button keeps its slot and size in every state. The version prompt uses the kit Dialog's entrance only.

## Copy

The sentence is `Slopify updates: <versions>. <action>` where versions is "Your version: X · Newest: Y" when an update is available, else "Slopify X", or "Slopify" before the first answer (`widget.tsx:26-30`, `widget.tsx:45`). Action strings are quoted in the States table above. Version prompt copy: "Slopify was updated", "Reload" (`version-prompt.tsx:18-27`).

## Not in play

No popover, progress bar, release-notes viewer or changelog link on the widget; patch notes and the What's new tour are separate Shell overlays (`shell.tsx:518-519`). No automatic install on discovery. No dismiss or "later" on the version prompt. The widget never installs while the server reports a block; with running work the server answers `waiting` and the install happens after that work finishes (`widget.tsx:77-83`).
