---
generated_at_commit: d6a72d6428ff
generated_date: 2026-10-18
capstone_version: 8.0.0
content_hash: c3a58e1f7b26
paths_covered:
  - ":(top)packages/web/src/components/model-checks.tsx"
  - ":(top)packages/web/src/components/catalogue.tsx"
  - ":(top)packages/web/src/lib/use-check-models.tsx"
  - ":(top)packages/web/src/lib/model-checks.ts"
  - ":(top)packages/web/src/play/model-picker.tsx"
  - ":(top)packages/web/src/template-studio/compare-on-sample.tsx"
  - ":(top)packages/app/src/slices/model-checks/rules.ts"
---

# Settings → Models: model checks and model lists

## Mode & job
Operate section of Settings, `/settings?section=models` (the Connections group), plus the badges and Check buttons of every model picker. It answers "which models can I actually run with the keys and command-line tools I set up", checks them on request or automatically, and lists the ones that started to work. The catalogue half of the section (Check now, Replace with published file, Retired models in use) is described in 08-settings; this chapter covers what 4.0 added (`packages/web/src/routes/settings.tsx:205-210`, `packages/web/src/components/model-checks.tsx:82-83`).

- The section renders `CatalogueSettings` then `ModelChecksSettings` in one fragment, so the checks sit below the catalogue (`packages/web/src/routes/settings.tsx:205-210`).
- Home's side column carries a reserved line that links here when new models work for you (`packages/web/src/components/model-checks.tsx:206-220`, `packages/web/src/routes/home.tsx:258`).
- Data: the model-check overview (`modelChecksQuery`), the provider list for names and setup state, and per-provider model lists with standings (`packages/web/src/components/model-checks.tsx:87-88`, `packages/web/src/play/model-picker.tsx:46-55`).

## Composition
| Region | What renders | Kit / tokens |
|---|---|---|
| Models that work for you | `SectionHead` with the `settings.models.checks` InfoTip and, at its right, an "Automatic checks" `Select` ("Free and near-free checks only" or "Off: only when I choose Check models") with the `settings.models.auto-checks` InfoTip (`packages/web/src/components/model-checks.tsx:23-26`, `packages/web/src/components/model-checks.tsx:128-140`) | `SectionHead`, `Select`, `InfoTip` |
| Provider rows | One `sl-row` per provider that is set up (a saved key, an installed CLI, or an available system voice): the name (a provider shared by two families says which, "Codex CLI (text)"), a `text-small` summary "N working · N not on your plan · N listed for you · last checked <ago> / not checked yet", a `text-label` "Checks cost nothing so far" / "Checks cost $X so far", a reserved info status slot, and a small "Check models" button (`packages/web/src/components/model-checks.tsx:28-80`, `packages/web/src/components/model-checks.tsx:103-123`) | `StatusSlot`, `Button` |
| New for you | `SectionHead` "New for you" (InfoTip `settings.models.new-for-you`) with a quiet "Dismiss all"; one row per model: its name, "<provider> · found to work <ago>", a secondary "Compare on a sample" and a quiet "Dismiss" (`packages/web/src/components/model-checks.tsx:160-200`) | `SectionHead`, `Button` |
| Check dialog | A `ConfirmDialog` "Check N <provider> models?" with the consequence "Each model gets one small request, so this costs <estimate> at list price.", confirm "Check models", cancel "Cancel"; shown only when the estimate costs money (`packages/web/src/lib/use-check-models.tsx:26-87`) | `ConfirmDialog` |
| Compare drawer | "Compare on a sample" opens a narrow `Drawer` "Compare <model> on a sample": a line saying that the template's studio opens with Compare models ready and nothing is spent until Compare is pressed there (voice models are compared within the template's voice provider), then a `List` of templates, each with "Version N" and a button; the choice opens `/templates/$templateId?compareProvider=&compareModel=` (`packages/web/src/template-studio/compare-on-sample.tsx:20-85`, `packages/web/src/router.tsx:376-399`) | `Drawer`, `List`, `Button` |
| Model picker | Every model `Select` in Play, template studios and the edit controls: each option is "<model> · <badge>"; by default only working models plus the chosen one are listed; beneath it a status line and the buttons Refresh, "Show all (N more)" / "Show fewer", and "Custom ID" / "Use list" where the provider allows a custom id (`packages/web/src/play/model-picker.tsx:56-66`, `packages/web/src/play/model-picker.tsx:175-212`) | `Select`, `Button` |
| Picker status line | `role="status"` line with the chosen model's badge ("Not checked yet." while nothing works for the key), the provider's own words for a model not on the plan, and a quiet button: "Check models" for the whole list, or "Check · <price>" for the chosen model, with the price said before it is pressed (`packages/web/src/play/model-picker.tsx:17-26`, `packages/web/src/play/model-picker.tsx:213-247`) | `Button` |
| Filter | A search box "Filter N models by name" above the select once a list has more than 12 entries (`packages/web/src/play/model-picker.tsx:28-29`, `packages/web/src/play/model-picker.tsx:109-118`) | `Input` |

