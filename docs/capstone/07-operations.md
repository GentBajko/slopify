---
generated_at_commit: 14480f26c13e
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: 9b1b8696221b
paths_covered:
  - ":(top)package.json"
  - ":(top)Dockerfile"
  - ":(top)compose.yaml"
  - ":(top).dockerignore"
  - ":(top)docker/**"
  - ":(top).github/workflows/**"
  - ":(top).githooks/**"
  - ":(top)scripts/**"
  - ":(top)packages/app/package.json"
  - ":(top)packages/app/scripts/**"
  - ":(top)packages/app/src/main.ts"
  - ":(top)packages/app/src/edge/*.ts"
  - ":(top)packages/app/src/edge/autostart/**"
  - ":(top)packages/app/src/edge/docker-install/**"
  - ":(top)packages/app/src/edge/http/app.ts"
  - ":(top)packages/app/src/edge/http/timeouts.ts"
  - ":(top)packages/app/src/edge/http/diagnostics.ts"
  - ":(top)packages/app/src/edge/http/storage.ts"
  - ":(top)packages/app/src/edge/http/update.ts"
  - ":(top)packages/app/src/edge/http/studio.ts"
  - ":(top)packages/app/src/edge/http/host-cli.ts"
  - ":(top)packages/app/src/edge/http/backups.ts"
  - ":(top)packages/app/src/adapters/alignment/runner.ts"
  - ":(top)packages/app/src/updater/**"
  - ":(top)packages/app/src/host-cli/**"
  - ":(top)packages/app/src/kernel/config/**"
  - ":(top)packages/app/src/kernel/paths.ts"
  - ":(top)packages/app/src/kernel/log.ts"
  - ":(top)packages/app/src/kernel/lock.ts"
  - ":(top)packages/app/src/kernel/db/index.ts"
  - ":(top)packages/app/src/kernel/db/migrate.ts"
  - ":(top)packages/app/src/kernel/ports/system-speech.ts"
  - ":(top)packages/app/src/slices/backups/**"
  - ":(top)packages/app/src/slices/storage/files-location.ts"
  - ":(top)packages/app/src/slices/storage/documents.ts"
  - ":(top)packages/app/src/slices/telemetry/collector-client.ts"
  - ":(top)packages/app/src/adapters/ffmpeg.ts"
  - ":(top)packages/app/src/adapters/alignment/threads.ts"
  - ":(top)packages/app/src/adapters/alignment/cache.ts"
  - ":(top)packages/app/src/adapters/llm/gemini-workspace.ts"
  - ":(top)packages/app/src/adapters/llm/codex-models.ts"
  - ":(top)packages/app/src/adapters/llm/claude-code-models.ts"
  - ":(top)packages/app/src/adapters/tts/system.ts"
  - ":(top)packages/app/src/catalog/store.ts"
  - ":(top)packages/extension/package.json"
  - ":(top)packages/extension/scripts/**"
  - ":(top)packages/extension/static/**"
  - ":(top)packages/collector/package.json"
  - ":(top)packages/collector/wrangler.jsonc"
  - ":(top)packages/collector/schema.sql"
  - ":(top)packages/site/package.json"
  - ":(top)packages/site/wrangler.jsonc"
  - ":(top)packages/site/scripts/**"
  - ":(top)packages/web/package.json"
  - ":(top)packages/web/vite.config.ts"
  - ":(top)packages/web/src/updates/**"
  - ":(top)README.md"
  - ":(top)docs/docker.md"
  - ":(top)docs/development.md"
  - ":(top)docs/start-at-login.md"
---

# Operations

The published package is `@gentbajko/slopify` 3.4.0, bin `slopify` → `dist/edge/cli.js`, Node `>=26` (`packages/app/package.json:3`, `packages/app/package.json:14`, `packages/app/package.json:17`). The workspace holds five packages: `app`, `web`, `extension`, `collector`, `site` (`package.json:5`, `packages/`).

## Processes

### Entry commands

| Process | Exact command | Depends on / does | Source |
|---|---|---|---|
| Native app (npx) | `npx @gentbajko/slopify@latest [--port N] [--host A] [--data-dir D] [--no-open] [--autostart\|--no-autostart]` | Foreground HTTP server; prints URL, data dir, projects, DB and logs paths; opens the browser unless disabled; asks the start-at-login question after the server is up on an interactive TTY | `packages/app/src/edge/cli.ts:78`, `packages/app/src/edge/cli.ts:101`, `packages/app/src/edge/cli.ts:122` |
| Native app (global install) | `npm install -g @gentbajko/slopify`, then `slopify` | Same entry as npx | `README.md:57` |
| Native app from checkout | `npm start` → `npm run build && node packages/app/dist/edge/cli.js` | Builds web, extension, app first | `package.json:13` |
| Throwaway data dir | `npm run start:fresh` → build, then `cli.js --data-dir .slopify-local` | Does not erase an existing `.slopify-local` | `package.json:14` |
| Native update | `npx @gentbajko/slopify@latest update` | Without a Docker install: `GET /api/update?refresh=1` on the running app, waits while `busy`, `POST /api/update`, polls every 2 s up to 10 min until the target version answers. Fails with a start instruction when nothing listens | `packages/app/src/edge/cli.ts:68`, `packages/app/src/edge/native-update.ts:18`, `packages/app/src/edge/native-update.ts:62` |
| Docker install | `npx @gentbajko/slopify@latest --docker` (also `install --docker`) `[--port N] [--projects-dir P\|documents] [--host-cli=off] [--accept-host-cli] [--autostart\|--no-autostart]` | Linux only, non-root user, Docker Engine + Compose plugin; renders `compose.yaml` + `.env` and runs `docker compose up`; exits after the transaction | `packages/app/src/edge/cli.ts:50`, `packages/app/src/edge/docker-install/run.ts:28`, `packages/app/src/edge/docker.ts:11` |
| Docker update | `npx @gentbajko/slopify@latest update` (or `update --docker`) | `update` routes to Docker when `<XDG_DATA_HOME>/slopify/docker/<name>/install.json` or legacy `receipt.json` exists; refuses when nothing is installed | `packages/app/src/edge/cli.ts:34`, `packages/app/src/edge/docker-install/run.ts:175`, `packages/app/src/edge/docker-install/apply.ts:132` |
| Hand-run compose | `docker volume create slopify-data` then `SLOPIFY_PROJECTS_DIR=… SLOPIFY_USER="$(id -u):$(id -g)" docker compose -f compose.yaml up -d` | API keys only, no snapshot/rollback on update | `docs/docker.md:151`, `compose.yaml:1` |
| Help / version | `slopify --help` / `-h` / `help`; `--version` / `-v` | Prints `helpText` | `packages/app/src/edge/cli-args.ts:52`, `packages/app/src/edge/cli-args.ts:57` |
| SPA dev server | `npm run dev` (root) → `vite` in `@slopify/web` | Proxies `/api` and `/files` to `http://127.0.0.1:6969`; the app must run separately | `package.json:15`, `packages/web/vite.config.ts:10` |
| Collector dev | `npm run schema:local --workspace @slopify/collector`, then `npm run dev --workspace @slopify/collector` (`wrangler dev`) | Local D1 copy; documented at `http://127.0.0.1:8787` | `packages/collector/package.json:8`, `docs/development.md:35` |
| Container | Image CMD `node packages/app/dist/edge/cli.js --no-open` as user `node` (compose overrides `user:`) | `/data` volume, `/data/projects` bind | `Dockerfile:56`, `Dockerfile:61`, `compose.yaml:14` |
| Host CLI helper | systemd user unit `slopify-cli-bridge.service`: `ExecStart=<node> <versions/<v>/…/dist/edge/host-cli.js> --state-dir <root>` | Serves HTTP over the Unix socket `share/cli.sock`; `Restart=on-failure`, `RestartSec=2`, `KillMode=control-group`, `TimeoutStopSec=5`, `UMask=0077` | `packages/app/src/host-cli/service.ts:12`, `packages/app/src/host-cli/service.ts:35`, `packages/app/src/edge/host-cli.ts:17` |

