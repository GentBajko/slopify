---
scenario: autostart
screens:
- 16-welcome
- 20-settings-sections
- 23-announcements
depends_on:
- 14-storage-and-downloads
- 20-boot-cli-recovery
- 21-app-updater
- 41-onboarding-and-sample
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: 2fb95a29dd89
paths_covered:
  - ":(top)packages/app/src/edge/autostart/**"
  - ":(top)packages/app/src/edge/http/autostart.ts"
  - ":(top)packages/app/src/edge/cli.ts"
  - ":(top)packages/app/src/edge/cli-args.ts"
  - ":(top)packages/app/src/edge/docker-install/run.ts"
  - ":(top)packages/app/src/main.ts"
  - ":(top)packages/app/src/slices/storage/portable.ts"
  - ":(top)packages/web/src/autostart/**"
  - ":(top)packages/web/src/http.ts"
  - ":(top)packages/web/src/components/shell.tsx"
  - ":(top)packages/web/src/routes/welcome.tsx"
  - ":(top)packages/web/src/routes/settings.tsx"
  - ":(top)compose.yaml"
---

# Start at login (autostart)

"Start Slopify when I log in": a per-user login entry on native installs, and a read-only report of whether Docker starts at login on Docker installs. General boot (argument parsing, flag compatibility, the boot sequence that creates this service) is owned by `20-boot-cli-recovery.md`; this file owns the switch itself.

## Trigger & preconditions

- Triggers:
  - Settings → General switch (`packages/web/src/routes/settings.tsx:299`, `packages/web/src/autostart/autostart-settings.tsx:42-84`).
  - First-run screen offer (`packages/web/src/routes/welcome.tsx:384`, `packages/web/src/autostart/autostart-settings.tsx:110-161`; first-run flow: `41-onboarding-and-sample.md`).
  - One-time reminder dialog for updated installs (`packages/web/src/autostart/autostart-reminder.tsx:16-55`, mounted `packages/web/src/components/shell.tsx:517`).
  - CLI `--autostart` / `--no-autostart` or the terminal question on a native start (`packages/app/src/edge/cli-args.ts:12-13`, `packages/app/src/edge/cli.ts:23`, `packages/app/src/edge/cli.ts:121-129`).
  - The `--docker` installer's question (`packages/app/src/edge/docker-install/run.ts:129-149`).
  - Every native CLI boot refreshes an existing entry (`packages/app/src/edge/cli.ts:85-86`, `packages/app/src/main.ts:586-598`).
- Kind selection: `SLOPIFY_CONTAINER=1` → Docker source; otherwise native (`packages/app/src/edge/autostart/index.ts:23-50`). The service is created during boot and passed to the HTTP app as `deps.autostart` (`packages/app/src/main.ts:586-600`); when absent, every route answers 404 "Starting at login can't be set from this Slopify. Start it with npx @gentbajko/slopify and try Settings → General again." (`packages/app/src/edge/http/autostart.ts:13-37`).
- Native availability: platform `linux`, `darwin` or `win32` and not WSL; otherwise `available: false` with a sentence saying why (`packages/app/src/edge/autostart/native.ts:100-118`).

## Steps

### View

