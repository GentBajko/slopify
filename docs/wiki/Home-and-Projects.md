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
| Destinations | **Home**, **Projects**, **Calendar** (also lit on Schedules), **Channels**, **Library** (Prompts, Intros & Outros, Templates, Document themes, Narration aliases), **Settings** (also lit on Usage). |
| **N running** | Shown while runs are going. It links to Running now on Home. |
| **Channel** | The channel picker (see below). |
| **New video** | Opens Play (`C` from anywhere). |
| Links | **GitHub**, **Patreon** and **Buy Me a Coffee**, each opening in a new tab. |
| Foot | "Free. Your keys, your machine.", the updates button (circular arrows, see [Updating and Patch Notes](Updating-and-Patch-Notes)) and the tutorial button (question mark, **Start interactive tutorial**). |

### On a phone

Below 768 pixels wide the sidebar is hidden. A slim bar at the top holds the logo, the search button, the running count, the GitHub, Patreon and Buy Me a Coffee icons, the updates button and the tutorial button. A bottom bar has five destinations: Home, Projects, Calendar, Library and Settings. Channels is reachable from the command palette, and the Channel picker sits at the top of Home.

### Rows open with one press

In every list, a press anywhere on a row or tile opens or picks it, not only on its name: projects, Home items, calendar entries, channels, schedules, Library lists, samples, saved drafts and media tiles. The buttons on a row still do their own thing.

### The command palette

Press `Ctrl+K`, or click **Search or run a command**, to jump anywhere or run an action by typing. The **Go to** group has **Open home**, **Open projects**, **Open calendar**, **Open schedules**, **Open channels**, **Open library**, **Open settings**, **Open usage and costs** and **Show patch notes**. **New video** opens Play. The **Channel** group has **Show all channels** and **Switch to <channel>**. See [Keyboard Shortcuts and Command Palette](Keyboard-Shortcuts-and-Command-Palette).

### The Channel picker

The **Channel** picker near the foot of the sidebar (at the top of Home on a phone) shows Home and the other screens for one channel, or for **All channels**. It only filters what you see: projects, schedules and costs of other channels keep running. Slopify remembers your choice in this browser. See [Channels](Channels).

## Home

**Where to find it:** the sidebar → **Home**.

The page title is the channel you picked (or **Home**), under today's date. At the top right are **Open calendar** and **New video**.

On a fresh install, Home sends you to the first-run screen once. See [First Launch and Welcome](First-Launch-and-Welcome).

### Needs you

Things that don't move on until you act:

| Item | Status | Button |
| --- | --- | --- |
| A run held at a review before a step | **Waiting for you · review before the narration** (or the images, or the video) | **Approve the article and record**, **Approve and draw the images** or **Approve and render**. Approving here lets the run continue. Open the project to look first. |
| A run whose next step is held another way | **Waiting for you** | **Open to continue** |
| A run you paused | **Paused** | **Open to continue** |
| Topics a schedule suggested | **N new topics** | **Review topics**, on the calendar: queue the ones you want and reject the rest. |
| A failed run | **Failed · <step>**, with a short reason | The fix to try: a button to Settings → Providers or Storage when that is the fix, otherwise **Open to retry**. |
| A run that failed because a CLI is signed out | **Failed · <step>** | **Copy sign-in command** copies the command (`claude auth login`, `codex login` or `gemini`). Run it in a terminal on the computer running Slopify, then **Open to retry** and press **Check again** on the project. |

Up to 4 failed runs show here. Only the first item's button is lime; the rest are plain buttons. The heading says how many things are waiting, or **Nothing is waiting for a decision**. See [Reviews and Checkpoints](Reviews-and-Checkpoints), [Schedules](Schedules) and [Recovery and Retries](Recovery-and-Retries).

### Running now

Videos being made or paused, up to 3. Each shows the step it is on, how long each step has taken, the running step's time left (for example `2 of 8 · about 4 min left`), the last few images as they land (with a tile for the one being drawn) and **Images N of M** while drawing. A run waiting for a CLI plan says so instead of the step, for example **Waiting for Codex limits (resets at 14:00)**. Open one to follow it live, pause it or cancel it. With nothing running it says **Start the next video**.

