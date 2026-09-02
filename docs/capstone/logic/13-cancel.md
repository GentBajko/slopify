---
scenario: cancel
mockup_row: S11
screens: [08-project]
depends_on: [01-pipeline-lifecycle, 06-research, 07-article-writing, 08-narration, 09-image-generation, 10-thumbnail-prompt-by-llm, 11-video-assembly, 12-reruns-and-edits]
implements: [Q108, Q109, Q110, Q111, Q112, Q113]
generated_date: 2026-09-02
capstone_version: 5.2.0
source: logic-interview.md
---

# 13 Cancel

Stopping a running project: what is aborted, what survives, and how it resumes. Rules cite `logic-interview.md §Q<n>`.

## Trigger & preconditions

- Trigger: Cancel on the header of `mockup/08-project.md`, visible only while the project reads `running` (§Q108).
- Preconditions: at least one stage `running`. Any run counts: a first run or a cascade from scenario 12.
- Actor: the single local user (D1 not in play, §Q113).

## Steps

1. Abort every in-flight call of the project at once: LLM calls and sub-agents, audio chunks, image calls, the video render; nothing waits for a response (§Q109).
2. Keep: every `done` stage's outputs; within a running stage, the pieces already completed (research sub-agents, audio chunks, images, a written thumbnail prompt) for resume (§Q110). Discard: a partial article stream and a partial render file (§Q110).
3. Mark each `running` stage `canceled` with reason "canceled by user"; `pending` stages stay `pending`; the project reads `canceled` (§Q111; scenario 01 step 7).
4. A second click is a no-op (§Q108).
5. Retry on a `canceled` stage resumes exactly like a `failed` one (scenario 01 §Q5 and the per-stage resume rules), returns the project to `running`, and the cascade continues (§Q111).
6. Telemetry counts only calls that completed before the abort; aborted calls contribute nothing (§Q112).

## Branches

- Cancel during a cascade (scenario 12) → same rules; the stages the cascade had not reached stay `pending` (§Q111).
- A stage whose output was stored in the same instant as the cancel stays `done`; cancel never rolls back a stored output (§Q113).

## Unhappy paths

- Abort of a call cannot be confirmed (connection already gone) → the stage is still marked `canceled`; any late response is discarded (§Q109).
- Process dies during cancel → on next start the stages are found `running` or `canceled`; `running` ones become `failed` "interrupted" per scenario 01; both resume by Retry.

## State transitions

- Stage: `running` → `canceled`; `canceled` → `running` on Retry (§Q111; added to scenario 01's table).
- Project: `running` → `canceled` → `running` on Retry (scenario 01 step 7).

## Invariants

- No provider call of the project continues after cancel returns (§Q109, §Q113).
- A canceled project never resumes on its own (§Q111).
- After cancel completes no stage of the project is `running` (§Q111).

## Outcomes & side effects

- The project sits `canceled` with its kept outputs downloadable; Retry per stage is available (§Q111).
- Partial files discarded; kept pieces remain in the project's storage (scenario 14).
- Telemetry: completed calls only (§Q112).

## Dimensions not in play

- D1 authority: one local actor (§Q113).
- D4 computation: nothing computed (§Q113).
- D5 money: nothing charged in-app (§Q113).
- D6 limits: none (§Q113).
- D7 time: nothing scheduled or expiring (§Q113).
- D13 notification: no channel (§Q113).
- D14 effects on others: other projects are untouched (§Q113).
