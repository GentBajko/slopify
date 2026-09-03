---
screen: first-run telemetry notice
journeys: [J1-discover-and-install, J2-first-run-setup]
assumed:
 - presented as a modal over the app on first launch
 - dismissing lands on Settings (03) when no key is saved yet
generated_date: 2026-09-02
capstone_version: 5.2.0
---

# 02 First-run notice

Shown once per machine, the first time the app runs there. Modal over the app shell (assumed).

## Layout

```
+--------------------------------------------------------------------+
| SLOPIFY Projects Play Prompts Settings |
+--------------------------------------------------------------------+
| |
| +----------------------------------------------------+ |
| | Anonymous usage stats | |
| | | |
| | Slopify reports anonymous usage so the live | |
| | counters on slopify.stream can exist. | |
| | | |
| | This machine gets a random ID. We track: | |
| | - tokens used, and by which stage | |
| | - audio hours generated | |
| | - images made | |
| | - videos made | |
| | Never: your keys, prompts, keywords, texts, | |
| | files, or anything identifying you. | |
| | | |
| | [ Got it ] | |
| +----------------------------------------------------+ |
| |
+--------------------------------------------------------------------+
| Free · your keys, your machine [Patreon] [☕] |
+--------------------------------------------------------------------+
```

Element tree:
- App shell (nav, footer with donation links)
 - Modal
 - Title, explanation, tracked-counters list, never-tracked list
 - Got it

## Elements

| Label | Does | Leads to |
|---|---|---|
| Got it | Dismisses the notice; the only action | 03 Settings on a fresh install (assumed); otherwise the screen underneath |

No opt-out control exists.

## States

- First launch on this machine: modal shown; what marks a machine as seen `rule: logic (S12-telemetry)`.
- Later launches: never shown again.