- With more than three running, **See all N running** opens Projects filtered to running.
- Queued runs show as one line under them, for example "Queued, waiting to start (2): Hypatia, Cleopatra", with **See queued** (Projects filtered to queued).

Time left comes from the step's own pace once it has counted something, otherwise from how long the same kind of step took in your finished runs. Past that it says **taking longer than usual**, and with nothing to go by **time left unknown**.

### Coming up

The schedule runs due in the next 7 days, with the template and topic each will use, up to 6. Paused schedules show too. **Calendar** opens the calendar to plan or move runs. With none it says **No scheduled runs this week. Plan some on the calendar.** See [Calendar](Calendar).

### Ready to upload

Finished videos you have not marked uploaded, up to 4. The bundled samples never show here.

- **Prepare upload** lists everything YouTube Studio asks for, with Copy buttons. Slopify never uploads for you. See [Publishing to YouTube](Publishing-to-YouTube).
- **Mark uploaded** takes the video off this list. Projects still has it.

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

Every run ever started, newest first, for the channel picked in the sidebar. The heading says how many projects there are and for which channel. **New video** opens Play.

### Search and filter

1. Type in **Search projects** to match titles.
2. Pick a filter under **Show**:

| Filter | Shows |
| --- | --- |
| **All** | Everything. |
| **Running** | Running and paused projects. |
| **Queued** | Projects waiting for their turn in the video queue. |
| **Needs you** | Projects waiting at a review or held step. |
| **Ready to upload** | Finished videos not marked uploaded. |
| **Failed** | Failed projects and those **Done with problems**. |

The filter is part of the address, so a link can open Projects on it: `/projects?show=running`, `queued`, `waiting` (Needs you), `ready` or `failed`. Press `/` to jump to the search box. The command palette has shortcuts: **Show projects that need you**, **Show videos ready to upload** and **Show failed projects**.

On a wide screen, **At a glance** beside the list counts the projects under each filter.

If nothing matches, the list says **No project matches. Clear the search or pick All.** If the picked channel has no projects, pick **All channels** in the sidebar.

### What each row shows

- The title, with a **Sample** badge on the bundled samples. A press anywhere on the row opens the project.
- For an audiobook that is a chapter of a book, **Book · Chapter N**.
- What it was made of and when: the article prompt and format, for example `Documentary dossier · 16:9 · started …`.
- A progress bar with **N% done** while it runs.
- Its state:

| State | Meaning |
| --- | --- |
| **Running** | A step is being made. A run waiting for a CLI plan says **Waiting for Codex limits (resets at 14:00)** instead. |
| **Paused** | Paused by you; nothing runs until you resume. |
| **Queued** | Waiting for its turn in the video queue. |
| **Waiting for you** | Held at a review or checkpoint. |
| **Done** | Finished. |
| **Done with problems** | Finished, but part of it failed. |
| **Failed** | Stopped with an error. |
| **Canceled** | You cancelled it. |

- **Mark uploaded** on a finished video; once marked, an **Uploaded** badge with **Undo**.
- The delete button (bin icon).

### Delete a project

1. Press the bin icon on its row. While the project is running it is disabled: cancel the run first.
2. Confirm with **Delete project** (or **Keep it** to back out).
3. The project goes to the trash for 30 days. Restore it or delete it for good in Settings → **Trash**. See [Trash](Trash).

### The video queue

Videos started together (a batch from Play, for example) run one at a time. The queue itself is on the Calendar, under **Batch queue**, numbered in the order they run (see [Calendar](Calendar#the-batch-queue)); Projects only links to it (**Video queue** → **Open calendar**) and has the **Queued** filter. Pausing a project holds the queue; when one fails or is cancelled, the next one starts. The project page has the same list behind a **Queue · N** button in its right rail. See [Templates](Templates) and [Schedules](Schedules) for batches.

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
