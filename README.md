<h1 align="center">
  <a href="https://slopify.stream"><img src="https://slopify.stream/assets/favicon.svg" width="40" height="40" align="middle" alt="" /></a>
  Slopify
</h1>

<p align="center">
  <a href="https://slopify.stream">slopify.stream</a>
  &nbsp;·&nbsp;
  <a href="https://www.patreon.com/cw/GentBajko"><img src="https://slopify.stream/assets/patreon-green.svg" width="14" height="14" align="middle" alt="" /> Patreon</a>
  &nbsp;·&nbsp;
  <a href="https://buymeacoffee.com/gentbajko"><img src="https://slopify.stream/assets/buymeacoffee-green.svg" width="14" height="14" align="middle" alt="" /> Buy Me a Coffee</a>
</p>

Slopify turns a prompt and a handful of keywords into a narrated slideshow video.
It researches the topic, writes the article, narrates it, generates the imagery and
cuts the result together with ffmpeg. It can also lay the article out as a styled PDF. Everything runs on your machine against your
own provider keys, behind a local web UI.

```sh
npx @gentbajko/slopify@latest
```

The app serves its UI on `http://127.0.0.1:6969` and opens a browser at it. Node 26
or newer, nothing else to install.

For a persistent global install, run:

```sh
npm install -g @gentbajko/slopify
slopify
```

Both commands launch the same local app; use `npx` when you want an install-free run,
or the global command when you want `slopify` available on your `PATH`.

## Docker

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

## How to use it

1. Run the command and open the tab it prints. The bar at the top has four places:
   Projects, Play, Library and Settings.
2. Settings holds your provider API keys and your voices, one section at a time. Keys live in
   `~/.slopify/slopify.db` and go to the provider you picked, nowhere else. Usage is the
   last Settings section.
3. Library holds Prompts, Intros & Outros, Templates and Schedules. Prompts is where the
   article, image, thumbnail and YouTube description prompts are written once, with
   `{{keywords}}` where the subject goes.
4. Play keeps an autosaved setup across Content, Outputs and Style. Pick the prompts, fill
   in the keywords, choose a voice and format, then press Review and start: Review opens
   beside the form with the estimated cost, and nothing runs until you choose Start run.
   Any optional stage you would rather do yourself can be skipped or supplied.
5. The project page shows the whole run in one row of stage lamps. Pick a stage to read
   writing as it arrives, listen to streamed narration or see images. Download the article,
   audio, images or final export. Pause unfinished work to change providers.
6. Subtitles can use a bundled, system or uploaded font. Preview size and one of five
   positions in the selected landscape or portrait frame before saving.
7. Edit a completed or paused project from its Edit tab without losing its history. Save
   creates a retained revision; Slopify shows exactly which outputs are affected and rebuilds
   only when you ask. Earlier revisions are on the History tab.
8. Save a Play setup or project revision as a template. Apply it to make a fresh editable
   draft, or schedule one-off, daily or weekly runs with a spend ceiling. Paste a list of topics,
   one per line: each run fills one template keyword with the next topic and removes it.
9. Add review checkpoints in Review when you want to inspect Audio, Images or Video before it
   runs. Independent stages continue while the selected step and its dependents wait; approve
   them on the project's Checkpoints tab.
10. Switch on Document on Play (or in Edit project → Inputs) to get the article as a styled
    PDF: a title page with the thumbnail as its cover, a clickable table of contents, drop caps,
    links and a Sources page, in the DiceMaster or Plain theme. It is made locally, costs
    nothing, and is marked for a rebuild when you edit the article. Download it, open its
    folder, or use Open PDF on the project page to read it in a browser tab.
11. Switch on YouTube description on Play's Export rail (or in Edit project → Prompts) to get
    a ready-to-paste description and tags with the video: a short summary, chapters at the
    narration's real times, hashtags at the end, and a tags list within YouTube's limits. It
    runs right after subtitle timing, beside the render, with the project's text model; copy
    both from the Video stage or download `description.txt` and `tags.txt`.
12. The update button in the top bar checks for new releases and installs an update when you
    choose it. Active projects must finish or be paused first.

## Inworld narration

