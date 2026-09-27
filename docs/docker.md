# Docker

On Linux with Docker Engine, the Docker Compose plugin and Node 26+, run as your
normal user:

```sh
npx @gentbajko/slopify@latest --docker     # install (or re-apply settings)
npx @gentbajko/slopify@latest update       # update to the newest release
```

Slopify then runs in the background at `http://127.0.0.1:6969` and restarts with
Docker. Project files go to `~/Slopify/Projects`; the database, keys, logs and
staging stay private in the `slopify-data` volume.

## What gets installed

One image, one compose file, one host helper:

- **Image** `ghcr.io/gentbajko/slopify:<version>`: multi-stage, runs as a non-root
  user, FFmpeg and the caption model included, with a healthcheck on `/api/health`.
  The install pins the tag to the release you ran, so the image and the installer
  are always the same version.
- **[compose.yaml](../compose.yaml)** (shipped in the package) is copied to
  `~/.local/share/slopify/docker/slopify/` with a private `.env` beside it. One
  service `slopify`, `restart: unless-stopped`, port bound to `127.0.0.1` only, the
  `slopify-data` volume at `/data`, your Projects folder at `/data/projects`. The
  volume is declared `external`, so `docker compose down` (even with `-v`) never
  deletes it.
- **The host CLI bridge** (optional, see below).

Beside them, `install.json` records what was installed (version, port, project
folder, user, whether the bridge is on). Change a setting by running the install
again with it: `--port 7070`, `--projects-dir <folder>`, `--host-cli=off`. Settings
you leave out are remembered. Moving to another project folder copies and verifies
the files first; the old folder is left as it was, and the new one must be empty.
Several installations on one machine need their own `SLOPIFY_DOCKER_NAME` and
`SLOPIFY_DOCKER_VOLUME`.

Running the install again with nothing changed does nothing besides starting the
container if it was stopped.

## Updating

`npx @gentbajko/slopify@latest update` (or `--docker` with the newest version) runs
one transaction:

1. Waits until nothing is generating (the app's own update gate). Ctrl+C here
   changes nothing.
2. Stops the container and copies the whole data volume into a recovery volume
   `slopify-data-recovery-<id>`, verified file by file.
3. Starts the new version through compose and waits up to 2 minutes for it to answer
   as that version.
4. On success it commits (`install.json`) and removes the older recovery volume, so
   only the newest one is kept, plus stopped `slopify-previous-*` containers the
   2.5.0 launcher left behind.
5. If the new version doesn't answer, it removes it, copies the data back from the
   recovery volume (the new version may already have changed the database), and
   starts the previous version with its previous settings.

If an install or update is cut off (Ctrl+C, reboot), the next run first finishes the
undo from `update.json`, then continues. The Update button inside the Docker app
points to the same command, since a container can't replace itself.

Keep the named volume and your Projects folder when backing up; the recovery volume
covers the database and settings, not the Projects folder.

## Coming from 2.5.0 or earlier

The first run of the new install takes the existing installation over as it is:

- It reuses the container's data volume by name (`slopify-data`); it is never
  deleted or recreated. A container on another volume is refused, with the
  `SLOPIFY_DOCKER_VOLUME` value to use.
- It keeps the project folder the old container used (the 2.5.0 launcher's
  `~/Slopify/Projects`, or your `--projects-dir`). A plain `docker run` container
  that kept projects inside the volume gets them copied, verified, to
  `~/Slopify/Projects`; the copy in the volume stays.
- The old container is stopped and renamed `slopify-previous-<id>` while the new
  one starts, restored exactly (name, restart policy, running) if it fails, and
  removed once the new one is committed.
- If a 2.5.0 launcher update was left unfinished, nothing is changed: run
  `npx @gentbajko/slopify@2.5.0 --docker` once so it finishes or undoes it, then
  install again.

The old launcher's `receipt.json`, `journal.json` and per-update folders stay in
`~/.local/share/slopify/docker/slopify/`; nothing reads them after the takeover.

## The host CLI bridge

If Claude Code, Codex or Gemini is installed on the host, the install asks once
(`--accept-host-cli` to approve without a prompt, `--host-cli=off` to skip it). With
your OK it installs the helper at the same version as the image and keeps it in
step on every install and update.

- **Process.** The helper is the package's `dist/edge/host-cli.js`, run by the
  systemd user service `slopify-cli-bridge.service` (user lingering is enabled so it
  runs at boot and after logout). It runs as you, with the `HOME`, `PATH` and CLI
  config variables it was installed with, so the CLIs use their existing logins.
  Nothing about the logins is copied into Docker.
- **Transport.** HTTP over a Unix socket, `share/cli.sock`, in
  `~/.local/share/slopify/host-cli/`. Only the `share` folder (socket and token) is
  mounted into the container, read-only, at `/opt/slopify-host`. No network port.
- **Auth.** Every request carries `Authorization: Bearer <token>`, the 64-hex token
  in `share/token`, created once.
- **Protocol 1.** `GET /v1/health`, `GET /v1/status/:provider`,
  `GET /v1/models/:provider`, `POST /v1/llm/:provider` (streamed text),
  `POST /v1/image` (Codex images) and `POST /v1/open-folder` (only folders inside
  the Projects folder recorded in `install.json`, through `xdg-open`). Providers are
  `claude-code`, `codex` and `gemini`; request and response sizes are capped.
- **Lifecycle.** Installs and updates pause its admissions and refuse to replace it
  while it runs a CLI. With the bridge off, compose mounts an empty folder and
  Settings shows the CLIs as unavailable.

Check or disable it:

```sh
systemctl --user status slopify-cli-bridge.service
systemctl --user disable --now slopify-cli-bridge.service
```

Disabling it leaves Docker, API providers, data and host logins intact. Rerun the
install after installing or moving a CLI.

## Running the compose file yourself

Without the installer (any OS with Docker Compose), API keys only:

```sh
docker volume create slopify-data
mkdir -p ~/Slopify/Projects
SLOPIFY_PROJECTS_DIR=~/Slopify/Projects SLOPIFY_USER="$(id -u):$(id -g)" \
  docker compose -f compose.yaml up -d
```

Variables: `SLOPIFY_IMAGE`, `SLOPIFY_PORT` (default 6969), `SLOPIFY_USER`,
`SLOPIFY_VOLUME` (default `slopify-data`), `SLOPIFY_PROJECTS_DIR` (required),
`SLOPIFY_HOST_CLI_SHARE`, `SLOPIFY_NAME`. Update by changing `SLOPIFY_IMAGE` and
running `up -d` again; that path has no automatic snapshot or rollback.

Keep the localhost binding: anyone who reaches Slopify's port can control the app
and its providers.

## Starting at login

The container restarts with Docker, so Slopify starts whenever Docker does. The installer asks
"Start Slopify when you log in? (Y/n)" once (`--autostart` / `--no-autostart` skip it), reads
whether Docker itself starts by itself (`systemctl is-enabled`, never changed) and records it for
Settings → General. See [start-at-login.md](start-at-login.md#docker).

## Limits

Linux only for the installer. Docker Desktop, remote Docker daemons and rootful
`userns-remap` are refused; rootless Docker works (the container then runs as
`0:0`, which is you on the host). Don't run the installer with sudo.
