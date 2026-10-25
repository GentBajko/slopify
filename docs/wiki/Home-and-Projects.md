# Home and Projects

Home is Slopify's front page: your finished videos with Watch and Download, what needs you, what is running and waiting to start, what is coming up and what this week cost, on one screen. Projects is the full list of every run you ever started, with search and filters.

**Where to find it:** the rail → **Home** (the Slopify logo also goes there) and **Projects**. On a phone, the bottom bar.

## Finding your way around

Every page shares the same frame: a narrow rail on the left, an icon with a word under it for each place, and the page beside it. On a computer there is no top bar; everything lives in the rail.

### The rail

From top to bottom:

| Part | What it has |
| --- | --- |
| Logo | The Slopify play logo. Click it to go Home. |
| **Create** | The lime key. Opens Create to make a new video (`C` from anywhere). |
| Destinations | **Home**, **Projects**, **Prompts** (also lit on Intros and outros), **Templates** (also lit on Designs), **Calendar** (also lit on Schedules), **Channels** (only once you have two or more channels; also lit on A/B results) and **Settings** (also lit on Usage, PDF themes and Pronunciation). |
| **N running** | Shown while runs are going: a lamp and the count over the word running. It links to Running now on Home. |
| **Update ready** | Shown only while a new version of Slopify is ready, waiting or installing. It opens a menu that says what installing does, with **Install update**. See [Updating and Patch Notes](Updating-and-Patch-Notes). |
| **Search** | Opens the command palette (`Ctrl+K`). |
| **Assistant** | Opens the assistant beside the page. See [Assistant](Assistant). |
| **Help** | **Start the tour** (the interactive tutorial), **Tutorials** (the guides, whose page also has **Welcome screen**), **Keyboard shortcuts**, **What's new** (the patch notes) and **Check for updates**, with the version you are running. |
| **Support** | **GitHub**, **Patreon** and **Buy Me a Coffee**, each opening in a new tab. |

### On a phone

Below 768 pixels wide the rail is hidden. A slim bar at the top holds the logo, the running count, **Search** and **Help**; on a phone Help also holds the **Assistant** and the support links, and turns lime-ink when an update is ready. A bottom bar has **Home**, **Projects**, the lime **Create** in the centre, **Prompts** and **More** (Templates, Calendar, Channels and Settings).

### Rows open with one press

In every list, a press anywhere on a row or tile opens or picks it, not only on its name: projects, Home items, calendar entries, channels, schedules, Library lists, samples, saved drafts and media tiles. The buttons on a row still do their own thing.

### The command palette

Press `Ctrl+K`, or click **Search**, to jump anywhere or run an action by typing. With nothing typed it opens on **Create a video**, then the **Go to** group in the rail's order: **Open Home**, **Open Projects**, **Open Prompts**, **Open Templates**, **Open Calendar**, **Open Channels** (listed once you have two or more channels) and **Open Settings**. Typing also finds **Open schedules**, **Open usage and costs**, **Open tutorials** and **Start the tour**. With two or more channels the **Channel** group has **Show all channels** and **Switch to <channel>**. See [Keyboard Shortcuts and Command Palette](Keyboard-Shortcuts-and-Command-Palette).

### The Channel picker

With two or more channels, Home, Projects and the Calendar show **Showing: All channels ▾** in their page header. Pick a channel to see only its work, or **All channels** for everything. It only filters what you see: projects, schedules and costs of other channels keep running. Slopify remembers your choice in this browser. With one channel there is nothing to pick, so it is not shown. See [Channels](Channels).

## Home

**Where to find it:** the rail → **Home**.

One line at the top: today's date and **Home**, then **Showing:** (the channel picker, only with two or more channels) and **Open calendar** (only once a schedule exists). **Create** is in the rail and the phone's bottom bar.

On a fresh install, Home sends you to the first-run screen once. See [First Launch and Welcome](First-Launch-and-Welcome).

### Before your first video

Until you have a project of your own, Home shows:

- **Your first video**: what a video needs on this computer (Script, Voice, Images), each with its state (**Ready** or **Not connected**) and the button that fixes it, the same list as the first-run screen. **Make your first video** opens Create; it is lime once nothing is missing.
- **Finished samples**: the bundled samples, each with its picture, its length, what it made and **Watch**. They stay on Home until you have finished a video of your own.

### Finished

