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
4. Thumbnail: the first goes under Thumbnail; with three thumbnails, all three go under
   Test & compare.
5. Playlist: set its name once in Settings → YouTube Studio.
6. Audience: "No, it's not made for kids".
7. Altered or synthetic content: Yes or No, with why (see below).
8. Tags, under Studio's Show more.

Each step has Copy and a done tick (the ticks are remembered in this browser only). Shorts are
listed too, one per short; a short has no thumbnail step, since Studio shows a frame of it.

The description's chapters are fitted to YouTube's rules first; the Description step says
what was changed (see [Chapters follow YouTube's rules](library-and-editing.md)).

## Altered or synthetic content (AI disclosure)

YouTube asks every upload whether it contains realistic altered or synthetic content. Its help
page ([Disclosing use of altered or synthetic content](https://support.google.com/youtube/answer/14328491),
read 2026-09-27) requires a Yes when AI makes realistic content: a real person saying or doing
what they didn't, altered footage of real places or events, or realistic scenes that never
happened. YouTube's [announcement](https://blog.youtube/news-and-events/disclosing-ai-generated-content/)
names "synthetically generating a person's voice to narrate a video" as one such use. Clearly
unrealistic content, small edits, and AI used for the script, title, thumbnail or captions
need no disclosure. Disclosing doesn't limit a video's reach or its eligibility to earn money.

Slopify answers for the video and every short, erring on the side of Yes, since it can't tell
a photorealistic image style from a cartoon one:

- **Yes** when an AI voice narrates (the Audio stage generates the narration), when the images
  are generated or animated by AI, and always for a short (its images are always generated).
- **No** only when the narration is your own recording (or there is none) and the images are
  your own (or there are none). An AI-written article or an AI thumbnail doesn't count.

Each channel can override it at the top of its **Brand** tab: **YouTube AI disclosure** is
**Automatic** (the rule above), **Always Yes** or **Always No**. Use Always No for a channel
whose videos are clearly unrealistic (cartoon images, a voice not posing as a real person).
The rule lives in `packages/app/src/slices/studio/disclosure.ts`.

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
   playlist, audience, the Altered content answer (Yes or No, with why) and tags, then says
   what it did. **Fill again from Slopify** (bottom right)
   repeats it.
4. Check everything, go through Studio's remaining steps, and publish yourself. The extension
   never presses Next, Save, Schedule or Publish.

A field it can't fill gets its own message, for example "Couldn't find the Tags field — the
text is copied, paste it by hand". The first such text goes on the clipboard; each message has a
Copy button for its own.

With three thumbnails it looks for Studio's **Test & compare** button and puts all three in; if
the button isn't there it sets the first as the thumbnail and says to add the other two by hand.

### How it talks to Slopify

The extension's background worker is the only part that talks to Slopify, and only to
`127.0.0.1` or `localhost`. Pairing sends the token from the extension's own origin
(`chrome-extension://…` or `moz-extension://…`); Slopify stores that origin, and from then on
the `/api/studio/ext/*` routes answer only requests with the token, and send CORS headers only
for that origin — never `*`, never a web page's. They serve the chosen pack and its thumbnails,
nothing else. The choice made with Fill in YouTube Studio is kept in memory for six hours.

### Selectors must be checked against the live page

Studio changes its page from time to time, and the selectors in
`packages/extension/src/selectors.ts` were written from knowledge of its upload dialog, **not
checked against the live page**. The fixture the tests use,
`packages/extension/test/fixtures/studio-upload.html`, is a hand-made copy of the same
assumptions. Before relying on the extension, try it on a real upload and watch its messages.
When a field stops filling:

1. Open the upload dialog, right-click the field, Inspect, and note an id, `aria-label` or
   element name that finds it.
2. Add that selector in front of the field's list in `selectors.ts` (each field lists several,
   tried in order), and update the fixture to match.
3. Run `npx vitest run --project extension`, rebuild, and reload the extension.

Least certain, in order: the Altered content radios (assumed to be among the fields Show more
reveals, named `VIDEO_HAS_ALTERED_CONTENT_YES`/`_NO`; YouTube's help now calls the question "AI
use" under Attributes, so its place and markup may have moved), the Test & compare dialog, the playlist list, the Tags input (Studio
turns typed text into chips), and whether Studio keeps line breaks when the description is set
this way.
