# Create: Images

The images are the pictures your video shows while the narration plays. On Create you pick who draws them, which image prompts (styles) they come from and how many each makes, and optionally an establishing image that keeps characters and style the same. You get a set of images, drawn in the video's frame shape, played in order.

**Where to find it:** Create → **Images** row → **Change**.

## Choose where the images come from

The row starts with an **Images** switch:

| Choice | What happens | Cost |
| --- | --- | --- |
| **Made by AI (paid)** (default) | Draws images from the ticked image prompts, one image call each. | Per image, by the service |
| **My own images** | Uses your own PNG, JPEG or WebP files (**Your images, in the order they play**). | None |
| **None** | No images. This turns the video off too. | None |

### Use your own images

1. Set **Images** to **My own images**.
2. Pick the files under **Your images, in the order they play**. Each is numbered in the order it plays.
3. Remove a file with its remove button, or attach one again whose upload was lost.

A video can have at most 60 of your images, and the same file cannot be picked twice. Wait for every upload to finish before pressing Make the video.

## Pick the image service and model

| Option | What it does | Default |
| --- | --- | --- |
| **Service** (under **Images by**) | Who draws the images, the thumbnail and the shorts' pictures: a keyed service billed per image (fal.ai, Replicate, OpenAI, Google), or a tool you are signed in to (Codex CLI). Each service in the list says when it has **No key** or is **Not found**. When none has a key, the line under it offers **Add an image key ↗**, or **Set Images to None**. | Your template's, or a service with a saved key |
| **Model** | The service's image model. Models differ in quality, speed and price per image; the estimate in the rail shows what this run costs. **Type a model ID…** at the end of the list lets you type one. | The service's default |
| **Effort** | How long an image agent, such as the Codex CLI, reasons before it draws. Higher effort can follow the prompt more closely but takes longer and uses more tokens. Shown only for models that offer levels. | **Model default** |

Changing the service clears the model.

### Drawing with the Codex CLI

With **Codex CLI** as the image service, the **Model** list holds **Codex default** and the Codex CLI's own models. **Codex default** leaves the model and effort to the CLI's own defaults. Any other model runs with the **Effort** you pick. An image agent that reviews and redraws its picture can work for several minutes at a high effort. Images drawn this way cost nothing extra on your plan; the estimate shows the approximate API price beside **$0 on your plan**. See [AI CLIs](AI-CLIs).

## Pick the image styles

1. Under **Which image style?**, tick the image prompts that should draw the video's images.
2. Type in each ticked prompt's box how many images it makes, 1 to 20.
3. Check the total under the list, for example **16 of at most 60 images · each is one paid image call.**

| Rule | Value |
| --- | --- |
| Images per prompt | 1 to 20 (a freshly ticked prompt starts on 16 for a video) |
| Images per run, typed | at most 60 |
| Images per run, with **More images for long videos** | at most 240 |
| Order | The images play in the order you ticked the prompts |

Each image is one image call. A prompt that has been deleted since this draft picked it shows **No longer in Prompts · untick to remove**. With no image prompts at all, the row says to write one on Prompts. See [Prompts](Prompts).

### Photorealistic prompts

An image prompt has a **Draws photorealistic pictures** tick in its editor. Turn it on when the prompt's style looks like real photos or film. Copy for YouTube Studio then answers Yes to YouTube's question about altered or synthetic content for videos and shorts drawn with it. Leave it off for painterly or illustrated styles. It is set on the prompt, not on Create: open **Prompts** → **Image** → the prompt. See [Prompts](Prompts) and [Publishing to YouTube](Publishing-to-YouTube).

## Establishing image

The establishing image is made first and never shown in the video. Every other image, the shorts' images and (if ticked) the thumbnail are drawn with it as a reference, so characters, style and palette stay the same across the video.

