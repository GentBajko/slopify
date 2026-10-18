---
generated_at_commit: d6a72d6428ff
generated_date: '2026-10-18'
capstone_version: 7.0.1
content_hash: 4c2cfd83fb7a
absorbed_from:
  - features/2026-09-30-slopify-mcp@2026-10-11
paths_covered:
  - ":(top)packages/web/src/routes/settings.tsx"
  - ":(top)packages/web/src/routes/settings-sections.ts"
  - ":(top)packages/web/src/routes/settings-preferences.tsx"
  - ":(top)packages/web/src/routes/settings-export.tsx"
  - ":(top)packages/web/src/routes/settings-readiness.tsx"
  - ":(top)packages/web/src/remote-access/**"
  - ":(top)packages/web/src/template-studio/settings-panel.tsx"
  - ":(top)packages/web/src/components/model-checks.tsx"
  - ":(top)packages/web/src/agents/**"
  - ":(top)packages/web/src/routes/settings-about.tsx"
  - ":(top)packages/web/src/routes/settings-backups.tsx"
  - ":(top)packages/web/src/routes/settings-files.tsx"
  - ":(top)packages/web/src/routes/settings-storage.tsx"
  - ":(top)packages/web/src/routes/usage.tsx"
  - ":(top)packages/web/src/autostart/autostart-settings.tsx"
  - ":(top)packages/web/src/components/welcome.tsx"
  - ":(top)packages/web/src/components/provider-keys.tsx"
  - ":(top)packages/web/src/components/provider-cli.tsx"
  - ":(top)packages/web/src/components/provider-health.tsx"
  - ":(top)packages/web/src/components/system-voices.tsx"
  - ":(top)packages/web/src/components/voices.tsx"
  - ":(top)packages/web/src/components/catalogue.tsx"
  - ":(top)packages/web/src/components/saved-tick.tsx"
  - ":(top)packages/web/src/video/loudness-controls.tsx"
  - ":(top)packages/web/src/notifications/settings-panel.tsx"
  - ":(top)packages/web/src/youtube/channel-links.tsx"
  - ":(top)packages/web/src/studio/settings-panel.tsx"
  - ":(top)packages/web/src/studio/posting-plan.tsx"
  - ":(top)packages/app/src/slices/studio/plan.ts"
  - ":(top)packages/app/src/slices/studio/plan-model.ts"
  - ":(top)packages/web/src/studio/extension-install.tsx"
  - ":(top)packages/web/src/onboarding/sample-settings.tsx"
  - ":(top)packages/web/src/trash/trash-settings.tsx"
  - ":(top)packages/web/src/patch-notes/settings-panel.tsx"
  - ":(top)packages/web/src/patch-notes/reader.tsx"
  - ":(top)packages/web/src/router.tsx"
---

# Settings

## Mode & job

Operate surface for everything install-wide: login autostart, remote access through Tailscale, provider keys and command-line tools, voices, the model catalogue and which models work for you, narration pacing, appearance and loudness, the template studio's sample budget, notifications (with the weekly report), the old channel-links pointer, the YouTube Studio pack and extension, files/export/import/disk space, daily backups, the trash, usage, patch notes and About. Route `/settings?section=<id>&note=<id>`; `settingsSectionOf` falls back to `providers`, and `note` is kept only for `patch-notes` and a safe id pattern (`packages/web/src/router.tsx:527`, `:543`, `packages/web/src/routes/settings.tsx:88`). Picking a section replaces the URL; opening a patch note pushes history so Back works (`packages/web/src/router.tsx:600`). `/usage` redirects to `?section=usage` (`packages/web/src/router.tsx:586`). The usage section has its own chapter (`09-usage.md`).

## Composition

### Frame

- kit `PageHeader`: crumb "Settings", title = the current section's label, meta = its one line (`packages/web/src/routes/settings.tsx:136`, `packages/web/src/routes/settings-sections.ts:6`). Header actions: "Check all" (only on Providers; "Checking…" while pending) and a secondary `FileLink` "Download diagnostics" (download icon, saves `slopify-diagnostics.json` from `/api/diagnostics`) with InfoTip `settings.diagnostics` (`packages/web/src/routes/settings.tsx:154`).
- kit `Workspace` with a sections column and no aside: 180 px rail + fluid main; below 768 px one column and the rail becomes a sideways-scrolling row of tabs (`packages/web/src/routes/settings.tsx:161`, `packages/web/src/styles/shell.css`).
- kit `Rail` "Settings sections" with seven groups, one rail item each; a group with more than one section shows them as `TabLinks` above the section (`settingsGroups` in `packages/web/src/routes/settings-sections.ts`): Connections (Providers, Voices, Models, Agents (MCP)), Production defaults (Production defaults, Template studio), Notifications, Publishing (Channel links, YouTube Studio), Backup & storage (storage, trash), General (General, Remote access), About (About, Usage, Patch notes). `?section=` keeps each section's own id; the old `backups` id opens Backup & storage (`settingsSectionOf`). Sections and their lines:

