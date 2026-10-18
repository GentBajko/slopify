---
generated_at_commit: d6a72d6428ff
generated_date: 2026-10-18
capstone_version: 8.0.0
content_hash: 5d18e2b7a9c3
paths_covered:
  - ":(top)packages/web/src/assistant"
  - ":(top)packages/web/src/components/shell.tsx"
  - ":(top)packages/web/src/styles/shell.css"
  - ":(top)packages/app/src/slices/assistant/model.ts"
---

# In-app assistant

## Mode & job
Operate surface that is not a route: a chat panel on every screen, opened from the shell, running on the person's own Claude Code or Codex plan. It can only use Slopify's tools and guide, knows what screen is open, and waits for Allow or Don't before anything that costs money or removes something (`packages/web/src/assistant/panel.tsx:36-39`).

- Open and close: an "Assistant" quiet button with a sparkles icon in the rail (below the search field, above the navigation) and a matching "Assistant" `IconButton` at the right of the top bar; both toggle `aria-expanded` on one `assistantOpen` flag (`packages/web/src/components/shell.tsx:322-332`, `packages/web/src/components/shell.tsx:422-428`).
- Placement: the panel is a narrow `Drawer`, non-modal, so the page behind stays readable and operable; Escape or the close button returns to the page (`packages/web/src/assistant/panel.tsx:271-275`, `packages/web/src/components/kit/drawer.tsx:6-8`). At 1024 px and wider the shell adds `sl-app--side-panel`, which gives the main area a right padding of up to 440 px so the page sits beside the panel instead of under it; a Template Studio then drops its sample and checks column under the settings (`packages/web/src/components/shell.tsx:299`, `packages/web/src/styles/shell.css:664-683`).
- The panel mounts in the shell outside the routed screen, so the chat survives navigation (`packages/web/src/components/shell.tsx:466`).
- Screen context: each message carries the path, the project, schedule, channel or template ids in it, the section or tab, and up to 20 selected rows. Projects and Library → Templates report their ticked rows; the Template Studio reports its template and section (`packages/web/src/assistant/screen.tsx:71-110`, `packages/web/src/routes/projects.tsx:183-186`, `packages/web/src/routes/templates.tsx:87-90`, `packages/web/src/template-studio/page.tsx:51`). Anything that would fail the server's schema is left out and the path alone is sent (`packages/web/src/assistant/screen.tsx:108-109`).
- Data: `GET /api/assistant`, then `POST /api/assistant/sessions`, `/sessions/:id/messages`, `/sessions/:id/stop`, `/asks/:id` and `PUT /api/assistant/cli` (`packages/web/src/assistant/api.ts:31-98`). The answer streams in on the page's one live event connection (`assistant.delta`, `assistant.ask` and the rest) (`packages/web/src/assistant/panel.tsx:192-209`).

## Composition
| Region | What renders | Kit / tokens |
|---|---|---|
| Drawer | Title "Assistant", narrow width (`packages/web/src/assistant/panel.tsx:271-275`) | `Drawer` |
| Top row | `text-label text-ink-3` line "Runs on your <Claude Code or Codex> plan · only Slopify's tools and guide" ("Runs on your Claude Code or Codex plan" before one is chosen); a "Runs on" select (Auto, Claude Code, Codex); a quiet small "New chat" button (`packages/web/src/assistant/panel.tsx:167-171`, `packages/web/src/assistant/panel.tsx:319-342`) | `Field`, `Select`, `Button` |
| Chat | `ol` labelled "Chat" (`aria-live="polite"`) of lines: the person's messages right-aligned in a sunken bubble; the assistant's answers as Markdown (GFM) in the chat's own small type; "Used <tool>" lines with a wrench icon; ask cards; error lines (`packages/web/src/assistant/panel.tsx:105-165`, `packages/web/src/assistant/panel.tsx:357-387`) | plain markup, `react-markdown` |
| Ask card | A bordered box: "The assistant asks first", the question text, then primary Allow and secondary Don't while it waits; once answered, one of "Allowed", "Not allowed", "Allowed · done", "Expired: ask again so it can check the cost again" (`packages/web/src/assistant/panel.tsx:55-103`) | `Button` |
| Working line | While a turn runs: the text written so far and a running lamp with "Working…" (`packages/web/src/assistant/panel.tsx:377-385`) | `Lamp` |
| Footer | A two-row message field (4000 chars, placeholder "Ask about Slopify or your work") and primary Send, which becomes secondary Stop with a stop icon while a turn runs; Enter sends, Shift+Enter adds a line (`packages/web/src/assistant/panel.tsx:263-316`) | `Textarea`, `Button` |

