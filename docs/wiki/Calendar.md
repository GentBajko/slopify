# Calendar

The calendar shows the coming four weeks on one screen: how much needs you, every scheduled run with the topic and title it will use, the projects running or finished on their day, and the batch queue. You can drag a topic to another day, move it to another schedule, add topics, and accept or reject topics Slopify suggested.

**Where to find it:** **Calendar** in the rail. It has two tabs: **Coming weeks**, described here, and **Schedules**, where you create, edit, pause and resume the schedules themselves (see [Schedules](Schedules)).

## What the calendar shows

The calendar starts on this week's Monday and shows four weeks, Monday to Sunday.

- **Scheduled runs**, each with the project title it will make. A run shows **Queued** when a topic is lined up, **Needs a topic** when its topic is still waiting for your approval or for generation, and **Paused** when its schedule is paused.
- **Needs you**, above the weeks: one line with Home's counts of what waits on you and what is ready to upload (see below).
- **Projects** running or finished on their day, with their state: **Running**, **Waiting for the agent**, **Paused**, **Queued**, **Waiting for your review**, **Waiting for its day**, **Stopped**, **Kept as is**, **Failed**, **Done with problems**, **Done** or **Canceled**. A project waiting for a CLI plan says so, for example **Waiting for Codex limits (resets at 14:00)**.
- **Waiting to start**: the batch queue, videos started together that wait their turn (see below).
- **Suggested topics**, beside the weeks, for schedules that hold generated topics for approval.

The calendar follows the channel picked under **Showing:** in the page header, or shows every channel. See [Channels](Channels).

Each queued run has **Make ahead**, which makes everything but its video now (and spends what the run costs) and leaves only putting the video together for its day; such a run shows **Waiting for its day** and **Open**. See [Schedules](Schedules#make-a-video-ahead).

## Needs you

Above the weeks, one line says what Home's **Needs you** and **Finished** count, in Home's words, for every project of the channel shown (not only the ones in these weeks), for example "1 decision · 1 failed · 2 ready to upload. Open Home to act on them.", with **Open Home**. Decisions are projects held at a pause, paused or **Stopped**; failed are the failed projects and the steps that failed beside a wait; ready to upload are finished videos not marked uploaded. It is hidden when there is nothing, and the bundled samples never count.

Acting on them is Home's job: **Needs you** there lists each one with its button. The calendar keeps its space for what is planned. See [Home and Projects](Home-and-Projects), [Pauses and Checks](Reviews-and-Checkpoints) and [Publishing to YouTube](Publishing-to-YouTube).

## The batch queue

Videos started together, such as extra videos queued from Create, run one at a time. **Waiting to start** is the same list as Home's: the videos still to start, numbered in the order they start (**1.**, **2.**, …), each marked **Queued** (or **Paused**) with **Earlier**, **Later** and **Remove**. Its heading says how many there are; the one already running is on Home under **Running**. Pausing the started project holds the whole queue, and the list says so; when one fails or is canceled, the next one starts. It follows the channel shown under **Showing:**, and is hidden when nothing waits.

## Switch between weeks and a list

Use **Show the weeks as** at the top:

- **Grid** (the default) shows the four weeks as a grid.
- **List** shows the same runs day by day, with buttons to move each topic.

This browser remembers your choice.

## Move a topic to another day

**With a mouse:** drag the topic onto another day of the same schedule's runs. The topic takes that run.

**With the keyboard:** focus the topic and press `Alt+Left` or `Alt+Up` to move it earlier, `Alt+Right` or `Alt+Down` to move it later.

**In the list view:** press the move-earlier or move-later arrow button on the topic's row.

Earlier and later swap the topic with its neighbour in the same schedule's queue, so it takes the other's run. No schedule runs outside its own times, so a topic can only land on a day where its schedule has a run. A drop the calendar can't carry out (a day with no run, or a run with no queued topic) says why.

## Move a topic to another schedule

- **With a mouse:** drop the topic onto another schedule's run. It joins that schedule's queue at that place.
- **In the list view:** open the **Move to…** menu on the topic's row and pick the schedule. The topic goes to the end of that schedule's queue and takes its next free run.

The topic now runs with the other schedule's template.

## Add topics

1. Press **Add topics to a schedule**.
2. Pick the **Schedule** the topics join. Only active and paused schedules are listed, each with the number of topics already queued.
3. Type or paste **Topics, one per line**. Blank lines are skipped.
4. Press **Add N topics** (the button counts them). **Cancel** closes the form without adding anything.

The topics go to the end of the schedule's queue, in order, and take its next free runs. Each topic fills the schedule's topic keyword; every other keyword keeps its every-run value. To give topics their own values, edit the schedule's topics as a table on the **Schedules** tab (see [Schedules](Schedules)).

If you have no schedule yet, the calendar offers **Create a schedule**.

## Accept or reject suggested topics

Schedules set to **Generate and hold for approval** list their suggestions under **Suggested topics**, one block per schedule.

- **Queue** adds a topic to the end of that schedule's queue.
- **Reject** drops it for good; it is never suggested again.
- **Queue all** adds every suggestion of that schedule, in order.
- **Suggest topics now · 1 AI call** asks the schedule's AI for more at once.

While Slopify is asking, the panel says so and the topics appear when it finishes. If the last try failed, the panel says so with the reason. When nothing is waiting it says **No suggestions are waiting.**

Editing a suggestion's words before approving it is done under **Topics waiting** on the schedule itself.

## The Schedules tab

**Schedules**, the calendar's second tab, is where the schedules themselves live: the list with **Edit**, **Pause** or **Resume** and **Delete** on each row, **New schedule**, and the picked schedule's detail with its queued topics, topics waiting for approval and run history. The number beside the tab counts the schedules that aren't deleted. Links to the old schedules page open this tab. See [Schedules](Schedules).

## Tips

- Use the list view if dragging is fiddly, for example on a touch screen or a narrow window.
- A browser notification for new suggestions opens the calendar's **Suggested topics** when you click it. See [Notifications](Notifications).
- `Ctrl+K` → **Add topics to a schedule** works from any screen: it opens the calendar with the form. `G` then `C` goes to the calendar.
- To change a schedule's queued topics one by one (rename, reorder, remove), use the **Schedules** tab. See [Schedules](Schedules#edit-the-queued-topics-in-place).
- To start one video right now instead of waiting for a run, use [Create](Create-Overview).

## Related pages

- [Schedules](Schedules)
- [Templates](Templates)
- [Channels](Channels)
- [Home and Projects](Home-and-Projects)