| id | Rail label | Meta line | Renders | Source |
|---|---|---|---|---|
| general | General | How Slopify looks and how it starts on this computer. | `AppearanceSetting`, `AutostartSettings` | `packages/web/src/routes/settings.tsx:197` |
| remote-access | Remote access | Open Slopify on your phone or laptop through Tailscale, only inside your tailnet. | `RemoteAccessSettings`; see `28-remote-access.md` | `packages/web/src/remote-access/remote-access-settings.tsx:30` | `packages/web/src/autostart/autostart-settings.tsx:42` |
| providers | Providers | Keys stay on this machine and go only to their provider. Readiness is checked again before each run. | `ConnectionReadiness`, `Welcome`, `ProviderKeys`, `ProviderHealthCheck` | `packages/web/src/routes/settings.tsx:189` |
| voices | Voices | A wrong voice ID shows up when the audio stage uses it. | `Voices` | `packages/web/src/components/voices.tsx:25` |
| models | Models | New models, prices and retirements, checked once a day. | `CatalogueSettings`, `ModelChecksSettings` (models that work for you; see `29-settings-models.md`) | `packages/web/src/components/catalogue.tsx:41` |
| agents | Agents (MCP) | Let an AI agent on this computer, such as Claude Code or Codex, run Slopify. | `AgentSettings` | `packages/web/src/agents/agent-settings.tsx:19` |
| playback | Production defaults | How new runs pace the narration and level the volume, and which model times English captions. | `ProductionDefaults` (`packages/web/src/routes/settings-preferences.tsx`) | `packages/web/src/routes/settings-preferences.tsx:85` |
| template-studio | Template studio | The most a template's paid samples may spend in one day. | `TemplateStudioSettings` | `packages/web/src/template-studio/settings-panel.tsx:21` |
| notifications | Notifications | When a run finishes, fails, waits for you, or a review needs a decision. | `NotificationSettings` | `packages/web/src/notifications/settings-panel.tsx:31` |
| channel-links | Channel links | The links a YouTube description's {{Name}} placeholders fill from. | `ChannelLinksSettings` | `packages/web/src/youtube/channel-links.tsx:101-115` |
| studio | YouTube Studio | The playlist upload packs name, and the Studio extension's pairing. (The release times are in this section though the meta does not name it.) | `StudioSettings` | `packages/web/src/studio/settings-panel.tsx:22` |
| storage | Backup & storage | Daily backups, export and import, and what uses disk space. | `BackupSettings`, `FilesFolder`, `StorageTools`, `SampleSettings` | `packages/web/src/routes/settings.tsx:217` |
| backups | (no rail item) | Old id, opens Backup & storage, where `BackupSettings` now renders. | `BackupSettings` |
| trash | Trash | Deleted projects, prompts, intros and outros, templates and schedules, kept for 30 days. Channels, cast, PDF themes and episode summaries are deleted permanently. | `TrashSettings` | `packages/web/src/trash/trash-settings.tsx:40-221` |
| usage | Usage | This machine only. The same counters, anonymised, feed slopify.stream. | `UsageBoard` (see `09-usage.md`) | `packages/web/src/routes/usage.tsx:18` |
| patch-notes | Patch notes | What changed in each version of Slopify. | `PatchNotesSettings` | `packages/web/src/patch-notes/settings-panel.tsx:52` |
| about | About | Free and open source, running on your machine with your own keys. | `AboutSettings` | `packages/web/src/routes/settings-about.tsx:39` |

The main column is one `<section>` labelled with the section, children stacked with `gap-10` (`packages/web/src/routes/settings.tsx:188`). Every block opens with a kit `SectionHead`; its help sits behind an InfoTip and its actions at its right.

Ctrl+K commands while on Settings: "Check all providers" (jumps to Providers and runs the check), "Back up now" (jumps to Backups; a failure toasts "The backup didn't start: … Open Settings → Backup & storage to see its state."), "Download diagnostics" (`packages/web/src/routes/settings.tsx:119`); "Export everything" (context Backup & storage, `packages/web/src/routes/settings-export.tsx:187`); "Check for new models" (context Models, `packages/web/src/components/catalogue.tsx:114`).

### General

`SectionHead` "Start Slopify when I log in" (InfoTip `settings.autostart`). Native install: a kit `Switch` with the same label, disabled when unavailable or pending, then the server's summary plus "Login entry: <path>" when on. Docker install: `DockerStatus`, a bold "Starts with Docker: yes/no/unknown", the summary, the how-to line and "Checked by the installer on <date>." (`packages/web/src/autostart/autostart-settings.tsx:86-108`, `:64`, `:86`).

### Providers

- `ConnectionReadiness` first (`packages/web/src/routes/settings-readiness.tsx:42`): a list "What is connected" with one line per kind of work, Text (articles, scripts and descriptions), Voice (narration, audiobooks and podcasts) and Images (images and videos), each a `Status` word "Ready" or "Needs setup" beside the connected providers' names, or "Not connected: needed for <work>. Set one up below."