`--projects-dir`, `--host-cli`, `--accept-host-cli` without Docker, `--host`/`--data-dir` with Docker, any `--host-cli` value but `off`, unknown positionals and `install` without `--docker` are refused with a corrective message (`packages/app/src/edge/cli.ts:25`, `packages/app/src/edge/cli.ts:29`, `packages/app/src/edge/cli.ts:38`, `packages/app/src/edge/cli.ts:46`, `packages/app/src/edge/cli.ts:51`). Unknown options are restated with a `--help` pointer (`packages/app/src/edge/cli-args.ts:40`). Listen/permission/disk-full errors are rewritten into fixes (another port, another `--data-dir`) by `explainStartupError` (`packages/app/src/edge/cli.ts:137`).

Shutdown: SIGINT/SIGTERM run the graceful stop; a second signal exits 1 immediately (`packages/app/src/edge/signal-shutdown.ts:10`).

### Internal child processes

| Child | Launch | Notes | Source |
|---|---|---|---|
| Managed-version forward | `node <data-dir>/updates/<v>/…/dist/edge/cli.js <original args>`, stdio inherited | Skipped when `SLOPIFY_SKIP_MANAGED_UPDATE=1` | `packages/app/src/updater/forward.ts:9`, `packages/app/src/edge/cli.ts:79` |
| Update worker | `node <dist>/edge/update-worker.js <updates/plan-<uuid>.json>`, detached, IPC | Runs the npm install and candidate start | `packages/app/src/updater/install.ts:16`, `packages/app/src/edge/update-worker.ts` |
| npm installer | `<npm-cli.js> install --prefix <updates/<v>> --registry … --no-audit --no-fund --omit=dev --save-exact --global=false --workspaces=false --userconfig … --globalconfig … --cache <updates/npm-cache> @gentbajko/slopify@<v>` | 15-minute timeout | `packages/app/src/updater/plan.ts:42`, `packages/app/src/updater/worker.ts:138` |
| Update candidate | `node <entry> --host H --port P --data-dir D --no-open`, detached, stdout/stderr → `logs/updates.log` | Env `SLOPIFY_SKIP_MANAGED_UPDATE=1`, token, pending/failed flags; readiness wait 60 s | `packages/app/src/updater/plan.ts:67`, `packages/app/src/updater/worker.ts:49`, `packages/app/src/updater/worker.ts:166` |
| Alignment worker | `fork(<dist>/adapters/alignment/worker.js)` | Threads `min(8, CPUs−1)` unless `SLOPIFY_SUBTITLE_THREADS` | `packages/app/src/adapters/alignment/runner.ts:24`, `packages/app/src/adapters/alignment/threads.ts:12` |
| FFmpeg recovery | `node ffmpeg-static/install.js` with `FFMPEG_BIN=<staging>`; 180 s timeout | Only when the bundled binary is missing; lands in `<data-dir>/bin/ffmpeg-static-<v>-<platform>-<arch>` | `packages/app/src/adapters/ffmpeg.ts:42`, `packages/app/src/adapters/ffmpeg.ts:56` |
| Browser / folder open | `open`, `cmd /c start "" <url>`, `cmd.exe /c start` (WSL), `xdg-open`; folders `explorer.exe` / `open` / `xdg-open` (WSL via `wslpath -w`) | Browser failure is a warning only | `packages/app/src/edge/open-browser.ts:38`, `packages/app/src/edge/open-folder.ts:7` |
| Docker volume helper | `docker run --rm --network none --read-only --user 0:0 --entrypoint node <image> /opt/slopify/packages/app/dist/edge/docker-install/volume.js <op> <user>` | Ops `projects`, `private`, `snapshot`, `restore`, `own` | `packages/app/src/edge/docker-install/engine.ts:105`, `packages/app/src/edge/docker-install/engine.ts:155`, `packages/app/src/edge/docker-install/volume.ts:8` |
| Compose | `docker compose --project-directory <dir> --file <dir>/compose.yaml --env-file <dir>/.env --project-name <name> up --detach --force-recreate --no-build --pull never` | Also `stop` during a transaction | `packages/app/src/edge/docker-install/engine.ts:419`, `packages/app/src/edge/docker-install/apply.ts:80` |

### In-process timers

Batch queue pump every 1 s, schedule tick every 15 s, retry wake every 5 s, model-catalogue sync check hourly, backup tick every 60 s, trash purge hourly and once at start (`packages/app/src/main.ts:657`, `packages/app/src/main.ts:668`, `packages/app/src/main.ts:673`, `packages/app/src/main.ts:700`, `packages/app/src/main.ts:703`, `packages/app/src/main.ts:729`). Telemetry flushes once after listen (`packages/app/src/main.ts:733`).

### Start at login (per data folder)

Native: Settings → General switch, the first-run screen, or the terminal question `Start Slopify when you log in? (Y/n)`; `--autostart`/`--no-autostart` set it without asking (`packages/app/src/edge/autostart/prompt.ts:4`, `packages/app/src/edge/cli.ts:122`). The answered flag is settings key `autostart.answered` (`packages/app/src/edge/autostart/model.ts:30`).