1. `GET /api/settings/autostart` (`Cache-Control: no-store`) returns `AutostartView {kind, available, enabled, summary, where, howTo, checkedAt, offer}` (`packages/app/src/edge/http/autostart.ts:17-22`, `packages/app/src/edge/autostart/model.ts:3-22`).
2. **Native.** `status()` reads the current entry: Linux `$XDG_CONFIG_HOME/autostart/slopify.desktop` (XDG only when absolute, else `~/.config`), macOS `~/Library/LaunchAgents/stream.slopify.app.plist`, Windows registry `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` value `Slopify` via `reg query` (`packages/app/src/edge/autostart/native.ts:78-98`, `packages/app/src/edge/autostart/native.ts:130-144`, `packages/app/src/edge/autostart/launcher.ts:34-39`). The entry is `ours` when it contains the marker (`X-Slopify-Autostart=true` on Linux, `Written by Slopify: Settings` on macOS, `start-slopify.cmd` in the Windows value), else `foreign` (`packages/app/src/edge/autostart/native.ts:136-143`). `enabled` is true only when the entry is ours **and** references this data folder's launcher (`packages/app/src/edge/autostart/native.ts:146-149`, `packages/app/src/edge/autostart/native.ts:191-193`). `offer = available && !enabled && settings["autostart.answered"] !== "1"` (`packages/app/src/edge/autostart/service.ts:35`, `packages/app/src/edge/autostart/service.ts:66-76`, `packages/app/src/edge/autostart/model.ts:30`).
3. **Docker.** The service reads `/opt/slopify-install/login-start.json` (only when `SLOPIFY_DOCKER_INSTALL_STATE` is set) through `readState` with the process uid; damaged or foreign → `null` (`packages/app/src/edge/autostart/index.ts:24-31`, `packages/app/src/edge/autostart/index.ts:53-60`, `packages/app/src/edge/autostart/docker.ts:10-29`). The view is always `available: false`, `offer: false`; `enabled` = `docker === "yes"`, or `null` for no record / `unknown`; `summary` distinguishes no record, Docker Desktop, rootless (starts at login) and system Docker (starts at boot); `howTo` names the Docker Desktop sign-in setting, `systemctl --user enable docker` (rootless) or `sudo systemctl enable docker`, plus "run npx @gentbajko/slopify --docker" to re-check (`packages/app/src/edge/autostart/service.ts:39-65`, `packages/app/src/edge/autostart/service.ts:105-111`, `packages/app/src/edge/autostart/docker.ts:31-50`).

### Turn on (native)

4. `PUT /api/settings/autostart {enabled: true}` (zod: boolean) → `service.set(true)` (`packages/app/src/edge/http/autostart.ts:7`, `packages/app/src/edge/http/autostart.ts:23-32`).
5. Windows only: a data folder containing `%`, `"`, CR or LF is refused (`packages/app/src/edge/autostart/native.ts:195-198`, `packages/app/src/edge/autostart/launcher.ts:140-144`).
6. Ours but for another data folder → refused; foreign → refused (`packages/app/src/edge/autostart/native.ts:199-209`).
7. **Launcher.** Written to `<data-dir>/autostart/start-slopify.sh` (mode 0700) or `start-slopify.cmd`, only when its text differs (`packages/app/src/edge/autostart/native.ts:79-81`, `packages/app/src/edge/autostart/native.ts:162-165`). It appends output to `<logs>/autostart.log` and tries, in order: the installed `cli.js` (null when the real path is under `_npx`, or when running from source); npm's `npx-cli.js` beside this Node (two layouts) with `--yes @gentbajko/slopify@<running version>`; plain `npx --yes @gentbajko/slopify@<version>`. Arguments: `--no-open --data-dir <dir> --port <port>`, plus `--host <host>` when not `127.0.0.1` (`packages/app/src/edge/autostart/launcher.ts:43-129`, `packages/app/src/edge/autostart/index.ts:42-48`, `packages/app/src/edge/autostart/index.ts:62-91`). The POSIX launcher falls back to `node` on PATH when the recorded Node is gone and prepends Node's folder to PATH (`packages/app/src/edge/autostart/launcher.ts:69-75`).
8. **Entry.** Written only when its text differs: Linux a hidden `.desktop` (`Exec=/bin/sh <launcher>`, `NoDisplay=true`, `X-GNOME-Autostart-enabled=true`) mode 0644; macOS a LaunchAgent with `RunAtLoad` true and `KeepAlive` false, stdout/stderr to the log; Windows `reg add … /t REG_SZ /d 'cmd.exe /d /c start "Slopify" /min "<launcher>"' /f` (`packages/app/src/edge/autostart/native.ts:122-127`, `packages/app/src/edge/autostart/native.ts:167-188`, `packages/app/src/edge/autostart/launcher.ts:131-136`, `packages/app/src/edge/autostart/launcher.ts:164-220`). Files are written through a `<path>.<pid>.tmp` + rename with the folder created 0700 (`packages/app/src/edge/autostart/native.ts:252-258`).
9. Success marks `autostart.answered = "1"` and returns the fresh view (`packages/app/src/edge/autostart/service.ts:88-94`).

