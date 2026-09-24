---
host_cli_verified_at_commit: 9bd6517
absorbed_from:
  - features/2026-09-24-research-documents@2026-09-25
  - features/2026-09-24-host-cli-bridge@2026-09-24
  - features/2026-09-09-pausable-optional-runs@2026-09-10
  - features/2026-09-10-editable-projects@2026-09-12
scenario: image-generation
mockup_row: S7
screens:
- 06-play
- 08-project
depends_on:
- 01-pipeline-lifecycle
- 02-provider-credentials
- 03-placeholder-substitution
- 04-run-admission
- 05-provided-outputs
generated_date: '2026-09-12'
generated_at_commit: 29b88494eb40
---

# 09 Image generation

The images stage and prompt-driven thumbnail use revision-bound image recipes, sized to the selected aspect and reusable per request. The LLM-written thumbnail prompt is scenario 10.

## Trigger & preconditions

- Trigger: the scheduler starts saved-prompt images and a `from_prompt` thumbnail as soon as the project is admitted, in parallel with research or writing. Their templates and keywords were rendered before admission; they do not depend on generated Article text. A `prompt_by_llm` thumbnail still waits for Article.
- Preconditions: image provider keyed and model chosen; at least one image prompt ticked with a Number 1-20, total ≤ 60 (scenarios 02, 04); rendered prompt texts on the project (scenario 03); for the thumbnail, a thumbnail prompt selected.
- Edits: the user changes individual prompts, replaces images, removes rows or reorders the image list. Save retains media history and does not submit provider requests. Explicit preview/Start authorizes affected work (`slices/revisions/mutations.ts`, `slices/rebuild/service.ts`, `packages/web/src/project/image-editor.tsx`).

## Steps

1. Size: request the provider's closest supported size to the run's aspect, 16:9 or 9:16. Any remaining mismatch is fitted by scenario 11.
2. For each ticked image prompt, send its rendered text Number times as independent parallel calls; provider default quality and style; no seed control. Total images = sum of Numbers (scenario 04).
3. Each returned image is written as an immutable project asset and published to authorized revision owners with prompt/provider/model metadata. Compatible current owners receive it; incompatible results stay in the original revision. Image recipe identity includes rendered prompt, selected provider/model and aspect (`slices/rebuild/{recipe-visual,runtime-provider,runtime-publication}.ts`, `slices/revisions/publish.ts`).
4. Thumbnail from a thumbnail prompt: one call, same aspect rule, same storage fields, stored apart from the slideshow images.
5. Initial order follows selected prompts and repetition index; edited revisions use stable `imageOrder` keys. Reordering changes slideshow assembly without regenerating unchanged images. Replacing or changing one image affects that image and dependent rendering. The thumbnail is never in the slideshow (`slices/rebuild/recipe-visual.ts`, `slices/revisions/projection.ts`).
6. Project standings derive from current revision work, preserving separate image/thumbnail stages and exact per-request state. Retained media may remain visible while its replacement is outdated, pending or failed (`slices/rebuild/runtime-store.ts`, `packages/web/src/project/body-images.tsx`).

## Branches

- Codex CLI is an image provider without a stored API key. Docker sends a strict model/prompt/aspect request to the host helper. The existing Codex adapter owns a private workspace, safe exact-file validation and cleanup; only verified PNG/JPEG bytes up to 32 MiB return. No caller-chosen output path or host filesystem mount is accepted (`packages/app/src/host-cli/runtime.ts:72`, `packages/app/src/edge/http/host-cli.ts:248`).
- Codex 0.155.1 saves native image artifacts under CODEX_HOME/generated_images/<thread ID>. Slopify captures the unique thread.started ID and collects exactly one fresh regular single-link PNG-named artifact after a successful exit. It validates directory/file identity, bounded bytes and image format; it no longer asks the model to copy a result into its cwd. Originals stay in Codex. Missing, ambiguous, stale or unsafe artifacts fail terminally with a review-before-retry warning (`packages/app/src/adapters/image/codex-output.ts`).
- Container publication still writes immutable project-owned assets; completed images survive host-helper loss. Missing/expired CLI login is terminal missing_key, and helper/protocol/truncated-response failure is terminal unavailable without automatic replay. After a submitted connection is lost, the message warns that generation may already have happened and requires reviewed rebuilding (`packages/app/src/adapters/host-cli/index.ts:140`, `packages/app/src/kernel/runner/attempt.ts:28`).

- Thumbnail source: Off → skipped; Generate with a thumbnail prompt → step 4; Generate via LLM → scenario 10; Provide → scenario 05.
- Mixed generated/supplied rows are supported under Images Generate. Selecting Images Provide while generated rows remain returns a field error telling the user to replace/remove them; Save does not silently choose Generate (`slices/rebuild/recipe-save.ts`).
- Owned instruction text cannot serve as image or thumbnail media. Retained references require corresponding media roles or image piece kinds (`slices/revisions/mutation-assets.ts`).
- Deferred LLM-written thumbnail images still include the selected image provider/model in readiness and stale-preview catalogue snapshots (`slices/rebuild/{recipe-provider-choice,preview-plan,service-readiness}.ts`).
- Provider refusal and other errors follow classified retry policy (scenario 01).

## Unhappy paths

- Call fails → scenario 01's retry policy with a 300 s per-call timeout for image calls.
- One image exhausts its retries → the stage fails; completed images are kept; manual retry generates only the missing images.
- Content-policy refusal → that image fails immediately with the refusal text, no retries; the user edits the prompt and re-runs the stage (scenario 12).
- Thumbnail call fails → its own work fails; unrelated narration/images and exports follow their explicit recipe dependencies. Thumbnail artwork is not a slideshow-render input (`slices/rebuild/recipe-visual.ts`).
- Interrupted submitted request → durable recovery state requires explicit preview/retry when outcome is uncertain; completed assets and revision history remain retained (`slices/rebuild/repo.ts`, scenario 01).
- Cancel → scenario 13.

## State transitions

- Images stage and thumbnail stage: per scenario 01.
- Per image, persisted for resume: `pending` → `running` → `done` | `failed`.

## Invariants

- Current output completeness follows current image definitions; removed images remain historical assets, not active work.
- Slideshow order follows saved stable keys.
- The thumbnail is never part of the slideshow.
- Video waits for its complete image/audio/caption dependencies; a surviving member of an incomplete required bundle does not make that dependency ready (`slices/rebuild/runtime-store.ts`).

## Outcomes & side effects

- Success: the image set and, when requested, the thumbnail on the project, each with its metadata.
- Failure: stage `failed` with the provider's error or refusal text (scenario 01).
- Images made are counted by scenario 16 telemetry.

## Dimensions not in play

- No retained-media asset picker is implied by the owned-asset API contract.
- No image editing/generation provider beyond the selected configured models.
- D5 money: nothing charged in-app.
- D13 notification: no channel.
