---
generated_at_commit: d83482c1175e
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: 9451d5a23261
paths_covered:
  - ":(top)packages/app/src/slices/research/**"
  - ":(top)packages/app/src/slices/article/**"
  - ":(top)packages/app/src/slices/rebuild/recipe-text.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-plan.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-provider.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-article.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-publication.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-run.ts"
  - ":(top)packages/app/src/adapters/llm/**"
  - ":(top)packages/app/src/adapters/host-cli/**"
  - ":(top)packages/app/src/host-cli/**"
  - ":(top)packages/app/src/kernel/ports/llm*.ts"
  - ":(top)packages/app/src/kernel/ports/host-cli.ts"
  - ":(top)packages/app/src/kernel/ports/image.ts"
  - ":(top)packages/app/src/kernel/runner/attempt.ts"
  - ":(top)packages/app/src/edge/http/host-cli.ts"
---

# Research handoff data flow

Scope: planner → per-chapter research → editorial synthesis → article writer, and how research documents reach API and CLI models. Runner, queue, publication and event flows in general are in [04-data-flow.md](04-data-flow.md).

## Lifecycles

1. **Recipes.** With research `generate`, `textRecipes` plans `research:planner` (LLM, brief = article prompt + values), one `research:chapter:N` per outline title (LLM with `webSearch` true, depends on the planner), and `research:notes`. `research:notes` is a `deferred` piece until every chapter's finding exists; then it is an LLM synthesis whose input carries `synthesisMessages` plus `researchDocuments(findings)` (`packages/app/src/slices/rebuild/recipe-text.ts:112`, `packages/app/src/slices/rebuild/recipe-text.ts:118`, `packages/app/src/slices/rebuild/recipe-text.ts:125`, `packages/app/src/slices/rebuild/recipe-text.ts:135`, `packages/app/src/slices/rebuild/recipe-text.ts:157`, `packages/app/src/slices/rebuild/recipe-text.ts:38`). Research `provide` plans a local `provided-notes` piece instead (`packages/app/src/slices/rebuild/recipe-text.ts:163`).
2. **Outline and findings are read back from saved payloads.** `matchingResearch` reads the saved planner payload whose key and fingerprint match the current recipe, re-derives the chapter recipes from its outline, and collects each chapter payload `{title, notes}` whose fingerprint matches (`packages/app/src/slices/rebuild/runtime-plan.ts:135`).
3. **Chapter publication.** The planner publishes `{outline}` from `chaptersFrom(answer)`; each chapter writes `research-N.md` as an asset and publishes `{title, notes}` with it; `research:notes` publishes `notes.md` plus `instructions.md` (`packages/app/src/slices/rebuild/runtime-provider.ts:393`, `packages/app/src/slices/rebuild/runtime-provider.ts:406`, `packages/app/src/slices/rebuild/runtime-provider.ts:410`, `packages/app/src/slices/rebuild/runtime-provider.ts:426`).
4. **Document set.** `researchDocuments` maps findings to `research-1…research-N` documents (title = chapter title, content = notes) (`packages/app/src/slices/research/documents.ts:4`). The synthesis is an editorial pass told to select and organize, not concatenate (`packages/app/src/slices/research/synthesis.ts:14`). The article writer receives every original chapter document plus an `editorial-notes` document, and its prompt carries `documentIndex` instead of pasted notes; without synthesized notes the article piece stays `deferred` (`packages/app/src/slices/rebuild/recipe-text.ts:179`, `packages/app/src/slices/rebuild/recipe-text.ts:188`, `packages/app/src/slices/rebuild/recipe-text.ts:227`). Script runs (multi-voice) use the same notes/index with `scriptMessages` (`packages/app/src/slices/rebuild/recipe-text.ts:196`).
5. **Article and continuations.** `article:body` runs through `executeArticleRequests`: each answer that stops with `finishReason === "length"` is retained as partial output and followed by an `article:continuation:<part>` piece carrying the same documents, up to `continuationLimit` (3) continuations; text streams to pages as `article.delta` (`packages/app/src/slices/rebuild/runtime-provider.ts:61`, `packages/app/src/slices/rebuild/runtime-article.ts:19`, `packages/app/src/slices/rebuild/runtime-article.ts:66`, `packages/app/src/slices/rebuild/runtime-article.ts:84`, `packages/app/src/slices/rebuild/runtime-article.ts:99`, `packages/app/src/slices/article/continuation.ts:34`, `packages/app/src/slices/rebuild/recipe-text.ts:242`).
6. **Delivery to API models.** OpenRouter prepends `documentMessages(documents)`: one user message per document, labelled with its ID/title and marked as reference material (`packages/app/src/adapters/llm/openrouter.ts:80`, `packages/app/src/kernel/ports/llm-documents.ts:36`).
7. **Delivery to local CLIs.** Claude Code, Codex and Gemini call `documentWorkspace`: it validates the set, writes each document, `manifest.json` (with SHA-256), `index.md` and an `mcp.json` into a private `mkdtemp` directory (files mode 0600, exclusive create), and configures the `slopify_research` MCP server running `document-reader` with `read_document` as the only document tool; the model is told to read every page (`packages/app/src/adapters/llm/document-workspace.ts:18`, `packages/app/src/adapters/llm/document-workspace.ts:28`, `packages/app/src/adapters/llm/document-workspace.ts:56`, `packages/app/src/adapters/llm/document-workspace.ts:68`, `packages/app/src/adapters/llm/claude-code.ts:111`, `packages/app/src/adapters/llm/claude-code.ts:189`, `packages/app/src/adapters/llm/codex.ts:202`, `packages/app/src/adapters/llm/gemini.ts:68`, `packages/app/src/adapters/llm/gemini-workspace.ts:95`). The prompt goes to the CLI on stdin, never argv, and is refused at 8 MiB (`packages/app/src/adapters/llm/run-cli.ts:60`, `packages/app/src/adapters/llm/run-cli.ts:192`). Before accepting the final answer, the adapter confirms stdin was fully written and `verifyRead` checks a receipt for every 16 000-character page of every document in `read-pages.json` (`packages/app/src/adapters/llm/claude-code.ts:263`, `packages/app/src/adapters/llm/claude-code.ts:294`, `packages/app/src/adapters/llm/codex.ts:252`, `packages/app/src/adapters/llm/codex.ts:253`, `packages/app/src/adapters/llm/gemini.ts:96`, `packages/app/src/adapters/llm/document-workspace.ts:69`).
8. **Delivery through the Docker host bridge.** In Docker the host-CLI client posts the request, including `documents`, as JSON over the Unix socket `cli.sock` to the host helper (`packages/app/src/adapters/host-cli/index.ts:136`, `packages/app/src/adapters/host-cli/transport.ts:39`). The helper checks the bearer token, validates with `hostLlmSchema` (documents use `llmDocumentsSchema`), and calls the host's own CLI adapter, which builds the same private workspace on the host (`packages/app/src/edge/http/host-cli.ts:112`, `packages/app/src/edge/http/host-cli.ts:229`, `packages/app/src/kernel/ports/host-cli.ts:72`). Events stream back as frames; the app side publishes results exactly as for a local call.

