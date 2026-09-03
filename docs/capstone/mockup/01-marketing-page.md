---
screen: marketing page (slopify.stream)
journeys: [J1-discover-and-install]
assumed:
 - counter set: videos made, audio hours, images made, tokens used, installs
 - section order on the page
generated_date: 2026-09-02
capstone_version: 5.2.0
---

# 01 Marketing page

Public, single page at slopify.stream. No login, no app state. Serves J1.

## Layout

```
+--------------------------------------------------------------------+
| SLOPIFY [GitHub] [Patreon] [☕] |
+--------------------------------------------------------------------+
| |
| Turn a prompt into a narrated slideshow video. |
| Research -> article -> voice -> images -> video, in one run. |
| |
| $ npx @gentbajko/slopify@latest [Copy] |
| |
+--------------------------------------------------------------------+
| LIVE |
| 12,345 videos made 4,321 h audio 98,765 images 1.2B tokens |
| 876 installs (updates live) |
+--------------------------------------------------------------------+
| HOW TO USE |
| 1. Run the command, open the browser tab it prints. |
| 2. Settings: paste your provider API keys, add voices. |
| 3. Prompts: write article / image / thumbnail prompts with |
| {{keywords}}. |
| 4. Play: pick prompts, fill keywords, choose voice, format, play. |
| 5. Project: watch the stages, download text / audio / images / |
| mp4. Provide any stage yourself to skip it. |
+--------------------------------------------------------------------+
| Free. Runs on your machine with your own keys. |
| Support: [Patreon] [Buy Me a Coffee] Anonymous telemetry. |
+--------------------------------------------------------------------+
```

Element tree:
- Page
 - Header: wordmark, GitHub link, donation links
 - Hero: one-line pitch, pipeline summary, install command with copy
 - Live counters: five aggregate numbers
 - How to use: numbered walkthrough of the app's options
 - Footer: free/BYO-keys statement, donation links, telemetry statement

## Elements

| Label | Does | Leads to |
|---|---|---|
| `npx @gentbajko/slopify@latest` + Copy | Copies the install command | The user's terminal; the app opens as a browser tab → 02 |
| Patreon / Buy Me a Coffee | Donation links | External |
| GitHub | Repository, whose README also carries the donation links | External |
| Live counters | Aggregate telemetry across all installs, refreshed every few seconds | None |
| How to use | Static walkthrough: keys, prompts, keywords, play options, project page | None |

## States

- Counters live: numbers refresh in place; interval and animation `rule: logic (S12-telemetry)`.
- Counters unavailable: collector unreachable; what is shown instead `rule: logic (S12-telemetry)`.
- Default: everything else is static content.
