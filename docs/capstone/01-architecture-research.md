---
generated_at_commit: e9226a34aa8a
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: 0c625f14a6e4
paths_covered:
  - ":(top)packages/app/src/slices/research/**"
  - ":(top)packages/app/src/slices/rebuild/recipe-text.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-provider.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-article.ts"
  - ":(top)packages/app/src/slices/rebuild/preview-details.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-input-schema.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-work.ts"
  - ":(top)packages/app/src/kernel/ports/llm*.ts"
  - ":(top)packages/app/src/kernel/ports/host-cli.ts"
  - ":(top)packages/app/src/kernel/runner/providers.ts"
  - ":(top)packages/app/src/adapters/llm/document-*.ts"
  - ":(top)packages/app/src/adapters/llm/claude-code.ts"
  - ":(top)packages/app/src/adapters/llm/codex.ts"
  - ":(top)packages/app/src/adapters/llm/gemini*.ts"
  - ":(top)packages/app/src/adapters/llm/openrouter.ts"
  - ":(top)packages/app/src/adapters/host-cli/**"
  - ":(top)packages/app/src/host-cli/runtime.ts"
  - ":(top)packages/app/src/host-cli/server.ts"
  - ":(top)packages/app/src/edge/host-cli.ts"
  - ":(top)packages/app/src/edge/http/host-cli.ts"
  - ":(top)packages/app/src/adapter-registry.ts"
  - ":(top)packages/app/src/main.ts"
  - ":(top)biome.json"
---

# Research handoff architecture

Scope: how research reports travel from the research recipes to an LLM provider as separate documents, including the Docker host-helper bridge. Everything else is in [01-architecture.md](01-architecture.md); the Docker helper as a whole is in [01-architecture-docker.md](01-architecture-docker.md).

## Layers

| Layer | Files in scope | Imports |
|---|---|---|
| kernel/ports | `packages/app/src/kernel/ports/llm-documents.ts`, `llm.ts`, `host-cli.ts` | Nothing above kernel (`biome.json:44`) |
| kernel/runner | `packages/app/src/kernel/runner/providers.ts` | kernel/ports |
| slices | `packages/app/src/slices/research/`, `packages/app/src/slices/rebuild/recipe-text.ts`, `runtime-provider.ts`, `runtime-article.ts`, `preview-details.ts` | kernel; never edge or adapters (`biome.json:70`) |
| adapters | `packages/app/src/adapters/llm/document-workspace.ts`, `document-reader.ts`, `claude-code.ts`, `codex.ts`, `gemini.ts`, `gemini-workspace.ts`, `openrouter.ts`, `packages/app/src/adapters/host-cli/` | kernel/ports and kernel/{clock,log,cli-command} only (`biome.json:99`) |
| host helper | `packages/app/src/host-cli/runtime.ts`, `server.ts`, `packages/app/src/edge/host-cli.ts`, `packages/app/src/edge/http/host-cli.ts` | adapters/llm and kernel/ports (`packages/app/src/host-cli/runtime.ts:4`) |

Dependency direction: slices build `LlmDocument[]` values and hand them to the wrapped `providers.llm` call; the wrapper forwards them to an `LlmPort` adapter (`packages/app/src/kernel/runner/providers.ts:208`). No adapter imports a slice.

## Module boundaries

