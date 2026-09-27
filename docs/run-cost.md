# Run cost and CLI plan limits

## What a run cost

Every successful provider call is recorded against its project with what it used: tokens in
and out (and how many were cached) per model for text, characters for narration, images per
model with their aspect and effort, video seconds for animated clips, and the wall time of the
call. Stage times come from the stages themselves.

Each call is priced when it lands, from the same model catalogue (`assets/models.yaml`, or the
refreshed copy in the data folder) the estimate uses, and the rates it was priced at are
stored with it. A later catalogue change never rewrites a finished run. A model the catalogue
does not price, or a call whose provider reported no usage, is counted as unknown, never as
free. Per-minute voices are left unpriced rather than guessed from characters.

The project page's **Run cost** tab shows the total, then the cost, API equivalent, usage and
time per stage and per model. Data: `GET /api/projects/:id/run-cost`.

## CLI runs

Claude Code, Codex and Gemini calls are billed to the user's plan, so they cost $0 here. Beside
that, the same tokens are priced at the API price of the same model (Claude models as
Anthropic's, Codex models as OpenAI's, Gemini models as Google's, as the catalogue lists them
under OpenRouter). A model the catalogue does not list, the CLI's default model, and Codex
images have no API figure, and the tab says so.

The estimate before Start works the same way: a CLI step is "$0 on your plan · ~$X via API".

Plan windows, only as the CLIs report them:

- **Claude Code** writes a `rate_limit_event` in its stream-json output with the 5-hour and
  7-day utilization and reset times.
- **Codex** reports none in `codex exec --json`, so Slopify asks its app server
  (`account/rateLimits/read`, which starts no thread and spends nothing) before and after each
  call. Its percentages are whole numbers, so a short run can show "under 1%".
- **Gemini** reports none.

The tab says "This run used ~X% of your weekly Codex limit"; when a CLI reported nothing (for
example through the Docker host bridge) it says the share is not known.

## Living within plan limits

When a CLI says its plan allowance is used up (Claude Code's `usage limit reached|<time>`,
Codex's "You've hit your usage limit … try again at …", Gemini's daily quota), the call does
not fail. The reset time is stored per CLI, and every call to that CLI, from any project, waits
until two minutes after it; the project page's status line says "Waiting for Codex limits
(resets at 14:00)". Without a stated time it checks again every 30 minutes. Other providers are
not held up, and a waiting call holds no slot in the provider queue.

The wait survives a restart: a stage that was waiting when Slopify stopped is resumed at the
next start and waits on the stored reset again. A project paused or cancelled meanwhile is left
alone.
