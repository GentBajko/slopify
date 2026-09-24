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

# Research handoff architecture

Scope: research, article input and host-provider handoff in 1.5.0. Other subsystems retain their reference in [01-architecture.md](01-architecture.md).

## Layers and boundaries

Research builders return prompts and an ordered document index. Revision recipes freeze original reports, model settings and messages. The runner owns provider attempts and revision publication. Adapters implement the optional document contract in kernel/ports/llm.ts and llm-documents.ts; no adapter imports a slice.

| Component | Responsibility |
|---|---|
| slices/research/documents.ts | Stable research-N IDs and unchanged reports |
| slices/rebuild/recipe-text.ts | Editor gets originals; article and continuations get originals plus editorial-notes |
| slices/rebuild/runtime-provider.ts | Publish immutable research-N.md assets and compatible title/notes payloads |
| adapters/llm/document-workspace.ts | Validate private request files and verify complete read receipts |
| adapters/llm/document-reader.ts | One fixed stdio MCP read_document tool; no arbitrary paths, shell or network |
| host-cli/runtime.ts | Run host CLIs with their captured environment; return normalized events |

## Provider delivery

Docker transfers validated contents over the authenticated host socket, never container or arbitrary host paths. The host materializes request-only files with private permissions. CLI prompts use stdin; report bodies are not arguments. Each adapter permits only Slopify's reader and optional explicit web search.

Claude document calls use a restricted, strict-MCP profile because safe mode disables explicitly supplied MCP servers. Hooks, local memory, plugins and general file tools remain excluded; final-result prose excludes tool-progress messages. Codex ignores user configuration, disables local tools/connectors and requires the reader. Gemini uses a private CLI home with only the host authentication choice and a supported reference to its existing OAuth file, excluding user hooks, MCP servers and context. Managed installation policy is not bypassed.

OpenRouter sends complete, separately labelled reference messages in its HTTP body. Documents remain subject to model context limits; the app does not silently summarize or truncate originals.

## Publication and cleanup

New chapter assets use existing revision ownership and download routes. Legacy payloads remain reusable without migration or generation. Synthesis still publishes notes.md and the instruction audit. Exact documents remain in reviewed recipes and audits; input-cost character counts include them.

Each CLI must request every supplied page before its result is accepted. Missing reads or uncertain delivery require review without automatic replay. Private files are removed after the child stops, including cancellation, launch failure and abandoned iteration. Original project assets are untouched.

## Frontend

No new screen or attachment browser. Existing rebuild review shows labelled document contents; existing revision piece downloads serve new chapter assets.
