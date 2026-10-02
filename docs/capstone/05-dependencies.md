---
generated_at_commit: e9226a34aa8a
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: 512f5333c77b
paths_covered:
  - ":(top)package.json"
  - ":(top)package-lock.json"
  - ":(top)packages/*/package.json"
  - ":(top)packages/app/src/adapters/**"
  - ":(top)packages/app/src/catalog/**"
  - ":(top)packages/app/src/adapter-registry.ts"
  - ":(top)packages/app/src/updater/**"
  - ":(top)packages/app/src/slices/telemetry/**"
  - ":(top)packages/app/src/slices/notifications/**"
  - ":(top)packages/collector/wrangler.jsonc"
  - ":(top)packages/site/wrangler.jsonc"
  - ":(top)packages/extension/static/manifest.json"
  - ":(top)packages/extension/scripts/**"
  - ":(top).github/**"
  - ":(top)Dockerfile"
---

# Dependencies

Versions below are the ones resolved in `package-lock.json` (lockfile v3, 637 entries, last changed in `89ed947b` on 2026-10-02); the manifest range follows in brackets where it differs. Rows carrying a date keep the date the pick was researched or verified; the earlier inventory floors were verified on npm on 2026-09-02. One hoisted lockfile serves all five workspaces (`package.json:5`).

## Runtime and frameworks

### packages/app (`@gentbajko/slopify`, published; `packages/app/package.json:31`)

| Package | Locked | Licence | Role | Import site |
|---|---|---|---|---|
| Node.js | `engines.node >=26` | MIT | runtime; Docker images build on `node:26-bookworm-slim` | `packages/app/package.json:14`, `Dockerfile:1` |
| hono | 4.13.7 (^4.13.7) | MIT | HTTP API, SSE | `packages/app/package.json:38` |
| @hono/node-server | 2.1.1 | MIT | Node adapter for Hono | `packages/app/package.json:33` |
| @hono/zod-validator | 0.9.1 | MIT | request validation at the edge | `packages/app/package.json:34` |
| zod | 4.5.4 | MIT | schemas at every boundary (also used by `packages/collector`) | `packages/app/package.json:48` |
| @fastify/busboy | 3.2.2 | MIT | streaming `multipart/form-data` for uploads and font uploads | `packages/app/src/edge/http/multipart.ts:2`, `packages/app/src/edge/http/fonts.ts:3` |
| @modelcontextprotocol/sdk | 1.30.1 | MIT | stdio MCP server that exposes project documents to agent CLIs | `packages/app/src/adapters/llm/document-reader.ts:6` |
| strip-json-comments | 5.0.3 | MIT | reads Gemini CLI's JSONC settings file | `packages/app/src/adapters/llm/gemini-workspace.ts:4` |
| fflate | 0.8.3 | MIT | ZIP downloads and portable backup export/import | `packages/app/src/slices/storage/portable.ts:19`, `packages/app/src/slices/revisions/downloads.ts:3` |
| ffmpeg-static | 5.3.0 | GPL-3.0-or-later (binary shipped unlinked, notice in `README.md:107`) | bundled ffmpeg per platform; `SLOPIFY_FFMPEG` / `FFMPEG_BIN` override; missing binary re-fetched with the package's own `install.js` into `<data-dir>/bin/`. The package's release tag reads `b6.1.1`; the linux-x64 asset it fetches reports `ffmpeg version 7.0.2-static` (measured) | `packages/app/src/main.ts:7`, `packages/app/src/adapters/ffmpeg.ts:21` |
| jspdf | 4.2.1 exact | MIT | writes the Document stage's PDF in-process (picked 2026-09-25) | `packages/app/src/slices/document/render.ts:1` |
| onnxruntime-node | 1.30.0 exact | MIT | native CPU acoustic inference for subtitle alignment in a child process (picked 2026-09-25, replacing onnxruntime-web as the primary runtime) | `packages/app/src/adapters/alignment/worker.ts:189` |
| onnxruntime-web | 1.30.0 exact | MIT | single-threaded WASM fallback where no native build loads (Intel macOS) | `packages/app/src/adapters/alignment/worker.ts:192` |
| remark, strip-markdown | 15.0.1 / 6.0.0 | MIT | markdown → plain-text narration source | `packages/app/package.json:42` |
| remark-gfm | 4.0.1 | MIT | GFM parsing so tables and footnote markers are removed instead of surviving verbatim (remark alone leaves `\| a \| b \|` rows and escapes footnotes as `\[^1]`, which TTS reads aloud) | `packages/app/package.json:43` |
| ulid | 3.0.2 | MIT | entity IDs | `packages/app/package.json:46` |
| yaml | 2.9.1 (^2.9.1) | ISC | model catalogue parsing, 1 MiB read limit, Zod-validated | `packages/app/src/catalog/store.ts:3` |

