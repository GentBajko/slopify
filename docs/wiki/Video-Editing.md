# Video Editing

These settings decide how the finished video looks and sounds: how long each image stays, where the cuts fall, how images move and hand over, the Look, chapter cards, animated images, ambient sound and captions. All of it except animated images is done on your computer with ffmpeg, so it costs render time, not API calls.

**Where to find it:** a project → **Edit settings** → **Inputs** (**Timing**, **Cuts and look**, **Ambient sound**) and **Subtitles**. On a new run the same controls are on Play → **Video and style** (see [Play Video and Style](Play-Video-and-Style)).

## How the video is put together

Slopify plans the whole video as an edit list: which image or clip plays, for how long, how it moves, how it hands over to the next, and the effects on top. The renderer reads only that list, so the same project renders the same video every time. The video is always exactly as long as its narration plus the silence you set.

## Timing

| Option | What it does | Default / range |
| --- | --- | --- |
| **Silence gap (seconds)** | Quiet between the intro and the narration, and between the narration and the outro. Only matters when an intro or outro is set. | Settings value (3 s unless changed); 0 to 30 |
| **Silence at start and end (seconds)** | Quiet before the narration starts and after it ends. | 2; 0 to 30 |
| **Seconds per image** | How long each image stays on screen. With cuts that follow the narration, it is the target and a cut waits for a sentence end. When images run out they start again. | 15; 1 to 600 whole seconds |
| **Zoom (%)** | How far each image zooms in or out over its time on screen. 0 keeps zoom motions still. | 22.5; 0 to 50 in 0.5 steps |
| **Motion** | How each image moves: **Zoom in and out**, **Pan across**, **Mix of both** (by turns) or **Still**. | Zoom in and out |

Motion takes turns so a long video stays watchable. Zoom goes in, out, in. Pan goes across one way, back, down, back up. Mix of both alternates zoom and pan, each keeping its own order. A pan always travels at least 10% of the frame, so pans still move with Zoom at 0.

## Cuts

**Cuts** decides where one image ends and the next begins.

| Option | What it does |
| --- | --- |
| **Every N seconds** | Holds each image for **Seconds per image**. |
| **Follow the narration** | Cuts in the pause after a sentence, as close to Seconds per image as the sentences allow (never under 40% of it), and starts a new image at every chapter. |

New projects default to **Follow the narration**. It needs word timing, so it works in English and the languages that have it; in other languages the picker is fixed to Every N seconds and a note says why. See [Other Languages](Other-Languages).

## The Look

**Look** is a folding row under Cuts. Its summary line lists what is on, or "Plain cuts, no effects".

| Option | What it does | Default / choices |
| --- | --- | --- |
| **Transition** | How one image hands over to the next: **Cut**, **Crossfade**, **Fade through black**, **Slide** or **Wipe**. The change is centred on the cut, so the video stays exactly as long as its narration. | Cut |
| **Transition length** | How long the transition takes (ignored for Cut). | 0.6 s; 0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.5 or 2 s |
| **Colour grade** | A colour treatment over the whole video: **Warm fantasy**, **Cold**, **Desaturated** or **Sepia**. | None |
| **Vignette** | Darkens the corners to draw the eye to the middle: **Subtle** or **Strong**. | Off |
| **Film grain** | Moving film grain over the whole picture: **Subtle** or **Strong**. | Off |
| **Atmosphere** | An overlay Slopify draws itself: **Embers** (rising), **Dust** (drifting) or **Fog** (low, along the bottom). No footage is downloaded. | None |
| **Chapter cards** | Shows each chapter's title in the middle of the picture for 2.5 seconds as the chapter starts, in the caption font. Chapters come from the YouTube description when that step runs, otherwise from the article's headings. Needs narration. | Off |
| **Animate images** | Turns some images into 5-second moving clips with an image-to-video model on your image provider (fal.ai or Replicate). **Chapter openers** animates the first image of each chapter (needs narration); **Every Nth image** animates every 2nd to 10th image (**Animate every how many images**). Pick the model in **Image-to-video model**. | Off |

Every Look option except **Animate images** is applied while the video renders, with no API cost. Each animated clip is one paid call, shown in the estimate. An image that cannot be animated stays still, and the Video section lists it under **Render notes**.

### Set up the Look

1. Open the project → **Edit settings** → **Inputs**.
2. Under **Cuts and look**, click **Look** to open it.
3. Pick a transition, grade, vignette, grain, atmosphere, chapter cards or animation.
4. Press **Save changes**.
5. Press the next action, **Remake the outdated video**, or review it in **Choose what to remake**.

Changing the Look outdates the video; narration and images are kept.

## Video clips in place of images

