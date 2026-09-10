---
content_hash: 9a01605b7532
generated_at_commit: 1fa45d743329
absorbed_from: features/2026-09-10-subtitles-fonts@2026-09-10
generated_date: 2026-09-10
capstone_version: 5.2.0
paths_covered:
 - "packages/app/src/edge/cli.ts"
 - "packages/app/src/kernel/config/**"
 - "packages/app/src/kernel/cli-command.ts"
 - "packages/app/src/slices/settings/**"
 - "packages/app/src/adapters/llm/**"
 - "packages/app/src/adapters/alignment/**"
 - "packages/app/src/slices/fonts/**"
 - "packages/app/src/slices/subtitles/**"
 - "packages/app/scripts/copy-assets.mjs"
 - ".github/workflows/**"
 - "packages/site/**"
 - "packages/collector/**"
---

# Operations

## Processes

| Process | Command | Depends on |
|---|---|---|
| Local app (users) | `npx @gentbajko/slopify@latest` | Node ≥ 26 on PATH; the bundled ffmpeg; a writable data directory |
| Local app (development) | workspace script starting `packages/app` in watch mode with `packages/web`'s dev server proxied; exact scripts per `stack`/`standards` | same |
| Collector | serverless functions from `packages/collector` on the host | the managed database |
| Marketing site | static build of `packages/site` on the host | the collector's `GET /aggregates` at runtime |

No containers, no compose, no Kubernetes. The app is one process: HTTP server, pipeline runner, SSE hubs, and child processes for ffmpeg, agent CLIs and enabled local subtitle alignment (`packages/app/src/adapters/alignment/runner.ts`).

## Configuration

| Name | Default | Consumed by | Documented |
|---|---|---|---|
| `--port` / `SLOPIFY_PORT` | 6969 | `kernel/config` → HTTP listener | README, marketing page |
| `--host` / `SLOPIFY_HOST` | 127.0.0.1; any other value prints the no-login warning | `kernel/config` | README |
| `--data-dir` / `SLOPIFY_DATA_DIR` | `~/.slopify` (`logic/14`) | `kernel/config`, `slices/storage` | README |
| `--no-open` / `SLOPIFY_NO_OPEN` | opens the browser | `cli.ts` | README |
| `SLOPIFY_FFMPEG` / `FFMPEG_BIN` | the bundled binary, then a recovered copy in `<data-dir>/bin/` | `adapters/ffmpeg.ts` at boot | README |
| CLI executable paths | `claude`, `codex`, `gemini` from server PATH | generic settings `cli.path.<provider>`; read on each invocation | Settings executable path rows |
| provider keys | none | `provider_keys` table, never env | Settings screen |
| collector URL | built into the release | `slices/telemetry/collector-client.ts` | none (not user-configurable) |
| collector secrets (database URL) | none | `packages/collector` from the host environment | deployment notes |

Secrets never live in files in the repository. Configuration precedence: flag, then env, then default.

Before opening the HTTP listener or running providers, boot executes `ffmpeg -version`.
A missing bundled download is recovered with ffmpeg-static's existing installer into a
temporary directory under `<data-dir>/bin/`, verified, then promoted into a cache keyed
by package version, platform and architecture. The installer also downloads its licence
and source notice. Failed downloads are discarded. Explicit executable overrides are
verified and never replaced by a download. Failed startup releases the instance lock.

Claude Code content calls use a writing/research system prompt and `--safe-mode` to
exclude personal CLAUDE.md files, skills, hooks and output styles. Subscription login
and managed policy remain active; built-in tools stay disabled except WebSearch for
research. Google image responses with an explicitly zero quota fail once as an
unsupported model/account combination, with Google AI Studio billing and quota guidance.
Temporary 429s retain retries, taking their delay from Retry-After, RetryInfo or the
Interactions retry sentence.

## Infrastructure

- Local app: none beyond the user's machine; data directory layout per `logic/14` (`slopify.db`, `projects/`, `staging/`, `logs/`, uploaded `fonts/`, lazy `models/english-subtitles/`), created with user-only permissions.
- Collector: serverless API + managed database with the host's daily backup (RPO 24 h, RTO within a day, best effort); a $10/month budget alert on the host. Rate limit per machine id and dedup by event id.
- Marketing site: static files on a serverless host; preview deployments per PR, production from `main`.
- Observability: app logs in `<data-dir>/logs/` (JSON lines, daily rotation), warnings and errors on the terminal; no metrics, no tracing; collector uses the host's request logs (accepted red flag).
- Incident process, on-call, maintenance windows: none; the app is local and the collector is best effort.

## Developer workflow

- CI on push and PR: lint and format check (Biome, with the boundary rule), typecheck, tests on Node 26; `npm audit` fails on high severity; Dependabot weekly.
- Windows CI separately builds the package, checks ffmpeg download recovery and boot, and runs the real ffmpeg end-to-end smoke, alignment/font/subtitle suites and caption-render regression (`.github/workflows/ci.yml`).
- Release: tag → CI publishes `@gentbajko/slopify` to npm with semantic versioning; the package contains the built SPA, alignment worker and WASM runtime dependency, plus Barlow TTF/OFL/source assets; rollback is users pinning `npx @gentbajko/slopify@<version>`. Collector and site do not deploy from a push: nothing in CI touches them. They go out when `npm run deploy` is run by hand, which is `wrangler deploy` for each; `npm run deploy:check` is the dry run.
- Migrations: forward-only SQL files applied at app boot; a schema newer than the app refuses to start; never destructive within a minor version.
- Commands per `05-dependencies.md`: Vitest for tests, `tsc --noEmit` for typecheck, Biome for lint and format; exact npm scripts are written by `build` and this chapter is refreshed by `map` once they exist.

