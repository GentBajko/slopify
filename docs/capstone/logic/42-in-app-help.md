---
scenario: in-app-help
screens:
- 11-first-run-tutorial
- 20-settings-sections
- 21-help-tutorials
- 22-command-palette
- 23-announcements
depends_on:
- 14-storage-and-downloads
- 16-telemetry
- 21-app-updater
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: 10991e04309d
paths_covered:
  - ":(top)packages/app/src/slices/tutorials/**"
  - ":(top)packages/app/src/slices/patch-notes/**"
  - ":(top)packages/app/src/slices/settings/whats-new.ts"
  - ":(top)packages/app/src/slices/telemetry/machine.ts"
  - ":(top)packages/app/src/slices/storage/portable.ts"
  - ":(top)packages/app/src/edge/http/tutorials.ts"
  - ":(top)packages/app/src/edge/http/whats-new.ts"
  - ":(top)packages/app/src/edge/http/patch-notes.ts"
  - ":(top)packages/app/src/edge/http/app.ts"
  - ":(top)packages/app/scripts/copy-assets.mjs"
  - ":(top)packages/web/src/tutorials/**"
  - ":(top)packages/web/src/help/catalog.ts"
  - ":(top)packages/web/src/help/entry.ts"
  - ":(top)packages/web/src/components/kit/info-tip.tsx"
  - ":(top)packages/web/src/routes/tutorials.tsx"
  - ":(top)packages/web/src/router.tsx"
  - ":(top)packages/web/src/whats-new/**"
  - ":(top)packages/web/src/patch-notes/**"
  - ":(top)packages/web/src/components/shell.tsx"
---

# In-app help: tutorials, info tips, What's new tour and patch notes

