# Play Video and Style

The **Video and style** row decides how your images become a video: how long each stays on screen, how they move and cut, the Look over the picture, an optional ambient sound bed, the frame shape and the captions. The video is rendered on this computer, so none of this costs provider money except **Animate images**. A six-second style preview in the right rail shows and plays your choices as you make them.

**Where to find it:** Play → **Video and style** row → **Change**. After the run, the same controls are in the project's **Edit project**; see [Video Editing](Video-Editing).

## Choose whether to render a video

The row starts with a **Source** switch:

| Source | What happens | Cost |
| --- | --- | --- |
| **Generate** (default) | Renders the slideshow video on this computer from the images and narration. | No provider money, only time |
| **Off** | No video. Each finished stage is left to download on its own. With narration on, you get a combined WAV of the narration with its segment gaps instead. | None |

**Generate** needs images, so the video is Off while Images is Off. The line beside the switch says what you will get:

| Line | When |
| --- | --- |
| "Images and narration · 3 s segment gaps" | Video on, narration on (the gap is your silence between segments) |
| "Silent video · each image shown once" | Video on, narration Off |
| "Combined WAV export with narration and segment gaps" | Video Off, narration on |
| "Download each enabled stage separately" | Video Off, narration Off |

## Timing and motion

| Option | What it does | Default / range |
| --- | --- | --- |
| **Seconds per image** | How long each image stays on screen. When cuts follow the narration, it is the target and a cut waits for a sentence end. When images run out they start again. | 15; 1 to 600 |
| **Zoom (%)** | How far each image zooms in or out over its time on screen. 0 keeps images still. | 22.5; 0 to 50 |
| **Motion** | How each image moves: **Zoom in and out**, **Pan across**, **Mix of both** (by turns) or **Still**. A mix keeps a long video watchable. | Zoom in and out |
| **Cuts** | **Every N seconds** holds each image for Seconds per image. **Follow the narration** cuts in the pause after a sentence, as close to that length as the sentences allow (never under 40% of it), and starts a new image at every chapter. | Follow the narration for new projects |
| **Silence at start and end (seconds)** | Quiet time before the narration starts and after it ends. Shown while there is narration. | 2; 0 to 30 |
| **Silence between segments (seconds)** | Quiet between the intro and the narration, and between the narration and the outro. Only matters with an intro or outro. Empty uses the Settings gap. | Settings value (3 unless changed); 0 to 30 |

**Follow the narration** needs word timing, so it works in English and the languages that have it. For a language without word timing, **Cuts** is locked to **Every N seconds** and a note under it says why. See [Other Languages](Other-Languages).

