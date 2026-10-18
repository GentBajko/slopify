---
scenario: model-lists-and-checks
screens:
- 02-play
- 08-settings
- 15-home
depends_on:
- 18-cost-review-batch
- 19-catalogue-thinking
- 20-boot-cli-recovery
- 37-run-cost-and-eta
- 45-mcp-agent-access
generated_at_commit: d6a72d6428ff
generated_date: 2026-10-18
capstone_version: 7.0.1
content_hash: 5b0c7e41a9d3
paths_covered:
  - ":(top)packages/app/src/slices/model-checks/**"
  - ":(top)packages/app/src/slices/model-upkeep/**"
  - ":(top)packages/app/src/model-checks.ts"
  - ":(top)packages/app/src/edge/http/model-checks.ts"
  - ":(top)packages/app/src/kernel/runner/model-check.ts"
  - ":(top)packages/app/src/kernel/runner/model-access.ts"
  - ":(top)packages/app/src/adapters/model-access.ts"
  - ":(top)packages/app/src/adapters/http-failure.ts"
  - ":(top)packages/app/src/adapters/key-probes.ts"
  - ":(top)packages/app/src/kernel/ports/key-probe.ts"
  - ":(top)packages/app/src/kernel/db/migrations/0063-model-checks.sql"
  - ":(top)packages/web/src/components/model-checks.tsx"
  - ":(top)packages/web/src/components/retired-models.tsx"
  - ":(top)packages/web/src/components/provider-upkeep-api.ts"
  - ":(top)packages/web/src/lib/model-checks.ts"
  - ":(top)packages/web/src/lib/use-check-models.tsx"
  - ":(top)packages/web/src/play/model-picker.tsx"
---

# 48 Model lists and model checks

Slopify's model list (`models.yaml`, 19-catalogue-thinking.md) says which models exist. This scenario is the second layer: which of them work for the person's own key or CLI login. Settings → Models → **Models that work for you** and every model picker show it as a badge per model; **Check models** learns it by sending each model its smallest possible request, after showing the price; real runs teach it for free; and the lists of retiring and retired models point at what to switch to. The standing is for pickers only: no run, admission or registry call ever reads it. Paths starting `slices/`, `edge/`, `kernel/`, `adapters/` or `catalog/` are under `packages/app/src/`; `packages/web/...` is written out.

## Trigger & preconditions

| Behavior | Trigger | Preconditions |
|---|---|---|
| Read the key's model list | A picker opening (`GET /api/providers/:id/models`, at most every 6 h per key), a key saved, a CLI becoming usable, the weekly look, Check models, and a daily catalogue check that adds models for the provider (`edge/http/providers.ts:67-73`, `:199`, `:261-265`, `main.ts:1009-1014`, `slices/model-checks/listing.ts:114-147`) | The provider has a key or CLI on file; automatic reading also needs `autoModelChecks` (Step 3) |
| Check models | The button on a provider's row in Settings → Models, or **Check** under a model picker, → `GET /api/providers/:id/models/check/estimate` then `POST /api/providers/:id/models/check` (`packages/web/src/components/model-checks.tsx:48-80`, `packages/web/src/play/model-picker.tsx:224-248`, `edge/http/model-checks.ts:72-136`) | A key saved for the provider (a key provider), or the CLI set up; nothing already checking that provider |
| Automatic checks | A key saved (`key-added`), a CLI becoming usable (`cli-added`), and the weekly look (`weekly`) (`slices/model-checks/service.ts:207-234`, `main.ts:1020-1037`) | Boot option `refreshModels` is on, so `SLOPIFY_NO_MODEL_REFRESH` turns these off with the daily catalogue check; Settings → Models → Automatic checks is not Off (`main.ts:586`, `slices/model-checks/repo.ts:170-173`) |
| Learn from a real run | Every provider call that succeeds or fails with a model-access fault, from a project stage or from a call outside a project (`kernel/runner/providers.ts:174-177`, `kernel/runner/standalone.ts:53`, `:111`, `main.ts:427`, `:1255`) | A key or CLI for the provider is on file |
| See what is new | Settings → Models → New for you; Home's side column line "N new models work for you" (`packages/web/src/components/model-checks.tsx:160-220`, `packages/web/src/routes/home.tsx:258`) | At least one model began to work after the first check |
| Switch a retired model | **Switch to …** on a template or schedule row, **Switch all** in Settings → Models | A choice names a model the catalogue retired or no longer lists (Steps 20-21; 19-catalogue-thinking.md Steps 15-17) |
| Agents | `list_models`, `get_model_checks`, `estimate_model_checks`, `check_models`, `dismiss_model_notices` (`edge/mcp/tools-setup.ts:201-249`) | As the page's own actions |

