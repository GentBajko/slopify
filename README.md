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
cuts the result together with ffmpeg. Everything runs on your machine against your
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

On Linux, start Slopify in Docker with automatic detection of your installed
Codex, Claude Code, and Gemini CLIs:

```sh
npx @gentbajko/slopify@latest --docker
```

With Slopify installed globally, use `slopify --docker`. The launcher finds the
CLIs, mounts their installations read-only, and opens port 6969 on localhost.
It runs in the background, restarts with Docker, and keeps your data in the
`slopify-data` volume. Use `--port 7070` to change the port. Run the same command
after a CLI update; it refreshes changed mounts and retains the previous container
stopped for recovery. Running it again with the same configuration reuses the container.

For API-key providers without host CLI bridging, you can run the image directly:

```sh
docker run -d --name slopify --restart always \
  -p 127.0.0.1:6969:6969 \
  -v slopify-data:/data \
  ghcr.io/gentbajko/slopify:latest
```

Open `http://127.0.0.1:6969`. Keep the `127.0.0.1` binding: Slopify has no
login, and anyone who can reach its port can control it. FFmpeg is already installed
in the image; starting the container does not need a separate download or install command.
The container does not run npm updates from the UI. Pull a new image, remove the
old container, and run the command again with the same volume to update it.

The image does **not** bundle Codex, Claude Code, or Gemini CLI. Plain `docker run`
cannot see host installations. The `--docker` launcher includes the bridge; from
a source checkout, the same launcher is also available as:

```sh
bash packages/app/scripts/docker-run.sh
```

It resolves the host Codex and Gemini npm packages and the native Claude binary,
mounts those installations and Codex's model catalogue read-only, and gives the container its own
persistent CLI home in `slopify-data`. Install the CLIs on the host first, then
recreate the container after installing or upgrading one; the mounts refer to
the resolved installation paths. macOS or Windows executables cannot run inside
this Linux image. API-key providers work without the helper.

The host's CLI login files are **not** mounted. Sign in to Codex and Claude
once inside the container; those credentials stay in the named volume across
restarts:

```sh
docker exec -it slopify codex login --device-auth
docker exec -it slopify claude auth login
```

Follow each CLI's prompts. Codex device-code login must be enabled for your
ChatGPT account or workspace. For Gemini CLI in a headless container, set
`GEMINI_API_KEY` in your host shell before running the helper; the helper
passes it to Docker without placing the key on the command line. Docker
retains it in the container configuration, so supply it again when recreating
the container. Only run the login command for CLIs you mounted.
Treat `slopify-data` as sensitive: it contains your provider keys and CLI
credentials. To update a CLI, update it on the host, then recreate the container
with the helper; Slopify will keep its data and login state in the same volume.

## How to use it

1. Run the command and open the tab it prints.
2. Settings holds your provider API keys and your voices. They live in
   `~/.slopify/slopify.db` and go to the provider you picked, nowhere else.
3. Prompts is where the article, image and thumbnail prompts are written once, with
   `{{keywords}}` where the subject goes.
4. Play keeps an autosaved setup across Content, Outputs, Style and Review. Pick the
   prompts, fill in the keywords, choose a voice and format, review the estimated cost,
   then Start. Any optional stage you would rather do yourself can be skipped or supplied.
5. The project workspace shows total progress and lets you inspect one stage at a time,
   read writing as it arrives, and listen to streamed narration. Download the article,
   audio, images or final export. Pause unfinished work to change providers.
6. Subtitles can use a bundled, system or uploaded font. Preview size and one of five
   positions in the selected landscape or portrait frame before saving.
7. Edit a completed or paused project without losing its history. Save creates a retained
   revision; Slopify shows exactly which outputs are affected and rebuilds only when you ask.
8. Save a Play setup or project revision as a template. Apply it to make a fresh editable
   draft, or schedule one-off, daily or weekly runs with keyword variants and a spend ceiling.
9. Add review checkpoints before Audio, Images or Video when you want to inspect upstream
   work first. Independent stages continue while the selected step and its dependents wait.
10. The floating update button checks for new releases and installs an update when you
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
| `--no-open` | `SLOPIFY_NO_OPEN` | the browser opens | Keeps the browser shut. As a variable, any value other than empty, `0` or `false` counts as set. |
| no flag | `SLOPIFY_FFMPEG` | the bundled binary | Path to an ffmpeg to render with. |

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
licence text ships with them as `OFL.txt`.
