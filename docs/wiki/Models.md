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

**Check all** in Settings → Providers also reports retired models under **Chosen models**. See [Providers-and-Keys](Providers-and-Keys#check-all-providers).

## When a run reaches a model that is gone

If a run starts a step whose model is no longer in the list, it stops with a message such as "The chosen … model is no longer in Slopify's model list." Open the project, choose **Edit project**, change the model under Providers, then use **Continue the run**. See [Recovery-and-Retries](Recovery-and-Retries).

## Pick models on Play

On Play, each provider row has a model picker fed by the catalogue (or by the CLI for command-line tools):

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
