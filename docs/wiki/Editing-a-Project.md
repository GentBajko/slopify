# Editing a Project

You can change almost anything about a project after it has run: the article, one narration chunk, one image, the prompts, the services and models, the captions or the volume. Slopify saves each change as a new version and makes again only what the change affects, after you have seen what that costs.

**Where to find it:** a project → **Edit settings** in the title row. It opens the project's settings in the main column, with two tabs: **Settings** and **Versions**. Press **Edit settings** again to close them.

## How editing works

1. **Edit.** Change settings or content under **Settings**. Nothing runs while you edit.
2. **Save.** **Save changes** keeps a new version. Saving never starts work: the line beside the button says "Saved as a new version. Nothing is made again until you choose to." What the change affects turns **outdated** and keeps its current version until it is made again.
3. **Make it again.** The title row's next action offers the first group of outdated files, for example **Make the outdated narration again** or **Make the 4 outdated images again**. Press it, or open **Choose what to make again** to see the full list, the cost and what is kept.

Making one group again can make the next group outdated in turn (new narration outdates the video); the next action then names that group.

## The sections

The settings have their own list of sections on the left, named and ordered as Create's rows and Edit template's sections are. A section appears only when the project can use it.

| Section | What you change there |
| --- | --- |
| **Title and keywords** | The **Project title**, **Refresh keyword facts** and every keyword with what it feeds. |
| **Article** | Where the research and the article come from, **Written by** (service, model, thinking), the article prompt and the **Article text** itself, with **Write the article again after review**. Shows "edited" once you changed the text. |
| **Narration** | Where the narration comes from, **Read by** (service, model, voice), **Split the narration by**, pronunciation, narration aliases, tables and figures, **Speakers**, narration preparation, the **Intro and outro** and the narration chunks. |
| **Images** | Where the images come from, **Images by** (service, model), **Image prompts**, **More images for long videos**, **Scenes from the article**, the establishing image and the image list. The badge shows how many images there are. |
| **Video and style** | Video on or off, the frame format, **Images and cuts** (seconds per image, zoom, motion, cuts, the Look) and **Sound polish** (silences, pauses, volume and ambient sound). See [Video Editing](Video-Editing). |
| **Captions** | The captions' mode, font, size and position with the style preview, and the captions' own words and timing. The badge shows how many captions you have loaded. |
| **Extras** | The thumbnail (how it is made, one or three, its files), the YouTube description, **Shorts**, the PDF and its **PDF look**, and the prompts they use. |
| **Pauses and checks** | The pauses for this run and the AI checks. See [Pauses and checks](Reviews-and-Checkpoints). |
| **Channel** | The project's channel, **Use the channel's brand kit** and the language. |

At the bottom: **Save changes** keeps a new version, **Discard changes** drops what you changed (with **Undo** for a moment after). **Save changes** is lit only once something changed. While a file uploads the bar says "Waiting for uploads to finish…" and saving waits.

If someone (or another tab) saved the project while you were editing, the bar says "A newer version is available. Your unsaved changes are kept below and in this browser." Press **Reload latest and re-apply my edit** to lay your changes over the newer version (check them, then press **Save changes**), or **Copy my edit** to keep a copy on the clipboard first.

The bundled sample's settings can be read, section by section, but not changed. Press **Make my own copy** first.

## Change the article text

1. Open **Edit settings** → **Article**.
2. Edit the **Article text** (Markdown; headings become chapters).
3. Press **Save changes**.

Your edit is kept when other settings change. The narration, images and video made from the old text turn outdated and are made again when you choose.

**Write the article again after review** (under the article text, when the AI writes the article) marks the article to be written again: paid writing calls, with their cost shown first. Nothing runs yet: **Choose what to make again** lists it with the narration, images and video it outdates, and you start it there. It replaces your edits to the article.

## Edit narration

To fix one line, you don't need the settings: on the project page, press the line in **Narration**, then **Fix this line**, correct the words or leave them, and press **Make this passage again**.

**Edit settings** → **Narration** ends with the narration split into the chunks it was spoken in. Only the chunks you touch are made again, paid per character, and the video is put together again with them.

