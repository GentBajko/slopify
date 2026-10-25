# Recovery and Retries

Calls to the services fail now and then: a rate limit, a timeout, a dropped connection, a refused prompt. Slopify retries what time can fix by itself, waits for used-up CLI plans instead of failing, and for everything else puts one button on the project page that fixes the cause or walks you through it. Work already made is never thrown away.

**Where to find it:** a project → the next action in the title row, and the failed step's own part.

## What happens when a call fails

Slopify handles a failed call to a service in three tiers:

| Tier | What happens | You see |
| --- | --- | --- |
| 1. Quick retries | The call is tried up to four times in about 40 seconds: the first try plus retries after 2, 8 and 30 seconds. A service's own Retry-After (up to a minute) replaces the fixed wait. | Nothing; the step keeps running. |
| 2. Waiting it out | If the quick retries run out on a failure time can fix, the step is not failed. It waits and runs again by itself, up to four more times, after about 2, 4, 8 and 16 minutes (about half an hour in all). Each wait is spread by a quarter either way, and is never shorter than the service's Retry-After. | **Waiting to try again**: "Images will try again by itself at 14:05." No button; the run carries on when it does. |
| 3. Failed | When the waits are used up, or the failure is one time cannot fix, the step fails and says why. | **Failed**, the error, and a fix-it or **Try ... again** button. |

### What is waited out

