import type { HelpEntry } from "../entry.js";

// Settings, Home and the first-run screen.
export const settingsHelp = {
  // Settings page
  "settings.diagnostics": {
    title: "Download diagnostics",
    body: "Saves slopify-diagnostics.json: the Slopify version, your system and Node version, which services are set up or found, the project count and the state of the model list. It never holds your keys, prompts or project content. Attach it to a bug report so the problem can be found faster.",
    tutorial: { page: "Troubleshooting", anchor: "download-diagnostics" },
  },

  // General
  "settings.remote-access": {
    title: "Open on my other devices (Tailscale)",
    body: "Tailscale on this computer serves Slopify's page at an https address only devices in your tailnet can open. It uses Serve, never Funnel, so it is never on the public internet: Slopify has no login and holds your keys. Slopify removes the address when it stops and adds it back when it starts, and changes only the serve setting it added. Agents still connect only here. Default: off.",
    tutorial: { page: "Remote-Access", anchor: "turn-it-on" },
  },

  // Providers
  "settings.provider.openrouter": {
    title: "OpenRouter",
    body: "Writes the text (research, script, article, titles, descriptions) with hundreds of models from many companies through one key. Each call is charged per token from the credit you buy on OpenRouter; prices follow the model list. Choose it when you want a model the command-line tools do not offer.",
    tutorial: { page: "Providers-and-Keys", anchor: "openrouter" },
  },
  "settings.provider.claude-code": {
    title: "Claude Code CLI",
    body: "Writes the text with the Claude Code command-line tool on this computer, using your own Claude sign-in, so no API key is needed and calls count toward your Claude plan's limits instead of costing per call. Sign in first by running claude auth login in a terminal. Slopify runs up to 3 calls at once.",
    tutorial: { page: "AI-CLIs", anchor: "set-up-a-cli" },
  },
  "settings.provider.codex": {
    title: "Codex CLI",
    body: "Writes the text with the Codex command-line tool on this computer, using your own ChatGPT sign-in, so no API key is needed and calls count toward your plan's limits instead of costing per call. Sign in first by running codex login in a terminal. Slopify runs up to 3 calls at once.",
    tutorial: { page: "AI-CLIs", anchor: "set-up-a-cli" },
  },
  "settings.provider.gemini": {
    title: "Antigravity CLI",
    body: "Writes the text with Google's Antigravity command-line tool (agy), which replaced the Gemini CLI, using your own Google sign-in, so no API key is needed. Install it from antigravity.google, then run agy in a terminal once to sign in. It researches with web search and can look at pictures, but never opens web pages or runs commands. Slopify runs up to 3 calls at once.",
    tutorial: { page: "AI-CLIs", anchor: "set-up-a-cli" },
  },
  "settings.provider.codex-image": {
    title: "Codex CLI images",
    body: "Draws the images with the Codex command-line tool, using your ChatGPT sign-in instead of an API key, so images count toward your plan's limits rather than costing per image. It shares its executable path and sign-in with Codex text. Slopify draws up to 4 images at once.",
    tutorial: { page: "AI-CLIs", anchor: "codex-images" },
  },
  "settings.provider.elevenlabs": {
    title: "ElevenLabs",
    body: "Narrates the script with ElevenLabs voices, including voices you added to your ElevenLabs account. It is billed in characters of narration from your ElevenLabs plan. A restricted key needs Text to Speech and Models read access.",
    tutorial: { page: "Providers-and-Keys", anchor: "elevenlabs" },
  },
  "settings.provider.openai-tts": {
    title: "OpenAI speech",
    body: "Narrates the script with OpenAI's text-to-speech voices. It is billed per character or per audio minute, depending on the model, from prepaid credit on your OpenAI platform account; new accounts need at least $5 of credit before any call works.",
    tutorial: { page: "Providers-and-Keys", anchor: "openai-speech" },
  },
  "settings.provider.cartesia": {
    title: "Cartesia",
    body: "Narrates the script with Cartesia voices, billed in characters from your Cartesia plan. The free plan needs no card, so it is an easy way to try narration.",
    tutorial: { page: "Providers-and-Keys", anchor: "cartesia" },
  },
  "settings.provider.inworld": {
    title: "Inworld",
    body: "Narrates the script with Inworld voices, billed per character from your Inworld account. Paste the Base64 credentials of a Standard key exactly as shown; Realtime-only keys do not work.",
    tutorial: { page: "Providers-and-Keys", anchor: "inworld" },
  },
  "settings.provider.system-voice": {
    title: "System voice",
    body: "Narrates with the speech your computer already has: macOS voices, Windows voices, or on Linux Piper, SVOX Pico or eSpeak NG. No key, no account and no charge, but it sounds robotic next to OpenAI, whose key narrates at once. On Linux, install espeak-ng if nothing is found. Its models are the speech programs Slopify found; add one of their voices in Settings → Voices.",
    tutorial: { page: "Providers-and-Keys", anchor: "the-system-voice" },
  },
  "settings.provider.google-tts": {
    title: "Google Gemini voices",
    body: "Narrates with Gemini's 30 prebuilt voices, billed to your Gemini API key per text and audio token. It uses the key saved for Google images unless you save one here. Two speakers' consecutive turns can go in one request (see Speakers on Create).",
    tutorial: { page: "Providers-and-Keys", anchor: "google-gemini-speech" },
  },
  "settings.provider.fal": {
    title: "fal.ai",
    body: "Draws the images and thumbnails with the image models fal.ai hosts, charged per image from prepaid credit. fal.ai locks the account when the balance runs out, so a run stops at the images step until you add credit.",
    tutorial: { page: "Providers-and-Keys", anchor: "falai" },
  },
  "settings.provider.replicate": {
    title: "Replicate",
    body: "Draws the images and thumbnails with the image models Replicate hosts, charged per image or per second of compute from credit you buy up front.",
    tutorial: { page: "Providers-and-Keys", anchor: "replicate" },
  },
  "settings.provider.openai-image": {
    title: "OpenAI images",
    body: "Draws the images and thumbnails with OpenAI's GPT Image models, charged per image from prepaid credit on your OpenAI platform account. GPT Image may also need Verify Organization on the OpenAI platform before it works.",
    tutorial: { page: "Providers-and-Keys", anchor: "openai-images" },
  },
  "settings.provider.google-image": {
    title: "Google images",
    body: "Draws the images and thumbnails with Google's Gemini image models, charged per image. Use a key made in Google AI Studio on a project with billing set up; Gemini image models are not on the free tier.",
    tutorial: { page: "Providers-and-Keys", anchor: "google" },
  },

  // Playback & appearance

  // Notifications
  "settings.notifications.url": {
    title: "Notification URL",
    body: "An address Slopify POSTs a short plain-text message to, with no tab open. For your phone, install the ntfy app, subscribe to a topic with a long random name, and paste https://ntfy.sh/that-topic. Any address that accepts a POST works. Each message is sent once, with a 5 second timeout. Leave it empty to turn it off.",
    tutorial: { page: "Notifications", anchor: "get-notifications-on-your-phone-notification-url" },
  },
  "settings.agents": {
    title: "Agents (MCP)",
    body: "An AI agent on this computer, such as Claude Code or Codex, can run Slopify through this address: start and fix runs, edit your prompts and templates, and answer reviews set to External agent. It needs no key, like this page, and never uploads to YouTube. What it changes is marked by agent in the project's history, in notifications and in the list below.",
    tutorial: { page: "Agents-MCP", anchor: "connect-an-agent" },
  },

  // YouTube Studio
  "settings.studio.extension": {
    title: "YouTube Studio extension",
    body: "Slopify never uploads or publishes. A finished project's Copy for YouTube Studio lists everything Studio asks for, with Copy buttons. The optional Slopify Studio browser extension fills Studio's upload dialog for you; you still press Publish. Install it below, then pair it with the token.",
    tutorial: { page: "Studio-Extension", anchor: "get-the-extension" },
  },

  "settings.files.new-folder": {
    title: "New folder",
    body: "The full path of the folder your files move to, on another disk or a synced folder for example. Slopify makes Projects and Backups inside it. It must be empty or not exist yet. The move needs as much free space there as your projects take now.",
    tutorial: { page: "Where-Your-Files-Live", anchor: "move-your-files-to-another-folder" },
  },
} as const satisfies Readonly<Record<string, HelpEntry>>;