### Turn off (native)

10. `PUT {enabled: false}` → `disable()`: removes the entry (file unlink or `reg delete`) only when it runs this data folder; removes the launcher only when it carries the marker; removes `<data-dir>/autostart/` only when empty; marks answered (`packages/app/src/edge/autostart/native.ts:214-231`, `packages/app/src/edge/autostart/service.ts:88-94`).

### Answer without changing

11. `POST /api/settings/autostart/answer` (first-run "No thanks", reminder "No thanks" or dismissing the reminder) writes `autostart.answered = "1"` and returns the view (`packages/app/src/edge/http/autostart.ts:33-38`, `packages/app/src/edge/autostart/service.ts:96-99`, `packages/web/src/autostart/api.ts:28-31`).

### Terminal (native start)

12. After the server is listening, `settleAutostart`: `--autostart`/`--no-autostart` set the switch directly (both together is an error raised before boot); without a flag and with the question open, a non-TTY start prints where to turn it on in the app and returns; a TTY asks "Start Slopify when you log in? (Y/n) " — Enter, `y`, `yes` = yes; `n`, `no` = no; anything else or Ctrl+C = no answer (question stays open). The chosen value goes through `set`, and the result's summary (plus `Login entry: <where>` when on) is printed (`packages/app/src/edge/autostart/prompt.ts:4-87`, `packages/app/src/edge/cli.ts:121-129`). Ctrl+C during the question re-raises SIGINT to the shutdown handler (`packages/app/src/edge/autostart/prompt.ts:28-44`).

### Refresh on boot

13. A native CLI boot (`refreshAutostart: true`) calls `refresh()` without awaiting: when the entry runs this data folder, it rewrites the launcher and entry if their text changed (new Node path, entry or version); otherwise nothing. Failure is logged as `autostart.refresh` (`packages/app/src/main.ts:595-598`, `packages/app/src/edge/autostart/native.ts:232-239`). In-app updates still apply at login because the started version forwards to the newest installed one (see `21-app-updater.md`, step 13) (`packages/app/src/edge/autostart/launcher.ts:12-14`).

### Docker installer

14. `recordLoginStart` (after `--docker` install/update): `manager` = `rootless` when `install.json` user is `0:0`, else `system`; `wanted` = flag ?? previous record's `wanted` ?? the terminal answer (TTY only) ?? null; `inspectDockerStart` reads Docker Desktop's `settings-store.json` then `settings.json` (`AutoStart`/`autoStart`) under the platform's folder; on macOS/Windows without one → `unknown`; on Linux without one → `systemctl [--user] is-enabled docker.service` (`enabled`/`enabled-runtime`/`alias` = yes; `disabled`/`masked`/`masked-runtime` = no; else unknown). The record `{version:1, checkedAt, manager, wanted, docker, desktop, platform}` is written to `<docker-root>/<data>/activation/login-start.json`, mounted read-only into the container at `/opt/slopify-install` (`packages/app/src/edge/autostart/docker-record.ts:20-53`, `packages/app/src/edge/autostart/docker.ts:56-132`, `compose.yaml:46`, `compose.yaml:54`). The printed line is `loginStartReport(record)`, or for `wanted === false` that the container still restarts with Docker and `docker stop <name>` stops it (`packages/app/src/edge/autostart/docker-record.ts:47-51`, `packages/app/src/edge/autostart/docker.ts:135-150`). Docker's own settings are never changed; the container starts with Docker through `restart: unless-stopped` (`packages/app/src/edge/autostart/docker.ts:5-8`, `compose.yaml:15`).

