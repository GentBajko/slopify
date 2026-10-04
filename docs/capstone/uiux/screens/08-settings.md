---
generated_at_commit: 14480f26c13e
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: 4c2cfd83fb7a
paths_covered:
  - ":(top)packages/web/src/routes/settings.tsx"
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

Operate surface for everything install-wide: login autostart, provider keys and command-line tools, voices, the model catalogue, narration pacing, appearance and loudness, notifications, the old channel-links pointer, the YouTube Studio pack and extension, files/export/import/disk space, daily backups, the trash, usage, patch notes and About. Route `/settings?section=<id>&note=<id>`; `settingsSectionOf` falls back to `providers`, and `note` is kept only for `patch-notes` and a safe id pattern (`packages/web/src/router.tsx:350`, `:364`, `packages/web/src/routes/settings.tsx:174`). Picking a section replaces the URL; opening a patch note pushes history so Back works (`packages/web/src/router.tsx:417`). `/usage` redirects to `?section=usage` (`packages/web/src/router.tsx:409`). The usage section has its own chapter (`09-usage.md`).

## Composition

### Frame

- kit `PageHeader`: crumb "Settings", title = the current section's label, meta = its one line (`packages/web/src/routes/settings.tsx:250`, `:99`). Header actions: "Check all" (only on Providers; "Checking…" while pending) and a secondary `FileLink` "Download diagnostics" (download icon, saves `slopify-diagnostics.json` from `/api/diagnostics`) with InfoTip `settings.diagnostics` (`packages/web/src/routes/settings.tsx:256`, `:262`).
- kit `Workspace` with a sections column and no aside: 180 px rail + fluid main; below 768 px one column and the rail becomes a sideways-scrolling row of tabs (`packages/web/src/routes/settings.tsx:275`, `packages/web/src/styles/shell.css:592`, `:985`).
- kit `Rail` "Settings sections" with seven groups, one rail item each; a group with more than one section shows them as `TabLinks` above the section (`settingsGroups` in `packages/web/src/routes/settings-sections.ts`): Connections (Providers, Voices, Models), Production defaults (playback), Notifications, Publishing (Channel links, YouTube Studio), Backup & storage (storage, trash), General, About (About, Usage, Patch notes). `?section=` keeps each section's own id; the old `backups` id opens Backup & storage (`settingsSectionOf`). Sections and their lines:

| id | Rail label | Meta line | Renders | Source |
|---|---|---|---|---|
| general | General | How Slopify looks and how it starts on this computer. | `AppearanceSetting`, `AutostartSettings` | `packages/web/src/autostart/autostart-settings.tsx:42` |
| providers | Providers | Keys stay on this machine and go only to their provider. Readiness is checked again before each run. | `Welcome`, `ProviderKeys`, `ProviderHealthCheck` | `packages/web/src/routes/settings.tsx:292` |
| voices | Voices | A wrong voice ID shows up when the audio stage uses it. | `Voices` | `packages/web/src/components/voices.tsx:25` |
| models | Models | New models, prices and retirements, checked once a day. | `CatalogueSettings` | `packages/web/src/components/catalogue.tsx:39` |
| playback | Production defaults | How new runs pace the narration and level the volume. | `ProductionDefaults` (`packages/web/src/routes/settings-preferences.tsx`) | `packages/web/src/routes/settings.tsx:675` |
| notifications | Notifications | When a run finishes, fails, waits for you, or a review needs a decision. | `NotificationSettings` | `packages/web/src/notifications/settings-panel.tsx:29` |
| channel-links | Channel links | The links a YouTube description's {{Name}} placeholders fill from. | `ChannelLinksSettings` | `packages/web/src/youtube/channel-links.tsx:83` |
| studio | YouTube Studio | The playlist upload packs name, and the Studio extension's pairing. (The posting plan is in this section though the meta does not name it.) | `StudioSettings` | `packages/web/src/studio/settings-panel.tsx:20` |
| storage | Backup & storage | Daily backups, export and import, and what uses disk space. | `FilesFolder`, `BackupSettings`, `StorageTools`, `SampleSettings` | `packages/web/src/routes/settings.tsx:306` |
| backups | (no rail item) | Old id, opens Backup & storage, where `BackupSettings` now renders. | `BackupSettings` |
| trash | Trash | Deleted projects, prompts, templates and schedules, kept for 30 days. | `TrashSettings` | `packages/web/src/trash/trash-settings.tsx:50` |
| usage | Usage | This machine only. The same counters, anonymised, feed slopify.stream. | `UsageBoard` (see `09-usage.md`) | `packages/web/src/routes/usage.tsx:18` |
| patch-notes | Patch notes | What changed in each version of Slopify. | `PatchNotesSettings` | `packages/web/src/patch-notes/settings-panel.tsx:52` |
| about | About | Free and open source, running on your machine with your own keys. | `AboutSettings` | `packages/web/src/routes/settings-about.tsx:39` |

