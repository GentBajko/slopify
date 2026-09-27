# Backups

A backup is one `.tar` file with everything you made in Slopify: every project with its files and history, your library, templates, schedules, channels and settings. Make one by hand at any time with **Export everything**, or let Slopify write one every day. Bring one back with **Import a backup**. Provider keys are never included.

**Where to find it:** **Settings → Backup & storage** (Export everything, Import a backup) and **Settings → Backups** (daily backups, Back up now).

## What a backup holds

| Included | Left out on purpose |
|---|---|
| Every project with its files and history, and its channel | Provider keys |
| Automatic review verdicts and run cost of each project | The Notification URL |
| Prompts, intros and outros, with their history | The Studio extension's pairing |
| Document themes and uploaded fonts | The tutorial's progress |
| Templates, schedules and Play drafts | The daily backups' folder and status |
| Channels: brand kit, series brief, episode memory and AI disclosure settings, cast with pictures, end screen images, episode summaries, existing videos, and the last **Keep only titles containing** filter | The telemetry machine id |
| Channel links and the provider defaults a new Play form starts with | State that only matters while this install runs: the queue, plan-limit waits |
| AI use marks: voices marked as a real person, image prompts marked photorealistic, projects with real footage | |
| Settings and usage history | |
| The trash: trashed items come back still in the trash, with their original date | |

After an import you add your provider keys again in [Providers and keys](Providers-and-Keys).

## Export everything (a backup right now, downloaded)

1. Finish or pause any running project. Nothing is copied while a project is being made, because its files are still being written.
2. Open **Settings → Backup & storage**.
3. Press **Export everything**.
4. Your browser downloads `slopify-backup-YYYY-MM-DD.tar`. Progress shows in the browser's downloads. A backup can be many gigabytes.

You can also run **Export everything** from the `Ctrl+K` palette while on Settings.

## Import a backup

Importing adds to this install and replaces nothing.

1. Finish or pause any running project.
2. Open **Settings → Backup & storage**.
3. Press **Import a backup** and choose the `.tar` file made with Export everything or a daily backup. (A `.zip` made with **Export backup** in older versions also works, up to 100 MB.)
4. Wait while it uploads and imports. Slopify says "Backup imported." with what it added.

How an import merges:

- Projects already here are skipped.
- A name that is already taken arrives with "(imported)" after it.
- Schedules arrive paused, so nothing starts by surprise. Resume them on the schedules page.
- Channels merge by id. The default channel "My channel" takes the backup's settings only while this install's default is untouched; otherwise yours is kept. Cast members, pictures, episode memories and existing videos come into the channel that is here. A video title the channel already has is skipped.
- A prompt's history comes with the prompt when the prompt itself came in.
- Pictures stored in the database are checked against their SHA-256 hash on import.

If the import fails, Slopify says: "The backup wasn't imported. Check it is a file made with Export everything (.tar) or Export backup (.zip), then try again."

## Turn on daily backups

Daily backups are off by default, because each backup holds every project's video and can fill a disk.

1. Open **Settings → Backups**.
2. Turn **Back up automatically** on.
3. Set **Time of day**, **Keep last** and optionally **Folder** (see below).
4. Press **Save**.

| Setting | What it does | Default |
|---|---|---|
| **Back up automatically** | Turns the daily backup on or off. **Back up now** works either way. | Off |
| **Time of day** | When the daily backup runs, in this browser's time zone. Pick a time the computer is usually on and idle. | 03:00 |
| **Keep last** | How many of Slopify's own backups stay in the folder. After each new backup, the oldest beyond this number are deleted. | 5 (from 1 to 30) |
| **Folder** | Where backups are written. Empty uses the **Backups** folder beside your projects: `Documents/Slopify/Backups` on a new install. Point it at another disk or a synced folder to keep copies away from this disk. | Empty |

The screen shows the last backup's time and size, the result of the last attempt (with **Why the last backup stopped** when it failed), and when the next one runs.

### When the daily backup runs

- A timer checks once a minute. At most one automatic backup runs per day, once the day's time has passed.
- Turning backups on, or changing the time, waits for the next time of day. Use **Back up now** for one at once.
- If Slopify was off at the time, it backs up about two minutes after it starts, unless a backup already succeeded in the last 20 hours.
- A failed backup is tried again an hour later, until the next day's time.
- A backup waits while projects are being made. It shows "Waiting for … to finish", looks again every ten minutes, and starts by itself once those projects finish or pause.

## Back up now

1. Open **Settings → Backups**.
2. Press **Back up now**. Slopify says "Backup started. Its result shows here when it finishes."

It writes the same file into the backup folder. It says which projects it is waiting for, if any, and is refused while another backup is being written.

## Where the files go and what they are called

- Daily backups are named `slopify-backup-YYYY-MM-DDTHHMMSSZ.tar` (the time is UTC). Export everything downloads are named `slopify-backup-YYYY-MM-DD.tar`.
- Slopify only ever deletes its own daily backup files. An Export everything download, a renamed copy, or anything else in the folder is never touched.
- Installs from before 3.0 keep backups inside the projects folder (`~/Slopify/Projects/Backups` for Docker, `<data dir>/projects/Backups` natively). **Settings → Backup & storage → Your files → Move to Documents/Slopify** takes the backups along. See [Where your files live](Where-Your-Files-Live).
- A folder you choose must be a full path, and may not be inside the projects folder (other than its `Backups` folder) or Slopify's own staging, logs or model folders.
- In [Docker](Docker), a folder outside the projects folder exists only inside the container's private volume; the screen says so. Keep the default to see backups on your computer.

## Safety

- A backup is written under a hidden `.partial` name and renamed only when it is complete, so a crash, a full disk or a stop never leaves a file that looks finished.
- Free space is checked first. A backup that would not fit fails with the sizes.
- Backup files are readable by your user only.
- An update waits for a backup that is being written.
- Every failure is explained on **Settings → Backups** with what to change, for example free space, lower **Keep last**, or pick another **Folder**.

## Other storage tools on Backup & storage

- **Clean orphan files** deletes files that no project, draft or template uses any more. Slopify also does this each time it starts.
- **Keep outputs only** on a finished project deletes its working files and keeps the finished outputs.

Both are explained in [Where your files live](Where-Your-Files-Live).

## Tips

- Before moving to a new computer or between Docker and a native install, press **Export everything** and import the file on the other side. See [Uninstalling and moving](Uninstalling-and-Moving).
- Point **Folder** at a synced or external disk so a disk failure doesn't take your backups with it.
- Keep **Keep last** low if your projects are large.

## Related pages

- [Where your files live](Where-Your-Files-Live)
- [Uninstalling and moving](Uninstalling-and-Moving)
- [Settings reference](Settings-Reference)
- [Trash](Trash)
- [Docker](Docker)