Four read-mostly help surfaces ship inside the release: Help → Tutorials (the GitHub wiki's pages with search), per-control info tips that link into them, a once-per-major "What's new" tour, and patch notes that open by themselves once after an update. The spotlight (interactive) tutorial is a separate surface: see `uiux/screens/11-first-run-tutorial.md` and `22-play-drafts.md`.

## Trigger & preconditions

- Tutorials: the book icon "Tutorials" in the shell (`packages/web/src/components/shell.tsx:128-142`), Ctrl+K "Open tutorials" (`packages/web/src/components/shell.tsx:261-269`), one search-only palette command "Open tutorial: <title>" per page (`packages/web/src/tutorials/commands.tsx:10-35`, mounted `packages/web/src/components/shell.tsx:366`), an info tip's Learn more link (`packages/web/src/components/kit/info-tip.tsx:57-84`), or the address `/help`, `/help/tutorials` (both redirect to `/help/tutorials/Home`) and `/help/tutorials/$page[#anchor][?q=]` (`packages/web/src/router.tsx:368-397`).
- The build must carry the pages: `scripts/copy-assets.mjs` copies `docs/wiki/` to `dist/tutorials/` and `docs/patch-notes/` to `dist/patch-notes/` (`packages/app/scripts/copy-assets.mjs:14-24`). At runtime the server looks for `dist/tutorials/Home.md`, then the repository's `docs/wiki/Home.md` (source runs, tests) (`packages/app/src/slices/tutorials/library.ts:47-52`); patch notes look for `index.json` the same way (`packages/app/src/slices/patch-notes/library.ts:30-35`). `AppDeps.tutorialsDir` / `patchNotesDir` override both (`packages/app/src/edge/http/app.ts:138-141`).
- What's new tour and patch-notes popup: both are mounted in the shell on every route (`packages/web/src/components/shell.tsx:518-519`) and query the server only after the first-run usage-stats notice reports `seen` (`packages/web/src/whats-new/tour.tsx:145-147`, `packages/web/src/patch-notes/popup.tsx:24-36`). "Update vs. fresh install" relies on the telemetry `machine` row, written once when that notice is dismissed with the running `appVersion` (`packages/app/src/slices/telemetry/machine.ts:17-36`; see `16-telemetry.md`).
- Settings → Patch notes and Ctrl+K "Show patch notes" (`packages/web/src/patch-notes/popup.tsx:84-96`) open the full list at any time.
- No authentication; every route is local (`packages/app/src/edge/http/app.ts:217-220`).

## Steps

### Tutorials

1. **Load once.** The first request calls `loadTutorials(dir)`: read the folder, keep every `<id>.md` whose id matches `^[A-Za-z0-9][A-Za-z0-9-]{0,79}$` (so `_Sidebar.md` and `_Footer.md` are not pages), require `Home`; the resulting book is memoised as one promise for the process lifetime (`packages/app/src/edge/http/tutorials.ts:22-31`, `packages/app/src/slices/tutorials/library.ts:83-103`, `packages/app/src/slices/tutorials/anchors.ts:6`).
2. **Index.** `_Sidebar.md` is parsed: a `**Group**` line opens a group; each `[Title](Page-Name)` link with a valid id before any group is the home page (first wins), after one it is a group page; empty groups are dropped (`packages/app/src/slices/tutorials/library.ts:58-80`). Sidebar pages that have no file are removed; the home defaults to `{id:"Home", title:"Home"}`; `pages` = home, then grouped pages in sidebar order, then any file the sidebar omits, titled by replacing `-` with spaces; `footer` = trimmed `_Footer.md` or `""` (`packages/app/src/slices/tutorials/library.ts:104-127`, `packages/app/src/slices/tutorials/anchors.ts:67-70`). `GET /api/tutorials` returns this index (`packages/app/src/edge/http/tutorials.ts:33-39`).
3. **Page.** `GET /api/tutorials/:page` validates the id pattern and returns the raw Markdown as `text/markdown; charset=utf-8` (`packages/app/src/edge/http/tutorials.ts:48-62`). The web client caches index, pages and searches with `staleTime: Infinity` (`packages/web/src/tutorials/api.ts:12-40`).
4. **Render.** The page's own leading `# Title` is split off and shown as the page header; the header meta is the page's sidebar group or "Guides to every screen of Slopify, for the version you are running."; wiki links `](Page)`, `](Page#anchor)`, `](#anchor)` to pages this version has become `/help/tutorials/<Page>#<anchor>`, others are left untouched (`packages/web/src/routes/tutorials.tsx:58-68`, `packages/web/src/routes/tutorials.tsx:109-125`, `packages/web/src/tutorials/links.ts:14-38`). A click on an in-app tutorial link navigates inside the app; an `http(s):` link opens a new tab with `noopener,noreferrer` (`packages/web/src/routes/tutorials.tsx:86-105`). The footer is printed with its links flattened to text (`packages/web/src/routes/tutorials.tsx:169-173`).
5. **Scroll to section.** After render the heading whose GitHub anchor equals the URL hash is scrolled into view, counting the split-off title first as GitHub does; no match or no hash scrolls to the top (`packages/web/src/routes/tutorials.tsx:71-81`, `packages/web/src/tutorials/links.ts:57-74`). Anchors: heading text with link targets, code ticks, emphasis and HTML dropped, lower-cased, characters other than letters/numbers/marks/space/`_`/`-` removed, spaces → `-`, repeats suffixed `-1`, `-2`; `#` lines inside fenced code are ignored (`packages/app/src/slices/tutorials/anchors.ts:9-60`).
6. **Search.** The nav search box debounces 200 ms, then `GET /api/tutorials/search?q=` (query cut to 200 chars) (`packages/web/src/routes/tutorials.tsx:196-201`, `packages/app/src/edge/http/tutorials.ts:40-47`). `searchTutorials`: lower-case, split on whitespace, first 8 terms; each page is cut into sections (text above the first heading, then one per heading) with Markdown reduced to plain words (`packages/app/src/slices/tutorials/library.ts:131-162`, `packages/app/src/slices/tutorials/library.ts:179-186`). A section is a hit only when every term is in its heading, its text or the page title, and at least one term is in its own heading or text. Score per term: heading +6, page title +3, text +1; +10 when the heading equals the whole query; order by score desc, then page/section order; at most 30 hits (`packages/app/src/slices/tutorials/library.ts:187-232`). Snippet: ~60 chars before and ~120 after the first matching term, trimmed to whole words with `…`; no match → first 177 chars + `…` when over 180 (`packages/app/src/slices/tutorials/library.ts:164-174`).
7. **Open a hit.** Enter opens the first hit; a hit link opens `/help/tutorials/<page>?q=<query>#<anchor>`, and the reading view marks the query words until changed (`packages/web/src/routes/tutorials.tsx:132-139`, `packages/web/src/routes/tutorials.tsx:221-227`, `packages/web/src/routes/tutorials.tsx:51-55`, `packages/web/src/router.tsx:368-374`).

### Info tips

8. Every info button reads its title/body from one catalogue keyed `area.thing` (play, project, library, planning, settings); `{name}` placeholders are filled from `vars` (`packages/web/src/help/catalog.ts:10-28`, `packages/web/src/help/entry.ts:1-17`). A press (not hover) opens a popover; body paragraphs split on blank lines; an entry with `tutorial` ends in Learn more to `/help/tutorials/<page>#<anchor>`, closing the popover (a plain `<a>` where no router is mounted) (`packages/web/src/components/kit/info-tip.tsx:14-84`). Tests fail on unused ids, ids used but missing, bodies that are long or contain `!` or "I", and Learn more targets whose page or heading does not exist (`packages/web/src/help/catalog.test.ts:42-75`).

### What's new tour

9. **Due?** `GET /api/whats-new` → `readWhatsNew(db, version)`: `major` = first number of an `X.Y.Z` version, else `{show:false, major:null}`. With settings key `whats-new.seen-major` stored: `show = seen < major`. With it absent: no `machine` row → false; otherwise `show = majorOf(machine.appVersion) < major` (`packages/app/src/slices/settings/whats-new.ts:9`, `packages/app/src/slices/settings/whats-new.ts:18-55`, `packages/app/src/edge/http/whats-new.ts:10`).
10. **Show.** The drawer opens only when `show` is true, the client has a step list for that major (only `3` exists, twelve steps) and the interactive tutorial is not active (`packages/web/src/whats-new/tour.tsx:30-120`, `packages/web/src/whats-new/tour.tsx:161-173`). It is non-modal; each step has "Open <place>" to a route; Back/Next; the last step says "Finish tour" and adds "Read the full patch notes" to Settings → Patch notes with `note=<current>` (`packages/web/src/whats-new/tour.tsx:180-241`).
11. **Seen.** Close tour, Finish tour, the drawer's close, and the patch-notes link all `POST /api/whats-new/seen`: `dismissWhatsNew` writes `major` only when absent, damaged or lower; the same request calls `markPatchNotesSeen` for the running version; the client clears `due` in any cached patch-notes view (`packages/app/src/edge/http/whats-new.ts:13-17`, `packages/app/src/slices/settings/whats-new.ts:60-69`, `packages/web/src/whats-new/tour.tsx:149-159`).

### Patch notes

12. **List.** `GET /api/patch-notes` reads `index.json` on every request, validates it (array ≤ 500 of strict `{id ^[0-9A-Za-z][0-9A-Za-z.-]{0,63}$, title 1–200, date YYYY-MM-DD, version? ≤40, range? ≤80}`), sorts newest date first keeping index order within a day, and returns `{version, current, due, notes}`; `current` = the note whose `version` equals the running version, else the newest (`packages/app/src/slices/patch-notes/library.ts:12-24`, `packages/app/src/slices/patch-notes/library.ts:40-67`, `packages/app/src/slices/patch-notes/seen.ts:73-81`, `packages/app/src/edge/http/patch-notes.ts:23-29`).
13. **Due rule** (`duePatchNote`): no note with `version === running` → null; settings key `patchNotes.seenVersion` damaged → null; present → the note id when running is a newer release than it; absent → no `machine` row → null, else the note id when running is newer than `machine.appVersion`. Release compare is numeric per `X.Y.Z` segment; anything unparsable compares as not newer (`packages/app/src/slices/patch-notes/seen.ts:11`, `packages/app/src/slices/patch-notes/seen.ts:24-71`).
14. **Popup.** `PatchNotesPopup` fetches the list only after the notice is seen and the tour query has answered with no tour to show; it renders when `due` is non-null and the interactive tutorial is not active, titled "What's new in <version>", with the note's Markdown, "See all patch notes" and "Close notes" (`packages/web/src/patch-notes/popup.tsx:20-81`). Closing (either control or the drawer's close) `POST /api/patch-notes/seen` → `markPatchNotesSeen`, which writes the running version only when absent, damaged or older (`packages/app/src/edge/http/patch-notes.ts:30-33`, `packages/app/src/slices/patch-notes/seen.ts:86-93`).
15. **One note.** `GET /api/patch-notes/:id` returns `<id>.md` only when the id matches the pattern and `index.json` lists it (`packages/app/src/slices/patch-notes/library.ts:70-80`, `packages/app/src/edge/http/patch-notes.ts:34-49`).
16. **Settings → Patch notes.** The newest note is open under "Latest version" (meta names the version or "Versions <range>", the release date as "27 September 2026", and "The version you are running." when it matches); older notes fold under "Earlier versions (n)"; the `note` search parameter opens one older note with "Back to the latest patch notes" (`packages/web/src/patch-notes/settings-panel.tsx:27-134`).

