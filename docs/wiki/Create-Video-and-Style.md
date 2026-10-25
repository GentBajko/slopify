# Create: Video and Style

The **Video and style** row decides how your images become a video: the frame shape, the captions, how long each image stays on screen and how it moves and cuts, the Look over the picture, an optional ambient sound and the polish on the narration's sound. The video is put together on this computer, so none of this costs service money except **Animate images**. A six-second style preview shows your choices on the bundled sample.

**Where to find it:** Create → **Video and style** row → **Change**. For an audiobook or podcast the row is called **Sound and captions**, and for a set of images **Shape and look**. After the run, the same controls are in the project's **Edit settings**; see [Video Editing](Video-Editing).

## Choose whether to make a video

The row starts with a **Video** switch:

| Choice | What happens | Cost |
| --- | --- | --- |
| **Make the video** (default) | Puts the slideshow video together on this computer from the images and narration. | No service money, only time |
| **Off (sound only)** | No video. With narration on, you get the narration as one audio file (a WAV with the intro, the article, the outro and the gaps between them). Without narration, each finished part downloads on its own. | None |

**Make the video** needs images, so the video is off while Images is **None**. The line under the switch says what you will get: "The narration over the images, put together on this computer · free.", "Sound only: the narration as one audio file." or "Each finished stage downloads on its own."

## Frame format

| Option | What it does | Default |
| --- | --- | --- |
| **Frame format** | **Landscape** (16:9, for YouTube and screens), **Portrait** (9:16, for shorts and phones) or **Square** (1:1, for feeds). The images are drawn in this shape and the captions placed for it. Shorts are always portrait. | Landscape |

## Captions

Captions are timed from your narration on this computer, with no paid service. The first English captions download the speech model chosen in Settings → Production defaults → **Caption timing model** (378 MB unless changed). They need narration.

| Option | What it does | Default / range |
| --- | --- | --- |
| **Captions** | **Off** makes none. **Caption files only (.srt + .vtt)** gives you files to upload beside the video. **Show captions in the video** draws them into the picture and also makes the files; it needs the video on. | Off |
| **Caption font** | The typeface of captions shown in the video and of chapter cards: the bundled **Barlow**, the fonts on this computer, or a font you uploaded. A sample line shows each one. | Barlow |
| **Upload font (.ttf or .otf)** | Adds your own font, right here in the caption font picker. Uploaded fonts stay available to every project and to a channel's brand kit. | |
| **Caption size** | How big captions in the video are. Larger is easier to read on phones but covers more of the picture. Once changed, it says **Changed · default 48** with **Reset**. | 48; 16 to 120, whole numbers |
| **Caption position** | Where captions in the video sit: **Top**, **Upper-middle**, **Center**, **Lower-middle** or **Bottom**. Move them up when the pictures have important detail near the bottom. | Bottom |
| **Preview sentence** | The words the style preview's captions show. Only the preview shows it; real captions come from the narration. | "Every story begins with a word." |

Font, size and position apply to captions shown in the video only. Players style `.srt` and `.vtt` files themselves. The channel's brand kit can fill the caption font when you leave it at the default.

### Show captions in the video

1. Make sure Narration is not **Off** and Video is **Make the video**.
2. Set **Captions** to **Show captions in the video**.
3. Pick a **Caption font**, or press **Upload font (.ttf or .otf)** and pick a file. Wait for the upload to finish; the run cannot start during it.
4. Set **Caption size** and **Caption position**.
5. Press **Watch a 6-second preview** in the rail.

If a saved font is missing (for example after a reinstall), the picker says so: choose another font or upload it again.

After the run, you can fix a misheard word or nudge a caption's timing on the project page. See [Video Editing](Video-Editing).

## Images and cuts

**Images and cuts** is the part of the row under the captions.

| Option | What it does | Default / range |
| --- | --- | --- |
| **Seconds per image** | How long each image stays on screen. When cuts follow the narration, it is the target and a cut waits for a sentence end. When the images run out they start again. | 15; 1 to 600 |
| **Zoom (%)** | How far each image zooms in or out over its time on screen. 0 keeps images still. | 22.5; 0 to 50 |
| **Motion** | How each image moves: **Zoom in and out**, **Pan across**, **Mix of both** (by turns) or **Still**. A mix keeps a long video watchable. | Zoom in and out |
| **Cuts** | **Every N seconds** holds each image for Seconds per image. **Follow the narration** cuts in the pause after a sentence, as close to that length as the sentences allow (never under 40% of it), and starts a new image at every chapter. | Follow the narration for new projects |

**Follow the narration** needs word timing, so it works in English and the languages that have it. For a language without word timing, **Cuts** stays on **Every N seconds** and a note under it says why. See [Other Languages](Other-Languages).

