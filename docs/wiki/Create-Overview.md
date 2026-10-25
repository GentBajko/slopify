# Create Overview

Create is the screen where you set up something new and make it: a video, an article, an audiobook, a podcast episode or a set of images. You pick what you are making, what it starts from and what it is about, then press **Make the video**. You get a project that writes the article, records the narration, draws the images and puts the video together, plus any extras you switched on.

**Where to find it:** **Create** at the top of the rail (in the middle of the phone's bottom bar), `Ctrl+K` → **Create a video**, or press `C` anywhere. **Make a video** on a prompt, a template or a channel opens Create with it picked.

## How Create is laid out

Create is one screen, read from top to bottom:

1. **What are you making?** Five cards: **Video** (narration over images), **Article** (written text, also as a PDF), **Audiobook** (a text read aloud by a narrator), **Podcast** (a conversation between speakers) and **Images** (pictures from your prompts).
2. **Start from**: a blank one (**A blank video**, **A blank article** and so on) or one of your templates. With two or more channels, **For** beside it picks the channel.
3. **What's the video about?**: the topic. The question follows what you make ("What's the episode about?", "What are the images of?"). **Another topic** adds more videos made the same way.
4. **The rows**: one line each for **Keywords**, **Article**, **Narration**, **Images**, **Video and style**, **Extras**, **Pauses and checks** and **Channel**. Each says in one sentence what the run will do. Under a row's name, **From History starter** (or your template's name) means it is as the template set it, and **Changed here** that you changed it on this screen.
5. **A picture instead?**: **Design a poster** and **Edit a picture** open the design editor.
6. **The rail on the right**: how many videos, the expected length, the estimated cost, the **Make the video** button with the next thing to fix under it, **See everything this run will do**, and the style preview.

The page header holds **Save as template** and **Draft:** with the draft's name.

Nothing is made until you press **Make the video**. Every change is saved to the current draft as you make it.

### Rows open one at a time

**Change** opens a row's editor under its line; **Close** (for example **Close narration**) folds it again. Opening one row folds the others. A row that needs something says what in red and its button reads **Fix**. When you open a draft, the first row that needs something opens by itself.

A row with nothing to set for this video is left out: **Keywords** shows only when a prompt asks for a keyword besides the topic, and **Channel** only when you have two or more channels. What you are making decides the rest:

| You make | Rows |
| --- | --- |
| **Video** | Keywords, Article, Narration, Images, Video and style, Extras, Pauses and checks, Channel |
| **Article** | Keywords, Article, Extras, Pauses and checks, Channel |
| **Audiobook** or **Podcast** | Keywords, Article, Narration, **Sound and captions** (the Video and style row of spoken work), Extras, Pauses and checks, Channel |
| **Images** | Keywords, Images, **Shape and look**, Pauses and checks, Channel |

For anything but a video, the thumbnail, YouTube description, shorts and posts fold away under **Publishing extras** in the Extras row. A row that is open or needs fixing stays in view whatever you make, so nothing that stops the run is ever out of reach.

## Make a video

1. Open Create.
2. Optional: pick a template under **Start from**. Picking one opens a fresh draft made from it, and the topic you already typed comes along.
3. Type what the video is about.
4. Look over the rows. If the line under **Make the video** names something to fix, press it: it opens the row and the field that needs it.
5. Check the estimated cost in the rail.
6. Press **Make the video** (or **Queue 3 videos** if you added more topics).

Slopify opens the new project as soon as the run is created. The button's name follows what you make: **Make the article**, **Make the audiobook**, **Make the podcast**, **Make the images**.

## Start from a template

| Option | What it does | Default |
| --- | --- | --- |
| **Start from** | Starts from a saved template: its prompts, voice, images, style, extras and pauses. Picking one opens a fresh draft made from it and carries the topic you typed. | **A blank video** (or blank article, audiobook, episode, image set) |

Make templates with **Save as template** (below), or add the starter templates under **Templates** → **Add starter templates**. See [Templates](Templates).

## The topic and the title

The topic is the video's subject in your own words, such as "The Library of Alexandria". With a blank start it is also the video's title, shown on the project and in Projects. Up to 200 characters.

A template's title can be a pattern with a keyword in double braces, for example `History: {{Topic}}`:

- The field then asks for **Topic**, and shows the title it makes under it (**Title will be: History: The Lost City**).
- The pattern itself is in the **Keywords** row as **Title pattern**, where you can change it.
- Each keyword the title names is typed once per video. Templates save it empty.

When the video goes to YouTube, the title is also its YouTube title unless one is written for it, so YouTube's limit is said under the field (it never stops the run).

### Already made on this channel

