---
scenario: promise-check
screens:
- 02-play
- 03-project
- 04-prompts
depends_on:
- 04-run-admission
- 12-reruns-and-edits
- 15-prompt-management
- 18-cost-review-batch
- 23-review-checkpoints
- 33-automatic-reviews
- 45-mcp-agent-access
generated_at_commit: d6a72d6428ff
generated_date: 2026-10-18
capstone_version: 7.0.1
content_hash: 9e2a6d03f1b8
paths_covered:
  - ":(top)packages/app/src/slices/reviews/**"
  - ":(top)packages/app/src/slices/rebuild/review-promise.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-reviews.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-review.ts"
  - ":(top)packages/app/src/slices/rebuild/recovery-selection.ts"
  - ":(top)packages/app/src/slices/template-studio/reviews-path.ts"
  - ":(top)packages/app/src/kernel/db/migrations/0065-promise-and-assistant-reviews.sql"
  - ":(top)packages/web/src/play/reviews.tsx"
  - ":(top)packages/web/src/project/review-verdict.tsx"
  - ":(top)packages/web/src/project/body-article.tsx"
---

# 49 The promise check

A sixth automatic review stage, **Promise check (before narration)**. After the article is written and before anything is voiced, the reviewer reads the video's title, the thumbnail's brief and the article's first 30 seconds as the voice will say them, and fails an opening that is a slow preamble, greets the viewer before the subject, is about something other than the title, or promises what the rest of the article never delivers. It is the cheap call (one LLM call over text) that stands in front of the expensive ones (the narration and the pictures). It is a stage of the review machinery in 33-automatic-reviews.md and follows its rules for modes, redo, overrule, the hold while a redo waits and the External agent reviewer; this chapter records what is specific to it. Paths starting `slices/`, `edge/`, `kernel/` are under `packages/app/src/`.

## Trigger & preconditions

- Set per project as `config.reviews.stages.promise = { mode, prompt? }` with mode `off` (default), `flag` or `redo` (`slices/reviews/model.ts:12-19`, `:76-83`), in Play's Reviews section and Edit project → Reviews, which share one form. The row reads "Promise check (before narration)" with an info button, sits second in run order after the article's own review (`reviewStagesInRunOrder`, `slices/reviews/model.ts:21-29`; `packages/web/src/play/reviews.tsx:185-202`), and has the same mode picker and Review prompt picker as the others.
- The stage makes items only while the article is written by a model: `sources.article === "generate"` (`stageMakesItems`, `slices/reviews/rules.ts:23-29`). With a provided article its row is disabled with "Needs an article a model writes: set Article to Generate to use it." and a saved `promise` entry is dropped from the settings, as any stage that makes nothing is (`packages/web/src/play/reviews.tsx:241-245`, `slices/reviews/model.ts:160-191`, `slices/reviews/rules.ts:41-45`).
- Any text reviewer is enough: `promise` is not a vision stage, so it asks for no picture-capable reviewer and does not add to Play's picture-reviewer rule (`visionStages`, `slices/reviews/model.ts:92`; `slices/reviews/rules.ts:62-91`). With the External agent reviewer no reviewer model is asked for either (33-automatic-reviews.md).
- The built-in prompt is `defaultReviewPrompts.promise` (`slices/reviews/model.ts:235-236`); a Library Review prompt may replace it and is rendered under `review.promise` (`reviewPromptKey`, `slices/reviews/model.ts:112-114`, `slices/library/slots.ts:110-118`).
- Database: the stage name is allowed by the `CHECK` on `review_verdicts.stage` and `external_reviews.stage`, widened by migration 0065, which copied both tables because SQLite cannot change a `CHECK` in place (`kernel/db/migrations/0065-promise-and-assistant-reviews.sql:1-58`).

## Steps

