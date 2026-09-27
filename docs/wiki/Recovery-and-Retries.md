# Recovery and Retries

Provider calls fail now and then: a rate limit, a timeout, a dropped connection, a refused prompt. Slopify retries what time can fix by itself, waits for used-up CLI plans instead of failing, and for everything else puts one button on the project page that fixes the cause or walks you through it. Work already made is never thrown away.

**Where to find it:** a project → the next action panel in the right rail, and the failed step's own section.

## What happens when a call fails

Slopify handles a failed provider call in three tiers:

| Tier | What happens | You see |
| --- | --- | --- |
| 1. Quick retries | The call is tried up to four times in about 40 seconds: the first try plus retries after 2, 8 and 30 seconds. A provider's own Retry-After (up to a minute) replaces the fixed wait. | Nothing; the step keeps running. |
| 2. Waiting it out | If the quick retries run out on a failure time can fix, the step is not failed. It waits and runs again by itself, up to four more times, after about 2, 4, 8 and 16 minutes (about half an hour in all). Each wait is spread by a quarter either way, and is never shorter than the provider's Retry-After. | **Waiting to try again**: "Images will try again by itself at 14:05." No button; the run carries on when it does. |
| 3. Failed | When the waits are used up, or the failure is one time cannot fix, the step fails and says why. | **Failed**, the error, and a fix-it or **Try ... again** button. |

### What is waited out