As you type, a line under the topic says when the channel already has a video on it, using the same near-duplicate rule as [schedules](Schedules#how-generation-works):

- `This channel already has a video on this: "<title>" (in Projects). Start anyway if you want another take.`
- That the channel already uploaded a video with that title, from the channel's **Titles to avoid**.

It never stops you; it is there so you don't make the same video twice by accident.

## Keywords

A keyword is a value that a picked prompt or the title asks for with `{{name}}`. You type it once, and it fills every place that names it. The line under each keyword lists where it is used.

The topic keywords (the ones the title names) are typed at the top. Any others are in the **Keywords** row, whose line reads, for example, `Asks for: Era, Audience.`

| Option | What it does | Limit |
| --- | --- | --- |
| Each keyword | Fills every `{{name}}` in the title and the picked prompts. A keyword the title does not name keeps its value in a template. | 200 characters, one line |

Every keyword must be filled before the run can start. Some keywords are filled by Slopify itself; see [Keywords Slopify fills](Keywords-Slopify-Fills).

## More videos from the same setup

**Another topic** queues more videos with everything else the same. Only the topic and keywords differ.

1. Press **Another topic** under the topic.
2. Type the next topic and press **Add**. Add as many as you like, then press **Done** or `Esc`.
3. Each extra video shows as a chip. Press its name to open a side panel where you can change that video's **Title** and keywords. Everything else comes from this setup.
4. Press the remove button on a chip to drop that video.

One press makes at most 50 videos: this one and 49 more.

### One after another

With more than one video, the rail shows **One after another** (on by default):

| One after another | What happens | The button reads |
| --- | --- | --- |
| **On** | The videos run one after another, in order, each starting when the one before finishes. | **Queue 3 videos** |
| **Off** | They all start at once, as separate runs. | **Make 3 videos** |

All at once finishes sooner while the steps wait on services (research, narration, images), but the videos are put together on your computer's processor at the same time, so each takes longer, and Claude or Codex plan limits are reached sooner (Slopify waits and goes on when they reset).

### The video queue

Videos queued together wait their turn. Home lists them under **Running** → **Waiting to start**, and the Calendar under **Batch queue**, with **Earlier**, **Later** and **Remove** on each. Projects has a **Queued** filter, and a project page says how many videos wait in the queue and opens the list. Pausing a project holds the queue; when one fails or is canceled, the next one starts.

## Drafts

Create saves every change to the current draft by itself. **Draft:** in the page header names the draft and opens the list of drafts:

- The top line says **Saved. Every change is saved as you go.**, **Saving…**, **Not saved yet**, **Couldn't save** or **Changed in another tab**.
- **New draft** starts an empty draft and keeps the current one in the list.
- **Saved drafts** lists the others with their last change; press one to open it, or its delete button to delete it. A deleted draft is gone for good; it does not go to the trash.
- If saving fails, **Couldn't save** appears beside the button with **Retry**.

### When a draft was changed elsewhere

If the same draft is open in another tab and was saved there, the header says **Changed in another tab.** with two buttons:

| Button | What it does |
| --- | --- |
| **Reload saved draft** | Shows the version saved elsewhere and drops your unsaved change. |
| **Save as a new draft** | Keeps your version as a separate draft and leaves the other one alone. |

## The rows at a glance

| Row | What it holds | Details |
| --- | --- | --- |
| **Keywords** | The title pattern and every keyword besides the topic | This page |
| **Article** | Where the text comes from, the article prompt, **Written by** (service, model, thinking), research and the language | [Article](Create-Article) |
| **Narration** | Where the narration comes from, **Read by** (service, model, voice), a sample, **Speakers**, and **More narration settings** (splitting, intro, outro, preparation, pronunciation, tables and figures) | [Narration](Create-Narration) |
| **Images** | Where the images come from, **Images by** (service, model), the image styles and counts, the establishing image, more images for long videos, scenes from the article | [Images](Create-Images) |
| **Video and style** | Video on or off, frame format, captions, **Images and cuts**, **Look**, ambient sound and **Sound polish** | [Video and style](Create-Video-and-Style) |
| **Extras** | Thumbnail, YouTube description, shorts, posts to other sites and the PDF | [Extras](Create-Extras) |
| **Pauses and checks** | Where the run pauses for your approval, and whether an AI checks the results | [Pauses and checks](Reviews-and-Checkpoints) |
| **Channel** | Whether the channel's brand kit fills the defaults | [Channel row](#channel-row) |

## Channel row

The channel itself is picked with **For** beside **Start from**, shown when you have two or more channels. A fresh draft starts in the channel Home, Projects and the Calendar are showing.

| Option | What it does | Default |
| --- | --- | --- |
| **For** | The channel this video belongs to. Its brand kit fills what this setup leaves at its default, and its cast goes with the images. | The template's channel, or the channel you are showing |
| **Use the channel's brand kit** | Its caption font, intro, outro, PDF look and sounds fill what this setup leaves at its default. What you set on Create wins. Off takes none of it; the cast still applies. | On |

**Open <channel>** goes to the channel's page. The language is in the [Article](Create-Article#language) row. For the cast, see [Cast Library](Cast-Library); for the brand kit, [Channels](Channels).

## The rail

### Expected length

**Expected length: about 20 min · 3,000 words**, with **Change** to type **Words per video**. It feeds the estimate and how many images **More images for long videos** adds; the article prompt decides the real length, and once the article is written its real length is used. About 150 words is one minute of narration. It shows while the article is written for you.

| Option | Default | Range |
| --- | --- | --- |
| **Words per video** | 1500, or what the template sets | 1 to 100,000 |

### Estimated cost

What the services are likely to charge for this run, in US dollars, from their published prices. Actual usage can differ, and the estimate does not cap spending. It reads **Estimated cost: shown once nothing is missing.** until every row is ready.

- The total shows as **Estimated total** (a low to high range when it can vary). If some prices are unknown, it shows **Known subtotal** and how many stage charges have unavailable pricing.
- **Cost by stage** folds out the price of each stage, what each assumes and the date the price catalogue was checked. With several videos, the rows show combined costs.
- Steps run through a tool you are signed in to (such as Claude Code or Codex) show **$0 on your plan**, with the approximate API price beside them for comparison, and how much of the plan's limits the run would use.

The estimate is checked again by itself a moment after you stop typing. See [Costs and Run Cost](Costs-and-Run-Cost).

### The Make button

| Label | When |
| --- | --- |
| **Make the video** | One video (or **Make the article**, **Make the audiobook**, **Make the podcast**, **Make the images**) |
| **Queue 3 videos** / **Make 3 videos** | You added more topics, with **One after another** on or off |
| **Starting…** | The start is being sent |
| **Check whether it started** | Slopify didn't confirm the last start. Press it to find out before starting again. |

The button stays an outline until the run can start. The line under it names the first thing to do, as a button that goes there (for example **Type what the video is about first**), or says what it waits for (**Wait for the uploads to finish first**, **Checking your setup and the estimate…**).

### See everything this run will do

Opens a side panel with every setting of the run in words, row by row, each with its **Change** link; what must be fixed before you can start; the topic and title; and **The prompts as they will be sent**, each prompt exactly as it goes out with its keywords filled in. `Ctrl+Enter` anywhere on Create opens it too.

### Style preview

When the video is made from images, the rail's last line names the caption style (for example **Captions: Barlow Regular 44, bottom**) with **Watch a 6-second preview**. It opens a dialog that puts six seconds of the bundled sample together with your captions, Look and motion, on this computer at no cost. See [Video and style](Create-Video-and-Style#style-preview).

## Save as template

**Save as template** in the page header keeps this setup so you can start the next video from it.

1. Press **Save as template**.
2. Type a **Template name** (up to 120 characters). This is the name it is listed under on Create and Templates.
3. Read what is left out, then press **Save template**.

What a template keeps and leaves out:

- Keywords the title names (like `{{Topic}}`) are saved empty. The dialog names each one.
- Other keywords (a word count, a style) keep their values.
- The other videos you added with **Another topic** are not saved.
- The template belongs to the draft's channel.

A project's settings can be saved as a template too, from its **More** menu. See [Templates](Templates).

## Command palette

Every Create action is in the command palette (`Ctrl+K`), under **Create**:

| Command | What it does |
| --- | --- |
| **Make the video** / **Queue 3 videos** | Starts, or opens the row that holds it back |
| **Add another topic** | Opens the Another topic field |
| **Save as template** | Opens the Save as template dialog |
| **See everything this run will do** (`Ctrl+Enter`) | Opens the side panel |
| **Pick what to start from** | Moves to the Start from picker |
| **Change article**, **Change narration** and one per row | Opens that row and scrolls to it |

## Tips

- A long video on the same topic as a finished short is one press away: **Make the full video on this topic** on the short's project page opens Create set up for it. See [Your First Short](Your-First-Short#make-the-full-video-next).
- Start from a template and change only the rows you need. The row lines tell you what each one will do without opening it.
- Use a title pattern and **Another topic** to queue a series in one go.
- If a template names a prompt you have since deleted, its row asks you to pick another.

## Related pages

- [Your First Short](Your-First-Short)
- [Article](Create-Article)
- [Narration](Create-Narration)
- [Images](Create-Images)
- [Video and style](Create-Video-and-Style)
- [Extras](Create-Extras)
- [Reviews and Checkpoints](Reviews-and-Checkpoints)
- [Templates](Templates)
- [Costs and Run Cost](Costs-and-Run-Cost)
- [Keyboard Shortcuts and Command Palette](Keyboard-Shortcuts-and-Command-Palette)
