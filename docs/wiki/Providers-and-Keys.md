# Keys and Services

Slopify does no AI work itself: it calls services you set up, on your own accounts. This page lists every service, where to get each key, how to save and test it, how **Check every service** checks everything at once, and how to add voices in **Settings → Voices**.

**Where to find it:** Settings → **Keys & services** (keys, sign-in tools and the system voice), Settings → **Voices** (the voices narration can use). Settings opens on Keys & services.

## How the page is laid out

**Keys & services** opens with three lines saying what your videos have now, each with its state in words (**Ready**, **No key** or **No voice saved**, the same words as the first-run screen):

| Line | Ready when | Its button while not ready |
|---|---|---|
| **Article** | A writing service is ready. The line names the one Create picks, for example "Claude Code CLI (Create picks it)". | **Set up a writing service** |
| **Narration** | A voice service can narrate: an OpenAI key (the first short saves its voice), the system voice found, or another voice service with a key and a voice saved under **Voices**. A key with no voice saved reads **No voice saved**. Otherwise "No voice service yet, so videos have no narration." | **Set up a voice service**, or **Save a voice** |
| **Images** | An image service is ready. Otherwise "No image service yet, so videos have no pictures." | **Set up an image service** |

A ready line has no button: its services are listed right under it.

Under them, **Check every service** (see below), then three lists, one per kind of work. Each row names the service, how it connects (**API key**, **Sign-in** or **Built in**) and its state. Pick a row to open its setup: beside the list on a wide window, under its own row on a narrower one (a laptop with the Settings list beside it, or a phone). The setup holds what it does and how it bills, the key box or the tool's path, and the steps to get a key. A link from the first-run screen or Create opens the service it names and scrolls to its key box, with **Back to the welcome** (or **Back to Create**) beside it, which becomes **Done · back to …** once a key is saved.

| List | What it makes | Services |
|---|---|---|
| **Writing services** | Research, the article, titles, descriptions, checks | OpenRouter (API key), Claude Code CLI, Codex CLI, Antigravity CLI (sign-in) |
| **Voice services** | Narration | ElevenLabs, OpenAI, Cartesia, Inworld, Google Gemini (API key), System voice (built in, no key) |
| **Image services** | Images, thumbnails, animated clips | fal.ai, Replicate, OpenAI, Google (API key), Codex CLI (sign-in) |

Row states, the same here, on Voices and in the check:

| State | Meaning |
|---|---|
| **Ready** | A key is saved, or the tool was found and is signed in. |
| **No key** | No key yet; Create lists the service with "No key" and can't use it. |
| **Not found** | The tool is not on this computer (or not at the saved path). |
| **Signed out** | The tool was found but is not signed in. |
| **Needs fixing** | The tool was found but something else is wrong, for example Codex CLI older than 0.149.1. |
| **Not installed** | The System voice found no speech program on this computer. |