The main column is one `<section>` labelled with the section, children stacked with `gap-10` (`packages/web/src/routes/settings.tsx:291`). Every block opens with a kit `SectionHead`; its help sits behind an InfoTip and its actions at its right.

Ctrl+K commands while on Settings: "Check all providers" (jumps to Providers and runs the check), "Back up now" (jumps to Backups; a failure toasts "The backup didn't start: … Open Settings → Backups to see its state."), "Download diagnostics" (`packages/web/src/routes/settings.tsx:211`); "Export everything" (context Backup & storage, `packages/web/src/routes/settings.tsx:471`); "Check for new models" (context Models, `packages/web/src/components/catalogue.tsx:112`).

### General

`SectionHead` "Start Slopify when I log in" (InfoTip `settings.autostart`). Native install: a kit `Switch` with the same label, disabled when unavailable or pending, then the server's summary plus "Login entry: <path>" when on. Docker install: `DockerStatus`, a bold "Starts with Docker: yes/no/unknown", the summary, the how-to line and "Checked by the installer on <date>." (`packages/web/src/autostart/autostart-settings.tsx:48`, `:64`, `:86`).

### Providers

- `Welcome` (first launch only): a `Callout` titled with the server's message, its detail, "Found: <CLI name version, …>" and quiet "Got it" (`packages/web/src/components/welcome.tsx:40`).
- On a fresh install (no key saved): "Paste a key to make its provider selectable on Play." (`packages/web/src/components/provider-keys.tsx:102`).
- Three family sections, Text, Speech, Images, each a two-column grid from `lg` (list left, the picked provider's setup right; stacked below, where picking a row scrolls the setup into view smoothly) (`packages/web/src/components/provider-keys.tsx:24`, `:62`, `:110`). The list is a kit `List` of `ListRow`s: display name, meta "Command line" / "Built in, no key" / "API key", and a kit `Status` word: "Key saved" / "No key", "Ready" / "Needs attention" / "Not found" for CLIs, "Ready" / "Not found" for the built-in voice (`packages/web/src/components/provider-keys.tsx:40`, `:129`, `packages/web/src/components/provider-cli.tsx:37`, `packages/web/src/components/system-voices.tsx:41`). The first provider not yet usable is open on arrival (`packages/web/src/components/provider-keys.tsx:74`).
- Key setup (`KeyDetail`): h3 "Set up <name>" (or the name once a key is saved) with the provider InfoTip and meta "<Family> · needs an API key" / "a key is saved"; the provider's guide steps (sign-up, key page, credit, permissions, docs), folded under "Where to get a key" once a key exists; `Field` "<name> API key" (password input, placeholder "Paste API key" or a fixed 12-dot mask, help "Stored on this computer only. Never in backups or exports.") with primary "Save"; a row of "Test" (tests the pasted key, else the stored one; InfoTip `settings.providers.test-key`), quiet "Remove" (disabled without a key) and a fixed 52 px Saved-tick slot (`packages/web/src/components/provider-keys.tsx:177`, `:271`, `:282`, `:295`, `:341`).
- CLI setup (`CliProviderDetail`): h3 name with InfoTip, meta "<Family> · command line, no key needed"; a `Lamp` and status line (`aria-live`: the readiness issue, "Not found on PATH", "Not found at saved path", "Installed, version …"); "Command" with the command in `Code`, truncated, full text on hover; "Change path"/"Close path" toggling a form with `Field` "Executable path" (help: leave blank to find the default on PATH, absolute path without quotes) and primary "Save path" ("Checking…" while pending). When the CLI is managed on the host, the toggle is replaced by "Managed on host" with InfoTip `settings.cli.managed-on-host` and no form (`packages/web/src/components/provider-cli.tsx:48`, `:120`, `:133`, `:151`, `:201`).
- Built-in voice setup (`SystemVoiceDetail`): h3 name, meta "Speech · built into this computer, no key needed", and a live line naming the speech program found or the issue (`packages/web/src/components/system-voices.tsx:50`).
- `ProviderHealthCheck` "Health check" (InfoTip `settings.health`; its button is the header's "Check all"): before a run "Not checked yet." / "Checking every provider…"; after, a list per provider with a `Status` word (Ready / Check / Needs fixing), quiet "Check again" per row, and each check line toned by state; a closing line "Checked at <time>." or "Not set up and not used anywhere: <names>." (`packages/web/src/components/provider-health.tsx:67`, `:12`, `:104`, `:136`).

### Voices

A `sl-table` (min 640 px, scrolls sideways) with columns Name, Provider, Voice ID, Languages (InfoTip), Real person (InfoTip; a per-row `Switch`) and a quiet "Remove" per row (`packages/web/src/components/voices.tsx:66`, `:120`, `:135`). Below, `SectionHead` "Add a voice" and a five-column row: `Field` "Voice name", `Select` "Provider" (speech providers; "No speech provider" when none), "Voice ID" (a text input; a `SystemVoicePicker` for the built-in voice; a "Pick a Gemini voice" select for Google TTS; an Inworld help line), `Field` "Languages" (placeholder "es, de", help "Codes such as es, de."), and primary "Add voice" (`packages/web/src/components/voices.tsx:164`, `:233`, `:275`, `:289`, `:340`).

### Models

`SectionHead` "Model catalogue" (InfoTip) with "Check now" ("Checking…") and quiet "Replace with published file" ("Replacing…", InfoTip `settings.models.replace`), both disabled without a catalogue path; a `dl` of Catalogue file (mono), Verified, Last checked (date · "<n> new, <n> repriced, <n> retired" or "No changes"); then "New: …" and "Retired: …" lines (`packages/web/src/components/catalogue.tsx:125`, `:140`, `:162`). Section "Retired models in use" with primary "Switch all" ("Switching…"; disabled when nothing is switchable) and a list: kicker Template/Schedule/Draft/Project, name, "<slot>: <model> (retired | no longer listed)", a waiting-toned blocked reason, and "Switch to <replacement>" or "No replacement" (`packages/web/src/components/catalogue.tsx:179`, `:203`).

### Production defaults (and Appearance, now under General)

Two-column grid from `md` (`packages/web/src/routes/settings.tsx:736`): `Field` "Silence between segments" (number input 0–30, "seconds", primary "Save", 52 px Saved-tick slot; help "Seconds of quiet between narrated segments.") (`packages/web/src/routes/settings.tsx:737`); "Appearance" `Segmented` System / Dark / Light with InfoTip, saved on change (`packages/web/src/routes/settings.tsx:780`); full-width `LoudnessControls`: `Switch` "Level the volume for new runs" and, when on, "Video volume" and "Audio files volume" fields each with a dB input and a % input and help naming the LUFS target and true-peak cap (`packages/web/src/routes/settings.tsx:796`, `packages/web/src/video/loudness-controls.tsx:29`, `:119`).

### Notifications

`SectionHead` "Browser and phone" (InfoTip `settings.notifications`) over three blocks (`packages/web/src/notifications/settings-panel.tsx:29`): `Switch` "Browser notifications" (asks the browser permission when turned on) with quiet "Send test notification" (disabled reason "Turn Browser notifications on first.") and "Works while any Slopify tab is open." (`:84`); `Switch` "Run sounds" with quiet "Play start" / "Play end" and a line on what chimes and when (`:125`); `Field` "Notification URL" (url input, placeholder "https://ntfy.sh/your-topic", help "Works with no tab open, for example an ntfy topic on your phone.") with primary "Save" and quiet "Send test notification" (`:183`).

### Channel links

`SectionHead` "Named links" and a paragraph saying each channel keeps its own links on its Brand tab, and that links saved here before fill the default channel's descriptions until its Brand tab is saved; `ButtonLink` "Open the default channel's links" → `/channels/$channelId` of the default channel. No editing happens here (`packages/web/src/youtube/channel-links.tsx:83`).

### YouTube Studio

`SectionHead` "Upload pack and extension" (InfoTip) over, in order, Playlists, Posting plan, pairing and install (`packages/web/src/studio/settings-panel.tsx:20-36`):

- `Field` "Playlists": a channel `Select` ("Every channel (default)" plus each channel), one row per playlist (name input, "On by default" checkbox, quiet "Remove"), secondary "Add playlist" (max 20), primary "Save playlists"; help text changes for the default list, a channel still using the default, and a channel's own list (`packages/web/src/studio/settings-panel.tsx:83`, `:107`, `:151`).
- `section[aria-label="Posting plan"]`, h3 "Posting plan" (`packages/web/src/studio/posting-plan.tsx:100-270`): a line that the plan has one line per long video with its series and shorts, that a finished project takes the next free time of a line taking its series (the part of its titles after "|"), that each short goes out the first time its day and hour come round after its own video and never in the same hour as another release, and "See and move them in Calendar → Releases." (`:103-108`). With no lines: "No posting plan yet, so nothing is scheduled. Press Add a long video to start." (`:109-112`). Otherwise a list, one item per long video, ruled below (`:114-197`): "Long video N" with a day `Select` (Sun–Sat, 92 px) beside a `time` input (132 px) (`SlotCell`, `:24-51`), a series `Select` (220 px, "Long video N: series") offering "Any series" and every series the projects' titles use (from `GET /plan`), and a trash `IconButton` "Remove long video N"; an indented row of its shorts, "No shorts" when none, each "Short M" with its day/time cell and an X `IconButton` "Remove short M of long video N", then a quiet "+ Short" (plus icon; copies the last short's time, else the long video's; disabled at 10). Lines show no name; the inner name is the lowest unused number (`:94-98`). Below: quiet "Add a long video" (plus icon; copies the last line's series and long-video time, with no shorts; disabled at 14), "Times are in" with a time-zone `Select` (the plan's zone plus America/New_York, America/Los_Angeles, Europe/London, UTC), and a primary "Save posting plan" enabled only with unsaved edits (`:199-239`); a sentence "Upload and schedule each video and short at least [number input 72 px, 1–168, 'Hours before release'] hours before its release, so YouTube's copyright and ad checks finish while it is private." whose input saves on blur when it holds a new whole number in range (`:240-262`); then a `Switch` "Post and pin each video's comment once it is public (the extension posts it in your name)" that saves on toggle (`:263-268`). The unsaved plan is component state only. With nothing saved the plan has no lines and the zone is the computer's (`packages/app/src/slices/studio/plan.ts:23-42`).
- "Extension pairing token" (InfoTip): the token in a select-all `code`, quiet "Copy" and "New pairing token", and a help line "No extension is paired. …" or "Paired with the extension at <origin>. A new token unpairs it." (`packages/web/src/studio/settings-panel.tsx:217`).
- h3 "Install the Studio extension": `Segmented` "Browser" (Chrome, Edge, Brave / Firefox), `FileLink` "Download for Chrome|Firefox" (a zip served by Slopify), and three numbered install steps ending with pairing (`packages/web/src/studio/extension-install.tsx:24`).

### Backup & storage

Three blocks in order (`packages/web/src/routes/settings.tsx:306`):

- `FilesFolder` "Your files" (InfoTip `settings.files`, meta = the folder path) with a `dl` of Projects / Automatic backups / Exports paths (`packages/web/src/routes/settings-files.tsx:123`, `:223`). Native actions: primary "Move to Documents/Slopify" (hidden when already there or no Documents folder), "Open folder", quiet "Choose another folder" opening a form with `Field` "New folder" (help "The full path; it must be empty or new.") and "Move here" (`packages/web/src/routes/settings-files.tsx:124`, `:150`). Docker: "Open folder" only, plus the host command in `Code` with quiet "Copy command" and a `--projects-dir` note (`packages/web/src/routes/settings-files.tsx:73`).
- `StorageTools`: `SectionHead` "Export and import" (InfoTip) with "Export everything", "Import a backup" (hidden file input accepting `.tar` and `.zip`) and quiet "Clean orphan files" (InfoTip); the line "Provider keys are never included in a backup. After importing, enter them again in Settings → Providers."; progress lines; the import result; then `SectionHead` "Disk space" (InfoTip) whose meta reads "<size> stored · <size> project files · <size> staged files" plus the trash share when deleted projects exist, followed by `ProjectStorageList` (`packages/web/src/routes/settings.tsx:487`, `:515`, `:563`).
- `ProjectStorageList`: "Keep outputs only frees a finished project's working files." (InfoTip) then a list sorted largest first: title, "<size> · outputs <size> · working files <size>", quiet "Keep outputs only" (disabled with a `title` reason when unfinished or nothing is removable) (`packages/web/src/routes/settings-storage.tsx:16`, `:45`, `:61`).
- `SampleSettings` "Sample projects" (InfoTip): three rows (The Library of Alexandria; The Wind in the Willows (audiobook); The Antikythera Mechanism (podcast)) with "In your projects" + "Open" link or "Not in your projects", then "Restore samples" and "Puts all three back as they shipped." (`packages/web/src/onboarding/sample-settings.tsx:12`, `:35`, `:56`).

### Backups

`SectionHead` "Daily backup" (InfoTip) with primary "Back up now"; a status row: left the last-result line, right "Next: <when>." / "Next: shortly." / "Automatic backups are off."; below, the last result's detail (a danger `Callout` "Why the last backup stopped" when it failed) (`packages/web/src/routes/settings-backups.tsx:96`, `:106`, `:226`, `:239`). Then `Switch` "Back up automatically", a two-column grid of `Field` "Time of day" (time input, help "<browser time zone> time"), `Field` "Keep last" (1–30, help "Backups kept in the folder.") and full-width `Field` "Folder" (placeholder = the default folder; help says where backups land and how many exist), and primary "Save" with a 52 px Saved-tick slot (`packages/web/src/routes/settings-backups.tsx:137`, `:145`, `:191`, `:245`).

### Trash

`SectionHead` "Trash" (InfoTip) and a list "Deleted items": name, "<kind> · deleted <date> · <n> days left" (kind: Project, Prompt · <kind>, Intro, Outro, Template, Schedule), small "Restore" and destructive small "Delete now" (`packages/web/src/trash/trash-settings.tsx:95`, `:107`, `:27`).

### Patch notes

"Latest version" `SectionHead` (meta "<version>, released <d Month yyyy>." plus "The version you are running." when it matches; InfoTip) over a `PatchNoteReader` (kit `ReadingView`: contents from `##` headings, search, copy); below, `<details>` "Earlier versions (<n>)" listing each note with "Read" (`packages/web/src/patch-notes/settings-panel.tsx:95`, `:110`, `packages/web/src/patch-notes/reader.tsx:12`). Opening one shows quiet "Back to the latest patch notes" (arrow icon), `SectionHead` "Earlier version" and that note (`packages/web/src/patch-notes/settings-panel.tsx:81`).

### About

`max-w-prose` column: `SectionHead` "About", a paragraph on free and open source with own keys, the updates pointer ("the circular-arrows button at the foot of the sidebar (at the top on a phone)", InfoTip), "What's new in this version" (opens the current patch note; InfoTip), the credit and Apache License 2.0 line, then a "Links" list: GitHub, Patreon, Buy Me a Coffee (each with its glyph), "How I run a channel with it", all opening in a new tab (`packages/web/src/routes/settings-about.tsx:16`, `:46`).

## States

| Section | State | Rendering | Source |
|---|---|---|---|
| General | loading / error | "Checking…" status; danger "Starting at login couldn't be checked: …"; switch errors under it | `packages/web/src/autostart/autostart-settings.tsx:49`, `:75` |
| Providers | loading | `SkeletonKeys`: three family blocks of raised bars and a detail placeholder, `role="status"` "Loading providers" | `packages/web/src/components/provider-keys.tsx:412` |
| Providers | list error | danger paragraph with the message | `packages/web/src/components/provider-keys.tsx:77` |
| Providers | key save / test / remove | Save disabled until something is typed; the draft clears on save and a Saved tick shows 2 s; save and remove failures are the `Field` error; test result is a status (accent) or alert (danger) line; Test disabled with "Paste a key first."; Remove asks `ConfirmDialog` "Remove the <name> key?", "Projects that used this provider cannot retry until a key is saved.", confirm "Remove key" | `packages/web/src/components/provider-keys.tsx:219`, `:331`, `:344`, `:366` |
| Providers | CLI path | pending "Checking…"; server refusal as the `Field` error; Saved tick after success | `packages/web/src/components/provider-cli.tsx:167`, `:191` |
| Providers | health | "The health check didn't finish: … Press Check all to try again."; per-row "The check didn't finish: … Press Check again on the provider to try again." | `packages/web/src/components/provider-health.tsx:88` |
| Voices | loading / empty / error | one raised bar row; "Add a voice ID from your text-to-speech provider. Audio needs one to narrate."; list error replaces the table | `packages/web/src/components/voices.tsx:97`, `:103`, `:53` |
| Voices | add refused | the refused field shows the server message and Add stays disabled until that field changes; request errors below the row | `packages/web/src/components/voices.tsx:219`, `:359` |
| Voices | real person / remove | optimistic switch while pending; "Couldn't change Real person: … Press the switch again."; `ConfirmDialog` "Remove <name>?", "Projects that used this voice keep the audio they made with it.", "Remove voice" | `packages/web/src/components/voices.tsx:121`, `:151`, `:168` |
| Models | loading / problems | catalogue fields read "Not available", "date unavailable", "Not checked yet"; retired list "Looking…" then "Nothing uses a retired model."; one danger line carries the first check, replace, read or sync warning; check result and Switch all result are toasts | `packages/web/src/components/catalogue.tsx:145`, `:198`, `:105`, `:59`, `:93` |
| Playback | loading / error | two raised blocks `role="status"` "Loading settings"; danger paragraph on error | `packages/web/src/routes/settings.tsx:715` |
| Playback | gap invalid / saved | "The silence gap is a whole number of seconds between 0 and 30." as the field error, Save disabled; Saved tick 2 s | `packages/web/src/routes/settings.tsx:89`, `:776` |
| Playback | appearance / loudness | written to the settings cache before the request and rolled back if refused; loudness out of range shows the dB/% range sentence | `packages/web/src/routes/settings.tsx:688`, `packages/web/src/video/loudness-controls.tsx:75` |
| Notifications | permission | switch disabled while the prompt is open; refusal, dismissal or blocked site storage each give a sentence naming the browser setting to change; test that can't show says to set a Notification URL instead | `packages/web/src/notifications/settings-panel.tsx:54`, `:24` |
| Notifications | URL | input disabled until the saved value loads; rule problem, save or test errors as one alert line; toasts "Notification URL saved." / "removed." / "Test notification sent. …" | `packages/web/src/notifications/settings-panel.tsx:180`, `:164`, `:173` |
| YouTube Studio | playlists | "A playlist name is longer than YouTube allows (<n> characters). Shorten it." or `"<name>" is listed twice. Remove one.`; Save playlists disabled until edited and valid; toast "Playlists saved." | `packages/web/src/studio/settings-panel.tsx:178`, `:162` |
| YouTube Studio | posting plan | "Loading the posting plan…" until it loads; toasts "Saved the posting plan." / "The posting plan wasn't saved: <message>"; lead time: "Each upload is now due <n> hours before its release." / "The lead time wasn't saved: <message>" (it also refreshes Calendar → Releases); the comment switch is disabled while saving and toasts "Not saved: <message>" on failure | `packages/web/src/studio/posting-plan.tsx:64-90` |
| YouTube Studio | pairing | token shows "…" while loading; copy toasts; "New pairing token made. Pair the extension again with it." | `packages/web/src/studio/settings-panel.tsx:205`, `:201` |
| Backup & storage | files | "Loading…" / "Where your files are is unavailable. Reload the page to try again."; move progress "Copying|Checking the copy of your files to <target>: <n> of <n> files (…). Keep Slopify running until it finishes." with a `Meter`, polled every second; failed/interrupted `Callout` (danger / waiting) with "Continue moving"; done `Callout` "Your files are now in <target>" naming the old folder still holding a copy | `packages/web/src/routes/settings-files.tsx:59`, `:179`, `:192`, `:212` |
| Backup & storage | export | "Preparing the backup…"; "Downloading <size> (<n> projects). Your browser's downloads show its progress; keep Slopify running until it finishes." with "Dismiss"; a not-ready answer shows the server's reason | `packages/web/src/routes/settings.tsx:365`, `:520` |
| Backup & storage | import | size check before upload (empty file; legacy .zip over 100 MB); "Uploading the backup: <sent> of <total>" with a `Meter`; "Checking and importing the backup… large projects can take a minute."; failure sentence names the accepted files; success toast "Backup imported." and the `ImportResult` list (h3 "Imported the backup from <date>", per-kind added / renamed "(imported)" / already here, paused schedules, settings, fonts, usage, provider-keys reminder, skipped projects with reasons, "Dismiss") | `packages/web/src/routes/settings.tsx:396`, `:537`, `:344`, `:615` |
| Backup & storage | cleanup / disk | toast "Removed <n> orphan project file(s) and <n> stale staged file(s)."; disk meta skeleton bar, or "Storage usage is unavailable. Reload the page to try again." | `packages/web/src/routes/settings.tsx:448`, `:581` |
| Backup & storage | keep outputs | `ConfirmDialog` `Keep only the outputs of "<title>"?` with the full list of what is removed and what stays; row button "Removing…"; toast "Freed <size> from …" or "… had no working files left to remove."; errors under the list | `packages/web/src/routes/settings-storage.tsx:87`, `:109`, `:32` |
| Backup & storage | samples | "Restoring…"; status slot "The samples are back in Projects." or the error | `packages/web/src/onboarding/sample-settings.tsx:57`, `:61` |
| Backups | loading / running | skeleton bar in the status row; form fields disabled until loaded; "Backing up now…" and polling every 2 s while running; "Back up now" disabled while running; toast "Backup started. Its result shows here when it finishes." | `packages/web/src/routes/settings-backups.tsx:108`, `:67`, `:55` |
| Backups | errors | "The backup settings couldn't be read: …" replaces the form; "Keep between 1 and 30 backups." field error; save and run errors as alert lines; waiting result "Waiting for projects to finish." | `packages/web/src/routes/settings-backups.tsx:131`, `:23`, `:125`, `:235` |
| Trash | loading / empty / error | "Loading the trash…"; `EmptyState` "The trash is empty" / "Anything you delete stays here for 30 days before it is removed for good."; error paragraph | `packages/web/src/trash/trash-settings.tsx:96` |
| Trash | restore / delete | buttons disabled while either runs ("Working on it"); toasts `Restored "<name>".` or restored under a new name, plus "The schedule is paused. Press Resume on Schedules to run it again."; `ConfirmDialog` `Delete "<name>" for good?` with a kind-specific consequence, "Delete for good" / "Keep it" | `packages/web/src/trash/trash-settings.tsx:64`, `:138` |
| Patch notes | loading / error / unknown note | "Loading the patch notes…"; danger `Callout` "The patch notes did not load" with "Try again"; "This version of Slopify has no patch notes."; unknown `note` shows a status line and falls back to the latest | `packages/web/src/patch-notes/settings-panel.tsx:62`, `:72`, `:97` |
| About | What's new fails | toast "The patch notes did not open: … Open Settings → Patch notes to try again." | `packages/web/src/routes/settings.tsx:318` |

## Motion

Saved ticks fade in over 150 ms (`animate-tick-in`), none under reduced motion (`packages/web/src/components/saved-tick.tsx:32`, `packages/web/src/styles/index.css:90`). Picking a provider on one column scrolls its setup into view with `behavior: "smooth"` (`packages/web/src/components/provider-keys.tsx:66`). Progress is shown by kit `Meter` fills, not animation (`packages/web/src/routes/settings.tsx:543`, `packages/web/src/routes/settings-files.tsx:187`). No other authored motion (`packages/web/src/routes/settings.tsx`).

## Copy

Section labels and meta lines are the table above (`packages/web/src/routes/settings.tsx:99`). Register: short second-person sentences that say what happens and where to go next ("After importing, enter them again in Settings → Providers.", "Keep Slopify running until it finishes.") (`packages/web/src/routes/settings.tsx:517`, `:530`). Error lines name what failed, why, and the button or screen that fixes it ("Press Check all to try again.", "Open Settings → Backups to see its state.") (`packages/web/src/components/provider-health.tsx:90`, `packages/web/src/routes/settings.tsx:231`). Provider family titles read Text, Speech, Images (`packages/web/src/components/provider-keys.tsx:25`).

## Not in play

- No app account, sign-in or host-service installer; host CLI sign-in and setup remedies run on the host, and a host-managed CLI shows "Managed on host" with no path form (`packages/web/src/components/provider-cli.tsx:133`).
- Channel links are not edited here; the section only links to the default channel's Brand tab (`packages/web/src/youtube/channel-links.tsx:80`).
- No page-level save: every block saves itself (`packages/web/src/routes/settings.tsx:758`, `packages/web/src/routes/settings-backups.tsx:192`).
- Provider keys never appear in the page after save (fixed mask; draft cleared on the answer) and are never in backups (`packages/web/src/components/provider-keys.tsx:31`, `:214`, `:298`).
- No section-level aside rail (`Workspace` has no `aside`) (`packages/web/src/routes/settings.tsx:275`).
