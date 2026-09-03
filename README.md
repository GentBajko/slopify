# Slopify

Slopify turns a prompt and a handful of keywords into a narrated slideshow video.
It researches the topic, writes the article, narrates it, generates the imagery and
cuts the result together with ffmpeg. Everything runs on your machine against your
own provider keys, behind a local web UI.

```sh
npx @gentbajko/slopify@latest
```

The app serves its UI on `http://127.0.0.1:4242` and opens a browser at it. Node 26
or newer, nothing else to install.

## How to use it

1. Run the command and open the tab it prints.
2. Settings holds your provider API keys and your voices. They live in
   `~/.slopify/slopify.db` and go to the provider you picked, nowhere else.
3. Prompts is where the article, image and thumbnail prompts are written once, with
   `{{keywords}}` where the subject goes.
4. Play is the cue sheet: pick the prompts, fill in the keywords, choose a voice and
   a format, press the key. Any stage you would rather do yourself, you upload
   instead, and that stage is skipped.
5. The project page shows the six stages as they run and holds the results: the
   article, the narration, every image, the thumbnail and the mp4, each one
   downloadable on its own or as a zip.

## Options

Every option is a flag or an environment variable of the same name. A flag beats the
variable, the variable beats the default.

| Flag | Variable | Default | Does |
|---|---|---|---|
| `--port` | `SLOPIFY_PORT` | `4242` | The port the app listens on. An integer from 1 to 65535; anything else refuses to start. |
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

The video is cut by ffmpeg. Slopify installs one through
[`ffmpeg-static`](https://www.npmjs.com/package/ffmpeg-static), which fetches a
platform binary at `npm install` time, and never falls back to an ffmpeg on your
`PATH`: the binary that ships is the binary that is tested. Point `SLOPIFY_FFMPEG` at
another build to override it.

```sh
SLOPIFY_FFMPEG=/usr/bin/ffmpeg npx @gentbajko/slopify@latest
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
on a `v*` tag and signs a provenance attestation with the workflow's own OIDC identity,
which a publish from a laptop cannot do. Releasing is `npm version`, a commit, a tag and
a push.

The database id is the one value that cannot be committed ahead of time: it is
generated by `d1 create` and is specific to one Cloudflare account. Everything else in
both configuration files is final.

## Licence

MIT. See [LICENSE](./LICENSE). The ffmpeg binary fetched at install time is a separate
GPL-3.0-or-later program, as described above. The bundled Barlow and Barlow Condensed
faces under `packages/site/public/assets/fonts/` are SIL Open Font License 1.1; the
licence text ships with them as `OFL.txt`.