## Steps

### What the database keeps (`kernel/db/migrations/0063-model-checks.sql`)

1. **Table `model_checks`**, one row per provider, family (`llm`, `tts`, `image`) and model: `account` (which key or login the row was learned with), `listed` and `listed_at` (the live list names it), `verdict` (`works`, `no-access`, `failed`) with `verdict_source` (`check` or `run`), the provider's own `sentence`, `checked_at`, `cost` (US dollars spent on checks of this model, all told), `first_works_at` and `notice_seen` (`kernel/db/migrations/0063-model-checks.sql:5-19`). The setting `model-checks.auto` (`free` or `off`, default `free`), `model-checks.weekly-at` and `model-checks.baseline-done` live in settings (`slices/model-checks/model.ts:28-30`, `slices/model-checks/repo.ts:170-177`).
2. **Whose models a row describes** (`accountOf`, `slices/model-checks/repo.ts:153-168`): a keyed provider's account is its key's `credential_generation`, so a new key starts every row over; Gemini speech without a key of its own uses the Google images key (`sharedKeyOf`, `slices/settings/model.ts:137-139`); a CLI's and the system voice's is the provider id, since the CLI's login is not Slopify's to tell apart. No key and no CLI: no account, and nothing is read or learned. `ensure` clears a row of another account before anything is written to it (`slices/model-checks/repo.ts:75-86`).
3. **Automatic work is gated**: `AppDeps.autoModelChecks` is true only when boot option `refreshModels` is, which the CLI sets unless `SLOPIFY_NO_MODEL_REFRESH` is a non-empty value other than `0`/`false`; tests leave it off so a route never reaches the network on its own (`main.ts:586`, `main.ts:931-933`, `edge/http/app.ts:135-137`, `edge/cli.ts:96-98`).

### Listing: "listed for you" (`slices/model-checks/listing.ts`)

4. **Free reads only.** `listedFor(provider)` reads what the provider offers the account without generating anything: a local provider (the system voice) is skipped as `no-list`; a CLI is asked for its own model list; a key provider reads its probe (`adapters/key-probes.ts`): a paged model list when it has one (OpenRouter, OpenAI text-to-speech and images, Google images and speech, ElevenLabs; at most 10 pages), else one read of each model's own page (fal.ai, Replicate) where 2xx is found and 404 missing, and anything else (no answer, 5xx) leaves that model as it was; Cartesia and Inworld have neither and are skipped (`slices/model-checks/listing.ts:28-110`, `adapters/key-probes.ts:70-145`, `kernel/ports/key-probe.ts:3-30`, `slices/settings/probe-read.ts:10-28`). Each read has a 15 s timeout and no redirects. The answer is compared with Slopify's own rows for the provider (`known`: enabled, not deprecated), and `writeListed` stores listed true or false per row with the time (`slices/model-checks/repo.ts:97-105`).
5. **How often.** `createListing().refresh(provider, force?)` shares one in-flight read per provider and, unless forced, does nothing for the same account within 6 hours (`listingFreshMs`, `slices/model-checks/listing.ts:112-147`). A picker opening calls it without waiting (`relist`, `edge/http/providers.ts:67-73`); a key saved, a CLI added, the weekly look and the catalogue check force it (`slices/model-checks/service.ts:209-214`, `main.ts:1009-1014`).

