---
generated_at_commit: d83482c1175e
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: 681b97b5a702
paths_covered:
  - ":(top)packages/app/src/slices/images/**"
  - ":(top)packages/app/src/slices/rebuild/recipe-visual.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-scenes.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-reference.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-appearance.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-cast.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-build.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-model.ts"
  - ":(top)packages/app/src/slices/rebuild/dependencies.ts"
  - ":(top)packages/app/src/slices/rebuild/soften.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-save.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-validation.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-image.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-actions.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-provider.ts"
  - ":(top)packages/app/src/slices/admission/rules.ts"
  - ":(top)packages/app/src/slices/admission/model.ts"
  - ":(top)packages/app/src/slices/revisions/adopt-content.ts"
  - ":(top)packages/app/src/slices/revisions/image-plan.ts"
  - ":(top)packages/app/src/slices/revisions/mutations.ts"
  - ":(top)packages/app/src/slices/estimate/index.ts"
  - ":(top)packages/app/src/slices/play-drafts/convert.ts"
  - ":(top)packages/app/src/slices/settings/model.ts"
  - ":(top)packages/app/src/adapters/image/**"
  - ":(top)packages/app/src/adapters/host-cli/index.ts"
  - ":(top)packages/app/src/host-cli/runtime.ts"
  - ":(top)packages/app/src/kernel/ports/image.ts"
  - ":(top)packages/app/src/kernel/runner/attempt.ts"
  - ":(top)packages/app/src/kernel/runner/retry-policy.ts"
  - ":(top)packages/app/src/catalog/validate.ts"
  - ":(top)packages/app/src/catalog/schema.ts"
  - ":(top)packages/app/src/assets/models.yaml"
  - ":(top)packages/app/src/edge/http/actions.ts"
  - ":(top)packages/app/src/edge/http/host-cli.ts"
  - ":(top)packages/web/src/project/body-images.tsx"
  - ":(top)packages/web/src/project/output-change.ts"
  - ":(top)packages/web/src/project/regenerate-by-number.tsx"
  - ":(top)packages/web/src/project/revision-workspace.tsx"
  - ":(top)packages/web/src/play/image-scale.tsx"
  - ":(top)packages/web/src/play/image-scenes.tsx"
  - ":(top)packages/web/src/play/reference-image.tsx"
  - ":(top)packages/app/src/slices/rebuild/recipe-shorts.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-shorts.ts"
  - ":(top)packages/web/src/project/confirmations.ts"
  - ":(top)packages/web/src/project/body-thumbnail.tsx"
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
- 12-reruns-and-edits
- 30-channels-and-cast
---

# 09 Image generation

The Images stage (slideshow images, the establishing image, image scenes and looks) and the prompt-drawn thumbnail, built as fingerprinted revision recipes and drawn by the configured image provider. The LLM-written thumbnail prompt is scenario 10; thumbnail A/B variants and the YouTube side are scenario 27; automatic image reviews are scenario 33; on-screen table/figure cards are scenario 11.

The revision runtime is the only live path. `runImages` in `packages/app/src/slices/images/run.ts:54` has no importer outside its own file; only its comments are cited by `slices/reruns/index.ts:155`. `revisionAction` in `packages/app/src/slices/rebuild/runtime-actions.ts:18` is imported only by its test.

## Trigger & preconditions

- Trigger: Start on Play admits the run (scenario 04); every image recipe becomes revision work whose `dependsOn` decides when it may run (`packages/app/src/slices/rebuild/recipe-build.ts:28-86`, `packages/app/src/slices/rebuild/dependencies.ts:23-62`). A plain image waits for nothing, or only for the establishing image. An image drawn from a scene waits for `images:scenes`. An image whose prompt has `{{Appearance}}` waits for `images:appearance`. Both of those wait for the article (`packages/app/src/slices/rebuild/recipe-scenes.ts:102-115`, `packages/app/src/slices/rebuild/recipe-appearance.ts:71-84`).
- Preconditions checked at admission (`packages/app/src/slices/admission/rules.ts:240-275`):
  - At least one image prompt is ticked.
  - Each Number is a whole number from 1 to `numberPerPromptMax` = 20 (`rules.ts:37`).
  - The Numbers total at most `imagesPerRunMax` = 60 (`rules.ts:38`).
  - A stored `imageScale` passes `imageScaleProblem`.
