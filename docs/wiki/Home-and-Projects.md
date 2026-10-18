# Home and Projects

Home is Slopify's front page: what needs you, what is running, what is coming up, what is ready to upload and what this week cost, on one screen. Projects is the full list of every run you ever started, with search and filters.

**Where to find it:** the sidebar → **Home** (the Slopify logo also goes there) and **Projects**. On a phone, the bottom bar.

## Finding your way around

Every page shares the same frame: the sidebar on the left and the page beside it. On a computer there is no top bar; everything lives in the sidebar.

### The sidebar

From top to bottom:

| Part | What it has |
| --- | --- |
| Logo | The Slopify play logo and name, with the version you are running beside it (for example `v3.0.0`). Click it to go Home. |
| **Search or run a command** | Opens the command palette (`Ctrl+K`). |
| Destinations | **Home**, **Projects**, **Calendar** (also lit on Schedules), **Channels**, **Library** (Templates; Prompts, Intros & outros, PDF themes, Narration aliases; A/B results), **Settings** (also lit on Usage). |
| **N running** | Shown while runs are going. It links to Running now on Home. |
| **Channel** | The channel picker (see below). |
| **Create** | Opens Play to make a new project (`C` from anywhere). |
| Links | **GitHub**, **Patreon** and **Buy Me a Coffee**, each opening in a new tab. |
| Foot | "Free. Your keys, your machine.", the updates button (circular arrows, see [Updating and Patch Notes](Updating-and-Patch-Notes)), the **Tutorials** button (book, the guides; its page also has **Welcome screen**) and the tutorial button (question mark, **Start interactive tutorial**). |

### On a phone

Below 768 pixels wide the sidebar is hidden. A slim bar at the top holds the logo, the search button, the running count, the GitHub, Patreon and Buy Me a Coffee icons, the updates button and the tutorial button. A bottom bar has all six destinations: Home, Projects, Calendar, Channels, Library and Settings. The Channel picker sits at the top of Home.

### Rows open with one press

In every list, a press anywhere on a row or tile opens or picks it, not only on its name: projects, Home items, calendar entries, channels, schedules, Library lists, samples, saved drafts and media tiles. The buttons on a row still do their own thing.

### The command palette

Press `Ctrl+K`, or click **Search or run a command**, to jump anywhere or run an action by typing. The **Go to** group has **Open home**, **Open projects**, **Open calendar**, **Open schedules**, **Open channels**, **Open library**, **Open settings**, **Open usage and costs**, **Open tutorials** and **Show patch notes**. **Create** opens Play. The **Channel** group has **Show all channels** and **Switch to <channel>**. See [Keyboard Shortcuts and Command Palette](Keyboard-Shortcuts-and-Command-Palette).

### The Channel picker

The **Channel** picker near the foot of the sidebar (at the top of Home on a phone) shows Home and the other screens for one channel, or for **All channels**. It only filters what you see: projects, schedules and costs of other channels keep running. Slopify remembers your choice in this browser. See [Channels](Channels).

## Home

**Where to find it:** the sidebar → **Home**.

The page title is the channel you picked (or **Home**), under today's date. At the top right are **Open calendar** and **New project**.

On a fresh install, Home sends you to the first-run screen once. See [First Launch and Welcome](First-Launch-and-Welcome).

### Needs you

One work list: the things that don't move on until you act, then the finished videos ready to upload.

| Item | Status | Button |
| --- | --- | --- |
| A run held at a review before a step | **Waiting for your review · before the narration** (or the images, or the video) | **Approve the article and record**, **Approve and draw the images** or **Approve and render**. Approving here lets the run continue. Open the project to look first. |
| A run whose next step is held another way | **Waiting for your review** | **Open to continue** |
| A run a restart stopped before it finished | **Stopped** | **Continue the run**, or **Keep as is** to leave the rest unmade |
| A run you (or an agent) paused | **Paused** | **Open to continue** |
| Topics a schedule suggested | **N new topics** | **Review topics**, on the calendar: queue the ones you want and reject the rest. |
| A failed run | **Failed · <step>**, with a short reason | The fix to try: a button to Settings → Providers or Backup & storage when that is the fix, otherwise **Open to retry**. |
| A run that failed because a CLI is signed out | **Failed · <step>** | **Copy sign-in command** copies the command (`claude auth login`, `codex login` or `agy`). Run it in a terminal on the computer running Slopify, then **Open to retry** and press **Check again** on the project. |
| A finished video you have not marked uploaded | **Ready to upload** | **Prepare upload** lists everything YouTube Studio asks for, with Copy buttons (Slopify never uploads for you; see [Publishing to YouTube](Publishing-to-YouTube)). **Mark uploaded** takes it off the list, with **Undo** in the notice; Projects still has it. |

