# AI agents can run Slopify (MCP)

- New Settings → Connections → Agents (MCP): connect Claude Code, Codex or another agent on this computer to `http://127.0.0.1:6969/mcp` with the shown setup line. No key; web pages from other addresses are refused.
- An agent can start, check and fix runs, answer reviews, edit the Library and plan schedules, with the same checks and costs as the buttons. It stops at Ready to upload and never publishes. What it changes shows "by agent" in history, notices and the Agents tab (latest 20 changes).
- Reviews can be set to External agent: the step waits for the agent ("Waiting for the agent"), the first verdict wins, and an unanswered review passes after 2 hours.
- The attend routine (prompt "attend") lets an agent work through what needs attention.
- Clearer states everywhere: Waiting for your review, Waiting for the agent, Prepared, Stopped (after a restart; Continue the run) and Kept as is. Projects has one Running filter matching Home's count.
- Notifications: a failed step is told right away only while something else waits; otherwise you get the end-of-run notice. Nothing repeats or goes missing after a restart. "While you were away" counts failed steps.
