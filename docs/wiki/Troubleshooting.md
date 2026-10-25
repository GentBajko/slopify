# Troubleshooting

Most problems in Slopify show up as a failed step on the project page with a message that says what failed and where to fix it. This page collects the common ones, grouped by where you meet them, with the fix for each.

**Where to find it:** failed steps show on the project page (the title row's next action and the step's part, under **Error details**). Startup problems show in the terminal that started Slopify. **Download diagnostics** is at the foot of Settings → **About** and in the **Help** menu.

## First steps for any problem

1. Read the message. Slopify's messages name the screen or the command that fixes them.
2. On a project, press the next action button. For a failed step it is the fix, or **Try ... again**, which keeps everything already made. See [Recovery and Retries](Recovery-and-Retries).
3. Reload the page. A lot of "couldn't load" messages clear with a reload.
4. If it keeps happening, press **Download diagnostics** (Settings → **About**, or the **Help** menu), then attach the file to a bug report.

### Download diagnostics

**Download diagnostics** saves `slopify-diagnostics.json`: the Slopify version, your system and Node version, which services are set up or found, the project count and the state of the model list. It never holds your keys, prompts or project content.

## Service keys and accounts

| Message (or part of it) | Cause | Fix |
| --- | --- | --- |
| "*Service* did not accept the API key ... The key may be wrong, expired or revoked" | The key is wrong or was revoked. | Paste a current key in Settings → **Keys & services**, save, then press **Try ... again** on the project. The fix-it button **Open Settings → Keys & services → *service*** takes you there. |
| "No *service* API key is saved. Add one in Settings → Keys & services, then use Try again." | The project uses a service with no key. | Add the key, or switch the project to another service in **Edit settings** (under **Written by** in Article, in Narration or in Images). |
| "*Service* says the account is out of credits" | Your account with that service has no balance. | Add credits on the service's website, then try again. |
| "Google gives this API key no image quota for this model" | The Google project behind the key has no quota for that image model. | Enable billing or quota in Google's console, or pick another image model. |
| "Slopify could not load this provider's model list. Check the API key in Settings → Keys & services and your internet connection, then refresh the list." | The model list could not be fetched. | Check the key and your connection, then refresh. |
| "Save this provider's API key in Settings → Keys & services to load its models." | No key yet. | Save the key first. |

Keys and how to get them: [Keys and Services](Providers-and-Keys).

## AI CLIs (Claude Code, Codex, Antigravity)