A held run also offers **Keep as is**, which takes it off Needs you and leaves the rest unmade (with **Undo**); editing the project brings it back. A run waiting for an [agent's review](Agents-MCP#the-external-agent-reviewer) is not here: it goes on by itself, so it shows under Running now. A step that failed while the run waits on something else shows here as a failed item.

Up to 4 failed runs and 4 videos ready to upload show here; **See all N ready to upload** opens Projects filtered to them. The bundled samples never show as ready to upload. Only the first item's button is lime; the rest are plain buttons. The heading says how many decisions are waiting and how many videos are ready to upload. With nothing waiting and nothing running, Home says **Nothing needs you and nothing is running**. See [Reviews and Checkpoints](Reviews-and-Checkpoints), [Schedules](Schedules) and [Recovery and Retries](Recovery-and-Retries).

### Running now

Videos being made, and runs **Waiting for the agent** (an External agent reviews what they made; they carry on once it answers or after 2 hours), up to 3. Paused runs are under Needs you. Each shows the step it is on, how long each step has taken, the running step's time left (for example `2 of 8 · about 4 min left`), the last few images as they land (with a tile for the one being drawn) and **Images N of M** while drawing. A run waiting for a CLI plan says so instead of the step, for example **Waiting for Codex limits (resets at 14:00)**. Open one to follow it live, pause it or cancel it. With nothing running it says **Start the next video**.

- With more than three running, **See all N running** opens Projects filtered to running.
- Queued runs show as one line under them, for example "Queued, waiting to start (2): Hypatia, Cleopatra", with **See queued** (Projects filtered to queued).

Time left comes from the step's own pace once it has counted something, otherwise from how long the same kind of step took in your finished runs. Past that it says **taking longer than usual**, and with nothing to go by **time left unknown**.

### Coming up

The schedule runs due in the next 7 days, with the template and topic each will use, up to 6. Paused schedules show too. **Calendar** opens the calendar to plan or move runs. With none it says **No scheduled runs this week. Plan some on the calendar.** See [Calendar](Calendar).

### Autopilot

At the top of **Coming up**, one line says how far ahead you are: "9 days of content ready · the queue runs dry on Oct 30". Each run a schedule will make in the next 60 days is a slot; a run made ahead (Prepare) fills its own slot, and each finished video not uploaded yet fills the next empty one. The days count to the first slot nothing fills ("60+" when all of them are filled). **Runs dry** is the first run that will have no topic: the run after a queue's last topic when the schedule doesn't find its own, the first run past the approved topics when new ones wait for approval, and never for a schedule that finds topics by itself unless finding them fails. Paused schedules count for neither.

Below it, warnings name what may stop the schedules before it does, each with the button that opens the fix and **Hide** (hidden for 7 days, or until it changes):

| Warning | Fix |
| --- | --- |
| A CLI a scheduled template uses is signed out | Settings → Providers |
| A CLI plan is at 80% of its weekly or 5-hour limit | Settings → Usage |
| The OpenRouter key has less than 20% of its spending limit left | Settings → Providers |
| Less than 5 GB, or less than 10%, of the disk is free | Settings → Backup & storage |
| A schedule that doesn't find topics has 1 or 2 left | The schedule |
| A schedule's topic generation keeps failing | The schedule |
| A scheduled template or schedule uses a model that is retiring or gone | Templates, or the schedule |

Sign-ins, the OpenRouter key and the disk are checked hourly, the first time 30 seconds after Slopify starts; Home shows the last check and never waits for one. Only the CLIs a scheduled template uses are asked, and asking never starts a run. **Last 7 days**, folded, lists what was made, each failed step with a link to its project, and what it cost. Settings → Notifications → **Weekly report** sends the same to your phone each Monday (see [Notifications](Notifications#weekly-report)).

### This week

Since Monday, for the picked channel:

| Figure | Meaning |
| --- | --- |
| **videos made** | Videos finished since Monday. |
| **spent** | What their provider calls cost. Calls billed to a command-line plan cost nothing per call; **~$X via API** says what they would have cost with API keys. Calls with no known price are counted separately (**N calls without a price**). |
| **weekly <plan> limit** | How much of each command-line plan's weekly limit is used, from the tool's last reading. The bar turns amber at 80%. |

See [Costs and Run Cost](Costs-and-Run-Cost).

## Projects

**Where to find it:** the sidebar → **Projects**.

Every run ever started, newest first unless you pick another order, for the channel picked in the sidebar. The heading says how many projects there are and for which channel. **New project** opens Play.

### Search and filter

1. Type in **Search projects** to match titles.
2. Pick a filter under **Show**:

| Filter | Shows |
| --- | --- |
| **All** | Everything. |
| **Running** | Projects running, and those **Waiting for the agent**: the same runs Home's **See all N running** counts. |
| **Queued** | Projects waiting for their turn in the video queue. |
| **Needs you** | Projects waiting for you: at a review or held step, paused, or **Stopped**. |
| **Ready to upload** | Finished videos not marked uploaded. |
| **Failed** | Failed projects, those **Done with problems**, and runs with a failed step that still wait on something else. |

3. Pick an order beside the filter: **Newest first**, **Recently changed**, **Name (A–Z)** or **Status** (waiting for you first, then running, queued, failed and finished).

The search, the filter and the order are part of the address, so Back from a project, a reload or a link opens Projects the same way: `/projects?show=running` (`queued`, `waiting` for Needs you, `ready` or `failed`), `?q=` for the search words and `?sort=changed`, `name` or `status`. The list draws 50 projects at a time; **Show N more** under it adds the next ones. Press `/` to jump to the search box. The command palette has shortcuts: **Show projects that need you**, **Show videos ready to upload** and **Show failed projects**.

On a wide screen, **At a glance** beside the list counts the projects under each filter.

If nothing matches, the list says **No project matches. Clear the search or pick All.** If the picked channel has no projects, pick **All channels** in the sidebar.

### What each row shows

- A checkbox to select it (see [Work on several projects at once](#work-on-several-projects-at-once)).
- The title, with a **Sample** badge on the bundled samples. A press anywhere on the row opens the project. A long title is cut short; hover it to read all of it.
- For an audiobook that is a chapter of a book, **Book · Chapter N**.
- What it was made of and when: the article prompt and format, for example `Documentary dossier · 16:9 · started …`.
- A progress bar with **N% done** while it runs.
- Its state:

| State | Meaning |
| --- | --- |
| **Running** | A step is being made. A run waiting for a CLI plan says **Waiting for Codex limits (resets at 14:00)** instead. |
| **Paused** | Paused by you or an agent; nothing runs until it is continued. |
| **Queued** | Waiting for its turn in the video queue. |
| **Waiting for your review** | Held at a review or checkpoint. |
| **Waiting for the agent** | An External agent is reviewing what it made; it goes on by itself. |
| **Prepared** | Made ahead by its schedule; only the video is left, for its day. |
| **Stopped** | Stopped before it finished, for example by a restart. Open it and press **Continue the run**. |
| **Kept as is** | What is left was set aside with **Keep as is**. |
| **Done** | Finished. |
| **Done with problems** | Finished, but part of it failed. |
| **Failed** | Stopped with an error. |
| **Canceled** | You canceled it. |

- **Mark uploaded** on a finished video; once marked, an **Uploaded** badge. For a day after marking, **Undo upload mark** puts it back on Ready to upload; after that, select it and press **Mark not uploaded**.
- The delete button (bin icon).

### Work on several projects at once

Tick the checkbox on each row you want, or **Select all** above the list (it covers the rows shown: a search, a filter or Show more changes which). Shift+click ticks every row between two; Esc clears the selection. The bar above the list says how many are selected and offers:

| Button | Does |
| --- | --- |
| **Mark uploaded** | Marks the selected finished videos uploaded. The others are left as they are. |
| **Mark not uploaded** | Shown when a selected video is marked uploaded; puts it back on Ready to upload. |
| **Move to channel…** then **Move to <channel>** | Moves the selected projects to another channel (with more than one channel). |
| **Delete** | Asks first, then moves the selected projects to the trash. Running projects stay: cancel the run first. |
| **Clear selection** | Unticks everything. |

Each one says what it did in a notice with **Undo**: Undo after a delete restores the projects from the trash; after a move it sends each project back to its channel. There is no way to re-run several projects at once: each run costs money and is started from its own project page.

### Delete a project

1. Press the bin icon on its row. While the project is running it is disabled: cancel the run first.
2. Confirm with **Delete project** (or **Keep it** to back out).
3. The project goes to the trash for 30 days. The notice that says so has **Undo**; later, restore it or delete it for good in Settings → **Backup & storage** → **Trash**. See [Trash](Trash).

### The video queue

Videos started together (a batch from Play, for example) run one at a time. The queue itself is on the Calendar, under **Batch queue**, numbered in the order they run (see [Calendar](Calendar#the-batch-queue)); Projects only links to it (**Video queue** → **Open calendar**) and has the **Queued** filter. Pausing a project holds the queue; when one fails or is canceled, the next one starts. The project page has the same list behind a **Queue · N** button in its right rail. See [Templates](Templates) and [Schedules](Schedules) for batches.

### When there are no projects

Projects shows **No projects yet** with **Make your first video** (opens Play), and an invitation to the interactive tutorial with **Start tutorial**.

## Tips

- The sidebar's **N running** link jumps straight to Running now on Home.
- Home and Projects follow the Channel picker. If a project seems missing, switch to **All channels**.
- Updates wait for running work. See [Updating and Patch Notes](Updating-and-Patch-Notes).

## Related pages

- [Project Page](Project-Page)
- [Play Overview](Play-Overview)
- [Channels](Channels)
- [Calendar](Calendar)
- [Schedules](Schedules)
- [Reviews and Checkpoints](Reviews-and-Checkpoints)
- [Publishing to YouTube](Publishing-to-YouTube)
- [Keyboard Shortcuts and Command Palette](Keyboard-Shortcuts-and-Command-Palette)
