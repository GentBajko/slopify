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
generated_at_commit: e9226a34aa8a
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: 61f20a6218b2
paths_covered:
  - ":(top)packages/app/src/slices/document/**"
  - ":(top)packages/app/src/assets/document/**"
  - ":(top)packages/app/src/slices/rebuild/recipe-document.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-document.ts"
  - ":(top)packages/app/src/edge/http/document-themes.ts"
  - ":(top)packages/app/src/kernel/db/migrations/0014-document-stage.sql"
  - ":(top)packages/app/src/kernel/db/migrations/0016-document-themes.sql"
  - ":(top)packages/app/src/kernel/db/migrations/0017-legacy-dicemaster-theme.sql"
  - ":(top)packages/web/src/project/body-document.tsx"
  - ":(top)packages/app/src/slices/revisions/subject.ts"
---

# 26 Document

An optional stage, kind `document`, that lays the project's article out as a PDF with jsPDF: a title page (with the thumbnail as its cover when the project has one), a table of contents, the body with drop caps, a Sources page and the theme's closing page (`packages/app/src/slices/document/render.ts:20`, `packages/app/src/slices/document/pages.ts`). Every value the renderer draws with comes from one `DocumentTheme` object (`packages/app/src/slices/document/theme.ts:39`), ported from the lore2script2 PDF generator (`theme.ts:17`).

## Trigger & preconditions

- The stage's source is Generate or Off: on Play's Document rail (`packages/web/src/play/stage-rails.tsx:439`) and in Edit project → Inputs, Stages group, as "Document source" with a "Document theme" picker disabled while it is Off (`packages/web/src/project/revision-form.tsx:54`, `revision-form.tsx:346-352`). `StageSources.document` is optional; a config, draft, template or backup without it reads through `sourceOf` (`packages/app/src/slices/admission/model.ts:19-23`). Projects made before the stage have a `document` stage row that is `skipped` with source `off` (`packages/app/src/kernel/db/migrations/0014-document-stage.sql`).
- Article Off refuses Document Generate: "The PDF is made from the article, and Article is Off. Set Article to Generate or Provide, or set PDF to Off." (`packages/app/src/slices/admission/rules.ts:642`, `rules.ts:664`).
- The theme is the project setting `document: { theme, custom? }` (`packages/app/src/slices/document/model.ts:37-40`). The one built-in is `plain` (`model.ts:6`), the default for new projects and drafts (`model.ts:19`, `model.ts:52-54`). A project that starts with Document Generate and no theme is saved with `{ theme: "plain" }` (`packages/app/src/slices/admission/start.ts:78-81`). A saved config with no `document` setting reads as the retired `"dicemaster"` (`documentThemeOf`, `model.ts:46-48`), which still parses and draws with the frozen `legacyDiceMasterTheme` values (`packages/app/src/slices/document/legacy-dicemaster.ts`, `theme.ts:289-291`); it is never offered in a picker (`model.ts:9-12`).
- `custom` is a copy of a Library → Documents theme's values; when set, `theme` is ignored (`model.ts:26-40`, `theme.ts:294-299`).
- No provider, key or model: Play's estimate lists a local row "Document — Laid out locally from the article; no API fee." (`packages/app/src/slices/estimate/index.ts:408-409`).
- Stage dependencies: `document: ["article", "thumbnail"]`, with `thumbnail` optional (`packages/app/src/kernel/runner/graph.ts:16`, `graph.ts:24-26`); with the thumbnail Off it waits for the article only (`graph.ts:95`). It never waits for narration, images or the video.

## Steps

