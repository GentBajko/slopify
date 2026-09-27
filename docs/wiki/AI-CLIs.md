# AI CLIs

Slopify can write the text with the Claude Code, Codex or Gemini command-line tools, and draw the images with Codex, using the sign-in you already have. You need no API key for those steps, and their calls count toward your plan's limits instead of costing per call.

**Where to find it:** Settings → Providers → the **Text** list (Claude Code CLI, Codex CLI, Gemini CLI) and the **Images** list (Codex CLI).

## What each tool does

| Tool | Command | Used for | Signs in with | Calls at once |
|---|---|---|---|---|
| **Claude Code CLI** | `claude` | Text: research, script, article, titles, descriptions, reviews | Your Claude account | 3 |
| **Codex CLI** | `codex` | Text | Your ChatGPT account | 3 |
| **Gemini CLI** | `gemini` | Text | Your Google account | 3 |
| **Codex CLI** (Images) | `codex` | Images and thumbnails | Your ChatGPT account (the same sign-in and path as Codex text) | 4 |

Codex text and Codex images share one sign-in, one executable path and one plan allowance.

Codex CLI must be version 0.149.1 or newer. An older Codex shows **Needs attention** and says to update it.

## Set up a CLI

1. Install the tool on the computer that runs Slopify, following the tool's own instructions.
2. Sign in once in a terminal:
   - Claude Code: `claude auth login`
   - Codex: `codex login`
   - Gemini: run `gemini` and follow its login steps.
3. Open **Settings → Providers** (reload the page if it was already open).
4. Pick the tool in the **Text** or **Images** list. Its row should say **Ready**, and its setup shows **Installed, version …** and the **Command** Slopify runs.
5. Choose **Check all** to confirm it is signed in.

On the very first launch, before any key is saved, Slopify looks for all three tools. If it finds any, it says so and picks one for text on new Play drafts, preferring Claude Code, then Codex, then Gemini, and Codex for images when found. The CLIs can't speak, but the narration needs no key either: without a voice key, the [System voice](Providers-and-Keys#the-system-voice) reads it with your computer's own speech. See [First-Launch-and-Welcome](First-Launch-and-Welcome).

## Row states

| State | Meaning |
|---|---|
| **Ready** | Found, new enough and not reporting a sign-in problem. |
| **Needs attention** | Found, but something is wrong (for example an old Codex version). The detail says what. |
| **Not found** | Not on PATH, or not at the saved path. |

## Set the executable path

Slopify finds each tool on PATH, the list of folders your terminal searches. Set a path when the tool is installed somewhere else, or you have more than one copy.

1. Pick the tool in **Settings → Providers**.
2. Choose **Change path**.
3. In **Executable path**, type the absolute path to the program file, without quotes or arguments. Leave it blank to go back to finding it on PATH.
4. Choose **Save path**. Slopify checks the tool answers before saving; a folder or a missing file is refused with the reason.
5. Choose **Close path** to fold the field away.

| Option | What it does | Default |
|---|---|---|
| **Executable path** | Where the tool is on this computer. | Blank (found on PATH) |

## Check the sign-in

**Check all** (Settings → Providers) asks each tool:

- **Installed**: found, with its version.
- **Signed in**: Slopify asks Claude Code and Codex directly. If one is signed out, the line tells you the command to run (`claude auth login` or `codex login`). For Gemini CLI, Slopify reads the sign-in from its own files in `~/.gemini`, without starting it: the method saved in `settings.json`, then a Google sign-in in `oauth_creds.json` or a `GEMINI_API_KEY`. When the files don't say, it asks you to run `gemini` in a terminal once to confirm.
- **Chosen models**: every model your templates, schedules, drafts and unfinished projects pick is still offered by the tool.

Each tool's row has **Check again**, to check that tool alone after you fix something.

If a run fails because a tool's sign-in expired, the project offers **Copy sign-in command** and **Check again**: run the copied command in a terminal on the computer running the tool and sign in, then press **Check again**. Once the tool answers that it is signed in, the step runs again by itself. See [Recovery and Retries](Recovery-and-Retries#sign-a-cli-in-again).

## Pick a model and thinking level

A CLI's model list comes from the tool installed on your computer, not from the model catalogue. On Play:

