# Video Editing

These settings decide how the finished video looks and sounds: how long each image stays, where the cuts fall, how images move and hand over, the Look, chapter cards, animated images, ambient sound and captions. All of it except animated images is done on your computer with ffmpeg, so it costs time on your computer, not service calls.

**Where to find it:** a project → **Edit settings** → **Video and style** (**Images and cuts**, and **Sound polish** for the silences and ambient sound) and **Captions**. On a new run the same controls are on Create → **Video and style** (see [Create: Video and Style](Create-Video-and-Style)).

## How the video is put together

Slopify plans the whole video as an edit list: which image or clip plays, for how long, how it moves, how it hands over to the next, and the effects on top. The video is put together from that list alone, so the same project makes the same video every time. The video is always exactly as long as its narration plus the silence you set.

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
| **Color grade** | A color treatment over the whole video: **Warm fantasy**, **Cold**, **Desaturated** or **Sepia**. | None |
| **Vignette** | Darkens the corners to draw the eye to the middle: **Subtle** or **Strong**. | Off |
| **Film grain** | Moving film grain over the whole picture: **Subtle** or **Strong**. | Off |
| **Atmosphere** | An overlay Slopify draws itself: **Embers** (rising), **Dust** (drifting) or **Fog** (low, along the bottom). No footage is downloaded. | None |
| **Chapter cards** | Shows each chapter's title in the middle of the picture for 2.5 seconds as the chapter starts, in the caption font. Chapters come from the YouTube description when that step runs, otherwise from the article's headings. Needs narration. | Off |
| **Animate images** | Turns some images into 5-second moving clips with an image-to-video model on your image service (fal.ai or Replicate). **Chapter openers** animates the first image of each chapter (needs narration); **Every Nth image** animates every 2nd to 10th image (**Animate every how many images**). Pick the model in **Image-to-video model**. | Off |

Every Look option except **Animate images** is applied while the video is put together, at no cost. Each animated clip is one paid call, shown in the estimate. An image that cannot be animated stays still, and the Video part says so in its notes under the player.

### Set up the Look

1. Open the project → **Edit settings** → **Video and style**.
2. Under **Images and cuts**, open **Look**.
3. Pick a transition, grade, vignette, grain, atmosphere, chapter cards or animation.
4. Press **Save changes**.
5. Press the next action, **Make the outdated video again**, or look it over in **Choose what to make again**.

Changing the Look outdates the video; narration and images are kept.

## Video clips in place of images

In **Edit settings** → **Images**, **Add a video clip** puts your own clip into the image order. It plays muted for as long as an image would be shown: trimmed, slowed (to half speed at most) or looped to fit. See [Editing a Project](Editing-a-Project#edit-images).

If the clips you uploaded are real filmed footage, turn on **The uploaded clip is real footage** (or **The 3 uploaded clips are real footage**) in Copy for YouTube Studio so YouTube's AI-use answer is right. See [Publishing to YouTube](Publishing-to-YouTube).

## Ambient sound

A quiet bed under the whole narration of the long video. It dips while the narrator speaks. It costs nothing. Shorts never get it. Changing it makes only the video again.

**Where to find it:** a project → **Edit settings** → **Video and style** → **Sound polish** → **Ambient sound** (shown when the project has narration and video).

| Option | What it does | Default / range |
| --- | --- | --- |
| **Ambient sound** | **Rain**, **Fireplace** or **Wind**, made on your computer, or **None**. **My own file** stays offered while the project has an uploaded bed; a new file is chosen on Create. | None, or the channel's bed |
| **Level (dB)** | How loud it plays under the voice, from -40 (barely there) to -6 (close to the voice). Whole numbers only. | -18 |
| **Fade in (seconds)** | How long it takes to rise from silence at the start. | 3; 0 to 30 in 0.5 steps |
| **Tail after the narration (seconds)** | How long it keeps playing, fading out, after the narration ends. A tail longer than the silence at the end makes the video that much longer. | 6; 0 to 30 in 0.5 steps |

With **Level the volume** on, the bed is mixed and ducked first, then the whole mix is mastered. See [Editing a Project](Editing-a-Project#pauses-and-volume).

## Captions

**Where to find it:** a project → **Edit settings** → **Captions**.

| Option | What it does | Default / range |
| --- | --- | --- |
| **Captions** | **Off** makes none. **Show captions in the video** draws them into the picture and also saves them as .srt and .vtt files for YouTube; it needs Video on. **Caption files only (.srt + .vtt)** gives you files to upload beside the video, which itself shows none. | Off |
| **Caption font** | The typeface of captions in the video and of chapter cards. Pick a bundled font (**Default font · bundled**) or upload one with **Upload font (.ttf or .otf)**; uploaded fonts stay available to every project. | The bundled font |
| **Caption size** | How big captions in the video are. Larger is easier to read on phones but covers more of the picture. | 48; 16 to 120 |
| **Caption position** | Where captions in the video sit: **Top**, **Upper-middle**, **Center**, **Lower-middle** or **Bottom**. Move them up when pictures have detail near the bottom. | Bottom |

Captions are timed from your narration on your computer, at no cost. The first use downloads a speech model of about 378 MB (Settings → Production defaults → **Caption timing model** offers smaller ones). Caption files carry no font, size or position, because players style them. Changing the font, size or position makes only the video again.

Captions need narration: with Narration off the section says "Captions come from the narration: turn Narration on to add them." With Video off (sound only), only caption files are offered.

To fix a misheard word or move a caption, edit the captions themselves: see [Editing a Project](Editing-a-Project#edit-captions).

## Style preview

**Style preview** (under Captions in Edit settings, and from **Watch a 6-second preview** in Create's rail) makes six seconds of video the way the real video is made, at a small size: your format, captions, Look, transition, motion and a chapter card when chapter cards are on.

- It is drawn on the project's establishing image or a cast picture when there is one (the line under it says "Drawn on ..."), otherwise on three plain stills.
- It is made again by itself a moment after you change a setting. **Make the preview again** forces a fresh one.
- Captions show in the preview only when they are shown in the video.
- The sound is silence. It costs nothing, only a few seconds of your computer's time.

If it says "Fix the caption settings to render the preview.", correct the caption fields first.

## What a change makes again

| You change | What is made again |
| --- | --- |
| Seconds per image, zoom, motion, cuts, the Look (except Animate images), the captions' style, ambient sound | The video only |
| Animate images | The animated clips (paid) and the video |
| Captions (Off, in the video, files only) | Caption files and the video |
| Caption text or timing | Caption files and the video |
| Pauses between sentences or paragraphs | The narration join and timing, captions, the video, and (when on) the YouTube description and the shorts' pick |

**Choose what to make again** lists exactly what will be made before anything runs. See [Editing a Project](Editing-a-Project#choose-what-to-make-again).

## Tips

- Try a Look on the style preview first; it costs nothing.
- A crossfade longer than about a second eats into short shots. Keep transitions short when Seconds per image is low.
- Captions shown in the video cannot be turned off by viewers. Caption files let YouTube viewers switch them.

## Related pages

- [Create: Video and Style](Create-Video-and-Style)
- [Editing a Project](Editing-a-Project)
- [Project Page](Project-Page)
- [Shorts](Shorts)
- [Channels](Channels)
- [Other Languages](Other-Languages)
