---
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: 0da6a45fddf9
paths_covered:
  - ":(top)packages/web/src/routes/welcome.tsx"
  - ":(top)packages/web/src/components/welcome.tsx"
  - ":(top)packages/web/src/onboarding/**"
---

# Welcome and starter packs

## Mode & job
Operate surface at `/welcome`: the first run as three steps that end with a real 60-second short being made, with the bundled samples and the start-at-login offer as extras (`packages/web/src/routes/welcome.tsx:92-96`, `packages/web/src/router.tsx:84-89`). Home navigates here once per tab when `GET /api/onboarding` reports `show: true`, which holds while no real (non-sample) project exists and the screen was never dismissed (`packages/web/src/routes/home.tsx:59-65`, `packages/app/src/slices/onboarding/first-run.ts:14-24`). The router comment names Projects as the redirecting screen; the redirect code is in Home (`packages/web/src/router.tsx:84`, `packages/web/src/routes/home.tsx:60-65`). No rail destination or Ctrl+K command opens `/welcome`: the shell and global commands never reference it (`packages/web/src/components/shell.tsx:70`, `packages/web/src/components/global-commands.tsx`).

This chapter also covers the other onboarding surfaces: the starter packs drawer on Templates, the Settings → Backup & storage "Sample projects" restore block, the sample project's "Make my own copy" and a short's "Make the full video on this topic" endpoints, and the older first-launch `Welcome` callout on Play and Settings → Providers.

## Composition
| Region | What renders | Kit / tokens |
|---|---|---|
| Page header | Title "Welcome to Slopify"; meta "Make a video from a topic, with the tools already on this computer."; action: quiet Button "Skip", reading "Done" once a short was started (`packages/web/src/routes/welcome.tsx:160-168`) | `PageHeader` (`packages/web/src/components/kit/layout.tsx:9`), `Button` |
| Read error | `Callout tone="danger"` "Could not read what this computer has" with the error message (`packages/web/src/routes/welcome.tsx:169-173`) | `Callout` (`packages/web/src/components/kit/callout.tsx:16`) |
| Steps | `Steps dense` labelled "First-run steps", an ordered list, not tabs, because the three are a sequence: each name is a quiet small Button "1 · What you have", "2 · Pick a style", "3 · Make your first short" that opens its step, the current one with `aria-current="step"` and the detail "Step N of 3"; steps before it carry a `done` lamp, the current an `info` lamp, later ones `off` (`StepList` in `packages/web/src/routes/welcome.tsx`, `packages/web/src/components/kit/steps.tsx`) | `Steps`, `Button` |
| Step panels | One `section` per step, labelled with its name and hidden unless current; Back, Next and a step name move focus to the new step's section so a keyboard or screen-reader user starts at its top (`StepPanel` in `packages/web/src/routes/welcome.tsx`) | `section tabIndex=-1` |
| Step 1 panel | Found on this computer list, keyless line or no-writer callout, Narration voice block (`packages/web/src/routes/welcome.tsx:184-241`) | `SectionHead`, `List`, `ListRow`, `Callout` |
| Step 2 panel | Pick a style list: "General" plus the starter packs (`packages/web/src/routes/welcome.tsx:243-294`) | `List`, `ListRow selected` |
| Step 3 panel | Topic form or "being made" callout, the samples list, `AutostartOffer` (`packages/web/src/routes/welcome.tsx:296-385`) | `Input`, `Callout`, `List` |
| Action bar | Sticky bottom `ActionBar`: `StatusSlot` for errors and "Starting your short…"; TextLink "Set up a long video instead" → `/play`; "Back" (not on step 1); primary "Next: `<step label>`" (not on step 3) (`packages/web/src/routes/welcome.tsx:387-395`, `packages/web/src/components/kit/action-bar.tsx:50-75`) | `ActionBar`, `StatusSlot` (`packages/web/src/components/kit/action-bar.tsx:16`) |