| Platform | Login entry | Launcher | Source |
|---|---|---|---|
| Linux | `$XDG_CONFIG_HOME/autostart/slopify.desktop` (default `~/.config`), marker `X-Slopify-Autostart=true` | `<data-dir>/autostart/start-slopify.sh` | `packages/app/src/edge/autostart/native.ts:80`, `packages/app/src/edge/autostart/launcher.ts:36` |
| macOS | `~/Library/LaunchAgents/stream.slopify.app.plist` | `<data-dir>/autostart/start-slopify.sh` | `packages/app/src/edge/autostart/native.ts:90`, `packages/app/src/edge/autostart/launcher.ts:37` |
| Windows | `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` value `Slopify` | `<data-dir>\autostart\start-slopify.cmd`; a `%` in the data path is refused | `packages/app/src/edge/autostart/launcher.ts:38`, `packages/app/src/edge/autostart/launcher.ts:141` |

The launcher runs `--no-open --data-dir <dir> --port <p> [--host <h>]` through, in order, the installed `cli.js` (not the `_npx` cache), `npx-cli.js` beside the recorded Node pinned to `@gentbajko/slopify@<version>`, or `npx` from PATH; output appends to `<data-dir>/logs/autostart.log` (`packages/app/src/edge/autostart/launcher.ts:43`, `packages/app/src/edge/autostart/index.ts:48`, `packages/app/src/edge/autostart/index.ts:63`). The switch is scoped to one data folder: status, disable and refresh act only on an entry that runs this data folder's launcher; enabling while another data folder owns the entry is refused (`packages/app/src/edge/autostart/native.ts:191`, `packages/app/src/edge/autostart/native.ts:199`, `packages/app/src/edge/autostart/native.ts:216`, `packages/app/src/edge/autostart/native.ts:234`). Every start with the switch on rewrites launcher and entry (`refreshAutostart: true`, `packages/app/src/edge/cli.ts:86`).

Docker: the container follows `restart: unless-stopped` (`compose.yaml:15`). The installer asks the same question, reads (never changes) Docker Desktop's `settings-store.json`/`settings.json` or `systemctl [--user] is-enabled docker.service`, and writes `<install-dir>/activation/login-start.json`, read by the container at `/opt/slopify-install/login-start.json` (`packages/app/src/edge/autostart/docker-record.ts:35`, `packages/app/src/edge/autostart/docker.ts:11`, `packages/app/src/edge/autostart/docker.ts:63`, `packages/app/src/edge/autostart/docker.ts:85`). `PUT /api/settings/autostart` is native-only (`packages/app/src/edge/http/app.ts:213`, `docs/start-at-login.md:98`).

## Configuration

### CLI flags

| Flag | Env counterpart | Default | Applies to | Source |
|---|---|---|---|---|
| `--port <n>` | `SLOPIFY_PORT` (native), `SLOPIFY_DOCKER_HOST_PORT` (Docker) | `6969` | both; native 1–65535, Docker 0–65535 (empty/0 = free port) | `packages/app/src/kernel/config/index.ts:24`, `packages/app/src/edge/docker-install/run.ts:35` |
| `--host <addr>` | `SLOPIFY_HOST` | `127.0.0.1`; empty is refused; non-loopback prints a no-login warning | native | `packages/app/src/kernel/config/index.ts:25`, `packages/app/src/edge/cli.ts:106` |
| `--data-dir <dir>` | `SLOPIFY_DATA_DIR` | `~/.slopify`, resolved against CWD | native | `packages/app/src/kernel/config/index.ts:26` |
| `--no-open` | `SLOPIFY_NO_OPEN` (truthy unless empty/`0`/`false`) | opens browser | native | `packages/app/src/kernel/config/index.ts:39`, `packages/app/src/kernel/config/index.ts:53` |
| `--autostart` / `--no-autostart` | — | ask on interactive TTY | both | `packages/app/src/edge/cli-args.ts:12` |
| `--docker` | — | off | Docker | `packages/app/src/edge/cli-args.ts:9` |
| `--projects-dir <dir\|documents>` | `SLOPIFY_DOCKER_PROJECTS_DIR` | remembered → `<Documents>/Slopify/Projects` (new) or `~/Slopify/Projects` (no Documents); `~/` expanded; `documents` = Documents default | Docker | `packages/app/src/edge/docker-install/run.ts:44`, `packages/app/src/edge/docker-install/apply.ts:145` |
| `--host-cli=off` | — | helper when a CLI is found | Docker | `packages/app/src/edge/docker.ts:47` |
| `--accept-host-cli` | — | ask | Docker | `packages/app/src/edge/docker-install/run.ts:77` |

A flag beats its variable (`packages/app/src/kernel/config/index.ts:24`). A data dir given by flag or `SLOPIFY_DATA_DIR` keeps a new install's files inside it instead of Documents (`packages/app/src/edge/cli.ts:94`).

### Environment variables

Values of names matching `*_SECRET`, `*_TOKEN`, `*_PASSWORD`, `*_KEY` are shown as `<redacted>`.

