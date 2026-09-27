# Project Page

Every run you start gets a project page. It shows each stage as it is made, tells you the one thing the project needs next, and holds the finished files, the settings, the history and the cost.

**Where to find it:** Home or Projects → click a project. Pressing **Start run** on Play also opens it.

## How the page is laid out

The page has four parts:

| Part | What it holds |
| --- | --- |
| Title row | **Projects** (the way back), the project title, one line with the article prompt's name, the format and when it started, the status, **Edit settings** and the **More project actions** menu (the three dots). |
| Section rail (left) | One entry per part of the project, with a coloured lamp for its state. Below a line: **Settings**, **Checkpoints** and **History**. On a phone the rail becomes a row of tabs. |
| Main column | The section you picked. |
| Right rail | The next action panel, then **Run steps**, the cost so far and the batch queue count. On narrow windows (under about 1180 px wide) only the next action panel is shown. |

The page opens where the next action points: the failed step, the held review or the outdated images. When nothing needs you, it opens on the stage the run is at.

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
| **Canceled** | You cancelled the run. Finished outputs are kept. |

## The next action button

The right rail always shows at most one button, named for what it will do. It is the same action the command palette (`Ctrl+K`) offers as the first entry under **This project**, and it is repeated inside the section it concerns.

| Situation | Status line | Button |
| --- | --- | --- |
| The bundled sample project | Sample project | **Make my own copy** (the sample is read-only; your copy can be edited and made again) |
| Paused | Paused | **Continue the run** |
| A step failed and will not retry by itself | Failed | The step's fix-it button, or **Try the article again**, **Try images again** and so on. See [Recovery and Retries](Recovery-and-Retries#fix-it-buttons). |
| A checkpoint is holding the run | Waiting for you | **Approve and record the narration**, **Approve and make the images**, **Approve and render the video**, or **Approve the ...** when nothing waits on it |
| A CLI plan limit is used up | Waiting for limits | No button. The line says when the limit resets and that the run carries on by itself. |
| A step is waiting to retry | Waiting to try again | No button. The line says the time it tries again. |
| Running | Running | **Pause** |
| Stopped before it finished (for example after a restart) or cancelled | Stopped / Canceled | **Continue the run** (makes only what is missing) |
| Queued | Queued | No button. It starts when the videos ahead of it are done. |
| An edit made outputs outdated | Outdated | **Remake the outdated narration**, **Remake 4 outdated images** and so on |
| The video is finished | Done | **Prepare upload** |

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

Cancelling stops every running stage; finished outputs are kept. You can continue a cancelled run later with **Continue the run**. A project has to be cancelled (not running) before you can delete it from Projects.

## The sections

Sections appear only when the run uses them. A section with outdated outputs shows how many beside its name, for example "3 outdated".

| Section | What it shows |
| --- | --- |
| **Article** | The article in a reading view, with tabs for **Research** notes, **Sources**, **Speakers** (multi-voice scripts) and **Pronunciation** when those exist. **Copy** copies the open tab as Markdown. |
| **Narration** | The voice and chunking used, a player for the intro, body and outro, and text downloads. |
| **Images** | The establishing image (a reference that is not in the video), every slideshow image in order, on-screen cards for tables and figures, and the thumbnails. |
| **Video** (or **Audio export** when Video is off) | The player, downloads, the file length and format, and what the loudness master measured. |
| **Shorts** | The vertical clips picked from the video, each with its title and hashtags. See [Shorts](Shorts). |
| **YouTube** | The description, chapters, hashtags and tags as they go into YouTube Studio, and **Prepare upload**. See [YouTube Description](YouTube-Description) and [Publishing to YouTube](Publishing-to-YouTube). |
| **PDF** | The rendered document and **Download PDF**. See [PDF Documents](PDF-Documents). |
| **Cost** | The run cost by stage and by model. See [Costs and Run Cost](Costs-and-Run-Cost). |
| **Live** | The run as it is made. See below. |
| **Settings** | The project's settings, opened straight into the **Edit project** form. See [Editing a Project](Editing-a-Project). |
| **Checkpoints** | The review checkpoints for this revision. See below. |
| **History** | Every saved revision and its files. See [Editing a Project](Editing-a-Project#history-and-saved-revisions). |

A section for a stage that is switched off says "*Article* is off for this run." A section still waiting says it starts when the steps before it are done.

### Re-run a whole stage

Each stage section has its own **More actions for ...** menu (the three dots in the section head) with the rare, whole-stage actions:

| Menu item | What it does |
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

| Where | What you can download |
| --- | --- |
| Article | The article Markdown, **Sources**, **Glossary**, research notes, and each stage's instructions (**Show instructions**). |
| Narration | For intro, body and outro: **Clean Narration** (the spoken text used for captions) and **TTS Script** (with delivery cues; blank lines separate requests). Uploaded audio has no TTS Script. |
| Images | Each image (**Download image N**), **Download all**, the establishing image and each thumbnail. |
| Video | The **Download** menu: **Video (.mp4)** or **Audio (.wav)**, **Subtitles (.srt)**, **Subtitles (.vtt)**, **YouTube description (.txt)**, **YouTube tags (.txt)**, **Audio with chapters (.mp3)**, **Audiobook with chapters (.m4b)** and each **Short N (.mp4)**, as far as the run made them. |
| PDF | **Download PDF**. |
| History | Any saved revision's files, and **Download all images** for that revision. |

**Open folder** under the video opens the project's folder on the computer running Slopify. In Docker without the host helper, it shows the path to copy into your file manager instead. See [Where Your Files Live](Where-Your-Files-Live).

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

## More project actions

The three dots beside the title hold:

| Action | What it does |
| --- | --- |
| **Choose what to remake…** | Opens the rebuild review for every outdated or failed output. See [Editing a Project](Editing-a-Project#choose-what-to-remake). |
| **Save as template…** | Saves this project's settings as a template (not for the sample). See [Templates](Templates). |
| **Cancel the run…** | Stops the run (only while it is running). |

## Command palette

Press `Ctrl+K` on a project page. Under **This project** you get: the next action, **Pause the run** or **Continue the run**, **Prepare upload**, **Edit project settings**, **Choose what to remake**, **Save as template**, **Cancel the run**, the first outdated group (for example **Remake 4 outdated images**), **Remake everything outdated**, **Make my own copy** (sample only) and **Regenerate image N** for each image. See [Keyboard Shortcuts and Command Palette](Keyboard-Shortcuts-and-Command-Palette).

## Tips

- The sample projects are read-only. Press **Make my own copy** to change one.
- A failed thumbnail does not stop the video: a failed step only stops the steps that need its output.
- You can close the browser tab while a run is going. The run continues on the computer running Slopify.

## Related pages

- [Editing a Project](Editing-a-Project)
- [Video Editing](Video-Editing)
- [Recovery and Retries](Recovery-and-Retries)
- [Reviews and Checkpoints](Reviews-and-Checkpoints)
- [Costs and Run Cost](Costs-and-Run-Cost)
- [Publishing to YouTube](Publishing-to-YouTube)
- [Home and Projects](Home-and-Projects)