The sign-in tools (Claude Code, Codex, Antigravity) need no key: they use the sign-in you already have. They are covered on [AI CLIs](AI-CLIs). Narration needs no key either: without a voice key, the [System voice](#the-system-voice) reads it with your computer's own speech.

## Where your keys are kept

- A key is stored on this computer only and sent only to its own service.
- It is never put in a backup or an export. After you import a backup on another computer, enter your keys again.
- A saved key is shown as a fixed row of dots, never any part of it.
- Slopify reads the key when each call starts, so a key you change mid-run is used from the next call.
- Readiness is checked again before each run.

## Add a key

1. Open **Settings → Keys & services**.
2. Pick the service in its list (for example **ElevenLabs** under **Voice services**), or press the **Set up …** button of the line that needs it.
3. Follow the steps under **Where to get a key**. They link to the service's sign-up page, the page that makes the key and, where there is one, its billing page.
4. Paste the key in **<Service> API key**.
5. Press **Save**.
6. Optional: press **Test the key (free)** to check it. See [Test a key](#test-a-key).

To replace a key, paste the new one and press **Save**. To remove it, press **Remove the key** and confirm. Projects that used that service cannot try again until a key is saved again.

When you came from Create or the welcome screen to add a key, **Done · back to …** takes you back once it is saved. With a voice key saved but no voice for it yet, the line under the key offers **Add an ElevenLabs voice** (or the service's name).

## Test a key

**Test the key (free)** appears once a key is pasted or saved. It asks the service whether the key works, with the cheapest harmless call it allows (such as listing its models). Nothing is made or billed. The answer waits up to 15 seconds.

- **Before saving:** with a key pasted in the box, it checks that pasted key. It is sent only to its own service, never stored and never logged. When it passes, the answer says it is not saved yet.
- **After saving:** with the box empty, it checks the saved key.

| Answer | What it means | What to do |
|---|---|---|
| Accepted | The key works. Except for OpenRouter, credit is only checked when Slopify first makes something with it. | Nothing. |
| Did not accept (HTTP 401) | Mistyped, revoked or for another account. | Make a new key, save it, test it. |
| No credit (HTTP 402) | Key accepted, but the account has no credit or payment method. | Add credit on the service's billing page. |
| Refused (HTTP 403) | The key is restricted, or the account needs verifying or billing set up. | Check the permissions listed for that service below. |
| Too many requests (HTTP 429) | The key is usually valid. | Wait a minute and test again. |
| Problem on its side (HTTP 5xx) | The service is having trouble. | Wait a few minutes and test again. |
| Did not answer / could not reach | No answer within 15 seconds, or no connection. | Check your internet, firewall or proxy. |
| Unexpected answer | Anything else. | Check the key; if it keeps happening, use **Download diagnostics** in Settings → About and report it. |

## Writing services

### OpenRouter

Writes the text with hundreds of models from many companies through one key. Charged per token from credit you buy on OpenRouter; prices follow the model list (see [Models](Models)).

1. Sign up at openrouter.ai/sign-up.
2. Open **Credits** (openrouter.ai/settings/credits) and buy credit. Paid models are charged from it; a negative balance stops even free models.
3. Open **Keys** (openrouter.ai/settings/keys), choose **Create API key**, and copy it.
4. Paste it in Slopify, **Save**, then **Test the key (free)**.

Keys have no scopes. If you set a credit limit on the key, keep it above what a run costs. OpenRouter is the only service whose test also shows missing credit.

### Claude Code CLI, Codex CLI, Antigravity CLI

No key. Pick the tool's row to see its command, whether it was found and signed in, and **Change path** to point Slopify at it (**Executable path**, then **Save path**). See [AI CLIs](AI-CLIs).

## Voice services

### ElevenLabs

Narrates with ElevenLabs voices, including voices you added to your ElevenLabs account. Billed in characters of narration from your ElevenLabs plan.

1. Sign up at elevenlabs.io/app/sign-up.
2. Open **Developers → API keys** (elevenlabs.io/app/developers/api-keys), choose **Create key**, and copy it.
3. Paste it in Slopify, **Save**, then **Test the key (free)**.

A restricted key needs **Text to Speech** access and **Models** read access (models_read) for the test; Voices read helps when picking voices. Remove any credit quota or IP allowlist that would block this computer.

### OpenAI (speech)

Narrates with OpenAI's text-to-speech voices. Billed per character or per audio minute, depending on the model, from prepaid credit on your OpenAI platform account.

1. Sign up or sign in at platform.openai.com/signup.
2. Open **Billing** and buy prepaid credit. New accounts need at least $5 before any call works.
3. Open **API keys** (platform.openai.com/api-keys), choose **Create new secret key**, and copy it. It is shown once.
4. Paste it in Slopify, **Save**, then **Test the key (free)**.

A key with All permissions works. A restricted key needs **Models: Read** (for the test) and **Model capabilities: Request** (for speech and images).

OpenAI appears twice in Keys & services, once under **Voice services** and once under **Image services**. Each keeps its own key, so you can key one without the other. You can paste the same OpenAI key into both.

### Cartesia

Narrates with Cartesia voices, billed in characters from your Cartesia plan. The free plan needs no card, so it is an easy way to try narration.

1. Sign up at play.cartesia.ai/sign-up.
2. Open **API Keys** (play.cartesia.ai/keys), create a key, and copy it. It starts with `sk_car_`.
3. Paste it in Slopify, **Save**, then **Test the key (free)**.

Keys have no scopes.

### Inworld

Narrates with Inworld voices, billed per character from your Inworld account.

1. Sign up at platform.inworld.ai/signup.
2. Open **API Keys** (platform.inworld.ai/api-keys) and choose **Generate new key**. It must be a Standard key; Realtime-only keys do not work.
3. Copy the **Base64 credentials** value exactly as shown, without encoding it again.
4. Paste it in Slopify, **Save**, then **Test the key (free)**.

On Create, choose the TTS-2 or TTS-2 Flash model and an Inworld voice (for example `Dennis`, or a voice from your workspace).

How long text is handled:

- Short text streams straight away.
- With TTS-2, text over 4,000 characters goes as one async job of up to 100,000 characters. Inworld caps On-Demand accounts at 10,000. The audio is ready once the job finishes.
- TTS-2 Flash sends parts of at most 4,000 characters. For long articles, split the narration by paragraph.
- Pausing stops Slopify's own requests, but Inworld may still finish and bill a job it already accepted. Continuing starts a new request for any unfinished narration.

Some features need Inworld: narration preparation and pronunciations need an Inworld TTS-2 model. See [Create: Narration](Create-Narration) and [Narration Aliases and Glossary](Narration-Aliases-and-Glossary).

### Google Gemini (speech)

Narrates with Gemini's 30 prebuilt voices, billed per text and audio token on your Gemini API key. It uses the key saved for [Google images](#google): with one saved there, nothing is needed here. You can also save a key of its own under **Google Gemini** in the **Voice services** list.

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

Pick **System voice** in the **Voice services** list to see what was found: "Found *program*. Narration with it is free; a voice service with a key sounds better.", each program with its number of voices, and **Add a system voice**, which opens Settings → **Voices**. When nothing is found, the row says **Not installed** and the panel says what to install on your system. On Create it is offered as a voice service like the others, marked **Not found** when nothing is installed.

## Image services

### fal.ai

Draws images and thumbnails with the models fal.ai hosts, charged per image from prepaid credit. fal.ai locks the account when the balance runs out, so a run stops at the images until you add credit.

1. Sign up at fal.ai/login.
2. Open **Billing** (fal.ai/dashboard/billing) and buy credit.
3. Open **Keys** (fal.ai/dashboard/keys), choose **Add key** with the **API** scope, and copy it.
4. Paste it in Slopify, **Save**, then **Test the key (free)**.

The API scope is enough; Slopify does not need an ADMIN key.

### Replicate

Draws images and thumbnails with the models Replicate hosts, charged per image or per second of compute from credit bought up front.

1. Sign in at replicate.com/signin.
2. Open **Billing** (replicate.com/account/billing) and buy credit. Replicate needs credit before it runs paid models.
3. Open **API tokens** (replicate.com/account/api-tokens), create a token, and copy it. It starts with `r8_`.
4. Paste it in Slopify, **Save**, then **Test the key (free)**.

Tokens have no scopes.

### OpenAI (images)

Draws images and thumbnails with OpenAI's GPT Image models, charged per image from prepaid credit on your OpenAI platform account. Get the key as for [OpenAI speech](#openai-speech). GPT Image may also need **Verify Organization** under Settings → Organization → General on the OpenAI platform before it works.

### Google

Draws images and thumbnails with Google's Gemini image models, charged per image.

1. Sign in to Google AI Studio (aistudio.google.com) with your Google account.
2. Open **Projects** and choose **Set up billing** next to your project. Gemini image models are not on the free tier.
3. Open **API keys** (aistudio.google.com/apikey), choose **Create API key**, and copy it.
4. Paste it in Slopify, **Save**, then **Test the key (free)**.

Use a key made in AI Studio. An older Google Cloud key must be set to **Restrict to Gemini API only**, or Google rejects it.

Google Gemini voices use this same key (see [Google Gemini (speech)](#google-gemini-speech)).

### Codex CLI (images)

Draws images with your ChatGPT sign-in instead of a key. See [AI CLIs](AI-CLIs#codex-images).

## How many calls run at once

| Service | Calls at once |
|---|---|
| OpenRouter, ElevenLabs, OpenAI (speech and images), Cartesia, fal.ai, Replicate, Google | 3 |
| Inworld | 5 |
| Claude Code, Codex, Antigravity (writing) | 3 |
| Codex CLI (images) | 4 |

The keyed services' numbers come from the model list.

## Check every service

**Check every service** runs every check at once. Run it after changing a key, or when a run stops at a service.

1. Open **Settings → Keys & services**.
2. Press **Check every service** (or press `Ctrl+K` and run **Check every service**). The line beside it says when it last checked.
3. Read the result under the button: one row for each service that needs something, then one line naming the services that are **Ready**, and one naming those not set up and not used anywhere.

For each service it checks:

- **Installed** and **Signed in** for a sign-in tool. For Antigravity CLI, Slopify runs `agy models`: a model list means signed in, "Please sign in" means signed out (run `agy` in a terminal), and anything else shows as unknown.
- **Speech program found** for the System voice, with the program it speaks with.
- **Key** and **Key valid** for a keyed service, using the same call as **Test the key (free)**. Nothing is made or billed. A service chosen somewhere with no key saved shows **No key**, with where it is chosen and where to paste its key.
- **Model reachable** for a keyed service: Slopify asks the service, with the saved key, about each model you chose (its model page, or the model list for OpenRouter and ElevenLabs), without making anything.
- **Chosen models**: that the models your templates, schedules, drafts and unfinished projects use are still offered. A retired one points you to Settings → Models (see [Models](Models#switch-away-from-a-retired-model)).

Each service's row has **Check again**, which checks that service alone; its result replaces the row until the next full check. It is the quick way to confirm a fix, such as signing a tool in again.

| Result | Meaning |
|---|---|
| **Ready** | Every check passed. |
| **May need fixing** | Something might stop a run, such as a rate limit or the service being down during the check. |
| **Needs fixing** | Something will stop a run. The line says how to fix it. |
| **No key** | The service is chosen somewhere (a template, a schedule, a Create draft or a project) and has no key saved. |
| **Not set up** | Neither set up nor used anywhere. These are listed together on one line. |

The result stays while you move between Settings pages.

## Add a voice

Narration needs a voice from your voice service. Slopify does not check a pasted voice ID when you add it; a wrong ID fails when a run's narration uses it.

1. Save a key for the voice service in **Settings → Keys & services**. (You can add a voice before, but it can't narrate until the key is saved.)
2. Open **Settings → Voices**.
3. Under **Add a voice**, fill in the fields and press **Add voice**. Until it can add, the line beside it says what is still missing, such as "Pick a voice first".

| Field | What it does | Rules |
|---|---|---|
| **Voice service** | The service the voice belongs to. Each says when it has no key or is not installed. | Voice services only. |
| **Voice** | Pick from the service's own list (for example **Pick an OpenAI voice**), or **A voice of my own (paste its ID)** and paste the service's ID for it, from its voice library. For Inworld, an ID such as `Dennis`, or one from your workspace. For **System voice** it is a list of the voices found on this computer, grouped by speech program, with a filter and **Listen**. | Required, up to 200 characters, one per voice and service. |
| **Name** | How you pick it on Create. Only you see it. | Required, up to 200 characters. Names can repeat. |
| **Languages it speaks** | The languages the voice speaks, picked by name; each picked one has its own remove button. Create lists the voice only for projects in these languages. | **Any language** until you pick one: the service is asked when it can say, and otherwise the voice is offered for every language. |

## Manage your voices

Each voice is one row: its name, its service (and that service's state) and its ID, with **Listen** and **Remove**; under them what it **Speaks** and **Sounds like a real person**. When a voice's service has no key, a line above the list says so with a button to add the key.

- **Speaks** changes the voice's languages in place: pick one from the list to add it, or remove one. Each change is saved at once.
- **Sounds like a real person**: turn it on for a voice cloned from, or made to sound like, someone real. YouTube asks you to say so when you upload; Copy for YouTube Studio answers Yes for you. An AI voice that imitates no one stays off. Default: off. See [Publishing to YouTube](Publishing-to-YouTube).
- **Listen** reads one sentence aloud: free with the system voice, one short paid request with a service that has a key.
- **Remove**, then confirm, deletes it from the list. Projects that used the voice keep the audio they made with it.
- **Pronunciation** under the table opens the narration aliases: how names and words are said. See [Narration Aliases and Glossary](Narration-Aliases-and-Glossary).

For projects with more than one narrator, see [Multiple Voices](Multiple-Voices). For voices in other languages, see [Other Languages](Other-Languages).

## Tips

- The cheapest way to start: sign in to a tool for writing and images, and use the System voice (free) or Cartesia's free plan for narration.
- A test that passes does not prove the account has credit (except on OpenRouter). The first real call does.
- If you share a machine, keep Slopify bound to `127.0.0.1`: anyone who reaches its port can use your keys.

## Related pages

- [AI CLIs](AI-CLIs)
- [Models](Models)
- [Costs and Run Cost](Costs-and-Run-Cost)
- [Settings Reference](Settings-Reference)
- [Create: Narration](Create-Narration)
- [Multiple Voices](Multiple-Voices)
- [Troubleshooting](Troubleshooting)
