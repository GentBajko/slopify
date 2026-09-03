# Slopify

A prompt and a few keywords in. A narrated slideshow video out. Your keys, your machine, free.

```sh
npx @gentbajko/slopify@latest
```

That opens a browser at `http://127.0.0.1:4242`. Nothing to configure first; add
provider keys on the Settings screen when you want a stage to generate rather than
take what you paste in.

Six stages run as a graph: research, article, narration, images, thumbnail, video.
Generate any of them, or provide the output yourself and that stage is skipped. The
video is a slideshow with alternating zoom over the narration, rendered with ffmpeg.

## Options

| Flag | Environment variable | Default |
|---|---|---|
| `--port` | `SLOPIFY_PORT` | `4242` |
| `--host` | `SLOPIFY_HOST` | `127.0.0.1` |
| `--data-dir` | `SLOPIFY_DATA_DIR` | `~/.slopify` |
| `--no-open` | `SLOPIFY_NO_OPEN` | the browser opens |
| — | `SLOPIFY_FFMPEG` | the bundled binary |

There is no login. Binding to anything but `127.0.0.1` hands the app and every key in
it to whoever reaches the port, and the CLI says so on startup.

Everything lives in one SQLite file and one directory tree under the data directory:
`slopify.db`, `projects/`, `staging/`, `logs/`. Delete it and nothing of yours remains.

## ffmpeg and the GPL

Slopify renders video with ffmpeg. The `ffmpeg-static` dependency downloads a
prebuilt binary to `node_modules/ffmpeg-static/` at install time.

That binary is a separate program, run as a child process with an argument array. It
is licensed under the **GPL-3.0-or-later**. Slopify does not link against it, does not
embed it, and does not distribute it inside this package; its licence text and the
location of its corresponding source ship beside it in `ffmpeg-static`. Slopify's own
code is MIT and stays MIT. Anyone redistributing the downloaded binary takes on the
GPL's obligations for it, including offering that corresponding source.

Point `SLOPIFY_FFMPEG` at your own build to use that instead.

## Telemetry

Slopify sends anonymous counters to a collector: installs, projects created, stages
completed, images and videos made, audio seconds, provider and model names, token
counts, and the time each of those happened. Every event carries a random id of its
own and this machine's random id, and nothing else.

Never your keys, prompts, keywords, titles, article text, filenames, or anything about
your machine. A notice says all of this the first time you run it, before the machine
id exists, and the Usage screen shows you your own numbers at any time.

## Licence

MIT. The ffmpeg binary fetched at install time is a separate GPL-3.0-or-later program,
as described above.

Source, issues and the full guide: <https://github.com/GentBajko/slopify>
