# Scheduled backups

Settings → Backups writes the same archive **Export everything** downloads (Settings →
Backup & storage) into a folder on disk, once a day. It carries every project with its files
and history, prompts, intros and outros, document themes, templates, schedules, Play drafts,
uploaded fonts, settings and usage history. Provider keys are never included. Restore one
with **Import a backup** on Backup & storage.

## What an archive carries

Since 3.0 it also carries: prompt and intro/outro history, channels (brand kit, series brief,
Episode memory and AI disclosure settings) with their cast, cast pictures and end screen
images, episode memories, each channel's existing videos, a project's channel, automatic
review verdicts, run cost (provider usage and plan readings, and what topic generation,
episode summaries and cast pictures cost), channel links and the provider
defaults a new Play form starts with, the AI use marks (voices marked as imitating a real
person, Image prompts marked photorealistic, projects whose clips are real footage), each
channel's last "Keep only titles containing…" filter, and the trash (a trashed project, prompt, intro/outro,
template or schedule comes back still in the trash, with its original date). Pictures kept in
the database travel as files named by their SHA-256 (`files/images/…`) and are checked against
that hash on import.

Left out on purpose: provider keys, the telemetry machine id, the notification URL, the Studio
extension's pairing, the tutorial's progress, the scheduled backups' folder and status, and
state that only means something while this install is running (the queue, plan-limit waits,
pending image-prompt softening). `backup-new-tables.test.ts` fails when a new table is neither
carried nor listed as left out.

Importing merges channels by id. The default channel has the same id on every install, so the
backup's default fills this install's default only while it is untouched (never renamed or
edited); otherwise this install's is kept. Cast members, pictures, memories and existing videos
come in by id into the channel that is here; a video whose title the channel already has (in
any case) is skipped. A prompt's history comes with the prompt when the prompt itself came in.

## Settings

| Setting | Default | Notes |
| --- | --- | --- |
| Back up automatically | Off | Off for new and existing installs: an archive holds every video and can be many gigabytes, so filling a disk with copies is left for the user to turn on. |
| Time of day | 03:00 | Local time in the browser's time zone when you press Save (the same way schedules store their zone). |
| Keep last | 5 | 1 to 30. After each successful backup the oldest of Slopify's own backups beyond this number are deleted. |
| Folder | empty | Empty means the default `Backups` folder (see below). |

The screen shows the last backup's time and size, the last attempt's result with the reason it
failed, when the next one runs, and **Back up now**.

## Where backups go

The default folder is `Backups` beside `Projects` in your files folder: `<Documents>/Slopify/Backups`
on a new install (native or Docker, see [storage.md](storage.md)). Installs from before 3.0 keep
it inside the projects folder, because that was the one folder a Docker install shared with your
computer: `~/Slopify/Projects/Backups` with the managed Linux launcher, `<data dir>/projects/Backups`
natively. Moving your files (Settings → Backup & storage → Move to Documents/Slopify) takes the
archives along to the new `Backups`. Storage cleanup (Clear leftover files, and the sweep at start)
leaves this folder alone, and it is not counted as project files on Backup & storage.

A folder you choose must be a full path. It may not be inside the projects folder (other than
its `Backups` folder) or Slopify's staging, logs or model folders, since Slopify cleans those
itself. In Docker, a folder outside the projects folder exists only inside the container's
private volume; the screen says so.

Files are named `slopify-backup-YYYY-MM-DDTHHMMSSZ.tar` (UTC). Pruning and cleanup only ever
touch files whose whole name matches that pattern, or its hidden `.…tar.partial` form, and only
plain files: an Export everything download (`slopify-backup-YYYY-MM-DD.tar`), a renamed copy, a
symlink or anything else in the folder is never deleted.

## When it runs

- A timer checks once a minute. A backup is due once the day's time has passed and no backup
  has succeeded since; at most one automatic backup runs per day.
- Turning backups on, or changing the time, waits for the next time of day rather than starting
  at once. Use Back up now for an immediate one.
- If Slopify was off at the time, it backs up about two minutes after it starts again, unless a
  backup already succeeded in the last 20 hours.
- A failed backup is tried again an hour later, until the next day's time.
- Only one backup is written at a time; Back up now is refused while one is running.

## Staying out of the way

Backups use Export everything's own code path and so its rule: nothing is copied while a
project is being made (a stage or edit running, or a project queued), because its files are
still being written. Rather than competing with a render, an automatic backup records
"Waiting for … to finish" and looks again every ten minutes; it starts by itself once those
projects finish or are paused. Back up now says which projects it is waiting for.

While writing, the backup reads files one megabyte at a time and yields to the server between
chunks, and it holds the updater's mutation gate so an update waits for it to finish. Stopping
Slopify stops a backup being written and removes its unfinished file.

## Safety

The archive is written under a hidden `.partial` name, flushed to disk, then renamed. A crash,
a full disk or a stop never leaves a file that looks like a finished backup, and pruning never
counts one; leftovers are removed before the next backup. The free space is checked first,
and a backup that would not fit fails with the sizes. Backup files are readable by your user
only (mode 0600).

Every failure is shown in plain words on Settings → Backups with what to change, for example
a full disk (free space, lower Keep last, or pick another Folder) or a folder Slopify may not
write to (pick another Folder, or leave it empty for the default).

Configuration and the last result live in the settings table under `backups.config` and
`backups.status`; neither travels in a backup, because a folder path belongs to one machine.
No database migration is involved.