Turning on **More images for long videos** in the Images row switches **Motion** from Zoom to **Mix of both**. See [Images](Create-Images#more-images-for-long-videos).

## The Look

**Look** is a fold in the row. Folded, its line lists what is on (for example **Crossfade 2 s · Warm fantasy · Fog · Vignette**). Everything in it is drawn on this computer at no cost; only animated images are charged, by the image service.

| Option | What it does | Default / range |
| --- | --- | --- |
| **Transition** | How one image hands over to the next: **Cut**, **Crossfade**, **Fade through black**, **Slide** or **Wipe**. The change is centred on the cut and takes the length you pick, so the video stays exactly as long as its narration. | Cut; length 0.6 s (0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.5 or 2 s) |
| **Color grade** | A color treatment over the whole video: **Warm fantasy**, **Cold**, **Desaturated** or **Sepia**. | None |
| **Vignette** | Darkens the corners to draw the eye to the middle: **Subtle** or **Strong**. | Off |
| **Film grain** | Moving film grain over the whole picture for an older, filmic feel: **Subtle** or **Strong**. | Off |
| **Atmosphere** | An overlay Slopify draws itself: rising **Embers**, drifting **Dust**, or low **Fog** along the bottom of the frame. Nothing is downloaded and no service is called. | None |
| **Chapter cards** | Shows each chapter's title in the middle of the picture for 2.5 seconds as the chapter starts, in the caption font. Chapters come from the YouTube description when that step runs, otherwise from the article's headings. Needs narration. | Off |
| **Animate images** | Turns some images into 5-second moving clips with an image-to-video model on your image service (fal.ai or Replicate). **Chapter openers** animates the first image of each chapter (needs narration); **Every Nth image** animates every 2nd to 10th. Pick the image-to-video model in the box beside it. Each clip is one paid call, shown in the estimate. An image that cannot be animated stays still. | Off |

### Animate some images

1. Make sure the Images row uses fal.ai or Replicate. Other services have no image-to-video models, and the Look says so.
2. Open **Look** and set **Animate images** to **Chapter openers** or **Every Nth image**.
3. For **Every Nth image**, pick how often (every 2 to every 10).
4. Pick the image-to-video model. The run cannot start until one is picked.
5. Check the added cost in the estimate.

## Ambient sound

An optional sound of rain, a fireplace, wind or your own audio file, played quietly under the whole narration of the long video. It dips while the narrator speaks, including under the intro and outro. It is shown while both the video and the narration are on.

| Option | What it does | Default / range |
| --- | --- | --- |
| **Ambient sound** | **The channel's (brand kit)** uses whatever the channel's kit says, which may be nothing. **None** plays nothing, whatever the channel has. **Rain**, **Fireplace** and **Wind** are made on this computer, so nothing is downloaded and the same settings always sound the same. **My own file** uploads an audio file, looped if shorter than the video. | The channel's (brand kit) |
| **Level (dB)** | How loud it plays under the voice, from −40 (barely there) to −6 (close to the voice). Whole numbers only. | −18 |
| **Fade in (seconds)** | How long it takes to rise from silence at the start. | 3; 0 to 30 in steps of 0.5 |
| **Tail after the narration (seconds)** | How long it keeps playing, fading out, after the narration ends. It plays over the silence already at the end; a tail longer than **Silence at start and end** makes the video that much longer. | 6; 0 to 30 in steps of 0.5 |

Only the long video gets it: shorts keep their own background music, and the sound-only WAV stays the narration alone. It costs no service calls. A template with **My own file** cannot run on a schedule, because the file has to be attached again on Create; pick a built-in sound for scheduled runs. A channel's brand kit can only hold the three built-in sounds.

## Sound polish

**Sound polish** is a fold at the end of the row. Its line says what is on (for example **Volume levelled**). It shows while there is narration.

| Option | What it does | Default |
| --- | --- | --- |
| **Pause between sentences (seconds)**, **Pause between paragraphs (seconds)** | The least quiet after each sentence and each paragraph. | 0.4 and 0 |
| **Soften breaths** | Turns the audible breaths between sentences down. Words and timing stay the same. | Off |
| **Soften S sounds** | Takes the sharp edge off s and sh sounds; very light, the voice keeps its brightness. | Off |
| **Level each sentence** | Holds each sentence to the ones around it, so no line jumps out or drops away. Needs **Level the volume**. | Off |
| **Level the volume**, **Video volume**, **Audio files volume** | Brings every narration piece to one loudness and sets the finished files to a target loudness. | On; 0 dB and 0 dB |
| **Silence at start and end (seconds)**, **Silence between segments (seconds)** | Quiet before and after the narration, and between the intro, the article and the outro. | 2, and the Settings value |

The pauses, levelling and silences shape the narration, so they are described in full on [Narration](Create-Narration#pauses-between-sentences-and-paragraphs).

## Style preview

**Watch a 6-second preview** in the rail opens **Preview with your captions and look**: six seconds put together on this computer by the real video renderer, with your captions, Look and motion. It plays the bundled sample project's real narration over three of its pictures, two seconds each, so a transition and a chapter card both show, and the captions are timed to the narration's words, as in a real video. It plays with sound, and costs nothing.

The pictures are the sample's (in your frame shape), unless there is something closer to your video: your uploaded establishing image, or else a picture of the cast member the title names (or the first cast member with a picture). The line beside the button names the caption settings. **Make the preview again** makes a fresh one after you change a setting. If the caption settings are invalid, it says "Fix the caption settings to render the preview."

The preview's captions show the **Preview sentence**. Left at the sample sentence (or empty), they are the sample narration's own words; any other text is spread over the stretches where the narration speaks. It never reaches the video.

The same preview is in a project's **Edit settings** while its captions are open. Shorts have their own [Shorts preview](Shorts#shorts-preview).

## What the row says

Folded, the row reads like `Landscape 16:9, a new image at each sentence, a 2 s crossfade, a subtle vignette, a warm fantasy grade and drifting fog, captions in Barlow Regular.`: the frame, the cuts, the Look and the captions, or "No video: sound only" and "no captions".

## Tips

- Keep **Seconds per image** near the length of a few sentences (10 to 20 s) when cuts follow the narration.
- Try one Look setting at a time and watch the preview; they stack.
- Everything except **Animate images** only costs time on this computer, so you can change the Look later in **Edit settings** and make the video again for free.

## Related pages

- [Create Overview](Create-Overview)
- [Images](Create-Images)
- [Narration](Create-Narration)
- [Video Editing](Video-Editing)
- [Channels](Channels)
- [Other Languages](Other-Languages)
- [Schedules](Schedules)
