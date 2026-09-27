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

## The interactive tutorial

The question-mark button in the top bar starts a walkthrough of a first project: provider keys
and a voice in Settings, an article and an image prompt in the Library editor, each part of
Play, then the project page. Steps highlight elements marked `data-tour="…"` and open their
screen by route (Settings sections and Play sections by id); `tutorial/model.test.ts` checks
those ids against Settings' and Play's own section lists. Progress is saved in the
`tutorial.session` setting, so it survives a reload.
