---
generated_at_commit: e9226a34aa8a
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: 2cda7c622bb3
paths_covered:
  - ":(top)packages/app/src/slices/revisions/**"
  - ":(top)packages/app/src/slices/rebuild/service.ts"
  - ":(top)packages/app/src/slices/rebuild/service-readiness.ts"
  - ":(top)packages/app/src/slices/rebuild/admission-repo.ts"
  - ":(top)packages/app/src/slices/rebuild/transition-repo.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-materialize.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-actions.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-save.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-validation.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-audio-parts.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-text.ts"
  - ":(top)packages/app/src/slices/rebuild/preview-plan.ts"
  - ":(top)packages/app/src/slices/rebuild/model.ts"
  - ":(top)packages/app/src/slices/rebuild/recovery.ts"
  - ":(top)packages/app/src/slices/rebuild/recovery-*.ts"
  - ":(top)packages/app/src/slices/rebuild/review-redo.ts"
  - ":(top)packages/app/src/slices/rebuild/narration-retry.ts"
  - ":(top)packages/app/src/slices/rebuild/narration-reuse.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-narration-reuse.ts"
  - ":(top)packages/app/src/slices/checkpoints/recovery.ts"
  - ":(top)packages/app/src/slices/channels/rebrand.ts"
  - ":(top)packages/app/src/slices/project-templates/from-project.ts"
  - ":(top)packages/app/src/slices/settings/cli-paths.ts"
  - ":(top)packages/app/src/slices/admission/rules.ts"
  - ":(top)packages/app/src/edge/http/revisions.ts"
  - ":(top)packages/app/src/edge/http/actions.ts"
  - ":(top)packages/web/src/project/revision-workspace.tsx"
  - ":(top)packages/web/src/project/revision-history.tsx"
  - ":(top)packages/web/src/project/rebuild-review.tsx"
  - ":(top)packages/web/src/project/controls.tsx"
  - ":(top)packages/web/src/project/confirmations.ts"
  - ":(top)packages/web/src/project/summary.ts"
  - ":(top)packages/web/src/project/live-writing.tsx"
  - ":(top)packages/web/src/routes/project.tsx"
  - ":(top)packages/app/src/slices/admission/model.ts"
  - ":(top)packages/app/src/slices/rebuild/soften.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-shorts.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-youtube.ts"
absorbed_from:
- features/2026-09-25-glossary-pronunciation@2026-09-25
- features/2026-09-25-video-recovery@2026-09-25
- features/2026-09-24-research-documents@2026-09-25
- features/2026-09-09-pausable-optional-runs@2026-09-10
- features/2026-09-10-editable-projects@2026-09-12
- features/2026-09-10-review-checkpoints@2026-09-13
scenario: reruns-and-edits
mockup_row: S10
screens:
- 08-project
depends_on:
- 01-pipeline-lifecycle
- 02-provider-credentials
- 05-provided-outputs
- 07-article-writing
- 08-narration
- 09-image-generation
- 10-thumbnail-prompt-by-llm
- 11-video-assembly
---

# 12 Project edits and retained revisions

An existing project changes its setup, text, media and captions while retaining completed outputs. Saving creates an immutable revision and starts nothing. Work is started by a reviewed rebuild (Choose what to remake), by a direct recovery action (Re-run, Regenerate now, Redo), or by Continue the run (scenario 13).

## Trigger & preconditions

| Entry point | Route / UI | Code |
|---|---|---|
| Prepare baseline | `POST /:id/revisions/prepare` adopts a legacy project's baseline revision without generation | `packages/app/src/edge/http/revisions.ts:89` |
| History / one revision | `GET /:id/revisions`, `GET /:id/revisions/:revisionId` | `packages/app/src/edge/http/revisions.ts:94`, `:100` |
| Save | `POST /:id/revisions` from Edit settings → Save | `packages/app/src/edge/http/revisions.ts:123`, `packages/app/src/slices/revisions/mutations.ts:58` |
| Restore | `POST /:id/revisions/restore` from History → "Restore this revision" | `packages/app/src/edge/http/revisions.ts:135`, `packages/web/src/project/revision-history.tsx:108` |
| Rebuild preview / Start | `POST /:id/rebuild/preview`, `POST /:id/rebuild`; More → "Choose what to remake…" and the palette's "Remake …" commands | `packages/app/src/edge/http/revisions.ts:147`, `:158`, `packages/web/src/routes/project.tsx:444`, `:277` |
| Re-run a section | `POST /:id/stages/:kind/rerun`, confirm dialog "Re-run this stage?" | `packages/app/src/edge/http/actions.ts:295`, `packages/web/src/project/confirmations.ts:62` |
| Save as template | More → "Save as template…"; disabled without a revision or on the sample | `packages/web/src/routes/project.tsx:450`, `packages/app/src/slices/project-templates/from-project.ts:35` |