## Subtitle operation

- Subtitles default Off. First enabled export downloads a verified 95,286,046-byte English model into `<data-dir>/models/english-subtitles/`; later exports use the verified cache offline. The model's exact revision/hash live in `packages/app/src/adapters/alignment/cache.ts`. No provider key, Python or compiler is required (`packages/app/SUBTITLES.md`).
- A per-cache filesystem lock serializes model/inference work across processes; queued waits and active decode/inference respond to abort. Temporary download/audio directories are cleaned on completion or failure (`adapters/alignment/{index,lock,cache,runner,audio}.ts`).
- The proof machine aligned 68 seconds of narration in 17.7 seconds and 205 seconds in 53 seconds, at about 728 MiB RSS. These are observed manual runs, not a performance guarantee. User guidance asks for roughly 1 GB available memory (`packages/app/SUBTITLES.md`); inference runs one WASM thread in bounded audio windows (`adapters/alignment/worker.ts`).
- Font discovery reads standard Windows system/user Fonts directories, macOS system/library/user Fonts directories, and Linux system/XDG/legacy user font directories. Scans skip symlinks and unavailable directories and bound entries, depth, file count and bytes. Valid `.ttf`/`.otf` uploads are capped at 32 MiB under `<data-dir>/fonts/`; system `.ttc` faces are supported (`slices/fonts/discovery.ts`, `upload.ts`).
- Completed caption exports retain their chosen font snapshot and word timing in the project folder. Style-only changes reuse matching timing and the snapshot; a failed model download, alignment or replacement keeps the prior completed export. A synchronous output-commit error restores media/parameter backups; failed restoration retains `.previous` files (`slices/subtitles/prepare.ts`, `slices/video/write-export.ts`).
- Enabled subtitles require matching English narration and transcript. A mismatch fails the final stage with correction guidance. Pause active work before changing subtitles; save on a paused project queues only the final export until Resume (`edge/http/subtitles.ts`).
- ASS rendering uses a project caption working directory and fixed relative filter paths. A path-containing relative FFmpeg override is resolved against the app launch directory before that cwd change (`slices/video/ffmpeg.ts`).

## Local CLI discovery and overrides

The server inherits the PATH of the process that launched Slopify; a CLI working in another terminal can still be absent from that PATH. Settings accepts an absolute executable path for Claude Code, Codex or Gemini CLI, shows the command it will use and checks `--version` with a 15-second timeout. Blank restores PATH lookup, including when the command is not found. A successful version check says the binary ran; users still sign in through the CLI before generation (`packages/app/src/slices/settings/{cli-status,cli-paths,readiness}.ts`, `packages/web/src/components/provider-cli.tsx`).

New overrides must name existing executable files or readable JS/MJS/CJS entry scripts, not quoted shell commands or command arguments. On Windows the shared launcher unwraps recognized Node `.cmd`/`.bat` shims to Node plus their JS entry. Unknown batch scripts fail with guidance to select the `.exe` or JS entry; prompts never pass through `cmd.exe` (`packages/app/src/kernel/cli-command.ts`). Changes reach the next invocation without restarting Slopify and do not change already-running children (`adapter-registry.ts`).

Gemini retains its own authentication directory while each explicit `-p` content call gets temporary system settings and writing instructions. Workspace settings first reset the context object to prevent concatenation of personal include directories; a private trusted-folder map permits only that temporary workspace. The adapter disables extensions/hooks/skills/local context, limits tools to none or research web search, sets `NO_BROWSER=true`, and removes the workspace after the child settles. It writes no user Gemini settings or trust map. A login prompt returns terminal sign-in guidance; Google license error #3501 is unsupported and receives no automatic retry (`packages/app/src/adapters/llm/{gemini,gemini-workspace}.ts`).

## Local 0.6.0 verification and installation

The local closeout for source commit `1fa45d743329` passed 1,706 tests with one Windows-only skip, lint, typecheck, production build and inspection of the 202-file package. Browser checks covered all three executable fields and saving without console errors or overflow. The existing local service on port 6969 moved from 0.5.1 to 0.6.0 after a private SQLite backup; existing projects were preserved, and verified paths were saved for the three CLIs. A local tarball installed the global `slopify` command. No public push, tag, npm publication or deployment occurred (record: `changelog.d/2026-09-10-cli-paths-gemini.md`).

Tiny live content requests succeeded through Codex `gpt-5.6-sol` in 13.3 seconds and Claude Haiku in 2.7 seconds. Gemini 0.16.0 launched and loaded its cached login, then Google rejected the account with license error #3501. Gemini was not upgraded or signed in again during this work. These are local observed results, not service guarantees or a claim of successful Gemini generation (same verification record).
