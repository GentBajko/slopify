---
absorbed_from: features/2026-09-09-pausable-optional-runs@2026-09-10
scenario: cancel
mockup_row: S11
screens: [08-project]
depends_on: [01-pipeline-lifecycle, 06-research, 07-article-writing, 08-narration, 09-image-generation, 10-thumbnail-prompt-by-llm, 11-video-assembly, 12-reruns-and-edits]
generated_date: 2026-09-09
capstone_version: 5.2.0
---

# 13 Pause, resume and cancel

Stopping a running project: what is aborted, what survives, and how it resumes.

## Pause and resume

Pause is available while a run is pending or running. It persists a pause flag before aborting active provider calls and local exports, waits for them to drain, and returns interrupted stages to pending. Completed outputs, research chapters, narration chunks, images and generated text checkpoints survive. Partially streamed text and partial exports are discarded. No new work is claimed while paused, including after app restart.

Resume clears the pause, resets failed/canceled stages and schedules unfinished work together. Repeated pause/resume requests are idempotent and serialized per project. Paused and failed projects allow provider changes under scenario 12; saving choices does not resume. The header presents a distinct Paused state while stage rows keep their individual progress.

## Cancel trigger & preconditions

- Trigger: Cancel on the header of `mockup/08-project.md`, visible only while the project reads `running`.
- Preconditions: at least one stage `running`. Any run counts: a first run or a cascade from scenario 12.
- Actor: the single local user.

## Steps

1. Abort every in-flight call of the project at once: LLM calls and sub-agents, audio chunks, image calls, the video render; nothing waits for a response.
2. Keep: every `done` stage's outputs; within a running stage, the pieces already completed (research sub-agents, audio chunks, images, a written thumbnail prompt) for resume. Discard: a partial article stream and a partial render file.
3. Mark interrupted running stages canceled with reason "canceled by user". If every active stage finishes during the abort, mark remaining pending work canceled so the run cannot appear done or resume implicitly. Finished stages stay done. Canceling a paused project clears its pause and marks unfinished pending work canceled.
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
