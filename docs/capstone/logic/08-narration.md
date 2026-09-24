---
absorbed_from:
- features/2026-09-24-narration-preparation@2026-09-24
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
3. Assign stable logical identities from normalized text plus duplicate occurrence. Apply a saved text or provided-audio override for that logical chunk. Off uses the existing physical planner. Optional Narration Preparation first binds a cue-only LLM answer to the exact source sentences, then renders paired tagged `text` and unchanged `spokenText` within the selected catalogue limit. All logical groups settle before physical ordinals materialize; adapters do not invisibly split requests (`slices/rebuild/{recipe-audio,recipe-preparation,recipe-audio-parts}.ts`, `slices/narration/{plan,preparation,steering}.ts`).
4. Request identity covers normalized text, provider/model/voice, segment and whole-text context when applicable. An explicit regeneration token prevents ordinary exact-request reuse. Reuse only matching completed pieces with available registered bytes; files from retained revisions can satisfy a new revision without another request (`slices/rebuild/narration-reuse.ts`, `runtime-narration-reuse.ts`).
5. Submit through the attempt wrapper and app-wide provider queue: at most five concurrent requests, with lower provider-specific limits. Check current work authority after waiting and before each new submission. Stream bounded audio previews when supported; key them by revision/work/piece (`kernel/runner/providers.ts`, `slices/rebuild/runtime-provider.ts`).
6. Concatenate physical parts in saved order into the body/entry output. A single part can be copied unchanged; multiple parts use FFmpeg. Intro and outro have independent text dependencies and their own logical group/request pieces with the same narration selection. Provided whole narration does not synthesize extra entries (`slices/rebuild/recipe-audio.ts`, `runtime-local.ts`).
7. Publish immutable audio, durations and request descriptors to the originating revision. A matching current revision may also select the result; an unrelated newer edit cannot be overwritten by an old completion (`slices/revisions/publish.ts`).

## Branches

- Narration Preparation defaults Off and is active only with generated Audio using Inworld `inworld-tts-2`, not Flash. It uses the shared LLM even with a supplied article, with one preparation request per body logical group and enabled intro/outro. The selected frozen prompt and slots survive drafts, templates, schedules and portable transfer. Save alone makes no request (`slices/admission/rules.ts`, `slices/rebuild/recipe-preparation.ts`).
- A provided-audio override bypasses preparation and TTS; a text override changes the source before preparation. Title, voice and audio-only regeneration retain compatible preparation. Source, prompt, LLM, thinking, format version or preparation regeneration changes invalidate it (`slices/rebuild/recipe-preparation.ts`, `runtime-preparation.test.ts`).
- Edit one logical chunk's text, upload its replacement audio, or request Regenerate in the project editor. Save retains the edit without admitting work. Regenerate removes an incompatible asset override and staged upload, preserves a text override, and cancels late upload completion (`web/project/narration-editor.tsx`).
- Changes to normalized text or provider/model/voice prevent incompatible reuse. A paragraph edit can change neighboring boundaries; the preview shows the resulting affected pieces rather than promising one paragraph equals one request.
- Whole-text mode is one logical chunk and binds physical request identity to that entire text. Editing it invalidates the whole logical request context even if the provider limit required several physical requests; the rebuild review explains this limitation.
- Review labels retain original logical chunk numbers even for a selected subset. Expand request text and inspect provider/model/voice before explicit Start (`slices/rebuild/preview-details.ts`, `web/project/rebuild-review.tsx`).
- Changing only image order, subtitle style or manual caption timings retains compatible narration. Caption/export rebuilds are local unless other selected missing inputs require a provider.

## Unhappy paths

