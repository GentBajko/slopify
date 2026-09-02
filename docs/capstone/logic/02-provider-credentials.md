---
scenario: provider-credentials
mockup_row: S13
screens: [03-settings, 06-play, 08-project]
depends_on: [01-pipeline-lifecycle]
implements: [Q11, Q12, Q13, Q14, Q15, Q16, Q17, Q18, Q94, Q95, Q99, Q135]
generated_date: 2026-09-02
capstone_version: 5.2.0
source: logic-interview.md
---

# 02 Provider credentials and voices

API keys per provider, the voice list, and how their absence or change reaches Play and running projects. Rules cite `logic-interview.md §Q<n>`.

## Trigger & preconditions

- Trigger: Save or Remove on a key row, Add or Remove on a voice row, Save on the silence-gap field (`mockup/03-settings.md`; the outro card fields drawn there are dropped per §Q94).
- Preconditions: none. A key may be saved for any supported provider at any time; a voice may be added for a provider with or without a key (§Q14).
- Actor: the single local user (D1 not in play, §Q18).

## Steps

1. Save key: trim surrounding whitespace, store as the provider's single key, overwriting any previous one; no format check and no test call (§Q11, §Q17, §Q18). The field then shows the key masked (`mockup/03-settings.md`).
2. Remove key: delete the provider's key.
3. Add voice: require a non-empty name and a non-empty voice ID; the ID must be unique within its provider; names may repeat (§Q14, §Q18). Nothing is verified against the provider.
4. Remove voice: delete the entry.
5. Play reads the key table to render provider dropdowns: every supported provider is listed; a provider with no key is greyed out and unselectable (§Q12).
6. Play fetches the selected provider's model list for the model dropdown; a failed fetch shows the error in the dropdown and blocks Play for that provider until a fetch succeeds (§Q15).
7. A provider call reads the key at the moment the attempt starts (§Q16).

## Local agent CLI providers (§Q135)

Claude Code and Codex are LLM providers without keys (architecture §Q10):

- Readiness is computed at request time: `installed` when the CLI binary resolves on PATH and reports a version, else `not found`. Nothing is stored for them; the CLI's own login is used.
- Settings lists each CLI provider with its status line ("Installed, version X" / "Not found on PATH") and no key field.
- Play greys out a not-found CLI provider exactly as an unkeyed one (step 5).
- A project whose CLI provider is no longer found has its retry and re-run controls disabled, labelled "CLI missing", mirroring "Key missing" (§Q13).

## Branches

- Provider has a key → selectable on Play; no key → greyed out (§Q12).
- Model fetch succeeded → dropdown populated; failed → Play blocked for that provider (§Q15).
- Project's provider has a key → its retry and re-run controls are enabled; no key → disabled, labelled "Key missing"; re-adding the key re-enables them (§Q13).
- Voice ID rejected by the provider at run time → the audio stage's error names the voice ID as rejected, distinct from an authentication error (§Q14).

## Unhappy paths

- Bad key: the first provider call using it fails; scenario 01's retry policy runs and the stage shows the provider's error verbatim (§Q11).
- Key replaced while a project is running: attempts already in flight finish with the key they started with; every later attempt, retries included, uses the new key (§Q16).
- Key removed while a project is running: in-flight attempts finish; the next attempt finds no key, fails immediately without retries, and the stage's retry control reads "Key missing" (§Q13, §Q16).
- Model list unreachable (offline, provider down): Play blocked for that provider; other providers unaffected (§Q15).
- Empty voice list with audio set to Generate: no voice can be chosen; scenario 04 decides that Play is blocked.
- Duplicate voice ID within a provider: rejected at add time (§Q18).

## State transitions

- Key per provider: absent ↔ present (save creates or overwrites, remove deletes). No other states, no history (§Q17, §Q18).
- Voice: absent ↔ present.
- These states gate Play's controls (steps 5-6) and the enablement of retry / re-run on existing projects (§Q13).

## Invariants

- A key is sent only to the provider it belongs to (§Q18).
- Keys never appear in telemetry, logs, downloads, or project records (§Q18; scenario 15 cites).
- At most one key per provider (§Q18).
- A run never starts with an unkeyed or not-found provider selected (§Q12, §Q135; scenario 04 enforces).

## Outcomes & side effects

- Keys, voices, and the silence-gap setting (seconds, default 3, §Q95, §Q99) persist on the user's machine only (§Q17); the storage engine is `architecture`'s (SQLite surfaced §Q17).
- Removing a key changes the enablement of controls on every project that used the provider (§Q13, D14).
- Nothing is notified (D13 not in play).

## Dimensions not in play

- D1 authority: one local actor (§Q18).
- D4 computation: nothing is computed (§Q18).
- D5 money: nothing charged or credited (§Q18).
- D7 time: keys and voices never expire inside the app (§Q18).
- D11 termination: every action here is a single atomic save or delete; nothing is left half-done (§Q18).
- D13 notification: no channel (§Q18).