## Branches

- Sidebar absent or empty → home `Home`, no groups, every page listed in file order under no group (`packages/app/src/slices/tutorials/library.ts:104-118`).
- Search query empty or whitespace → `[]`; the client does not send it (`packages/app/src/slices/tutorials/library.ts:186`, `packages/web/src/tutorials/api.ts:38`).
- A term only in the page title (not the section) with no other term in the section → the section is not a hit (`packages/app/src/slices/tutorials/library.ts:213-214`).
- `/search` is registered before `/:page`, so the path segment `search` is never read as a page id (`packages/app/src/edge/http/tutorials.ts:40-48`).
- Major update with a tour defined → the tour shows and the patch-notes popup stays closed; closing the tour marks this version's notes seen, so they never follow it (`packages/web/src/patch-notes/popup.tsx:28-36`, `packages/app/src/edge/http/whats-new.ts:11-16`).
- Major update with no tour for that major → `tourShowing` false; the patch-notes popup is the only announcement (`packages/web/src/patch-notes/popup.tsx:28-32`).
- Minor/patch update → `show` false (`seen === major`); the popup opens when the running version has its own note entry; a version whose notes are only covered by a `range` entry has no due note (`packages/app/src/slices/patch-notes/seen.ts:62-63`).
- Fresh install (no `machine` row yet, or one stamped with the running version) → neither tour nor popup (`packages/app/src/slices/settings/whats-new.ts:51-54`, `packages/app/src/slices/patch-notes/seen.ts:68-70`).
- `note` search parameter names no listed note → a status line says so and the latest is shown (`packages/web/src/patch-notes/settings-panel.tsx:97-101`).

