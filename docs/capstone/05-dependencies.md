---
mode: prescriptive
generated_date: 2026-09-02
capstone_version: 5.2.0
paths_covered:
  - "package.json"
  - "packages/*/package.json"
  - "package-lock.json"
---

> Prescriptive: written from the design and stack interviews, not from code. Rows marked "installed" carry the version `build` actually resolved and locked; the rest are still floors. Every row cites `stack-interview.md §Q2` (the picks) and `§R1` (the research log, 2026-09-02) or an architecture entry. Version floors are the versions verified on npm that day; `build` pins exact versions in the lockfile.

# Dependencies

## Runtime and frameworks

| Package | Floor | Licence | Role | Decided |
|---|---|---|---|---|
| Node.js | 26 (`engines.node >= 26`) | MIT | runtime; LTS from October 2026 | architecture §Q4a |
| typescript | 7.0.2 installed | Apache-2.0 | one language everywhere; `latest` resolves to the native (Go) compiler, not 5.x - typecheck-only role, `tsc --noEmit` and `tsc -p tsconfig.build.json` (build S0, S1) | architecture §Q4 |
| hono | 4.13.5 installed | MIT | HTTP API, SSE (`streamSSE`), typed client (`hono/client`) | architecture §Q4, §Q12, §Q27 |
| @hono/node-server | 2.1.1 installed | MIT | Node adapter for Hono | architecture §Q4 |
| @hono/zod-validator | 0.9.1 installed | MIT | request validation at the edge | stack C3 |
| zod | 4.5.4 installed | MIT | schemas for requests and shadcn forms | stack C3 |
| react, react-dom | 19.2 | MIT | SPA | architecture §Q4, §Q13 |
| @tanstack/react-router | 1.170 | MIT | typed client-side routing | stack C5 |
| @tanstack/react-query | 5.102 | MIT | server state, invalidated from SSE via `EventSource` | stack C6 |
| tailwindcss | 4.3 | MIT | styling pipeline required by shadcn/ui | stack C7; uiux §Q16 |
| shadcn/ui components on Radix primitives | current generator | MIT | component kit, restyled per `uiux/02-system.md` | uiux §Q16 |
| lucide-react | 1.39 | ISC | icon family | uiux §Q5 |
| @fontsource/barlow, @fontsource/barlow-condensed | 5.3 | OFL-1.1 (font licence, accepted) | self-hosted typefaces | stack C7; uiux §Q15 |
| react-markdown | 10 | MIT | article display | stack C12 |
| remark, strip-markdown | 15 / 6 | MIT | markdown → plain-text narration source (`logic/05` §Q37) | stack C12 |
| fflate | 0.8.3 installed | MIT | zip for "download all" (`logic/14` §Q116) | stack C13 |
| ulid | 3.0.2 installed | MIT | entity IDs (architecture §Q19) | stack C10 |
| @fastify/busboy | 3.2.2 installed | MIT | streaming `multipart/form-data` parser for staged uploads (build S3) | build S3, ladder rung 4 |
| ffmpeg-static | 5.3 | GPL-3.0-or-later (binary shipped unlinked, notice in README) | bundled ffmpeg 6.1.1 per platform; `SLOPIFY_FFMPEG` override | architecture §Q26; stack C2 note |

## No dependency, by the ladder (stack C1, C2, C10, C11, C18)

| Need | Answered by | Rung |
|---|---|---|
| Workspaces / package manager | npm workspaces | 4 |
| SQLite driver | `node:sqlite` `DatabaseSync` (release candidate in Node 24.15 / 25.7, unflagged since 22.13) | 3 |
| Migrations | ~30 lines running `NNNN-*.sql` in order, recorded in `schema_migrations` | 6 |
| CLI argument parsing | `node:util` `parseArgs` | 3 |
| Opening the browser | ~6 lines over `node:child_process` (`open` / `xdg-open` / `start`) | 6 |
| Logging | hand-rolled JSON lines to `<data-dir>/logs/<date>.jsonl`, console mirror for warn/error | 6 |
| HTTP client for providers | global `fetch`; ~20-line SSE line parser shared with the CLI adapters' JSONL reading | 3 / 6 |
| Agent CLI processes | `node:child_process` | 3 |
| ~~Uploads~~ | ~~Hono `c.req.formData()` and streams~~ - **overturned in build S3**: measured on Node 24, a 512 MiB part cost +1586 MiB RSS because undici's `formData()` buffers every part. Uploads here are audio and video with no size cap (`logic/05` §Q38), and hand-rolling a multipart parser is barred by standards §Q2, so rung 4 failed and `@fastify/busboy` was added. | 4 → 5 |
| Marketing page | plain HTML, CSS, one script | 4 |

## Dev and tooling

