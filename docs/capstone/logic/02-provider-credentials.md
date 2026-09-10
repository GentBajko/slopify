---
scenario: provider-credentials
mockup_row: S13
screens: [03-settings, 06-play, 08-project]
depends_on: [01-pipeline-lifecycle]
generated_date: 2026-09-10
capstone_version: 5.2.0
---

# 02 Provider credentials and voices

API keys per provider, the voice list, and how their absence or change reaches Play and running projects.

## Trigger & preconditions

- Trigger: Save or Remove on a key row, Add or Remove on a voice row, Save on the silence-gap field (`mockup/03-settings.md`; the outro card fields drawn there are dropped).
- Preconditions: none. A key may be saved for any supported provider at any time; a voice may be added for a provider with or without a key.
- Actor: the single local user.

## Steps

1. Save key: trim surrounding whitespace, store as the provider's single key, overwriting any previous one; no format check and no test call. The field then shows the key masked (`mockup/03-settings.md`).
2. Remove key: delete the provider's key.
3. Add voice: require a non-empty name and a non-empty voice ID; the ID must be unique within its provider; names may repeat. Nothing is verified against the provider.
4. Remove voice: delete the entry.
5. Play reads the key table to render provider dropdowns: every supported provider is listed; a provider with no key is greyed out and unselectable.
6. Play and paused/failed project controls fetch the selected provider's model catalogue, including TTS models. Loading, refreshes and discovery failures preserve the selected ID; discovery failure alone does not block a valid selection. Refresh bypasses the server cache. Custom IDs are offered when the catalogue permits them.
7. A provider call reads the key at the moment the attempt starts.

## Model discovery

`GET /api/providers/:id/models` returns `{models:[{id,name}], allowsCustom, notice?, warning?}`. The server caches successful catalogues per provider for five minutes and coalesces concurrent loads; failed discovery retains prior/bundled choices with a warning and a shorter retry window. `?refresh=1` requests a fresh catalogue (`packages/app/src/slices/settings/models.ts`, `edge/http/providers.ts`). Notices explain catalogue origins separately from failures: provider APIs, local CLI metadata/aliases, or curated adapter-compatible choices.

The web query is keyed by provider and cached for five minutes. Changing providers cannot apply a previous provider's late response. Refresh and Custom ID controls retain the selected value, including IDs missing from the current catalogue. The UI contains no duplicate model lists and never silently picks a former single TTS default. New provider choices start with an empty model; saved configurations keep theirs (`packages/web/src/lib/models.ts`, `play/pickers.tsx`, `play/media-rails.tsx`, `project/providers.tsx`).

## Local agent CLI providers

Claude Code, Codex and Gemini CLI are LLM providers without stored API keys (`packages/app/src/slices/settings/model.ts`):

- Readiness is computed at request time from the saved executable override or the default PATH command (`claude`, `codex`, `gemini`). A successful `--version` exit marks it installed; a parsed version is optional. Probes run concurrently with a 15-second timeout to allow slower CLI startup. The CLI's own login is used; readiness does not verify authentication (`slices/settings/{readiness,cli-status}.ts`).
- Settings lists status (installed/version, not found on PATH, or not found at saved path), effective command, Executable path, Save path and login guidance. Pending saves show Checking; failures keep the entered text and previous saved setting. An API key is never requested for these rows (`packages/web/src/components/provider-cli.tsx`).
- `PUT /api/providers/:id/path` accepts `{path:string}` and returns the refreshed `ProviderStatus`, including `cliPath: {configured:string|null, command:string}`. Trimmed blank resets to PATH even when it is currently unavailable. Nonblank paths must be absolute existing executable files, at most 4096 characters, without command arguments; readable `.js`/`.mjs`/`.cjs` entry files run through Node. Keyed-provider use, invalid paths and unsuccessful probes return a 400 path-field problem without changing the saved setting (`edge/http/providers.ts`, `slices/settings/cli-paths.ts`).
- Overrides persist as JSON strings under generic settings key `cli.path.<provider>`; reset stores JSON null. Saves serialize per database/provider, so a slow check cannot overwrite a later Save or Reset. Every new invocation reads `cliBinary(db,id)`; already-running processes keep the binary they started with (`slices/settings/cli-paths.ts`, `adapter-registry.ts`).
- Windows known npm-style Node `.cmd`/`.bat` shims resolve to Node plus their JavaScript entry; unknown batch launchers fail with guidance to select an executable or JS file. Prompt arguments never pass through `cmd.exe` (`kernel/cli-command.ts`, `adapters/llm/run-cli.ts`).
- Play greys out a not-found CLI provider exactly as an unkeyed one (step 5).
- A project whose CLI provider is no longer found has its retry and re-run controls disabled, labelled "CLI missing", mirroring "Key missing".