### Step 1: What you have
- `SectionHead` "Found on this computer" (InfoTip `welcome.found`) over one `ListRow` per CLI (Claude Code, Codex, Gemini CLI). The row's trailing text: "Ready · `<version>` · writes and draws" (Codex) or "Ready · … · writes"; installed but not usable shows the probe's issue or "Installed, not usable yet"; otherwise "Not found". Before data arrives one row reads "Looking for installed tools…" (`packages/web/src/routes/welcome.tsx:185-203`, `packages/app/src/slices/onboarding/first-run.ts:65-82`).
- With at least one ready CLI: "You can make a video now: no API keys are needed for the text, the images or the narration." with the parts present only when true (images when a ready CLI draws, narration when the computer's voice is used) (`packages/web/src/routes/welcome.tsx:64-69`, `packages/web/src/routes/welcome.tsx:204-212`).
- With none: `Callout tone="waiting"` "Nothing on this computer can write the script yet." / "Install Claude Code, Codex or Gemini CLI and sign in to it, then press Check again; or add an OpenRouter key in Settings → Providers." with ButtonLink "Open Settings → Providers" (`packages/web/src/routes/welcome.tsx:213-227`).
- `SectionHead` "Narration voice" (InfoTip `welcome.voice`) and `VoiceChoice` (`packages/web/src/routes/welcome.tsx:229-240`).

`VoiceChoice` (`packages/web/src/routes/welcome.tsx:400-444`): when a voice is ready, one `ListRow` with a `done` `Lamp`, the voice sentence and quiet ButtonLink "Add a voice key" → Settings → Providers; when none, `Callout tone="waiting"` "No voice can narrate the short yet." with the server's issue text or "No voice can narrate yet. Add an ElevenLabs or OpenAI key in Settings → Providers.", primary ButtonLink "Add a voice key" and Button "Check again" (refetches the view; reads "Checking…" while fetching). Voice sentences: "Narration uses your `<provider>` voice key." or "Narration uses your computer's built-in voice (`<engine>`); add an ElevenLabs or OpenAI key later for a better one." (`packages/web/src/routes/welcome.tsx:71-90`, `packages/app/src/slices/onboarding/first-run.ts:46-63`).

### Step 2: Pick a style
`SectionHead` "Pick a style" (InfoTip `welcome.pack`). Rows: "General" / "A neutral explainer style." first, then each starter pack from `starterPacks` with its name and summary (`packages/web/src/routes/welcome.tsx:244-255`, `packages/app/src/slices/onboarding/packs.ts:90`). Each pack row carries a quiet Button "Add to library" (disabled and reading "In your library" once its template exists; aria-label "Add `<name>` to library" / "`<name>` is in your library") that posts `POST /api/onboarding/packs/:id`. Every row carries "Use this style" (secondary, `aria-pressed`), which reads "Picked" (primary) and marks the row `selected` when chosen (`packages/web/src/routes/welcome.tsx:256-288`, `packages/web/src/onboarding/api.ts:38-40`). Under the list: "Add to library keeps a pack's prompts and Play template for later videos." with InfoTip `welcome.packs` (`packages/web/src/routes/welcome.tsx:290-293`). A pack counts as installed only while its template exists (`packages/app/src/slices/onboarding/first-run.ts:29-42`).

### Step 3: Make your first short
- Before a short starts: `SectionHead` "Make a 60-second short" (InfoTip `welcome.short`), line "Style: `<pack name>`. `<voice sentence>`", a `VoiceChoice` callout when no voice is ready, and a form: label "Topic" (InfoTip `welcome.topic`), `Input#welcome-topic` (max 200, placeholder "Why the sea glows at night"), primary submit "Make a 60-second short" disabled until a topic is typed (reason "Type a topic first.") (`packages/web/src/routes/welcome.tsx:297-338`). Submit posts `POST /api/onboarding/short` with the topic, the pack id when not General, and a `requestId` kept across a retry of the same press; the server replays an earlier request id to the same project (`packages/web/src/routes/welcome.tsx:105-138`, `packages/app/src/edge/http/onboarding.ts:98-103`).
- After it starts: `Callout tone="info"` "Your short is being made." / "It usually takes about five minutes. The live view shows each step as it runs; while you wait, look at a sample or set Slopify to start when you log in." with primary ButtonLink "Watch it being made" → `/projects/$projectId`; projects and voices queries are invalidated (`packages/web/src/routes/welcome.tsx:128-133`, `packages/web/src/routes/welcome.tsx:339-353`).
- `SectionHead` "While you wait: the samples" (InfoTip `welcome.samples`) over three rows: "The Library of Alexandria" ("Explore the sample"), "The Wind in the Willows" ("See an audiobook"), "The Antikythera Mechanism" ("Hear a podcast"), each a ButtonLink to the sample project; a sample missing from Projects shows TextLink "Restore samples in Settings" → Settings → Backup & storage (`packages/web/src/routes/welcome.tsx:28-55`, `packages/web/src/routes/welcome.tsx:355-382`).
- `AutostartOffer`: section "Start Slopify when I log in" with "Have Slopify ready whenever you open your bookmark, without starting it from a terminal.", primary "Start when I log in" and quiet "No thanks"; a Docker install shows its status instead; after turning it on: "Slopify now starts when you log in. Change it any time in Settings → General."; renders nothing when not offered (`packages/web/src/autostart/autostart-settings.tsx:16`, `packages/web/src/autostart/autostart-settings.tsx:110-161`).

### Starter packs drawer
Opened by "Add pack" on Library → Templates (`packages/web/src/routes/templates.tsx:234-248`). `Drawer` "Add a starter pack", line "Prompts, a suggested voice and a template for one kind of channel." with InfoTip `welcome.packs`, a `List` "Starter packs" with one row per pack (name, summary, Button "Add pack" / disabled "Added"), "Loading packs…" before data; the footer `StatusSlot` shows the error, "Added: its prompts are in Prompts and its template is in this list." or "That pack was already added."; the view query runs only while open; success invalidates the templates query (`packages/web/src/onboarding/packs-drawer.tsx:11-75`, `packages/web/src/components/kit/drawer.tsx:9`).

### Sample projects (Settings → Backup & storage)
`SampleSettings` renders under Settings' storage section: `SectionHead` "Sample projects" (InfoTip `settings.sample.restore`), a row per sample ("The Library of Alexandria", "The Wind in the Willows (audiobook)", "The Antikythera Mechanism (podcast)") with meta "In your projects" plus TextLink "Open", or "Not in your projects"; Button "Restore samples" ("Restoring…" while pending) beside "Puts all three back as they shipped."; `StatusSlot` shows the error or "The samples are back in Projects." (`packages/web/src/onboarding/sample-settings.tsx:12-67`, `packages/web/src/routes/settings.tsx:308`). Restore posts `POST /api/onboarding/sample/restore` and invalidates the sample, onboarding and projects queries (`packages/web/src/onboarding/api.ts:73-75`, `packages/web/src/onboarding/sample-settings.tsx:24-31`).

### Sample copy and full video (project page hooks)
`copySample` posts `POST /api/onboarding/sample/copy` with the open sample's id (or the Library of Alexandria without one); the project page's next action "Make my own copy" calls it and navigates to the copy (`packages/web/src/onboarding/api.ts:77-92`, `packages/web/src/project/next-action.ts:161`, `packages/web/src/project/next-action-view.tsx:104-113`). `fullVideoDraft` posts `POST /api/onboarding/full-video` with a browser-kept draft id and the project page opens the resulting Play draft (`packages/web/src/onboarding/api.ts:49-56`, `packages/web/src/project/next-action-view.tsx:115-135`). Both buttons render on the project workspace (03-project).

### First-launch callout (`components/welcome.tsx`)
`Welcome` reads `GET /api/providers/first-run` (no retry, never stale) and, while `firstRun` is true and a message exists, renders a `Callout` with the server's message as title, its detail, "Found: `<CLI> <version>`, …", and quiet small Button "Got it" that posts `/api/providers/first-run/dismiss`; it also hands Play the server-picked provider defaults (`packages/web/src/components/welcome.tsx:9-69`, `packages/app/src/edge/http/providers.ts:70-83`). It is mounted on Play and at the top of Settings → Providers (`packages/web/src/routes/play.tsx:541`, `packages/web/src/routes/settings.tsx:292-296`).

## States
| State | Trigger | Rendered |
|---|---|---|
| Loading | view undefined | "Looking for installed tools…" and "Looking for a voice…" rows; style list shows General only; samples show the Restore link (`packages/web/src/routes/welcome.tsx:202`, `packages/web/src/routes/welcome.tsx:230-234`, `packages/web/src/routes/welcome.tsx:358`) |
| Read error | `view.error` | Danger callout above the tabs (`packages/web/src/routes/welcome.tsx:169-173`) |
| No writer | loaded, zero ready CLIs | Waiting callout with the Providers link (`packages/web/src/routes/welcome.tsx:213-227`) |
| No voice | voice not ready | Waiting `VoiceChoice` callout on steps 1 and 3 (`packages/web/src/routes/welcome.tsx:304-312`, `packages/web/src/routes/welcome.tsx:425-443`) |
| Checking | refetch in flight | "Check again" disabled, reads "Checking…" (`packages/web/src/routes/welcome.tsx:435-437`) |
| Installing pack | install pending | Every "Add to library" disabled (`packages/web/src/routes/welcome.tsx:266`) |
| Starting short | short pending | Status slot "Starting your short…"; submit disabled (`packages/web/src/routes/welcome.tsx:151-153`, `packages/web/src/routes/welcome.tsx:332`) |
| Short started | short resolves | "Your short is being made." callout replaces the form; header button reads "Done" (`packages/web/src/routes/welcome.tsx:165`, `packages/web/src/routes/welcome.tsx:339-353`) |
| Action failed | short, install or skip rejects | Status slot `error` with the server's sentence, first of short → install → skip (`packages/web/src/routes/welcome.tsx:145-150`, `packages/web/src/onboarding/api.ts:6-7`) |
| Skipping | skip pending | Skip/Done disabled; on success the onboarding query is invalidated and the app navigates to `/` (`packages/web/src/routes/welcome.tsx:108-114`, `packages/web/src/routes/welcome.tsx:164`) |
| Sample missing | `samples[id]` null | "Restore samples in Settings" link in that row (`packages/web/src/routes/welcome.tsx:365-368`) |
| Autostart on | turn succeeds and enabled | `role="status"` confirmation line (`packages/web/src/autostart/autostart-settings.tsx:112-117`) |
| Settle | real project exists, not dismissed | Home posts dismiss once; `/welcome` is not shown (`packages/web/src/routes/home.tsx:66-75`) |

## Motion
- No animation is defined on this route; tab switches swap panels without transition (`packages/web/src/routes/welcome.tsx:184-385`, `packages/web/src/components/kit/tabs.tsx:126`).
- The action bar is sticky to the viewport bottom, raised above the phone tab bar below 768px (`packages/web/src/components/kit/action-bar.tsx:62-66`).

## Copy
- Titles: "Welcome to Slopify", "Found on this computer", "Narration voice", "Pick a style", "Make a 60-second short", "While you wait: the samples", "Add a starter pack", "Sample projects" (`packages/web/src/routes/welcome.tsx:161-355`, `packages/web/src/onboarding/packs-drawer.tsx:37`, `packages/web/src/onboarding/sample-settings.tsx:35`).
- Buttons: "Skip", "Done", "Next: Pick a style", "Next: Make your first short", "Back", "Use this style", "Picked", "Add to library", "In your library", "Add a voice key", "Check again", "Watch it being made", "Set up a long video instead", "Add pack", "Added", "Restore samples", "Got it" (`packages/web/src/routes/welcome.tsx:164-436`, `packages/web/src/onboarding/packs-drawer.tsx:66`, `packages/web/src/onboarding/sample-settings.tsx:57`, `packages/web/src/components/welcome.tsx:49`).
- Server refusals are shown verbatim and name the fixing screen, e.g. "Slopify doesn't have that starter pack. Reload the page and pick one of the packs listed." (`packages/app/src/edge/http/onboarding.ts:87-96`).
- Help bodies for the `welcome.*` InfoTips live in `packages/web/src/help/entries/settings.ts:324-358`.

## Not in play
- Step gating: absent; any tab can be opened in any order and Next does not validate (`packages/web/src/routes/welcome.tsx:175-182`, `packages/web/src/routes/welcome.tsx:390-394`).
- Step persistence: component state only; reloading returns to step 1 with the topic and style cleared (`packages/web/src/routes/welcome.tsx:101-104`).
- A way back to `/welcome` after Skip: absent in the UI; the server never shows it again once dismissed or a real project exists (`packages/app/src/slices/onboarding/first-run.ts:10-24`).
- Account creation or sign-in inside the app: absent; CLI sign-in happens in a terminal (`packages/web/src/routes/welcome.tsx:224-225`).
- Choosing voice or image providers on this screen: absent; the server picks them from what the machine has (`packages/app/src/slices/onboarding/quick-short.ts:9-13`).
- Offline and permission-denied states: not rendered.

## Way back
After Skip, `/welcome` stays reachable from Help → Tutorials (quiet ButtonLink "Welcome screen" in that page's header, `packages/web/src/routes/tutorials.tsx`) and Ctrl+K "Open the welcome screen" (`packages/web/src/components/shell-commands.tsx`).
