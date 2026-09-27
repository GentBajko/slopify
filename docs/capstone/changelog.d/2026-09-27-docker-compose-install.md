# One compose file, one install command, one update command

- Docker now runs from a single `compose.yaml` (shipped in the package, copied with a private `.env` to `~/.local/share/slopify/docker/<name>/`): one service, the external `slopify-data` volume, your Projects folder, the host CLI bridge folder, `restart: unless-stopped`, port on 127.0.0.1 only.
- `npx @gentbajko/slopify --docker` installs or re-applies settings; `npx @gentbajko/slopify@latest update` updates, Docker or native. The image tag is pinned to the installer's release.
- Docker updates wait for running work, keep a verified recovery copy of the data volume (only the newest is kept), and put the previous container and data back automatically if the new version doesn't answer. A cut-off run is undone first on the next run.
- Installations from 2.5.0 or earlier are taken over in place: same volume by name, same project folder; the stopped `slopify-previous-*` containers the old launcher kept are removed after a successful update. An unfinished 2.5.0 update is refused with the command to finish it.
- Native `slopify update` drives the running app's own updater, the same path as the Update button.
- Removed the layered launcher (bash entry, flock wrapper, journal/claims/recovery engine); `docs/docker.md` documents the host CLI bridge protocol, auth and lifecycle.