- Image provider and model are required whenever images are generated, a thumbnail comes from a prompt or the LLM, Shorts are on, or Animate images is on (`packages/app/src/slices/rebuild/recipe-validation.ts:51-62`).
- Establishing image from a prompt needs a picked prompt (`rules.ts:509-521`). A keyed provider's catalogue model must carry the `reference` keyword. The Codex CLI is exempt (`packages/app/src/catalog/validate.ts:85-96`, `packages/app/src/catalog/schema.ts:113-118`).
- Scenes from the article with Article Off is refused (`rules.ts:701-707`). Play's draft conversion drops `imageScenes` when Article is Off (`packages/app/src/slices/play-drafts/convert.ts:284-287`).
- Edit project (scenario 12): the user changes prompts or Numbers, replaces, removes or reorders images. Save writes a revision; explicit preview/Start authorizes the affected work.

## Steps

1. **Plan the images once.** When a run is adopted into its first revision, `adopt-content.ts` creates one `imageDefinitions` entry per image and fixes `imageOrder` (`packages/app/src/slices/revisions/adopt-content.ts:86-104`):
   - Each entry is `{source: "generate", prompt: rendered text, templateKey: "imagePrompts.N"}`.
   - The count per prompt is `imageCountsOf(config)` (`packages/app/src/slices/images/scale.ts:98-110`).
   - Without More images for long videos, the count is each prompt's Number.
2. **More images for long videos** (`RunDraft.imageScale`, `packages/app/src/slices/admission/model.ts:170-173`). It stores `{perHour, words}` (`scale.ts:21-26`):
   - Target: `min(max(ceil(words/150 × perHour/60 − 1e-9), 0), 240)` (`scale.ts:82-87`).
   - The 150 is `spokenWordsPerMinute` (`scale.ts:46`); 240 is `scaledImagesMax` (`scale.ts:41`).
   - Each prompt keeps its Number as a floor. The extra images (target minus the sum of Numbers) go round-robin to the ticked prompts, in prompt order (`scale.ts:103-108`).
   - Scaling applies only while Images is Generate (`scale.ts:90-94`).
   - `perHour` is 1-240 and `words` is 1-100000 (`scale.ts:30-31,42,120-129`).
   - Play's control spells it "One image every N minutes" or "N per hour" and starts at every 2 minutes (`packages/web/src/play/image-scale.tsx:23-24,76-83`, `scale.ts:69-78`).
   - `words` is the provided article's word count, or Play's expected words (default 1500, `scale.ts:44`).
   - The count is planned once and never recounted from the real narration (`scale.ts:8-16`).
   - A revision holds at most 240 images when scaled, else 60 (`scale.ts:49-51`, `recipe-validation.ts:63-68`).
3. **Scenes from the article** (`RunDraft.imageScenes`, `model.ts:174-177`; Play switch `packages/web/src/play/image-scenes.tsx:8-25`). One LLM step `images:scenes` reads the article (`recipe-scenes.ts:76-121`):
   - It writes one scene per generated image, in slideshow order. The scenes come from consecutive equal stretches of the article, so scene N comes from stretch N (`packages/app/src/slices/images/scenes.ts:52-83`).
   - The picture kind listed for each image is the prompt's `Composition:` line, else the prompt name (`scenes.ts:38-41`).
   - The prompt is written in the project language (`withLanguage`, `recipe-scenes.ts:98-101`).
   - The answer must be a JSON array of exactly the requested count of non-empty strings (`scenes.ts:141-164`). The count is read back from the `Pictures:`/`Thumbnails:` lines of the saved request (`scenes.ts:86-93`).
   - Where the scene goes (`scenes.ts:16-22`): if the body has `{{Scene}}`, the scene fills it. Otherwise it is inserted as a `Scene: …` line after the first paragraph.
   - With the switch off, any line holding `{{Scene}}` is removed (`scenes.ts:26-34`, `recipe-visual.ts:69-75`).
   - A `from_prompt` thumbnail whose prompt has `{{Scene}}` gets its own `thumbnail:scenes` step in the Thumbnail stage (`recipe-scenes.ts:36-74`). It writes one scene per thumbnail, each the most click-worthy moment from anywhere in the article (`scenes.ts:95-139`).
