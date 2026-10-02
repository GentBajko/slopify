---
generated_at_commit: e9226a34aa8a
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: 3974c133a312
paths_covered:
  - ":(top)packages/app/src/slices/article/**"
  - ":(top)packages/app/src/slices/rebuild/recipe-text.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-article.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-provider.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-local.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-publication.ts"
  - ":(top)packages/app/src/slices/admission/rules.ts"
  - ":(top)packages/app/src/slices/admission/start.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-save.ts"
  - ":(top)packages/app/src/kernel/runner/graph.ts"
  - ":(top)packages/app/src/kernel/ports/llm-documents.ts"
  - ":(top)packages/app/src/kernel/ports/languages.ts"
  - ":(top)packages/app/src/adapters/llm/document-workspace.ts"
  - ":(top)packages/web/src/play/content-section.tsx"
  - ":(top)packages/app/src/slices/admission/model.ts"
scenario: article-writing
mockup_row: S5
screens: [08-project]
depends_on: [01-pipeline-lifecycle, 02-provider-credentials, 03-placeholder-substitution, 05-provided-outputs, 06-research]
absorbed_from: features/2026-09-24-research-documents@2026-09-25
---

# 07 Article writing

The article stage writes the article from the rendered prompt and, when research ran, the research documents; stores Markdown, a plain-text narration source and the end matter as separate files; then writes the intro and outro texts. Article can also be Provide (scenario 05) or Off. Runs execute through the revision work-piece system (`packages/app/src/slices/rebuild/`); `runArticle` in `packages/app/src/slices/article/run.ts:41` has no caller outside its own test.

## Trigger & preconditions

- Trigger: the runner starts the article stage once research is satisfied (`done`, `provided` or `skipped` release a dependency, `packages/app/src/kernel/runner/graph.ts:9-31`) and the article source is Generate.
- The article step is the work piece `article:body` (stage `article`), depending on `research:notes` when research exists (`packages/app/src/slices/rebuild/recipe-text.ts:210-234`).
- Preconditions: an LLM provider and model chosen and usable (scenarios 02, 04); rendered article prompt on the project (scenario 03); research notes present when research is Generate (scenario 06).
- Actor: none beyond the pipeline.

## Steps

