# Notifications

Runs can take a while, so Slopify can tell you when one needs you: in the browser, or on your phone through a Notification URL such as an ntfy topic.

**Where to find it:** **Settings → Notifications**.

## When Slopify notifies you

| Event | Message |
|---|---|
| A run **finishes** | "Video ready: *title*", or "Run finished: *title*" for a run that makes audio only |
| A run **finishes with problems** | "Video ready with problems: *title* — *reason*": the video was made but another step failed |
| A run **fails** | "Run failed: *title* — *reason*", with the first line of the reason |
| A step **fails while the run waits on something else** | "Step failed: *title* — *reason*". Only when another step is waiting: an agent's check, your approval at a pause, or the day of a video made ahead. See [Step failed](#step-failed). |
| A run **stops to wait for you** | "Waiting for you: *title*": a pause is holding the next step, or the work left is waiting for **Continue the run** |
| An agent's check **passed without an answer** | "Passed without review: no agent answered in 2 h", naming the project and the item. See [Agents (MCP)](Agents-MCP#if-no-agent-answers). |
| An AI check **needs a decision** | "Review needs a decision: <title>", when an AI check flags an item and keeps it (its redos ran out, or the stage only flags). It says what was flagged and to press **Overrule** or **Redo** on the project. Sent once per verdict. |
| A schedule has **new topics waiting** for approval | For example "5 new topics are waiting for you" |

Pausing or cancelling a run yourself sends nothing, and neither does a project that was already finished when the page loaded. A run waiting for an [agent's check](Agents-MCP#your-own-ai-agent-as-the-checker), or a video made ahead waiting for its day, sends no "Waiting for you": nobody needs to act. A message holds the project title and what happened, never your keys, prompts or files.

A run an [agent](Agents-MCP) started ends its messages with **· started by agent**, and a flag from an agent's check ends with **· by agent**.

### Step failed

An ordinary run tells you once, at its end: "Run failed" or "Video ready with problems", with the end chime. A step that fails on the way is named there, not in a message of its own.

"Step failed" is for the other case: a step fails while another step of the run is waiting (for an agent's check, your approval at a pause, or the day of a video made ahead). The run is not over and may wait for hours, so Slopify tells you right away instead of at the end. The project still reads by what it waits for, and the failed step shows on its page with its fix.

Each failure is told once. A restart neither repeats a message already sent nor loses one: what was told is saved. A step that fails again after **Try again** is a new failure and is told again. If the run later ends **Failed** on failures already told, no second "Run failed" goes out.

### On the page, always

The end of a run is also said on the page itself, whatever the switches below say: while a Slopify tab is open, a notice in the corner reads "Video ready: *title*" with **Watch** (the project's Video part), "Run finished: *title*" with **Open** for a run without a video, or "Run failed: *title* — *reason*" with **Open**, which stays until you close it. With several tabs open, one of them shows it.

### While you were away

When you come back to a Slopify tab after more than two minutes away (or open one after closing it), one notice sums up what happened meanwhile, for example "While you were away: 2 runs finished, 1 step failed beside a wait, 1 run waits for you.", with **Open Home**. It counts runs that finished, runs that failed, steps that failed beside a wait, and runs that started waiting for you. Runs waiting for an agent or for their day are not counted as waiting for you. It works from this browser's own memory of what it last saw, with no setting.

## Turn on browser notifications

Browser notifications work while any Slopify tab is open, on any page, even in the background.

1. Open **Settings → Notifications**.
2. Turn **Notify me in this browser** on. The browser asks for permission now (never when the page loads). Allow it.
3. Press **Send test notification**, which appears beside the switch once it is on, to check. You should see "Test notification sent to this browser."

What to expect:

- With several Slopify tabs open you get one notification, not one per tab.
- Clicking a run notification opens the project. Clicking a new-topics notification opens the calendar's **Suggested topics**.
- The setting applies to this browser only. Turn it on in each browser you use.
- Default: off.

### If the browser blocked notifications

If you blocked notifications for Slopify earlier, Slopify says "Notifications are blocked for this site". To fix it:

1. Click the icon left of the address bar and open the site settings.
2. Allow notifications.
3. Reload the page.
4. Turn **Notify me in this browser** on again.

Some browsers only allow notifications from installed apps. If the test says so, use a Notification URL instead.

## Sounds when a run starts and ends

**Settings → Notifications → Play a sound when a run starts and ends** (on by default) plays a chime when a run starts and a different, longer one when it finishes, fails or stops to wait for you, like a message arriving on a phone. A "Step failed" plays the end chime too. **Hear the start sound** and **Hear the end sound** play them.

- Works while any Slopify tab is open; only one tab plays each chime.
- Needs no permission, but browsers keep a page silent until it has been clicked once, so click anywhere in Slopify after opening it.
- With **Notify me in this browser** on too, a run's start also shows "Started: *title*".
- It is this browser's own setting. Your computer's volume sets how loud.

## Get notifications on your phone (Notification URL)

A Notification URL works with no Slopify tab open. When a run finishes, fails or waits, a step fails beside a wait, an AI check needs a decision or passes without an agent's answer, Slopify sends that address one `POST` with a short plain-text body. Its last line is the project's link, so you can open it straight from the message, for example:

```
Video ready: Black holes explained
Open the project to watch it.
http://localhost:6969/projects/…
```

The link uses the address and port Slopify runs on (`localhost` when it listens on all addresses or on 127.0.0.1), so it opens on the computer running Slopify or one that can reach it. Messages about new topics have no link.

### Set it up with ntfy

1. Install the [ntfy](https://ntfy.sh) app on your phone.
2. Subscribe to a topic with a long random name, such as `slopify-7f3k9q2m8x`. Anyone who knows the name can read it, so treat it like a password.
3. In Slopify, open **Settings → Notifications** and paste `https://ntfy.sh/<your-topic>` into **Notification URL**. Your own ntfy server works too.
4. Press **Save**. Slopify says "Notification URL saved."
5. Press **Send test notification**. The message should arrive on your phone.

To turn it off, clear the field and press **Save**.

### Rules for the address

- Only `http://` and `https://` addresses are accepted, without a user name or password in them.
- Any address that accepts a `POST` works, not just ntfy.
- Each message is sent once, with a 5-second timeout, and is never retried. A failure is written to the log and does not affect the run.
- The address stays on this machine: backups leave it out.
- [Agents](Agents-MCP) never see the address, only whether one is configured. They may set a new one.
- In [Docker](Docker) the request goes out from the container, so the address must be reachable from there. `localhost` means the container itself.

## Weekly report

Settings → Notifications → **Weekly report** sends last week in one message to the Notification URL: how many videos were made, each failed step with its project and reason (the first ten, then a count), what it cost, and how much of each CLI plan's week is used. It goes out once a week, on Monday from 09:00 in this computer's time zone; if Slopify was off on Monday, it goes out the next time it runs that week. It needs a Notification URL. A send that fails is tried again 15 minutes later. Default: off.

Home shows the same last 7 days under **Coming up** (see [Home and Projects](Home-and-Projects#autopilot)).

## Tips

- Turn on both: browser notifications while you are at the computer, ntfy for when you walk away.
- Pair notifications with [pauses](Reviews-and-Checkpoints) so a run that waits for your review tells you right away.

## Related pages

- [Settings reference](Settings-Reference)
- [Schedules](Schedules)
- [Calendar](Calendar)
- [Pauses and checks](Reviews-and-Checkpoints)
- [Agents (MCP)](Agents-MCP)
- [Troubleshooting](Troubleshooting)
