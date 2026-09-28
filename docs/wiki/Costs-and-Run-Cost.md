# Costs and Run Cost

Slopify shows what a run is likely to cost before you start it, what it actually cost once it ran, and, for runs on a command-line plan, what the same work would have cost with API keys and how much of your plan it used. All figures are in US dollars, from the providers' published prices.

**Where to find it:** Play → **Estimated cost** in the right rail; a project → **Run cost** tab; Home → **This week**; Settings → **Usage**.

## Where costs come from

- Every successful provider call is recorded against its project with what it used: tokens in and out (and how many were cached) for text, characters for narration, images per model, seconds of animated video, and how long the call took.
- Each call is priced when it finishes, from the model catalogue (see [Models](Models)). The rates are stored with the call, so a later price change never rewrites a finished run.
- A model the catalogue has no price for, or a call whose provider reported no usage, is counted as unknown, never as free. Per-minute voices are left unpriced rather than guessed.
- Failed calls are not charged here. Taxes and credits included in your provider plan are not counted.

Your provider bills you directly; Slopify never handles payment. The figures are for planning and checking, not a bill.

## Command-line runs: $0 on your plan

Claude Code, Codex and Gemini bill your subscription, not per call. So their calls show as **$0 on your plan**. Beside that, Slopify shows what the same tokens would have cost through the API ("via API"), priced as the same model from the catalogue: Claude models as Anthropic's, Codex models as OpenAI's, Gemini models as Google's.

There is no API figure for a model the catalogue does not list, for a CLI's default model, or for Codex images. The screens say so ("no API price is listed", "API price unknown").

