# Settings Reference

Every section of Settings, what each control does and its default. Sections with a page of their own are summarised here and linked for the details.

**Where to find it:** **Settings** in the sidebar, or press `Ctrl+K` and run **Open settings** (or **Open Settings: <section>** for one section). Settings opens on **Connections → Providers**. The rail on the left has seven groups; a group with more than one section shows them as tabs across the top. On a phone the rail is a row of tabs you can scroll sideways. An old link to a section (`?section=backups`, for example) still opens where it went.

## Sections at a glance

| Group | Section | What it holds | Details |
|---|---|---|---|
| Connections | [Providers](#providers) | API keys, command-line tools, the system voice, health check | [Providers-and-Keys](Providers-and-Keys), [AI-CLIs](AI-CLIs) |
| Connections | [Voices](#voices) | Voice IDs for narration | [Providers-and-Keys](Providers-and-Keys#add-a-voice) |
| Connections | [Models](#models) | Model catalogue, retired models | [Models](Models) |
| Connections | [Agents (MCP)](#agents-mcp) | The MCP address and setup lines for Claude Code and Codex, the last connection, what agents did | [Agents-MCP](Agents-MCP) |
| Production defaults | [Production defaults](#production-defaults) | Silence gap, volume levelling for new runs, the caption timing model, how this computer renders | This page |
| Notifications | [Notifications](#notifications) | Browser and phone notifications | [Notifications](Notifications) |
| Publishing | [Channel links](#channel-links) | A pointer to each channel's own links | [Channels](Channels#channel-links) |
| Publishing | [YouTube Studio](#youtube-studio) | Playlists per channel, the Studio extension's download and pairing | [Studio-Extension](Studio-Extension) |
| Backup & storage | [Backup & storage](#backup--storage) | Your files folder, daily backups, export and import, disk space, samples | [Where-Your-Files-Live](Where-Your-Files-Live), [Backups](Backups) |
| Backup & storage | [Trash](#trash) | Deleted items, kept 30 days | [Trash](Trash) |
| General | [General](#general) | Light or dark, and starting Slopify when you log in | [Start-at-Login](Start-at-Login) |
| About | [About](#about) | Updates, what's new, links, the welcome screen | [Updating-and-Patch-Notes](Updating-and-Patch-Notes) |
| About | [Usage](#usage) | This install's counters | [Costs-and-Run-Cost](Costs-and-Run-Cost#your-usage-totals-settings--usage) |
| About | [Patch notes](#patch-notes) | What changed in each version | [Updating-and-Patch-Notes](Updating-and-Patch-Notes) |

## Download diagnostics

At the top right of every Settings section.

| Control | What it does |
|---|---|
| **Download diagnostics** | Saves `slopify-diagnostics.json`: the Slopify version, your system and Node version, which providers are set up or found, the project count and the model catalogue's state. It never holds your keys, prompts or project content. Attach it to a bug report. |

You can also press `Ctrl+K` and run **Download diagnostics** from anywhere in Settings.

## General

"How Slopify looks and how it starts on this computer."

### Appearance

| Control | What it does | Default |
|---|---|---|
| **Appearance** | **System**, **Dark** or **Light** colours for Slopify on this computer. System follows your operating system and changes with it. It changes at once and does not affect your videos. | System |

### Start at login

| Control | What it does | Default |
|---|---|---|
| **Start Slopify when I log in** | Slopify starts in the background when you log in, without opening a browser tab; open it from your bookmark. It uses your account's own start-up list, so no administrator password is needed, and turning it off removes exactly what it added. | Off |

In Docker, this section only shows whether Docker starts at login ("Starts with Docker: yes / no / unknown"), when the installer checked, and where to change that. With Docker Desktop it names Docker Desktop's own setting: Docker Desktop → Settings → General → **Start Docker Desktop when you sign in to your computer**. Slopify starts whenever Docker does and never changes Docker's own settings. See [Start-at-Login](Start-at-Login).

## Providers

"Keys stay on this machine and go only to their provider. Readiness is checked again before each run."

| Control | What it does |
|---|---|
| Provider lists (**Text**, **Speech**, **Images**) | Every supported provider with its state and kind (**Command line**, **Built in, no key** or **API key**). Pick one to open its setup. |
| **<Provider> API key** and **Save** | Stores a key on this computer only. Never in backups or exports. |
| **Test** | Checks a pasted key before you save it (without storing it), or the saved key when the field is empty, with the cheapest harmless call. Nothing is billed. |
| **System voice** | Shows the speech program found on this computer and its voices, or what to install, with **Add a system voice**. See [the system voice](Providers-and-Keys#the-system-voice). |
| **Remove** | Deletes the saved key after you confirm with **Remove key**. |
| **Where to get a key** | The provider's own sign-up, key and billing pages, with the permissions a key needs. |
| **Change path** / **Executable path** / **Save path** | Where a command-line tool is. Blank finds it on PATH. Shows **Managed on host** in Docker. |
| **Check all** | Checks every tool's sign-in, the system voice, every saved key, whether each chosen model is still offered and reachable with your key (**Model reachable**). Results show under **Health check**. |
| **Check again** | On one provider's health row: checks that provider alone. |

On a first launch you may also see the welcome message about command-line tools that were found, with **Got it** to hide it. Full details: [Providers-and-Keys](Providers-and-Keys) and [AI-CLIs](AI-CLIs).

## Voices

"A wrong voice ID shows up when the audio stage uses it."

| Control | What it does | Rules |
|---|---|---|
| **Voice name** | The name you pick the voice by on Play and in Edit project. | Required, up to 200 characters. |
| **Provider** | The speech provider the ID belongs to. | Speech providers only. |
| **Voice ID** | The provider's own ID for the voice. For **System voice** and **Google Gemini** it is a list to pick from. | Required, up to 200 characters, unique per provider. |
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

Templates and schedules that pick a retired model are also flagged on their own rows, with the same **Switch to <model>**. See [Models](Models).

## Agents (MCP)

"Let an AI agent on this computer, such as Claude Code or Codex, run Slopify."

| Control | What it does |
|---|---|
| **MCP address** | This install's address with `/mcp`, for example `http://127.0.0.1:6969/mcp`. No token: only requests from a web page at another address are refused. |
| **Claude Code** → **Copy** | Copies `claude mcp add --transport http slopify <address>`. Run it once in a terminal. |
| **Codex** → **Copy** | Copies the `[mcp_servers.slopify]` lines. Add them to `~/.codex/config.toml`. |
| Last connected | When an agent last connected, or "No agent has connected yet." |
| **What agents did** | The latest 20 changes agents made, with the project or schedule and the time. |

There is nothing to turn on: the address works whenever Slopify runs. See [Agents (MCP)](Agents-MCP).

## Production defaults

"How new runs pace the narration and level the volume, which model times English captions, and how this computer renders."

### Silence between segments

| Control | What it does | Default / range |
|---|---|---|
| **Silence between segments** | Seconds of quiet between the intro and the narration, and between the narration and the outro, in every new video, unless Play sets a different gap for one video. It only matters when an intro or outro is set; 0 runs them together. Type a whole number and choose **Save**. | 3 seconds, 0 to 30 |

Videos already started keep their own gap. A value that is not a whole number from 0 to 30 is refused with "The silence gap is a whole number of seconds between 0 and 30." See [Intros-and-Outros](Intros-and-Outros).

### Level the volume for new runs

| Control | What it does | Default / range |
|---|---|---|
| **Level the volume for new runs** | Whether a new run on Play (and a template or quick short) starts with **Level the volume** on. On evens out every narration piece and sets the finished files to a standard loudness. | On |
| **Video volume** | How loud the long video and shorts are, in dB from the recommended -14 LUFS (the level YouTube and Spotify play at). Type dB or a percentage. Peaks stay under -1.5 dBTP. | 0 dB (-14 LUFS); -10 dB to +4 dB (32% to 158%) |
| **Audio files volume** | How loud the audio-only WAV and an audiobook's MP3 and M4B are, in dB from the recommended -18 LUFS. Peaks stay under -3 dBTP. | 0 dB (-18 LUFS); -10 dB to +4 dB |

The volume fields show only while the switch is on. A project keeps what it started with; change it there in **Edit project**. Levelling runs on this computer and makes no API calls. Changes save as you make them.

### Subtitle timing model

| Control | What it does | Default / range |
|---|---|---|
| **Subtitle timing model** | The speech model that times English captions on this computer. The same model in three sizes: **Most accurate (378 MB, recommended)**, **Balanced (189 MB)** and **Smallest (95 MB, less accurate)**. Bigger hears the narration more accurately and, on most computers, also runs faster. | Most accurate |

The chosen model downloads once, the first time captions are timed (or when Slopify starts, unless `SLOPIFY_NO_MODEL_PREFETCH` is set), and is kept in `<data folder>/models/english-subtitles/`. A model already downloaded stays there when you switch, so switching back costs nothing. Smallest can mishear a line and stop a run with "Subtitles stopped matching the audio" where the narration is fine. Changing the model never marks finished subtitles outdated, and a timing that is already running finishes with the model it started with; the next one uses the new choice. It is a setting of this computer, not of a project. Other languages use their own model and are not affected. Changes save as you make them.

### Rendering

How this computer encodes videos and shorts. Like the subtitle timing model, these belong to the computer, not a project: no project copies them, and changing them never marks anything outdated, because they change how a video is made, not what it is. A render reads them once as it starts; one already running finishes as it began. Changes save as you make them.

| Control | What it does | Default / range |
|---|---|---|
| **Video encoder** | What turns the frames into the finished file. **Processor (x264)** is the one every computer has. **NVIDIA graphics card (NVENC)** encodes on the card at its highest-quality settings (preset p7, tune hq, constant quality) and leaves the processor for the rest of the render. It is listed only when Slopify finds an ffmpeg with NVENC (its own, else the `ffmpeg` on your `PATH` or `/usr/bin/ffmpeg`) that passes a tiny test encode; otherwise the line under it says "No NVIDIA encoder found on this computer." | Processor (x264) |
| **Clip encoding** | How hard the processor works on each image's clip before the captions are burned in over them. **Thorough** is x264's medium preset; **Fast** is its veryfast preset at the same quality setting (CRF 16). Only the clips under burned-in captions change; the burned-in encode that makes the finished picture is the same. Has no effect with the NVIDIA encoder. | Thorough |
| **Render priority** | **Background (your other programs come first)** runs every ffmpeg of a video, short or audio export, its volume mastering included, below normal priority (nice 10 on Linux and macOS, below-normal on Windows): your browser, games and other programs take the processor first and the render gets what is left. **Normal** competes with them as an equal. The finished video is the same either way. | Background |

What they cost and give, measured on two minutes of a real project with captions burned in (32-core processor, RTX 5080): **Fast** halved the clips' processor time and cut the whole render's by 30% (10 to 17% less waiting), for a slightly softer picture (0.9 VMAF less) at the same file size. **NVIDIA** cut the render's processor time by 80% and its waiting by a quarter (the zoom and pan on each image still runs on the processor), at about the same file size, but with a visibly softer picture than x264 (about 2.5 VMAF less): pick it when keeping the computer free matters more than the last bit of sharpness. **Background** makes no difference to the file at all.

If the NVIDIA encoder is chosen but stops working (a driver update, the card busy elsewhere), the render is made on the processor instead, never failed, and the video's section on the project page says: "This video was encoded on the processor because the NVIDIA graphics card encoder didn't work (…). Check the NVIDIA driver, or choose Processor (x264) in Settings → Production defaults → Video encoder." Slopify checks for the card once per start; restart Slopify after installing a driver or an ffmpeg with NVENC.

Agents read and change these with `get_settings` and `update_settings`, and check the card with `get_video_encoders`.

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

Each channel now keeps its own links, on its **Brand** tab under **Channel links**. This section only says so, with **Open the default channel's links**. Links saved here in an earlier version still fill the default channel's descriptions until you save its Brand tab. See [Channels](Channels#channel-links) and [YouTube-Description](YouTube-Description).

## YouTube Studio

"The playlists upload packs offer, and the Studio extension's pairing."

| Control | What it does | Default / limit |
|---|---|---|
| **Upload pack and extension** | Explains that Slopify never uploads or publishes: **Prepare upload** on a finished project lists everything Studio asks for, and the optional extension fills Studio's upload dialog from it. | |
| **Playlists** | The YouTube playlists upload packs offer, each typed exactly as it is called in Studio. Pick **Every channel (default)** or one channel first: the default list is used by every channel without its own. **Add playlist** adds a row; **On by default** puts every project into it; **Remove** drops it; **Save playlists** stores the list. A project's **Prepare upload** changes which ones it goes into. | None; up to 20, each up to 150 characters |
| **Extension pairing token** | A secret the Slopify Studio extension needs before it may read your upload packs. **Copy** it into the extension's options and press Pair there. | |
| **New pairing token** | Makes a fresh token, unpairs the extension until you paste the new one, and clears the uploads waiting for Studio. | |
| **Install the Studio extension** | **Chrome, Edge, Brave** or **Firefox**, then **Download for Chrome** or **Download for Firefox**, with the three install steps. | |

See [Studio-Extension](Studio-Extension) and [Publishing-to-YouTube](Publishing-to-YouTube).

## Backup & storage

"Daily backups, export and import, and what uses disk space." Its second tab is [Trash](#trash).

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
| **Clear leftover files** | Deletes files in the projects folder that no project records any more, and uploaded files nothing uses. Your projects, outputs and library are never touched. Slopify also does this at each start. |

After importing, enter your keys again in Settings → Providers. You can also run **Export everything** from `Ctrl+K`. See [Backups](Backups).

### Disk space

| Control | What it does |
|---|---|
| **Disk space** | What Slopify stores: the total, project files, staged uploads, and deleted projects still in the trash (freed when the trash removes them after 30 days, or with **Delete now**). |
| Storage by project | Each project's size, split into outputs and working files, largest first. A finished project's page offers the same on its own (**Free space**, see [Project Page](Project-Page#free-space)). |
| **Keep outputs only** | On a finished project, deletes the working files (narration parts, subtitle timing, render settings) and keeps the video, shorts, the images they show, thumbnail, article, description, document and your uploads. You confirm first. Changing the project later makes those files again, which takes time and provider credits. |

### Sample projects

| Control | What it does |
|---|---|
| **Sample projects** | Lists the three samples that come with Slopify (a narrated video, an audiobook and a podcast), with **Open** for each one in your projects. |
| **Restore samples** | Adds back any that were deleted and puts the others back as they shipped. Your own copies of them are not touched. |

### Daily backups

"A daily copy of everything, in a folder you choose." On the Backup & storage tab.

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

"Deleted projects, prompts, templates and schedules, kept for 30 days." A tab of **Backup & storage**.

| Control | What it does |
|---|---|
| **Restore** | Puts an item back. If its name was taken meanwhile it comes back renamed, and a schedule comes back paused. |
| **Delete now** | Removes an item for good at once, freeing its space. You confirm first. |
| Checkboxes and **Select all** | Pick several items; **Restore selected** and **Delete selected** above the list act on them. **Restore all** and **Empty trash** act on everything. |

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
| **Updates** | Points to the circular-arrows button (at the foot of the sidebar), which checks for a newer Slopify and installs it. A dot on it means an update is ready. If a video is being made, the update waits until it finishes, and you can cancel it meanwhile. Slopify restarts itself and the page reconnects. |
| **What's new in this version** | Opens the patch notes for the version you are running. When this version has no notes of its own, it opens the newest ones. |
| Links | GitHub (code, issues, releases), Patreon, Buy Me a Coffee, and "How I run a channel with it". |

The welcome screen (what this computer can do, the samples, a first short) opens again from **Help → Tutorials → Welcome screen** or `Ctrl+K` → **Open the welcome screen**.

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
