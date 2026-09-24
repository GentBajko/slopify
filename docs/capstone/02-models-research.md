---
generated_at_commit: 735cf5b
generated_date: '2026-09-25'
content_hash: bf51c4bfab16
absorbed_from: features/2026-09-24-research-documents@2026-09-25
paths_covered:
  - :(top)packages/app/src/slices/research/**
  - :(top)packages/app/src/slices/article/**
  - :(top)packages/app/src/slices/rebuild/**
  - :(top)packages/app/src/adapters/llm/**
  - :(top)packages/app/src/adapters/host-cli/**
  - :(top)packages/app/src/host-cli/**
  - :(top)packages/app/src/kernel/ports/llm*.ts
  - :(top)packages/app/src/kernel/ports/host-cli.ts
  - :(top)packages/app/src/edge/http/host-cli.ts
---

# Research handoff models

The document contract supplements existing revision/work/output entities. No database migration or dedicated document table is needed.

## Entities

| Entity | Fields | Ownership |
|---|---|---|
| ResearchBrief | articlePrompt, values | Request input |
| Finding | title, notes | Complete retained chapter payload |
| LlmDocument | id, title, content | Frozen provider request |
| Message | role, content | Conversation text |
| ResolvedRevisionInputs | articleMarkdown, researchNotes, optional outline/findings and articleContinuation | Selected revision records |

Definitions: slices/research/planner.ts, synthesis.ts, kernel/ports/llm-documents.ts, kernel/ports/llm.ts and slices/rebuild/recipe-model.ts.

## Document validation

The strict schema accepts at most 128 documents with unique IDs matching `^[a-z][a-z0-9-]{0,63}$`, titles of 1–1024 UTF-16 characters, at most 2 Mi UTF-16 characters per document and 12 MiB combined UTF-8 content. Host body limits also apply. Violations are errors, not clipping. No path, tool command or credential field crosses this contract.

Reports use research-1 through research-N in outline order; consolidation uses editorial-notes. Empty collections are omitted from recipes, preserving planner/chapter fingerprints.

## Reader model

Generated-ID files have a manifest with title and SHA-256. The reader validates regular, single-link files and hashes, then preloads only allowed documents. read_document accepts ID and offset, returns at most 16000 UTF-16 characters plus nextOffset and totalCharacters, and records pages. Every page of every supplied document must have been requested before final output is accepted.

Receipts check delivery, not model comprehension or context capacity. Source titles and contents are reference material, not instructions.

## Durable relationships

Matching research:chapter:N payloads feed research:notes. Article writing waits for editorial notes and receives originals plus notes, including continuations. Provided-research and research-off behavior is unchanged.

New chapters publish an immutable asset plus the existing title/notes payload. Legacy payload-only reports materialize into the same request documents. Reviewed input_json and fingerprints bind content; article result_json retains completed parts. Existing revision download rules enforce ownership.

## Answer validation

Chapter and synthesis text must be nonempty and contain a Sources heading with content. This checks structure, not factual accuracy.