See [AI-CLIs](AI-CLIs#plan-limits-and-waiting-them-out) for the plan limits themselves.

## Before you start: Estimated cost on Play

The right rail on Play shows **Estimated cost** once the setup is complete. Until then it says "The estimate appears once the setup is complete."

| Part | What it shows |
|---|---|
| **Estimated total** | The likely range for this run (or all the runs on the page), for example "$0.42 – $0.61". |
| **Known subtotal** | Shown instead of the total when some stage has no price; a line below says how many stage charges have unavailable pricing. |
| **Cost by stage** | Fold-out list: each stage's range and what it assumes. A CLI stage reads "$0 on your plan · ~$X via API". |
| CLI steps line | "CLI steps: $0 on your plan · ~$X via API" for everything on a plan. |
| Catalogue date | "Catalogue verified <date>". With several videos, rows show combined costs. |

**Expected article words per video** drives the estimate for generated articles (and how many images **More images for long videos** adds). About 150 words is one minute. Default: 1500. Once the article is written, its real length is used.

The estimate is what the providers are likely to charge, from their published prices. Actual usage can differ, and the estimate does not cap spending.

## While a run is going: Cost so far

On a running project, the side panel shows **Cost so far**:

- **spent**: what has been paid to providers so far ("known, spent" when some calls have no price).
- **same work via API**: the API equivalent of the CLI calls.
- One meter per plan window a CLI reported, such as "Codex: 14% of your weekly limit". The meter turns amber once the plan is at 80% or more.

When a CLI's plan is used up, the run waits instead of failing: the status reads **Waiting for limits**, for example "Waiting for Codex limits (resets at 14:00)". The run carries on by itself when the plan resets.

## After a run: the run cost line

When a run has ended, one line at the top of its project page, under the title, sums it up: for example `This run cost $0.42 · ~$3.10 via API · 12 min of work`. A failed or cancelled run says **Spent so far**, and calls without a known price add "plus unpriced calls". **See cost by stage** opens the full breakdown below. The line doesn't show while the run is going, or when it spent nothing.

## After a run: the Run cost tab

1. Open the project from **Projects** or **Home**.
2. Choose **Cost** in the section rail (or **See cost by stage** on the run cost line).

If nothing has been spent yet, it says "Nothing has been spent yet. The cost of each provider call appears here as the run makes it."

### Summary

| Figure | What it is |
|---|---|
| **paid to providers** | The total cost of this project's calls. Reads "known cost, paid to providers" when some calls have no price, with a line "Plus N calls the model catalogue has no price for." |
| **same work via API** | The API equivalent of the calls that ran on a CLI plan. |
| Plan meters | One per plan window a CLI reported, for example "3% of weekly Codex limit". Hover or read the line below for the level it is at now. |
| **this run's working time** | How long some step of the run was working. Waiting on a review, a limit or a pause never counts, and steps that ran side by side count once. Each save that remakes something starts a new run. |

Lines under the summary:

- "CLI calls: $0 on your plan · ~$1.20 via API", when any call ran on a plan.
- "This run used ~3% of your weekly Codex limit (now at 41%, resets Mon 09:00)." Codex reports whole percents, so a short run can read "under 1%".
- When a CLI reported nothing (Gemini, or a Docker host helper older than the app), it says the share is not known.

### By stage

**Cost by stage**: what each stage has cost so far, from every provider call it made, retries and remakes included.

| Column | What it shows |
|---|---|
| **Stage** | Research, Article, Audio, Images, Thumbnail, Video, Document. |
| **Cost** | What you paid. "$0 on plan" for CLI stages; "Unknown" when no call in it has a price; "$0.40 + unknown" when some do not. |
| **Via API** | The API equivalent for CLI calls, or "No API price". |
| **Usage** | Tokens in and out (and cached), characters, images, seconds of video. |
| **Time** | How long the stage ran. |

### By model

**Cost by model**: the same spending split by provider and model, with **Cost**, **Via API**, **Usage** and **Calls**. A CLI model shows the API model it was priced as, in brackets after "as". The CLI's own default model shows as "default model".

The last lines give the total usage and the working time over every run, and "Priced from the model catalogue of <date> when each call finished."

## Across all projects: Home → This week

Home's **This week** section, since Monday:

- **videos made**.
- **spent**, followed by "· ~$X via API" and "· N calls without a price" when they apply.
- One bar per CLI plan: how much of its weekly limit is used, from the tool's last reading. The bar turns amber at 80%.

It includes calls that belong to no project: a schedule's topic suggestions, a channel's episode summaries and a cast member's picture. These never appear on a project's Run cost tab. The channel picker at the top of Home narrows the numbers to one channel. See [Home-and-Projects](Home-and-Projects).

## Your usage totals: Settings → Usage

Settings → **Usage** shows this install's own counters, worked out on this computer from its event log:

| Counter | What it counts |
|---|---|
| **Videos made** | Videos finished. |
| **Hours of audio** | Narration made, in hours. |
| **Images made** | Images drawn. |
| **Tokens used** | Text tokens, in and out. |
| **Projects** | Projects made. |

Below them, **Tokens by stage** lists **Stage**, **Provider · model**, **Tokens in** and **Tokens out**. A fresh install says "Numbers appear after your first run." The last line shows the install's machine ID and Slopify version.

The same counters, anonymised, feed the public totals on slopify.stream. They never include your keys, prompts, keywords, titles, text or files.

To jump there, press `Ctrl+K` and run **Open usage and costs**. The old `/usage` address also opens this section.

## Tips

- Set **Expected article words per video** close to what your prompt really writes; it is the biggest lever on the estimate for a generated article.
- Compare the **Via API** column with your plan's price to see whether a subscription or a key is cheaper for how you work.
- If a total says "known cost", check which model has no price in [Models](Models) and add one to your catalogue file if you know it.

## Related pages

- [Models](Models)
- [AI-CLIs](AI-CLIs)
- [Providers-and-Keys](Providers-and-Keys)
- [Play-Outputs](Play-Outputs)
- [Project-Page](Project-Page)
- [Home-and-Projects](Home-and-Projects)
- [Settings-Reference](Settings-Reference)