## Branches

- Provider has a key → selectable on Play; no key → greyed out.
- Model fetch succeeded → dropdown populated; failed → show the last loaded or bundled choices and a warning. An existing selected ID stays available even if absent from the catalogue; otherwise the user must choose a model or enter an allowed custom ID.
- Project's provider has a key → its retry and re-run controls are enabled; no key → disabled, labelled "Key missing"; re-adding the key re-enables them.
- Voice ID rejected by the provider at run time → the audio stage's error names the voice ID as rejected, distinct from an authentication error.

## Unhappy paths

- Bad key: the first provider call using it fails; scenario 01's retry policy runs and the stage shows the provider's error verbatim.
- Key replaced while a project is running: attempts already in flight finish with the key they started with; every later attempt, retries included, uses the new key.
- Key removed while a project is running: in-flight attempts finish; the next attempt finds no key, fails immediately without retries, and the stage's retry control reads "Key missing".
- Model list unreachable (offline, provider down): show a warning without clearing the selection; keep cached/bundled choices and allow manual IDs where supported. fal and Replicate require supported adapter schemas and do not offer arbitrary custom IDs.
- Empty voice list with audio set to Generate: no voice can be chosen; scenario 04 decides that Play is blocked.
- Duplicate voice ID within a provider: rejected at add time.

## State transitions

- Key per provider: absent ↔ present (save creates or overwrites, remove deletes). No other states, no history.
- Voice: absent ↔ present.
- These states gate Play's controls (steps 5-6) and the enablement of retry / re-run on existing projects.

## Invariants

- A key is sent only to the provider it belongs to.
- Keys never appear in telemetry, logs, downloads, or project records (scenario 15).
- At most one key per provider.
- A run never starts with an unkeyed or not-found provider selected (scenario 04).

## Outcomes & side effects

- Keys, voices, CLI executable overrides, and the silence-gap setting (seconds, default 3) persist on the user's machine only; the storage engine is `architecture`'s (SQLite).
- Removing a key changes the enablement of controls on every project that used the provider.
- Nothing is notified.

## Dimensions not in play

- D1 authority: one local actor.
- D4 computation: nothing is computed.
- D5 money: nothing charged or credited.
- D7 time: keys and voices never expire inside the app.
- D11 termination: every action here is a single atomic save or delete; nothing is left half-done.
- D13 notification: no channel.

## Gemini invocation

`packages/app/src/adapters/llm/gemini.ts` obtains model choices through installed CLI metadata and supported aliases (`gemini-models.ts`), parses assistant deltas/result usage from stream-json, and runs with the CLI's existing login. Each call uses a temporary writing workspace and system settings: extensions, hooks, skills, IDE integration and local context loading are disabled; ordinary writing exposes no tools, research only `google_web_search`; MCP is constrained to an unused allowlist name. Prompts use explicit `-p`, are prefixed, and escape literal `@` references to avoid interactive/slash/file preprocessing. Workspace settings reset the entire context object before restrictive system settings, because Gemini otherwise concatenates user include directories. A temporary trusted-folder map trusts only this private workspace; user context/trust files remain unchanged. `NO_BROWSER=true` prevents browser authentication, and an authorization prompt becomes a sign-in error rather than waiting for input. Cancellation/failure waits for the child and removes the workspace (`adapters/llm/gemini-workspace.ts`, `run-cli.ts`).

All three CLI adapters emit internal `activity` events for structured output, refreshing the attempt's idle timer even before visible answer text. These events are not forwarded as article deltas or tool/reasoning content (`packages/app/src/kernel/ports/llm.ts`, `kernel/runner/providers.ts`, `adapters/llm/{claude-code,codex,gemini}.ts`).

Gemini Google license error `#3501` maps to `unsupported` and fails without automatic retries; a missing CLI login maps to `missing_key` with terminal sign-in guidance. Version readiness therefore does not imply account eligibility. Slopify does not upgrade Gemini or complete its login (`adapters/llm/gemini.ts`, `kernel/runner/attempt.ts`).