| Variable | Default | Consuming / writing code | Documented where |
|---|---|---|---|
| SLOPIFY_PORT | `6969`; image sets `6969`; in compose it is the host port (empty = free port) | `packages/app/src/kernel/config/index.ts:24`, `Dockerfile:24`, `compose.yaml:19`, `packages/app/src/edge/docker-install/apply.ts:293` | `README.md:107`, `docs/docker.md:158` |
| SLOPIFY_HOST | `127.0.0.1`; image `0.0.0.0` | `packages/app/src/kernel/config/index.ts:25`, `Dockerfile:23` | `README.md:108` |
| SLOPIFY_DATA_DIR | `~/.slopify`; image `/data` | `packages/app/src/kernel/config/index.ts:26`, `packages/app/src/edge/cli.ts:95`, `Dockerfile:25` | `README.md:109` |
| SLOPIFY_NO_OPEN | unset; image `1` | `packages/app/src/kernel/config/index.ts:39`, `Dockerfile:26` | `README.md:110` |
| SLOPIFY_FFMPEG | unset → bundled/recovered ffmpeg | `packages/app/src/adapters/ffmpeg.ts:22`, `packages/app/src/slices/video/ffmpeg.ts:31` | `README.md:111`, `docs/ffmpeg.md` |
| FFMPEG_BIN | unset; lower-priority override; set on the recovery installer child | `packages/app/src/adapters/ffmpeg.ts:22`, `packages/app/src/adapters/ffmpeg.ts:57` | Error text `packages/app/src/adapters/ffmpeg.ts:78` |
| SLOPIFY_NO_MODEL_PREFETCH | unset → caption model fetched at start | `packages/app/src/edge/cli.ts:88` | `README.md:112` |
| SLOPIFY_NO_MODEL_REFRESH | unset → model catalogue synced daily | `packages/app/src/edge/cli.ts:97` | source only |
| SLOPIFY_SUBTITLE_MODEL_SEED | unset; image points at `/opt/slopify/models/english-subtitles/wav2vec2-base-960h-cd5040c1.onnx` | `packages/app/src/edge/cli.ts:90`, `Dockerfile:30` | `Dockerfile:49` comment |
| SLOPIFY_SUBTITLE_THREADS | `min(8, CPUs−1)` | `packages/app/src/adapters/alignment/threads.ts:12` | source only |
| SLOPIFY_COLLECTOR_URL | `https://collector.slopify.stream`; invalid/non-HTTP falls back | `packages/app/src/slices/telemetry/collector-client.ts:29` | Test seam per `packages/app/src/slices/telemetry/collector-client.ts:23` |
| SLOPIFY_PIPER_VOICES | empty → Piper voices omitted; `:`-separated `.onnx` paths | `packages/app/src/kernel/ports/system-speech.ts:165` | source comment `:162` |
| SLOPIFY_CODEX_MODELS_FILE | `<CODEX_HOME>/models_cache.json` | `packages/app/src/adapters/llm/codex-models.ts:41` | source only |
| CODEX_HOME | `~/.codex` | `packages/app/src/adapters/llm/codex-models.ts:40`, `packages/app/src/adapters/image/codex-output.ts:32`; captured for the helper `packages/app/src/host-cli/environment.ts:11` | source only |
| CLAUDE_CONFIG_DIR | inherited | Model-discovery env allowlist `packages/app/src/adapters/llm/claude-code-models.ts:65`; helper capture `packages/app/src/host-cli/environment.ts:12` | source only |
| GEMINI_API_KEY | `<redacted>` | Gemini sign-in check `packages/app/src/host-cli/gemini-login.ts:43`, `packages/app/src/slices/settings/health.ts:190` | Health message |
| SLOPIFY_SKIP_MANAGED_UPDATE | unset; image `1`; update candidates `1` | `packages/app/src/updater/forward.ts:9`, `packages/app/src/updater/worker.ts:56`, `Dockerfile:27` | internal |
| SLOPIFY_DISABLE_UPDATES | unset; image `1` (registry not asked, in-app install replaced by the terminal command) | `packages/app/src/main.ts:430`, `Dockerfile:28` | internal |
| SLOPIFY_CONTAINER | unset; image `1` (Docker file layout, Docker autostart view, host CLI client) | `packages/app/src/main.ts:256`, `packages/app/src/main.ts:332`, `packages/app/src/edge/autostart/index.ts:24`, `Dockerfile:29` | internal |
| SLOPIFY_UPDATE_TOKEN | `<redacted>` | Writers `packages/app/src/updater/worker.ts:57`, `packages/app/src/edge/docker-install/apply.ts:299`, `compose.yaml:55`; reader `packages/app/src/main.ts:238` | internal activation handshake |
| SLOPIFY_UPDATE_PENDING | unset/`0`; `1` on a candidate | `packages/app/src/main.ts:240`, `packages/app/src/updater/worker.ts:58`, `compose.yaml:56` | internal |
| SLOPIFY_UPDATE_FAILED | unset; `1` when the old entry is restarted after a failed update | `packages/app/src/main.ts:427`, `packages/app/src/updater/worker.ts:59` | internal |
| SLOPIFY_DOCKER_INSTALL_STATE | unset; compose sets `/opt/slopify-install/activation.json` (any other value refuses boot) | `packages/app/src/main.ts:229`, `packages/app/src/edge/docker-install/activation.ts:45`, `compose.yaml:54` | internal |
| SLOPIFY_DOCKER_PROJECTS_DIR | installer: host projects override; container: host path of the projects bind | `packages/app/src/edge/docker-install/run.ts:44`, `packages/app/src/edge/docker-install/activation.ts:44`, `compose.yaml:51` | `docs/docker.md` |
| SLOPIFY_DOCKER_BACKUPS_DIR | empty → backups in `/data/projects/Backups`; set → `/data/backups` | `packages/app/src/edge/docker-install/activation.ts:31`, `compose.yaml:52` | internal |
| SLOPIFY_HOST_CLI_DIR | unset; compose `/opt/slopify-host` | `packages/app/src/main.ts:332`, `compose.yaml:53` | internal |
| SLOPIFY_DOCKER_NAME | `slopify`; `[A-Za-z0-9][A-Za-z0-9_.-]*`, ≤128 | `packages/app/src/edge/docker-install/run.ts:45`, `packages/app/src/edge/docker-install/state.ts:7` | `docs/docker.md:48` |
| SLOPIFY_DOCKER_VOLUME | `slopify-data` | `packages/app/src/edge/docker-install/run.ts:46` | `docs/docker.md:48` |
| SLOPIFY_DOCKER_IMAGE | `ghcr.io/gentbajko/slopify:<installer version>`; image version must equal installer version | `packages/app/src/edge/docker-install/run.ts:99`, `packages/app/src/edge/docker-install/apply.ts:184` | source only |
| SLOPIFY_DOCKER_HOST_PORT | remembered → existing container → `6969` | `packages/app/src/edge/docker-install/run.ts:35`, `packages/app/src/edge/docker-install/apply.ts:180` | source only |
| SLOPIFY_NAME / SLOPIFY_IMAGE / SLOPIFY_USER / SLOPIFY_VOLUME | compose defaults `slopify` / `ghcr.io/gentbajko/slopify:latest` / `1000:1000` / `slopify-data`; installer writes them into `.env` (`0:0` under rootless) | `compose.yaml:7`, `compose.yaml:11`, `compose.yaml:14`, `compose.yaml:71`, `packages/app/src/edge/docker-install/apply.ts:290` | `docs/docker.md:158` |
| SLOPIFY_PROJECTS_DIR | required by compose | `compose.yaml:25`, `packages/app/src/edge/docker-install/apply.ts:295` | `docs/docker.md:159` |
| SLOPIFY_BACKUPS_DIR | `./backups-off` (empty placeholder) | `compose.yaml:31`, `packages/app/src/edge/docker-install/apply.ts:296` | `docs/docker.md:160` |
| SLOPIFY_HOST_CLI_SHARE | `./host-cli-off` | `compose.yaml:38`, `packages/app/src/edge/docker-install/apply.ts:297` | `docs/docker.md:161` |
| SLOPIFY_ACTIVATION_DIR | `./activation` | `compose.yaml:45`, `packages/app/src/edge/docker-install/apply.ts:298` | source only |
| XDG_DATA_HOME | `~/.local/share`; roots `slopify/docker/<name>` and `slopify/host-cli` | `packages/app/src/edge/docker-install/state.ts:104`, `packages/app/src/edge/docker-install/run.ts:74`, `packages/app/src/host-cli/paths.ts:15`, `packages/app/src/slices/fonts/discovery.ts:24` | `docs/docker.md:34` |
| XDG_CONFIG_HOME | `~/.config`; autostart entry, systemd user unit dir, `user-dirs.dirs` | `packages/app/src/edge/autostart/native.ts:83`, `packages/app/src/host-cli/service.ts:134`, `packages/app/src/slices/storage/documents.ts:71` | `docs/start-at-login.md:28` |
| XDG_CACHE_HOME, SSL_CERT_FILE, NODE_EXTRA_CA_CERTS, HOME, PATH | captured into the helper's `host-environment.json` | `packages/app/src/host-cli/environment.ts:7` | `docs/docker.md:109` |
| DOCKER_HOST / DOCKER_CONTEXT | unset; only a local `unix://` endpoint is accepted; Docker Desktop and rootful userns-remap refused | `packages/app/src/edge/docker-install/engine.ts:208`, `packages/app/src/edge/docker-install/engine.ts:221`, `packages/app/src/edge/docker-install/engine.ts:241` | `docs/docker.md:176` |
| USERPROFILE / APPDATA / LOCALAPPDATA / WINDIR | Windows Documents fallback, Docker Desktop settings path, font dirs | `packages/app/src/slices/storage/documents.ts:62`, `packages/app/src/edge/autostart/docker.ts:87`, `packages/app/src/slices/fonts/discovery.ts:16` | source only |
| WSL_DISTRO_NAME / WSL_INTEROP | presence = WSL | `packages/app/src/edge/open-browser.ts:8` | source only |
| NODE_ENV / HOME (image) | `production` / `/data/home` | `Dockerfile:21` | image |
| GEMINI_CLI_HOME, GEMINI_CLI_TRUSTED_FOLDERS_PATH, GEMINI_SYSTEM_MD, GEMINI_WRITE_SYSTEM_MD=false, GEMINI_CLI_NO_RELAUNCH=true, NO_BROWSER=true, GOOGLE_APPLICATION_CREDENTIALS | set on Gemini CLI children | `packages/app/src/adapters/llm/gemini-workspace.ts:140` | internal |
| SLOPIFY_SPEECH_VOICE / _OUT / _TEXT | set on the Windows System.Speech PowerShell child | `packages/app/src/adapters/tts/system.ts:65` | internal |
| npm_config_update_notifier | `false` on the update installer child | `packages/app/src/updater/worker.ts:139` | internal |
| SLOPIFY_SMOKE_IMAGE / SLOPIFY_SMOKE_KEEP / SLOPIFY_DOCKER_FIXTURE_OUT | `slopify:smoke` / unset (failed smoke material removed unless `1`) / unset | `packages/app/scripts/container-smoke.sh:12`, `packages/app/scripts/docker-install-smoke.mjs:249`, `packages/app/scripts/docker-install-smoke.mjs:136` | scripts only |
| GH_TOKEN | `<redacted>`; set to the workflow's `github.token` in the CI `changes` job | `packages/app/scripts/ci-changes.mjs:67`, `.github/workflows/ci.yml:88-89` | script header `packages/app/scripts/ci-changes.mjs:4-9` |
| GITHUB_REPOSITORY | set by GitHub Actions; unset locally (the script then compares with the last release tag) | `packages/app/scripts/ci-changes.mjs:66` | script header |
| CWS_SERVICE_ACCOUNT_JSON | `<redacted>`; repository secret passed to the release `chrome-web-store` job | `packages/extension/scripts/publish-chrome.mjs:19`, `.github/workflows/release.yml:82` | script header `packages/extension/scripts/publish-chrome.mjs:5-11` |
| CWS_PUBLISHER_ID / CWS_EXTENSION_ID | unset; repository secrets passed to the same job (all three unset → the upload is skipped with exit 0) | `packages/extension/scripts/publish-chrome.mjs:20-26`, `.github/workflows/release.yml:83-84` | script header |
| SLOPIFY_APP_DIR, SAMPLE_RECORD, SAMPLE_SCRATCH, FFMPEG | sample-archive build only | `packages/app/src/sample-build/generate.ts:584`, `packages/app/scripts/build-sample.mjs:53` | script header |
| DB | Cloudflare D1 binding `slopify-collector` | `packages/collector/src/index.ts`, `packages/collector/wrangler.jsonc:22` | `docs/development.md:49` |

