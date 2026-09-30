---
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: 904381d106ac
paths_covered:
  - ":(top)packages/web/src/studio/prepare-upload.tsx"
  - ":(top)packages/web/src/studio/extension-install.tsx"
  - ":(top)packages/app/src/slices/studio/model.ts"
  - ":(top)packages/extension/src/**"
  - ":(top)packages/extension/static/**"
---

# Studio upload

## Mode & job
Operate surfaces for getting a finished video into YouTube Studio by hand or with the Slopify Studio browser extension; Slopify never uploads or publishes (`packages/web/src/studio/prepare-upload.tsx:38-42`). Four pieces:

1. **Prepare upload drawer** (`PrepareUploadDrawer`, `packages/web/src/studio/prepare-upload.tsx:88`): everything Studio asks for, in Studio's order, per video and per short.
2. **Extension install block** (`ExtensionInstall`, `packages/web/src/studio/extension-install.tsx:24`): download and install steps, shown inside the drawer when unpaired and in Settings → YouTube Studio (the settings panel itself is in 08-settings) (`packages/web/src/studio/settings-panel.tsx:28`).
3. **Extension options page** (`packages/extension/static/options.html`, `packages/extension/src/options.ts`): pairing with a local Slopify.
4. **Studio in-page panel** (`packages/extension/src/content.ts`): toasts and a "Fill again from Slopify" button on `studio.youtube.com` (`packages/extension/static/manifest.json:17-23`).

Entry points to the drawer:

| Where | Control | Source |
|---|---|---|
| Project page, next action when done/partial and upload-ready | primary "Prepare upload" (intent `prepare-upload`) | `packages/web/src/project/next-action.ts:365-374`, `packages/web/src/project/next-action-view.tsx:203-204` |
| Project page, YouTube section, when the next action is something else | secondary "Prepare upload" | `packages/web/src/routes/project.tsx:643-653` |
| Project page, Ctrl+K | "Prepare upload" (group This project); not ready → info toast "Prepare upload opens once the video has been made." | `packages/web/src/routes/project.tsx:232-242` |
| Home, Ready section row | small secondary `PrepareUpload` | `packages/web/src/home/ready.tsx:71` |
| Calendar row with an upload action | `PrepareUpload` | `packages/web/src/routes/calendar.tsx:601-602` |

`PrepareUpload` is the button wrapper: "Prepare upload", disabled with reason "Available once the video has been made" when `ready` is false, opening the drawer in local state (`packages/web/src/studio/prepare-upload.tsx:43-71`).

