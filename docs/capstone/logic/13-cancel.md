---
scenario: cancel
mockup_row: S11
screens: [08-project]
depends_on: [01-pipeline-lifecycle, 06-research, 07-article-writing, 08-narration, 09-image-generation, 10-thumbnail-prompt-by-llm, 11-video-assembly, 12-reruns-and-edits]
generated_date: 2026-09-02
capstone_version: 5.2.0
---

# 13 Cancel

Stopping a running project: what is aborted, what survives, and how it resumes.

## Trigger & preconditions

- Trigger: Cancel on the header of `mockup/08-project.md`, visible only while the project reads `running`.
- Preconditions: at least one stage `running`. Any run counts: a first run or a cascade from scenario 12.
- Actor: the single local user.

## Steps

1. Abort every in-flight call of the project at once: LLM calls and sub-agents, audio chunks, image calls, the video render; nothing waits for a response.
2. Keep: every `done` stage's outputs; within a running stage, the pieces already completed (research sub-agents, audio chunks, images, a written thumbnail prompt) for resume. Discard: a partial article stream and a partial render file.
3. Mark each `running` stage `canceled` with reason "canceled by user"; `pending` stages stay `pending`; the project reads `canceled` (scenario 01 step 7).
4. A second click is a no-op.
5. Retry on a `canceled` stage resumes exactly like a `failed` one (scenario 01 and the per-stage resume rules), returns the project to `running`, and the cascade continues.
6. Telemetry counts only calls that completed before the abort; aborted calls contribute nothing.

## Branches

- Cancel during a cascade (scenario 12) → same rules; the stages the cascade had not reached stay `pending`.
- A stage whose output was stored in the same instant as the cancel stays `done`; cancel never rolls back a stored output.

## Unhappy paths

- Abort of a call cannot be confirmed (connection already gone) → the stage is still marked `canceled`; any late response is discarded.
- Process dies during cancel → on next start the stages are found `running` or `canceled`; `running` ones become `failed` "interrupted" per scenario 01; both resume by Retry.

## State transitions

- Stage: `running` → `canceled`; `canceled` → `running` on Retry (added to scenario 01's table).
- Project: `running` → `canceled` → `running` on Retry (scenario 01 step 7).

## Invariants

- No provider call of the project continues after cancel returns.
- A canceled project never resumes on its own.
- After cancel completes no stage of the project is `running`.

## Outcomes & side effects

- The project sits `canceled` with its kept outputs downloadable; Retry per stage is available.
- Partial files discarded; kept pieces remain in the project's storage (scenario 14).
- Telemetry: completed calls only.

## Dimensions not in play

- D1 authority: one local actor.
- D4 computation: nothing computed.
- D5 money: nothing charged in-app.
- D6 limits: none.
- D7 time: nothing scheduled or expiring.
- D13 notification: no channel.
- D14 effects on others: other projects are untouched.