Provider API keys are SQLite settings rows, not environment configuration (`packages/app/src/slices/settings/repo.ts`).

## Infrastructure

### Data folder layout (native: `--data-dir`, default `~/.slopify`; Docker: volume at `/data`)

| Path | Contents | Source |
|---|---|---|
| `slopify.db` (+`-wal`, `-shm`) | SQLite, WAL, foreign keys, 5 s busy timeout, files chmod `0600` | `packages/app/src/kernel/paths.ts:36`, `packages/app/src/kernel/db/index.ts:9` |
| `.lock` | Single-instance lock recording pid and process start time | `packages/app/src/kernel/paths.ts:42`, `packages/app/src/kernel/lock.ts` |
| `staging/`, `logs/` | Uploads in flight; log files. Forced to `0700` at boot | `packages/app/src/kernel/paths.ts:40`, `packages/app/src/kernel/paths.ts:62` |
| `projects/` (+`projects/Backups/`) | Project files and default backups for installs that keep files in the data dir (pre-3.0, custom `--data-dir`, tests) | `packages/app/src/kernel/paths.ts:33`, `packages/app/src/slices/storage/files-location.ts:52` |
| `models.yaml` (+`.previous`, `.next`), `models-sync.json` | Model catalogue seeded from the bundled YAML, refreshed from GitHub raw | `packages/app/src/catalog/store.ts:19`, `packages/app/src/catalog/store.ts:69`, `packages/app/src/catalog/store.ts:126` |
| `models/english-subtitles/`, `models/multilingual-subtitles/` | Alignment models (English from Hugging Face, size/SHA-256 checked; image copies from the seed) | `packages/app/src/kernel/paths.ts:78`, `packages/app/src/adapters/alignment/cache.ts:35` |
| `fonts/` | Uploaded fonts | `packages/app/src/slices/fonts/upload.ts:43` |
| `bin/ffmpeg-static-<v>-<platform>-<arch>/` | Recovered ffmpeg | `packages/app/src/adapters/ffmpeg.ts:42` |
| `updates/<version>/`, `updates/current.json`, `updates/npm-cache/`, `updates/before-<v>-<ms>.db`, `updates/plan-<uuid>.json` | Managed native updates; older installs and backups pruned after commit | `packages/app/src/updater/plan.ts:39`, `packages/app/src/updater/plan.ts:125`, `packages/app/src/updater/plan.ts:154`, `packages/app/src/updater/worker.ts:25` |
| `autostart/start-slopify.{sh,cmd}` | Login launcher | `packages/app/src/edge/autostart/native.ts:80` |
| `<projects>/.render-cache/<projectId>/` | Clips of the project's last video render, reused when their key matches; all caches together capped at 30 GiB with a free-space floor; skipped when the files location moves | `packages/app/src/slices/storage/layout.ts:12-16`, `packages/app/src/slices/video/clip-cache.ts:16-31`, `packages/app/src/slices/storage/files-location.ts:418` |
| `imports/`, `cache/style-preview/` | Backup import workspace; style preview cache | `packages/app/src/slices/storage/backup-import.ts:169`, `packages/app/src/slices/style-preview/service.ts:16` |
| `home/` (Docker only) | Container `HOME` | `Dockerfile:22` |

