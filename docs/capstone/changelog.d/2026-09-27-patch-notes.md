# Patch notes inside the app

- New Settings → Patch notes: the newest release's notes open in the reading view (contents, search, copy); older versions are folded under Earlier versions and each opens on its own. Also reachable from Ctrl+K (Show patch notes) and Settings → About (What's new in this version).
- After an update, the new version's notes open by themselves once, in a drawer. A fresh install does not see them, a version without notes of its own opens nothing, and closing them is remembered per install (`patchNotes.seenVersion`, left out of backups).
- On a major update the What's new tour shows instead; closing it also closes the notes, and its last step has Read the full patch notes. The two never show together.
- The notes are Markdown in `docs/patch-notes/` with an `index.json`, copied into the build and served by `GET /api/patch-notes` and `GET /api/patch-notes/:id`. `node scripts/patch-notes.mjs <version>` drafts a release's notes from the changelog fragments since the previous tag.