| Option | What it does | Default |
| --- | --- | --- |
| **Establishing image (keeps characters and style the same)** | **Off** (each image is drawn on its own), **Drawn from an image prompt** (one more image call) or **Upload mine** (your own PNG or JPEG, **Establishing image file**). | Off |
| **Establishing prompt** | The image prompt that draws it, keywords filled like the others. Describe the characters, setting and style every other image should share. | None |
| **Use it as a reference for the thumbnail too** | Draws the thumbnail with the establishing image as a reference too, so it matches the video. Untick it for a thumbnail drawn on its own. Shown while a thumbnail is on (in the Extras row). | On |

Changing the establishing image later marks the images drawn from it as outdated. When you upload the establishing image, the style preview is drawn on it, so you judge the Look and captions on your own picture.

### Set up an establishing image

1. Under **Establishing image**, pick **Drawn from an image prompt** or **Upload mine**.
2. For a drawn one, pick the **Establishing prompt**. For **Upload mine**, pick the file.
3. Leave **Use it as a reference for the thumbnail too** ticked if the thumbnail should match.

## The channel's cast

The video's channel brings its cast: characters, creatures, places and objects, each with reference pictures. When an image's brief mentions a cast member by name or alias (as a whole word, ignoring case), that image is drawn with the member's pictures as references, after the establishing image when it is on. The establishing image and the thumbnail also take the members the title mentions. At most four members go with one image.

