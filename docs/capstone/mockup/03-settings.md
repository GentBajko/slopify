---
screen: settings
journeys: [J1-discover-and-install, J2-first-run-setup]
assumed:
 - a voice entry carries which TTS provider it belongs to
 - provider rows are placeholders; the supported set is stack's
 - the Appearance control lives in the Playback section
 - key fields are masked after save
generated_date: 2026-09-02
capstone_version: 5.2.0
---

# 03 Settings

API keys per provider, the voice list, and the outro card text. Where a fresh install lands after the first-run notice (assumed).

## Layout

```
+--------------------------------------------------------------------+
| SLOPIFY Projects Play Prompts [Settings] |
+--------------------------------------------------------------------+
| API KEYS |
| LLM |
| OpenRouter [sk-or-••••••••••••••••••] [Save] [Remove] |
| Claude Code CLI Installed, 2.1.89 |
| Codex CLI Not found on PATH |
| Text to speech |
| <TTS provider A> [ ] [Save] |
| <TTS provider B> [ ] [Save] |
| Image generation |
| <Image provider A>[ ] [Save] |
| <Image provider B>[ ] [Save] |
| |
| VOICES |
| | Name | Provider | Voice ID | |
| | Narrator M | <TTS provider A> | abc123 | [Remove] |
| | Narrator F | <TTS provider A> | def456 | [Remove] |
| [ + Add voice ] Name [ ] Provider [v] Voice ID [ ] |
| |
| PLAYBACK |
| Silence between segments [ 3 ] s |
| Appearance (•) System ( ) Dark ( ) Light [Save] |
+--------------------------------------------------------------------+
| Free · your keys, your machine [Patreon] [☕] |
+--------------------------------------------------------------------+
```

Element tree:
- App shell
 - API keys: one row per supported provider, grouped LLM / TTS / image; CLI providers show a status line instead of a key field (`logic/02`)
 - Voices: table of name + provider + voice ID, add row
 - Playback: silence between segments in seconds, Appearance (`logic/11`)
 - Footer: donation links

## Elements

| Label | Does | Leads to |
|---|---|---|
| Key field + Save (per provider) | Stores that provider's API key on this machine | Stays; the provider becomes selectable on 06 Play (assumed) |
| Remove (per key) | Deletes the stored key | Stays |
| Add voice: Name, Provider, Voice ID | Appends an entry to the voice list | Stays; entry appears in 06 Play's voice dropdown |
| Remove (per voice) | Deletes the entry | Stays |
| Silence between segments, Appearance, Save | The gap inserted around the intro and outro (`logic/11`), and the theme | Stays |

Provider names are placeholders: `for: stack`. OpenRouter is the one name surfaced.

## States

- CLI provider not found: status line "Not found on PATH"; greyed out on Play `rule: logic (S13-credentials)`.

- No keys saved (fresh install): every field empty; whether Play is reachable `rule: logic (S13-credentials)`.
- Key saved: field masked (assumed).
- Key rejected by the provider: whether keys are verified on save, and what is shown `rule: logic (S13-credentials)`.
- Removing a key a past project used: effect on that project's re-runs `rule: logic (S13-credentials)`.
- Voice list empty: TTS Generate cannot pick a voice on 06; what 06 shows `rule: logic (S13-credentials)`.
