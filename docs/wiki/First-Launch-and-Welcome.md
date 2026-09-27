# First Launch and Welcome

The first time you open Slopify it walks you through three steps: what your computer already has, a style, and your first 60-second short. The short is being made by the time you finish, and three finished sample projects are there to explore while you wait, without spending anything.

**Where to find it:** it opens by itself on a fresh install. Its address is `http://127.0.0.1:6969/welcome`.

## What happens the first time

1. **Anonymous usage stats.** A notice lists exactly what is counted and what never is. Press **Got it** to continue. It shows once per machine. See [Install](Install#anonymous-usage-stats).
2. **Welcome to Slopify.** Home sends you to the first-run screen once. It has three steps, shown as tabs: **1 · What you have**, **2 · Pick a style** and **3 · Make your first short**. **Next** and **Back** at the bottom move between them, and you can click a tab directly.
3. **Start at login.** The last step offers **Start when I log in** once, unless you already answered in the terminal.

The first-run screen stops appearing for good when you press **Skip** (it reads **Done** once your short is on its way), or when your first real project exists (anything except the samples), even if you delete that project later.

## Step 1: What you have

### Found on this computer

Slopify looks for Claude Code, Codex and Gemini CLI and shows one row for each:

| Row says | Meaning |
| --- | --- |
| **Ready · 1.2.3 · writes** | Installed, a supported version and signed in, as far as Slopify can tell. It can write the text. |
| **Ready · … · writes and draws** | Codex: it writes the text and draws the images. |
| **Installed, not usable yet** or a reason | Found, but something is missing, such as a sign-in. The reason is shown. |
| **Not found** | Not installed, or not on the `PATH` Slopify sees. |

When at least one is ready, the step says which parts need no API key, for example "You can make a video now: no API keys are needed for the text, the images or the narration." When none is ready, it says "Nothing on this computer can write the script yet." with **Open Settings → Providers**: install and sign in to a CLI, or add an OpenRouter key.

### Narration voice

The second part says who will read the script aloud:

| It says | Meaning |
| --- | --- |
| "Narration uses your *provider* voice key." | A voice key (OpenAI, ElevenLabs, Cartesia or Inworld) is saved, so that provider narrates. |
| "Narration uses your computer's built-in voice (*engine*); add an ElevenLabs or OpenAI key later for a better one." | No voice key, so the computer's own speech narrates, for free. See [the system voice](Providers-and-Keys#the-system-voice). |
| "No voice can narrate the short yet." | Neither a key nor a speech program was found. Press **Add a voice key**, or install a speech program (on Linux, `espeak-ng`) and press **Check again**. |

**Add a voice key** opens Settings → **Providers**. See [AI CLIs](AI-CLIs) and [Providers and Keys](Providers-and-Keys).

## Step 2: Pick a style

Each row is a style for the short. **General** is a neutral explainer style; the others are the starter packs (Sleep lore, True crime, History, Science explainers). Press **Use this style** on a row; it then reads **Picked**.

Making the short with a pack adds that pack's script and scene prompts to your Library and its suggested voice to Settings → **Voices**. **Add to library** on a pack's row also adds its Play template, for later long videos; it then reads **In your library**. See [Starter packs](#starter-packs).

## Step 3: Make a 60-second short

A topic in, a captioned vertical short out, usually in about five minutes with the command-line tools. It has its own page: [Your First Short](Your-First-Short).

The step repeats the style and the voice line from step 1. If no voice can narrate yet, it shows the same **Add a voice key** and **Check again** buttons.

| Field | What it does | Limits |
| --- | --- | --- |
| **Topic** | What the short is about, in a few words or a question. A specific topic gives a sharper short than a broad one. | Up to 200 characters |

Press **Make a 60-second short**. The status line says **Starting your short…**, then the step says "Your short is being made." with **Watch it being made**, which opens the project's page and its live view. While it runs, the samples and the start-at-login offer are right below.

## Explore the samples

Three finished projects come with Slopify, marked **Sample** in Projects. Step 3 of the first-run screen lists them under **While you wait: the samples**. They are read-only, so nothing you do on them reaches a paid provider.

| Sample | What it shows | Button |
| --- | --- | --- |
| **The Library of Alexandria** | A 3-minute narrated 16:9 video with burned-in captions, chapter cards and a warm Look, plus its two shorts, the article, the PDF, a YouTube description with chapters, four images and a thumbnail. | **Explore the sample** |
| **The Wind in the Willows** | An audiobook of an abridged excerpt: a narrator and two character voices, captions tagged with who speaks, and an MP3 and M4B with chapters. | **See an audiobook** |
| **The Antikythera Mechanism** | A two-host podcast with the speaker panel, name tags and portraits, and its MP3 and M4B. | **Hear a podcast** |

If a sample was deleted, its row shows **Restore samples in Settings** instead.

### Make your own copy of a sample

A sample's project page says "This is the sample project, finished and free to explore." with the button **Make my own copy**.

1. Open a sample.
2. Press **Make my own copy** (also in the command palette, `Ctrl+K` → **Make my own copy**).
3. Slopify copies every file and setting of that sample into a new, normal project. Nothing needs to be made again: the copy is finished too.
4. Edit the copy like any project. Changes to it use your providers and cost what they cost. See [Editing a Project](Editing-a-Project).

### Restore the samples

1. Open Settings → **Backup & storage** and scroll to **Sample projects**.
2. Each sample shows whether it is **in your projects** or **not in your projects**, with **Open**.
3. Press **Restore samples**. It puts all three back as they shipped: it adds back any that were deleted and replaces the others with the originals. Your own copies are not touched.

## Starter packs

A starter pack sets you up for one kind of channel. Each one adds, in one go:

- prompts to your Library: an article prompt, a 60-second script, an image (scene) prompt, a thumbnail prompt, a description prompt and a shorts prompt, each asking only for `{{topic}}`;
- a suggested OpenAI voice, saved under Settings → **Voices**;
- a Play template that uses them, named `<pack> starter`, with its captions, motion and Look.

Then you pick the template on Play, type a topic and start. See [Templates](Templates) and [Play Overview](Play-Overview).

| Pack | What it is for | Suggested voice |
| --- | --- | --- |
| **Sleep lore** | Slow, gentle myths and legends told to fall asleep to. | OpenAI `sage` |
| **True crime** | Measured, factual retellings of real cases and their investigations. | OpenAI `onyx` |
| **History** | Narrative history of people, places and events, told like a documentary. | OpenAI `fable` |
| **Science explainers** | Clear, friendly explanations of how the world works, one idea at a time. | OpenAI `nova` |

On the first-run screen, **Add to library** on a pack's row adds all of this; it then reads **In your library**. Making a short with a pack adds its prompts and voice only, not the template.

- Adding a pack twice changes nothing.
- It never replaces a prompt or template of yours with the same name: the pack's copy comes in as `<name> (2)`.
- An item the pack added before and you edited is kept as you left it. One you deleted comes back.

You can add packs later too, from Library → **Templates** → **Add pack**.

## Start when I log in

Step 3 of the first-run screen asks once: **Start when I log in** or **No thanks**. Either answer, here, in Settings → **General** or in the terminal, ends the question. See [Start at Login](Start-at-Login).

## Set up a long video instead

At the bottom of every step, **Set up a long video instead** takes you to Play, where you choose prompts, keywords and outputs yourself. See [Play Overview](Play-Overview).

## The interactive tutorial

The question-mark button at the foot of the sidebar (**Start interactive tutorial**) walks you through a first project in 25 steps ("3 of 25 · First project"):

1. **Settings:** connect a text, a voice and an image provider, and add a narration voice.
2. **Library:** write and save an article prompt with keywords, then an image prompt.
3. **Play:** name the project, choose the article, keywords, narration, images, video and subtitles, then review and start the run.
4. **The project:** follow and control the run, download the results, see what the run cost and prepare the YouTube upload.
5. **The rest of the app:** check Home each day, set up a channel, and plan uploads on the calendar.

Each step highlights the real control you will use and opens its screen for you. Your place is saved, so it survives a page reload. On the review-and-start step, **Skip generating** leaves the run unstarted and goes on to Home, Channels and the Calendar instead of ending the tutorial. Other steps have **Skip this step** (or **Skip without saving**).

When Projects has no projects at all, it also shows **Make your first video** with **Start tutorial**.

## The provider welcome in Settings

Settings → **Providers** shows a short welcome on a fresh install that names the command-line tools it found and says a video can be made without an API key. Press **Got it** to hide it.

## Tips

- Try a sample before you add any keys: every screen works on it, and nothing costs anything.
- You can come back to the first-run screen at `/welcome` until you skip it or make a real project.
- After an update to a new major version, a **What's new** tour opens instead. See [Updating and Patch Notes](Updating-and-Patch-Notes).

## Related pages

- [Your First Short](Your-First-Short)
- [Home and Projects](Home-and-Projects)
- [Providers and Keys](Providers-and-Keys)
- [AI CLIs](AI-CLIs)
- [Templates](Templates)
- [Prompts](Prompts)
- [Multiple Voices](Multiple-Voices)
- [Start at Login](Start-at-Login)