1. **Planning** (`withReviews`, `slices/rebuild/recipe-reviews.ts:34-117`): with the stage active and a model-written article (`article:body`, a provider step), one review step `review:promise` is added (`reviewKey(promiseItemKey)`; item key `promise`, `slices/reviews/model.ts:119-124`). Its inputs are the article and, when a model writes the thumbnail's brief, the step `thumbnail:prompt`, so a new article or a new brief makes it a different step (`slices/rebuild/recipe-reviews.ts:133-143`). A Library prompt's own dependencies join its `dependsOn` (`:53-59`). Like every review it is the local operation `review-v1` marked as a provider call, so readiness, the charge warning and the estimate count it; with the External agent reviewer it is `review-agent-v1` with no charge (`:61-104`). It is planned in the Article stage (`stageOf`, `:176-190`).
2. **Gating before the narration**: its gate is `article:body` itself, so every step that lists the article among its dependencies waits for `review:promise` as well as for the article review, the narration's audio steps among them (`:106-115`). A step the review itself reads, such as the thumbnail's brief (`thumbnail:prompt`), does not wait for it (`upstream`, `:192-204`). Nothing downstream of the article is voiced until the reviewer has answered (`slices/rebuild/recipe-reviews.test.ts:168-195`). The article's own review is gated the same way and the two run side by side; they are separate items (`article:body` and `promise`), with separate verdicts, attempts and badges (`slices/reviews/model.ts:119-121`).
3. **A template studio sample** shows how each stage's review answers on its first item only, so the promise check, which has one item, is kept whole there (`slices/rebuild/recipe-reviews.ts:42-47`; 46-template-studio.md).
4. **Material** (`reviewMaterial`, `slices/rebuild/runtime-review.ts:240-259`): the selected article output is read; the article is turned into what the voice will say (`spokenArticle`: the body without end matter, Markdown removed, narration-normalised, `slices/rebuild/review-promise.ts:10-14`), and `openingOf` cuts it after the words said in the first 30 seconds at the planner's 150 words a minute, 75 words, keeping the text's own line breaks (`promiseOpeningSeconds`, `slices/rebuild/review-promise.ts:6-31`, `slices/images/scale.ts:46`). Sections, in order: "Video title" (the project's title), "Thumbnail brief" (the prompt of the thumbnail's image step when it has one, clipped), "Opening (first ~30 s)" and "Whole article" (clipped at 60,000 characters with "[... cut for length]"). No pictures are attached: the drawn thumbnail is made after the narration, so only its brief can be read (`slices/rebuild/runtime-review.ts:47`, `:373-375`). The item fingerprint is the article's, so a verdict about an article since replaced is hidden (`reviewedOutputKey`, `slices/reviews/view.ts:6-11`).
5. **The question** is the instruction (the Library prompt, else the built-in one) followed by the material as data, never instructions (`slices/reviews/verdict.ts:52`). The built-in instruction: pass when the first 30 seconds start delivering what the title and thumbnail promise and give the viewer a reason to keep watching; fail when the opening is a slow preamble, greets the viewer or talks about the channel before the subject, is about something other than the title, or promises something the article never delivers; when failing, name the sentence from the article that should come first (`slices/reviews/model.ts:235-236`).
6. **Execution, verdict and outcome** are Step 5 of 33-automatic-reviews.md unchanged: one LLM call on the reviewer with web search off, a strict `{"verdict","reasons"}` answer, attempt number from the item's earlier verdicts, outcome `passed`, `flagged`, or `redo` while `attempt <= retries` (default 2) (`slices/rebuild/runtime-review.ts:53-130`).
7. **Redo** sends the article back: the redo target of item `promise` is the Article section, like More → Write the article again, because the opening is what broke the promise; the new article gets a new promise review at attempt + 1, and everything behind it stays held while a redo is pending (`slices/rebuild/recovery-selection.ts:58-60`; hold and automatic redo, 33-automatic-reviews.md Steps 6-7). A redo costs the article again plus one more review; the estimate does not price it (`slices/estimate/index.ts:441-460`).
8. **Estimate**: one "Reviews" request on the reviewer model per run, material taken as the article's characters + 1,500 (the other stages use 1,500, the article review the article + prompt), output 400 characters, with the note that redos are not in the estimate (`slices/estimate/index.ts:441-460`).
9. **Project page**: under the article's own review, a second verdict reads "Promise check" with the usual chip (Review passed, Flagged, Passed by agent, Passed without review …), its reasons and the Overrule and Redo buttons (`packages/web/src/project/body-article.tsx:165-175`, `packages/web/src/project/review-verdict.tsx:188-199`). Flagged notices name the item "the article's opening (promise check)" (`slices/notifications/rules.ts:67`, `:87`).
10. **Reviews path** in the Template Studio: the sample's path lists "The opening's promise" between "Script" and the narration checkpoint, answered by the reviewer model or by the agent (`slices/template-studio/reviews-path.ts:15-42`).
11. **By an agent**: a `promise` review under the External agent reviewer waits like any other (`get_external_review`, `submit_review_verdict`), carries the same material, and auto-passes after two hours (33-automatic-reviews.md Steps 12-17). The assistant never answers it: an external review's verdict is the agent's or the person's (`edge/http/external-reviews.ts:77-87`).