## State

| State | Owner and lifetime |
|---|---|
| Planner outline, chapter `{title, notes}`, synthesis text | Published piece payloads in revision work/manifest rows; selected by key + fingerprint (`packages/app/src/slices/rebuild/runtime-provider.ts:407`, `packages/app/src/slices/rebuild/runtime-provider.ts:432`, `packages/app/src/slices/rebuild/runtime-plan.ts:135`). |
| `research-N.md`, `notes.md`, `instructions.md`, article files | Project assets registered by `publishResult` (`packages/app/src/slices/rebuild/runtime-provider.ts:426`, `packages/app/src/slices/rebuild/runtime-publication.ts:91`). |
| Frozen request input (messages, documents, webSearch, thinking) | The recipe's `llm` input, part of the work fingerprint; a document change changes the fingerprint of synthesis/article requests, not of chapters (`packages/app/src/slices/rebuild/recipe-text.ts:38`). |
| Partial article text | Unselected historical output keyed by a `partial-article` publication ID per piece, inserted once (`packages/app/src/slices/rebuild/runtime-publication.ts:231`). |
| Continuation pieces | `article:continuation:<part>` work pieces (`packages/app/src/slices/rebuild/runtime-article.ts:107`). |
| CLI document workspace | Private temp directory, lifetime of one CLI call (`packages/app/src/adapters/llm/document-workspace.ts:28`). |
| Bridge job | Host helper job gate in memory, per request (`packages/app/src/edge/http/host-cli.ts:44`). |

## Side-effect boundaries

