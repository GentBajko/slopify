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
generated_at_commit: e9226a34aa8a
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: 87f10924b719
paths_covered:
  - ":(top)packages/app/src/slices/checkpoints/**"
  - ":(top)packages/app/src/slices/rebuild/runtime-checkpoints.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-checkpoints.ts"
  - ":(top)packages/app/src/slices/play-drafts/review-inputs.ts"
  - ":(top)packages/app/src/slices/revisions/mutations.ts"
  - ":(top)packages/app/src/slices/revisions/restore.ts"
  - ":(top)packages/app/src/slices/cancel/index.ts"
  - ":(top)packages/app/src/slices/schedules/agenda.ts"
  - ":(top)packages/app/src/slices/notifications/rules.ts"
  - ":(top)packages/app/src/kernel/runner/checkpoint-authority.ts"
  - ":(top)packages/app/src/kernel/runner/index.ts"
  - ":(top)packages/app/src/kernel/db/migrations/0007-review-checkpoints.sql"
  - ":(top)packages/app/src/edge/http/checkpoints.ts"
  - ":(top)packages/app/src/main.ts"
  - ":(top)packages/web/src/play/checkpoints.tsx"
  - ":(top)packages/web/src/project/checkpoint-*.ts*"
  - ":(top)packages/web/src/home/needs-you.tsx"
---

# 23 Review checkpoints

A review checkpoint holds one stage and every stage that transitively depends on it until the user approves the exact project revision and input fingerprint. Work outside that closure keeps running.

## Trigger & preconditions

- Play offers **Before Audio**, **Before Images** and **Before Video / export** (`packages/web/src/play/checkpoints.tsx:6`). Audio and Images are enabled only when that source is `generate`; Video/export when Video and Images are on, or Audio is on (`packages/web/src/play/checkpoints.tsx:55`). Review refuses a checkpoint on a stage not generated, and Video/export when both Video and Audio are off (`packages/app/src/slices/play-drafts/review-inputs.ts:188`). Editing the choice invalidates the review (`packages/web/src/play/checkpoints.tsx:82`).
- On an existing project the Checkpoints tab changes the gate set with `PATCH /projects/:id/checkpoints` (`packages/app/src/edge/http/checkpoints.ts:97`, `packages/web/src/project/revision-workspace.tsx:58`). Allowed only on the current head revision, with no canceled stage, and for each changed stage only while it is `pending` and none of its work was submitted (`packages/app/src/slices/checkpoints/change.ts:40`, `packages/app/src/slices/checkpoints/rules.ts:22`, `packages/app/src/slices/checkpoints/change.ts:241`).
- Stages: `audio | images | video`; at most three gates, one per stage (`packages/app/src/slices/checkpoints/schema.ts:5`, `:46`, `packages/app/src/kernel/db/migrations/0007-review-checkpoints.sql:12`).

## Steps

