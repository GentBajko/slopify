# Templates

A template is a saved setup: prompts, voice, images, style, extras, pauses and checks, under a name. Start from it on Create, type a topic, and the video is set up the way you like it. Schedules run templates too, so a template is also the recipe every scheduled video follows.

Set a template up section by section, with a live sample beside every setting, in **Edit template** (see [Template Studio](Template-Studio)).

**Where to find it:** **Templates** in the rail. You also pick templates under **Start from** on Create, save them with Create's **Save as template** or a project's **More** menu, and move them between channels on a channel's **Templates** tab.

## The Templates page

Two tabs: **Video templates** (with how many you have) and **Poster templates** (designed pieces such as posters). The header holds **Add starter templates** and **More** → **Import a template file (.zip)**. With seven or more templates, **Search templates** and a sort menu sit above the cards; with two or more channels, **Show templates of** narrows them to one channel.

Each video template is a card: a preview of what it makes, its name, one line of what it makes (for example "Landscape 16:9 · Voice: History narrator (storyteller), OpenAI · about 2,200 words · captions on the video · 2 shorts"), what it **Asks for**, its channel and, once schedules run it, how they run it (for example **Used by 1 schedule**). Its actions:

| Action | What it does |
|---|---|
| **Make a video** | Opens Create with a fresh draft made from the template. Nothing starts until you press **Make the video**. |
| **Edit template** | Opens the template's editor, section by section, with a sample beside the settings. See [Template Studio](Template-Studio). |
| **More** → **Duplicate** | Makes a copy in the same channel. |
| **More** → **Versions** | Every saved version (see [Versions](#versions)). |
| **More** → **Export as a file (.zip)** | Saves the template as a `<name>.slopify-template.zip` file you can import on another computer with **More** → **Import a template file (.zip)**. |
| **More** → **Delete…** | Asks first, then moves the template to the trash (see [Delete a template](#delete-a-template)). |

With no templates yet, the page says what a template is for and offers **Add starter templates**.

## What a template keeps

| Kept | Left out |
|---|---|
| Every setting of Create and every pause and check | The topic you typed: keywords the project title names, such as `{{Topic}}`, are saved empty |
| A copy of each prompt the setup uses (article, image, thumbnail, description, shorts and so on) | Extra videos you added with **Another topic** |
| A copy of each picked intro and outro | Uploaded fonts |
| Values of the other keywords, such as a word count | Uploaded files keep their names but must be attached again when you use the template |
| The channel it belongs to | |

Because the template keeps copies of its prompts, editing a prompt on Prompts later does not change a template you already saved. Save the template again to pick up the new prompt.

## Save a template from Create

1. Set up a video on [Create](Create-Overview) the way you want every video of this kind to look.
2. Press **Save as template** in the page header.
3. Type a **Template name** (up to 120 characters). The placeholder suggests the title without its keywords.
4. Read the line under the name. It says what is left out, such as the topic you typed.
5. Press **Save template**. The template appears under Create's **Start from** and on **Templates**.

## Save a template from a finished project

You can turn any project's current setup into a template, which is handy after you have tuned a project with **Edit settings**.

1. Open the project.
2. Open **More** in the title row and choose **Save as template…** (or press `Ctrl+K` and search for **Save as template**).
3. Type a **Template name** (up to 120 characters) and press **Save template**.

The template takes the settings of the version you are looking at.

## Use a template

**From Create:**

1. Open **Create**.
2. Pick the template under **Start from**. Create opens a fresh draft made from it and carries over the topic you already typed.
3. Type the topic, check the rows, and press **Make the video**.

**From Templates or Home:** press **Make a video** on the template. Create opens with a fresh draft made from it.

Keywords the project title names start empty so you can type this video's topic. Uploaded files keep their names but must be attached again.

## Versions

Every save of a template is a new version. **More** → **Versions** lists them, newest first, as **Version N** with its name and date, the newest marked current, the others with **Restore**, and **Compare with the current version** beside the list. **Restore** saves the old version again as a new version ("Restored version 2 of … as version 5."), so nothing after it is lost.

Schedules run the template's newest version until you approve one for schedules in Edit template (**More** → **Approve for schedules**); from then on they run the approved one. See [Edit template](Template-Studio#approve-for-schedules) and [Schedules](Schedules).

## Move a template to another channel

1. Open **Channels**, then the channel that holds the template.
2. Open the **Templates** tab.
3. Choose the new channel for the template.

The template and every schedule that runs it move together. Their next runs use the new channel's brand kit, cast and series brief. Projects already made keep what they were made with. Moving a template does not make a new version of it.

## Delete a template

1. Open the template's **More** and choose **Delete…**.
2. Confirm with **Delete template**.

The template goes to **Settings → Trash** for 30 days, where you can restore it. Projects already made from it keep their setup. A template that a schedule still runs can't be deleted: delete or change that schedule first. See [Trash](Trash).

## Retired models

When a template picks a model that has been retired, it says so, for example "Images … is retired.", with **Switch to <model>**. One press switches the template to the replacement, as in Settings → **Models**, and the schedules that run it follow. When there is no replacement, it says to choose another model in Settings → **Models** or edit the template. See [Models](Models#switch-away-from-a-retired-model).

## Starter packs

**Templates → Add starter templates** offers a ready-made set for one kind of channel. Each adds prompts, a suggested voice and a ready-made template, named `<kind> starter`:

| Starter | What it is for |
|---|---|
| **Sleep lore** | Slow, gentle myths and legends told to fall asleep to |
| **True crime** | Measured, factual retellings of real cases and their investigations |
| **History** | Narrative history of people, places and events, told like a documentary |
| **Science explainers** | Clear, friendly explanations of how the world works, one idea at a time |

Adding one twice changes nothing, and it never replaces a prompt or template of yours with the same name. The first-run screen offers the same starters; see [First launch and welcome](First-Launch-and-Welcome#starter-packs).

## Tips

- Make one template per kind of video (a long documentary, a 60-second short, a podcast) rather than one template you change each time.
- Put the topic keyword in the title, like `History: {{Topic}}`. Then the template saves it empty, Create asks for it, and a schedule can fill it from its topic list.
- Keep settings you vary per video, such as a word count, as their own keywords. A schedule can set them per topic in its table.

## Related pages

- [Template Studio](Template-Studio)
- [Create Overview](Create-Overview)
- [Prompts and Templates](Prompts-and-Templates)
- [Schedules](Schedules)
- [Channels](Channels)
- [Prompts](Prompts)
- [Trash](Trash)
