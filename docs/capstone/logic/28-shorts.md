---
scenario: shorts
screens:
- 06-play
- 08-project
- 04-prompts
depends_on:
- 03-placeholder-substitution
- 04-run-admission
- 09-image-generation
- 11-video-assembly
- 12-reruns-and-edits
- 14-storage-and-downloads
- 15-prompt-management
- 17-subtitles
- 27-youtube-description
generated_date: '2026-09-26'
capstone_version: 5.2.0
paths_covered:
  - :(top)packages/app/src/slices/shorts/**
  - :(top)packages/app/src/slices/rebuild/recipe-shorts.ts
  - :(top)packages/app/src/slices/rebuild/runtime-shorts.ts
  - :(top)packages/app/src/kernel/db/migrations/0019-shorts-prompts.sql
  - :(top)packages/web/src/play/shorts.tsx
  - :(top)packages/web/src/project/body-shorts.tsx
  - :(top)packages/web/src/project/revision-shorts.tsx
---

# 28 Shorts

An optional step inside the Video stage: once the narration's words are timed, the project's text model picks the best self-contained moments, each becomes a vertical 1080×1920 clip with new 9:16 images and big word-by-word captions, and each gets a title, a one-line description and hashtags. It runs beside the render and the YouTube description, fully automatically, with no review checkpoint and no stage of its own.

## Trigger & preconditions

- A per-project `shorts` setting (`packages/app/src/slices/shorts/model.ts`): `enabled` (absent or false is Off, the default), `count` 1–10 (default 3), `minSeconds` and `maxSeconds` 15–180 (defaults 60 and 120, min ≤ max), an optional Shorts prompt name `prompt` and an optional Image prompt name `imagePrompt` (absent or blank is the built-in wording in the same file). Off keeps the numbers and prompts. The seconds each image is held reuse the project's `imageSeconds`.
- Set on Play's Export rail below the YouTube description, and in Edit project → Prompts below it (`packages/web/src/play/shorts.tsx`, `packages/web/src/project/revision-shorts.tsx`); drafts, templates and schedules carry it as raw text like Play's other numbers (`play-drafts/schema.ts`, `project-templates/from-project.ts`).
- It needs narration: admission refuses the switch with narration Off ("Shorts are cut from the narration. Turn narration on, or turn Shorts off."), and Play's draft conversion drops it (`usesShorts`, `shortsFields` in `packages/app/src/slices/admission/rules.ts`). It works whether the video renders or only the WAV is exported; with the video off, `imageSeconds` is checked for the shorts.
- It needs the project's text model and image model: both rows become required (`admit`, `modelFields`, `validateRecipeInputs`, Play readiness, the project page's retry readiness). The image model must make 9:16 images whatever the video's shape ("This image model cannot make the vertical (9:16) images Shorts need. Choose another image model, or turn Shorts off.").
- The numbers are refused in one set of sentences shared by admission, Play's draft conversion and Edit project (`shortsSettingsProblems`): "Enter a whole number of shorts between 1 and 10.", "Enter a whole number of seconds between 15 and 180.", and, against both lengths, "The longest a short may be must be at least the shortest. Raise the maximum or lower the minimum."
- Shorts prompts are a Library prompt kind, `shorts` (migration `0019-shorts-prompts.sql` widens the prompts table's kind check, as 0015 did for `description`). A picked Shorts prompt is frozen under key `shorts`, a picked Image prompt for the style under `shortsImage`; their keywords become Play fields (`pickTemplates`).

## Steps

1. Planning adds `subtitles:timing` when captions, the YouTube description or Shorts are on; with captions Off it makes no caption files (`recipe-exports.ts`). The timing's fingerprint does not include Shorts.
2. `shorts:pick` (stage `video`, kind `provider`, local operation `shorts-pick-v1`) depends on `subtitles:timing` only. Its fingerprint is the timing's selected identity, the LLM provider, model and thinking mode, the rendered Shorts prompt (blank for built-in), the count, the two lengths and the title (`recipe-shorts.ts`). Until its saved answer matches, one deferred `shorts:future` (operation `shorts`) stands for everything after it and carries the cost.
3. When the timing lands the pick runs (`runtime-shorts.ts`). The words become numbered sentences: a sentence closes at `.`, `!` or `?`, at a pause of 1.5 s, or after 30 s (`transcriptSentences` in `slices/youtube/transcript.ts`); each line reads `[n] (M:SS-M:SS) text`. A narration shorter than the minimum fails before any call.
4. The request asks for strict JSON, best clip first: `[{first, last, title, description, hashtags, why}]` by sentence number (`pickMessages`). An answer that is not such a list is a failed attempt the wrapper asks again for.
5. Each clip is checked in the model's order (`checkPicks`): sentence numbers in range and in order; start and end taken from the sentences' own word times, opened up to 0.25 s before and closed up to 0.4 s after, never past halfway to the neighbouring sentence; length within [min, max]; no sentence shared with a clip already kept; a title of 1–60 characters; a one-line description; 1–5 one-word hashtags (a missing `#` is added, the rest dropped). Up to `count` clips are kept, then ordered as they play and numbered 1..N.
6. When fewer than `count` are usable, the model is asked once more with its answer and one sentence per problem (`pickRetryMessages`); whichever answer held more usable clips is kept. None usable fails the step.
7. The pick publishes `shorts.json` (role `shorts`) and keeps the clips, with their text, in its payload. Planning then unfolds each clip `N`: `shorts:N:prompts`, one LLM call writing exactly K = ceil(clip seconds / `imageSeconds`) image prompts from the style prompt and what is said in the clip (`imagePromptMessages`, checked by `checkImagePrompts`, asked again while attempts remain).
8. Once a clip's prompts match, planning adds `shorts:N:image:M` (image requests at aspect `9:16` on the project's image model, fingerprinted, retried and priced like any image) and `shorts:N:render` (local operation `short-render-v1`, its fingerprint holding the timing, the clip's times, the images' identities, `imageSeconds`, zoom, motion and the subtitle font id). Every key after the pick carries the pick's regeneration token. The runner's materialization anchors every unfolded key to the pick's reservation, like research chapters to the plan (`runtime-materialize.ts`).
9. The render (`slices/shorts/render.ts`) cuts the clip's sound out of the video's own timeline (edge silence, intro, gaps, body, outro), the timeline the word timing walked, joining the segments it overlaps and trimming at the sample (`shortAudioArgs`). The images play for `imageSeconds` each with the project's motion, the last running to the end (`shortEditList`). The captions are ASS (`shortCaptionsAss`): the clip's words re-timed to it, two to four on screen (a group closes at a sentence end, after a comma once it holds two words, at a 0.6 s pause, or at four), centred at 62% of the height, 7.5% of the height tall in the project's subtitle font (`subtitles.fontId`, default when captions are off), the word being spoken in gold and slightly larger. The slideshow renderer burns them in with the same `ass` filter and font folder as the video, H.264/AAC, faststart. The result is measured with `probeDurationMs` and published as role `short_video` with `meta.short`.
10. Short images are role `short_image` with `meta.short` and `meta.index`; their slot is the work key, so they never join the slideshow's images.

## Branches

- Built-in prompts versus Library prompts: only the instruction or the style differs; the rules and answer shapes are fixed.
- Hand-edited captions normally skip timing; with Shorts on, timing still runs for them (`runtime-store.ts`).
- Edit project → Prompts: Built-in drops the frozen `shorts` or `shortsImage` template; a Library prompt freezes its body. "Make the shorts again after review" adds `shorts:pick` to the edit's regenerate list, which renews the whole chain; "Keep the current shorts" takes it back.

## Unhappy paths

Every message says what failed and how to fix it; the stage prefixes it with the step: "Shorts:", "Short N image prompts:", "Short N image M:" or "Short N:".

- No usable clip twice → "The AI model didn't pick any clip Slopify could use as a short, twice (…). Retry stage; if it keeps happening, widen the length range in Edit project → Prompts → Shorts, or choose another model in Edit project → Providers."
- The narration is shorter than the minimum → "The narration is N seconds long, shorter than the M-second minimum for a short, so there is nothing to cut. Lower the shortest length in Edit project → Prompts → Shorts, then Retry stage."
- Every attempt at a clip's prompts had the wrong count or format → "The AI model wrote N image prompts for a short that needs exactly K. Retry stage, or choose another model in Edit project → Providers."
- A short's image is missing at render → "Short N is missing one of its images. Retry stage to make it again; …".
- No text model, or the word timing missing or empty → the same fixes as scenario 27.
- ffmpeg failures read as the video export's (scenario 11).

## State transitions

- The Video stage is pending → running → done or failed across the render, the description and every Shorts step together; a failed short fails the stage while everything already made stays published, and Retry stage redoes only what did not finish.
- Stale when: the narration or its text changes (new timing), the silence gap or edge silence changes, the prompt, count or lengths change, the model changes, or the title changes (the pick and everything after it); `imageSeconds` or the style prompt changes (the prompts, images and renders); motion, zoom or the subtitle font changes (the renders only). Not stale when captions' look, the slideshow images or the Document change.

## Invariants

- Clips start and end on sentence edges measured by the word timing, and their sound is cut from exactly the timeline those times are on.
- A project saved before Shorts, or with Shorts off, plans exactly the work and fingerprints it did before.
- The step never delays the render and the render never waits for it.

## Outcomes & side effects

- Success: `shorts.json`, K vertical images per short and one MP4 per short, shown in the Video stage's Shorts part with a player, the length, Copy (title, description and hashtags) and Download, and in the stage's Download menu as "Short N (.mp4)".
- Cost: Play's estimate adds a Shorts row (the pick, one prompt call per short, and `count × ceil(maxSeconds / imageSeconds)` images, the most the step can ask for); the rebuild review prices `shorts:future` the same way until the clips are picked.
- No telemetry: counting shorts needs a new collector field, which this change does not add.

## Dimensions not in play

- Uploading to YouTube Shorts, TikTok or Reels: the user downloads and copies.
- Reviewing or editing the picks before the render: the owner chose a fully automatic step.
- Non-English narration: timing is English-only, as in scenario 17.