Badges (`badgeOf`): "✓ works" with " · checked <ago>" or " · used <ago>", "? listed for you · not checked", "? not checked", "✕ not on your plan", and "⚠ retiring <date> → <replacement>" which wins over the others (`packages/app/src/slices/model-checks/rules.ts:145-155`). A model marked not on your plan still runs if it is chosen: badges never change what a run does.

## States
| State | Trigger | Rendered |
|---|---|---|
| Looking | overview or provider list pending | `text-small` "Looking…" in place of the provider rows (`packages/web/src/components/model-checks.tsx:146-151`) |
| No provider | nothing set up | "No provider is set up yet. Add a key or a CLI in Settings → Providers." (`packages/web/src/components/model-checks.tsx:150`) |
| Problem | overview, automatic-checks or dismiss request fails | one danger `role="alert"` line with the server's sentence (`packages/web/src/components/model-checks.tsx:125`, `packages/web/src/components/model-checks.tsx:141-145`) |
| Checking | a check is running for a provider | status "Checking in the background…"; the button reads "Checking…" and is disabled (`packages/web/src/components/model-checks.tsx:63-75`) |
| Check started | a check was sent | message "Checking N model(s) in the background." or "Nothing to check here."; the lists are read again 5 seconds later and by the pickers' own refresh (`packages/web/src/lib/use-check-models.tsx:14-16`, `packages/web/src/lib/use-check-models.tsx:43-54`) |
| Check failed to start | the estimate or start request fails | the server's sentence in the same message slot (`packages/web/src/lib/use-check-models.tsx:55-61`) |
| Costs money | the estimate has a price | the confirm dialog; nothing is sent until Check models is pressed (`packages/web/src/lib/use-check-models.tsx:63-68`) |
| No new models | `newForYou` empty | "No new models since you last looked."; Dismiss all disabled (`packages/web/src/components/model-checks.tsx:162-171`) |
| Home slot | N > 0 new models | link "N new model(s) work(s) for you" to `/settings?section=models`; empty line otherwise (`packages/web/src/components/model-checks.tsx:207-219`) |
| Compare list error | templates fail to load | "Your templates didn't load: <message> Close this and press Compare on a sample again." (`packages/web/src/template-studio/compare-on-sample.tsx:59-62`) |
| Compare list empty | no templates | "No templates yet. Save a setup in Library → Templates, make its sample, then compare." (`packages/web/src/template-studio/compare-on-sample.tsx`) |
| Picker with nothing matching | filter matches no name | `No model name contains "<text>".` (`packages/web/src/play/model-picker.tsx:169`) |
| Picker loading | list pending | the select reads "Pick a provider first" / "Loading models…" / "Pick a model" (`packages/web/src/play/model-picker.tsx:142-145`) |

## Motion
- The Refresh icon spins while a list is being read, and not under reduced motion (`packages/web/src/play/model-picker.tsx:187-190`). Nothing else is authored.

## Copy
- "Models that work for you", "New for you", "Automatic checks", "Check models", "Compare on a sample", "Dismiss", "Dismiss all", "Show all (N more)", "Show fewer", "Custom ID" (`packages/web/src/components/model-checks.tsx:129-194`, `packages/web/src/play/model-picker.tsx:204-224`).
- Cost lines are plain: "Checks cost nothing so far", "Checks cost $0.0123 so far" (four decimals below one cent) (`packages/web/src/components/model-checks.tsx:30-33`). Estimates read "free", "less than a cent" or "about $0.04" (`packages/app/src/slices/model-checks/rules.ts:164-171`).
- Provider names that exist in two families carry the family: "(text)", "(voice)", "(images)" (`packages/web/src/components/model-checks.tsx:28`, `packages/web/src/components/model-checks.tsx:104-111`).

## Not in play
- Checking image-to-video models: absent; they are listed, never checked.
- Spending without the price shown first: absent; a priced check always opens the confirm dialog (`packages/web/src/lib/use-check-models.tsx:63-68`).
- Hiding the chosen model: absent; the picker keeps the selected model visible whatever its badge (`packages/web/src/play/model-picker.tsx:56-59`).
- Automatic checks for images: absent; images are only checked on request.
- Changing the automatic-check setting through an agent: absent; it is the person's setting.
- A list of every provider's models on this page: absent; the lists are in the pickers, this section shows counts per provider.
