# FAQ

Short answers to the questions people ask most, with links to the pages that go deeper.

**Where to find it:** this page. For error messages, see [Troubleshooting](Troubleshooting).

## Cost and accounts

### Is Slopify free?

Yes. Slopify is free and open source. You pay the AI providers you choose (for text, narration and images) directly, on your own accounts. Rendering, captions, loudness, the Look, ambient sound, chapter cards and the style preview run on your computer and cost nothing.

### How much does one video cost?

It depends on the providers, models, length and number of images. Play shows an estimate before you start, with **Cost by stage** under it. After a run, the project's **Cost** section shows what each stage and model actually cost, retries and remakes included. See [Costs and Run Cost](Costs-and-Run-Cost).

### Can I use my Claude, ChatGPT (Codex) or Gemini subscription instead of API keys?

Yes, through the command-line tools you are already signed in to: Claude Code, Codex or Gemini CLI. Calls through them cost $0 on your plan; Slopify shows what the same work would cost through the API, for comparison only. When a plan's limit is used up, the run waits for the reset and carries on by itself. See [AI CLIs](AI-CLIs).

### Can I make a video without any API key?

Yes. Sign in to Claude Code, Codex or Gemini CLI for the text (Codex also draws the images), and the narration can use your computer's own voice, the **System voice**, for free. That is what the first 60-second short uses when no voice key is saved. It sounds robotic, so add a voice key when you want a better one. See [Your First Short](Your-First-Short) and [Providers and Keys](Providers-and-Keys#the-system-voice).

### How do I know a key works before I save it?

