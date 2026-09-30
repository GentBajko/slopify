---
scenario: studio-upload-prep
screens:
- 03-project
- 08-settings
- 13-schedules
depends_on:
- 14-storage-and-downloads
- 15-prompt-management
- 27-youtube-description
- 28-shorts
- 29-video-editing
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: 7cf4075dcf5f
paths_covered:
  - ":(top)packages/app/src/slices/studio/**"
  - ":(top)packages/app/src/edge/http/studio.ts"
  - ":(top)packages/extension/src/**"
  - ":(top)packages/extension/static/manifest.json"
  - ":(top)packages/web/src/studio/**"
---

Paths starting `slices/` or `edge/` are under `packages/app/src/`. All HTTP routes are mounted at `/api/studio` (`packages/app/src/edge/http/app.ts:215`).

## Trigger & preconditions

- Slopify never uploads or publishes; it builds an upload pack that the person copies into YouTube Studio or that the Slopify Studio browser extension fills in (`slices/studio/model.ts:1-5`).
- Entry points in the web app: the Prepare upload drawer on the project page (`packages/web/src/routes/project.tsx:729`), Home's Ready list (`packages/web/src/home/ready.tsx:71`) and the calendar (`packages/web/src/routes/calendar.tsx:602`). The `PrepareUpload` button is disabled until a finished video exists, "Available once the video has been made" (`packages/web/src/studio/prepare-upload.tsx:43-70`).
- Settings → YouTube Studio holds the playlists per channel and the pairing token (`packages/web/src/studio/settings-panel.tsx:17-18`, `packages/web/src/routes/settings.tsx:136`, `:305`).
- The extension (Manifest V3, name "Slopify Studio", permissions `storage`, `clipboardWrite`, host permissions `http://127.0.0.1/*` and `http://localhost/*`, content script on `https://studio.youtube.com/*`) (`packages/extension/static/manifest.json`) must be installed from the zips the app serves and paired before Fill in YouTube Studio is enabled (`packages/web/src/studio/prepare-upload.tsx:103-109`, `:196-203`).

## Steps

### Building the pack (`uploadPack`, `slices/studio/pack.ts:57-226`)