### packages/web (`@slopify/web`, private; bundled into the app by `packages/app/scripts/copy-web.mjs`)

| Package | Locked | Licence | Role | Import site |
|---|---|---|---|---|
| react, react-dom | 19.2.8 | MIT | SPA | `packages/web/package.json:24` |
| @tanstack/react-router | 1.170.39 | MIT | typed client-side routing | `packages/web/package.json:17` |
| @tanstack/react-query | 5.102.8 | MIT | server state, invalidated from SSE | `packages/web/package.json:16` |
| hono | 4.13.7 | MIT | typed API client `hc` | `packages/web/src/api.ts:55` |
| @js-temporal/polyfill | 0.5.1 | ISC | IANA-zone conversion for schedule inputs | `packages/web/src/schedules/time.ts:3` |
| radix-ui, class-variance-authority, clsx, tailwind-merge | 1.6.7 / 0.7.1 / 2.1.1 / 3.6.0 | MIT / Apache-2.0 / MIT / MIT | primitives and class/variant composition for `components/kit` | `packages/web/package.json:18` |
| lucide-react | 1.39.0 | ISC | icon family | `packages/web/package.json:21` |
| @fontsource/barlow, @fontsource/barlow-condensed, @fontsource/jetbrains-mono | 5.3.0 | OFL-1.1 | self-hosted typefaces | `packages/web/src/main.tsx:8` |
| react-markdown, remark-gfm | 10.1.0 / 4.0.1 | MIT | article display | `packages/web/package.json:26` |
| pdfjs-dist | 6.3.289 | Apache-2.0 | renders PDF pages in the browser, loaded lazily with its worker | `packages/web/src/components/pdf-pages.tsx:60` |

### packages/collector (`@slopify/collector`)

| Package | Locked | Licence | Role |
|---|---|---|---|
| zod | 4.5.4 | MIT | event payload validation (`packages/collector/package.json:18`) |

`packages/site` and `packages/extension` carry no runtime dependencies (`packages/site/package.json:11`, `packages/extension/package.json:11`). The extension's Chrome Web Store upload script uses only `node:crypto`, `node:fs` and global `fetch` (`packages/extension/scripts/publish-chrome.mjs:14-16`).

## No dependency, by the ladder

| Need | Answered by | Site |
|---|---|---|
| Workspaces / package manager | npm workspaces, one hoisted lockfile | `package.json:5` |
| SQLite driver | `node:sqlite` `DatabaseSync` | `packages/app/src/kernel/db/tx.ts:1` |
| Migrations | hand-rolled runner over `NNNN-*.sql`, recorded in `schema_migrations` | `packages/app/src/kernel/db/migrate.ts:58` |
| CLI argument parsing | `node:util` `parseArgs` | `packages/app/src/edge/cli-args.ts:1` |
| Opening the browser / a folder | `node:child_process` `spawn` | `packages/app/src/edge/open-browser.ts:55`, `packages/app/src/host-cli/open-folder.ts:20` |
| Logging | JSON lines appended to `<logs>/slopify-<date>.log`, redacted | `packages/app/src/kernel/log.ts:25` |
| HTTP client for providers | global `fetch`, injected through `RegistryDeps.fetch` | `packages/app/src/adapter-registry.ts:49` |
| SSE / JSONL stream parsing | `lines` and `sseData` generators | `packages/app/src/adapters/llm/sse-lines.ts:9` |
| fal.ai queue polling | plain `fetch`; `@fal-ai/client` not used | `packages/app/src/adapters/image/fal.ts:26` |
| Agent CLI processes | `node:child_process` through the `RunCli` seam, argument arrays only | `packages/app/src/adapters/llm/run-cli.ts` |
| System/custom font catalog | `node:fs` directory scan plus SFNT metadata parsing; uploads reuse Busboy | `packages/app/src/slices/fonts/` |
| Uploads | `@fastify/busboy`: Hono `c.req.formData()` was measured on Node 24 at +1586 MiB RSS for a 512 MiB part (undici buffers every part), so the no-dependency rung failed | `packages/app/src/edge/http/multipart.ts:2` |
| Marketing page | plain HTML, CSS, one module, served as static assets | `packages/site/wrangler.jsonc` |

