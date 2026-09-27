# Reviews and Checkpoints

Two ways to keep an eye on a run before it spends more. A **review checkpoint** holds the run before a step until you approve it, so you can check and edit what came before. An **automatic review** has a reviewer model check each finished item (the article, every image, the narration, the thumbnail, every short) and flag it, or make it again, when it fails.

**Where to find it:** Play → **Reviews** row → **Change**, which opens the **Review** side panel. **Review the whole setup** in the right rail and `Ctrl+Enter` open the same panel. After the run starts: the project page → **Checkpoints**, and Edit project → **Reviews**.

## The Review side panel

The panel holds, from top to bottom:

1. Any setup errors. Press one to jump to the field.
2. **Review checkpoints**.
3. **Automatic reviews**.
4. The whole setup in words, with **Read the resolved prompt** (or **Read the supplied article and resolved prompts**), which shows each prompt exactly as it will be sent.

The estimate and the Play key stay in the right rail. Opening the panel also asks the server to check the setup, since it knows rules the browser cannot see. **Refresh review** in the right rail does the same and recalculates the estimate now, instead of waiting for you to pause typing. Use it after changing a prompt in the Library.

The Reviews row summary says what is set, for example `1 checkpoint · 2 automatic reviews`, or `No checkpoints · no automatic reviews`.

## Review checkpoints

A checkpoint holds the run before a step so you can check and edit what came before it. Steps that do not depend on it carry on. You approve each checkpoint on the project page to continue.

| Checkpoint | Holds | Available when |
| --- | --- | --- |
| **Before Audio** | The narration and what depends on it | Narration Source is **Generate** |
| **Before Images** | The images and what depends on them | Images Source is **Generate** |
| **Before Video / export** | The render and the exports | The video is on, or narration is on |

A step must be generated to have a checkpoint. A greyed checkbox says why: "Choose Generate for Images to add this checkpoint", or "Enable Video or Audio to review before export." A ticked checkpoint whose step you later turn off says "This step is unavailable. Remove its checkpoint or enable the step."

Default: no checkpoints.

### Add a checkpoint on Play

1. Open the **Reviews** row (or press **Review the whole setup**).
2. Under **Review checkpoints**, tick **Before Audio**, **Before Images** or **Before Video / export**.
3. Press **Refresh review** to see, per video, which steps each checkpoint also holds ("Run 1 · Before Images", "Also holds: Video / export.").
4. Start the run.

Starting the run does not approve the checkpoints. The run stops at each one until you approve it on the project page.

### Continue a run held at a checkpoint

When the run reaches a checkpoint, the held step waits and the project's next action says so.

1. Open the project. The right rail's next action names what runs after approval, for example **Approve and make the images**, **Approve and record the narration** or **Approve and render the video**.
2. Check and edit what came before: read the article, listen to the narration, look at the images. See [Editing a Project](Editing-a-Project).
3. Press the next action, or open **Checkpoints** in the project's side list (it shows how many are held) and press **Approve Images checkpoint** (or the stage you are at).

The checkpoint then says "Checkpoint approved. Work will run when its dependencies are ready." Each checkpoint card shows its state:

| Message | Meaning |
| --- | --- |
| "Images is held for your review. Its dependent work waits for this approval; independent work can continue." | Waiting for you. |
| "Inputs changed. Review the current revision before approving." | You edited something the held step uses. Check the new version before approving. |
| "Authorized for this revision. Work can run when dependencies are ready and the project is resumed." | Approved; it runs when it can. |
| "Checkpoint satisfied. Its reviewed work is complete." | Done. |

If the project is paused, the panel says "The project is paused. Continue the run before approving held work." Pausing always applies on top of checkpoints.

### Change checkpoints after the run started

On the project page → **Checkpoints** → **Checkpoint choices**:

1. Tick a step that has not started to add a checkpoint, or untick one to remove it. Work already admitted for an unticked step carries on when ready.
2. Press **Save checkpoints**.

Only generated steps can have one. If the project was edited elsewhere in the meantime, press **Reload checkpoint choices** and make your change again.

## Automatic reviews