4. **Looks (`{{Appearance}}`)**. The step `images:appearance` runs when any image, `from_prompt` thumbnail, establishing prompt or (Shorts on) Shorts image prompt body contains `{{Appearance}}` (`recipe-appearance.ts:31-60`, `:62-93`). Its request names the project's kept subject (`subjectOf`, `recipe-appearance.ts:68`), so a rename does not redo it:
   - One web-searching LLM call (`llmInput(..., true)`, `recipe-appearance.ts:82`) returns `{subject, characters[]}` with names, aliases and a 2-4 sentence look each (`packages/app/src/slices/images/appearance.ts:27-52`).
   - The answer must name a subject with a look (`appearance.ts:54-81`).
   - Each picture gets the subject's look plus up to 3 characters its scene names as whole words (`appearance.ts:84-104`).
   - The subject is included only when the scene names it. A thumbnail always includes the subject (`recipe-visual.ts:328-332`), and so does each short's still, whose scene is the clip's text; until the looks exist a short's prompts recipe is `deferred` and waits for them (`packages/app/src/slices/rebuild/recipe-shorts.ts:130-151`; Shorts are scenario 28).
   - A picture naming nobody drops its `{{Appearance}}` line (`appearance.ts:107-115`).
5. **Establishing image** (`RunDraft.reference`, `model.ts:126-141`). It is active only while Images is Generate (`rules.ts:497-499`). It is one Images-stage step with key `reference:image`:
   - It is drawn from its Library image prompt with keywords filled, or it is the uploaded file (`packages/app/src/slices/rebuild/recipe-reference.ts:38-100`).
   - Every generated slideshow image and every short's image carry `reference: {fingerprint, assetId}` and depend on it (`recipe-visual.ts:117-123`, `recipe-reference.ts:104-117`). The thumbnail does too, unless `reference.thumbnail` is false; this applies only to a `from_prompt`/`prompt_by_llm` thumbnail (`rules.ts:502-507`, `recipe-build.ts:43-49`).
   - It is never in the slideshow and never in the thumbnail slot (`packages/web/src/project/body-images.tsx:30-33`).
6. **Cast pictures**. The channel's cast is frozen on the run (`RunDraft.cast`, `model.ts:231-233`; cast editing is scenario 30).
   - An image request names the members its prompt mentions, at most `castMembersPerImage` = 4, in order of first mention (`packages/app/src/slices/rebuild/recipe-cast.ts:9-31`).
   - The establishing image and the thumbnails also count members the project's kept subject mentions (`subjectOf`: the title the project was made with, unchanged by a rename; `recipe-reference.ts:93-95`, `recipe-visual.ts:364-365`, `packages/app/src/slices/admission/model.ts:285-290`).
   - Without a mention the request carries no `cast` field, so its fingerprint is unchanged (`recipe-reference.ts:120-124`).
7. **Build each image request.** For each `imageOrder` key, the recipe `image:<key>` is `{kind: "image", provider, model, thinking?, aspect: format, prompt, reference?, cast?}` (`recipe-visual.ts:107-126`, `recipe-reference.ts:26-36`):
   - While scenes or looks are pending, it is a `deferred` recipe (`operation: "image-scene"`) whose template names what it waits for (`recipe-visual.ts:81-105,213-259`).
   - `thinking` is added only when set, so older fingerprints are unchanged.
8. **Call the provider.** `imageCall` loads the extra images the request carries (`packages/app/src/slices/rebuild/runtime-image.ts:12-30`):
   - The establishing image comes from `project_assets` and must be PNG or JPEG (`runtime-image.ts:32-63`).
   - Cast pictures are read by SHA-256 from the channel image blobs (`runtime-image.ts:67-84`).
   - `aspect` is the project's format, `16:9`, `9:16` or `1:1` (`formats`, `packages/app/src/kernel/pipeline.ts:6`). The provider is asked for its closest size; the renderer fits any remainder (`packages/app/src/kernel/ports/image.ts:4-23`).
   - Provider behaviour, per adapter:

     | Provider | Size | Input images |
     |---|---|---|
     | OpenAI (`openai.ts:27-69,99-132`) | `sizeFor`: 1536x1024, 1024x1536, 1024x1024 for 16:9, 9:16, 1:1; `gpt-image-2*` models 1536x864, 864x1536, 1024x1024 (`openai.ts:30-43`) | Uses `/images/edits` with repeated `image[]` parts when pictures are attached. |
     | Google (`google.ts:87-105`) | `aspect_ratio`, plus `image_size: "2K"` on high-resolution models | Inline image parts. |
     | fal.ai (`fal.ts:45-86`) | `image_size` (`landscape_16_9`, `portrait_16_9`, `square_hd`) or `aspect_ratio` (`16:9`, `9:16`, `1:1`), per model (`fal.ts:54-57`) | `/edit` twins. |
     | Replicate (`replicate.ts:81-97`) | – | Refuses an establishing image; describes the cast in words. |

   - The note that introduces attached references, and the wording for cast members that did not fit, is `withReferences` (`packages/app/src/adapters/image/reference.ts:35-62`).