| Module | Public surface | Boundary |
|---|---|---|
| `kernel/ports/llm-documents.ts` | `llmDocumentsSchema` (at most 128 documents, IDs `^[a-z][a-z0-9-]{0,63}$`, each ≤ 2 MiB, total ≤ 12 MiB, unique IDs) (`:4`); `LlmDocument` (`:24`); `documentIndex` (`:26`); `documentMessages` (`:36`) | Shared contract for slices, adapters and the host bridge schema (`packages/app/src/kernel/ports/host-cli.ts:76`) |
| `slices/research/documents.ts` | `researchDocuments(findings)` gives stable IDs `research-1..N`, title = chapter title, content = unchanged sub-agent notes (`:4`) | Used by synthesis and by the rebuild recipes (`packages/app/src/slices/research/synthesis.ts:31`, `packages/app/src/slices/rebuild/recipe-text.ts:16`) |
| `slices/research/synthesis.ts` | `synthesisMessages` puts the document index, not the report bodies, into the prompt (`:17`, `:31`); `sourcedAnswer` requires a trailing Sources list (`:59`) | Pure message builders |
| `slices/rebuild/recipe-text.ts` | `llmInput(context, messages, webSearch, documents)` stores `documents` on the recipe input only when non-empty (`:38`, `:61`). The `research:notes` recipe carries `researchDocuments(findings)` (`:138`-`:147`). Article and continuation recipes carry the originals plus `{ id: "editorial-notes" }` when research is Generate, and the prompt receives `documentIndex(documents)` in place of the notes (`:179`-`:188`, `:231`, `:251`) | Recipes are frozen into the rebuild execution snapshot; `recipeInputSchema` accepts `documents` (`packages/app/src/slices/rebuild/recipe-input-schema.ts:38`) |
| `slices/rebuild/runtime-provider.ts` | `executeProviderRecipe` passes `input.documents` to the wrapped call (`:43`, `:70`). A `research:chapter:N` answer is written as asset `research-N.md` (`:425`-`:432`); `research:notes` publishes `notes.md` and `instructions.md` (`:393`-`:400`) | Answers are checked by `sourcedAnswer` for notes and chapters (`:288`) |
| `slices/rebuild/runtime-article.ts` | Article body and each continuation send `input.documents` (`:51`) | — |
| `slices/research/run.ts` | `runResearch` (`:50`) plans, researches chapters in parallel and synthesises with `documents: researchDocuments(findings)` (`:118`) | Referenced only by `packages/app/src/slices/research/run.test.ts`; the live path is the rebuild recipes above |
| `adapters/llm/document-workspace.ts` | `documentWorkspace(documents)` (`:18`) writes `<id>.md`, `manifest.json` (id, title, sha256), `index.md` and `mcp.json` with mode 0600 into a `slopify-documents-*` temp dir (`:28`-`:61`); returns `instructions`, `verifyRead()` and `remove()` (`:62`-`:85`). Server name `slopify_research`, tool `read_document` (`:14`-`:16`) | Invalid input throws `providerError({ kind: "unsupported" })` before any provider runs (`:21`) |
| `adapters/llm/document-reader.ts` | Stdio MCP server with one read-only tool `read_document({ id, offset })`, 16 000-character pages (`:48`-`:61`). Files are opened `O_NOFOLLOW`, must be single-link regular files, and their SHA-256 must match the manifest (`:12`-`:44`). Each served page is recorded in `read-pages.json` (`:78`-`:79`) | No other file, shell or network access |

## Entry points

| Entry | Site |
|---|---|
| Rebuild research/article execution | `executeProviderRecipe` (`packages/app/src/slices/rebuild/runtime-provider.ts:43`) |
| Per-provider workspace creation | `documentWorkspace` calls in `packages/app/src/adapters/llm/claude-code.ts:189`, `codex.ts:202`, `gemini.ts:68` |
| Document reader process | `packages/app/src/adapters/llm/document-reader.ts:10` (spawned with `process.execPath <reader> <dir>`, `packages/app/src/adapters/llm/document-workspace.ts:50`-`:55`) |
| Host helper process | `packages/app/src/edge/host-cli.ts:50` (`startHostServer` with `createHostRuntime`) |
| Host LLM route | `POST /v1/llm/:provider` (`packages/app/src/edge/http/host-cli.ts:229`) |

## Communication

