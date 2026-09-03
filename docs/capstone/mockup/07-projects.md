---
screen: projects list
journeys: [J3-make-a-video, J6-revisit]
assumed:
 - columns: title, status, format, created
 - Delete per project
 - this is the app's landing screen once the first run is done
generated_date: 2026-09-02
capstone_version: 5.2.0
---

# 07 Projects

Every run ever started, one row each.

## Layout

```
+--------------------------------------------------------------------+
| SLOPIFY [Projects] Play Prompts Settings |
+--------------------------------------------------------------------+
| PROJECTS [ + New run ] |
| | Title | Status | Format | Created | |
| | The Complete History of Vecna | running | 16:9 | 08:12 | |
| | Acererak, Explained | done | 9:16 | 07:40 | |
| | Kas the Betrayer | failed | 16:9 | 07:05 | |
| | Sources of the Underdark | canceled | 16:9 | yesterday| |
+--------------------------------------------------------------------+
| Free · your keys, your machine [Patreon] [☕] |
+--------------------------------------------------------------------+
```

Element tree:
- App shell
 - New run
 - Table: title, status, format, created (assumed)

## Elements

| Label | Does | Leads to |
|---|---|---|
| + New run | Starts configuring a run | 06 Play |
| Row | Opens the project | 08 Project page |
| Delete (assumed) | Removes the project and its outputs from this machine | Stays |

## States

- Empty: no projects yet; copy points at Play.
- Rows with a project-level status derived from stage statuses: running / done / failed / canceled; the derivation `rule: logic (S9-pipeline-lifecycle)`.
- Deleting a project: what is removed from disk and whether a running project can be deleted `rule: logic (S14-storage-and-downloads)`.
