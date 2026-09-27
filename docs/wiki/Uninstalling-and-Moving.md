# Uninstalling and Moving

How to take Slopify off a computer, and how to move your projects between a normal install and Docker, or to another computer. Slopify has no uninstall command: removing it means removing the few things listed here. Moving always goes through a backup archive, which carries everything except your provider keys.

**Where to find it:** Settings → **Backup & storage** (**Export everything**, **Import a backup**) and a terminal.

## Before you remove anything

1. Let running projects finish, or pause them.
2. Open Settings → **Backup & storage** and press **Export everything**. Keep the downloaded `.tar` file somewhere safe. It holds every project with its files and history, your library, templates, schedules, Play drafts, fonts, settings and usage. It does not hold your provider keys; keep those in your password manager.
3. If you turned on Settings → **General** → **Start Slopify when I log in**, turn it off. That removes the login entry, so nothing tries to start Slopify at your next login.

Deleting the folders below can't be undone. Scheduled backups in your `Backups` folder are deleted with it unless you move them first.

## Remove a normal install

1. Stop Slopify: press `Ctrl+C` in the terminal it runs in (or close its minimised window on Windows).
2. If you installed it with npm, run `npm uninstall -g @gentbajko/slopify`. If you only used `npx`, there is nothing installed globally; npm's cache holds a copy it manages itself.
3. Delete Slopify's data folder: `~/.slopify` (on Windows `%USERPROFILE%\.slopify`), or the folder you gave with `--data-dir` / `SLOPIFY_DATA_DIR`. This removes the database, your saved keys, logs, caption models and any versions installed by in-app updates.
4. Delete your files folder if you don't want your projects any more: `Documents/Slopify` on a new install. Settings → **Backup & storage** → **Your files** shows exactly where it is (check before you uninstall). On an install from before 3.0, the projects are inside the data folder and went with step 3.
5. If you left the start-at-login switch on, remove the entry by hand: `~/.config/autostart/slopify.desktop` on Linux, `~/Library/LaunchAgents/stream.slopify.app.plist` on macOS, or the `Slopify` value under `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` on Windows (Task Manager → Startup apps shows it).

## Remove a Docker install

Run these as your normal user on the computer running Docker.

1. If you use the host CLI bridge, stop and disable it:

   ```sh
   systemctl --user disable --now slopify-cli-bridge.service
   ```

2. Stop and remove the container from the folder the installer set up:

   ```sh
   cd ~/.local/share/slopify/docker/slopify
   docker compose down
   ```

3. Delete the data volume (database, keys, settings, logs). The installer declares it external, so `docker compose down` never deletes it; you have to do it yourself:

   ```sh
   docker volume rm slopify-data
   ```

4. Delete any recovery volume left by the last update. `docker volume ls` lists it as `slopify-data-recovery-<id>`; remove it with `docker volume rm`.
5. Remove the image: `docker image ls ghcr.io/gentbajko/slopify` lists it; remove it with `docker image rm`.
6. Delete the installer's folders: `~/.local/share/slopify/` (the compose file, `install.json` and the host CLI helper) and, if you used the bridge, its unit file `~/.config/systemd/user/slopify-cli-bridge.service`.
7. Delete your Projects and Backups folders if you don't want them any more: `Documents/Slopify` on a new install, `~/Slopify/Projects` on an install from before 3.0.

If you used a different `SLOPIFY_DOCKER_NAME` or `SLOPIFY_DOCKER_VOLUME`, use those names instead of `slopify` and `slopify-data`.

The installer turned on user lingering for the bridge (so your user services run at boot). It leaves that setting as it is when you remove Slopify; change it with `loginctl` only if you know nothing else of yours needs it.

## Move from Docker to a normal install

1. In the Docker Slopify, let running work finish, then open Settings → **Backup & storage** → **Export everything** and save the `.tar` file.
2. Stop the Docker install so the port is free: `docker stop slopify` (or start the new one on another port with `--port 7070`).
3. Start Slopify normally: `npx @gentbajko/slopify@latest`. See [Install](Install).
4. In the new Slopify, open Settings → **Backup & storage** → **Import a backup** and pick the `.tar` file. Large backups take a while to upload and check.
5. Read the summary. Projects, library, templates and settings come in; schedules arrive paused.
6. Enter your provider keys in Settings → **Providers** and check your voices in Settings → **Voices**.
7. Resume your schedules on the Schedules screen. See [Schedules](Schedules).
8. Once everything opens fine, remove the Docker install as above.

## Move from a normal install to Docker

1. In the normal Slopify, let running work finish and use **Export everything**.
2. Stop it (`Ctrl+C`). If start-at-login is on, turn it off first so it doesn't come back at the next login and take port 6969.
3. Install Docker: `npx @gentbajko/slopify@latest --docker`. See [Docker](Docker).
4. Open `http://127.0.0.1:6969`, go to Settings → **Backup & storage** → **Import a backup** and pick the file.
5. Enter your provider keys, resume schedules, and check that your projects open.
6. Remove the old install when you are sure.

## Move to another computer

The same way: **Export everything** on the old computer, install Slopify on the new one, **Import a backup** there, then enter your keys and resume your schedules. If both computers keep running, leave the schedules paused on one of them so they don't both make the same videos.

## How an import treats what's already there

An import adds and never replaces:

| Item | What happens |
| --- | --- |
| Projects already on this install | Skipped. |
| Prompts, templates and others whose name is taken | Added as "(imported)". |
| Schedules | Arrive paused, so two installs never run them both. |
| Settings | Filled in where this install has none; this install's own are kept. |
| Usage history | Added once; importing the same backup again doesn't count it twice. |
| Provider keys | Never in a backup. Enter them again. |

Running projects must finish or pause before an import. See [Backups](Backups) for what an archive carries in full.

## Move your files without moving the install

To put your project files on another disk or in Documents while keeping the same install, you don't need to export: use **Move to Documents/Slopify** or **Choose another folder** in Settings → **Backup & storage**, or `--projects-dir` for Docker. See [Where Your Files Live](Where-Your-Files-Live).

## Tips

- An export can be many gigabytes, because it holds every video. Check you have the space, and keep Slopify running until the browser's download finishes.
- **Keep outputs only** (Settings → Backup & storage → Disk space) makes finished projects smaller before you export, at the cost of remaking working files if you edit them later.
- Export and import is the documented way to move between installs. Copying a data folder or a Docker volume by hand is not covered here.

## Related pages

- [Backups](Backups)
- [Where Your Files Live](Where-Your-Files-Live)
- [Install](Install)
- [Docker](Docker)
- [Start at Login](Start-at-Login)
- [Providers and Keys](Providers-and-Keys)
- [Schedules](Schedules)
- [Trash](Trash)
