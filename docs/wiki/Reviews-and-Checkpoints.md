# Pauses and Checks

Two ways to keep an eye on a run before it spends more. A **pause** holds the run after a step until you approve what it made, so you can read, listen and edit before the next paid step. An **AI check** has an AI look at each finished item (the article, every image, the narration, the thumbnail, every short) and flag it, or make it again, when it fails.

**Where to find it:** Create → **Pauses and checks** row → **Change**. After the run starts: the project → **Edit settings** → **Pauses and checks**. A run held at a pause waits under Home → **Needs you**.

## The row on Create

The row's line says what is set, for example "Pauses for your approval after the article (before the narration); an AI checks 3 steps.", or "Runs straight through: no pauses for your approval, no AI checks." Opened, it holds **Pause for my approval** at the top and **Have an AI check the results** under it.

**See everything this run will do** in Create's rail lists the pauses with the rest of the run.

## Pauses

A pause holds the run after a step so you can check and edit what it made. Steps that do not depend on it carry on. You approve each pause to go on.

| Pause | Holds | Offered when |
| --- | --- | --- |
| **Pause after the article (before the narration)** | The narration and what depends on it | Narration is **AI voice** |
| **Pause after the narration (before the images)** | The images and what depends on them (it reads "after the article" when there is no narration) | Images are **Made by AI** |
| **Pause after the images (before the video)** | The video and the other files put together from it (it reads "before the sound file" without a video) | The video is on, or there is narration |

A pause is offered only for a step the run makes itself. A ticked pause whose step you later turn off stays, with the reason in red: "This run makes no images to pause before: untick it."

Default: no pauses.

### Add a pause on Create

1. Open the **Pauses and checks** row.
2. Under **Pause for my approval**, tick the pause you want.
3. Press **Make the video**.

Starting the run does not approve the pauses. The run stops at each one until you approve it.

### Go on after a pause

When the run reaches a pause, the held step waits, the project reads **Waiting for your review**, and it shows under Home → **Needs you**.

1. Open the project. The title row's next action names what runs after approval: **Approve and make the narration**, **Approve and make the images** or **Approve and make the video**.
2. Check and edit what came before: read the article, listen to the narration, look at the images. See [Editing a Project](Editing-a-Project).
3. Press the next action. The same button sits on the pause's card in **Edit settings** → **Pauses and checks**, and Home's **Needs you** has one too.

Each pause's card, **Paused after the article** (or the narration, or the images), says where it stands, with the steps that wait for it:

| Line | Meaning |
| --- | --- |
| "The article is ready for your review. The narration and what follows wait for your approval; other work goes on." | Waiting for you. |
| "What it was made from has changed. Look at the current version before approving." | You edited something the held step uses. Check the new version before approving. |
| "Approved for this version. What comes after it runs once what it needs is ready and the run goes on." | Approved; it runs when it can. |
| "Approved, and what came after it is made." | Done. |
| "Not reached yet." | The run has not got there. |

If the project is paused, the card says "The project is paused. Continue the run before approving held work." Pausing the project always applies on top of its pauses.

A pause is approved once. If it was already approved (by you in another tab, or by an [agent](Agents-MCP)), approving again changes nothing and says "It was already approved."

### Change the pauses after the run started

In the project → **Edit settings** → **Pauses and checks** → **Pauses for this run**:

1. Tick a step that has not started to add a pause, or untick one to remove it. Work already let through for an unticked step carries on when ready.
2. Press **Save pauses** (it appears once you change a tick). They take effect at once, without **Save changes**.

Only steps the run makes itself, and has not started, can be ticked. Once every one has run, the line says "The run has finished; pauses apply when the project is made again." If the project was edited elsewhere in the meantime, press **Load the pauses again** and make your change again.

## AI checks