| Channel | Send site | Receive site | Payload out | Payload back |
|---|---|---|---|---|
| Slice → wrapped LLM call | `packages/app/src/slices/rebuild/runtime-provider.ts:70`, `runtime-article.ts:51` | `packages/app/src/kernel/runner/providers.ts:208` | `LlmCall` with `documents?: LlmDocument[]` (`packages/app/src/kernel/runner/providers.ts:30`) | `LlmAnswer` (text, usage, finishReason) |
| Wrapper → `LlmPort.complete` | `packages/app/src/kernel/runner/providers.ts:203` | adapter `complete` | `LlmCompletion.documents` (`packages/app/src/kernel/ports/llm.ts:87`) | `LlmEvent` stream |
| Claude Code CLI | `packages/app/src/adapters/llm/claude-code.ts:198` | `claude -p` | Prompt on stdin: document instructions + messages (`:210`); args add `--restricted`, empty `--setting-sources`, hooks/memory/plugins off, `--strict-mcp-config`, `--mcp-config <dir>/mcp.json`, `--allowedTools mcp__slopify_research__read_document` (`:82`-`:115`) | stream-json; with documents only the final `result` text is yielded (`:225`, `:248`, `:296`) |
| Codex CLI | `packages/app/src/adapters/llm/codex.ts:204` | `codex exec` | `--ignore-user-config`, read-only sandbox, `mcp_servers.slopify_research` with `enabled_tools=["read_document"]` and `required=true`; prompt via stdin `-` (`:95`-`:158`) | JSON events |
| Gemini CLI | `packages/app/src/adapters/llm/gemini.ts:73` | `gemini` | Private `GEMINI_CLI_HOME` with a generated `settings.json`: MCP allowlist = `slopify_research` only, hooks/skills/IDE/telemetry off, context file disabled; the user's auth `selectedType` is copied and `oauth_creds.json` is referenced via `GOOGLE_APPLICATION_CREDENTIALS` (`packages/app/src/adapters/llm/gemini-workspace.ts:57`-`:151`) | stream events |
| MCP `read_document` | CLI | `packages/app/src/adapters/llm/document-reader.ts:64` | `{ id: string, offset: int multiple of 16000 }` | JSON `{ id, title, offset, nextOffset: number \| null, totalCharacters, text }` (`:84`-`:91`) |
| OpenRouter HTTP | `packages/app/src/adapters/llm/openrouter.ts:80` | OpenRouter API | `documentMessages(documents)` prepended as separate user messages labelled as reference material (`packages/app/src/kernel/ports/llm-documents.ts:36`) | SSE stream |
| Container → host helper | `packages/app/src/adapters/host-cli/index.ts:154` over the Unix socket `<dir>/cli.sock` (`packages/app/src/adapters/host-cli/transport.ts:58`) | `packages/app/src/edge/http/host-cli.ts:232` | `hostLlmSchema`: `{ model, messages[≤128], documents?, thinking?, webSearch? }` (`packages/app/src/kernel/ports/host-cli.ts:72`); bearer token checked with `timingSafeEqual` (`packages/app/src/edge/http/host-cli.ts:113`) | NDJSON `hostFrameSchema` frames: `delta`, `activity`, `done`, `error` (`packages/app/src/kernel/ports/host-cli.ts:196`) |

Document contents cross the bridge inside the JSON body; no container or host path is sent. The host runtime runs the same CLI adapters with the captured host environment (`packages/app/src/host-cli/runtime.ts:54`-`:84`), so the workspace is materialised on the host.

Read verification: every adapter calls `documents?.verifyRead()` before accepting a result (`packages/app/src/adapters/llm/claude-code.ts:294`, `codex.ts:253`, `gemini.ts:97`). It requires a receipt for every 16 000-character page of every document; a missing page throws `providerError({ kind: "unavailable" })` (`packages/app/src/adapters/llm/document-workspace.ts:69`-`:97`). Cleanup: `documents?.remove()` runs in each adapter's `finally` (`claude-code.ts:317`, `codex.ts:305`, `gemini.ts:119`).

## Composition

- Container app: `createHostCliClient` is built when `SLOPIFY_CONTAINER=1` or `SLOPIFY_HOST_CLI_DIR` is set (`packages/app/src/main.ts:331`); `buildRegistry` registers `hostCli.llm(id)` for each of `claude-code`, `codex`, `gemini` (`packages/app/src/adapter-registry.ts:155`).
- Host helper: `packages/app/src/edge/host-cli.ts:50` wires `startHostServer` + `createHostRuntime({ run: nodeRunCli, ... })`; `createHostRuntime` maps IDs to `claudeCodeLlm`, `codexLlm`, `geminiLlm` (`packages/app/src/host-cli/runtime.ts:38`).
- Slices receive only the wrapped provider calls, never adapters (`biome.json:83`-`:89`).

## Frontend

No dedicated screen. The rebuild review shows each research/article request with its documents appended as `Document <id>: <title>` blocks (`packages/app/src/slices/rebuild/preview-details.ts:119`), and cost estimates count document characters as input (`packages/app/src/slices/rebuild/recipe-work.ts:449`).
