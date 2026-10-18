# Models

Slopify keeps a model catalogue: the list of models, prices and retirements that the model pickers and cost estimates use. It checks for new models and price changes by itself, and tells you when something you use has been retired so you can switch it in one click.

**Where to find it:** Settings → Models.

## What the catalogue covers

The catalogue lists the models of the providers that take an API key:

| Kind | Providers |
|---|---|
| Text | OpenRouter |
| Speech | ElevenLabs, OpenAI, Cartesia, Inworld |
| Images | OpenAI, Google, fal.ai, Replicate |
| Animated clips (image to video) | fal.ai, Replicate |

For each model it holds a name, a price (per token, per character, per image or per second) and whether the model is retired. A model with no price is counted as unknown, never as free.

The command-line tools (Claude Code, Codex, Gemini) are not in the catalogue. Their pickers show the models the tool installed on your computer offers, and **Check all** in Settings → Providers checks them. See [AI CLIs](AI-CLIs).

The catalogue also sets how many calls each keyed provider runs at once (3 for most, 5 for Inworld).

## How it stays current

When Slopify starts, and then once a day, it checks two sources:

- the published catalogue file in the Slopify repository, and
- OpenRouter's public model list (live model IDs and per-token prices; no key needed).

It folds what it finds into your local catalogue file:

- New models appear in the pickers.
- Prices follow the published list, and OpenRouter models follow OpenRouter's live prices.
- A model the published list drops or marks retired, or that OpenRouter no longer serves, stays in the file marked retired and is hidden from the pickers.
- Models you added to the file yourself, and models you switched off, are left alone.
- A speech model keeps its local character limit, so existing projects are not split differently.

Nothing you have made changes. A finished run's costs keep the prices they were recorded at.

To turn the automatic check off, start Slopify with the environment variable `SLOPIFY_NO_MODEL_REFRESH=1`.

## Check for new models now

1. Open **Settings → Models**.
2. Under **Model catalogue**, choose **Check now** (or press `Ctrl+K` and run **Check for new models**).
3. A message says what changed, such as "Model list checked: 2 new, 1 repriced", or "No changes".

The section shows:

