# Edit template

**Edit template** is where a template is set up once, section by section, with a live sample beside every setting, then approved for its schedules. Each change you save is made again on a short hidden sample, so you see and hear what the next video will be like before a schedule spends anything on it.

**Where to find it:** **Templates**, then **Edit template** on a template's row. **Save as template** on a project opens it too.

## The sections

The rail on the left lists the template's sections in the order a run makes them:

| Section | What it sets |
|---|---|
| **Title and keywords** | The template's name, the video title (`History: {{Topic}}`), keyword values and the language |
| **Article** | Create's Article settings: how the article is made, the article prompt, **Written by** (who writes it), research, and **Words per video** |
| **Narration** | Create's Narration settings: the voice, its service and model, speakers, pronunciations, tables and figures |
| **Images** | Create's Images settings: made by AI, your own or none; **Images by** (service and model), image prompts, scenes |
| **Video and style** | Create's Video and style settings: frame format, captions, images and cuts, the Look, ambient sound, **Sound polish** |
| **Thumbnail** | How the thumbnail is made, its prompt, one or three of them |
| **Shorts** | Shorts from the video, how many |
| **PDF** | **PDF of the article**, and its look |
| **Pauses and checks** | Where a run pauses for you, and the AI checks |
| **YouTube description and posts** | The YouTube description, chapters and tags, and the other sites the projects post to (**Post to**), each with its text and main media. The sample shows each site's post as the site shows it. See [Posting to social sites](Posting-to-Social-Sites). |
| **Schedule** | The next five runs of each schedule that uses the template, and what they cost a month |

Each section shows Create's own editor for it, whole and in Create's words, so a setting has one name and one place. Create and a project's **Edit settings** use the same section names, with Thumbnail, Shorts, PDF and the YouTube description together under **Extras**. Where nobody chose the article's writer or the image service, the pickers show this computer's default, with one line saying so ("Each video is written by your default, Claude Code CLI (Sonnet 5.5): no writer is saved with this template yet."); the default is saved with the template only once you pick something there. A thumbnail drawn while the video has images of its own is drawn by the images' service: **Thumbnail by fal.ai (FLUX.2) · Change it in Images**.

Each section's word in the rail says where its sample is: **Sample ready** (made for this version), **Making**, **Waiting** (queued, or held with the reason), **Needs a fix** (the failed step's own sentence and what fixes it), **Off**, or **You add it** (you add the file on Create for each video, so there is no sample to make). A section with no sample yet shows no word. **Pauses and checks** and **Schedule** have no sample: they say **On** once they are on.

From 768 to 1180 pixels wide the sections are a row on top, so the sample and the checks stay beside the settings. On a phone Edit template shows **Sections · Settings · Sample** tabs instead of columns; the Sample tab says how many checks are to fix ("Sample · 2 to fix").

## Samples

Two kinds of sample are made for each version.

**Free samples** are made on this computer and cost nothing: a 30-second clip in the template's frame, captions, Look and picture timing on Slopify's sample pictures; the loudness before and after; the PDF in the template's theme; and each schedule's cost a month. They are made by themselves when a version is opened.

**The paid sample** is a short taste of one video about the sample topic, made with your keys on a hidden project that never appears in Projects, Home, the calendar, usage or anywhere else:

- the outline and chapter 1 of the script (or the full script, see below),
- about 30 seconds of narration,
- up to 4 pictures, 1 thumbnail and 1 short,
- no pauses; an agent's checks are not asked.

After the first one, a Save makes again only what the change outdates. Work already going is never stopped: a newer Save waits for it.

### Sample topic

**Sample topic** at the top of the sample column, **The history of the lighthouse**, is what every sample is about. Press **Change** to type another, take the next topic a schedule has queued, or go back to the fixed one. A new topic makes every sample again and is priced on **Use this topic**; going back to the fixed one is free.

### Write the whole article in the sample

Under **Article**, **Write the whole article in the sample** has the sample write the whole article instead of the outline and chapter 1, priced on the switch. Only the article and what is made from it are made again. Your videos always get the whole article.

### Say it as

Under **Narration**, **Say it as** lists the names the sample's script says that a voice may get wrong, each with the line it is in. **Play** one to hear it, type how it should be said and press **Save**: that writes a row of your Pronunciation list (Settings → Voices → Pronunciation, used by every project started after it) and voices again only the sample's lines that say it, priced on the button. **Another word to check** adds a name of your own.

### Prompt anatomy

