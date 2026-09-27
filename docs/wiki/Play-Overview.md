# Play Overview

Play is the screen where you set up a new video and start it. You pick a template (or none), type what the video is about, check the setup rows, and press the Play key. You get a project that writes the article, records the narration, draws the images and renders the video, plus any extra outputs you switched on.

**Where to find it:** **New video** in the sidebar, **New video** on Home or Projects, `Ctrl+K` → **New video**, or press `C` anywhere. The page header reads **What's the video about?**

## How Play is laid out

Play is one path from topic to queue:

1. **Template** and the topic fields at the top.
2. **More videos from the same setup**: extra topics that run with the same settings.
3. **The setup rows**: one line each for Title and keywords, Article, Narration, Images, Video and style, Outputs, Reviews and Channel. Each line says what the run will do. **Change** opens the row's editor under it, and **Done** folds it again.
4. **The right rail**: the style preview, the number of videos, the estimated cost, the Play key, and the buttons **Refresh review**, **Review the whole setup** and **Save as template**.

Nothing starts until you press the Play key. Every change is saved to the current draft as you make it.

## Start a video

1. Open Play.
2. Optional: pick a **Template**. Picking one opens a fresh draft made from it, and the topic you already typed comes along.
3. Type the **Title**, or the topic if the title is a pattern (see below).
4. Look over the setup rows. A row that needs something shows **Needs setup** and says what is missing. Press **Change** to fix it.
5. Check the estimate in the right rail.
6. Press **Start run** (or **Queue N videos** if you added more topics).

Slopify opens the new project page as soon as the run is created. When the Play key cannot start, the reason is written right under it, with **Go to the field** beside it to jump to the field that needs fixing.

## Template

| Option | What it does | Default |
| --- | --- | --- |
| **Template** | Starts this video from a saved setup: prompts, voice, images, style, outputs and reviews. Picking one opens a fresh draft made from it and carries the topic you typed. | **No template**, the default setup |

Under the picker you see the template's channel and version. If the template was deleted since you picked it, the picker says **Template no longer saved**. With no templates yet, it says to set up a video and press **Save as template**. See [Templates](Templates) for managing them.

## Title, title pattern and topic

The **Title** is the video's name, shown on the project and in Projects. Up to 200 characters.

Write a keyword in double braces and the title becomes a pattern. For example, `History: {{Topic}}`:

- The top of Play then asks for **Topic** instead of the whole title, and shows the title it makes underneath (**Title: History: The Lost City**).
- The pattern itself moves to **Title and keywords → Title pattern**, where you can change it.
- Each keyword the title names is a topic you type once per video. Templates save it empty.
- A topic value is up to 200 characters, on a single line.

A title without braces is typed as is.

### Already made on this channel

