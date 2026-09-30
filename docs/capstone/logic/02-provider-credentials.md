---
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: f530698e364e
paths_covered:
  - ":(top)packages/app/src/edge/http/providers.ts"
  - ":(top)packages/app/src/slices/settings/keys.ts"
  - ":(top)packages/app/src/slices/settings/key-test.ts"
  - ":(top)packages/app/src/slices/settings/key-guides.ts"
  - ":(top)packages/app/src/slices/settings/model.ts"
  - ":(top)packages/app/src/slices/settings/model-reach.ts"
  - ":(top)packages/app/src/slices/settings/models.ts"
  - ":(top)packages/app/src/slices/settings/readiness.ts"
  - ":(top)packages/app/src/slices/settings/cli-paths.ts"
  - ":(top)packages/app/src/slices/settings/cli-status.ts"
  - ":(top)packages/app/src/slices/settings/health.ts"
  - ":(top)packages/app/src/slices/settings/first-run.ts"
  - ":(top)packages/app/src/slices/settings/voices.ts"
  - ":(top)packages/app/src/slices/settings/repo.ts"
  - ":(top)packages/app/src/adapters/key-probes.ts"
  - ":(top)packages/app/src/adapters/llm/gemini.ts"
  - ":(top)packages/app/src/adapters/llm/gemini-workspace.ts"
  - ":(top)packages/app/src/adapter-registry.ts"
  - ":(top)packages/app/src/host-cli/status.ts"
  - ":(top)packages/app/src/host-cli/gemini-login.ts"
  - ":(top)packages/app/src/host-cli/runtime.ts"
  - ":(top)packages/app/src/kernel/cli-command.ts"
  - ":(top)packages/app/src/kernel/ports/system-speech.ts"
  - ":(top)packages/app/src/edge/http/settings.ts"
  - ":(top)packages/web/src/lib/provider-status.ts"
  - ":(top)packages/web/src/play/pickers.tsx"
  - ":(top)packages/web/src/project/readiness.ts"
  - ":(top)packages/web/src/lib/models.ts"
  - ":(top)packages/web/src/components/provider-keys.tsx"
  - ":(top)packages/web/src/components/provider-cli.tsx"
  - ":(top)packages/web/src/components/provider-health.tsx"
scenario: provider-credentials
mockup_row: S13
screens: [03-settings, 06-play, 08-project]
depends_on: [01-pipeline-lifecycle]
absorbed_from:
  - features/2026-09-24-host-cli-bridge@2026-09-24
---

# 02 Provider credentials and voices

API keys, the key Test, key guides, the health check, local agent CLIs (path override, sign-in state), the keyless system voice, the voice list, and how their state reaches Play and existing projects. The model list (`models.yaml`, daily sync, retired models) is scenario 19's; speakers, auditions, voice languages and the real-person flag are `34-speakers-and-voices.md`; the provider-less first-run welcome page is `41-onboarding-and-sample.md`.

## Trigger & preconditions

- Trigger: Save, Test or Remove on a key row; Save/Reset on a CLI path row; Check all or a row's Check again; Add or Remove on a voice row (Settings → Providers / Voices, `packages/web/src/components/provider-keys.tsx`, `provider-cli.tsx`, `provider-health.tsx`).
- Every request that lists providers (`GET /api/providers`, `packages/app/src/edge/http/providers.ts:173`) recomputes readiness.
- Preconditions: none. A key may be saved for any keyed provider at any time; a voice may be added with or without a key (`packages/app/src/slices/settings/voices.ts:46-49`).
- Actor: the single local user.

## Steps

### Provider set

15 provider ids in three families (`packages/app/src/slices/settings/model.ts:14-30`, table `:77-121`), each with an `auth` kind:

| auth | Providers | Ready when |
|---|---|---|
| `key` | openrouter, elevenlabs, openai-tts, cartesia, inworld, google-tts, fal, replicate, openai-image, google-image | a key is stored (own or shared) (`readiness.ts:72-75`) |
| `cli` | claude-code, codex, gemini (llm); codex-image (image) | the binary answers `--version` and reports no issue (`kernel/ports/model.ts:37-41`) |
| `local` | system-voice (tts) | a speech program is found (`readiness.ts:29-39`) |