In **Edit project → Images**, **Add a video clip** puts your own clip into the image order. It plays muted for as long as an image would be shown: trimmed, slowed (to half speed at most) or looped to fit. See [Editing a Project](Editing-a-Project#edit-images).

If the clips you uploaded are real filmed footage, turn on **Real footage** in Prepare upload so YouTube's AI-use answer is right. See [Publishing to YouTube](Publishing-to-YouTube).

## Ambient sound

A quiet bed under the whole narration of the long video. It dips while the narrator speaks. Costs no API calls. Shorts never get it. Changing it remakes only the video.

**Where to find it:** a project → **Edit settings** → **Inputs** → **Ambient sound** (shown when the project has narration and video).

| Option | What it does | Default / range |
| --- | --- | --- |
| **Ambient sound** | **Rain**, **Fireplace** or **Wind**, made on your computer, or **None**. **My own file** stays offered while the project has an uploaded bed; a new file is chosen on Play. | None, or the channel's bed |
| **Level (dB)** | How loud it plays under the voice, from -40 (barely there) to -6 (close to the voice). Whole numbers only. | -18 |
| **Fade in (seconds)** | How long it takes to rise from silence at the start. | 3; 0 to 30 in 0.5 steps |
| **Tail after the narration (seconds)** | How long it keeps playing, fading out, after the narration ends. A tail longer than the silence at the end makes the video that much longer. | 6; 0 to 30 in 0.5 steps |

With **Level the volume** on, the bed is mixed and ducked first, then the whole mix is mastered. See [Editing a Project](Editing-a-Project#pauses-and-volume).

## Subtitles

**Where to find it:** a project → **Edit settings** → **Subtitles**.

| Option | What it does | Default / range |
| --- | --- | --- |
| **Subtitles** | **Off** makes none. **Subtitle files (.srt + .vtt)** gives you files to upload beside the video. **Burn into video + files** draws the captions into the picture and also makes the files; it needs Video on. | Off |
| **Subtitle font** | The typeface of burned-in captions and chapter cards. Pick a bundled font (**Default font · bundled**) or upload one with **Upload font (.ttf or .otf)**; uploaded fonts stay available to every project. | The bundled font |
| **Subtitle font size** | How big burned-in captions are. Larger is easier to read on phones but covers more of the picture. | 48; 16 to 120 |
| **Subtitle position** | Where burned-in captions sit: **Top**, **Upper-middle**, **Center**, **Lower-middle** or **Bottom**. Move them up when pictures have detail near the bottom. | Bottom |

Captions are timed from your narration on your computer, with no paid API. The first use downloads a speech model of about 95 MB. Subtitle files carry no font, size or position, because players style them. Changing the font, size or position remakes only the video.

Subtitles need narration: with Audio off the section says "Turn Audio on to add subtitles." With Video off (an audio export), only subtitle files are offered.

To fix a misheard word or move a caption, edit the captions themselves: see [Editing a Project](Editing-a-Project#edit-captions).

## Style preview

**Style preview** (under Subtitles in Edit project, and in Play's right rail) renders six seconds of video with the real renderer, at a small size: your format, captions, Look, transition, motion and a chapter card when chapter cards are on.

- It is drawn on the project's establishing image or a cast picture when there is one (the line under it says "Drawn on ..."), otherwise on three plain stills.
- It renders again by itself a moment after you change a setting. **Render again** forces a fresh one.
- Captions show in the preview only when they are burned in.
- The sound is silence. It costs no API calls, only a few seconds of your computer's time.

If it says "Fix the caption settings to render the preview", correct the subtitle fields first.

## What a change remakes

| You change | What is made again |
| --- | --- |
| Seconds per image, zoom, motion, cuts, the Look (except Animate images), subtitles style, ambient sound | The video only |
| Animate images | The animated clips (paid) and the video |
| Subtitle mode | Subtitle files and the video |
| Caption text or timing | Subtitle files and the video |
| Pauses between sentences or paragraphs | The narration join and timing, captions, the video, and (when on) the YouTube description and the shorts' pick |

The rebuild review lists exactly what will be made before anything runs. See [Editing a Project](Editing-a-Project#choose-what-to-remake).

## Tips

- Try a Look on the style preview first; it costs nothing.
- A crossfade longer than about a second eats into short shots. Keep transitions short when Seconds per image is low.
- Captions burned into the picture cannot be turned off by viewers. Subtitle files let YouTube viewers switch them.

## Related pages

- [Play Video and Style](Play-Video-and-Style)
- [Editing a Project](Editing-a-Project)
- [Project Page](Project-Page)
- [Shorts](Shorts)
- [Channels](Channels)
- [Other Languages](Other-Languages)