| Package | Floor | Licence | Role |
|---|---|---|---|
| vite | 8.2 | MIT | builds `packages/web` (stack C4) |
| tsx | 4.23 | MIT | dev watch for `packages/app` (stack C4); `tsc` builds it |
| vitest | 4.1.11 installed | MIT | test runner for every package (stack C8) |
| @testing-library/react | 16.3 | MIT | component tests (stack C8) |
| happy-dom | 20 | MIT | DOM for component tests (stack C8) |
| @biomejs/biome | 2.5.11 installed | MIT OR Apache-2.0 | formatter and linter; `noRestrictedImports` patterns enforce kernel → slices → edge (stack C9; architecture §Q35) |
| GitHub Actions | hosted | n/a | lint, typecheck, test on Node 26; tag → `npm publish --provenance` (architecture §Q21; stack C19) |
| @types/node | 26.4.1 installed | MIT | Node 26 type surface while the dev machine runs 24.3.0 (build S0) |
| Dependabot | hosted | n/a | weekly updates; `npm audit` fails CI on high severity (architecture §Q24; stack C19) |
| wrangler | current | MIT OR Apache-2.0 | deploys `packages/collector` and `packages/site` to Cloudflare (stack C17, C18) |

## External services

| Service | Role | Connection setup (planned) | Pricing (2026-09-02) | Outage behaviour |
|---|---|---|---|---|
| OpenRouter | LLM gateway; web grounding via `plugins: [{id: "web"}]` or `:online` | `packages/app/src/adapters/llm/openrouter.ts`, key from `provider_keys` | per-model token prices set by OpenRouter; user's key | stage fails after the retry policy (`logic/01`) |
| Claude Code CLI | LLM via local agent; `claude -p --output-format stream-json --allowedTools WebSearch --model <m>` | `adapters/llm/claude-code.ts`; binary on PATH; the CLI's own login | user's Anthropic subscription or key | "not installed" when absent; a failing call ends the attempt |
| Codex CLI | LLM via local agent; `codex exec --json -c web_search="live" --ephemeral --skip-git-repo-check` | `adapters/llm/codex.ts` | user's OpenAI subscription or key | same as above |
| ElevenLabs | TTS | `adapters/tts/elevenlabs.ts` | credits: Free 10k, Starter $6 / 30k, Creator $22 / 121k, Pro $99 / 600k; ~1 credit per character | stage fails after retries |
| OpenAI (audio) | TTS: gpt-4o-mini-tts, tts-1, tts-1-hd | `adapters/tts/openai.ts` | $0.60 per 1M input characters + $12 per 1M audio tokens; tts-1 $15 / 1M chars; tts-1-hd $30 / 1M chars | stage fails after retries |
| Cartesia | TTS | `adapters/tts/cartesia.ts` | Free (~27 min, API included), Pro $5, Startup $49, Scale $299 per month | stage fails after retries |
| fal.ai | images and thumbnails | `adapters/image/fal.ts` | per image, e.g. Flux Kontext Pro $0.04, Seedream V4 $0.03 | stage fails; refusals fail immediately (`logic/09` §Q74) |
| Replicate | images | `adapters/image/replicate.ts` | FLUX Dev $0.025, FLUX Pro $0.04, Schnell $3 / 1000 images | same |
| OpenAI (images) | images: gpt-image-1, gpt-image-1-mini | `adapters/image/openai.ts` | gpt-image-1 $10 in / $40 out per 1M tokens; -mini $2.50 / $8 | same |
| Cloudflare Workers + D1 | telemetry collector and its database (`logic/16`) | `packages/collector/src/index.ts`, D1 binding in `wrangler.toml` | Free: 100k requests/day, D1 5M reads / 100k writes per day, 5 GB; Paid from $5/month | events queue locally; site shows dashes |
| Cloudflare static assets | marketing page hosting | `packages/site/` deployed by wrangler | free tier | page unavailable |

Deferred adapters (stack C14, C15): Google Cloud TTS, Azure TTS, Stability, Google Imagen; trigger: a user asks. Own per-platform ffmpeg packages: deferred until ffmpeg-static's cadence becomes a problem.

## Governance

- Licence policy: MIT project; MIT / Apache-2.0 / BSD / ISC dependencies only, the OFL font files and the unlinked GPL ffmpeg binary being the two recorded exceptions (architecture §Q3, standards §Q2).
- Vetting bar for any addition: release within 12 months, more than one maintainer or a trivially replaceable surface, and the ladder rung that failed named in the commit (standards §Q2, §Q9).
- Lockfile committed; Dependabot weekly; `npm audit` gate (architecture §Q24).
- Exit costs: every provider sits behind a port with several adapters; Cloudflare is replaceable by any static host plus any serverless SQL at the cost of a redeploy, the data being aggregates only.