- Network: OpenRouter HTTP (`packages/app/src/adapters/llm/openrouter.ts:80`); chapter web search is performed by the model's own tool (`WebSearch`, Codex `web_search="live"`, Gemini `google_web_search`) (`packages/app/src/adapters/llm/claude-code.ts:73`, `packages/app/src/adapters/llm/codex.ts:137`, `packages/app/src/adapters/llm/gemini.ts:44`).
- Subprocess: CLI spawned with argv array, stdin pipe, private process group; `stopCliRun` sends SIGTERM then force-kills after 1 s grace (`packages/app/src/adapters/llm/run-cli.ts:55`, `packages/app/src/adapters/llm/run-cli.ts:167`). The MCP reader runs as a child of the CLI (`packages/app/src/adapters/llm/document-workspace.ts:50`).
- Temp disk: workspace files created before spawn and removed in the adapter's `finally` (`packages/app/src/adapters/llm/claude-code.ts:317`, `packages/app/src/adapters/llm/codex.ts:305`, `packages/app/src/adapters/llm/gemini.ts:119`).
- Unix socket: app ↔ host helper; the helper holds no project state and only runs the call it is sent (`packages/app/src/adapters/host-cli/transport.ts:58`, `packages/app/src/host-cli/server.ts:10`).
- All calls run inside the runner's `attempt` wrapper and provider queue (`packages/app/src/kernel/runner/attempt.ts:73`).

## Failure paths

- **Invalid or oversized documents.** More than 128 documents, a document over 2 MiB, more than 12 MiB total or duplicate IDs fail `llmDocumentsSchema`; `documentWorkspace` turns that into an `unsupported` provider error before anything is sent (`packages/app/src/kernel/ports/llm-documents.ts:4`, `packages/app/src/adapters/llm/document-workspace.ts:21`). A prompt of 8 MiB or more is refused as `unsupported` (`packages/app/src/adapters/llm/run-cli.ts:192`). The host bridge caps a request at 16 MiB (`packages/app/src/kernel/ports/host-cli.ts:27`).
- **Undelivered stdin or unread pages.** A failed stdin write becomes an `unavailable` error; a missing or malformed `read-pages.json` or any missing page receipt becomes `unavailable` ("did not read all of the research notes"). A successful CLI exit alone is not accepted (`packages/app/src/adapters/llm/run-cli.ts:179`, `packages/app/src/adapters/llm/claude-code.ts:263`, `packages/app/src/adapters/llm/document-workspace.ts:69`, `packages/app/src/adapters/llm/document-workspace.ts:92`).
- **Unusable answers.** A planner answer with no chapters, and a chapter or synthesis answer without a trailing Sources list, count as failed attempts that the wrapper retries (`packages/app/src/slices/rebuild/runtime-provider.ts:284`, `packages/app/src/slices/rebuild/runtime-provider.ts:288`, `packages/app/src/slices/research/synthesis.ts:51`, `packages/app/src/slices/research/synthesis.ts:59`).
- **Missing chapters.** Synthesis stays `deferred` (the runner holds it) until every chapter finding matching the current fingerprints exists; the article stays `deferred` until notes exist (`packages/app/src/slices/rebuild/recipe-text.ts:157`, `packages/app/src/slices/rebuild/recipe-text.ts:227`, `packages/app/src/slices/rebuild/runtime-run.ts:17`).
- **Length-limited article.** Each truncated part is retained as partial output; after 3 continuations still ending at the length limit the piece fails with a message naming the prompt/model fix (`packages/app/src/slices/rebuild/runtime-article.ts:59`, `packages/app/src/slices/rebuild/runtime-article.ts:89`, `packages/app/src/slices/rebuild/runtime-article.ts:95`).
- **Timeouts.** LLM calls have a 120 s idle deadline reset by each streamed event (`packages/app/src/kernel/runner/attempt.ts:20`). The bridge client allows 5 s to connect, 120 s socket idle for LLM requests (35 s metadata, 30 min images); the helper aborts an LLM job after 120 s without events (`packages/app/src/adapters/host-cli/transport.ts:96`, `packages/app/src/adapters/host-cli/transport.ts:97`, `packages/app/src/adapters/host-cli/transport.ts:124`, `packages/app/src/edge/http/host-cli.ts:240`, `packages/app/src/kernel/ports/image.ts:70`).
- **Cancellation and cleanup.** A cancelled stage aborts the signal; the adapter rethrows the abort reason, stops the CLI in `finally` and removes the workspace in a nested `finally` (`packages/app/src/adapters/llm/claude-code.ts:307`, `packages/app/src/adapters/llm/claude-code.ts:311`). On the bridge, a client abort or closed response aborts the host job (`packages/app/src/edge/http/host-cli.ts:170`, `packages/app/src/edge/http/host-cli.ts:176`). Bridge failures after the POST connected are reported as `hostUnavailable(submitted)` so a submitted request is not treated as never sent (`packages/app/src/adapters/host-cli/transport.ts:9`, `packages/app/src/adapters/host-cli/transport.ts:111`). Host faults are serialized with the bridge token replaced by `[redacted]` (`packages/app/src/edge/http/host-cli.ts:94`).
- **Workspace creation failure.** Any write error while building the workspace removes the directory and rethrows (`packages/app/src/adapters/llm/document-workspace.ts:86`).