What your runs made, newest finished first, up to 6 (**See all N finished in Projects** opens Projects with the most recently finished first). The heading counts them and says how many are still to upload, for example **4 videos · 2 ready to upload**. Each row has the thumbnail, the title, the state in words (**Ready to upload**, **Uploaded**, **Done with problems**, or **Done** for a run that made no video) and one line such as `3:05 · 16:9 · video + 2 shorts + PDF · finished Sep 27`, then:

- **Watch** opens the project on its Video section (**Open**, for an audiobook or anything else without a video).
- **Download video** saves the video file.

A video that was made but lost another step reads **Done with problems** and names the step, for example **PDF failed**, with **See what failed** opening that section of the project. Marking a video uploaded (on Projects, or in the project's upload pack) changes its word to **Uploaded**; it stays here. The bundled samples are never here: they have their own **Finished samples** until you have finished work of your own.

### Needs you

The things that don't move on until you act:

| Item | Status | Button |
| --- | --- | --- |
| A run held at a review before a step | **Waiting for your review · before the narration** (or the images, or the video) | **Approve the article and record**, **Approve and draw the images** or **Approve and render**. Approving here lets the run continue. Open the project to look first. |
| A run whose next step is held another way | **Waiting for your review** | **Open to continue** |
| A run a restart stopped before it finished | **Stopped** | **Continue the run**, or **Keep as is** to leave the rest unmade |
| A run you (or an agent) paused | **Paused** | **Open to continue** |
| Topics a schedule suggested | **N new topics** | **Review topics**, on the calendar: queue the ones you want and reject the rest. |
| A failed run | **Failed · <step>**, with a short reason | The fix to try: a button to Settings → Keys & services or Backup & storage when that is the fix, otherwise **Open to retry**. |
| A run that failed because a CLI is signed out | **Failed · <step>** | **Copy sign-in command** copies the command (`claude auth login`, `codex login` or `agy`). Run it in a terminal on the computer running Slopify, then **Open to retry** and press **Check again** on the project. |

A held run also offers **Keep as is**, which takes it off Needs you and leaves the rest unmade (with **Undo**); editing the project brings it back. A run waiting for an [agent's review](Agents-MCP#the-external-agent-reviewer) is not here: it goes on by itself, so it shows under Running. A step that failed while the run waits on something else shows here as a failed item. Up to 4 failed runs show; **See all N failed** opens Projects filtered to them.

Only one button in the column is lime: the first decision's when there is one, otherwise **Watch** on the newest video. With nothing finished, waiting or running, Home says so, with **Make a video**. See [Reviews and Checkpoints](Reviews-and-Checkpoints), [Schedules](Schedules) and [Recovery and Retries](Recovery-and-Retries).

### Running

Videos being made, and runs **Waiting for the agent** (an External agent reviews what they made; they carry on once it answers or after 2 hours), up to 3. Paused runs are under Needs you. Each shows:

- **Running** beside the title, and where the whole run stands, for example `Step 2 of 4 · Narration · about 4 min left on this step`.
- Each step with its state, how long it took, and the running step's time left (for example `2 of 8 · about 4 min left`).
- The last few images as they land, with a tile for the one being drawn.

A run waiting for a CLI plan says so instead, for example **Waiting for Codex limits (resets at 14:00)**. With more than three running, **See all N running** opens Projects filtered to running.

Under them, **Waiting to start** lists the videos queued behind them (for example after **Queue 3 videos** in Create), numbered in the order they will start. **Earlier** and **Later** change the order; **Remove** takes one out of the queue and puts it in the trash, with **Undo**. Pausing a project holds the queue; when one fails or is canceled, the next one starts.

Time left comes from the step's own pace once it has counted something, otherwise from how long the same kind of step took in your finished runs. Past that it says **taking longer than usual**; with nothing to go by the time is left out.

When a run ends, a notice in the corner says so on whatever page is open, for example **Video ready: The history of the lighthouse** with **Watch**, whether or not browser notifications are on. See [Notifications](Notifications).

### Coming up

Shown once you have a schedule: the schedule runs due in the next 7 days, with the template and topic each will use, up to 6. Paused schedules show too. With none it says **No scheduled runs in the next 7 days.** See [Calendar](Calendar).

### Autopilot

At the top of **Coming up**, one line says how far ahead you are: "9 days of content ready · the queue runs dry on Oct 30". Each run a schedule will make in the next 60 days is a slot; a run made ahead (Prepare) fills its own slot, and each finished video not uploaded yet fills the next empty one. The days count to the first slot nothing fills ("60+" when all of them are filled). **Runs dry** is the first run that will have no topic: the run after a queue's last topic when the schedule doesn't find its own, the first run past the approved topics when new ones wait for approval, and never for a schedule that finds topics by itself unless finding them fails. Paused schedules count for neither, and neither do runs a schedule skips because its template has no version marked ready.

Below it, warnings name what may stop the schedules before it does, each with the button that opens the fix and **Hide** (hidden for 7 days, or until it changes):

| Warning | Fix |
| --- | --- |
| A CLI a scheduled template uses is signed out | Settings → Keys & services |
| A CLI plan is at 80% of its weekly or 5-hour limit | Settings → Usage |
| The OpenRouter key has less than 20% of its spending limit left | Settings → Keys & services |
| Less than 5 GB, or less than 10%, of the disk is free | Settings → Backup & storage |
| A schedule that doesn't find topics has 1 or 2 left | The schedule |
| A schedule's topic generation keeps failing | The schedule |
| A scheduled template or schedule uses a model that is retiring or gone | Templates, or the schedule |
| A schedule skips its runs because its template has no version approved for schedules | Templates (**Edit template** → **More** → **Approve for schedules**) |

Sign-ins, the OpenRouter key and the disk are checked hourly, the first time 30 seconds after Slopify starts; Home shows the last check and never waits for one. Only the CLIs a scheduled template uses are asked, and asking never starts a run. **Last 7 days**, folded, lists what was made, each failed step with a link to its project, and what it cost. Settings → Notifications → **Weekly report** sends the same to your phone each Monday (see [Notifications](Notifications#weekly-report)).

### This week

Since Monday, for the channel shown, in one line: the videos made and what their provider calls cost, for example `3 videos · $9.40 spent · ~$31.00 via API`. Calls billed to a command-line plan cost nothing per call; **~$X via API** says what they would have cost with API keys. Calls with no known price are counted separately (**N calls without a price**). Under it, a bar per command-line plan shows how much of its weekly limit is used, from the tool's last reading; it turns amber at 80%. Nothing shows before anything was made or spent this week. See [Costs and Run Cost](Costs-and-Run-Cost).

### Start from a template

Your four most recently changed templates, each with **Make a video**, which opens Create with that template picked so only the topic is left to type. **See all N** opens Templates.

## Projects

**Where to find it:** the rail → **Projects**.

Every run ever started, newest first unless you pick another order, for the channel picked under **Showing:** (with two or more channels). The heading says how many projects there are. **Create** is in the rail.

### Search and filter

1. Type in **Search projects** to match titles.
2. Pick a filter under **Show**. Each says how many it holds, for example **Ready to upload 3**; a filter with nothing in it is not offered. On a phone the filters are one list, for example **Ready to upload (3)**.

| Filter | Shows |
| --- | --- |
| **All** | Everything. |
| **Running** | Projects running, and those **Waiting for the agent**: the same runs Home's **See all N running** counts. |
| **Queued** | Projects waiting for their turn in the video queue, in the order they will start, each with **Earlier**, **Later** and **Remove**. |
| **Needs you** | Projects waiting for you: at a review or held step, paused, or **Stopped**. |
| **Ready to upload** | Finished videos not marked uploaded, including those **Done with problems**. Never a sample. |
| **Failed** | Failed projects, and runs with a failed step that still wait on something else. |

3. Pick an order beside the filter: **Newest first**, **Finished first**, **Recently changed**, **Name (A–Z)** or **Status** (waiting for you first, then running, queued, failed and finished).

The search, the filter and the order are part of the address, so Back from a project, a reload or a link opens Projects the same way: `/projects?show=running` (`queued`, `waiting` for Needs you, `ready` or `failed`), `?q=` for the search words and `?sort=finished`, `changed`, `name` or `status`. The list draws 50 projects at a time; **Show N more** under it adds the next ones. Press `/` to jump to the search box. The command palette has shortcuts: **Show projects that need you**, **Show videos ready to upload** and **Show failed projects**.

If nothing matches, the list says **No project matches. Clear the search or pick All.** If the picked channel has no projects, pick **All channels** under **Showing:**.

### What each row shows

- A checkbox to select it (see [Work on several projects at once](#work-on-several-projects-at-once)).
- Its thumbnail.
- The title, with a **Sample** badge on the bundled samples and an **Outdated** badge when an edit left part of it outdated. A press anywhere on the row opens the project. A long title is cut short; hover it to read all of it.
- Its state in words, then what it is: once finished, its length, shape, what it made and when it finished, for example `3:05 · 16:9 · video + 2 shorts + PDF · finished Sep 27`; before that, what it was made of and when it started, for example `Documentary dossier · 16:9 · started …`. A run that made its video but lost a step names the step (**PDF failed**) with **See what failed**.
- A progress bar with **N% done** while it runs.

| State | Meaning |
| --- | --- |
| **Running** | A step is being made. A run waiting for a CLI plan says **Waiting for Codex limits (resets at 14:00)** instead. |
| **Paused** | Paused by you or an agent; nothing runs until it is continued. |
| **Queued** | Waiting for its turn in the video queue. |
| **Waiting for your review** | Held at a review or checkpoint. |
| **Waiting for the agent** | An External agent is reviewing what it made; it goes on by itself. |
| **Waiting for its day** | Made ahead by its schedule; only the video is left, for its day. |
| **Stopped** | Stopped before it finished, for example by a restart. Open it and press **Continue the run**. |
| **Kept as is** | What is left was set aside with **Keep as is**. |
| **Ready to upload** | A finished video you have not marked uploaded. |
| **Uploaded** | A finished video you marked uploaded. |
| **Done** | Finished: a sample, or a run that made no video. |
| **Done with problems** | The video was made, but another step failed. |
| **Failed** | Stopped with an error. |
| **Canceled** | You canceled it. |

Then its actions, in words:

- **Open** opens the project.
- **Download video** saves the finished video.
- **Mark uploaded** on a finished video of yours. For a day after marking, **Undo upload mark** puts it back on Ready to upload; after that, select it and press **Mark not uploaded**.
- **Make my own copy** on a sample: an ordinary project you can edit and make again; the sample stays as it came.
- **Delete** (not while it runs: cancel the run first). A queued video has **Earlier**, **Later** and **Remove** instead. On a phone the row keeps one line of actions: tick it and press **Delete** in the bar above the list.

### Work on several projects at once

Tick the checkbox on each row you want, or **Select all** above the list (it covers the rows shown: a search, a filter or Show more changes which). Shift+click ticks every row between two; Esc clears the selection. Once something is ticked, the bar above the list says how many are selected and offers what applies to them:

| Button | Does |
| --- | --- |
| **Clear selection** | Unticks everything. |
| **Mark uploaded** | Shown when a selected project is a finished video; marks the selected finished videos uploaded. |
| **Mark not uploaded** | Shown when a selected video is marked uploaded; puts it back on Ready to upload. |
| **Move to channel…** then **Move to <channel>** | Moves the selected projects to another channel (with more than one channel). |
| **Make outdated parts again** | Shown when a selected project is **Outdated**. It checks each one, then shows what each makes again and what it costs before anything starts. |
| **Delete** | Asks first, then moves the selected projects to the trash. Running projects stay: cancel the run first. |

Each one says what it did in a notice with **Undo**: Undo after a delete restores the projects from the trash; after a move it sends each project back to its channel.

### Delete a project

1. Press **Delete** on its row.
2. Confirm with **Delete project** (or **Keep it** to back out).
3. The project goes to the trash for 30 days. The notice that says so has **Undo**; later, restore it or delete it for good in Settings → **Backup & storage** → **Trash**. See [Trash](Trash).

### The video queue

Videos started together (**Queue 3 videos** in Create, for example) run one at a time. Home lists the ones waiting under **Running**, and the **Queued** filter here lists them in the order they start, each with **Earlier**, **Later** and **Remove**; the calendar has the same list under **Batch queue** (see [Calendar](Calendar#the-batch-queue)). A project page says how many videos wait while any do. Pausing a project holds the queue; when one fails or is canceled, the next one starts.

### When there are no projects

Projects shows **No projects yet**, "Every video you make is kept here with its files.", **Make your first video** (opens Create), and an invitation to the interactive tutorial with **Start the tour**.

## Tips

- The rail's **N running** link jumps straight to Running on Home.
- Home and Projects follow the Channel picker. If a project seems missing, switch to **All channels**.
- Updates wait for running work. See [Updating and Patch Notes](Updating-and-Patch-Notes).

## Related pages

- [Project Page](Project-Page)
- [Create Overview](Create-Overview)
- [Channels](Channels)
- [Calendar](Calendar)
- [Schedules](Schedules)
- [Reviews and Checkpoints](Reviews-and-Checkpoints)
- [Publishing to YouTube](Publishing-to-YouTube)
- [Keyboard Shortcuts and Command Palette](Keyboard-Shortcuts-and-Command-Palette)
