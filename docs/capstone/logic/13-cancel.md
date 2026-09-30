---
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: 2d6880e4df66
paths_covered:
  - ":(top)packages/app/src/slices/control/**"
  - ":(top)packages/app/src/slices/cancel/**"
  - ":(top)packages/app/src/slices/rebuild/recovery.ts"
  - ":(top)packages/app/src/slices/rebuild/recovery-*.ts"
  - ":(top)packages/app/src/slices/rebuild/admission-repo.ts"
  - ":(top)packages/app/src/slices/rebuild/soften.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-store.ts"
  - ":(top)packages/app/src/slices/admission/repo.ts"
  - ":(top)packages/app/src/slices/run-cost/limits.ts"
  - ":(top)packages/app/src/kernel/runner/**"
  - ":(top)packages/app/src/edge/http/actions.ts"
  - ":(top)packages/app/src/edge/http/host-cli.ts"
  - ":(top)packages/app/src/host-cli/server.ts"
  - ":(top)packages/app/src/host-cli/runtime.ts"
  - ":(top)packages/app/src/adapters/llm/run-cli.ts"
  - ":(top)packages/app/src/slices/notifications/rules.ts"
  - ":(top)packages/app/src/main.ts"
  - ":(top)packages/web/src/project/next-action.ts"
  - ":(top)packages/web/src/project/use-actions.ts"
  - ":(top)packages/web/src/project/api.ts"
  - ":(top)packages/web/src/project/confirmations.ts"
  - ":(top)packages/web/src/project/summary.ts"
  - ":(top)packages/web/src/routes/project.tsx"
absorbed_from:
  - features/2026-09-09-pausable-optional-runs@2026-09-10
  - features/2026-09-24-host-cli-bridge@2026-09-24
scenario: cancel
mockup_row: S11
screens: [08-project]
depends_on: [01-pipeline-lifecycle, 06-research, 07-article-writing, 08-narration, 09-image-generation, 10-thumbnail-prompt-by-llm, 11-video-assembly, 12-reruns-and-edits]
---

# 13 Pause, resume and cancel

Stopping a running project: what is aborted, what survives, and how the run continues. Three HTTP entry points own this scenario: `POST /api/projects/:id/pause`, `POST /api/projects/:id/cancel` and `POST /api/projects/:id/resume`, plus per-stage `retry` and `soften` (`packages/app/src/edge/http/actions.ts:236`, `:250`, `:244`, `:259`, `:271`). Per-stage `rerun` and item `redo` share the same recovery path and are described in scenario 12.

## Trigger & preconditions

| Control | Where the page offers it | Server precondition |
|---|---|---|
| Pause | Right-rail next action "Pause" while the project reads running (`packages/web/src/project/next-action.ts:297`); command palette "Pause the run" (`packages/web/src/routes/project.tsx:225`) | Any unfinished stage; a project whose stages are all satisfied returns ok with no change (`packages/app/src/slices/control/index.ts:127`) |
| Continue the run (Resume) | Next action while paused (`packages/web/src/project/next-action.ts:164`) or stopped: `resumable`, canceled, or failed with no retryable failed stage (`:310`); palette title flips to "Continue the run" while paused (`packages/web/src/routes/project.tsx:226`) | A current revision the request's `baseRevisionId` names (`packages/app/src/slices/rebuild/recovery.ts:91`) |
| Cancel | More menu "Cancel the run…", enabled only while the project status is `running` and no action is pending (`packages/web/src/routes/project.tsx:455`); confirm dialog "Cancel this run?" / "Cancel run" / "Keep running" (`packages/web/src/project/confirmations.ts:49`) | A running stage, a paused flag, admitted pending head work, or calls still draining; otherwise a no-op (`packages/app/src/slices/cancel/index.ts:96`) |
| Retry / Soften | Next action on a failed stage with no scheduled retry (`packages/web/src/project/next-action.ts:182`) | Same as Resume, scoped to the stage (`packages/app/src/slices/rebuild/recovery-selection.ts:94`) |

Every control body carries `{ baseRevisionId, idempotencyKey }`, a revision id of 1–64 chars and a UUID (`packages/app/src/slices/control/revision-control-schema.ts:3`). The web client mints one identity per project+action+stage, reuses it after a transport fault even when live events move the head, and drops it once the server answers (`packages/web/src/project/use-actions.ts:86`, `:101`). Before pause/cancel the edge adopts a baseline revision for a legacy project; a project with a head and no valid body is refused `revision-required` (`packages/app/src/edge/http/actions.ts:215`).

Actor: the single local user.

## Steps

### Pause

