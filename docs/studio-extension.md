# YouTube Studio prep

Slopify never uploads or publishes. There is no YouTube Data API upload and no Google sign-in:
you upload in YouTube Studio in your own browser and press Publish yourself. Slopify gets
everything ready for that, two ways.

## Prepare upload (no extension)

On a finished project, press **Prepare upload** in the project's header. The drawer lists, in
the order Studio's upload dialog asks for them:

1. Video file: download it, or Open folder.
2. Title.
3. Description, with the chapters and hashtags (turn on YouTube description in Edit project →
   Prompts to have one written).
4. Thumbnail: the picked one goes under Thumbnail. The others are for an A/B test you start
   later from On YouTube (Studio tests only public videos).
5. Playlist: set it in Settings → YouTube Studio → Playlist, once as the default (Every
   channel) and, if you like, per channel; a channel without its own uses the default.
6. Audience: "No, it's not made for kids".
7. AI use (under Show more): Yes or No, with why (see below).
8. Tags, under Studio's Show more.

Each step has Copy and a done tick (the ticks are remembered in this browser only). Shorts are
listed too, one per short; a short has no thumbnail step, since Studio shows a frame of it.

The description's chapters are fitted to YouTube's rules first; the Description step says
what was changed (see [Chapters follow YouTube's rules](library-and-editing.md)).

## AI use (AI disclosure)

Studio asks every upload one question behind **Show more**. Its wording on the live Details page
(read 2026-09-27):

> **AI use** — Was AI used to generate or edit your content in any of the following ways?
> 1. Makes a real person appear to say or do something they didn't say or do
> 2. Alters footage of a real event or place
> 3. Generates a realistic-looking scene that didn't actually occur
>
> "Yes, AI was used" / "No, AI wasn't used". Selecting 'yes' adds a label to your content.

(It used to be called "Altered or synthetic content". YouTube's help page,
[Disclosing use of altered or synthetic content](https://support.google.com/youtube/answer/14328491),
says the same: clearly unrealistic content, small edits such as colour or filters, and AI
used for the script, title, thumbnail or captions need no label.)

Slopify answers **Yes only when one of those three cases applies**, and **No** otherwise. An
AI narrator and AI pictures on their own are none of the three. Each case is something you
mark, and every mark is off until you set it:

1. **A voice that imitates a real person.** In **Settings → Voices**, turn on **Real person**
   for a voice cloned from, or made to sound like, a real person. A video or short narrated in
   that voice (the one narration voice, or any speaker's) gets Yes.
2. **Real footage that is altered.** When a project's images include uploaded video clips,
   Prepare upload's AI use step shows **The uploaded clips are real footage (filmed, not made by
   AI)**. With it on, the video gets Yes when the Look's atmosphere overlay (embers, dust or fog)
   is laid over them. A colour grade, vignette or grain alone counts as one of YouTube's minor
   edits and stays No. Shorts show new pictures, never the clips.
3. **Photorealistic AI pictures.** Open an Image prompt in **Library → Prompts** and turn on
   **Draws photorealistic pictures** for a style that looks like real photos or film. A video
   whose images are drawn from such a prompt, or a short whose Shorts image prompt is one, gets
   Yes. Painterly, illustrated and other stylised prompts stay off, and so does the built-in
   Shorts image style.

The answer says which case applies, in YouTube's words, or that none does. Each channel can
still override it at the top of its **Brand** tab: **YouTube AI disclosure** is **Automatic**
(the rule above), **Always Yes** or **Always No**. The rule lives in
`packages/app/src/slices/studio/disclosure.ts`; the marks are rows of the settings table
(`voices.realPerson`, `library.photorealisticPrompts`, `studio.realFootage`) and travel with a
backup.

## Three thumbnails

Play's Thumbnail rail and Edit project → Images offer **Thumbnails: 1 or 3** for a thumbnail
drawn from a prompt. Three draws the same prompt twice more, asking for a different composition
each time (a close-up, then a wider shot), and follows the establishing image when it is on.
Each costs one image. The project shows the three side by side, each with its own Regenerate.
One (the default) keeps a project's thumbnail and its fingerprints exactly as before.

## The Slopify Studio extension

`packages/extension` is a small Manifest V3 extension for Chrome/Chromium and Firefox. It has no
remote code: everything it runs is in the zip. It is the bridge between Slopify and YouTube:
Slopify decides and keeps the state (what to upload, when, which A/B test), and the extension
does it in YouTube Studio in your own signed-in browser and reports back.

### Install

From 3.3.0 (extension 1.0.0) the Chrome extension is in the Chrome Web Store as an unlisted
item, so installed copies update by themselves. The release workflow's `chrome-web-store` job
uploads each new version's zip and submits it for review
(`packages/extension/scripts/publish-chrome.mjs`, Chrome Web Store API v2, with a service
account). It needs the repository secrets `CWS_SERVICE_ACCOUNT_JSON`, `CWS_PUBLISHER_ID` and
`CWS_EXTENSION_ID`; without them the job says so and skips. A version the store already has is
"nothing new to publish", not a failure, so bump `packages/extension/static/manifest.json` and
`package.json` when the extension changes. The privacy policy is
[extension-privacy.md](extension-privacy.md).

To load it by hand instead, open **Settings → YouTube Studio → Install the Studio extension** (Prepare upload shows the same
steps while no extension is paired). Pick the browser, press **Download**, and follow the three
steps:

- Chrome, Chromium, Edge, Brave: unzip `slopify-studio-chrome.zip` into a folder you keep, open
  `chrome://extensions` (`edge://extensions`), turn on Developer mode, press **Load unpacked**
  and pick that folder.
- Firefox (128 or newer): open `about:debugging#/runtime/this-firefox`, press
  **Load Temporary Add-on** and pick `slopify-studio-firefox.zip`. A temporary add-on is removed
  when Firefox restarts; load it again then.
- Then pair it (below).

A new Slopify may bring a new extension: download and load it again after updating.

The download is `GET /api/studio/extension/chrome.zip` or `firefox.zip`, served from
`packages/app/dist/extension/`. The root `npm run build` builds `packages/extension` before the
app, and the app's build copies both zips in (`packages/app/scripts/copy-extension.mjs`, which
fails the build when they are missing). To build only the extension:
`npm run build -w packages/extension` (writes `packages/extension/dist/chrome/`, `dist/firefox/`
and the two zips).

### Pair

1. In Slopify, open **Settings → YouTube Studio** and press **Copy** beside the pairing token.
2. Click the extension's toolbar button (or open its options), check the Slopify address (the
   one in your Slopify tab, `http://127.0.0.1:6969` by default), paste the token and press
   **Pair**.

Settings then shows the paired extension. **New pairing token** unpairs it.

### Use

1. On a finished project, press **Prepare upload**, pick the video or a short, and press
   **Fill in YouTube Studio** (it is only offered once an extension is paired). Studio's upload
   page opens in a new tab.
2. Studio's upload dialog opens on Select files, and the extension puts the waiting video in
   itself (from 3.2.7, with the extension downloaded from that version): it says "Adding the
   video…", then "Added". Studio uploads it as a private draft, as it does a file dropped in by
   hand. If it can't (Slopify not running, the dialog changed), it says so: drop the file in
   yourself, from Open folder in Prepare upload. The video passes through a hidden page of the
   extension's own (`video-frame.html`), which hands Studio the file in one message, so even a
   multi-GB video isn't copied through the extension's messages.
3. When the Details step appears, the extension fills the title, description, thumbnail(s),
   playlist, audience, the AI use answer (Yes or No, with why) and tags, then says what it did.
   **Fill again from Slopify** (bottom right) repeats it.
4. Check everything, go through Studio's remaining steps, and schedule or publish yourself.
   The extension never presses Next, Save, Schedule or Publish on an upload.

### Posting plan and release calendar (from 3.3.0; releases from 3.4.0)

**Settings → YouTube Studio → Posting plan** is the week: one line per long video, with its
series, the long video's day and time and as many shorts as you post for it (each with its own
day and time), in one time zone. It starts empty, so nothing is scheduled until you add a long
video. It is kept as `studio.postingPlan` (`slices/studio/plan.ts`, shapes in `plan-model.ts`).

