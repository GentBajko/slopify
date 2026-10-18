# Assistant

The assistant is a chat inside Slopify. Ask it how something works, or ask it to do something on the screen you have open: "Which templates do I have?", "Why did this run stop?", "Remake the thumbnail of this project". It runs on your own **Claude Code** or **Codex** sign-in, so it uses your plan's allowance and is not added to a project's run cost.

**Where to find it:** **Assistant** in the left rail, under the search field. On a phone it is the sparkle button in the top bar. It opens beside the page without moving it.

## What it can and can't do

- It uses only Slopify's own tools, the same ones an [agent](Agents-MCP) uses, with the same checks and refusals as the buttons in the page. It reads this guide to answer questions about Slopify.
- It has no web search, can't run commands and can't open files on your computer. None of your Claude Code or Codex settings, hooks, plugins, skills, memory or other MCP servers are loaded for it. If the CLI ever offers it a tool from outside Slopify, Slopify stops the answer at once and says so.
- It never answers an external review, exports or imports the Library, uploads a file from disk, empties the Trash or deletes old versions. Uploading to YouTube, backups, provider keys and updates stay yours.
- What it changes shows as **by assistant** in a project's history, in notifications and in **Settings → Connections → Agents (MCP)**.

## It asks first

Anything that costs money (starting a run or a remake, retrying a step, generating topics, a cast picture or a voice sample), anything a button would confirm, anything that removes something, and anything that sends to or changes an address outside Slopify (where notifications go, a test notification) waits for you. The chat shows a card with what it wants to do, for which project, and what it costs: the estimate the remake preview or Play's review showed, or "Slopify can't price it here" when there is none.

| Press | What happens |
| --- | --- |
| **Allow** | The assistant does that one thing, with exactly what it asked for, and tells you what happened. An Allow is used once and only in that chat. |
| **Don't** | Nothing runs. The assistant sees your answer the next time you write. |

An ask you don't answer within 15 minutes expires: ask again, so it can check the cost again. The assistant can't press Allow for you; only a press in the page counts.

## Using the chat

- **Send** (or Enter) sends your message; Shift+Enter starts a new line. The answer streams in as it is written, with a line for each tool it used.
- **Stop** ends the answer at once. Whatever it already did stays done. An answer that takes longer than 10 minutes is stopped for you.
- **New chat** starts over. Each chat keeps its last 200 messages; the assistant remembers the last 20 of them (up to about 24,000 characters) when it answers.
- **Runs on** picks the CLI: **Auto** takes Claude Code when it is installed and signed in, otherwise Codex.
- It knows the page you have open: the project, schedule, channel or template on it, the section, and the rows you selected in a list.

## When it can't start

The panel says why and links to the fix:

| Message | Fix |
| --- | --- |
| Neither Claude Code nor Codex is ready | Install one and sign in, then check it in **Settings → Providers** ([AI CLIs](AI-CLIs)). |
| Claude Code (or Codex) is signed out | Run `claude auth login` (or `codex login`) in a terminal, then send your message again. |
| Codex is too old | Update Codex CLI to the version the message names. |
| The Docker version | The assistant isn't available in Docker: there the CLIs run on your computer through the host helper, which can't hand them Slopify's tools safely. Install Slopify with npm ([Install](Install)) to use it. |