1. `pauseProject` serializes on the per-project control queue shared by every project mutation (`packages/app/src/slices/control/lock.ts:7`, `packages/app/src/slices/control/index.ts:107`).
2. `checkRevisionControl` runs in one transaction: a key already stored for another operation or hash is `idempotency-conflict`; a stored final response is replayed; a stored `{pending:true}` continues only while the head still equals the base; a key used by a revision mutation, rebuild admission or recovery request is `idempotency-conflict`; a head that moved is `conflict`; otherwise a `project_control_receipts` row is inserted as `{pending:true}` (`packages/app/src/slices/control/revision-control.ts:25`).
3. A project already paused with nothing running and nothing in flight returns ok (`packages/app/src/slices/control/index.ts:129`).
4. The pause flag (`project_controls.paused=1`) is committed before any abort (`packages/app/src/slices/control/index.ts:131`), then `runner.abortProject(id, "pause")` aborts every in-flight controller of the project with the `paused by user` reason and waits for all of them to settle (`packages/app/src/kernel/runner/index.ts:337`, `:80`).
5. A stage whose call rejects under the pause reason concludes `pending` with no failure reason; any other abort concludes `canceled` "canceled by user" (`packages/app/src/kernel/runner/index.ts:217`).
6. Every stage that was running before the pause and now reads `running` or `canceled` is written `pending` (`packages/app/src/slices/control/index.ts:135`). The receipt is updated with the final response (`packages/app/src/slices/control/revision-control.ts:96`).
7. While paused the runner claims nothing for the project (`packages/app/src/kernel/runner/index.ts:202`), timed retries are not woken (`packages/app/src/kernel/runner/work-authority.ts:108`), and a stage row cannot move to `running` (`packages/app/src/slices/admission/repo.ts:144`).

### Resume, Retry and Soften (direct recovery)

8. `recoverProject` parses `{baseRevisionId, idempotencyKey, action}` with action `resume`, `retry{stage}`, `rerun{stage}` or `redo{item}` (`packages/app/src/slices/rebuild/recovery-model.ts:6`). A request already recorded in `project_recovery_requests` returns its stored result; a mismatching hash is `idempotency-conflict` (`packages/app/src/slices/rebuild/recovery-repo.ts:40`).
9. On first sight the request is reserved with an authority stamp: a hash of the project's control-receipt keys and rebuild-admission ids (`packages/app/src/slices/rebuild/recovery-repo.ts:29`, `:76`). Any pause, cancel or admission between reserve and admit changes the stamp and the request ends `control-changed` (`packages/app/src/slices/rebuild/recovery.ts:132`, `:301`).
10. Selection: Resume selects `allAffected`; Retry selects the stage's work not marked reuse, or all of the stage's work when every row is reuse (`packages/app/src/slices/rebuild/recovery-selection.ts:94`).
11. A preview is planned and stored like a reviewed rebuild (scenario 12). Provided content or manual captions that would be replaced end `review-required`; any `blocked` work ends `readiness` with each row's reason (`packages/app/src/slices/rebuild/recovery.ts:210`, `:220`). Unknown prices do not block: they add the warning "Some generation prices are unknown; actual usage is recorded." (`:337`).
12. Provider readiness is checked outside the lock; a load failure yields a `readiness` refusal "Check provider readiness and try Resume." (`packages/app/src/slices/rebuild/recovery.ts:271`). Inside the lock and one transaction the authority stamp, the head and a credentials stamp (hash of `provider_keys.credential_generation` for providers that will submit) are rechecked; changed credentials end `readiness` "Provider credentials changed. Try Resume again." (`:37`, `:305`).
13. `admitCheckedPreview` admits the work under the admit key `recovery:<key>:admit` (`packages/app/src/slices/rebuild/recovery.ts:320`, `packages/app/src/slices/rebuild/recovery-repo.ts:26`). Admission clears the pause flag in the same transaction (`packages/app/src/slices/rebuild/admission-repo.ts:186`). After commit the project is announced and the runner ticked (`packages/app/src/slices/rebuild/recovery.ts:345`). The HTTP answer is 202 with the admission and warnings (`packages/app/src/edge/http/actions.ts:157`).
14. Soften first records a softening request for the stage's steps whose last attempt a content filter refused (images or thumbnail only), then runs Retry; a non-202 answer clears the request. With nothing refused the answer is 409 `nothing-refused` (`packages/app/src/edge/http/actions.ts:276`, `packages/app/src/slices/rebuild/soften.ts:11`).

### Cancel

