# Settings Reference

Every section of Settings, what each control does and its default. Sections with a page of their own are summarised here and linked for the details.

**Where to find it:** the **Settings** link in the left navigation, or press `Ctrl+K` and run **Open settings**. Settings opens on **Providers**. Pick a section in the rail on the left; on a phone the rail is a row of tabs you can scroll sideways.

## Sections at a glance

| Section | What it holds | Details |
|---|---|---|
| [General](#general) | Starting Slopify when you log in | [Start-at-Login](Start-at-Login) |
| [Providers](#providers) | API keys, command-line tools, health check | [Providers-and-Keys](Providers-and-Keys), [AI-CLIs](AI-CLIs) |
| [Voices](#voices) | Voice IDs for narration | [Providers-and-Keys](Providers-and-Keys#add-a-voice) |
| [Models](#models) | Model catalogue, retired models | [Models](Models) |
| [Playback & appearance](#playback--appearance) | Silence gap, light or dark, volume levelling | This page |
| [Notifications](#notifications) | Browser and phone notifications | [Notifications](Notifications) |
| [Channel links](#channel-links) | Links for `{{Name}}` placeholders in descriptions | [YouTube-Description](YouTube-Description) |
| [YouTube Studio](#youtube-studio) | Playlist and extension pairing | [Studio-Extension](Studio-Extension) |
| [Backup & storage](#backup--storage) | Your files folder, export and import, disk space, samples | [Where-Your-Files-Live](Where-Your-Files-Live) |
| [Backups](#backups) | The daily automatic backup | [Backups](Backups) |
| [Trash](#trash) | Deleted items, kept 30 days | [Trash](Trash) |
| [Usage](#usage) | This install's counters | [Costs-and-Run-Cost](Costs-and-Run-Cost#your-usage-totals-settings--usage) |
| [Patch notes](#patch-notes) | What changed in each version | [Updating-and-Patch-Notes](Updating-and-Patch-Notes) |
| [About](#about) | Updates, what's new, links | [Updating-and-Patch-Notes](Updating-and-Patch-Notes) |

## Download diagnostics

At the top right of every Settings section.

| Control | What it does |
|---|---|
| **Download diagnostics** | Saves `slopify-diagnostics.json`: the Slopify version, your system and Node version, which providers are set up or found, the project count and the model catalogue's state. It never holds your keys, prompts or project content. Attach it to a bug report. |

You can also press `Ctrl+K` and run **Download diagnostics** from anywhere in Settings.

## General

"How Slopify starts on this computer."

| Control | What it does | Default |
|---|---|---|
| **Start Slopify when I log in** | Slopify starts in the background when you log in, without opening a browser tab; open it from your bookmark. It uses your account's own start-up list, so no administrator password is needed, and turning it off removes exactly what it added. | Off |

In Docker, this section only shows whether Docker starts at login ("Starts with Docker: yes / no / unknown") and where to change that; Slopify starts whenever Docker does and never changes Docker's own settings. See [Start-at-Login](Start-at-Login).

## Providers

"Keys stay on this machine and go only to their provider. Readiness is checked again before each run."

| Control | What it does |
|---|---|
| Provider lists (**Text**, **Speech**, **Images**) | Every supported provider with its state. Pick one to open its setup. |
| **<Provider> API key** and **Save** | Stores a key on this computer only. Never in backups or exports. |
| **Test** | Checks the saved key with the cheapest harmless call. Nothing is billed. |
| **Remove** | Deletes the saved key after you confirm with **Remove key**. |
| **Where to get a key** | The provider's own sign-up, key and billing pages, with the permissions a key needs. |
| **Change path** / **Executable path** / **Save path** | Where a command-line tool is. Blank finds it on PATH. Shows **Managed on host** in Docker. |
| **Check all** | Checks every tool's sign-in, every saved key and every chosen model. Results show under **Health check**. |

On a first launch you may also see the welcome message about command-line tools that were found, with **Got it** to hide it. Full details: [Providers-and-Keys](Providers-and-Keys) and [AI-CLIs](AI-CLIs).

## Voices

"A wrong voice ID shows up when the audio stage uses it."

| Control | What it does | Rules |
|---|---|---|
| **Voice name** | The name you pick the voice by on Play and in Edit project. | Required, up to 200 characters. |
| **Provider** | The speech provider the ID belongs to. | Speech providers only. |
| **Voice ID** | The provider's own ID for the voice. | Required, up to 200 characters, unique per provider. |
| **Languages** | Codes such as `es, de`. Play lists the voice only for projects in these languages. | Blank: asked from the provider when it can say; otherwise offered for every language. |
| **Add voice** | Adds the voice to the table. | |
| **Edit** (Languages cell) | Changes a voice's languages; **Save** or **Cancel**. | |
| **Real person** | On for a voice cloned from, or made to sound like, a real person. Prepare upload then answers Yes to YouTube's AI use question for videos it narrates. | Default: off. |
| **Remove** | Removes the voice after **Remove voice**. Projects keep the audio they made with it. | |

See [Providers-and-Keys](Providers-and-Keys#add-a-voice).

## Models

"New models, prices and retirements, checked once a day."

| Control | What it does |
|---|---|
| **Check now** | Checks the published catalogue and OpenRouter's live list at once. Slopify also does this at start and once a day. |
| **Replace with published file** | Overwrites your local catalogue with the published one, dropping your edits. The previous file is kept as `models.yaml.previous`. |
| **Catalogue file**, **Verified**, **Last checked** | Where the file is, when its prices were verified, and what the last check changed. |
| **Switch to <model>** | Replaces one retired model choice with the suggestion shown. |
| **Switch all** | Replaces every retired choice that has a suggestion. |

See [Models](Models).

## Playback & appearance

"How narration is paced and how Slopify looks."

### Silence between segments

| Control | What it does | Default / range |
|---|---|---|
| **Silence between segments** | Seconds of quiet between the intro and the narration, and between the narration and the outro, in every new video, unless Play sets a different gap for one video. It only matters when an intro or outro is set; 0 runs them together. Type a whole number and choose **Save**. | 3 seconds, 0 to 30 |

Videos already started keep their own gap. A value that is not a whole number from 0 to 30 is refused with "The silence gap is a whole number of seconds between 0 and 30." See [Intros-and-Outros](Intros-and-Outros).

### Appearance

| Control | What it does | Default |
|---|---|---|
| **Appearance** | **System**, **Dark** or **Light** colours for Slopify on this computer. System follows your operating system and changes with it. It changes at once and does not affect your videos. | System |

### Level the volume for new runs

| Control | What it does | Default / range |
|---|---|---|
| **Level the volume for new runs** | Whether a new run on Play (and a template or quick short) starts with **Level the volume** on. On evens out every narration piece and sets the finished files to a standard loudness. | On |
| **Video volume** | How loud the long video and shorts are, in dB from the recommended -14 LUFS (the level YouTube and Spotify play at). Type dB or a percentage. Peaks stay under -1.5 dBTP. | 0 dB (-14 LUFS); -10 dB to +4 dB (32% to 158%) |
| **Audio files volume** | How loud the audio-only WAV and an audiobook's MP3 and M4B are, in dB from the recommended -18 LUFS. Peaks stay under -3 dBTP. | 0 dB (-18 LUFS); -10 dB to +4 dB |

The volume fields show only while the switch is on. A project keeps what it started with; change it there in **Edit project**. Levelling runs on this computer and makes no API calls. Changes save as you make them.

## Notifications

"When a run finishes, fails, or waits for you."

| Control | What it does | Default |
|---|---|---|
| **Browser notifications** | Shows a notification from this browser while any Slopify tab is open, even in the background. Turning it on asks the browser's permission. Applies to this browser only. | Off |
| **Send test notification** (beside the switch) | Shows a sample notification in this browser. | |
| **Notification URL** | An address Slopify POSTs a short plain-text message to, with no tab open, for example `https://ntfy.sh/your-topic`. Each message is sent once, with a 5 second timeout. Empty turns it off. **Save** stores it; **Send test notification** sends a sample. | Empty |

Messages hold the project title and what happened, never your keys. See [Notifications](Notifications).

## Channel links

"The links a YouTube description's {{Name}} placeholders fill from."

| Control | What it does |
|---|---|
| **Named links** | A list of name and address pairs, such as `Patreon` and its URL. Write `{{Patreon}}` in a YouTube description, or ask for it in a Description prompt, and it becomes that link when the description is shown or copied. A name with no link stays as typed. |
| **Add link** / **Remove** | Adds or removes a row. |
| **Save** | Saves the list. |

A project's own **Previous video** link wins over one set here. With no links yet, the section says "No channel links yet. Add one, then write its name in braces in a description." See [YouTube-Description](YouTube-Description).

## YouTube Studio

"The playlist upload packs name, and the Studio extension's pairing."

| Control | What it does | Default / limit |
|---|---|---|
| **Upload pack and extension** | Explains that Slopify never uploads or publishes: **Prepare upload** on a finished project lists everything Studio asks for, and the optional extension fills Studio's upload dialog from it. | |
| **Playlist** | The YouTube playlist every upload pack names, typed exactly as it is called in Studio. **Save** stores it. Empty means no playlist. | Empty; up to 150 characters |
| **Extension pairing token** | A secret the Slopify Studio extension needs before it may read your upload packs. **Copy** it into the extension's options and press Pair there. | |
| **New pairing token** | Makes a fresh token and unpairs the extension until you paste the new one. | |

See [Studio-Extension](Studio-Extension) and [Publishing-to-YouTube](Publishing-to-YouTube).

## Backup & storage

"Export everything, import a backup, and see what uses disk space."

### Your files

| Control | What it does |
|---|---|
| **Your files** | Where your projects, automatic backups and exports live; new installs use `Documents/Slopify`. The database, settings, keys and logs stay in Slopify's hidden data folder. |
| **Open folder** | Opens the folder on this computer. |
| **Choose another folder** / **New folder** / **Move here** | Moves your files to another folder. Slopify copies every file, checks each copy, then switches, and keeps the old folder until you delete it. The new folder must be empty or not exist yet. It cannot start while a project is being made. |

In Docker, this shows the command to run on the computer running Docker, with **Copy command**. See [Where-Your-Files-Live](Where-Your-Files-Live).

### Export and import

| Control | What it does |
|---|---|
| **Export everything** | Downloads one `.tar` file with every project (files and history), your library, templates, schedules, Play drafts, fonts, settings and usage. Never provider keys. Your browser's downloads show its progress; keep Slopify running until it finishes. |
| **Import a backup** | Adds a `.tar` from Export everything (or a `.zip` from an older version's Export backup, up to 100 MB) to this install. It replaces nothing: projects already here are skipped, taken names arrive as "(imported)" and schedules arrive paused. Running projects must finish or pause first. A summary lists what was added and skipped. |
| **Clean orphan files** | Deletes files in the projects folder that no project records any more, and uploaded files nothing uses. Your projects, outputs and library are never touched. Slopify also does this at each start. |

After importing, enter your keys again in Settings → Providers. You can also run **Export everything** from `Ctrl+K`. See [Backups](Backups).

### Disk space

| Control | What it does |
|---|---|
| **Disk space** | What Slopify stores: the total, project files, staged uploads, and deleted projects still in the trash (freed when the trash removes them after 30 days, or with **Delete now**). |
| Storage by project | Each project's size, split into outputs and working files, largest first. |
| **Keep outputs only** | On a finished project, deletes the working files (images, narration parts, subtitle timing, render settings) and keeps the video, shorts, thumbnail, article, description, document and your uploads. You confirm first. Changing the project later makes those files again, which takes time and provider credits. |

### Sample projects

| Control | What it does |
|---|---|
| **Sample projects** | Lists the three samples that come with Slopify (a narrated video, an audiobook and a podcast), with **Open** for each one in your projects. |
| **Restore samples** | Adds back any that were deleted and puts the others back as they shipped. Your own copies of them are not touched. |

## Backups

"A daily copy of everything, in a folder you choose."

| Control | What it does | Default / range |
|---|---|---|
| **Back up now** | Writes a backup at once, whether or not the daily backup is on. Also in `Ctrl+K`. | |
| **Back up automatically** | Turns the daily backup on or off. | Off |
| **Time of day** | When the daily backup runs, in this browser's time zone. | 03:00 |
| **Keep last** | How many of Slopify's own backups stay; older ones are deleted. | 5, from 1 to 30 |
| **Folder** | Where backups go. Empty uses the Backups folder beside your projects. | Empty |
| **Save** | Saves the four settings above. | |

Each backup is the same file Export everything makes and can be many gigabytes. See [Backups](Backups).

## Trash

"Deleted projects, prompts, templates and schedules, kept for 30 days."

| Control | What it does |
|---|---|
| **Restore** | Puts an item back. If its name was taken meanwhile it comes back renamed, and a schedule comes back paused. |
| **Delete now** | Removes an item for good at once, freeing its space. You confirm first. |

Deleted projects, prompts, intros and outros, templates and schedules stay 30 days, then are removed for good. See [Trash](Trash).

## Usage

"This machine only. The same counters, anonymised, feed slopify.stream."

Shows **Videos made**, **Hours of audio**, **Images made**, **Tokens used** and **Projects**, then **Tokens by stage** by provider and model, and the machine ID and version. There are no controls. Money figures are on each project's **Run cost** tab and Home's **This week**. See [Costs-and-Run-Cost](Costs-and-Run-Cost).

## Patch notes

"What changed in each version of Slopify."

| Control | What it does |
|---|---|
| **Latest version** | The newest notes, open. |
| **Earlier versions** | Older versions, each opened with **Read**. |

The notes ship with the app, so they work offline. After an update, the new version's notes open by themselves once; a fresh install skips that. On a major update the What's new tour shows instead and links here. `Ctrl+K` → **Show patch notes** opens this section. See [Updating-and-Patch-Notes](Updating-and-Patch-Notes).

## About

"Free and open source, running on your machine with your own keys."

| Control | What it does |
|---|---|
| **Updates** | Points to the circular-arrows button at the top of every page, which checks for a newer Slopify and installs it. A dot on it means an update is ready. If a video is being made, the update waits until it finishes, and you can cancel it meanwhile. Slopify restarts itself and the page reconnects. |
| **What's new in this version** | Opens the patch notes for the version you are running. When this version has no notes of its own, it opens the newest ones. |
| Links | GitHub (code, issues, releases), Patreon, Buy Me a Coffee, and "How I run a channel with it". |

Slopify is made by Gent Bajko under the Apache License 2.0. See [Updating-and-Patch-Notes](Updating-and-Patch-Notes).

## Related pages

- [Providers-and-Keys](Providers-and-Keys)
- [AI-CLIs](AI-CLIs)
- [Models](Models)
- [Costs-and-Run-Cost](Costs-and-Run-Cost)
- [Keyboard-Shortcuts-and-Command-Palette](Keyboard-Shortcuts-and-Command-Palette)
- [Where-Your-Files-Live](Where-Your-Files-Live)
- [Backups](Backups)
- [Troubleshooting](Troubleshooting)
