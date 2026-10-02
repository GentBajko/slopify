---
scenario: video-editing
screens:
- 06-play
- 08-project
depends_on:
- 04-run-admission
- 09-image-generation
- 11-video-assembly
- 12-reruns-and-edits
- 17-subtitles
- 18-cost-review-batch
- 27-youtube-description
generated_at_commit: d83482c1175e
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: 29e14170c5ac
paths_covered:
  - ":(top)packages/app/src/slices/video/edit-settings.ts"
  - ":(top)packages/app/src/slices/video/edit-list.ts"
  - ":(top)packages/app/src/slices/video/cuts.ts"
  - ":(top)packages/app/src/slices/video/chapters.ts"
  - ":(top)packages/app/src/slices/video/transitions.ts"
  - ":(top)packages/app/src/slices/video/motion.ts"
  - ":(top)packages/app/src/slices/video/look.ts"
  - ":(top)packages/app/src/slices/video/cards.ts"
  - ":(top)packages/app/src/slices/video/plan.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-edit.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-export-edit.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-animate.ts"
  - ":(top)packages/app/src/adapters/image/video.ts"
  - ":(top)packages/web/src/video/edit-controls.tsx"
---

# 29 Video editing

The Video stage's edit settings: where the cuts fall, how each shot moves and hands over to the next, the Look (vignette, grain, colour grade, an atmosphere overlay and chapter cards), and which images play as moving clips. All of it is data in the edit list (`packages/app/src/slices/video/edit-list.ts:13-24`, `editListVersion` 1) and renders inside the bounded two-step render of scenario 11: one short FFmpeg run per distinct clip, then a concat join. Paths below are relative to `packages/app/src/` unless they start with `packages/`.

## Trigger & preconditions

