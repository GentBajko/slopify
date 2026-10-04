# Publishing to YouTube

Slopify never uploads or publishes for you: there is no YouTube sign-in and no upload API. Instead, **Prepare upload** lists everything YouTube Studio asks for, in the order it asks, with a Copy button for each value, for the long video and for every short. You upload in Studio in your own browser and press Publish yourself. The optional [Studio-Extension](Studio-Extension) can fill Studio's upload dialog from the same list.

**Where to find it:** a finished project → **Prepare upload** (the next action, and in the **YouTube** section), Home → **Needs you** → **Prepare upload** on a video marked **Ready to upload**, or the Calendar's **Needs you** → **Prepare upload**. Settings → **YouTube Studio** holds the playlists, and each channel's **Brand** tab holds the links it uses.

## Before your first upload

1. Open **Settings → YouTube Studio**, press **Add playlist** and type each playlist exactly as it is called in Studio (up to 150 characters). Tick **On by default** for the ones every video goes into, then press **Save playlists**. The list is the default for every channel; pick a channel above it to give that channel its own list.
2. Open **Channels** → your channel → **Brand** and, under **Channel links**, add any links your descriptions use, such as `Patreon` or `Discord`. See [Channels](Channels#channel-links).
3. In **Settings → Voices**, turn on **Real person** for any voice cloned from, or made to sound like, a real person.
4. In **Library → Prompts**, turn on **Draws photorealistic pictures** for any Image prompt whose style looks like real photos or film.
5. Turn on **YouTube description** on Play (Outputs row) for new videos, so they come with a description, chapters and tags.

Steps 3 and 4 decide the AI use answer; see [AI use disclosure](#ai-use-disclosure).

## Upload a video

1. Open the finished project and press **Prepare upload**. The button is available once the video has been made.
2. If the project has shorts, pick what to upload under **What to upload**: **Video**, **Short 1**, **Short 2** and so on. Each is uploaded to YouTube on its own, with its own title, description and tags.
3. Open YouTube Studio in your browser and start an upload.
4. Work down the list **In the order Studio asks**, using **Copy**, **Download** or **Open folder** on each row:

| Step | What Prepare upload gives you |
|---|---|
| **Video file** | The file name, with **Download** and **Open folder** as small buttons. |
| **Title** | The project's title (up to 100 characters), or the short's title. **Copy**. |
| **Description** | The description with chapters and hashtags, links filled in. For a short: its description, the "Watch the full video:" line and its hashtags. **Copy**. |
| **Thumbnail** | The thumbnail file, with **Open folder**. With three thumbnails: "The first under Thumbnail; all 3 in A/B Testing (beside the title)." Shorts have no thumbnail step, since Studio shows a frame of a short. |
| **Playlist** | The project's channel's playlists from Settings → YouTube Studio (or the default list), or "None set". With more than one, each has a tick: tick the ones this project goes into (saved for this project; the others keep the defaults). **Copy**. |
| **Audience** | "No, it's not made for kids". |
| **AI use (under Show more)** | **Yes** or **No**, with the reason. |
| **Tags (under Show more)** | The tags, comma-separated. For a short, its hashtags without the `#`. **Copy**. |

5. Tick the box beside each step as you go if you like. The ticks are only a note to yourself, remembered in this browser; they change nothing in the project.
6. Check everything in Studio and publish there.
7. Back in Slopify, press **Mark uploaded** (see [Mark a video uploaded](#mark-a-video-uploaded)).

Below the list, the thumbnails are shown side by side as **A**, **B** and **C**, each with **Download**.

With the extension installed and paired, press **Fill in YouTube Studio** instead of copying by hand. Each press queues the item under **Waiting for Studio**, so you can queue the video and its shorts and upload them one after another. While no extension is paired, Prepare upload shows how to install and pair it, with **Open YouTube Studio**. See [Studio-Extension](Studio-Extension). Prepare upload ends with "Slopify never publishes."

## When something isn't ready

If a part isn't made yet, Prepare upload says so at the top under "Some of it isn't made yet." and tells you what to do, for example:

- The video isn't made yet: let the Video stage finish (or use Continue the run), then open Prepare upload again.
- No YouTube description is written: turn on **YouTube description** in Edit project → **Prompts** to have one written with chapters and tags.
- The thumbnail isn't made yet, or only 1 of 3 thumbnails is made: regenerate the missing ones in the project's Images section.
- This project makes no thumbnail, so YouTube will pick a frame.
- No playlist is set: set one in Settings → YouTube Studio.
- A short isn't rendered yet.

## AI use disclosure

Studio asks every upload one question, behind **Show more**: whether AI was used in one of three ways. In YouTube's words:

1. Makes a real person appear to say or do something they didn't say or do.
2. Alters footage of a real event or place.
3. Generates a realistic-looking scene that didn't actually occur.

Selecting Yes adds YouTube's AI label to your video. YouTube does not ask for the label for clearly unrealistic content, minor edits such as colour or filters, or AI used for the script, title, thumbnail or captions.

Slopify answers **Yes only when one of those three cases applies**, and **No** otherwise. An AI narrator and stylised AI pictures on their own are none of the three. Each case is something you mark, and every mark is off until you set it:

| Case | What you mark | Where |
|---|---|---|
| 1. A voice that imitates a real person | **Real person** on a voice cloned from, or made to sound like, a real person. A video or short narrated by that voice (the narration voice or any speaker) gets Yes. | Settings → **Voices**, the Real person column |
| 2. Real footage that is altered | In Prepare upload's AI use step, the switch **The uploaded clip is real footage (filmed, not made by AI)** (or "The N uploaded clips are…"). It appears when the project's images include uploaded video clips. With it on, the video gets Yes when the Look's **Atmosphere** overlay (embers, dust or fog) is laid over them. A colour grade, vignette or grain alone counts as a minor edit and stays No. | Prepare upload, per project |
| 3. Photorealistic AI pictures | **Draws photorealistic pictures** on an Image prompt whose style looks like real photos or film. A video whose images are drawn from such a prompt, or a short whose **Image style** is one, gets Yes. The Built-in shorts style is not photorealistic. | Library → **Prompts**, in the Image prompt's editor (save the prompt first) |

The AI use step shows the answer and why, naming the case in YouTube's words, for example that the narration uses a named voice marked in Settings → Voices as imitating a real person. When none applies, it says No and lists what was checked.

Shorts are judged on their own: they show new pictures, never your uploaded clips, so case 2 never applies to a short.

### Override per channel

1. Open **Channels**, pick the channel and open its **Brand** tab.
2. At the top, set **YouTube AI disclosure**:

| Setting | Answer |
|---|---|
| **Automatic** (default) | The rule above. |
| **Always Yes** | Yes for every video and short of this channel. |
| **Always No** | No for every video and short of this channel. |

It saves as you pick. A channel's Always Yes or Always No wins over every mark. The marks and the channel setting travel with a backup.

## Chapters and the description

The description in Prepare upload is the same one the project page shows: your edits kept, `{{Name}}` links filled in from the project's channel's links (its **Brand** tab) and the project's own **Previous video**. The **YouTube description (.txt)** and **YouTube tags (.txt)** downloads on the project page are this same text.

Its chapters are fitted to YouTube's rules first (the first at 0:00, at least three, each at least 10 seconds). When anything was changed, the Description step says what, in a line starting "Chapters adjusted for YouTube:". To change the text itself, edit it on the project page; see [YouTube-Description](YouTube-Description).

## Edit the description and tags before uploading

Prepare upload shows what the project has; it has no editor of its own.

1. Close Prepare upload.
2. In the project's **YouTube** section, press **Edit** beside Summary, Chapters, Hashtags or Tags, change it and save.
3. For a link, paste it under **Previous video for this project** and press **Save links**, or add it under **Channel links** on the channel's Brand tab.
4. Open Prepare upload again; it shows your edits.

A short's title, description and hashtags come from the shorts pick; to change which moments are used, see [Shorts](Shorts). Its full video line comes from **Full video link** in Edit project → **Shorts**.

## Three thumbnails

With **Thumbnails** set to 3 on Play or in Edit project → Images, Slopify draws the thumbnail prompt twice more with a different composition each time, for YouTube's A/B Testing (it replaced Test & compare). Prepare upload lists all three. In Studio, set the first under **Thumbnail**, then add all three with the **A/B Testing** button beside the title. Each extra thumbnail costs one image. See [Play-Outputs](Play-Outputs).

## Mark a video uploaded

Slopify does not check YouTube, so it can't know when you've published. After you upload:

1. Press **Mark uploaded** on Home under **Needs you**, or in the Projects list (one row, or several selected at once).
2. The video leaves the ready-to-upload lists and shows an **Uploaded** badge in Projects.
3. Press **Undo** beside the badge to take the mark off.

**Mark uploaded** is also a command in the command palette (`Ctrl+K`). Projects has a **Ready to upload** filter for finished videos you haven't marked yet.

## Tips

- Set the playlists once in Settings (per channel if your channels upload to different playlists), and tick the few a single video joins in its Prepare upload.
- Upload the long video first, then paste its link as the shorts' **Full video link** so each short's description points to it.
- If the AI use answer surprises you, read its reason: it names the voice, footage or prompt that made it Yes.

## Related pages

- [Studio-Extension](Studio-Extension)
- [YouTube-Description](YouTube-Description)
- [Shorts](Shorts)
- [Channels](Channels)
- [Prompts](Prompts)
- [Home-and-Projects](Home-and-Projects)
- [Settings-Reference](Settings-Reference)
- [Video-Editing](Video-Editing)