Paste it in Settings → **Providers** and press **Test**. Slopify checks the pasted key with the provider without storing it; press **Save** to keep it. See [Providers and Keys](Providers-and-Keys#test-a-key).

### Do I need an account or a login for Slopify?

No. There is no Slopify account and no login. That is also why Slopify listens only on `127.0.0.1` by default: anyone who can reach its port controls the app and its keys. Keep it that way.

## Privacy and your data

### Where are my API keys stored?

On your computer, in Slopify's hidden data folder (`~/.slopify` by default; in Docker, the `slopify-data` volume). Each key is sent only to its own provider, and keys are never put in a backup or an export. Diagnostics files never contain them either. See [Providers and Keys](Providers-and-Keys).

### Where are my projects?

In your files folder, `Documents/Slopify` for new installs, Docker included (Settings → **Backup & storage** → **Your files** shows it). An install from before 3.0 keeps its files where they were until you move them. See [Where Your Files Live](Where-Your-Files-Live).

### Does Slopify send anything about me?

Slopify sends anonymous counts to show the live totals on slopify.stream: tokens per stage with provider and model, audio seconds, images, thumbnails, videos, PDFs, YouTube descriptions, shorts, projects created, that the machine installed Slopify, and when each happened. Each event carries a random ID and a random machine ID. It never sends your API keys, prompts, keyword values, titles, article or research text, files or file names, or your operating system, locale or hardware. A notice explains this the first time you open Slopify.

What you write is sent only to the AI providers you pick, because they make the article, narration and images.

### Does it work offline?

Partly. The AI steps (article, research, narration, images, thumbnails, descriptions) call providers over the internet, or CLIs that do. Rendering the video, levelling the volume, captions, the style preview and the System voice run on your computer. Captions need a speech model of about 95 MB that is downloaded once, on first use. Patch notes ship with the app and open offline.

## Making and editing videos

### Can I change a video after it is made?

Yes. Open the project, press **Edit settings**, change what you want and press **Save changes**. Only the outputs the change affects turn outdated, and you remake them when you choose, after seeing the cost. See [Editing a Project](Editing-a-Project).

### Can I fix one image or one sentence without redoing everything?

Yes. In **Edit project → Images** you can edit one image's prompt, replace it with your own file or regenerate it; in **Edit project → Narration** you can edit or respeak one chunk. Only that piece and the video are made again.

### Where do I see what a run cost?

At the top of a finished project's page, one line sums it up ("This run cost …"), with **See cost by stage**. See [Costs and Run Cost](Costs-and-Run-Cost).

### Can I go back to an earlier version?

Yes. **History** on the project page lists every saved revision with its files. **Restore this revision** makes an old one current again, without losing anything saved after it.

### Can I use my own images, audio or video clips?

Yes. Stages can use a file you provide instead of generating one, and in Edit project you can replace any image, add your own picture or add a video clip that plays in an image's place. See [Editing a Project](Editing-a-Project#edit-images).

### What happens if I close the browser while a video is being made?

The run keeps going; it runs in Slopify on your computer, not in the browser tab. Open the project again to see where it is. You can also get a notification when it finishes; see [Notifications](Notifications).

### What happens if my computer restarts in the middle of a run?

Everything already made is kept. A step that was running shows as failed with "interrupted"; press **Try ... again**. Steps that were waiting for a rate limit or a CLI plan limit carry on by themselves. See [Recovery and Retries](Recovery-and-Retries).

### Why is my project "Done with problems"?

The main output was made, but another step failed, for example the thumbnail. The failed step shows its error and a button to fix it. See [Recovery and Retries](Recovery-and-Retries#done-with-problems).

### I deleted a project by mistake. Can I get it back?

Yes, within 30 days. Open Settings → **Trash** and press **Restore**. See [Trash](Trash).

### Are captions free?

Yes. Captions are timed from your narration on your computer, with no paid API. See [Video Editing](Video-Editing#subtitles).

### Can Slopify make videos in other languages?

Yes, with some differences in captions and cuts for languages without word timing. See [Other Languages](Other-Languages).

## Publishing

### Does Slopify upload to YouTube for me?

No. Slopify never uploads or publishes anything. **Prepare upload** lays out the file, title, description, thumbnail, playlist, audience, AI use and tags in the order YouTube Studio asks for them, each with a copy button. The optional Studio browser extension fills in the Studio form for you; you check it and press Publish yourself. **Mark uploaded** records that you did. See [Publishing to YouTube](Publishing-to-YouTube) and [Studio Extension](Studio-Extension).

### Does it make Shorts too?

Yes. It can pick moments from the long video (60 to 120 seconds by default, anywhere from 15 to 180) and make vertical shorts with new images, word-by-word captions and their own title and hashtags. See [Shorts](Shorts).

## Running Slopify

### What do I need to run it?

Node 26 or newer, then `npx @gentbajko/slopify@latest`. It opens at `http://127.0.0.1:6969`. On Linux you can run it in Docker instead. You do not need to install ffmpeg; Slopify ships its own. See [Install](Install) and [Docker](Docker).

### Can I use it from my phone or another computer?

Slopify is meant to be used on the computer it runs on. You can change the address with `--host`, but there is no login, so whoever reaches the port controls the app and its keys. Notifications can reach your phone. See [Notifications](Notifications).

### How do I update?

Press the circular-arrows button at the foot of the sidebar, or run `npx @gentbajko/slopify@latest update` while Slopify is running. It waits for running work, keeps a copy to go back to, and puts the previous version back if the new one does not start. See [Updating and Patch Notes](Updating-and-Patch-Notes).

### Something is broken. What should I send?

Open Settings and press **Download diagnostics**. The file lists your Slopify, system and Node versions and which providers are set up, never your keys, prompts or project content. Attach it to your bug report. See [Troubleshooting](Troubleshooting).

## Related pages

- [Troubleshooting](Troubleshooting)
- [Recovery and Retries](Recovery-and-Retries)
- [Providers and Keys](Providers-and-Keys)
- [Costs and Run Cost](Costs-and-Run-Cost)
- [Where Your Files Live](Where-Your-Files-Live)
- [Publishing to YouTube](Publishing-to-YouTube)