As you type, a quiet line under the topic fields says when the picked channel already has a video on it, using the same near-duplicate rule as [schedules](Schedules#how-generation-works):

- `This channel already has a video on this: "<title>" (in Projects). Start anyway if you want another take.`
- `This channel already uploaded "<title>" (Channel → Existing videos). Start anyway if you want another take.`

It never stops you; it is there so you don't make the same video twice by accident.

## Keywords

A keyword is a value that a picked prompt or the title asks for with `{{name}}`. You type it once, and it fills every place that names it. The line under each keyword lists where it is used.

Keywords live in the **Title and keywords** row. Topic keywords (the ones the title names) are typed at the top of Play instead. If there are none, the row says: "No keywords. A prompt or the title that names {{a keyword}} adds one here."

| Option | What it does | Limit |
| --- | --- | --- |
| **Keyword** | Fills every `{{name}}` in the title and the picked prompts. A keyword the title does not name is saved with a template. | 200 characters, single line |

## More videos from the same setup

**Add topic** queues another video with everything else the same. Only its title and keywords differ.

1. Press **Add topic** under the topic fields.
2. Type the new topic (or the new title, if the title has no keywords) and press **Add**. Add as many as you like, then press **Done** or `Esc`.
3. Each extra video shows as a chip. Its name is a button with a pencil (**Change the keywords of …**): press it to open a side panel where you can change that video's **Title** and keywords. Everything else comes from the setup of the first video.
4. Press the **x** on a chip to remove that video.

One Start queues at most 50 videos: this setup and 49 more. The Play key reads **Queue N videos**, and the videos run one at a time, in order.

### The video queue

Videos started together wait in the queue, shown on the Calendar under **Batch queue** (see [Calendar](Calendar#the-batch-queue)) and behind the **Queue · N** button in a project page's right rail. Projects has a **Queued** filter for them. Pausing a project holds the queue. When one fails or is cancelled, the next one starts.

## Drafts

Play saves every change to the current draft on its own. The status beside **Drafts** in the page header says **Unsaved**, **Saving…**, **Saved**, **Couldn't save** or **Changed elsewhere**.

- **Drafts** lists your saved setups with their last edit time. Press anywhere on a draft's row to open it, or **Discard** to delete it (it asks you to confirm, and this cannot be undone).
- **New draft** starts an empty draft and keeps the current one in the list.
- If saving fails, press **Retry**.
- A draft the app cannot read is marked "Unsupported or corrupt draft". Try opening it to recover it, or discard it.

### When a draft was changed elsewhere

If you have the same draft open in another tab or window and it was saved there, the status says **Changed elsewhere** and offers two buttons:

| Button | What it does |
| --- | --- |
| **Reload saved draft** | Shows the version saved elsewhere and drops your unsaved change. |
| **Save as a new draft** | Keeps your version as a separate draft and leaves the other one alone. |

## The setup rows at a glance

| Row | What it holds | Details |
| --- | --- | --- |
| **Title and keywords** | The title pattern and every keyword value | This page |
| **Article** | Article source, article prompt, text generation (LLM, model, thinking), research | [Play Title and Article](Play-Title-and-Article) |
| **Narration** | Narration source, TTS, model, voice, speakers, Audio Advanced (chunking, intro, outro, preparation, glossary, aliases, tables and figures) | [Play Narration](Play-Narration) |
| **Images** | Images source, provider, model, effort, image prompts, establishing image, more images for long videos | [Play Images](Play-Images) |
| **Video and style** | Video source, seconds per image, zoom, motion, cuts, the Look, ambient sound, pauses and volume, silence, frame format, captions, preview text | [Play Video and Style](Play-Video-and-Style) |
| **Outputs** | Thumbnail, YouTube description, Shorts, tables and figures on screen, PDF document | [Play Outputs](Play-Outputs) |
| **Reviews** | Review checkpoints and automatic reviews (opens the side panel) | [Reviews and Checkpoints](Reviews-and-Checkpoints) |
| **Channel** | Channel, brand kit, language | This page, [Channels](Channels), [Other Languages](Other-Languages) |

When you open a draft, rows that need attention start open. The others stay folded until you press **Change**.

## Channel row

| Option | What it does | Default |
| --- | --- | --- |
| **Channel** | The channel this video belongs to. Its brand kit fills what this setup leaves at its default, and its cast of characters goes with the images. The list shows how many are in each channel's cast. | The template's channel, or the default channel |
| **Use the channel's brand kit** | Fills what this setup leaves at its default from the channel: the caption font, intro, outro, document theme and ambient sound. What you set on Play wins. Off takes none of it; the cast and language still apply. | On |
| **Language** | The language the article, narration, YouTube description and shorts titles are written in. Blank uses the channel's language. | Channel's language |

The row has an **Edit** link to the channel's page. For the language, voices and caption timing in other languages, see [Other Languages](Other-Languages). For the cast, see [Cast Library](Cast-Library).

## The right rail

### Style preview

When the video is generated from images, the rail shows **Style preview**: six seconds of the bundled sample project, its real narration over three of its pictures, rendered by the real renderer with your captions, Look and motion, and the captions timed to the narration. See [Play Video and Style](Play-Video-and-Style#style-preview).

### Estimated cost

What the providers are likely to charge for this run, in US dollars, from their published prices. Actual usage can differ, and the estimate does not cap spending.

- The total shows as **Estimated total** (a low to high range when it can vary). If some prices are unknown, it shows **Known subtotal** and says how many stage charges have unavailable pricing.
- **Cost by stage** folds out the price of each stage, what each assumes, and the date the price catalogue was checked. With several videos, the rows show combined costs.
- Steps run through a command-line tool you are signed in to (such as Claude Code or Codex) show **$0 on your plan**, with the approximate API price beside them for comparison.

The estimate refreshes on its own a moment after you stop typing. Press **Refresh review** to check the setup and recalculate now, for example after changing a prompt in the Library.

See [Costs and Run Cost](Costs-and-Run-Cost) for how prices are worked out.

### Expected article words per video

How long you expect each generated article to be. It drives the cost estimate and how many images **More images for long videos** adds. Once the article is written, its real length is used. About 150 words is one minute of narration.

| Option | Default | Range |
| --- | --- | --- |
| **Expected article words per video** | 1500 | 1 to 100,000 |

### The Play key

| Label | When |
| --- | --- |
| **Start run** | One video |
| **Queue N videos** | You added more topics |
| **Starting…** | The start is being sent |
| **Check Start result** | Slopify didn't confirm the last start. Press it to find out before starting again. |

The line under the key says why it can't start yet (a missing field, an upload still running, the estimate still being checked), or "Nothing starts until you press it."

### Review the whole setup

Opens the **Review** side panel: every setting of the run in words, any setup errors (press one to jump to it), the review checkpoints, the automatic reviews, and **Read the resolved prompt**, which shows each prompt exactly as it will be sent, with keywords filled in. `Ctrl+Enter` anywhere on Play opens the same panel. See [Reviews and Checkpoints](Reviews-and-Checkpoints).

## Save as template

**Save as template** in the right rail keeps this setup's prompts, voice, images, style, outputs and reviews so you can start the next video from it.

1. Press **Save as template**.
2. Type a **Template name** (up to 120 characters). This is the name the template is listed under on Play and Templates.
3. Read the list of what is left out, then press **Save template**.

What a template keeps and leaves out:

- Keywords the title names (like `{{Topic}}`) are saved empty. The dialog names each one, and the value you typed for this video.
- Other keywords (a word count, a style) keep their values. If the title names no keywords, the dialog says every keyword keeps its value.
- The other videos you queued with **Add topic** are not saved.
- The template belongs to the draft's channel.

You can also save a template from Templates → **Save a setup**, which picks a saved Play draft (**Saved Play draft**), a **Template name** of up to 120 characters and a **Channel**. The same keyword rule applies there, and queued extra videos and uploaded fonts are left out. See [Templates](Templates).

## Command palette

Every Play action is in the command palette (`Ctrl+K`):

| Command | What it does |
| --- | --- |
| **Start run** / **Queue N videos** | Starts, or jumps to what holds it back |
| **Add a topic for another video** | Opens the Add topic field |
| **Save as template** | Opens the Save as template dialog |
| **Review the whole setup** (`Ctrl+Enter`) | Opens the Review panel |
| **Pick a template** | Focuses the Template picker |
| **Change title and keywords**, **Change article**, and one per row | Opens that row and scrolls to it |

## Tips

- A long video on the same topic as a finished short is one press away: **Make the full video on this topic** on the short's project page opens Play set up for it. See [Your First Short](Your-First-Short#make-the-full-video-next).
- Start with a template and only change the rows you need. The row summaries tell you what each one will do without opening it.
- Use a title pattern and **Add topic** to queue a series in one go.
- If a template refers to a prompt you have since deleted, the Article or Images row shows **Needs setup**. Pick another prompt.

## Related pages

- [Your First Short](Your-First-Short)
- [Play Title and Article](Play-Title-and-Article)
- [Play Narration](Play-Narration)
- [Play Images](Play-Images)
- [Play Video and Style](Play-Video-and-Style)
- [Play Outputs](Play-Outputs)
- [Reviews and Checkpoints](Reviews-and-Checkpoints)
- [Templates](Templates)
- [Costs and Run Cost](Costs-and-Run-Cost)
- [Keyboard Shortcuts and Command Palette](Keyboard-Shortcuts-and-Command-Palette)
