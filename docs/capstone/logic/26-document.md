---
scenario: document
screens:
- 06-play
- 08-project
depends_on:
- 01-pipeline-lifecycle
- 04-run-admission
- 07-article-writing
- 10-thumbnail-prompt-by-llm
- 12-reruns-and-edits
- 14-storage-and-downloads
generated_date: '2026-09-25'
capstone_version: 5.2.0
paths_covered:
  - :(top)packages/app/src/slices/document/**
  - :(top)packages/app/src/slices/rebuild/recipe-document.ts
  - :(top)packages/app/src/slices/rebuild/runtime-document.ts
  - :(top)packages/app/src/kernel/db/migrations/0014-document-stage.sql
---

# 26 Document

An optional seventh stage that lays the project's article out as a styled PDF: a title page (with the thumbnail as its cover when the project has one), a table of contents, the body with drop caps after headings, a Sources page and the theme's closing page. The generator is ported from the owner's lore2script2 PDF tool (`packages/app/src/slices/document/`).

## Trigger & preconditions

- Document is Generate or Off on Play and in Edit project → Inputs; Off is the default, and every project made before the stage existed has a `document` stage row that is `skipped` with source `off` (migration `0014-document-stage.sql`). A config, draft, template or backup without `sources.document` reads as Off (`sourceOf`, `packages/app/src/slices/admission/model.ts`).
- The theme is a project setting, `document: { theme: "plain", custom? }`; Plain is the only built-in and the default, and every new project saves its theme (`packages/app/src/slices/document/model.ts`, `packages/app/src/slices/admission/start.ts`). The retired `"dicemaster"` still parses: a project saved with it, or with the stage on and no theme, keeps drawing with the legacy DiceMaster values and keeps its PDF fingerprint (`packages/app/src/slices/document/legacy-dicemaster.ts`). It is never offered in a picker.
- The stage needs no provider, key or model and costs nothing; Play's estimate lists it as a local row.
- It waits for `article:body` only, plus `research:notes` when research is on (for its links) and `thumbnail:image` when a thumbnail is on (for the cover). It never waits for narration, images or the video, so it runs beside them (`packages/app/src/slices/rebuild/recipe-document.ts`, `packages/app/src/kernel/runner/graph.ts`).

## Steps

1. Admission plans one local work item, `document:pdf` (stage `document`, operation `render-document`). Its fingerprint covers the renderer version, the project title, the whole resolved theme, and the selected identities of the article, research notes and thumbnail.
2. When its inputs are ready, the runner claims it like any other local work. The runtime reads the saved article markdown (the edited or supplied text, otherwise the selected `article.md`), the selected research notes and the selected thumbnail file (`packages/app/src/slices/rebuild/runtime-document.ts`).
3. The article is split with `splitEndMatter`: the body becomes blocks (headings h1–h3, paragraphs with bold, italic and links, list items, quotes, rules); the "Sources Consulted" section becomes the Sources page, followed by any other `http(s)` link the research notes cite; the pronunciation glossary is left out. An opening heading that repeats the title is dropped (`blocks.ts`, `sources.ts`).
4. The renderer draws every page from one resolved `DocumentTheme`: page size and margins, fonts (bundled Cinzel, SIL OFL 1.1, plus the PDF standard fonts), sizes, spacing, drop caps, title/contents/sources/closing pages and the running header and footer. Headings to the theme's contents depth fill the reserved contents pages with clickable page links; body links stay clickable (`render.ts`, `pages.ts`, `flow.ts`, `theme.ts`).
5. The bytes are published as output role `document_pdf` (`document.pdf`) of the originating revision; downloads and Open folder use the same revision record URLs as other outputs, and `?inline=1` opens the PDF in a browser tab.

## Branches

- Theme: Plain (flat page, no brand, no closing page) or a copy of a Library → Documents theme. The parchment texture is a background any theme can use. Migration 0017 saves the old DiceMaster values as a Library theme named "DiceMaster" on installs that had already used the Document stage.
- No thumbnail → no cover. A thumbnail that is not PNG, JPEG or WebP → no cover and a `document.cover` warning in the log; the document still finishes.
- No sources section and no research links → no Sources page.
- Re-run section on Document regenerates only `document:pdf`; it refuses while the article or thumbnail it needs is unfinished.

## Unhappy paths

- The article has no printable text → the stage fails: "The article has no text to put in the document. Write or regenerate the article (Edit project → Article), then use Retry stage on Document."
- The article output is missing → "The article isn't finished yet … Let the Article stage finish (Resume, or Retry stage on Article), then use Retry stage on Document."
- The thumbnail file can't be read → the stage fails naming Re-run section on Thumbnail or Edit project → Thumbnail.
- The bundled fonts or texture are missing (a damaged install) → the stage fails asking to reinstall or update Slopify, then Retry stage on Document.
- Cancel and pause follow scenario 13; an interrupted render is local and simply runs again on Resume.

## State transitions

- Document stage: `skipped` when Off; otherwise pending → running → done or failed, as scenario 01.
- Editing the article, the title or the theme marks the document `outdated`; a rebuild re-renders only it. Editing images, narration, subtitles or video settings leaves it retained.

## Invariants

- One resolved theme object carries every value the renderer draws with; the built-in themes are presets of it.
- The document never triggers a provider call and never blocks narration, images or the video.
- Old projects keep their stages and outputs; the migration only adds the switched-off stage and widens the stage-kind checks.

## Outcomes & side effects

- Success: `document.pdf` on the project, downloadable, openable in a tab and in its folder; a `stage.completed` telemetry event for stage `document` (no new aggregate).
- Failure: stage `failed` with the message above; other stages continue.

## Dimensions not in play

- D5 money: nothing is charged.
- Chapter images, custom themes and a theme editor: a later step adds a Library theme editor that writes the same `DocumentTheme` shape.
