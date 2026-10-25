# First Launch and Welcome

The first time you open Slopify it walks you through three steps: what a short needs and what your computer already has for it, a style, and your first 60-second short. The short is being made by the time you finish, and three finished sample projects are there to explore, without spending anything.

**Where to find it:** it opens by itself on a fresh install. Its address is `http://127.0.0.1:6969/welcome`; `?step=style` or `?step=make` opens a later step.

## What happens the first time

1. **Usage stats.** A line on the bottom edge of the window says that Slopify adds what it makes (videos, images, words) to the public totals on its website, slopify.stream, anonymously, and that nothing you type leaves your computer. **What's counted** opens the full list in place; **OK** puts the line away. Nothing is counted before you press **OK**. The page above it works as usual. See [Install](Install#anonymous-usage-stats).
2. **Welcome to Slopify.** Home sends you to the first-run screen once. Each step has a title and "Step 1 of 3"; **Next** and **Back** in the bar at the bottom of the window move between them.
3. **Start at login.** Step 3 asks once, in one line: **Start when I log in** or **No thanks**.

The first-run screen stops appearing for good when you press **Skip** (it reads **Done** once your short is on its way), or when your first real project exists (anything except the samples), even if you delete that project later. Leaving it this way also answers the start-at-login question as no; you can still turn it on in Settings → **General**.

If you leave for Settings to add a key, the welcome keeps its step, your topic and your style for when you come back.

## Step 1: What a short needs

A 60-second short needs three things. Each has its own line, with its state and, when it is missing, the one button that fixes it:

| Line | Ready when | Fix when it says **Not connected** |
| --- | --- | --- |
| **Script** | Claude Code, Codex or Antigravity CLI is installed and signed in, or an OpenRouter key is saved. It says who writes it, for example "Claude Code writes it with your sign-in." | **Add a key for writing** (opens Settings at OpenRouter), or sign in to a CLI. |
| **Voice** | A voice key is saved, or your computer has a speech program. | **Add a voice key** (opens Settings at OpenAI: its key works at once with the voices Slopify sets up). On Linux, **Use your computer's free voice instead** shows the commands that install `espeak-ng`; run one, then press **Check again**. |
| **Images** | Codex CLI is signed in, or an OpenAI, Google, fal.ai or Replicate key is saved. | **Add an image key** (opens Settings at OpenAI). |

When the computer's own voice reads the script, the Voice line says so and offers **Add a voice key** for a better one. With an ElevenLabs, Cartesia or Inworld key but no voice saved, it says **No voice saved** with **Save a voice** (Settings → **Voices**).

