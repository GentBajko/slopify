# Antigravity CLI replaces the Gemini CLI

- **The Gemini CLI text provider is now the Antigravity CLI (`agy`).** Google retired the Gemini CLI for personal accounts on 2026-06-18 and moved them to Antigravity. Settings → Providers shows **Antigravity CLI** where Gemini CLI was, and projects that chose it keep that choice. Install it with `curl -fsSL https://antigravity.google/cli/install.sh | bash`, then run `agy` once in a terminal to sign in with your Google account. The Antigravity desktop app is a different program and doesn't install `agy`, but `agy` uses the desktop app's sign-in.
- Slopify runs `agy` headless (`--input-format stream-json --output-format stream-json --disable-slash-commands`) in a private folder and never passes `--dangerously-skip-permissions`. Research notes go straight into the prompt.
- **Research searches the web** with Antigravity's `search_web`, which works without any permission. Headless `agy` refuses to open web pages, use the browser or run commands, so Slopify's instructions keep it to search results. Its sources are Google's search-redirect links, as they were with the Gemini CLI.
- **Picture reviews work.** The pictures are copied into the run's folder and the model opens each one. An answer that skipped a picture is not used. Through the Docker host helper, Antigravity still gets text only.
- **Signed in?** Check all now asks `agy models`, which lists models only when `agy` is signed in.
- The model list comes from `agy models`. With agy 1.3.6 that is Gemini 3.8 Flash (High, Medium, Low), Claude Sonnet 4.6, Claude Opus 4.6 and GPT-OSS 120B. A model saved for the old Gemini CLI, such as `gemini-2.5-pro`, isn't on that list: pick a new one in Edit project → Providers.
- Each error message names the fix:
  - A signed-out `agy` says to run `agy` and sign in.
  - An unknown model says to run `agy models` and pick one.
  - When Google's capacity for a model is briefly used up ("Resets in 0s", which happens when several calls run at once), Slopify tries again shortly.
  - A used-up allowance waits until it resets.
  - An answer that came back empty because `agy` tried a tool it may not use is reported, not saved as blank text.
  - A saved program path that still points at `gemini` says to clear it or point it at `agy` in Settings → Providers.
- In Docker, the host helper now looks for `agy` on the host's PATH, where it used to look for `gemini`.
