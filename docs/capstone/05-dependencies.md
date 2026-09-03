---
generated_date: 2026-09-02
capstone_version: 5.2.0
paths_covered:
 - "package.json"
 - "packages/*/package.json"
 - "package-lock.json"
---

> Rows marked "installed" carry the version resolved and locked in `package-lock.json`; the
> rest are floors, the versions verified on npm on 2026-09-02.

# Dependencies

## Runtime and frameworks

| Package | Floor | Licence | Role | Decided |
|---|---|---|---|---|
| Node.js | 26 (`engines.node >= 26`) | MIT | runtime; LTS from October 2026 | architecture |
| typescript | 7.0.2 installed | Apache-2.0 | one language everywhere; `latest` resolves to the native (Go) compiler, not 5.x - typecheck-only role, `tsc --noEmit` and `tsc -p tsconfig.build.json` | architecture |
| hono | 4.13.5 installed | MIT | HTTP API, SSE (`streamSSE`), typed client (`hono/client`) | architecture |
| @hono/node-server | 2.1.1 installed | MIT | Node adapter for Hono | architecture |
| @hono/zod-validator | 0.9.1 installed | MIT | request validation at the edge | stack |
| zod | 4.5.4 installed | MIT | schemas for requests and shadcn forms | stack |
| react, react-dom | 19.2 | MIT | SPA | architecture |
| @tanstack/react-router | 1.170 | MIT | typed client-side routing | stack |
| @tanstack/react-query | 5.102 | MIT | server state, invalidated from SSE via `EventSource` | stack |
| tailwindcss | 4.3 | MIT | styling pipeline required by shadcn/ui | stack; uiux |
| shadcn/ui components on Radix primitives | current generator | MIT | component kit, restyled per `uiux/02-system.md` | uiux |
| lucide-react | 1.39 | ISC | icon family | uiux |
| @fontsource/barlow, @fontsource/barlow-condensed | 5.3 | OFL-1.1 (font licence, accepted) | self-hosted typefaces | stack; uiux |
| react-markdown | 10 | MIT | article display | stack |
| remark, strip-markdown | 15.0.1 / 6.0.0 installed | MIT | markdown → plain-text narration source (`logic/05`) | stack |
| remark-gfm | 4.0.1 installed | MIT | without it remark does not parse tables, so `\| Year \| Event \|` rows survive verbatim into the narration, and footnote markers come back from remark-stringify escaped as `\[^1]` - a backslash the TTS reads aloud. strip-markdown can only remove what the parser produced, so neither is fixable through its options | |
| fflate | 0.8.3 installed | MIT | zip for "download all" (`logic/14`) | stack |
| ulid | 3.0.2 installed | MIT | entity IDs | stack |
| @fastify/busboy | 3.2.2 installed | MIT | streaming `multipart/form-data` parser for staged uploads | ladder rung 4 |
| ffmpeg-static | 5.3.0 installed | GPL-3.0-or-later (binary shipped unlinked, notice in README) | bundled ffmpeg per platform; `SLOPIFY_FFMPEG` override. The package's release tag reads `b6.1.1`, but the linux-x64 asset it fetches reports `ffmpeg version 7.0.2-static` (johnvansickle build), measured - the "6.1.1" this row used to claim was never what shipped | architecture; stack note |

## No dependency, by the ladder

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
| ~~Uploads~~ | ~~Hono `c.req.formData()` and streams~~ - **overturned**: measured on Node 24, a 512 MiB part cost +1586 MiB RSS because undici's `formData()` buffers every part. Uploads here are audio and video with no size cap (`logic/05`), and hand-rolling a multipart parser is barred by standards, so rung 4 failed and `@fastify/busboy` was added. | 4 → 5 |
| Marketing page | plain HTML, CSS, one script | 4 |

## Dev and tooling

| Package | Floor | Licence | Role |
|---|---|---|---|
| vite | 8.2 | MIT | builds `packages/web` (stack) |
| tsx | 4.23 | MIT | dev watch for `packages/app` (stack); `tsc` builds it |
| vitest | 4.1.11 installed | MIT | test runner for every package (stack) |
| @testing-library/react | 16.3 | MIT | component tests (stack) |
| happy-dom | 20 | MIT | DOM for component tests (stack) |
| @biomejs/biome | 2.5.11 installed | MIT OR Apache-2.0 | formatter and linter; `noRestrictedImports` patterns enforce kernel → slices → edge |
| GitHub Actions | hosted | n/a | lint, typecheck, test on Node 26; tag → `npm publish --provenance` |
| @types/node | 26.4.1 installed | MIT | Node 26 type surface while the dev machine runs 24.3.0 |
| Dependabot | hosted | n/a | weekly updates; `npm audit` fails CI on high severity |
| wrangler | current | MIT OR Apache-2.0 | deploys `packages/collector` and `packages/site` to Cloudflare (stack,) |

