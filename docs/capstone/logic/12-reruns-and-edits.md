---
absorbed_from:
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
generated_date: '2026-09-12'
generated_at_commit: 803bd5555d76
---

# 12 Project edits and retained revisions

An existing project can change its setup, text, media and captions while retaining completed outputs. Saving creates a revision. Rebuilding requires a separate dependency and cost review followed by explicit Start.

Review checkpoints are an additional revision-bound hold. The project page can add or remove a pending Audio, Images or Video/export gate with an explicit Save; approval is a separate exact-fingerprint transaction and never starts a rebuild.

## Trigger and preconditions

The project page exposes Edit project, revision history and Rebuild affected outputs. Article remains required. Editing does not require idle stages or current provider credentials: readiness is checked when paid work is admitted. A legacy project acquires a baseline revision without generation before entering this flow.

Save and Restore carry the current base revision and a UUID idempotency key. A stale base returns a recoverable conflict rather than replacing another edit. Repeating an accepted request returns its original receipt even if the project subsequently advanced; the client reloads the actual current head instead of displaying the old receipt as current.

## Save

1. Edit configuration and content locally: title, aspect ratio, source choices, keyword values, project prompt snapshots, providers/models/voice, chunking, entries, silence and subtitles. The saved prompt library is not modified. Unavailable saved model/library choices remain visible until explicitly replaced.
2. Uploads stage separately. Save binds each ready staged file to an explicit output or narration destination; incomplete uploads and invalid edits stay unsaved with field errors.
3. Validate the proposed setup, content references and manual caption timeline. Article Generate/Provide is required; Video needs an image. Disabling the last image requires Video Off or a replacement in the same edit. Audio Off allows silent video. Video Off with Audio enabled produces WAV.
4. Prepare immutable assets, then transactionally create the new revision, clone reusable manifest references, update the project title/format/config and head, and record the receipt. A head changed during preparation is rechecked before commit. Uncommitted files are discarded without deleting referenced history.
5. Compare dependency fingerprints and physical request identities. Unchanged completed media is shared. Affected outputs are outdated or missing; prior finished files remain available. Supplied ready content is projected immediately, without a provider call.
6. Saving grants no new work and starts no renderer. Changed work that has not been submitted loses authority. Already submitted work may still be billed and can finish only under its original ownership. Independent unchanged work can continue and attach to the new revision when its inputs still match.

## Dependency and cost review

Rebuild affected outputs prepares a preview for the saved revision. The preview identifies changed inputs, affected work, reusable outputs, provided content requiring confirmation, and known/unknown charges. The execution snapshot binds recipes, inputs, request settings, catalogue data and whether selected work requires a new submission. Unknown charges are not displayed as free.

Start checks the same base, preview identity and acknowledgements again. Changed inputs, expired readiness or a free in-flight join that has become a paid retry require a fresh review. Work that can now be joined without another charge can be reused. Provider readiness runs outside the database transaction, followed by a final atomic recheck before admission.

Completed requests and assets within the revision are reused. Retained asynchronous provider jobs can be retrieved without submitting again; their retrieval does not require admitting a replacement job under a changed model or key. An unknown prior submission is reported before an explicit retry because it may already have been billed.

A duplicate Start returns the same admission and work IDs. Transport failure preserves the client's exact request body and idempotency key. A response lost after acceptance cannot authorize a second chargeable start.

## Edits and affected work

