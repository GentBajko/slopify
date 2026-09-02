---
scenario: thumbnail-prompt-by-llm
mockup_row: S16
screens: [06-play, 08-project]
depends_on: [01-pipeline-lifecycle, 02-provider-credentials, 03-placeholder-substitution, 04-run-admission, 07-article-writing, 09-image-generation]
implements: [Q35, Q78, Q79, Q80, Q81, Q82, Q83]
generated_date: 2026-09-02
capstone_version: 5.2.0
source: logic-interview.md
---

# 10 Thumbnail prompt by LLM

A thumbnail mode where the LLM writes the image-generator prompt from the filled thumbnail template and the article, then scenario 09 makes the image. Added at `logic-interview.md §Q35`. Rules cite `logic-interview.md §Q<n>`.

## Trigger & preconditions

- Trigger: scenario 01 step 4 starts the thumbnail stage when its source is Prompt by LLM and the article is `done` or `provided`.
- Play control for the thumbnail: Off / From prompt / Prompt by LLM / Provide (§Q78). Both Generate modes require a selected thumbnail prompt; Prompt by LLM also requires the LLM provider and model on Play (§Q81; amends scenario 04 step 2).
- Preconditions: image provider keyed and model chosen (scenarios 02, 04); the thumbnail prompt rendered per scenario 03; the plain-text article on the project (scenario 05 or 07).
- Actor: none beyond the pipeline (D1 not in play, §Q83).

## Steps

1. Compose the LLM message: the filled thumbnail prompt as the instruction, then the video title, the keyword values, the run's aspect (16:9 or 9:16), and the full plain-text article (§Q78, §Q79). The run's LLM provider and model are used (§Q81).
2. Call the LLM once; the response is one plain-text image prompt (§Q80).
3. Store the written prompt on the project as the thumbnail's prompt text, with the messages sent; the project page shows it beside the thumbnail (§Q80).
4. Send the written prompt to the image provider once, per scenario 09's thumbnail rules: aspect-sized, stored apart from the slideshow, with prompt text, provider, and model (§Q80).
5. Mark the thumbnail stage `done`.

## Branches

- Thumbnail source: Off → skipped; From prompt → scenario 09 step 4; Prompt by LLM → this scenario; Provide → scenario 05.
- Written prompt already stored when a retry starts → skip to step 4 (§Q82).

## Unhappy paths

- LLM call fails → scenario 01's retry policy; empty output is a failed attempt (§Q82).
- Image call fails → scenario 09's rules: retries with the 300 s timeout, refusal fails immediately without retries (§Q82).
- Either failure → the thumbnail stage fails on its own; audio and images unaffected; video waits (scenario 01 step 5).
- Manual retry → reuses the stored written prompt and redoes only the image call (§Q82).
- Interrupted process → stage failed "interrupted" (scenario 01); a stored written prompt is kept.
- Cancel → scenario 13.

## State transitions

- Thumbnail stage: per scenario 01.
- Sub-steps persisted for resume: prompt-written, image-done (§Q82).

## Invariants

- The image prompt sent is exactly the LLM's output, never edited by the app; user edits are scenario 12's (§Q83).
- The thumbnail is never in the slideshow (scenario 09 §Q72).
- The stage never starts without an article on the project (§Q79).

## Outcomes & side effects

- Success: the thumbnail image and its LLM-written prompt on the project (§Q80).
- Failure: stage `failed` with the provider's error, refusal, or "empty output" text (scenario 01, §Q82).
- Tokens used and the image made are counted by scenario 16 telemetry.

## Dimensions not in play

- D1 authority: no actor beyond the pipeline (§Q83).
- D4 computation: nothing computed (§Q83).
- D5 money: nothing charged in-app (§Q83).
- D6 limits: none; one LLM call and one image call (§Q83).
- D13 notification: no channel (§Q83).