- `google-tts` uses the `google-image` key until it has its own (`sharedKeyOf`, `model.ts:125-127`; `keyWithShared`, `keys.ts:83-86`).
- OpenAI has two ids (`openai-tts`, `openai-image`), one row each, so TTS can be keyed without images (`model.ts:11-13`).

### Keys

1. Save key (`PUT /api/providers/:id/key`, `providers.ts:238-252`): body `key` 1..4096 chars (`providers.ts:32`); trimmed; blank after trim → 400 with a `key` field error (`keys.ts:49-52`, `providers.ts:312-319`); a non-`key` provider → 400 "signs in through its own command-line tool" or, for system-voice, "your computer's own speech" (`providers.ts:295-304`). Stored as the provider's single key, overwriting (`keys.ts:54`, `repo.ts:21`). No format check and no automatic test (`keys.ts:43-44`). A storage error is rewritten to carry only the SQLite code (`keys.ts:55-60`). The response is `{provider, hasKey, masked}` with the constant mask `••••••••••••` (`keys.ts:16`, `:24-27`). The model catalogue cache for that provider is invalidated (`providers.ts:248`).
2. Remove key (`DELETE /api/providers/:id/key`): deletes the row; no row → 404 "nothing to remove" (`keys.ts:64-69`, `providers.ts:305-311`).
3. Test key (`POST /api/providers/:id/key/test`, `providers.ts:256-276`): keyed providers only. With a body `{key}` the pasted key is tried and neither stored nor logged; without a body the saved (or shared) key is (`key-test.ts:121-138`). One authenticated read per provider (`packages/app/src/adapters/key-probes.ts:37-94`), 15 s timeout, redirects refused, only the first 4096 chars of an error body read (`key-test.ts:150-158`). Outcome mapping (`key-test.ts:38-109`):

| Answer | result | ok |
|---|---|---|
| no key saved or pasted | `no-key` | no |
| 2xx | `valid` (pasted key: "It is not saved yet: choose Save to keep it.", `:135-137`) | yes |
| 401, or provider-specific bad-key body (Google 400 `API_KEY_INVALID`, ElevenLabs 400 `invalid_api_key`, Inworld 403 "does not exist"/"was deleted", `key-probes.ts:30,77,92`) | `rejected` | no |
| 402 | `no-credit` | no |
| 403 | `forbidden` | no |
| 429 | `rate-limited` | no |
| ≥500 | `provider-down` | no |
| timeout / network error | `unreachable` | no |
| any other status | `unexpected` | no |

   Each message names the provider's key page and billing page from the key guide. `fetch` not yet wired → 503 (`providers.ts:259-260`).
4. Key guides (`GET /api/providers/key-guides`, `providers.ts:69`): per keyed provider a sign-up link, key page, optional billing link, ordered steps, required permissions and docs link (`packages/app/src/slices/settings/key-guides.ts:9-18`, map `:56`). Settings shows the steps open when no key is saved and collapsed under "Where to get a key" once one is (`provider-keys.tsx:282-293`).
5. A provider call reads the key at the moment the attempt starts (`keyForAttempt`, `keys.ts:74-80`; `packages/app/src/adapter-registry.ts:61-67`).

### Local agent CLI providers