## Composition
### Prepare upload drawer
| Region | What renders | Kit / tokens |
|---|---|---|
| Frame | Non-modal `Drawer` (wide, 560px on `sm` and up), title "Prepare upload" (`packages/web/src/studio/prepare-upload.tsx:177-180`) | `Drawer` (`packages/web/src/components/kit/drawer.tsx:9`) |
| Unpaired callout | When `pairing.origin === null`: waiting `Callout` "The Slopify Studio extension isn't paired." with a line that the steps are the pack, then `ExtensionInstall` (`packages/web/src/studio/prepare-upload.tsx:224-234`) | `Callout` (`packages/web/src/components/kit/callout.tsx:16`) |
| Item switch | When the pack has more than one item: `Segmented` "What to upload" with Video, Short 1…n, InfoTip `project.upload.item` (`packages/web/src/studio/prepare-upload.tsx:235-247`) | `Segmented` (`packages/web/src/components/kit/switch.tsx:58`) |
| Missing | When `pack.missing` is non-empty: waiting `Callout` "Some of it isn't made yet." listing the server's sentences (`packages/web/src/studio/prepare-upload.tsx:248-256`) | `Callout` |
| Steps | Kicker "In the order Studio asks" + InfoTip `project.upload.steps` + "Select all" tri-state checkbox; `List label="Upload steps"` of `ListRow`s, each with a done checkbox lead, the step label, the value (clamped to 4 lines) and actions (`packages/web/src/studio/prepare-upload.tsx:526-573`) | `.sl-kicker` (`packages/web/src/styles/kit.css:341`), `List`, `ListRow` (`packages/web/src/components/kit/list-row.tsx:13-29`) |
| Thumbnails | When any: `SectionHead` kicker "Thumbnails · A/B Testing", title `<n> thumbnail(s)`; compact `MediaGrid` of `MediaFrame`s lettered A, B, C with a Download action; clicking opens a `Lightbox` with Download (`packages/web/src/studio/prepare-upload.tsx:574-614`) | `SectionHead`, `MediaGrid`, `MediaFrame`, `Lightbox` (`packages/web/src/components/kit/media.tsx:19-145`) |
| Waiting for Studio | When the fill queue is non-empty: kicker + InfoTip `project.upload.queue`; `List` of `<project title> · Video/Short n`, meta "Next: filled in the next upload dialog you open in Studio." or `Filled after <n> more upload(s).`, quiet small "Remove" (`packages/web/src/studio/prepare-upload.tsx:302-336`) | `List`, `ListRow`, `Button` |
| Never publishes | Neutral `Callout` "Slopify never publishes." with an unpaired or paired sentence (`packages/web/src/studio/prepare-upload.tsx:337-341`) | `Callout` |
| Footer | `StatusSlot` (last action's message); unpaired → secondary `FileLink` "Open YouTube Studio" (`https://www.youtube.com/upload`, new tab); primary "Fill in YouTube Studio" + InfoTip `project.upload.fill-studio` (`packages/web/src/studio/prepare-upload.tsx:181-215`, `packages/app/src/slices/studio/model.ts:18`) | `StatusSlot` (`packages/web/src/components/kit/action-bar.tsx:16`), `FileLink` (`packages/web/src/components/kit/link.tsx:45`) |

Steps, in `studioSteps` order (`packages/app/src/slices/studio/model.ts:84-93`, labels `packages/web/src/studio/prepare-upload.tsx:73-82`, content `packages/web/src/studio/prepare-upload.tsx:423-525`):

| Step | Label | Value | Actions |
|---|---|---|---|
| video | Video file | filename, or "Not made yet." | small secondary "Download" (`download=<filename>`), `OpenFolder` |
| title | Title | title; with A/B titles also `A/B Testing (beside the title): also "<t2>" and "<t3>"` | "Copy"; "Copy others" when A/B titles exist |
| description | Description | full description, or "Not written yet."; a `chapterNotice` line in `text-waiting` | "Copy" |
| thumbnails (video only) | Thumbnail | first filename, or `The first under Thumbnail; all <n> in A/B Testing (beside the title).`, or "None made." | `OpenFolder` |
| playlist | Playlist | a checkbox per channel playlist when the channel has more than one; else names, or "None set (Settings → YouTube Studio)." | "Copy" |
| audience | Audience | "No, it's not made for kids" | none |
| altered | AI use (under Show more) | bold Yes/No, the reason, and for a video with uploaded clips the `Switch` `The <n> uploaded clips are real footage (filmed, not made by AI)` (tip `project.upload.real-footage`) | none |
| tags | Tags (under Show more) | comma-joined tags, or "Not written yet." | "Copy" |

Copy buttons are quiet small with a copy icon, aria-label `Copy <label>`, disabled "Nothing to copy yet" when empty (`packages/web/src/studio/prepare-upload.tsx:407-422`). The done ticks are a per-browser note under localStorage `slopify.upload.<projectId>.<video|short-n>` and change nothing in the project (`packages/web/src/studio/prepare-upload.tsx:299`, `packages/web/src/studio/prepare-upload.tsx:348-403`).

Fill in YouTube Studio opens `https://www.youtube.com/upload` in a new tab inside the click, then POSTs the chosen item to the fill queue (`studio/packs/:projectId/choose`) (`packages/web/src/studio/prepare-upload.tsx:204-209`, `packages/web/src/api.ts:562-570`).

### Extension install block
| Region | What renders | Kit / tokens |
|---|---|---|
| Browser | `Segmented` "Browser": "Chrome, Edge, Brave" / "Firefox", preselected from the user agent, tip `settings.studio.install` (`packages/web/src/studio/extension-install.tsx:10-40`) | `Segmented` |
| Download | `FileLink` `Download for Chrome` / `Download for Firefox` to `/api/studio/extension/<browser>.zip`, saved as `slopify-studio-<browser>.zip` (`packages/web/src/studio/extension-install.tsx:41-44`, `packages/web/src/api.ts:513-515`) | `FileLink` |
| Steps | `ol` "Install steps": Chrome — unzip into a kept folder; `chrome://extensions` (Edge `edge://extensions`), Developer mode, Load unpacked. Firefox — needs Firefox 128+; `about:debugging#/runtime/this-firefox`, Load Temporary Add-on, removed on restart. Both — pair with the token from Settings → YouTube Studio via the toolbar button (`packages/web/src/studio/extension-install.tsx:46-75`) | `Code` (`packages/web/src/components/kit/field.tsx:142`) |

### Extension options page
Manifest V3 extension "Slopify Studio" 0.1.0; permissions `storage`, `clipboardWrite`; host permissions `http://127.0.0.1/*`, `http://localhost/*`; options page opens in a tab; the toolbar button (title "Slopify Studio: pairing") opens it (`packages/extension/static/manifest.json:1-35`, `packages/extension/src/background.ts:135-138`).

| Region | What renders | Styling |
|---|---|---|
| Header | `h1` "Slopify Studio"; paragraph that it fills Studio's upload dialog and never presses Publish (`packages/extension/static/options.html:22-26`) | inline `<style>`: system-ui 14px, 520px max width; dark scheme `#1e1e1e` background (`packages/extension/static/options.html:6-19`) |
| Form `#pair` | "Slopify address" input, default `http://127.0.0.1:6969`; "Pairing token" input; hint "Copy it from Slopify's Settings → YouTube Studio."; "Pair" submit (`packages/extension/static/options.html:27-34`) | plain HTML controls, no kit |
| Status | `p#status role="status"`, class `ok` (green) or `error` (red) (`packages/extension/static/options.html:35`, `packages/extension/src/options.ts:13-16`) | `.ok` `#1d6b2d`, `.error` `#a40000` |

On load, the page asks the worker for `status` and, when paired, fills the address and says `Paired with Slopify at <base>.` (`packages/extension/src/options.ts:18-25`). Submit sends `pair`; success clears the token field and says `Paired with Slopify at <base>. In Slopify, open a finished project, press Prepare upload, then Fill in YouTube Studio.`; failure shows the worker's message (`packages/extension/src/options.ts:27-44`). The worker accepts only `http://127.0.0.1` or `http://localhost` with an optional port, POSTs `/api/studio/ext/pair` with the token as a Bearer header, and stores `base` and `token` in `storage.local` (`packages/extension/src/background.ts:96-114`).

### Studio in-page panel
| Region | What renders | Styling |
|---|---|---|
| Panel | `div#slopify-studio-panel role="status"`, fixed bottom-right 16px, max 380px, top z-index, column of toasts (`packages/extension/src/content.ts:23-42`) | inline styles, Roboto/Arial 13px |
| Toast | `Slopify: <text>`, optional "Copy", "Close"; background by tone: error `#5c1a1a`, ok `#1d3b24`, info `#282828`, white text, 8px radius (`packages/extension/src/content.ts:44-64`) | inline styles |
| Fill again row | "Fill again from Slopify" button, added when a dialog is handled, removed when it closes (`packages/extension/src/content.ts:245-248`, `packages/extension/src/content.ts:237-244`) | outlined transparent button (`packages/extension/src/content.ts:89-103`) |

Flow: a `MutationObserver` (throttled to one look per 250 ms) watches for an upload dialog whose Title field is shown, which happens after the person drops a video in; it then stops watching, fetches the next queued item via the worker (`GET /api/studio/ext/pack` and each thumbnail from `/api/studio/ext/files/<projectId>/<asset>`), fills it once, and reports `POST /api/studio/ext/filled`; a 1 s interval waits for the dialog to close before watching again (`packages/extension/src/content.ts:213-255`, `packages/extension/src/background.ts:53-94`). Fields filled: title, description, thumbnails (incl. A/B Testing), playlist, audience, AI use, tags; Show more is pressed at most once (`packages/extension/src/fill.ts:40-47`, `packages/extension/src/fill.ts:85-114`). It never presses Next, Save or Publish (`packages/extension/src/content.ts:6-12`).

## States
| State | Trigger | Rendered |
|---|---|---|
| Pack loading | `pack.data` undefined, no error | drawer body empty; footer primary disabled "Wait for the upload pack to load" (`packages/web/src/studio/prepare-upload.tsx:196-203`, `packages/web/src/studio/prepare-upload.tsx:222`) |
| Pack error | `readUploadPack` rejects | danger `Callout` "The upload pack couldn't be read." `<message> Close Prepare upload and open it again.` (`packages/web/src/studio/prepare-upload.tsx:217-221`) |
| Pairing unknown/error | settings query error | primary disabled `Couldn't check whether the extension is paired: <message> Close Prepare upload and open it again.` (`packages/web/src/studio/prepare-upload.tsx:200-201`) |
| Unpaired | `pairing.origin === null` | install callout, "Open YouTube Studio" link, primary disabled "Install and pair the Slopify Studio extension first (steps above)" (`packages/web/src/studio/prepare-upload.tsx:184-199`) |
| Fill pending | choose POST in flight | primary disabled (`packages/web/src/studio/prepare-upload.tsx:196`) |
| Filled, one waiting | choose resolves, queue length 1 | success status "Studio is opening. Drop the video file into its upload dialog; the Slopify Studio extension fills in the details. Check everything and publish yourself." (`packages/web/src/studio/prepare-upload.tsx:113-121`) |
| Filled, several waiting | queue length > 1 | success status `Added; <n> uploads are waiting. Studio is opening: …` (`packages/web/src/studio/prepare-upload.tsx:116-118`) |
| Fill failed | choose rejects | error status `Couldn't hand this to the extension: <message>` (`packages/web/src/studio/prepare-upload.tsx:123-127`) |
| Remove failed | queue remove rejects | error status `Couldn't remove it from Waiting for Studio: <message> Press Remove again.` (`packages/web/src/studio/prepare-upload.tsx:132-136`) |
| Footage save | switch pending → success/failure | switch shows the pending value and is disabled; "Saved. The AI use answer is updated." or `Couldn't save whether the clips are real footage: <message> Press the switch again.` (`packages/web/src/studio/prepare-upload.tsx:138-149`, `packages/web/src/studio/prepare-upload.tsx:265-266`) |
| Playlists save | tick pending → success/failure | checkboxes disabled; "Saved this project's playlists." or `Couldn't save the playlists: <message> Tick the playlist again.` (`packages/web/src/studio/prepare-upload.tsx:150-161`, `packages/web/src/studio/prepare-upload.tsx:282`) |
| Copy | clipboard write | `Copied the <what>.`, or `Couldn't copy the <what>. Select the text and copy it.` when the Clipboard API is missing or refuses (`packages/web/src/studio/prepare-upload.tsx:162-175`) |
| Ticks unstorable | localStorage throws | ticks show until the drawer closes (`packages/web/src/studio/prepare-upload.tsx:394-401`) |
| Short item | a short chosen | no Thumbnail step (`packages/web/src/studio/prepare-upload.tsx:404-405`) |
| Options: bad address | not local http | "The Slopify address must be this computer, like http://127.0.0.1:6969. Copy it from the browser tab Slopify is open in." (`packages/extension/src/background.ts:98-101`) |
| Options: unreachable | fetch throws | `Couldn't reach Slopify at <base>. Start Slopify and check the address.` (`packages/extension/src/background.ts:108-110`) |
| Options: refused | non-OK response | the problem+json `detail`, else `Slopify answered <status> when asked for pairing. Check Slopify is running, then try again.` (`packages/extension/src/background.ts:22-31`) |
| Studio: not paired | no stored pairing | error toast "The extension isn't paired with Slopify yet. Open the extension's options, paste the pairing token from Slopify's Settings → YouTube Studio and press Pair." (`packages/extension/src/background.ts:55-58`, `packages/extension/src/content.ts:138-141`) |
| Studio: dialog changed | a needed field not found | nothing filled; the whole pack copied if allowed; error toast `Nothing was filled: Studio's upload dialog has changed, and Slopify couldn't find <fields>. …` with Copy (`packages/extension/src/content.ts:147-156`) |
| Studio: partial fill | some fields failed | one error toast per failed field (the first one's text copied now, others via Copy); info toasts for thumbnails and AI use; summary `Filled what it could; <n> field(s) need you. Nothing was published.` (`packages/extension/src/content.ts:157-177`) |
| Studio: filled | all fields ok | ok toast `Filled <the video/short n>'s details. Check them, then publish in Studio yourself.`; when more wait, info `<n> more upload(s) waiting from Slopify: …` (`packages/extension/src/content.ts:172-191`) |
| Studio: clipboard refused on Copy | click-time write fails | a selected read-only textarea with "The browser refused the clipboard. The text is selected below: press Ctrl+C (⌘C on a Mac)." (`packages/extension/src/content.ts:66-87`) |
| Studio: mark filled failed | `/filled` unreachable | error toast that the next dialog may get the same item; remove it under Waiting for Studio (`packages/extension/src/background.ts:86-90`) |

Per-field toast texts in `fill.ts` (e.g. "Thumbnail set.", `Audience set to "No, it's not made for kids".`, `Couldn't find <label> — the text is copied, paste it by hand.`) are shallow: not inventoried beyond `packages/extension/src/fill.ts:170-345`.

## Motion
- The drawer enters with `animate-tick-in` (150ms fade), off under reduced motion (`packages/web/src/components/kit/drawer.tsx:70`, `packages/web/src/styles/index.css:90`).
- The options page and the in-page toasts have no animation (`packages/extension/static/options.html:6-19`, `packages/extension/src/content.ts:44-64`).

## Copy
- Drawer: "Prepare upload", "What to upload", "In the order Studio asks", "Select all", "Waiting for Studio", "Thumbnails · A/B Testing", "Open YouTube Studio", "Fill in YouTube Studio", "Remove", "Download", "Copy", "Copy others" (`packages/web/src/studio/prepare-upload.tsx:179-543`).
- Callouts: "Slopify never publishes." with "Copy each step into Studio's upload dialog (Open YouTube Studio), check it and press Publish yourself." (unpaired) or "Fill in YouTube Studio hands this to the Slopify Studio extension after you drop the video in. You check it and press Publish." (paired) (`packages/web/src/studio/prepare-upload.tsx:337-341`).
- Every error names what failed and the button to press ("Press Remove again.", "Tick the playlist again.", "Close Prepare upload and open it again.") (`packages/web/src/studio/prepare-upload.tsx:123-175`).
- Extension messages are prefixed `Slopify: ` and end with the fix, including where in Slopify to go (`packages/extension/src/content.ts:58`, `packages/extension/src/content.ts:151`).

## Not in play
- Uploading or publishing to YouTube: absent in both the app and the extension; the extension never presses Next, Save or Publish (`packages/extension/src/content.ts:6-12`).
- A store listing or auto-update for the extension: absent; the zips ship inside Slopify (`packages/web/src/studio/extension-install.tsx:21-23`).
- Unpairing from the options page: absent; the page only pairs (`packages/extension/src/options.ts:27-44`).
- Kit tokens on the extension pages: not used; both style inline (`packages/extension/static/options.html:6-19`, `packages/extension/src/content.ts:29-56`).
- Reordering the Waiting for Studio list: absent; only Remove (`packages/web/src/studio/prepare-upload.tsx:320-330`).
- Done ticks as project state: absent; they live in this browser only (`packages/web/src/studio/prepare-upload.tsx:388-389`).
- An in-page badge on Studio: absent; the extension shows toasts and a Fill again button only (`packages/extension/src/content.ts:23-64`).
