# Agents (MCP)

Slopify has a built-in MCP server, so an AI agent on your computer (Claude Code, Codex, or any other client that speaks MCP over HTTP) can run Slopify for you. It can start and fix runs, edit the Library and your setup, answer reviews and approve checkpoints, with the same checks, costs and refusals as the buttons in the web page. Run on a schedule, an agent can clear everything that would otherwise wait for you, right up to **Ready to upload**. Uploading stays yours.

**Where to find it:** **Settings → Connections → Agents (MCP)**.

## What the Agents tab shows

| Part | What it is |
| --- | --- |
| **MCP address** | The address agents connect to: this install's address with `/mcp` after it, for example `http://127.0.0.1:6969/mcp`. It uses the address in your browser's address bar, so it matches your port and Docker's published port. |
| **Claude Code** | The command that adds Slopify to Claude Code, with **Copy**. Run it once in a terminal. |
| **Codex** | The lines that add Slopify to Codex, with **Copy**. Add them to `~/.codex/config.toml`. |
| Last connected | When an agent last connected, or "No agent has connected yet." |
| **What agents did** | The latest 20 changes made by agents, newest first: what was done, the project or schedule it was done to, and when. Changes outside a project (a Library prompt, a schedule, a setting) are listed here too. "No agent has changed anything yet." when there are none. |

If the browser blocks the clipboard, **Copy** says so; select the line and copy it yourself.

## Connect an agent

Slopify must be running. The address in these examples is the default (`127.0.0.1`, port `6969`); copy the real lines from the Agents tab.

### Claude Code

1. Open **Settings → Connections → Agents (MCP)** and press **Copy** next to **Claude Code**.
2. Paste it in a terminal and run it:

   ```
   claude mcp add --transport http slopify http://127.0.0.1:6969/mcp
   ```

3. Start Claude Code. `/mcp` there should list `slopify` as connected, and the Agents tab now shows when it last connected.

### Codex

1. Press **Copy** next to **Codex**.
2. Add the lines to `~/.codex/config.toml`:

   ```
   [mcp_servers.slopify]
   url = "http://127.0.0.1:6969/mcp"
   ```

3. Start Codex again so it reads the file.

### Other agents

Any MCP client that connects by URL over Streamable HTTP takes the same **MCP address**. Slopify keeps no session: every request is a plain `POST`.

### Docker

Nothing changes: the agent runs on your computer and connects to the port Docker publishes, the same address you open Slopify at. Copy the lines from the Agents tab in that Slopify. See [Docker](Docker).

## No token, and what keeps web pages out

There is no key or token to set up, the same as the web page itself: Slopify has no login, and it listens on `127.0.0.1` so only your own computer reaches it.

Web pages are kept out by one check. A request that comes from a web page at another address (a browser always says where a request came from) is refused with "Slopify refused this MCP request because it came from a web page at another address." Agents on the command line send no such address and are let in. Pages on this computer's own addresses (`localhost`, `127.0.0.1`) are let in too.

If you start Slopify with `--host 0.0.0.0` (or another address other computers can reach), anyone who reaches the port can drive it through `/mcp`, just as they can through the web page. Keep it on `127.0.0.1` unless you mean that. See [Install](Install).

## What agents can do

