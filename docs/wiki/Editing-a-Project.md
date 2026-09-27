# Editing a Project

You can change almost anything about a project after it has run: the article, a narration chunk, one image, the prompts, the providers, the captions or the volume. Slopify saves each change as a new revision and remakes only the outputs the change affects, after you have seen what that costs.

**Where to find it:** a project → **Edit settings** (top right), or **Settings** in the section rail. The form is called **Edit project**.

## How editing works

1. **Edit.** You change settings or content in the Edit project form. Nothing runs while you edit.
2. **Save.** **Save changes** stores a new revision. Saving never starts work. Outputs the change affects turn **outdated** and keep their old version until they are remade.
3. **Remake.** The next action button offers the first group of outdated outputs, for example **Remake the outdated narration** or **Remake 4 outdated images**. Press it, or open **Choose what to remake** to see the full list, the cost, and what is kept.

Remaking one group can make the next group outdated in turn (new narration outdates the video); the next action then names that group.

## Edit project sections

The form has its own section list on the left. Some sections appear only when the project uses them.

| Section | What you change there |
| --- | --- |
| **Inputs** | **Project title**, **Channel** and brand kit, **Stages** (the source of each stage: Research, Article, Audio, Images, Thumbnail, Video, Document), **Document theme**, **Timing** (silence, seconds per image, zoom, motion), **Cuts and look**, **Ambient sound**, **Pauses and volume**, **Intro and outro**, **Research notes**. |
| **Article** | The **Article text** itself. Shows an "edited" badge once you have changed it. |
| **Providers** | Language, text, narration and image providers, models, voice, speakers, Pronunciation Glossary, narration aliases, **Describe tables and figures**, chunking and Narration Preparation. |
| **Prompts** | The YouTube description prompt, every prompt the project uses, and the keywords. |
| **Reviews** | Automatic reviews. See [Reviews and Checkpoints](Reviews-and-Checkpoints). |
| **Shorts** | Shorts settings and picked clips. See [Shorts](Shorts). |
| **Subtitles** | Caption mode, font, size, position and the style preview. See [Video Editing](Video-Editing#subtitles). |
| **Images** | **Image prompts**, **More images for long videos**, the establishing image, thumbnail count, replacing provided files, and the image list. The badge shows how many images there are. |
| **Narration** | The narration chunks (only when narration is generated). |
| **Captions** | Caption text and timing. The badge shows how many captions you have loaded. |

At the bottom: **Save changes** saves a revision, **Discard changes** drops the draft. While a file is uploading the bar says "Waiting for uploads to finish…" and saving waits.

If someone (or another tab) saved the project while you were editing, the bar says "A newer revision is available. Your unsaved changes are kept below." Press **Reload current revision and discard my draft** to start from the newer one.

## Change the article text

1. Open **Edit project → Article**.
2. Edit the **Article text** (Markdown; headings become chapters).
3. Press **Save changes**.

Your edit is kept when other settings change, and saved as a new revision. The narration, images and video made from the old text turn outdated and are remade when you choose.

### Regenerate the article

**Regenerate article after review** (under the article text, when the article is generated) marks the article to be written again by the text model, one or more paid text calls. Nothing runs yet: the rebuild review lists it with the narration, images and video it outdates, and you start it there. It replaces any edits you made to the article.

## Edit narration

**Edit project → Narration** shows the narration split into the chunks it was spoken in. Only the chunks you touch are made again, paid per character, and the video is rendered again with them.

| Control | What it does |
| --- | --- |
| **Text for narration chunk N** | What the narrator says in this chunk. Editing it has the chunk spoken again by your voice provider when you remake outdated outputs. The other chunks keep their audio; captions and the video follow. It does not change the article. |
| **Replace narration chunk N** | Uses your own audio file for this chunk. |
| **Regenerate narration chunk N after review** | Speaks the chunk again with the same text and voice, for a new take when a word came out wrong. Paid per character. The current audio stays until then. **Keep narration chunk N** takes the mark off. |

When the project was narrated as one whole request (Chunking set to the whole article), the form says so: editing its text rebuilds the whole narration request.

## Edit images

**Edit project → Images** lists every image of the video in the order it is shown. Changes apply after you save.

| Control | What it does |
| --- | --- |
| **Prompt for image N** | The words this image is drawn from, with keywords in double braces filled in from the project. Editing it outdates only this image and the video; it is drawn again, one image call, when you remake. |
| **Use saved wording as template for image N** | Copies the prompt as sent into the box so you can edit it. |
| **Replace image N** | Uses your own picture in its place. |
| **Move image N earlier** / **later** | Changes the order. |
| **Delete image N** | Removes it. Deleting the last image also turns Images and Video off. |
| **Regenerate image N after review** | Draws the image again from its prompt, one paid image call, with a new result. The current image stays until the new one is made. |
| **Add generated image** | Adds a new image with an empty prompt at the end. |
| **Add provided image** | Adds your own picture at the end. |
| **Add a video clip** | Adds a clip (MP4, MOV, M4V, WebM or MKV). It plays muted in an image's place, trimmed, slowed (to half speed at most) or looped to fit. |

A project holds at most 60 images, or 240 with **More images for long videos** on.

The **Regenerate** button on an image in the project's Images section does the same thing: it opens Edit project with the change applied to the draft, and saving marks the image outdated.

### Image prompts and More images for long videos

- **Image prompts** is the same control as on Play: which Library image prompts the project uses and how many images each makes (its Number). The line under it says what saving will do. Raising a Number adds images right after that prompt's last one, lowering it drops its last ones, unticking a prompt drops its images, and a newly ticked prompt adds new images at the end. Images left as they were are kept and reused.
- **More images for long videos** sets extra images by length: **Every N minutes** or **N per hour**. Saving plans the extra images and keeps every existing one.

### Establishing image and provided files

The establishing image can be changed or made again in the Images section. When a stage uses your own file (narration or thumbnail set to Provide), **Replace provided audio** and **Replace provided thumbnail** take a new file.

## Edit captions

1. Open **Edit project → Captions**.
2. Press **Edit existing caption cues**. This works once the current narration has finished and its subtitle timing is ready.
3. Change a caption's words, or its start and end in seconds from the start of the narration.
4. Press **Apply caption edits to draft**.
5. Press **Save changes**.

**Apply caption edits to draft** checks every caption (text present, times in order, inside the narration) and puts your edits into the draft. Captions must not overlap and must end after they start; each problem is named, for example "Caption 4: enter caption text." Nothing is saved until **Save changes**, and the video is rendered again only when you remake outdated outputs. Caption edits cost nothing; only the subtitle files and the video are made again. The narration is not changed. **Discard caption edits** drops them.

If the narration changed since you edited the captions, the form says the edits belong to an earlier narration: check them against the current one, apply and save.

## Prompts

**Edit project → Prompts** shows every prompt the project used (the article, Narration Preparation, YouTube description, Shorts, Shorts image style, thumbnail, establishing image, intro, outro and each image prompt).

| Control | What it does |
| --- | --- |
| **Use saved template for ...** | Copies a prompt from your Library into this project, replacing the raw prompt. Pick it in **Choose a saved template**. |
| **Raw prompt for ...** | This project's own copy of the prompt, with keywords still in double braces such as `{{Topic}}`. Edit it to change what the model is asked, for this project only; the Library prompt is untouched. |
| **Saved rendered prompt** | The prompt as it was sent, with keywords filled in. |
| **Use the Library version for ...** | Shown when the Library prompt changed since the project copied it. Copies the new wording in. |
| **Keywords** | The keyword values, each with everything it feeds. |

The project keeps its own copy of each prompt, so later Library edits reach it only when you pick it again or press **Use the Library version**. Saving fills the keywords in again, and whatever was made from the old wording turns outdated. Nothing is remade until you choose.

**Write the description again after review** marks the YouTube description to be written again, one paid text call, when you save and continue or start the rebuild review. **Keep the current description** takes the mark off. See [YouTube Description](YouTube-Description).

## Narration options in Providers

| Control | What it does |
| --- | --- |
| **Also use pronunciations from my other projects** → **Update from other projects** | Copies your other projects' Pronunciation Glossary terms into this project again, picking up any added since the last copy. After you save, only the chunks whose words those terms change are spoken again, paid per character. |
| **Use narration aliases** → **Update from Library** | Copies Library → Aliases into this project again. A Library edit reaches the project only when you press this. After you save, only the chunks the changed aliases touch are spoken again. |
| **Describe tables and figures in the narration** | The text model writes a short spoken passage for each table, figure, equation and code block. Turning it on costs one text call per block, and after you save the chunks that contain a block are spoken again (the whole narration when Chunking is the whole article). **Leave code out** skips code blocks. |

**Show tables and figures on screen** (in **Inputs → Cuts and look**, when Describe tables and figures is on) shows each described block in the video while its description is spoken, as the article's picture or a card drawn on your computer at no cost. Turning it on or off renders the video again, and any Shorts that include a card; the narration is kept.

See [Narration Aliases and Glossary](Narration-Aliases-and-Glossary).

## Pauses and volume

**Edit project → Inputs → Pauses and volume** holds four settings. All run on your computer with no API calls.

| Option | What it does | Default / range |
| --- | --- | --- |
| **Pause between sentences (seconds)** | The least quiet after each sentence. Adds silence where the pause is shorter; never shortens one or cuts a word. About 0.25 s is brisk, 0.35 to 0.45 natural, 0.5 to 0.8 an audiobook's pace, 0.8 and up sleep content. 0 keeps the voice's own. | 0.4; 0 to 2 in steps of 0.05 |
| **Pause between paragraphs (seconds)** | The least quiet at the end of a paragraph, when you want more than between sentences. At 0 paragraphs get the sentence pause. Try 0.8 to 1.2 for a slower read. A speaker's turn gap is set under Speakers instead. | 0; 0 to 2 |
| **Level the volume** | Brings every narration piece to one loudness before they are joined, then sets the video, shorts and audio files to a finished loudness. | On for new runs (Settings → General → **Level the volume for new runs**) |
| **Video volume** | How loud the video and shorts are, in dB from the recommended level (0 dB is -14 LUFS, what YouTube and Spotify play at). -6 dB is about 50%, +4 dB about 158%. Peaks stay under -1.5 dBTP. | 0 dB; -10 to +4 dB in 0.5 dB steps |
| **Audio files volume** | How loud the WAV, MP3 and M4B are, in dB from -18 LUFS (what audiobook shops such as ACX ask for). Peaks stay under -3 dBTP. | 0 dB; -10 to +4 dB |

You can type a volume in dB or as a percentage of the recommended level.

What changing them remakes:

- **Pauses**: the narration is joined again from the pieces it already has and timed again, which remakes what is timed from it: captions, the video and, when on, the YouTube description and the shorts' pick (those two are text calls). No speech is made again.
- **Level the volume on or off**: the levelled narration is joined again and the exports rendered again. No speech is made again, and word timing, description, shorts' pick and reviews are not redone.
- **A volume only**: the exports are mastered again, nothing else.

An uploaded narration is never levelled piece by piece; only the final master reaches it. Turn Level the volume off to keep the exports at your file's own level.

## Choose what to remake

**Choose what to remake** opens the rebuild review for every outdated or failed output. Open it from the **Settings** view, **More project actions → Choose what to remake…**, or the command palette.

The review shows:

- Counts of work items: **to make**, **built on this computer**, **to confirm**, **kept as they are**, and **can't run**, plus the known cost range. CLI work reads "$0 on your plan", with what the same work would cost via API.
- **Changed inputs**: each changed input with **Before** and **After**.
- **Work items**: every item, why it is made or kept, and **View request text** for the exact request.
- **Cost by step**.

Press **Remake N outputs** to start, or **Keep things as they are** to close it with nothing spent. When the button is off, the line beside it says why, for example that an item can't run (its reasons are listed above) or that a box needs ticking:

| Tick box | When it appears |
| --- | --- |
| **Keep the provided content for ...** | An output uses a file or text you supplied, and something it depends on (such as the narration) has changed since. Tick to confirm it still fits. To use something else, close the review and replace the file in Edit project first. |
| **I understand that N cost estimates are unknown.** | Some steps use a model with no published price, so their cost is left out of the total. Tick to start anyway; the real cost is recorded under Cost once they run. |

The next action button and **Remake everything outdated** in the command palette start the remake at once when nothing needs ticking; otherwise they open this review.

## History and saved revisions

Every save of Edit project is a revision: a snapshot of the settings and content. Continuing a run always uses the current one.

When the editor is closed, the **Settings** view shows **Saved revision** with each output's state: **Ready**, **Outdated; the retained version stays until it is remade**, **Provided content needs review**, or **Retained file missing**.

### Look at or restore an earlier revision

1. Open **History** in the section rail.
2. Pick a revision from **Project history** (the current one is marked **Current**).
3. Each output is listed with its state and **Download**, **Open folder**, and **Preview retained output**. Earlier results are marked **Earlier result**. **Download all images** zips that revision's images. Retained narration and text parts can be opened too.
4. Press **Restore this revision** to make it current again.

Restoring adds a new revision with the old settings and outputs, so nothing after it is lost. A restored revision takes its channel back.

## Save as template

**More project actions → Save as template…** saves this project's settings as a template for Play and Schedules. Keywords the title names are saved empty; other keyword values are kept. See [Templates](Templates).

## Tips

- Several edits can go into one save. Make them all, save once, then review the remake.
- A rejected save lists each problem next to its field; fix those and save again.
- To redo a whole stage from scratch rather than one piece, use the section's own More menu on the project page (see [Project Page](Project-Page#re-run-a-whole-stage)).

## Related pages

- [Project Page](Project-Page)
- [Video Editing](Video-Editing)
- [Recovery and Retries](Recovery-and-Retries)
- [Prompts](Prompts)
- [Narration Aliases and Glossary](Narration-Aliases-and-Glossary)
- [Costs and Run Cost](Costs-and-Run-Cost)
