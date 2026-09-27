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
   Video to have one written).
4. Thumbnail: the first goes under Thumbnail; with three thumbnails, all three go into
   Studio's A/B Testing (the button beside the title, which replaced Test & compare).
5. Playlist: set its name once in Settings → YouTube Studio.
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
remote code: everything it runs is in the zip.

### Build

```sh
npm run build -w packages/extension
```

This writes `packages/extension/dist/chrome/`, `packages/extension/dist/firefox/`, and a zip of
each (`slopify-studio-chrome.zip`, `slopify-studio-firefox.zip`).

### Install

- Chrome, Chromium, Edge, Brave: open `chrome://extensions`, turn on Developer mode, press
  **Load unpacked** and pick `packages/extension/dist/chrome`.
- Firefox (128 or newer): open `about:debugging#/runtime/this-firefox`, press
  **Load Temporary Add-on** and pick `packages/extension/dist/firefox/manifest.json`. A temporary
  add-on is removed when Firefox restarts; load it again, or sign the zip on
  addons.mozilla.org for a permanent install.

### Pair

1. In Slopify, open **Settings → YouTube Studio** and press **Copy** beside the pairing token.
2. Click the extension's toolbar button (or open its options), check the Slopify address (the
   one in your Slopify tab, `http://127.0.0.1:6969` by default), paste the token and press
   **Pair**.

Settings then shows the paired extension. **New pairing token** unpairs it.

### Use

1. On a finished project, press **Prepare upload**, pick the video or a short, and press
   **Fill in YouTube Studio**. Studio's upload page opens in a new tab.
2. Drop the video file into Studio's upload dialog.
3. When the Details step appears, the extension fills the title, description, thumbnail(s),
   playlist, audience, the AI use answer (Yes or No, with why) and tags, then says what it did.
   **Fill again from Slopify** (bottom right) repeats it.
4. Check everything, go through Studio's remaining steps, and publish yourself. The extension
   never presses Next, Save, Schedule or Publish.

A field it can't fill gets its own message, for example "Couldn't find the Tags field — the
text is copied, paste it by hand". The first such text goes on the clipboard; each message has a
Copy button for its own.

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
- **Playlist**: it opens the Playlists dropdown, ticks the checkbox whose label is the playlist's
  name, and closes the list with its Done (or Escape).
- **Three thumbnails**: it looks for Studio's **A/B Testing** button beside the title and, when
  its dialog offers picture uploads, puts all three in. If the button isn't there, or its dialog
  can't be filled, it sets the first as the thumbnail and says to add the others in A/B Testing
  by hand.

### How it talks to Slopify

The extension's background worker is the only part that talks to Slopify, and only to
`127.0.0.1` or `localhost`. Pairing sends the token from the extension's own origin
(`chrome-extension://…` or `moz-extension://…`); Slopify stores that origin, and from then on
the `/api/studio/ext/*` routes answer only requests with the token, and send CORS headers only
for that origin — never `*`, never a web page's. They serve the chosen pack and its thumbnails,
nothing else. The choice made with Fill in YouTube Studio is kept in memory for six hours.

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
(`ytcp-button#ab-test-button`). The fixture the tests use,
`packages/extension/test/fixtures/studio-upload.html`, mirrors that structure with invented
content. Older selectors stay behind the checked ones as fallbacks.

Still unverified, because opening them wasn't part of the read-only look:

- **The playlist list** the dropdown opens: its dialog, rows, checkbox and Done are guesses
  (`ytcp-playlist-dialog`, `ytcp-checkbox-group`, `ytcp-checkbox-lit`, `.done-button`). A row is
  also matched by its whole text, so a different row element with the name in it still works.
- **The A/B Testing dialog**: where it takes pictures is a guess (an image file input in
  `ytcp-ab-test-dialog`, or in any open dialog other than the thumbnail's own). The button may
  also only appear once the upload is saved.
- **Whether the upload dialog behaves like the Details editor**: the ids match, but the upload
  dialog itself wasn't inspected.
- **Whether Studio makes a chip on Enter or on comma**, and whether it keeps the line breaks typed
  this way; the extension tries both keys and checks what it can.

Before relying on the extension, try it on a real upload and watch its messages. When a field
stops filling:

1. Open the upload dialog, right-click the field, Inspect, and note an id, `aria-label` or
   element name that finds it.
2. Add that selector in front of the field's list in `selectors.ts` (each field lists several,
   tried in order), and update the fixture to match.
3. Run `npx vitest run --project extension`, rebuild, and reload the extension.
