# Your First Short

The quickest way to see Slopify work: type a topic, press one button, and get a narrated, captioned 9:16 short of about a minute. Slopify picks the providers for you from what your computer already has.

**Where to find it:** the first-run screen (**Welcome to Slopify**) → **3 · Make your first short** → **Make a 60-second short**. On a fresh install it opens by itself; its address is `http://127.0.0.1:6969/welcome`.

## What you get

| Part | Details |
| --- | --- |
| Script | About 150 words, written from your topic by a text model. No web research. |
| Narration | Spoken by your voice provider, or by your computer's own voice when no voice key is saved. |
| Images | Four vertical images, one for each 15 seconds of the minute. |
| Video | A 9:16 short with word-by-word captions and the title on top, rendered on your computer. |
| Not made | No thumbnail, no PDF, no YouTube description and no further shorts. |

With the command-line tools it usually takes about five minutes.

## Before you start

You need three things. Slopify checks them when you press the button and tells you what is missing.

| Need | What Slopify uses, in this order |
| --- | --- |
| Text | Claude Code CLI (a Sonnet model when it has one), Codex CLI, Antigravity CLI, then an OpenRouter key. |
| Images | Codex CLI, then an OpenAI, Google, fal.ai or Replicate key. |
| Voice | Your first saved voice whose provider has a key. If none, the style's suggested OpenAI voice when an OpenAI key is saved. If there is no voice key at all, your computer's own voice (the **System voice**): macOS or Windows speech, or Piper, SVOX Pico, eSpeak NG or eSpeak on Linux. |

Command-line tools can't speak, but you don't need a voice key to start: with none saved, the short is narrated by your computer's built-in voice, for free. It sounds robotic, so add a key when you want a better voice. An OpenAI key is the simplest: the suggested voices work with it right away. With ElevenLabs, Cartesia or Inworld, also save a voice in Settings → **Voices**. See [the system voice](Providers-and-Keys#the-system-voice).

To set these up:

1. Install and sign in to Claude Code, Codex or Antigravity CLI (see [AI CLIs](AI-CLIs)), or add keys in Settings → **Keys & services** (see [Keys and Services](Providers-and-Keys)).
2. Optional: add a voice key in Settings → **Keys & services**. An OpenAI key is the simplest: the suggested voice works with it right away.
3. Back on the first-run screen, step 1, **What a short needs**, shows the Script, Voice and Images lines, each **Ready** or **Not connected** with its fix. Press **Check again** after installing a speech program.

## Make the short

1. Open the first-run screen.
2. On step 2, **Pick a style**, press one row; it reads **Picked**:
   - **General**: a neutral explainer style, with the OpenAI voice `alloy` as its suggestion.
   - **Sleep lore**, **True crime**, **History** or **Science explainers**: that starter pack's script prompt, image style and suggested voice.
3. Press **Next: Make your first short**. In **Topic**, type what the short is about, in a few words or a question (up to 200 characters). For example: `Why the sea glows at night`. A specific topic gives a sharper short than a broad one.
4. Press **Make a 60-second short** in the bar at the bottom of the window. The status line says **Starting your short…**.
5. Slopify creates the project and starts it. The step now says "Your short is being made." Press **Watch it being made** in the bar to open its page.

Pressing the button twice, or retrying after a dropped connection, opens the same project instead of starting a second one.

## What Slopify sets up for you

- **The project.** Its title is your topic, with a capital first letter. Its format is 9:16.
- **Library prompts.** The style's script and vertical-scene prompts are added to your Library (for General: **Starter · 60-second short** and **Starter · Vertical scene**). If you already have a prompt with that name and different text, the new one comes in as `<name> (2)`. Reusing them later changes nothing.
- **A saved voice.** The style's suggested OpenAI voice is added to Settings → **Voices** (for General: **Starter narrator**), unless you already have one with that voice. When the computer's own voice narrates, it is saved there too, named `<voice> (computer voice)`, so Create offers it later.
- **Settings.** Captions at the bottom, a slow zoom or pan on each image, half a second of silence at each end, and the volume levelled as in your Settings.

