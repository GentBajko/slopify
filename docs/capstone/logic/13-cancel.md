---
host_cli_verified_at_commit: 9bd6517
absorbed_from:
  - features/2026-09-09-pausable-optional-runs@2026-09-10
  - features/2026-09-24-host-cli-bridge@2026-09-24
scenario: cancel
mockup_row: S11
screens: [08-project]
depends_on: [01-pipeline-lifecycle, 06-research, 07-article-writing, 08-narration, 09-image-generation, 10-thumbnail-prompt-by-llm, 11-video-assembly, 12-reruns-and-edits]
generated_date: '2026-09-13'
generated_at_commit: 7bdb84e3f57e
capstone_version: 5.2.0
paths_covered:
  - :(top)packages/app/src/slices/control/**
  - :(top)packages/app/src/kernel/runner/**
  - :(top)packages/app/src/main.ts
  - :(top)packages/web/src/project/**
content_hash: 007fd8cd8012
---

# 13 Pause, resume and cancel

Stopping a running project: what is aborted, what survives, and how it resumes.

## Trigger & preconditions

Pause is available while project work is pending or running. It persists the pause before aborting active provider calls and local exports, waits for them to drain, and returns interrupted stages to pending. Completed outputs and physical pieces survive; partially streamed text and partial exports do not become finished outputs (`packages/app/src/slices/control/index.ts:1`, `packages/app/src/kernel/runner/index.ts:1`).

Resume clears the pause and schedules eligible unfinished work. Repeated pause/resume requests are idempotent and serialized per project. Paused and failed projects allow revision/provider edits under scenario 12; saving choices does not resume (`packages/app/src/slices/control/revision-control.ts:1`, `packages/web/src/project/project-controls.tsx:1`).

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

- Host CLI calls: abort, disconnect, attempt deadline and consumer abandonment close the matching connection and abort only that host operation. The reused adapter terminates its process group and removes its private workspace; helper generation slots remain occupied until cleanup and response completion. Concurrent unrelated jobs remain alive (`packages/app/src/edge/http/host-cli.ts:134`, `packages/app/src/host-cli/runtime.ts:40`, `packages/app/test/host-cli-e2e.test.ts:243`).
- Host LLM idle limit is 120 seconds, reset by actual activity only; image total limit is 300 seconds. Helper shutdown closes admissions, aborts active jobs and allows five seconds before service control-group cleanup. Connection uncertainty remains terminal unavailable even when an app deadline expires concurrently; explicit user cancellation remains canceled. There is no automatic transport replay (`packages/app/src/host-cli/server.ts:49`, `packages/app/src/kernel/runner/attempt.ts:146`).

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
- D6 limits: queue and provider limits remain unchanged.
- D7 time: a recurring schedule's own pause/resume state is handled by the schedule service, not the project control (`packages/app/src/slices/schedules/service.ts:110`).
- D13 notification: no channel.
- D14 effects on others: other projects are untouched.
