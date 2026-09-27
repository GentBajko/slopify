# The tutorial and "What's new"

## What's new

After an update to a new major version, the first launch opens a short tour of what changed: a
drawer on the right with one step per feature and an **Open …** link to its screen. The drawer
does not block the page, so a link can be followed while the tour stays open. **Close tour**,
**Finish tour**, the close button or Esc record it as seen, and it does not come back on that
install until the next major version. A fresh install never sees it.

How an update is told from a fresh install (`packages/app/src/slices/settings/whats-new.ts`):

- The settings key `whats-new.seen-major` holds the newest major whose tour was closed. When it
  is set, the tour shows if the running major is newer.
- Before the first close, the `machine` row decides. It is written once, when the first-run
  notice is dismissed, with the version running then, and never updated. An install running
  since 2.x has a machine stamped 2.x, so 3.0 shows the tour; a fresh 3.x install has either no
  machine yet (the notice is still up) or one stamped 3.x, so it does not.
- A damaged value, or a version that is not `major.minor.patch`, shows nothing.

The key is state about this install, like `tutorial.session`, so backups leave it out.
`GET /api/whats-new` answers `{ show, major }`; `POST /api/whats-new/seen` records the close.
The steps live in `packages/web/src/whats-new/tour.tsx`, keyed by major: a major without an
entry shows nothing. Each step points at a route, not an element, so redesigning a screen does
not break it. The tour waits while the first-run notice or the interactive tutorial is open.
Its last step has **Read the full patch notes**, which opens this version's notes in Settings.

## Patch notes

Every release's notes are Markdown files in `docs/patch-notes/`, listed in
`docs/patch-notes/index.json` (`id`, `title`, `date`, and `version` for one release or `range`
for a stretch of them; the file is `<id>.md`). The build copies the folder to
`packages/app/dist/patch-notes/` (`packages/app/scripts/copy-assets.mjs`), so the notes ship
with the app and work offline. `GET /api/patch-notes` answers `{ version, current, due, notes }`
(newest first by date), `GET /api/patch-notes/:id` a note's Markdown, and
`POST /api/patch-notes/seen` records the close.

- **Settings → Patch notes** opens the newest notes in the reading view (contents, search,
  copy). Older versions are folded under **Earlier versions**; each opens on its own, and the
  page's `note` search parameter says which, so Back works.
- **Ctrl+K → Show patch notes** and **Settings → About → What's new in this version** open it
  too; the second opens the running version's notes (or the newest, when it has none).
- **After an update** the running version's notes open by themselves once, in a drawer
  (`packages/web/src/patch-notes/popup.tsx`). Only a version with a note of its own
  (`version` equal to the running version) opens anything. An update is told from a fresh
  install the same way as for the tour: the `patchNotes.seenVersion` setting once set, the
  `machine` row before that. The key never goes down and backups leave it out.
- **One popup at a time**: the notes wait for the first-run notice, the tutorial and the
  What's new tour. On a major update the tour stands in for them: closing it also records the
  notes as seen (`POST /api/whats-new/seen`), and its last step links to them.

Drafting a release's notes: `node scripts/patch-notes.mjs <version>` collects the user-facing
fragments in `docs/capstone/changelog.d/` that the previous `x.y.z` tag does not have into
`docs/patch-notes/<version>.md` and lists it in the index. Edit the draft before tagging.

## The interactive tutorial

The question-mark button in the top bar starts a walkthrough of a first project: provider keys
and a voice in Settings, an article and an image prompt in the Library editor, each part of
Play, then the project page. Steps highlight elements marked `data-tour="…"` and open their
screen by route (Settings sections and Play sections by id); `tutorial/model.test.ts` checks
those ids against Settings' and Play's own section lists. Progress is saved in the
`tutorial.session` setting, so it survives a reload.
