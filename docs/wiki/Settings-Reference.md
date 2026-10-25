# Settings Reference

Every page of Settings, what each control does and its default. Pages with a tutorial of their own are summed up here and linked for the details.

**Where to find it:** **Settings** in the rail, or press `Ctrl+K` and run **Open Settings** (or type a page's name, such as "voices"). `G` then `,` opens it too. Settings opens on **Keys & services**.

Settings is one list of pages down the left, each named once: the name in the list is the page's title. The list comes in four runs with a little space between them: what makes the videos, how new videos are made and published, this computer, and Slopify itself. With only one channel, **Your channel** follows YouTube Studio and posting in the list: it opens the channel's own page (with two or more, **Channels** in the rail does). Each page's header says in one line what it holds. On a phone, a **Settings page** picker replaces the list. An old link to a page that was folded into another (`?section=backups`, `?section=template-studio`, `?section=channel-links`) opens the page that holds it now.

## Pages at a glance

| Page | What it holds | Details |
|---|---|---|
| [Keys & services](#keys--services) | What writes, reads aloud and draws your videos: keys, sign-in tools, the system voice, the check of every service | [Keys and Services](Providers-and-Keys), [AI CLIs](AI-CLIs) |
| [Voices](#voices) | The voices you can pick for narration, and their pronunciation | [Keys and Services](Providers-and-Keys#add-a-voice) |
| [Models](#models) | Which models work with your keys and sign-ins, the model list, retired models | [Models](Models) |
| [Production defaults](#production-defaults) | The silence gap, the caption timing model, volume levelling for new runs, how this computer encodes videos, the PDF look, what template samples may spend | This page |
| [Notifications](#notifications) | Browser notifications, run sounds, a notification URL, the weekly report | [Notifications](Notifications) |
| [YouTube Studio and posting](#youtube-studio-and-posting) | Playlists, upload lead time, the Studio extension's pairing and install | [Studio Extension](Studio-Extension), [Posting to Social Sites](Posting-to-Social-Sites) |
| [Backup & storage](#backup--storage) | Daily backup, your files folder, export and import, disk space, sample projects | [Where Your Files Live](Where-Your-Files-Live), [Backups](Backups) |
| [Trash](#trash) | What you deleted, to bring back or remove for good | [Trash](Trash) |
| [General](#general) | Light or dark, and starting Slopify when you log in | [Start at Login](Start-at-Login) |
| [Remote access](#remote-access) | Opening Slopify on your phone or laptop through Tailscale | [Remote Access](Remote-Access) |
| [AI agents](#ai-agents) | Letting Claude Code or Codex on this computer run Slopify | [Agents (MCP)](Agents-MCP) |
| [About](#about) | Your version, updates, where to get help, Download diagnostics | [Updating and Patch Notes](Updating-and-Patch-Notes) |
| [Usage](#usage) | What this computer made | [Costs and Run Cost](Costs-and-Run-Cost#your-usage-totals-settings--usage) |
| [What's new](#whats-new) | What changed in each version | [Updating and Patch Notes](Updating-and-Patch-Notes) |

## Keys & services

"What writes, reads aloud and draws your videos. Keys stay on this computer."

| Control | What it does |
|---|---|
| **Article**, **Narration**, **Images** | One line each saying whether your videos have that part now (**Ready**, **No key** or **No voice saved**) and why, with **Set up a voice service** (and the like) or **Save a voice** while it is not ready. |
| **Check every service** | Checks every tool's sign-in, the system voice, every saved key, and whether each chosen model is still offered and reachable with your key. The result lists each service that needs something, with **Check again**, then one line of the ready ones and one of those not used anywhere. The line beside it says when it last checked. |
| **Writing services**, **Voice services**, **Image services** | Every supported service with how it connects (**API key**, **Sign-in** or **Built in**) and its state (**Ready**, **No key**, **Not found**, **Signed out**, **Needs fixing**, **Not installed**). Pick one to open its setup beside the list on a wide window, or under its own row. |
| **<Service> API key** and **Save** | Stores a key on this computer only, sent only to that service, never in backups or exports. |
| **Test the key (free)** | Checks a pasted key before you save it (without storing it), or the saved key, with the cheapest harmless call. Nothing is billed. |
| **Remove the key** | Deletes the saved key after you confirm. |
| **Where to get a key** | The service's own sign-up, key and billing pages, with the permissions a key needs. |
| **Change path** / **Executable path** / **Save path** | Where a sign-in tool is. Blank finds it in the folders your terminal searches. Shows **Managed on host** in Docker. |
| **Add a system voice** | On **System voice**, once a speech program is found: opens Voices to pick one of its voices. |

Full details: [Keys and Services](Providers-and-Keys) and [AI CLIs](AI-CLIs).

## Voices

"The voices you can pick for narration."

| Control | What it does | Rules |
|---|---|---|
| **Voice service** | The service the voice belongs to. | Voice services only. |
| **Voice** | The service's own voices to pick from, or **A voice of my own (paste its ID)**. For **System voice**, the voices found on this computer, with a filter and **Listen**. | Required, up to 200 characters, one per voice and service. |
| **Name** | How you pick it on Create. | Required, up to 200 characters. |
| **Languages it speaks** | Picked by name. Create lists the voice only for projects in these languages. | **Any language** until you pick one: asked from the service when it can say; otherwise offered for every language. |
| **Add voice** | Adds the voice to the list. The line beside it says what is still missing. | |
| **Speaks** (each voice's row) | Picks or removes the voice's languages; each change is saved at once. | |
| **Sounds like a real person** | On for a voice cloned from, or made to sound like, someone real. Copy for YouTube Studio then answers Yes to YouTube's question for videos it narrates. | Default: off. |
| **Listen** | Reads one sentence aloud: free with the system voice, one short paid request with a service that has a key. | |
| **Remove** | Removes the voice after you confirm. Projects keep the audio they made with it. | |
| **Pronunciation** | Opens the narration aliases: words the narrator says differently from how they are written. | |

A line above the table says when a voice's service has no key yet, with a button to add it. See [Keys and Services](Providers-and-Keys#add-a-voice) and [Narration Aliases and Glossary](Narration-Aliases-and-Glossary).

## Models

"Which models work with your keys and sign-ins."

| Control | What it does |
|---|---|
| **Models that work for you** | One row per service with a key or sign-in: how many of its models work, how many are listed, when it was last checked and what checks cost. Pickers show working models first. |
| **Check models** (per service) | Sends each of that service's models one tiny request to learn whether it works for your key or sign-in. When that costs money the price is shown first and nothing is sent until you confirm. See [Models](Models#models-that-work-for-you). |
| **Automatic checks** | **Free and near-free checks only** (default): checks that cost nothing or well under a tenth of a cent run when a key is added and once a week. **Off: only when I choose Check models**. Images are never checked by themselves. See [Models](Models#automatic-checks). |
| **New for you** | Models that started working for you since the first check, each with **Dismiss**. |
| Retired models | Templates, schedules and drafts that pick a retired model, each with **Switch to <model>**, and **Switch all**. |
| **Model list** → **Check for new models** | Checks the published list of models, prices and retirements at once. Slopify also does this at start and once a day; the line says when and what changed. |
| **Catalog file** → **Replace with the published file** | Where the local copy of the published list is, and when it was published. Replacing it drops your edits; the old file is kept beside it. |

See [Models](Models).

## Production defaults

"How new videos sound and are encoded, and what template samples may spend."

### Silence between segments

| Control | What it does | Default / range |
|---|---|---|
| **Silence between segments** | Seconds of quiet between the intro and the narration, and between the narration and the outro, in every new video, unless Create sets a different gap for one video. It only matters when an intro or outro is set; 0 runs them together. Type a whole number and press **Save**. | 3 seconds, 0 to 30 |

Videos already started keep their own gap. A value that is not a whole number from 0 to 30 is refused. See [Intros and Outros](Intros-and-Outros).

### Caption timing model

| Control | What it does | Default |
|---|---|---|
| **Caption timing model** | The speech model that times English captions on this computer. The same model in three sizes: **Most accurate (378 MB, recommended)**, **Balanced (189 MB)** and **Smallest (95 MB, less accurate)**. Bigger hears the narration more accurately and, on most computers, also runs faster. | Most accurate |

The chosen model downloads once, the first time captions are timed (or when Slopify starts, unless `SLOPIFY_NO_MODEL_PREFETCH` is set), and is kept in `<data folder>/models/english-subtitles/`. A model already downloaded stays there when you switch, so switching back costs nothing. Smallest can mishear a line and stop a run where the narration is fine. Changing the model never marks finished captions outdated, and a timing that is already running finishes with the model it started with; the next one uses the new choice. It is a setting of this computer, not of a project. Other languages use their own model and are not affected. Changes save as you make them.

### Level the volume for new runs

| Control | What it does | Default / range |
|---|---|---|
| **Level the volume for new runs** | Whether a new run on Create (and a template or quick short) starts with **Level the volume** on. On evens out every narration piece and sets the finished files to a standard loudness. | On |
| **Video volume** | How loud the long video and shorts are, in dB from the loudness YouTube plays videos at (−14 LUFS). Type dB or a percentage. Peaks stay under −1.5 dBTP. | 0 dB; −10 dB to +4 dB |
| **Audio files volume** | How loud the sound-only WAV and an audiobook's MP3 and M4B are, in dB from the loudness audiobook shops ask for (−18 LUFS). Peaks stay under −3 dBTP. | 0 dB; −10 dB to +4 dB |

The volume fields show only while the switch is on. A project keeps what it started with; change it there in **Edit settings**. Levelling runs on this computer and makes no service calls. Changes save as you make them.

### Encoding

"How this computer turns videos and shorts into files. Changing these never marks anything outdated." Like the caption timing model, these belong to the computer, not a project: no project copies them, because they change how a video is made, not what it is. A video reads them once as it starts; one already being made finishes as it began. Changes save as you make them.

| Control | What it does | Default |
|---|---|---|
| **Video encoder** | What turns the frames into the finished file. **Processor (x264)** is the one every computer has. **NVIDIA graphics card (NVENC)** encodes on the card at its highest-quality settings (preset p7, tune hq, constant quality) and leaves the processor for the rest. It is offered only when Slopify finds an ffmpeg with NVENC (its own, else the `ffmpeg` on your `PATH` or `/usr/bin/ffmpeg`) that passes a tiny test encode; otherwise the line under it says "No working NVIDIA graphics card was found on this computer" (or that none was found) and that videos are encoded on the processor, with what the test printed under **Details**. | Processor (x264) |
| **Clip encoding** | How hard the processor works on each image's clip before the captions are drawn over them. **Thorough** is x264's medium preset; **Fast** is its veryfast preset at the same quality setting (CRF 16), about half the processor time for a slightly softer picture. Only the clips under captions in the video change. Has no effect with the NVIDIA encoder. | Thorough |
| **Encoding priority** | **Background (your other programs come first)** runs every ffmpeg of a video, short or audio file, its volume mastering included, below normal priority, and that of the style preview, template samples, designs and posts' pictures too (nice 10 on Linux and macOS, below-normal on Windows): your browser, games and other programs take the processor first and the video gets what is left. **Normal** competes with them as an equal. The finished video is the same either way. | Background |

What they cost and give, measured on two minutes of a real project with captions in the video (32-core processor, RTX 5080): **Fast** halved the clips' processor time and cut the whole video's by 30% (10 to 17% less waiting), for a slightly softer picture (0.9 VMAF less) at the same file size. **NVIDIA** cut the processor time by 80% and the waiting by a quarter (the zoom and pan on each image still runs on the processor), at about the same file size, but with a visibly softer picture than x264 (about 2.5 VMAF less): pick it when keeping the computer free matters more than the last bit of sharpness. **Background** makes no difference to the file at all.

If the NVIDIA encoder is chosen but stops working (a driver update, the card busy elsewhere), the video is encoded on the processor instead, never failed, and the project's Video part says so, with the reason and where to change it. Slopify checks for the card once per start; restart Slopify after installing a driver or an ffmpeg with NVENC.

Agents read and change these with `get_settings` and `update_settings`, and check the card with `get_video_encoders`.

### PDF look

"The fonts, colors and page layout of the PDFs Slopify makes." **Edit PDF looks** opens the PDF themes. See [Document Themes](Document-Themes).

### Template samples

"What a template's samples may spend while you edit it."

| Control | What it does | Default / range |
|---|---|---|
| **Video templates: daily budget** | The most video templates' samples, **Compare models** and **Make samples for all** may spend in one day, in US dollars, counted from midnight on this computer; one over it waits for tomorrow or a higher budget. At $0.00 no sample spends money. The line under it says what the samples spent today and what is left. Type an amount and press **Save video budget**. | $2.00, $0 to $1,000 |
| **Poster templates: daily budget** | The most the samples of poster templates (Templates → Poster templates) may spend in one day, in US dollars. It is separate from the budget above. Type an amount and press **Save poster budget**. | $1.00, $0 to $1,000 |
| **Let samples use my Claude Code or Codex plan** | Whether those samples, poster samples included, may run steps on your Claude Code or Codex plan. Plan usage has no dollar price, so the budgets can't limit it: off, a sample that needs your plan waits until you turn this on; on, it runs on your plan whatever the budget. The line under the switch says which. | Off |
| **Samples for all templates** → **Make samples for all** | Makes every template's sample for its newest version, with the estimated cost on the button. | |

A sample that would go over the budget is not made: the template's editor shows it waiting, with what it costs and what is left of today's budget, and makes it once there is room again. A sample with a step on a Claude Code or Codex plan waits the same way while **Let samples use my Claude Code or Codex plan** is off. Only samples count; your projects and posters never do. See [Edit template](Template-Studio).

## Notifications

"When a run finishes, fails or waits for you." Under **Browser and phone**: when a run finishes, fails or waits for your review, Slopify sends the project's title and a link, never your keys.

| Control | What it does | Default |
|---|---|---|
| **Notify me in this browser** | Shows a notification on this computer when a run finishes, fails or waits for you, while any Slopify tab is open, even in the background. Turning it on asks the browser's permission. Applies to this browser at once. Once it is on, **Send test notification** beside it shows a sample. | Off |
| **Play a sound when a run starts and ends** | A chime when a run starts and a different one when it ends; the end sound also plays when a run fails or waits for you. You hear them in this browser while a Slopify tab is open and has been clicked once. **Hear the start sound** and **Hear the end sound** play them. Applies to this browser at once. | On |
| **Notification URL** | An address Slopify sends a short plain-text message to, with no tab open, for example an ntfy topic on your phone. Saved only when you press **Save**; once there is an address, **Send test notification** sends a sample. Empty turns it off. | Empty |
| **Weekly report** | Each Monday from 09:00, what was made, what failed and what it cost last week go to the Notification URL. | Off |

See [Notifications](Notifications).

## YouTube Studio and posting

"The browser extension that fills YouTube Studio, release times and playlists." Slopify never uploads or publishes: a finished project's **Copy for YouTube Studio** lists everything Studio asks for, with Copy buttons, and the optional Slopify Studio browser extension fills Studio's upload dialog for you; you still press Publish.

| Control | What it does | Default / limit |
|---|---|---|
| **Playlists** | The YouTube playlists a project can go into, each typed exactly as it is called in Studio. Pick **Every channel (default)** or one channel first: the default list is used by every channel without its own. **Add playlist** adds a row; ticked ones are on for every project; **Remove** drops one; **Save playlists** stores the list. A project's **Copy for YouTube Studio** changes them for that project. | None; up to 20, each up to 150 characters |
| **Release times** | Each schedule sets when its videos and shorts go out, under **Edit** on Calendar → Schedules. | |
| **Upload lead time** | How many hours before release the upload should happen, so YouTube's copyright and ad checks finish while the video is still private. Type it and press **Save**. | |
| **Post and pin each video's comment** | Once the video is public, the extension posts its comment in your name and pins it. | Off |
| **Extension pairing token** | A secret the Slopify Studio extension needs before it may read your projects. **Copy** it into the extension and press Pair there. The line under it says whether an extension is paired. | |
| **New pairing token** | Makes a fresh token, unpairs the extension until you paste the new one, and clears the uploads waiting for Studio. | |
| **Install the Studio extension** | **Chrome, Edge, Brave** or **Firefox** (the browser you open YouTube Studio in), then the install steps, with **Copy folder path**. Updates arrive in that folder by themselves. To fill posts on X, LinkedIn, Instagram, TikTok, Reddit or Bluesky too, press **Allow posting on** each site in the extension's options. | |
| **Links saved here before** | Shown only while links saved here before channels had their own still fill the default channel's descriptions. **Open <channel>'s links** goes to its **Name and look** tab; saving that tab moves them. | |

See [Studio Extension](Studio-Extension), [Publishing to YouTube](Publishing-to-YouTube), [Posting to Social Sites](Posting-to-Social-Sites) and [Channels](Channels#channel-links).

## Backup & storage

"Daily backups, export and import, and disk space."

### Daily backup

| Control | What it does | Default / range |
|---|---|---|
| **Back up now** | Writes a backup at once, whether or not the daily backup is on. Also in `Ctrl+K`. | |
| **Back up automatically** | Turns the daily backup on or off. Each backup holds every project with its videos, so it can be many gigabytes. | Off |
| **Time of day** | When the daily backup runs, in this browser's time zone. A backup waits while videos are being made. | 03:00 |
| **Keep last** | How many of Slopify's own backups stay; the oldest beyond it are deleted. | 5, from 1 to 30 |
| **Folder** | Where backups go. Empty uses the Backups folder beside your projects. | Empty |

Each backup is the same file Export everything makes. See [Backups](Backups).

### Your files

| Control | What it does |
|---|---|
| **Your files** | Where your projects, automatic backups and exports are kept, with the **Projects** and **Automatic backups** folders. Your keys, settings and the database stay in Slopify's own folder. |
| **Move to Documents/Slopify** | Shown when your files are elsewhere: moves them to the usual place. |
| **Open folder** | Opens the folder on this computer. |
| **Choose another folder** | Moves your files to another folder. Slopify copies every file, checks each copy, then switches, and keeps the old folder until you delete it. The new folder must be empty or not exist yet. It cannot start while a project is being made. |

In Docker, this shows the command to run on the computer running Docker, with **Copy command**. See [Where Your Files Live](Where-Your-Files-Live).

### Export and import

| Control | What it does |
|---|---|
| **Export everything** | Downloads one `.tar` file with every project (files and versions), your prompts, templates, schedules, drafts, fonts, settings and usage. Never your keys. Your browser's downloads show its progress; keep Slopify running until it finishes. |
| **Import a backup** | Adds a `.tar` from Export everything (or a `.zip` from an older version's export, up to 100 MB) to this install. It replaces nothing: projects already here are skipped, taken names arrive as "(imported)" and schedules arrive paused. Running projects must finish or pause first. A summary lists what was added and skipped. |
| **Clear leftover files** | Deletes files in the projects folder that no project records any more, and uploaded files nothing uses. Your projects, outputs, prompts and templates are never touched. Slopify also does this at each start. |

After importing, add your keys again on Keys & services. You can also run **Export everything** from `Ctrl+K`. See [Backups](Backups).

### Disk space

| Control | What it does |
|---|---|
| **Disk space** | What Slopify stores: the total, project files and staged uploads, then what can be cleaned up, or "Nothing to clean up." |
| **Delete all old versions** | Shown when projects keep old versions' files: deletes them all after you confirm. |
| Storage by project | Each project's size, split into outputs and working files, largest first, with **Open** on a sample. A finished project's own **Free space** does the same for one project (see [Project Page](Project-Page#free-space)). |
| **Keep outputs only** | On a finished project, deletes the working files (narration pieces, caption timing, video settings) and keeps the video, shorts, the images they show, thumbnail, article, description, document and your uploads. You confirm first. Changing the project later makes those files again, which takes time and service credits. |
| **Delete old versions** | On a project with old versions: deletes their files. |
| **Restore samples** | Puts the three finished examples that come with Slopify (a narrated video, an audiobook and a podcast) back as they shipped. Your own copies of them are not touched. |

## Trash

"What you deleted, to bring back or remove for good." Deleted projects, prompts, intros and outros, templates, schedules and designs stay here for 30 days. Channels, cast members, PDF themes and episode summaries are deleted permanently and never come here.

| Control | What it does |
|---|---|
| **Restore** | Puts an item back. If its name was taken meanwhile it comes back renamed, and a schedule comes back paused. |
| **Delete now** | Removes an item for good at once, freeing its space. You confirm first. |
| **Filter by kind** | Shows one kind of item, when there are several. |
| Ticks and **Select all** | Pick several items; **Restore selected** and **Delete selected** act on them. **Restore all** and **Empty trash** act on everything. |

See [Trash](Trash).

## General

"How Slopify looks and how it starts."

| Control | What it does | Default |
|---|---|---|
| **Appearance** | **System**, **Dark** or **Light** colors for Slopify on this computer. System follows your computer's light or dark setting and changes with it. Your videos are not affected. | System |
| **Start Slopify when I log in** | Slopify starts in the background when you log in, without opening a browser tab, so your bookmark always opens it. It uses your account's own start-up list, so no administrator password is needed, and turning it off removes exactly what it added. | Off |

In Docker, **Start at login** only shows whether Docker starts at login, when the installer checked, and where to change that. With Docker Desktop it names Docker Desktop's own setting: Docker Desktop → Settings → General → **Start Docker Desktop when you sign in to your computer**. Slopify starts whenever Docker does and never changes Docker's own settings. See [Start at Login](Start-at-Login).

## Remote access

"Open Slopify on your phone or laptop through Tailscale."

| Control | What it does | Default |
|---|---|---|
| **Open on my other devices (Tailscale)** | Has the Tailscale already on this computer serve Slopify's page at `https://<computer>.<tailnet>.ts.net`, reachable only from devices signed in to your tailnet. Shows the address with **Copy address** and a QR code. Uses Tailscale Serve, never Funnel. Turning it off removes only the serve setting Slopify added. Off, the line says Slopify answers only on this computer. | Off |
| **Use port 8443** | Shown when another Tailscale serve setting already uses HTTPS port 443: gives Slopify its own address on another port and leaves yours alone. | |
| **Check again** | Asks Tailscale again after you fixed what the notice says. | |

See [Remote Access](Remote-Access).

## AI agents

"Let Claude Code or Codex on this computer run Slopify for you." An agent can start and fix runs, edit your prompts and templates and answer checks set to External agent. It needs no key, like this page, and never uploads to YouTube. What it changes is marked by agent in the project's versions, in notifications and in the list below.

| Control | What it does |
|---|---|
| **Address for agents (MCP)** | This install's address with `/mcp`, for example `http://127.0.0.1:6969/mcp`. |
| **Claude Code** → **Copy** | Copies `claude mcp add --transport http slopify <address>`. Run it once in a terminal. |
| **Codex** → **Copy** | Copies the `[mcp_servers.slopify]` lines. Add them to `~/.codex/config.toml`. |
| Last connected | When an agent last connected, or "No agent has connected yet." |
| **What agents did** | The latest changes agents made, with the project or schedule and the time. |

There is nothing to turn on: the address works whenever Slopify runs. See [Agents (MCP)](Agents-MCP).

## About

"Your version, updates and where to get help."

| Control | What it does |
|---|---|
| Version | The version you run and whether it is up to date. |
| **Check for updates** | Checks for a newer Slopify and installs it. **Help** at the foot of the rail does the same, and says while one is ready. If a video is being made, the update waits until it finishes, and you can cancel it meanwhile. Slopify restarts itself and the page reconnects. |
| **Read what's new** | Opens **What's new** for the version you are running. |
| **How I run a channel with it** | The maker's own story of running a channel with Slopify. |
| **Something wrong?** → **Download diagnostics** | Saves `slopify-diagnostics.json`: the Slopify version, your system and Node version, which services are set up or found, the project count and the state of the model list. It never holds your keys, prompts or project content. Attach it to a bug report. Also in `Ctrl+K`. |

"Free. Your keys, your machine." Slopify is made by Gent Bajko under the Apache License 2.0. The welcome screen (what this computer can do, the samples, a first short) opens again from **Help** → **Tutorials** → **Welcome screen** or `Ctrl+K` → **Open the welcome screen**. See [Updating and Patch Notes](Updating-and-Patch-Notes).

## Usage

"What this computer made. Slopify always adds these counts, anonymously, to slopify.stream's totals; there is no switch."

Shows **Videos made**, **Hours of narration**, **Images made**, **AI text read and written** (in tokens, pieces of about three quarters of a word) and **Projects**, then **AI text by part of the video**, read and written by service and model, and this computer's random number and the version. Before anything is made it says **Nothing made yet** with **Make your first video**. There are no other controls. Money figures are on each project's cost line (**See the breakdown**) and Home's **This week**. See [Costs and Run Cost](Costs-and-Run-Cost).

## What's new

"What changed in each version." Pick a **Version** to read its notes; yours is marked. The notes ship with the app, so they work offline. After an update, the new version's notes open by themselves once; a fresh install skips that. On a major update the What's new tour shows instead and links here. `Ctrl+K` → **What's new** opens this page. See [Updating and Patch Notes](Updating-and-Patch-Notes).

## Related pages

- [Keys and Services](Providers-and-Keys)
- [AI CLIs](AI-CLIs)
- [Models](Models)
- [Costs and Run Cost](Costs-and-Run-Cost)
- [Keyboard Shortcuts and Command Palette](Keyboard-Shortcuts-and-Command-Palette)
- [Where Your Files Live](Where-Your-Files-Live)
- [Backups](Backups)
- [Troubleshooting](Troubleshooting)
