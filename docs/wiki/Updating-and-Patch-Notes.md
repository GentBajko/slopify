# Updating and Patch Notes

Slopify checks for new versions by itself and updates with one click or one command. An update waits for running work, keeps a copy to go back to, and puts the previous version back if the new one doesn't start. After an update, the new version's patch notes open once.

**Where to find it:** the circular-arrows button at the top of every page. Patch notes are in Settings → **Patch notes**; Settings → **About** has **What's new in this version**.

## The updates button

The circular-arrows button in the top bar shows the update state. Hover it (or read it with a screen reader) to see `Your version: … · Newest: …` and what a click does.

| What you see | Meaning | Click does |
| --- | --- | --- |
| No dot | You have the newest version, as of the last check. | Checks again now. |
| A dot on the button | An update is ready. | Downloads and installs it. |
| Spinning | Checking, or updating. | Nothing; wait. |
| Label says **Update to X will install when 'Title' finishes.** | The update is waiting for running work. | Cancels the waiting update. |
| Amber | The last check or update had a problem. The label says what. | Checks again. |

Slopify checks every 15 minutes and whenever you come back to the tab.

## Update from the app

1. Click the circular-arrows button when it shows a dot.
2. If a video is being made, the update waits. A message says **Update to X will install when 'Title' finishes.** Click the button again to cancel the waiting update; nothing has changed yet.
3. When nothing is running, Slopify installs the new version, stops, and starts the new one.
4. The page reconnects by itself. If another open tab was loaded before the update, it shows **Slopify was updated** with **Reload**.

## Update from the terminal

Run:

```sh
npx @gentbajko/slopify@latest update
```

It asks the running Slopify to update itself, exactly as the button does, and follows it until it is done:

- `Slopify X is already the newest version.` when there is nothing to do.
- `Slopify is generating right now. Waiting for running work to finish before updating (press Ctrl+C to cancel; nothing has been changed yet)...` while work runs.
- `Updating Slopify X to Y...` then `Slopify Y is running at http://127.0.0.1:6969`.

Slopify has to be running for this. If it isn't, the command says so: start it and run `update` again, adding `--port <number>` if it runs on another port. To just start the newest version, run `npx @gentbajko/slopify@latest`.

If you have a Docker install on your account, the same command updates that instead. See [Docker](Docker#update-the-docker-install).

## What an update does

For a normal (non-Docker) install:

1. **Waits** until no stage or edit is running.
2. **Installs** the new version with npm into `<data folder>/updates/<version>`. If this fails, the running Slopify is left alone.
3. **Backs up the database** to `<data folder>/updates/before-<version>-….db`.
4. **Starts the new version** and waits up to 60 seconds for it to answer.
5. **On success**, removes old update files. It keeps the new version, the previous version and the latest database backup.
6. **If the new version doesn't start**, it stops it, copies the database back from the backup and restarts the previous version. The reason is written to `logs/updates.log` in the data folder.

Later starts of Slopify, including an older `npx` or a global `slopify` command, hand over to the newest version installed in the data folder. That is how an in-app update sticks for both npx and npm installs.

For Docker, the installer does the update from the host with a recovery copy of the whole data volume. See [Docker](Docker#update-the-docker-install).

## When the button can't update

The button's label says why:

| Message | What to do |
| --- | --- |
| Slopify in Docker is updated from the terminal: `npx @gentbajko/slopify@latest update`. | Run that on the computer running Docker. |
| Run Slopify from its installed package to use in-app updates. | You are running from source or a copy without its package files. Start it with `npx @gentbajko/slopify@latest`. |
| npm was not found, so in-app updates are off. | Install Node.js with npm from nodejs.org, or update from the terminal with `npx @gentbajko/slopify@latest`. |
| An update is already in progress. | Wait for it to finish. |
| An update is already waiting for running work to finish. | Wait, or click the button to cancel it. |

If an update didn't finish, Slopify keeps or puts back the previous version. `logs/updates.log` in the data folder says why.

## After an update

### Patch notes open once

After an update, the new version's notes open by themselves once, in a drawer titled **What's new in X**:

- **See all patch notes** opens Settings → **Patch notes**.
- **Close notes** (or the close button) records them as seen. They don't open again for that version.

They open only for a version that has notes of its own, and never on a fresh install. They wait for other windows first: the usage stats notice, the tutorial and the What's new tour.

### What's new tour on a major update

After an update to a new major version (for example 2.x to 3.0), the first launch opens a short **What's new in 3.0** tour instead: a drawer on the right with one step per feature and an **Open …** button to its screen. The drawer doesn't block the page, so you can follow a link while it stays open.

- **Back** and **Next** move between steps; **Finish tour** on the last one.
- **Close tour**, the close button or `Esc` record it as seen. It doesn't come back until the next major version.
- The last step has **Read the full patch notes**.
- Closing the tour also counts as having seen that version's patch notes.

The 3.0 tour covers Home, Play's one path, Automatic reviews, Channels and cast, The calendar, What a run cost, YouTube Studio prep, Multiple voices and Other languages. A fresh install never sees it.

## Read the patch notes

1. Open Settings → **Patch notes**, or press `Ctrl+K` and choose **Show patch notes**.
2. The newest notes are open, with contents, search and copy.
3. Older versions are folded under **Earlier versions**. Press **Read** on one to open it. Your browser's Back button returns to the one before.

The notes ship with the app, so they work offline.

To open the notes for the version you are running, go to Settings → **About** and press **What's new in this version**. When this version has no notes of its own, it opens the newest ones.

## Tips

- Keep Slopify running overnight? Updates wait for running work, so you can press the button at any time and it installs when the current video is done.
- Settings → **About** has the same explanation of the updates button, and links to GitHub, Patreon and Buy Me a Coffee.
- Updating doesn't touch your projects folder. For extra safety before a big update, use **Export everything** or turn on [Backups](Backups).

## Related pages

- [Install](Install)
- [Docker](Docker)
- [Start at Login](Start-at-Login)
- [Backups](Backups)
- [Troubleshooting](Troubleshooting)
- [Settings Reference](Settings-Reference)
