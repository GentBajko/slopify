---
scenario: thumbnail-prompt-by-llm
mockup_row: S16
screens: [06-play, 08-project]
depends_on: [01-pipeline-lifecycle, 02-provider-credentials, 03-placeholder-substitution, 04-run-admission, 07-article-writing, 09-image-generation]
generated_date: 2026-09-02
capstone_version: 5.2.0
---

# 10 Thumbnail prompt by LLM

A thumbnail mode where the LLM writes the image-generator prompt from the filled thumbnail template and the article, then scenario 09 makes the image.

## Trigger & preconditions

- Trigger: scenario 01 step 4 starts the thumbnail stage when its source is Prompt by LLM and the article is `done` or `provided`.
- Play control for the thumbnail: Off / From prompt / Prompt by LLM / Provide. Both Generate modes require a selected thumbnail prompt; Prompt by LLM also requires the LLM provider and model on Play (amends scenario 04 step 2).
- Preconditions: image provider keyed and model chosen (scenarios 02, 04); the thumbnail prompt rendered per scenario 03; the plain-text article on the project (scenario 05 or 07).
- Actor: none beyond the pipeline.

## Steps

1. Compose the LLM message: the filled thumbnail prompt as the instruction, then the video title, the keyword values, the run's aspect (16:9 or 9:16), and the full plain-text article. The run's LLM provider and model are used.
2. Call the LLM once; the response is one plain-text image prompt.
3. Store the written prompt on the project as the thumbnail's prompt text, with the messages sent; the project page shows it beside the thumbnail.
4. Send the written prompt to the image provider once, per scenario 09's thumbnail rules: aspect-sized, stored apart from the slideshow, with prompt text, provider, and model.
5. Mark the thumbnail stage `done`.

## Branches

- Thumbnail source: Off → skipped; From prompt → scenario 09 step 4; Prompt by LLM → this scenario; Provide → scenario 05.
- Written prompt already stored when a retry starts → skip to step 4.

## Unhappy paths

- LLM call fails → scenario 01's retry policy; empty output is a failed attempt.
- Image call fails → scenario 09's rules: retries with the 300 s timeout, refusal fails immediately without retries.
- Either failure → the thumbnail stage fails on its own; audio and images unaffected; video waits (scenario 01 step 5).
- Manual retry → reuses the stored written prompt and redoes only the image call.
- Interrupted process → stage failed "interrupted" (scenario 01); a stored written prompt is kept.
- Cancel → scenario 13.

## State transitions

- Thumbnail stage: per scenario 01.
- Sub-steps persisted for resume: prompt-written, image-done.

## Invariants

- The image prompt sent is exactly the LLM's output, never edited by the app; user edits are scenario 12's.
- The thumbnail is never in the slideshow (scenario 09).
- The stage never starts without an article on the project.

## Outcomes & side effects

- Success: the thumbnail image and its LLM-written prompt on the project.
- Failure: stage `failed` with the provider's error, refusal, or "empty output" text (scenario 01).
- Tokens used and the image made are counted by scenario 16 telemetry.

## Dimensions not in play

- D1 authority: no actor beyond the pipeline.
- D4 computation: nothing computed.
- D5 money: nothing charged in-app.
- D6 limits: none; one LLM call and one image call.
- D13 notification: no channel.