In Settings, add the **Base64 credentials** from Inworld's API Keys page, then add an
Inworld voice ID (for example `Dennis`, or a voice from your workspace). In Play,
choose **Realtime TTS-2** or **Realtime TTS-2 Flash** and that voice.

Short text streams immediately. TTS-2 text over 4,000 characters uses one async job,
up to 100,000 characters; Inworld caps On-Demand accounts at 10,000. Audio becomes
available once that job finishes. Flash uses streamed parts of at most 4,000 characters.
For longer articles, select paragraph chunking. Successful status checks keep long jobs
alive, and automatic polling/download retries reuse the accepted job. Pausing stops
local requests; Inworld may still finish and bill an accepted job. Resuming after a
pause or app restart starts a new request for unfinished narration.

See [Inworld's async API](https://docs.inworld.ai/api-reference/ttsAPI/texttospeech/synthesize-speech-async)
for account limits. Both model IDs are bundled; Inworld's LLM catalogue does not list TTS models.

## Options

Every option is a flag or an environment variable of the same name. A flag beats the
variable, the variable beats the default.

| Flag | Variable | Default | Does |
|---|---|---|---|
| `--port` | `SLOPIFY_PORT` | `6969` | The port the app listens on. An integer from 1 to 65535; anything else refuses to start. |
| `--host` | `SLOPIFY_HOST` | `127.0.0.1` | The address it binds to. |
| `--data-dir` | `SLOPIFY_DATA_DIR` | `~/.slopify` | Where `slopify.db`, `projects/`, `staging/` and `logs/` live. Relative paths are resolved against the working directory. |
| `--projects-dir` (Docker only) | `SLOPIFY_DOCKER_PROJECTS_DIR` | remembered path; otherwise `~/Slopify/Projects` (custom names: `~/Slopify/<container>/Projects`) | Dedicated host project folder. |
| `--no-open` | `SLOPIFY_NO_OPEN` | the browser opens | Keeps the browser shut. As a variable, any value other than empty, `0` or `false` counts as set. |
| no flag | `SLOPIFY_FFMPEG` | the bundled binary | Path to an ffmpeg to render with. |
| no flag | `SLOPIFY_NO_MODEL_PREFETCH` | the model downloads at start | Skips fetching the 95 MB subtitle-timing model when the app starts; the first captioned render fetches it instead. Docker images ship the model and copy it locally. Set as for `SLOPIFY_NO_OPEN`. |

There is no login. Binding to anything but `127.0.0.1` prints a warning at startup
and means it: whoever reaches that port controls the app and the keys in it.

```sh
SLOPIFY_PORT=5000 SLOPIFY_NO_OPEN=1 npx @gentbajko/slopify@latest
```

## ffmpeg and its licence

No separate FFmpeg installation is required. Native Slopify installs it through
[`ffmpeg-static`](https://www.npmjs.com/package/ffmpeg-static), which fetches a
platform binary at `npm install` time, and never falls back to an ffmpeg on your
`PATH`: the binary that ships is the binary that is tested. Point `SLOPIFY_FFMPEG` at
another build to override it.

Slopify checks that ffmpeg runs before starting. If the install-time download is
missing, it downloads the same platform build into `<data-dir>/bin/`, keeping the
licence and source notice beside it. Later launches reuse that copy. If recovery
fails, check your connection and antivirus quarantine, or choose your own executable.
Docker includes the same platform build, licence and source notice in the image;
it is downloaded and checked when the image is built, not on first launch.

```sh
SLOPIFY_FFMPEG=/usr/bin/ffmpeg npx @gentbajko/slopify@latest
```

In Windows PowerShell:

```powershell
$env:SLOPIFY_FFMPEG = 'C:\tools\ffmpeg\bin\ffmpeg.exe'
npx @gentbajko/slopify@latest
```

That binary is a separate program, run as a child process with an argument array. It
is licensed under the **GPL-3.0-or-later**. Slopify does not link against it, does not
embed it, and does not distribute it inside the `slopify` package; `ffmpeg-static`
downloads it to `node_modules/ffmpeg-static/` at install time, and its licence text and
the location of its corresponding source ship there beside it. Slopify's own code is
MIT and stays MIT. Anyone redistributing the downloaded binary takes on the GPL's
obligations for it, including offering that corresponding source.

## Telemetry

Slopify sends anonymous counters to a collector: installs, projects created, stages
completed, images and videos made, audio seconds, and provider token counts. Never
your keys, prompts, keywords, titles, article text, filenames, or anything about your
machine beyond a random id created the first time you run it. The counters on
[slopify.stream](https://slopify.stream) are the sum of those events. Deleting the
data directory makes a fresh install with a new id.

## Supporting the project

Slopify is free and always will be. If it is worth something to you:

- [Patreon](https://www.patreon.com/cw/GentBajko)
- [Buy Me a Coffee](https://buymeacoffee.com/gentbajko)

The people who do are listed in [SUPPORTERS.md](SUPPORTERS.md).


## Working on it

Requires Node 26 or newer, which is what CI runs.

```sh
npm install
git config core.hooksPath .githooks   # once per clone, wires the pre-commit hook
npm run lint
npm run typecheck
npm test
npm run build
```

`core.hooksPath` is local repository configuration and cannot be committed, so a fresh
clone has to set it by hand or the pre-commit check will not run.

The workspace holds four packages. `packages/app` is the CLI and the HTTP server,
`packages/web` the SPA it serves, `packages/site` the marketing page, and
`packages/collector` the telemetry Worker.

To run the collector against a real local D1 database:

```sh
cd packages/collector
npm run schema:local        # applies schema.sql to the local D1 copy
npm run dev                 # wrangler dev on http://127.0.0.1:8787
```

The marketing page talks to `http://127.0.0.1:8787` whenever it is served from a
loopback origin, so a local collector is all it takes to see the counters move.
`wrangler dev` drops the connection a few seconds after a browser starts polling it
(wrangler 4.128.0, `Error in ProxyController: Network connection lost.`); `curl` is
unaffected, and serving the same responses from any small local server is enough to
look at the page.

## Deploying to Cloudflare

Both `packages/site` and `packages/collector` deploy with wrangler. Nothing here needs
a secret: the collector's only binding is its D1 database, and the page has no server
side at all.

Before the first deploy, the zone `slopify.stream` has to be on the Cloudflare account,
because both `wrangler.jsonc` files claim a hostname on it. The app posts to
`https://collector.slopify.stream` and the collector answers CORS for
`https://slopify.stream` only, so both names are part of the build.

```sh
npm install
npx wrangler login                                   # once, opens a browser
```

Then the collector, in order:

```sh
cd packages/collector
npx wrangler d1 create slopify-collector             # prints database_id
```

That command prints something like `database_id = "b1f0…"`. Paste it into
`packages/collector/wrangler.jsonc` in place of `D1_DATABASE_ID_PLACEHOLDER`, then:

```sh
npx wrangler d1 execute slopify-collector --remote --file=schema.sql
npx wrangler deploy
curl https://collector.slopify.stream/aggregates     # {"aggregates":{...}} with zeroes
```

Then the site:

```sh
cd ../site
npx wrangler deploy
```

After that first time, both deploys are one command from the repository root:

```sh
npm run deploy:check      # builds and validates both, offline, no account needed
npm run deploy            # collector first, then the site
```

The order is not arbitrary: the site's counters read from the collector, so deploying
the collector first means the page never goes live pointing at nothing.

There is deliberately no npm-publish script. `.github/workflows/release.yml` publishes
the npm package and Docker image on a matching version tag such as `1.2.0`. The npm
release signs a provenance attestation with the workflow's own OIDC identity, which a
publish from a laptop cannot do. Releasing is a version bump, a commit, a tag and a push.

The database id is the one value that cannot be committed ahead of time: it is
generated by `d1 create` and is specific to one Cloudflare account. Everything else in
both configuration files is final.

## Licence

MIT. See [LICENSE](./LICENSE). The ffmpeg binary fetched at install time is a separate
GPL-3.0-or-later program, as described above. The bundled Barlow and Barlow Condensed
faces under `packages/site/public/assets/fonts/` are SIL Open Font License 1.1; the
licence text ships with them as `OFL.txt`. So is the Cinzel face the Document stage embeds in
its PDFs, with its `OFL.txt` under `packages/app/src/assets/document/fonts/`.
