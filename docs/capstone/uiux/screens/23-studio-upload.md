---
generated_at_commit: 14480f26c13e
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: fe5239f33c04
paths_covered:
  - ":(top)packages/web/src/studio/prepare-upload.tsx"
  - ":(top)packages/web/src/studio/extension-install.tsx"
  - ":(top)packages/app/src/slices/studio/model.ts"
  - ":(top)packages/extension/src/**"
  - ":(top)packages/extension/static/**"
---

# Studio upload

## Mode & job
Operate surfaces for getting a finished video into YouTube Studio by hand or with the Slopify Studio browser extension; Slopify never uploads or publishes (`packages/web/src/studio/prepare-upload.tsx:42-46`). Five pieces:

1. **Prepare upload drawer** (`PrepareUploadDrawer`, `packages/web/src/studio/prepare-upload.tsx:104`): everything Studio asks for, in Studio's order, per video and per short.
2. **Extension install block** (`ExtensionInstall`, `packages/web/src/studio/extension-install.tsx:24`): download and install steps, shown inside the drawer when unpaired and in Settings → YouTube Studio (the settings panel itself is in 08-settings) (`packages/web/src/studio/settings-panel.tsx:35`).
3. **Extension options page** (`packages/extension/static/options.html`, `packages/extension/src/options.ts`): pairing with a local Slopify.
4. **Toolbar popup** (`packages/extension/static/popup.html`, `packages/extension/src/popup.ts`): the finished projects not marked uploaded, each opening to its video and shorts, with Upload, Upload all shorts and A/B test choices (`packages/extension/static/manifest.json:37-44`).
5. **Studio in-page panel** (`packages/extension/src/content.ts`): toasts and a "Fill again from Slopify" button on `studio.youtube.com`; a second content script runs on `www.youtube.com/watch` pages opened for a pinned comment (`packages/extension/static/manifest.json:21-32`, `packages/extension/src/comment.ts:4-8`).

Entry points to the drawer:

| Where | Control | Source |
|---|---|---|
| Project page, next action when done/partial and upload-ready | primary "Prepare upload" (intent `prepare-upload`) | `packages/web/src/project/next-action.ts:386-395`, `packages/web/src/project/next-action-view.tsx:203-204` |
| Project page, Video section head, when the upload is ready and the next action is something else | secondary "Prepare upload" | `packages/web/src/routes/project.tsx:621-631` |
| Project page, Ctrl+K | "Prepare upload" (group This project); not ready → info toast "Prepare upload opens once the video has been made." | `packages/web/src/routes/project.tsx:232-242` |
| Home, Ready section row | small secondary `PrepareUpload` | `packages/web/src/home/ready.tsx:74` |
| Calendar row with an upload action | `PrepareUpload` | `packages/web/src/routes/calendar.tsx:671-672` |

`PrepareUpload` is the button wrapper: "Prepare upload", disabled with reason "Available once the video has been made" when `ready` is false, opening the drawer in local state (`packages/web/src/studio/prepare-upload.tsx:47-75`).

