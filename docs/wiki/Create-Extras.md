# Create: Extras

Besides the video, a run can make a thumbnail (or three), a YouTube description with chapters, a set of vertical shorts, posts for other sites and a PDF of the article. Sound-only runs give you a WAV, and runs with several speakers can add an MP3 and an M4B audiobook. This page lists every extra, what it costs and where to set it. The ones with more to them have their own pages.

**Where to find it:** Create → **Extras** row → **Change**. The row's line lists what the run will also make, for example `Also makes a thumbnail, 2 shorts and a YouTube description.`, or `The video only: no thumbnail, description, shorts or PDF.` Each extra is one tick whose settings appear once it is ticked.

For an article, audiobook, podcast or set of images, the thumbnail, YouTube description, shorts and posts fold away under **Publishing extras**, open when one of them is already on.

## Every extra at a glance

| Extra | Where to set it | Default | Cost |
| --- | --- | --- | --- |
| Video (MP4) | **Video and style** → **Video** → **Make the video** | On | None, put together on this computer |
| Thumbnail | **Extras** → **Thumbnail** | Off | One image call per thumbnail (plus one AI call with **Let the AI write the prompt**) |
| YouTube description | **Extras** → **YouTube description** | Off | One AI call |
| Shorts | **Extras** → **Shorts** | Off | One AI call to pick them, plus new images for each |
| Posts to other sites | **Extras** → **Post to other sites** | Off | One AI call per post written from a post prompt; none otherwise |
| PDF | **Extras** → **PDF of the article** | Off | None, laid out on this computer |
| Tables and figures on screen | **Narration** → **More narration settings** → **Also show them on screen** | On (when described) | None |
| Caption files (.srt, .vtt) | **Video and style** → **Captions** | Off | None |
| Narration WAV | **Video and style** → **Video** → **Off (sound only)**, with narration on | | None |
| MP3 and M4B audiobook | **Narration** → **Speakers** | Off | None |

## Thumbnail

**Thumbnail** is the picture people see before they press play. Tick it, then pick how it is made:

| Choice | What happens | Cost |
| --- | --- | --- |
| **From my thumbnail prompt** | Draws the thumbnail straight from the thumbnail prompt. | One image call |
| **Let the AI write the prompt** | The AI writer first writes the image prompt from yours, the title and the article, then the image model draws it. | One AI call, then one image call |
| **Upload mine** | Uses your own PNG, JPEG or WebP (**Thumbnail image**). | None |

| Option | What it does | Default |
| --- | --- | --- |
| **Thumbnail prompt** | The thumbnail prompt, keywords filled in. **From my thumbnail prompt** sends it to the image model as it is; **Let the AI write the prompt** gives it to the AI writer with the title and article to write the image prompt. | None |
| **How many thumbnails** (**1** or **3**) | **3** makes two more thumbnails from the same prompt with different compositions, for YouTube's Test & compare. Each costs one more image, so 3 thumbnails are 3 image calls. With a thumbnail prompt that has `{{Scene}}` and Images → **Scenes from the article** on, each also shows a different moment of the article (see [Images](Create-Images#scenes-from-the-article)). | 1 |

### Make three thumbnails for Test & compare

1. Tick **Thumbnail** and pick **From my thumbnail prompt** or **Let the AI write the prompt**.
2. Pick a **Thumbnail prompt**. Write one on [Prompts](Prompts) if you have none.
3. Set **How many thumbnails** to **3**.

