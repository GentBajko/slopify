---
mode: prescriptive
generated_date: 2026-09-02
capstone_version: 5.2.0
paths_covered:
  - "packages/app/src/edge/cli.ts"
  - "packages/app/src/kernel/config/**"
  - ".github/workflows/**"
  - "packages/site/**"
  - "packages/collector/**"
---

> Prescriptive: written from the design interview, not from code. Citations point at `architecture-interview.md §Q<n>` and planned paths.

# Operations

## Processes

| Process | Command | Depends on |
|---|---|---|
| Local app (users) | `npx slopify@latest` | Node ≥ 26 on PATH; the bundled ffmpeg; a writable data directory (§Q4a, §Q17, §Q26) |
| Local app (development) | workspace script starting `packages/app` in watch mode with `packages/web`'s dev server proxied; exact scripts per `stack`/`standards` | same |
| Collector | serverless functions from `packages/collector` on the host (§Q5) | the managed database |
| Marketing site | static build of `packages/site` on the host (§Q5, §Q13) | the collector's `GET /aggregates` at runtime |

No containers, no compose, no Kubernetes (§Q5, §Q8). The app is one process: HTTP server, pipeline runner, SSE hubs, and child processes for ffmpeg and agent CLIs.

## Configuration

| Name | Default | Consumed by | Documented |
|---|---|---|---|
| `--port` / `SLOPIFY_PORT` | 4242 | `kernel/config` → HTTP listener | README, marketing page |
| `--host` / `SLOPIFY_HOST` | 127.0.0.1; any other value prints the no-login warning (§Q6) | `kernel/config` | README |
| `--data-dir` / `SLOPIFY_DATA_DIR` | `~/.slopify` (`logic/14` §Q114) | `kernel/config`, `slices/storage` | README |
| `--no-open` / `SLOPIFY_NO_OPEN` | opens the browser | `cli.ts` | README |
| `SLOPIFY_FFMPEG` | the bundled binary | `slices/video/ffmpeg.ts` | README |
| provider keys | none | `provider_keys` table, never env (§Q22) | Settings screen |
| collector URL | built into the release | `slices/telemetry/collector-client.ts` | none (not user-configurable) |
| collector secrets (database URL) | none | `packages/collector` from the host environment (§Q22) | deployment notes |

Secrets never live in files in the repository (§Q22). Configuration precedence: flag, then env, then default.

## Infrastructure

- Local app: none beyond the user's machine; data directory layout per `logic/14` (`slopify.db`, `projects/`, `staging/`, `logs/`), created with user-only permissions (§Q6).
- Collector: serverless API + managed database with the host's daily backup (RPO 24 h, RTO within a day, best effort); a $10/month budget alert on the host (§Q24). Rate limit per machine id and dedup by event id (§Q7).
- Marketing site: static files on a serverless host; preview deployments per PR, production from `main` (§Q21).
- Observability: app logs in `<data-dir>/logs/` (JSON lines, daily rotation), warnings and errors on the terminal; no metrics, no tracing; collector uses the host's request logs (§Q23; accepted red flag §Q32).
- Incident process, on-call, maintenance windows: none; the app is local and the collector is best effort (§Q25, §Q32).

## Developer workflow

- CI on push and PR: lint and format check (Biome, with the boundary rule, §Q35), typecheck, tests on Node 26; `npm audit` fails on high severity; Dependabot weekly (§Q21, §Q24).
- Release: tag → CI publishes `slopify` to npm with semantic versioning; the package contains the built SPA; rollback is users pinning `npx slopify@<version>` (§Q21). Collector and site deploy from `main` via the host's git integration (§Q21).
- Migrations: forward-only SQL files applied at app boot; a schema newer than the app refuses to start (§Q19, §Q23); never destructive within a minor version.
- Commands per `05-dependencies.md`: Vitest for tests, `tsc --noEmit` for typecheck, Biome for lint and format; exact npm scripts are written by `build` and this chapter is refreshed by `map` once they exist.
