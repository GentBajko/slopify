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

## Licence

MIT. See [LICENSE](./LICENSE).