- Invalid cue JSON, out-of-range or unordered sentence references, duplicate sound cues, and directives that cannot fit the current TTS cap fail through the bounded answer-attempt policy. TTS never falls back to unprepared text after failed preparation. Partial rebuild snapshots retain the selected TTS cap even when only preparation is selected (`preparation.ts`, `steering.ts`, `preview-plan.ts`, `revision-preparation-validation.test.ts`).
- Completed preparation survives restart and partial TTS failure. Uncertain submitted preparation requires explicit review and possible-repeat-charge acknowledgement; pause/cancel abort held requests. Late results publish only into compatible reserved revisions. Failed text-file publication removes pending files without deleting completed audio (`test/revision-preparation-{restart,control}.test.ts`, `runtime-narration-text.test.ts`).
- Provider failure follows the attempt policy; completed physical pieces remain available for explicit retry. Reuse does not depend on the current provider still offering an old model when no new submission is needed.
- A current catalogue limit reduction may refuse new text above that limit. Readiness and request planning use the same catalogue maximum, including Inworld asynchronous requests above its streaming threshold (`service-request-limits.test.ts`).
- Accepted asynchronous jobs persist their continuation token on the exact piece. Recovery retrieves accepted work instead of creating a replacement job. A changed/revoked revision can retain its completion in history without enabling further requests.
- Interrupted or uncertain work remains explicitly resumable; uncertain paid submissions may need an additional repeat-charge acknowledgement. This is not a guarantee of exactly-once execution at an external provider.
- Empty normalized narration is unresolved/invalid and cannot silently produce a completed export.
- If final concatenation or WAV export fails, retained pieces and previous completed exports remain available. Missing export bytes are rebuilt locally from intact narration after review; surviving metadata alone is not a complete export bundle.

## State transitions

Optional preparation persists validated cue plans before exact physical TTS work appears. Physical pieces move through pending/running/done or reviewed retry; ordered concatenation and local text-file publication complete the selected audio work. Pause or revision invalidation prevents further dispatch while completed pieces remain reusable (`packages/app/src/slices/rebuild/{runtime-run,runtime-provider,runtime-local}.ts`).

## Invariants

Feature-scoped verification on 2026-09-24: preparation preserves exact normalized source text and punctuation; the article Markdown is unchanged. English `Intl.Segmenter` sentences are one-based cue anchors. Instructions are 1–240 UTF-16 units without brackets, controls or markup; reset clears persistent steering. Only laugh, breathe, clear throat, sigh, cough and yawn sound cues are accepted. Provider splitting keeps tags and code points atomic, carries persistent instructions and never repeats one-shot sounds. The caption path consumes saved `spokenText`, not a regex-stripped script (`slices/narration/{preparation,steering}.ts`, `slices/rebuild/runtime-export-inputs.ts`). CLI LLM readiness remains installed-provider discovery rather than `models.yaml` (`catalog/runtime-models.ts`, `slices/rebuild/service-readiness.ts`). The older full-chapter snapshot above is not advanced by this scoped absorption.

Save never performs provider or final-render work. Reuse requires exact request identity and actual available bytes. Each result retains original revision ownership. Audio Off permits silent video and turns incompatible subtitles Off; Video Off with active narration produces WAV.

Behavior is covered by `recipe-audio.test.ts`, `runtime-narration-{reuse,history,regenerate}.test.ts`, `service-request-limits.test.ts`, web `narration-regeneration.test.tsx`, and composed `test/revision-narration.test.ts` / `revision-bundle-recovery.test.ts`. Exact Windows durations are checked against real FFmpeg, including short clips and WAV recovery.

## Outcomes & side effects

Successful narration writes immutable physical part files, ordered body/intro/outro outputs and durations. Each generated segment also exposes separate clean `narration_txt` and exact tagged `tts_script` downloads, retaining segment metadata and revision ownership. Reading downloads or live audio previews makes no provider request (`packages/app/src/slices/rebuild/{recipe-narration-text,runtime-narration-text,runtime-provider}.ts`, `packages/web/src/project/narration-downloads.tsx`).

## Dimensions not in play

Narration has no automatic transcription, translation or voice cloning. English sentence segmentation is fixed for word/character chunk boundaries, while provider hard limits can split a long logical sentence into physical requests afterward (`packages/app/src/slices/narration/chunk.ts:72`, `packages/app/src/slices/narration/chunk.ts:85`).