### Web

15. Settings → General: native → a switch (disabled when unavailable or pending) with the summary and, when on, `Login entry: <where>`; Docker → "Starts with Docker: yes/no/unknown", summary, how-to and "Checked by the installer on <local time>" (`packages/web/src/autostart/autostart-settings.tsx:42-107`).
16. First-run screen: Docker → the Docker status block; native with `offer` → "Start when I log in" / "No thanks"; after turning on → "Slopify now starts when you log in. Change it any time in Settings → General." (`packages/web/src/autostart/autostart-settings.tsx:110-161`).
17. Reminder dialog: open only when `offer` is true, the usage-stats notice is seen, the first-run screen reports `show: false`, and the route is not `/welcome`; "Start when I log in" turns it on; "No thanks" or closing calls `answer` (`packages/web/src/autostart/autostart-reminder.tsx:16-55`).
18. The shell reads the view once (no retry) to remember `kind`, so a later "Slopify isn't responding" message names the Docker or native fix (`packages/web/src/autostart/use-install-kind.ts:10-22`, `packages/web/src/components/shell.tsx:327`, `packages/web/src/http.ts:83-99`).

## Branches

- Docker `PUT` → always 409 "Slopify in Docker starts whenever Docker starts, so this switch can't change it. <howTo>" (`packages/app/src/edge/autostart/service.ts:82-87`, `packages/app/src/edge/http/autostart.ts:26-31`).
- Unsupported platform or WSL: `enable` rejects with the unsupported sentence; `disable` returns the off state; `refresh` is a no-op (`packages/app/src/edge/autostart/native.ts:110-118`).
- Entry text already equal → no write; launcher text already equal → no write (`packages/app/src/edge/autostart/native.ts:163`, `packages/app/src/edge/autostart/native.ts:168`).
- Running from the npx cache → launcher skips the installed-entry line (`packages/app/src/edge/autostart/index.ts:62-73`, `packages/app/src/edge/autostart/launcher.ts:77-80`).
- `--host 127.0.0.1` → no `--host` in the launcher (`packages/app/src/edge/autostart/launcher.ts:50`).
- A Docker record from before `platform`/`desktop` existed with `docker: unknown` → how-to names both Docker Desktop and Docker Engine (`packages/app/src/edge/autostart/docker.ts:43-47`).

## Unhappy paths

- Another data folder's entry exists → 409 "Another Slopify, with a different data folder, already starts when you log in (<where>). Slopify left it alone. Turn it off in that Slopify's Settings → General, or delete … then turn the switch on here again." (`packages/app/src/edge/autostart/native.ts:200-203`).
- Foreign entry → 409 naming the file (or the `Slopify` Run value and Task Manager → Startup apps) and saying Slopify left it alone (`packages/app/src/edge/autostart/native.ts:204-209`).
- Windows `%`-path → 409 suggesting `--data-dir C:\Slopify` (`packages/app/src/edge/autostart/launcher.ts:140-144`).
- `reg add` / `reg delete` non-zero (15 s exec timeout; missing command → code 127) → 409 with the stderr and the Task Manager fallback (`packages/app/src/edge/autostart/native.ts:170-184`, `packages/app/src/edge/autostart/native.ts:219-223`, `packages/app/src/edge/autostart/native.ts:275-292`).
- A file-system error carrying a `code` is restated: "Slopify couldn't add|remove its login entry: writing <path> failed (<message>). Make sure your user owns that folder and can write to it, then press Start Slopify when I log in in Settings → General again." (`packages/app/src/edge/autostart/service.ts:113-126`).
- Any refusal leaves `autostart.answered` unchanged (the mark comes after the change) (`packages/app/src/edge/autostart/service.ts:88-93`).
- Invalid PUT body → the shared validation problem (`packages/app/src/edge/http/autostart.ts:23`).
- Terminal path: any failure is printed as a warning; the start never fails (`packages/app/src/edge/autostart/prompt.ts:84-86`).
- Docker installer: inspection or write failure prints "Slopify couldn't check whether Docker starts when you log in (…). Settings → General will say it doesn't know; run the command again to check again." (`packages/app/src/edge/docker-install/run.ts:145-149`).
- Login start: Node missing (POSIX) → the log gets "Slopify could not start at login: Node.js was not found…" and the launcher exits 1 (`packages/app/src/edge/autostart/launcher.ts:70-73`). Failures of the started Slopify itself go to `<logs>/autostart.log` (`packages/app/src/edge/autostart/launcher.ts:67`).
- Refresh failure at boot → logged `warn autostart.refresh`, boot continues (`packages/app/src/main.ts:596-598`).
- Web: a view load error shows "Starting at login couldn't be checked: <message>"; a set/answer error is shown under the controls (`packages/web/src/autostart/autostart-settings.tsx:49-53`, `packages/web/src/autostart/autostart-settings.tsx:75-79`, `packages/web/src/autostart/autostart-reminder.tsx:48-52`).
- `PUT`/`POST` during an update or shutdown → refused by the global mutation barrier (see `21-app-updater.md`, step 16).

