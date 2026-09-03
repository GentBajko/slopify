---
screen: prompts list
journeys: [J2-first-run-setup]
assumed:
 - Delete and Duplicate actions per prompt
 - the list shows each prompt's detected slot names
generated_date: 2026-09-02
capstone_version: 5.2.0
---

# 04 Prompts

All saved prompts, in three kinds: article, image, thumbnail.

## Layout

```
+--------------------------------------------------------------------+
| SLOPIFY Projects Play [Prompts] Settings |
+--------------------------------------------------------------------+
| [Article] [Image] [Thumbnail] [ + New ] |
| |
| | Name | Slots | |
| | Documentary dossier | topic, minWords, maxWords | [Edit] |
| | Listicle | topic, count | [Edit] |
| |
| (Image tab) |
| | Oil painting scenes | topic, era | [Edit] |
| | Map close-ups | topic | [Edit] |
| |
| (Thumbnail tab) |
| | Bold title card | topic | [Edit] |
+--------------------------------------------------------------------+
| Free · your keys, your machine [Patreon] [☕] |
+--------------------------------------------------------------------+
```

Element tree:
- App shell
 - Kind tabs: Article / Image / Thumbnail
 - New
 - Table per kind: name, detected slots (assumed column), Edit

## Elements

| Label | Does | Leads to |
|---|---|---|
| Article / Image / Thumbnail tabs | Filters the list by prompt kind | Stays |
| + New | Starts a prompt of the active kind | 05 Prompt editor |
| Edit | Opens the prompt | 05 Prompt editor |
| Delete, Duplicate (assumed) | Removes or copies a prompt | Stays |

## States

- Empty kind: no prompts of this kind yet; copy invites creating one.
- Populated: rows as drawn.
- Deleting a prompt a past project used: what the project page shows afterwards `rule: logic (S15-prompt-management)`.
