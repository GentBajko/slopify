# Schedules

A schedule starts a new project from a saved template at a set local time: every day, on chosen weekdays, or once. Give it a list of topics and each run takes the next one. Turn on topic generation and it asks your text model for new topics before the list runs dry.

**Where to find it:** **Calendar → Edit schedules** (the `/schedules` page sits under the Calendar item in the left rail). A channel's **Schedules** tab lists the schedules that run its templates.

## Before you start

- A schedule runs a **template**, so save one first: see [Templates](Templates).
- Runs only start while Slopify is open on this machine. If you want it running all the time, see [Start at login](Start-at-Login) or [Docker](Docker).
- Each run costs what that template's project costs. Set a **Spend ceiling** to stop an unexpectedly expensive run.

## Create a schedule

1. Open **Calendar**, then **Edit schedules**, and press **New schedule**.
2. Fill in **Name** (up to 200 characters). It never appears in the videos.
3. Pick the **Template** each run starts from. The schedule keeps the template's current version.
4. Choose the **Cadence** and times (see below).
5. Add **Topics** (see below), or leave the list empty to run the template exactly as saved.
6. Optional: set up **Topic generation**, a **Spend ceiling** and what happens to a **Missed run**.
7. Press **Save schedule**.

The schedule appears under **Saved schedules** with its status, next run and the title that run will get.

## When it runs

