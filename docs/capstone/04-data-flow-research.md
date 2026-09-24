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

# Research handoff data flow

Scope: the 1.5.0 document-based handoff. General flows remain in [04-data-flow.md](04-data-flow.md).

## Lifecycle

1. The planner returns an outline from the article brief. Chapter request identities remain unchanged.
2. Each independent web-grounded chapter publishes its full report as a revision-owned research-N.md asset and title/notes payload.
3. Once all matching chapters exist, editorial consolidation receives an index and every original. This remains an LLM editorial call, not local concatenation.
4. The writer gets the task, index, originals and separate editorial-notes document. Continuations retain those documents.
5. API adapters send full labelled text in HTTP messages. Docker sends typed contents to the host; each CLI reads private files through the fixed MCP reader. Prompts use stdin instead of oversized argv.
6. The adapter checks stdin delivery and page receipts before accepting final output, stops the child and removes request files.

Implementation: slices/rebuild/{recipe-text,runtime-plan,runtime-provider,runtime-article}.ts, slices/research/{documents,synthesis}.ts and adapters/llm/{document-workspace,document-reader,claude-code,codex,gemini,openrouter}.ts.

## State and authority

Exact documents are frozen in recipes, counted in input-cost review and retained in instruction audits. Chapter assets follow immutable publication rules. The helper receives no project authority and cannot admit work; attempts and publication stay in the container runner.

Legacy reports remain reusable. New editor/article inputs change those requests' fingerprints without changing chapter identities. Rebuild review reuses completed research and asks approval for downstream work. Startup performs no generation migration.

## Failure paths

Missing chapters keep consolidation deferred. Unread documents, invalid IDs, excessive size, changed content and failed stdin delivery fail explicitly. A successful CLI exit alone does not prove delivery. Uncertain submissions require review, not automatic retry.

Failed consolidation leaves originals intact and the article waiting for notes. Model context limits still apply. Cancellation or abandoned streaming stops the child before cleanup.

## Verification

Recipe and composed-revision tests cover full originals, editorial retention, continuations, asset downloads and stable chapter fingerprints. Host integration uses all three fake CLI executables with the real reader and 300KB Unicode content. A private copy of the existing user database proved all 13 legacy reports reusable; six existing image assets were recovered without provider calls.