## Picked but not yet installed

| Pick | Status | Recorded trigger |
|---|---|---|
| Google Cloud TTS adapter | deferred; no adapter in `packages/app/src/adapters/tts/` (Gemini speech via the Gemini API is a different adapter, `adapters/tts/gemini.ts`) | a user asks |
| Azure TTS adapter | deferred; absent | a user asks |
| Stability image adapter | deferred; absent | a user asks |
| Google Imagen image adapter | deferred; `discoverGoogleImages` excludes Imagen because it uses a different generation API (`packages/app/src/adapters/image/models.ts:53`) | a user asks |
| Own per-platform ffmpeg packages | deferred; ffmpeg-static still ships | ffmpeg-static's release cadence becoming a problem |

## Dev and tooling

| Package | Locked | Licence | Workspace | Role |
|---|---|---|---|---|
| typescript | 7.0.2 | Apache-2.0 | root | native (Go) compiler; typecheck (`tsc --noEmit`) and app build (`tsc -p tsconfig.build.json`) (`packages/app/package.json:26`) |
| @biomejs/biome | 2.5.14 | MIT OR Apache-2.0 | root | formatter and linter; `noRestrictedImports` enforces layer direction (`biome.json:48`) |
| vitest | 4.1.11 | MIT | root | test runner for every package (`package.json:11`) |
| @types/node | 26.6.3 (^26.5.0) | MIT | root | Node 26 type surface |
| vite | 8.3.1 | MIT | web | builds `packages/web` |
| @tailwindcss/vite, tailwindcss | 4.3.3 | MIT | web | Tailwind pipeline |
| @vitejs/plugin-react | 6.1.1 | MIT | web | React transform |
| @testing-library/dom, @testing-library/react, @testing-library/user-event | 10.4.1 / 16.3.3 / 14.6.7 | MIT | web | component tests |
| happy-dom | 20.13.2 | MIT | web | DOM for component tests |
| @types/react, @types/react-dom | 19.2.18 / 19.2.7 | MIT | web | React declarations |
| wrangler | 4.144.0 (^4.143.0) | MIT OR Apache-2.0 | collector, site | local dev, D1 schema, deploys to Cloudflare |
| esbuild | 0.28.1 | MIT | extension | bundles the browser extension's six entry points (`background`, `comment`, `content`, `options`, `popup`, `video-frame`) (`packages/extension/scripts/build.mjs:21`, `:46-48`); also imported by `packages/app/scripts/ts-resolve.mjs:4`, which reaches it through hoisting (not declared in `packages/app/package.json`) |
| fflate | 0.8.3 | MIT | extension | zips the extension builds (`packages/extension/scripts/build.mjs:22`) |
| playwright | 1.63.0 | Apache-2.0 | site | records the walkthrough video (`packages/site/scripts/record-walkthrough.mjs:36`) |
| ffmpeg-static | 5.3.0 | GPL-3.0-or-later | site | encodes the walkthrough (`packages/site/scripts/record-walkthrough.mjs:35`) |
| GitHub Actions | hosted | n/a | repo | CI on Node 26 with `npm audit --audit-level=high` (`.github/workflows/ci.yml:25`); tag release runs `npm publish --provenance` via OIDC (`.github/workflows/release.yml:61`) and uploads the extension to the Chrome Web Store (`.github/workflows/release.yml:66-83`) |
| Dependabot | hosted | n/a | repo | weekly npm (root only, one lockfile) and github-actions updates (`.github/dependabot.yml`) |

