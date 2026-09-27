# First Launch and Welcome

The first time you open Slopify it shows you what it found on your computer, lets you make a 60-second short from a topic, and gives you three finished sample projects to explore without spending anything.

**Where to find it:** it opens by itself on a fresh install. Its address is `http://127.0.0.1:6969/welcome`.

## What happens the first time

1. **Anonymous usage stats.** A notice lists exactly what is counted and what never is. Press **Got it** to continue. It shows once per machine. See [Install](Install#anonymous-usage-stats).
2. **Welcome to Slopify.** Home sends you to the first-run screen once. It has five parts, described below.
3. **Start at login.** The welcome screen offers **Start when I log in** once, unless you already answered in the terminal.

The first-run screen stops appearing for good when you press **Skip**, or when your first real project exists (anything except the samples), even if you delete that project later.

## Found on this computer

Slopify looks for Claude Code, Codex and Gemini CLI and shows one row for each:

| Row says | Meaning |
| --- | --- |
| **Ready · 1.2.3 · writes** | Installed, a supported version and signed in, as far as Slopify can tell. It can write the text. |
| **Ready · … · writes and draws** | Codex: it writes the text and draws the images. |
| **Installed, not usable yet** or a reason | Found, but something is missing, such as a sign-in. The reason is shown. |
| **Not found** | Not installed, or not on the `PATH` Slopify sees. |

When at least one is ready, the screen says you can make a video now without API keys for the text (and the images, with Codex).

Command-line tools can't speak, so the narration always needs a voice key: OpenAI, ElevenLabs, Cartesia or Inworld, in Settings → **Providers**. See [AI CLIs](AI-CLIs) and [Providers and Keys](Providers-and-Keys).

## Make a 60-second short

A topic in, a captioned vertical short out, usually in about five minutes with the command-line tools. It has its own page: [Your First Short](Your-First-Short).

| Field | What it does | Limits |
| --- | --- | --- |
| **Topic** | What the short is about, in a few words or a question. A specific topic gives a sharper short than a broad one. | Up to 200 characters |
| **Style** | The starter pack whose prompts, voice and art direction the short uses. **General** is a neutral explainer style. | General, Sleep lore, True crime, History, Science explainers |

Press **Make a 60-second short**. Slopify opens the new project's page and starts it.

## Explore the samples

Three finished projects come with Slopify, marked **Sample** in Projects. They are read-only, so nothing you do on them reaches a paid provider.

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

Press **Add pack** on a row. It then says **Added**.

- Adding a pack twice changes nothing.
- It never replaces a prompt or template of yours with the same name: the pack's copy comes in as `<name> (2)`.
- An item the pack added before and you edited is kept as you left it. One you deleted comes back.

You can add packs later too, from Library → **Templates** → **Add a starter pack**.

## Start when I log in

The welcome screen asks once: **Start when I log in** or **No thanks**. Either answer, here, in Settings → **General** or in the terminal, ends the question. See [Start at Login](Start-at-Login).

## Set up a long video instead

At the bottom, **Set up a long video instead** takes you to Play, where you choose prompts, keywords and outputs yourself. See [Play Overview](Play-Overview).

## The interactive tutorial

The question-mark button in the top bar (**Start interactive tutorial**) walks you through a first project: provider keys and a voice in Settings, an article prompt and an image prompt in the Library, each part of Play, then the project page. Each step highlights the real control you will use and opens its screen for you. Your place is saved, so it survives a page reload.

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
