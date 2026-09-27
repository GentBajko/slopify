# Shorts

Shorts turns the best moments of your long video into vertical clips for YouTube Shorts, TikTok and Reels, with no editing on your part. After the narration is timed, the text model picks self-contained moments; each becomes a 1080×1920 (9:16) clip with new images, big word-by-word captions and its own title, description and hashtags.

**Where to find it:** Play → **Outputs** row → **Shorts**. On a finished project: the **Shorts** section, and Edit project → **Shorts**.

## What you get

For each short:

- A vertical 1080×1920 MP4, cut from the long video's narration at sentence edges.
- New 9:16 images drawn for that clip (the long video's images are not reused).
- Big captions a little below the middle of the frame, two to four words at a time, with the word being spoken in a strong colour.
- The short's title at the top for the whole clip, if **Title on screen** is on.
- A title (up to 60 characters), a one-line description ending with a link to the full video, and 3 to 5 hashtags.

Shorts are made in the Video stage, beside the long video's render. They need narration.

## Turn on Shorts

1. On Play, open the **Outputs** row.
2. Tick **Shorts**. It is greyed out, with "Needs narration", when the Narration row is off.
3. Set **How many** and **Length**.
4. Optionally pick a **Shorts prompt** and an **Image style** from your Library.
5. Open **More shorts options** to set the title, speed, music and full video link. The disclosure's summary names what differs from the defaults, such as "Title on screen · 1.10× · Full video linked". The [Shorts preview](#shorts-preview) shows the result as you change them.
6. Check the estimate in the right rail and start the run.

## Options

| Option | What it does | Default / range |
|---|---|---|
| **Shorts** | Turns the step on. Turning it off keeps your numbers and prompts for next time. | Off |
| **How many** | How many shorts to cut from this video. Each needs its own new images, so more shorts cost more image calls and render time. | 3; 1 to 10 |
| **Length** | The shortest and longest a short may run, in seconds. The text model picks moments within these bounds. | 60 to 120; each between 15 and 180 |
| **Shorts prompt** | The Library prompt the text model follows to pick the moments and write each short's title, description and hashtags. | **Built-in**: picks moments that make sense alone, open on a hook and end on a complete thought |
| **Image style** | The Library Image prompt the shorts' new vertical images are drawn from. | **Built-in**: cinematic, high-contrast, uncluttered images with the subject large and centred, the lower half calm for captions, no text |
| **Title on screen** | Keeps the short's title at the top for the whole clip, large and bold in the caption font, below where the apps draw their own buttons. | On |
| **Speed** | Plays each short faster than the narration, with the pitch kept. | 1.00× (normal); 1.00× to 1.25× in steps of 0.05 |
| **Music volume** | How loud the background music plays under every short. It dips while the narrator speaks. Only used when you add a music file. | 15; 0 to 100 percent |
| **Full video link** | Each short's description ends with "Watch the full video:" and this link. Without it the line says `[PASTE THE FULL VIDEO LINK HERE]` for you to fill in. | Empty; up to 2,000 characters |
| Background music | An audio file mixed under every short, looped if shorter than a short. | None |

Write your own Shorts prompts and Image prompts in **Library → Prompts** ([Prompts](Prompts)). To match the long video's look, pick one of your own Image prompts as the Image style.

## Shorts preview

While **More shorts options** is open (on Play, or in Edit project → **Shorts**), **Shorts preview** ("A few seconds of the sample as a short, rendered with your settings") renders a few seconds of the bundled sample project as a 9:16 short, through the same renderer real shorts use: the big word-by-word captions in your caption font, the title on screen when **Title on screen** is on (the sample's title, "The Library of Alexandria"), and your **Speed**. The line under it reads, for example, "Title on screen · 1.10×". It renders on your computer at no cost; **Render again** forces a fresh one.

## What it costs

- **Picking:** one text-model call picks the moments, then one call per short writes its image prompts.
- **Images:** each short gets one image per **Seconds per image** of its length (at least one), and each image is one image-model call on your image provider. Before the clips are picked, the estimate charges the most the step could ask for: every short at the longest length you allowed.
- **Rendering:** done on your computer at no provider cost.
- **Reviews:** with Automatic reviews on, each short can be reviewed like other outputs. Picture reviews need Claude Code or Codex as the reviewer.

With the establishing image on, the shorts' images are drawn with it as a reference too, so characters and style stay the same. See [Play-Images](Play-Images).

## See, copy and download your shorts

When the run finishes, the project page's **Shorts** section shows a grid headed with the count, for example **3 shorts · 9:16**. Above the grid, one lime **Download** holds every short's MP4 in a menu (**Download the short** when there is one), with **Open folder** and **Pick different moments** beside it. Each short has:

- A vertical player (Slopify's own, showing the short's first picture until it plays), its title and length.
- Its description, the full video line and its hashtags.
- One row of icon buttons whose names show when you point at them: **Download** (the short's MP4; left out when there is only one short, since the section's Download already fetches it), **Copy title, description and hashtags**, which puts all three on the clipboard in one go, and **More**, which holds **Make short N again**.

While the stage runs, a short not rendered yet says how far it got, such as "Making images · 2 of 5" or "Rendering". A short that failed says so and points you to Error details in the Video section.

To upload them, open **Prepare upload**: each short is listed on its own, with its title, description and tags. See [Publishing-to-YouTube](Publishing-to-YouTube).

## Change the picked moments

1. Open the project and press **Edit settings**, then open **Shorts**. (**Make short N again** on the project page opens the same place with the change made.)
2. Under **Picked clips**, each clip is shown by its first and last sentence.
3. Move a clip with **Earlier start**, **Later start**, **Earlier end** and **Later end**, one sentence at a time.
4. Or press **Use my own range** and pick the **Start sentence** and **End sentence** from the lists. **Back to the AI's choice** restores the model's pick.
5. Save, then continue the run.

A clip must stay between the shortest and longest length you set and must not overlap another clip; the line under the clip says what to change. Moving a clip costs no text calls and keeps its images where the sentences stay the same.

## Pick new moments or remake one short

| Action | What happens when you save and continue the run | Cost |
|---|---|---|
| **Pick different moments** | The text model picks new moments. Ranges you set by hand are dropped. A new clip on the same sentences as an old one keeps its images; any other clip gets new images and is rendered again. **Keep the current moments** cancels it. | One text call, plus one image call per new image |
| **Make short N again** | This one short's image prompts are written again, its images drawn again and the short rendered again. Its moment, title and the other shorts stay as they are. | One image call per image |
| Change **How many**, **Length** or **Shorts prompt** | The moments are picked again, as with Pick different moments. | As above |

## Add background music

1. Open Edit project → **Shorts** (or use the music control under **More shorts options** on Play).
2. Choose an audio file under **Background music (optional)**. It is looped if shorter than a short.
3. Set **Music volume**. The music dips while the narrator speaks.
4. Save and continue the run. **Remove the music** takes it off again.

## Shorts with other features

- **Multiple voices:** shorts start and end on a speaker's turn. See [Multiple-Voices](Multiple-Voices).
- **Other languages:** titles and hashtags are written in the project's language. In languages without word timing, shorts show whole caption groups instead of word by word. See [Other-Languages](Other-Languages).
- **Tables and figures:** a short that includes a described table or figure shows it upright.
- **AI use answer:** a short's answer follows its Image style: Yes only if that Image prompt is marked **Draws photorealistic pictures** (the Built-in style is not), or a narrating voice is marked Real person. See [Publishing-to-YouTube](Publishing-to-YouTube#ai-use-disclosure).

## Tips

- Keep **Length** close to the default 60 to 120 seconds; very short clips often lose the setup that makes a moment work.
- After you upload the long video, paste its link in **Full video link** (Edit project → **Shorts**) and save. Copy and Prepare upload read the link when you use them, so the description line picks it up.
- A frame format of 9:16 on the Video and style row makes the long video itself vertical; Shorts are separate clips and are always 9:16.

## Related pages

- [Play-Outputs](Play-Outputs)
- [Prompts](Prompts)
- [Video-Editing](Video-Editing)
- [Editing-a-Project](Editing-a-Project)
- [Publishing-to-YouTube](Publishing-to-YouTube)
- [Reviews-and-Checkpoints](Reviews-and-Checkpoints)
- [Costs-and-Run-Cost](Costs-and-Run-Cost)
