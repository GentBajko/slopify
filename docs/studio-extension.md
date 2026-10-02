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
4. Thumbnail: the first goes under Thumbnail; with three thumbnails, all three go into
   Studio's A/B Testing (the button beside the title, which replaced Test & compare).
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
remote code: everything it runs is in the zip. It isn't in any extension store; it ships inside
Slopify.

### Install

Open **Settings → YouTube Studio → Install the Studio extension** (Prepare upload shows the same
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

### A/B tests after publishing (from 3.2.8, extension 0.3.0)

Studio tests titles and thumbnails only on public videos, and a scheduled video is private
until its time. So the upload gets only thumbnail 1, and the A/B test waits:

- After filling the Details, the extension reads the new video's link from the dialog and tells
  Slopify, which keeps it (project → YouTube → On YouTube). An upload with other titles or two or
  three thumbnails gets its test queued.
- Every 15 minutes, and when Chrome starts, the extension asks Slopify for the waiting tests and
  checks each video with YouTube's public oEmbed (it answers only for a public video, no
  sign-in). A public one's Details page opens in a background tab; the extension presses
  A/B Testing, picks Title and thumbnail (or Title only, or Thumbnail only), fills the titles and
  thumbnails, presses **Set test** (and Save, if Studio then enables it), reports to Slopify and
  closes the tab. This is the only place it presses Set test, and only for a test queued in
  Slopify; if anything isn't found it presses nothing and On YouTube shows why.
- Chrome has to be open and signed in to Studio; a test whose time passed while Chrome was
  closed starts the next time it opens.
- On YouTube also takes a pasted link for an upload made by hand, and **Start A/B test** queues a
  test for any recorded video after the fact.

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
- **Two or three thumbnails** are handled last, after every other field. The extension presses
  Studio's **A/B Testing** button beside the title with a full mouse press, since a plain
  script click doesn't open it. It then waits up to 3 seconds for the dialog, picks **Thumbnail
  only** and puts thumbnails 1, 2 and 3 into its Thumbnail 1, 2 and 3 slots. It leaves the
  dialog open, never presses **Set test**, and asks you to check the pictures and press Set test
  yourself. Closing the dialog drops the pictures. If the button isn't there, the dialog doesn't
  open, or the dialog has no picture slots, the extension sets the first picture as the
  thumbnail and tells you to add the others in A/B Testing by hand.

### How it talks to Slopify

The extension's background worker is the only part that talks to Slopify, and only to
`127.0.0.1` or `localhost`. Pairing sends the token from the extension's own origin
(`chrome-extension://…` or `moz-extension://…`); Slopify stores that origin, and from then on
the `/api/studio/ext/*` routes answer only requests with the token, and send CORS headers only
for that origin — never `*`, never a web page's. They serve the first waiting item's pack and
its thumbnails, and take the extension's word that it filled an item (`POST /ext/filled`),
nothing else.

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