- **Release times** live in `releases` (`slices/studio/releases.ts`, migration 0048): one row
  per long video (short 0) and per short. When a finished project's upload is prepared, it
  appears in Calendar → Releases, or the extension asks for it, a project with no long-video
  time takes the **next free time of a line that takes its series**, far enough ahead to upload
  in time, in an hour no other release has.
- **Series**: a line takes any project, or only one series. A project's series is the part of
  its title pattern (else its title) after the last "|", placeholders removed
  (`seriesOf`).
- **Each short takes its line's first short time after the one before it**, so nothing needs
  "next week", and never the same hour as another release (it takes the next one instead). A
  project gets as many short times as it has shorts.
- **Upload by**: each item is due `studio.leadHours` hours before its release (24 by default,
  Settings → YouTube Studio), so YouTube's copyright and ad checks finish while it is private.
- **Calendar → Releases** (`studio/releases-view.tsx`, `GET /api/studio/releases`) shows the
  coming two weeks: each long video with its shorts, each item's release, upload-by time and
  state (not rendered, upload by…, late, filled, scheduled with or without checks clear), and
  the plan's free times with the finished projects that fit them. Any time can be moved, a long
  video set to not scheduled (`PUT /api/studio/releases/:projectId`); moving a long video drops
  its shorts' plan-placed times so they are placed again after it.