| Control | What it does |
| --- | --- |
| **Text for narration chunk N** | What the narrator says in this chunk. Editing it has the chunk spoken again by your voice service once you make the outdated narration again. The other chunks keep their audio; captions and the video follow. It does not change the article. |
| **Replace narration chunk N** | Uses your own audio file for this chunk. |
| **Make narration chunk N again · voice call** | Speaks the chunk again with the same text and voice, for a new take when a word came out wrong. Paid per character. The current audio stays until then. **Keep narration chunk N** takes the mark off. |

When the narration was spoken as one whole request, the section says so: editing its text makes the whole narration again. When the narration is your own file, **Replace provided narration** takes a new one.

### Narration options

| Control | What it does |
| --- | --- |
| **Also use pronunciations from my other projects** → **Update from other projects** | Copies your other projects' Pronunciation Glossary terms into this project again, picking up any added since the last copy. After you save, only the chunks whose words those terms change are spoken again, paid per character. |
| **Use narration aliases** → **Copy the list again** | Copies your Pronunciation list (Settings → Voices → **Pronunciation**) into this project again. A change to the list reaches the project only when you press this. After you save, only the chunks the changed aliases touch are spoken again. |
| **Describe tables and figures in the narration** | The AI writes a short spoken passage for each table, figure, equation and code block. Turning it on costs one AI call per block, and after you save the chunks that contain a block are spoken again (the whole narration when it is spoken as one request). **Leave code out** skips code blocks. |

**Show tables and figures on screen** (in **Video and style** → **Images and cuts**, when Describe tables and figures is on) shows each described block in the video while its description is spoken, as the article's picture or a card drawn on your computer at no cost. Turning it on or off puts the video together again, and any shorts that include a card; the narration is kept.

See [Narration Aliases and Glossary](Narration-Aliases-and-Glossary).

## Edit images

**Edit settings** → **Images** ends with every image of the video in the order it is shown. Changes apply after you save.

| Control | What it does |
| --- | --- |
| **Prompt for image N** | The words this image is drawn from, with keywords in double braces filled in from the project. Editing it outdates only this image and the video; it is drawn again, one image call, when you make it again. |
| **Use saved wording as template for image N** | Copies the prompt as it was sent into the box so you can edit it. |
| **Replace image N** | Uses your own picture or clip in its place. |
| **Move image N earlier** / **later** | Changes the order. |
| **Delete image N** | Removes it, with **Undo**. Deleting the last image also turns Images and Video off. |
| **Make image N again · 1 image call** | Marks the image to be drawn again from its prompt, with a new result. **Keep image N** takes the mark off. The current image stays until the new one is made. |
| **Add generated image** | Adds a new image with an empty prompt at the end. |
| **Add provided image** | Adds your own picture at the end. |
| **Add a video clip** | Adds a clip (MP4, MOV, M4V, WebM or MKV). It plays muted in an image's place, trimmed, slowed (to half speed at most) or looped to fit. |

A project holds at most 60 images, or 240 with **More images for long videos** on.

On the project page itself, **Make this image again** under an image and **Make all 4 images again** in the Images heading do it without the settings: they ask once, then make the new images straight away. The video keeps the old images, marked outdated, until you make it again, so you can make several images again and put the video together once. If the settings have unsaved changes of their own, the images are marked there instead, to go with them when you save.

### Image prompts and More images for long videos

- **Image prompts** is the same control as on Create: which of your image prompts the project uses and how many images each makes. The line under it says what saving will do. Raising a number adds images right after that prompt's last one, lowering it drops its last ones, unticking a prompt drops its images, and a newly ticked prompt adds new images at the end. Images left as they were are kept and reused.
- **More images for long videos** sets extra images by length: **Every N minutes** or **N per hour**. Saving plans the extra images and keeps every existing one.

### Establishing image and your own files

The establishing image can be changed or made again in the Images section. When the thumbnail is your own file, **Replace provided thumbnail** in **Extras** takes a new one.

## Edit captions

1. Open **Edit settings** → **Captions**.
2. Press **Edit existing caption cues**. This works once the current narration has finished and its caption timing is ready.
3. Change a caption's words, or its start and end in seconds from the start of the narration. **Play** beside a caption plays that stretch of the narration.
4. Press **Apply caption edits to draft**.
5. Press **Save changes**.

