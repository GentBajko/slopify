# Settings Reference

Every section of Settings, what each control does and its default. Sections with a page of their own are summarised here and linked for the details.

**Where to find it:** **Settings** in the sidebar, or press `Ctrl+K` and run **Open settings** (or **Open Settings: <section>** for one section). Settings opens on **Connections → Providers**. The rail on the left has seven groups; a group with more than one section shows them as tabs across the top. On a phone the rail is a row of tabs you can scroll sideways. An old link to a section (`?section=backups`, for example) still opens where it went.

## Sections at a glance

| Group | Section | What it holds | Details |
|---|---|---|---|
| Connections | [Providers](#providers) | API keys, command-line tools, the system voice, health check | [Providers-and-Keys](Providers-and-Keys), [AI-CLIs](AI-CLIs) |
| Connections | [Voices](#voices) | Voice IDs for narration | [Providers-and-Keys](Providers-and-Keys#add-a-voice) |
| Connections | [Models](#models) | Model catalogue, retired models, models that work for you | [Models](Models) |
| Connections | [Agents (MCP)](#agents-mcp) | The MCP address and setup lines for Claude Code and Codex, the last connection, what agents did | [Agents-MCP](Agents-MCP) |
| Production defaults | [Production defaults](#production-defaults) | Silence gap, volume levelling for new runs | This page |
| Production defaults | [Template studio](#template-studio) | The most a template's samples, and a designed piece template's, may spend in a day, and whether they may use CLI plans | This page |
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

### Remote access

"Open Slopify on your phone or laptop through Tailscale, only inside your tailnet." It is the second tab of **General**.

| Control | What it does | Default |
|---|---|---|
| **Open on my other devices (Tailscale)** | Has the Tailscale already on this computer serve Slopify's page at `https://<computer>.<tailnet>.ts.net`, reachable only from devices signed in to your tailnet. Shows the address with **Copy address** and a QR code. Uses Tailscale Serve, never Funnel. Turning it off removes only the serve setting Slopify added. | Off |
| **Use port 8443** | Shown when another Tailscale serve setting already uses HTTPS port 443: gives Slopify its own address on another port and leaves yours alone. | - |
| **Check again** | Asks Tailscale again after you fixed what the notice says. | - |

See [Remote-Access](Remote-Access).

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
| **Check models** (per provider) | Sends each of that provider's models one tiny request to learn whether it works for your key or CLI. When that costs money the price is shown first and nothing is sent until you confirm. See [Models](Models#models-that-work-for-you). |
| **Automatic checks** | **Free and near-free checks only** (default): free and sub-cent checks run by themselves when a key or CLI is added and weekly. **Off**: only when you choose Check models. See [Models](Models#automatic-checks). |
| **New for you**, **Dismiss** | Models that started working for you since the first check; Dismiss clears one, **Dismiss all** every one. |

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

"How new runs pace the narration and level the volume, and which model times English captions."

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

### Template studio

| Control | What it does | Default / range |
|---|---|---|
| **Daily sample budget** | The most a template's samples, **Compare models** and **Make samples for all** may spend in one day, in US dollars, counted from midnight on this computer. At $0.00 no sample spends money. Below it: what the samples spent today and what is left. Type an amount and choose **Save**. | $2.00, $0 to $1,000 |
| **Designed pieces: daily sample budget** | The most the samples of designed-piece templates (Library → Designs) may spend in one day, in US dollars, counted from midnight on this computer. It is separate from the budget above. Below it: what those samples spent today and what is left. Type an amount and choose **Save designed pieces' budget**. | $1.00, $0 to $1,000 |
| **Samples may use my CLI plans** | Whether those samples, designed pieces' included, may run steps on your Claude Code or Codex plan. Plan usage has no dollar price, so the budgets can't limit it: off, a sample with such a step waits; on, it runs on your plan whatever the budget. | Off |

A sample that would go over the budget is not made: the template's studio shows it **Waiting** with "this sample costs about $0.40 and $0.10 of today's $2.00 sample budget is left", and **Make sample** makes it once there is room again. A sample with a step on a CLI plan waits the same way while **Samples may use my CLI plans** is off. A designed piece template's sample over its own budget waits in the template's editor the same way, and **Make sample** makes it anyway. Only samples count; your projects and designed pieces never do.

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