- Rate limits (HTTP 429 and each service's own rate-limit errors).
- Timeouts.
- Dropped calls: a connection that never reached the service or broke mid-answer, a server error at the service (5xx), or a CLI the system killed mid-run.

### What is never retried

- A refusal by a content filter.
- A key the service rejected, or no key saved.
- A request the service does not support.
- A lost CLI submission (Slopify cannot tell whether the CLI already did the work).

These are the service's final answer, and retrying would only spend your money again.

A service asking for a wait longer than an hour (a daily quota) is reported as a failure rather than waited out.

### Time limits per call

| Kind of call | Time limit per attempt |
| --- | --- |
| Text and narration | 120 seconds |
| Image | 300 seconds |
| Image animated into a clip | 900 seconds |

A call that passes its limit is stopped (a streamed call when it sends nothing for that long), and the message says so, for example "The AI model did not answer within 120 seconds. It may be overloaded: wait a few minutes, then use Try again, or choose another model in Edit settings → Article → Written by."

### Waits survive a restart

The wait is saved in the database, so quitting or restarting Slopify keeps it: the step runs again when its time comes. While it waits the project reads as running. **Pause** holds it.

## Waiting for CLI plan limits

When Claude Code, Codex or Antigravity says your plan allowance is used up, the call does not fail: it waits. Slopify stores the reset time for that CLI, and every call to it, from any project, waits until two minutes after the reset. Without a stated reset time it checks again every 30 minutes.

The project's state reads **Waiting for limits**, and the note under the title says, for example "Waiting for Codex limits (resets at 14:00)." with "Nothing to do: the run carries on by itself when they reset, and work that does not need Codex keeps going." There is nothing to press. A reset on another day shows the weekday (`Tue 14:00`); with no reset time, it says "(checking again at 14:30)"; with two plans, "Waiting for Codex and Claude limits".

The same words appear everywhere the project shows up: on Home under Running, on its row in Projects and on the Calendar, so you can tell a waiting run from a stuck one without opening it.

- Other services are not held up, and a waiting call holds no place in the service's queue.
- The wait survives a restart: a stage that was waiting when Slopify stopped waits on the stored reset again at the next start.
- A project paused or canceled meanwhile is left alone.

See [AI CLIs](AI-CLIs) and [Costs and Run Cost](Costs-and-Run-Cost) for the plan-limit share each run uses.

## Fix-it buttons

A failed step's fix becomes the project's next action, shown in the title row and beside the step in its part. The mapping lives in one place in the code, so the page always offers the same fix for the same failure.

| Failure | What the page says | Button | What to do |
| --- | --- | --- | --- |
| A CLI is signed out or its sign-in expired | "Codex is signed out, so images stopped." | **Copy sign-in command**, then **Check again** | See [Sign a CLI in again](#sign-a-cli-in-again) below. |
| A content filter refused an image or thumbnail prompt | "A content filter refused a prompt, so images stopped." | **Soften and retry** | See below. |
| A content filter refused any other prompt | "A content filter refused a prompt, so the article stopped." | **Edit the prompt** | Opens Edit settings so you can reword it, then try again. |
| The model was retired | "The model for images is no longer offered." | **Switch model** | Opens Edit settings; pick another model (under **Written by**, **Read by** or **Images by**), save, and try again. |
| A key was rejected, or none is saved | "The service did not accept its key, so narration stopped." | **Open Settings → Keys & services → *service*** | Paste a current key, save, then come back and try again. |
| The disk is full | "The disk is full, so the video stopped." | **Free space** | Opens Settings → Backup & storage, which shows what uses the space and offers **Keep outputs only** per finished project. Then try again. |
| Anything else | "Images stopped with an error." | **Try images again** | Trying again keeps everything already made. |

**Error details** under the message shows the step's own words, for example which key or which model.

The same fix-it buttons appear elsewhere too: Home's **Needs you** offers **Copy sign-in command** for a run stopped by a signed-out CLI, and a schedule whose topic generation failed, or a cast picture that failed, gets the same sign-in fix.

### Sign a CLI in again

1. Press **Copy sign-in command**. It copies `claude auth login` (Claude Code), `codex login` (Codex) or `agy` (Antigravity), and says so.
2. Paste it in a terminal on the computer running Slopify and sign in.
3. Press **Check again**. Slopify asks that CLI alone whether it is signed in now.
   - Signed in: "Codex is signed in. Trying again." and the failed step runs again by itself.
   - Still signed out: it says so and repeats the command; sign in, then press **Check again** once more.
   - Can't tell (Antigravity sometimes can't say): try the step again with **Try … again**.

If the browser blocks the clipboard, type the command yourself; the notice names it.

### Soften and retry

For a refused image or thumbnail prompt, **Soften and retry** asks first ("Soften the refused prompt and try again?"). When you confirm:

1. Your project's AI model rewrites each refused prompt without what a content filter could flag, keeping the scene and style.
2. The new wording streams onto the step as it is written.
3. The image is drawn from it and keeps it as its prompt.

The AI call and the new image are charged like any other. Press **Keep the prompt** to back out and edit it yourself in **Edit settings** → **Images**.

## Try again

**Try ... again** (for example **Try the article again**, **Try images again**) runs the failed step again. It does not ask first, because it destroys nothing: the pieces and files already made stay where they are and are reused.

## Done with problems

A failed step stops only the steps that need what it makes. The video never reads the thumbnail, so a failed thumbnail leaves the video being made. When the run's main result was made (the video; the narration when there is no video; the article when there is neither) but another step failed, the project ends **Done with problems** instead of **Failed**. Each failed step shows its error and its fix.

## After a crash or restart

- A stage that was **running** when Slopify stopped is marked failed with the reason "interrupted". Nothing re-runs by itself: press **Try ... again**. If the project was paused at the time, the stage simply goes back to waiting.
- A project that has unfinished work nothing will start on its own reads **Stopped** in its title row, in Projects and on Home, where it is listed under **Needs you** with **Continue the run** (and **Keep as is** to leave the rest unmade). The project page says "The run stopped before it finished." with the same button. Continuing makes only what is missing; everything made so far is kept. An [agent](Agents-MCP) running the attend routine may continue it for you.
- Steps waiting to retry, or waiting for CLI limits, carry on by themselves after the restart.
- A queued batch project waits its turn as before.

## Cancel, then continue

**Cancel** stops every step that has not finished; what was made is kept. Later:

- **Continue the run** on the canceled project makes everything that is missing.
- If you took one step up again after the cancel (with **Try ... again**), **Continue the run** carries on only that work. The steps you canceled stay canceled until you take them up too.

A canceled run's AI checks waiting for an agent stop, and never pass on their own. See [Pauses and Checks](Reviews-and-Checkpoints#your-own-ai-agent-as-the-checker).

## Pauses and paused runs

A pause holds the run after a step so you can check what it made. While held, the project shows **Waiting for your review** and an **Approve and make the …** button; nothing after it runs until you approve. Pauses are stored with the project, so a restart does not lose them; when you save a new version, a pause whose work changed asks for your review again (its card in **Edit settings** → **Pauses and checks** says "What it was made from has changed. Look at the current version before approving."). See [Pauses and Checks](Reviews-and-Checkpoints).

A paused project keeps everything. **Continue the run** picks up where it stopped. See [Project Page](Project-Page#pause-continue-and-cancel-a-run). A connected [agent](Agents-MCP) may continue any paused run once nothing else on it needs fixing; cancel instead of pausing if you want a run to stay put.

## A failed step beside a wait

When a step fails while another step of the run is waiting (for an agent's check, your approval at a pause, or the day of a video made ahead), the run is not over: the project still reads by what it waits for (**Waiting for the agent** or **Waiting for your review**), and the failed step shows on the page with its fix. Home lists it as a failed item too, and a "Step failed" notification goes out right away (see [Notifications](Notifications#step-failed)). The project reads **Failed** only once nothing else can go on.

## Updating while work runs

Pressing **Update** while a project is being made does not interrupt it. The update waits until no step is running, then installs by itself. Pressing it again drops the wait. See [Updating and Patch Notes](Updating-and-Patch-Notes).

When an update or install cannot finish, Slopify puts the previous version back. The Docker launcher also keeps a recovery copy of your data in a Docker volume before it replaces the container, and names that volume if something goes wrong. See [Docker](Docker).

## Tips

- If a step keeps failing with the same error after **Try again**, open **Error details** and follow what it says. Most messages name the exact screen to fix it in.
- Rate limits usually clear by themselves; you rarely need to do anything.
- A file from an earlier version is still under **Edit settings** → **Versions** if making it again goes wrong. See [Editing a Project](Editing-a-Project#versions).

## Related pages

- [Troubleshooting](Troubleshooting)
- [Project Page](Project-Page)
- [Editing a Project](Editing-a-Project)
- [Keys and Services](Providers-and-Keys)
- [AI CLIs](AI-CLIs)
- [Pauses and Checks](Reviews-and-Checkpoints)
- [Agents (MCP)](Agents-MCP)
