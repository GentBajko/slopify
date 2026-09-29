# Play Outputs

Besides the long video, a run can make a thumbnail (or three), a YouTube description with chapters, a set of vertical shorts and a PDF of the article. Audio-only runs give you a WAV, and multi-voice runs can add an MP3 and an M4B audiobook. This page lists every output, what it costs and where to set it. The formats with more to them have their own pages.

**Where to find it:** Play → **Outputs** row → **Change**. The row's summary lists what the run will make, for example `1 thumbnail · 3 shorts · YouTube description · PDF (Plain)`, or **Only the video**.

## Every output at a glance

| Output | Where to set it | Default | Cost |
| --- | --- | --- | --- |
| Long video (MP4) | **Video and style** → Source **Generate** | On | None, rendered on this computer |
| Thumbnail | **Outputs** → Thumbnail | Off | One image call per thumbnail (plus one text call with **Prompt by LLM**) |
| YouTube description | **Outputs** → **YouTube description** | Off | One text-model call |
| Shorts | **Outputs** → **Shorts** | Off | One text call to pick them, plus new images for each |
| Tables and figures on screen | **Outputs** → **Show tables and figures on screen** | On (when described) | None |
| PDF document | **Outputs** → Document | Off | None, laid out on this computer |
| Subtitle files (.srt, .vtt) | **Video and style** → **Subtitles** | Off | None |
| Narration WAV | **Video and style** → Source **Off**, with narration on | | None |
| MP3 and M4B audiobook | **Narration** → **Speakers** | Off | None |

## Thumbnail

The Thumbnail part has its own **Source** switch:

| Source | What happens | Cost |
| --- | --- | --- |
| **Off** (default) | No thumbnail. | None |
| **From prompt** | Draws the thumbnail straight from the thumbnail prompt. | One image call |
| **Prompt by LLM** | The text model first writes the image prompt from yours, the title and the article, then the image model draws it. | One text call, then one image call |
| **Provide** | Uses your own PNG, JPEG or WebP (**Thumbnail image**). | None |

| Option | What it does | Default |
| --- | --- | --- |
| **Thumbnail prompt** | The Library thumbnail prompt, keywords filled in. **From prompt** sends it to the image model as it is; **Prompt by LLM** gives it to the text model with the title and article to write the image prompt. | None |
| **Thumbnails** (**1** or **3**) | **3** makes two more thumbnails from the same prompt with different compositions, for YouTube's Test & compare. Each costs one more image, so 3 thumbnails are 3 image calls. With a thumbnail prompt that has `{{Scene}}` and Images → **Scenes from the article** on, each also shows a different moment of the article (see [Play Images](Play-Images#scenes-from-the-article)). | 1 |

### Make three thumbnails for Test & compare

1. Set the Thumbnail **Source** to **From prompt** or **Prompt by LLM**.
2. Pick a **Thumbnail prompt**. Write one in [Prompts](Prompts) if you have none.
3. Set **Thumbnails** to **3**.

You can remake each thumbnail on its own on the project page. The thumbnail uses the Images row's provider and model; if the video's images are not generated, the Thumbnail part shows its own **Provider**, **Model** and **Effort**. With an establishing image and **Draw the thumbnail from it too** ticked, the thumbnail is drawn with it as a reference, and it also takes cast members the title mentions. See [Play Images](Play-Images#establishing-image).

## YouTube description

After subtitle timing, the text model writes a description with chapters at the narration's real times, hashtags at the end, and a separate list of tags, ready to copy. It runs beside the render. It needs narration; without it the switch is disabled and says "Needs narration."

| Option | What it does | Default |
| --- | --- | --- |
| **YouTube description** | Turns the step on. One text-model call. | Off |
| **Description prompt** | The Library prompt the description is written from. **Built-in** asks for a short summary, 5 to 12 chapters, 3 to 5 hashtags and 15 to 25 tags. Write your own description prompt on Prompts to change the tone or add links. | Built-in |

See [YouTube Description](YouTube-Description) for the result and the copy buttons.

## Shorts

After subtitle timing, the text model picks the best self-contained moments of the narration. Each becomes a vertical 1080×1920 clip with new images, big word-by-word captions and its own title, description and hashtags. It runs beside the render, and its images are charged like any other. It needs narration.

| Option | What it does | Default / range |
| --- | --- | --- |
| **Shorts** | Turns shorts on. | Off |
| **How many** | How many shorts to cut from this video. Each needs its own new images. | 3; 1 to 10 |
| **Length** | The shortest and longest a short may run, in seconds. | 60 to 120; 15 to 180 |
| **Shorts prompt** | The Library prompt the text model follows to pick the moments and write each short's title, description and hashtags. | Built-in |
| **Image style** | The Library image prompt the shorts' new vertical images are drawn from. | Built-in |
| **Title on screen** (under **More shorts options**) | Keeps the short's title at the top for the whole clip, large and bold in the caption font. | On |
| **Speed** | Plays each short faster than the narration, with the pitch kept. | 1.00×; 1.00× to 1.25× in steps of 0.05 |
| **Music volume** | How loud the background music plays under every short; it dips while the narrator speaks. Only used with a music file. | 15; 0 to 100% |
| **Full video link** | Each short's description ends with a line pointing to the full video. Without a link, the line says `[PASTE THE FULL VIDEO LINK HERE]`. | Empty |
| **Background music (optional)** | An audio file, looped if shorter than a short. | None |

See [Shorts](Shorts) for how moments are picked and how to remake a short.

## Show tables and figures on screen

Shown while the narration describes tables and figures. Each described table, figure, equation and code block is also shown in the video while it is described. On by default. See [Play Narration](Play-Narration#tables-figures-and-code).

## PDF document

The Document part lays out a PDF of the article and title on this computer, in the theme you pick. It needs no provider and costs nothing.

| Option | What it does | Default |
| --- | --- | --- |
| Document **Source** | **Off** or **Generate**. | Off |
| **Theme** | How the PDF looks: the built-in **Plain** theme, or one of yours from Library → Documents. A theme of yours is copied into the project, so editing it later leaves this project alone until you pick it again. **Edit themes** opens the list. | Plain, or the channel's brand kit theme |

See [PDF Documents](PDF-Documents) and [Document Themes](Document-Themes).

## Audio files

- **Narration WAV.** Set the video **Source** to **Off** in **Video and style** while narration is on. The line beside the switch reads "Combined WAV export with narration and segment gaps". The WAV is mastered to the **Audio files volume** when **Level the volume** is on.
- **MP3 and M4B.** With several speakers, tick **Also make MP3 and M4B files with chapter markers** under **Narration** → **Speakers**. The M4B is an audiobook file with a chapter marker at each chapter. Both are made on this computer at no provider cost. See [Multiple Voices](Multiple-Voices).

## Tips

- The YouTube description and shorts need subtitle timing but not burned-in captions; you can leave **Subtitles** Off.
- Automatic reviews can check the thumbnail at phone size and each short's images. See [Reviews and Checkpoints](Reviews-and-Checkpoints).
- A PDF is free, so switch it on whenever the article is worth reading on its own.

## Related pages

- [Play Overview](Play-Overview)
- [Shorts](Shorts)
- [YouTube Description](YouTube-Description)
- [PDF Documents](PDF-Documents)
- [Document Themes](Document-Themes)
- [Multiple Voices](Multiple-Voices)
- [Publishing to YouTube](Publishing-to-YouTube)
