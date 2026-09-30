---
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: 60f36108d9d9
paths_covered:
  - ":(top)packages/web/src/routes/tutorials.tsx"
  - ":(top)packages/web/src/tutorials/**"
  - ":(top)packages/web/src/help/**"
  - ":(top)packages/web/src/components/kit/info-tip.tsx"
  - ":(top)packages/web/src/components/kit/reading-view.tsx"
  - ":(top)packages/app/src/slices/tutorials/**"
  - ":(top)packages/app/src/edge/http/tutorials.ts"
---

# Help → Tutorials

## Mode & job

Read mode. The in-app reader for the GitHub wiki's pages, which ship inside the build (`docs/wiki/` copied to `dist/tutorials/`), so they read offline and describe the running version (`packages/app/src/slices/tutorials/library.ts:7-10`, `packages/app/src/slices/tutorials/library.ts:45-52`). Route `/help/tutorials/$page` with `?q=` (the words a search result was opened with, trimmed and cut to 200 characters) and the section in the hash (`packages/web/src/router.tsx:362-381`). `/help` and `/help/tutorials` redirect to page `Home` (`packages/web/src/router.tsx:383-396`). The same surface answers every info button: `InfoTip` popovers carry the short help text and, when the entry names a tutorial section, a "Learn more" link into this reader (`packages/web/src/components/kit/info-tip.tsx:9-13`, `packages/web/src/help/entry.ts:1-17`).

Data: three endpoints under `/api/tutorials` — the index (home, groups from `_Sidebar.md`, every page, footer from `_Footer.md`), `/search?q=`, and `/:page` returning `text/markdown` (`packages/app/src/edge/http/tutorials.ts:19-63`, `packages/app/src/edge/http/app.ts:220`). The book is read once per process and kept (`packages/app/src/edge/http/tutorials.ts:23-31`). All three web queries have `staleTime: Infinity`; the search query is disabled for a blank query (`packages/web/src/tutorials/api.ts:10-40`). The current wiki holds 49 pages under 10 sidebar groups (`docs/wiki/`, `docs/wiki/_Sidebar.md`).

## Composition

**Entry points.**

| Entry | Where | Control | Source |
|---|---|---|---|
| Tutorials book link | Sidebar foot at ≥768px, between `UpdateWidget` and `TutorialLauncher`; phone top bar below 768px | Kit `ButtonLink` `variant="icon"`, `BookOpenIcon`, label and `data-tip` "Tutorials", opens page `Home` | `packages/web/src/components/shell.tsx:128-142`, `packages/web/src/components/shell.tsx:436-442`, `packages/web/src/components/shell.tsx:487-489` |
| Palette: "Open tutorials" | Ctrl+K, group "Go to" | Opens page `Home`; keywords help, guide, wiki, docs, how | `packages/web/src/components/shell.tsx:261-269` |
| Palette: "Open tutorial: <title>" | Ctrl+K, group "Tutorials", only once something is typed | One command per page | `packages/web/src/tutorials/commands.tsx:8-35` |
| Info button "Learn more" | Every `InfoTip` whose catalogue entry has a `tutorial` ref | Router `Link` wrapped in `PopoverClose`, `ArrowRightIcon`; a plain `<a>` when no router is mounted | `packages/web/src/components/kit/info-tip.tsx:49`, `packages/web/src/components/kit/info-tip.tsx:55-84` |

**Info button (`InfoTip`).** A round 24px trigger with `InfoIcon` 15px, `text-ink-3`, hover `bg-raised`; accessible name "About <label or entry title>"; `data-help-id` carries the catalogue id (`packages/web/src/components/kit/info-tip.tsx:14-41`). Press opens a kit `Popover`: the entry title in semibold ink, the body split into paragraphs on blank lines, then Learn more (`packages/web/src/components/kit/info-tip.tsx:42-51`). The words come only from `catalog`, merged from five area files (play, project, library, planning, settings); `{name}` placeholders fill from `vars` (`packages/web/src/help/catalog.ts:1-28`). `helpScope` (`data-help-scope`) marks the element a control and its tip share; the screen-walk tests fail when a labelled control has no tip inside its nearest scope (`packages/web/src/components/kit/info-tip.tsx:86-89`, `packages/web/src/help/coverage.ts:1-5`).