### Standings shown to pickers (`slices/model-checks/rules.ts`)

6. **Standing of a model** (`standingOf`): `works` or `no-access` when the row's verdict says so, else `listed` when the live list names it, else `known` (only Slopify's list does). A row learned with another account, or no row, is `known` (`slices/model-checks/rules.ts:46-67`). `failed` tells nothing about access, so it leaves the standing at listed or known. `retiring` (date and replacement from `models-lifecycle.yaml`) rides along (`slices/model-checks/service.ts:247-265`, `catalog/lifecycle.ts:47-71`).
7. **Where they are served**: `standings` is added to `GET /api/providers/:id/models` for the catalogue's rows, for the image-to-video rows with `?video=1`, and for a CLI's or the runtime list (`edge/http/providers.ts:199-228`).
8. **The badge** (`badgeOf`): "⚠ retiring 3 Nov → Name" outranks the rest; then "✓ works · checked 2 h ago" or "· used …" (a run taught it); "✕ not on your plan"; "? listed for you · not checked"; "? not checked" (`slices/model-checks/rules.ts:145-155`). The sentence the provider gave is shown under the picker for a model not on your plan (`packages/web/src/play/model-picker.tsx:224-233`).
9. **What a picker lists** (`pickerEntries`, `packages/web/src/play/model-picker.tsx:54-64`, `slices/model-checks/rules.ts:85-111`): by default the models that work for you plus the model already chosen, which stays visible and selected whatever its badge; while nothing works yet it falls back to the listed ones, then the known ones, so a picker is never empty before the first check (and says "Not checked yet."); entries sort works, listed, known, not on your plan, each in catalogue order. **Show all (N more)** brings back the rest, **Show fewer** hides them again (`packages/web/src/play/model-picker.tsx:192-210`). Animate images' video picker badges its models the same way (`packages/web/src/video/edit-controls.tsx:255`, `:339`).

### Planning a check (`slices/model-checks/run.ts`, `cost.ts`)