## Unhappy paths

- Tutorials folder missing → 500 problem "This copy of Slopify has no tutorials: its docs/wiki folder is missing. Reinstall Slopify (or run npm run build) and reload the page."; `Home.md` missing → "…damaged tutorials: docs/wiki/Home.md is missing…". The memoised promise is cleared on failure, so the next request retries the load (`packages/app/src/slices/tutorials/library.ts:84-103`, `packages/app/src/edge/http/tutorials.ts:14-31`). Other read errors go to the app's error handler (`packages/app/src/edge/http/tutorials.ts:15`).
- Unknown or malformed page id → 404 "There is no tutorial called <id> in this version of Slopify. Pick one from the list on Help → Tutorials, or search there." (`packages/app/src/edge/http/tutorials.ts:56-61`). The page shows a danger callout "This tutorial did not load" with the message and Try again (`packages/web/src/routes/tutorials.tsx:143-154`).
- Search request fails → "The search didn't run: <message> Change the words or reload the page."; zero hits → `No tutorial mentions "<query>". Try fewer or other words.` (`packages/web/src/routes/tutorials.tsx:282-294`).
- A wiki link to a page this version lacks stays a GitHub-relative link (`packages/web/src/tutorials/links.ts:23-25`); a hash with no matching heading scrolls to the top (`packages/web/src/routes/tutorials.tsx:79-80`).
- `index.json` missing → 500 "…has no patch notes: its docs/patch-notes/index.json is missing…"; unparsable or schema-invalid → 500 "…has a damaged patch notes list (docs/patch-notes/index.json)…" (`packages/app/src/slices/patch-notes/library.ts:41-62`, `packages/app/src/edge/http/patch-notes.ts:12-15`). Settings shows "The patch notes did not load" with Try again (`packages/web/src/patch-notes/settings-panel.tsx:62-71`).
- Listed note whose `.md` file is missing, or unlisted id → 404 "These patch notes are not in this version of Slopify. Open Settings → Patch notes and pick one from the list." (`packages/app/src/slices/patch-notes/library.ts:73-78`, `packages/app/src/edge/http/patch-notes.ts:41-47`).
- Stored seen value damaged (not JSON, wrong type, not a release) → treated as "never show" rather than "always show"; the next close overwrites it (`packages/app/src/slices/settings/whats-new.ts:25-36`, `packages/app/src/slices/settings/whats-new.ts:48-49`, `packages/app/src/slices/patch-notes/seen.ts:40-51`, `packages/app/src/slices/patch-notes/seen.ts:65-66`).
- Saving "seen" fails → the drawer stays open with "Slopify could not save that you closed this tour: <message> Press Close tour to try again." (or "…these patch notes… Press Close notes to try again.") (`packages/web/src/whats-new/tour.tsx:235-239`, `packages/web/src/patch-notes/popup.tsx:73-77`).
- `POST …/seen` during an update or shutdown is refused by the global mutation barrier (409/503) like any other write (`packages/app/src/edge/http/app.ts:235-274`).
- Running an older version after a newer one → neither key is lowered, so tours and notes already closed do not return (`packages/app/src/slices/settings/whats-new.ts:57-67`, `packages/app/src/slices/patch-notes/seen.ts:83-92`).

