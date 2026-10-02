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
absorbed_from:
  - features/2026-09-10-editable-projects@2026-09-12
  - features/2026-09-10-play-redesign-drafts@2026-09-13
generated_at_commit: e9226a34aa8a
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: 2dd94da8e389
paths_covered:
  - ":(top)packages/app/src/slices/admission/**"
  - ":(top)packages/app/src/slices/play-drafts/**"
  - ":(top)packages/app/src/slices/storage/**"
  - ":(top)packages/app/src/slices/revisions/**"
  - ":(top)packages/app/src/slices/rebuild/provided-review.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-export-inputs.ts"
  - ":(top)packages/app/src/slices/project-templates/setup.ts"
  - ":(top)packages/app/src/slices/schedules/service.ts"
  - ":(top)packages/app/src/edge/http/staging.ts"
  - ":(top)packages/web/src/play/**"
  - ":(top)packages/web/src/project/**"
  - ":(top)packages/app/src/slices/batch/index.ts"
  - ":(top)packages/app/src/slices/rebuild/service.ts"
  - ":(top)packages/app/src/slices/rebuild/preview-retained.ts"
  - ":(top)packages/app/src/kernel/runner/graph.ts"
---

# 05 Provided outputs

A provided source uses the user's own text or file and needs no generation provider for that source. Provide exists for Research, Article, Audio, Images and Thumbnail; Video and Document have no Provide (`allowedSources`, `packages/app/src/slices/admission/rules.ts:86`). Beyond stage sources, a run can carry its own establishing image, shorts background music and ambient-sound file. Existing projects switch Generate/Provide/Off through a saved revision.

## Trigger & preconditions

- The user chooses Provide on Play or in Edit project. Text is pasted; audio and images are uploaded into staging (`POST /api/staging/:kind`, `packages/app/src/edge/http/staging.ts:32`). Staging validates the filename only; image type is limited by the pickers' `accept="image/png,image/jpeg,image/webp"` (`packages/web/src/play/media-rails.tsx:304`, `packages/web/src/project/revision-upload.tsx:115`).
- Play uploads belong to draft attachments of kind `audio`, `images`, `thumbnail` or `reference` (`draftAttachmentKinds`, `packages/app/src/slices/play-drafts/schema.ts:28`). An upload is refused unless the draft is `active` and the attachment is `pending` with no staged file (`uploadDraftAttachment`, `packages/app/src/slices/play-drafts/uploads.ts:8`).
- A revision edit names its base revision and idempotency key; Save validates supplied inputs (`saveRevision`, `packages/app/src/slices/revisions/mutations.ts:58`).

## Steps

1. Admission checks (`checkProvided`, `packages/app/src/slices/admission/rules.ts:277`): Research Provide needs nonblank notes; Article Provide needs nonblank text; Audio and Thumbnail Provide need one staged file of that stage kind; Images Provide needs 1–60 files with no duplicates (`packages/app/src/slices/admission/rules.ts:299`). Each file must exist, match the kind and be fully `staged`, else "no longer available" or "still uploading" (`checkFile`, `packages/app/src/slices/admission/rules.ts:346`). The establishing image upload is checked only while Images Generate uses a provided reference (`packages/app/src/slices/admission/rules.ts:171`); shorts music only while Shorts is on (`packages/app/src/slices/admission/rules.ts:324`); the ambient-bed file only while its source is `upload` and the bed is used (`packages/app/src/slices/admission/rules.ts:568`).
2. Provided Article normalises Research Off (`packages/app/src/slices/admission/rules.ts:214`). Audio Provide drops intro/outro from the run (`packages/app/src/slices/admission/rules.ts:235`) and from the export timeline (`packages/app/src/slices/rebuild/runtime-export-inputs.ts:102`).
3. Start copies inputs inside the project transaction (`attachProvided`, `packages/app/src/slices/admission/start.ts:155`): research notes stored as text; article stored via `storeArticleText`, which splits end matter the same way a written article is split (`packages/app/src/slices/admission/start.ts:171`); audio as `audio_body`; thumbnail as `thumbnail`; reference as `reference`; images as `image` with index = list order (`packages/app/src/slices/admission/start.ts:186`). Shorts music and ambient bed become project assets named by the baseline revision (`packages/app/src/slices/admission/start.ts:196`, `packages/app/src/slices/admission/start.ts:215`). Files are copied, not moved, so a rollback leaves staging intact (`packages/app/src/slices/admission/start.ts:113`).
4. The stage row starts `provided` (`packages/app/src/slices/admission/start.ts:38`).
5. Edit project uploads bind to a destination: `provided` (audio, thumbnail, reference), `narration` (replace one `audio:` chunk), `image` (one image key) or `shortsMusic` (`bindUpload`, `packages/app/src/slices/revisions/mutation-assets.ts:25`). `validateUploads` rejects a destination whose section is off or not set to Provide, music with Shorts off, the same file or destination twice, a staged file that is missing/unfinished/wrong kind, a vanished image key, and a narration key not starting `audio:` (`packages/app/src/slices/revisions/mutation-assets.ts:49`).
6. `validateAssetReferences` requires every referenced asset to belong to the project and to have been an output of the right stage/role — or, for image and narration overrides, a matching piece or earlier override (`packages/app/src/slices/revisions/mutation-assets.ts:112`). Shorts music must be this edit's upload or an earlier revision's music; the ambient-bed file must be one an earlier revision named (`packages/app/src/slices/revisions/mutation-assets.ts:184`, `packages/app/src/slices/revisions/mutation-assets.ts:200`).
7. `prepareEditAssets` copies each staged upload into a new asset, probes audio duration (finite, ≥ 0), rebinds reselected retained images and provided audio/thumbnail/reference with fresh output IDs, and re-prepares article text (`article_md`, `article_txt`, `sources`, `glossary`) and research notes only when they changed or are unselected (`packages/app/src/slices/revisions/mutation-prepare.ts:23`, `packages/app/src/slices/revisions/mutation-assets.ts:217`). On error it discards what it allocated (`packages/app/src/slices/revisions/mutation-prepare.ts:197`).
8. Save rechecks the mutation receipt and base inside the transaction, replans, re-validates references against prepared assets and commits the revision, manifest and work transition atomically (`packages/app/src/slices/revisions/mutations.ts:116`).
9. Rebuild lists provided work whose dependencies changed as `providedReuseRequired`; Start refuses with `review-required` until each key is confirmed (`rebuildConfirmations`, `packages/app/src/slices/rebuild/service.ts:35`). A confirmation is stored per revision with a dependency fingerprint and applies only while that fingerprint still matches (`packages/app/src/slices/rebuild/provided-review.ts:5`, `packages/app/src/slices/rebuild/provided-review.ts:21`).

