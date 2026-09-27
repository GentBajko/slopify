# Studio Extension

Slopify Studio is an optional browser extension that fills YouTube Studio's upload dialog from a project's Prepare upload list: title, description, thumbnails, playlist, audience, the AI use answer and tags. You drop the video file in yourself, check what it filled, and press Publish yourself. The extension never presses Next, Save, Schedule or Publish.

**Where to find it:** it ships with Slopify. Download it from Settings → **YouTube Studio** → **Install the Studio extension** (or from **Prepare upload** while no extension is paired). Pairing is in the same Settings section. You use it from a finished project → **Prepare upload** → **Fill in YouTube Studio**.

## What you need

- Slopify running on this computer (it opens at `http://127.0.0.1:6969` by default).
- Chrome, Chromium, Edge or Brave, or Firefox 128 or newer.

The extension is built into Slopify, so there is nothing else to get. It is not published in a browser store. It has no remote code: everything it runs is in the zip you download.

## Get the extension

1. Open Settings → **YouTube Studio**. Under **Install the Studio extension**, pick your browser: **Chrome, Edge, Brave** or **Firefox**.
2. Press **Download for Chrome** or **Download for Firefox**. It saves `slopify-studio-chrome.zip` or `slopify-studio-firefox.zip`.
3. Follow the three steps shown under the button, also written out below.

Prepare upload shows the same download and steps while no extension is paired.

## Install on Chrome, Chromium, Edge or Brave

1. Unzip `slopify-studio-chrome.zip` into a folder you keep: the browser loads the extension from there.
2. Open `chrome://extensions` (in Edge, `edge://extensions`; in Brave, `brave://extensions`) and turn on **Developer mode**.
3. Press **Load unpacked** and pick that folder.
4. Pin **Slopify Studio** to the toolbar if you like.

## Install on Firefox

1. Keep the zip as it is.
2. Open `about:debugging#/runtime/this-firefox` and press **Load Temporary Add-on**.
3. Pick `slopify-studio-firefox.zip`.

A temporary add-on is removed when Firefox restarts. Load it again after each restart.

## Update the extension

After updating Slopify, download the zip again from Settings → **YouTube Studio** and replace the old one: unzip over the same folder and press the reload arrow on `chrome://extensions`, or load the new Firefox zip.

## Pair it with Slopify

Pairing gives the extension a secret so that only it, and no web page, can read your upload packs.

1. In Slopify, open **Settings → YouTube Studio**.
2. Under **Extension pairing token**, press **Copy**.
3. Click the extension's toolbar button (or open its options). The **Slopify Studio · Pairing** page opens.
4. Check **Slopify address**. It must be the address in your Slopify tab, `http://127.0.0.1:6969` by default.
5. Paste the token into **Pairing token** and press **Pair**.

The options page says "Paired with Slopify at …". Back in Settings, the line under the token says "Paired with the extension at …" with the extension's address.

To unpair, press **New pairing token** in Settings. It makes a fresh token and unpairs the extension until you paste the new one and press Pair again.

## Settings → YouTube Studio

The section is headed **Upload pack and extension**.