- Native mode: readiness is probed per request from the saved override or the default command (`claude`, `codex`, `gemini`) with `--version`, 15 s timeout, 64 KiB output cap; identical command+args probes in one request are shared (`readiness.ts:56-67`, `cli-status.ts:22`, `:30-55`). The version is the first dotted number in stdout (`cli-status.ts:119-122`). Codex (text and image) additionally requires version ≥ `0.149.1`; unparsable or older → `issueKind: "version"` (`cli-status.ts:25`, `:69-88`).
- `codex-image` shares the `codex` install: path setting and login source are Codex's (`cli-paths.ts:20-22`, `health.ts:55-57`).
- Path override (`PUT /api/providers/:id/path`, `providers.ts:217-237`; `saveCliPath`, `cli-paths.ts:58-151`): trimmed; blank resets to PATH (stored as JSON `null`); nonblank must be absolute, without control characters, ≤ 4096 chars (`cli-paths.ts:11-16`), an existing file (folder → "This path is a folder"), executable (`X_OK`), or readable for `.js/.mjs/.cjs` and on Windows (`:103-128`); a nonblank path whose `--version` probe fails is refused with the probe error (`:131-139`). Failures → 400 with a `path` field error and the saved setting unchanged (`providers.ts:227-233`). Stored under setting `cli.path.<installation id>` (`cli-paths.ts:140`). Saves serialize per database and installation id (`cli-paths.ts:69-87`). Every new invocation reads `cliBinary` (`cli-paths.ts:46-48`, `adapter-registry.ts:69-73`); running processes keep their binary.
- Windows npm-style `.cmd`/`.bat` shims resolve to Node plus the JS entry; prompts never pass through `cmd.exe` (`packages/app/src/kernel/cli-command.ts:9-35`).
- Docker host mode (`hostCliStatus` present): status comes from the host bridge; `cliPath.managedOnHost=true`, `configured: null` (`readiness.ts:42-55`); PUT path is refused with "Slopify runs in Docker … run the Slopify Docker launcher again" (`cli-paths.ts:63-68`). Host status resolves the command on host PATH, probes `--version`, then reads login; missing command → `issueKind: "missing"`, resolver failure → `"bridge"`, signed-out → `"login"` (`packages/app/src/host-cli/status.ts:85-145`). Results are cached per installation for 5 s after they settle; failures are not cached (`status.ts:146-163`). A not-ready host CLI fails generation with `missing_key` (login) or `unavailable` (`host-cli/runtime.ts:29-37`). The bridge protocol is scenario 20's.
- Sign-in state (`readHostLogin`, `status.ts:58-81`): Claude Code `claude auth status` JSON `loggedIn`; Codex `codex login status` text ("Not logged in" / "Logged in using …"); anything else, a kill or a non-numeric exit → `unknown`. Gemini has no status command; its files answer (`packages/app/src/host-cli/gemini-login.ts:27-61`): `~/.gemini/settings.json` `security.auth.selectedType` (or legacy `selectedAuthType`) picks the method; `oauth-personal`/`login-with-google` need a non-empty `refresh_token` in `~/.gemini/oauth_creds.json`; `gemini-api-key` needs `GEMINI_API_KEY` in the environment or `~/.gemini/.env`; `vertex-ai` needs `GOOGLE_API_KEY` or `GOOGLE_CLOUD_PROJECT`; `cloud-shell` is signed in; no method saved → signed in when a key or OAuth refresh token exists, else `unknown`; an unknown method → `unknown`. Nothing starts the CLI or touches the network.
- Labels for a not-usable provider (`packages/web/src/lib/provider-status.ts:3-13`): keyed "Key Missing", local "Speech Program Missing", CLI "Sign In Required" (login), "Host Helper Unavailable" (bridge), "CLI Update Required" (version), "CLI Missing" (missing or no issue text), else "CLI Unavailable". Play's pickers and the project's retry/re-run readiness use the same function (`packages/web/src/play/pickers.tsx:149`, `packages/web/src/project/readiness.ts:74`).

### System voice

- `system-voice` needs no key or login and has no catalogue row (`model.ts:61-75`). Detection per platform: macOS `say -v ?`; Windows System.Speech via PowerShell; Linux Piper, SVOX Pico, eSpeak NG, eSpeak, best first (`packages/app/src/kernel/ports/system-speech.ts:1-23`, `:79-135`). Results are cached for 60 s (`system-speech.ts:237-253`). None found → `available: false` with an install instruction as `issue` (`readiness.ts:34-37`).
- `GET /api/providers/system-voice/voices` lists engines, their voices and each engine's default voice (`providers.ts:175-186`).

### First-run provider defaults

`GET /api/providers/first-run` (`providers.ts:71-79`, `packages/app/src/slices/settings/first-run.ts:63-130`): `firstRun` is true while no key is saved and `first-run.done` is unset. On a first run with no saved defaults, the first usable CLI in the order claude-code, codex, gemini becomes Play's LLM default and a usable `codex-image` the image default, each with the first model its list returns ("" when the list fails), written once to setting `provider.defaults` (`first-run.ts:39`, `:81-105`, `:132-143`). The message says a video can be made without keys, or that no CLI was found; the narration sentence depends on whether a system voice is available (`:106-129`). `POST /first-run/dismiss` sets `first-run.done` (`:52-54`).

### Health check

`POST /api/providers/health[?provider=id]` (`providers.ts:87-105`, `packages/app/src/slices/settings/health.ts:89-109`). "In use" means a non-empty provider+model choice in any template, schedule, draft or unfinished project (`choiceSites`, `health.ts:60-74`). Per provider:

- Keyed (`health.ts:289-340`): no key → "Key saved" `problem` if in use, else the provider is `unused`; otherwise "Key valid" runs the key Test (rate-limited/provider-down/unreachable → `warning`, other failures → `problem`); retired chosen models → "Chosen models" `problem` pointing to Settings → Models → Retired models in use (scenario 19); if in use and the key is valid, "Model reachable" reads each chosen model (at most 5 distinct) through the provider's model endpoint without generating (`model-reach.ts:14-52`): 2xx found (or listed), 404 on a per-model URL missing, anything else or no answer unknown → `warning`; providers without a model read (cartesia, inworld) → `skipped` (`health.ts:255-260`).
- CLI (`health.ts:132-204`): not installed / missing / bridge → "Installed" `problem` if in use, else `unused`; version issue → `problem`; "Signed in" from the host status (Docker) or `readHostLogin` with a 15 s timeout (native): signed-out → `problem` with the sign-in command (`claude auth login`, `codex login`, `gemini`), unknown → `skipped`; if in use, "Chosen models" compares chosen ids with the CLI's model list (unreadable → `warning`, absent id → `problem`) (`health.ts:206-240`).
- Local (`health.ts:112-130`): "Speech program found" `ok`, or `problem` if in use, else `skipped`.
- Provider state: any `problem` → problem; any `warning` → warning; else ok when set up or in use, otherwise `unused` (`health.ts:76-84`).

### Voices

1. Add voice (`POST /api/settings/voices`, `packages/app/src/edge/http/settings.ts:149-178`): TTS providers only; name and voice ID trimmed, non-empty, each ≤ 200 chars; languages optional (`voices.ts:49-89`); ID unique within its provider, enforced by the table's UNIQUE(provider, voice_id) → 409 (`voices.ts:77-87`, `settings.ts:160-168`). Names may repeat. Nothing is verified against the provider. Languages left blank are asked of the provider when it can say (`settings.ts:151-155`); language handling is `34-speakers-and-voices.md`'s.
2. Remove voice (`DELETE /api/settings/voices/:id`): deletes the row and drops it from the real-person list; absent → 404 (`voices.ts:114-121`, `settings.ts:226-236`).
3. Google Gemini TTS offers the 30 prebuilt voices listed in `geminiVoices` (`model.ts:131-162`).

### Model lists for uncatalogued providers

`GET /api/providers/:id/models` (`providers.ts:187-216`). Catalogued providers answer from `models.yaml` with `allowsCustom: false` (scenario 19). CLI providers and system-voice go through `createModelCatalog` (`packages/app/src/slices/settings/models.ts:31-106`): successful lists cached 5 min, failures 30 s, concurrent loads coalesced, `?refresh=1` bypasses the cache, `invalidate` on key/path change discards in-flight results. A failed CLI list returns no models and a warning to check install/sign-in; a failed keyed list returns the last list or the bundled fallback with a warning (`models.ts:63-82`). Custom IDs are allowed except for fal, replicate, codex-image and system-voice (`models.ts:20-27`). Per-provider notices explain the list's origin (`models.ts:115-131`). The web query refetches every 30 s, without retry (`packages/web/src/lib/models.ts:28-37`).

### Gemini CLI invocation

Each call runs in a temporary workspace with its own settings file (`packages/app/src/adapters/llm/gemini-workspace.ts:57-156`): tools limited to `google_web_search` when web search is on, otherwise none; tool discovery, hooks, skills, IDE, telemetry and memory disabled; context loading reset (`includeDirectories: []`); MCP limited to the document reader when the call carries documents, otherwise to an unused name; a trusted-folders file trusting only the workspace; env `NO_BROWSER=true`, `GEMINI_CLI_HOME` set to the workspace, OAuth credentials passed via `GOOGLE_APPLICATION_CREDENTIALS` for `oauth-personal`. An unreadable `settings.json` fails as `unavailable` with guidance (`gemini-workspace.ts:47-53`). The prompt goes through explicit `-p` with every `@` escaped (`packages/app/src/adapters/llm/gemini.ts:34-47`, `:77`). The adapter yields `activity` events that restart the idle timer without exposing tool or reasoning content (`gemini.ts:83`, `kernel/ports/llm.ts:38-40`). An authorization prompt on stdout fails immediately as `missing_key` instead of waiting for input (`gemini.ts:175-198`). Google license error `#3501` → `unsupported` (`gemini.ts:147-151`). Slopify does not upgrade the Gemini CLI or complete its login.

