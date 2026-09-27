# Providers and Keys

Slopify does no AI work itself: it calls providers you set up, on your own accounts. This page lists every provider, where to get each key, how to save and test it, how **Check all** checks everything at once, and how to add voices in **Settings → Voices**.

**Where to find it:** Settings → Providers (keys, command-line tools and the system voice), Settings → Voices (voice IDs).

## How providers are organised

Settings → Providers shows three lists, one per kind of work. Each row says whether the provider is ready. Pick a row to open its setup beside the list: the steps, the key field or the command, and the actions.

| List | What it makes | Providers |
|---|---|---|
| **Text** | Research, script, article, titles, descriptions, reviews | OpenRouter (API key), Claude Code CLI, Codex CLI, Gemini CLI (command line) |
| **Speech** | Narration | ElevenLabs, OpenAI, Cartesia, Inworld, Google Gemini (API key), System voice (built in, no key) |
| **Images** | Images, thumbnails, animated clips | fal.ai, Replicate, OpenAI, Google (API key), Codex CLI (command line) |

Row states:

| State | Meaning |
|---|---|
| **Key saved** | A key is stored for this provider. |
| **No key** | No key yet; the provider is not selectable on Play. |
| **Ready** | A command-line tool was found and is usable. |
| **Needs attention** | The tool was found but something is wrong, for example Codex CLI is older than 0.149.1. |
| **Not found** | The tool is not on this computer (or not at the saved path). For the System voice: no speech program was found. |

Each row also says what kind it is: **Command line**, **Built in, no key** or **API key**.

The command-line tools (Claude Code, Codex, Gemini) need no key: they use the sign-in you already have. They are covered on [AI CLIs](AI-CLIs).

