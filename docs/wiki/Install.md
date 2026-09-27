# Install

Slopify is a local web app you start from a terminal. It runs on your own computer, opens in your browser at `http://127.0.0.1:6969`, and uses your own provider keys or the AI command-line tools you are already signed in to.

**Where to find it:** a terminal on your computer (PowerShell or Windows Terminal on Windows, Terminal on macOS, any shell on Linux).

## What you need

| Requirement | Details |
| --- | --- |
| Node.js | Version 26 or newer, with npm (it comes with Node). Get it from nodejs.org. |
| Operating system | Windows, macOS or Linux for the normal install. The managed Docker install is Linux only (see [Docker](Docker)). |
| ffmpeg | Nothing to install: Slopify brings its own copy. See [ffmpeg](#ffmpeg) below. |
| Disk space | Enough for your videos. Every project keeps its video, images, narration and working files. The caption model is a 95 MB download. |
| Keys or CLIs | At least a voice provider key to narrate (command-line tools can't speak). Text and images can come from Claude Code, Codex or Gemini CLI, or from API keys. See [Providers and Keys](Providers-and-Keys) and [AI CLIs](AI-CLIs). |

## Choose how to run it

There are three ways. All three give you the same app.

| Way | Command | Good for |
| --- | --- | --- |
| Run with npx | `npx @gentbajko/slopify@latest` | Trying it, or always starting the newest version. Nothing is installed globally. |
| Install with npm | `npm install -g @gentbajko/slopify`, then `slopify` | A permanent `slopify` command. |
| Docker (Linux) | `npx @gentbajko/slopify@latest --docker` | Keeping Slopify running in the background, restarting with Docker. See [Docker](Docker). |

## Start Slopify with npx

1. Open a terminal.
2. Run `npx @gentbajko/slopify@latest`.
3. Wait while npm downloads the package the first time. Slopify then checks ffmpeg, starts, and prints where everything is:
   - `Slopify is running at http://127.0.0.1:6969`
   - `Slopify data directory:` the hidden data folder (normally `~/.slopify`)
   - `Projects:` where your project folders are (on a new install, `Documents/Slopify/Projects`)
   - `Database:` and `Logs:` inside the data folder
4. Your browser opens at `http://127.0.0.1:6969`. If it doesn't, open that address yourself.
5. On an interactive terminal Slopify asks once: `Start Slopify when you log in? (Y/n)`. Press Enter for yes, or type `n`. See [Start at Login](Start-at-Login).
6. Keep the terminal open while you use Slopify. Press `Ctrl+C` in it to stop Slopify.

Continue with [First Launch and Welcome](First-Launch-and-Welcome).

## Install it with npm

1. Run `npm install -g @gentbajko/slopify`.
2. Start it any time with `slopify`. The same flags work: `slopify --port 7070`.

In-app updates work for both npx and a global install: the new version is installed inside the data folder and later starts take it from there. See [Updating and Patch Notes](Updating-and-Patch-Notes).

## Commands

| Command | What it does |
| --- | --- |
| `npx @gentbajko/slopify@latest` | Starts Slopify. |
| `npx @gentbajko/slopify@latest update` | Updates a running Slopify to the newest version, the same way the in-app update button does. If you have a Docker install, it updates that one instead. |
| `npx @gentbajko/slopify@latest --docker` | Installs Slopify in Docker, or re-applies changed Docker settings. Same as `install --docker`. |
| `npx @gentbajko/slopify@latest update --docker` | Updates the Docker install. |

Any other word after the package name is refused with a message listing these commands. Without `--docker` there is nothing to install: `install` on its own is refused.

`update` for a normal install needs Slopify to be running. If it isn't, the command says so: start Slopify first, and add `--port <number>` if it runs on another port.

## Options

A flag beats the environment variable, and the variable beats the default.

| Flag | Variable | Default | What it does |
| --- | --- | --- | --- |
| `--port` | `SLOPIFY_PORT` | `6969` | The port Slopify listens on. A whole number from 1 to 65535. |
| `--host` | `SLOPIFY_HOST` | `127.0.0.1` | The address it binds to. |
| `--data-dir` | `SLOPIFY_DATA_DIR` | `~/.slopify` | Where the database, settings, keys, logs and caption models live. A relative path is taken from the folder you run the command in. |
| `--no-open` | `SLOPIFY_NO_OPEN` | opens a browser | Doesn't open a browser tab. For the variable, any value except empty, `0` or `false` counts as on. |
| `--autostart` / `--no-autostart` | | asks once | Turns [Start at Login](Start-at-Login) on or off without asking. Useful in scripts. |
| | `SLOPIFY_FFMPEG` | the bundled ffmpeg | The full path of another ffmpeg to use. |
| | `SLOPIFY_NO_MODEL_PREFETCH` | downloads at start | Set to `1` to skip fetching the 95 MB caption model when Slopify starts. It is then fetched the first time a video needs captions. |

Options that only work with `--docker`: `--projects-dir <folder>`, `--host-cli=off` and `--accept-host-cli`. See [Docker](Docker). With `--docker`, `--host` and `--data-dir` are refused, because the Docker version always listens on localhost and keeps its data in a Docker volume.

### A second install or a test install

Start Slopify with its own data folder, for example `npx @gentbajko/slopify@latest --data-dir ~/slopify-test --port 7070`. A new install with its own data folder keeps its project files inside that folder instead of in `Documents/Slopify`, so it never shares files with your main install. See [Where Your Files Live](Where-Your-Files-Live).

Only one Slopify can use a data folder at a time. A second one on the same folder stops with `Slopify is already running on this data directory`.

## Keep it on 127.0.0.1

Slopify has no login. Whoever can reach its port controls the app and every provider key saved in it. The default `127.0.0.1` means only your own computer can reach it.

If you start it with another `--host`, the terminal prints a warning: `WARNING: bound to <host> - anyone who reaches this port controls the app and its keys (no login).` Only do that on a network you trust completely.

## ffmpeg

Slopify makes its videos with ffmpeg, and you don't need to install it.

- A normal install gets a tested ffmpeg for your system through npm when the package is installed. Slopify never uses an ffmpeg from your `PATH` on its own.
- Before starting, Slopify checks that ffmpeg runs. If the install-time download is missing, it downloads the same build into `<data folder>/bin/`, with its licence and source notice, and reuses it on later starts.
- The Docker image already contains ffmpeg.

To use your own ffmpeg, set `SLOPIFY_FFMPEG` to its full path:

```sh
SLOPIFY_FFMPEG=/usr/bin/ffmpeg npx @gentbajko/slopify@latest
```

In Windows PowerShell:

```powershell
$env:SLOPIFY_FFMPEG = 'C:\tools\ffmpeg\bin\ffmpeg.exe'
npx @gentbajko/slopify@latest
```

The bundled ffmpeg is a separate program under the GPL-3.0-or-later licence. Slopify runs it as a separate process and does not link to it.

## The caption model

Captions are timed against the narration by a speech model that runs on your computer, at no cost. The English model (95 MB) is downloaded when Slopify starts, in the background, so a run never waits for it later. It is kept in `<data folder>/models/`. Set `SLOPIFY_NO_MODEL_PREFETCH=1` to skip the download at start. Other languages use a separate model that is downloaded the first time a project in that language needs it.

## Anonymous usage stats

The first time you open Slopify it shows **Anonymous usage stats**, a notice listing exactly what is counted, with one button, **Got it**. These counts feed the live totals on slopify.stream.

| Tracked | Never tracked |
| --- | --- |
| Tokens in and out per stage, with provider and model | API keys |
| Audio seconds, images, thumbnails, videos rendered | Prompt bodies and keyword values |
| PDF documents, YouTube descriptions and shorts made | Titles, article or research text |
| Projects created, and that this machine installed Slopify | Files and file names |
| The time each of those happened | OS, locale, hardware |

Each report carries a random id of its own, a random id for this machine and the Slopify version. There is no setting to turn it off. Settings → **Usage** shows the same counters for your machine only.

## If it doesn't start

| Message | What to do |
| --- | --- |
| `Port 6969 is already in use by another program (maybe another Slopify)` | Stop the other program, or start on another port: `npx @gentbajko/slopify --port 7070`. |
| `Slopify is not allowed to use port …` | Pick a port above 1024 with `--port`. |
| `Slopify can't listen on … because that address doesn't belong to this machine` | Leave out `--host` and `SLOPIFY_HOST`. |
| `Slopify can't write to its data folder …` | Make sure your user owns that folder, or choose another with `--data-dir <folder>`. |
| `The disk is full` | Free some space and start again. |
| `Slopify could not download and start ffmpeg` | Check your connection and whether antivirus quarantined it, or set `SLOPIFY_FFMPEG`. |
| `Slopify is already running on this data directory` | Use the Slopify that is already running, or close it first. If none is running, delete the lock file the message names. |

More in [Troubleshooting](Troubleshooting).

## Related pages

- [Docker](Docker)
- [First Launch and Welcome](First-Launch-and-Welcome)
- [Where Your Files Live](Where-Your-Files-Live)
- [Start at Login](Start-at-Login)
- [Updating and Patch Notes](Updating-and-Patch-Notes)
- [Providers and Keys](Providers-and-Keys)
- [AI CLIs](AI-CLIs)
- [Troubleshooting](Troubleshooting)