**Prompt anatomy** under a section's settings cuts the prompt the sample sent into who wrote each part: your own words, your keywords' values, what Slopify filled in (such as the sample's "outline and chapter 1 only" instruction) and what settings added.

## Budget and prices

Every paid sample is priced before anything is spent:

- **Save** never spends: it keeps the change as the template's next version and makes the free samples again. The paid sample waits for **Make sample**, priced on the button, for example **Make sample · about $0.12**. One press makes the samples of every paid section that is on, together; the line above the button names them.
- A sample with steps no price is known for says **at least $0.30**, or **price not known** when none is priced, never **free**. Pressing it accepts that.
- A sample that costs more than a quarter more (plus five cents) than the price you saw, or has a step with no known price you didn't accept, waits instead of starting, with the new price on **Make sample**.
- The daily sample budget under **Settings → Production defaults** is the most the samples may spend in one day ($2.00 by default). A sample on your Claude Code or Codex plan runs only when **Let samples use my Claude Code or Codex plan** is on there. When today's budget or that setting would only hold the sample, a sentence with a link to **Settings → Production defaults** stands where **Make sample** would be. What a removed sample or a discarded comparison was charged today still counts. See [Settings-Reference](Settings-Reference#template-samples).

**Make samples for all**, under **Samples for all templates** in Settings → Production defaults, prices the samples of every template that needs one, together, and queues the ones that fit today's budget.

## Approve for schedules

Until you approve a version of a template for schedules for the first time, its schedules run each version as you save it, and the header says **Schedules run each version you save**. Once a schedule runs the template, **More → Approve for schedules** approves the version you are editing, after a dialog that says what it changes: from then on a schedule runs only an approved version (or one saved before approvals existed, or one Slopify carried over), and every version you save later waits for your approval. The header then says **Ready for schedules**, or **Not ready for schedules** with the version the schedules run until you approve this one.

**Approve for schedules** is greyed, saying what to do first (save your changes, fix the failing checks, look over a current sample), until:

- every free check passes: keywords are filled, each service and its model are chosen and set up, the narration's voice is one of yours (Settings → Voices), each run has release times, each scheduled run can be priced, and someone answers each pause (a notification address, or an agent seen in the last week),
- and every section's sample is ready, off or added by you.

Steps no price is known for, such as **Narration descriptions** (how many is known only once the article is written), don't hold approval back: the check and **Schedule** name them as not counted, and the monthly figure reads **At least $6.08 a month**.

Each failing check names what is wrong with a link to the place it is fixed; in the section that fixes it, the sample column says so in place. The checks are worked out on the saved version: while a change is unsaved, they say **Checked on the saved version: Save to check your changes.** Once approved, schedules run that version from their next run. Saving again makes a new version that waits for your approval; until then the schedules keep running the approved one.

When Slopify changes a template itself (a retired model switched in Settings → Models, a restore from the trash under a new name), the new version keeps the approval of the one it came from, and its changed sections say who made the change. A retired model is switched in the version your schedules run too, even while a newer version waits for your approval.

## Compare models

**Compare models**, beside the model of **Article**, **Narration** or **Images**, makes that section's sample again with one or two other models, each on a hidden copy of the sample, so you can compare what each one makes, what it was charged and how long it took, beside the model the template uses now.

1. Save first: models are compared on the saved version's sample, so it must be current.
2. Press **Compare models** and pick one or two models. The list shows the models that work for your key or CLI first. Voice models are compared within the template's voice service, because a voice is chosen per service.
3. The drawer prices it, for example **Compare · about $0.04**, and shows what is left of today's budget. Press it to start.
4. **Compared models** lists each model with **Made · $0.008 charged · 12 s** and what it made (the script's opening, the narration, the pictures).
5. **Use this model** switches the section to that model and discards the copies; press **Save** to make the template's own sample with it, at the price on the button. **Discard** removes the copies without changing anything.

Only the section's own work runs on each copy. A comparison is held, spending nothing, on the same rules as a sample (a higher price, an unknown price you didn't accept, past today's budget), and a Save made before it starts takes its place. Work already going is never stopped, so **Discard** waits until it finishes.

**Settings → Models → New for you** has **Compare on a sample** on each new model: pick a template and Edit template opens with Compare models ready for that model.

## Template packs

A template pack is a template as one .zip file, to share with someone else or move to another computer.

**More → Export as a file (.zip)** in Edit template saves the version your schedules run (it names that version when a newer one waits): its prompts' and intros' text as Prompts has them now, the voice it picks, the Look, the PDF look, and its sample's thumbnail, up to four pictures and its narration. No key, login or other file of yours goes in; a template whose text looks like a key is refused, with where to remove it. A template its schedules can't run yet (no version approved, and none saved before approvals existed) can't be exported yet.

**Import a template file (.zip)** in the Templates header makes a new template from a template file:

- Its prompts and intros join yours under Prompts. One whose name you already use for other text comes in as "name (2)", and the template uses that one.
- Its voice is used as it is. When Settings → Voices has no voice with that ID, Edit template's voice check says so: add the voice there under that ID, or choose one of yours.
- It opens in Edit template with **Samples from the pack**, what the person who exported it got, until your own samples are made.
- It is not approved for schedules yet: look it over before you approve it.

A file larger than 30 MB, one that isn't a pack, one made by a newer Slopify, or one holding anything that looks like a key is refused, and nothing is imported.

## Poster templates

Poster templates (posters, flyers and social sizes) are under **Templates → Poster templates**, each with its own editor of four sections, **Picture**, **Text layout**, **Formats** and **Schedule**, with the same rail, a live sample and **Approve for schedules**. **Make a poster**, on the template's row or at the foot of its editor, makes one poster from the saved version with the words you type for each keyword. When the artwork's image service has no key yet, the editor says so on its **Made with** line and offers **Add a fal.ai key first** where **Make sample** would be. See [Templates](Templates).

## Related pages

- [Templates](Templates)
- [Schedules](Schedules)
- [Models](Models)
- [Costs and run cost](Costs-and-Run-Cost)
- [Narration aliases and glossary](Narration-Aliases-and-Glossary)
- [Settings reference](Settings-Reference#template-samples)