- Prepare upload's Schedule step shows the long video's time with a picker of the free times of
  its series (`PUT /api/studio/packs/:id/slot`).
- Each pack item carries `scheduleAt`. In the upload dialog's Visibility step the extension
  opens Schedule and types the date and time into Studio's date and time boxes (Studio reads
  them in the browser's time zone). You press **Schedule**.
- **Checks**: Studio's Content list rows carry each video's Restrictions; the extension sends
  them with the rows ("None" is kept as `ok`, `youtube_videos.checks`). While a scheduled video
  due in the future has no clear checks, `GET /ext/tasks` says `checks: true` and the worker
  opens the Content list in a background tab every two hours (`#slopify-checks`), which closes
  itself once it has sent the rows. The channel id comes from any Studio page the extension saw.

### The toolbar popup (from 3.2.10; Upload all from 3.3.0)

Clicking the extension's icon lists the finished projects not marked uploaded in Slopify, the
soonest due first, each with its upload-by time (or "late"). A project opens to its video and
shorts, each with its own "by" time, and a ✓ on those on YouTube. Clicking one puts it first in
line and opens Studio's upload page, where the extension adds the file and fills the details.
**Upload all N shorts** queues every short not yet on YouTube and uploads them **one at a time**
(from 1.1.0): once Studio confirms one upload, the extension waits until its file has fully
uploaded (Studio stops showing "Uploading…", "remaining" or "Keep this page open"), then opens
the next upload page. Leaving the page earlier would stop the upload. **Pairing** (top right)
opens the pairing page.

An upload counts as on YouTube only once Studio shows "Video scheduled", "Video published" or
"Video saved" after you press Schedule, Publish or Save. One cancelled, or closed as a draft,
stays offered ("Upload again").

### After the upload (from 3.3.0)

Once Studio confirms an upload, Slopify queues its finishing touches. Every 15 minutes, and when
Chrome starts, the extension asks for them (`GET /api/studio/ext/tasks`) and opens the video's
Details page in a background tab:

- **Captions**: the project's subtitles file goes in through Subtitles → Upload file → With
  timing.
- **End screen** (long video): a Video element pointing at the previous episode (the project's
  "Previous video" link, else the long video uploaded before it).
- **Related video** (shorts): the project's long video, once it is public (checked with YouTube's
  public oEmbed, no sign-in).

It presses only the editors' own Save/Done and the Details page's Save, reports each result
(`POST /ext/task-result`) and closes the tab. On YouTube (project → Video) shows what's waiting,
done or failed, and why.

**Pinned comment** (off by default; Settings → YouTube Studio → Post and pin each video's
comment): once the video is public, the extension opens its watch page, posts the project's
pinned comment in your name and pins it.

### A/B testing on demand (from 3.3.0)

By default an upload gets one title and thumbnail 1, the ones picked in Prepare upload. An A/B
test starts only when you ask: **A/B test** on On YouTube (project → Video), or the popup's
choices on an uploaded long video (Titles and thumbnails, Titles, Thumbnails). Either opens the
video's Details page with a `#slopify-ab=` hash; the extension presses A/B Testing, picks the
mode and fills the titles and thumbnails. You check them and press **Set test** and **Save**
yourself; the extension never presses them. It then tells Slopify (`POST /ext/task-result` with
`task: "ab"`): filled, the video's A/B test counts as running (`ab_state` `started`); not, it is
`failed` with the reason, shown on On YouTube. A failed later attempt keeps a test already set
up running. A new video id for the upload starts over at `none`.

