# Template studio

The template studio is where a template is set up once, section by section, with a live sample beside every setting, then marked ready for its schedules. Each change you save is made again on a short hidden sample, so you see and hear what the next video will be like before a schedule spends anything on it.

**Where to find it:** **Library → Templates**, then **Open studio** on a template's row. Saving a setup as a template from Play or a project opens its studio too.

## The sections

The rail on the left lists the template's sections in the order a run makes them:

| Section | What it sets |
|---|---|
| **Subject & research** | The title pattern (`History: {{Topic}}`), keyword values, research on or off |
| **Script** | Written by AI or pasted, the text model, the article prompt, the expected length |
| **Voice** | The voice, the narration model, loudness, breaths and S sounds, pronunciations |
| **Pictures** | Made by AI, added by you or off; the picture model, image prompts, scenes |
| **Video & captions** | Format, captions, motion, seconds per picture, the Look |
| **Thumbnail & title** | How the thumbnail is made, one or three of them |
| **Shorts** | Shorts from the video, how many |
| **Document (PDF)** | A PDF made from the script, and its theme |
| **Reviews & checkpoints** | Automatic reviews and where a run waits for you |
| **Upload pack** | The YouTube description, chapters and tags |
| **Schedule** | The next five runs of each schedule that uses the template, and what they cost a month |

Each section shows two to four settings. Everything else is under **Fine-tune**, which holds Play's own editor for that section, so no setting is lost. **Made with OpenRouter · model · Change** says which provider makes the section; **Change** opens Fine-tune.

Each section's lamp says where its sample is: **Current** (made for this version), **Making**, **Waiting** (queued, or held with the reason), **Needs a fix** (the failed step's own sentence and the button that fixes it), **No current sample** (made for an older version, or none yet), **Off**, or **Provided** (you add the file in Play for each video, so there is no sample to make).

On a narrow window the studio shows **Sections · Settings · Sample** tabs instead of three columns.

## Samples

Two kinds of sample are made for each version.

**Free samples** are made on this computer and cost nothing: a 30-second clip in the template's frame, captions, Look and picture timing on Slopify's sample pictures; the loudness before and after; the PDF in the template's theme; and each schedule's cost a month. They are made by themselves when a version is opened.

**The paid sample** is a short taste of one video about the sample topic, made with your keys on a hidden project that never appears in Projects, Home, the calendar, usage or anywhere else:

- the outline and chapter 1 of the script (or the full script, see below),
- about 30 seconds of narration,
- up to 4 pictures, 1 thumbnail and 1 short,
- no checkpoints; an agent's reviews are not asked.

After the first one, a Save makes again only what the change outdates. Work already going is never stopped: a newer Save waits for it.

### Sample topic

The chip in the header, **Sample topic: The history of the lighthouse**, is what every sample is about. Press it to type another, take the next topic a schedule has queued, or go back to the fixed one. A new topic makes every sample again and is priced on **Use topic**; going back to the fixed one is free.

### Write the full script in the sample

Under **Script**, **Write the full script in the sample** has the sample write the whole script instead of the outline and chapter 1, priced on the switch. Only the script and what is made from it are made again. Your videos always get the full script.

### Say it as

Under **Voice**, **Say it as** lists the names the sample's script says that a voice may get wrong, each with the line it is in. **Play** one to hear it, type how it should be said and press **Save**: that writes a Library → Narration aliases row (used by every project started after it) and voices again only the sample's lines that say it, priced on the button. **Another word to check** adds a name of your own.

### Prompt anatomy