## Branches

- Keyed provider with its own or shared key → selectable on Play; none → greyed with "Key Missing".
- CLI installed, no issue → selectable; otherwise greyed with the label from `providerUnavailableLabel`.
- System voice found → selectable; none → "Speech Program Missing".
- Test with a pasted key → that key is probed and a success says it is not saved yet; without one → the saved or shared key.
- Health check with `?provider` → that provider only; without → all 15.
- Provider neither set up nor in use → health state `unused`, checks `skipped`.
- Docker host mode → CLI paths are read-only, status from the host bridge; native → local probe and editable path.
- Project's provider not usable → its retry and re-run controls are disabled with the same label; usable again → re-enabled (`project/readiness.ts:60-76`). A provider id the build no longer lists yields no label (`:69-72`).
- Voice ID rejected by ElevenLabs at run time → the audio error names the voice ID, distinct from an authentication error (`packages/app/src/adapters/tts/elevenlabs.ts:163`).

## Unhappy paths

- Bad key: Test reports `rejected`; a run's first call fails with `auth`, a terminal kind that is not retried (`packages/app/src/kernel/runner/attempt.ts:26-36`).
- Key replaced while a project is running: in-flight attempts finish on the old key; every later attempt uses the new one (`adapter-registry.ts:61-67`).
- Key removed while running: the next attempt finds none, fails with `missing_key` without retries.
- Test while offline / timed out → `unreachable`; server still starting (no `fetch`) → 503 (`providers.ts:43-44`).
- CLI path save racing another tab → serialized; the later request wins (`cli-paths.ts:69-87`).
- CLI path probe hangs → bounded by 15 s, then refused.
- CLI signs out mid-run → `missing_key` with terminal sign-in guidance (`gemini.ts:170-181`; Claude/Codex via `adapters/llm/cli-login-error.ts`).
- Gemini `settings.json` unparsable → login `unknown` in the health check; generation fails with the "could not read the Gemini CLI's settings file" message.
- Model list unreachable → warning, cached/bundled choices kept; fal and replicate never accept arbitrary IDs.
- Duplicate voice ID within a provider → 409 at add time.
- Empty voice list with narration Generate → admission blocks Play (scenario 04).

## State transitions

- Key per provider: absent ↔ present (save creates or overwrites, remove deletes). No history.
- CLI path per installation: PATH default ↔ configured path.
- CLI readiness (derived, never stored): not installed / version issue / login issue / bridge issue / ready.
- Voice: absent ↔ present.
- `first-run.done`: unset → set (dismiss); `provider.defaults`: unset → written once.
- These states gate Play's pickers and the enablement of retry / re-run on existing projects.

## Invariants

- A key is sent only to its own provider (`key-test.ts:118-120`, `adapter-registry.ts:61-63`).
- No response carries a key's characters or length; the mask is constant (`keys.ts:12-16`).
- Keys never appear in backups or exports (`packages/app/src/slices/storage/backup-format.ts:15-17`, `backup-import.ts:79`), logs or error bodies (`keys.ts:55-60`).
- At most one key per provider.
- A CLI path is never passed through a shell (`cli-command.ts:9`).
- A run never starts with a not-usable provider selected (scenario 04).

## Outcomes & side effects

- Keys, voices, CLI path overrides, provider defaults and first-run state persist in the local SQLite database; the silence gap and playback settings are `35-audio-levelling-and-ambient.md` / scenario 11's.
- Saving/removing a key or path invalidates that provider's model-list cache (`providers.ts:234`, `:248`, `:283`).
- Test and health check make read-only calls to providers; nothing is generated or billed by Slopify for them (`model-reach.ts:5-8`).
- Nothing is notified.

## Dimensions not in play

- D1 authority: one local actor.
- D5 money: nothing charged; the key Test and model reads are free reads.
- D7 time: keys and voices never expire inside the app; only cache lifetimes (5 min, 30 s, 60 s, 5 s) are time-based.
- D11 termination: every action is a single save, delete or read; nothing is left half-done.
- D13 notification: no channel.