### A/B test results

Once a day the extension opens the Details page of each long video whose A/B test is running
(`GET /ext/known-videos`: the ones set up as above),
in a background tab, and reads the test's result once Studio has one (`POST /ext/stats`, kept in
`ab_results`). **Library → A/B results** lists them, winner first, and **Copy as prompt notes**
puts a summary on the clipboard for the Library prompts that write titles and thumbnails. Nothing
changes a prompt by itself. Studio's views, CTR and watch time are no longer read (removed in
3.17.0).

### Links

- After filling the Details, the extension reads the new video's link from the dialog and tells
  Slopify, which keeps it (project → Video → On YouTube). On YouTube also takes a pasted link
  for an upload made by hand.
- Opening Studio's Content page matches its videos and shorts to your projects by title, so
  uploads made by hand get their links too.

**Several uploads in a row.** Each Fill in YouTube Studio adds the item to **Waiting for
Studio**, which Prepare upload lists (oldest first, from every project, each with Remove). Each
new upload dialog is filled with the first waiting item, which then leaves the list, so preparing
shorts 1, 2 and 3 fills three uploads one after another. The list is kept in the settings table
(`studio.fillQueue.<hash of the pairing token>`), so it survives a restart; an item waits up to
24 hours, a new pairing token clears the list, and it never travels with a backup.

**Nothing half-filled.** Before writing anything, the extension checks that every field the item
needs is in Studio's dialog (pressing Show more to see AI use and Tags). If one is missing,
Studio has changed: it fills nothing, puts the whole pack (title, description, tags, playlist,
audience, AI use) on the clipboard and says which fields it couldn't find, with a Copy button.
The item stays waiting.

A field that is there but doesn't take the text gets its own message, for example "Couldn't add
2 of the tags — Studio didn't turn them into tags". The first such text goes on the clipboard;
each message has a Copy button for its own. Studio's page may refuse a clipboard write no click
asked for; the message then says to press Copy, and should even that be refused, the text is
shown selected to copy with the keyboard.

The extension watches Studio for the upload dialog cheaply: page changes schedule one look at
most every 250 ms, and the watching stops while a dialog is being handled and starts again once
that dialog closes.

How it fills each field, following Studio's own components:

- **Title and description** are contenteditable boxes, not inputs. The extension focuses the
  box, selects everything and types through the browser's own editing commands (insertText,
  with insertLineBreak for each line break), so Studio's scripts see ordinary typing and the
  description keeps its line breaks. Where the page refuses those commands it sets the text as
  lines and `<br>`s and sends an input event.
- **Show more** is pressed once, only while its label still offers to show the advanced
  settings, before AI use and Tags.
- **Tags** are typed one at a time into the chip bar's input, each followed by Enter (then a
  comma if Studio kept the text), so each becomes a chip. Tags already there are skipped. Any
  Studio didn't turn into a chip are copied for pasting.
- **Radios** (audience, AI use) are clicked by their `name` and checked for Studio's selected
  mark.
- **Playlist**: it opens the Playlists dropdown and waits up to 5 seconds for the rows (Studio
  draws them only once the list shows). It ticks the row whose name is the playlist's, unless
  it is already ticked, and closes the list with its **Done**, or Escape if Done isn't there.
  It never presses the list's **Save**.
- **Thumbnail**: the upload gets thumbnail 1 (the picked one). Other titles and thumbnails wait
  for an A/B test you start (above).

### How it talks to Slopify

The extension's background worker is the only part that talks to Slopify, and only to
`127.0.0.1` or `localhost`. Pairing sends the token from the extension's own origin
(`chrome-extension://…` or `moz-extension://…`); Slopify stores that origin, and from then on
the `/api/studio/ext/*` routes answer only requests with the token, and send CORS headers only
for that origin — never `*`, never a web page's. They serve the first waiting item's pack and
its thumbnails, the finishing-touch and A/B queues, and take the extension's reports (filled,
uploaded, task results, A/B results), nothing else. The only other address the extension calls is
YouTube's public oEmbed.