| Setting | What it does | Default |
|---|---|---|
| **Cadence** | **Every day** runs once a day at the local time. **Selected weekdays** runs on the days you tick. **One time** runs once at a date and time, then shows as completed. Each run starts one project. | Every day |
| **Local time** | The clock time each run starts, read in the timezone below. | 09:00 |
| **Weekdays** | The days a Selected weekdays schedule runs. Tick at least one; each ticked day is one project a week. | Mon, Wed and Fri |
| **Run at** | The date and time of a One time schedule's single run. | |
| **Timezone** | An IANA zone name such as `Europe/Tirane` or `America/New_York`. When clocks go back, a repeated time uses the earlier one. When clocks go forward, a skipped time moves forward by the gap (a One time schedule refuses a time that doesn't exist; pick another). | This computer's zone |
| **Missed run** | What happens to a run that came due while Slopify was closed or asleep. **Skip if Slopify was closed** drops a run that is more than 1 minute late and waits for the next time. **Run once when Slopify reopens** starts one catch-up run, however many were missed. | Skip |
| **Spend ceiling** | The most one run may cost, in US cents: `500` is $5.00. Before each run Slopify estimates the project's cost. When the high estimate is over the ceiling, or the cost can't be estimated, the run fails instead of starting. Leave it empty for no ceiling. | Empty |

A schedule never runs two projects at once. If the previous run is still going when the next one comes due, the new run is skipped with the reason "the previous run of this schedule was still going". The detail panel shows this as **Overlap: Skip**.

## Topics

Each run takes the first topic, starts one project with it and removes it from the list. When the list is empty the schedule completes, unless topic generation is on. With no topics and generation off, every run uses the template as saved. A schedule holds up to 500 topics.

### Which keyword a topic fills

**Each topic fills** is the template keyword a topic replaces, such as `{{Topic}}`. By default it is the keyword the template's project title uses, or else the first one. If the title doesn't use this keyword, every project gets the same title.

Every other keyword of the template has an **Every-run value**: the value it gets on every run, such as a word count. The default is the template's own value. A topic can set its own value for any keyword, which wins for that one run.

### Three ways to write the list

**How to write the topics** switches between three views of the same list. Switching keeps everything.

**One per line.** Type or paste one topic per line. Blank lines are skipped. The first line is the next run. Each topic fills only the topic keyword; every other keyword uses its every-run value. A line that matches a topic already in the queue keeps that topic's own values.

**Table.** One row per run, in order. The first column fills the topic keyword. **Set a keyword per topic…** adds a column for another keyword; each cell sets that keyword for that row's run only, and a blank cell uses the every-run value. The **×** in a column's header drops the column. **Project title** shows the title each row will make.

**YAML / JSON.** The same list as text, for pasting or keeping in a file. Write a plain list, or one map per topic with the topic under the topic keyword and a line for each other keyword it sets:

```yaml
- Topic: The Library of Alexandria
  Min. Word Count: 12000
- The Antikythera mechanism
```

A JSON array of the same shape works too. Values are read as the text written, so `12000`, `yes` and `0012` stay text. The schedule refuses, naming the topic number and key:

- a value that is a list or a map,
- a key that is not a keyword of the template,
- a map without the topic keyword,
- a topic missing a keyword that has no every-run value,
- a value over 2,000 characters.

The schedule saves only once the list reads. **Copy as YAML** and **Export as YAML** give you the queue in this shape.

## Topics that find themselves

Under **Topic generation**, a schedule can ask an LLM for its next topics so it never runs dry.

| Setting | What it does | Default |
|---|---|---|
| **New topics** | **Off: add topics yourself.** **Generate and queue directly:** new topics join the end of the list. **Generate and hold for approval:** they wait under **Topics waiting**, and beside the calendar, until you approve them. | Off |
| **Series brief** | What the series covers, its style and what makes a topic worth a video. Only topic generation reads it. Leave it empty to use the channel's series brief from the channel's **Brand** tab. Up to 4,000 characters. | Empty |
| **Keep at least this many queued** | Slopify asks for more topics whenever the queue, plus topics waiting for approval, drops below this number. From 1 to 100. | 10 |
| **Topic generation LLM** | Ticked, it uses the provider and model the template writes with. Untick to pick another **Provider** and **Model**, such as a cheaper one. | The template's LLM |

### How generation works

1. When the queue (plus held topics) drops below your number, Slopify starts one generation in the background. It checks about every 15 seconds.
2. It makes one LLM call for what is missing plus 5 spare, at most 50 topics.
3. The call carries the series brief and every title already known: this schedule's queued, held, rejected and used topics, every project's title, and the channel's **Existing videos** (see [Channels](Channels)).
4. Suggestions come back ranked most view-worthy first. Slopify drops near-duplicates of titles it already knows, for example "Hypatia" and "Hypatia's Library" count as one video, while "Ptolemaic Egypt" and "Roman Egypt" are two.
5. The rest join the queue, or wait for you under **Topics waiting**.

Only one generation per schedule runs at a time. A failed try shows its reason on the schedule and is tried again 5 minutes later, not in a loop. A schedule with generation on keeps going when its queue empties; a run that finds no topic is skipped with the reason, instead of running the template without one.

### Generate topics now

Press **Generate topics now** to ask for new topics at once: at least 5, even when the queue is full and even during the 5-minute wait after a failed try. It is one LLM call. Saving the schedule also clears the wait.

### Approve held topics

When **New topics** is **Generate and hold for approval**, suggestions wait under **Topics waiting** on the schedule (and under **Suggested topics** on the [Calendar](Calendar)):

- **Approve** adds one to the end of the queue.
- **Edit** changes its words first.
- **Reject** drops it for good; it is never suggested again.
- **Approve all** queues every one in order.

Waiting topics count toward **Keep at least**, so nothing more is asked for while they wait. If you set a Notification URL, you get a message such as "5 new topics are waiting for you"; see [Notifications](Notifications).

## Manage a schedule

Pick a schedule in the list to see its detail: **When**, **Timezone**, **Next run**, **Topics** left, **Missed runs**, **Overlap**, **Spend ceiling** and its **Run history**.

| Action | What it does |
|---|---|
| **Edit** | Opens the **Edit schedule** form on the right. Only an active or paused schedule can change. Press **Save changes**. |
| **Pause** / **Resume** | Stops runs until you resume. Only an active schedule can pause. |
| **Cancel schedule** | Stops future runs for good. Existing projects and run history are kept. |
| **Delete schedule** | Moves the schedule to **Settings → Trash** for 30 days. Its run history is kept. Restore brings it back paused. |
| **Filter schedules by channel** | Shows only one channel's schedules. |

**Run history** lists each run with its status (running, done, failed, skipped and so on), the time it was due, and either the project it made or the reason it didn't run. Deleted schedules are listed under **Deleted schedules** at the bottom; pick one to see its history.

## Use a newer template version

A schedule keeps the template version it was set up with, so saving a newer template doesn't change what the schedule makes. To switch, edit the schedule, pick the template again in **Template**, and save.

## Tips

- Try the template once from Play before scheduling it, so you know what one run costs. Then set the **Spend ceiling** a little above that.
- Hold generated topics for approval at first. Once you trust the suggestions, switch to queue directly.
- Write a clear series brief: what the series covers, the tone, and what makes a topic worth a video. Add your older videos under the channel's **Existing videos** so they aren't suggested again.

## Related pages

- [Calendar](Calendar)
- [Templates](Templates)
- [Channels](Channels)
- [Notifications](Notifications)
- [Costs and run cost](Costs-and-Run-Cost)
- [Start at login](Start-at-Login)