Root `overrides` pins `sharp` 0.35.4 inside `miniflare` (`package.json:25`).

## External services

Every keyed adapter receives only its own key reader, `keyOf(provider)`, read per attempt from the `provider_keys` table through `keyForAttempt` (`packages/app/src/adapter-registry.ts:64`, `packages/app/src/slices/settings/keys.ts:74`). Key checks in Settings call the probes in `packages/app/src/adapters/key-probes.ts`. Pricing columns are prior stack research (2026-09-02); the estimator reads current prices only from `packages/app/src/assets/models.yaml`.

### Text (LLM)

| Service | Protocol | Connection setup | Pricing (2026-09-02) | Outage behaviour |
|---|---|---|---|---|
| OpenRouter | `https://openrouter.ai/api/v1` chat SSE; web grounding via `plugins: [{id: "web"}]` | `packages/app/src/adapters/llm/openrouter.ts:22`, `:91`; registered `adapter-registry.ts:76` | per-model token prices set by OpenRouter; user's key | stage fails after the retry policy |
| Claude Code CLI | `claude -p --output-format stream-json [--allowedTools …] [--model m]`; the CLI's own login | `packages/app/src/adapters/llm/claude-code.ts:75`; `adapter-registry.ts:80` | user's Anthropic subscription or key | "not installed" when absent; a failing call ends the attempt |
| Codex CLI | `codex exec --json --skip-git-repo-check --sandbox …` in a private temporary workspace; minimum version 0.149.1 | `packages/app/src/adapters/llm/codex.ts:102`; floor `packages/app/src/slices/settings/cli-status.ts:25` | user's OpenAI subscription or key | missing, old or unverifiable versions disable selection |
| Gemini CLI | `--output-format stream-json -p`; research permits only `google_web_search` | `packages/app/src/adapters/llm/gemini.ts:36`, `packages/app/src/adapters/llm/gemini-workspace.ts:88` | user's Gemini login; no Slopify price assertion | missing/unusable executable disables selection |
| Host helper | local HTTP to the host-side helper that runs the three CLIs when Slopify runs in Docker; 64-hex token file in `SLOPIFY_HOST_CLI_DIR`; 16 MB request cap | `packages/app/src/adapters/host-cli/index.ts:36`, `packages/app/src/adapters/host-cli/transport.ts:25`; wired `packages/app/src/main.ts:332` | n/a | "cannot reach its host helper" error with the `--docker` remedy |

### Speech (TTS)

| Service | Protocol | Connection setup | Pricing (2026-09-02) | Outage behaviour |
|---|---|---|---|---|
| ElevenLabs | `https://api.elevenlabs.io/v1` | `packages/app/src/adapters/tts/elevenlabs.ts:14`; `adapter-registry.ts:105` | Free 10k credits, Starter $6 / 30k, Creator $22 / 121k, Pro $99 / 600k; ~1 credit per character | stage fails after retries |
| OpenAI audio | `https://api.openai.com/v1`; gpt-4o-mini-tts (default), gpt-4o-mini-tts-2025-12-15, tts-1, tts-1-hd | `packages/app/src/adapters/tts/openai.ts:12`; `adapter-registry.ts:106` | $0.60 / 1M input chars + $12 / 1M audio tokens; tts-1 $15 / 1M chars; tts-1-hd $30 / 1M chars | stage fails after retries |
| Cartesia | `https://api.cartesia.ai`, `Cartesia-Version: 2026-03-01` (required); default `sonic-3.5`, offline list sonic-3.6 / 3.5 / 3 | `packages/app/src/adapters/tts/cartesia.ts:14`, `:18`; `adapter-registry.ts:107` | Free (~27 min), Pro $5, Startup $49, Scale $299 per month | stage fails after retries |
| Inworld | `https://api.inworld.ai/tts/v1/voice` stream, plus long-running `lro/v1alpha` operations for async synthesis | `packages/app/src/adapters/tts/inworld.ts:106`, `packages/app/src/adapters/tts/inworld-async.ts:55`; `adapter-registry.ts:108` | not recorded | stage fails after retries |
| Gemini API speech | `https://generativelanguage.googleapis.com/v1beta` `generateContent` with AUDIO output; 24 kHz PCM encoded to MP3 by the app's ffmpeg; two-speaker dialogue via `multiSpeakerVoiceConfig` | `packages/app/src/adapters/tts/gemini.ts:25`; `adapter-registry.ts:122` (own key, else the Google image key) | not recorded | stage fails after retries |
| System voice (local, keyless) | the computer's speech program: `say` (macOS), PowerShell `System.Speech` (Windows), `piper`, `pico2wave`, `espeak-ng` / `espeak`; the Docker image installs `espeak-ng` | `packages/app/src/adapters/tts/system.ts:57`; `adapter-registry.ts:111`; `Dockerfile:39` | free | unavailable with a plain reason when no program is found |