The pack's template is not added this way. To get it, use **Templates** → **Add starter templates**. **Make the full video on this topic** (below) also adds it.

## Watch it being made

The project page shows each step as it runs:

1. **Article**: the script is written.
2. **Narration**: the script is spoken.
3. **Images**: four vertical images are drawn.
4. **Video**: the words are timed against the narration and the short is rendered with word-by-word captions and the title on top.

Open the **Live** tab to see the steps, the script as it is written, the images as they land and the narration's waveform. Each running step says its time left. While it runs, Home also lists it under **Running now**, and the rail shows how many runs are going.

See [Project Page](Project-Page) for everything else on this page.

## Get the finished short

1. When the run is done, open **Video** on the project page.
2. Play the short in Slopify's own player. See [Project Page](Project-Page#the-players).
3. Press **Download** and pick **Video (.mp4)**, or press **Open folder** to see the file on your computer.

The file is also in the project's folder under your Projects folder (see [Where Your Files Live](Where-Your-Files-Live)).

## What it costs

- **Narration** uses your voice provider's credit, billed per character of the roughly 150-word script. The computer's own voice costs nothing.
- **Text and images** through a command-line tool count toward that tool's plan, not a per-call bill. Through API keys, they are billed by that provider.
- The project's **Cost** tab shows what each step cost. See [Costs and Run Cost](Costs-and-Run-Cost).

## If it refuses to start

The status line says "The short didn't start." and the lines above the topic say what is missing, each with the button that fixes it. They are the same lines as step 1:

| Line says | Fix |
| --- | --- |
| Nothing can write the script yet. | Sign in to Claude Code, Codex or Antigravity CLI, or press **Add a key for writing** (OpenRouter). |
| Nothing can make the images yet. | Press **Add an image key** (OpenAI, Google, fal.ai or Replicate), or sign in to Codex CLI. |
| Nothing can read the script aloud yet. | Press **Add a voice key** (OpenAI works at once), or on Linux install `espeak-ng` and press **Check again**. |
| *Voice service* has a key but no voice saved yet. | Press **Save a voice** (Settings → Voices), or add an OpenAI key. |
| Slopify can't list the models on this machine right now. | Restart Slopify and try again. |

If the run fails later, the project page and Home's **Needs you** say which step failed and offer the fix. See [Recovery and Retries](Recovery-and-Retries).

## Make the full video next

When the short is done, the project's next action is **Make the full video on this topic**. It opens Create set up for a long video: the same topic and title, the starter template (added to Templates if it wasn't yet), and the text, image and voice providers the short used, since those are known to work on your computer. Nothing starts until you press **Make the video**. See [Create Overview](Create-Overview).

## Change the short afterwards

It is a normal project: you can edit the script, change an image, pick another voice or caption style, and Slopify rebuilds only what the change affects. See [Editing a Project](Editing-a-Project) and [Video Editing](Video-Editing).

## Next steps

- Make a long video with more control: [Create Overview](Create-Overview).
- Cut shorts from a long video automatically: [Shorts](Shorts).
- Reuse the style: add the starter pack and pick its template on Create ([Templates](Templates)).
- Let Claude Code or Codex look after your runs, fix failures and answer reviews: [Agents (MCP)](Agents-MCP).

## Tips

- The first-run screen disappears once you have a real project. Your later shorts are made from Create, or from Shorts on a long video.
- Want to try without spending anything first? Open a sample project from the first-run screen ([First Launch and Welcome](First-Launch-and-Welcome#explore-the-samples)).

## Related pages

- [First Launch and Welcome](First-Launch-and-Welcome)
- [Keys and Services](Providers-and-Keys)
- [AI CLIs](AI-CLIs)
- [Project Page](Project-Page)
- [Shorts](Shorts)
- [Costs and Run Cost](Costs-and-Run-Cost)