9. **Publish.** Each returned image becomes an immutable project asset in a revision output (role `image`, `reference` or `thumbnail`). The piece's fingerprint binds prompt, provider/model, aspect, thinking, reference fingerprint, cast and regeneration token (`packages/app/src/slices/rebuild/recipe-model.ts:225-240`).
10. **Order.** Slideshow order is `content.imageOrder`, a list of stable keys. Reordering changes only the render recipe, whose values list every image fingerprint in order (`recipe-visual.ts:150-174`).
11. **Thumbnail from a prompt.** There are `thumbnailCountOf(config)` variants, 1 or 3 (`packages/app/src/slices/admission/model.ts:117-124`):
   - Each is one image request with key `thumbnailKey(n)` (`recipe-visual.ts:280-375`). Its aspect is `thumbnailAspect(format)`: the project's format, except that a `1:1` project's thumbnail is drawn `16:9` (`recipe-visual.ts:361`, `packages/app/src/kernel/pipeline.ts:11-13`).
   - Variants 2 and 3 append a fixed composition instruction to the same prompt (`recipe-visual.ts:380-388`).
   - Thumbnail artwork is never a slideshow input.
12. **Regenerate** on the project page (`packages/web/src/project/output-change.ts:23-101`):
   - Asks first. For a project with revisions it saves a revision whose `regenerate` lists the image's work key, then starts review of only those keys (`packages/web/src/project/revision-workspace.tsx:333-360`).
   - The save gives each listed key a new `regenerationTokens` entry (`packages/app/src/slices/revisions/mutations.ts:122-124`), which changes that recipe's work fingerprint (`recipe-model.ts:225-234`).
   - With unsaved Edit project changes open, the keys are added to that draft and Edit project opens instead (`revision-workspace.tsx:339-344`).
   - It applies to a slideshow image, any generated thumbnail variant, or a generated establishing image. A thumbnail variant's confirmation reads "Regenerate this thumbnail?" and says the video and shorts are not touched and the PDF's cover follows the first thumbnail (`packages/web/src/project/confirmations.ts:77-84`, `packages/web/src/project/body-thumbnail.tsx:166-171`). Regenerating the establishing image warns that N images become outdated (`body-images.tsx:336-391`).
   - **Regenerate all** saves one revision listing every slideshow image key (`output-change.ts:103-140`). It confirms first: "Makes N new images now, one paid image call each. The video keeps the current ones until you remake it" (`body-images.tsx:119-140`).
   - The palette commands "Regenerate image N" and "Regenerate on-screen card N" take the slideshow number shown on the frame (`packages/web/src/project/regenerate-by-number.tsx:17-80`).
   - Delete of a slideshow image opens Edit project with the image removed from the draft (`output-change.ts:62-78`).

## Branches