1. Unknown project → `{ ok: false, reason: "unknown-project" }` (`:58-59`). Only outputs whose file exists on disk count (`:61-63`, `:275-281`).
2. Each file is `{ url: /files/<projectId>/<asset>, asset, filename, contentType, bytes }` (`:65-71`, `slices/studio/model.ts:20-29`).
3. Playlists: `projectPlaylists` (Step "Playlists" below); `playlists` = chosen names, `playlist` = the first or null (`:76-80`).
4. AI use answer (`aiDisclosureOf`, `slices/studio/disclosure.ts:70-101`) from the channel's `aiDisclosure` setting (default `auto`) (`slices/studio/pack.ts:83`):
   - `yes` / `no` → fixed answer naming "Channels → the channel → Brand → YouTube AI disclosure" (`slices/studio/disclosure.ts:71-74`).
   - `auto` → Yes when any of: narrating AI voices marked "Imitates a real person" (only when `sources.audio === "generate"`; the single voice or every speaker's voice) (`slices/studio/pack.ts:228-249`); for the long video, uploaded clips marked real footage and a Look atmosphere other than `none` (`slices/studio/pack.ts:85-98`); an AI image model drawing from an Image prompt marked photorealistic (video: `sources.images === "generate"` and any image prompt; short: the shorts image prompt) (`slices/studio/pack.ts:99-103`). Otherwise No with a sentence listing why none applies (`slices/studio/disclosure.ts:93-100`). Studio's three cases are quoted verbatim in `aiUseCases` (`slices/studio/disclosure.ts:39-43`).
5. Long-video item (`slices/studio/pack.ts:156-174`): title = project title cut to 100 (`studioTitleMax`, `slices/studio/model.ts:10`); `titles` = the A/B titles from the edited YouTube description, each cut to 100; description and tags = `effectiveDescription` (hand edits and channel links applied, last chapter checked against the video duration; see 27-youtube-description.md) (`slices/studio/pack.ts:111-128`); thumbnails = `thumbnail` outputs with `meta.index <= thumbnailCountOf(config)`, sorted by index (`:135-140`); audience `not_made_for_kids` (`slices/studio/model.ts:15`); `chapterNotice` when chapters were adjusted.
6. One short item per clip in the `shorts` output's JSON (`slices/studio/pack.ts:176-214`): render = the `short_video` whose `meta.sentences` equals the clip's first/last sentences, else the newest for that number; description = clip description, the full-video line, a blank line, hashtags; tags = hashtags without `#`; no thumbnails ("Studio shows a frame of a short"); `titles` empty.
7. `missing` collects plain sentences (`slices/studio/pack.ts:106-154`, `:189-192`): video not made; description not written (two texts depending on `config.youtubeDescription`); no thumbnail (thumbnail `off` vs not made); fewer thumbnails than configured; no playlist set for the channel; a short not rendered.
8. `footage` = `{ clips, real }` only when `sources.images === "provide"` and uploaded clips exist (`slices/studio/pack.ts:85-89`, `:223`).

### Playlists (`slices/studio/settings.ts:19-162`)

- Default list in setting `studio.playlist`; a channel's own list in `studio.playlist.<channelId>`; a channel without its own uses the default (`:10`, `:23-27`, `:45-51`). A legacy row holding one string reads as one playlist ticked by default (`:67-79`).
- Save (`PUT /settings/playlists`, `edge/http/studio.ts:134-157`): at most 20 entries (`studioPlaylistsMax`, `slices/studio/settings.ts:31`); names trimmed, blanks dropped; an empty list deletes the row (`:98-113`). Refused 400 when a name exceeds 150 characters (`studioPlaylistMax`, `slices/studio/model.ts:11`) or a name repeats case-insensitively (`slices/studio/settings.ts:82-94`); 404 when `channelId` names no channel (`edge/http/studio.ts:138-144`).
- Per project (`PUT /packs/:projectId/playlists`, `edge/http/studio.ts:184-197`): names saved in the single row `studio.projectPlaylists` keyed by project id; `null` returns to the channel defaults (`slices/studio/settings.ts:117-162`). A saved choice ticks by case-insensitive name; a playlist the channel no longer lists drops out (`:134-150`). The drawer shows ticks only when the channel has more than one playlist (`packages/web/src/studio/prepare-upload.tsx:273-298`).

### Real footage (`PUT /packs/:projectId/real-footage`, `edge/http/studio.ts:169-182`)

- Project ids are kept sorted in one row `studio.realFootage` (`slices/studio/settings.ts:164-191`). The drawer shows the switch only for the video item when `footage` exists (`packages/web/src/studio/prepare-upload.tsx:262-272`). Response is the rebuilt pack.

### Pairing

1. Token: `studioPairing` reads `studio.pairing`, creating one (24 random bytes, base64url) with `origin`/`pairedAt` null on first read or when the row is damaged (`slices/studio/settings.ts:195-224`).
2. New pairing token (`POST /settings/pairing`, `edge/http/studio.ts:158-162`): `resetStudioPairing` deletes every `studio.fillQueue.*` row and writes a fresh unpaired token (`slices/studio/settings.ts:212-224`).
3. Extension options page: address + token → background `pair` (`packages/extension/src/options.ts:27-44`). The address must match `^http://(127\.0\.0\.1|localhost)(:\d+)?$` after trimming trailing slashes (`packages/extension/src/background.ts:96-101`); it POSTs `/api/studio/ext/pair` with `Authorization: Bearer <token>` and on success stores `base` and `token` in `storage.local` (`:102-113`).
4. Server (`POST /ext/pair`, `edge/http/studio.ts:262-282`; `pairStudioExtension`, `slices/studio/settings.ts:252-264`): token compared with `timingSafeEqual` (`:233-238`); origin must match `^(chrome-extension|moz-extension)://[a-z0-9-]{1,64}$` (`:227-231`); then `origin` and `pairedAt` are saved.

### Fill in YouTube Studio

1. Drawer button (`packages/web/src/studio/prepare-upload.tsx:194-211`): opens `https://www.youtube.com/upload` (`slices/studio/model.ts:18`) in a new tab inside the click, then `POST /packs/:projectId/choose` with the item's `short`.
2. Choose (`edge/http/studio.ts:198-218`): 404 when the pack has no such short; else `enqueueFill` (`slices/studio/queue.ts:64-79`) appends `{ projectId, short, at }` to `studio.fillQueue.<first 16 hex of sha256(token)>` (`:31-34`); an entry already waiting keeps its place; the list keeps the newest 50 (`fillQueueMax`, `:16`).
3. Content script (`packages/extension/src/content.ts:213-255`): a MutationObserver, throttled to one look per 250 ms, finds an upload dialog whose Title box is shown; the dialog is handled once, observation stops, and a 1 s interval waits for it to close before watching again. A "Fill again from Slopify" button is added.
4. Background `payload` (`packages/extension/src/background.ts:53-73`): `GET /api/studio/ext/pack`, then each thumbnail via `GET /api/studio/ext/files/:projectId/:asset`, base64-encoded for the page.
5. Server `GET /ext/pack` (`edge/http/studio.ts:283-315`): after `studioRequestAllowed`, walks the queue oldest first; the first entry whose project and item still exist is returned as `{ pack, item, waiting }`; entries that fail are removed.
6. Server `GET /ext/files/...` (`edge/http/studio.ts:332-363`): serves only an asset listed as a thumbnail in some item of the project's pack.
7. `fillStudio` (`packages/extension/src/fill.ts:85-254`): first checks every needed field exists (Title, Description, thumbnail input when thumbnails exist, playlist trigger when playlists exist, not-for-kids radio; AI use radio and Tags after pressing Show more at most once); any missing → fills nothing and reports `missing` (`:128-143`). Otherwise fills in order: title, description (`setEditableText`, verified by normalized text, `:265-282`), one thumbnail into the single slot or two/three into A/B Testing "Thumbnail only" last and left open for Set test (`:170-183`, `:241-246`, `:300-349`), playlists (ticked by name, closed with Done, `:357-429`), audience "No, it's not made for kids", AI use Yes/No, tags typed (`:434-461`).
8. Content script reporting (`packages/extension/src/content.ts:131-192`): toasts per failed field with Copy (the first failing text is put on the clipboard), info toasts for thumbnails and AI use, a summary "Filled … Check them, then publish in Studio yourself." Then, once per dialog, `filled` → `POST /api/studio/ext/filled` → `removeFill` (`edge/http/studio.ts:318-331`); remaining count is toasted.
9. Waiting for Studio list in the drawer (`GET /queue`, `POST /queue/remove`, `edge/http/studio.ts:220-232`; `packages/web/src/studio/prepare-upload.tsx:302-336`): entries with project titles, the first labelled "Next", each removable.

### Copy by hand

- The drawer lists steps in Studio's order `video, title, description, thumbnails, playlist, audience, altered, tags` (`slices/studio/model.ts:84-93`, `packages/web/src/studio/prepare-upload.tsx:73-82`) with Copy/Download/Open folder actions; done ticks are stored only in the browser's `localStorage` under `slopify.upload.<projectId>.<item>` (`packages/web/src/studio/prepare-upload.tsx:299`, `:348-355`). Tags copy comma-separated (`slices/studio/model.ts:97-99`).

### Extension download

- `GET /extension/:file` for `chrome.zip` / `firefox.zip` streams `slopify-studio-<browser>.zip` from `extensionDist` (`edge/http/studio.ts:71-76`, `:234-252`; `packages/app/src/main.ts:643`). The install component shows per-browser steps ending in pairing (`packages/web/src/studio/extension-install.tsx:21-23`).

## Branches

- Unpaired (pairing `origin` null) → drawer shows the install callout, "Open YouTube Studio" link and a disabled Fill button; paired → Fill enabled (`packages/web/src/studio/prepare-upload.tsx:184-203`, `:224-235`).
- More than one item → a Video / Short N switch (`packages/web/src/studio/prepare-upload.tsx:236-246`).
- Thumbnails: 0 → no thumbnail step in the fill; 1 → single slot; 2–3 → A/B Testing, falling back to thumbnail 1 in the single slot when the A/B button, dialog or its inputs are not found (`packages/extension/src/fill.ts:300-340`).
- An item from an older app without `alteredContent` → AI use left to the person; without `playlists` → the single `playlist` is ticked (`packages/extension/src/pack.ts:22-35`).
- Request with no `Origin` header → judged on the token alone; with one → it must equal the paired origin (`slices/studio/settings.ts:266-278`).
- CORS headers are sent only to an extension origin: on `/ext/pair` to any extension origin, elsewhere only to the paired one; never `*` (`edge/http/studio.ts:101-113`, `:254-261`).

## Unhappy paths

- Page-only routes (`/settings`, `/settings/playlists`, `/settings/pairing`, `/packs/:id/real-footage`, `/packs/:id/playlists`, `/packs/:id/choose`, `/queue`, `/queue/remove`) called with an `Origin` other than the app's own → 403 "…can only be changed from the Slopify page itself" (`edge/http/studio.ts:91-100`). `GET /packs/:projectId` and `GET /extension/:file` carry no origin check (`edge/http/studio.ts:163-167`, `:234`).
- Unknown project on any `/packs` route → 404 "This project no longer exists…" (`edge/http/studio.ts:367-373`).
- `/ext/*` with a bad token or wrong origin → 401 "The Slopify Studio extension isn't paired…" (`edge/http/studio.ts:114-120`). Pair from a non-extension origin → 403 (`:270-278`).
- Queue empty → 404 "Nothing is waiting to be filled in…"; every entry's project or short gone → entries removed and 404 "The project chosen to fill in is gone…" (`edge/http/studio.ts:307-314`).
- Thumbnail no longer in the pack → 404 (`edge/http/studio.ts:351-357`).
- Extension zips absent → 404 naming `npm run build` (`edge/http/studio.ts:239-245`).
- Queue entries older than 24 h (`fillQueueMs`) or malformed are dropped on read; a damaged row reads as empty (`slices/studio/queue.ts:14`, `:42-58`).
- Extension: not paired → "The extension isn't paired with Slopify yet…"; Slopify unreachable → "Couldn't reach Slopify at <base>…"; other non-OK → the problem `detail` or a status sentence (`packages/extension/src/background.ts:22-43`, `:54-58`). `filled` unreachable → a sentence telling the person to remove the item under Waiting for Studio, since the next dialog may be filled with it again (`:86-90`).
- Studio's dialog changed (a needed field missing) → nothing filled, whole pack text (`packText`, `packages/extension/src/pack.ts:68-81`) put on the clipboard, error toast naming the missing fields and suggesting updating the extension (`packages/extension/src/content.ts:147-156`).
- Clipboard refused → the text is shown selected in a textarea to copy with the keyboard (`packages/extension/src/content.ts:66-87`).
- A click that would press Next, Back, Done, Save, Schedule, Publish or Set test throws `RefusedClick` and the field fails with "Slopify's filler stopped before pressing one of Studio's … buttons" (`packages/extension/src/selectors.ts:229-240`, `packages/extension/src/fill.ts:494-507`).
- A playlist Studio does not list, or a tick that does not hold → that field fails with the names copied (`packages/extension/src/fill.ts:411-424`). Tags Studio did not turn into chips → fails with the line copied (`:451-460`).
- Deleting a project or channel does not remove its `studio.projectPlaylists` entry, `studio.realFootage` id or `studio.playlist.<channelId>` row: no code outside `slices/studio/` and the backup import reads those keys (`slices/storage/portable.ts:45-50`).

## State transitions

- Pairing: unpaired (`origin` null) → paired (`origin`, `pairedAt` set) on `/ext/pair`; any state → new unpaired token on New pairing token, which also empties every fill queue (`slices/studio/settings.ts:212-264`).
- Fill queue entry: absent → waiting (choose) → removed (filled by the extension, removed by the person, stale after 24 h, trimmed past 50, or its project/short gone when the extension asks) (`slices/studio/queue.ts`, `edge/http/studio.ts:293-306`).
- Per project playlist choice: defaults ↔ own list (`null` returns to defaults) (`slices/studio/settings.ts:152-162`).
- Real footage: off ↔ on per project (`slices/studio/settings.ts:186-191`).

## Invariants

- Nothing in Slopify or the extension presses Next, Save, Publish, Schedule or Set test (`packages/extension/src/fill.ts:37-38`, `packages/extension/src/selectors.ts:229-240`, `packages/extension/src/content.ts:12`).
- The Studio page never talks to Slopify; only the background worker does, and it sends nothing but the token and the filled item's id (`packages/extension/src/background.ts:4-6`, `packages/extension/src/pack.ts:44-45`).
- A dialog is either filled field by field or not touched at all when a needed field is missing (`packages/extension/src/fill.ts:31-36`).
- The pack generates nothing; it only reads current outputs (`slices/studio/pack.ts:54-56`).
- The pairing token and fill queues never travel in a backup; playlists, project playlist choices and real-footage ids do (`slices/storage/portable.ts:478-506`).
- The extension only reads thumbnails listed in a pack, never other project files (`edge/http/studio.ts:343-350`).
- Every upload is marked not made for kids (`slices/studio/model.ts:13-15`).

## Outcomes & side effects

- Success: Studio's upload dialog filled with title, description, thumbnail(s), playlists, audience, AI use and tags; the item leaves the queue; toasts summarize. The person publishes in Studio.
- Settings rows written: `studio.playlist`, `studio.playlist.<channelId>`, `studio.projectPlaylists`, `studio.realFootage`, `studio.pairing`, `studio.fillQueue.<hash>` (`slices/studio/settings.ts:10-11`, `:117`, `:167`, `:210`).
- Marking a video as uploaded is a separate action (`PUT /api/projects/:id/uploaded`, `edge/http/home.ts:31-34`); Prepare upload does not set it.

## Dimensions not in play

- Uploading or publishing through YouTube's API: absent by design.
- Money: none; the pack makes no provider call.
- Concurrency between two Slopify tabs choosing items: last write of the settings row wins; no locking beyond SQLite's.
- Multi-user permissions: none beyond the pairing token and the same-origin check.
- Custom thumbnails for shorts: absent; Studio's upload dialog offers none (`slices/studio/pack.ts:207-208`).