### Images and image-to-video

| Service | Protocol | Connection setup | Pricing (2026-09-02) | Outage behaviour |
|---|---|---|---|---|
| fal.ai | images on `https://fal.run` (synchronous); clips on `https://queue.fal.run` then downloaded; FLUX endpoints take `image_size`, Google ones `aspect_ratio`; video models Kling 2.5 turbo pro, Wan 2.5 preview, Seedance v1 pro fast | `packages/app/src/adapters/image/fal.ts:31`, `:103`, `:110`; `adapter-registry.ts:137` | per image, e.g. Flux Kontext Pro $0.04, Seedream V4 $0.03 | stage fails; refusals fail immediately |
| Replicate | `https://api.replicate.com/v1`; `Prefer: wait=60` then poll `urls.get`; `output_format: "png"`; image-to-video predictions polled the same way | `packages/app/src/adapters/image/replicate.ts:30`, `:93`, `:103`, `:119`; `adapter-registry.ts:140` | FLUX Dev $0.025, FLUX Pro $0.04, Schnell $3 / 1000 images | stage fails; refusals fail immediately |
| OpenAI images | `https://api.openai.com/v1`; curated models from `models.yaml` | `packages/app/src/adapters/image/openai.ts:17`; `adapter-registry.ts:142` | output-dependent | stage fails after retries |
| Google images (Gemini API) | `https://generativelanguage.googleapis.com/v1beta` `/interactions` | `packages/app/src/adapters/image/google.ts:16`, `:78`; `adapter-registry.ts:143` | not recorded | stage fails after retries |
| Codex CLI images | Codex's image tool under the shared Codex login; host helper replaces it in Docker | `packages/app/src/adapters/image/codex.ts:213`; `adapter-registry.ts:146`, `:157` | user's OpenAI plan | plan-limit and login errors surface from the CLI; a run with no image whose stderr or last agent message matches the safety-block pattern is a `refusal` (`packages/app/src/adapters/image/codex.ts:197-198`, `:381-390`) |

Image-to-video clips from fal.ai and Replicate share `downloadVideo`, which rejects anything not an MP4 (`packages/app/src/adapters/image/video.ts:25`).

### Platform and distribution