### Posting to other sites: the routes (from 4.0.0)

Posting adds its own routes beside Studio's, under `/api/social/ext/*`, with the same pairing
token and the same CORS rule (the paired extension's origin only). They are additive: an
extension from before posting never calls them, and a newer extension seeing 404 from an older
Slopify hides posting.

| Route | What it does |
|---|---|
| `GET /api/social/ext/next?platform=<site>` | The oldest post waiting for that site that can be filled now (`{pack, waiting}`, `ActivePost` in `slices/social/model.ts`); it becomes `filling`. 404 with a sentence when none waits. |
| `GET /api/social/ext/packs/:projectId/:platform` | One post's pack (`PostPack`), for a due fill opened with `#slopify-post=`. |
| `GET /api/social/ext/files/:projectId/:file` | A file one of the project's posts lists (`PostPack.media[].file`); pictures cut to the site's shape are made on the first ask. Anything else is 404. |
| `GET /api/social/ext/due?hours=1-48` | `{posts: DuePost[]}`: waiting posts on Instagram, Bluesky and Reddit whose fill time (two minutes before release) is within the hours, or passed at most 12 hours ago (`late`). |
| `POST /api/social/ext/result` | `{projectId, platform, state: filling\|filled\|scheduled\|posted\|failed, url?, message?}`; answers `{status}`. A link must be a post on that site; a report for a post nobody asked to fill is refused. |
| `GET /api/social/ext/find-links` | `{posts: LinkLookup[]}`: filled or scheduled posts without a link, ten minutes after they went out, with the profile page (the channel's account) and the post's first 40 characters. |
| `POST /api/social/ext/sites` | `{sites: [...]}`: the sites the options page was allowed to post on; Prepare upload says why Fill can't run without them. |

The page's own routes (`GET /api/social/packs/:projectId` and its `choice`, `text`, `reddit`,
`link` and `fill` routes) answer `SocialPacksResponse` (the packs plus what the extension
reported); `fill` answers `FillResponse`. Nothing on the server posts: Fill only queues.

### Selectors and the live page

Studio changes its page from time to time. The selectors in
`packages/extension/src/selectors.ts` were checked against the live Studio Details page on
2026-09-27 (read only, on an existing video's Details editor, which uses the same components as
the upload dialog): the title and description boxes (`#title-textarea` / `#description-textarea`
`div#textbox`), the thumbnail input (`ytcp-thumbnail-uploader input#file-loader`), the playlist
trigger (`ytcp-dropdown-trigger[aria-label="Select playlists"]`), the audience radios
(`VIDEO_MADE_FOR_KIDS_NOT_MFK`), Show more (`#toggle-button[aria-label="Show advanced
settings"]`), the AI use radios (`#altered-content`, `VIDEO_HAS_ALTERED_CONTENT_YES`/`_NO`), the
Tags chip bar (`#tags-container ytcp-chip-bar input#text-input`) and the A/B Testing button
(`button#preview-button[aria-label="A/B Testing"]` inside `ytcp-button#ab-test-button`).

The same day, the two overlays were opened and read (still without saving anything):

- **The playlist list**: `ytcp-playlist-dialog` > `tp-yt-paper-dialog` >
  `ytcp-checkbox-group#playlists-list` > `div#checkbox-group` > `ul` > `tp-yt-iron-list` >
  `div#items[role=list]`, with one `ytcp-ve` per playlist. Each row is `li.row` >
  `label.ytcp-checkbox-label`, holding `ytcp-checkbox-lit` (which wraps
  `div#checkbox[role=checkbox]`, `aria-checked="true"` once ticked, and a hidden checkbox input)
  and the name in `span.checkbox-label .label-text`. Its buttons are `ytcp-button.done-button`
  (Done), `ytcp-button.save-button` (Save, which the extension refuses to press) and
  `ytcp-button.new-playlist-button`, and there is a `ytcp-search-bar`. The iron-list draws its
  rows only after the list shows, so right after the click it can be empty.
- **The A/B Testing dialog**: `ytcp-creator-experiment-create-dialog` > `ytcp-dialog` >
  `tp-yt-paper-dialog#dialog`, titled "A/B Testing". Its mode chips are
  `ytcp-static-chip-bar ytcp-chip#chip-0` "Title only" (the default), `#chip-1` "Thumbnail
  only" and `#chip-2` "Title and thumbnail", with no aria-selected. With Thumbnail only chosen,
  it shows three `ytcp-thumbnail-uploader`s (Thumbnail 1 and 2 required, Thumbnail 3 optional),
  each with its own `input#file-loader[type=file]` (the same id three times). It is committed
  with "Set test", which the extension refuses to press (matched by its text, since no id was
  read), and closed with an X in its header. Calling `.click()` on the A/B Testing button from
  a script did not open it, but a real pointer click did.
- Neither overlay's paper-dialog had an `opened` attribute while showing, so the extension goes
  by whether an element is laid out (it has client rects and isn't `display: none`).

The single thumbnail's selectors are scoped to the metadata editor and skip anything inside
`ytcp-creator-experiment-create-dialog`, whose inputs share the id `file-loader`.

The fixture the tests use, `packages/extension/test/fixtures/studio-upload.html`, is
hand-built with invented content. Its Details fields, playlist list and A/B Testing dialog copy
what was read, and the rows and uploaders Studio draws later sit in `<template>`s that the tests
render at the right moment. The upload dialog around the fields and its footer buttons follow
`selectors.ts`. The tests check that each field is found by its checked selector. Older
selectors stay behind the checked ones as fallbacks.

Still unverified:

- **The 3.3.0 and 3.4.0 flows on a live page**: the schedule's date and time boxes, Upload
  all's wait for the file to finish (read from Studio's words, not an element), the Content
  list's Restrictions cell (`.tablecell-restrictions`) for the checks, Upload all's next
  upload, the captions upload, the end screen and related-video pickers, posting and pinning the
  comment and reading a finished A/B test. Their selectors come from a
  read-only look at Studio on 2026-10-02 (`studio-pages.ts`); none of them was saved then.

- **Whether the upload dialog behaves like the Details editor**: the ids match, but the upload
  dialog itself wasn't inspected. The A/B Testing button may only appear once the upload is
  saved.
- **Whether the pointer sequence the extension sends opens A/B Testing**: a real click did and
  a script `.click()` didn't. The extension's events come from a script too, so on some pages
  it may still fall back to "add them by hand".
- **Whether "Thumbnail only" is chosen by a click on its chip**, and whether Studio accepts
  files set on the uploaders' inputs from a script. Nothing was uploaded during the look, and
  Set test was never pressed.
- **A long playlist list**: the iron-list only draws the rows in view, so a playlist far down
  may not be found. The extension then says so and copies the name. It doesn't type into the
  list's search bar.
- **Whether Studio makes a chip on Enter or on comma**, and whether it keeps the line breaks typed
  this way; the extension tries both keys and checks what it can.

Before relying on the extension, try it on a real upload and watch its messages. When a field
stops filling:

1. Open the upload dialog, right-click the field, Inspect, and note an id, `aria-label` or
   element name that finds it.
2. Add that selector in front of the field's list in `selectors.ts` (each field lists several,
   tried in order), and update the fixture to match.