## Branches

- Article provided, not generated → the stage makes nothing, its row is disabled, no step is planned (Step 1; `slices/reviews/rules.ts:23-29`).
- Thumbnail brief written by a model → `thumbnail:prompt` is a second input; the brief is read from the thumbnail image step's prompt in the material and omitted when it has none (`slices/rebuild/recipe-reviews.ts:136-143`, `slices/rebuild/runtime-review.ts:247-248`).
- Mode `flag` → a failure is kept and flagged for a decision; mode `redo` → the article is written again while retries last (33-automatic-reviews.md Step 5).
- Only the article review on, only the promise check on, or both: each is its own item and gates the same steps (Step 2).
- A very short article → `openingOf` returns the whole article; an empty one returns an empty opening (`slices/rebuild/review-promise.test.ts:20-24`).
- External agent reviewer → `review-agent-v1`, no estimate line beyond "An external agent answers each review through MCP; no API fee." (`slices/estimate/index.ts:439-440`).

## Unhappy paths

- The article is missing on disk or not selected → the step throws "The article this review looks at is missing, so it could not be reviewed. Use More → Write the article again in the Article section, then use Try again." (`slices/rebuild/runtime-review.ts:206-209`, `:244-245`).
- A malformed verdict, a failed provider call and a refused automatic redo behave as in 33-automatic-reviews.md (Unhappy paths); the promise check adds no case of its own.

## State transitions

- `review_verdicts` rows with `stage = 'promise'`, `item_key = 'promise'`: the same table and transitions as 33-automatic-reviews.md; `action_by` may also be `assistant` since migration 0065, for an Overrule or Redo made through the in-app assistant (`kernel/db/migrations/0065-promise-and-assistant-reviews.sql:6-24`).
- A verdict is current while the article output it read is the selected one; a new article makes it stale and the new review starts again (`slices/reviews/view.ts:6-11`).

## Invariants

- No step that depends on the article runs before the promise review has answered, so no narration is paid for an opening the reviewer failed for redo (`slices/rebuild/recipe-reviews.ts:106-115`).
- The promise check reads text only and never attaches a picture (`slices/rebuild/runtime-review.ts:249-258`).
- Its verdict is its own: a passed article review never stands in for it and the reverse (`slices/reviews/model.ts:119-121`, `slices/reviews/view.ts:6-11`).
- A project saved before the stage existed keeps its settings and its steps: the stage is last in `reviewStages`, so no saved list changes its order (`slices/reviews/model.ts:9-19`).

## Outcomes & side effects

- A `review:promise` step per run that turns it on, one reviewer call per attempt; verdicts in `review_verdicts`, events and notices as for any review (`review.flagged`, "Review needs a decision: <title> — <reason>"; 33-automatic-reviews.md).
- A redo writes a new article version; the narration and the pictures wait for the new answer.

## Recorded differences from the feature spec

- Specified as a check "before the paid narration"; shipped as a review stage whose step gates every step that depends on the article, not only the narration.
- The thumbnail the viewer will see is not part of the check; only its brief is read (the drawn thumbnail is made later).
- Specified as one cheap call; shipped as one call per attempt, retried by redo up to the stage's retries, and the redo's article cost is not estimated.

## Dimensions not in play

- D1 Authority: one local user; the person and an agent have the same powers, only the attribution differs.
- D5 Money: one text call per attempt on the reviewer model; a redo adds the article again.
- D7 Time: an External agent review waits two hours then passes; a flagged item waits indefinitely.
- D13 Notification: the review's flagged notice only (33-automatic-reviews.md).
