<p align="center">
  <a href="https://slopify.stream"><img src="packages/site/public/assets/favicon.svg" alt="Slopify" width="120"></a>
</p>

<h1 align="center">Slopify</h1>

<p align="center">
  <strong>AI Slop, on demand.</strong><br>
  A prompt and a few keywords in. A narrated video out.<br>
  Your keys, your machine, free.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@gentbajko/slopify"><img
    src="https://img.shields.io/npm/v/@gentbajko/slopify?style=flat-square&color=9BCB4F&label=npm"
    alt="npm version"></a>
  <img src="https://img.shields.io/badge/node-26%2B-444C56?style=flat-square" alt="Node 26 or newer">
  <a href="docs/docker.md"><img
    src="https://img.shields.io/badge/docker-ghcr.io-444C56?style=flat-square"
    alt="Docker image on GitHub Container Registry"></a>
  <img src="https://img.shields.io/badge/runs-locally-444C56?style=flat-square" alt="Runs locally">
  <a href="LICENSE"><img
    src="https://img.shields.io/badge/license-MIT-1F2328?style=flat-square"
    alt="MIT licensed"></a>
</p>

<p align="center">
  <a href="https://www.patreon.com/cw/GentBajko"><img
    src="https://img.shields.io/badge/Patreon-support-F96854?style=for-the-badge&logo=patreon&logoColor=white"
    alt="Support Slopify on Patreon"></a>
  <a href="https://buymeacoffee.com/gentbajko"><img
    src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-support-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=000000"
    alt="Buy Gent a coffee"></a>
</p>

<p align="center">
  Slopify writes the article, narrates it, makes the images and cuts a captioned video,
  plus a PDF and a ready-to-paste YouTube description. It all runs in a local web app
  with your own provider keys or the AI CLIs you already use.
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#features">Features</a> ·
  <a href="#docker">Docker</a> ·
  <a href="#options">Options</a> ·
  <a href="docs/development.md">Development</a>
</p>

## Install

Needs [Node 26](https://nodejs.org) or newer.

```sh
npx @gentbajko/slopify@latest          # run it, nothing to install
npm install -g @gentbajko/slopify      # or install it, then run: slopify
npx @gentbajko/slopify@latest --docker # or keep it running in Docker (Linux)
```

It opens at `http://127.0.0.1:6969`. Update by running the same command with `@latest`.

## How it works

1. **Settings:** add your provider keys and voices, or use the Claude Code, Codex or Gemini CLI you're signed in to.
2. **Library → Prompts:** write article, image and thumbnail prompts once, with `{{keywords}}` where the subject goes.
3. **Play:** pick the prompts, fill in the keywords, choose your outputs, review, press **Start run**.
4. **The project page** shows each stage as it runs. Download the video, captions, PDF and description when it's done.
5. **Edit a finished project** to change anything; Slopify rebuilds only what the change affects.

## Features

- **Articles** from your AI model, with optional web research
- **Narration** with ElevenLabs, OpenAI, Cartesia or [Inworld](docs/inworld.md)
- **Images and thumbnails** from OpenAI, Google, fal.ai, Replicate or Codex
- **Videos** with moving images (zoom, pan or both), free local captions and silence padding
- **PDF documents** of the article, with contents, sources and a cover
- **YouTube descriptions** with chapter timestamps, hashtags and tags
- **Templates, batches and schedules** that work through a list of topics
- **Checkpoints, pause and resume, history** so nothing runs or changes without you

## Docker

```sh
npx @gentbajko/slopify@latest --docker
```

Runs Slopify in the background on Linux, restarting with Docker. Project files go to
`~/Slopify/Projects`; the database and keys stay private in the `slopify-data` volume.
If you use the Claude Code, Codex or Gemini CLI, it asks once to set up a small helper so
they run on your machine with your existing logins. Full details, including plain
`docker run`, in the [Docker guide](docs/docker.md).

## Options

| Flag | Variable | Default | Does |
|---|---|---|---|
| `--port` | `SLOPIFY_PORT` | `6969` | The port it listens on |
| `--host` | `SLOPIFY_HOST` | `127.0.0.1` | The address it binds to |
| `--data-dir` | `SLOPIFY_DATA_DIR` | `~/.slopify` | Where the database, projects and logs live |
| `--no-open` | `SLOPIFY_NO_OPEN` | opens a browser | Keeps the browser shut |
| | `SLOPIFY_FFMPEG` | bundled | Use another [ffmpeg](docs/ffmpeg.md) |
| | `SLOPIFY_NO_MODEL_PREFETCH` | downloads at start | Skip fetching the 95 MB caption model at start |

A flag beats the variable. There is no login: keep it on `127.0.0.1`, because whoever
reaches the port controls the app and its keys.

## Telemetry

Slopify sends anonymous counts (installs, projects, stages, images, videos, PDFs, YouTube
descriptions, audio seconds and token totals) to show the totals on
[slopify.stream](https://slopify.stream). Never your keys, prompts, keywords, titles,
text, files or anything about your machine beyond a random id.

## Licence

MIT, see [LICENSE](./LICENSE). The bundled ffmpeg is a separate GPL program
([details](docs/ffmpeg.md)); the Barlow and Cinzel fonts are SIL Open Font License 1.1.
Supporters are listed in [SUPPORTERS.md](SUPPORTERS.md).