1. Planning adds one work item when `sourceOf(config.sources, "document") === "generate"`: key `document:pdf`, stage `document`, kind `local`, operation `render-document`, version 1 (`packages/app/src/slices/rebuild/recipe-document.ts:19-37`).
2. Its fingerprint values are the renderer version `"document-v1"`, the project's kept subject `subjectOf(config)` (`subjectTitle`, else `title`; `packages/app/src/slices/admission/model.ts:285-290`), the whole resolved theme as JSON, and the resource identities of the article, the research notes (or `null`) and `thumbnail:image` (or `null`) (`recipe-document.ts:14`, `recipe-document.ts:38-45`). The page itself draws the current `config.title` (`packages/app/src/slices/rebuild/runtime-document.ts:61-62`), so after a rename the PDF keeps the title it was rendered with until something else in the fingerprint changes. It depends on the article's key plus `research:notes` and `thumbnail:image` when those are planned (`recipe-document.ts:47-50`).
3. The runner claims it when its dependencies are ready. A thumbnail that failed or was canceled for good releases it: `optionalDeps` plus `gaveUp` in the readiness check, fingerprint unchanged (`packages/app/src/slices/rebuild/runtime-store.ts:124-131`).
4. `executeDocumentRecipe` returns `done` when the piece is already done, `held` when `maySubmit` refuses, and checks that the queued recipe still matches the current plan (`packages/app/src/slices/rebuild/runtime-document.ts:17-30`, `runtime-document.ts:91-111`).
5. Inputs: the article is `view.articleMarkdown` when the article was edited or is not Generate, otherwise the selected `article_md` output of `article:body` (`runtime-document.ts:39-42`). The cover is the selected ready `thumbnail:image` file when the thumbnail source is not Off (`runtime-document.ts:47-60`). Research notes are the selected `notes` output unless research is Off (`runtime-document.ts:64`).
6. `documentText` splits the article with `splitEndMatter`: the body becomes blocks; the "Sources Consulted" section becomes Sources items, followed by every other `http(s)` link the research notes cite, de-duplicated by address; the pronunciation glossary is left out (`packages/app/src/slices/document/sources.ts:18-31`). Block kinds are headings, paragraphs with bold, italic and link runs, list items, quotes and rules (`packages/app/src/slices/document/blocks.ts`). A heading among the first three blocks equal to the title (trimmed, case-insensitive) is dropped (`render.ts:107-116`).
7. Word count: every heading and run text, split on whitespace (`render.ts:54-60`). The page format is the theme's `a4` or `letter`, unit mm (`render.ts:61-66`).
8. Pages: title page (brand, tagline, title, cover, date and word count per `titlePage` flags), contents to `contents.depth` with clickable page links, body, Sources page, closing page, then the running header and footer; contents pages are reserved for the listed headings plus the Sources and closing pages before the body is written, then filled (`render.ts:77-96`, `pages.ts:26-163`). A Sources entry is drawn in the text colour; each `http(s)` address inside it is drawn in the heading colour and links to itself; an entry with no address in its words links as a whole to its `href` (`pages.ts:165-224`).
9. Fonts: bundled Cinzel (Regular, Medium, Bold, Black) and Literata (Regular, SemiBold as bold, Italic, SemiBoldItalic), SIL OFL 1.1, plus the PDF standard `times`, `helvetica`, `courier`; the parchment texture is `background.jpg` (`packages/app/src/slices/document/fonts.ts:5-22`, `theme.ts:25-27`). They are read from `assets/document/` on every render (`fonts.ts:39-52`). A face asks for any of `normal|medium|bold|black|italic|bolditalic`; Cinzel maps italic→normal and bolditalic→bold, the others map medium→normal and black→bold (`fonts.ts:68-90`).
10. The bytes are written as `document.pdf` and published as output role `document_pdf` of the originating revision, with payload `{pages, words, cover}` (`runtime-document.ts:78-86`, `packages/app/src/slices/storage/layout.ts:90-91`).

## Branches

