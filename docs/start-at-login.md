# Start Slopify when I log in

One switch in **Settings → General** has Slopify start in the background when you log in. It
starts quietly (`--no-open`): no browser tab opens, and you open Slopify from your bookmark as
usual. It uses your own account's start-up list, so it needs no administrator password and no
`systemctl`. Turning the switch off removes exactly what turning it on added.

You are asked once:

- on the first-run screen (**Start when I log in** or **No thanks**);
- in the terminal, the first time `npx @gentbajko/slopify` starts on an interactive terminal:
  `Start Slopify when you log in? (Y/n)`. Enter means yes;
- after an update, when neither of those asked (the first-run screen is for new installs, and an
  update started without a terminal can't ask): a one-time dialog in the app, **Start when I
  log in** or **No thanks**. Closing it counts as No thanks.

Answering in either place, or using the switch, ends the question for good (the settings row
`autostart.answered`). Without a terminal, for scripts, use `--autostart` or `--no-autostart`;
they set the switch every time they are given.

## What it adds (without Docker)

Two things, on every system: a small launcher in the data folder, and one login entry that runs
it.

| System  | Login entry                                                                 | Launcher                                  |
| ------- | --------------------------------------------------------------------------- | ----------------------------------------- |
| Linux   | `~/.config/autostart/slopify.desktop` (or `$XDG_CONFIG_HOME/autostart`)     | `<data folder>/autostart/start-slopify.sh`  |
| macOS   | `~/Library/LaunchAgents/stream.slopify.app.plist` (`RunAtLoad`)             | `<data folder>/autostart/start-slopify.sh`  |
| Windows | `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` → `Slopify`            | `<data folder>\autostart\start-slopify.cmd` |

- **Linux**: an XDG autostart entry (`X-GNOME-Autostart-enabled=true`, `Hidden=false`), which
  GNOME, KDE, Xfce, Cinnamon and most other desktops run at login. No systemd unit.
- **macOS**: a per-user LaunchAgent. launchd loads it at the next login; Slopify doesn't
  `launchctl bootstrap` it when you turn the switch on, because that would start a second
  Slopify beside the one you are using. Turning the switch off deletes the file; a copy launchd
  already loaded this session is forgotten at logout (no `bootout`, which would stop the Slopify
  you are using). No `KeepAlive`: quitting Slopify keeps it quit until the next login.
- **Windows**: a Run registry value (`reg add`/`reg delete`, no PowerShell). It runs
  `cmd.exe /d /c start "Slopify" /min "<launcher>"`, so a login shows a minimised Slopify window
  in the taskbar; closing that window stops Slopify. A data folder whose path contains `%` is
  refused, because Windows would read it as a variable.
- **WSL**: not available. Windows doesn't start Linux programs at login; start Slopify from a
  Windows terminal and turn the switch on there.

An entry of the same name that Slopify didn't write is left alone: turning the switch on says so
and names the file (or Task Manager → Startup apps on Windows).

## The launcher, and why the entry never names the npx cache

`npx` keeps packages in a cache it may clean or move, so the login entry runs the launcher in
the data folder instead. The launcher starts, in this order:

1. the installed Slopify (`npm i -g`, a checkout), when Slopify doesn't run from the npx cache;
2. npm's own `npx-cli.js` beside the Node that was running, asking for the exact version that was
   running (`npx --yes @gentbajko/slopify@<version> --no-open …`). A pinned version starts
   offline once it is in the cache, and never jumps to a new release on its own;
3. `npx` from `PATH`, the same way.

It passes the data folder, port and (when it isn't 127.0.0.1) host the switch was turned on
with, since no terminal passes them at login. When the recorded Node is gone (an nvm or Homebrew
upgrade), it uses the `node` on `PATH`. In-app updates still apply: the started version forwards
to the newest one installed in the data folder. Every start with the switch on rewrites the
launcher, so it follows the Node, the install and the version you actually use; a Slopify
started with a different `--data-dir` leaves the entry pointing where it was.

Login starts append their output to `<data folder>/logs/autostart.log`.

## Docker

The container already restarts with Docker (`restart: unless-stopped`), so Slopify in Docker
starts at login exactly when Docker does. Slopify never changes Docker's own settings. The
`--docker` installer asks `Start Slopify when you log in? (Y/n)` once (or takes `--autostart` /
`--no-autostart`), then reads, without changing, whether Docker starts by itself. With Docker
Desktop (always on macOS and Windows, and on Linux when its settings file is there) that is
Docker Desktop's own **Start Docker Desktop when you sign in**, read from its settings file:
`~/Library/Group Containers/group.com.docker/settings-store.json` on macOS,
`%APPDATA%\Docker\settings-store.json` on Windows, `~/.docker/desktop/settings-store.json` on
Linux (or `settings.json` beside it in older versions; `AutoStart` / `autoStart`). Otherwise
it asks `systemctl is-enabled docker.service` for the system Docker, `systemctl --user
is-enabled docker.service` for rootless Docker. It prints how to turn it on when it is off (the
Docker Desktop setting, `sudo systemctl enable docker`, or `systemctl --user enable docker`),
and leaves the answer, with the system and whether it is Docker Desktop, in the installation's
`activation/login-start.json`, which the container reads read-only as
`/opt/slopify-install/login-start.json`.

Settings → General and the first-run screen then show **Starts with Docker: yes / no /
unknown**, when the installer last looked, and where to change it (nothing to switch: the first
run only informs). Run `npx @gentbajko/slopify --docker` again to check again
after changing Docker's setting. A compose file run by hand has no such record, so the screen
says it can't know and points to Docker Desktop → Settings → General → Start Docker Desktop when
you sign in (or `sudo systemctl enable docker` for Docker Engine).

## API

- `GET /api/settings/autostart`: the switch's state (`kind` native or docker, `enabled`,
  `summary`, `where`, `howTo`, `checkedAt`, `offer`).
- `PUT /api/settings/autostart` with `{ "enabled": true | false }`: turns it on or off (native
  only; in Docker it answers 409 with where Docker's setting is).
- `POST /api/settings/autostart/answer`: the first-run screen's No thanks.