Editing does not require idle stages or current provider credentials; readiness is checked when paid work is admitted. Save, Restore and Start carry the current base revision and a UUID idempotency key (`packages/app/src/slices/rebuild/model.ts:104`). A key already used by another operation, a rebuild admission, a control receipt or a recovery request is `idempotency-conflict`; a head that moved is `conflict` (`packages/app/src/slices/revisions/mutation-request.ts:37`). Unconditional legacy mutations (`PUT /:id/article`, image delete/regenerate, `PATCH /:id/providers`) answer 409 `revision-required` with "This change is now made from the Edit tab." (`packages/app/src/edge/http/actions.ts:314`).

## Steps

### Save

1. The edit is parsed; submitted `narrationSources` are stripped and the request hash is computed over the rest (`packages/app/src/slices/revisions/mutations.ts:73`). A repeated accepted key returns its original receipt with `duplicate: true` (`packages/app/src/slices/revisions/mutation-request.ts:47`).
2. Image prompts or their counts changed: image definitions are replanned, keeping every image an unchanged prompt already has; prompts are refused unless Images is Generate (`packages/app/src/slices/revisions/mutations.ts:265`).
3. A channel move or brand-kit switch takes the new channel's cast and brand kit; values the person set are kept (`packages/app/src/slices/channels/rebrand.ts:1`, `packages/app/src/slices/revisions/mutations.ts:93`).
3a. Kept subject: when the edited title differs from the base's and the base has no `subjectTitle`, the base title is stored as `config.subjectTitle`; a base that has one passes it on, so no edit drops it and later renames keep the first title (`keptSubject`, `packages/app/src/slices/revisions/subject.ts:7-11`, applied at `packages/app/src/slices/revisions/mutations.ts:93`). Recipes that use the title as context read `subjectOf(config)` = `subjectTitle ?? title` (`packages/app/src/slices/admission/model.ts:285-290`): text, intro/outro, scenes, looks, establishing image and thumbnail cast, provided-thumbnail semantics, shorts, short-mode export, YouTube description, document and audio exports (`packages/app/src/slices/rebuild/recipe-text.ts:355`, `packages/app/src/slices/article/segments.ts:88`, `packages/app/src/slices/rebuild/recipe-scenes.ts:48`, `:99`, `packages/app/src/slices/rebuild/recipe-appearance.ts:68`, `packages/app/src/slices/rebuild/recipe-reference.ts:95`, `packages/app/src/slices/rebuild/recipe-visual.ts:180`, `:301`, `:364`, `packages/app/src/slices/rebuild/recipe-shorts.ts:77`, `:161`, `packages/app/src/slices/rebuild/recipe-youtube.ts:40`, `packages/app/src/slices/rebuild/recipe-document.ts:40`, `packages/app/src/slices/rebuild/recipe-exports.ts:109`). A rename therefore leaves every fingerprint unchanged and plans no work.
4. Narration bindings are derived server-side from the base revision for overridden, regenerated or uploaded groups (`packages/app/src/slices/revisions/rules.ts:10`).
5. Validation, all returned as `invalid-edit` with field errors (`packages/app/src/slices/revisions/mutations.ts:95`):
   - Sources must be allowed values; Images Provide refuses generated images still in the order; Images on with an empty order is refused with "Every image is deleted, so the video has nothing to show…"; Images Off requires Video Off; every image appears exactly once; title 1–200 chars; silence gap, image seconds, zoom and edge silence within limits; Subtitles need Audio (`packages/app/src/slices/rebuild/recipe-save.ts:238`).
   - Article Off is refused while Narration is Generate or PDF is Generate (`packages/app/src/slices/admission/rules.ts:642`).
   - Provider/model/voice picked where used, at most `imagesPerVideoMax` images, chunk size 1–1,000,000, and prompts render (`packages/app/src/slices/rebuild/recipe-validation.ts:21`).
   - Ambient bed and "More images for long videos" values (`packages/app/src/slices/revisions/mutations.ts:242`).
   - Uploads, template intent, narration intent and asset references (`packages/app/src/slices/revisions/mutations.ts:97`).
