# Run cost, CLI usage and plan limits

- New Run cost tab on every project: what the run actually cost, per stage and per model, priced from the model catalogue when each call finished, with tokens in and out (and cached), narration characters, images, video seconds and time per stage.
- CLI runs are counted too: Claude Code, Codex and Gemini calls show $0 on your plan with what the same tokens would cost through the API, and how much of the 5-hour and weekly limit the run used when the CLI reports it (Claude Code and Codex do).
- The estimate before Start prices CLI steps the same way: "$0 on your plan · ~$X via API", instead of an unknown charge.
- When a CLI's plan limit runs out, the step waits instead of failing: the project says "Waiting for Codex limits (resets at 14:00)" and carries on by itself after the reset, also after a restart. Other providers keep working.
- Claude Code's tokens in now include the prompt it read from or wrote to its cache, so the Usage page counts every input token.