## Composition
### Prepare upload drawer
| Region | What renders | Kit / tokens |
|---|---|---|
| Frame | Non-modal `Drawer` (wide, 560px on `sm` and up), title "Prepare upload" (`packages/web/src/studio/prepare-upload.tsx:218-221`) | `Drawer` (`packages/web/src/components/kit/drawer.tsx:9`) |
| Unpaired callout | When `pairing.origin === null`: waiting `Callout` "The Slopify Studio extension isn't paired." with a line that the steps are the pack, then `ExtensionInstall` (`packages/web/src/studio/prepare-upload.tsx:265-275`) | `Callout` (`packages/web/src/components/kit/callout.tsx:16`) |
| Item switch | When the pack has more than one item: `Segmented` "What to upload" with Video, Short 1…n, InfoTip `project.upload.item` (`packages/web/src/studio/prepare-upload.tsx:276-288`) | `Segmented` (`packages/web/src/components/kit/switch.tsx:58`) |
| Missing | When `pack.missing` is non-empty: waiting `Callout` "Some of it isn't made yet." listing the server's sentences (`packages/web/src/studio/prepare-upload.tsx:289-297`) | `Callout` |
| Steps | Kicker "In the order Studio asks" + InfoTip `project.upload.steps` + "Select all" tri-state checkbox; `List label="Upload steps"` of `ListRow`s, each with a done checkbox lead, the step label, the value (clamped to 4 lines) and actions (`packages/web/src/studio/prepare-upload.tsx:648-695`) | `.sl-kicker` (`packages/web/src/styles/kit.css:341`), `List`, `ListRow` (`packages/web/src/components/kit/list-row.tsx:13-29`) |
| Thumbnails | When any: `SectionHead` kicker "Thumbnails · A/B Testing", title `<n> thumbnail(s)`; compact `MediaGrid` of `MediaFrame`s lettered A, B, C; with several, the one the upload uses is titled `<letter> · upload` and each other one carries a quiet small "Use for upload" (disabled while saving) beside Download; clicking opens a `Lightbox` with Download (`packages/web/src/studio/prepare-upload.tsx:696-759`) | `SectionHead`, `MediaGrid`, `MediaFrame`, `Lightbox` (`packages/web/src/components/kit/media.tsx:19-145`) |
| Waiting for Studio | When the fill queue is non-empty: kicker + InfoTip `project.upload.queue`; `List` of `<project title> · Video/Short n`, meta "Next: filled in the next upload dialog you open in Studio." or `Filled after <n> more upload(s).`, quiet small "Remove" (`packages/web/src/studio/prepare-upload.tsx:382-416`) | `List`, `ListRow`, `Button` |
| Never publishes | Neutral `Callout` "Slopify never publishes." with an unpaired or paired sentence (`packages/web/src/studio/prepare-upload.tsx:417-421`) | `Callout` |
| Footer | `StatusSlot` (last action's message); unpaired → secondary `FileLink` "Open YouTube Studio" (`https://www.youtube.com/upload`, new tab); primary "Fill in YouTube Studio" + InfoTip `project.upload.fill-studio` (`packages/web/src/studio/prepare-upload.tsx:222-256`, `packages/app/src/slices/studio/model.ts:18`) | `StatusSlot` (`packages/web/src/components/kit/action-bar.tsx:16`), `FileLink` (`packages/web/src/components/kit/link.tsx:45`) |

Steps, in `studioSteps` order (`packages/app/src/slices/studio/model.ts:111-122`, labels `packages/web/src/studio/prepare-upload.tsx:77-87`, slot picker `packages/web/src/studio/prepare-upload.tsx:341-377`, times formatted in the browser's zone `packages/web/src/studio/prepare-upload.tsx:89-98`, content `packages/web/src/studio/prepare-upload.tsx:511-647`):

| Step | Label | Value | Actions |
|---|---|---|---|
| video | Video file | filename, or "Not made yet." | small secondary "Download" (`download=<filename>`), `OpenFolder` |
| title | Title | title; with other titles, a `radiogroup` "Title the upload uses" of radio rows (the project's title and its other titles, the chosen one checked, disabled while saving) and the line "The upload uses the chosen title; the A/B test tries the others beside it once the video is public." | "Copy"; "Copy others" (aria-label "Copy the other titles") when other titles exist |
| description | Description | full description, or "Not written yet."; a `chapterNotice` line in `text-waiting` | "Copy" |
| thumbnails (video only) | Thumbnail | the filename, or `<letter> under Thumbnail (choose below). The A/B test tries all <n> once the video is public.`, or "None made." | `OpenFolder` |
| playlist | Playlist | a checkbox per channel playlist when the channel has more than one; else names, or "None set (Settings → YouTube Studio)." | "Copy" |
| audience | Audience | "No, it's not made for kids" | none |
| altered | AI use (under Show more) | bold Yes/No, the reason, and for a video with uploaded clips the `Switch` `The <n> uploaded clips are real footage (filmed, not made by AI)` (tip `project.upload.real-footage`) | none |
| tags | Tags (under Show more) | comma-joined tags, or "Not written yet." | "Copy" |
| schedule | Schedule (Visibility) | video only: a `Select` "Posting plan slot" ("Not scheduled (set it in Studio yourself)", the current release time, then each free time, all as `<Sun 5 Oct, 20:00>` with no line name) with InfoTip `project.upload.slot` ("Release time": a posting-plan line for its series, Calendar → Releases shows and moves every time, upload before the upload-by time; `packages/web/src/help/entries/project.ts:291-295`), disabled while saving; then `<time>, your time. The extension types it into Studio's Visibility step; you press Schedule.` or "Not scheduled: Slopify has no slot for it. Set the date in Studio's Visibility step." (shorts show only the line) | none |

Copy buttons are quiet small with a copy icon, aria-label `Copy <label>`, disabled "Nothing to copy yet" when empty (`packages/web/src/studio/prepare-upload.tsx:495-510`). The done ticks are a per-browser note under localStorage `slopify.upload.<projectId>.<video|short-n>` and change nothing in the project (`packages/web/src/studio/prepare-upload.tsx:379`, `packages/web/src/studio/prepare-upload.tsx:428-491`).

The pack read also carries `slotChoices`, up to nine free long-video times of plan lines that take the project's series, the project's own hour counted as taken (`packages/web/src/api.ts:636-643`, `packages/app/src/edge/http/studio.ts:234-235`).

Fill in YouTube Studio opens `https://www.youtube.com/upload` in a new tab inside the click, then POSTs the chosen item to the fill queue (`studio/packs/:projectId/choose`) (`packages/web/src/studio/prepare-upload.tsx:245-250`, `packages/web/src/api.ts:662-670`).

### Extension install block
| Region | What renders | Kit / tokens |
|---|---|---|
| Browser | `Segmented` "Browser": "Chrome, Edge, Brave" / "Firefox", preselected from the user agent, tip `settings.studio.install` (`packages/web/src/studio/extension-install.tsx:10-40`) | `Segmented` |
| Download | `FileLink` `Download for Chrome` / `Download for Firefox` to `/api/studio/extension/<browser>.zip`, saved as `slopify-studio-<browser>.zip` (`packages/web/src/studio/extension-install.tsx:41-44`, `packages/web/src/api.ts:610-612`) | `FileLink` |
| Steps | `ol` "Install steps": Chrome — unzip into a kept folder; `chrome://extensions` (Edge `edge://extensions`), Developer mode, Load unpacked. Firefox — needs Firefox 128+; `about:debugging#/runtime/this-firefox`, Load Temporary Add-on, removed on restart. Both — pair with the token from Settings → YouTube Studio via the toolbar button (`packages/web/src/studio/extension-install.tsx:46-75`) | `Code` (`packages/web/src/components/kit/field.tsx:142`) |

### Extension options page
Manifest V3 extension "Slopify Studio" 1.1.0; permissions `storage`, `clipboardWrite`, `alarms`; host permissions `http://127.0.0.1/*`, `http://localhost/*` and `https://www.youtube.com/oembed*`; content scripts on `https://studio.youtube.com/*` and `https://www.youtube.com/watch*`; options page opens in a tab; the toolbar button (title "Slopify Studio: ready to upload") opens `popup.html`; `video-frame.html` is web-accessible to Studio (`packages/extension/static/manifest.json:1-51`). The worker still registers an `action.onClicked` handler that opens the options page, which a `default_popup` supersedes (`packages/extension/src/background.ts:425-428`).

| Region | What renders | Styling |
|---|---|---|
| Header | `h1` "Slopify Studio"; paragraph that it fills Studio's upload dialog and never presses Publish (`packages/extension/static/options.html:22-26`) | inline `<style>`: system-ui 14px, 520px max width; dark scheme `#1e1e1e` background (`packages/extension/static/options.html:6-19`) |
| Form `#pair` | "Slopify address" input, default `http://127.0.0.1:6969`; "Pairing token" input; hint "Copy it from Slopify's Settings → YouTube Studio."; "Pair" submit (`packages/extension/static/options.html:27-34`) | plain HTML controls, no kit |
| Status | `p#status role="status"`, class `ok` (green) or `error` (red) (`packages/extension/static/options.html:35`, `packages/extension/src/options.ts:13-16`) | `.ok` `#1d6b2d`, `.error` `#a40000` |

On load, the page asks the worker for `status` and, when paired, fills the address and says `Paired with Slopify at <base>.` (`packages/extension/src/options.ts:18-25`). Submit sends `pair`; success clears the token field and says `Paired with Slopify at <base>. In Slopify, open a finished project, press Prepare upload, then Fill in YouTube Studio.`; failure shows the worker's message (`packages/extension/src/options.ts:27-44`). The worker accepts only `http://127.0.0.1` or `http://localhost` with an optional port, POSTs `/api/studio/ext/pair` with the token as a Bearer header, and stores `base` and `token` in `storage.local` (`packages/extension/src/background.ts:283-301`).

### Toolbar popup
| Region | What renders | Styling |
|---|---|---|
| Frame | 340 px wide body; inline `<style>` with `:root` tokens (`--bg`, `--ink`, `--ink2`, `--line`, `--hover`, `--accent` `#4f7d17`, `--done`, `--bad`) and a `prefers-color-scheme: dark` set (`--accent` `#a7d65c`); system-ui 13px (`packages/extension/static/popup.html:6-29`) | inline CSS, no kit |
| Header | "←" back button (aria-label "Back to projects", hidden on the first view), `h1#heading` (default "Ready to upload"), and a link-style "Pairing" button that opens the options page (`packages/extension/static/popup.html:32-36`, `packages/extension/src/popup.ts:13-15`) | `.link` |
| Main | `main#main`, first "Loading…" (`packages/extension/static/popup.html:37`); then a `ul` (max 460 px, scrolls) of full-width row buttons, each a title and a right-hand meta; disabled rows at 60 % opacity (`packages/extension/src/popup.ts:24-45`, `packages/extension/static/popup.html:17-24`) | `.meta`, `.done` (green), `.action` (accent, bold) |

Views (`packages/extension/src/popup.ts:47-227`):

| View | Heading | Rows |
|---|---|---|
| Not paired | Ready to upload | note "Pair the extension with Slopify first." and a primary "Pair with Slopify" opening the options page (`packages/extension/src/popup.ts:211-221`) |
| Projects | Ready to upload | one row per project from `GET /api/studio/ext/ready` (finished, not marked uploaded): title, meta `<n> · by <Sun 5 Oct, 18:00>` (the earliest upload-by time of its items not on YouTube), `<n> late` once that time has passed, `<n> to upload` when none has a time, or "all on YouTube" in the done colour; rows sorted by that earliest upload-by time (`packages/extension/src/popup.ts:47-81`, `packages/extension/src/background.ts:386-391`); empty: "Nothing is waiting: every finished project is marked uploaded in Slopify." |
| Items | project title, back to Projects | "Upload all <n> shorts" · "one after another" (accent) when more than one rendered short is not uploaded; then one row per upload `Video · <title>` / `Short N · <title>` with meta "Upload" or "Upload again" (an upload started before), plus ` · by <Sun 5 Oct, 18:00>` (its release minus the lead hours) or ` · late` once that has passed, when it has a release (accent); "not rendered" (disabled); "✓ on YouTube" (disabled; done colour for a short) for an uploaded short, or the long video while its id is unknown; "A/B test…" for the uploaded long video (`packages/extension/src/popup.ts:95-144`) |
| A/B test | "A/B test", back to Items | "Titles and thumbnails", "Titles", "Thumbnails", each meta "Open in Studio" (accent): opens the video's Studio edit page with `#slopify-ab=<mode>&p=<project>&s=0` in a new active tab and closes the popup; note "Studio opens with A/B Testing filled in. Check it, press Set test, then Save." (`packages/extension/src/popup.ts:148-182`) |

Upload and Upload all show "Opening YouTube Studio…", ask the worker (`upload` → `POST /api/studio/ext/upload`; `upload-all` → `POST /api/studio/ext/upload-all`, which also sets a three-hour Upload-all window) and open the returned Studio URL in a new tab, then close the popup; a failure replaces the list with the worker's message in the error colour (`packages/extension/src/popup.ts:184-209`, `packages/extension/src/background.ts:331-341`, `packages/extension/src/background.ts:392-400`).

### Studio in-page panel
| Region | What renders | Styling |
|---|---|---|
| Panel | `div#slopify-studio-panel role="status"`, fixed bottom-right 16px, max 380px, top z-index, column of toasts (`packages/extension/src/content.ts:28-47`) | inline styles, Roboto/Arial 13px |
| Toast | `Slopify: <text>`, optional "Copy", "Close"; background by tone: error `#5c1a1a`, ok `#1d3b24`, info `#282828`, white text, 8px radius (`packages/extension/src/content.ts:49-69`) | inline styles |
| Fill again row | "Fill again from Slopify" button, added when a dialog is handled, removed when it closes (`packages/extension/src/content.ts:636-639`, `packages/extension/src/content.ts:612-635`) | outlined transparent button (`packages/extension/src/content.ts:94-108`) |

Flow (`packages/extension/src/content.ts:471-658`): a `MutationObserver` (throttled to one look per 250 ms) watches Studio.
- **Select files step**: when an open upload dialog shows its file input and no Title field, the script asks the worker for the next queued item; when one waits it toasts `Adding <the video/short n> (<file>, <n.n> GB) from Slopify…`, fetches the file through a hidden extension frame (`video-frame.html`) and sets it on the input, then toasts `Added <file>. Studio uploads it as a private draft; the details are filled next. Nothing is published.`; nothing queued means the dialog is left to the person (`packages/extension/src/content.ts:492-547`, `packages/extension/src/video-frame.ts:3-10`). Failures: "The upload dialog closed before the video arrived, so nothing was added. Open Upload videos again." or `The video couldn't be added: <message> Drop it in by hand: Open folder in Slopify's Prepare upload shows it.` (`packages/extension/src/content.ts:535-540`, `packages/extension/src/content.ts:598-604`).
- **Details step**: once the Title field shows, watching stops; the item (`GET /api/studio/ext/pack` and each thumbnail from `/api/studio/ext/files/<projectId>/<asset>`) is filled once and Slopify is told (`POST /api/studio/ext/filled`); a 1 s interval waits for the dialog to close before watching again (`packages/extension/src/content.ts:606-643`, `packages/extension/src/background.ts:61-101`). Fields filled: title, description, the first thumbnail only, playlist, audience, AI use, tags; other titles and further thumbnails are left for the A/B test once the video is public; Show more is pressed at most once (`packages/extension/src/content.ts:151-153`, `packages/extension/src/fill.ts:185-197`).
- **Visibility step**: when the item has a scheduled time and the visibility selector shows, the schedule is typed in once and toasted: `Schedule set to <date time> (your time). Check it, then press Schedule.` or `<why> Set the schedule by hand: <date time>.` (`packages/extension/src/content.ts:610-627`, `packages/extension/src/studio-pages.ts:57-104`).
- **After filling**: the script reads the new video's `youtu.be` link from the dialog (up to 60 s) and sends it to Slopify; without it, info toast "Studio didn't show the new video's link, so Slopify can't start its A/B test by itself. Once it is up, paste its link in Slopify (project → YouTube → On YouTube)." It then waits up to three hours for Studio's "Video scheduled/published/saved" confirmation before reporting the upload done; a dialog closed without it reports nothing (`packages/extension/src/content.ts:204-325`). Inside an Upload-all window, "All the shorts are uploaded." ends it when nothing more waits; otherwise the page first waits for this file to finish uploading (info toast "Waiting for this short to finish uploading before the next one starts…"), then toasts "Uploaded. Opening the next short…" and opens a new upload; after three hours still uploading it shows the error toast "This upload didn't finish within three hours, so the next short wasn't started. Click the extension's icon to upload it." (`packages/extension/src/content.ts:246-301`).
- **Pages opened by hash**: `#slopify-ab=<mode>` sets up A/B Testing on the video's Details page, leaves it open and toasts the result with " Then press Save on the video." (`packages/extension/src/content.ts:349-362`, `packages/extension/src/fill.ts:439-460`); `#slopify-finish` (Details touches: a short's related video, the long video's end screen and captions) and `#slopify-stats` (Analytics Reach, then Engagement, then for a long video its A/B result) run in background tabs the worker opens every 15 minutes or daily, report to Slopify and are closed by the worker (`packages/extension/src/content.ts:364-450`, `packages/extension/src/background.ts:119-241`). On `www.youtube.com/watch#slopify-comment`, a background tab posts and pins the project's comment, only when Settings → YouTube Studio's comment switch is on (`packages/extension/src/comment.ts:4-8`, `packages/extension/src/background.ts:185-191`). Their outcomes surface in the project's On YouTube rows (03-project).
- **Content list**: on Studio's channel Videos list, row titles, ids and each row's Restrictions reading (up to 200) are sent to Slopify to match uploads made by hand and record Studio's checks; nothing is shown. A list the worker opened in the background with `#slopify-checks` (every 2 h while a scheduled video's checks are unread) is closed once its rows are sent (`packages/extension/src/content.ts:549-583`, `packages/extension/src/background.ts:192-206`, `:415`).

It never presses Next, Save, Schedule, Publish or Set test (`packages/extension/src/content.ts:8-17`, `packages/extension/src/studio-pages.ts:4-10`).

## States
| State | Trigger | Rendered |
|---|---|---|
| Pack loading | `pack.data` undefined, no error | drawer body empty; footer primary disabled "Wait for the upload pack to load" (`packages/web/src/studio/prepare-upload.tsx:237-244`, `packages/web/src/studio/prepare-upload.tsx:263`) |
| Pack error | `readUploadPack` rejects | danger `Callout` "The upload pack couldn't be read." `<message> Close Prepare upload and open it again.` (`packages/web/src/studio/prepare-upload.tsx:258-262`) |
| Pairing unknown/error | settings query error | primary disabled `Couldn't check whether the extension is paired: <message> Close Prepare upload and open it again.` (`packages/web/src/studio/prepare-upload.tsx:241-242`) |
| Unpaired | `pairing.origin === null` | install callout, "Open YouTube Studio" link, primary disabled "Install and pair the Slopify Studio extension first (steps above)" (`packages/web/src/studio/prepare-upload.tsx:225-240`) |
| Fill pending | choose POST in flight | primary disabled (`packages/web/src/studio/prepare-upload.tsx:237`) |
| Filled, one waiting | choose resolves, queue length 1 | success status "Studio is opening. The Slopify Studio extension puts the video into its upload dialog and fills in the details. Check everything and publish yourself." (`packages/web/src/studio/prepare-upload.tsx:129-137`) |
| Filled, several waiting | queue length > 1 | success status `Added; <n> uploads are waiting. Studio is opening: …` (`packages/web/src/studio/prepare-upload.tsx:132-134`) |
| Fill failed | choose rejects | error status `Couldn't hand this to the extension: <message>` (`packages/web/src/studio/prepare-upload.tsx:139-143`) |
| Remove failed | queue remove rejects | error status `Couldn't remove it from Waiting for Studio: <message> Press Remove again.` (`packages/web/src/studio/prepare-upload.tsx:148-152`) |
| Footage save | switch pending → success/failure | switch shows the pending value and is disabled; "Saved. The AI use answer is updated." or `Couldn't save whether the clips are real footage: <message> Press the switch again.` (`packages/web/src/studio/prepare-upload.tsx:154-165`, `packages/web/src/studio/prepare-upload.tsx:306-307`) |
| Playlists save | tick pending → success/failure | checkboxes disabled; "Saved this project's playlists." or `Couldn't save the playlists: <message> Tick the playlist again.` (`packages/web/src/studio/prepare-upload.tsx:166-177`, `packages/web/src/studio/prepare-upload.tsx:323`) |
| Slot save | slot `Select` change → success/failure | select disabled while saving; "Saved when this project goes out." or `Couldn't change the slot: <message> Choose it again.` (`packages/web/src/studio/prepare-upload.tsx:178-189`) |
| Pick save | title radio or "Use for upload" → success/failure | radios and Use for upload disabled while saving; "Saved what the upload uses." or `Couldn't save the choice: <message> Choose it again.` (`packages/web/src/studio/prepare-upload.tsx:190-202`) |
| Copy | clipboard write | `Copied the <what>.`, or `Couldn't copy the <what>. Select the text and copy it.` when the Clipboard API is missing or refuses (`packages/web/src/studio/prepare-upload.tsx:203-216`) |
| Ticks unstorable | localStorage throws | ticks show until the drawer closes (`packages/web/src/studio/prepare-upload.tsx:482-489`) |
| Short item | a short chosen | no Thumbnail step (`packages/web/src/studio/prepare-upload.tsx:492-493`) |
| Options: bad address | not local http | "The Slopify address must be this computer, like http://127.0.0.1:6969. Copy it from the browser tab Slopify is open in." (`packages/extension/src/background.ts:285-288`) |
| Options: unreachable | fetch throws | `Couldn't reach Slopify at <base>. Start Slopify and check the address.` (`packages/extension/src/background.ts:295-297`) |
| Options: refused | non-OK response | the problem+json `detail`, else `Slopify answered <status> when asked for pairing. Check Slopify is running, then try again.` (`packages/extension/src/background.ts:30-39`) |
| Studio: not paired | no stored pairing | error toast "The extension isn't paired with Slopify yet. Open the extension's options, paste the pairing token from Slopify's Settings → YouTube Studio and press Pair." (`packages/extension/src/background.ts:63-66`, `packages/extension/src/content.ts:143-146`) |
| Studio: dialog changed | a needed field not found | nothing filled; the whole pack copied if allowed; error toast `Nothing was filled: Studio's upload dialog has changed, and Slopify couldn't find <fields>. …` with Copy (`packages/extension/src/content.ts:154-163`) |
| Studio: partial fill | some fields failed | one error toast per failed field (the first one's text copied now, others via Copy); info toasts for thumbnails, titles and AI use; summary `Filled what it could; <n> field(s) need you. Nothing was published.` (`packages/extension/src/content.ts:164-186`) |
| Popup: worker failure | `ready`, `upload` or `upload-all` answers not ok | the list is replaced by the message in `p.note.error` (`packages/extension/src/popup.ts:190-193`, `packages/extension/src/popup.ts:204-207`, `packages/extension/src/popup.ts:225`) |
| Studio: filled | all fields ok | ok toast `Filled <the video/short n>'s details. Check them, then publish in Studio yourself.`; when more wait, info `<n> more upload(s) waiting from Slopify: …` (`packages/extension/src/content.ts:181-201`) |
| Studio: clipboard refused on Copy | click-time write fails | a selected read-only textarea with "The browser refused the clipboard. The text is selected below: press Ctrl+C (⌘C on a Mac)." (`packages/extension/src/content.ts:71-92`) |
| Studio: mark filled failed | `/filled` unreachable | error toast that the next dialog may get the same item; remove it under Waiting for Studio (`packages/extension/src/background.ts:273-277`) |

Per-field toast texts in `fill.ts` (e.g. "Thumbnail set.", `Audience set to "No, it's not made for kids".`, `Couldn't find <label> — the text is copied, paste it by hand.`) and the Studio-page step messages in `studio-pages.ts` (related video, end screen, captions, schedule, Analytics) are shallow: not inventoried beyond `packages/extension/src/fill.ts:185-571` and `packages/extension/src/studio-pages.ts:1-336`.

## Motion
- The drawer enters with `animate-tick-in` (150ms fade), off under reduced motion (`packages/web/src/components/kit/drawer.tsx:70`, `packages/web/src/styles/index.css:90`).
- The options page, the popup and the in-page toasts have no animation (`packages/extension/static/options.html:6-19`, `packages/extension/static/popup.html:6-29`, `packages/extension/src/content.ts:49-69`).

## Copy
- Drawer: "Prepare upload", "What to upload", "In the order Studio asks", "Select all", "Waiting for Studio", "Thumbnails · A/B Testing", "Open YouTube Studio", "Fill in YouTube Studio", "Remove", "Download", "Copy", "Copy others", "Use for upload", "Title the upload uses", "Posting plan slot", "Not scheduled (set it in Studio yourself)" (`packages/web/src/studio/prepare-upload.tsx:220-665`).
- Callouts: "Slopify never publishes." with "Copy each step into Studio's upload dialog (Open YouTube Studio), check it and press Publish yourself." (unpaired) or "Fill in YouTube Studio hands this to the Slopify Studio extension, which puts the video into Studio's upload dialog and fills in the details. You check it and press Publish." (paired) (`packages/web/src/studio/prepare-upload.tsx:417-421`).
- Every error names what failed and the button to press ("Press Remove again.", "Tick the playlist again.", "Close Prepare upload and open it again.") (`packages/web/src/studio/prepare-upload.tsx:139-216`).
- Extension messages are prefixed `Slopify: ` and end with the fix, including where in Slopify to go (`packages/extension/src/content.ts:63`, `packages/extension/src/content.ts:158`).

## Not in play
- Publishing to YouTube: absent in both the app and the extension; the extension puts the file into Studio's own upload dialog, where Studio keeps it a private draft, and never presses Next, Save, Schedule, Publish or Set test (`packages/extension/src/content.ts:8-17`, `packages/extension/src/content.ts:542-546`).
- A store link in the install block: absent; it offers only the zips that ship inside Slopify (`packages/web/src/studio/extension-install.tsx:21-23`). A release-time Chrome Web Store upload script exists outside the UI (`packages/extension/scripts/publish-chrome.mjs:1-3`).
- Unpairing from the options page: absent; the page only pairs (`packages/extension/src/options.ts:27-44`).
- Kit tokens on the extension pages: not used; the options page, popup and in-page panel each style inline, the popup with its own `:root` variables (`packages/extension/static/options.html:6-19`, `packages/extension/static/popup.html:6-29`, `packages/extension/src/content.ts:34-61`).
- Reordering the Waiting for Studio list: absent; only Remove (`packages/web/src/studio/prepare-upload.tsx:400-410`).
- Done ticks as project state: absent; they live in this browser only (`packages/web/src/studio/prepare-upload.tsx:476-477`).
- An in-page badge on Studio: absent; the extension shows toasts and a Fill again button only (`packages/extension/src/content.ts:28-69`).
- A posting-plan editor or A/B result view in the extension: absent; the popup lists uploads and A/B choices only (`packages/extension/src/popup.ts:47-182`).