3. Run `npx vitest run --project extension`, rebuild, and reload the extension.

## Posting to other sites (extension 2.0.0)

From extension 2.0.0 the same extension fills your posts on **X, LinkedIn, Instagram, TikTok,
Reddit and Bluesky** from a project's posts (Prepare upload, and Edit project → Upload pack).
It works like the YouTube side: Slopify decides what each post says and carries, the extension
fills the site's own post form in your signed-in browser and reports back. There are no site
APIs and no logins.

**It never presses the final Post, Share, Publish or Schedule, nor Discard.** Each site lists
its own forbidden buttons in its adapter (`packages/extension/src/social/sites/<site>.ts`,
`forbidden`), and every site refuses a button whose whole label is Post, Post all, Share, Share
now, Publish, Publish post, Schedule, Tweet, Reply, Discard, Discard post, Turn on, Allow or
Delete (`src/social/guard.ts`). A press on one throws `RefusedClick` before any event is sent;
the fill stops there and says so. The buttons inside a schedule dialog that only set the time
are allowed: X's date picker **Confirm**, LinkedIn's schedule step **Next**, and TikTok's
**Schedule** radio (a radio, not a button) with its date and time.

### Allow posting on a site

The six sites are **optional** permissions (`optional_host_permissions` in the manifest), never
required ones: a required host added in an update would switch the installed extension off
until you accepted it, and YouTube Studio would stop filling. The manifest's required host
permissions are exactly 1.x's (a test checks it). So nothing runs on a site until you allow it:

