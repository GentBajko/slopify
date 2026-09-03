---
scenario: provider-credentials
mockup_row: S13
screens: [03-settings, 06-play, 08-project]
depends_on: [01-pipeline-lifecycle]
generated_date: 2026-09-02
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
6. Play fetches the selected provider's model list for the model dropdown; a failed fetch shows the error in the dropdown and blocks Play for that provider until a fetch succeeds.
7. A provider call reads the key at the moment the attempt starts.

## Local agent CLI providers

Claude Code and Codex are LLM providers without keys:

- Readiness is computed at request time: `installed` when the CLI binary resolves on PATH and reports a version, else `not found`. Nothing is stored for them; the CLI's own login is used.
- Settings lists each CLI provider with its status line ("Installed, version X" / "Not found on PATH") and no key field.
- Play greys out a not-found CLI provider exactly as an unkeyed one (step 5).
- A project whose CLI provider is no longer found has its retry and re-run controls disabled, labelled "CLI missing", mirroring "Key missing".

## Branches

- Provider has a key → selectable on Play; no key → greyed out.
- Model fetch succeeded → dropdown populated; failed → Play blocked for that provider.
- Project's provider has a key → its retry and re-run controls are enabled; no key → disabled, labelled "Key missing"; re-adding the key re-enables them.
- Voice ID rejected by the provider at run time → the audio stage's error names the voice ID as rejected, distinct from an authentication error.

## Unhappy paths

- Bad key: the first provider call using it fails; scenario 01's retry policy runs and the stage shows the provider's error verbatim.
- Key replaced while a project is running: attempts already in flight finish with the key they started with; every later attempt, retries included, uses the new key.
- Key removed while a project is running: in-flight attempts finish; the next attempt finds no key, fails immediately without retries, and the stage's retry control reads "Key missing".
- Model list unreachable (offline, provider down): Play blocked for that provider; other providers unaffected.
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

- Keys, voices, and the silence-gap setting (seconds, default 3) persist on the user's machine only; the storage engine is `architecture`'s (SQLite).
- Removing a key changes the enablement of controls on every project that used the provider.
- Nothing is notified.

## Dimensions not in play

- D1 authority: one local actor.
- D4 computation: nothing is computed.
- D5 money: nothing charged or credited.
- D7 time: keys and voices never expire inside the app.
- D11 termination: every action here is a single atomic save or delete; nothing is left half-done.
- D13 notification: no channel.