6. Assets are prepared outside the transaction; caption audio is measured (`packages/app/src/slices/revisions/mutations.ts:112`).
7. One transaction: the receipt check and optional `beforeCommit` rerun; each key in `regenerate` gets a fresh regeneration token; the plan is built; asset references and cues are validated against it; edited cues bind to the timing step's logical fingerprint; deferred intent is preserved; the revision (parent = base, `restoredFromId` null) is inserted; the manifest is cloned; the head advances only if it still equals the base (`packages/app/src/slices/revisions/mutations.ts:115`–`:218`).
8. Advancing the head rewrites the project's title, format and config and moves the project to the revision's channel when that channel still exists (`packages/app/src/slices/revisions/mutations.ts:317`).
9. `transitionRevisionWork` carries every reservation whose logical fingerprint is unchanged to the new revision; other unfinished pieces become `draining` when already submitted, else `held`; rows no longer reserved are held or draining the same way (`packages/app/src/slices/rebuild/transition-repo.ts:29`).
10. For each needed step not carried, a row that already exists for exactly that key and fingerprint is reserved instead of minting one: a done row first, else a held row with no attempt, no submission and no planning context. Otherwise a new `pending`/`held` row is created (`packages/app/src/slices/rebuild/transition-repo.ts:119`, `:178`).
11. Checkpoint gates carry across (`packages/app/src/slices/checkpoints/recovery.ts:39`); staged uploads are consumed; uncommitted prepared assets are discarded in `finally` (`packages/app/src/slices/revisions/mutations.ts:215`, `:220`, `:229`).
12. While the only work left is held, pending stages read "Waits until you continue the run" (`packages/web/src/project/summary.ts:76`).

### Reviewed rebuild (Choose what to remake)

13. Preview: the base must be current; the selection is `allAffected` or `selected` work keys (1–10,000) (`packages/app/src/slices/rebuild/model.ts:84`, `packages/app/src/slices/rebuild/service.ts:51`). The preview lists changed inputs, each work item with disposition `reuse`/`generate`/`local`/`review`/`blocked`, retained outputs, provided content needing confirmation, costs with an unknown count, a whole-request notice and warnings (`packages/app/src/slices/rebuild/model.ts:23`). It is stored with an execution snapshot (`packages/app/src/slices/rebuild/service.ts:81`).
14. Start: a replayed key returns its receipt and re-wakes the runner (`packages/app/src/slices/rebuild/service.ts:107`). The preview must match the base; every provided key must be confirmed exactly and unknown costs acknowledged, else `review-required` / `cost-ack-required` (`:35`, `:122`). Readiness runs outside the lock (`:136`).
15. Under the project lock, `admitCheckedPreview` rechecks the head, re-plans with the current catalogue and requires the stored review to still cover it (`stale-preview` otherwise), runs local readiness, refuses when a running row for a selected key has a different fingerprint, and admits (`packages/app/src/slices/rebuild/service.ts:166`). Admission clears the pause flag (`packages/app/src/slices/rebuild/admission-repo.ts:186`); the runner is ticked after commit (`packages/app/src/slices/rebuild/service.ts:210`).
16. The web review drawer shows counts and cost, and lists beside Start what still holds it back (`packages/web/src/project/rebuild-review.tsx:12`). With `autoStart`, a preview needing no consent (nothing blocked, nothing to confirm, no unknown cost) starts at once (`packages/web/src/project/revision-workspace.tsx:375`).
17. After admission the runner re-plans admitted work on every tick; an untouched waiting row (pending, one unsent piece, no attempt) takes new input fingerprints in place, so one step keeps one admitted row however many narration chunks land (`packages/app/src/slices/rebuild/runtime-materialize.ts:69`, `:122`).

## Branches

### Direct recovery: Re-run, Redo, Regenerate now