1. Open the extension's options (click its toolbar button, or Options in the browser's
   extensions page).
2. Under **Posting**, press **Allow posting on X** (or another site). The browser asks you for
   that site only. For Instagram, Bluesky and Reddit it also asks to show notifications (see
   below).
3. The extension then registers its page script for that site
   (`chrome.scripting.registerContentScripts`, id `slopify-social-<site>`) and tells Slopify,
   so Prepare upload's **Fill in <site>** knows it can work. **Stop posting on <site>** takes it
   back. Taking the permission away in the browser's own settings works too: the next sync
   (browser start, every 15 minutes) unregisters the script.

### What happens when you press Fill in <site>

Slopify puts the post in the extension's queue and opens the site's post form. The page script
(`src/social-content.ts` → `src/social/runner.ts`) runs only on the post form
(`x.com/compose/post`, `linkedin.com/feed/?shareActive=true`, `instagram.com/`,
`tiktok.com/tiktokstudio/upload`, `reddit.com/…/submit`, `bsky.app/`); there it asks the worker
for the site's next waiting post, gets its media, fills the form, reports `filled` (or `failed`
with the reason) and shows a message per part, with Copy where something must be pasted by hand.
It then watches the page for up to 30 minutes for the site's sign that you posted it and
reports `posted` with the post's link when the page shows one, or `scheduled`.

Before writing anything it checks that every control the post needs is on the page. If one is
missing (the site changed), it fills nothing, names what it couldn't find, and offers the text
to paste. Sites whose form has several steps (Instagram, TikTok) are checked step by step: each
step's controls are all found before that step is written.

**Text** goes into the sites' rich editors (Draft.js, ProseMirror/Tiptap, Lexical) the way a
person's would, each way checked before the next is tried: a paste of the text, then the
browser's insertText command line by line, then a `beforeinput` event. If none leaves the box
showing the text, the box is emptied, the text is put on the clipboard and the message says to
paste it (`src/social/rich-text.ts`).

**Media**: a video comes through the extension's hidden frame (`video-frame.html`, now web
accessible to the six sites as well as Studio; each origin may ask only for its own kind of
file, and Slopify serves a post's own media only). Pictures, and a video under 50 MB on a page
that blocks the frame, come through the worker. A bigger video on such a page: the message says
to download it from Prepare upload and add it yourself.

**AI labels** are always switched on for a post with Slopify media: Instagram's **Add AI label**,
TikTok's **AI-generated content** (under Show more) and X's **Content disclosure** AI choice.
Where the label isn't found, the message says so and nothing else is pressed. LinkedIn, Bluesky
and Reddit have none.

**Account-setting prompts** a site raises over its form, like TikTok's "Turn on automatic
content checks?", are closed with their **Cancel** (`src/social/modals.ts`), never Turn on,
Allow or Discard. An unknown prompt is left for you.

**Release time.** X, LinkedIn and TikTok have their own scheduler: when the post has a release
time inside the site's window, the extension sets it (you press Schedule). Outside the window,
in the past, or when the scheduler can't be set, the post is left to go out when you press Post
and the message says which time to set by hand. Instagram, Bluesky and Reddit have no
scheduler: about two minutes before the release time a worker alarm opens the site's post form
in a background tab, the page fills it, and a notification says it's ready (clicking it brings
the tab forward; without the notifications permission the tab comes forward itself). If the
browser was closed at that time, the post is still filled when it starts, up to 12 hours late,
and the notification says it's late.

**Links.** When the page doesn't show the published post's link, the worker later opens your
profile on that site (from the channel's account names, set with the channel's posting
settings) in a background tab, at most every six hours per post; the page finds the post by its
first 40 characters, reports its link and the tab closes. You can always paste the link under
the post in Prepare upload.

### How it talks to Slopify (posting)