- A per-project `videoEdit` setting, `VideoEditSettings` (`slices/video/edit-settings.ts:34-50`): `cuts` (`interval` "Every N seconds" or `narration` "Follow the narration"), `transition` (`cut`, `crossfade`, `fadeblack` "Fade through black", `slide`, `wipe`) with `transitionSeconds` 0.2–2 (offered steps 0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.5, 2; `:69-73`), `vignette` and `grain` (`off`/`subtle`/`strong`), `grade` (`none`, `warm` "Warm fantasy", `cold`, `desaturated`, `sepia`), `atmosphere` (`none`, `embers`, `dust`, `fog`), `chapterCards` (boolean), `animate` (`off`, `chapters` "Chapter openers", `every` "Every Nth image") with `animateEvery` 2–10 and `animateModel` (an image-to-video model on the project's image provider). Labels: `:93-126`.
- Absent reads as `legacyVideoEdit` (`slices/video/edit-settings.ts:52-64`, `videoEditOf` `:129-133`): every N seconds, hard cuts, no Look, nothing animated. A new project starts from `defaultVideoEdit`, which follows the narration (`:67`). Drafts, templates and schedules carry the setting as it is (`slices/play-drafts/convert.ts:365`, `slices/project-templates/from-project.ts:237`).
- Motion per shot is the project's `motionStyle` and `zoomPercent`, not part of `videoEdit` (`motionFor`, `slices/video/motion.ts:28-39`): `still`; `zoom` alternating in, out by the shot's place; `pan` taking turns left→right, right→left, top→bottom, bottom→top with a fixed crop of 100% + max(zoom, 10%) (`panMinimumPercent` `:8`, `:49-57`); `mixed` alternating zoom and pan, each keeping its own alternation. A zoom of 0% is a still (`:41-47`).
- Set on Play's Export rail (the Cuts picker, and a Look row beneath, both only while the video is generated, `packages/web/src/play/stage-rails.tsx:209`, `:265`, `:278`) and in Edit project → Inputs → "Cuts and look" (`packages/web/src/project/revision-form.tsx:147`, `:460-462`). A project without the settings gets them only once one is changed (`packages/web/src/video/edit-controls.tsx:36-39`).
- Checked only while the video renders (`videoEditProblems`, `slices/video/edit-settings.ts:199-247`, field names `videoEdit.<field>` via `videoEditFields`, `slices/admission/rules.ts:557-563`): "Choose a transition length between 0.2 and 2 seconds.", "Chapter cards are placed from the narration. Turn narration on, or turn chapter cards off.", "Chapter openers are found from the narration. Turn narration on, or choose Every Nth image.", "Choose every 2nd to every 10th image.", "Choose an image-to-video model to animate images with, or turn Animate images off."
- Follow the narration applies only with narration on, the video generated and word timing available in the project language (`usesNarrationCuts`, `slices/video/edit-settings.ts:146-153`); otherwise the cuts fall every N seconds and the fingerprint says so. It is not refused.
- Animate images needs the image provider to offer image-to-video models: the catalogue check refuses "This image provider can't animate images. Choose fal.ai or Replicate as the image provider (on Play's Images rail, or in Edit project → Providers), or turn Animate images off." and a model no longer listed "This image-to-video model is no longer in Slopify's model list. Choose another under Animate images." (`catalog/validate.ts:97-113`). Image-to-video models are catalogue image entries with the `video` keyword (`catalog/schema.ts:107`).

## Steps

1. Planning (`editPlan`, `slices/rebuild/recipe-edit.ts:45-100`) returns nothing unless the video is generated. When the render needs the word timing (`editNeedsTiming`, `slices/video/edit-settings.ts:176-187`: narration cuts, figure cards placed by their spoken description, chapter cards, or chapter openers), `subtitles:timing` is planned even with captions off (`slices/rebuild/recipe-exports.ts:31-45`) and the export depends on it; it also depends on `youtube:description` when that step runs, since its chapters are then the chapters (`slices/rebuild/recipe-edit.ts:79-86`).
2. Fingerprint: `export:video` appends one value per feature in use, in this order (`slices/rebuild/recipe-edit.ts:62-98`): `["cuts","narration-v1"]`; `["transition", kind, seconds]`; `["look-v1", vignette, grain, grade, atmosphere]`; `["cards-v1", fontId]`; the brand kit's `["end-screen-v1", text]` and `["title-style", fontId, color]`; `["timing", id]` with `["chapters", <description identity>]` or `["chapters","headings", <hash of the top headings>]`; `["figure-cards-v1", …]`; `["animate-v1", <clip fingerprints>]`. With nothing on it appends nothing, so an existing project keeps its fingerprint and its video (`slices/rebuild/recipe-edit.test.ts:63-90`: silent, narrated, Shorts, captioned and YouTube-description projects).
3. Chapters (`chaptersOf`, `slices/rebuild/runtime-export-edit.ts:180-195`): the YouTube description's saved `{start, title}` when that step runs; otherwise `headingChapters` (`slices/video/chapters.ts:29-51`): the article's top headings (`topHeadings` `:55-78`: the highest level used, skipping a lone title heading at the top; fenced code and end matter excluded), each found in the word timing by its first four words within 200 words of where its share of the article puts it, else placed at that share (`:23-27`, `:100-115`).
4. Cuts (`slices/video/cuts.ts`): each sentence pause (from `transcriptSentences`) is a cut point halfway through the pause but at most 0.25 s after the last word (`sentenceCutPoints` `:24-34`). Chapter starts become cuts, snapped to a pause within 3 s; one earlier than the floor is left to the first shot (`chapterCuts` `:87-104`, `:63`). Between chapter starts the shots are laid greedily: the next cut is the pause nearest Seconds per image after the last, no nearer than 40% of it (`cutFloorShare`, `slices/video/edit-settings.ts:87`) and no further than twice it; with none in reach the cut falls at Seconds per image; a remainder under Seconds per image plus the floor joins the last shot (`narrationShotFrames` `:54-83`). Cuts are rounded to whole frames at 30 fps (`fps`, `slices/video/plan.ts:24`) and the shots add up to the timeline exactly (`framesBetween` `slices/video/cuts.ts:115-128`). Every N seconds gives equal shots with the last cut short (`everyLengths`, `slices/video/plan.ts:342-345`).
5. Shots (`shots`, `slices/video/plan.ts:351-369`): images take turns in slideshow order, one per shot, starting over after the last; motion goes by the shot's place, not the image. Images carry no link to a passage, so only where the cuts fall changes (`slices/video/cuts.ts:9-12`). With figure cards on, the cards are placed as still shots and the images take turns around them (`aroundFigures`, `slices/video/plan.ts:406`).
6. Transitions (`slices/video/transitions.ts`): every shot after the first gets the transition, T = round(seconds × 30) frames, shortened to floor((shorter shot − 1) / 2) and left a hard cut where under 2 frames would remain (`withTransitions` `:20-32`). The shot before gives up its last floor(T/2) frames and the shot after its first ceil(T/2) (`transitionHalves` `:12-15`); a T-frame clip in between blends them with FFmpeg `xfade` (`fade`, `fadeblack`, `slideleft`, `wipeleft`, `slices/video/ffmpeg.ts:186`, `:209-214`). Every frame plays once, so the video stays as long as its sound; the join is still a concat.
7. The Look (`slices/video/look.ts`): the grade (`colorbalance`/`eq`, or the sepia `colorchannelmixer` matrix, `:33-44`) is applied to each source before its picture is built, once on a still before zoompan, frame by frame on a clip (`gradeFilter` `:46-50`, `slices/video/ffmpeg.ts:241`, `:262`). Then filters on each clip: the atmosphere (a procedural texture from `noise` fields moved with `scroll` from where the timeline has it, `:109-112`, `:139-200`), the vignette (`vignette` angle 0.45 or 0.75, `:18-19`, `:120`), the cards, and grain last (temporal `noise` on brightness at 8 or 16, encoded with x264 `-tune grain`, `:22-31`, `:123-124`). A clip whose pixels depend on its place (an atmosphere or a card) is never reused elsewhere (`:73-80`).
8. Chapter cards (`chapterCards`, `slices/video/plan.ts:256-277`): 2.5 s at each chapter start (`chapterCardSeconds`, `slices/video/edit-settings.ts:89`), on the cut the chapter's shot opens (a chapter at the very start stays there); two chapters inside 2.5 s keep only the first. The brand kit's end screen text is a card over the last 5 s (`endScreenSeconds` `:91`, `withEndScreen` `slices/video/plan.ts:280-299`), cutting short a chapter card still showing and dropping one starting inside it. Cards are drawn with libass from an ASS script per clip timed from the clip's first frame (`cardsAss`, `slices/video/cards.ts:13-61`): centred, bold, 11% of the frame's short side, letter-spaced, with a soft blurred dark outline, 0.4 s fades and a settle from 96% to full size. Font and colour: the brand kit's title style when set, else the subtitle font in white; in a non-English project a font covering the language's letters (`titleFont`, `slices/rebuild/runtime-export-edit.ts:140-157`).
9. Clips as shots: a moving clip plays in an image's place as source kind `{kind:"video", path, seconds}` with no motion (`slices/video/edit-list.ts:65-72`, `slices/video/plan.ts:359-367`): slowed to at most half speed to fill its shot, then looped, trimmed to the frame, graded, muted (`slowdown`, `slices/video/ffmpeg.ts:271-280`, `:231-246`, `-an` `:204`). An uploaded clip is an image upload whose file ends `.mp4`, `.mov`, `.m4v`, `.webm` or `.mkv` (`isClipPath`, `slices/rebuild/runtime-export-edit.ts:39-44`); its length is measured when the video is planned (`clipSeconds` `:197-215`). An animated image's clip takes precedence over the upload in the same place (`:58-73`).
10. Animate images (`animateRecipes`, `slices/rebuild/recipe-edit.ts:102-175`): `animate:<imageKey>` requests (stage `video`, input kind `image` with `prompt: animatePrompt`, `aspect` the video format, `animate: { image: <still fingerprint>, seconds: 5 }`, `slices/video/edit-settings.ts:78-83`) for every Nth image from the first (`animatedImageIndexes` `:278-291`) or for the images the video and each chapter open on (`openingImages` + `chapterOpeningShots`, `slices/rebuild/recipe-edit.ts:179-201`, `slices/video/cuts.ts:133-164`). Only drawn images (`source: "generate"`) are animated (`slices/rebuild/recipe-edit.ts:113-116`). Until the timing (and the YouTube chapters) are saved, one deferred `animate:future` (template: timing and description fingerprints, provider, model, upper count) stands in for the chapter openers; the upper count is min(drawn images, top headings + 1, or 12 while the article is unwritten) (`:120-149`, `chapterEstimate` `:252-255`). Materialization anchors `animate:*` to `animate:future` (`slices/rebuild/runtime-materialize.ts:199-200`).
11. An animate step (`executeAnimateRecipe`, `slices/rebuild/runtime-animate.ts:27-115`) sends the still as a JPEG no wider than 1280 px (`sendable` `:118-146`) as a data URI (`dataUri`, `adapters/image/video.ts:9-11`). fal.ai submits to `queue.fal.run`, polls `status_url` every 5 s until `COMPLETED`, then reads `response_url` (`adapters/image/fal.ts:103-104`, `:190-226`); Replicate polls the prediction's `urls.get`, sending Kling the still as `start_image` and the others as `image`, with Wan and Seedance asked for 720p (`adapters/image/replicate.ts:121-161`). The attempt is kind `video` with a 900 s window over the whole call (`kernel/runner/attempt.ts:23`, `kernel/runner/providers.ts:426-455`); the download must sniff as MP4/MOV (`sniffVideo`, `adapters/image/video.ts:14-16`, `:25-40`). The clip is published as role `animated_image` with `meta.index` and counted as `stage.completed` with provider and model (`slices/rebuild/runtime-animate.ts:89-110`). It is used every time its image comes round.
12. The export (`exportEdit`, `slices/rebuild/runtime-export-edit.ts:46-137`) reads the timing, chapters, clips and fallbacks and returns the `PlanEdit` (`slices/video/plan.ts:110-135`): `narration` cut points and chapter starts, `transition`, `look`, `cards` with font, colour and end screen, `clips`, `figures`. `planRender` (`slices/video/plan.ts:150-230`) builds the edit list; `render.json` records the edit list, `videoEdit` and any fallback warnings (`slices/rebuild/runtime-export.ts:145-148`, `:236-244`). A project with no `videoEdit` still gets clips, figures and the end screen (`slices/rebuild/runtime-export-edit.ts:84-96`).

## Branches

- Every N seconds with chapter cards: the cards sit at the chapters' own times (no cut points to snap to); the cuts do not move (`slices/video/plan.ts:187-193`, `:265-266`).
- Chapter openers under Every N seconds: the image on screen when a chapter starts opens it (`slices/video/cuts.ts:143-154`).
- A silent video: nothing to follow, no cards or chapter openers (`usesChapterCards`, `usesAnimation`, `slices/video/edit-settings.ts:156-172`); transitions, the Look, uploaded clips and Every Nth image still apply. It shows every image once (`slices/video/plan.ts:161-165`).
- A language without word timing: narration cuts fall back to Every N seconds (`slices/video/edit-settings.ts:143-152`); the Cuts picker says so (`packages/web/src/video/edit-controls.tsx:49-50`).
- Hand-edited captions normally skip timing; with the cuts, cards, figure cards or chapter openers needing it, timing still runs (`slices/rebuild/runtime-store.ts:48-57`).
- A short-mode project renders through the Shorts renderer instead of the edit list's slideshow (`slices/rebuild/runtime-export.ts:61-62`); Shorts reuse `renderSlideshow` and `motionFor` (scenario 28).
- An older recorded edit list: `readEditList` refuses any version other than 1 and any unknown field ("This video's edit list is version N, and this Slopify reads version 1. Update Slopify, or use More → Render the video again in the Video section to plan it again.", `slices/video/edit-list.ts:251-260`).

## Unhappy paths

- A clip that cannot be made (provider without image-to-video, refused, failing after its retries, or its image not ready) does not fail the video: the step finishes with a `fallback` payload, the render shows the still, and the video carries "Image N is shown as a still: <reason>" on the project page and in `render.json` (`slices/rebuild/runtime-animate.ts:51-61`, `:82-87`, `slices/rebuild/runtime-export-edit.ts:74-80`). The provider-side reason for no image-to-video is "<provider> can't turn images into video clips. Choose fal.ai or Replicate as the image provider in Edit project → Providers, or turn Animate images off in Edit project → Inputs → Look." (`kernel/runner/providers.ts:429-435`).
- fal.ai reporting an error in its queue → "fal.ai could not make the video clip: … Use Try again; if it keeps happening, choose another image-to-video model under Animate images in Edit project → Inputs → Look." (`adapters/image/fal.ts:211-220`); a download failure → "<provider> made the video clip, but Slopify could not download it (error N). …"; a non-MP4 answer → "<provider> sent back something that is not an MP4 video clip (…). …" (`adapters/image/video.ts:27-38`). These surface through the fallback above.
- The word timing missing at render → "The narration's word timing, which the video's cuts and chapter cards follow, is missing. Use More → Render the video again in the Video section, then Try again." (`slices/rebuild/runtime-export-edit.ts:168-171`).
- An uploaded clip FFmpeg cannot read → "Image N is a video clip Slopify can't read, so the video can't show it. Replace it with another clip or an image in Edit project → Images, then Try again." (`slices/rebuild/runtime-export-edit.ts:210-213`).
- A wrongly set-up animate step → "Slopify hit an internal error (an animated image was set up wrongly). …" (`slices/rebuild/runtime-animate.ts:40-43`).
- Cancel during an animate step rethrows rather than falling back (`slices/rebuild/runtime-animate.ts:83`).

## State transitions

- Stale when: any setting that is in use changes (the render only); the narration or its text changes (timing, then the render); the YouTube description changes while it supplies the chapters, or the article's top headings change while they do; the brand kit's end screen or title style changes; a figure card changes; an animated image's still changes, including a regenerated image (its clip, then the render; `animate.image` is the still's fingerprint). Not stale when a setting that is off changes (a transition length under Cut, every N under Off, the model while Animate is off; `slices/rebuild/recipe-edit.test.ts:75-78`).
- Regenerate: an `animate:*` step has no token of its own; it is redone by changing its still or by "Render the video again", which renews the export.