**Apply caption edits to draft** checks every caption (text present, times in order, inside the narration) and puts your edits into the draft. Captions must not overlap and must end after they start; each problem is named, for example "Caption 4: enter caption text." Nothing is saved until **Save changes**, and the video is put together again only when you make the outdated files again. Caption edits cost nothing; only the caption files and the video are made again. The narration is not changed. **Discard caption edits** drops them.

If the narration changed since you edited the captions, the section says the edits belong to an earlier narration: check them against the current one, apply and save.

## Prompts

Each prompt the project used sits in the section of the stage it writes for: the article prompt under **Article**; narration preparation, the intro and the outro under **Narration**; the establishing image and each image prompt under **Images**; the thumbnail, YouTube description, shorts and shorts image style under **Extras**; the checks' prompts under **Pauses and checks**.

| Control | What it does |
| --- | --- |
| **Use a saved prompt for …** | Copies one of your prompts (from **Prompts**) into this project, replacing its own copy, with **Undo**. |
| **Raw prompt for …** | This project's own copy of the prompt, with keywords still in double braces such as `{{Topic}}`. Edit it to change what the model is asked, for this project only; the prompt in Prompts is untouched. |
| **Saved rendered prompt** | The prompt as it was sent, with keywords filled in. |
| **Use the new wording** / **Keep this project's version** | Shown when the prompt in Prompts changed since the project copied it. Use the new wording copies it in. |

The project keeps its own copy of each prompt, so later edits in Prompts reach it only when you pick it again or press **Use the new wording**. Saving fills the keywords in again, and whatever was made from the old wording turns outdated. Nothing is made again until you choose.

**Write the description again after review** (in **Extras**) marks the YouTube description to be written again, one paid AI call, when you make the outdated files again. **Keep the current description** takes the mark off. See [YouTube Description](YouTube-Description).

## Pauses and volume

**Edit settings** → **Video and style** → **Sound polish** holds these settings. All run on your computer with no service calls.