Anything you can do in the web page, except the few things listed under [What agents cannot do](#what-agents-cannot-do). That includes:

- **Projects:** make projects from Create drafts and templates (after the same review and estimate you see), read them, edit them, pause, continue and cancel runs, **Keep as is**, move projects to another channel, delete and restore them.
- **Fixing runs:** **Try ... again**, **Soften and retry**, remake a step or one item, regenerate a narration chunk, and **Choose what to remake**, with its estimate.
- **Reviews:** answer reviews set to **External agent (MCP)**, **Overrule** or **Redo** flagged items, and approve review checkpoints.
- **Planning:** release times, the posting plan, **Mark uploaded**, **Deleted on YouTube**, and **Copy for YouTube Studio** up to **Ready to upload**.
- **Schedules:** schedules, their topic lists, approving or turning down held topics, and **Prepare**.
- **Library and setup:** prompts (with history), templates, channels and cast, Library import and export, and settings other than those below.
- **Reading:** Home's work list, the calendar, costs and estimates, a project's files (pictures come back as pictures; audio and video as their address in Slopify), and the material a review looks at.
- **Storage:** **Delete old versions** for one project.

Agents never start paid work you could not see: before a remake they get the same **Choose what to remake** list with its estimate, and they must accept it, as you do. There is no extra budget or limit for agents; the costs are the same as yours. Actions with a consequence (deleting, for example) need the agent to confirm them, as a dialog asks you.

Agents and their tools use the same state words as the page: **Queued**, **Running**, **Paused**, **Waiting for your review**, **Waiting for the agent**, **Prepared**, **Stopped**, **Kept as is**, **Failed**, **Done**.

## What agents cannot do

| Not for agents | Why |
| --- | --- |
| Upload to YouTube, or send a video to the Studio extension (**Fill in YouTube Studio**, **Upload**) | Agents stop at **Ready to upload**. Uploading is yours; Slopify never makes a video public. See [Publishing to YouTube](Publishing-to-YouTube). |
| The extension's automatic pinned comment setting | It posts comments in your name. |
| Read or change provider keys, or make the extension's pairing token | They are credentials. Agents see each provider only as configured or missing. |
| Read the **Notification URL** | It can hold a secret (a private ntfy topic). Agents see only whether one is configured or missing, though they may set a new one. |
| Backups: export, import, restore, and the daily backup settings | They are yours, in Settings → Backup & storage. |
| Update Slopify, start at login, CLI paths, the extension's download | They are yours. |
| **Delete all old versions** and **Clean up everything** (all projects) | They are yours, in Settings → Backup & storage. **Delete old versions** for one project is allowed. |
| Open a folder on your desktop | Agents read files through Slopify instead. |

A request for any of these is refused with a sentence that says it is yours and where to do it.

## Shown as "by agent"

Everything an agent changes is marked, so you can always tell its work from yours:

| Where | What you see |
| --- | --- |
| Project page → **Project history** | Versions an agent saved end in **· by agent**, and **Done by agents** lists what agents did to the project (approvals, retries, verdicts and so on). |
| Review badges | **Passed by agent**, **Flagged by agent**, **Redone after agent review**, **Accepted by agent** (an agent pressed Overrule), **Made again by agent** (an agent pressed Redo). |
| Notifications | A run an agent started ends its notices with **· started by agent** ("Started: *title* · by agent" in the browser); a flag from an agent's review ends with **· by agent**. |
| Settings → Agents (MCP) | **What agents did**: the latest 20 changes of every kind. |

## The External agent reviewer

Instead of paying a reviewer model, you can let your agent do the [automatic reviews](Reviews-and-Checkpoints#automatic-reviews).

1. On Create, open the **Pauses and checks** row (or **Edit settings** → **Pauses and checks** on a project).
2. Set **Who reviews** to **External agent (MCP)**. **Reviewer** and **Reviewer model** are greyed: the agent needs neither.
3. Pick **Flag only** or **Flag and redo** for each stage, as usual. Picture stages (images, the thumbnail, shorts) work too: the agent is shown the pictures.

Reviews by the agent cost nothing and add nothing to the estimate. Redos it asks for cost what the item cost, as always.

### What happens during the run

1. When an item is made, its review waits for the agent. What depends on it waits too; other work carries on.
2. If nothing else holds the run, the project reads **Waiting for the agent** everywhere: its header, Projects, Home's **Running now** and the calendar. The project page says "An agent is reviewing what was made." with nothing to press. It is not in **Needs you**, no "Waiting for you" notice goes out and there is no **Continue the run** to press: it goes on by itself.
3. The agent reads the item and answers **pass** or **fail**. A fail needs at least one reason; at most 10 reasons, each up to 500 characters. The answer goes through the stage's mode, exactly like a model's verdict: a pass lets the work go on, a fail is flagged or made again.
4. **The first answer wins.** If two agents answer the same review, the first one saved is kept and the second is refused ("This review was already answered"). The same goes for you: once an agent has pressed Overrule or Redo on a flagged item, or approved a checkpoint, pressing it yourself changes nothing and says it was already decided.

### If no agent answers

A review nobody answers **passes by itself 2 hours** after it began waiting. Its badge reads **Passed without review** ("No agent answered within 2 hours, so it went ahead without review."), the work goes on, and you get a notification: **Passed without review: no agent answered in 2 h**, naming the project and the item. The two hours are saved with the review, so a restart neither resets nor loses them.

- **Paused project:** the review still passes at its two hours, but nothing runs until the run is continued.
- **Canceled run:** its waiting reviews stop and never pass. If you (or an agent) take the step up again, the review asks again and waits a fresh two hours.
- **Item made again meanwhile** (an edit or a remake): the old review is dropped and the new item gets its own.

## Paused and stopped runs

An agent may **continue any paused run**, whoever paused it, once nothing else on the project still needs fixing. It may also press **Continue the run** on a run a restart left **Stopped**. If you want a run to stay put while an agent routine is running, cancel it instead of pausing it: canceled runs are not on the agent's list.

## needs_attention and the attend routine

Slopify cannot wake an agent; the agent looks. Its work list is the `needs_attention` tool: Home's **Needs you**, as an agent reads it, oldest first.

| Entry | What the agent does |
| --- | --- |
| An external review waiting for a verdict | Reads the item and answers. |
| A flagged verdict nobody acted on | **Overrule** or **Redo**. |
| A review checkpoint waiting for approval | Checks the work before it and approves. A checkpoint from the template's own **Before Video** is listed; a schedule's **Prepared** hold is not, since that one waits for its day. |
| A failed step | Does what the error's own sentence says: for example regenerates narration chunk 5, accepts the **Choose what to remake** estimate, then continues the run. |
| A paused run, or a run a restart **Stopped** | Continues it once nothing on the project still needs fixing. |
| Topics a schedule holds for approval | Approves the ones that fit and turns down the rest. |
| A video marked **Late · upload now** | Reports it. It cannot upload. |
| A finishing touch the Studio extension failed (captions, end screen, pinned comment), or a post it couldn't fill on another site | Reports it. Fixing it is the extension's or yours. |
| A post filled in another site's form, waiting for your **Post** (`post-due`) | Reports it. Posting is yours. |

Projects that are **Kept as is** are not listed. Each entry says whether Slopify is already retrying or redoing it by itself (the agent leaves those alone and looks again later) and whether the agent can act on it at all.

The steps above are the **attend routine**. Slopify hands it to every agent that connects, and offers it as the MCP prompt **attend**: in Claude Code, `/mcp__slopify__attend` runs it. To have it run unattended, schedule it in your agent, for example as a Claude Code scheduled task or a Codex automation every hour. An hourly routine answers external reviews well inside their two hours.

## Tips

- Pair the External agent reviewer with an hourly attend routine, and a [Notification URL](Notifications#get-notifications-on-your-phone-notification-url) so you hear when a review passed without an answer: that usually means the routine stopped running.
- Check **What agents did** in the Agents tab now and then; each project's **Project history** has the full story for that project.
- If an agent's request is refused because the project changed meanwhile, it reads the project again and retries once; you do not need to do anything.

## Related pages

- [Reviews and Checkpoints](Reviews-and-Checkpoints)
- [Notifications](Notifications)
- [Recovery and Retries](Recovery-and-Retries)
- [Home and Projects](Home-and-Projects)
- [Schedules](Schedules)
- [Publishing to YouTube](Publishing-to-YouTube)
- [Settings Reference](Settings-Reference)
- [AI CLIs](AI-CLIs)
