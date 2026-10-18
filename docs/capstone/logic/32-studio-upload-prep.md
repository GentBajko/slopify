---
scenario: studio-upload-prep
screens:
- 01-projects
- 03-project
- 08-settings
- 13-schedules
- 15-home
- 23-studio-upload
depends_on:
- 14-storage-and-downloads
- 15-prompt-management
- 27-youtube-description
- 28-shorts
- 29-video-editing
- 38-home-attention-and-uploads
generated_at_commit: d447a799ebc5
generated_date: 2026-10-11
capstone_version: 7.0.1
content_hash: 4694503e0f88
paths_covered:
  - ":(top)packages/app/src/slices/studio/**"
  - ":(top)packages/app/src/edge/http/studio.ts"
  - ":(top)packages/app/src/kernel/db/migrations/0045-youtube-videos.sql"
  - ":(top)packages/app/src/kernel/db/migrations/0046-youtube-upload-state.sql"
  - ":(top)packages/app/src/kernel/db/migrations/0048-releases.sql"
  - ":(top)packages/extension/src/**"
  - ":(top)packages/extension/static/manifest.json"
  - ":(top)packages/web/src/studio/**"
  - ":(top)packages/web/src/project/on-youtube.tsx"
  - ":(top)packages/app/src/edge/mcp/excluded-routes.ts"
  - ":(top)packages/app/src/edge/mcp/tools-publishing.ts"
absorbed_from:
  - features/2026-09-30-slopify-mcp@2026-10-11
---

Paths starting `slices/` or `edge/` are under `packages/app/src/`. All HTTP routes are mounted at `/api/studio` (`packages/app/src/edge/http/app.ts:276`). The posting plan and release calendar, Studio's checks, the Details-page finishing touches, the pinned comment, A/B tests on request and Studio's numbers are `44-studio-autopilot.md`; this file covers the pack, its upload through the extension, and how Slopify learns an upload reached YouTube.

## Trigger & preconditions

- Slopify never uploads through YouTube's API and never presses Publish or Schedule; it builds an upload pack that the person copies into YouTube Studio or that the Slopify Studio browser extension puts into Studio's upload dialog (`slices/studio/model.ts:1-5`).
- Entry points in the web app: the Prepare upload drawer on the project page (`packages/web/src/routes/project.tsx:853`), Home's Ready list (`packages/web/src/home/ready.tsx:85`) and the calendar (`packages/web/src/calendar/list-view.tsx:44`). The `PrepareUpload` button is disabled until a finished video exists, "Available once the video has been made" (`packages/web/src/studio/prepare-upload.tsx:47-75`).
- Agents through MCP stop at **Ready to upload**: they may read the pack and set what the person would set in Prepare upload (`get_upload_pack`, `set_pack_slot`, `set_pack_real_footage`, `set_pack_pick`, `set_pack_playlists`), read the fill queue and remove an entry from it (`get_fill_queue`, `remove_from_fill_queue`), and record links (`set_youtube_link`) (`packages/app/src/edge/mcp/tools-publishing.ts:40-90`, `:149`). No tool puts anything in the extension's queue: `POST /packs/:projectId/choose` (Fill in YouTube Studio) is excluded as acting on YouTube, and so is every extension-only `/ext/*` route, `/ext/upload` and `/ext/upload-all` included (`packages/app/src/edge/mcp/excluded-routes.ts:12-14`, `:81-99`). The pinned-comment setting `PUT /settings/auto-comment` is excluded too, since it posts comments in the person's name (`:82`). The pairing token is never made by an agent (`:80`).
- Entry point in the extension: the toolbar popup "Ready to upload" (`packages/extension/src/popup.ts:227-243`), which asks the paired Slopify for `GET /ext/ready`.
- Settings → YouTube Studio holds the playlists per channel, the posting plan (44), and the pairing token (`packages/web/src/studio/settings-panel.tsx:20-46`, `packages/web/src/routes/settings.tsx:136`, `:305`).
- The extension (Manifest V3, "Slopify Studio" 1.1.2; permissions `storage`, `clipboardWrite`, `alarms`; host permissions `http://127.0.0.1/*`, `http://localhost/*`, `https://www.youtube.com/oembed*`; content script `content.js` on `https://studio.youtube.com/*` and `comment.js` on `https://www.youtube.com/watch*`; popup `popup.html`; `video-frame.html` web-accessible to Studio only) (`packages/extension/static/manifest.json:12-50`) must be installed from the zips the app serves and paired before Fill in YouTube Studio is enabled (`packages/web/src/studio/prepare-upload.tsx:225-252`).