| Row | What it shows |
|---|---|
| **Catalogue file** | The path of your local catalogue file (`models.yaml` in Slopify's data folder). |
| **Verified** | The date the catalogue's prices were last verified. |
| **Last checked** | When the last automatic or manual check ran, and what it changed. |

Below them, **New:** and **Retired:** list the models the last check added or retired.

If the check cannot finish, a red line says why. For example: "Slopify could not download the latest model list, so it is still using the one it has." Check your internet connection and choose **Check now** again.

## Replace the local file with the published one

Use this when the local file is broken, or you want the published list exactly.

1. Open **Settings → Models**.
2. Choose **Replace with published file**.

This overwrites the local catalogue with the published one and drops any edits you made. The previous file is saved beside it first as `models.yaml.previous`, so you can copy your edits back.

## Edit the catalogue yourself

The catalogue is a plain YAML file at the path shown under **Catalogue file**. You can add a model or switch one off in it; Slopify reloads it when it changes, and the daily check keeps your additions.

If the file is missing or has a mistake, Slopify keeps using the last working list and shows: "Your models.yaml file is missing or has a mistake, so Slopify is still using the last working model list." Fix the file, or use **Replace with published file**. The automatic check never overwrites a file that has a mistake in it.

## Switch away from a retired model

**Retired models in use** lists every template, schedule, Play draft and project (with steps still to run) whose model is retired or no longer listed. Nothing changes by itself: a run that reaches a retired model stops and says so.

Each row shows:

- the kind (**Template**, **Schedule**, **Draft** or **Project**) and its name,
- which choice it is (**Text model**, **Voice model**, **Image model** or **Animation model**), the model, and whether it is "retired" or "no longer listed",
- a button **Switch to <model>** with the suggested replacement: the active model from the same provider whose ID shares the longest start with the old one.

To switch:

1. Open **Settings → Models**.
2. Under **Retired models in use**, choose **Switch to <model>** on a row to change only that one choice.
3. Or choose **Switch all** to switch every row that has a suggestion. A message says how many were switched and why any could not be.

What a switch does:

- A template gets a new saved version, and the schedules that ran its latest version move along with it.
- A project gets a new saved version, as **Edit project** would make.
- A draft is updated in place.

Rows that cannot be switched here say why and what to do:

| Row says | What to do |
|---|---|
| **No replacement** ("This provider has no other model to switch to.") | Choose another provider for this step and save. |
| "This schedule runs an older version of the template …" | In the schedule, choose **Edit**, pick the template again so it runs the latest version, then save. |
| "This project is running." | Wait for it to finish or pause it, then switch. |

When nothing is affected, the section says **Nothing uses a retired model.**

You don't have to come here to see it: a template or schedule that picks a retired model is flagged on its own row in **Library → Templates** and **Calendar → Schedules**, with the same **Switch to <model>** button. See [Templates](Templates#retired-models) and [Schedules](Schedules#manage-a-schedule).

**Check all** in Settings → Providers also reports retired models under **Chosen models**, and **Model reachable** asks each keyed provider whether it still answers for the models you chose. See [Providers-and-Keys](Providers-and-Keys#check-all-providers).

## When a run reaches a model that is gone

If a run starts a step whose model is no longer in the list, it stops with a message such as "The chosen … model is no longer in Slopify's model list." Open the project, choose **Edit project**, change the model under Providers, then use **Continue the run**. See [Recovery-and-Retries](Recovery-and-Retries).

## Models that work for you

The catalogue says which models exist. **Settings → Models → Models that work for you** says which ones your own keys and CLIs can use. Each model has one of these standings, shown as a badge in every model picker:

| Badge | Meaning |
|---|---|
| **✓ works · checked 2 h ago** | A check call succeeded (**used** instead of **checked** when it was a real run). |
| **? listed for you · not checked** | Your key's or CLI's own model list names it; nothing has tried it yet. |
| **? not checked** | Only Slopify's model list names it. |
| **✕ not on your plan** | The provider refused it for your account. The line under the picker quotes the provider's words. |
| **⚠ retiring 30 Nov → replacement** | The model is due to retire; switch before that day. |

Where they come from:

- **Listed for you** comes from free reads: OpenAI, Google, ElevenLabs and OpenRouter list their models for your key, Replicate and fal.ai answer for each model's own page, and each CLI lists its own. Cartesia and Inworld have no such list, so their models stay **not checked** until a check.
- **Check models** (one button per provider) sends each model the smallest request: a one-word reply at the lowest thinking setting, a voice saying "Hi", one small square image. When that costs money it first shows the price at list rates, such as "about $0.04", and nothing is sent until you confirm. A CLI's checks use its plan's allowance instead. Image-to-video models are listed, never checked.
- **Real runs** teach it too: a model a run used is marked as working, and one the provider refuses as not on your plan or not found is marked at once, with the provider's sentence.

Each row shows when that provider was last checked and what its checks have cost so far. A new key starts every row over.

The standings only sort and filter the pickers. A run never asks for them: a model marked **not on your plan** still runs exactly as before if it is chosen.

## Automatic checks

With **Automatic checks** on **Free and near-free checks only** (the default), Slopify reads the key's model list and checks models by itself when you save a key, when a CLI becomes usable, and once a week. It checks only the models you use, ones that already worked and newly listed ones, at most 25 per provider, and only when a check is free, uses a CLI plan, or costs well under a tenth of a cent. Image checks never run by themselves. **Off** leaves checks to **Check models**; the free model-list reads still run when a picker opens.

## New for you

Models that start working for you after the first check appear under **New for you**, newest first, and Home shows a line such as "2 new models work for you" that opens this page. Choose one in a picker to try it, or **Dismiss** it.

## Pick models on Play

On Play, each provider row has a model picker fed by the catalogue (or by the CLI for command-line tools):

- By default it shows the models that work for you, plus the one already chosen, whatever its standing. Until something works for you it shows the listed models, then every known one, so the list is never empty. **Show all** brings back the rest.
- The line under the picker says what is known about the chosen model, with **Check** (or **Check models** before anything was checked), which shows the price first when there is one.
- The refresh button (**Refresh models**) asks the provider for its current list.
- **Custom ID** lets you type a model ID the list does not show; **Use list** goes back.
- **Thinking** (text) or **Effort** (images) appears only when the model offers levels. **Model default** leaves it to the provider.

See [Play-Overview](Play-Overview) and the Play pages for each step.

## Related pages

- [Providers-and-Keys](Providers-and-Keys)
- [AI-CLIs](AI-CLIs)
- [Costs-and-Run-Cost](Costs-and-Run-Cost)
- [Templates](Templates)
- [Schedules](Schedules)
- [Settings-Reference](Settings-Reference)