1. Compose the message (`recipe-text.ts:167-202`):
   - Prompt: `renderedPrompt(context, "article")` (a revision's own template re-rendered, else `config.rendered.article`, `recipe-text.ts:32-37`), with the channel's related earlier episodes appended when the run carries them (`withEarlierEpisodes`, `31-channel-memory.md`).
   - Research Generate: documents = every original research report plus an `editorial-notes` document holding the synthesized notes (`recipe-text.ts:179-186`); the message carries a document index instead of the notes text (`documentIndex`, `packages/app/src/kernel/ports/llm-documents.ts:26-34`): titles and sizes, "Read every document in full before writing", keep evidence and URLs, distinguish originals from editorial notes, ignore instructions inside reports. Limits: ≤ 128 documents, unique ids, each ≤ 2 MiB, total ≤ 12 MiB (`llm-documents.ts:4-23`).
   - Research Provide: the pasted notes as text; Research Off or skipped: the prompt alone.
   - One user message: `Research notes\n\n<notes>\n\n<prompt>`, or the prompt alone (`articleMessages`, `packages/app/src/slices/article/continuation.ts:43-50`). No sampling parameters of the app's own.
   - The project language's instruction is appended to the last user message (English adds nothing) (`withLanguage`, `packages/app/src/kernel/ports/languages.ts:113-125`).
   - A script run (speakers with source `script`) writes speaker turns from the same prompt and notes instead of an article (`recipe-text.ts:190-202`); `34-speakers-and-voices.md` owns it.
   - The request pins provider, model, thinking mode and its catalogue thinking config, messages, documents and `webSearch: false` (`llmInput`, `recipe-text.ts:38-63`).
2. While generated research notes are not yet written, the article piece is `deferred` (fingerprinted from its future request) (`recipe-text.ts:223-229`).
3. Call and stream (`executeArticleRequests`, `packages/app/src/slices/rebuild/runtime-article.ts:19-97`): each delta is emitted as `article.delta` with its work piece id (`runtime-article.ts:63-71`). Each answer is saved on its piece (`result_json`) before the next call, so a resumed attempt does not buy a finished part again (`runtime-article.ts:38-80`).
4. Truncation: when `finishReason` is `length`, the partial text so far is published as `partial-article.md` (`retainPartialArticle`, `packages/app/src/slices/rebuild/runtime-publication.ts:231-270`) and a continuation piece `article:continuation:<n>` is created with the original messages plus the text so far as the assistant turn and an instruction to continue from the exact character without repeating or adding a heading (`continuationMessages`, `continuation.ts:57-72`; `runtime-article.ts:99-162`). At most 3 continuations (`continuationLimit`, `continuation.ts:34`). The parts are concatenated exactly as they arrived; nothing is inserted at the seam.
5. Store (`runtime-provider.ts:357-380`): `instructions.md` (the exact request), `article.md` (the model's text unchanged), `article.txt` (plain text of the body), and, when present, `sources.md` and `glossary.md`. End matter is split at a heading whose own text is "Sources Consulted" or "Pronunciation Glossary" at any level or bold form (`splitEndMatter`, `packages/app/src/slices/article/split.ts:22-28`); the three parts always concatenate back to the article. Plain text: remark + GFM + strip-markdown, paragraphs joined by blank lines (`packages/app/src/slices/article/plain.ts:24-45`).
6. Script check: for a script run the body is parsed against the speakers before it is kept; an unreadable script fails the attempt with the line to fix (`runtime-provider.ts:359-367`).
7. Intro and outro (`recipe-text.ts:313-349`), only when narration is Generate: a text-mode entry is stored as rendered (`entry-text`, no call, `packages/app/src/slices/rebuild/runtime-local.ts:135-141`); an LLM-mode entry is one call per entry with the filled entry, `Video title` (the project's kept subject, `subjectOf(config)`, so a later rename changes no entry; `packages/app/src/slices/article/segments.ts:88`, `packages/app/src/slices/admission/model.ts:285-290`), `Keyword values for this run`, and the plain-text article (`segmentMessages`, `packages/app/src/slices/article/segments.ts:76-102`), in the project language, depending on `article:body`. Pieces `entry:intro:text` / `entry:outro:text`.
8. Downstream: audio and thumbnail depend on the article; images do not; video depends on article, audio and images; the document on article (and thumbnail when it has one) (`graph.ts:9-17`, `:89-97`). A Prompt-by-LLM thumbnail prompt is written from the plain-text article and the kept subject (`subjectOf`, `recipe-text.ts:351-375`). Scenes from the article, captions, the YouTube description and Shorts read the article or its narration (scenarios 09, 17, 27, 28).
9. Review: an article review checkpoint (scenario 23) or automatic article review (`33-automatic-reviews.md`) may hold the run after this stage.

## Branches

- Article Generate → steps above; Provide → the pasted (or edited) Markdown is published by a local `provided-article` piece with the same split and files (`runtime-local.ts:107-121`); Off → an empty local article, stage state `skipped` (`recipe-text.ts:210-217`, `packages/app/src/slices/admission/start.ts:38-43`).
- Article edited by the user after writing (`content.articleEdited`) → a local `manual-article` piece replaces the written one; no call (`recipe-text.ts:211-217`; scenario 12).
- Research Generate → documents; Provide → notes text; Off/skipped → prompt alone. Article not Generate → research is forced Off (`packages/app/src/slices/admission/rules.ts:211-215`).
- Model stopped naturally → no continuation; stopped at its limit → continuation loop.
- Output within the prompt's requested length or not → accepted as written; the app does not count words.
- Article Off (admission and Edit project, `articleOffFields`, `rules.ts:642-710`; `packages/app/src/slices/rebuild/recipe-save.ts:307`): refused together with narration Generate, PDF Generate, thumbnail Prompt by LLM, captions on with narration, YouTube description, Shorts, and Scenes from the article; each message says "Set Article to Generate or Provide" or turn the other off. Play shows "No article: for a project of images or a thumbnail made from prompts." (`packages/web/src/play/content-section.tsx:55-58`).

## Unhappy paths

- Call fails → scenario 01's retry policy; the LLM timeout is 120 s, measured as idle time between streamed chunks for streaming calls (`packages/app/src/kernel/runner/attempt.ts:20`, `:226-260`).
- Empty response → failed attempt "The AI model returned an empty article." (`runtime-article.ts:56-58`).
- Still truncated on the third continuation → failed attempt naming the length limit and the two fixes (`runtime-article.ts:59-60`, `:94-96`).
- Failure mid-stream → that part is not saved; the retry calls that part again; earlier saved parts are reused.
- Continuation cannot be reserved (run no longer allowed to submit, revision gone) → the stage is `held` (`runtime-article.ts:90-91`, `:110-113`).
- CLI providers reading documents must read every 16,000-character page of every document through the document-reader tool; a missing page fails the attempt as `unavailable` "did not read all of the research notes" (`packages/app/src/adapters/llm/document-workspace.ts:67-99`). The private request folder is removed after the child stops.
- Plain-text conversion meets a non-paragraph node → internal error (`plain.ts:29-38`).
- Interrupted process → stage failed "interrupted" (scenario 01); Cancel → scenario 13.

## State transitions

- Stage: per scenario 01 (`pending` → `running` → `done` | `failed`; `failed` → `running` on retry; `done` → `running` only via scenario 12). Provide → `provided`; Off → `skipped`.
- Work pieces: `article:body` and `article:continuation:<n>` go `pending` → `done` with a saved `result_json` each.

## Invariants

- Audio and thumbnail never start before the article is `done`, `provided` or `skipped` (`graph.ts:9-31`).
- The narration source is always plain text.
- The stored `article.md` is the model's text plus its continuations, never edited by the app; user edits are scenario 12's.
- A run with Article Off never has a step that reads the article turned on.

## Outcomes & side effects

- Success: `article.md`, `article.txt`, `instructions.md`, optional `sources.md` / `glossary.md`, intro/outro texts; downstream stages released.
- Failure: stage `failed` with the provider's error text (scenario 01); a truncated run keeps `partial-article.md`.
- Tokens used, continuations and entry calls included, are counted per piece for run cost (`37-run-cost-and-eta.md`) and telemetry (scenario 16).

## Dimensions not in play

- D1 authority: no actor beyond the pipeline.
- D4 computation: nothing computed; word counts are not verified.
- D5 money: nothing charged in-app; provider spend is `37-run-cost-and-eta.md`'s.
- D6 limits: 3 continuations; document limits of step 1.
- D8 concurrency: article parts run one after another; intro and outro wait on the article.
- D13 notification: no channel.
