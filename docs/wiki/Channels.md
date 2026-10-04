# Channels

A channel is one series: its brand kit, series brief, cast, templates and schedules. Every template belongs to one channel, and every run from it uses that channel's look, cast and language. Use channels when you make more than one kind of video, so each series keeps its own look and its own topic ideas.

**Where to find it:** **Channels** in the sidebar. On Play, the **Channel** picker sits under the title. The channel picker in the sidebar filters what Home, Projects and the Calendar show.

## The default channel

Every install has one default channel, **My channel**. Everything made before channels existed (templates, schedules, projects) belongs to it, unchanged. The default channel can't be deleted.

## The Channels page

The list shows each channel with **Open**, **Rename** and **Delete** (not on the default channel), and a line such as "Default · 3 templates · 5 in the cast". A press anywhere on a row picks it. Beside the list, on a wide screen, **About <channel>** sums up the picked channel: its templates and cast counts, its series brief (or "No series brief yet. Open the channel to say what it covers.") and its brand kit's intro, outro, document theme and end screen text, with **Open channel**.

## Create a channel

1. Open **Channels** and press **New channel**.
2. Type a **Channel name** (up to 200 characters). It stays inside Slopify and doesn't have to match your YouTube channel.
3. Press **Create channel**.
4. Open the new channel and fill in its **Brand** tab (below).

To rename a channel, press **Rename** on it, change the name and press **Rename channel**. To delete one, press **Delete channel**: its cast goes with it, and its videos move to the default channel and keep what they were made with. A channel that still has templates can't be deleted; move them to another channel first (see [Templates](Templates#move-a-template-to-another-channel)).

## Which channel a video is in

- On Play, pick the **Channel** under the title. A draft opened from a template starts in that template's channel; a new draft starts in the default one.
- A template saved from Play lands in the draft's channel, or the one you pick in **Save a setup**.
- A schedule belongs to the channel of the template it runs, so moving the template moves its schedules.

## Show one channel's work

The channel picker in the sidebar (**Current channel**) makes Home, Projects and the Calendar show only that channel's work. **All channels** shows everything. It only filters what you see; projects and schedules of other channels keep running. This browser remembers your choice.

## The channel's tabs

A channel page has six tabs: **Brand**, **Cast**, **Templates**, **Schedules**, **Episodes** and **Existing videos**.

### Brand

**YouTube AI disclosure.** Studio's **AI use** answer for this channel's videos and Shorts, given by Prepare upload and the Studio extension. It saves as soon as you pick.

| Option | What it does |
|---|---|
| **Automatic** (default) | Says Yes only in YouTube's three cases: a voice marked as imitating a real person, real footage altered, or photorealistic AI pictures from an Image prompt marked as such. Otherwise No. |
| **Always Yes** | Always answers Yes. |
| **Always No** | Always answers No. |

Mark voices in **Settings → Voices** and Image prompts in **Library → Prompts**. See [Publishing to YouTube](Publishing-to-YouTube).

**Series brief.** What the channel covers, its style and what makes a topic worth a video. Topic generation reads it for every schedule of this channel that has no brief of its own. It doesn't change how videos are written. Up to 10,000 characters. See [Schedules](Schedules#topics-that-find-themselves).

**Language of new projects.** The language this channel's new projects are written and narrated in when Play or the template picks none. It applies even with the brand kit off, since it is not styling. Pick voices that speak it. Not set means English. Projects already made keep their language. See [Other languages](Other-Languages).

**Brand kit.** The look every template of this channel gets unless it sets its own. Every field is optional, each fills only what a template leaves at its default, and a blank field adds nothing.

| Field | What it does |
|---|---|
| **Caption font** | The subtitle font for videos whose template leaves the font at Default. Fonts you upload in the subtitle font picker on Play appear here. |
| **Caption colour** | Subtitle text colour as `#` and six hex digits, such as `#FFFFFF`. |
| **Caption outline** | The colour of the line around each subtitle letter, such as `#000000`. A dark outline keeps light captions readable on bright pictures. |
| **Title font** | The font of chapter cards and the end screen, for videos whose template sets no title style. |
| **Title colour** | The text colour of chapter cards and the end screen, such as `#FFD700`. |
| **End screen text** | A line shown centred over the last 5 seconds of every video, such as "Subscribe for more". Up to 200 characters. Blank shows none. |
| **Intro** / **Outro** | An entry from **Library → Intros & outros**, narrated before or after the body of every video whose template has none. Each is narrated with the video's voice, so each costs one voice request per video (plus a text call for an LLM entry), and it shows in the estimate. See [Intros and outros](Intros-and-Outros). |
| **Document theme** | The look of the PDF for videos whose template picks no theme. A saved theme that was deleted is skipped. |
| **Ambient sound** | Rain, Fireplace or Wind under the long video's narration, with its level (−40 to −6 dB, default −18), fade-in (0 to 30 s, default 3) and tail (0 to 30 s, default 6). Used when the template leaves its own ambient sound on "The channel's". A channel can't hold your own audio file. |