User-visible files: a fresh native install with the default data dir stores `files.location = {kind:"root"}` pointing at `<Documents>/Slopify` (or `Slopify 2`…`Slopify 20` when `Projects` there is non-empty), with `Projects/`, `Backups/`, `Exports/`; otherwise `{kind:"data-dir"}` (`packages/app/src/slices/storage/files-location.ts:27`, `packages/app/src/slices/storage/files-location.ts:44`, `packages/app/src/slices/storage/files-location.ts:81`). Documents is resolved via `xdg-user-dir DOCUMENTS`, then `XDG_DOCUMENTS_DIR` in `user-dirs.dirs`, then `~/Documents`; Windows asks PowerShell for `MyDocuments` (`packages/app/src/slices/storage/documents.ts:50`). A container's layout is fixed: `/data/projects`, and `/data/backups` when `SLOPIFY_DOCKER_BACKUPS_DIR` is set (`packages/app/src/edge/docker-install/activation.ts:27`).

### Docker

| Item | Details | Source |
|---|---|---|
| Image | `ghcr.io/gentbajko/slopify:<version>` and `:latest`, linux/amd64 + linux/arm64. Two-stage `node:26-bookworm-slim`; `fonts-dejavu-core`, `espeak-ng`, verified ffmpeg-static, English caption model from `docker/subtitle-model/`; label `io.slopify.host-cli-protocol=1`; `USER node`, `VOLUME /data`, `EXPOSE 6969` | `Dockerfile:1`, `Dockerfile:19`, `Dockerfile:39`, `Dockerfile:51`, `Dockerfile:56`, `.github/workflows/release.yml:96-101` |
| Image healthcheck | `GET /api/health`, interval 30 s, timeout 5 s, start period 90 s | `Dockerfile:59` |
| Compose service `slopify` | No profiles. `restart: unless-stopped`; `127.0.0.1:${SLOPIFY_PORT-6969}:6969`; healthcheck `/api/health` 30 s / 5 s / start 120 s / start interval 2 s | `compose.yaml:10`, `compose.yaml:15`, `compose.yaml:19`, `compose.yaml:57` |
| Volumes | external named volume `${SLOPIFY_VOLUME:-slopify-data}` → `/data`; bind projects → `/data/projects`; bind backups → `/data/backups`; read-only bind helper share → `/opt/slopify-host`; read-only bind activation → `/opt/slopify-install` | `compose.yaml:20`, `compose.yaml:68` |
| Install folder `<XDG_DATA_HOME>/slopify/docker/<name>/` (0700) | `install.json` (v2: name, volume, daemon ID, image, appVersion, user, port, projects + dev/ino, backups, hostCli, token, recovery), `update.json` (in-flight transaction), `update.lock` (pid, O_EXCL), `.env`, `compose.yaml`, `activation/activation.json` (`{version, token, committed}`), `activation/login-start.json`, `host-cli-off/`; legacy `receipt.json`/`journal.json` read only for adoption | `packages/app/src/edge/docker-install/state.ts:32`, `packages/app/src/edge/docker-install/state.ts:58`, `packages/app/src/edge/docker-install/apply.ts:95`, `packages/app/src/edge/docker-install/apply.ts:104`, `packages/app/src/edge/docker-install/apply.ts:579` |
| Recovery volume | `<volume>-recovery-<uuid>` labelled `io.slopify.transaction`, `io.slopify.container`; only the newest is kept after commit | `packages/app/src/edge/docker-install/apply.ts:262`, `packages/app/src/edge/docker-install/apply.ts:432` |
| Host helper root `<XDG_DATA_HOME>/slopify/host-cli/` (0700) | `versions/<v>/` (npm install `--ignore-scripts`), `share/cli.sock` (path ≤100 bytes), `share/token` (64 hex, Bearer), `host-environment.json`; unit file in `$XDG_CONFIG_HOME/systemd/user/`; lingering enabled via `loginctl enable-linger` | `packages/app/src/host-cli/install.ts:77`, `packages/app/src/host-cli/install.ts:103`, `packages/app/src/host-cli/paths.ts:19`, `packages/app/src/host-cli/service.ts:134`, `packages/app/src/host-cli/service.ts:180` |
| Helper protocol 1 | `GET /v1/health`, `GET /v1/status/:provider`, `GET /v1/models/:provider`, `POST /v1/llm/:provider`, `POST /v1/image`, `POST /v1/open-folder` | `packages/app/src/edge/http/host-cli.ts:126`, `packages/app/src/edge/http/host-cli.ts:354` |

Install/update transaction (`applyDocker`, `packages/app/src/edge/docker-install/apply.ts:92`): take `update.lock`; finish the undo of any interrupted `update.json`; refuse a different Docker daemon than recorded; pull the image and require its version to equal the installer's; return unchanged (starting a stopped container) when nothing differs; wait while `GET /api/update` reports `busy` (5 s poll); install/update the helper; record `update.json`; stop the old container (compose `stop`, or for a legacy container set restart `no`, stop and rename `<name>-previous-<uuid>`); snapshot the volume into the recovery volume; copy projects into a new empty folder if the projects path changed; write `compose.yaml`, `.env` and an uncommitted `activation.json`; `compose up`; wait up to 120 s for `/api/health` and token-authenticated `/api/update/ready` to report the exact version; write `install.json`, mark activation committed, delete `update.json`, then remove stopped legacy containers and older recovery volumes (`packages/app/src/edge/docker-install/apply.ts:113`, `packages/app/src/edge/docker-install/apply.ts:184`, `packages/app/src/edge/docker-install/apply.ts:215`, `packages/app/src/edge/docker-install/apply.ts:304`, `packages/app/src/edge/docker-install/apply.ts:326`, `packages/app/src/edge/docker-install/engine.ts:433`). Any failure rolls back: stop/remove the candidate, restore the volume from the recovery copy if the candidate started, remove the published projects copy, restore the previous `.env`/activation and `compose up`, or rename and restart the legacy container (`packages/app/src/edge/docker-install/apply.ts:361`). The volume is never removed or recreated (`packages/app/src/edge/docker-install/apply.ts:87`). A new install gets `<Documents>/Slopify/Projects` plus a sibling `Backups` bind; existing installs keep backups inside Projects (`packages/app/src/edge/docker-install/apply.ts:156`).

