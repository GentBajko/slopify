---
scenario: provided-outputs
mockup_row: S3
screens:
  - 06-play
  - 08-project
depends_on:
  - 01-pipeline-lifecycle
  - 03-placeholder-substitution
  - 04-run-admission
generated_date: '2026-09-13'
absorbed_from:
  - features/2026-09-10-editable-projects@2026-09-12
  - features/2026-09-10-play-redesign-drafts@2026-09-13
generated_at_commit: 7bdb84e3f57e
capstone_version: 5.2.0
paths_covered:
  - :(top)packages/app/src/slices/play-drafts/**
  - :(top)packages/app/src/slices/storage/**
  - :(top)packages/app/src/slices/revisions/**
  - :(top)packages/app/src/slices/project-templates/**
  - :(top)packages/app/src/slices/schedules/**
  - :(top)packages/web/src/play/**
  - :(top)packages/web/src/project/**
content_hash: cc56ad23132d
---

# 05 Provided outputs

A provided source uses local text/media. It needs no generation provider for that source. Existing projects may switch Generate/Provide/Off through a saved revision; Article never permits Off.

## Trigger & preconditions

The user chooses Provide during Play or project editing. Text is pasted; audio/images/thumbnail are uploaded to local staging. A revision mutation names its base revision and idempotency key. Project revision Save validates supplied inputs; Play may autosave incomplete attachment metadata, while active missing/copying inputs prevent reviewed Start (`packages/app/src/slices/revisions/schema.ts`, `packages/web/src/project/revision-workspace.tsx`, `packages/app/src/slices/play-drafts/convert.ts`).

## Steps

1. Text stages accept nonempty text. Article markdown is retained for display/download; Sources Consulted and Pronunciation Glossary are split into sidecars and the body becomes plain narration text. Revision article/prompt fields have bounded schema sizes; no blanket unlimited-text guarantee applies (`slices/revisions/schema.ts`, `mutation-prepare.ts`).
2. Audio is one staged media file; whole supplied narration is used as a complete recording. Generated narration also supports replacing an individual logical chunk with a supplied audio asset. Save probes replacement audio to obtain a finite positive duration before accepting it (`slices/revisions/mutation-assets.ts`, `mutation-prepare.ts`).
3. Images accept the supported PNG/JPEG/WebP formats, at most60 entries. The revision owns stable image keys, definitions and order; individual entries may be generated or supplied. Thumbnail is a separate single image and never part of slideshow ordering (`slices/admission/rules.ts`, `slices/revisions/schema.ts`, `slices/rebuild/recipe-visual.ts`).
4. Upload streams into staging. Single-file slots replace the prior pick; late upload callbacks are canceled/ignored when the user removes or replaces that choice. A mutation accepts only complete staged files of the destination's expected kind, or a retained asset actually owned by the project and supported by the destination contract (`edge/http/staging.ts`, `slices/revisions/mutation-assets.ts`).
5. Save copies newly supplied bytes into unique prepared asset paths and binds their output descriptors. After asynchronous audio inspection, recheck the mutation base/receipt and commit the new revision, asset registry, selected manifest and work transition atomically. Clean only uncommitted allocations on failure; leave staged sources available after a rejected save (`slices/revisions/mutations.ts`, `mutation-prepare.ts`).
6. Provided Article makes Research unnecessary in normal setup. Article remains downloadable with no media enabled. Audio Off permits silent video; whole Audio Provide disables synthesized intro/outro in the actual export timeline even if old entry files remain retained (`slices/admission/rules.ts`, `slices/rebuild/runtime-export-inputs.ts`).
7. Save marks supplied outputs and dependencies for reuse/review without dispatching providers. Rebuild presents dependency changes: the user replaces a provided dependent or explicitly confirms that its retained content still matches these exact inputs. Confirmation is revision/input-bound; later dependency changes require review again (`slices/rebuild/provided-review.ts`, `service.ts`).

Switching from supplied audio/thumbnail to generation and back reselects the original supplied asset when available. An inactive saved reference does not replace the generated selection. Newly reactivated missing originals produce field errors before Save; unchanged missing references do not block unrelated edits (`packages/app/src/slices/revisions/mutation-assets.ts:162`, `packages/app/src/slices/revisions/mutations-source-return.test.ts:1`).

## Branches

Play stores draft-owned attachment references and copies inputs only at explicit admission. Project revision Save instead imports new staged bytes into registered immutable assets. Inactive source choices retain their raw references without becoming active generation requirements. A Play fork gives references new IDs while sharing ready staged bytes; discarding one draft cannot remove another owner's bytes (`packages/app/src/slices/play-drafts/service.ts:212`, `packages/app/src/slices/storage/staging-refs.ts:1`).

Templates preserve provided-file placeholders but require reattachment in the fresh draft. Scheduled jobs reject templates whose active setup still provides whole audio, images or thumbnail because unattended reattachment is unavailable (`packages/app/src/slices/project-templates/setup.ts:37`, `packages/app/src/slices/schedules/service.ts:189`).

## Unhappy paths

- Empty text, incorrect media kind, invalid image definition/order, duplicate/unsupported upload destination or inaccessible replacement: typed field errors; no new revision/provider work.
- A retained narration piece is valid for a chunk replacement but is not automatically valid as a whole-stage supplied recording. Stage-specific validation rejects missing output descriptors as a recoverable edit error (`mutations-validation.test.ts`).
- Save conflicts after a slow audio probe: keep the newer committed revision; reject the stale edit and discard only its unregistered prepared copies. Duplicate accepted Save returns the original receipt.
- Local copy/probe/DB failure: retain the previous revision/downloads. Error classification does not hide an infrastructure failure as user validation.
- Missing previously supplied bytes: retain history metadata and report unavailable. Do not silently substitute a generated provider request; supply a replacement or change source explicitly.
- In Play, completed draft-owned attachments survive restart. Interrupted/missing uploads keep their filenames and require Reattach/Remove; failed prerequisite saves do not pretend a copy is live. Unreferenced abandoned staging can be cleaned, but shared draft references retain ready bytes (`packages/app/src/slices/play-drafts/uploads.ts`, `packages/app/src/slices/storage/staging-refs.ts`, `packages/app/src/slices/storage/reconcile.ts`, `packages/web/src/play/use-draft-uploads.ts`).

## State transitions

Play attachments expose pending/copying/ready/reattach; server rows retain pending/ready/reattach and process-local activity supplies copying. Project revisions retain prior output/asset records while new supplied choices enter the next revision (`packages/app/src/slices/play-drafts/model.ts`, `packages/app/src/slices/revisions/mutations.ts`).

## Invariants

Provided does not mean immutable project configuration: the user may explicitly change its source in a later revision. Retention does mean immutable earlier bytes and revision records. Saved edits do not rebuild or spend; generated work starts only after admission. Current and historical downloads preserve original filenames through their descriptors and revision-scoped URLs.

## Outcomes & side effects

Successful Play admission copies shared supplied inputs into each created project before releasing draft references. Rejected review/admission retains recoverable staging. Successful project revision Save binds prepared assets without rebuilding. See [draft lifetime](22-play-drafts.md).

## Dimensions not in play

No automatic draft expiration or storage quota is imposed. Choosing a supplied source does not imply a provider charge, and recurring schedules do not support unattended local-file reattachment (`packages/app/src/slices/schedules/service.ts:189`).

## Verification

`revisions/mutations-validation.test.ts`, `mutation-prepare.test.ts`, `mutations-cues.test.ts`, composed `test/revision-provided.test.ts` / `revision-restart.test.ts`, and web upload/editor regressions cover validation, conflict/cleanup, restart and retained output behavior. See scenario14 for storage lifetime and scenario12 for explicit Save/Restore/rebuild.