| Option | What it does | Default / range |
| --- | --- | --- |
| **Silence gap (seconds)** | Quiet between the intro and the narration, and between the narration and the outro. Only matters when an intro or outro is set. | Settings value (3 s unless changed); 0 to 30 |
| **Silence at start and end (seconds)** | Quiet before the narration starts and after it ends. | 2; 0 to 30 |
| **Pause between sentences (seconds)** | The least quiet after each sentence. Adds silence where the pause is shorter; never shortens one or cuts a word. About 0.25 s is brisk, 0.35 to 0.45 natural, 0.5 to 0.8 an audiobook's pace, 0.8 and up sleep content. 0 keeps the voice's own. | 0.4; 0 to 2 in steps of 0.05 |
| **Pause between paragraphs (seconds)** | The least quiet at the end of a paragraph, when you want more than between sentences. At 0 paragraphs get the sentence pause. Try 0.8 to 1.2 for a slower read. A speaker's turn gap is set under Speakers instead. | 0; 0 to 2 |
| **Soften breaths** | Turns the audible in-breaths a voice takes between sentences and after commas down by 12 dB, with soft fades (Inworld's TTS-2 takes a loud one almost every time). A breath with any word sound in it is left alone; words, pauses and captions stay where they were. | Off |
| **Soften S sounds** | Takes the sharp edge off s and sh sounds with a very light de-esser; the voice keeps its brightness. Works with or without Soften breaths. | Off |
| **Level each sentence** | Holds every sentence to the sentences in the minute around it, so no line jumps out or drops away: a loud one comes down by up to 6 dB, a quiet one up by up to 3 dB, and the volume only changes in the pauses. Runs before Soften breaths and Soften S sounds. Needs Level the volume; one voice only. Pairs well with a Video volume of −2 dB, which gives the final limiter more room. | Off |
| **Level the volume** | Brings every narration piece to one loudness before they are joined, then sets the video, shorts and audio files to a finished loudness. | On for new runs (Settings → Production defaults → **Level the volume for new runs**) |
| **Video volume** | How loud the video and shorts are, in dB from the recommended level (0 dB is -14 LUFS, what YouTube and Spotify play at). -6 dB is about 50%, +4 dB about 158%. Peaks stay under -1.5 dBTP. | 0 dB; -10 to +4 dB in 0.5 dB steps |
| **Audio files volume** | How loud the WAV, MP3 and M4B are, in dB from -18 LUFS (what audiobook shops such as ACX ask for). Peaks stay under -3 dBTP. | 0 dB; -10 to +4 dB |

You can type a volume in dB or as a percentage of the recommended level. **Ambient sound** is in the same fold; see [Video Editing](Video-Editing#ambient-sound).

What changing them makes again:

- **Pauses, Soften breaths, Soften S sounds or Level each sentence**: the narration is joined again from the pieces it already has and timed again, which makes again what is timed from it: captions, the video and, when on, the YouTube description and the shorts' pick (those two are AI calls). No speech is made again.
- **Level the volume on or off**: the levelled narration is joined again and the video and audio files are put together again. No speech is made again, and word timing, description, shorts' pick and checks are not redone.
- **A volume only**: the video and audio files are mastered again, nothing else.

An uploaded narration is never levelled piece by piece; only the final master reaches it. Turn Level the volume off to keep the files at your recording's own level.

## Choose what to make again

**Choose what to make again** opens the review of every outdated or failed file. Open it from **More** → **Choose what to make again…** in the title row (only when files are outdated), from the **Settings** tab after you discarded a draft, or from the command palette.

The review shows:

- What it does, in words: what is made again (and whether it is charged or on your plan), what is then put together on this computer for free, and what stays as it is.
- Counts of work items: **to make**, **built on this computer**, **to confirm**, **kept as they are** and **can't run**, plus the known cost. Work on a Claude Code or Codex plan reads "$0 on your plan", with what the same work would cost through the API.
- **Changed inputs**: each changed input with **Before** and **After**.
- **Work items**: every item, why it is made or kept, and **View request text** for the exact request.
- **Cost by step**.

Press **Make 3 outputs again** (the button counts them) to start, or **Keep things as they are** to close it with nothing spent. When the button is off, the line beside it says why, for example that an item can't run (its reasons are listed above) or that a box needs ticking:

| Tick box | When it appears |
| --- | --- |
| **Keep the provided content for …** | A file uses something you supplied, and something it depends on (such as the narration) has changed since. Tick to confirm it still fits. To use something else, close the review and replace the file in Edit settings first. |
| **I understand that N cost estimates are unknown.** | Some steps use a model with no published price, so their cost is left out of the total. Tick to start anyway; the real cost is recorded under the project's cost line once they run. |

The next action button and the outdated groups in the command palette start at once when nothing needs ticking; otherwise they open this review.

## Versions

Every save is a version: a snapshot of the settings and content. Continuing a run always uses the current one.

**Edit settings** → **Versions** lists every version, newest first, as **Version N** with its title, when it was saved, **by agent** or **by assistant** when one of them saved it, and **Current** on the one in use. With only one version, one line says when it was saved instead.

1. Press **Show its files** on a version to see what it made: **Download all images** (or **Download this version's images**), one **Open folder**, then each file with its state, its download and a preview. Files the current version no longer uses read **Earlier result**. Kept narration parts play in Slopify's own audio player, and text parts can be opened too.
2. Press **Restore** on an older version. A dialog says what it does: the settings go back to that version's, saved as a new version; the current ones stay in the list. Confirm with **Restore version N**, or **Keep the current settings**.

Restoring never makes anything again until you choose to. A restored version takes its channel back. When agents or the assistant changed the project, **Done by agents** (or **Done by the assistant**) lists what they did and when.

Under the list: **Free space** on a finished project (see [Project Page](Project-Page#free-space)) and the **Project ID** with **Copy project ID**.

## Save as template

**More** → **Save as template…** in the title row saves this project's settings as a template for Create and Schedules. Keywords the title names are saved empty; other keyword values are kept. The project itself stays as it is. See [Templates](Templates).

## Tips

- Several edits can go into one save. Make them all, save once, then choose what to make again.
- A refused save lists each problem next to its field; fix those and save again.
- To make a whole part again rather than one piece, use the button in its heading on the project page (see [Project Page](Project-Page#make-a-whole-part-again)).

## Related pages

- [Project Page](Project-Page)
- [Video Editing](Video-Editing)
- [Recovery and Retries](Recovery-and-Retries)
- [Prompts](Prompts)
- [Narration Aliases and Glossary](Narration-Aliases-and-Glossary)
- [Costs and Run Cost](Costs-and-Run-Cost)