| Message (or part of it) | Fix |
| --- | --- |
| "The *CLI* is not signed in, or its sign-in has expired." | Press **Copy sign-in command** on the project (or on Home's Needs you), run it in a terminal on the computer running Slopify (`claude auth login`, `codex login`, or `agy`), sign in, then press **Check again**: once the CLI answers that it is signed in, the step runs again by itself. See [Recovery and Retries](Recovery-and-Retries#sign-a-cli-in-again). |
| "Your Codex plan's usage limit is used up ... Slopify waits for it to reset and then carries on by itself." (also Claude and Antigravity) | Nothing to do: the run waits instead of failing. The project, Home, Projects and the Calendar say "Waiting for Codex limits (resets at 14:00)". See [Recovery and Retries](Recovery-and-Retries#waiting-for-cli-plan-limits). |
| "The *CLI* stopped without answering" | Run the CLI in a terminal to check it works and is signed in, then try again. |
| "Slopify could not hand the whole prompt to the CLI, so it cannot tell what the CLI worked on (it may already have used your quota)." | Use **Try again**. This is not retried automatically, so you choose whether to spend the quota again. |
| "No Codex model is chosen for images." | Choose a model (or Codex default) under **Images by** in **Edit settings** → **Images**, then try again. |
| "Slopify could not get the model list from the *CLI* CLI." | Check the CLI is installed and signed in (Settings → Keys & services), refresh the list, or type an exact model ID. |
| A CLI shows as not installed in Settings | Install the CLI so it is on your `PATH`, or, in Docker, rerun the Docker install after installing or moving a CLI so the host helper finds it. Then press **Check every service** on Settings → **Keys & services**, or **Check again** on its row. |
| "The Antigravity CLI tried to use a tool Slopify does not allow (it said: …), so it gave no answer." | Headless `agy` refuses page reading, the browser and commands, and then ends its turn with no text. Press **Try again**. If it keeps happening, choose another model or writing service under **Written by** in **Edit settings** → **Article**. |
| "The Antigravity CLI answered with no text." | Press **Try again**. If it keeps happening, run `agy` in a terminal to check it works, or choose another model under **Written by** in **Edit settings** → **Article**. |
| "The Antigravity CLI is busy: Google's capacity for this model is used for the moment…" | Nothing to do: Slopify tries again by itself shortly. If it keeps happening, run fewer projects at once or choose another model under **Written by** in **Edit settings** → **Article**. |
| "The Antigravity CLI is not signed in…" | Run `agy` in a terminal, sign in with your Google account, then press **Try again**. |
| A run stops with "The chosen model is not available…" after the move from Gemini CLI | The old Gemini CLI model ids (for example `gemini-2.5-pro`) are not in the Antigravity CLI list. Run `agy models` and pick a model under **Written by** in **Edit settings** → **Article**. |

See [AI CLIs](AI-CLIs).

## Refusals, models and timeouts

| Message (or part of it) | Fix |
| --- | --- |
| "*Service* refused to make this image under its content rules" | Press **Soften and retry**, or reword the image prompt in **Edit settings** → **Images**, or choose another image service. |
| A content filter refused a text prompt | Press **Edit the prompt** and reword the prompt in **Edit settings**, in the section of the step that failed. |
| "The chosen model may not exist or not be available to your account" / "The model for ... is no longer offered." | Press **Switch model**, pick another model in **Edit settings** (under **Written by**, **Read by** or **Images by**), save, try again. See [Models](Models). |
| "The … did not answer within … seconds. It may be overloaded" (the AI model, the voice service, the image service or the image-to-video model) | Wait a few minutes, then **Try again**, or choose another model. Slopify already retried several times before showing this. |
| "*Service* sent back something that is not a PNG or JPEG image" | Use **Try again**; if it keeps happening, choose another image model. |
| "Check that voice ... still exists in Settings → Voices and that each narration part fits the model's length limit" | The voice was removed, or a chunk is too long for the model. Pick a saved voice, or split the narration into smaller parts (**Split the narration by** in **Edit settings** → **Narration**). |
| An animated image failed ("choose another image-to-video model under Animate images …") | Try again, or pick another model under **Animate images** (**Edit settings** → **Video and style** → **Look**). The image stays still meanwhile, and the Video part says so in its notes. |
| Rate limit messages (429) | Nothing to do: Slopify waits and tries again by itself. |

## ffmpeg, captions and making the video

Slopify ships its own ffmpeg; you do not need to install one. In Docker it is inside the image.

| Message (or part of it) | Fix |
| --- | --- |
| "Slopify can't find ffmpeg ... its bundled copy is missing for this computer." | Reinstall Slopify, or set `SLOPIFY_FFMPEG` to the path of an ffmpeg program. On first start Slopify also tries to download the same build into `<data-dir>/bin/`; if that fails, check your connection and your antivirus quarantine. |
| "Slopify could not start ffmpeg ..." | Reinstall Slopify. If you set `SLOPIFY_FFMPEG`, check it points to a working ffmpeg. |
| "The audio/video export failed (ffmpeg exited with code ...)" | Open **Error details**: it quotes what ffmpeg could not do, for example an input file it could not open. Replace that file (an uploaded image or clip in **Edit settings** → **Images**), or try again. |
| "Slopify couldn't measure the loudness of the narration" | Try again. If it happens again, turn off **Level the volume** in **Edit settings** → **Video and style** → **Sound polish**, then download diagnostics and report it. |
| "The style preview couldn't render ... Press Make the preview again." | Press **Make the preview again**. If it fails again, download diagnostics and report it. |
| "The free subtitle model could not be downloaded" / "download … was interrupted" / "failed download verification" | The caption timing model (378 MB by default, the size chosen in Settings → Production defaults → **Caption timing model**) downloads on first use. Check your connection, then **Continue** the run, or pick a smaller model there. `SLOPIFY_NO_MODEL_PREFETCH` only skips the download at start; captions still need it. |
| "Captions can't be edited until the current narration has finished and its caption timing is ready." | Let the narration and its caption timing finish, then edit the captions. |
| "The saved caption timing doesn't match the current narration." | Do what the message says: press **Make the video again** in the project's Video part, which times the captions again, then edit the captions. |
| **Passages left out of the captions** under the video | Some passages could not be matched to the audio, so the captions skip them. The audio is fine. Press a passage's time to hear it, and look them over before sharing. |

With **Language** set to one without word timing, captions and cuts work differently; see [Other Languages](Other-Languages).

## Starting Slopify

| Message | Fix |
| --- | --- |
| "Port 6969 is already in use by another program (maybe another Slopify)." | Stop that program, or start on another port: `npx @gentbajko/slopify --port 7070`. |
| "Slopify is not allowed to use port ... (ports below 1024 need administrator rights)" | Use a port above 1024 with `--port`. |
| "Slopify can't listen on ... because that address doesn't belong to this machine." | Leave out `--host` (and `SLOPIFY_HOST`) to use `127.0.0.1`. |
| "Slopify can't write to its data folder ..." | Make sure your user owns the folder, or choose another with `--data-dir`. |
| "The disk is full ... Free up some space and start Slopify again." | Free disk space. |
| npm refuses to install because of the Node version | Slopify needs Node 26 or newer. |

See [Install](Install) for the command-line options.

## In the browser

| Message | Fix |
| --- | --- |
| "Slopify isn't responding. …" | Slopify stopped, is restarting or is being updated. The message names the fix for your install: for a normal install, wait a moment or start it again with `npx @gentbajko/slopify`; in Docker, check that its container is running (Docker Desktop, or `docker ps`) and start it. Then reload. |
| "Slopify hit an unexpected error (*code*). Reload the page and try again." | Reload. If it keeps happening, download diagnostics and report it. |
| "The project could not be loaded." | Reload, or go back to Projects. |
| "The upload stopped before the file finished copying. Choose the file again." | Pick the file again and wait for "Waiting for uploads to finish…" to clear before saving. |
| "A newer version is available. Your unsaved changes are kept below and in this browser." | The project was saved elsewhere (another tab, or something made again). Press **Reload latest and re-apply my edit** to lay your changes over the newer version, check them and press **Save changes**; **Copy my edit** puts your changes on the clipboard first. |

## Disk space

| Symptom | Fix |
| --- | --- |
| A step fails with "The disk is full, so ... stopped." | Press **Free space**; Settings → **Backup & storage** shows each project's size. Delete projects you do not need (they go to the [Trash](Trash); **Delete now** frees the space at once), or use **Keep outputs only** on finished projects. Then try again. |
| You want space back from a finished project | On its page, **Edit settings** → **Versions** → **Free space** → **Free …**. See [Project Page](Project-Page#free-space). |
| **Versions** or **All files** shows "File missing" | That file was removed from disk (for example by **Keep outputs only**, or by hand). Make it again to get it back. |

See [Where Your Files Live](Where-Your-Files-Live).

## Docker and native differences

| Topic | Native install | Docker |
| --- | --- | --- |
| Where it runs | Any system with Node 26 or newer | The installer is Linux only; Docker Desktop and remote Docker daemons are refused, and the installer must not be run with sudo |
| Project files | `Documents/Slopify` for new installs (Settings → **Backup & storage** → **Your files**); the database, settings and keys stay in the hidden data folder (`~/.slopify` by default, `--data-dir`) | `<Documents>/Slopify/Projects` on the host for new installs (`~/Slopify/Projects` on one from before 3.0); the database and keys stay in the `slopify-data` volume |
| AI CLIs | Run directly with your logins | Run on the host through a small helper, `slopify-cli-bridge.service`, with your existing logins. Check it with `systemctl --user status slopify-cli-bridge.service`. Without it, Settings shows the CLIs as unavailable. |
| **Open folder** | Opens your file manager | Opens it through the host helper; without the helper you get the path to copy, and "run the Docker launcher again ... so it sets up the host helper" |
| Start at login | Settings → General → **Start Slopify when I log in** | Slopify starts whenever Docker does; Settings only shows Docker's own setting (with Docker Desktop, its **Start Docker Desktop when you sign in**) |
| Updating | **Help → Check for updates** at the foot of the rail, or `npx @gentbajko/slopify@latest update` while Slopify is running | `npx @gentbajko/slopify@latest update` from the terminal. It keeps a recovery copy of your data in a Docker volume and puts the previous version back if the new one does not start. |

If an install or update fails, the message names what failed and, in Docker, the volume that holds the recovery copy of your data. Do not delete that volume; fix the problem and run the same command again. See [Docker](Docker) and [Updating and Patch Notes](Updating-and-Patch-Notes).

## A run seems stuck

| What you see | What it means |
| --- | --- |
| **Queued** | Other videos in the queue go first. Home's **Running** → **Waiting to start** and the Calendar's **Batch queue** show the order. |
| **Waiting for limits** / "Waiting for Codex limits (resets at 14:00)" | A CLI plan is used up; the run waits and carries on after the reset time shown. |
| **Waiting to try again** | A rate limit or timeout; it retries at the time shown. |
| **Waiting for your review** | A pause is holding the run. Press **Approve and make the …**. See [Pauses and Checks](Reviews-and-Checkpoints). |
| **Waiting for the agent** | An AI check set to **External agent (MCP)** waits for your agent. Check the agent's routine is running; with no answer, the review passes by itself after 2 hours. See [Agents (MCP)](Agents-MCP). |
| **Waiting for its day** | Its schedule made it ahead; the video is made on its day. |
| A step says **taking longer than usual** | It has run longer than the same step usually takes in your finished runs. It is still going; open **Progress** to see whether text or images are still arriving. |
| **Paused** | Press **Continue the run**. |
| **Stopped** | The run was interrupted (for example by a restart). Press **Continue the run**. |
| A step is failed with "interrupted" | Slopify stopped while it ran. Press **Try ... again**. |

## Tips

- Open **Progress** on a running project to watch text, narration and images arrive; it shows whether anything is still happening.
- Keep Slopify on `127.0.0.1`. There is no login, so anyone who reaches the port controls the app and its keys.

## Related pages

- [Recovery and Retries](Recovery-and-Retries)
- [FAQ](FAQ)
- [Keys and Services](Providers-and-Keys)
- [AI CLIs](AI-CLIs)
- [Docker](Docker)
- [Install](Install)
- [Where Your Files Live](Where-Your-Files-Live)
