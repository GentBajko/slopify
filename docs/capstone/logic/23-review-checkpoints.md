---
absorbed_from:
  - features/2026-09-10-review-checkpoints@2026-09-13
scenario: review-checkpoints
mockup_row: S8
screens:
  - 06-play
  - 08-project
depends_on:
  - 01-pipeline-lifecycle
  - 04-run-admission
  - 12-reruns-and-edits
generated_date: '2026-09-13'
generated_at_commit: 803bd5555d76
content_hash: 942b3c2747be
paths_covered:
  - :(top)packages/app/src/slices/checkpoints/**
  - :(top)packages/app/src/kernel/runner/**
  - :(top)packages/app/src/edge/http/checkpoints.ts
  - :(top)packages/web/src/project/checkpoint-*.tsx
  - :(top)packages/web/src/play/checkpoints.tsx
---

# 23 Review checkpoints

Review checkpoints hold a selected dependency branch until the user explicitly approves its exact project revision and input fingerprint. Independent work continues.

## Trigger & preconditions

Play may select checkpoints before Audio, Images or Video/export. Article remains required. Existing projects may add or remove a gate while its selected stage is pending and its work has not submitted. A saved edit never approves or dispatches work.

## Steps

1. Review resolves each selected stage to its transitive recipe closure and stores immutable gate/work identities with the Start admission.
2. The runner checks the current reservation's work key immediately before claim. A held gate blocks only its closure; unrelated reservations remain eligible.
3. The project page displays each gate, dependents, revision identity and current fingerprint status. The user approves with the exact revision, fingerprint and idempotency key.
4. Approval is committed transactionally, wakes the runner after commit and can be replayed from its durable receipt. Save, add/remove and reload remain separate from approval and rebuild.

## Branches

- A canceled, stale, unknown or mismatched gate returns a typed conflict without provider work.
- A selected stage may already be complete when a dependent closure invocation remains pending; approval is still allowed for that outstanding closure.
- A gate-free project can add a gate after a title-only Save, including when all pending reservations retain an older origin revision.
- Removing a gate while paused does not prevent Resume when admitted work remains; removing the last gate releases only that branch's hold.
- Retired, unsubmitted materialization placeholders do not count as a started stage. Submitted/running/done pieces still do.
- Multiple tabs reconcile the displayed revision and gate-set identity before saving local choices; a changed set requires explicit reload.

## Unhappy paths

Missing snapshots or invalid catalogues are logged with project and stage only, then become a typed conflict. Legacy admission routes reject checkpoint-bearing requests instead of silently dropping choices. A lost approval response replays its receipt; a different identity conflicts. Restart restores held/released state and keeps late work bound to its origin revision.

## State transitions

`pending-review`/`held` → `released` on an exact approval; `released` → `satisfied` when its closure settles; an affected Save invalidates a held/reviewed gate and carries unchanged approvals to the new immutable revision. Removal deletes the gate and resumes its unsubmitted reservations.

## Invariants

Approval names project, current revision, checkpoint and fingerprint. Only reserved work keys in that closure are held. Queue limits, project Pause/Resume and provider attempt idempotency remain authoritative. No provider call occurs during setup, Save, Review, gate changes or status reads.

## Outcomes & side effects

Checkpoint rows, approval receipts and gate identities persist in SQLite. Release emits a scoped project update and wakes one runner tick after commit. Status and problems contain no provider credentials or private input text.

## Dimensions not in play

Reusable templates, schedules, automatic approval, arbitrary timeline editing and new provider integrations remain separate work.
