# Your First Short

The quickest way to see Slopify work: type a topic, press one button, and get a narrated, captioned 9:16 short of about a minute. Slopify picks the providers for you from what your computer already has.

**Where to find it:** the first-run screen (**Welcome to Slopify**) → **Make a 60-second short**. On a fresh install it opens by itself; its address is `http://127.0.0.1:6969/welcome`.

## What you get

| Part | Details |
| --- | --- |
| Script | About 150 words, written from your topic by a text model. No web research. |
| Narration | Spoken by your voice provider. |
| Images | Four vertical images, one for each 15 seconds of the minute. |
| Video | A 9:16 short with word-by-word captions and the title on top, rendered on your computer. |
| Not made | No thumbnail, no PDF, no YouTube description and no further shorts. |

With the command-line tools it usually takes about five minutes.

## Before you start

You need three things. Slopify checks them when you press the button and tells you what is missing.

| Need | What Slopify uses, in this order |
| --- | --- |
| Text | Claude Code CLI (a Sonnet model when it has one), Codex CLI, Gemini CLI, then an OpenRouter key. |
| Images | Codex CLI, then an OpenAI, Google, fal.ai or Replicate key. |
| Voice | Your first saved voice whose provider has a key. If none, the style's suggested OpenAI voice, which needs an OpenAI key. |

Command-line tools can't speak, so you always need a voice key: OpenAI, ElevenLabs, Cartesia or Inworld. With ElevenLabs, Cartesia or Inworld, also save a voice in Settings → **Voices**.

To set these up:

1. Install and sign in to Claude Code, Codex or Gemini CLI (see [AI CLIs](AI-CLIs)), or add keys in Settings → **Providers** (see [Providers and Keys](Providers-and-Keys)).
2. Add a voice key in Settings → **Providers**. An OpenAI key is the simplest: the suggested voice works with it right away.
3. Back on the first-run screen, the **Found on this computer** rows show which tools are ready.

## Make the short

1. Open the first-run screen.
2. In **Topic**, type what the short is about, in a few words or a question (up to 200 characters). For example: `Why the sea glows at night`. A specific topic gives a sharper short than a broad one.
3. Pick a **Style**:
   - **General**: a neutral explainer style, with the OpenAI voice `alloy` as its suggestion.
   - **Sleep lore**, **True crime**, **History** or **Science explainers**: that starter pack's script prompt, image style and suggested voice.
4. Press **Make a 60-second short**. The status line says **Starting your short…**.
5. Slopify creates the project and opens its page. The run has started.

Pressing the button twice, or retrying after a dropped connection, opens the same project instead of starting a second one.

## What Slopify sets up for you

- **The project.** Its title is your topic, with a capital first letter. Its format is 9:16.
- **Library prompts.** The style's script and vertical-scene prompts are added to your Library (for General: **Starter · 60-second short** and **Starter · Vertical scene**). If you already have a prompt with that name and different text, the new one comes in as `<name> (2)`. Reusing them later changes nothing.
- **A saved voice.** The style's suggested OpenAI voice is added to Settings → **Voices** (for General: **Starter narrator**), unless you already have one with that voice.
- **Settings.** Captions at the bottom, a slow zoom or pan on each image, half a second of silence at each end, and the volume levelled as in your Settings.

The pack's Play template is not added this way. To get it, use **Add pack** under **Starter packs**, or Library → **Templates** → **Add a starter pack**.

## Watch it being made

The project page shows each step as it runs:

1. **Article**: the script is written.
2. **Narration**: the script is spoken.
3. **Images**: four vertical images are drawn.
4. **Video**: the words are timed against the narration and the short is rendered with word-by-word captions and the title on top.

Open the **Live** tab to see the steps, the script as it is written, the images as they land and the narration's waveform. While it runs, Home also lists it under **Running now**, and the top bar shows how many runs are going.

See [Project Page](Project-Page) for everything else on this page.

## Get the finished short

1. When the run is done, open **Video** on the project page.
2. Play the short in the page's player.
3. Press **Download** and pick **Video (.mp4)**, or press **Open folder** to see the file on your computer.

The file is also in the project's folder under your Projects folder (see [Where Your Files Live](Where-Your-Files-Live)).

## What it costs

- **Narration** uses your voice provider's credit, billed per character of the roughly 150-word script.
- **Text and images** through a command-line tool count toward that tool's plan, not a per-call bill. Through API keys, they are billed by that provider.
- The project's **Cost** tab shows what each step cost. See [Costs and Run Cost](Costs-and-Run-Cost).

## If it refuses to start

The message names what is missing and where to fix it:

| Message starts with | Fix |
| --- | --- |
| No text model is ready. | Install Claude Code, Codex or Gemini CLI and sign in, or add an OpenRouter key in Settings → Providers. |
| No image model is ready. | Install Codex CLI and sign in, or add an OpenAI, Google, fal.ai or Replicate key in Settings → Providers. |
| No voice is ready to narrate the short | Add an OpenAI, ElevenLabs, Cartesia or Inworld key in Settings → Providers. |
| Your voice provider has no saved voice yet. | Add a voice in Settings → Voices, then try again. |
| Slopify can't list the models on this machine right now. | Restart Slopify and try again. |

If the run fails later, the project page and Home's **Needs you** say which step failed and offer the fix. See [Recovery and Retries](Recovery-and-Retries).

## Change the short afterwards

It is a normal project: you can edit the script, change an image, pick another voice or caption style, and Slopify rebuilds only what the change affects. See [Editing a Project](Editing-a-Project) and [Video Editing](Video-Editing).

## Next steps

- Make a long video with more control: [Play Overview](Play-Overview).
- Cut shorts from a long video automatically: [Shorts](Shorts).
- Reuse the style: add the starter pack and pick its template on Play ([Templates](Templates)).

## Tips

- The first-run screen disappears once you have a real project. Your later shorts are made from Play, or from Shorts on a long video.
- Want to try without spending anything first? Open a sample project from the first-run screen ([First Launch and Welcome](First-Launch-and-Welcome#explore-the-samples)).

## Related pages

- [First Launch and Welcome](First-Launch-and-Welcome)
- [Providers and Keys](Providers-and-Keys)
- [AI CLIs](AI-CLIs)
- [Project Page](Project-Page)
- [Shorts](Shorts)
- [Costs and Run Cost](Costs-and-Run-Cost)