10. **Cost of one check** (`costOf`): the system voice $0; a CLI $0 with `planUsage` (its plan's allowance); any other model priced by `priceCall` at an assumed 40 tokens in, 40 out, 2 characters of speech or one small image, falling back to the voice's per-minute rate ÷ 60; `null` when the catalogue prices neither (`slices/model-checks/cost.ts:11-66`).
11. **Manual plan** (Check models): every model the provider offers (the catalogue's enabled, not deprecated rows, or what a CLI or the system voice lists), narrowed to the ids asked for; image-to-video models are skipped with "Image-to-video models are listed, never checked." and a provider without a key with "No key is saved for this provider." (`slices/model-checks/service.ts:125-157`, `slices/model-checks/run.ts:72-101`). The estimate is the plan's targets, the sum of known list-price dollars, how many had no price, the CLIs whose plan allowance is used and the skipped list (`slices/model-checks/run.ts:39-51`, `:122-131`); `dollarsText` words it "free", "less than a cent", "about $0.04", plus "N models with no listed price" (`slices/model-checks/rules.ts:165-171`).
12. **Automatic plan** (key added, CLI added, weekly): takes only what the person already uses or already has: models chosen in any template, schedule, draft or unfinished project (`chosenModels`, `slices/model-checks/service.ts:87-97`), models that worked for this account, and listed models not yet checked. Order is chosen, then worked, then new. It never runs an image or a clip, anything a CLI plan does not pay for that costs `automaticCeilingDollars` ($0.001) or more per call, or a model with no price; those are skipped with "It costs money, so only Check models runs it." At most 25 models per provider (`slices/model-checks/run.ts:67`, `:84-121`, `slices/model-checks/cost.ts:7-9`, `:68-74`).
13. **Confirmation**: a manual plan that costs money, or has any unpriced model, runs only when the request carries `confirmedDollars` at least the plan's total (`needsConfirmation`, `slices/model-checks/run.ts:159-164`). Without it `POST` answers 409 "Checking 12 OpenAI model(s) costs about $0.04 at list price, and nothing was sent yet. Choose Check models in Settings → Models again and confirm the estimate to go ahead." with the estimate in `estimate` (`edge/http/model-checks.ts:120-127`). The page asks first through a confirm dialog "Check N models?" worded "Each model gets one small request, so this costs … at list price."; a free check (a CLI's plan, the system voice) goes straight out (`packages/web/src/lib/use-check-models.tsx:26-87`).
14. **One check per provider at a time**: `start` takes the provider before its first `await`, so two starts that arrive together cannot both pass and pay twice; a second answers 409 "Slopify is already checking OpenAI's models. Wait for it to finish, then choose Check models again in Settings → Models." (`slices/model-checks/service.ts:158-206`, `edge/http/model-checks.ts:115-119`). Once planned, only the providers the plan checks stay taken (`keepFor`, `slices/model-checks/service.ts:167-172`).

### Running a check (`slices/model-checks/run.ts`, `kernel/runner/model-check.ts`, `model-checks.ts`)

15. **The request** (`recipeFor`, `model-checks.ts:60-122`): text → "Reply with OK." at the lowest thinking mode the model offers (the catalogue's `llm.thinking` keys, or the CLI's `thinkingModes`); speech → "Hi" with the first voice saved for the provider, else a default voice every account has (OpenAI `alloy`, Google `Kore`, ElevenLabs' premade Rachel), else the model is skipped with "Add a voice for this provider in Settings → Voices, then choose Check models."; the system voice is free and works when a speech program is found, else skipped "No speech program was found on this computer."; images → "a small grey dot", 1:1 when the model lists it, at a CLI's lowest effort; image-to-video models are skipped (`model-checks.ts:30-33`, `:35-40`).
16. **The call** (`checkModel`, `kernel/runner/model-check.ts:73-172`): through the attempt wrapper like any provider call, but made once and recorded as no project's attempt (`:70`, `:103-126`); a failure is rethrown as final (kind `unsupported`) so the wrapper names and redacts it without trying again and a check never costs more than its estimate (`:81-102`); 60 s without an answer is called failed (`checkTimeoutMs`, `:60`, `:82`). A text answer must be non-empty and a voice's audio non-empty, else the check throws (`:174-221`). Verdicts: the call works → `works`; a fault whose `access` names the model → `no-access` with the wrapper's redacted sentence (`:140-147`); anything else → `failed` (rate limit, network, provider down). A rejected key, a missing key, a rate limit or a used-up plan limit also sets `stopProvider`, so the provider's remaining checks are skipped (`:148-158`, `slices/model-checks/run.ts:217-221`).
17. **What it cost** (`model-checks.ts:124-145`, `slices/model-checks/cost.ts:31-43`): a `works` check is priced from what the call reported (tokens, characters, images), at list price; a CLI or the system voice $0. A failure after the provider took the request (timeout, dropped connection, a refusal of the content, an unusable answer: `afterSend`, `kernel/runner/model-check.ts:63-68`) and not a stop is counted at the estimate the check showed, since the provider may have billed it (`mayHaveBilled`, `:158`); a failure before it (bad key, no access, rate limit) counts nothing.
18. **Order and writes**: a provider's models are checked one after another, providers in parallel; each outcome is written at once with `writeVerdict` (`slices/model-checks/run.ts:166-230`). `mergeVerdict` keeps the newer of two decisive answers (works or no-access), ignores an answer older than the stored one, and never lets `failed` replace a decisive one (`slices/model-checks/rules.ts:26-43`). The model's `cost` accumulates; `first_works_at` is set the first time it works (`slices/model-checks/repo.ts:112-140`).
19. **Learning from runs** (`accessRecorder`, `slices/model-checks/record.ts:14-44`): a call that succeeds marks its model `works` (source `run`, cost 0); a call that fails with a fault whose `access` is `no-access` or `not-found` marks it `no-access` with the provider's sentence, at once. Adapters set `access` from the status and words only they see (`adapters/model-access.ts:20-35`, `adapters/http-failure.ts:49-63`); a Docker run reads it back out of the host helper's words, since the bridge sends kind and message only (`adapters/host-cli/index.ts:258-260`). Recording never fails a call; a recording error is logged `model-checks.record` (`kernel/runner/model-access.ts:1-60`).
    A model first seen working in a run is no news to the person who chose it (`slices/model-checks/repo.ts:117-120`).

### New for you and the first run

20. **Baseline**: the first time any check run finishes, everything that works is marked seen, so only models that start working afterwards are news (`slices/model-checks/run.ts:224-229`). `newForYou` lists rows with `works`, a `first_works_at` and no `notice_seen`, newest first, only for the account the provider has now (`slices/model-checks/rules.ts:157-162`, `slices/model-checks/service.ts:287-301`). **Dismiss** or **Dismiss all** (`POST /api/model-checks/notices/dismiss`, up to 500 keys) sets `notice_seen` (`edge/http/model-checks.ts:147-150`); a row's **Compare on a sample** asks for a template and opens its studio with Compare models ready for that model (46-template-studio.md) (`packages/web/src/components/model-checks.tsx:186`).
21. **Settings → Models → Models that work for you**: one row per provider that is set up, with "N working · N not on your plan · N listed for you · last checked 2 h ago", "Checks cost $0.0042 so far" and a **Check models** button; **Automatic checks** is a select, "Free and near-free checks only" or "Off: only when I choose Check models" (`PUT /api/model-checks/auto`) (`packages/web/src/components/model-checks.tsx:23-159`, `edge/http/model-checks.ts:151-155`). The overview polls every 15 s (`packages/web/src/lib/model-checks.ts:20-29`).

### Weekly look and CLI watcher (`main.ts`)

22. Hourly, when automatic checks are on: `cliWatcher` runs `automatic("cli-added", id)` for a CLI that became usable since the last look, or is usable and was never listed, and `automatic("weekly")` when seven days passed since the last (`main.ts:1020-1037`, `model-checks.ts:202-220`, `slices/model-checks/service.ts:80-81`, `:240-246`). `automatic` first forces each provider's listing, then stops when Automatic checks is Off, then plans, stamps the weekly time and runs what is free (`slices/model-checks/service.ts:207-234`).

### Retiring and retired models

23. **Retiring**: a model with a row in `models-lifecycle.yaml` whose catalogue row is not yet deprecated shows "⚠ retiring <date> → <replacement>" in every picker and in `list_models` (19-catalogue-thinking.md Step 19).
24. **Retired**: once the catalogue marks a model deprecated, or no longer lists it, every template, schedule, draft and unfinished project still choosing it is listed in Settings → Models with a **Switch to <model>** button that makes a new template version, draft version or project revision with only that model changed; **Switch all** does every listed use that has a replacement and no blocking reason. The replacement is the lifecycle's, else the closest model of the same provider. Template and schedule rows in Library carry the same one-click switch (`packages/web/src/components/retired-models.tsx:16-72`, `packages/web/src/components/provider-upkeep-api.ts:65-92`, `slices/model-upkeep/switch.ts:121-240`, `:307-329`; the rules are 19-catalogue-thinking.md Steps 15-17). A switch never touches the standing.

### Agents and the assistant

25. `list_models` returns each model's `standings`; `get_model_checks` returns the overview; `estimate_model_checks` and `check_models` are the page's estimate and Check models, `check_models` refused until `confirmedDollars` covers the estimate and worded from it ("Checks 12 models, one small request each: about $0.04 at list price, using the CLI plan's allowance."); `dismiss_model_notices` is Dismiss. `PUT /api/model-checks/auto` has no tool: whether checks may spend by themselves is the person's (`edge/mcp/tools-setup.ts:201-249`, `edge/mcp/excluded-routes.ts:72-73`). The in-app assistant must ask before `check_models` (`slices/assistant/gate.ts:41-42`; 50-in-app-assistant.md).

## Branches

- **Key provider vs CLI vs system voice**: a key provider is priced and listed from its probe; a CLI is free to the account but uses plan allowance, and its list comes from the CLI; the system voice is free and checked by finding a speech program (Steps 4, 10, 15).
- **Manual vs automatic plan**: manual takes every offered model after confirmation; automatic takes only what is chosen, worked or newly listed, and only when free or under the ceiling (Steps 11-12).
- **Standing vs run**: a standing never reaches `curateRegistry`, `modelFields` or any admission; a model "not on your plan" still runs if chosen (`catalog/registry.compat.test.ts:32-122`; 19-catalogue-thinking.md Step 21).
- **A chosen model** stays in its picker and keeps its badge whatever it is; before anything works the picker lists everything the key lists (Step 9).
- **Gemini speech with no key of its own** shows the Google images key's account (Step 2).
- **Docker**: the host helper does the CLI work, and its faults are read for access from their words (Step 19). The assistant does not exist there (50-in-app-assistant.md).

## Unhappy paths

| Case | Behavior | Site |
|---|---|---|
| Checking a provider with no key or unset CLI | 400 "No OpenAI key is saved, so its models can't be checked. Paste a key in Settings → Providers → OpenAI and choose Save, then choose Check models in Settings → Models." (a CLI: "… is not set up, … Set it up in Settings → Providers …") | `edge/http/model-checks.ts:60-69`, `:90`, `:108` |
| Checks service not wired yet | 503 "Model checks are not ready yet because Slopify is still starting. Wait a moment, reload the page and try again." | `edge/http/model-checks.ts:42-43`, `:56-58` |
| A check that costs money without a confirmed estimate | 409 with the estimate; nothing is sent | `edge/http/model-checks.ts:120-127` |
| The provider is already being checked | 409 naming the provider | `edge/http/model-checks.ts:115-119` |
| Rejected key, used-up limit, plan limit | The provider's remaining checks are skipped; the check is `failed`, with the provider's sentence | `kernel/runner/model-check.ts:148-158` |
| No answer in 60 s, dropped connection, refusal | `failed`, counted at the estimate, previous standing kept | `kernel/runner/model-check.ts:60`, `:63-68` |
| A model with no voice or no speech program | Skipped with the sentence naming Settings → Voices | `model-checks.ts:86-98` |
| The model list cannot be read | Listing is skipped as `unreadable` and the standings stay as they were; logged `model-checks.listing` | `slices/model-checks/listing.ts:78-96`, `slices/model-checks/service.ts:209-214` |
| A check throws | Counted `failed`, logged `model-checks.check`, the run goes on | `slices/model-checks/run.ts:188-197` |
| A key is replaced while checks run | A verdict written afterwards still carries the old account, so no standing reads it; the new key's rows start over | `slices/model-checks/repo.ts:75-86`, `slices/model-checks/rules.ts:46-53` |
| Recording a run's access fails | Logged `model-checks.record`; the call's answer stands | `kernel/runner/model-access.ts:20-28` |
| Shutdown or an update during checks | `stop()` aborts the checks; an update waits for "the model checks" to end | `slices/model-checks/service.ts:305`, `main.ts:1120`, `main.ts:843-846` |

## State transitions

- `model_checks.verdict`: none → `works` / `no-access` / `failed`; a decisive verdict is replaced only by a newer decisive one; `failed` never replaces `works` or `no-access`; an account change resets every field (`slices/model-checks/rules.ts:26-43`, `slices/model-checks/repo.ts:75-86`).
- `first_works_at`: set once, at the first `works`; `notice_seen`: 0 → 1 on Dismiss, on the first-run baseline, or when a run is what first showed it working (`slices/model-checks/repo.ts:112-151`).
- `model-checks.auto`: `free` ↔ `off`; `model-checks.weekly-at`: stamped when a weekly look plans (`slices/model-checks/service.ts:226-227`).
- Provider check state: idle → reserved → running → idle; a plan with no target for the provider releases it at once (`slices/model-checks/service.ts:158-206`).

## Invariants

- A standing is never read by a run, an admission, a registry call or a start; a model not on your plan still runs exactly as before (`catalog/registry.compat.test.ts:32-122`).
- Nothing is sent to a paid model unless the person confirmed the estimate, or the check is free, a CLI plan's, or under $0.001 and automatic (`slices/model-checks/run.ts:159-164`, `slices/model-checks/cost.ts:68-74`).
- Automatic checks never run an image or an image-to-video model (`slices/model-checks/cost.ts:68-74`, `slices/model-checks/run.ts:97-101`).
- One check call per model: never retried; one provider at a time (`kernel/runner/model-check.ts:92-102`, `slices/model-checks/service.ts:188-206`).
- A row belongs to one account; a new key starts over (`slices/model-checks/repo.ts:75-86`).
- A check's sentence is redacted by the attempt wrapper before it is stored (`kernel/runner/model-check.ts:92`, `:137`); a run's is the error's own message (`kernel/runner/model-access.ts:40-50`).
- `failed` never erases what a decisive answer established (`slices/model-checks/rules.ts:36`).
- Cost is the most a check can bill: recorded at list price and, for a failure after the request was taken, at its estimate (`model-checks.ts:136-143`).

## Outcomes & side effects

- Rows in `model_checks`; settings `model-checks.auto`, `.weekly-at`, `.baseline-done`. Backups leave `model_checks` out on purpose: it is tied to this install's keys and logins and is learned again (`slices/storage/backup-new-tables.test.ts:70-73`).
- Outbound: free model-list reads (15 s timeout) and, when confirmed or free, one small provider request per checked model.
- The updater waits for running checks before it restarts (`main.ts:843-846`).
- Log lines `model-checks`, `model-checks.check`, `model-checks.listing`, `model-checks.record`.
- Pickers, Settings → Models and Home's side column show the result; Template Studio's Compare models can start from a New for you row.

## Recorded differences from the feature spec

- Specified: badges "✓ works / ? listed for you / ? not checked / ✕ not on your plan / ⚠ retiring" and a default list of working models plus the chosen one (changelog.d/2026-10-18-model-lists.md); shipped as `ModelStanding` of four values with retiring carried beside it, and `failed` is not a standing.
- Specified: automatic checks "only when free, a CLI plan, or well under a tenth of a cent"; shipped as a ceiling of strictly under $0.001 per call, 25 models per provider per run, and never images (`slices/model-checks/cost.ts:7-9`, `slices/model-checks/run.ts:67`).
- Specified: failures after the provider took the request may have been billed; shipped as the estimate counted for those (`d6a72d64`), not zero.
- Gemini speech shares the Google images key's account, so its rows start over with that key (Step 2).
- Retirement dates ship in a separate `models-lifecycle.yaml`, not in `models.yaml`, so older versions keep reading it (19-catalogue-thinking.md Step 19).

## Dimensions not in play

- D1 Authority: one local user; checks use only the keys already saved, and `PUT /api/model-checks/auto` is the person's alone, not an agent's.
- D5 Money: bounded by the estimate the person confirms, or by the automatic ceiling; nothing is charged beyond the one small request per model.
- D7 Time: no expiry of a verdict; a weekly look and a 6 h listing refresh, nothing else.
- D13 Notification: none outbound; Home's line and the New for you list are in-page.
- D15 Audit: only the latest verdict per model and its total check cost are kept; no history of checks.
