# The site's walkthrough recording

The video on slopify.stream (`packages/site/public/assets/play-run.mp4`, its poster and
`play-run.vtt`) is recorded by a script, so it can be made again whenever the screens change.

## Record it

```sh
npm run build                                   # the app and web build the recording runs
npx playwright install chromium                 # once, if Playwright has no browser yet
npm run record:walkthrough -w @slopify/site -- --out /tmp/walkthrough
```

Look at `/tmp/walkthrough/play-run.mp4`. When it is right, publish it over the site's copy:

```sh
npm run record:walkthrough -w @slopify/site -- --publish
```

Then check the showcase description in `packages/site/public/index.html` still says what the
video shows: it is written from the step captions.

Options:

- `--out <dir>`: where `play-run.mp4`, `play-run-poster.jpg` and `play-run.vtt` go. Without it
  they go to a temp folder, printed at the end.
- `--publish`: also copy the three files over `packages/site/public/assets/play-run.*`.
- `--keep`: keep the temp data directory and the raw recording.

## What it does

1. Starts this checkout's built Slopify natively (`packages/app/dist/edge/cli.js`) on a random
   loopback port against a new temp data directory, with a temp `HOME`, updates off and the
   telemetry collector pointed at a closed local port, so the recording neither signs in to a
   CLI nor adds to the public counters. It never touches Docker or `~/Slopify`, and no
   provider is called.
2. Puts in place what the steps show through the app's API (see below), answers the one-time
   usage-stats notice off camera, then records a 1920x1080 browser session walking the steps.
3. Cuts the recording down to the kept part of each step (page loads are cut away), fades
   between them, and encodes H.264 with `+faststart`, no audio. The captions file has one cue
   per step; the poster is a frame of the finished project.

## Changing the steps

Every step is in one list, `packages/site/scripts/walkthrough/steps.mjs`: its caption, how long
it holds, and what it does. Steps find things by role, label and visible text, so a redesign
that keeps the words keeps the recording working. A step marked `optional` is left out of the
cut when its screen is missing; `--publish` then refuses to copy the files, because the
published `play-run.vtt` must have one cue per step, in order. `packages/site/walkthrough.test.js`
checks that, so changing a step's caption, or adding or dropping a step, fails the tests until
the video is recorded again.

Everything on screen is what Slopify ships with; no project or prompt of your own is used.
`scripts/walkthrough/seed-app.mjs` adds it through the app's API before recording: the
bundled samples (the Library of Alexandria, the audiobook and the podcast, restored if the
first launch did not bring them), the History starter pack's prompts and template, a name and
series brief for the default channel, and a weekly schedule from the pack's template with six
queued topics whose first run is hours away and whose topic generation is off.

Never add a step that starts a run, tests a key or signs in to a CLI: the recording must cost
nothing.

## Known limits

- The recording has no API keys, so Play's image provider stays unpicked and its estimate
  is not shown; the Claude Code CLI is picked as the text model when this machine has it.
- The samples were made by the sample builder, so Run cost prices only their narration and
  lists the rest as unknown.