- **Re-run a section** (`rerun{stage}`): roots are the stage's generated provider work; Article only when generated and not hand-edited; Audio the TTS and deferred narration requests; Video the local export, subtitle-file and voices-file steps; Document `document:pdf` (`packages/app/src/slices/rebuild/recovery-selection.ts:8`). A revision saving fresh regeneration tokens for the roots is saved first under key `recovery:<key>:save`, then the dependent closure is admitted without a review drawer (`packages/app/src/slices/rebuild/recovery.ts:135`, `:189`). The web offers Re-run only where `canRerunSection` holds (`packages/web/src/project/controls.tsx:6`).
- **Redo an item** (`redo{item}`): `narration` and `article:body` redo their section; `shorts:<n>` redoes from its prompts; a narration chunk's logical key redoes its TTS requests; any provider key redoes itself (`packages/app/src/slices/rebuild/recovery-selection.ts:47`). Automatic review redos use this path one at a time per verdict (`packages/app/src/slices/rebuild/review-redo.ts:100`); caption-step narration retries re-record one chunk at most `narrationRetryLimit` = 2 times (`packages/app/src/slices/rebuild/narration-retry.ts:13`, `:81`); a retry refused as `running` stays pending and is kicked again when the project's running work finishes (`narration-retry.ts:143-151`).
- **Refusals before admit:** running or admitted work in the closure is `running`; an accepted provider job not yet collected is `accepted-job` (`packages/app/src/slices/rebuild/recovery-conflict.ts:15`, `:45`); a Video or Document rerun whose sources still need provider work is `readiness` "Use Continue the run…" (`packages/app/src/slices/rebuild/recovery.ts:227`); nothing generated is `invalid-selection` (`:107`). A refusal after the save returns `intentRevisionId` so the page offers Continue the run (`packages/app/src/edge/http/actions.ts:194`).
- **Regenerate now** (web): with no unsaved draft, saves a revision marking the chosen work keys and then reviews `selected` those keys with `autoStart`; with an unsaved draft, the marks are added to the draft instead (`packages/web/src/project/revision-workspace.tsx:333`).
- **Soften and retry** (`POST /:id/stages/:kind/soften`, `packages/app/src/edge/http/actions.ts:270-292`): the stage's softenable refused steps (`softenableKeys`, `packages/app/src/slices/rebuild/soften.ts:26-40`: every refused image of Images or Thumbnail, and refused short stills `shorts:N:image:M` of Video) get a softening request, then the stage is retried; none → 409. The image step (or a short's still, `packages/app/src/slices/rebuild/runtime-shorts.ts:254-275`) has the project's LLM reword the prompt, draws it, and clears the request once an image is made (scenario 13).
- **Retry** is `rebuild-required` in the legacy action wrapper (`packages/app/src/slices/rebuild/runtime-actions.ts:26`); routed Retry is direct recovery (scenario 13).

### Edits and affected work

| Edit | Reuse and invalidation |
|---|---|
| Title | No work planned: fingerprints read the kept subject (step 3a). Current downloads use the new title, historical downloads their own; a step re-run for another reason renders with the new title where it prints it (PDF `packages/app/src/slices/rebuild/runtime-document.ts:62`, short-mode video `runtime-export-short.ts:57`, shorts `runtime-shorts.ts:120`, audiobook tags `runtime-voices.ts:73`, `:88`). YouTube's Write again writes for the new title and keeps the other titles to the run's `titlePattern` only while the new title still fits that pattern (`packages/app/src/slices/rebuild/runtime-youtube.ts:82-90`) |
| Article text | Identical physical narration requests reused; changed narration and dependent timing/export rebuilt |
| Narration voice/model/settings | Requests whose request-relevant settings changed regenerate; old voice outputs stay in history |
| Individual narration group | Override text, replacement audio or regeneration affects that logical group and dependent assembly; a text override's `direction` (a delivery note) changes only that group's preparation request (scenario 08) |
| Image replace/add/delete/order/prompt | Visual export and selected image generation only; narration and WAV kept |
| Subtitle style / manual cues | Timing reused where valid; sidecars and burned export rebuilt without new narration |
| Provided downstream content | Reuse must be confirmed at Start; never silently switched to paid generation |

Narration reuse compares normalized text plus provider, model, voice, pronunciation and request context (`packages/app/src/slices/rebuild/narration-reuse.ts`, `packages/app/src/slices/rebuild/runtime-narration-reuse.ts`). A regeneration token adds identity so an older matching result cannot replace the requested new output (`packages/app/test/revision-rebuild.test.ts:131`). Manual cues must be ordered, non-overlapping, end after start and end within the measured narration duration (`packages/app/src/slices/revisions/rules.ts:62`).

### Pronunciation

