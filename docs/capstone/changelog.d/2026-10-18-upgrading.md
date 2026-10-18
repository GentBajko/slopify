# Upgrading from 3.x: what works differently

- **Agents connect on this computer only.** `/mcp` and `/mcp/assistant` refuse every request that came through a proxy (Tailscale serve, Caddy, nginx and the like) with a 403. Point the agent at `http://127.0.0.1:<port>/mcp` on the computer Slopify runs on instead.
- **Your own proxy keeps working.** Slopify served by your own `tailscale serve` or behind a reverse proxy takes changes from its page as before: a change is accepted from the page at the very address the browser opened. Saving keys, a CLI's path, importing a backup, installing updates, Start with this computer, moving folders and clean-ups that delete files are done only on the computer itself, over any proxy. A proxy on a name other than a `ts.net` address needs that name in `SLOPIFY_ALLOWED_HOSTS`.
- **Prepare waits for Resume.** Prepare is refused for a paused schedule's runs, on the page and for agents (`prepare_topic`): resume the schedule first.
- **Automatic model checks on CLI plans.** Each week, and when a key or CLI is added, Slopify checks the models you use with one tiny call per model; on a CLI plan such as Claude Code or Codex that call uses the plan's allowance. Turn it off in Settings → Models → Automatic checks.
- **Refusals are titled.** A refused request (403) carries the title "Forbidden" in its answer, like every other status.