| Option | What it does | Default / range |
|---|---|---|
| **Playlist** | The YouTube playlist upload packs name, so the extension ticks it in Studio's dialog. Pick **Every channel (default)** or one channel in the channel list, type the playlist exactly as it is called in Studio, and press **Save**. The default is used by every channel without its own; a channel's own playlist wins for its videos. Leave it empty for no playlist. | Empty; up to 150 characters |
| **Extension pairing token** | The secret the extension needs before it may read your upload packs. **Copy** copies it; **New pairing token** makes a new one and unpairs the extension. | Made for you |
| **Install the Studio extension** | The download and install steps (see [Get the extension](#get-the-extension)). | |

## Fill in an upload

1. Open a finished project and press **Prepare upload**.
2. Under **What to upload**, pick **Video** or a short.
3. Press **Fill in YouTube Studio**. Studio's upload page opens in a new tab, and the item joins **Waiting for Studio**.
4. Drop the video file into Studio's upload dialog. (Use **Download** or **Open folder** on the Video file row to find it.)
5. When the **Details** step appears, the extension first checks that the dialog has every field the item needs, then fills them and shows a message for each, bottom right.
6. Check everything. If you want to start over, press **Fill again from Slopify** (bottom right).
7. Go through Studio's remaining steps and publish yourself.
8. Back in Slopify, press **Mark uploaded**. See [Publishing-to-YouTube](Publishing-to-YouTube#mark-a-video-uploaded).

**Fill in YouTube Studio** is only offered once an extension is paired. Unpaired, Prepare upload says "The Slopify Studio extension isn't paired.", shows the install and pair steps, keeps the Copy steps as your upload pack, and offers **Open YouTube Studio**.

### Upload several one after another

Each press of **Fill in YouTube Studio** adds the item to **Waiting for Studio** instead of replacing the last one. Every new upload dialog you open in Studio is filled with the next waiting item, in order. So you can queue the video and all its shorts, then upload them one by one.

- Prepare upload lists what waits: the first row says "Next: filled in the next upload dialog you open in Studio.", the others "Filled after N more uploads." **Remove** takes one off.
- The list survives a restart of Slopify. An item waits up to 24 hours. A new pairing token clears the list, and it never travels in a backup.

## What it fills

| Field in Studio | What the extension does |
|---|---|
| **Title** | Types the title (up to 100 characters for the video, the short's own title for a short). |
| **Description** | Types the description line by line, so line breaks are kept. |
| **Thumbnail** | Sets the first thumbnail. With three thumbnails, it looks for Studio's **A/B Testing** button beside the title and puts all three in. If the button isn't there or its dialog can't be filled, it sets the first and asks you to add the others in A/B Testing by hand. Shorts get no thumbnail. |
| **Playlists** | Opens the dropdown, ticks the playlist named in Settings → YouTube Studio, and closes it. |
| **Audience** | Picks "No, it's not made for kids". |
| **Show more** | Presses it once, to reach the advanced settings. |
| **AI use** | Picks Yes or No, as Prepare upload worked it out. See [AI use disclosure](Publishing-to-YouTube#ai-use-disclosure). |
| **Tags** | Types each tag and turns it into a chip. Tags already there are skipped. |

It then says what it did. It does not choose visibility, schedule, or press any button that saves or publishes.

## When a field can't be filled

Studio changes its page from time to time.

- **A field is missing before anything is written.** The extension checks every field the item needs first. If Studio's dialog lacks one, it fills nothing at all, so you never get a half-filled upload: "Nothing was filled: Studio's upload dialog has changed, and Slopify couldn't find …". It copies the whole upload pack (or offers **Copy** for it) and names the missing fields. Paste each part by hand, or use the Copy buttons in Prepare upload. Downloading the extension again from Settings → YouTube Studio may fix it.
- **A field doesn't take the text.** It shows a message for that field, for example "Couldn't find the Tags field — the text is copied, paste it by hand", and fills the rest ("Filled what it could; 1 field needs you. Nothing was published.").

Every message with text to paste has a **Copy** button. If the browser refuses the clipboard, the text is shown selected so you can copy it yourself.

Before relying on the extension, try it on one real upload and read its messages.

## Privacy and security

- Only the extension's background worker talks to Slopify, and only at `127.0.0.1` or `localhost`.
- Slopify answers the extension's requests only with the pairing token, and only from the extension that paired. It never answers web pages.
- The extension reads only the upload pack you chose and its thumbnails.
- It runs on `studio.youtube.com` only, and needs no YouTube sign-in of its own: it works in the Studio tab you are already signed in to.

## Limits

- It never uploads the video file: you drop it into Studio.
- It never presses Next, Save, Schedule or Publish.
- It fills the Details step only. Monetisation, end screens, cards, visibility and scheduling are left to you.
- Some parts of Studio have not been checked against the live page and may not fill: the playlist list the dropdown opens, the A/B Testing dialog (the button may only appear once the upload is saved), whether the upload dialog behaves exactly like the Details editor, and whether Studio makes a tag chip on Enter or on comma. The extension tries both keys and reports what it can't confirm.
- It looks at Studio at most every quarter of a second and stops looking while it fills a dialog, so it doesn't slow Studio down.
- In Firefox, a temporary add-on disappears when Firefox restarts.
- If you change Slopify's port or address, pair again with the new **Slopify address**.

## Troubleshooting

| Problem | What to do |
|---|---|
| Studio opens but nothing is filled | Make sure you dropped the video file in and reached the Details step. Check the extension is paired (Settings → YouTube Studio says "Paired with the extension at …") and that the item is under **Waiting for Studio** in Prepare upload. Press **Fill again from Slopify** in Studio. If it says "Nothing was filled", see [When a field can't be filled](#when-a-field-cant-be-filled). |
| The wrong item was filled | Items fill in the order they wait. **Remove** the ones you don't want under **Waiting for Studio** in Prepare upload. |
| Pairing fails | Check the **Slopify address** matches your Slopify tab, and copy the token again from Settings → YouTube Studio. If you pressed New pairing token, the old one no longer works. |
| Studio says "The extension isn't paired with Slopify yet." | Open the extension's options, paste the pairing token from Settings → YouTube Studio and press **Pair**. |
| Settings says "No extension is paired" | Paste the token into the extension's options and press **Pair**. |
| A field says it couldn't be filled | Paste the copied text by hand. Studio may have changed that field. |
| The extension is gone in Firefox | Load it again from `about:debugging`; temporary add-ons are removed on restart. |

## Related pages

- [Publishing-to-YouTube](Publishing-to-YouTube)
- [YouTube-Description](YouTube-Description)
- [Shorts](Shorts)
- [Settings-Reference](Settings-Reference)
- [Troubleshooting](Troubleshooting)