## Invariants

- The video is exactly as long as its sound with or without transitions: every timeline frame is played once (`slices/video/transitions.ts:3-9`, `slices/video/edit-render.test.ts`, `packages/app/test/revision-video-edit.test.ts:94`).
- Memory stays at one clip's worth: every transition, Look and card is inside a single short FFmpeg run, and the join stays a concat.
- A project without the settings, or with all of them at today's behaviour, plans exactly the fingerprints it did before (step 2).
- The same timing plans the same cuts and motions every time (`slices/video/cuts.ts:5-7`, `slices/video/motion.ts:22-27`).

## Outcomes & side effects

- Cost: animated clips are the only paid part. Play's estimate adds "Animated images" rows, one clip per animated image at the model's catalogue price; chapter openers at one per image up to twelve (`slices/estimate/index.ts:357-380`, `chapterOpenersMax` `:41`). The rebuild review prices `animate:future` at its upper count (`priceRecipes`, `slices/rebuild/recipe-work.ts:325-345`).
- Records: `render.json` beside the video holds the edit list (paths project-relative, `withPaths` `slices/video/edit-list.ts:149-167`), `videoEdit` and the fallback warnings.
- Telemetry: each animated clip counts `stage.completed` (`slices/rebuild/runtime-animate.ts:106-110`).

## Dimensions not in play

- Placing an image in the passage it illustrates: images are not tied to passages, so they are spread over the narration in order.
- Third-party footage or LUT files: every effect is FFmpeg's own filters with fixed numbers.
- Sound from animated or uploaded clips: always muted.
- Money moved, permissions, multi-user concurrency: single local user; no roles or payments in this scenario.
- Ambient sound under the video: carried by the same edit list (`bed`, `slices/video/edit-list.ts:114-126`) but not an edit setting; shallow: not inventoried here.
