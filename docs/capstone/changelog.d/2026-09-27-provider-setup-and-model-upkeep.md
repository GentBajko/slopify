# Key setup, provider health check, self-updating models and a no-key first run

- Settings → Providers: every key field has a step list (sign-up page, key page, billing, permissions, all on the provider's own site) and a **Test** button that makes the cheapest harmless authenticated call and says in plain words whether the key works and what to do if not.
- **Check all** checks every CLI (installed, up to date, signed in), every saved key, and that every chosen model is still offered, with a fix for each problem.
- The model catalogue checks itself at start and daily: new models appear, prices follow the published list and OpenRouter's live prices, and retired models are flagged instead of disappearing. Local edits are kept. **Check now** runs it by hand.
- Settings → Models lists every template, schedule, draft and unfinished project still using a retired model, with **Switch to <model>** per row and **Switch all**. Nothing is switched without a click.
- First launch finds Claude Code, Codex and Gemini CLI, picks them on Play and says "You can make a video now, no API keys needed". `GET /api/providers/first-run` exposes what was found.