## State transitions

- Native entry: `none → ours(this folder)` (enable); `ours(this folder) → none` (disable); `foreign` and `ours(other folder)` are never changed by this install (`packages/app/src/edge/autostart/native.ts:190-240`).
- `autostart.answered`: absent → `"1"` on a successful set or an answer; never cleared (`packages/app/src/edge/autostart/service.ts:35-36`).
- Docker record: rewritten on each `--docker` install/update run; the container never writes it (read-only mount) (`packages/app/src/edge/autostart/docker-record.ts:46`, `compose.yaml:46`).

## Invariants

- One install never removes or overwrites another install's or another program's login entry (`packages/app/src/edge/autostart/native.ts:191-193`, `packages/app/src/edge/autostart/native.ts:214-217`, `packages/app/src/edge/autostart/native.ts:233-236`).
- The login entry never points into the npx cache; it runs the data folder's launcher, pinned to the version that wrote it (`packages/app/src/edge/autostart/launcher.ts:4-11`).
- A login start never opens a browser tab (`--no-open`) (`packages/app/src/edge/autostart/launcher.ts:43-51`).
- No administrator rights and no systemd unit are used on native installs (`packages/app/src/edge/autostart/native.ts:76-77`).
- Slopify never changes Docker's or Docker Desktop's settings (`packages/app/src/edge/autostart/docker.ts:52-55`, `packages/app/src/edge/autostart/docker.ts:111-115`).
- The question is asked at most until answered once, on any of the first-run screen, reminder, Settings or terminal (`packages/app/src/edge/autostart/model.ts:28-30`, `packages/app/src/edge/autostart/prompt.ts:61-62`).
- `autostart.answered` is not a portable setting, so backups and exports leave it behind (`packages/app/src/slices/storage/portable.ts:514`, `packages/app/src/slices/storage/portable.ts:520-530`).

## Outcomes & side effects

- On: `<data-dir>/autostart/start-slopify.{sh,cmd}` plus the platform entry (`.desktop` file, LaunchAgent plist, or HKCU Run value); each login appends to `<logs>/autostart.log`.
- Off: entry, marked launcher and empty folder removed.
- Docker: `activation/login-start.json` on the host; terminal lines from the installer.
- Settings row `autostart.answered = "1"`.

## Dimensions not in play

- D1 Authority: single local user; the entry is per-user and the routes have no guard beyond the mutation barrier.
- D4 Computation: no numbers beyond the port passed through.
- D5 Money: nothing is charged.
- D6 Limits: no limits besides the 15 s `reg` timeout.
- D7 Time: no expiry; `checkedAt` is display-only.
- D13 Notification: no outbound notification.
- D15 Audit: only `autostart.log` and the app log's `autostart.refresh` warning.