- `Welcome` (first launch only): a `Callout` titled with the server's message, its detail, "Found: <CLI name version, …>" and quiet "Got it" (`packages/web/src/components/welcome.tsx:40`).
- On a fresh install (no key saved): "Paste a key to make its provider selectable on Play." (`packages/web/src/components/provider-keys.tsx:102`).
- Three family sections, Text, Speech, Images, each a two-column grid from `lg` (list left, the picked provider's setup right; stacked below, where picking a row scrolls the setup into view smoothly) (`packages/web/src/components/provider-keys.tsx:24`, `:62`, `:110`). The list is a kit `List` of `ListRow`s: display name, meta "Command line" / "Built in, no key" / "API key", and a kit `Status` word: "Key saved" / "No key", "Ready" / "Needs attention" / "Not found" for CLIs, "Ready" / "Not found" for the built-in voice (`packages/web/src/components/provider-keys.tsx:40`, `:129`, `packages/web/src/components/provider-cli.tsx:37`, `packages/web/src/components/system-voices.tsx:41`). The first provider not yet usable is open on arrival (`packages/web/src/components/provider-keys.tsx:74`).
- Key setup (`KeyDetail`): h3 "Set up <name>" (or the name once a key is saved) with the provider InfoTip and meta "<Family> · needs an API key" / "a key is saved"; the provider's guide steps (sign-up, key page, credit, permissions, docs), folded under "Where to get a key" once a key exists; `Field` "<name> API key" (password input, placeholder "Paste API key" or a fixed 12-dot mask, help "Stored on this computer only. Never in backups or exports.") with primary "Save"; a row of "Test" (tests the pasted key, else the stored one; InfoTip `settings.providers.test-key`), quiet "Remove" (disabled without a key) and a fixed 52 px Saved-tick slot (`packages/web/src/components/provider-keys.tsx:178`, `:276`, `:285`, `:296`, `:345`).
- CLI setup (`CliProviderDetail`): h3 name with InfoTip, meta "<Family> · command line, no key needed"; a `Lamp` and status line (`aria-live`: the readiness issue, "Not found on PATH", "Not found at saved path", "Installed, version …"); "Command" with the command in `Code`, truncated, full text on hover; "Change path"/"Close path" toggling a form with `Field` "Executable path" (help: leave blank to find the default on PATH, absolute path without quotes) and primary "Save path" ("Checking…" while pending). When the CLI is managed on the host, the toggle is replaced by "Managed on host" with InfoTip `settings.cli.managed-on-host` and no form (`packages/web/src/components/provider-cli.tsx:48`, `:120`, `:133`, `:151`, `:201`).
- Built-in voice setup (`SystemVoiceDetail`): h3 name, meta "Speech · built into this computer, no key needed", and a live line naming the speech program found or the issue (`packages/web/src/components/system-voices.tsx:50`).
- `ProviderHealthCheck` "Health check" (InfoTip `settings.health`; its button is the header's "Check all"): before a run "Not checked yet." / "Checking every provider…"; after, a list per provider with a `Status` word (Ready / Check / Needs fixing), quiet "Check again" per row, and each check line toned by state; a closing line "Checked at <time>." or "Not set up and not used anywhere: <names>." (`packages/web/src/components/provider-health.tsx:67`, `:12`, `:104`, `:136`).

### Voices

A `sl-table` (min 640 px, scrolls sideways) with columns Name, Provider, Voice ID, Languages (InfoTip), Real person (InfoTip; a per-row `Switch`) and a quiet "Remove" per row (`packages/web/src/components/voices.tsx:70`, `:121`, `:142`). Below, `SectionHead` "Add a voice" and a five-column row: `Field` "Voice name", `Select` "Provider" (speech providers; "No speech provider" when none), "Voice ID" (a text input; a `SystemVoicePicker` for the built-in voice; a "Pick a Gemini voice" select for Google TTS; an Inworld help line), `Field` "Languages" (placeholder "es, de", help "Codes such as es, de."), and primary "Add voice" (`packages/web/src/components/voices.tsx:168`, `:248`, `:290`, `:299`, `:345`).

### Models

Two blocks: the catalogue below and `ModelChecksSettings` (`packages/web/src/routes/settings.tsx:205`), whose "Models that work for you" and "New for you" sections are documented in `29-settings-models.md`.

`SectionHead` "Model catalogue" (InfoTip) with "Check now" ("Checking…") and quiet "Replace with published file" ("Replacing…", InfoTip `settings.models.replace`), both disabled without a catalogue path; a `dl` of Catalogue file (mono), Verified, Last checked (date · "<n> new, <n> repriced, <n> retired" or "No changes"); then "New: …" and "Retired: …" lines (`packages/web/src/components/catalogue.tsx:127`, `:141`, `:167`). Section "Retired models in use" with primary "Switch all" ("Switching…"; disabled when nothing is switchable) and a list: kicker Template/Schedule/Draft/Project, name, "<slot>: <model> (retired | no longer listed)", a waiting-toned blocked reason, and "Switch to <replacement>" or "No replacement" (`packages/web/src/components/catalogue.tsx:181`, `:202`).

### Remote access

`SectionHead` "Remote access" (InfoTip `settings.remote-access`): a `Switch` that has Tailscale serve Slopify's page on the person's tailnet, a status line with the summary, the address in `Code` with a QR code and a "Copy address" button (toast "Address copied."), and a `Callout` with the fix and "Check again" (or "Use port <n>") when Tailscale is missing, signed out or the port is taken. The switch is disabled when Tailscale is unavailable or when the page was opened through the tailnet address ("Turn it on or off on the computer Slopify runs on."). The states, the Docker variant and the copy are in `28-remote-access.md` (`packages/web/src/remote-access/remote-access-settings.tsx:30`).

### Agents (MCP)

`SectionHead` "Agents (MCP)" (InfoTip `settings.agents`) over (`packages/web/src/agents/agent-settings.tsx:50`):
- this install's MCP address in `Code`, selectable (`mcpUrl(api.origin)`, `packages/app/src/slices/agents/model.ts`);
- two setup blocks, each a bold label, the line in `Code` and a quiet "Copy" button (copy icon; aria-label "Copy the Claude Code setup" / "Copy the Codex setup") with a line under it: Claude Code `claude mcp add --transport http slopify <url>` ("Run it once in a terminal."), Codex `[mcp_servers.slopify]` / `url = "<url>"` ("Add it to ~/.codex/config.toml."). Copy toasts "<Agent> setup copied. <where>"; a blocked clipboard says so and asks the person to select and copy the line;
- a kit `QueryState` over `GET /api/settings/agents`: "Last connected <time>." (a `Stamp` with the exact time as its title) or "No agent has connected yet."; then h3 "What agents did", the latest 20 agent changes as "<tool title> · <project or schedule> · <time>", or "No agent has changed anything yet." A project's own agent changes are also in its History view (`03-project.md`).

When the page is opened through the Remote access (Tailscale) address, the MCP address shown is the one on the computer itself, with the line "Agents connect on the computer Slopify runs on, never through the remote address: this is the address there." (`packages/web/src/agents/agent-settings.tsx:33`, `:54`). A change made by the in-app assistant carries " · by assistant" in "What agents did" (`packages/web/src/agents/agent-settings.tsx:107`).

There is no switch and no token: `/mcp` is on whenever Slopify runs (`logic/45-mcp-agent-access.md`).

### Production defaults (and Appearance, now under General)

Two-column grid from `md` (`packages/web/src/routes/settings-preferences.tsx:103`): `Field` "Silence between segments" (number input 0–30, "seconds", primary "Save", 52 px Saved-tick slot; help "Seconds of quiet between narrated segments.") (`packages/web/src/routes/settings-preferences.tsx:105`); "Appearance" `Segmented` System / Dark / Light with InfoTip, saved on change (`packages/web/src/routes/settings-preferences.tsx:187`); `Field` "Subtitle timing model" (native `Select`: Most accurate (378 MB, recommended) / Balanced (189 MB) / Smallest (95 MB, less accurate), saved on change; one help line "Bigger hears the narration more accurately and, on most computers, is also faster. It downloads once, the first time captions are timed."; InfoTip `settings.subtitle-model`) (`packages/web/src/routes/settings-preferences.tsx`); full-width `LoudnessControls`: `Switch` "Level the volume for new runs" and, when on, "Video volume" and "Audio files volume" fields each with a dB input and a % input and help naming the LUFS target and true-peak cap (`packages/web/src/routes/settings-preferences.tsx:172`, `packages/web/src/video/loudness-controls.tsx:29`, `:119`). Below them, full width, the "Rendering" group (`RenderSettings`, `packages/web/src/routes/settings-preferences.tsx`): an h3 `SectionHead` with the meta "How this computer encodes videos and shorts. Changing these never marks anything outdated." over three `Field`s with native `Select`s in a three-column grid from `md`, each saved on change with its own "The … wasn't saved." error: "Video encoder" (Processor (x264), plus NVIDIA graphics card (NVENC) only when `GET /api/settings/encoders` says it works or it is the saved choice; the help line names the card's state or "No NVIDIA encoder found on this computer."; InfoTip `settings.video-encoder`), "Clip encoding" (Thorough / Fast; InfoTip `settings.clip-encoding`), "Render priority" (Normal / Background (your other programs come first); InfoTip `settings.render-priority`).

### Template studio

`TemplateStudioSettings` (`packages/web/src/template-studio/settings-panel.tsx:23`): `Field` "Daily sample budget" (InfoTip `settings.template-studio.budget`; a `$` number input 0 to 1000 in 0.50 steps, primary "Save" disabled with the reason "Nothing changed" or the problem "Enter an amount between $0.00 and $1,000.00."; help names today's spend, unpriced calls and what is left); `Field` "Designed pieces: daily sample budget" (InfoTip `settings.template-studio.design-budget`; the same `$` input and checks, primary "Save designed pieces' budget"; help names what design samples spent today and what is left); `Switch` "Samples may use my CLI plans" (InfoTip `settings.template-studio.plans`, off by default; the line under it says whether samples may run steps on a Claude Code or Codex plan and that such usage has no dollar price); and "Samples for all templates", a total priced when the section opens, an "Accept steps with no known price" checkbox when a fitting sample has an unknown price, and a secondary "Make samples for all · <about $>" that queues every sample that fits today's budget and says how many wait (`packages/web/src/template-studio/settings-panel.tsx:157-245`). Studio behavior: `25-template-studio.md`.

### Notifications

`SectionHead` "Browser and phone" (InfoTip `settings.notifications`) over three blocks (`packages/web/src/notifications/settings-panel.tsx:31`): `Switch` "Browser notifications" (asks the browser permission when turned on) with quiet "Send test notification" (disabled reason "Turn Browser notifications on first.") and "Works while any Slopify tab is open." (`:84`); `Switch` "Run sounds" with quiet "Play start" / "Play end" and a line on what chimes and when (`:125`); `Field` "Notification URL" (url input, placeholder "https://ntfy.sh/your-topic", help "Works with no tab open, for example an ntfy topic on your phone.") with primary "Save" and quiet "Send test notification" (`:183`). A fourth block, `Switch` "Weekly report" (InfoTip `settings.notifications.weekly`, off by default, applies at once), sends last week's made, failed and cost to the Notification URL each Monday from 09:00 (`packages/web/src/notifications/settings-panel.tsx:260`).

### Channel links

`SectionHead` "Named links" and a paragraph saying each channel keeps its own links on its Brand tab, and that links saved here before fill the default channel's descriptions until its Brand tab is saved; `ButtonLink` "Open the default channel's links" → `/channels/$channelId` of the default channel. No editing happens here (`packages/web/src/youtube/channel-links.tsx:83`).

### YouTube Studio

`SectionHead` "Upload pack and extension" (InfoTip) over, in order, Playlists, Release times, pairing and install (`packages/web/src/studio/settings-panel.tsx:22-42`):

- `Field` "Playlists": a channel `Select` ("Every channel (default)" plus each channel), one row per playlist (name input, "On by default" checkbox, quiet "Remove"), secondary "Add playlist" (max 20), primary "Save playlists"; help text changes for the default list, a channel still using the default, and a channel's own list (`packages/web/src/studio/settings-panel.tsx:83`, `:107`, `:151`).
- `section[aria-label="Release times"]`, h3 "Release times" (`packages/web/src/studio/posting-plan.tsx:25-153`): a line that each schedule sets when its videos and shorts go out, one line for each day it runs with a time for every short its template makes, under Calendar → Schedules → Edit → Release times (the first words link to Calendar → Schedules), and "See and move them in Calendar → Releases." (`:87-94`). Under it, one `TextLink` per live schedule by name, straight to that schedule in Calendar → Schedules (`:95-103`). When an older posting plan still has lines, an info `Callout` "An older posting plan still applies" says how many lines it has and what it still gives, with a secondary "Remove the old plan" disabled while it removes (`:104-122`). Then a sentence "Upload and schedule each video and short at least [number input 72 px, 1–168, 'Hours before release'] hours before its release, so YouTube's copyright and ad checks finish while it is private." whose input saves on blur when it holds a new whole number in range (`:123-145`); then a `Switch` "Post and pin each video's comment once it is public (the extension posts it in your name)" that saves on toggle (`:146-151`). The old plan is edited nowhere in Settings; with nothing saved it has no lines and the zone is the computer's (`packages/app/src/slices/studio/plan.ts:26-34`).
- "Extension pairing token" (InfoTip): the token in a select-all `code`, quiet "Copy" and "New pairing token", and a help line "No extension is paired. …" or "Paired with the extension at <origin>. A new token unpairs it." (`packages/web/src/studio/settings-panel.tsx:247-307`).
- h3 "Install the Studio extension": `Segmented` "Browser" (Chrome, Edge, Brave / Firefox), `FileLink` "Download for Chrome|Firefox" (a zip served by Slopify), and three numbered install steps ending with pairing (`packages/web/src/studio/extension-install.tsx:27`).

### Backup & storage

Four blocks in order: `BackupSettings` (see Backups below), `FilesFolder`, `StorageTools` (which holds the project list) and `SampleSettings` (`packages/web/src/routes/settings.tsx:217`):

- `FilesFolder` "Your files" (InfoTip `settings.files`, meta = the folder path) with a `dl` of Projects / Automatic backups / Exports paths (`packages/web/src/routes/settings-files.tsx:123`, `:223`). Native actions: primary "Move to Documents/Slopify" (hidden when already there or no Documents folder), "Open folder", quiet "Choose another folder" opening a form with `Field` "New folder" (help "The full path; it must be empty or new.") and "Move here" (`packages/web/src/routes/settings-files.tsx:124`, `:150`). Docker: "Open folder" only, plus the host command in `Code` with quiet "Copy command" and a `--projects-dir` note (`packages/web/src/routes/settings-files.tsx:73`).
- `StorageTools`: `SectionHead` "Export and import" (InfoTip) with "Export everything", "Import a backup" (hidden file input accepting `.tar` and `.zip`) and quiet "Clear leftover files" (InfoTip); the line "Provider keys are never included in a backup. After importing, enter them again in Settings → Providers."; progress lines; the import result; then `SectionHead` "Disk space" (InfoTip) whose meta reads "<size> stored · <size> project files · <size> staged files" plus the trash share when deleted projects exist, followed by `ProjectStorageList` (`packages/web/src/routes/settings-export.tsx:303`).
- `ProjectStorageList`: "Keep outputs only frees a finished project's working files." (InfoTip) then a list sorted largest first: title, "<size> · outputs <size> · working files <size>", quiet "Keep outputs only" (disabled with a `title` reason when unfinished or nothing is removable) (`packages/web/src/routes/settings-storage.tsx:16`, `:45`, `:61`).
- `SampleSettings` "Sample projects" (InfoTip): three rows (The Library of Alexandria; The Wind in the Willows (audiobook); The Antikythera Mechanism (podcast)) with "In your projects" + "Open" link or "Not in your projects", then "Restore samples" and "Puts all three back as they shipped." (`packages/web/src/onboarding/sample-settings.tsx:12`, `:35`, `:56`).

### Backups

`SectionHead` "Daily backup" (InfoTip) with primary "Back up now"; a status row: left the last-result line, right "Next: <when>." / "Next: shortly." / "Automatic backups are off."; below, the last result's detail (a danger `Callout` "Why the last backup stopped" when it failed) (`packages/web/src/routes/settings-backups.tsx:111`, `:123`, `:257`, `:270`). Then `Switch` "Back up automatically", a two-column grid of `Field` "Time of day" (time input, help "<browser time zone> time"), `Field` "Keep last" (1–30, help "Backups kept in the folder.") and full-width `Field` "Folder" (placeholder = the default folder; help says where backups land and how many exist), and primary "Save" with a 52 px Saved-tick slot (`packages/web/src/routes/settings-backups.tsx:160`, `:169`, `:182`, `:200`, `:224`).

### Trash

`SectionHead` "Trash" (InfoTip) and a list "Deleted items": name, "<kind> · deleted <date> · <n> days left" (kind: Project, Prompt · <kind>, Intro, Outro, Template, Schedule, Design, Design template; `packages/web/src/trash/kinds.ts:6-31`), small "Restore" and destructive small "Delete now" (`packages/web/src/trash/trash-settings.tsx:186-197`, `:107`, `:27`).

### Patch notes

"Latest version" `SectionHead` (meta "<version>, released <d Month yyyy>." plus "The version you are running." when it matches; InfoTip) over a `PatchNoteReader` (kit `ReadingView`: contents from `##` headings, search, copy); below, `<details>` "Earlier versions (<n>)" listing each note with "Read" (`packages/web/src/patch-notes/settings-panel.tsx:104-108`, `:111-125`, `packages/web/src/patch-notes/reader.tsx:12`). Opening one shows quiet "Back to the latest patch notes" (arrow icon), `SectionHead` "Earlier version" and that note (`packages/web/src/patch-notes/settings-panel.tsx:85-91`).

### About

`max-w-prose` column: `SectionHead` "About", a paragraph on free and open source with own keys, the updates pointer ("the circular-arrows button at the foot of the sidebar (at the top on a phone)", InfoTip), "What's new in this version" (opens the current patch note; InfoTip), the credit and Apache License 2.0 line, then a "Links" list: GitHub, Patreon, Buy Me a Coffee (each with its glyph), "How I run a channel with it", all opening in a new tab (`packages/web/src/routes/settings-about.tsx:16`, `:46`).

## States

| Section | State | Rendering | Source |
|---|---|---|---|
| General | loading / error | "Checking…" status; danger "Starting at login couldn't be checked: …"; switch errors under it | `packages/web/src/autostart/autostart-settings.tsx:49`, `:75` |
| Remote access | loading / error / problem | status "Checking Tailscale…" while loading; danger "Remote access couldn't be checked: …"; a `Callout` carries the summary, the fix and "Check again" (see `28-remote-access.md`); a refused change shows the server's sentence as an alert line | `packages/web/src/remote-access/remote-access-settings.tsx:56`, `:62`, `:108` |
| Template studio | loading / error | a raised placeholder block while the settings load; danger "The template studio's settings didn't load: … Reload the page to try again."; "The budget wasn't saved: …" under the field; "The samples for all couldn't be priced: …" | `packages/web/src/template-studio/settings-panel.tsx:49`, `:68`, `:152` |
| Notifications | weekly report | switch disabled until it loads or while saving; "The Weekly report setting didn't load: … Reload the page to try again."; "Weekly report wasn't changed: … Try the switch again." | `packages/web/src/notifications/settings-panel.tsx:260` |
| Providers | loading | `SkeletonKeys`: three family blocks of raised bars and a detail placeholder, `role="status"` "Loading providers" | `packages/web/src/components/provider-keys.tsx:417` |
| Providers | list error | danger paragraph with the message | `packages/web/src/components/provider-keys.tsx:77` |
| Agents (MCP) | loading / error | `LoadingBlock` "Loading agent activity…" (three rows); an unreadable answer shows `QueryState`'s error for "Agent activity" with its retry, never an empty list; the setup lines stay usable | `packages/web/src/agents/agent-settings.tsx:65` |
| Providers | key save / test / remove | Save disabled until something is typed; the draft clears on save and a Saved tick shows 2 s; save and remove failures are the `Field` error; test result is a status (accent) or alert (danger) line; Test disabled with "Paste a key first."; Remove asks `ConfirmDialog` "Remove the <name> key?", "Projects that used this provider cannot retry until a key is saved.", confirm "Remove key" | `packages/web/src/components/provider-keys.tsx:218-235`, `:336-343`, `:346-358`, `:371-377` |
| Providers | CLI path | pending "Checking…"; server refusal as the `Field` error; Saved tick after success | `packages/web/src/components/provider-cli.tsx:167`, `:191` |
| Providers | health | "The health check didn't finish: … Press Check all to try again."; per-row "The check didn't finish: … Press Check again on the provider to try again." | `packages/web/src/components/provider-health.tsx:88` |
| Voices | loading / empty / error | one raised bar row; "Add a voice ID from your text-to-speech provider. Audio needs one to narrate."; list error replaces the table | `packages/web/src/components/voices.tsx:100-103`, `:111`, `:57` |
| Voices | add refused | the refused field shows the server message and Add stays disabled until that field changes; request errors below the row | `packages/web/src/components/voices.tsx:219`, `:359` |
| Voices | real person / remove | optimistic switch while pending; "Couldn't change Real person: … Press the switch again."; `ConfirmDialog` "Remove <name>?", "Projects that used this voice keep the audio they made with it.", "Remove voice" | `packages/web/src/components/voices.tsx:121`, `:151`, `:168` |
| Models | loading / problems | catalogue fields read "Not available", "date unavailable", "Not checked yet"; retired list "Looking…" then "Nothing uses a retired model."; one danger line carries the first check, replace, read or sync warning; check result and Switch all result are toasts | `packages/web/src/components/catalogue.tsx:147`, `:202`, `:107`, `:62-64`, `:94-99` |
| Playback | loading / error | two raised blocks `role="status"` "Loading settings"; danger paragraph on error | `packages/web/src/routes/settings-preferences.tsx:75` |
| Playback | gap invalid / saved | "The silence gap is a whole number of seconds between 0 and 30." as the field error, Save disabled; Saved tick 2 s | `packages/web/src/routes/settings-preferences.tsx:28`, `:143` |
| Playback | appearance / loudness | written to the settings cache before the request and rolled back if refused; loudness out of range shows the dB/% range sentence | `packages/web/src/routes/settings-preferences.tsx:45`, `packages/web/src/video/loudness-controls.tsx:75` |
| Notifications | permission | switch disabled while the prompt is open; refusal, dismissal or blocked site storage each give a sentence naming the browser setting to change; test that can't show says to set a Notification URL instead | `packages/web/src/notifications/settings-panel.tsx:54`, `:24` |
| Notifications | URL | input disabled until the saved value loads; rule problem, save or test errors as one alert line; toasts "Notification URL saved." / "removed." / "Test notification sent. …" | `packages/web/src/notifications/settings-panel.tsx:180`, `:164`, `:173` |
| YouTube Studio | playlists | "A playlist name is longer than YouTube allows (<n> characters). Shorten it." or `"<name>" is listed twice. Remove one.`; Save playlists disabled until edited and valid; toast "Playlists saved." | `packages/web/src/studio/settings-panel.tsx:178`, `:162` |
| YouTube Studio | release times | "Loading the release settings…" until it loads, a load-failed line with retry if it fails; toasts "Removed the old posting plan. Each schedule's release times apply now." / "The old posting plan wasn't removed: <message> Try Remove the old plan again."; lead time: "Each upload is now due <n> hours before its release." / "The lead time wasn't saved: <message>" (it also refreshes Calendar → Releases); the comment switch is disabled while saving and toasts "Not saved: <message>" on failure | `packages/web/src/studio/posting-plan.tsx:35-90` |
| YouTube Studio | pairing | token shows "…" while loading; copy toasts; "New pairing token made. Pair the extension again with it." | `packages/web/src/studio/settings-panel.tsx:247-307`, `:201` |
| Backup & storage | files | "Loading…" / "Where your files are is unavailable. Reload the page to try again."; move progress "Copying|Checking the copy of your files to <target>: <n> of <n> files (…). Keep Slopify running until it finishes." with a `Meter`, polled every second; failed/interrupted `Callout` (danger / waiting) with "Continue moving"; done `Callout` "Your files are now in <target>" naming the old folder still holding a copy | `packages/web/src/routes/settings-files.tsx:66-67`, `:182`, `:194-212`, `:214-217` |
| Backup & storage | export | "Preparing the backup…"; "Downloading <size> (<n> projects). Your browser's downloads show its progress; keep Slopify running until it finishes." with "Dismiss"; a not-ready answer shows the server's reason | `packages/web/src/routes/settings-export.tsx:238`, `:244` |
| Backup & storage | import | size check before upload (empty file; legacy .zip over 100 MB); "Uploading the backup: <sent> of <total>" with a `Meter`; "Checking and importing the backup… large projects can take a minute."; failure sentence names the accepted files; success toast "Backup imported." and the `ImportResult` list (h3 "Imported the backup from <date>", per-kind added / renamed "(imported)" / already here (now including Designs and Design templates, `packages/web/src/routes/settings-export.tsx:354`), paused schedules, settings, fonts, usage, provider-keys reminder, skipped projects with reasons, "Dismiss") | `packages/web/src/routes/settings-export.tsx:277`, `:329` |
| Backup & storage | cleanup / disk | toast "Cleared <n> leftover project file(s) and <n> unused upload(s)."; disk meta skeleton bar, or "Storage usage is unavailable. Reload the page to try again." | `packages/web/src/routes/settings-export.tsx:172`, `:296` |
| Backup & storage | keep outputs | `ConfirmDialog` `Keep only the outputs of "<title>"?` with the full list of what is removed and what stays; row button "Removing…"; toast "Freed <size> from …" or "Nothing left to remove from …"; errors under the list | `packages/web/src/routes/settings-storage.tsx:158`, `:176`, `:44-45` |
| Backup & storage | samples | "Restoring…"; status slot "The samples are back in Projects." or the error | `packages/web/src/onboarding/sample-settings.tsx:57`, `:61` |
| Backups | loading / running | skeleton bar in the status row; form fields disabled until loaded; "Backing up now…" and polling every 2 s while running; "Back up now" disabled while running; toast "Backup started. Its result shows here when it finishes." | `packages/web/src/routes/settings-backups.tsx:108`, `:67`, `:55` |
| Backups | errors | "The backup settings couldn't be read: …" replaces the form; "Keep between 1 and 30 backups." field error; save and run errors as alert lines; waiting result "Waiting for projects to finish." | `packages/web/src/routes/settings-backups.tsx:131`, `:23`, `:125`, `:235` |
| Trash | loading / empty / error | "Loading the trash…"; `EmptyState` "The trash is empty" / "Anything you delete stays here for 30 days before it is removed for good."; error paragraph | `packages/web/src/trash/trash-settings.tsx:96` |
| Trash | restore / delete | buttons disabled while either runs ("Working on it"); toasts `Restored "<name>".` or restored under a new name, plus "The schedule is paused. Press Resume on Schedules to run it again."; `ConfirmDialog` `Delete "<name>" for good?` with a kind-specific consequence, "Delete for good" / "Keep it" | `packages/web/src/trash/trash-settings.tsx:64`, `:138` |
| Patch notes | loading / error / unknown note | "Loading the patch notes…"; danger `Callout` "The patch notes did not load" with "Try again"; "This version of Slopify has no patch notes."; unknown `note` shows a status line and falls back to the latest | `packages/web/src/patch-notes/settings-panel.tsx:62`, `:72`, `:97` |
| About | What's new fails | toast "The patch notes did not open: … Open Settings → About → Patch notes to try again." | `packages/web/src/routes/settings.tsx:235` |

## Motion

Saved ticks fade in over 150 ms (`animate-tick-in`), none under reduced motion (`packages/web/src/components/saved-tick.tsx:32`, `packages/web/src/styles/index.css:90`). Picking a provider on one column scrolls its setup into view with `behavior: "smooth"` (`packages/web/src/components/provider-keys.tsx:66`). Progress is shown by kit `Meter` fills, not animation (`packages/web/src/routes/settings-export.tsx:258`, `packages/web/src/routes/settings-files.tsx:187`). No other authored motion (`packages/web/src/routes/settings.tsx`).

## Copy

Section labels and meta lines are the table above (`packages/web/src/routes/settings-sections.ts:6`). Register: short second-person sentences that say what happens and where to go next ("After importing, enter them again in Settings → Providers.", "Keep Slopify running until it finishes.") (`packages/web/src/routes/settings-export.tsx:233`, `:244`). Error lines name what failed, why, and the button or screen that fixes it ("Press Check all to try again.", "Open Settings → Backup & storage to see its state.") (`packages/web/src/components/provider-health.tsx:90`, `packages/web/src/routes/settings.tsx:112`). Provider family titles read Text, Speech, Images (`packages/web/src/components/provider-keys.tsx:25`).

## Not in play

- No app account, sign-in or host-service installer; host CLI sign-in and setup remedies run on the host, and a host-managed CLI shows "Managed on host" with no path form (`packages/web/src/components/provider-cli.tsx:133`).
- Channel links are not edited here; the section only links to the default channel's Brand tab (`packages/web/src/youtube/channel-links.tsx:101-115`).
- No page-level save: every block saves itself (`packages/web/src/routes/settings-preferences.tsx:85`, `packages/web/src/routes/settings-backups.tsx:192`).
- Provider keys never appear in the page after save (fixed mask; draft cleared on the answer) and are never in backups (`packages/web/src/components/provider-keys.tsx:31`, `:214`, `:298`).
- No section-level aside rail (`Workspace` has no `aside`) (`packages/web/src/routes/settings.tsx:161`).