## State transitions

- Tutorial book (per process): unloaded → loading → loaded (kept until exit); loading → unloaded on error (`packages/app/src/edge/http/tutorials.ts:24-31`).
- `whats-new.seen-major`: absent → `major`; `n` → `major` only when `n < major`; never decreases (`packages/app/src/slices/settings/whats-new.ts:63-67`).
- `patchNotes.seenVersion`: absent → running version; `v` → running only when running is a newer release; never decreases (`packages/app/src/slices/patch-notes/seen.ts:88-92`).
- Forbidden: a tour or popup on an install whose `machine` row does not predate the running version and has no seen key (`packages/app/src/slices/settings/whats-new.ts:51-54`, `packages/app/src/slices/patch-notes/seen.ts:68-70`).

## Invariants

- Tutorials and patch notes are read-only release content; no route writes them (`packages/app/src/slices/tutorials/library.ts:7-10`, `packages/app/src/slices/patch-notes/library.ts:7-10`).
- At most one announcement overlay at a time: the tour and popup wait for the first-run notice and the interactive tutorial; the popup also waits for the tour (`packages/web/src/whats-new/tour.tsx:146-171`, `packages/web/src/patch-notes/popup.tsx:17-47`).
- The tour is at most once per major and the popup at most once per version, per install (the seen keys live in the database, not the browser) (`packages/app/src/slices/settings/whats-new.ts:6-9`, `packages/app/src/slices/patch-notes/seen.ts:7-11`).
- Both seen keys stay out of backups and exports (`packages/app/src/slices/storage/portable.ts:480-493`).
- Only ids matching the page/note patterns are ever joined into a file path (`packages/app/src/slices/tutorials/library.ts:97`, `packages/app/src/edge/http/tutorials.ts:52`, `packages/app/src/slices/patch-notes/library.ts:71`).

## Outcomes & side effects

- Reading tutorials and patch notes: no writes, no network beyond the local API; outside links open in a new tab.
- Closing the tour writes `whats-new.seen-major` and `patchNotes.seenVersion`; closing the popup writes `patchNotes.seenVersion` (`packages/app/src/edge/http/whats-new.ts:13-17`, `packages/app/src/edge/http/patch-notes.ts:30-33`).
- Search results are not logged or stored.

## Dimensions not in play

- D1 Authority: single local user, no accounts; the routes have no guard beyond the global mutation barrier.
- D5 Money: nothing is charged.
- D7 Time: no expiry; the only time element is the 200 ms search debounce and the note dates, which are display-only.
- D13 Notification: no outbound notification; the tour and popup are the in-app announcement channel.
- D14 Effects on others: none; state is per install.
- D15 Audit: no record beyond the two settings keys.
- shallow: the wiki pages' and patch notes' prose (`docs/wiki/`, `docs/patch-notes/`) and the info-tip catalogue entries (`packages/web/src/help/entries/`) are content, not inventoried.