Models that take several input pictures (Codex, OpenAI, Google, and fal.ai's FLUX.2 and Nano Banana 2 edit models) use the pictures directly. A model that takes none gets the members described in words instead. The cast is used even when **Use the channel's brand kit** is off. See [Cast Library](Cast-Library) and [Channels](Channels).

## More images for long videos

A long video with a fixed handful of images repeats them for an hour. **More images for long videos** adds images as the narration gets longer.

| Option | What it does | Default / range |
| --- | --- | --- |
| **More images for long videos** | Adds images, planned from the expected length when the run starts. The extra images are shared among the ticked prompts in order, up to 240 in all. Each is one more image call. | Off |
| **How the rate is given** | **Every N minutes**: one image every N minutes of narration (0.25 to 60). **N per hour**: N images per hour (1 to 240). Switching keeps the same rate. | One image every 2 minutes |

### Turn it on

1. Tick at least one image prompt.
2. Switch on **More images for long videos**.
3. Pick **Every N minutes** or **N per hour** and type the rate.
4. Read the line under it, for example: "For about 60 minutes (9,000 words expected): 30 images, 26 more than the prompts' 4."

How the count is worked out:

- The length is your own article's word count, or else the **Expected length** in the rail, at 150 spoken words a minute.
- Each ticked prompt keeps its own number as a minimum. The extra images are handed to the ticked prompts one at a time, in the order they were ticked.
- When the prompts' own numbers already cover the length, nothing is added.
- The count stops at 240. After that the slideshow repeats its images, as it does whenever the narration outlasts them.
- The count is planned once, when the run starts. A narration that turns out longer is still covered by the slideshow cycling its images.

Turning it on also switches **Motion** (in **Video and style** → **Images and cuts**) from **Zoom in and out** to **Mix of both**, so a long video pans and zooms by turns. A **Pan across** or **Still** you picked stays, and you can pick Zoom again.

## Scenes from the article

Without it, every image of a prompt is drawn from the same text, so three images of one prompt tend to show the same picture three times. **Scenes from the article** gives every image its own moment.

| Option | What it does | Default |
| --- | --- | --- |
| **Scenes from the article** | Before the images are drawn, the AI writer reads the article once and writes a short scene for each image. Scene 1 comes from the article's opening and the last from its ending, in the order the images are shown. Each image is drawn from its prompt with its scene added. One more AI call per run. | Off |

Where the scene goes:

- A prompt with `{{Scene}}` gets the scene there, for example a line `Scene: {{Scene}}` under the prompt's first sentence. `{{Scene}}` is never a keyword to fill in: Slopify writes it.
- A prompt without it gets the scene as a line of its own after its first paragraph, so any prompt works unchanged.
- With the switch off, a line holding `{{Scene}}` is left out and the prompt is drawn as it always was.
- A **thumbnail** prompt with `{{Scene}}` gets a scene from a call of its own (one more AI call, in the Thumbnail step, so changing the thumbnail never makes the images again): the article's most striking moment, the one that would make someone click, taken from anywhere in the article. With **How many thumbnails** set to 3, each thumbnail gets a different moment, so the A/B test compares ideas as well as compositions. A thumbnail prompt without `{{Scene}}` is drawn as it always was.

A prompt using `{{Slopify_Scene}}`, `{{Slopify_Setting}}` or `{{Slopify_Mood}}` gets its scene even with the switch off, and the switch shows it as on for that prompt. `{{Slopify_Setting}}` adds the era and place of each moment, so the picture stays true to its period, and `{{Slopify_Mood}}` its feeling, for light and colour; both are written by the same call. See [Keywords Slopify fills](Keywords-Slopify-Fills#per-picture).

The style, composition and everything else in the prompt stay as written; only the scene changes from image to image. The scenes are written once the article exists, and each image waits for them. Switching it on or off in a project's **Edit settings** makes the images again.

## Looks looked up: {{Appearance}}

An image model draws a named figure from whatever it half remembers, so the same character can look different in every image. Put `{{Appearance}}` in an image, thumbnail, establishing or shorts image prompt, for example a line `Looks: {{Appearance}}`, and Slopify looks the looks up instead.

- Once the article exists, one call to the AI writer **searches the web** for how the video's subject and every named character in the article look: build, face, clothing, colours and the marks that make them recognisable. Where depictions disagree, it describes the most iconic one.
- With **Scenes from the article** on, each picture gets the looks of the figures its scene names (up to three besides the subject), so a scene of a place or of someone else isn't redrawn with the subject in it; a scene that names no one leaves the looks line out. A thumbnail always gets the subject's look. Without scenes, every picture gets the subject's look.
- There is no switch: a prompt with `{{Appearance}}` turns it on, and prompts without it are drawn as they always were. `{{Appearance}}` is never a keyword to fill in.
- It costs one more AI call per run, with web search. The pictures that use it wait for it.
- `{{Slopify_Appearance}}` is the new name of `{{Appearance}}` and means exactly the same.

## How long each image stays on screen

**Seconds per image** (1 to 600, default 15) is in **Video and style** → **Images and cuts**, beside **Zoom**, **Motion** and **Cuts**. When cuts follow the narration, it is the target length and a cut waits for a sentence end. When images run out, they start again. See [Video and style](Create-Video-and-Style#images-and-cuts).

## The thumbnail and the shorts

The thumbnail and the shorts' images use the same image service and model. If the video's images are not made by AI but the thumbnail is, the thumbnail gets its own **Drawn by** service and model in the **Extras** row. See [Extras](Create-Extras) and [Shorts](Shorts).

## What the row says

Folded, the Images row says what will be drawn, for example `16 images from “Sleep lore · Scene”, made by fal.ai (FLUX.2), all in the look of one establishing image.` With your own images it says how many there are.

## Tips

- Keep one style across the video with an establishing image, instead of repeating the style in every image prompt.
- Picture checks can look at each image for malformed hands, stray text and a match with its brief. They need Claude Code or Codex as the checker. See [Pauses and Checks](Reviews-and-Checkpoints).
- After the run, you can add, remove or make single images again on the project page. See [Editing a Project](Editing-a-Project).

## Related pages

- [Create Overview](Create-Overview)
- [Prompts](Prompts)
- [Keywords Slopify fills](Keywords-Slopify-Fills)
- [Cast Library](Cast-Library)
- [Channels](Channels)
- [Models](Models)
- [Costs and Run Cost](Costs-and-Run-Cost)
- [Video and style](Create-Video-and-Style)
- [Extras](Create-Extras)
