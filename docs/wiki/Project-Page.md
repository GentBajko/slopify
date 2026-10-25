# Project Page

Every run you start gets a project page. It shows each part as it is made, puts the one thing the project needs next in its title row, and holds the finished files, the settings, the versions and the cost.

**Where to find it:** Home or Projects → a project. Pressing **Make the video** on Create also opens it.

## How the page is laid out

| Part | What it holds |
| --- | --- |
| Title row | **Projects** (the way back), the project title, its state in words beside its lamp (for example **● Done**), a short line of facts (finished when and how long it took, or when it started; its channel; when it was uploaded; "Audiobook" or "Podcast episode" for spoken work), then the one thing to do next (the page's only lime button), **Edit settings** and **More**. While a step works, the line says where the run stands, as Home does (`Step 2 of 4 · Narration · about 4 min left on this step`), beside a clock: `Working · 9 min 30 s`, holding still as `9 min 30 s of work so far` while the run is paused or waits on you. |
| Note under the title | One line, only when the situation needs saying: the read-only sample, a paused, stopped or queued run, a run an agent is reviewing, a finished short. |
| Main column | The part you picked. |
| Status list (right) | One row per thing the project makes: **Article**, **Narration**, **Images**, **Video**, **Shorts**, **YouTube**, **PDF**, each with its state in words and one detail, for example **Done · 4 images + 1 thumbnail**. **All files** closes the list with how many files there are. While the run goes, **Progress** leads the list, and a row that works, waits or failed gets a second line saying what it is doing and the time left. A part with outdated files says how many, for example **Done · 2 outdated**. |
| Under the list | The cost line (see below), **Make the next chapter** on a finished audiobook that is a chapter of a book, and, while videos wait in the queue, how many with the list to reorder them. |

Press a row of the status list to open that part. The page opens where the next action points: the failed step, the held review or the outdated images. When nothing needs you, it opens on the part the run is at, and a finished video opens on **Video**: the player, **Download video (.mp4)**, **Open folder**, the chapters, **Copy description** and **Copy tags**.

### The cost line

Under the status list, one line sums up what the run cost: `Cost $0.07 · 4 s of working time · See the breakdown`. The working time counts only the time Slopify was working, never the time it waited on you, a review or a limit. While the run goes it reads **Cost so far**; steps run on a tool you are signed in to add the approximate API price (`~$3.10 via API`); calls without a known price make it a known cost. **See the breakdown** opens the **Cost** part: what each step and each model cost, its usage and its working time. See [Costs and Run Cost](Costs-and-Run-Cost).

### Time left

While a step runs, its row in the status list (and its line on Home's Running) ends with its time left, for example `12 of 40 chunks · about 4 min left`. Slopify works it out from the step's own pace once it has counted something, otherwise from how long the same kind of step took in your finished runs (on the same service and model when there are enough of those). Past that time it says **taking longer than usual**; with nothing to go by, **time left unknown**. Near the end it reads **finishing up** or **under a minute left**.

### Project state

The state beside the title reads one of:

| State | Meaning |
| --- | --- |
| **Queued** | Waiting for its turn behind other videos in the queue. |
| **Running** | A part is being made. |
| **Paused** | You paused it. Everything made so far is kept. |
| **Done** | Everything finished. |
| **Done with problems** | The main result was made (the video, or the narration when there is no video, or the article when there is neither), but another step failed. Each failed step shows its error and its fix. |
| **Failed** | A step failed and the main result was not made. |
| **Canceled** | You canceled the run. Finished files are kept. |
| **Waiting for your review** | A pause is holding the run for you to approve what it made. |
| **Waiting for the agent** | An [External agent](Agents-MCP#the-external-agent-reviewer) is checking what was made. It goes on by itself once the agent answers, or after 2 hours. |
| **Waiting for its day** | Made ahead by its schedule; only the video is left, for its day. See [Schedules](Schedules#make-a-video-ahead). |
| **Stopped** | The run stopped before it finished (for example after a restart). Press **Continue the run**. |
| **Kept as is** | What is left was set aside with **Keep as is** and won't run. Editing the project brings it back. |

## The next action

The title row shows at most one lime button, named for what it will do. It is the same action the command palette (`Ctrl+K`) offers first under **This project**, and it is repeated at the top of the part it concerns.

| Situation | Button |
| --- | --- |
| The bundled sample project | **Make my own copy** (the sample is read-only; your copy can be edited and made again) |
| Paused | **Continue the run** |
| A step failed and will not try again by itself | The step's fix (for example **Copy sign-in command**, **Edit the prompt**, **Switch model**), or **Try the article again**, **Try images again** and so on. See [Recovery and Retries](Recovery-and-Retries#fix-it-buttons). |
| A pause is holding the run | **Approve and make the narration**, **Approve and make the images**, **Approve and make the video** |
| An External agent is checking what was made | None. The note says the run carries on once the agent answers, and that a check nobody answers passes by itself after 2 hours. |
| A plan limit is used up | None. The note says, for example, "Waiting for Codex limits (resets at 14:00)." |
| A step is waiting to try again | None. The note says when it tries again. |
| Running | **Pause** |
| Stopped before it finished, or canceled | **Continue the run** (makes only what is missing) |
| Queued | None. Videos queued together run one at a time, in the order they were added; Home shows which one is running now. |
| An edit made files outdated | Makes the outdated ones again, for example the outdated narration or 4 outdated images. Before anything paid starts, it shows what it makes again and the estimated cost. |
| A 60-second short is finished | **Make the full video on this topic** (opens Create set up for a long video on the same topic; see [Your First Short](Your-First-Short#make-the-full-video-next)) |
| The video is finished (uploaded or not) | **Download video**. **Copy for YouTube Studio** sits in the Video part's heading, beside the player (see [Publishing to YouTube](Publishing-to-YouTube)). |

`Shift+N` runs the next action from anywhere on the page.

When a step fails, its part says why at the top, and **Error details** shows the service's own words.

## Pause, continue and cancel a run

### Pause a run

1. Open the project while it is running.
2. Press **Pause** in the title row (or pick **Pause the run** in the command palette).
3. The call in progress finishes, then nothing new starts. Everything made so far is kept.

A step that is waiting to try again or waiting for a plan limit also stays held while the project is paused.

### Continue a paused or stopped run

1. Press **Continue the run** in the title row (or in the command palette).
2. Slopify makes only what is missing; finished work is reused.

### Cancel a run

1. Open **More** in the title row.
2. Choose **Cancel the run…**.
3. Confirm, or keep it running.

Canceling stops every running step; finished files are kept. You can continue a canceled run later with **Continue the run**. If you tried a step again after canceling (**Try … again**), Continue carries on only that work; see [Recovery and Retries](Recovery-and-Retries#cancel-then-continue). A running project has to be canceled before you can delete it.

## The parts

A part appears only when the run makes it. The research notes are a tab of Article, and the thumbnail sits at the top of Images.

| Part | What it shows |
| --- | --- |
| **Article** | The article in a reading view, with tabs for **Research** notes, **Sources**, **Speakers** (scripts for several voices) and **Pronunciation** when those exist, its length and how long it reads aloud, its download, **Open folder** and **Copy article**. |
| **Narration** | A player for the intro, the article and the outro, the downloads, and the text that plays along: press a line to play from there. Podcasts and interviews show the conversation turn by turn with speaker names. |
| **Images** | The thumbnail (with **See it as YouTube shows it**), every image in order, on-screen cards for tables and figures, and the establishing image (a reference that is not in the video). Each picture has its actions under it in words: **Make this image again**, **Download**, **More** (**Compare with previous**, **Replace with my file**, **Delete**) and **Full size**. **Download all 4 images (.zip)** saves them all. |
| **Video** (or **Audio export** when the video is off) | The player, **Download video (.mp4)**, **Open folder**, the caption files, the length, shape, size and loudness, the chapters (press one to play from there), **Copy description** and **Copy tags**. **Technical details** folds out the rest. |
| **Shorts** | The vertical clips picked from the video, each with its title and hashtags. See [Shorts](Shorts). |
| **YouTube** | The title, description, chapters, hashtags and tags as they go into YouTube Studio, each with its copy button, and each upload's release date and link. See [YouTube Description](YouTube-Description) and [Publishing to YouTube](Publishing-to-YouTube). |
| **PDF** | The laid-out document and its download. See [PDF Documents](PDF-Documents). |
| **All files** | Every file the project makes, part by part, each with its state, when it was made and its downloads. See [Downloads](#downloads). |
| **Cost** | The run's cost by step and by model. Opened from the cost line's **See the breakdown**. |
| **Progress** | Only while the run goes: the run as it is made. See below. |

A part still waiting says it starts when the steps before it are done.

### Make a whole part again

Each part's heading has a button that makes all of it again, named for what it makes and what it costs:

| Button | What it does |
| --- | --- |
| **Research the topic again · AI calls** | Fresh research, then the affected article, narration, thumbnail and video. |
| **Write the article again · AI calls** | A fresh article, then the affected narration, thumbnail and video. |
| **Make the narration again · voice calls** | New narration and the affected video. |
| **Make all 4 images again · 4 image calls** | New images and the affected video; images you supplied and the narration are kept. |
| **Make the thumbnail again · 1 image call** | A new thumbnail; the video is not changed. |
| **Make the video again (free)** / **Make the audio file again (free)** | Puts the video or audio file together again from saved media, with no new narration or images. |
| **Make the PDF again (free)** | Lays out the PDF again from the saved article and title. |

Each asks first. Earlier files stay under **Versions**. These buttons are off while the project is running.

### The reading view

The article, research notes and narration script are shown in a reading view:

- **Search the article** (or the research, or the script): every match is marked. Press `Enter` for the next match, `Shift+Enter` for the previous, or use the **Previous match** and **Next match** arrows.
- **Copy section** beside each heading copies that section as Markdown.
- **Copy article** (or **Copy all**) copies the whole text as Markdown.

If the browser blocks the clipboard, select the text and press `Ctrl+C`.

### Downloads

Every part puts its files the same way, in one row of buttons beside its text: a download named for what it holds (**Download video (.mp4)**, **Download article (.txt)**, **Download all 4 images (.zip)**; a menu when the part has several files), the part's one **Open folder**, then anything else the part does (such as **Copy description**). Lengths, formats and what a file measured sit on their own line.

**All files** lists them all in one place:

| Part | Its files |
| --- | --- |
| Article | The article as text, its sources, the Pronunciation Glossary and the research notes, as far as the run made them. |
| Narration | The recording and the spoken text; for spoken work with chapters, an MP3 and an M4B. Uploaded audio has no spoken text. |
| Images | All the images as one .zip, and each image at full size from its tile. |
| Thumbnail | The thumbnail (or the three). |
| Video | The video (or the WAV), the caption files (.srt and .vtt), and the YouTube description and tags as text. |
| Shorts | Each short's MP4, and all of them as one .zip. |
| PDF | The PDF. |

The YouTube description and tags downloads are the text exactly as the page shows it: your hand edits, the fitted chapters and the filled channel links.

**Open folder** opens the part's folder on the computer running Slopify. In Docker without the host helper, it shows the path to copy into your file manager instead. See [Where Your Files Live](Where-Your-Files-Live).

### The players

Videos and audio play in Slopify's own player, not the browser's.

- **Video:** the poster (the first thumbnail for the finished video, the first still for a short) with a big play button, then a bar with play, the time, a track you can click or drag (it shows what has loaded, a time tip and the chapter marks), volume, speed from 0.75× to 2×, captions, picture in picture and full screen. The bar hides while the video plays. In a narrow space it drops picture in picture, then volume, speed and the total time, keeping play, seek, captions and full screen on one row.
- **Audio** (narration, intros and outros, the audio file, podcasts and audiobooks, live previews, older versions): the same bar on its own, with the chapter or segment marks on the track.

Click the player first, then use YouTube's keys: `Space` or `K` plays and pauses, `J` and `L` jump 10 seconds back or forward, `Left` and `Right` 5 seconds, `M` mutes, `F` goes full screen and `C` turns captions on or off (video only), and `0` to `9` jump to that tenth of the way through.

### Images at full size

Press **Full size** under any image, thumbnail or cast picture (or the picture itself) to open it full size. `Left` and `Right` (or **Previous** and **Next**) move between them; `Esc` or **Close** closes it. At full size, images and thumbnails keep **Make this image again** (it asks first) and **Download**.

### Progress

While the run goes, **Progress** leads the status list and shows the run as it is made:

- **Article**: the text as the AI writes it (**Live writing**).
- **Narration**: a waveform that grows as each part is spoken. **Listen while it generates** plays the audio as it arrives.
- **Images**: each image as it is drawn.
- **Video**: how far it is put together.

**Live writing** also appears in a running part's own section. When a step makes several calls, a list picks which one to watch. Watching costs nothing extra, and the full text is saved when the step finishes.

## Edit settings

**Edit settings** in the title row opens the project's settings in the main column, in the same order and words as Create's rows, with two tabs:

- **Settings**: every setting of the project, section by section, with **Save changes** and **Discard changes**. Saving keeps a new version without making anything; what the change made outdated is then the next action. Pauses and checks is one of the sections: the pauses for this run (**Pause after the article (before the narration)** and the others) with **Save pauses**, and whether an AI checks the results. See [Editing a Project](Editing-a-Project) and [Pauses and Checks](Reviews-and-Checkpoints).
- **Versions**: every saved version and its files (**Show its files**), **Free space** on a finished project, and the **Project ID** with **Copy project ID**. See [Editing a Project](Editing-a-Project#versions).

Press **Edit settings** again to close the settings.

## Free space

A finished project can drop the working files it was made from (narration pieces, caption timing, video settings) and keep what gets published: the video, shorts, the images they show, thumbnail, article, description, document and anything you uploaded. Under **Edit settings** → **Versions**, **Free space** shows the size of both, for example "Outputs 1.4 GB · working files 1.2 GB", with the button **Free 1.2 GB**.

1. Press the button.
2. Read what goes, then confirm, or keep the working files.

When there are old versions, **Delete old versions** frees their files too. Changing the project later makes the working files again first, which takes time and service credits. The offer is hidden on the bundled samples, while the project runs or waits, and when nothing is left to drop. Settings → **Backup & storage** offers the same for every project. See [Where Your Files Live](Where-Your-Files-Live).

## More

**More** in the title row holds:

| Action | What it does |
| --- | --- |
| **Mark uploaded** / **Mark not uploaded** | Records whether the video is on YouTube, as Copy for YouTube Studio's **I've uploaded it** does. |
| **Choose what to make again…** | Only when files are outdated: opens the review of every outdated or failed file, to make them again one by one. See [Editing a Project](Editing-a-Project#choose-what-to-make-again). |
| **Rename…** | Opens the settings on the project title. |
| **Save as template…** | Saves this project's settings as a template (not for the sample). See [Templates](Templates). |
| **Move to channel…** | Only with two or more channels. |
| **Posters & pictures…** | The posters and pictures made for this project. |
| **Cancel the run…** / **Delete project…** | Stops the run while it runs; otherwise deletes the project (it goes to Settings → Trash for 30 days). |

## Command palette

Press `Ctrl+K` on a project page. Under **This project** you get the next action (`Shift+N`), **Pause the run** or **Continue the run**, **Copy for YouTube Studio**, **Edit settings**, **Save as template**, **Cancel the run**, **Copy project ID**, the outdated files to make again, **Make my own copy** (sample only), **Open the project folder**, **Copy description** (`Shift+D`), **Copy tags**, **Make the thumbnail again** and **Make an image again** (type its number with it, for example `image 12`; it asks first, as the button does). See [Keyboard Shortcuts and Command Palette](Keyboard-Shortcuts-and-Command-Palette).

## Tips

- The sample projects are read-only. Press **Make my own copy** to change one.
- A failed thumbnail does not stop the video or the PDF: a failed step only stops the steps that need what it makes. The PDF is then laid out without a cover; make the thumbnail again later and the PDF is marked outdated, ready to make again with it.
- You can close the browser tab while a run is going. The run continues on the computer running Slopify.

## Related pages

- [Editing a Project](Editing-a-Project)
- [Video Editing](Video-Editing)
- [Recovery and Retries](Recovery-and-Retries)
- [Pauses and Checks](Reviews-and-Checkpoints)
- [Costs and Run Cost](Costs-and-Run-Cost)
- [Publishing to YouTube](Publishing-to-YouTube)
- [Home and Projects](Home-and-Projects)
