# Templates

A template is a saved Play setup: prompts, voice, images, style, outputs, reviews and checkpoints, under a name. Pick it on Play, type a topic, and the video is set up the way you like it. Schedules run templates too, so a template is also the recipe every scheduled video follows.

**Where to find it:** **Library → Templates**. You also pick templates at the top of **Play**, save them from Play's right rail or a project's **More** menu, and move them between channels on a channel's **Templates** tab.

## What a template keeps

| Kept | Left out |
|---|---|
| Every Play setting and every checkpoint choice | The topic you typed: keywords the project title names, such as `{{Topic}}`, are saved empty |
| A copy of each prompt the setup uses (article, image, thumbnail, description, shorts and so on) | Extra videos you queued with **Add topic** |
| A copy of each picked intro and outro | Uploaded fonts |
| Values of the other keywords, such as a word count | Uploaded files keep their names but must be attached again when you use the template |
| The channel it belongs to | |

Because the template keeps copies of its prompts, editing a prompt in the Library later does not change a template you already saved. Save the template again to pick up the new prompt.

## Save a template from Play

1. Set up a video on [Play](Play-Overview) the way you want every video of this kind to look.
2. In the right rail, press **Save as template**.
3. Type a **Template name** (up to 120 characters). The placeholder suggests the title without its keywords.
4. Read the list under the name. It says what is left out, such as the topic you typed and any extra videos. If the title names no keyword, it says every keyword keeps its value.
5. Press **Save template**. The template appears on Play's **Template** picker and in **Library → Templates**.

## Save a template from a finished project

You can turn any project's current setup into a template, which is handy after you have tuned a project with **Edit project**.

1. Open the project.
2. Open the **More** menu (or press `Ctrl+K` and search for **Save as template**).
3. Type a **Template name** (up to 120 characters) and press **Save template**.

The template takes the setup of the revision you are looking at.

## Save a template from Library → Templates

1. Open **Library → Templates** and press **Save a setup**.
2. Under **Saved Play draft**, choose a draft. Only drafts saved in Play are listed; open Play and set one up first if the list is empty. The draft itself is not changed.
3. Type a **Template name** (up to 120 characters).
4. Pick the **Channel**. The default, **The draft's channel**, is the draft's own channel, or its template's channel when it has none.
5. Press **Save template**.

## Use a template

**From Play:**

1. Open **Play**.
2. Pick the template in the **Template** field at the top. Play opens a fresh draft made from it and carries over the topic you already typed.
3. Type the topic, check the rows, and press **Start run**.

**From Library → Templates:**

1. Find the template in the list.
2. Press **Use in Play**. Slopify makes a new Play draft from the template and opens it. Nothing starts until you press **Start run**.

Keywords the project title names start empty so you can type this video's topic. Uploaded files keep their names but must be attached again.

## The row actions

Every template row has the same actions as the other Library lists, always in this order:

| Action | What it does |
|---|---|
| **Edit** | Picks the template and shows its keywords beside the list (below). To change its settings, press **Use in Play**, change the draft, then **Save a setup**. |
| **Duplicate** | Makes `<name> copy` in the same channel ("Duplicated as …"). |
| **Use in Play** | Makes a fresh Play draft from the template and opens it. |
| **History** (clock icon) | Every saved version, compared with the current one, with **Restore** (see [History](#history)). |
| **Delete** (bin icon) | Asks first, then moves the template to the trash (see [Delete a template](#delete-a-template)). |

A press anywhere on a row picks it. The pencil beside a template's name renames it in the row (see [Rename a template](#rename-a-template)).

## See a template's keywords

Pick a template (or press **Edit**) and its keywords show beside the list: each keyword, whether it is a topic keyword (saved empty) or a setting-like keyword that keeps its value, and which prompts or fields it feeds. This is the same list Play and Edit project show. With nothing picked it says "Pick a template to see the keywords it fills."; a template with none says "No keywords: the prompts and the title name none."

## Rename a template

1. Press the pencil (**Rename <name>**) beside the template's name.
2. Type the new name (up to 120 characters) and press **Save name** or Enter. `Esc` or **Cancel** keeps the old name.

The notice says "Renamed “A” to “B”." with **Undo**. A rename saves a new version of the template; its settings stay as they are.

## History

Press the clock icon (**History of <name>**) on a template's row. The drawer has:

- **Versions**: every version, newest first, as **Version N** with its name and date. The newest is marked **Current**; the others have **Restore**.
- **Compare with the current version**: the version you picked, side by side with the current one. A rename between them is said above ("Renamed from … to …").

**Restore** saves the old version again as a new version ("Restored version 2 of … as version 5."), so nothing after it is lost. Schedules keep the version they were set up with; see [Versions](#versions).

## Filter by channel

Use **Show templates of** above the list to see only one channel's templates, or **All channels**. This only changes what you see. A template's channel is the one a draft made from it runs in; see [Channels](Channels).

## Move a template to another channel

1. Open **Channels**, then the channel that holds the template.
2. Open the **Templates** tab.
3. Choose the new channel for the template.

The template and every schedule that runs it move together. Their next runs use the new channel's brand kit, cast and series brief. Projects already made keep what they were made with. Moving a template does not make a new version of it.

## Versions

Each template shows **Version N · updated** with the date. Schedules remember the version they were set up with; to make a schedule use a newer version, pick the template again in the schedule's **Template** field. See [Schedules](Schedules).

## Delete a template

1. Press the bin icon (**Delete <name>**) on the template's row.
2. Confirm with **Delete template**.

The template goes to **Settings → Backup & storage → Trash** for 30 days, where you can restore it. A template that a schedule still runs can't be deleted: delete or change that schedule first. See [Trash](Trash).

## Retired models

When a template picks a model that has been retired, its row says so, for example "Images … is retired.", with **Switch to <model>**. One press switches the template to the replacement, as in Settings → **Models**, and the schedules that run it follow. When there is no replacement, the row says to choose another model in Settings → **Models** or edit the template. See [Models](Models#switch-away-from-a-retired-model).

## Starter packs

**Library → Templates → Add pack** opens **Add a starter pack**. Press **Add pack** on a pack's row; it then reads **Added**. Each pack adds prompts, a suggested voice and a ready-made Play template for one kind of channel:

| Pack | What it is for |
|---|---|
| **Sleep lore** | Slow, gentle myths and legends told to fall asleep to |
| **True crime** | Measured, factual retellings of real cases and their investigations |
| **History** | Narrative history of people, places and events, told like a documentary |
| **Science explainers** | Clear, friendly explanations of how the world works, one idea at a time |

Adding a pack twice changes nothing, and a pack never replaces a prompt or template of yours with the same name. The first-run screen offers the same packs (**Add to library**); see [First launch and welcome](First-Launch-and-Welcome#starter-packs).

## Tips

- Make one template per kind of video (a long documentary, a 60-second short, a podcast) rather than one template you change each time.
- Put the topic keyword in the title, like `History: {{Topic}}`. Then the template saves it empty, Play asks for it, and a schedule can fill it from its topic list.
- Keep settings you vary per video, such as a word count, as their own keywords. A schedule can set them per topic in its table.

## Related pages

- [Play overview](Play-Overview)
- [Schedules](Schedules)
- [Channels](Channels)
- [Prompts](Prompts)
- [Trash](Trash)
