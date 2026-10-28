# Costs and Run Cost

Slopify shows what a run is likely to cost before you start it, what it actually cost once it ran, and, for runs on a command-line plan, what the same work would have cost with API keys and how much of your plan it used. All figures are in US dollars, from the services' published prices.

**Where to find it:** Create → **Estimated cost** in the rail; a project → the cost line under its status list, and **See the breakdown**; Home → **This week**; Settings → **Usage**.

## Where costs come from

- Every successful call to a service is recorded against its project with what it used: tokens in and out (and how many were cached) for text, characters for narration, images per model, seconds of animated video, and how long the call took.
- Each call is priced when it finishes, from the model catalogue (see [Models](Models)). The rates are stored with the call, so a later price change never rewrites a finished run.
- A model the catalogue has no price for, or a call whose service reported no usage, is counted as unknown, never as free. Per-minute voices are left unpriced rather than guessed.
- Failed calls are not charged here. Taxes and credits included in your plan with a service are not counted.

Each service bills you directly; Slopify never handles payment. The figures are for planning and checking, not a bill.

## Command-line runs: $0 on your plan

Claude Code, Codex and Gemini bill your subscription, not per call. So their calls show as **$0 on your plan**. Beside that, Slopify shows what the same tokens would have cost through the API ("via API"), priced as the same model from the catalogue: Claude models as Anthropic's, Codex models as OpenAI's, Gemini models as Google's.

There is no API figure for a model the catalogue does not list, for a CLI's default model, or for Codex images. The screens say so ("no API price is listed", "API price unknown").

See [AI-CLIs](AI-CLIs#plan-limits-and-waiting-them-out) for the plan limits themselves.

## Before you start: Estimated cost on Create

The rail on Create shows **Estimated cost** once the setup is complete. Until then it says "Estimated cost: shown once nothing is missing."

| Part | What it shows |
|---|---|
| **Estimated total** | The likely range for this run (or all the runs on the page), for example "$0.42 – $0.61". |
| **Known subtotal** | Shown instead of the total when some stage has no price; a line below says how many stage charges have unavailable pricing. |
| **Cost by stage** | Fold-out list (**Cost by stage · N stages**): each stage's range and what it assumes. A CLI stage reads "$0 on your plan · ~$X via API". |
| CLI steps line | "CLI steps: $0 on your plan · ~$X via API" for everything on a plan. |
| Catalogue date | "Catalogue verified <date>". With several videos, rows show combined costs. |

**Words per video** (in the rail's **Expected length**, with **Change**) drives the estimate for articles the AI writes (and how many images **More images for long videos** adds). About 150 words is one minute. Default: 1500. Once the article is written, its real length is used.

The estimate is what the services are likely to charge, from their published prices. Actual usage can differ, and the estimate does not cap spending.

## The cost line

Under the status list on the project page, one line sums up what the run cost: for example `Cost $0.42 · ~$3.10 via API · 12 min of working time · See the breakdown`.

- While the run goes it reads **Cost so far**, and the title row's clock counts the working time instead.
- **known** after the amount means some calls have no price.
- **~$X via API** is what the calls that ran on a CLI plan would have cost through the API.
- Before anything is spent it reads **Nothing spent yet**.

When a CLI's plan is used up, the run waits instead of failing: the state reads **Waiting for limits**, for example "Waiting for Codex limits (resets at 14:00)". The run carries on by itself when the plan resets.

## The breakdown: the Cost part

1. Open the project from **Projects** or **Home**.
2. Press **See the breakdown** on the cost line.

If nothing has been spent yet, it says "Nothing has been spent yet. The cost of each call to an AI service appears here as the run makes it."

### Summary

The summary shows only what the cost line beside it does not: the total cost and the working time are in the cost line, and again in the last line under the tables. It appears when one of these applies.

| Figure | What it is |
|---|---|
| **same work via API** | The API equivalent of the calls that ran on a CLI plan. |
| Plan meters | One per plan window a CLI reported, for example "3% of weekly Codex limit". Hover or read the line below for the level it is at now. |

Lines under the summary:

- "Plus N calls the model catalogue has no price for.", when some calls have no price.
- "CLI calls: $0 on your plan · ~$1.20 via API", when any call ran on a plan.
- "This run used ~3% of your weekly Codex limit (now at 41%, resets Mon 09:00)." Codex reports whole percents, so a short run can read "under 1%".
- When a CLI reported nothing (Gemini, or a Docker host helper older than the app), it says the share is not known.

### By step

**By step**: what each stage has cost so far, from every call it made to a service, retries and everything made again included.

| Column | What it shows |
|---|---|
| **Step** | Research, Article, Narration, Images, Thumbnail, Video, PDF. |
| **Cost** | What you paid. "$0 on plan" for CLI stages; "Not known" when no call in it has a price; "$0.40 + not known" when some do not. |
| **Via API** | The API equivalent for CLI calls, or "No API price". |
| **Usage** | Tokens in and out (and cached), characters, images, seconds of video. |
| **Working time** | How long the step's work ran, over every run. |

### By model

**By model**: the same spending split by service and model, named as Create names them (for example **Inworld · Inworld TTS-2**), with **Cost**, **Via API**, **Usage** and **Calls**. A CLI model shows the API model it was priced as, in brackets after "as". The CLI's own default model shows as "its default model", and a sample's own services as **Sample artist**, **Sample writer** and so on.

The last lines give the total, for example "In total: $0.42 · 12,400 characters · 9 images · 12 min working, over every run." (with **known** after the amount when some calls have no price), and "Priced from the model catalogue of <date> when each call finished."

## Across all projects: Home → This week

Home's **This week** section, since Monday:

- **videos made**.
- **spent**, followed by "· ~$X via API" and "· N calls without a price" when they apply.
- One bar per CLI plan: how much of its weekly limit is used, from the tool's last reading. The bar turns amber at 80%.

It includes calls that belong to no project: a schedule's topic suggestions, a channel's episode summaries and a cast member's picture. These never appear on a project's cost breakdown. With two or more channels, **Showing:** in Home's header narrows the numbers to one channel. See [Home-and-Projects](Home-and-Projects).

## Your usage totals: Settings → Usage

Settings → **Usage** shows this install's own counters, worked out on this computer from its event log:

| Counter | What it counts |
|---|---|
| **Videos made** | Videos finished. |
| **Hours of narration** | Narration made, in hours. |
| **Images made** | Images drawn. |
| **Tokens used** | Text tokens, in and out. |
| **Projects** | Projects made. |

Below them, **Tokens by stage** lists **Stage**, **Service · model**, **Tokens in** and **Tokens out**. A fresh install says "Numbers appear after your first run." The last line shows the install's machine ID and Slopify version.

The same counters, anonymised, feed the public totals on slopify.stream. They never include your keys, prompts, keywords, titles, text or files.

To jump there, press `Ctrl+K` and run **Open usage and costs**. The old `/usage` address also opens this section.

## Tips

- Set **Words per video** close to what your prompt really writes; it is the biggest lever on the estimate for a generated article.
- Compare the **Via API** column with your plan's price to see whether a subscription or a key is cheaper for how you work.
- If a total says "known cost", check which model has no price in [Models](Models) and add one to your catalogue file if you know it.

## Related pages

- [Models](Models)
- [AI-CLIs](AI-CLIs)
- [Keys and Services](Providers-and-Keys)
- [Create: Extras](Create-Extras)
- [Project-Page](Project-Page)
- [Home-and-Projects](Home-and-Projects)
- [Settings-Reference](Settings-Reference)