**Check again** looks again, including for a speech program installed a moment ago. **Other tools and services Slopify can use** opens Settings → **Keys & services**. Below the lines, the three finished samples are there to watch (see [Explore the samples](#explore-the-samples)).

See [AI CLIs](AI-CLIs) and [Keys and Services](Providers-and-Keys).

## Step 2: Pick a style

Each row is a style for the short. **General** is a neutral explainer style; the others are the starter templates' styles (Sleep lore, True crime, History, Science explainers). Press a row to pick it; the picked row reads **Picked**.

Making the short with one of them adds its script and scene prompts to Prompts and its suggested voice to Settings → **Voices**. See [Starter templates](#starter-templates).

## Step 3: Make a 60-second short

A topic in, a captioned vertical short out, usually in about five minutes with the command-line tools. It has its own page: [Your First Short](Your-First-Short).

| Field | What it does | Limits |
| --- | --- | --- |
| **Topic** | What the short is about, in a few words or a question. A specific topic gives a sharper short than a broad one. The line under it says the style and who writes, reads and draws it. | Up to 200 characters |

If something is still missing, the step shows the same lines as step 1 above the topic, and **Make a 60-second short** is not lime until they are ready.

Press **Make a 60-second short** in the bar at the bottom. With no topic it puts you in the field and says "Type a topic first." Otherwise the status line says **Starting your short…**, then the step says "Your short is being made." and the bar offers **Watch it being made**, which opens the project's page. The samples are listed below while it runs.

## Explore the samples

Three finished projects come with Slopify, marked **Sample** in Projects. Step 1 of the first-run screen lists them, and step 3 again while your short is being made. They are read-only, so nothing you do on them reaches a paid provider.

| Sample | What it shows | Button |
| --- | --- | --- |
| **The Library of Alexandria** | A 3-minute narrated 16:9 video with captions in the picture, chapter cards and a warm Look, plus its two shorts, the article, the PDF, a YouTube description with chapters, four images and a thumbnail. | **Explore the sample** |
| **The Wind in the Willows** | An audiobook of an abridged excerpt: a narrator and two character voices, captions tagged with who speaks, and an MP3 and M4B with chapters. | **See an audiobook** |
| **The Antikythera Mechanism** | A two-host podcast with the speaker panel, name tags and portraits, and its MP3 and M4B. | **Hear a podcast** |

If a sample was deleted, its row shows **Restore samples in Settings** instead.

### Make your own copy of a sample

A sample's project page says "This is the sample project, finished and free to explore." with the button **Make my own copy**.

1. Open a sample.
2. Press **Make my own copy** (also in the command palette, `Ctrl+K` → **Make my own copy**).
3. Slopify copies every file and setting of that sample into a new, normal project. Nothing needs to be made again: the copy is finished too.
4. Edit the copy like any project. Changes to it use your services and cost what they cost. See [Editing a Project](Editing-a-Project).

### Restore the samples

1. Open Settings → **Backup & storage** and scroll to **Disk space**.
2. Press **Restore samples**. The line beside it says which samples it brings back. It puts all three back as they shipped: it adds back any that were deleted and replaces the others with the originals. Your own copies are not touched.

## Starter templates

A starter template sets you up for one kind of channel. Adding one (**Templates** → **Add starter templates**) adds, in one go:

- prompts on Prompts: an article prompt, a 60-second script, an image (scene) prompt, a thumbnail prompt, a description prompt and a shorts prompt, each asking only for `{{topic}}`;
- a suggested OpenAI voice, saved under Settings → **Voices**;
- a template that uses them, named `<style> starter`, with its captions, motion and Look.

Then you pick the template in Create, type a topic and start. See [Templates](Templates) and [Create Overview](Create-Overview).

| Starter template | What it is for | Suggested voice |
| --- | --- | --- |
| **Sleep lore** | Slow, gentle myths and legends told to fall asleep to. | OpenAI `sage` |
| **True crime** | Measured, factual retellings of real cases and their investigations. | OpenAI `onyx` |
| **History** | Narrative history of people, places and events, told like a documentary. | OpenAI `fable` |
| **Science explainers** | Clear, friendly explanations of how the world works, one idea at a time. | OpenAI `nova` |

Making a short in one of these styles on the first-run screen adds its prompts and voice only, not the template.

- Adding a starter template twice changes nothing.
- It never replaces a prompt or template of yours with the same name: the starter's copy comes in as `<name> (2)`.
- An item a starter template added before and you edited is kept as you left it. One you deleted comes back.

You can add them later too, from **Templates** → **Add starter templates**.

## Start when I log in

Step 3 of the first-run screen asks once, in one line: **Start when I log in** or **No thanks**. Either answer, here, in Settings → **General** or in the terminal, ends the question; so does leaving the first-run screen, as a no. See [Start at Login](Start-at-Login).

## Make a long video instead

On steps 1 and 2, **Make a long video instead** in the bottom bar takes you to Create, where you choose prompts, keywords and extras yourself. See [Create Overview](Create-Overview).

## The interactive tutorial

**Help → Start the tour** at the foot of the rail walks you through a first project in 25 steps ("3 of 25 · First project"):

1. **Settings:** connect a writing, a voice and an image service, and add a narration voice.
2. **Prompts:** write and save an article prompt with keywords, then an image prompt.
3. **Create:** type the topic, choose the article, keywords, narration, images, video and captions, then check it and make the video.
4. **The project:** follow and control the run, download the results, see what the run cost and copy everything for YouTube Studio.
5. **The rest of the app:** check Home each day, set up a channel, and plan uploads on the calendar.

Each step highlights the real control you will use and opens its screen for you. Your place is saved, so it survives a page reload. On the review-and-start step, **Skip generating** leaves the run unstarted and goes on to Home, Channels and the Calendar instead of ending the tutorial. Other steps have **Skip this step** (or **Skip without saving**).

When Projects has no projects at all, it also shows **Make your first video** with **Start the tour**.

## Tips

- Try a sample before you add any keys: every screen works on it, and nothing costs anything.
- You can come back to the first-run screen at `/welcome` until you skip it or make a real project.
- After an update to a new major version, a **What's new** tour opens instead. See [Updating and Patch Notes](Updating-and-Patch-Notes).
- Already use Claude Code or Codex? Settings → **AI agents** has one line that lets it run Slopify for you: start and fix runs, answer AI checks, everything up to Ready to upload. See [Agents (MCP)](Agents-MCP).

## Related pages

- [Your First Short](Your-First-Short)
- [Home and Projects](Home-and-Projects)
- [Keys and Services](Providers-and-Keys)
- [AI CLIs](AI-CLIs)
- [Templates](Templates)
- [Prompts](Prompts)
- [Multiple Voices](Multiple-Voices)
- [Start at Login](Start-at-Login)
