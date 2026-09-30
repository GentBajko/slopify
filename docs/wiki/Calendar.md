# Calendar

The calendar shows the coming four weeks on one screen: what needs you, every scheduled run with the topic and title it will use, the projects running or finished on their day, and the batch queue. You can drag a topic to another day, move it to another schedule, add topics, and accept or reject topics Slopify suggested.

**Where to find it:** **Calendar** in the sidebar. It has two tabs: **Coming weeks**, described here, and **Schedules**, where you create, edit, pause and resume the schedules themselves (see [Schedules](Schedules)).

## What the calendar shows

The calendar starts on this week's Monday and shows four weeks, Monday to Sunday.

- **Scheduled runs**, each with the project title it will make. A run shows **Queued** when a topic is lined up, **Needs a topic** when its topic is still waiting for your approval or for generation, and **Paused** when its schedule is paused.
- **Needs you**, above the weeks: every project that is waiting on you or ready to upload (see below).
- **Projects** running or finished on their day, with their state: **Running**, **Paused**, **Waiting**, **Failed**, **Done with problems**, **Done** or **Canceled**. A project waiting for a CLI plan says so, for example **Waiting for Codex limits (resets at 14:00)**.
- **Batch queue**: projects waiting to start (see below).
- **Suggested topics**, beside the weeks, for schedules that hold generated topics for approval.

The calendar follows the channel picked in the sidebar, or shows every channel. See [Channels](Channels).

Each queued run has **Prepare**, which makes its video ahead of the day and leaves only the render for the day; a prepared run shows **Prepared** and **Open**. See [Schedules](Schedules#prepare-a-video-ahead).

## Needs you

Above the weeks, **Needs you** lists what cannot move on without you, then what is ready to upload. Its heading counts them, for example "2 waiting for you · 1 ready to upload". It is hidden when there is nothing.

| Item | Status | Button |
| --- | --- | --- |
| A failed project | **Failed** | **Open to fix** |
| A project you paused | **Paused** | **Open to continue** |
| A project held at a review checkpoint, or with an automatic review that flagged an item and waits for **Overrule** or **Redo** | **Waiting for your review** | **Open to review** |
| A finished video not marked uploaded | **Ready to upload** | **Prepare upload** |

The bundled samples never show here. A press anywhere on an entry opens its project. See [Reviews and Checkpoints](Reviews-and-Checkpoints) and [Publishing to YouTube](Publishing-to-YouTube).

## The batch queue

Videos started together, such as extra videos queued from Play, run one at a time. **Batch queue** lists them in the order they run, numbered (**1 in line**, **2 in line**, …), each marked **Running now**, **Waiting its turn** or **Paused**. Its heading says how many are waiting to start. Pausing a queued project holds the whole queue; when one fails or is cancelled, the next one starts. The batch queue is only shown on the calendar; Projects links here and has a **Queued** filter. It is hidden when nothing is queued.

## Switch between weeks and a list

Use **Calendar view** at the top:

- **Weeks** (the default) shows the four weeks as a grid.
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

1. Press **Add to calendar**.
2. Pick the **Schedule** the topics join. Only active and paused schedules are listed, each with the number of topics already queued.
3. Type or paste **Topics, one per line**. Blank lines are skipped.
4. Press **Add N topics** (the button counts them). **Keep the calendar as it is** closes the form without adding anything.

The topics go to the end of the schedule's queue, in order, and take its next free runs. Each topic fills the schedule's topic keyword; every other keyword keeps its every-run value. To give topics their own values, edit the schedule's topics as a table on the **Schedules** tab (see [Schedules](Schedules)).

If you have no schedule yet, the calendar offers **Create a schedule**.

## Accept or reject suggested topics

Schedules set to **Generate and hold for approval** list their suggestions under **Suggested topics**, one block per schedule.

- **Queue** adds a topic to the end of that schedule's queue.
- **Reject** drops it for good; it is never suggested again.
- **Queue all** adds every suggestion of that schedule, in order.
- **Suggest topics now** asks the schedule's LLM for more at once (one LLM call).

While Slopify is asking, the panel says so and the topics appear when it finishes. If the last try failed, the panel says so with the reason. When nothing is waiting it says **No suggestions are waiting.**

Editing a suggestion's words before approving it is done under **Topics waiting** on the schedule itself.

## The Schedules tab

**Schedules**, the calendar's second tab, is where the schedules themselves live: the list with **Edit**, **Pause** or **Resume** and **Delete** on each row, **New schedule**, and the picked schedule's detail with its queued topics, topics waiting for approval and run history. The number beside the tab counts the schedules that aren't deleted. Links to the old schedules page open this tab. See [Schedules](Schedules).

## Tips

- Use the list view if dragging is fiddly, for example on a touch screen or a narrow window.
- A browser notification for new suggestions opens the calendar's **Suggested topics** when you click it. See [Notifications](Notifications).
- `Ctrl+K` → **Add to calendar** works from any screen: it opens the calendar with the form. `G` then `C` goes to the calendar.
- To change a schedule's queued topics one by one (rename, reorder, remove), use the **Schedules** tab. See [Schedules](Schedules#edit-the-queued-topics-in-place).
- To start one video right now instead of waiting for a run, use [Play](Play-Overview).

## Related pages

- [Schedules](Schedules)
- [Templates](Templates)
- [Channels](Channels)
- [Home and Projects](Home-and-Projects)