## Steps

### Building the pack (`uploadPack`, `slices/studio/pack.ts:62-279`)

1. Unknown project → `{ ok: false, reason: "unknown-project" }` (`:63-64`). Only outputs whose file exists on disk count (`:66-68`, `:328-334`).
2. Each file is `{ url: /files/<projectId>/<asset>, asset, filename, contentType, bytes }` (`:70-76`, `slices/studio/model.ts:20-29`).
3. Playlists: `projectPlaylists` (Playlists below); `playlists` = chosen names, `playlist` = the first or null (`slices/studio/pack.ts:83-92`).
4. AI use answer (`aiDisclosureOf`, `slices/studio/disclosure.ts:70-101`) from the channel's `aiDisclosure` setting (default `auto`) (`slices/studio/pack.ts:95`):
   - `yes` / `no` → fixed answer naming "Channels → the channel → Brand → YouTube AI disclosure" (`slices/studio/disclosure.ts:71-74`).
   - `auto` → Yes when any of: narrating AI voices marked "Imitates a real person" (only when `sources.audio === "generate"`; the single voice or every speaker's voice) (`realPersonVoicesOf`, `slices/studio/pack.ts:281-302`); for the long video, uploaded clips marked real footage and a Look atmosphere other than `none` (`:97-102`); an AI image model drawing from an Image prompt marked photorealistic (video: `sources.images === "generate"` and any image prompt; short: the shorts image prompt) (`:111-115`). Otherwise No with a sentence listing why none applies (`slices/studio/disclosure.ts:93-100`). Studio's three cases are quoted verbatim in `aiUseCases` (`slices/studio/disclosure.ts:39-43`).
5. Long-video item (`slices/studio/pack.ts:192-216`):
   - Titles: the project title, then the other titles from the edited YouTube description, each cut to 100 (`studioTitleMax`, `slices/studio/model.ts:10`) (`slices/studio/pack.ts:171-178`). The upload pick (below) puts the chosen title first: `title` is the chosen one, `titles` the rest in order; the same for `thumbnails` (`picked`, `slices/studio/pick.ts:32-45`; `slices/studio/pack.ts:191-200`). `pickable` lists every title and thumbnail in the project's order with the chosen indexes, an index past the end reading as 0 (`:201-206`).
   - Description, tags and pinned comment = `effectiveDescription` (hand edits and channel links applied, last chapter checked against the video duration; see 27-youtube-description.md) (`:123-139`); thumbnails = `thumbnail` outputs with `meta.index <= thumbnailCountOf(config)`, sorted by index (`:148-153`); audience `not_made_for_kids` (`slices/studio/model.ts:15`); `chapterNotice` when chapters were adjusted.
   - `scheduleAt` = the long video's release time from `releases`, when it has one (`scheduleOf`; `slices/studio/pack.ts:183`, `:212`; 44).
   - `captions` = the `subtitles_srt` output (`:187`, `:213`); `endScreenVideoId` = the video id in the project's Previous video link, else the last confirmed long video recorded before this project's (`previousLongVideo`, `slices/studio/videos.ts:172-185`) (`slices/studio/pack.ts:188-189`, `:214`, `:336-342`); `pinnedComment` = the edited pinned comment, trimmed, when not empty (`:190`, `:215`). What the extension does with these is 44.
6. One short item per clip in the `shorts` output's JSON (`slices/studio/pack.ts:219-265`): render = the `short_video` whose `meta.sentences` equals the clip's first/last sentences, else the newest for that number; description = clip description, the full-video line, a blank line, hashtags; the full-video link is the project's `shorts.fullVideoLink`, else `https://youtu.be/<id>` of the long video once its upload is confirmed (`:221-224`, `:248-253`); tags = hashtags without `#`; no thumbnails ("Studio shows a frame of a short"); `titles` empty; `scheduleAt` = that short's own release time, when it has one (`:262`); `relatedVideoId` = the long video's id once confirmed (`:263`). The Shorts section shows the same fallback link (`knownVideoLink`, `packages/web/src/project/on-youtube.tsx:38-42`; `packages/web/src/project/body-shorts.tsx:63`).
7. `missing` collects plain sentences (`slices/studio/pack.ts:118-167`, `:238-241`): video not made; description not written (two texts depending on `config.youtubeDescription`); no thumbnail (thumbnail `off` vs not made); fewer thumbnails than configured; no playlist set for the channel; a short not rendered.
8. `footage` = `{ clips, real }` only when `sources.images === "provide"` and uploaded clips exist; `series` = the project's series (`:264`); `schedule` = the long video's line and time and every short's time or null (`:90-94`, `:266`, `:269`).

### Upload pick (`PUT /packs/:projectId/pick`, `edge/http/studio.ts:514-527`)

- Body `{ title: 0–9, thumbnail: 0–9 }`, indexes into the project's own order (title 0 = the project title, thumbnail 0 = A) (`edge/http/studio.ts:122-125`). Saved as setting `studio.uploadPick.<projectId>`; absent or damaged reads as `{ title: 0, thumbnail: 0 }` (`slices/studio/pick.ts:16-26`). Response is the rebuilt pack.
- The drawer shows the titles as radios and "Use for upload" on each thumbnail not chosen; the chosen one is captioned "<letter> · upload" (`packages/web/src/studio/prepare-upload.tsx:569-600`, `:704-741`). The upload carries only the chosen title and thumbnail; the others are what an A/B test tries later (44).

### Playlists (`slices/studio/settings.ts:18-166`)

- Default list in setting `studio.playlist`; a channel's own list in `studio.playlist.<channelId>`; a channel without its own uses the default (`:21`, `:30-38`, `:57-63`). A legacy row holding one string reads as one playlist ticked by default (`:79-85`).
- Save (`PUT /settings/playlists`, `edge/http/studio.ts:431-451`): at most 20 entries (`studioPlaylistsMax`, `slices/studio/settings.ts:42`); names trimmed, blanks dropped; an empty list deletes the row (`:102-124`). Refused 400 when a name exceeds 150 characters (`studioPlaylistMax`, `slices/studio/model.ts:11`) or a name repeats case-insensitively (`slices/studio/settings.ts:88-100`); 404 when `channelId` names no channel (`edge/http/studio.ts:434-439`).
- Per project (`PUT /packs/:projectId/playlists`, `edge/http/studio.ts:529-541`): names saved in the single row `studio.projectPlaylists` keyed by project id; `null` returns to the channel defaults (`slices/studio/settings.ts:126-166`). A saved choice ticks by case-insensitive name; a playlist the channel no longer lists drops out (`:138-155`). The drawer shows ticks only when the channel has more than one playlist (`packages/web/src/studio/prepare-upload.tsx:319`).

### Real footage (`PUT /packs/:projectId/real-footage`, `edge/http/studio.ts:498-512`)

- Project ids are kept sorted in one row `studio.realFootage` (`slices/studio/settings.ts:168-189`). The drawer shows the switch only for the video item when `footage` exists (`packages/web/src/studio/prepare-upload.tsx:303-313`). Response is the rebuilt pack.

### Pairing

1. Token: `studioPairing` reads `studio.pairing`, creating one (24 random bytes, base64url) with `origin`/`pairedAt` null on first read or when the row is damaged (`slices/studio/settings.ts:191-214`).
2. New pairing token (`POST /settings/pairing`, `edge/http/studio.ts:453-457`): `resetStudioPairing` deletes every `studio.fillQueue.*` row and writes a fresh unpaired token (`slices/studio/settings.ts:200-214`).
3. Extension options page: address + token → background `pair` (`packages/extension/src/options.ts:27-44`). The address must match `^http://(127\.0\.0\.1|localhost)(:\d+)?$` after trimming trailing slashes (`packages/extension/src/background.ts:320-325`); it POSTs `/api/studio/ext/pair` with `Authorization: Bearer <token>` and on success stores `base` and `token` in `storage.local` (`:327-338`).
4. Server (`POST /ext/pair`, `edge/http/studio.ts:637-656`; `pairStudioExtension`, `slices/studio/settings.ts:242-254`): token compared with `timingSafeEqual` (`:223-228`); origin must match `^(chrome-extension|moz-extension)://[a-z0-9-]{1,64}$` (`:216-221`); then `origin` and `pairedAt` are saved.

### Choosing what the next upload dialog gets

- **Drawer** Fill in YouTube Studio (`packages/web/src/studio/prepare-upload.tsx:235-252`): opens `https://www.youtube.com/upload` (`slices/studio/model.ts:18`) in a new tab inside the click, then `POST /packs/:projectId/choose` with the item's `short`. Choose (`edge/http/studio.ts:543-563`): 404 when the pack has no such short; else `enqueueFill` (`slices/studio/queue.ts:55-71`) appends `{ projectId, short, at }` to `studio.fillQueue.<first 16 hex of sha256(token)>` (`:31-34`); an entry already waiting keeps its place; the list keeps the newest 50 (`fillQueueMax`, `:16`).
- **Popup** (`packages/extension/src/popup.ts:110-163`): `GET /ext/ready` (`edge/http/studio.ts:718-753`) lists projects with no upload mark whose derived state is `done`, `partial`, or `pending` and kept as is (38), whose video is rendered; each item carries `ready`, `uploaded` (`upload_state = 'done'`), `started` (`filled`), its `videoId`, `scheduleAt` and `uploadBy` = `scheduleAt` minus the lead hours (`edge/http/studio.ts:739-747`; 44). Projects are listed by the earliest `uploadBy` of their items not on YouTube (`packages/extension/src/popup.ts:71-78`). A project row reads "N · by <time>", "N late" (that time passed), "N to upload" (no time) or "all on YouTube" (`:79-91`); an item reads "✓ on YouTube", "not rendered", or "Upload"/"Upload again" followed by " · by <time>" or " · late" (`:130-141`). Clicking an item → `POST /ext/upload` (`edge/http/studio.ts:756-769`): 404 when the item is gone; otherwise `fillOnly` makes only that upload wait, dropping anything left from an earlier pick (`slices/studio/queue.ts:85-98`) and the worker opens the returned Studio URL in an active tab (`packages/extension/src/background.ts:399-407`).
- **Upload all N shorts** (popup row when more than one rendered short is not on YouTube, `packages/extension/src/popup.ts:116-128`) → `POST /ext/upload-all` (`edge/http/studio.ts:772-791`): every rendered short whose upload is not `done` is put first in reverse order, so short 1 ends up first; the worker stores `uploadAllUntil` = now + 3 h and opens Studio (`packages/extension/src/background.ts:335-345`).
- `GET /packs/:projectId`, `/ext/ready`, `/ext/upload` and `/ext/upload-all` first give a project whose long video is not confirmed on YouTube and whose video is rendered its release times from the posting plan (`planned`, `edge/http/studio.ts:229-246`; rules in 44). `GET /releases`, `PUT /releases/:projectId` and `PUT /packs/:projectId/slot` do the same.

### The upload dialog (`packages/extension/src/content.ts`)

1. **Watching** (`content.ts:458-474`, `:583-702`): a MutationObserver schedules at most one look per 250 ms. Each look also sends Studio's Content list rows (Backfill below).
2. **Video file** (`content.ts:482-545`, `:586-609`): when an open upload dialog shows its file input (`videoInput`, `packages/extension/src/selectors.ts:37-46`) and no Title box yet, the page asks the worker for `pack` (`GET /ext/pack`); with nothing waiting it leaves the dialog alone. Otherwise it loads a hidden `video-frame.html` frame of the extension, which fetches `/ext/files/<project>/<asset>` with the token and hands the downloaded `File` back in one `postMessage`, answering only `https://studio.youtube.com` (`packages/extension/src/video-frame.ts:28-86`); the file is set on Studio's input. Toast: "Added <file>. Studio uploads it as a private draft; the details are filled next. Nothing is published."
3. **Details**: when the dialog's Title box shows, the dialog is handled once: observation stops, a "Fill again from Slopify" button is added, and a 1 s interval watches for the Visibility step and for the dialog to close before watching again (`content.ts:610-702`).
4. **Payload** (`packages/extension/src/background.ts:96-101`): `GET /api/studio/ext/pack`, then each thumbnail via `GET /api/studio/ext/files/:projectId/:asset`, base64-encoded for the page (`:78-94`). Server `GET /ext/pack` (`edge/http/studio.ts:657-688`): after `studioRequestAllowed`, walks the queue oldest first; the first entry whose project and item still exist is returned as `{ pack, item, waiting }`; entries that fail are removed. Server `GET /ext/files/...` (`edge/http/studio.ts:932-967`): serves only an asset listed as a video or thumbnail of some item of the project's pack.
5. **Fill** (`fillStudio`, `packages/extension/src/fill.ts:118-286`, called with `abTestLater: true`, `content.ts:172`): first checks every needed field exists (Title, Description, thumbnail input when thumbnails exist, playlist trigger when playlists exist, not-for-kids radio; AI use radio and Tags after pressing Show more at most once); any missing → fills nothing and reports `missing` (`fill.ts:141-158`). Otherwise fills in order: title, description (`setEditableText`, verified by normalized text, `:297-313`, `:634`), the first thumbnail of the pack (the chosen one) into the single slot (`:195-208`, `:318-324`), playlists (ticked by name, closed with Done, `:467-539`), audience "No, it's not made for kids", AI use Yes/No, tags typed (`:544-571`). With `abTestLater`, other titles and further thumbnails are not put into A/B Testing on the upload.
6. **Reporting** (`content.ts:173-221`): toasts per failed field with Copy (the first failing text is put on the clipboard), info toasts for thumbnails, titles and AI use, a summary "Filled … Check them, then publish in Studio yourself." Then, once per dialog, `filled` → `POST /api/studio/ext/filled` → `removeFill` (`edge/http/studio.ts:691-704`); the remaining count is toasted.
7. **Schedule** (`content.ts:671-685`; `fillSchedule`, `packages/extension/src/studio-pages.ts:58-105`): once the Visibility step shows and the item has `scheduleAt`, the extension opens Schedule, types the date ("Oct 3, 2026") and time ("8:00 PM") in the browser's time zone, and checks Studio kept both; toast "Schedule set to … (your time). Check it, then press Schedule." It types once per dialog.
8. **Video id** (`content.ts:226-253`): for up to 60 s the page reads the `youtu.be/<id>` link in the dialog, then `POST /ext/video` → `recordVideo(..., "filled")` (`edge/http/studio.ts:908-921`).
9. **Confirmation** (`content.ts:258-268`, `:326-348`): for up to 3 h the page waits for Studio's share dialog or a dialog heading "Video scheduled", "Video published" or "Video saved"; a dialog that closes without one is not confirmed. Confirmed → `POST /ext/video/done` (`edge/http/studio.ts:925-931`): `confirmUpload` sets `upload_state = 'done'` on the filled row with that id, else the video is recorded as `done`; then the Details touches and the pinned comment are queued (44).
10. **Upload all, next** (`content.ts:269-289`): while `uploadAllUntil` has not passed, the page asks the worker for `pack`; nothing waiting → the flag is cleared and "All the shorts are uploaded." is toasted; otherwise the page first waits for this file to finish uploading (`uploadFinished`, `:308-324`): every 2 s it looks for Studio's upload progress text ("uploading", "N% uploaded/done", "remaining", "keep this page/window/tab open", "don't close") in the progress panel, share dialog, uploads dialog or upload progress element, else the whole page (`stillUploading`, `:292-306`), toasting "Waiting for this short to finish uploading before the next one starts…" once; two quiet looks in a row count as finished. Finished → "Uploaded. Opening the next short…" and after 2.5 s the tab goes to `https://www.youtube.com/upload`; not finished within 3 h → error toast "This upload didn't finish within three hours, so the next short wasn't started. Click the extension's icon to upload it." and nothing opens (`:279-290`).
11. **Waiting for Studio** list in the drawer (`GET /queue`, `POST /queue/remove`, `edge/http/studio.ts:596-608`; `packages/web/src/studio/prepare-upload.tsx:383-412`): entries with project titles, the first labelled "Next", each removable.

### Links of uploads made elsewhere

- **On YouTube** panel in the project's YouTube section (`packages/web/src/project/on-youtube.tsx:64-104`, mounted at `packages/web/src/project/body-youtube.tsx:451`): one row per upload (the video and each short). `GET /videos/:projectId` (`edge/http/studio.ts:567-569`). `PUT /videos/:projectId` `{ short, link }` (`:572-594`): an empty link forgets the row; otherwise `videoIdOf` takes an 11-character id from `youtu.be/`, `?v=`, `/shorts/`, `/video/`, `/live/`, `/embed/` or a bare id (`slices/studio/videos.ts:34-47`) and records it as `done`.
- **Backfill** (`content.ts:547-581`): on Studio's Content list (`/channel/<id>/videos…`) the page sends each row's title, video id and Restrictions reading (`checks`, 44), at most 200, whenever an id or a checks value changes → `POST /ext/backfill` (`edge/http/studio.ts:707-715`). `backfillVideos` matches a row to a project upload by exact title (trimmed, spaces collapsed, case-insensitive): the long video by any of its titles, a short by its own; only uploads with no `done` video are filled and recorded as `done`; release rows are left as they are (`slices/studio/backfill.ts:17-37`). Rows carrying `checks` update that video's `youtube_videos.checks` (`edge/http/studio.ts:712-713`; 44).

### Copy by hand

- The drawer lists steps in Studio's order `video, title, description, thumbnails, playlist, audience, altered, tags, schedule` (`slices/studio/model.ts:117-127`); a short has no thumbnails step (`packages/web/src/studio/prepare-upload.tsx:493`). The schedule step shows the slot picker (44) and the time "your time" or "Not scheduled: … Set the date in Studio's Visibility step." (`:617-630`). Done ticks are stored only in the browser's `localStorage` under `slopify.upload.<projectId>.<item>` (`:379`, `:428-435`, `:485`). Tags copy comma-separated (`slices/studio/model.ts:132-134`).

### Extension download

- `GET /extension/:file` for `chrome.zip` / `firefox.zip` streams `slopify-studio-<browser>.zip` from `extensionDist` (`edge/http/studio.ts:169-177`, `:610-628`; `packages/app/src/main.ts:772`). The install component shows per-browser steps ending in pairing (`packages/web/src/studio/extension-install.tsx:21-23`).

## Branches

- Unpaired (pairing `origin` null) → the drawer shows the install callout, "Open YouTube Studio" link and a disabled Fill button; paired → Fill enabled (`packages/web/src/studio/prepare-upload.tsx:225-252`, `:265-275`). The popup without a pairing shows "Pair the extension first" and a "Pair with Slopify" button that opens the options page (`packages/extension/src/popup.ts:296-306`).
- More than one item → a Video / Short N switch (`packages/web/src/studio/prepare-upload.tsx:276-288`).
- Thumbnails on the upload: none → no thumbnail step; one or more → only the chosen one, in the single slot (`packages/extension/src/fill.ts:195-208`). A/B Testing is never touched during the upload.
- A file input appears with nothing waiting in Slopify → the dialog is the person's own upload and is not touched (`packages/extension/src/content.ts:486-488`).
- Item without `scheduleAt` → the Visibility step is not touched (`content.ts:671-685`).
- An item from an older app without `alteredContent` → AI use left to the person; without `playlists` → the single `playlist` is ticked (`packages/extension/src/pack.ts:43-45`).
- Request with no `Origin` header → judged on the token alone; with one → it must equal the paired origin (`slices/studio/settings.ts:256-267`).
- CORS headers are sent only to an extension origin: on `/ext/pair` to any extension origin, elsewhere only to the paired one; never `*` (`edge/http/studio.ts:197-207`, `:630-636`).
- A popup item already confirmed on YouTube is not clickable for upload; the long video with a known id opens the A/B choices instead (`packages/extension/src/popup.ts:133-148`; 44).

## Unhappy paths

- Page-only routes (`GET /settings`, `PUT /settings/auto-comment`, `PUT /plan`, `PUT /settings/lead-hours`, `GET /releases`, `PUT /releases/:id`, `PUT /settings/playlists`, `POST /settings/pairing`, `PUT /packs/:id/slot`, `/packs/:id/real-footage`, `/packs/:id/pick`, `/packs/:id/playlists`, `/packs/:id/choose`, `PUT /videos/:id`, `GET /queue`, `POST /queue/remove`) called with an `Origin` other than the app's own → 403 "…can only be changed from the Slopify page itself" (`edge/http/studio.ts:188-194`). `GET /packs/:projectId`, `GET /plan`, `GET /ab-results`, `GET /videos/:projectId` and `GET /extension/:file` carry no origin check (`edge/http/studio.ts:302`, `:458-464`, `:565-569`, `:610`).
- Unknown project on a `/packs` route or `/ext/packs/:id` → 404 "This project no longer exists…" (`edge/http/studio.ts:1002-1007`).
- `/ext/*` with a bad token or wrong origin → 401 "The Slopify Studio extension isn't paired…" (`edge/http/studio.ts:209-215`). Pair from a non-extension origin → 403 (`:575-583`).
- Queue empty → 404 "Nothing is waiting to be filled in…"; every entry's project or short gone → entries removed and 404 "The project chosen to fill in is gone…" (`edge/http/studio.ts:681-687`).
- A file not in the pack (or no longer in it) → 404 "That file isn't in the project's upload pack any more…" (`edge/http/studio.ts:956-961`).
- Extension zips absent → 404 naming `npm run build` (`edge/http/studio.ts:616-621`).
- Queue entries older than 24 h (`fillQueueMs`) or malformed are dropped on read; a damaged row reads as empty (`slices/studio/queue.ts:14`, `:41-50`).
- Extension: not paired → "The extension isn't paired with Slopify yet…"; Slopify unreachable → "Couldn't reach Slopify at <base>…"; other non-OK → the problem `detail` or a status sentence (`packages/extension/src/background.ts:31-51`, `:61-68`). `filled` unreachable → a sentence telling the person to remove the item under Waiting for Studio, since the next dialog may be filled with it again (`:277-281`).
- Video file could not be fetched → error toast "The video couldn't be added: … Drop it in by hand: Open folder in Slopify's Prepare upload shows it."; the dialog closed before it arrived → "…nothing was added. Open Upload videos again." (`packages/extension/src/content.ts:533-539`, `:603-608`).
- Studio's dialog changed (a needed field missing) → nothing filled, the whole pack text (`packText`, `packages/extension/src/pack.ts:170-186`) put on the clipboard, error toast naming the missing fields and suggesting updating the extension (`packages/extension/src/content.ts:173-182`).
- Clipboard refused → the text is shown selected in a textarea to copy with the keyboard (`packages/extension/src/content.ts:88-109`).
- A click that would press Next, Back, Done, Save, Schedule, Publish or Set test throws `RefusedClick` and the field fails with "Slopify's filler stopped before pressing one of Studio's … buttons" (`packages/extension/src/selectors.ts:261-275`, `packages/extension/src/fill.ts:615-630`).
- A playlist Studio does not list, or a tick that does not hold → that field fails with the names copied (`packages/extension/src/fill.ts:525`, `:532`). Tags Studio did not turn into chips → fails with the line copied (`:568`).
- Schedule not set (Visibility, Schedule, date or time field missing, or Studio did not keep the typed value) → error toast ending "Set the schedule by hand: <date>, <time>." (`packages/extension/src/studio-pages.ts:60-100`).
- No video link in the dialog within 60 s → info toast to paste the link in On YouTube; nothing is recorded (`packages/extension/src/content.ts:238-244`).
- Upload cancelled or left as a draft → the row stays `filled`; the popup offers "Upload again" and On YouTube says "Filled in Studio, but not scheduled or published yet…" (`packages/extension/src/popup.ts:211`, `packages/web/src/project/on-youtube.tsx:50-51`).
- `/ext/video` or `/ext/video/done` failing → error toast; the row keeps its earlier state (`content.ts:250-268`).
- Pasted link that is not a YouTube video link → 400 "That isn't a YouTube video link…" (`edge/http/studio.ts:584-590`).
- Deleting a project or channel does not remove its `studio.projectPlaylists` entry, `studio.realFootage` id, `studio.uploadPick.<projectId>` row or `studio.playlist.<channelId>` row: nothing outside `slices/studio/` and the backup code reads those keys (`slices/storage/portable.ts:48-53`). `youtube_videos` rows cascade with the project (`packages/app/src/kernel/db/migrations/0045-youtube-videos.sql:6-7`).

## State transitions

- Pairing: unpaired (`origin` null) → paired (`origin`, `pairedAt` set) on `/ext/pair`; any state → new unpaired token on New pairing token, which also empties every fill queue (`slices/studio/settings.ts:200-254`).
- Fill queue entry: absent → waiting (choose appends; popup Upload and Upload all put first) → removed (filled by the extension, removed by the person, stale after 24 h, trimmed past 50, or its project/short gone when the extension asks) (`slices/studio/queue.ts:55-97`, `edge/http/studio.ts:667-680`).
- `youtube_videos.upload_state` per upload (`project_id`, `short` 0 for the long video): absent → `filled` (`/ext/video`) → `done` (`/ext/video/done`); absent → `done` by a pasted link, backfill, or a confirmation with no filled row. Recording the same id keeps `done`; a different id replaces the row's id, returns it to the recorded state and resets its A/B fields; an empty pasted link deletes the row (`slices/studio/videos.ts:70-114`; `packages/app/src/kernel/db/migrations/0046-youtube-upload-state.sql:1-6`, every row recorded before 0046 reads `done`).
- Upload pick: default `{0,0}` ↔ chosen indexes (`slices/studio/pick.ts:24-26`).
- Per project playlist choice: defaults ↔ own list (`null` returns to defaults) (`slices/studio/settings.ts:152-162`). Real footage: off ↔ on per project (`:188-193`).

## Invariants

- In the upload dialog nothing in Slopify or the extension presses Next, Back, Done, Save, Schedule, Publish or Set test; the person presses Schedule or Publish (`packages/extension/src/fill.ts:36-43`, `:576-589`, `packages/extension/src/selectors.ts:261-275`, `packages/extension/src/content.ts:8-17`). The Details-page presses after a confirmed upload are 44's.
- An upload counts as on YouTube (`done`) only after Studio shows its scheduled/published/saved confirmation, a link is pasted, or the Content list names it; a filled but unconfirmed upload stays `filled` (`packages/extension/src/content.ts:236-237`, `slices/studio/videos.ts:16-18`).
- No upload sets the project's upload mark (`project_uploads`); only Mark uploaded does (38). The popup keeps listing a project whose items are all on YouTube ("all on YouTube") until it is marked (`finishedProjects`, `edge/http/studio.ts:258-270`; `packages/extension/src/popup.ts:79-91`).
- The Studio page never calls Slopify; the worker and the extension's own video frame carry the token (`packages/extension/src/background.ts:11-12`, `packages/extension/src/video-frame.ts:28-39`). The worker sends Slopify the filled item, the video ids, the Content list rows, task results and Studio's numbers (`background.ts:307-408`); its header comment ("it never sends Slopify anything but the token") predates those calls.
- A dialog is either filled field by field or not touched at all when a needed field is missing (`packages/extension/src/fill.ts:36-41`).
- The pack generates nothing; it only reads current outputs and rows (`slices/studio/pack.ts:59-61`).
- The pairing token and fill queues never travel in a backup; playlists, project playlist choices and real-footage ids do; `studio.uploadPick.*`, `studio.postingPlan`, `studio.autoComment` and `studio.leadHours` do too, each checked against its schema (`slices/storage/portable.ts:478-524`, `:533-545`). `youtube_videos` rows travel with their project (`slices/storage/backup-format.ts:63-64`).
- No MCP tool reaches YouTube or the extension's queue; uploading is the person's, through the drawer or the popup (`packages/app/src/edge/mcp/excluded-routes.ts:81-99`, checked by `packages/app/src/edge/mcp/tools-parity.test.ts:41-69`). A video marked **Late · upload now** on Calendar → Releases is listed by `needs_attention` as `late-upload` with `agentCanAct: false`: the agent reports it and does nothing else (`packages/app/src/slices/agents/attention-work.ts:200-227`).
- The extension only reads files listed in a pack as a video or a thumbnail (`edge/http/studio.ts:942-955`).
- Every upload is marked not made for kids (`slices/studio/model.ts:13-15`).

## Outcomes & side effects

- Success: Studio's upload dialog gets the video file, title, description, the chosen thumbnail, playlists, audience, AI use, tags and the planned schedule; the item leaves the queue; the upload is recorded `filled`, then `done` when Studio confirms it. The person presses Schedule or Publish.
- Settings rows written: `studio.playlist`, `studio.playlist.<channelId>`, `studio.projectPlaylists`, `studio.realFootage`, `studio.pairing`, `studio.fillQueue.<hash>`, `studio.uploadPick.<projectId>` (`slices/studio/settings.ts:10-11`, `:117`, `:167`, `:212`, `slices/studio/pick.ts:21`). Tables: `youtube_videos` (`packages/app/src/kernel/db/migrations/0045-youtube-videos.sql:6`), `releases` (44).
- Extension `storage.local`: `base`, `token`, `uploadAllUntil` (`packages/extension/src/background.ts:303`, `:342`); `studioChannel` and the checks tab are 44's.
- Marking a video as uploaded is a separate action (`PUT /api/projects/:id/uploaded`, 38).

## Dimensions not in play

- Uploading or publishing through YouTube's API: absent by design.
- D5 Money: none; the pack and the extension make no provider call.
- D8 Concurrency between two Slopify tabs choosing items: last write of the settings row wins; `youtube_videos` upserts by `(project_id, short)`; no locking beyond SQLite's.
- D1 Multi-user permissions: none beyond the pairing token and the same-origin check. An agent's in-process call carries no Origin, so it passes the page-only check (`edge/http/studio.ts:188-194`), and the exclusions above are what keep it from the upload queue.
- D13 Notification: the extension's toasts on the Studio page only; Slopify emits no event or notification on fill or confirmation.
- Custom thumbnails for shorts: absent; Studio's upload dialog offers none (`slices/studio/pack.ts:256-257`).
