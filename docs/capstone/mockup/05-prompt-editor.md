---
screen: prompt editor
journeys: [J2-first-run-setup]
implements: [Q6, Q7, Q11, Q12, Q13]
assumed:
  - live "Detected slots" line under the body
  - Kind is chosen in the editor rather than fixed by the tab that opened it
generated_date: 2026-09-02
capstone_version: 5.2.0
---

# 05 Prompt editor

One prompt: name, kind, body with `{{keyword}}` slots (Q7).

## Layout

```
+--------------------------------------------------------------------+
|  SLOPIFY   Projects  Play  [Prompts]  Settings                      |
+--------------------------------------------------------------------+
|  < Prompts                                                         |
|  Name  [ Documentary dossier            ]   Kind (•)Article        |
|                                                  ( )Image          |
|                                                  ( )Thumbnail      |
|  Body                                                              |
|  +--------------------------------------------------------------+  |
|  | Compose a {{minWords}}-{{maxWords}}-word, documentary-style   |  |
|  | dossier on {{topic}}.                                        |  |
|  |                                                              |  |
|  | Historical Through-Line                                      |  |
|  | Trace the topic's development year-by-year ...               |  |
|  | ...                                                          |  |
|  | Length Control                                               |  |
|  | • Maintain total word count within {{minWords}}-{{maxWords}} |  |
|  |   words (±3 %).                                              |  |
|  +--------------------------------------------------------------+  |
|  Detected slots: {{minWords}} {{maxWords}} {{topic}}               |
|                                                                    |
|                                    [Delete]   [Cancel]  [ Save ]   |
+--------------------------------------------------------------------+
```

The body shown is the Q6 sample with its `${}` slots rewritten in the `{{}}` syntax settled at Q7.

Element tree:
- App shell
  - Back link
  - Name, Kind radio (Q6, Q13)
  - Body textarea (Q6)
  - Detected slots line (assumed)
  - Delete, Cancel, Save

## Elements

| Label | Does | Leads to |
|---|---|---|
| Name | Display name used in the pickers on 06 Play | Stays |
| Kind: Article / Image / Thumbnail | Which picker on 06 offers this prompt (Q6, Q12, Q13) | Stays |
| Body | Free text; every `{{name}}` becomes a per-run field on 06 (Q7) | Stays |
| Detected slots (assumed) | Read-only list of distinct slot names found in the body | None |
| Save | Persists; the prompt appears in 04 and in 06's pickers | 04 Prompts |
| Cancel | Discards edits | 04 Prompts |
| Delete | Removes the prompt | 04 Prompts |

## States

- New: empty fields, kind preselected from the tab that opened it (assumed).
- Editing: fields filled.
- Body with no slots: allowed; 06 shows no keyword fields for it.
- Malformed slot (`{{` without `}}`, nested, spaces): what is detected and whether Save is blocked `rule: logic (S1-substitution)`.
- Same slot name in an article prompt and an image prompt: one field on 06 (Q11); the merge rules `rule: logic (S1-substitution)`.
