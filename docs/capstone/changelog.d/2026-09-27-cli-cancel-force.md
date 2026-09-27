# Cancelling a CLI provider always stops it

- Stopping or pausing a step that runs Claude Code, Codex or Gemini CLI now force-stops the CLI after a one-second grace if it ignores the polite stop, instead of leaving it running in the background.
