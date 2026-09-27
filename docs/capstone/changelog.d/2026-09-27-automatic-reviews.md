# Automatic reviews

- A reviewer model checks the article, every image, the narration, the thumbnail and every short before the run moves on, and saves its verdict with the reasons beside the item on the project page.
- Per stage, on Play's Review step, in Edit project → Reviews and in templates: Off, Flag only, or Flag and redo. A redo goes through Re-run's path and is limited per item (2 by default, 0-5); after that the item is kept and flagged, never looped.
- Overrule accepts a flagged item as it is; Redo makes it again and reviews it again.
- Claude Code and Codex review pictures (Claude Code through its Read tool confined to a private folder, Codex through `--image`); the Gemini CLI and OpenRouter can review the article and the narration only, and Play says so when one is picked for pictures.
- Review prompts are a new Library kind, with built-in ones per stage. Reviews count in Usage and in the estimate.
- A review is its own recipe step, so it is cached and fingerprinted; with every review Off, projects plan exactly as before (database schema 25).
