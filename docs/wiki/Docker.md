# Docker

On Linux you can have Slopify run in Docker in the background, restarting whenever Docker does. One command installs it, one command updates it, and your project files stay in a normal folder on your computer.

**Where to find it:** a terminal, `npx @gentbajko/slopify@latest --docker`. Inside the app, Settings → **Backup & storage** → **Your files** and Settings → **General** show the Docker-specific parts.

## What you need

- Linux with Docker Engine and the Docker Compose plugin.
- Node 26 or newer on the host, to run the installer.
- Your normal user account, with access to Docker. Don't run the installer with `sudo`. If Docker says permission denied, add yourself to the `docker` group (`sudo usermod -aG docker $USER`), then log out and back in.

Refused setups: Docker Desktop, a remote Docker daemon, and rootful Docker with `userns-remap`. Rootless Docker works; the container then runs as user `0:0`, which is you on the host.

On Windows, macOS or anything else, run Slopify without Docker ([Install](Install)), or run the compose file yourself ([below](#run-the-compose-file-yourself)).

## Install Slopify in Docker

1. Open a terminal as your normal user.
2. Run `npx @gentbajko/slopify@latest --docker`.
3. If Claude Code, Codex or Gemini CLI is installed on this computer, the installer asks once whether Slopify may use them (see [The host CLI bridge](#the-host-cli-bridge)). Answer `y` to allow it, or anything else to stop without changing anything. To use API keys only, run the command with `--host-cli=off` instead.
4. It asks `Start Slopify when you log in? (Y/n)` once. See [Start at Login](Start-at-Login#docker).
5. When it finishes it prints:
   - `Slopify 3.0.0 is running at http://127.0.0.1:6969`
   - `Project files on this machine:` your Projects folder
   - `Backups on this machine:` your Backups folder, on a new install
   - which AI tools it will use (the host CLIs, or API keys only)
6. Open `http://127.0.0.1:6969` in your browser and continue with [First Launch and Welcome](First-Launch-and-Welcome).

Running the same command again with nothing changed does nothing, apart from starting the container if it was stopped.

## What gets installed

| Part | What it is |
| --- | --- |
| Image | `ghcr.io/gentbajko/slopify:<version>`, pinned to the version of the installer you ran. It runs as a non-root user and already contains ffmpeg and the caption model. A healthcheck asks the app whether it is up. |
| Compose file | Copied to `~/.local/share/slopify/docker/slopify/` with a private `.env` beside it. One service, `slopify`, with `restart: unless-stopped`. |
| Port | `127.0.0.1:6969` on the host, localhost only. |
| Data volume | `slopify-data`, mounted at `/data`. It holds the database, provider keys, settings, logs and staging. It is declared external, so `docker compose down` (even with `-v`) never deletes it. |
| Projects folder | A folder on your computer, mounted at `/data/projects`. |
| Backups folder | A folder on your computer for scheduled backups, mounted at `/data/backups` (new installs from 3.0). |
| Host CLI bridge | Optional. A small helper that lets the container use your AI command-line tools. |
| `install.json` | In the same folder as the compose file. Records the version, port, project folder, user and whether the bridge is on. |

## Where your files go

| Install | Projects | Backups |
| --- | --- | --- |
| New install (3.0 and later) | `<Documents>/Slopify/Projects` | `<Documents>/Slopify/Backups` |
| Installed before 3.0 | `~/Slopify/Projects` (kept as it was) | `~/Slopify/Projects/Backups` |

`<Documents>` is what `xdg-user-dir DOCUMENTS` answers, then `XDG_DOCUMENTS_DIR` in `~/.config/user-dirs.dirs`, then `~/Documents`.

Everything else (database, keys, logs) stays private in the `slopify-data` volume. See [Where Your Files Live](Where-Your-Files-Live).

## Change a setting

Run the install again with the setting you want. Settings you leave out are remembered from `install.json`.

| Option | What it does |
| --- | --- |
| `--port <number>` | Serves Slopify on another host port, still on `127.0.0.1`. |
| `--projects-dir <folder>` | Uses another folder for project files. The files are copied and checked first; the old folder is left as it was. The new folder must be empty. A `~/` at the start is understood. |
| `--projects-dir documents` | Moves an existing install's projects to `<Documents>/Slopify/Projects`. |
| `--host-cli=off` | Turns the host CLI bridge off; Slopify uses API keys only. `off` is the only accepted value. |
| `--accept-host-cli` | Approves the host CLI bridge without the question, for scripts. |
| `--autostart` / `--no-autostart` | Answers the start-at-login question without asking. |

`--host` and `--data-dir` can't be combined with `--docker`.

For several Docker installs on one machine, give each its own `SLOPIFY_DOCKER_NAME` and `SLOPIFY_DOCKER_VOLUME` (letters, digits, dots, dashes and underscores). A second install's Documents folder is `<Documents>/Slopify/<name>/Projects`.

## Move your projects into Documents

A container can't move its own mounted folder, so the installer does it from the host.

1. Open Settings → **Backup & storage**. Under **Your files** you see the command to run, with **Copy command**.
2. On the computer running Docker, run `npx @gentbajko/slopify@latest update --docker --projects-dir documents`. For another folder, use `--projects-dir <folder>`.
3. The installer waits for running work to finish, copies the folder, checks the copy and remounts the new folder.
4. The old folder is left as it was. Once your projects open fine, you can delete it.

Backups stay where they were (`Projects/Backups` on an older install).

## Update the Docker install

Run `npx @gentbajko/slopify@latest update`. With a Docker install on your user account, `update` goes to it automatically (`update --docker` is the same). The **Update** button inside the Docker app shows this command, because a container can't replace itself.

The update is one transaction:

1. It waits until nothing is generating. Pressing `Ctrl+C` while it waits changes nothing.
2. It stops the container and copies the whole data volume into a recovery volume, `slopify-data-recovery-<id>`, checked file by file.
3. It starts the new version and waits up to 2 minutes for it to answer as that version.
4. On success it records the new version and removes the older recovery volume, so only the newest one is kept.
5. If the new version doesn't answer, it removes it, copies your data back from the recovery volume and starts the previous version with its previous settings.

If an install or update is cut off (`Ctrl+C`, a reboot), the next run first finishes putting things back, then continues.

The recovery volume covers the database and settings, not your Projects folder. When you make your own backups, keep both the `slopify-data` volume and your Projects folder, or use [Backups](Backups).

## The host CLI bridge

If Claude Code, Codex or Gemini CLI is installed on the host, Slopify in Docker can use them with the logins you already have. Nothing about your logins is copied into Docker.

- With your OK, the installer sets up a small helper, at the same version as the image, and keeps it in step on every install and update.
- The helper runs as the systemd user service `slopify-cli-bridge.service`, as you. User lingering is turned on so it runs at boot and after you log out.
- It talks to the container through a private socket in `~/.local/share/slopify/host-cli/share/`, with a token. There is no network port. Only that `share` folder is mounted into the container, read-only.
- Codex images, run cost and plan-limit readings work the same as without Docker.
- The helper only opens folders inside your Projects folder when you press **Open folder**.
- With the bridge off, Settings shows the CLIs as unavailable, and API keys still work.

Check or turn it off:

```sh
systemctl --user status slopify-cli-bridge.service
systemctl --user disable --now slopify-cli-bridge.service
```

Turning it off leaves Docker, your API providers, your data and your host logins as they are. Run the install again after installing or moving a CLI.

If the installer can't ask (no interactive terminal), it stops and tells you to rerun with `--accept-host-cli` or `--host-cli=off`. Using the bridge needs systemd user services (`systemctl --user`); without them, use `--host-cli=off`.

## Coming from 2.5.0 or earlier

The first run of the new installer takes your existing installation over:

- It reuses the `slopify-data` volume by name; it is never deleted or recreated. A container on another volume is refused, with the `SLOPIFY_DOCKER_VOLUME` value to use.
- It keeps the project folder the old container used (`~/Slopify/Projects`, or your `--projects-dir`). A plain `docker run` container that kept projects inside the volume gets them copied, checked, to `~/Slopify/Projects`; the copy in the volume stays.
- The old container is stopped and renamed `slopify-previous-<id>` while the new one starts. If the new one fails, the old one is put back exactly as it was. It is removed once the new one is committed.
- If a 2.5.0 launcher update was left unfinished, nothing is changed. Run `npx @gentbajko/slopify@2.5.0 --docker` once so it finishes or undoes it, then install again.

## Run the compose file yourself

Without the installer (any OS with Docker Compose), with API keys only, from a folder containing Slopify's `compose.yaml`:

```sh
docker volume create slopify-data
mkdir -p ~/Slopify/Projects
SLOPIFY_PROJECTS_DIR=~/Slopify/Projects SLOPIFY_USER="$(id -u):$(id -g)" \
  docker compose -f compose.yaml up -d
```

| Variable | Default | What it does |
| --- | --- | --- |
| `SLOPIFY_PROJECTS_DIR` | none, required | The host folder for project files. |
| `SLOPIFY_IMAGE` | `ghcr.io/gentbajko/slopify:latest` | The image to run. |
| `SLOPIFY_PORT` | `6969` | The host port, bound to `127.0.0.1`. |
| `SLOPIFY_USER` | `1000:1000` | The user id the container runs as, so project files belong to you. |
| `SLOPIFY_VOLUME` | `slopify-data` | The data volume's name. It must exist (`docker volume create`). |
| `SLOPIFY_BACKUPS_DIR` | empty | The host folder for scheduled backups. Without it, backups stay in `Projects/Backups`. |
| `SLOPIFY_HOST_CLI_SHARE` | empty | The host CLI bridge's share folder, if you set one up. |
| `SLOPIFY_NAME` | `slopify` | The compose project and container name. |

Update by changing `SLOPIFY_IMAGE` and running `docker compose up -d` again. This way has no automatic recovery copy or rollback, and Settings → General can't tell whether Docker starts at login.

Keep the `127.0.0.1` binding. Anyone who reaches Slopify's port controls the app and its provider keys.

## Tips

- Settings → **General** shows **Starts with Docker: yes / no / unknown**, read by the installer. Run the install command again after changing Docker's own start-up setting so it looks again.
- Port 6969 taken by a native Slopify? Stop the native one, or give Docker another port with `--port 7070`.
- To stop Slopify for a while without removing anything, run `docker stop slopify`; `docker start slopify` or the install command starts it again.

## Related pages

- [Install](Install)
- [Where Your Files Live](Where-Your-Files-Live)
- [Start at Login](Start-at-Login)
- [Updating and Patch Notes](Updating-and-Patch-Notes)
- [Uninstalling and Moving](Uninstalling-and-Moving)
- [AI CLIs](AI-CLIs)
- [Backups](Backups)