**Page header.** Kit `PageHeader`: crumb "Help › Tutorials" (Tutorials links to the index's home page), title = the index title of the page or the id with dashes as spaces, meta = the page's sidebar group title, else "Guides to every screen of Slopify, for the version you are running." (`packages/web/src/routes/tutorials.tsx:62`, `packages/web/src/routes/tutorials.tsx:109-125`). The Markdown's own `# Title` line is split off and not rendered in the body (`packages/web/src/tutorials/links.ts:30-38`, `packages/web/src/routes/tutorials.tsx:63-64`).

**Layout.** Kit `Workspace` with `sl-workspace--tutorials`: a 240px sections column beside the page; the column scrolls on its own up to the viewport height (`packages/web/src/routes/tutorials.tsx:126-142`, `packages/web/src/styles/shell.css:685-695`). Below 900px it stacks to one column and the nav caps at 40dvh (`packages/web/src/styles/shell.css:915-921`).

**Left column (`TutorialsNav`).** A `nav` "Tutorials" (`packages/web/src/routes/tutorials.tsx:181-250`):

1. Search box: `type="search"`, `sl-input pl-9` with a `SearchIcon`, sr-only label and placeholder "Search all tutorials" (`packages/web/src/routes/tutorials.tsx:205-230`). Typing debounces 200ms before querying (`packages/web/src/routes/tutorials.tsx:196-201`). Enter opens the first hit (`packages/web/src/routes/tutorials.tsx:221-227`). `/` focuses it via `useSearchShortcut(input, "the tutorials")`, which registers "Search the tutorials" in the palette (`packages/web/src/routes/tutorials.tsx:195`, `packages/web/src/components/kit/command-palette.tsx:132-150`).
2. With no query: the home link, then per group an `sl-kicker` group title over its page links (`packages/web/src/routes/tutorials.tsx:236-246`). Links are `sl-tutorials-nav__link` (13px, `ink-2`, hover `raised`); the current page has `aria-current="page"`, `accent-tint` background, weight 600 (`packages/web/src/routes/tutorials.tsx:252-271`, `packages/web/src/styles/shell.css:696-715`).
3. With a query: `SearchResults` replaces the page list — a count line ("1 section" / "N sections") and a list "Search results" of `sl-tutorials-hit` links, each the section heading (or the page title for text above the first heading) in semibold ink, the page title under it in `text-label ink-3`, and a snippet in `text-small ink-2` (`packages/web/src/routes/tutorials.tsx:273-323`). A hit opens its page with `?q=<query>` and its anchor as hash (`packages/web/src/routes/tutorials.tsx:132-139`, `packages/web/src/routes/tutorials.tsx:303-309`).

Search ranking (server): up to 8 words; a section matches when every word is in its heading, its text or the page title, and at least one is in the section itself; heading hits score 6, page-title 3, text 1, an exact heading match +10; top 30 returned; snippets are ~60 characters before and ~120 after the first hit, cut at word ends (`packages/app/src/slices/tutorials/library.ts:164-233`).

**Main column.** A click-routing wrapper around kit `ReadingView` with `label="Tutorial"`, `what="tutorial"`, `anchorPrefix="tutorial-"`, controlled `query` seeded from `?q=` (`packages/web/src/routes/tutorials.tsx:51-55`, `packages/web/src/routes/tutorials.tsx:156-168`). `ReadingView` renders (`packages/web/src/components/kit/reading-view.tsx:202-451`):

- A "Contents" TOC (`sl-toc`) of the top two heading levels, nested; the current entry follows scroll via `IntersectionObserver` and gets `accent-tint` (`packages/web/src/components/kit/reading-view.tsx:263-279`, `packages/web/src/components/kit/reading-view.tsx:355-374`, `packages/web/src/styles/kit.css:1354-1375`).
- A tools row: search input "Search the tutorial", a live match count, Previous/Next match icon buttons, and quiet "Copy all" (`packages/web/src/components/kit/reading-view.tsx:376-431`). Enter steps forward, Shift+Enter back (`packages/web/src/components/kit/reading-view.tsx:396-400`).
- Each section: `h2`/`h3` with a quiet small "Copy section" button, then GFM Markdown via `react-markdown` + `remark-gfm`; hits are wrapped in `mark.sl-hit` (`waiting-tint`, 1px `waiting` outline; 2px on the stepped-to hit) (`packages/web/src/components/kit/reading-view.tsx:317-345`, `packages/web/src/styles/kit.css:1376-1381`, `packages/web/src/styles/shell.css:406-408`). Links in the body are `accent-ink` (`packages/web/src/styles/shell.css:403-405`).
- Under the page, when `_Footer.md` is non-empty: a `border-t` small `ink-3` paragraph with Markdown links reduced to their text (`packages/web/src/routes/tutorials.tsx:169-173`).

**Links.** Wiki-style `](Page)`, `](Page#anchor)` and `](#anchor)` are rewritten to `/help/tutorials/<Page>#<anchor>` only when the page exists in this version; others are left unchanged (`packages/web/src/tutorials/links.ts:12-28`). A plain left click on an in-app tutorial link navigates inside the app; an `http(s)` link opens a new tab with `noopener,noreferrer`; modified clicks pass through (`packages/web/src/routes/tutorials.tsx:85-105`).

**Anchors.** After the page draws, the hash is resolved to a heading by GitHub's slug rules (repeats numbered `-1`, `-2`, the split-off title counted first) and scrolled into view; with no match or no hash the window scrolls to the top (`packages/web/src/routes/tutorials.tsx:70-81`, `packages/web/src/tutorials/links.ts:53-74`).

## States

| State | Trigger | Render |
|---|---|---|
| Index loading | `tutorialsQuery` pending | Left column: small `ink-3` "Loading the tutorials…"; title falls back to the page id with spaces (`packages/web/src/routes/tutorials.tsx:233-234`, `packages/web/src/routes/tutorials.tsx:62`) |
| Page loading | page Markdown empty/pending | `ReadingView` children: "Loading the tutorial…"; in-page search disabled, no TOC (`packages/web/src/routes/tutorials.tsx:167`, `packages/web/src/components/kit/reading-view.tsx:252`, `packages/web/src/components/kit/reading-view.tsx:390`) |
| Page error | page query errors (404 for an unknown page, 500 when the tutorials are missing) | Kit `Callout` tone danger "This tutorial did not load", body `<message> Press Try again, or pick another page on the left.`, secondary "Try again" refetches (`packages/web/src/routes/tutorials.tsx:143-154`) |
| Unknown page | id fails the pattern or is absent | 404 detail "There is no tutorial called <id> in this version of Slopify. Pick one from the list on Help → Tutorials, or search there." (`packages/app/src/edge/http/tutorials.ts:48-61`, `packages/app/src/slices/tutorials/anchors.ts:6`) |
| Tutorials missing | no `docs/wiki` folder, or no `Home.md` | 500 with "This copy of Slopify has no tutorials…" / "…has damaged tutorials: docs/wiki/Home.md is missing. Reinstall Slopify (or run npm run build) and reload the page." (`packages/app/src/slices/tutorials/library.ts:83-104`) |
| Searching | query set, no data yet | "Searching…" (`packages/web/src/routes/tutorials.tsx:288`) |
| No hits | zero hits | `role="status"` `No tutorial mentions "<query>". Try fewer or other words.` (`packages/web/src/routes/tutorials.tsx:289-294`) |
| Search error | search query errors | `role="alert"` `text-danger` `The search didn't run: <message> Change the words or reload the page.` (`packages/web/src/routes/tutorials.tsx:282-287`) |
| Opened from a hit | `?q=` present | Words marked in the page until the in-page search changes (`packages/web/src/routes/tutorials.tsx:51-55`) |
| In-page search | query typed | Count "No matches" / "1 match" / "N matches" / "k of N" while stepping (`packages/web/src/components/kit/reading-view.tsx:306-315`) |
| Copy | Copy section / Copy all | Success toast "<Section "…"/Tutorial> copied as Markdown."; failure toast "Could not copy the …: the browser blocked clipboard access. Select the text and press Ctrl+C." (`packages/web/src/components/kit/reading-view.tsx:281-295`) |

## Motion

- No transitions of its own; anchor jumps use `scrollIntoView({ block: "start" })` and hit stepping `block: "center"` without smooth behaviour (`packages/web/src/routes/tutorials.tsx:79-80`, `packages/web/src/components/kit/reading-view.tsx:303`).
- Copy toasts enter with the shared `enter` animation (200ms), off under reduced motion (`packages/web/src/styles/shell.css:165-172`).

## Copy

- Crumb and meta: "Help", "Tutorials", "Guides to every screen of Slopify, for the version you are running." (`packages/web/src/routes/tutorials.tsx:112-123`).
- Search: "Search all tutorials", "Searching…", "1 section" / "N sections" (`packages/web/src/routes/tutorials.tsx:207-219`, `packages/web/src/routes/tutorials.tsx:288-298`).
- Reader: "Tutorial contents", "Contents", "Search the tutorial", "Previous match", "Next match", "Copy section", "Copy all" (`packages/web/src/components/kit/reading-view.tsx:356-429`).
- Info button: "About <title>", "Learn more" (`packages/web/src/components/kit/info-tip.tsx:33`, `packages/web/src/components/kit/info-tip.tsx:60-65`).
- Catalogue entries: second person, plain words, about 60 words at most, title names the thing (`packages/web/src/help/entry.ts:1-7`).

## Not in play

- Editing tutorials in the app: absent; nothing on the server writes (`packages/app/src/slices/tutorials/library.ts:10`).
- Fetching the online wiki: absent; only the bundled copy is read (`packages/app/src/slices/tutorials/library.ts:45-52`).
- Search history, recent pages and bookmarks: absent (`packages/web/src/routes/tutorials.tsx:181-201`).
- Previous/next page navigation at the foot of a page: absent (`packages/web/src/routes/tutorials.tsx:158-174`).
- Images: the bundled wiki pages carry none, and no route serves wiki assets (`docs/wiki/`, `packages/app/src/edge/http/tutorials.ts:32-63`).
- Retry on a failed search: absent; the error line only (`packages/web/src/routes/tutorials.tsx:282-287`).
- Hover-to-open info tips: absent by design; a press opens them (`packages/web/src/components/kit/info-tip.tsx:9-10`).