Turning on **More images for long videos** in the Images row switches **Motion** from Zoom to **Mix of both**. See [Play Images](Play-Images#more-images-for-long-videos).

## The Look

**Look** is a disclosure under the timing controls. Closed, its line lists what is on, or "Plain cuts, no effects". Everything in it is applied while the video renders.

| Option | What it does | Default / range |
| --- | --- | --- |
| **Transition** | How one image hands over to the next: **Cut**, **Crossfade**, **Fade through black**, **Slide** or **Wipe**. The change is centred on the cut and takes the length you pick, so the video stays exactly as long as its narration. | Cut; length 0.6 s (0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.5 or 2 s) |
| **Colour grade** | A colour treatment over the whole video: **Warm fantasy**, **Cold**, **Desaturated** or **Sepia**. Only render time. | None |
| **Vignette** | Darkens the corners to draw the eye to the middle: **Subtle** or **Strong**. | Off |
| **Film grain** | Moving film grain over the whole picture for an older, filmic feel: **Subtle** or **Strong**. | Off |
| **Atmosphere** | An overlay Slopify draws itself: rising **Embers**, drifting **Dust**, or low **Fog** along the bottom of the frame. No footage is downloaded and no API is called. | None |
| **Chapter cards** | Shows each chapter's title in the middle of the picture for 2.5 seconds as the chapter starts, in the caption font. Chapters come from the YouTube description when that step runs, otherwise from the article's headings. Needs narration. | Off |
| **Animate images** | Turns some images into 5-second moving clips with an image-to-video model on your image provider (fal.ai or Replicate). **Chapter openers** animates the first image of each chapter (needs narration); **Every Nth image** animates every 2nd to 10th. Pick the image-to-video model in the third box. Each clip is one paid call, shown in the estimate. An image that cannot be animated stays still. | Off |

### Animate some images

1. Make sure the Images row uses fal.ai or Replicate. Other providers have no image-to-video models, and the Look says so.
2. Open **Look** and set **Animate images** to **Chapter openers** or **Every Nth image**.
3. For **Every Nth image**, pick how often (every 2 to every 10).
4. Pick the model in the model box ("Choose a model"). The run cannot start until one is picked.
5. Check the added cost in the estimate.

## Ambient sound

An optional bed of rain, a fireplace, wind or your own audio file, played quietly under the whole narration of the long video. It dips while the narrator speaks, including under the intro and outro. It is shown while both the video and the narration are on.

| Option | What it does | Default / range |
| --- | --- | --- |
| **Ambient sound** | **The channel's (brand kit)** uses whatever the channel's kit says, which may be nothing. **None** plays no bed, whatever the channel has. **Rain**, **Fireplace** and **Wind** are made on this computer, so nothing is downloaded and the same settings always sound the same. **My own file** uploads an audio file, looped if shorter than the video. | The channel's (brand kit) |
| **Level (dB)** | How loud the bed plays under the voice, from −40 (barely there) to −6 (close to the voice). Whole numbers only. | −18 |
| **Fade in (seconds)** | How long the bed takes to rise from silence at the start. | 3; 0 to 30 in steps of 0.5 |
| **Tail after the narration (seconds)** | How long the bed keeps playing, fading out, after the narration ends. It plays over the silence already at the end; a tail longer than **Silence at start and end** makes the video that much longer. | 6; 0 to 30 in steps of 0.5 |

Only the long video gets the bed: shorts keep their own background music, and the audio-only WAV stays the narration alone. It costs no API calls. A template with **My own file** cannot run on a schedule, because the file has to be attached again on Play; pick a built-in bed for scheduled runs. A channel's brand kit can only hold the three built-in beds.

## Pauses and Level the volume

Below the ambient sound are **Pause between sentences**, **Pause between paragraphs** and **Level the volume** with its **Video volume** and **Audio files volume**. They shape the narration, so they are described on [Play Narration](Play-Narration#pauses-between-sentences-and-paragraphs).

## Frame format

| Option | What it does | Default |
| --- | --- | --- |
| **Frame format** | **16:9** is a landscape video for YouTube and screens. **9:16** is a portrait video for phones. Images are drawn in this shape and captions are placed for it. | 16:9 |

## Captions

Captions are timed from your narration on this computer, with no paid API. The first use downloads a speech model of about 95 MB. They need narration: with narration Off, the section says "Turn Audio on to add subtitles."

| Option | What it does | Default / range |
| --- | --- | --- |
| **Subtitles** | **Off** makes none. **Subtitle files (.srt + .vtt)** gives you files to upload beside the video. **Burn into video + files** draws the captions into the picture and also makes the files; it needs the video on. | Off |
| **Subtitle font** | The typeface of burned-in captions and chapter cards. Pick **Default font · bundled** or a font you uploaded. | Default font |
| **Upload font (.ttf or .otf)** | Adds your own font, right here in the caption font picker (there is no separate font screen in Settings). Uploaded fonts stay available to every project and to a channel's brand kit. | |
| **Subtitle font size** | How big burned-in captions are. Larger is easier to read on phones but covers more of the picture. Type it or use the slider. | 48; 16 to 120, whole numbers |
| **Subtitle position** | Where burned-in captions sit: **Top**, **Upper-middle**, **Center**, **Lower-middle** or **Bottom**. Move them up when the pictures have important detail near the bottom. | Bottom |

Font, size and position apply to burned-in captions only. Players style `.srt` and `.vtt` files themselves. The channel's brand kit can fill the caption font when you leave it at the default.

### Burn captions into the video

1. Make sure the Narration row is not Off and the video Source is **Generate**.
2. Set **Subtitles** to **Burn into video + files**.
3. Pick a **Subtitle font**, or press **Upload font (.ttf or .otf)** and pick a file. Wait for "Uploading font…" to finish; the run cannot start during the upload.
4. Set **Subtitle font size** and **Subtitle position**.
5. Watch the style preview in the right rail.

If a saved font is missing (for example after a reinstall), the picker says "Saved font is unavailable. Choose another font or upload it again."

After the run, you can fix a misheard word or nudge a caption's timing on the project page. See [Video Editing](Video-Editing).

## Style preview

The **Style preview** at the top of the right rail ("6 seconds of the sample, rendered with your settings") is rendered on this computer by the real video renderer, with your captions, Look and motion. It plays six seconds of the bundled sample project's real narration over three of its pictures, two seconds each, so a transition and a chapter card both show, and the captions are timed to the narration's words, as in a real video. It plays in Slopify's own player, with sound.

The pictures are the sample's (landscape or portrait, following **Frame format**), unless there is something closer to your video: your uploaded establishing image, or else a picture of the cast member the title names (or the first cast member with a picture). The line under it names the caption settings, and "Drawn on …" when it uses one of your pictures. It renders again by itself a moment after you change a setting, costs no API calls, and **Render again** forces a fresh one.

It shows while the video is generated from images. If the caption settings are invalid, it says "Fix the caption settings to render the preview."

| Option | What it does | Default |
| --- | --- | --- |
| **Preview text** | The words the preview's captions show, in your caption font, size and position. Left at the sample sentence (or empty), the captions are the sample narration's own words; any other text is spread over the stretches where the narration speaks. It is only for the preview and never reaches the video; real captions come from your narration. | "Every story begins with a word." |

The same preview is in Edit project while its **Subtitles** section is open. Shorts have their own [Shorts preview](Shorts#shorts-preview).

## What the row summary says

Folded, the row reads like `16:9 · follow the narration · Warm fantasy · captions Default font 48 bottom`: the frame, the cuts, the Look, and the caption font, size and position, or "no video" and "no captions".

## Tips

- Keep **Seconds per image** near the length of a few sentences (10 to 20 s) when cuts follow the narration.
- Try one Look setting at a time and watch the preview; they stack.
- Everything except **Animate images** only costs render time, so you can change the Look later in Edit project without paying a provider again.

## Related pages

- [Play Overview](Play-Overview)
- [Play Images](Play-Images)
- [Play Narration](Play-Narration)
- [Video Editing](Video-Editing)
- [Channels](Channels)
- [Other Languages](Other-Languages)
- [Schedules](Schedules)