On a fresh install with no key saved, the page says **Paste a key to make its provider selectable on Play.** On the first launch Slopify also looks for the command-line tools. If it finds one it says so, names what it found and picks it on Play; choose **Got it** to hide that message. Narration needs no key either: without a voice key, the [System voice](#the-system-voice) reads it with your computer's own speech.

## Where your keys are kept

- A key is stored on this computer only and sent only to its own provider.
- It is never put in a backup or an export. After you import a backup on another computer, enter your keys again.
- A saved key is shown as a fixed row of dots, never any part of it.
- Slopify reads the key when each call starts, so a key you change mid-run is used from the next call.
- Readiness is checked again before each run.

## Add a key

1. Open **Settings → Providers**.
2. Pick the provider in its list (for example **ElevenLabs** under **Speech**).
3. Follow the numbered steps shown beside it. They link to the provider's sign-up page, the page that makes the key and, where there is one, its billing page. Once a key is saved, the steps fold under **Where to get a key**.
4. Paste the key in **<Provider> API key**.
5. Optional: choose **Test** to check the pasted key before you keep it. See [Test a key](#test-a-key).
6. Choose **Save**. A tick shows beside Save for a moment.

To replace a key, paste the new one and choose **Save**. To remove it, choose **Remove**, then **Remove key**. Projects that used that provider cannot retry until a key is saved again.

The info button beside each provider's name says what it does and how it bills.

## Test a key

**Test** asks the provider whether a key works, with the cheapest harmless call it allows (such as listing its models). Nothing is generated or billed. The answer waits up to 15 seconds.

- **Before saving:** with a key pasted in the field, Test checks that pasted key. It is sent only to its own provider, never stored and never logged. When it passes, the answer adds "It is not saved yet: choose Save to keep it."
- **After saving:** with the field empty, Test checks the saved key.

With neither, Test is greyed out: "Paste a key first."

| Answer | What it means | What to do |
|---|---|---|
| Accepted | The key works. Except for OpenRouter, credit is only checked when Slopify first generates with it. | Nothing. |
| Did not accept (HTTP 401) | Mistyped, revoked or for another account. | Make a new key, Save, Test. |
| No credit (HTTP 402) | Key accepted, but the account has no credit or payment method. | Add credit on the provider's billing page. |
| Refused (HTTP 403) | The key is restricted, or the account needs verifying or billing set up. | Check the permissions listed for that provider below. |
| Too many requests (HTTP 429) | The key is usually valid. | Wait a minute and Test again. |
| Problem on its side (HTTP 5xx) | The provider is having trouble. | Wait a few minutes and Test again. |
| Did not answer / could not reach | No answer within 15 seconds, or no connection. | Check your internet, firewall or proxy. |
| Unexpected answer | Anything else. | Check the key; if it keeps happening, use **Download diagnostics** in Settings and report it. |

## Text providers

### OpenRouter

Writes the text with hundreds of models from many companies through one key. Charged per token from credit you buy on OpenRouter; prices follow the model catalogue (see [Models](Models)).

1. Sign up at openrouter.ai/sign-up.
2. Open **Credits** (openrouter.ai/settings/credits) and buy credit. Paid models are charged from it; a negative balance stops even free models.
3. Open **Keys** (openrouter.ai/settings/keys), choose **Create API key**, and copy it.
4. Paste it in Slopify, **Save**, then **Test**.

Keys have no scopes. If you set a credit limit on the key, keep it above what a run costs. OpenRouter is the only provider whose Test also shows missing credit.

### Claude Code CLI, Codex CLI, Gemini CLI

No key. See [AI CLIs](AI-CLIs).

## Speech providers

### ElevenLabs

Narrates with ElevenLabs voices, including voices you added to your ElevenLabs account. Billed in characters of narration from your ElevenLabs plan.

1. Sign up at elevenlabs.io/app/sign-up.
2. Open **Developers → API keys** (elevenlabs.io/app/developers/api-keys), choose **Create key**, and copy it.
3. Paste it in Slopify, **Save**, then **Test**.

A restricted key needs **Text to Speech** access and **Models** read access (models_read) for Test; Voices read helps when picking voices. Remove any credit quota or IP allowlist that would block this computer.

### OpenAI (speech)

Narrates with OpenAI's text-to-speech voices. Billed per character or per audio minute, depending on the model, from prepaid credit on your OpenAI platform account.

1. Sign up or sign in at platform.openai.com/signup.
2. Open **Billing** and buy prepaid credit. New accounts need at least $5 before any call works.
3. Open **API keys** (platform.openai.com/api-keys), choose **Create new secret key**, and copy it. It is shown once.
4. Paste it in Slopify, **Save**, then **Test**.

A key with All permissions works. A restricted key needs **Models: Read** (for Test) and **Model capabilities: Request** (for speech and images).

OpenAI appears twice in Settings, once under **Speech** and once under **Images**. Each has its own key field, so you can key one without the other. You can paste the same OpenAI key into both.

### Cartesia

Narrates with Cartesia voices, billed in characters from your Cartesia plan. The free plan needs no card, so it is an easy way to try narration.

1. Sign up at play.cartesia.ai/sign-up.
2. Open **API Keys** (play.cartesia.ai/keys), create a key, and copy it. It starts with `sk_car_`.
3. Paste it in Slopify, **Save**, then **Test**.

Keys have no scopes.

### Inworld

Narrates with Inworld voices, billed per character from your Inworld account.

1. Sign up at platform.inworld.ai/signup.
2. Open **API Keys** (platform.inworld.ai/api-keys) and choose **Generate new key**. It must be a Standard key; Realtime-only keys do not work.
3. Copy the **Base64 credentials** value exactly as shown, without encoding it again.
4. Paste it in Slopify, **Save**, then **Test**.

On Play, choose the TTS-2 or TTS-2 Flash model and an Inworld voice (for example `Dennis`, or a voice from your workspace).

How long text is handled:

- Short text streams straight away.
- With TTS-2, text over 4,000 characters goes as one async job of up to 100,000 characters. Inworld caps On-Demand accounts at 10,000. The audio is ready once the job finishes.
- TTS-2 Flash sends parts of at most 4,000 characters. For long articles, pick paragraph chunking.
- Pausing stops Slopify's own requests, but Inworld may still finish and bill a job it already accepted. Resuming starts a new request for any unfinished narration.

Some features need Inworld: Narration Preparation and pronunciations need an Inworld TTS-2 model. See [Play-Narration](Play-Narration) and [Narration-Aliases-and-Glossary](Narration-Aliases-and-Glossary).

### Google Gemini (speech)

Narrates with Gemini's 30 prebuilt voices, billed per text and audio token on your Gemini API key. It uses the key saved for [Google images](#google): with one saved there, nothing is needed here. You can also save a key of its own under **Google Gemini** in the **Speech** list.

Pick a Gemini voice in Settings → **Voices** (see [Add a voice](#add-a-voice)). With two speakers on Gemini voices (a podcast or interview, see [Multiple Voices](Multiple-Voices)), their consecutive turns go in one two-speaker request; a third voice starts a new request.

### The system voice

The **System voice** narrates with your computer's own speech program: free, no key, and no account. It sounds robotic, so it is best for trying Slopify out; add a keyed voice when you want a better one. A first 60-second short uses it when no voice key is saved (see [Your First Short](Your-First-Short)).

Slopify looks for a speech program each time and uses the best one it finds:

| System | Speech program |
|---|---|
| macOS | macOS voices (the built-in `say`) |
| Windows | Windows voices (System.Speech, through PowerShell). Add voices in Windows Settings → Time & language → Speech. |
| Linux | Piper, SVOX Pico, eSpeak NG or eSpeak, best first. Install one, for example `sudo apt install espeak-ng`, `sudo pacman -S espeak-ng` or `sudo dnf install espeak-ng`. Piper needs its voice models listed in `SLOPIFY_PIPER_VOICES`, and counts only when `piper --help` shows Piper's own options (the mouse settings app also called piper is left out). |
| Docker | The image includes eSpeak NG. If it is missing, update the image. |

Pick **System voice** in the **Speech** list to see what was found: "Found *engine*. Narration with it is free; a keyed voice (ElevenLabs, OpenAI) sounds better.", each program with its number of voices, and **Add a system voice**, which opens Settings → **Voices**. When nothing is found, it says what to install on your system. On Play it is offered as a TTS provider like the others, greyed out as **Speech Program Missing** when nothing is found.

## Image providers

### fal.ai

Draws images and thumbnails with the models fal.ai hosts, charged per image from prepaid credit. fal.ai locks the account when the balance runs out, so a run stops at the images step until you add credit.

1. Sign up at fal.ai/login.
2. Open **Billing** (fal.ai/dashboard/billing) and buy credit.
3. Open **Keys** (fal.ai/dashboard/keys), choose **Add key** with the **API** scope, and copy it.
4. Paste it in Slopify, **Save**, then **Test**.

The API scope is enough; Slopify does not need an ADMIN key.

### Replicate

Draws images and thumbnails with the models Replicate hosts, charged per image or per second of compute from credit bought up front.

1. Sign in at replicate.com/signin.
2. Open **Billing** (replicate.com/account/billing) and buy credit. Replicate needs credit before it runs paid models.
3. Open **API tokens** (replicate.com/account/api-tokens), create a token, and copy it. It starts with `r8_`.
4. Paste it in Slopify, **Save**, then **Test**.

Tokens have no scopes.

### OpenAI (images)

Draws images and thumbnails with OpenAI's GPT Image models, charged per image from prepaid credit on your OpenAI platform account. Get the key as for [OpenAI speech](#openai-speech). GPT Image may also need **Verify Organization** under Settings → Organization → General on the OpenAI platform before it works.

### Google

Draws images and thumbnails with Google's Gemini image models, charged per image.

1. Sign in to Google AI Studio (aistudio.google.com) with your Google account.
2. Open **Projects** and choose **Set up billing** next to your project. Gemini image models are not on the free tier.
3. Open **API keys** (aistudio.google.com/apikey), choose **Create API key**, and copy it.
4. Paste it in Slopify, **Save**, then **Test**.

Use a key made in AI Studio. An older Google Cloud key must be set to **Restrict to Gemini API only**, or Google rejects it.

Google Gemini voices use this same key (see [Google Gemini (speech)](#google-gemini-speech)).

### Codex CLI (images)

Draws images with your ChatGPT sign-in instead of a key. See [AI CLIs](AI-CLIs#codex-images).

## How many calls run at once

| Provider | Calls at once |
|---|---|
| OpenRouter, ElevenLabs, OpenAI (speech and images), Cartesia, fal.ai, Replicate, Google | 3 |
| Inworld | 5 |
| Claude Code, Codex, Gemini (text) | 3 |
| Codex CLI (images) | 4 |

The keyed providers' numbers come from the model catalogue.

## Check all providers

**Check all** runs every check at once. Run it after changing a key, or when a run stops at a provider.

1. Open **Settings → Providers**.
2. Choose **Check all** at the top of the page (or press `Ctrl+K` and run **Check all providers**).
3. Read the **Health check** section under the lists.

For each provider it checks:

- **Installed** and **Signed in** for a command-line tool. Gemini CLI's sign-in is read from its own files in `~/.gemini` (the sign-in method in `settings.json`, the Google sign-in in `oauth_creds.json`, or `GEMINI_API_KEY`), without starting it. When the files don't say, it tells you to run `gemini` once to confirm.
- **Speech program found** for the System voice, with the program it speaks with.
- **Key saved** and **Key valid** for a keyed provider, using the same call as **Test**. Nothing is generated or billed.
- **Model reachable** for a keyed provider: Slopify asks the provider, with the saved key, about each model you chose (its model page, or the model list for OpenRouter and ElevenLabs), without generating anything. It reads, for example, "OpenRouter answered for … with this key." A provider with no such check says so.
- **Chosen models**: that the models your templates, schedules, drafts and unfinished projects use are still offered. A retired one points you to **Switch** in Settings → Models (see [Models](Models#switch-away-from-a-retired-model)).

Each provider's row has **Check again**, which checks that provider alone; its result replaces the row until the next **Check all**. It is the quick way to confirm a fix, such as signing a CLI in again.

| Result | Meaning |
|---|---|
| **Ready** | Every check passed. |
| **Check** | Something might stop a run, such as a rate limit or the provider being down during the check. |
| **Needs fixing** | Something will stop a run. The line says how to fix it. |
| **Not set up** | Neither set up nor used anywhere. These are listed together on one line. |

The report stays while you move between Settings sections.

## Add a voice

Narration needs a voice ID from your speech provider. Slopify does not check the ID when you add it; a wrong ID fails when a run's narration uses it.

1. Save a key for the speech provider in **Settings → Providers** (the Provider list only shows speech providers).
2. Find the voice ID in the provider's voice library and copy it.
3. Open **Settings → Voices**.
4. Under **Add a voice**, fill in the fields and choose **Add voice**.

| Field | What it does | Rules |
|---|---|---|
| **Voice name** | The name you pick the voice by on Play and in Edit project. Only you see it. | Required, up to 200 characters. Names can repeat. |
| **Provider** | The text-to-speech service the ID belongs to. | Speech providers only. |
| **Voice ID** | The provider's own ID for the voice. For Inworld, use an ID such as `Dennis`, or one from your workspace. For **System voice** it is a list of the voices found on this computer, grouped by speech program (**Pick a voice**); for **Google Gemini**, a list of Gemini's voices (**Pick a Gemini voice**). Picking one fills in the name too. | Required, up to 200 characters, unique per provider. |
| **Languages** | The languages the voice speaks, as codes such as `es, de`. Play lists the voice only for projects in these languages. | 2 or 3 letter codes. Blank asks the provider when it can say; a voice with unknown languages shows as **Any (not known)** and is offered for every language. |

## Manage your voices

The **Voices** table lists **Name**, **Provider**, **Voice ID**, **Languages** and **Real person** for each voice.

- **Edit** in the Languages cell changes the codes; choose **Save** or **Cancel**.
- **Real person**: turn it on for a voice cloned from, or made to sound like, a real person. Prepare upload then answers Yes to YouTube's AI use question for videos it narrates. An AI voice that imitates no one stays off. Default: off. See [Publishing-to-YouTube](Publishing-to-YouTube).
- **Remove**, then **Remove voice**, deletes it from the list. Projects that used the voice keep the audio they made with it.

For projects with more than one narrator, see [Multiple-Voices](Multiple-Voices). For voices in other languages, see [Other-Languages](Other-Languages).

## Tips

- The cheapest way to start: sign in to a command-line tool for text and images, and use the System voice (free) or Cartesia's free plan for narration.
- A Test that passes does not prove the account has credit (except on OpenRouter). The first real generation does.
- If you share a machine, keep Slopify bound to `127.0.0.1`: anyone who reaches its port can use your keys.

## Related pages

- [AI CLIs](AI-CLIs)
- [Models](Models)
- [Costs and Run Cost](Costs-and-Run-Cost)
- [Settings Reference](Settings-Reference)
- [Play Narration](Play-Narration)
- [Multiple Voices](Multiple-Voices)
- [Troubleshooting](Troubleshooting)
