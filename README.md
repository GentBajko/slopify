# Slopify

Slopify turns a prompt into a finished video: it researches a topic, writes the
article, narrates it, generates the imagery, and cuts the result together. It
runs entirely on your own machine, against your own provider keys, behind a
local web UI.

```sh
npx slopify@latest
```

The app serves its UI on `http://127.0.0.1:4242` and opens a browser at it.
Nothing is uploaded anywhere you did not configure.

## Status

Under construction. The scaffold is in place; the pipeline is not. Nothing here
is usable yet.

## Working on it

Requires Node 26 or newer (the CI pin is still 24 until Node 26 reaches GA).

```sh
npm install
git config core.hooksPath .githooks   # once per clone, wires the pre-commit hook
npm run lint
npm run typecheck
npm test
```

`core.hooksPath` is local repository configuration and cannot be committed, so a
fresh clone has to set it by hand or the pre-commit check will not run.

## Video rendering

The video is cut with ffmpeg. Slopify installs one through
[`ffmpeg-static`](https://www.npmjs.com/package/ffmpeg-static), which fetches a
platform binary at `npm install` time, and never falls back to an ffmpeg on your
`PATH` — the binary that ships is the binary that is tested. To use a different
build, point `SLOPIFY_FFMPEG` at it:

```sh
SLOPIFY_FFMPEG=/usr/bin/ffmpeg npx slopify@latest
```

That binary is a separate program Slopify runs as a child process. It is not
linked into this code and is not distributed inside this package. It is licensed
under the GPL-3.0-or-later, and its source and licence text ship beside it in
`node_modules/ffmpeg-static/`.

## Licence

MIT. See [LICENSE](./LICENSE).
