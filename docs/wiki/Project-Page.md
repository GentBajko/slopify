# Project Page

Every run you start gets a project page. It shows each stage as it is made, tells you the one thing the project needs next, and holds the finished files, the settings, the history and the cost.

**Where to find it:** Home or Projects → click a project. Pressing **Start run** on Play also opens it.

## How the page is laid out

The page has four parts:

| Part | What it holds |
| --- | --- |
| Title row | **Projects** (the way back), the project title, one line with the article prompt's name, the format and when it started, the status, **Make the next chapter** on a finished audiobook that is a chapter of a book, **Edit settings** and the **More project actions** menu (the three dots). |
| Run cost line | Once the run has ended, one line under the title sums it up (see [The run cost line](#the-run-cost-line)). |
| Section rail (left) | One entry per part of the project, with a coloured lamp for its state. Below a line: **Settings**, **Checkpoints** and **History**. On a phone the rail becomes a row of tabs. |
| Main column | The section you picked. |
| Right rail | The next action panel, **Free space** on a finished project (see [Free space](#free-space)), then **Run steps** with each step's time and time left, the cost so far and the batch queue count (**Queue · N**). On narrow windows (under about 1180 px wide) only the next action panel and Free space are shown. |

The page opens where the next action points: the failed step, the held review or the outdated images. When nothing needs you, it opens on the stage the run is at. A finished video whose YouTube description is written opens on the **YouTube** section, so **Copy** (the description) is one press away.

### The run cost line

When a run has ended (done, done with problems, failed or canceled), a line under the title sums it up, for example `This run cost $0.42 · ~$3.10 via API · 12 min of work`: only the time Slopify was working, never the time waiting on you, a review or a limit. A run that ended early says **Spent so far** instead, and calls without a known price add "plus unpriced calls". **See cost by stage** opens the **Cost** section. The line is hidden while the run is going and when it spent nothing. While the run is going, a clock sits there instead: `Working for 9 min 30 s`, ticking while a step runs; while it is paused or waits on you it holds still and reads `9 min 30 s of work so far`. See [Costs and Run Cost](Costs-and-Run-Cost).

### Time left

While a step runs, its line in **Run steps** (and on Home's Running now) ends with its time left, for example `12 of 40 chunks · about 4 min left`. Slopify works it out from the step's own pace once it has counted something, otherwise from how long the same kind of step took in your finished runs (on the same provider and model when there are enough of those). Past that time it says **taking longer than usual**; with nothing to go by, **time left unknown**. Near the end it reads **finishing up** or **under a minute left**.

### Project status

The status beside the title reads one of:

| Status | Meaning |
| --- | --- |
| **Queued** | Waiting for its turn behind other videos in the batch queue. |
| **Running** | A stage is being made. |
| **Paused** | You paused it. Everything made so far is kept. |
| **Done** | Every stage finished. |
| **Done with problems** | The main output was made (the video, or the narration when there is no video, or the article when there is neither), but another step failed. Each failed step shows its error and its fix. |
| **Failed** | A step failed and the main output was not made. |
| **Canceled** | You canceled the run. Finished outputs are kept. |

## The next action button

The right rail always shows at most one button, named for what it will do. It is the same action the command palette (`Ctrl+K`) offers as the first entry under **This project**, and it is repeated inside the section it concerns.

| Situation | Status line | Button |
| --- | --- | --- |
| The bundled sample project | Sample project | **Make my own copy** (the sample is read-only; your copy can be edited and made again) |
| Paused | Paused | **Continue the run** |
| A step failed and will not retry by itself | Failed | The step's fix-it button (for example **Copy sign-in command** with **Check again**, **Soften and retry**, **Edit the prompt**, **Switch model**), or **Try the article again**, **Try images again** and so on. See [Recovery and Retries](Recovery-and-Retries#fix-it-buttons). |
| A checkpoint is holding the run | Waiting for you | **Approve and record the narration**, **Approve and make the images**, **Approve and render the video**, or **Approve the ...** when nothing waits on it |
| A CLI plan limit is used up | Waiting for limits | No button. The line says, for example, "Waiting for Codex limits (resets at 14:00)." and that the run carries on by itself. |
| A step is waiting to retry | Waiting to try again | No button. The line says the time it tries again. |
| Running | Running | **Pause** |
| Stopped before it finished (for example after a restart) or canceled | Stopped / Canceled | **Continue the run** (makes only what is missing) |
| Queued | Queued | No button. Videos queued together run one at a time, in the order they were added; this one starts by itself when those ahead of it are done, and Home shows which one is running now. |
| An edit made outputs outdated | Outdated | **Remake the outdated narration**, **Remake 4 outdated images** and so on |
| A 60-second short is finished | Done | **Make the full video on this topic** (opens Play set up for a long video on the same topic; see [Your First Short](Your-First-Short#make-the-full-video-next)) |
| The video is finished | Done | **Prepare upload** |

`Shift+N` runs the next action from anywhere on the page.

When a step fails, **Error details** under the message shows the step's own words.

## Pause, continue and cancel a run

### Pause a run

1. Open the project while it is running.
2. Press **Pause** in the right rail (or pick **Pause the run** in the command palette).
3. The call in progress finishes, then nothing new starts. Everything made so far is kept.

A step that is waiting to retry or waiting for a CLI limit also stays held while the project is paused.

### Continue a paused or stopped run

1. Press **Continue the run** in the right rail (or **Continue the run** in the command palette).
2. Slopify makes only what is missing; finished work is reused.

### Cancel a run

1. Open **More project actions** (the three dots beside the title).
2. Choose **Cancel the run…**.
3. Confirm with **Cancel run**, or press **Keep running** to leave it alone.

Canceling stops every running stage; finished outputs are kept. You can continue a canceled run later with **Continue the run**. A project has to be canceled (not running) before you can delete it from Projects.

## The sections

Sections appear only when the run uses them. A section with outdated outputs shows how many beside its name, for example "3 outdated".

| Section | What it shows |
| --- | --- |
| **Outputs** | Every output the project makes (article, narration or audiobook/podcast, images, thumbnails, video, shorts, PDF), each with a preview, its state in words (Current, Uses older material, In progress, Failed), which version of its source it was made from, its main download and **Other formats**. **Add another output** turns the project into narration, an audiobook, images, a video, a PDF or a podcast: it shows what is reused, what is made and the extra cost before saving, and only the new work runs. A podcast made from an article (**Adapt my article into a conversation**) keeps the article as written. |
| **Article** | The article in a reading view, with tabs for **Research** notes, **Sources**, **Speakers** (multi-voice scripts) and **Pronunciation** when those exist. **Copy** copies the open tab as Markdown. |
| **Narration** | A player for the intro, body and outro, the downloads, and the voice and chunking used. The text plays along: press a line to play from there, and the pencil beside it opens Edit project → Narration at that passage. Podcasts and interviews show the conversation turn by turn with speaker names. |
| **Images** | The establishing image (a reference that is not in the video), every slideshow image in order, on-screen cards for tables and figures, and the thumbnails. Press an image to see it full size (see [Images at full size](#images-at-full-size)). |
| **Video** (or **Audio export** when Video is off) | The player, downloads, the file length and format, and what the loudness master measured. |
| **Shorts** | The vertical clips picked from the video, each with its title and hashtags. See [Shorts](Shorts). |
| **YouTube** | The description, chapters, hashtags and tags as they go into YouTube Studio, **Copy** (the description, `Shift+D`), **Copy tags** and **Prepare upload**. See [YouTube Description](YouTube-Description) and [Publishing to YouTube](Publishing-to-YouTube). |
| **PDF** | The rendered document and **Download PDF**. See [PDF Documents](PDF-Documents). |
| **Cost** | The run cost by stage and by model. See [Costs and Run Cost](Costs-and-Run-Cost). |
| **Live** | The run as it is made. See below. |
| **Settings** | The project's settings, opened straight into the **Edit project** form. See [Editing a Project](Editing-a-Project). |
| **Checkpoints** | The review checkpoints for this revision. See below. |
| **History** | Every saved revision and its files. See [Editing a Project](Editing-a-Project#history-and-saved-revisions). |

A section for a stage that is switched off says "*Article* is off for this run." A section still waiting says it starts when the steps before it are done.

### Re-run a whole stage

Each stage section's head has a button for making that whole stage again, named for what it makes:

| Button | What it does |
| --- | --- |
| **Research again** | Fresh research, then the affected article, narration, thumbnail and exports. |
| **Write the article again** | A fresh article, then the affected narration, thumbnail and exports. |
| **Record the narration again** | New narration and the affected exports. |
| **Make all images again** | New generated images and the affected video; supplied images and narration are kept. |
| **Make the thumbnails again** | New thumbnails; the video is not changed. |
| **Render the video again** / **Export the audio again** | Rebuilds the exports from saved media, with no new narration or images. |
| **Render the PDF again** | Renders the PDF from the saved article and title. |

Each asks first; confirm with the same label or press **Keep what is there**. Previous outputs stay in History. These actions are off while the project is running.

### The reading view

The article, research notes and narration script are shown in a reading view:

- **Contents**: a list of the headings; click one to jump to it.
- **Search the article** (or research, or narration script): every match is marked. Press `Enter` for the next match, `Shift+Enter` for the previous, or use the **Previous match** and **Next match** arrows.
- **Copy section** beside each heading copies that section as Markdown.
- **Copy all** copies the whole text as Markdown.

If the browser blocks clipboard access, select the text and press `Ctrl+C`.

### Downloads

Every stage puts its files the same way, in one row of buttons apart from its text: one lime **Download** (a menu when the stage has several files, a plain button when it has one), the stage's one **Open folder**, then anything else the stage does (such as **Copy**). Lengths, formats and what a file measured sit on their own line under the buttons.

| Where | What the Download holds |
| --- | --- |
| Article | **Article (.md)**, **Sources**, **Pronunciation glossary** and **Research notes**, as far as the run made them. Beside it: **Copy** for the open tab and **Show instructions**. |
| Narration | For intro, body and outro: the recording (**Body narration**), the **clean narration** (the spoken text used for captions) and the **TTS script** (with delivery cues; blank lines separate requests). Uploaded audio has no TTS script. |
| Images | **Download all** (a zip of the images). Each image and thumbnail also has its own Download at full size. |
| Video | **Video (.mp4)** or **Audio (.wav)**, **Subtitles (.srt)**, **Subtitles (.vtt)**, **YouTube description (.txt)**, **YouTube tags (.txt)**, **Audio with chapters (.mp3)**, **Audiobook with chapters (.m4b)** and each **Short N (.mp4)**, as far as the run made them. |
| Shorts | Every short's MP4 (**Download the short** when there is one). See [Shorts](Shorts#see-copy-and-download-your-shorts). |
| PDF | **Download PDF**. |
| History | Any saved revision's files, one **Open folder** per version, and **Download all images** for that revision. |

The YouTube description and tags downloads are the text exactly as the page shows it: your hand edits, the fitted chapters and the filled channel links.

**Open folder** opens the stage's folder on the computer running Slopify. In Docker without the host helper, it shows the path to copy into your file manager instead. See [Where Your Files Live](Where-Your-Files-Live).

### The players

Videos and audio play in Slopify's own player, not the browser's.

- **Video:** the poster (the first thumbnail for the finished video, the first still for a short) with a big play key, then a bar with play, the time, a lime track you can click or drag (it shows what has loaded, a time tip and the YouTube chapter marks), volume, speed from 0.75× to 2×, captions, picture in picture and full screen. The bar hides while the video plays. In a narrow space it drops picture in picture, then volume, speed and the total time, keeping play, seek, captions and full screen on one row.
- **Audio** (narration, intros and outros, the audio export, podcasts and audiobooks, live previews, parts in History): the same bar on its own, with the chapter or segment marks on the track.

Click the player first, then use YouTube's keys: `Space` or `K` plays and pauses, `J` and `L` jump 10 seconds back or forward, `Left` and `Right` 5 seconds, `M` mutes, `F` goes full screen and `C` turns captions on or off (video only), and `0` to `9` jump to that tenth of the way through.

### Images at full size

Press any image, thumbnail or cast picture to open it full size. `Left` and `Right` (or **Previous** and **Next**) move between them; `Esc` or **Close** closes it. At full size, images and thumbnails keep **Regenerate** (it asks first: **Regenerate it** or **Keep it**) and **Download**.

### Live

**Live** shows the run while it is made:

- **Steps**: each stage and its state.
- **Article**: the text as the model writes it.
- **Narration**: a waveform that grows as each part is spoken, with "Narration so far: N seconds". A live player, **Listen while it generates**, plays the audio as it arrives.
- **Images so far**: each image as it is drawn.

**Live writing** also appears in a running stage's own section. When a stage makes several calls, a list picks which one to watch. **Follow output** keeps the newest text in view; untick it to read back. Watching costs nothing extra, and the full text is saved when the stage finishes.

### Checkpoints

**Checkpoints** lists the review checkpoints of the current revision and what depends on each. When one is holding the run, approve it here or with the next action button (**Approve ... checkpoint**).

**Checkpoint choices** lets you change which steps hold:

1. Open **Checkpoints** in the section rail.
2. Under **Checkpoint choices**, tick a step that has not started to add a checkpoint before it, or untick one to remove it. Work already admitted for an unticked step carries on when ready.
3. Press **Save checkpoints**.

Only generated steps can have a checkpoint. Pausing the project still applies on top. If the project was edited elsewhere, press **Reload checkpoint choices** and make your change again. More in [Reviews and Checkpoints](Reviews-and-Checkpoints).

## Free space

A finished project can drop the working files it was made from (images, narration parts, subtitle timing, render settings) and keep what gets published: the video, shorts, thumbnail, article, description, document and anything you uploaded. In the right rail, **Free space** shows the size of both, for example "Outputs 1.4 GB · working files 1.2 GB", with the button **Free 1.2 GB: keep the outputs, drop the working files**.

1. Press the button.
2. Read what goes, then confirm with **Free 1.2 GB**, or press **Keep the working files**.

Changing the project later makes those files again first, which takes time and provider credits. The offer is hidden on the bundled samples, while the project runs or waits, and when nothing is left to drop. Settings → **Backup & storage** offers the same for every project (**Keep outputs only**). See [Where Your Files Live](Where-Your-Files-Live).

## More project actions

The three dots beside the title hold:

| Action | What it does |
| --- | --- |
| **Choose what to remake…** | Opens the rebuild review for every outdated or failed output. See [Editing a Project](Editing-a-Project#choose-what-to-remake). |
| **Save as template…** | Saves this project's settings as a template (not for the sample). See [Templates](Templates). |
| **Cancel the run…** | Stops the run (only while it is running). |

## Command palette

Press `Ctrl+K` on a project page. Under **This project** you get: the next action (`Shift+N`), **Pause the run** or **Continue the run**, **Prepare upload**, **Edit project settings**, **Choose what to remake**, **Save as template**, **Cancel the run**, the first outdated group (for example **Remake 4 outdated images**), **Remake everything outdated**, **Make my own copy** (sample only), **Copy description** (`Shift+D`) and **Regenerate image N** for every image, including the ones behind **Show all**. Type the number with it, for example `regenerate image 12`; it asks first, as the Regenerate button does. See [Keyboard Shortcuts and Command Palette](Keyboard-Shortcuts-and-Command-Palette).

## Tips

- The sample projects are read-only. Press **Make my own copy** to change one.
- A failed thumbnail does not stop the video or the PDF: a failed step only stops the steps that need its output. The PDF is then laid out without a cover; make the thumbnail again later and the PDF is marked outdated, ready to remake with it.
- You can close the browser tab while a run is going. The run continues on the computer running Slopify.

## Related pages

- [Editing a Project](Editing-a-Project)
- [Video Editing](Video-Editing)
- [Recovery and Retries](Recovery-and-Retries)
- [Reviews and Checkpoints](Reviews-and-Checkpoints)
- [Costs and Run Cost](Costs-and-Run-Cost)
- [Publishing to YouTube](Publishing-to-YouTube)
- [Home and Projects](Home-and-Projects)
