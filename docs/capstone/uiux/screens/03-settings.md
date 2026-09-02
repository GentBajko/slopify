---
mockup: mockup/03-settings.md
scenarios: [S13]
logic: [logic/02-provider-credentials.md, logic/11-video-assembly.md]
implements: [Q13, Q17, Q18, Q19]
assumed:
  - the Appearance control (System / Dark / Light) lives in the Playback rail
generated_date: 2026-09-02
capstone_version: 5.2.0
---

# 03 Settings

## Mode & job

Operate. Job: store keys, voices, and two playback values without ceremony.

## Composition

Page title "Settings". Three rail groups, each a bordered sheet with an engraved header row:

1. **API keys**: one rail per supported provider grouped under LLM, Text to speech, Image generation (provider set per `05-dependencies.md`); each rail: provider name, a masked key input with its label above, Save and Remove. Unsaved providers show an empty input and Save only. CLI providers (Claude Code, Codex) show a status line instead of an input: a small lamp plus "Installed, version X" or "Not found on PATH" in `--ink2`, no controls (`logic/02` §Q135).
2. **Voices**: a rundown table (Name, Provider, Voice ID, Remove) and an add row beneath with three inputs and Add.
3. **Playback**: "Silence between segments" in seconds (default 3, `logic/11` §Q99) and Appearance (System / Dark / Light) as segmented switches (assumed placement, §Q19).

Focal moment: the first empty key input on a fresh install. Rails share borders; no cards.

## States

- Fresh install: every key input empty; a one-line hint under the LLM group: "Paste a key to make its provider selectable on Play." (`logic/02` §Q12).
- Key saved: input masked, "Saved" tick beside Save for 2 s, Remove appears.
- Key removed: confirmation dialog naming the consequence (`03-experience.md`), then the rail returns to empty.
- Voices empty: the table shows one teaching row: "Add a voice ID from your text-to-speech provider. Audio needs one to narrate." (`logic/02` §Q14).
- Duplicate voice ID within a provider: inline error under the Voice ID input, Add disabled (`logic/02` §Q18).
- Silence field invalid (empty, negative): inline error, Save disabled.
- CLI provider not found: the row's lamp unlit, status "Not found on PATH" with a one-line hint naming the install command; Play greys it out (`logic/02` §Q135).
- Loading: skeleton rails.

## Motion

Saved tick fades in and out over 150 ms; nothing else.

## Copy

Labels: "API key", "Save", "Remove", "Voice name", "Provider", "Voice ID", "Add voice", "Silence between segments", "Appearance". Errors name the problem: "This voice ID is already listed for this provider."