| Service | Role | Connection setup | Outage behaviour |
|---|---|---|---|
| Hugging Face | subtitle alignment weights, fetched on first use and SHA256-checked: English `Xenova/wav2vec2-base-960h` rev `a19f851b…`, 95,286,046 bytes (Apache-2.0); multilingual `NewComer00/wav2vec2-xlsr-multilingual-56-ONNX` rev `2d48b01b…`, q4, 247,576,761 bytes (Apache-2.0) | `packages/app/src/adapters/alignment/cache.ts:32`, `packages/app/src/adapters/alignment/multilingual.ts:9` | subtitles unavailable until the download succeeds; audio and text never leave the computer |
| GitHub raw | published `models.yaml` catalogue refresh, 1 MiB cap, 15 s timeout, no redirects | `packages/app/src/catalog/store.ts:19`, `:98` | last working catalogue kept, warning shown |
| OpenRouter public models list | live ids and per-token prices, no key, 16 MiB cap | `packages/app/src/catalog/store.ts:21`, `:150` | same |
| npm registry | update check of `@gentbajko/slopify` `latest` and update installs | `packages/app/src/updater/registry.ts:10`, `packages/app/src/updater/model.ts:40`, `packages/app/src/updater/worker.ts:34` | "The npm release could not be checked." |
| Notification URL (user-supplied, e.g. ntfy) | plain-text POST per notice, 5 s timeout, `redirect: "manual"` | `packages/app/src/slices/notifications/send.ts:19` | failure text recorded; URL never repeated |
| Cloudflare Workers + D1 | telemetry collector at `https://collector.slopify.stream`, D1 binding `DB` | `packages/app/src/slices/telemetry/collector-client.ts:26`; `packages/collector/wrangler.jsonc`; `packages/collector/src/index.ts:26` | events queue locally; site shows dashes |
| Cloudflare static assets | marketing site at `slopify.stream` | `packages/site/wrangler.jsonc` | page unavailable |
| YouTube Studio | the extension's content script on `https://studio.youtube.com/*` fills the upload dialog, sets the schedule time, makes the Details touches and reads Analytics; a second script on `https://www.youtube.com/watch*` posts and pins the comment; it reaches only the local app (loopback host permissions); never presses Publish | `packages/extension/static/manifest.json:13-30`, `packages/extension/src/studio-pages.ts:4-10`, `packages/extension/src/comment.ts:4-8` | each page reports what it could not do |
| YouTube oEmbed | `https://www.youtube.com/oembed` answers whether a video is public before a finish or comment task opens; no key | `packages/extension/src/background.ts:134-143`, `packages/extension/static/manifest.json:16` | a failed check counts as not public; the 15 min alarm retries |
| Chrome Web Store API v2 | release upload and submit of `slopify-studio-chrome.zip`: service-account JWT exchanged at `oauth2.googleapis.com/token`, then `chromewebstore.googleapis.com` `:upload` and `:publish`; secrets `CWS_SERVICE_ACCOUNT_JSON`, `CWS_PUBLISHER_ID`, `CWS_EXTENSION_ID` | `packages/extension/scripts/publish-chrome.mjs:18-26`, `:41`, `:59`, `:74`; `.github/workflows/release.yml:80-83` | missing secrets skip with exit 0; a version the store already has is "nothing new"; other refusals fail the job |
| GitHub Container Registry | Docker image `ghcr.io/gentbajko/slopify` | `compose.yaml:11` | n/a |

Pricing columns for Inworld, Gemini speech and Google images: not recorded in this chapter.

## Governance

- Package licence: `@gentbajko/slopify` is Apache-2.0 with a `NOTICE` file (`packages/app/package.json:5`, `packages/app/NOTICE`).
- Dependency licences in the lockfile's direct set: MIT, Apache-2.0, ISC, MIT OR Apache-2.0, plus OFL-1.1 font packages and the GPL-3.0-or-later ffmpeg binary run unlinked.
- Ladder rule: stdlib, then platform, then an installed dependency, then minimum code; a new dependency states the rung that failed (`docs/capstone/standards.md:20`, `:112`).
- Lockfile committed; Dependabot weekly; `npm audit --audit-level=high` gates CI.

## Local subtitle assets and runtime

`onnxruntime-node@1.30.0` replaced `onnxruntime-web` as the primary runtime on 2026-09-25: single-threaded WASM ran 4.8× realtime and multi-threaded WASM crashed, while one native session with 8 intra-op threads ran 37× on the benchmark clip. The package bundles CPU binaries for linux x64/arm64, win32 x64/arm64 and darwin arm64 (about 220 MB unpacked); its postinstall only downloads optional CUDA libraries on linux x64, which the CPU path never loads, so `--ignore-scripts` installs work (`packages/app/SUBTITLES.md:19`). Intel Macs fall back to `onnxruntime-web/wasm` (`packages/app/src/adapters/alignment/worker.ts:192`). No local compiler or Python is required.

The subtitle default font is static Barlow Regular TTF with its OFL and source record in `packages/app/src/assets/fonts/`, copied to `dist/assets/fonts/` by `packages/app/scripts/copy-assets.mjs`; no font-parsing dependency is used.