- **Codex CLI.** It is an image provider with no stored key. In Docker, requests go to the host helper at `POST /v1/image` (`packages/app/src/edge/http/host-cli.ts:298-330`, `packages/app/src/adapters/host-cli/index.ts:175-232`). Natively they run `codexImage` (`packages/app/src/host-cli/runtime.ts:90-100`).
  - Model "Codex default" is `codex-imagegen`: no `-m`, no effort (`packages/app/src/adapters/image/codex.ts:37`). A chosen Codex model passes `-m` and `model_reasoning_effort` (`codex.ts:189`).
  - `view_image` is enabled only when the agent reviews its work: a chosen model or effort, or a reference to look at. Shell and skills are always disabled (`codex.ts:44-73,150-163`).
  - References are copied into the job folder and named for `referenced_image_paths` (`codex.ts:103,131`).
  - The result is the newest PNG under `CODEX_HOME/generated_images/<thread.started id>`, validated for identity and at most 32 MiB (`packages/app/src/adapters/image/codex-output.ts:18,32,79-98`). A second `thread.started` fails (`codex.ts:295-306`).
  - One Codex image may run 30 minutes (`agentImageTimeoutMs`, `packages/app/src/kernel/ports/image.ts:68-70`). Its live panel reports how many images the thread has drawn so far (`codex.ts:252-255`, `codex-output.ts:55-75`).
  - Four Codex images run at once; other local CLIs run three (`localCliConcurrency`, `packages/app/src/slices/settings/model.ts:39-41`).
- **Keyed providers' concurrency** is `maxConcurrent` from the catalogue: 3 each for fal, replicate, openai-image and google-image (`packages/app/src/assets/models.yaml:19-26`). The default is 1, capped at 5 (`packages/app/src/main.ts:884-888`, `packages/app/src/catalog/schema.ts:78`).
- **Scenes on, image not generated.** Provided rows and rows with an empty prompt take no scene (`recipe-scenes.ts:84-97`). With no generated row, there is no scenes step.
- **Thumbnail source.** Off → no recipe. Provide → provided recipe (scenario 05). `from_prompt` → step 11. `prompt_by_llm` → the prompt comes from scenario 10's text recipe, then step 11 (`recipe-visual.ts:291-312`).
- **Mixed generated and provided rows** are allowed under Images Generate. Choosing Provide while generated rows remain returns the field error "Replace or remove generated images before choosing Provide." (`packages/app/src/slices/rebuild/recipe-save.ts:249-256`).
- **Changing prompts or Numbers in Edit project** re-plans definitions with `replanImagePrompts`. Every definition an unchanged prompt already has is kept, so its fingerprint and image stay (`packages/app/src/slices/revisions/image-plan.ts:1-10`, `mutations.ts:264-311`). Changing prompts while Images is not Generate is refused (`mutations.ts:288-298`).
- **Deleting the last image** (legacy action path) sets Images and Video to Off and turns burn-in captions into files (`runtime-actions.ts:71-80`).
- **Old HTTP routes.** `DELETE /projects/:id/images/:outputId` and `POST /projects/:id/images/:outputId/regenerate` answer 409 `revision-required` (`packages/app/src/edge/http/actions.ts:305-322`).
- **Estimate.** It shows planned images, "N images for about M minutes of narration" when scaled. It adds one "Image scenes" LLM request when scenes are on, and one image when the establishing image comes from a prompt (`packages/app/src/slices/estimate/index.ts:270-297`).

## Unhappy paths

- **Call fails.** Scenario 01's two-tier retry applies:
  - Quick in-call retries run under a 300 s image timeout (`packages/app/src/kernel/runner/attempt.ts:16-24`), or the provider's own `timeoutMs` (Codex 30 min, `attempt.ts:69`).
  - After those, `rate_limit`/`timeout`/`dropped` wait about 2, 4, 8 and 16 minutes (`packages/app/src/kernel/runner/retry-policy.ts:12-17`).