A reviewer model checks each finished item and saves its verdict and reasons on the project page. Each review is a text-model call, counted in usage and in the estimate.

| Option | What it does | Default / range |
| --- | --- | --- |
| **Reviewer** | Who runs the review model. Picture reviews (images, the thumbnail and shorts) need Claude Code or Codex, which can look at images; other providers review text only. | None |
| **Reviewer model** | The model that judges each item. A stronger model catches more but costs more per review. It can differ from the model that wrote the text. | None |
| **Redos per item** | How many times **Flag and redo** makes a failed item again before it keeps the last one and flags it. Each redo costs the item again plus one more review. | 2; 0 to 5 |

Then, for each stage (**Article**, **Images**, **Narration**, **Thumbnail**, **Shorts**), pick a mode and a prompt:

| Mode | What happens to a failed item |
| --- | --- |
| **Off** (default) | No review. |
| **Flag only** | The item is marked failed, with the reasons, and the run carries on. |
| **Flag and redo** | The item is made again and reviewed again, up to **Redos per item**. After that it is kept and flagged. It never loops. |

The prompt next to each mode is **Built-in** or a **Review** prompt from the Library (see [Prompts](Prompts)). It is greyed while the mode is Off. A stage the run makes nothing for is greyed too; a stage set to review but with nothing to review says "This stage makes nothing to review in this run."

### What each review checks

| Stage | The built-in reviewer checks |
| --- | --- |
| **Article** | The article prompt's rules (length, structure, tone), no invented lore, no repeated sections. The research notes are included. |
| **Images** | Malformed hands or bodies, stray text or letters, that it matches its brief, and that it matches the establishing image when one is on. |
| **Narration** | Nothing missing or garbled compared with the text: the reviewer reads what the word timing heard and the stretches it could not hear. |
| **Thumbnail** | Readable at phone size, clear subject. |
| **Shorts** | The short's images at phone size: clear subject, no stray text, fits the title. |

### Set up automatic reviews

1. Open the **Reviews** row.
2. Pick the **Reviewer** and **Reviewer model**. For image, thumbnail or shorts reviews, pick Claude Code or Codex. With another reviewer, the panel says "Picture reviews need Claude Code or Codex as the reviewer: Slopify can't show pictures to this one." and the run cannot start.
3. Optional: set **Redos per item** (empty means 2).
4. For each stage you want checked, pick **Flag only** or **Flag and redo**, and optionally a Review prompt.
5. Check the estimate: each review adds one text-model call. Redos are not in the estimate; each costs what the item cost, at most the redos allowed.

### Reviews on the project page

Beside the article, the narration, the thumbnail and each short, and on each image tile, the verdict shows as **Review passed**, **Flagged by review**, **Being made again** or **Accepted by you**, with the reasons. For a failed item nobody has acted on:

- **Overrule** accepts it as it is.
- **Redo** makes it again (a new version of the project, then the item and what depends on it are rebuilt), and it is reviewed again.

Both buttons wait while other work on the project is running. Everything that uses a reviewed item waits for its review, in the same way a checkpoint holds work. Reviewing the same output with the same reviewer and prompt again reuses the earlier verdict.

## Checkpoints or reviews?

| You want to | Use |
| --- | --- |
| Read the article yourself before paying for the narration | **Before Audio** checkpoint |
| Look at the images before the render | **Before Images** is too early; use **Before Video / export** |
| Catch broken hands or stray text without watching every run | **Images** review, **Flag and redo** |
| Run unattended on a schedule and fix things later | Reviews on **Flag only**, no checkpoints |

## Tips

- Checkpoints and reviews are saved with a template, so every video started from it gets them. See [Templates](Templates).
- Keep **Redos per item** low for images: five redos is already six paid images for one slot.
- You can change reviews later in Edit project → **Reviews**. See [Editing a Project](Editing-a-Project).

## Related pages

- [Play Overview](Play-Overview)
- [Project Page](Project-Page)
- [Editing a Project](Editing-a-Project)
- [Recovery and Retries](Recovery-and-Retries)
- [Prompts](Prompts)
- [AI CLIs](AI-CLIs)
- [Costs and Run Cost](Costs-and-Run-Cost)