1. **Review computes the gate set.** For each run and selected stage, `reviewCheckpointSet` builds the run's recipes, takes the stage's closure (the stage's recipes plus every recipe depending on one, iterated to a fixpoint) and fingerprints the closure plus the staged attachments it reads (audio for audio/video closures, provided images for video closures) and, for a video closure, the subtitle font hash (`packages/app/src/slices/rebuild/recipe-checkpoints.ts:9`, `:70`, `packages/app/src/slices/checkpoints/fingerprint.ts:6`). Each gate carries `runIndex`, `checkpointId` (the stage name), `workKeys` and `dependents` (`packages/app/src/slices/play-drafts/model.ts:120`).
2. **Start admits gates.** Inside the Start transaction `admitReviewedCheckpoints` finds each project's first `revision_work` row of the stage kind and saves gates in state `held` with a fingerprint recomputed from the real revision; the Start result returns each row with its `reviewedFingerprint` (`packages/app/src/slices/rebuild/runtime-checkpoints.ts:10`, `:27`, `:48`). `saveCheckpointSet` rejects duplicate IDs or stages (`duplicate`), a revision or work row not found (`not-found`), and work of another project, revision or kind (`conflict`); an identical existing set returns `duplicate` with the rows (`packages/app/src/slices/checkpoints/repo.ts:82`).
3. **Runner holds the closure.** Before claiming work and again before each piece submission the runner asks `beforeClaim`; anything other than `eligible` skips the work (`packages/app/src/kernel/runner/index.ts:306`, `:203`). `main.ts` answers with the automatic-review hold first, then `checkpointDecisionForWork` (`packages/app/src/main.ts:891`). That decision refreshes each gate on the head revision; work whose reserved keys are outside a gate's `workKeys` is not affected; a `canceled` gate refuses; a `released` gate with `approvedAt` lets its closure run; any other gate holds it (`packages/app/src/slices/checkpoints/recovery.ts:14`).
4. **Status read.** `GET /projects/:id/checkpoints` returns the head `revisionId` and each gate with `currentFingerprint`, `dependents` and `workKeys` (`packages/app/src/edge/http/checkpoints.ts:67`, `packages/app/src/slices/checkpoints/change.ts:94`). An unapproved `held`/`pending-review` gate whose closure fingerprint changed is rewritten to the current fingerprint (`packages/app/src/slices/checkpoints/change.ts:110`).
5. **Approve.** The client sends `revisionId`, `fingerprint` and an `idempotencyKey` (UUID) reused on retry until a reply arrives (`packages/web/src/project/checkpoint-panel.tsx:162`, `packages/app/src/slices/checkpoints/schema.ts:52`). Under the per-project control lock the route (`packages/app/src/edge/http/checkpoints.ts:71`):
   - replays a known `idempotencyKey` when it names the same revision, checkpoint and fingerprint and the gate is `released`/`satisfied` (`packages/app/src/slices/checkpoints/change.ts:178`);
   - validates: head revision, gate exists, stage and anchor work exist and are not canceled, stage not `done`/`provided`/`skipped` unless closure work is still `pending`/`running`, stage or work not `running` unless already released, stored and current fingerprints both equal the submitted one (`packages/app/src/slices/checkpoints/change.ts:138`);
   - releases through the authority, which refuses inside an open transaction and wakes the runner after commit (`packages/app/src/kernel/runner/checkpoint-authority.ts:35`);
   - `approveCheckpoint` updates the gate to `released` with `approved_at` and inserts a `review_checkpoint_approvals` receipt in one transaction (`packages/app/src/slices/checkpoints/repo.ts:146`);
   - emits `project.updated` for the revision (`packages/app/src/edge/http/checkpoints.ts:92`).
6. **Settle.** Every terminal work write runs `settleReleasedCheckpoints`, which moves a `released` gate to `satisfied` once every key in its closure has a reservation whose work is `done`, `failed` or `canceled`; missing reservations keep it `released` (`packages/app/src/main.ts:939`, `packages/app/src/slices/checkpoints/recovery.ts:102`, `packages/app/src/slices/checkpoints/repo.ts:45`).

## Branches

- **Where approval happens**: the gate's card on the project page, the project's next action in the right rail, and Home → Needs you (`packages/web/src/project/checkpoint-panel.tsx:252`, `packages/web/src/project/next-action.ts:48`, `packages/web/src/home/needs-you.tsx:124`). Home approves only a `held`/`pending-review` gate whose fingerprint equals its current fingerprint (`packages/web/src/home/needs-you.tsx:119`). A waiting run with no such gate shows Open to continue and Keep as is instead; Keep as is (`PUT /api/projects/:id/set-aside`) takes the run off Needs you until the project's next revision (scenario 38; `packages/web/src/home/needs-you.tsx:156-176`, `:202-221`, `:47-49`, `packages/app/src/slices/uploads/repo.ts:43-71`).
- **Adding a gate on an existing project**: anchors on the stage's work row in the head revision; when the head has none (all work carried from an older origin revision) a synthetic `done`/`held` work row is created from the carried `recipe_context` (`packages/app/src/slices/checkpoints/change.ts:270`, `:311`). A resolved closure with no work keys is `conflict` (`packages/app/src/slices/checkpoints/change.ts:302`).
- **Removing a gate** deletes its row; the route wakes the runner when anything was removed (`packages/app/src/slices/checkpoints/change.ts:333`, `packages/app/src/edge/http/checkpoints.ts:107`).
- **Submitted-work test** for a change: a `done` row from another revision is ignored; a `done` row with no submitted or done piece and no reservation in this revision is ignored; otherwise any non-`pending` state or a submitted/running/done piece counts as started (`packages/app/src/slices/checkpoints/change.ts:241`).
- **Project edit or restore** creates a new revision and `carryCheckpointGates` copies each gate to it with a new `done`/`held` anchor: when the closure fingerprint over current inputs is unchanged the state and approval carry over; otherwise the old gate becomes `invalidated` and the new one is `held` with no approval (`packages/app/src/slices/checkpoints/recovery.ts:39`, `packages/app/src/slices/revisions/mutations.ts:215`, `packages/app/src/slices/revisions/restore.ts:73`). A save keeps the project's subject (`keptSubject`, `packages/app/src/slices/revisions/mutations.ts:93`, `packages/app/src/slices/revisions/subject.ts:4-11`), so a rename alone leaves every step fingerprint, and with it each gate, unchanged.
- **Already-complete stage** with dependent closure work still `pending`/`running` can still be approved (`packages/app/src/slices/checkpoints/change.ts:156`).
- **Multiple tabs** on the Checkpoints tab: the choices form compares the loaded revision and gate-set identity and refuses to save a changed set until **Reload checkpoint choices** (`packages/web/src/project/checkpoint-choices.tsx:49`, `:75`).

## Unhappy paths

| Case | Behavior | Site |
|---|---|---|
| Gate snapshot missing or catalogue unreadable | Logged `checkpoint.resolve` with project and stage only; status read returns `conflict` | `packages/app/src/slices/checkpoints/change.ts:88`, `:104` |
| Approval against a stale revision or fingerprint | 409 "This checkpoint changed since the page loaded…"; card shows **Reload checkpoints** | `packages/app/src/edge/http/checkpoints.ts:36`, `packages/web/src/project/checkpoint-panel.tsx:273` |
| Approval response lost | Card shows **Retry approval** with the same `idempotencyKey`; server replays the receipt | `packages/web/src/project/checkpoint-panel.tsx:201`, `packages/app/src/slices/checkpoints/change.ts:178` |
| Same key, different identity | `conflict` | `packages/app/src/slices/checkpoints/repo.ts:159` |
| Checkpoint deleted or project moved on | 404 "This checkpoint no longer exists…" | `packages/app/src/edge/http/checkpoints.ts:32` |
| Choices change response lost | "It may or may not have saved. Press Reload checkpoint choices…" | `packages/web/src/project/checkpoint-choices.tsx:98` |
| Project canceled | Open gates (`configured`, `pending-review`, `held`) become `canceled`; a canceled gate refuses its closure | `packages/app/src/slices/cancel/index.ts:118`, `packages/app/src/slices/checkpoints/recovery.ts:30` |
| Restart | `recoverCheckpointWork` re-allows unsubmitted pending work under open gates and keeps rate-limit waits, before the runner resumes | `packages/app/src/slices/checkpoints/recovery.ts:125`, `packages/app/src/main.ts:276` |
| Admission cannot find a stage work row or save gates | Throws an internal error sentence; the Start transaction rolls back | `packages/app/src/slices/rebuild/runtime-checkpoints.ts:33`, `:54` |

## State transitions

- `held → released` on an exact approval (`packages/app/src/slices/checkpoints/repo.ts:180`); `pending-review → released` likewise.
- `released → satisfied` when the whole closure is terminal (`packages/app/src/slices/checkpoints/repo.ts:67`).
- `held`/`released`/`satisfied` on the old revision `→ invalidated` when an edit changes the closure; the carried copy on the new revision is `held` (`packages/app/src/slices/checkpoints/recovery.ts:78`).
- `configured`/`pending-review`/`held → canceled` on project cancel (`packages/app/src/slices/cancel/index.ts:120`).
- `configured` and `pending-review` are accepted by the schema and the database but no current writer creates them: Start and Checkpoints-tab additions write `held` (`packages/app/src/slices/rebuild/runtime-checkpoints.ts:45`, `packages/app/src/slices/checkpoints/change.ts:297`).
- Forbidden: approving a `canceled`, `invalidated` or `satisfied` gate without a receipt (`packages/app/src/slices/checkpoints/repo.ts:175`).

## Invariants

- An approval names project, head revision, checkpoint and fingerprint; one receipt per `(project, idempotency_key)` and per `(project, revision, checkpoint)` (`packages/app/src/kernel/db/migrations/0007-review-checkpoints.sql:18`).
- Only reserved work keys inside a gate's closure are held (`packages/app/src/slices/checkpoints/recovery.ts:29`).
- Release never authorizes dispatch before its transaction commits (`packages/app/src/kernel/runner/checkpoint-authority.ts:37`).
- Project Pause/Resume, trash hold and queue limits stay authoritative: a released gate still waits for them (`packages/app/src/main.ts:918`).
- No provider call happens during setup, review, gate changes, status reads or approval.

## Outcomes & side effects

- Rows in `review_checkpoints` and `review_checkpoint_approvals`, cascading with their revision (`packages/app/src/kernel/db/migrations/0007-review-checkpoints.sql:2`).
- Approval emits `project.updated` and wakes one runner tick (`packages/app/src/edge/http/checkpoints.ts:46`).
- A run stopped at a gate reads as `pending` after `running`, which sends the "Waiting for you: <title>" notification (`packages/app/src/slices/notifications/rules.ts:13`, `:111`).
- The calendar marks a project `review` while a head-revision gate is `held`/`pending-review` without approval (`packages/app/src/slices/schedules/agenda.ts:141`).
- Problem details carry no credentials or input text (`packages/app/src/edge/http/checkpoints.ts:26`).

## Dimensions not in play

- D1 Authority: single local user; no remote approver.
- D5 Money: approval moves no money; cost is fixed at review.
- D7 Time: gates never expire and nothing auto-approves.
- D13 Notification: only the generic run "Waiting for you" notice; no checkpoint-specific message.
- D14 Effects on others: templates keep the selected gate stages (`packages/app/src/slices/project-templates/from-project.ts:199`); each scheduled occurrence gets fresh gates through Start and never approves them.
- Automatic reviews share the same `beforeClaim` hook (`reviewHold`) but are a separate behavior not covered here (`packages/app/src/main.ts:893`).