A used glossary mapping changes the affected TTS request identity; an unchanged glossary does not force compatible requests to repeat (`packages/app/src/slices/rebuild/recipe-audio-parts.ts:45`, `:196`). The glossary is the project's own plus, when `shareGlossary` is on, the shared one (`packages/app/src/slices/rebuild/recipe-text.ts:442`). Late or replayed cue answers cannot authorize a changed pronunciation, and a carried late TTS result binds to the receiving revision's clean spelling (`packages/app/test/revision-pronunciation-authority.test.ts:11`, `:84`). Review steps run in their item's stage; narration steps classify as Audio (`packages/app/src/slices/rebuild/transition-repo.ts:201`).

### History and restore

Restore creates a new head whose parent is the previous head and whose `restoredFromId` names the target; the target's selected outputs and pieces are cloned, never rewritten (`packages/app/src/slices/revisions/restore.ts:24`). Its work transition uses the restored fingerprints with the plan's stages (`:60`). Restore grants no work. History lists each revision's retained outputs and narration/text parts with downloads and previews (`packages/web/src/project/revision-history.tsx:85`).

### CLI path readiness

Host-managed CLI paths are not compared with the container's path settings; native CLI paths get the final change check in both rebuild and Play readiness (`packages/app/src/slices/settings/cli-paths.ts:50`, `packages/app/src/slices/rebuild/service-readiness.ts:107`).

## Unhappy paths

- Stale base: `conflict` with `currentRevisionId`; the page reloads the actual head (`packages/app/src/slices/revisions/mutation-request.ts:30`).
- Head moves during the save transaction: "Project head changed during the revision transaction." and nothing commits (`packages/app/src/slices/revisions/mutations.ts:204`).
- Failure before commit leaves the prior head and outputs intact; prepared assets not referenced are discarded (`packages/app/src/slices/revisions/mutations.ts:229`).
- Stale preview or changed catalogue at Start: `stale-preview` (`packages/app/src/slices/rebuild/service.ts:182`).
- Duplicate Start returns the same admission and work ids (`packages/app/src/slices/rebuild/service.ts:107`).
- An unknown prior narration submission is held and warned about before an explicit retry; a persisted provider job is retrieved after reopening without another submission (`packages/app/test/revision-restart.test.ts:15`, `:151`).
- Live writing and audio events are keyed by revision and work id, so an old revision's stream cannot overwrite current content (`packages/web/src/project/live-writing.tsx:23`, `packages/app/src/kernel/runner/index.ts:103`).
- Save as template refuses a stale revision (`conflict`) and a generated-images project holding provided images (`invalid-input`) (`packages/app/src/slices/project-templates/from-project.ts:54`, `:63`).

## State transitions

- Save: head → new revision; affected unsubmitted reservations lose authority (`held`), submitted ones `draining` (`packages/app/src/slices/rebuild/transition-repo.ts:95`).
- Restore: head → new revision referencing the target's records (`packages/app/src/slices/revisions/restore.ts:58`).
- Preview: creates no work. Start / direct recovery: creates or joins revision-bound work as `allowed`, clears the pause flag.
- Forbidden: rewriting any historical revision; advancing the head from a stale base.

## Invariants

Save and Restore never initiate generation. Accepted work executes under revision/piece authority, and only matching results attach to the current revision. History is append-only until project deletion. Library edits cannot replace a saved project prompt snapshot. The last finished exports remain accessible until successfully replaced.

## Outcomes & side effects

Save and Restore persist a revision, manifest references and a `revision_mutations` receipt, and emit `project.updated` (`packages/app/src/edge/http/revisions.ts:131`). Start and recovery persist `rebuild_admissions` (and `project_recovery_requests`) and wake the runner after commit. Save as template snapshots the current revision into a new template with the project's channel (`packages/app/src/slices/project-templates/from-project.ts:64`). Tests: `packages/app/test/revision-*.test.ts`, `packages/app/test/direct-recovery*.test.ts`, `packages/app/test/e2e/editable-projects.test.ts`.

## Dimensions not in play

- D1 authority: one local actor.
- D5 money: nothing is charged by Save/Restore; charges arise only from admitted work, shown as preview costs.
- D7 time: no revision expiry and no automatic history purge.
- D13 notification: no notification is sent by edits; run notices follow scenario 13's rules.
- D14 effects on others: other projects are untouched; scheduling reads a template's current version and never mutates an existing project's revision chain (`packages/app/src/slices/schedules/scheduler.ts:174`).