### Other services

| Service | Configuration | Source |
|---|---|---|
| Local HTTP server | `@hono/node-server`, `/api/*`, `/files`, SPA static fallback from `dist/web`; `GET /api/health`; no login | `packages/app/src/edge/http/app.ts:168`, `packages/app/src/edge/http/app.ts:297`, `packages/app/src/edge/http/app.ts:314` |
| Request timeouts | Node `requestTimeout` set to 0; per-request 5-minute limit re-applied, except `PUT /api/storage/import` which only times out after 5 minutes of upload idleness; Node's 1-minute `headersTimeout` unchanged | `packages/app/src/edge/http/timeouts.ts:11`, `packages/app/src/edge/http/timeouts.ts:21`, `packages/app/src/main.ts:977` |
| Telemetry collector | Cloudflare Worker `slopify-collector`, `src/index.ts`, compat date `2026-08-01`, custom domain `collector.slopify.stream`, observability on, D1 binding `DB` → `slopify-collector`; `POST /events`, `GET /aggregates`; CORS for `https://slopify.stream` | `packages/collector/wrangler.jsonc:3`, `packages/collector/src/index.ts:18`, `packages/collector/src/index.ts:25`, `packages/collector/schema.sql:3` |
| Marketing site | Cloudflare static-assets Worker `slopify-site`, `./public`, custom domain `slopify.stream`, no server code; counters use `http://127.0.0.1:8787` on loopback origins | `packages/site/wrangler.jsonc:3`, `packages/site/public/main.js:7` |
| External network dependencies | npm registry (updates, helper install), GitHub raw `models.yaml`, Hugging Face model, provider APIs, ghcr.io | `packages/app/src/updater/registry.ts:11`, `packages/app/src/catalog/store.ts:19`, `packages/app/src/adapters/alignment/cache.ts:35` |

## Developer workflow

| Action | Exact command | Source |
|---|---|---|
| Install | `npm install` (CI: `npm ci`) | `docs/development.md:7`, `.github/workflows/ci.yml:19` |
| Pre-commit hook | `git config core.hooksPath .githooks` once; hook runs `npx --no-install biome check --staged --no-errors-on-unmatched` | `docs/development.md:8`, `.githooks/pre-commit:4` |
| Lint / format check | `npm run lint` → `biome check .` | `package.json:9` |
| Type check | `npm run typecheck` (workspaces; web first emits app declarations) | `package.json:10`, `packages/web/package.json:9` |
| Tests | `npm test` → `vitest run`; CI shards `npx vitest run --shard=N/5` | `package.json:11`, `.github/workflows/ci.yml:43` |
| Build | `npm run build` → web (`vite build`), extension, then app (`tsc -p tsconfig.build.json` + copy migrations, assets, web, extension) | `package.json:12`, `packages/app/package.json:26` |
| Migrations | No standalone command; boot runs `migrate` over `dist/.../migrations/*.sql` (35 files, `0001`–`0042`) sorted by name, each in a transaction; a DB newer than the app is refused | `packages/app/src/main.ts:253`, `packages/app/src/kernel/db/migrate.ts:17`, `packages/app/src/kernel/db/migrate.ts:26` |
| Packed-install smoke | `node packages/app/scripts/install-smoke.mjs` (after build): `npm pack`, global installs, starts bin and npm-exec forms until `/api/health` | `packages/app/scripts/install-smoke.mjs:19` |
| Image smoke | `docker build -t slopify:smoke .` then `bash packages/app/scripts/container-smoke.sh` and `node packages/app/scripts/host-cli-smoke.mjs` | `.github/workflows/ci.yml:112-116` |
| Docker-install smoke | `node packages/app/scripts/docker-install-smoke.mjs` (alias `npm run smoke:docker-install --workspace @gentbajko/slopify`) | `packages/app/package.json:29`, `.github/workflows/ci.yml:118` |
| Audit | `npm audit --audit-level=high` | `.github/workflows/ci.yml:25` |
| Sample archives | `node packages/app/scripts/build-sample.mjs [--short \| --demo <id>] [--assets <dir>] [out.tar]` (needs ffmpeg, `magick`) | `packages/app/scripts/build-sample.mjs:9` |
| Multilingual alignment check | `node packages/app/scripts/validate-multilingual-alignment.mjs --audio … --text … --language …` | `packages/app/scripts/validate-multilingual-alignment.mjs:7` |
| Collector schema | `npm run schema:local` / `npm run schema:remote` (`--workspace @slopify/collector`) | `packages/collector/package.json:9`, `packages/collector/package.json:12` |
| Cloudflare deploy | `npm run deploy:check` (dry run both); `npm run deploy` (collector, then site); D1 schema not applied | `package.json:16`, `package.json:17` |
| Walkthrough video | `node packages/site/scripts/record-walkthrough.mjs [--out <dir>] [--publish] [--keep]` (after build) | `packages/site/scripts/record-walkthrough.mjs:8` |
| Wiki sync | `node scripts/wiki-sync.mjs <slopify.wiki checkout> [--delete]` | `scripts/wiki-sync.mjs:6` |

## Release process

1. Draft notes: `node scripts/patch-notes.mjs <version> [--force]` writes `docs/patch-notes/<version>.md` from `docs/capstone/changelog.d/*.md` fragments not in the previous `x.y.z` tag and prepends the version to `docs/patch-notes/index.json` (`scripts/patch-notes.mjs:5`). The build copies `docs/patch-notes/` to `dist/patch-notes/` and `docs/wiki/` to `dist/tutorials/`; `.dockerignore` keeps both (`packages/app/scripts/copy-assets.mjs:15`, `.dockerignore:10`).
2. Push main. CI (`ci.yml`, every branch push and PR) runs lint, typecheck, build, audit and five test shards on Node 26. The Windows job (install smoke plus Windows-specific tests) and the container matrix (`image`, `docker-install`) run only when `ci-changes.mjs` reports the app version untagged and relevant changes since that job last passed on main (read through the GitHub API with `GH_TOKEN`), or since the last release tag when no such run is found (`.github/workflows/ci.yml:10`, `.github/workflows/ci.yml:46`, `.github/workflows/ci.yml:71`, `packages/app/scripts/ci-changes.mjs:1-9`).
3. Tag the passing commit with plain `x.y.z`. `release.yml` checks tag = `packages/app/package.json` version, requires a successful `ci.yml` run on main for that SHA, then, side by side, publishes `npm publish --provenance --access public --workspace @gentbajko/slopify` via OIDC, builds and uploads the extension to the Chrome Web Store (`chrome-web-store` job), and builds per-arch images pushed by digest; `container-merge` waits for the images and the npm publish, then tags `:<version>` and `:latest` (`.github/workflows/release.yml:21`, `.github/workflows/release.yml:36-42`, `.github/workflows/release.yml:61`, `.github/workflows/release.yml:66-84`, `.github/workflows/release.yml:136-137`, `.github/workflows/release.yml:158-159`).
4. Cloudflare deploys are manual (`npm run deploy`); first-time collector setup is `wrangler login`, `wrangler d1 create slopify-collector`, remote schema, deploy (`docs/development.md:47`).