## External services

| Service | Role | Connection setup | Pricing (2026-09-02) | Outage behaviour |
|---|---|---|---|---|
| OpenRouter | LLM gateway; web grounding via `plugins: [{id: "web"}]` or `:online` | `packages/app/src/adapters/llm/openrouter.ts`, key from `provider_keys` | per-model token prices set by OpenRouter; user's key | stage fails after the retry policy (`logic/01`) |
| Claude Code CLI | LLM via local agent; `claude -p --output-format stream-json --allowedTools WebSearch --model <m>` | `adapters/llm/claude-code.ts`; binary on PATH; the CLI's own login | user's Anthropic subscription or key | "not installed" when absent; a failing call ends the attempt |
| Codex CLI | LLM via local agent; `codex exec --json -c web_search="live" --ephemeral --skip-git-repo-check` | `adapters/llm/codex.ts` | user's OpenAI subscription or key | same as above |
| ElevenLabs | TTS | `adapters/tts/elevenlabs.ts` | credits: Free 10k, Starter $6 / 30k, Creator $22 / 121k, Pro $99 / 600k; ~1 credit per character | stage fails after retries |
| OpenAI (audio) | TTS: gpt-4o-mini-tts, tts-1, tts-1-hd (plus gpt-4o-mini-tts-2025-12-15). `voice` also accepts an object `{id}` for a cloned voice, which matters because Slopify's voice list is free text the user types | `adapters/tts/openai.ts` | $0.60 per 1M input characters + $12 per 1M audio tokens; tts-1 $15 / 1M chars; tts-1-hd $30 / 1M chars | stage fails after retries |
| Cartesia | TTS; `sonic-3.5` on `Cartesia-Version: 2026-03-01` - the previously recorded `sonic-2` is retired (it now aliases to `jolly-totem`) and the recorded `2024-11-13` header stale and *required*, not optional; the error envelope changed with it to `{error_code, title, message, request_id}` | `adapters/tts/cartesia.ts` | Free (~27 min, API included), Pro $5, Startup $49, Scale $299 per month | stage fails after retries |
| fal.ai | images and thumbnails; REST, no SDK. The frame is spelled per model, not per family: the FLUX endpoints take an `image_size` enum, the Google ones a plain `aspect_ratio`, so each curated entry declares its shape | `adapters/image/fal.ts` | per image, e.g. Flux Kontext Pro $0.04, Seedream V4 $0.03 | stage fails; refusals fail immediately (`logic/09`) |
| Replicate | images. `Prefer: wait` holds the connection for **at most 60 s** - past that the prediction comes back `starting` and must be polled at `urls.get`, so the adapter sends `Prefer: wait=60` and polls; `output` is a bare string for single-image models and an array for others; both URL providers default to WebP, which the port cannot store, so both requests carry `output_format: "png"` | `adapters/image/replicate.ts` | FLUX Dev $0.025, FLUX Pro $0.04, Schnell $3 / 1000 images | same |
| OpenAI (images) | images: gpt-image-2, gpt-image-1.5, gpt-image-1, gpt-image-1-mini (four models, not the two previously recorded). `quality` is not sent - `logic/09` step 2 asks for provider default, and the recorded `standard`/`hd` values were DALL-E 3's anyway; gpt-image-2 takes arbitrary WxH divisible by 16, so it gets the aspect exactly and the render crops less | `adapters/image/openai.ts` | gpt-image-1 $10 in / $40 out per 1M tokens; -mini $2.50 / $8 | same |
| Cloudflare Workers + D1 | telemetry collector and its database (`logic/16`) | `packages/collector/src/index.ts`, D1 binding in `wrangler.toml` | Free: 100k requests/day, D1 5M reads / 100k writes per day, 5 GB; Paid from $5/month | events queue locally; site shows dashes |
| Cloudflare static assets | marketing page hosting | `packages/site/` deployed by wrangler | free tier | page unavailable |

Deferred adapters: Google Cloud TTS, Azure TTS, Stability, Google Imagen; trigger: a user asks. Own per-platform ffmpeg packages: deferred until ffmpeg-static's cadence becomes a problem.

## Governance

- Licence policy: MIT project; MIT / Apache-2.0 / BSD / ISC dependencies only, the OFL font files and the unlinked GPL ffmpeg binary being the two recorded exceptions.
- Vetting bar for any addition: release within 12 months, more than one maintainer or a trivially replaceable surface, and the ladder rung that failed named in the commit.
- Lockfile committed; Dependabot weekly; `npm audit` gate.
- Exit costs: every provider sits behind a port with several adapters; Cloudflare is replaceable by any static host plus any serverless SQL at the cost of a redeploy, the data being aggregates only.