**Channel links.** This channel's named links, such as `Patreon` or `Discord`, that a YouTube description fills when it names them in braces (`{{Patreon}}`). See [Channel links](#channel-links).

Press **Save channel** when you are done.

To keep one video exactly as its template was saved, untick **Use the channel's brand kit** on Play or in Edit project. The cast and language still apply. Nothing in the kit reaches a project that already started; a project keeps what it was started with.

### Cast

Recurring characters, creatures, places and objects, each with reference pictures that go with every image that names them. A cast member with a voice can also be one of the channel's hosts: a new podcast or interview on Play then starts with them as its speakers. See [Cast library](Cast-Library).

### Templates

The channel's templates. Each has a channel picker: choosing another channel moves the template, and every schedule that runs it, to that channel. Their next runs use the new channel's brand kit, cast and series brief. Projects already made keep what they were made with.

### Schedules

The schedules that run this channel's templates, with their status and next run. Edit them on **Calendar → Schedules**; see [Schedules](Schedules).

### Episodes (episode memory)

With **Episode memory** on, every finished video of the channel leaves a short summary, and new episodes about the same things read it so they agree with what came before.

How it works:

1. When a video of this channel finishes, one short call to its text model writes a summary of up to 150 words: what the episode covered, the facts it stated, who appeared and what happened to them. The call shows on the project's **Run cost**. Finishing the same article again asks nothing, and a failed call never touches the project.
2. When a new episode's article (or multi-voice script) is written by Slopify, the summaries of up to 5 related earlier episodes are added to its writing prompt under "Earlier episodes".
3. An episode is related when it features a cast member the new title or keywords mention (strongest), or shares words of its title. Words most of the channel's titles share, such as a template's fixed prefix, and one- or two-letter words don't count. An episode with the very same title is a remake, not an earlier episode, and is left out.
4. The summaries are copied into the project when it starts, so later edits never make a finished video outdated.

On the tab:

- **Open** a summary to read or edit it. Your edited text is kept, even if the video finishes again.
- **Delete** removes a summary from later prompts. The video itself is not changed.

Default: on for new channels. Channels that existed before 3.0 start with it off.

### Existing videos

Titles this channel published before or outside Slopify. Topic generation and its duplicate checks skip them, as they skip the videos made here.

**Paste titles:**

1. Type or paste titles into **Paste titles**, one per line.
2. Press **Add titles**. A title already listed (in any case) is skipped.

**Import a YouTube Studio CSV:**

1. In YouTube Studio, open **Analytics → Content → Advanced mode** and export the table as a CSV (comma-separated values).
2. In Slopify, press **Import a YouTube Studio CSV…** and choose the file. It is read on this machine.
3. Slopify lists every title with a tick, all ticked. It finds the title column by its header ("Video title", else "Title", else "Content") and skips Studio's "Total" row.
4. If the export holds several series, type into **Keep only titles containing…** (for example a series name, any case). Only titles holding that text stay ticked. **Tick all** and **Untick all** reset the ticks, and you can tick each title by hand.
5. Press **Add N ticked titles**. The import says how many were added and how many were skipped as already listed.

The filter text is remembered for this channel's next import. **Remove** deletes one title, and **Remove all** clears the list.

## Channel links

Each channel keeps its own named links, under **Channel links** on its **Brand** tab. Write a link's name in braces in a description prompt or a description, such as `{{Patreon}}`, and it is filled with this channel's link when the description is shown, copied or downloaded.

1. Open **Channels** → the channel → **Brand**.
2. Under **Channel links**, press **Add link**, type the **name** (for example `Patreon`) and the URL (`https://…`). **Remove** takes one off.
3. Press **Save channel**.

Names match whatever their case or spacing. `{{Previous video}}` works the same way, but a project can set its own on its **YouTube** section (**Previous video for this project**, then **Save links**), which wins over the channel's. A placeholder with no link stays as typed, and the YouTube section says "No link is saved for {{…}}, so it stays as typed." with where to add it.

Links saved in **Settings → Channel links** before channels had their own still fill the default channel's descriptions until you save its Brand tab; that Settings section now only points here (**Open the default channel's links**). Channel links travel in backups with their channel. See [YouTube description](YouTube-Description) and [Publishing to YouTube](Publishing-to-YouTube).

## Tips

- Give each series its own channel, even if you upload them to one YouTube channel. The brand kit, cast and topic ideas stay separate.
- Import your existing videos before turning on topic generation, so Slopify doesn't suggest what you already made.
- Edit an episode summary when it gets a fact wrong. Later episodes will follow your version.

## Related pages

- [Cast library](Cast-Library)
- [Templates](Templates)
- [Schedules](Schedules)
- [Play video and style](Play-Video-and-Style)
- [Publishing to YouTube](Publishing-to-YouTube)
- [Other languages](Other-Languages)