- Rate limits (HTTP 429 and each provider's own rate-limit errors).
- Timeouts.
- Dropped calls: a connection that never reached the provider or broke mid-answer, a provider server error (5xx), or a CLI the system killed mid-run.

### What is never retried

- A refusal by a content filter.
- A key the provider rejected, or no key saved.
- A request the provider does not support.
- A lost CLI submission (Slopify cannot tell whether the CLI already did the work).

These are the provider's final answer, and retrying would only spend your money again.

A provider asking for a wait longer than an hour (a daily quota) is reported as a failure rather than waited out.

### Time limits per call

| Kind of call | Time limit per attempt |
| --- | --- |
| Text and narration | 120 seconds |
| Image | 300 seconds |
| Image animated into a clip | 900 seconds |

A call that passes its limit is stopped (a streamed call when it sends nothing for that long), and the message says so, for example "The AI model did not answer within 120 seconds. It may be overloaded: wait a few minutes, then use Try again, or choose another model in the Providers section of Edit project."

### Waits survive a restart

The wait is saved in the database, so quitting or restarting Slopify keeps it: the step runs again when its time comes. While it waits the project reads as running. **Pause** holds it.

## Waiting for CLI plan limits

When Claude Code, Codex or Gemini says your plan allowance is used up, the call does not fail: it waits. Slopify stores the reset time for that CLI, and every call to it, from any project, waits until two minutes after the reset. Without a stated reset time it checks again every 30 minutes.

The next action panel shows **Waiting for limits**, for example "Waiting for Codex limits (resets at 14:00)." with "Nothing to do: the run carries on by itself when they reset, and work that does not need Codex keeps going." There is nothing to press. A reset on another day shows the weekday (`Tue 14:00`); with no reset time, it says "(checking again at 14:30)"; with two plans, "Waiting for Codex and Claude limits".

The same words appear everywhere the project shows up: on Home under Running now, on its row in Projects and on the Calendar, so you can tell a waiting run from a stuck one without opening it.

- Other providers are not held up, and a waiting call holds no place in the provider queue.
- The wait survives a restart: a stage that was waiting when Slopify stopped waits on the stored reset again at the next start.
- A project paused or cancelled meanwhile is left alone.

See [AI CLIs](AI-CLIs) and [Costs and Run Cost](Costs-and-Run-Cost) for the plan-limit share each run uses.

## Fix-it buttons

A failed step's fix becomes the project's next action, shown in the right rail and beside the step in its section. The mapping lives in one place in the code, so the page always offers the same fix for the same failure.

| Failure | What the panel says | Button | What to do |
| --- | --- | --- | --- |
| A CLI is signed out or its sign-in expired | "Codex is signed out, so images stopped." | **Copy sign-in command**, then **Check again** | See [Sign a CLI in again](#sign-a-cli-in-again) below. |
| A content filter refused an image or thumbnail prompt | "A content filter refused a prompt, so images stopped." | **Soften and retry** | See below. |
| A content filter refused any other prompt | "A content filter refused a prompt, so the article stopped." | **Edit the prompt** | Opens Edit project so you can reword it, then try again. |
| The model was retired | "The model for images is no longer offered." | **Switch model** | Opens Edit project; pick another model in **Providers**, save, and try again. |
| A key was rejected, or none is saved | "The provider did not accept its key, so narration stopped." | **Open Settings → Providers → *provider*** | Paste a current key, save, then come back and try again. |
| The disk is full | "The disk is full, so the video stopped." | **Free space** | Opens Settings → Backup & storage, which shows what uses the space and offers **Keep outputs only** per finished project. Then try again. |
| Anything else | "Images stopped with an error." | **Try images again** | Trying again keeps everything already made. |

**Error details** under the message shows the step's own words, for example which key or which model.

The same fix-it buttons appear elsewhere too: Home's **Needs you** offers **Copy sign-in command** for a run stopped by a signed-out CLI, and a schedule whose topic generation failed, or a cast picture that failed, gets the same sign-in fix.

### Sign a CLI in again

1. Press **Copy sign-in command**. It copies `claude auth login` (Claude Code), `codex login` (Codex) or `gemini` (Gemini), and says so.
2. Paste it in a terminal on the computer running Slopify and sign in.
3. Press **Check again**. Slopify asks that CLI alone whether it is signed in now.
   - Signed in: "Codex is signed in. Trying again." and the failed step runs again by itself.
   - Still signed out: it says so and repeats the command; sign in, then press **Check again** once more.
   - Can't tell (Gemini sometimes can't say): try the step again with **Try … again**.

If the browser blocks the clipboard, type the command yourself; the notice names it.

### Soften and retry

For a refused image or thumbnail prompt, **Soften and retry** asks first ("Soften the refused prompt and try again?"). When you confirm:

1. Your project's AI model rewrites each refused prompt without what a content filter could flag, keeping the scene and style.
2. The new wording streams onto the step as it is written.
3. The image is drawn from it and keeps it as its prompt.

The AI call and the new image are charged like any other. Press **Keep the prompt** to back out and edit it yourself in **Edit project → Images**.

## Try again

**Try ... again** (for example **Try the article again**, **Try images again**) runs the failed step again. It does not ask first, because it destroys nothing: the pieces and outputs already made stay where they are and are reused.

## Done with problems

A failed step stops only the steps that need its output. The video never reads the thumbnail, so a failed thumbnail leaves the video rendering. When the run's main output was made (the video; the narration when there is no video; the article when there is neither) but another step failed, the project ends **Done with problems** instead of **Failed**. Each failed step shows its error and its fix.

## After a crash or restart

- A stage that was **running** when Slopify stopped is marked failed with the reason "interrupted". Nothing re-runs by itself: press **Try ... again**. If the project was paused at the time, the stage simply goes back to waiting.
- A project that has unfinished work nothing will start on its own shows **Stopped** and **Continue the run**. Continuing makes only what is missing.
- Steps waiting to retry, or waiting for CLI limits, carry on by themselves after the restart.
- A queued batch project waits its turn as before.

## Checkpoints and paused runs

A checkpoint holds the run before a step so you can check what came before it. While held, the project shows **Waiting for you** and an **Approve ...** button; nothing after it runs until you approve. Checkpoints are stored with the project, so a restart does not lose them; when you save a new revision, a checkpoint whose reviewed inputs changed asks for your review again (the Checkpoints view says "Inputs changed. Review the current revision before approving."). See [Reviews and Checkpoints](Reviews-and-Checkpoints).

A paused project keeps everything. **Continue the run** picks up where it stopped. See [Project Page](Project-Page#pause-continue-and-cancel-a-run).

## Updating while work runs

Pressing **Update** while a project is being made does not interrupt it. The update waits until no step is running, then installs by itself. Pressing it again drops the wait. See [Updating and Patch Notes](Updating-and-Patch-Notes).

When an update or install cannot finish, Slopify puts the previous version back. The Docker launcher also keeps a recovery copy of your data in a Docker volume before it replaces the container, and names that volume if something goes wrong. See [Docker](Docker).

## Tips

- If a step keeps failing with the same error after **Try again**, open **Error details** and follow what it says. Most messages name the exact screen to fix it in.
- Rate limits usually clear by themselves; you rarely need to do anything.
- A kept output from an earlier revision is still in **History** if a remake goes wrong. See [Editing a Project](Editing-a-Project#history-and-saved-revisions).

## Related pages

- [Troubleshooting](Troubleshooting)
- [Project Page](Project-Page)
- [Editing a Project](Editing-a-Project)
- [Providers and Keys](Providers-and-Keys)
- [AI CLIs](AI-CLIs)
- [Reviews and Checkpoints](Reviews-and-Checkpoints)