15. `cancelProject` serializes on the same control queue and runs `checkRevisionControl` for operation `cancel` (`packages/app/src/slices/cancel/index.ts:58`).
16. Nothing running, not paused, no pending admitted head work and nothing draining: answer ok with `canceled: []` and the derived state; no row changes (`packages/app/src/slices/cancel/index.ts:96`).
17. When something runs or drains, `abort(projectId)` aborts every in-flight controller of the project at once and waits for them. During the abort the project id sits in the runner's `stopped` set, so a stage that finishes cannot hand over to a dependent (`packages/app/src/kernel/runner/index.ts:92`, `:201`, `:337`). The CLI adapter spawns each CLI in its own POSIX process group and kills the group on abort (`packages/app/src/adapters/llm/run-cli.ts:72`, `:130`).
18. One transaction then: clears the pause flag; sets every non-done `revision_work` row of the project to `state='canceled'`, `dispatch_state='held'`, `failure_reason='canceled by user'`, `retry_at=NULL`; sets every non-done piece to `held`; marks the head revision's `configured`/`pending-review`/`held` review checkpoints `canceled` with approval cleared, then settles released checkpoints (`packages/app/src/slices/cancel/index.ts:106`).
19. In the same transaction any stage still `running` is written `canceled` "canceled by user" and logged `cancel.sweep`; if no stage reads `canceled` afterwards, the first `pending` stage is written `canceled` so the cancellation is explicit; schedule runs that admitted this project are settled (`packages/app/src/slices/cancel/index.ts:128`, `:139`, `:146`).
20. Events: `stage.state` for each swept or waiting stage, and `project.state` only when the sweep moved a row or the project had been paused (`packages/app/src/slices/cancel/index.ts:150`). The HTTP answer is the project view plus `canceled`: the stages that were running before and read `canceled` after (`packages/app/src/slices/cancel/index.ts:179`, `packages/app/src/edge/http/actions.ts:254`).

## Branches