**Prompt anatomy** under a section's settings cuts the prompt the sample sent into who wrote each part: your own words, your keywords' values, what Slopify filled in (such as the sample's "outline and chapter 1 only" instruction) and what settings added.

## Budget and prices

Every paid sample is priced before anything is spent:

- **Save** says what it costs, for example **Save · about $0.12**, or **Save · plan usage** when only a CLI plan is used. **Save without a sample** saves and makes only the free samples.
- A sample that costs more than a quarter more (plus five cents) than the price you saw, or has a step with no known price you didn't accept, waits instead of starting, with the new price on **Make sample**.
- **Settings → Template studio → Daily sample budget** is the most the studio may spend in one day ($2.00 by default). A sample past it waits until the next day or a higher budget. What a removed sample or a discarded comparison was charged today still counts. See [Settings-Reference](Settings-Reference#template-studio).

**Make samples for all** in Settings → Template studio prices the samples of every template that needs one, together, and queues the ones that fit today's budget.

## Mark ready

Until you mark a version of a template ready for the first time, its schedules run its newest version, checked or not, as they always did, and the header says **Not checked in the studio: schedules run the newest version**. Pressing **Mark ready** once turns the check on for that template: from then on a schedule runs only a version marked ready (or one saved before the studio existed, or one Slopify carried over), and every version you save later waits for **Mark ready**.

**Mark ready** in the header is greyed, with the reason, until:

- every free check passes: keywords are filled, the providers are set up, the narration's voice is one of yours (Settings → Voices), each run has release times, the monthly cost is known, and someone answers each checkpoint (a notification address, or an agent seen in the last week),
- and every section's sample is current, off or provided.

Each failing check names what is wrong with a button to the place it is fixed. Once marked, schedules run that version from their next run. Saving again makes a new version that waits to be marked ready; until then the schedules keep running the one marked ready, and the header says **Not checked in the studio · schedules run version 6**.

When Slopify changes a template itself (a retired model switched in Settings → Models, a restore from the trash under a new name), the new version keeps the ready mark of the one it came from, and its changed sections say who made the change. A retired model is switched in the version your schedules run too, even while a newer version waits to be marked ready.

## Compare models

**Compare models**, beside the model of **Script**, **Voice** or **Pictures**, makes that section's sample again with one or two other models, each on a hidden copy of the sample, so you can compare what each one makes, what it was charged and how long it took, beside the model the template uses now.

1. Save first: models are compared on the saved version's sample, so it must be current.
2. Press **Compare models** and pick one or two models. The list shows the models that work for your key or CLI first. Voice models are compared within the template's voice provider, because a voice is chosen per provider.
3. The drawer prices it, for example **Compare · about $0.04**, and shows what is left of today's budget. Press it to start.
4. **Compared models** lists each model with **Made · $0.008 charged · 12 s** and what it made (the script's opening, the narration, the pictures).
5. **Use this model** switches the section to that model and discards the copies; press **Save** to make the template's own sample with it, at the price on the button. **Discard** removes the copies without changing anything.

Only the section's own work runs on each copy. A comparison is held, spending nothing, on the same rules as a sample (a higher price, an unknown price you didn't accept, past today's budget), and a Save made before it starts takes its place. Work already going is never stopped, so **Discard** waits until it finishes.

**Settings → Models → New for you** has **Compare on a sample** on each new model: pick a template and its studio opens with Compare models ready for that model.

## Template packs

A template pack is a template as one .zip file, to share with someone else or move to another computer.

**Export pack** in the studio's header saves the version marked ready (the button says which when a newer one waits): its prompts' and intros' text as your Library has them now, the voice it picks, the Look, the PDF theme, and its sample's thumbnail, up to four pictures and its narration. No key, login or other file of yours goes in; a template whose text looks like a key is refused, with where to remove it. A template with no version marked ready (and none saved before the studio) can't be exported yet.

**Import template pack** on Library → Templates makes a new template from a pack:

- Its prompts and intros join your Library. One whose name your Library already uses for other text comes in as "name (2)", and the template uses that one.
- Its voice is used as it is. When Settings → Voices has no voice with that ID, the studio's Voice check says so: add the voice there under that ID, or choose one of yours.
- It opens in its studio with **Samples from the pack**, what the person who exported it got, until your own samples are made.
- It is not checked in the studio yet: look it over and press **Mark ready**.

A file larger than 30 MB, one that isn't a pack, one made by a newer Slopify, or one holding anything that looks like a key is refused, and nothing is imported.

## Design templates

Design templates (posters, flyers and other designed pieces) are listed on Library → Templates below the project templates, each with **Open studio**. Their studio has four sections, **Picture**, **Text layout**, **Formats** and **Schedule**, with the same rail of lamps, a live sample and Mark ready. See [Templates](Templates).

## Related pages

- [Templates](Templates)
- [Schedules](Schedules)
- [Models](Models)
- [Costs and run cost](Costs-and-Run-Cost)
- [Narration aliases and glossary](Narration-Aliases-and-Glossary)
- [Settings reference](Settings-Reference#template-studio)
