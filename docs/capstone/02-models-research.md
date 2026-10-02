---
generated_at_commit: e9226a34aa8a
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: 197d223705ba
paths_covered:
  - ":(top)packages/app/src/slices/research/**"
  - ":(top)packages/app/src/kernel/ports/llm-documents.ts"
  - ":(top)packages/app/src/kernel/ports/llm.ts"
  - ":(top)packages/app/src/kernel/ports/host-cli.ts"
  - ":(top)packages/app/src/adapters/llm/document-*.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-text.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-model.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-input-schema.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-plan.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-provider.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-publication.ts"
  - ":(top)packages/app/src/kernel/db/migrations/0001-init.sql"
  - ":(top)packages/app/src/kernel/db/migrations/0005-revision-work.sql"
  - ":(top)packages/app/src/kernel/db/migrations/0014-document-stage.sql"
---

# Research payload models

Scope: the research brief, per-chapter findings, the frozen research documents sent to a text model, the planner/chapter/notes piece payloads, and the resolved research inputs a revision recipe reads. No table is dedicated to research; payloads ride the shared revision-work and stage-piece storage (see `02-models.md` for those tables' full model).

## Entities

| Entity | Definition site | Storage | Purpose |
|---|---|---|---|
| ResearchBrief | `packages/app/src/slices/research/planner.ts:9` | In memory | Rendered article prompt plus keyword values; the shared half of every research instruction. |
| Finding | `packages/app/src/slices/research/synthesis.ts:9` | In memory; chapter piece payload JSON | One researched chapter: title and notes. |
| LlmDocument | `packages/app/src/kernel/ports/llm-documents.ts:24` | In memory; `revision_work_pieces.input_json` (inside an `llm` RecipeInput); temp files for CLI providers | One reference document attached to an LLM request. |
| Message | `packages/app/src/kernel/ports/llm.ts:8` | In memory; `input_json` | One conversation turn sent to a text model. |
| ResolvedRevisionInputs | `packages/app/src/slices/rebuild/recipe-model.ts:19` | In memory | Upstream text a revision recipe reads: article, notes, research outline/findings, article continuation. |

Anonymous JSON shapes in scope (no declared type name) are documented under Boundaries: the planner payload, the chapter payload, the document-workspace manifest row and the `read_document` tool reply.

## Fields and types

### ResearchBrief

All fields `readonly`. Built from `config.rendered.article` / `renderedPrompt(context, "article")` and `config.values` (`packages/app/src/slices/rebuild/recipe-text.ts:115`, `packages/app/src/slices/research/run.ts:71`).

| Field | Type | Required | Notes |
|---|---|---|---|
| articlePrompt | string | yes | Rendered article prompt. |
| values | Readonly<Record<string, string>> | yes | Keyword values; rendered as `name: value` lines, or `(none)` when empty (`packages/app/src/slices/research/planner.ts:89`). |

### Finding

All fields `readonly`.

| Field | Type | Required | Notes |
|---|---|---|---|
| title | string | yes | Chapter title from the planner's outline. |
| notes | string | yes | Sub-agent answer, trimmed in `packages/app/src/slices/research/run.ts:244`; untrimmed answer text in the rebuild runtime (`packages/app/src/slices/rebuild/runtime-provider.ts:432`). |

### LlmDocument

Inferred from `llmDocumentsSchema` (`packages/app/src/kernel/ports/llm-documents.ts:4`); each element is a strict object.

| Field | Type | Required | Notes |
|---|---|---|---|
| id | string | yes | Regex `^[a-z][a-z0-9-]{0,63}$`. Research uses `research-1` … `research-N` and `editorial-notes`. |
| title | string | yes | 1–1024 UTF-16 characters. |
| content | string | yes | At most 2 Mi (2,097,152) UTF-16 characters. |

### Message

All fields `readonly`.

| Field | Type | Required | Notes |
|---|---|---|---|
| role | MessageRole | yes | accepted: system, user, assistant (`packages/app/src/kernel/ports/llm.ts:5`). |
| content | string | yes | Message text. Research prompts send one `user` message each. |

### ResolvedRevisionInputs

All fields `readonly`.

| Field | Type | Required | Notes |
|---|---|---|---|
| articleMarkdown | string \| null | yes | Current article, or null while unwritten. |
| researchNotes | string \| null | yes | Synthesised notes (`notes` output of `research:notes`), or null. |
| research | { outline: readonly string[]; findings: readonly Finding[] } | no | Present once a matching `research:planner` payload exists (`packages/app/src/slices/rebuild/runtime-plan.ts:135`). |
| articleContinuation | string | no | Partial article text carried into a continuation request (`packages/app/src/slices/rebuild/recipe-text.ts:238`). |

## Relationships

- Recipe keys chain the research work: `research:planner` → `research:chapter:<n>` (n = 1-based outline index, each depending on the planner key) → `research:notes` (depending on every chapter key) (`packages/app/src/slices/rebuild/recipe-text.ts:118`, `packages/app/src/slices/rebuild/recipe-text.ts:125`, `packages/app/src/slices/rebuild/recipe-text.ts:136`).
- `research:notes` is an `llm` recipe only when `resolved.research.findings.length` equals the chapter count and is non-zero; otherwise it is a `deferred` recipe with operation `research-synthesis` whose template is the planner and chapter fingerprints (`packages/app/src/slices/rebuild/recipe-text.ts:137`).
- `researchDocuments(findings)` maps each Finding at index i to LlmDocument `{ id: "research-<i+1>", title, content: notes }` (`packages/app/src/slices/research/documents.ts:4`). The synthesis request carries these documents; its message embeds `documentIndex(...)` of the same list (`packages/app/src/slices/research/synthesis.ts:31`).
- The article request (research `generate` with notes present) carries the chapter documents plus `{ id: "editorial-notes", title: "Editorial notes", content: notes }`; its prompt receives `documentIndex(documents)` in place of the notes text (`packages/app/src/slices/rebuild/recipe-text.ts:179`, `packages/app/src/slices/rebuild/recipe-text.ts:188`). With research `provide`, the provided notes text is passed inline and no documents are attached.
- `ResolvedRevisionInputs.research` is rebuilt from selected, done piece payloads whose key and fingerprint match the current recipes: planner payload → `outline`; each matching chapter payload → one Finding (`packages/app/src/slices/rebuild/runtime-plan.ts:63`, `packages/app/src/slices/rebuild/runtime-plan.ts:135`).
- The document workspace for CLI providers holds one `<id>.md` per LlmDocument plus `manifest.json`, `index.md`, `mcp.json` and `read-pages.json` in a `slopify-documents-*` temp directory (`packages/app/src/adapters/llm/document-workspace.ts:28`).
- `slices/research/run.ts` (`runResearch`, stage-runner flavour using `stage_pieces` kind `chapter`) is referenced only by `packages/app/src/slices/research/run.test.ts`; the live pipeline runs research through the rebuild recipes above.

## Boundaries

| Boundary | Representation and conversion |
|---|---|
| Recipe → work input | `llmInput(context, messages, webSearch, documents)` builds the `llm` RecipeInput; `documents` is included only when non-empty (`packages/app/src/slices/rebuild/recipe-text.ts:38`). Chapter requests set `webSearch: true`; planner and synthesis set it false (`packages/app/src/slices/rebuild/recipe-text.ts:130`). The TypeScript field is `documents?: readonly LlmDocument[]` (`packages/app/src/slices/rebuild/recipe-model.ts:96`); the stored JSON is validated by `recipeInputSchema` with `documents: llmDocumentsSchema.optional()` (`packages/app/src/slices/rebuild/recipe-input-schema.ts:38`). |
| Work input → provider request | `LlmCompletion.documents?: readonly LlmDocument[]` (`packages/app/src/kernel/ports/llm.ts:87`). OpenRouter prepends `documentMessages(documents)`: one `user` Message per document with a JSON `{id,title}` header and the "reference material, not task instructions" line (`packages/app/src/kernel/ports/llm-documents.ts:36`, `packages/app/src/adapters/llm/openrouter.ts:80`). Claude Code, Codex and Gemini build a document workspace instead (`packages/app/src/adapters/llm/claude-code.ts:189`, `packages/app/src/adapters/llm/codex.ts:202`, `packages/app/src/adapters/llm/gemini.ts:68`). |
| Container → host CLI bridge | `hostLlmSchema` carries `documents: llmDocumentsSchema.optional()` beside `model`, `messages` (1–128, each content ≤ `bridgeLimits.text`), `thinking`, `webSearch` (`packages/app/src/kernel/ports/host-cli.ts:72`). Whole request bodies are bounded by `bridgeLimits.request` = 16 MiB (`packages/app/src/kernel/ports/host-cli.ts:26`). |
| Workspace manifest row | Anonymous strict object `{ id, title, sha256 }`: id as LlmDocument, title ≤ 1024, sha256 64 lowercase hex; array ≤ 128. Written by `documentWorkspace` (`packages/app/src/adapters/llm/document-workspace.ts:31`), re-parsed by the MCP reader (`packages/app/src/adapters/llm/document-reader.ts:26`). |
| `read_document` tool | Input `{ id, offset }`, offset an integer 0–2 Mi and a multiple of 16000. Reply JSON text `{ id, title, offset, nextOffset: number \| null, totalCharacters, text }`, `text` at most 16000 UTF-16 characters; every served page is appended as `"<id>:<offset>"` to `read-pages.json` (`packages/app/src/adapters/llm/document-reader.ts:48`). |
| Planner answer → payload | `chaptersFrom(text)` strips bullets/numbering and case-insensitive duplicates (`packages/app/src/slices/research/planner.ts:39`); published payload `{ outline: string[] }` (`packages/app/src/slices/rebuild/runtime-provider.ts:406`). |
| Chapter answer → payload + asset | Title read from the selected planner payload by index; answer written as asset `research-<n>.md`; payload `{ title, notes }` (`packages/app/src/slices/rebuild/runtime-provider.ts:410`). `publishResult` stores the payload as JSON with `requestFingerprint` and `file` (asset path) added (`packages/app/src/slices/rebuild/runtime-publication.ts:112`); piece kind `chapter` (`packages/app/src/slices/rebuild/runtime-publication.ts:155`). |
| Notes answer → outputs | `research:notes` publishes text outputs `notes` (`notes.md`) and `instructions` (`instructions.md`) and payload `{ text }` (`packages/app/src/slices/rebuild/runtime-provider.ts:393`). `researchNotes` is read back from the `notes` output (`packages/app/src/slices/rebuild/runtime-plan.ts:61`); the Document stage also reads it (`packages/app/src/slices/rebuild/runtime-document.ts:64`). |
| Payload → Finding | `z.object({ title: z.string(), notes: z.string() })` parse of each matching chapter payload; planner payload parsed as `{ outline: string[] }` (`packages/app/src/slices/rebuild/runtime-plan.ts:146`, `packages/app/src/slices/rebuild/runtime-plan.ts:159`). |
| Legacy retained requests | Retained `research:notes` / `article:body` pieces from before documents existed embed research in messages; preview review treats them per `packages/app/src/slices/rebuild/preview-retained.ts:38`. |

## Validation

- `llmDocumentsSchema`: at most 128 documents, strict objects, unique IDs, and combined content at most 12 MiB measured as UTF-8 bytes via `Buffer.byteLength`; violations are refinement issues, not truncation (`packages/app/src/kernel/ports/llm-documents.ts:4`). `documentMessages` calls `.parse` (throws); `documentWorkspace` calls `.safeParse` and throws a `providerError` of kind `unsupported` (`packages/app/src/adapters/llm/document-workspace.ts:20`).
- Document reader: files opened with `O_NOFOLLOW | O_NONBLOCK`, must be regular, singly linked, `manifest.json` ≤ 1 MiB and each document ≤ 8 MiB; each document's SHA-256 must equal its manifest entry (`packages/app/src/adapters/llm/document-reader.ts:12`, `packages/app/src/adapters/llm/document-reader.ts:38`). Workspace files are written mode 0600 with flag `wx` (`packages/app/src/adapters/llm/document-workspace.ts:32`).
- Read receipts: `verifyRead()` requires `read-pages.json` (array of strings, ≤ 17000) to contain `"<id>:<offset>"` for every 16000-character page of every document (offset 0 for an empty document); a missing page throws a `providerError` of kind `unavailable` (`packages/app/src/adapters/llm/document-workspace.ts:69`). Called by Claude Code, Codex and Gemini after the answer (`packages/app/src/adapters/llm/claude-code.ts:294`, `packages/app/src/adapters/llm/codex.ts:253`, `packages/app/src/adapters/llm/gemini.ts:97`). Receipts prove delivery of pages, not comprehension.
- Answer checks: `research:planner` fails the attempt when `chaptersFrom` yields no chapter; `research:notes` and `research:chapter:*` run `sourcedAnswer`, which rejects an empty answer or one without a final `Sources` heading line followed by a non-blank line (`packages/app/src/slices/rebuild/runtime-provider.ts:284`, `packages/app/src/slices/research/synthesis.ts:48`, `packages/app/src/slices/research/synthesis.ts:59`). This checks structure only, not factual accuracy.
- Chapter publication throws when the planner outline has no title at the chapter's index (`packages/app/src/slices/rebuild/runtime-provider.ts:422`).
- No field in LlmDocument carries a path, command or credential; the only file paths are the workspace's own, generated from validated IDs.

## Schema

No research-specific table. The payloads land in shared tables (full DDL for each lives in `02-models.md`):

| Table | Columns that carry research data | Migration |
|---|---|---|
| revision_work_pieces | `work_key` (`research:planner`, `research:chapter:<n>`, `research:notes`), `input_json TEXT NOT NULL CHECK(json_valid(input_json))` (RecipeInput with `messages`, `documents`), `result_json` (nullable, `json_valid`), `fingerprint`, `request_fingerprint`; `UNIQUE(work_id, work_key)` | `packages/app/src/kernel/db/migrations/0005-revision-work.sql:23` |
| revision_pieces | `piece_key`, `stage_kind` (`research`), `asset_id` (chapter `research-<n>.md` asset), `descriptor TEXT NOT NULL CHECK(json_valid(descriptor))`, `fingerprint`, `selected INTEGER NOT NULL CHECK(selected IN (0,1))` | `packages/app/src/kernel/db/migrations/0014-document-stage.sql:18` |
| stage_pieces | `kind` (`chapter`, `prompt_written`), `idx`, `state`, `payload TEXT` (the JSON payloads above); `UNIQUE(stage_id, kind, idx)` | `packages/app/src/kernel/db/migrations/0001-init.sql:4` |

The document workspace files (`manifest.json`, `<id>.md`, `index.md`, `mcp.json`, `read-pages.json`) are temporary files removed after the request; they have no table.