- Theme source: built-in `plain` (flat `#fdfaf3` page, Cinzel body and headings, times italic emphasis, no brand, contents depth 2, closing page disabled) (`theme.ts:198-279`); legacy DiceMaster (`legacy-dicemaster.ts`); or a Library theme copy resolved with `resolveTheme(custom.values)` over `plain` (`theme.ts:294-299`). Overrides merge one level deep; arrays replace; unknown sections or keys throw; colours must be `#rgb`/`#rrggbb` (`theme.ts:281-344`).
- Background: `background.image` `"parchment"` stretches the bundled texture over every page; `null` draws the flat colour (`theme.ts:46-51`).
- Library → Documents (route `/document-themes`, `packages/web/src/routes/document-themes.tsx`, `document-theme-editor.tsx`): list, create, update, delete themes in table `document_themes` (unique lower-case name) (`packages/app/src/slices/document/library.ts:31-95`, `packages/app/src/kernel/db/migrations/0016-document-themes.sql`, `packages/app/src/edge/http/document-themes.ts:37-64`). Values are checked with `documentThemeSchema` (`packages/app/src/slices/document/theme-schema.ts`); a stored row that no longer parses is left out of the list (`library.ts:36-38`). `POST /document-themes/preview` renders the fixed sample article with unsaved values and returns the PDF, `Cache-Control: no-store` (`document-themes.ts:65-75`, `packages/app/src/slices/document/sample.ts`).
- Migration 0017 inserts the DiceMaster values as a Library theme named "DiceMaster" (id `legacy-dicemaster`) only when some stage row of kind `document` has a source other than `off` and no theme of that name exists (`packages/app/src/kernel/db/migrations/0017-legacy-dicemaster-theme.sql`).
- Cover: thumbnail Off or not ready → no cover (`runtime-document.ts:49`); not PNG, JPEG or WebP → `cover: "unsupported"`, no cover, and a `warn` log `document.cover` (`runtime-document.ts:70-75`).
- No sources section and no research links, or `sources.enabled` false → no Sources page (`pages.ts:168`).
- The rebuild review lists "Document theme" before/after, and a Library theme saved again under the same name with other values also counts as a change (`packages/app/src/slices/rebuild/preview-details.ts:310-318`).

## Unhappy paths

- No printable text after the title heading is dropped → "The article has no text to put in the document. Write or regenerate the article (Edit project → Article), then use Try again on Document." (`render.ts:50-53`).
- Article output missing → "The article isn't finished yet, so there's nothing to make the document from. Let the Article stage finish (Resume, or Try again on Article), then use Try again on Document." (`runtime-document.ts:43-46`).
- Thumbnail file unreadable → the stage fails naming the thumbnail's own section and Edit project → Thumbnail (`runtime-document.ts:54-58`).
- Bundled fonts or texture unreadable → "…Its installation is incomplete: reinstall or update Slopify, then use Try again on Document." (`fonts.ts:46-50`).
- Project changed after queueing (recipe no longer in the plan or unresolved) → "The project changed after this document was queued…" naming Choose what to remake (`runtime-document.ts:107-110`); missing revision view → internal-error message naming Download diagnostics (`runtime-document.ts:100-103`).
- Theme save refused: invalid values → 400 with per-field errors; duplicate name → 409 "Another document theme already has this name. Choose a different name."; missing id → 404 naming Library → Documents (`document-themes.ts:78-108`).
- Cancel and pause follow scenario 13; the abort signal is checked before and after rendering (`runtime-document.ts:29`, `runtime-document.ts:76-77`).

## State transitions

- Document stage: `skipped` when Off; otherwise pending → running → done or failed, as scenario 01.
- An article edit re-runs `audio` and `document` roots (`packages/app/src/slices/reruns/cascade.ts:57-64`). A change to the article, research notes, thumbnail identity, kept subject or resolved theme changes the fingerprint, so only `document:pdf` is remade (`recipe-document.ts:38-45`). A project rename alone changes none of them: the first rename keeps the old title as `subjectTitle` (`packages/app/src/slices/revisions/subject.ts:4-11`). Images, narration, subtitles and video settings are not in the fingerprint.
- A document rendered without a cover because the thumbnail gave up reads outdated once a thumbnail is made (`runtime-store.ts:124-127`).

## Invariants

- One resolved `DocumentTheme` carries every drawn value; built-ins and Library themes are values of that shape (`theme.ts:10-15`).
- A project keeps its own copy of a Library theme; editing or deleting the Library row never changes a made or queued document, and nothing cascades (`model.ts:26-28`, `0016-document-themes.sql`).
- The document never calls a provider and never blocks narration, images or the video (`graph.ts:4-8`).

## Outcomes & side effects

- Success: `document.pdf` on the project page's Document section with Download PDF (main action), Open folder and Open PDF, which serves the revision file with `?inline=1` as `Content-Disposition: inline` (`packages/web/src/project/body-document.tsx:10-42`, `packages/app/src/edge/http/revision-files.ts:48-53`). A `stage.completed` telemetry count with `{ stage: "document" }` (`runtime-document.ts:87`).
- Failure: stage `failed` with the message above; other stages continue.

## Dimensions not in play

- Money: nothing is charged; no provider call.
- Concurrency across users: single-user local app; theme edits have no locking beyond the unique name index.
- Chapter images inside the PDF: not implemented; the renderer draws only the cover image (`render.ts:77-78`).
