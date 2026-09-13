---
absorbed_from:
- features/2026-09-09-pausable-optional-runs@2026-09-10
- features/2026-09-10-editable-projects@2026-09-12
scenario: narration
mockup_row: S6
screens:
- 06-play
- 08-project
depends_on:
- 01-pipeline-lifecycle
- 02-provider-credentials
- 05-provided-outputs
- 07-article-writing
generated_date: '2026-09-13'
generated_at_commit: 4cfe3473f74d
capstone_version: 5.2.0
paths_covered:
  - :(top)packages/app/src/slices/narration/**
  - :(top)packages/app/src/slices/rebuild/**
  - :(top)packages/app/src/kernel/runner/**
  - :(top)packages/app/src/adapters/tts/**
  - :(top)packages/web/src/play/**
  - :(top)packages/web/src/project/**
content_hash: 15c07d068892
---

# 08 Narration

Generated narration is planned as logical chunks and exact physical provider requests. Revisions share matching completed requests; changed text or request settings require an explicitly reviewed rebuild. Whole supplied audio follows the provided-content rules in scenario05.

## Trigger & preconditions

Audio Generate needs a resolved article and any selected entry text. New provider submissions require an enabled model, configured provider and saved voice. Save alone never starts narration; initial run admission or explicit rebuild supplies dispatch authority (`slices/rebuild/service.ts`, `service-readiness.ts`).

## Steps

1. Split Sources Consulted and Pronunciation Glossary end matter from the article. Preserve those sections as separate downloadable text; normalize the spoken body to plain text. Chapter headings remain spoken (`slices/article/split.ts`, `plain.ts`).
2. Choose logical body chunks: whole text, paragraphs, sentence-bounded word budget (default500), or sentence-bounded Unicode character budget (default3000). A sentence longer than the selected logical budget remains whole until provider-limit planning. Character budget supports1–1,000,000 (`slices/narration/chunk.ts`).
3. Assign stable logical identities from normalized text plus duplicate occurrence. Apply a saved text or provided-audio override for that logical chunk. Plan exact physical request pieces against the selected model's catalogue limit before dispatch; adapters do not invisibly split requests (`slices/rebuild/recipe-audio.ts`, `slices/narration/plan.ts`).
4. Request identity covers normalized text, provider/model/voice, segment and whole-text context when applicable. An explicit regeneration token prevents ordinary exact-request reuse. Reuse only matching completed pieces with available registered bytes; files from retained revisions can satisfy a new revision without another request (`slices/rebuild/narration-reuse.ts`, `runtime-narration-reuse.ts`).
5. Submit through the attempt wrapper and app-wide provider queue: at most five concurrent requests, with lower provider-specific limits. Check current work authority after waiting and before each new submission. Stream bounded audio previews when supported; key them by revision/work/piece (`kernel/runner/providers.ts`, `slices/rebuild/runtime-provider.ts`).
6. Concatenate physical parts in saved order into the body/entry output. A single part can be copied unchanged; multiple parts use FFmpeg. Intro and outro have independent text dependencies and their own logical group/request pieces with the same narration selection. Provided whole narration does not synthesize extra entries (`slices/rebuild/recipe-audio.ts`, `runtime-local.ts`).
7. Publish immutable audio, durations and request descriptors to the originating revision. A matching current revision may also select the result; an unrelated newer edit cannot be overwritten by an old completion (`slices/revisions/publish.ts`).

## Branches

- Edit one logical chunk's text, upload its replacement audio, or request Regenerate in the project editor. Save retains the edit without admitting work. Regenerate removes an incompatible asset override and staged upload, preserves a text override, and cancels late upload completion (`web/project/narration-editor.tsx`).
- Changes to normalized text or provider/model/voice prevent incompatible reuse. A paragraph edit can change neighboring boundaries; the preview shows the resulting affected pieces rather than promising one paragraph equals one request.
- Whole-text mode is one logical chunk and binds physical request identity to that entire text. Editing it invalidates the whole logical request context even if the provider limit required several physical requests; the rebuild review explains this limitation.
- Review labels retain original logical chunk numbers even for a selected subset. Expand request text and inspect provider/model/voice before explicit Start (`slices/rebuild/preview-details.ts`, `web/project/rebuild-review.tsx`).
- Changing only image order, subtitle style or manual caption timings retains compatible narration. Caption/export rebuilds are local unless other selected missing inputs require a provider.

## Unhappy paths

- Provider failure follows the attempt policy; completed physical pieces remain available for explicit retry. Reuse does not depend on the current provider still offering an old model when no new submission is needed.
- A current catalogue limit reduction may refuse new text above that limit. Readiness and request planning use the same catalogue maximum, including Inworld asynchronous requests above its streaming threshold (`service-request-limits.test.ts`).
- Accepted asynchronous jobs persist their continuation token on the exact piece. Recovery retrieves accepted work instead of creating a replacement job. A changed/revoked revision can retain its completion in history without enabling further requests.
- Interrupted or uncertain work remains explicitly resumable; uncertain paid submissions may need an additional repeat-charge acknowledgement. This is not a guarantee of exactly-once execution at an external provider.
- Empty normalized narration is unresolved/invalid and cannot silently produce a completed export.
- If final concatenation or WAV export fails, retained pieces and previous completed exports remain available. Missing export bytes are rebuilt locally from intact narration after review; surviving metadata alone is not a complete export bundle.

## State transitions

Logical narration starts as a planned request set; physical pieces move from pending to running and then done, or return to pending when a held provider attempt does not complete. The stage becomes done only after ordered concatenation and publication; pause or revision invalidation prevents further dispatch while already completed pieces remain reusable (`packages/app/src/slices/narration/run.ts:133`, `packages/app/src/slices/narration/run.ts:156`).

## Invariants

Save never performs provider or final-render work. Reuse requires exact request identity and actual available bytes. Each result retains original revision ownership. Audio Off permits silent video and turns incompatible subtitles Off; Video Off with active narration produces WAV.

Behavior is covered by `recipe-audio.test.ts`, `runtime-narration-{reuse,history,regenerate}.test.ts`, `service-request-limits.test.ts`, web `narration-regeneration.test.tsx`, and composed `test/revision-narration.test.ts` / `revision-bundle-recovery.test.ts`. Exact Windows durations are checked against real FFmpeg, including short clips and WAV recovery.

## Outcomes & side effects

Successful narration writes immutable physical part files, publishes ordered body/intro/outro outputs and records their durations. Live audio preview is bounded and keyed to the active project/work piece; reading it creates no provider request (`packages/app/src/slices/narration/run.ts:64`, `packages/app/src/slices/narration/run.ts:165`).

## Dimensions not in play

Narration has no automatic transcription, translation or voice cloning. English sentence segmentation is fixed for word/character chunk boundaries, while provider hard limits can split a long logical sentence into physical requests afterward (`packages/app/src/slices/narration/chunk.ts:72`, `packages/app/src/slices/narration/chunk.ts:85`).