You can make each thumbnail again on its own on the project page. The thumbnail uses the Images row's service and model; if the video's images are not made by AI, the thumbnail shows its own **Drawn by** service and model. With an establishing image and **Use it as a reference for the thumbnail too** ticked, the thumbnail is drawn with it as a reference, and it also takes cast members the title mentions. See [Images](Create-Images#establishing-image).

## YouTube description

After the captions are timed, the AI writer writes a description with chapters at the narration's real times, hashtags at the end, and a separate list of tags, ready to copy. It runs beside the video. It needs narration; without it the line under the tick says "Needs narration."

| Option | What it does | Default |
| --- | --- | --- |
| **YouTube description** | Turns it on. One AI call. | Off |
| **Description prompt** | The prompt the description is written from. **Built-in** asks for a short summary, 5 to 12 chapters, 3 to 5 hashtags and 15 to 25 tags. Write your own description prompt on Prompts to change the tone or add links. | Built-in |

See [YouTube Description](YouTube-Description) for the result and the copy buttons.

## Shorts

After the captions are timed, the AI writer picks the best self-contained moments of the narration. Each becomes a vertical 1080×1920 clip with new images, big word-by-word captions and its own title, description and hashtags. It runs beside the video, and its images are charged like any other. It needs narration.

| Option | What it does | Default / range |
| --- | --- | --- |
| **Shorts** | Turns shorts on. | Off |
| **Shorts per video** | How many shorts to cut from this video. Each needs its own new images. | 3; 1 to 10 |
| **Length** | The shortest and longest a short may run, in seconds. | 60 to 120; 15 to 180 |
| **Shorts prompt** | The prompt the AI writer follows to pick the moments and write each short's title, description and hashtags. | Built-in |
| **Image prompt** | The image prompt the shorts' new vertical images are drawn from. | Built-in |
| **Title on screen** (under **More shorts options**) | Keeps the short's title at the top for the whole clip, large and bold in the caption font. | On |
| **Speed** | Plays each short faster than the narration, with the pitch kept. | 1.00×; 1.00× to 1.25× in steps of 0.05 |
| **Music volume** | How loud the background music plays under every short; it dips while the narrator speaks. Only used with a music file. | 15; 0 to 100% |
| **Full video link** | Each short's description ends with a line pointing to the full video. Without a link, the line says `[PASTE THE FULL VIDEO LINK HERE]`. | Empty |
| **Background music (optional)** | An audio file, looped if shorter than a short. | None |

**Shorts preview** puts a few seconds of the sample together as a short with your settings, free on this computer; **Make the preview again** after a change. See [Shorts](Shorts) for how moments are picked and how to make a short again.

## Post to other sites

Drafts only: Slopify fills each post and you press Post. It needs the Slopify Studio extension; until it is set up, the line under the tick says so with **Set it up ↗**. See [Posting to Social Sites](Posting-to-Social-Sites).

## PDF of the article

**PDF of the article** lays out a PDF of the article and title on this computer, in the look you pick. It needs no service and costs nothing. It is not offered while the article is **No text**.

| Option | What it does | Default |
| --- | --- | --- |
| **PDF of the article** | Turns it on. | Off |
| **PDF look** | How the PDF looks: one of the three ready looks (**Plain**, **Book** or **Modern**), or one of your PDF themes. A theme of yours is copied into the project, so editing it later leaves this project alone until you pick it again. **Edit PDF looks ↗** opens the PDF themes. | Plain, or the channel's PDF look |

See [PDF Documents](PDF-Documents) and [Document Themes](Document-Themes).

## Audio files

- **Narration WAV.** Set **Video** to **Off (sound only)** in **Video and style** while narration is on. The line under the switch reads "Sound only: the narration as one audio file." The WAV is set to the **Audio files volume** when **Level the volume** is on.
- **MP3 and M4B.** With several speakers, tick **Also make MP3 and M4B files with chapter markers** under **Narration** → **Speakers**. The M4B is an audiobook file with a chapter marker at each chapter. Both are made on this computer at no service cost. See [Multiple Voices](Multiple-Voices).

## Tips

- The YouTube description and shorts need the captions' timing but not captions in the video; you can leave **Captions** off.
- AI checks can look at the thumbnail at phone size and each short's images. See [Pauses and Checks](Reviews-and-Checkpoints).
- A PDF is free, so switch it on whenever the article is worth reading on its own.

## Related pages

- [Create Overview](Create-Overview)
- [Shorts](Shorts)
- [YouTube Description](YouTube-Description)
- [PDF Documents](PDF-Documents)
- [Document Themes](Document-Themes)
- [Multiple Voices](Multiple-Voices)
- [Posting to Social Sites](Posting-to-Social-Sites)
- [Publishing to YouTube](Publishing-to-YouTube)