| Edit | Reuse and invalidation |
|---|---|
| Title | Keep media; current downloads use the new revision title and historical downloads retain their own title |
| Article text | Reuse identical physical narration requests; rebuild changed narration and dependent timing/export; article-dependent entries/thumbnail change, saved literal image prompts stay independent |
| Narration voice/model/settings | Regenerate requests whose request-relevant settings changed; retain old voice outputs in history |
| Whole-request narration text | Rebuild the whole request; the preview explains that there are no smaller reusable chunks |
| Individual narration group | Explicit text override, replacement audio or regeneration affects the selected logical group and dependent assembly; identical other requests remain reusable |
| Image replace/add/delete/order/prompt | Change visual export and selected image generation only; retain narration and WAV |
| Intro/outro | Separate text/audio dependencies; body narration remains reusable when unchanged |
| Subtitle font/size/position/mode | Reuse timing where valid, rewrite required sidecars/burned video, retain unchanged WAV |
| Manual caption text/start/end | Retain the cue edit as content, rebuild sidecars/burned export without narrating again |
| Input of provided downstream content | Require review of its continued use or replacement; never silently switch provided content to paid generation |

Narration reuse compares normalized text plus provider, model, voice, pronunciation and request context. Chunk-boundary changes can invalidate multiple requests. Explicit regeneration adds identity that prevents an older matching result from replacing the requested new output. Usage counts new physical requests, not reused files or local concatenation.

Caption times must be ordered, nonnegative, have end greater than start, and fit the measured narration duration. Invalid numeric drafts remain visible and unsaved. Manual cues bind to their reviewed audio fingerprint; later narration changes mark them outdated rather than silently overwriting them with alignment output.

## History and restore

Each revision retains its configuration, content and manifest. Shared immutable assets avoid copying unchanged large files. History exposes selected and retained output downloads through revision/record URLs, including image archives and Open folder. Current headed pages also use immutable record URLs; they do not fall back to a mutable file-role URL while the manifest is loading.

Restore creates a new current revision whose parent is the previous head and whose restored-from ID names the selected historical revision. The historical revision is never rewritten. Retained available assets are reused and missing external files stay visibly unavailable. Restore grants no new provider or render work.

No automatic history purge occurs here. Explicit project deletion removes that project's history and assets through the existing deletion flow. Storage management is a separate capability.

## Controls, recovery and failures

- Pause and Cancel carry their own base revision and UUID. An uncertain control response retains that identity even if live events advance the head.
- Unconditional legacy article/provider/subtitle/rerun/image mutations refuse with a revision-required response. Legacy Resume/Retry refuses with rebuild-required; current unfinished work uses reviewed rebuild admission.
- Disk or database failure before Save commits leaves the prior head and completed outputs intact. Staged-file consumption and prepared-asset cleanup respect committed ownership.
- Failed provider work, alignment or encoding retains the last finished export and leaves the desired revision needing work.
- On restart, saved revisions and retained files survive. Interrupted work is held for explicit reviewed continuation; completion order alone cannot publish an old result as current.
- Missing retained files remain visible in history and preview. Explicit rebuild can recreate eligible generated work; provided content requires a replacement or appropriate review.
- Late uploads after removal, replacement, discard or unmount cannot resurrect stale controls. Concurrent uploads merge into the latest draft and Save stays blocked while input work is pending.
- Live text/audio events are filtered by current work ownership and matching inputs, not just the project ID. An old revision's preview cannot overwrite current content.
- Checkpoint status and gate choices reconcile revision and gate-set identity across tabs. A selected closure stays held through restart; unchanged approvals carry across immutable revisions while affected inputs invalidate them.

## Invariants and evidence

Save and Restore never initiate generation. Accepted work executes under revision/piece authority, and only matching results may attach to the current revision. History is append-only until explicit project deletion. Library edits cannot silently replace a saved project prompt snapshot. Last finished exports remain accessible until successful replacement.

The revision API and mutation rules are implemented in `packages/app/src/edge/http/revisions.ts` and `packages/app/src/slices/revisions/`. Rebuild review/admission and execution are in `packages/app/src/slices/rebuild/`. The project editor and immutable-media client are in `packages/web/src/project/`. Composed race/restart tests are `packages/app/test/revision-*.test.ts`; actual boot, legacy migration, staged MP3, explicit WAV, restore and immutable-download acceptance is `packages/app/test/e2e/editable-projects.test.ts`.