## Branches

- Play keeps draft-owned attachment references and copies bytes only at Start; project Save imports new staged bytes into registered assets immediately (`packages/app/src/slices/admission/start.ts:155`, `packages/app/src/slices/revisions/mutation-prepare.ts:41`).
- Inactive source choices keep their raw references without becoming requirements; switching back to Provide reselects the original asset when available (`validateReplacementAvailability`, `packages/app/src/slices/revisions/mutation-assets.ts:272`; covered by `packages/app/src/slices/revisions/mutations-source-return.test.ts`).
- A draft fork gives attachment references new IDs while sharing ready staged bytes (`forkDraft`, `packages/app/src/slices/play-drafts/service.ts:214`; `stagedFileReferenced`, `packages/app/src/slices/storage/staging-refs.ts:7`).
- Templates keep provided-file names but give each a new attachment ID, so the file is attached again on Play (`freshTemplateDraft`, `packages/app/src/slices/project-templates/setup.ts:58`).
- Schedules refuse a template that provides audio, images or thumbnail, uses shorts music, an uploaded ambient bed, or a provided establishing image (`unsupported-media`, `packages/app/src/slices/schedules/service.ts:221`).
- A batch deletes staged sources it consumed unless they are retained for Play (`enqueueBatch`, `packages/app/src/slices/batch/index.ts:41`).

## Unhappy paths

- Empty text, missing/unfinished/wrong-kind file, duplicate image, or over 60 images at admission: typed field errors; no project (`packages/app/src/slices/admission/rules.ts:277`).
- A file vanishing between admit and write throws inside the transaction; the project is rolled back and written music/bed copies are discarded (`packages/app/src/slices/admission/start.ts:142`, `packages/app/src/slices/admission/start.ts:253`).
- A missing replacement file on Save: "The replacement file is missing. Upload it again." (`packages/app/src/slices/revisions/mutation-assets.ts:311`).
- Save conflict after slow audio probing: the stale edit is rejected and only its unregistered prepared copies are discarded; a duplicate accepted Save replays its receipt (`packages/app/src/slices/revisions/mutations.ts:116`).
- A failed Play upload marks the attachment `reattach` with "The upload failed. Attach the file again." (`packages/app/src/slices/play-drafts/uploads.ts:53`). Interrupted uploads keep their filenames and need Reattach/Remove (`packages/web/src/play/use-draft-uploads.ts`).
- Missing previously supplied bytes stay recorded as unavailable; no generated request is substituted (`packages/app/src/slices/rebuild/preview-retained.ts:9`).

## State transitions

- Draft attachment: `pending` → `ready`, or `reattach` on failure; `copying` is process-local activity (`packages/app/src/slices/play-drafts/model.ts:34`, `packages/app/src/slices/play-drafts/uploads.ts:61`).
- Staged file: `staged` once complete; released when no draft or project references it (`releaseStagedFile`, `packages/app/src/slices/storage/staging-refs.ts:14`); boot reconciliation cleans unreferenced staging (`reconcileStorage`, `packages/app/src/slices/storage/reconcile.ts:14`).
- Stage row: `provided` at start; a later revision may move the source to Generate or Off.
- Rebuild work for a changed provided dependency: disposition `review` → `reuse` (provided) or `local` once confirmed (`packages/app/src/slices/rebuild/provided-review.ts:40`).

## Invariants

- A run never starts with a provided file that is missing or still copying (`packages/app/src/slices/admission/rules.ts:345`).
- A supplied headline stage does not count as made for the `partial` verdict (`packages/app/src/kernel/runner/graph.ts:83`).
- Earlier revisions' bytes and records are immutable; a new supplied choice enters the next revision only.
- Saving provided content never rebuilds or spends; generated work starts only after admission.
- An asset referenced by a revision belongs to that project (`packages/app/src/slices/revisions/mutation-assets.ts:141`).

## Outcomes & side effects

Successful admission copies supplied inputs into each created project before releasing draft references (`packages/app/src/slices/play-drafts/start.ts:116`). Rejected review/admission keeps recoverable staging. A successful Save binds prepared assets without rebuilding. See 22 Play drafts and 14 Storage and downloads.

## Dimensions not in play

- Storage quota or automatic draft expiry: none in admission or revisions.
- Money: a supplied source makes no provider call for that source.
- Unattended reattachment: schedules cannot supply local files (`packages/app/src/slices/schedules/service.ts:231`).
- Server-side image format sniffing: not implemented; staging stores bytes by stage kind (`packages/app/src/edge/http/staging.ts:32`).