1. Pick the tool as the text provider (or Codex CLI for images).
2. Pick a **Text model** from the list. The refresh button beside it (**Refresh models**) asks the tool for its current list; **Custom ID** lets you type a model the list does not show.
3. If the model offers it, pick **Thinking** (text) or **Effort** (images). **Model default** leaves it to the tool. The levels come from the model: for example Low, Medium, High and Xhigh. Higher levels can write or draw more carefully, but take longer and use more of your plan.

If a model is missing when a run reaches it, the run stops with "The chosen model is not available in the AI command-line tool on your computer." Update the tool, or pick another model in **Edit project** under Providers, then **Continue the run**. A thinking level the model does not support stops the same way.

## Codex images

Codex draws each image as its own job.

- **Codex default** runs with the tool's own defaults: no model and no effort on the command line.
- Any other model is one of Codex's own models (the same list the Codex text provider shows), run with the **Effort** you pick. With a chosen model or effort, or a reference picture to match, the agent may look at its work and redraw it.
- Each image may take several minutes; the time limit for one image is 30 minutes.
- Up to 4 images are drawn at once.

Codex images count toward your Codex plan. There is no API price for agent-drawn images, so the cost pages show them as $0 on your plan with no API figure.

## Plan limits and waiting them out

The CLIs bill your subscription, which gives a share of a 5-hour and a weekly allowance rather than a bill. Slopify shows what the tools report:

- **Claude Code** reports its 5-hour and 7-day windows during each call.
- **Codex** is asked before and after each call. It reports whole percents, so a short run can show "under 1%".
- **Gemini** reports none.

You see these on a project's **Run cost** tab, in the run's **Cost so far** panel, and on Home under **This week**. See [Costs-and-Run-Cost](Costs-and-Run-Cost).

When a tool says its allowance is used up, the run does not fail:

1. Slopify stores the reset time the tool gave (per tool, not per project).
2. Every call to that tool, from any project, waits until 2 minutes after the reset. Without a stated time, it checks again every 30 minutes.
3. The project's status reads **Waiting for limits**, with a line such as "Waiting for Codex limits (resets at 14:00)." The same words show on Home's Running now, the Projects row and the Calendar.
4. When the reset passes, the run continues by itself.

Other providers are not held up: a project whose narration uses a key carries on while its Codex images wait. The wait survives a restart; a project that was waiting when Slopify stopped resumes on the next start and waits again. A project you paused or cancelled meanwhile is left alone.

Gemini's daily quota is handled the same way ("Slopify waits and tries again later by itself").

## In Docker: the host helper

A container cannot use the CLIs installed on your computer directly. On Linux, the Docker installer offers a small helper that runs the tools on your computer, outside the container, with the sign-ins they already have.

1. Install and sign in to the CLIs on your computer first.
2. Run the Docker installer (`npx @gentbajko/slopify@latest --docker`). If a CLI is found, it asks once whether to set up the helper. `--accept-host-cli` approves without asking; `--host-cli=off` skips it.
3. In Settings → Providers the tools show **Managed on host**. Their path cannot be changed there.

What to know:

- The helper runs as you, as the user service `slopify-cli-bridge.service`, and talks to the container over a private socket. No network port is opened and no sign-in is copied into Docker.
- After you install, update or remove a CLI, run the Docker installer again so Slopify sees the change.
- Run cost and plan-limit shares work the same as without Docker. An older helper may not pass them through, and the cost page then says the share is not known.
- With the helper off, Settings shows the CLIs as unavailable. API-key providers still work.

Check or turn off the helper:

```sh
systemctl --user status slopify-cli-bridge.service
systemctl --user disable --now slopify-cli-bridge.service
```

Turning it off leaves Docker, your API providers, your data and your host sign-ins as they are. See [Docker](Docker).

## Tips

- A CLI step on Play's estimate reads "$0 on your plan · ~$X via API": what the same tokens would cost with a key.
- If your plan runs out often, split the work: keep text on a CLI and put images on a keyed provider, or the other way round.
- Use **Check all** after updating a CLI; a newer tool can drop a model your template still names.

## Related pages

- [Providers-and-Keys](Providers-and-Keys)
- [Models](Models)
- [Costs-and-Run-Cost](Costs-and-Run-Cost)
- [Docker](Docker)
- [Recovery-and-Retries](Recovery-and-Retries)
- [Troubleshooting](Troubleshooting)