## Native updates

`GET /api/update` (cached 15 min unless `?refresh=1`), `POST /api/update`, `DELETE /api/update`, `GET /api/update/ready`, `POST /api/update/activate` (`packages/app/src/edge/http/update.ts:19`, `packages/app/src/updater/service.ts:126`). The registry check times out at 10 s (`packages/app/src/updater/registry.ts:11`). Installation takes the updater mutation gate, installs the exact version under `updates/<v>`, copies `slopify.db` to `updates/before-<v>-<ms>.db`, hands off the listener, starts the candidate with the token protocol, and on readiness writes `updates/current.json`; failure restarts the old entry with `SLOPIFY_UPDATE_FAILED=1` (`packages/app/src/updater/worker.ts:19`, `packages/app/src/updater/worker.ts:43`, `packages/app/src/updater/plan.ts:125`). Missing npm or a non-installed entry disables in-app install; in Docker the UI shows the terminal update command (`packages/app/src/main.ts:430`). The web client checks every 15 min, polls every 2 s during install, 5 s while waiting, and gives up presenting recovery after 120 s (`packages/web/src/updates/api.ts:8`).

## Backups

- Export everything: `GET /api/storage/export` streams a `.tar` (`slopify-backup-YYYY-MM-DD.tar`), refused 409 while projects are being made; `GET /api/storage/export/summary` sizes it first (`packages/app/src/edge/http/storage.ts:90`, `packages/app/src/edge/http/storage.ts:106`).
- Import: `PUT /api/storage/import` accepts `application/x-tar` (full) or `application/zip` (older portable export) (`packages/app/src/edge/http/storage.ts:139`).
- Scheduled backups: `GET/PUT /api/backups`, `POST /api/backups/run`; settings keys `backups.config` (default off, `03:00`, keep 5, range 1–30, folder null) and `backups.status` (`packages/app/src/edge/http/backups.ts:16`, `packages/app/src/slices/backups/model.ts:8`, `packages/app/src/slices/backups/model.ts:47`). Timing: 2 min after start, retry 1 h after failure, 10 min while busy, catch-up unless one succeeded within 20 h (`packages/app/src/slices/backups/schedule.ts:6`). Files `slopify-backup-YYYY-MM-DDTHHMMSSZ.tar`, written as `.…tar.partial` at `0600` then renamed; pruning touches only that pattern (`packages/app/src/slices/backups/files.ts:9`, `packages/app/src/slices/backups/files.ts:51`, `packages/app/src/slices/backups/files.ts:121`). Free space is checked with `statfs`; a folder inside projects (other than its `Backups`), staging, logs or `models/` is refused (`packages/app/src/slices/backups/service.ts:1`, `packages/app/src/slices/backups/folder.ts:26`).
- Docker installation backups consist of the named volume plus the host Projects folder; the per-update recovery volume covers only `/data` (`docs/docker.md:76`).

## Logging and diagnostics

- App log: one JSON line per event (`ts`, `level`, `event`, optional `projectId`, `stage`, `detail`) appended to `<data-dir>/logs/slopify-YYYY-MM-DD.log` at `0600`; `detail` is scrubbed of key-like and `Bearer` strings (`packages/app/src/kernel/log.ts:105`, `packages/app/src/kernel/log.ts:125`).
- `logs/updates.log`: update candidate stdout/stderr (`packages/app/src/updater/worker.ts:23`). `logs/autostart.log`: login starts (`packages/app/src/edge/autostart/index.ts:48`).
- Boot writes a reconciliation summary (interrupted stages, settled schedules, orphan and staged files) (`packages/app/src/main.ts:283`).
- `GET /api/diagnostics`: no-store `slopify-diagnostics.json` with app/schema version, platform, Node major, provider readiness (no key values), project count and catalogue status (`packages/app/src/edge/http/diagnostics.ts:10`).
- Docker: `docker compose … logs`; helper: `systemctl --user status slopify-cli-bridge.service` (`packages/app/src/host-cli/service.ts:128`, `docs/docker.md:140`). No external log shipping or metrics endpoint exists.

## Extension packaging

`@slopify/extension` 1.1.0 (private; manifest `version` 1.1.0) builds with `node scripts/build.mjs`: esbuild bundles `background`, `comment`, `content`, `options`, `popup`, `video-frame` as IIFE for `chrome120` and `firefox128`, copies `options.html`, `popup.html`, `video-frame.html`, icons and manifest, and zips `dist/slopify-studio-chrome.zip` and `dist/slopify-studio-firefox.zip`; Firefox's manifest swaps the service worker for `background.scripts` and adds gecko id `studio@slopify.local` (`packages/extension/package.json:3`, `packages/extension/package.json:8`, `packages/extension/scripts/build.mjs:28`, `packages/extension/scripts/build.mjs:45-62`, `packages/extension/scripts/build.mjs:73`). The MV3 manifest requests `storage`, `clipboardWrite`, `alarms`, hosts `http://127.0.0.1/*`, `http://localhost/*` and `https://www.youtube.com/oembed*`, injects `content.js` into `https://studio.youtube.com/*` and `comment.js` into `https://www.youtube.com/watch*`, opens `popup.html` from the toolbar and exposes `video-frame.html` to Studio (`packages/extension/static/manifest.json:4`, `:12-30`, `:37-50`). The worker's `slopify-ab-tests` alarm runs every 15 min (`packages/extension/src/background.ts:408-418`). The app build copies both zips into `dist/extension/` and fails if they are missing; the running app serves them at `GET /api/studio/extension/{chrome,firefox}.zip`, 404 with a rebuild instruction when absent (`packages/app/scripts/copy-extension.mjs:6`, `packages/app/src/edge/http/studio.ts:147`, `packages/app/src/edge/http/studio.ts:434`). On a release tag the `chrome-web-store` job builds the extension workspace and runs `packages/extension/scripts/publish-chrome.mjs`, which signs a service-account JWT, uploads the Chrome zip to the Chrome Web Store API v2 and submits it for review; missing secrets skip it, and a version the store already has counts as nothing new (`.github/workflows/release.yml:67-85`, `packages/extension/scripts/publish-chrome.mjs:23-26`, `:59-71`, `:74-82`). No Firefox store upload exists.
