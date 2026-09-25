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

A prompt and a few keywords in. A narrated slideshow video out. Your keys, your machine, free.

*Start contributing to the internet's enshittification today!*

```sh
npx @gentbajko/slopify@latest
```

That opens a browser at `http://127.0.0.1:6969`. Node 26 or newer is required.

For a persistent install that makes `slopify` available everywhere:

```sh
npm install -g @gentbajko/slopify
slopify
```

Both commands launch the same local app.

For Docker on Linux with Node 26+ and util-linux (`flock`), use `slopify --docker` or
`npx @gentbajko/slopify@latest --docker`. The launcher detects installed Codex,
Claude Code and Gemini CLIs. It asks once before installing a private host helper
and enabling automatic startup, including user lingering. The CLIs run on your
host with their existing logins; credentials never move into Docker.

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
is activated. Current and historical output actions show the real host folder
on the machine running Slopify; downloads remain available. This also works with
`--host-cli=off`, without installing a host helper. Docker does not open a desktop
window on your browser's machine.

Rerun the launcher after changing host CLI installations or search paths.
Plain `docker run` is API-only unless connected to an already configured helper.
It does not set up a host project folder or install host services; its files stay
in the private named volume. Use the managed launcher for automatic migration
and host-folder access. Use `--host-cli=off` for API-only launcher setup, or
`--accept-host-cli` to approve non-interactive setup.
See the [Docker setup guide](https://github.com/GentBajko/slopify#docker) for
updates and the dedicated helper's status/disable commands.

## How to use it

1. Add provider keys and voices in Settings. They stay in your local Slopify database.
2. Write reusable article, image and thumbnail prompts in Prompts, using `{{keywords}}`
   where each video's subject belongs.
3. In Play, build an autosaved setup across Content, Outputs, Style and Review. Supply
   or skip optional stages, preview subtitles, and inspect the estimated cost before Start.
4. Follow total and per-stage progress in the project workspace. Pause unfinished work
   to change providers, add review checkpoints, or edit a paused or completed project as
   a retained revision. Saving does not rebuild until you explicitly ask.
5. Save Play setups or project revisions as templates. Apply one to a fresh draft or
   schedule one-off, daily or weekly jobs with keyword variants and a spend ceiling.

The article is the only required output. Slopify can make a narrated or silent slideshow,
an audio-only WAV, locally timed English subtitles, or just the intermediate results you
select. Uploaded and already completed outputs are reused when their inputs still match.

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

| Flag | Environment variable | Default |
|---|---|---|
| `--port` | `SLOPIFY_PORT` | `6969` |
| `--host` | `SLOPIFY_HOST` | `127.0.0.1` |
| `--data-dir` | `SLOPIFY_DATA_DIR` | `~/.slopify` |
| `--projects-dir` (Docker only) | `SLOPIFY_DOCKER_PROJECTS_DIR` | remembered path; otherwise `~/Slopify/Projects` (custom names: `~/Slopify/<container>/Projects`) |
| `--no-open` | `SLOPIFY_NO_OPEN` | the browser opens |
| `--docker` | — | run locally; with the flag, launch Docker with host CLI detection |
| — | `SLOPIFY_FFMPEG` | the bundled binary |

There is no login. Binding to anything but `127.0.0.1` hands the app and every key in
it to whoever reaches the port, and the CLI says so on startup.

Native installations keep `slopify.db`, `projects/`, `staging/` and `logs/` under
their configured data directory. Managed Docker places only projects in its
remembered host folder; keep both that folder and the named private volume when
backing up an installation. The portable settings archive is not a project/history backup.

## ffmpeg and the GPL

No separate FFmpeg installation is required. The `ffmpeg-static` dependency downloads
a prebuilt binary to `node_modules/ffmpeg-static/` at install time. Docker includes
the checked binary, licence and source notice in the image, ready on first launch.

Slopify checks that ffmpeg runs before starting. If the install-time download is
missing, it downloads the same platform build into `<data-dir>/bin/`, keeping the
licence and source notice beside it. Later launches reuse that copy. If recovery
fails, check your connection and antivirus quarantine, or choose your own executable.

That binary is a separate program, run as a child process with an argument array. It
is licensed under the **GPL-3.0-or-later**. Slopify does not link against it, does not
embed it, and does not distribute it inside this package; its licence text and the
location of its corresponding source ship beside it in `ffmpeg-static`. Slopify's own
code is MIT and stays MIT. Anyone redistributing the downloaded binary takes on the
GPL's obligations for it, including offering that corresponding source.

Point `SLOPIFY_FFMPEG` at your own build to use that instead.

In Windows PowerShell:

```powershell
$env:SLOPIFY_FFMPEG = 'C:\tools\ffmpeg\bin\ffmpeg.exe'
npx @gentbajko/slopify@latest
```

## Telemetry

Slopify sends anonymous counters to a collector: installs, projects created, stages
completed, images and videos made, audio seconds, provider and model names, token
counts, and the time each of those happened. Every event carries a random id of its
own and this machine's random id, and nothing else.

Never your keys, prompts, keywords, titles, article text, filenames, or anything about
your machine. A notice says all of this the first time you run it, before the machine
id exists, and the Usage screen shows you your own numbers at any time.

## Supporting the project

Slopify is free and always will be. If it is worth something to you, there is
[Patreon](https://www.patreon.com/cw/GentBajko) and
[Buy Me a Coffee](https://buymeacoffee.com/gentbajko). The people who do are listed
in [SUPPORTERS.md](https://github.com/GentBajko/slopify/blob/main/SUPPORTERS.md).

## Licence

MIT. The ffmpeg binary fetched at install time is a separate GPL-3.0-or-later program,
as described above.

Source, issues and the full guide: <https://github.com/GentBajko/slopify>