- **Resume after cancel.** Canceled work rows stay canceled; Continue the run (or a stage's Retry) plans a new admission that reuses every stored piece and asset and submits only what is missing (`packages/app/test/direct-recovery.test.ts:22`).
- **Legacy stage-level resume.** `resumeProject` in `packages/app/src/slices/control/index.ts:145` (refuses `rebuild-required` for a revision project with canceled stages or with neither checkpoints nor admitted work) is not routed by the edge; only its unit test calls it. `changeProviders` (`:194`) is likewise unrouted: `PATCH /:id/providers` answers 409 `revision-required` (`packages/app/src/edge/http/actions.ts:249`).
- **Stage stored at the instant of cancel.** The stage stays `done`; the `canceled` list is read back after the transaction, not assumed from what was running (`packages/app/src/slices/cancel/index.ts:181`).
- **Cancel while paused.** No abort is needed when nothing runs; the pause flag is cleared and unfinished work is canceled (`packages/app/src/slices/cancel/index.ts:104`, `:107`).
- **Host CLI calls.** A closed or aborted bridge connection aborts only that host job (`packages/app/src/edge/http/host-cli.ts:170`, `:176`). The host LLM stream aborts after 120 s without a frame, reset on every frame (`:240`, `:254`); a host image call aborts after `agentImageTimeoutMs`, 30 minutes (`:304`, `packages/app/src/kernel/ports/image.ts:70`). A stream that ends without `done` or on abort returns an `unavailable` fault (`packages/app/src/edge/http/host-cli.ts:281`), and `unavailable` is terminal in the attempt wrapper, never retried in-call (`packages/app/src/kernel/runner/attempt.ts:29`). Helper shutdown stops admissions, aborts every job and force-closes connections after 5 s (`packages/app/src/host-cli/server.ts:60`); the job's private workspace is removed (`packages/app/src/host-cli/runtime.ts:86`).
- **In-app attempt timeouts.** Each attempt aborts at 120 s for LLM and TTS, 300 s for images and 900 s for video clips (`packages/app/src/kernel/runner/attempt.ts:19`). These are failures, not cancels.
- **Cancel during a rebuild (scenario 12).** Same rules: every non-done work row of the project, admitted or held, is canceled.

## Unhappy paths

- Refusals map to 404 `no-project`, 409 `revision-required`/`conflict`/`idempotency-conflict`/`rebuild-required`, each with a sentence naming the fix (`packages/app/src/edge/http/actions.ts:94`). Recovery refusals map to 404/400/409 with sentences such as "Wait for this section to finish, or Pause the project, before re-running it." (`:141`). The page shows a project-level refusal in the right rail with Dismiss (`packages/web/src/routes/project.tsx:463`).
- Recovery before the rebuild service is wired answers 503 "Resume and retry are not ready yet because Slopify is still starting." (`packages/app/src/edge/http/actions.ts:147`).
- A late response from an aborted call rejects into the aborted branch and is not logged as a fault (`packages/app/src/kernel/runner/index.ts:217`).
- A final row write that failed during unwinding is covered by the cancel sweep and by pause's post-abort rewrite (`packages/app/src/slices/cancel/index.ts:125`, `packages/app/src/slices/control/index.ts:134`).
- The receipt update after a pause or cancel throws "The control request lost its receipt." when the row is gone (`packages/app/src/slices/control/revision-control.ts:113`).
- Process death: at boot a `running` stage becomes `pending` when the project is paused, else `failed` "interrupted"; nothing resumes on its own (`packages/app/src/main.ts:1017`). Plan-limit waiters interrupted this way are resumed at boot unless the project is paused (`packages/app/src/slices/run-cost/limits.ts:128`); restart recovery is scenario 20.
- Concurrent clicks from two tabs queue behind the control lock; a pause owns the queue until its calls have unwound (`packages/app/src/slices/control/lock.ts:3`).

## State transitions

| Entity | Transition | Rule |
|---|---|---|
| Stage | `running` → `pending` | Pause (`packages/app/src/slices/control/index.ts:135`) |
| Stage | `running` → `canceled` | Cancel abort or sweep (`packages/app/src/kernel/runner/index.ts:221`, `packages/app/src/slices/cancel/index.ts:132`) |
| Stage | first `pending` → `canceled` | Cancel when no stage reads canceled (`packages/app/src/slices/cancel/index.ts:143`) |
| Stage | `canceled` → running again | Only through a new admission from Resume/Retry; the stage state is projected from work rows (`packages/app/src/slices/rebuild/runtime-store.ts:200`) |
| `revision_work` | non-done → `canceled`/`held` | Cancel (`packages/app/src/slices/cancel/index.ts:110`) |
| Review checkpoint | `configured`/`pending-review`/`held` → `canceled` | Cancel (`packages/app/src/slices/cancel/index.ts:120`) |
| Project pause flag | 0 → 1 | Pause; 1 → 0 on Cancel or on any admission (`packages/app/src/slices/rebuild/admission-repo.ts:186`) |

Forbidden: pause/cancel changing a `done` stage or deleting a stored piece or asset; a canceled project starting without a new admission.

## Invariants

- No provider call of the project continues after cancel returns: `abortProject` waits for every in-flight controller (`packages/app/src/kernel/runner/index.ts:347`).
- After cancel commits no stage of the project is `running` (`packages/app/src/slices/cancel/index.ts:125`).
- A canceled project never resumes on its own: its work rows are `held` and only an admission sets them dispatchable.
- Pause is committed before the first abort, so no new claim starts during the abort (`packages/app/src/slices/control/index.ts:131`).
- One idempotency key is never reused across pause, cancel, save, restore, rebuild admission and recovery (`packages/app/src/slices/control/revision-control.ts:65`, `packages/app/src/slices/rebuild/recovery-repo.ts:48`).

## Outcomes & side effects

- Pause: project status `paused`; the rail reads "The run is paused." with the still-to-make list and Continue the run (`packages/web/src/project/next-action.ts:164`). Pending stages read "Waits until you continue the run" (`packages/web/src/project/summary.ts:76`). The running rail explains Pause as "Pausing lets the current call finish and keeps everything made so far." (`packages/web/src/project/next-action.ts:304`) while the server aborts in-flight calls (step 4).
- Cancel: project status `canceled`, header status "Canceled", stage rows "Canceled by user" (`packages/web/src/project/summary.ts:87`); rail "The run stopped before it finished." with Continue the run (`packages/web/src/project/next-action.ts:315`). Kept outputs remain downloadable (scenario 14).
- Telemetry: usage is recorded only for calls that completed; a canceled then resumed run counts only the calls the resumed run made (`packages/app/src/kernel/runner/providers.ts:159`, `packages/app/test/cancel.test.ts:260`).
- Notifications: a transition into `paused` or `canceled` produces no run notice (`packages/app/src/slices/notifications/rules.ts:10`).
- Records: `project_control_receipts` row per pause/cancel request; `project_recovery_requests` row per resume/retry/soften; schedule occurrences settled on cancel.

## Dimensions not in play

- D1 authority: one local actor; no roles.
- D4 computation: nothing is computed beyond hashes for identity.
- D5 money: pause and cancel charge nothing; Resume/Retry admit work under scenario 12's cost rules and do not require an unknown-cost acknowledgement.
- D6 limits: queue and provider limits are unchanged by these controls.
- D7 time: no expiry on a pause or a canceled project; a recurring schedule's own pause/resume belongs to the schedule service (`packages/app/src/slices/schedules/service.ts:132`).
- D14 effects on others: other projects are untouched; only the project's own schedule occurrences are settled.