## States
| State | Trigger | Rendered |
|---|---|---|
| Loading | chat query pending | `LoadingBlock` "Opening the chat…" (two rows) (`packages/web/src/assistant/panel.tsx:358-361`) |
| Empty chat | no session or no messages | "Ask how something in Slopify works, or ask it to do something on this screen. It asks you first before anything that costs money or removes something." (`packages/web/src/assistant/panel.tsx:362-367`) |
| Unavailable | no usable CLI: not installed, signed out, a Codex too old, or Slopify running in a container | waiting `Callout` "The assistant can't start" with the reason and, when there is one, a ButtonLink to Settings → Providers or to an Install tutorial page; the message field and Send are disabled (`packages/web/src/assistant/panel.tsx:43-53`, `packages/web/src/assistant/panel.tsx:343-351`, `packages/web/src/assistant/panel.tsx:257`, `packages/app/src/slices/assistant/model.ts:107-147`) |
| Chat unreadable | the query fails | danger `Callout` "The chat couldn't be read": "<message> Close the assistant and open it again." (`packages/web/src/assistant/panel.tsx:352-356`) |
| Running | a turn is in progress | Send is replaced by Stop; the field still takes text but Enter does nothing; New chat is disabled (`packages/web/src/assistant/panel.tsx:190`, `packages/web/src/assistant/panel.tsx:260`, `packages/web/src/assistant/panel.tsx:295-337`) |
| Stopped | the person pressed Stop | an error-role line in `text-ink-3` without an alert role (`packages/web/src/assistant/panel.tsx:148-159`) |
| Failure | send, stop, new chat, answer or CLI choice fails | one `role="alert"` line: "Your message wasn't sent: <reason>", "Stop didn't reach Slopify: <reason> Press Stop again.", "Couldn't start a new chat: <reason>", "Your answer wasn't saved: <reason>", "The choice wasn't saved: <reason>" (`packages/web/src/assistant/panel.tsx:222-253`, `packages/web/src/assistant/panel.tsx:388-392`) |
| Asked | a tool call needs approval | an ask card with Allow and Don't; both disabled while the answer is sent (`packages/web/src/assistant/panel.tsx:79-97`) |

## Motion
- The drawer uses the kit's slide; the page behind shifts by padding at 1024 px and wider when the panel opens. The chat scrolls its last line into view when a message or streamed text arrives (`packages/web/src/assistant/panel.tsx:211-215`). The Working line's lamp is the kit's running lamp.

## Copy
- Labels: "Assistant", "Runs on", "Auto", "Claude Code", "Codex", "New chat", "Send", "Stop", "Allow", "Don't", "Message" (screen reader only) (`packages/web/src/assistant/panel.tsx:284-341`).
- The ask states say what happened to the approval, including that an expired one must be asked again so the cost is checked again (`packages/web/src/assistant/panel.tsx:55-60`).
- Unavailable sentences come from the server and name the CLI and the command: for example `The assistant can't start: <CLI> is signed out. Run "claude auth login" in a terminal, then send your message again.` (`packages/app/src/slices/assistant/model.ts:122-138`).

## Not in play
- Chat history across chats: absent; "New chat" starts a fresh session and the panel shows one (`packages/web/src/assistant/panel.tsx:235-243`).
- Doing anything without asking when it spends, removes, marks a template ready or raises the budget: not possible; those wait on an ask card (`packages/web/src/assistant/panel.tsx:362-367`).
- Remote use: the assistant's tool endpoint answers only on the computer Slopify runs on (see 28-remote-access).
- Editing the page's fields directly: absent; it uses Slopify's tools, as an agent would (`packages/web/src/assistant/panel.tsx:36-39`).
- A keyboard shortcut or command-palette entry to open it: absent; only the two shell buttons open it (`packages/web/src/components/shell.tsx:322-332`, `packages/web/src/components/shell.tsx:422-428`).
- Selection from lists other than Projects and Library → Templates: absent (`packages/web/src/assistant/screen.tsx:120-129`).