An AI checks each finished item and saves its verdict and reasons on the project page. The checker is a model Slopify asks (each check is one AI call, counted in usage and in the estimate), or an agent you connected (free; see [Your own AI agent as the checker](#your-own-ai-agent-as-the-checker)).

**Have an AI check the results** sets every stage the run makes at once:

| Choice | What happens to a failed item |
| --- | --- |
| **Off** (default) | No check. |
| **Flag problems** | The item is marked failed, with the reasons, and the run carries on. |
| **Flag and redo** | The item is made again and checked again, up to **Redos per item**. After that it is kept and flagged. It never loops. |

The line under it says "Each check is one more AI call per item; a redo makes the item again, at its price." Turning checks on with no checker picked uses the AI that writes the article. When the stages are set differently, the choice shows none of the three and the line says "Each stage is set on its own under Checker and stages."

### Checker and stages

**Checker and stages** under it folds out the rest. Its summary says who checks and how many stages are checked.

| Option | What it does | Default / range |
| --- | --- | --- |
| **Who checks** | **An AI model**: Slopify asks the model under **Checked by**, one paid call per item. **Your own AI agent**: an agent connected in Settings → **AI agents** answers each check instead, at no cost. | An AI model |
| **Redos per item** | How many times **Flag and redo** makes a failed item again before it keeps the last one and flags it. Each redo costs the item again plus one more check. | 2; 0 to 5 |
| **Checked by** | The **Service** and **Model** that judge each item. A stronger model catches more but costs more per check. It can differ from the one that wrote the text. Checks of the images, the thumbnail and shorts need Claude Code or Codex, which can look at images; other services check text only. | The article's writer |

Then the table **Stage** / **Check, and the prompt it uses** sets each stage, in the order the run makes them (**Article**, **Promise check (before narration)**, **Narration**, **Images**, **Thumbnail**, **Shorts**), on its own: **Off**, **Flag problems** or **Flag and redo**, and, once it is on, the prompt: **Built-in prompt** or one of your **Review** prompts (see [Prompts](Prompts)). A stage the run makes nothing for is left out; the promise check stays, greyed, saying it "Needs an article the AI writes."

### What each check looks at

| Stage | The built-in check looks at |
| --- | --- |
| **Article** | The article prompt's rules (length, structure, tone), no invented lore, no repeated sections. The research notes are included. |
| **Promise check (before narration)** | That the opening keeps what the title and thumbnail promise. See [The promise check](#the-promise-check). |
| **Images** | Malformed hands or bodies, stray text or letters, that it matches its brief, and that it matches the establishing image when one is on. |
| **Narration** | Nothing missing or garbled compared with the text: the checker reads what the word timing heard and the stretches it could not hear. |
| **Thumbnail** | Readable at phone size, clear subject. |
| **Shorts** | The short's images at phone size: clear subject, no stray text, fits the title. |

### The promise check

One cheap AI call before the paid narration. The checker reads the video's title, the thumbnail brief (when the thumbnail is drawn from a prompt), the opening as the voice will say it (about the first 30 seconds: 75 words at 150 words a minute) and the whole article.

- **Passes** when the opening starts delivering what the title and thumbnail promise and gives a reason to keep watching.
- **Fails** on a slow preamble, a greeting or channel housekeeping (subscribe, welcome back) before the subject, an opening about something else, or a promise the article never keeps. The reasons name the sentence that should come first.
- **Flag and redo** writes the article again and checks the new one. The narration, the pictures and everything else that reads the article wait for the answer, so nothing paid is made from an opening that failed.
- It needs an article the AI writes: otherwise its row is greyed and says "Needs an article the AI writes."
- It uses the checker above and adds one AI call to the estimate. **Have an AI check the results** leaves it as it is; set it on its own under Checker and stages. Default: Off.

### Set up the AI checks

1. Open the **Pauses and checks** row.
2. Under **Have an AI check the results**, pick **Flag problems** or **Flag and redo**.
3. Optional: open **Checker and stages** to pick who checks (**Checked by**, or **Your own AI agent**), set **Redos per item** (empty means 2), or set a stage on its own with a Review prompt. For image, thumbnail or shorts checks, pick Claude Code or Codex. With another checker, the row says "Checks of images need Claude Code or Codex as the checker: Slopify can't show images to this one." and the run cannot start.
4. Check the estimate: each check adds one AI call. Redos are not in the estimate; each costs what the item cost, at most the redos allowed.

### Your own AI agent as the checker

With **Who checks** set to **Your own AI agent**, no model is called: each check waits for an agent connected to Slopify to answer it (see [Agents (MCP)](Agents-MCP)). Every stage can use it, picture stages included, since the agent is shown the pictures. It adds nothing to the estimate.

- While a check waits, what depends on the item waits, as with any check. If nothing else holds the run, the project reads **Waiting for the agent** (title row, Projects, Home's Running, the calendar). It is not in **Needs you**, sends no "Waiting for you" notice and has no **Continue the run**: it goes on by itself.
- The agent answers **pass** or **fail**. A fail needs at least one reason, at most 10, each up to 500 characters. The answer then follows the stage's choice like a model's verdict: **Flag problems** flags it, **Flag and redo** makes it again up to **Redos per item**.
- The first answer saved wins. A second answer to the same check is refused ("This review was already answered").
- **No answer in 2 hours:** the check passes by itself. Its badge reads **Passed without review**, the work goes on and a notification says "Passed without review: no agent answered in 2 h". The deadline is saved, so it survives a restart. A paused project's check still passes at its deadline, but nothing runs until you continue the run.
- **Canceled runs:** canceling stops the run's waiting checks, and they never pass. Taking the step up again asks again, with a fresh two hours.

### Verdicts on the project page

Beside the article (with the promise check's verdict under the article's), the narration, the thumbnail and each short, and on each image, the verdict shows as **Review passed**, **Flagged by review**, **Waiting to be made again**, **Being made again**, **Redone after review** or **Accepted by you**, with the reasons. With your own AI agent as the checker, or when an agent acted on it, it reads **Passed by agent**, **Flagged by agent**, **Redone after agent review**, **Accepted by agent**, **Made again by agent**, or **Passed without review** when no agent answered in time. For a failed item nobody has acted on:

- **Overrule** accepts it as it is.
- **Redo** makes it again (a new version of the project, then the item and what depends on it are made again), and it is checked again.

A flagged item takes one decision. If it was already decided (by an agent, for example), pressing **Overrule** or **Redo** changes nothing and says how it was decided.

Both buttons wait while other work on the project is running, with one exception: while a **Flag and redo** check's redo is still waiting to start (**Waiting to be made again**), **Overrule** stays available and calls the redo off. The item is accepted as it is, the badge turns to **Accepted by you**, and the work waiting on it goes ahead. Once the redo has started, Overrule is greyed: "Slopify is already making this item again; wait for the new version".

When a check flags an item and keeps it (its redos ran out, or the stage is on **Flag problems**), Slopify sends a **Review needs a decision** notification (see [Notifications](Notifications)), and the project shows under Home → **Needs you**. When an agent's check flagged it, the notification ends in **· by agent**. Everything that uses a checked item waits for its check, in the same way a pause holds work. Checking the same file with the same checker and prompt again reuses the earlier verdict.

## Pauses or checks?

| You want to | Use |
| --- | --- |
| Read the article yourself before paying for the narration | **Pause after the article (before the narration)** |
| Look at the images before the video is put together | **Pause after the images (before the video)** |
| Catch broken hands or stray text without watching every run | **Have an AI check the results**: **Flag and redo** |
| Run unattended on a schedule and fix things later | Checks on **Flag problems**, no pauses |
| Have the checks done without paying for a model | **Your own AI agent** with an hourly agent routine; see [Agents (MCP)](Agents-MCP) |

## Tips

- Pauses and checks are saved with a template, so every video started from it gets them. See [Templates](Templates).
- Keep **Redos per item** low for images: five redos is already six paid images for one picture.
- You can change the checks later in the project's **Edit settings** → **Pauses and checks** (then **Save changes**). See [Editing a Project](Editing-a-Project).

## Related pages

- [Create Overview](Create-Overview)
- [Project Page](Project-Page)
- [Editing a Project](Editing-a-Project)
- [Recovery and Retries](Recovery-and-Retries)
- [Prompts](Prompts)
- [AI CLIs](AI-CLIs)
- [Agents (MCP)](Agents-MCP)
- [Costs and Run Cost](Costs-and-Run-Cost)
