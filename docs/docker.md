# Docker


On Linux with Docker, Node 26+ and util-linux (`flock`), run:

```sh
npx @gentbajko/slopify@latest --docker
```

The launcher detects Codex, Claude Code and Gemini on your host. It asks once
before installing a private helper that runs those CLIs under your user account.
That permission includes automatic startup and user lingering, which keeps your
user services running after logout and starts them at boot. CLI logins stay on
the host; you don't sign in again inside Docker.

Slopify runs in the background at `http://127.0.0.1:6969` and restarts with Docker.
The managed Linux launcher saves generated project files in `~/Slopify/Projects`.
Custom container names use `~/Slopify/<container>/Projects`. The database,
credentials, logs and staging stay private in the named `slopify-data` volume.
Run as your normal user with Node 26+, Docker access and util-linux (`flock`).
Systemd is needed only for the optional host CLI helper. Native installs continue
using their configured data directory and need no helper.

Use `--projects-dir "/path/to/Projects"` or `SLOPIFY_DOCKER_PROJECTS_DIR` to choose
a dedicated folder. Later launches remember that absolute path when the override
is omitted. `--port 7070` changes the localhost port. Custom installations sharing
a machine need distinct `SLOPIFY_DOCKER_NAME` and `SLOPIFY_DOCKER_VOLUME` values.
Do not store unrelated documents in the managed Projects tree: storage
reconciliation owns it. Moving to another folder performs a verified copy;
existing unrelated contents are never merged or overwritten.

Existing installations are stopped, copied and verified before the new folder
is activated. Open folder on current and historical outputs opens the real host
folder in your file manager through the host helper when it is installed;
otherwise (for example with `--host-cli=off`, or a helper from an older launcher)
it shows that folder's path on the machine running Slopify. Downloads remain
available either way. The helper only opens folders inside the project folder the
launcher set up, and needs `xdg-open` (xdg-utils) on the host.

The helper uses a private authenticated socket, not a public port or remote shell.
Docker receives model metadata and generated text/image bytes. It doesn't mount
your CLI executables, home directory or login files. Settings shows host commands
read-only. Rerun the launcher after changing CLI installations or search paths.
CLI authentication that depends on secret environment variables must be configured
in the host service; the launcher does not copy those variables into Docker.

For API-only Docker, add `--host-cli=off`. Non-interactive helper setup requires
`--accept-host-cli`, which grants the same host-access and startup permission.
If no CLIs are installed, the launcher starts API-only; install them on the host
and rerun it when needed. Managed helper setup is not available on Windows/macOS.

Plain `docker run` is API-only unless connected to an already configured helper.
It does not set up a host project folder or install host services; its files stay
in the private named volume. Use the managed launcher for automatic migration
and host-folder access.

```sh
docker run -d --name slopify --restart always \
  -p 127.0.0.1:6969:6969 \
  -v slopify-data:/data \
  ghcr.io/gentbajko/slopify:latest
```

Keep the localhost binding: anyone who reaches Slopify's port can control the app
and its providers. FFmpeg is already installed in the image.

To update a launcher-managed installation:

```sh
docker pull ghcr.io/gentbajko/slopify:latest
npx @gentbajko/slopify@latest --docker
```

The launcher keeps the configured named volume, the original project tree,
a stopped previous container and a private recovery-volume clone. It waits up
to 120 seconds for the replacement application. Before commit, a failed copy,
ownership change or replacement restores the previous private bytes and ownership
when verification succeeds; an incomplete rollback is reported explicitly.
Installation receipts, transaction journals and the setup lock live under
`$XDG_DATA_HOME/slopify/docker` or `~/.local/share/slopify/docker`, outside Projects.
Budget temporary space for one volume clone plus one project copy.

If setup is interrupted, rerun the same launcher. Keep the printed recovery
volume and stopped containers until you have verified your outputs. A missing
remembered folder, stale failed copy, conflicting container or changed daemon
is an error; restore the original folder/daemon. For a stale failed copy, keep
the printed recovery material and select a new empty `--projects-dir` for a
fresh verified copy. Do not delete the receipt to bypass
these checks, start a stopped recovery container while another writer uses its
volume, or run a recursive permission fix on your data. Rootful userns-remap and
remote daemons are unsupported; use a supported rootless daemon or native
Slopify without weakening daemon isolation. Installation does not regenerate
failed or paused work.

The launcher refuses to replace a helper while it is generating. For a direct
Docker installation, recreate the container after pulling, using the same named volume.

Check or disable only the dedicated host helper:

```sh
systemctl --user status slopify-cli-bridge.service
systemctl --user disable --now slopify-cli-bridge.service
```

Disabling it leaves Docker, API providers, data and host logins intact. It does
not disable user lingering, which may support other services. Helper files live
under `$XDG_DATA_HOME/slopify/host-cli` or `~/.local/share/slopify/host-cli`.
