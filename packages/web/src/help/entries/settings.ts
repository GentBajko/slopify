import type { HelpEntry } from "../entry.js";

// Settings, Home and the first-run screen.
export const settingsHelp = {
  // Settings page
  "settings.diagnostics": {
    title: "Download diagnostics",
    body: "Saves slopify-diagnostics.json: the Slopify version, your system and Node version, which providers are set up or found, the project count and the model catalogue's state. It never holds your keys, prompts or project content. Attach it to a bug report so the problem can be found faster.",
  },

  // General
  "settings.autostart": {
    title: "Start Slopify when you log in",
    body: "Slopify starts in the background when you log in to this computer, without opening a browser tab; open it from your bookmark. It uses your account's own start-up list, so no administrator password is needed, and turning it off removes exactly what it added. Default: off. In Docker, Slopify starts whenever Docker does, so this only shows Docker's own setting.",
  },

  // Providers
  "settings.providers.api-key": {
    title: "API key",
    body: "The key that lets Slopify call this provider on your account; the provider bills you for what it makes. It is stored on this computer only, sent only to that provider, and never put in a backup or export. Paste a new key and Save to replace the old one.",
  },
  "settings.providers.test-key": {
    title: "Test",
    body: "Asks the provider whether the saved key works, with the cheapest harmless call it allows, such as listing its models. Nothing is generated or billed. The answer says what is wrong when it fails: a rejected key, missing permission, no credit, or the provider being down.",
  },
  "settings.provider.openrouter": {
    title: "OpenRouter",
    body: "Writes the text (research, script, article, titles, descriptions) with hundreds of models from many companies through one key. Each call is charged per token from the credit you buy on OpenRouter; prices follow the model catalogue. Choose it when you want a model the command-line tools do not offer.",
  },
  "settings.provider.claude-code": {
    title: "Claude Code CLI",
    body: "Writes the text with the Claude Code command-line tool on this computer, using your own Claude sign-in, so no API key is needed and calls count toward your Claude plan's limits instead of costing per call. Sign in first by running claude auth login in a terminal. Slopify runs up to 3 calls at once.",
  },
  "settings.provider.codex": {
    title: "Codex CLI",
    body: "Writes the text with the Codex command-line tool on this computer, using your own ChatGPT sign-in, so no API key is needed and calls count toward your plan's limits instead of costing per call. Sign in first by running codex login in a terminal. Slopify runs up to 3 calls at once.",
  },
  "settings.provider.gemini": {
    title: "Gemini CLI",
    body: "Writes the text with the Gemini command-line tool on this computer, using your own Google sign-in, so no API key is needed. Sign in first by running gemini in a terminal and following its login steps. Slopify runs up to 3 calls at once.",
  },
  "settings.provider.codex-image": {
    title: "Codex CLI images",
    body: "Draws the images with the Codex command-line tool, using your ChatGPT sign-in instead of an API key, so images count toward your plan's limits rather than costing per image. It shares its executable path and sign-in with Codex text. Slopify draws up to 4 images at once.",
  },
  "settings.provider.elevenlabs": {
    title: "ElevenLabs",
    body: "Narrates the script with ElevenLabs voices, including voices you added to your ElevenLabs account. It is billed in characters of narration from your ElevenLabs plan. A restricted key needs Text to Speech and Models read access.",
  },
  "settings.provider.openai-tts": {
    title: "OpenAI speech",
    body: "Narrates the script with OpenAI's text-to-speech voices. It is billed per character or per audio minute, depending on the model, from prepaid credit on your OpenAI platform account; new accounts need at least $5 of credit before any call works.",
  },
  "settings.provider.cartesia": {
    title: "Cartesia",
    body: "Narrates the script with Cartesia voices, billed in characters from your Cartesia plan. The free plan needs no card, so it is an easy way to try narration.",
  },
  "settings.provider.inworld": {
    title: "Inworld",
    body: "Narrates the script with Inworld voices, billed per character from your Inworld account. Paste the Base64 credentials of a Standard key exactly as shown; Realtime-only keys do not work.",
  },
  "settings.provider.google-tts": {
    title: "Google Gemini voices",
    body: "Narrates with Gemini's 30 prebuilt voices, billed to your Gemini API key per text and audio token. It uses the key saved for Google images unless you save one here. Two speakers' consecutive turns can go in one request (see Speakers on Play).",
  },
  "settings.provider.fal": {
    title: "fal.ai",
    body: "Draws the images and thumbnails with the image models fal.ai hosts, charged per image from prepaid credit. fal.ai locks the account when the balance runs out, so a run stops at the images step until you add credit.",
  },
  "settings.provider.replicate": {
    title: "Replicate",
    body: "Draws the images and thumbnails with the image models Replicate hosts, charged per image or per second of compute from credit you buy up front.",
  },
  "settings.provider.openai-image": {
    title: "OpenAI images",
    body: "Draws the images and thumbnails with OpenAI's GPT Image models, charged per image from prepaid credit on your OpenAI platform account. GPT Image may also need Verify Organization on the OpenAI platform before it works.",
  },
  "settings.provider.google-image": {
    title: "Google images",
    body: "Draws the images and thumbnails with Google's Gemini image models, charged per image. Use a key made in Google AI Studio on a project with billing set up; Gemini image models are not on the free tier.",
  },
  "settings.cli.path": {
    title: "Executable path",
    body: "Where the command-line tool is on this computer. Leave it blank and Slopify finds it on PATH, the list of folders your terminal searches. Set an absolute path, without quotes or arguments, when the tool is installed somewhere else or you have more than one copy. Save checks the tool answers.",
  },
  "settings.cli.managed-on-host": {
    title: "Managed on host",
    body: "Slopify runs in Docker, so this tool runs on your computer outside the container, with the sign-in it already has there. Its path cannot be changed here. After you install, update or remove a command-line tool, run the Docker launcher again so Slopify sees the change.",
  },
  "settings.health": {
    title: "Health check",
    body: "Asks each command-line tool whether it is signed in, makes the cheapest harmless call each saved key allows (nothing is generated or billed), and checks that the models your templates, schedules, drafts and projects use are still offered. Run it after changing a key or when a run stops at a provider.",
  },

  // Models
  "settings.models.catalogue": {
    title: "Model catalogue",
    body: "The list of models, prices and retirements the pickers and cost estimates use. Slopify checks the published catalogue and OpenRouter's live list when it starts and once a day; Check now does it at once. New models appear and prices update; nothing you made changes. Your own edits to the local file are kept.",
  },
  "settings.models.replace": {
    title: "Replace with published file",
    body: "Overwrites the local catalogue file with the published one, dropping any edits you made to it. The previous file is saved beside it first, so you can copy your edits back. Use it when the local file is broken or you want the published list exactly.",
  },
  "settings.models.retired": {
    title: "Retired models in use",
    body: "Templates, schedules, drafts and projects with steps still to run that pick a model the provider no longer offers. A run that reaches one stops and says so. Switch replaces only that one model choice with the suggestion shown; Switch all does every one that has a suggestion.",
  },

  // Playback & appearance
  "settings.playback.silence-gap": {
    title: "Silence between segments",
    body: "Seconds of quiet between the intro and the narration, and between the narration and the outro, in every new video, unless Play sets a different gap for one video. It only matters when an intro or outro is set; 0 runs them together. Default: 3 seconds, from 0 to 30. Videos already started keep their own gap.",
  },
  "settings.loudness": {
    title: "Level the volume for new runs",
    body: "Whether a new run on Play (and a template or quick short) starts with Level the volume on, and at which volumes. On evens out every narration piece and sets the video to about -14 LUFS, the loudness YouTube plays at, and the audio files to -18 LUFS. A project keeps what it started with; change it there in Edit project. Default: on.",
  },
  "settings.appearance": {
    title: "Appearance",
    body: "Light or dark colours for Slopify on this computer. System follows your operating system's setting and changes with it. Default: System. It changes at once and does not affect your videos.",
  },

  // Notifications
  "settings.notifications": {
    title: "Notifications",
    body: "Slopify tells you when a run finishes, fails, or stops to wait for your review. The message holds the project title and what happened, never your keys. Browser notifications need a Slopify tab open; a Notification URL works with none open.",
  },
  "settings.notifications.browser": {
    title: "Browser notifications",
    body: "Shows a notification from this browser while any Slopify tab is open, even in the background. Turning it on asks the browser's permission. It applies to this browser only, so turn it on in each browser you use. Default: off.",
  },
  "settings.notifications.url": {
    title: "Notification URL",
    body: "An address Slopify POSTs a short plain-text message to, with no tab open. For your phone, install the ntfy app, subscribe to a topic with a long random name, and paste https://ntfy.sh/that-topic. Any address that accepts a POST works. Each message is sent once, with a 5 second timeout. Leave it empty to turn it off.",
  },

  // YouTube Studio
  "settings.studio.extension": {
    title: "Upload pack and extension",
    body: "Slopify never uploads or publishes. A finished project's Prepare upload lists everything Studio asks for, with Copy buttons. The optional Slopify Studio browser extension fills Studio's upload dialog from that pack; you still press Publish. Install steps are in docs/studio-extension.md in the Slopify repository.",
  },
  "settings.studio.playlist": {
    title: "Playlist",
    body: "The YouTube playlist every upload pack names, so the extension ticks it in Studio's dialog. Type it exactly as it is called in Studio, up to 150 characters. Leave it empty for no playlist. Default: empty.",
  },
  "settings.studio.pairing": {
    title: "Extension pairing token",
    body: "A secret the Slopify Studio extension needs before it may read your upload packs, so no other page can. Copy it into the extension's options and press Pair. New pairing token makes a fresh one and unpairs the extension until you paste the new token.",
  },

  // Backup & storage
  "settings.storage.export": {
    title: "Export and import",
    body: "Export everything saves every project with its files and history, your library, templates, schedules, Play drafts, fonts, settings and usage in one .tar file; never provider keys. Import adds to this install and replaces nothing: projects already here are skipped, taken names arrive as “(imported)” and schedules arrive paused. Running projects must finish or pause first.",
  },
  "settings.storage.clean": {
    title: "Clean orphan files",
    body: "Deletes files in the projects folder that no project records any more, and uploaded files that no draft, template or project uses. Your projects, outputs and library are never touched. Slopify also does this each time it starts; use it after a crash or to free space now.",
  },
  "settings.storage.disk": {
    title: "Disk space",
    body: "What Slopify stores on this computer: project files (outputs plus the working files they were made from), staged uploads, and deleted projects still in the trash. Deleted projects free their space when the trash removes them after 30 days, or when you choose Delete now.",
  },
  "settings.storage.keep-outputs": {
    title: "Keep outputs only",
    body: "On a finished project, deletes the working files it was made from (images, narration parts, subtitle timing, render settings) and keeps the video, shorts, thumbnail, article, description, document and your uploads. Changing the project later makes those files again first, which takes time and provider credits.",
  },
  "settings.sample.restore": {
    title: "Sample projects",
    body: "The finished examples that come with Slopify: a narrated video, an audiobook and a podcast, which you can look through without spending anything. Restore samples adds back any that were deleted and replaces the others with the originals. Your own copies of them are not touched.",
  },

  "settings.files": {
    title: "Your files",
    body: "Your projects, automatic backups and exports live here; new installs use Documents/Slopify. The database, settings, keys and logs stay in Slopify's hidden data folder. Moving copies every file, checks each copy by size and checksum, then switches, and keeps the old folder until you delete it. It takes as long as copying your projects and cannot start while a project is being made.",
  },
  "settings.files.docker": {
    title: "Your files",
    body: "Your projects and backups are in the folders Docker shares with this computer. The container cannot move its own folders, so run the command shown on the computer running Docker: the installer waits for running work, copies your projects, checks the copy and remounts the new folder.",
  },
  "settings.files.new-folder": {
    title: "New folder",
    body: "The full path of the folder your files move to, on another disk or a synced folder for example. Slopify makes Projects and Backups inside it. It must be empty or not exist yet. The move needs as much free space there as your projects take now.",
  },
  // Backups
  "settings.backups": {
    title: "Daily backup",
    body: "Once a day Slopify writes the file Export everything makes into the backup folder and deletes its own oldest backups beyond the number you keep. Nothing else there is touched. A backup waits while projects are being made; if Slopify was off at the time, it backs up a couple of minutes after it starts. Each backup can be many gigabytes.",
  },
  "settings.backups.auto": {
    title: "Back up automatically",
    body: "Turns the daily backup on or off. Default: off, because each backup holds every project's video and can fill a disk. Back up now works either way. Press Save after changing it.",
  },
  "settings.backups.time": {
    title: "Time of day",
    body: "When the daily backup runs, in this browser's time zone. Pick a time the computer is usually on and idle; a backup waits for running projects. Default: 03:00.",
  },
  "settings.backups.keep": {
    title: "Keep last",
    body: "How many of Slopify's own backups stay in the folder; after a new one is written, the oldest beyond this number are deleted. Each holds everything, so disk use grows with this number. Default: 5, from 1 to 30.",
  },
  "settings.backups.folder": {
    title: "Backup folder",
    body: "Where backups are written. Leave it empty to use the Backups folder beside your projects (Documents/Slopify/Backups on a new install), which moves with them. Point it at another disk or a synced folder to keep copies away from this disk. Slopify only ever deletes its own backup files there.",
  },

  // Trash
  "settings.trash": {
    title: "Trash",
    body: "Deleted projects, prompts, intros and outros, templates and schedules stay here for 30 days, then are removed for good along with a project's files. Restore puts one back; if its name was taken meanwhile it comes back renamed, and a schedule comes back paused. Delete now frees the space at once.",
  },

  // About
  "settings.patch-notes": {
    title: "Patch notes",
    body: "What changed in each version of Slopify. The newest notes are open here; older versions are folded under Earlier versions, and each opens when you pick it. They ship with the app, so they work offline. After an update, the new version's notes open by themselves once; a fresh install skips that. On a major update the What's new tour shows instead and links here.",
  },
  "settings.whats-new": {
    title: "What's new in this version",
    body: "Opens the patch notes for the version you are running, in Settings, Patch notes. When this version has no notes of its own, it opens the newest ones instead.",
  },
  "settings.updates": {
    title: "Updates",
    body: "The circular-arrows button at the top of every page checks for a newer Slopify and installs it. A dot on it means an update is ready. If a video is being made, the update waits until it finishes, and you can cancel it meanwhile. Slopify restarts itself and this page reconnects.",
  },

  // Home
  "home.channel": {
    title: "Channel",
    body: "Shows Home and the other screens for one channel, or for all of them. It only filters what you see: projects, schedules and costs of other channels keep running. Slopify remembers the choice in this browser.",
  },
  "home.needs-you": {
    title: "Needs you",
    body: "Runs held at a review before a step, topics a schedule suggested for you to accept or reject, and runs that failed with the fix to try. Nothing here moves on until you act; approving a review from here lets that run continue.",
  },
  "home.running": {
    title: "Running now",
    body: "Videos being made or paused, with the step each is on and how long it has taken. Up to 3 show here; Projects lists them all. Open one to follow it live, pause it or cancel it.",
  },
  "home.coming-up": {
    title: "Coming up",
    body: "The schedule runs due in the next 7 days, with the template and topic each will use. Paused schedules show too. Plan or move runs on the calendar.",
  },
  "home.ready": {
    title: "Ready to upload",
    body: "Finished videos you have not marked uploaded. Prepare upload lists everything YouTube Studio asks for, with Copy buttons; Slopify never uploads for you. Mark uploaded takes the video off this list; Projects still has it.",
  },
  "home.this-week": {
    title: "This week",
    body: "Videos made since Monday and what their provider calls cost. Calls billed to a command-line plan cost nothing per call, so the API figure says what they would have cost with API keys. The bars show how much of each plan's weekly limit is used, from the tool's last reading.",
  },

  // First run
  "welcome.samples": {
    title: "Samples",
    body: "Finished projects that come with Slopify: a narrated video, an audiobook and a podcast. They are read-only, so nothing you try on them costs anything; Make my own copy on a sample's page gives you one to edit.",
  },
  "welcome.found": {
    title: "Found on this computer",
    body: "Claude Code, Codex and Gemini CLI write the text with your own sign-in, so no API key is needed for it, and Codex also draws the images. The narration needs a voice key (OpenAI, ElevenLabs, Cartesia or Inworld) in Settings → Providers.",
  },
  "welcome.short": {
    title: "Make a 60-second short",
    body: "Slopify writes a script of about 150 words, narrates it, draws four vertical images and renders a captioned 9:16 short, usually in about five minutes with the command-line tools. The narration uses your voice provider's credit; text and images through a command-line tool count toward its plan.",
  },
  "welcome.topic": {
    title: "Topic",
    body: "What the short is about, in a few words or a question, up to 200 characters. Slopify researches and writes the script from it, so a specific topic gives a sharper short than a broad one.",
  },
  "welcome.pack": {
    title: "Style",
    body: "The starter pack whose prompts, voice and art direction the short uses. General is a neutral explainer style. Picking a pack does not add it to your library; use Add pack below for that.",
  },
  "welcome.packs": {
    title: "Starter packs",
    body: "Each pack adds prompts, a suggested voice and a Play template for one kind of channel, so you can pick the template on Play, type a topic and go. Adding a pack twice changes nothing, and it never replaces a prompt or template of yours with the same name.",
  },
} as const satisfies Readonly<Record<string, HelpEntry>>;