Only the background worker talks to Slopify, with the same pairing token and CORS rules as
YouTube Studio's routes: `GET /api/social/ext/next?platform=` (the site's next waiting post,
marked filling), `GET /api/social/ext/files/:projectId/:file` (only that post's media),
`GET /api/social/ext/due` (posts due on sites without a scheduler), `POST /api/social/ext/result`
(filled, scheduled, posted or failed, with a link only when it matches the site's link pattern),
`GET /api/social/ext/find-links` and `POST /api/social/ext/sites` (the sites allowed). The pages
on the sites never call Slopify. A Slopify from before posting answers 404 to all of these, and
the extension then does nothing on the sites; an extension from before 2.0.0 with a new Slopify
keeps working for YouTube and simply never takes a post.

### Posting selectors and the live sites

Every control is one entry in its site's `selectors` table, with a `checked` date: the day it
was seen on the live site, or `null` where it follows the site's web app or help pages and
**needs a live check by the person**. The forms were looked at read-only in the owner's Chrome
on 2026-10-18 (Instagram and TikTok with a test file that was discarded, never shared or
posted). The fixtures in `packages/extension/test/fixtures/social/` copy what was seen; the
later steps sit in `<template>`s the tests render. The tests check, per site: the controls are
found, the text goes in, files arrive through a DataTransfer with a change event, the AI switch
ends up on, the scheduler is set or left with a sentence, no forbidden button is ever pressed
(spied), a missing control fills nothing and names it, and the published sign gives the link.

| Site | Checked 2026-10-18 | Not seen (`checked: null`) |
| --- | --- | --- |
| X | text box `[data-testid="tweetTextarea_0"]`, media `input[data-testid="fileInput"]`, `scheduleOption`, `contentDisclosureButton`; forbidden `tweetButton`, `app-bar-close`, `unsentButton` | the schedule dialog's selects (Month, Day, Year, Hour, Minute, AM/PM) and Confirm (`scheduledConfirmationPrimaryAction`); the disclosure's AI choice and Done; the "Your post was sent" / "will be sent on" toasts; profile `article[data-testid="tweet"]` |
| LinkedIn | text box `.tiptap.ProseMirror`, the "Schedule post" clock; forbidden Post (`button.share-actions__primary-action` and the label) | the share box's file input and the media editor's Next; the schedule step's date, time and Next; "Post successful … View post"; profile `[data-urn^="urn:li:activity:"]` |
| Instagram | Create `svg[aria-label="New post"]`, the dialog's file input, "Select crop" and its choices, Next, the caption box `[aria-label="Add a caption..."]`, "Add AI label", Accessibility's "Write alt text..."; forbidden Share, the dialog's Close, "Discard post?"'s Discard | the "shared as reels" notice's OK; "Your post has been shared"; the profile grid's links |
| TikTok | video input `accept="video/*"`, photo input, Draft.js description, Show more, "AI-generated content", When to post radios `name=postSchedule`, the "Turn on automatic content checks?" prompt; forbidden Post, Discard, Turn on | the date and time pickers under Schedule; the move to `/tiktokstudio/content` as the posted sign; the profile's videos |
| Bluesky | "Compose new post", `[data-testid="composePostView"]`, its Tiptap text box; forbidden `composerPublishBtn` | the hidden file input behind "Add media to post"; alt text boxes; the published toast; profile feed items |
| Reddit | nothing: Claude in Chrome refuses reddit.com | **all of it** — title, body and link boxes, the Images & Video tab and input, flair (all searched inside open shadow roots); forbidden `#submit-post-button` and Post. Treat a Reddit fill as a first try and check every field. |

Still unverified, beyond the `null` selectors:

- **Whether each editor takes the paste** the extension sends; the fallbacks are tried and
  checked, and the last resort is the clipboard.
- **Whether the sites let the extension's frame load** (their Content Security Policy). If not,
  videos under 50 MB still come through the worker; bigger ones are added by hand.
- **X's and TikTok's AI choices and every scheduler's pickers**: the extension sets what it
  finds and checks it read back, but a site may keep its own state; the message asks you to
  check the time before pressing Schedule.
- **Reddit as a whole**, above.
- **Firefox**: optional host permissions and run-time content scripts follow the same
  WebExtension calls, but posting was only built against Chrome.

When a site stops filling: Inspect the control, put a selector that finds it in front of its
entry in the site's `selectors` table, set `checked` to the day you saw it, update the site's
fixture to match, run `npx vitest run --project extension`, rebuild and reload the extension.