- **Content-policy refusal** is terminal with no retries (`attempt.ts:26-35`). The step shows Soften and retry: the project's LLM rewords the refused prompt inside the image step, then it is drawn again (`packages/app/src/slices/rebuild/soften.ts:5-24`, `packages/app/src/slices/rebuild/runtime-provider.ts:235-263`). The softenable steps are every refused image of Images or Thumbnail and, in the Video stage, only refused short stills (`shorts:N:image:M`) (`softenableKeys`, `soften.ts:26-40`; route `packages/app/src/edge/http/actions.ts:268-283`); a short's still is softened the same way in `packages/app/src/slices/rebuild/runtime-shorts.ts:254-275`. Soften is scenario 12's control.
- **Scenes answer wrong** (not an array, wrong count, an empty scene): the step fails with "The AI model wrote N image scenes for M images. Use Try again; …" or a sibling sentence (`scenes.ts:141-164`, `runtime-provider.ts:269-278,306-321`).
- **Looks answer without a subject look** fails the same way (`appearance.ts:54-71`, `runtime-provider.ts:280-284,322-333`).
- **Establishing image missing or unreadable** at call time: "The establishing image this image is drawn from is missing. Use Regenerate on the establishing image …" (`runtime-image.ts:38-56`). A non-PNG/JPEG upload asks for a PNG or JPEG (`runtime-image.ts:57-61`).
- **Cast picture not in the database** (a backup from another install): the error names the member and points to Channels → Cast, then start again from Play (`runtime-image.ts:75-81`).
- **Replicate with an establishing image** is refused by the adapter (`packages/app/src/adapters/image/replicate.ts:81-86`). Admission refuses a catalogue model without `reference` (`validate.ts:85-96`).
- **Codex CLI.**
  - Missing or expired login is terminal `missing_key`.
  - Helper, protocol or truncated-response failure is terminal `unavailable` (`attempt.ts:29-35`, `adapters/host-cli/index.ts:219-232`).
  - A missing, stale or unsafe artifact fails without replay (`codex-output.ts:79-98`).
  - A run that drew no image for its thread while stderr or the agent's last message matches `moderation_blocked`, "rejected by the safety system", "safety filter/system", "content polic…" or "refus…" is a terminal `refusal` quoting the agent's message, so Soften and retry is offered (`codex.ts:196-198`, `:286-287`, `:346`, `:381-390`).
- **One image exhausts its retries.** Its work fails. Sibling images that finished stay published, and Try again runs only work whose fingerprint has no retained result (`dependencies.ts:27-47`).
- **Concurrent edits while regenerating.** Regenerate and Regenerate all are disabled while work is running ("Wait until the work on this project is done", `body-images.tsx:119-127`). They are also disabled while an action is pending (`output-change.ts:92-96`).
- **Palette number out of range** gets a toast naming the valid range (`regenerate-by-number.tsx:34-46`).
- **Cancel** → scenario 13.

## State transitions

- Images stage and Thumbnail stage follow scenario 01.
- Per image piece in `revision_work_pieces.state`: `pending` → `running` → `done` | `failed`, plus `held` for a paused or checkpointed run (`packages/app/src/kernel/db/migrations/0005-revision-work.sql:23-35`).
- Per image output after an edit, set by `recipe-save.ts:195-214`:
  - Fingerprint unchanged → `ready`.
  - Fingerprint changed → `outdated`; a provided source changed → `review`.
  - A result whose fingerprint matches again (undo) returns to `ready`.
- The recipe for a deferred image turns into an `image` request once its scenes or looks exist (`recipe-visual.ts:210-260`).

## Invariants

- Slideshow order is `imageOrder`, never arrival order.
- The establishing image and the thumbnails are never slideshow images (`recipe-visual.ts:42-127`, `body-images.tsx:30-33`).
- A request with no cast mention, no thinking, no reference and no scene has the same fingerprint it had before those features existed (`recipe-visual.ts:98-99`, `recipe-reference.ts:24-36,120-124`, `recipe-cast.ts:4-6`).
- A scaled count is planned once; a retry or rebuild never re-plans it (`scale.ts:15-16`, `adopt-content.ts:90-92`).
- A revision holds at most 60 images, or 240 when scaled (`recipe-validation.ts:63-68`, `packages/app/src/slices/revisions/schema.ts:48`).
- Regenerating the establishing image or re-writing the scenes marks every image drawn from it outdated; they keep their current version until remade (`body-images.tsx:389-391`).

## Outcomes & side effects

- Success: images and thumbnails are published as revision outputs with prompt, provider and model metadata. The project page fills in as each lands (`body-images.tsx:40-200`).
- Failure: the step is `failed` with the provider's error, refusal text or a check sentence (above).
- Paid calls: one image call per image, plus the scenes and looks LLM calls. The live cost meter is scenario 37. Codex images report tokens and plan windows (`packages/app/src/kernel/ports/image.ts:31-38`).
- The photorealistic flag on an Image prompt feeds Studio's AI-use answer (scenario 15, scenario 32).

## Dimensions not in play

- D5 money: nothing is charged in-app. Provider spend is shown by the estimate and the cost meter (scenario 37).
- D13 notification: image completion raises no notification of its own. Run-level notifications are scenario 39.
- Seed and quality: no seed control. Quality and style are the provider's defaults, except Google's `image_size: "2K"` on high-resolution models (`google.ts:104-105`).
