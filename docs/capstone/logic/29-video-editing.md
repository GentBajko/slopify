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
generated_date: '2026-09-26'
capstone_version: 5.2.0
paths_covered:
  - :(top)packages/app/src/slices/video/{edit-settings,cuts,chapters,transitions,look,cards}.ts
  - :(top)packages/app/src/slices/rebuild/{recipe-edit,runtime-export-edit,runtime-animate}.ts
  - :(top)packages/app/src/adapters/image/video.ts
  - :(top)packages/web/src/video/edit-controls.tsx
---

# 29 Video editing

The Video stage's edit settings: where the cuts fall, how one shot hands over to the next, the Look (vignette, grain, colour grade, an atmosphere overlay and chapter cards), and which images play as moving clips. All of it renders inside the bounded two-step render of scenario 11: one short FFmpeg run per distinct clip, then a concat join.

## Trigger & preconditions

- A per-project `videoEdit` setting (`packages/app/src/slices/video/edit-settings.ts`): `cuts` (`interval` "Every N seconds" or `narration` "Follow the narration"), `transition` (`cut`, `crossfade`, `fadeblack`, `slide`, `wipe`) with `transitionSeconds` 0.2–2 (steps 0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.5, 2; default 0.6), `vignette` and `grain` (`off`/`subtle`/`strong`), `grade` (`none`, `warm` "Warm fantasy", `cold`, `desaturated`, `sepia`), `atmosphere` (`none`, `embers`, `dust`, `fog`), `chapterCards` (boolean), `animate` (`off`, `chapters` "Chapter openers", `every` "Every Nth image") with `animateEvery` 2–10 and `animateModel` (an image-to-video model on the project's image provider).
- Absent reads as `legacyVideoEdit`: every N seconds, hard cuts, no Look, nothing animated, which is what every project did before. A new Play draft starts from `defaultVideoEdit`, which follows the narration. Drafts, templates and schedules carry the setting as it is (every field is a pick from a list); a template made from a project without it has none (`play-drafts/{schema,convert}.ts`, `project-templates/from-project.ts`).
- Set on Play's Export rail (Cuts beside Motion, and a folded Look row below) and in Edit project → Inputs after Motion (`packages/web/src/video/edit-controls.tsx`). Edit project writes settings only once one of them is changed.
- Checked only while the video renders (`videoEditProblems`, `videoEditFields`): "Choose a transition length between 0.2 and 2 seconds.", "Chapter cards are placed from the narration. Turn narration on, or turn chapter cards off.", "Chapter openers are found from the narration. Turn narration on, or choose Every Nth image.", "Choose every 2nd to every 10th image.", "Choose an image-to-video model to animate images with, or turn Animate images off." Following the narration without narration is not refused: there is nothing to follow, so the cuts stay every N seconds.
- Animate images needs the image provider row (admission, readiness, the project page's retry readiness). The catalogue check refuses a provider without image-to-video models ("This image provider can't animate images. Choose fal.ai or Replicate as the image provider (on Play's Images rail, or in Edit project → Providers), or turn Animate images off.") and a model no longer listed (`catalog/validate.ts`).

## Steps

1. Planning (`slices/rebuild/recipe-edit.ts`): following the narration, chapter cards and chapter openers need `subtitles:timing`, which `recipe-exports.ts` then plans even with captions off (`editNeedsTiming`). The export waits for it, and for `youtube:description` when that step runs, since its chapters are then the chapters.
2. Fingerprints: `export:video` appends one `["video-edit", …]` value holding only what is on: `["cuts","narration-v1"]`, `["transition", kind, seconds]`, `["look-v1", vignette, grain, grade, atmosphere]`, `["cards-v1", fontId]`, the timing's and the chapters' identities (the YouTube description's, or a hash of the article's headings), and the animated clips' fingerprints. With nothing on it appends nothing, so an existing project keeps its fingerprint and its video (`recipe-edit.test.ts` proves it for silent, narrated, captioned, Shorts and YouTube-description projects).
3. Chapters (`slices/video/chapters.ts`, `slices/rebuild/runtime-export-edit.ts`): the YouTube description's `{start, title}` when it runs; otherwise the article's top-level headings (the highest level used, skipping a lone title heading at the top; end matter excluded), each found in the word timing by its first four words within 200 words of where its share of the article puts it, else at that share.
4. Cuts (`slices/video/cuts.ts`): each sentence pause (from `transcriptSentences`) is a cut point, halfway through the pause but at most 0.25 s after the last word. Chapter starts become cuts, moved onto a pause within 3 s; one earlier than the floor (the narration's first words) is left to the first shot. Between chapter starts the shots are laid greedily: the next cut is the pause nearest Seconds per image after the last, no nearer than 40% of it (`cutFloorShare`) and no further than twice it; with none in reach the cut falls at Seconds per image. A remainder under Seconds per image plus the floor becomes the last shot. Cuts are rounded to whole frames and the shots add up to the timeline exactly. Images carry no link to a passage (each comes from a prompt template filled with keyword values), so they keep taking turns in slideshow order; only where the cuts fall changes.
5. Transitions (`slices/video/transitions.ts`): every shot after the first gets the transition, T = round(seconds × 30) frames, shortened to fit (at most floor((shorter shot − 1) / 2)) and a hard cut where under 2 frames would be left. The shot before gives up its last floor(T/2) frames and the shot after its first ceil(T/2); a T-frame clip in between blends the first shot's picture (running on past its end, a still's motion holding) into the second's (from half a transition before its start) with FFmpeg `xfade` (`fade`, `fadeblack`, `slideleft`, `wipeleft`). Every frame plays once, so the video stays as long as its sound; the join is still a concat.
6. The Look (`slices/video/look.ts`): the grade (`colorbalance`/`eq`, or the sepia `colorchannelmixer` matrix) is applied to each source before its picture is built, once on a still before zoompan rather than on every frame (a clip is graded frame by frame); then filters appended to each clip: the atmosphere (a texture made once per clip from `noise` fields, turned into light over a transparent frame with its brightness as alpha, looped, moved with `scroll` from where the timeline has it, and overlaid in the picture's own YUV), the vignette (`vignette` angle 0.45 or 0.75), the chapter card, and grain last (temporal `noise` on brightness, 8 or 16, encoded with x264's grain tuning so it survives). A clip whose pixels depend on its place (an atmosphere or a card) is never reused elsewhere.
7. Chapter cards (`slices/video/cards.ts`): 2.5 s at each chapter start, on the cut the chapter opens (a chapter at the very start stays there), white text centred in the frame, 8% of the short side tall, in the subtitle font (`subtitles.fontId`, the default when captions are off) with a soft dark outline and 0.4 s fades. This FFmpeg has no `drawtext`, so each clip a card shows in draws it with libass from its own script timed from the clip's first frame. Two chapters inside 2.5 s keep only the first card.
8. Clips as shots: a moving clip plays in an image's place in the order, as its own source kind `{kind:"video", path, seconds}` with no motion: slowed to at most half speed to fill its shot, then looped, trimmed to the frame, muted. An uploaded clip is an image upload whose file is `.mp4`, `.mov`, `.m4v`, `.webm` or `.mkv` (Edit project → Images → Add a video clip); its length is measured when the video is planned.
9. Animate images (`recipe-edit.ts`, `runtime-animate.ts`): `animate:<image>` requests (stage `video`, input kind `image` with `animate: {image, seconds: 5}`) ask the image provider's `animateModel` for a 5-second clip of every Nth drawn image from the first, or of the drawn images the video and each chapter open on. Uploaded images and clips are never animated. Until the timing (and the YouTube chapters) land, one deferred `animate:future` stands in for the chapter openers and carries their cost. The still goes up as a JPEG no wider than 1280 px in a data URI. fal.ai uses its queue (`POST queue.fal.run/<model>`, poll `status_url` every 5 s until `COMPLETED`, read `response_url`); Replicate a prediction polled at `urls.get` (Kling takes `start_image`, Wan and Seedance `image` at 720p). A clip is an attempt of kind `video` with a 900 s window and the usual retries; its output is role `animated_image` with `meta.index`. The clip is used every time its image comes round.
10. The export (`runtime-export-edit.ts`) reads the timing, chapters, clips and fallbacks, plans the edit list with `look`, `cards`, `cardFont`, per-shot `transition` and video sources, and records `videoEdit` and any warnings in `render.json`.

## Branches

- Every N seconds with chapter cards: the cards sit at the chapters' own times; the cuts do not move.
- A silent video: nothing to follow, no cards or chapter openers; transitions, the Look, uploaded clips and Every Nth image still apply.
- Hand-edited captions normally skip timing; with the cuts, cards or chapter openers needing it, timing still runs (`runtime-store.ts`).
- Shorts reuse `renderSlideshow` and `motionFor` unchanged; the new options have defaults that render what they did.

## Unhappy paths

- A clip that cannot be made (refused, failing after its retries, or its image not ready) does not fail the video: the step finishes without a clip, the render shows the still, and the video carries the sentence "Image N is shown as a still: <the provider's words> To try again, use Re-run section on Video." on the project page and in `render.json`.
- The word timing missing at render → "The narration's word timing, which the video's cuts and chapter cards follow, is missing. Use Re-run section on Video, then Retry stage."
- An uploaded clip FFmpeg cannot read → "Image N is a video clip Slopify can't read, so the video can't show it. Replace it with another clip or an image in Edit project → Images, then Retry stage."
- A provider without image-to-video → "<provider> can't turn images into video clips. Choose fal.ai or Replicate as the image provider in Edit project → Providers, or turn Animate images off in Edit project → Inputs → Look."
- fal.ai reporting an error in its queue → "fal.ai could not make the video clip: … Use Retry stage; if it keeps happening, choose another image-to-video model under Animate images in Edit project → Inputs → Look."; a download that is not an MP4 → "… sent back something that is not an MP4 video clip (…)".
- Timing is English-only (scenario 17): following the narration on non-English narration fails at timing as captions do. Switch Cuts to Every N seconds.

## State transitions

- Stale when: any setting that is on changes (the render only); the narration or its text changes (timing, then the render); the YouTube description changes while it supplies the chapters; an animated image's still changes (its clip, then the render). Not stale when a setting that is off changes (a transition length under Cut, every N under Off).

## Invariants

- The video is exactly as long as its sound with or without transitions: every timeline frame is played once (`edit-render.test.ts`, `revision-video-edit.test.ts` count them).
- Memory stays at one clip's worth: every transition, Look and card is inside a single short FFmpeg run, and the join stays a concat (copying, unless captions are burned in).
- A project without the settings, or with all of them at today's behaviour, plans exactly the fingerprints it did before.

## Outcomes & side effects

- Cost: animated clips are the only paid part. Play's estimate adds an "Animated images" row (one clip per animated image at the model's catalogue price; chapter openers at one per image up to twelve), and the rebuild review prices `animate:future` at one per heading plus the opening until the chapters are known. Catalogue entries for image-to-video models sit in the image list with the `video` keyword and a per-clip `perImage` price, so older installs still parse the published catalogue (they would list them as image models).
- Render time (bundled FFmpeg 7.0.2, a synthetic 10-minute slideshow of 40 stills at 15 s with zoom motion, on a machine shared with other test runs): plain 292-314 s; 0.6 s crossfade +6%; vignette, subtle grain and Warm fantasy +33%; embers +8%; fog +11%; all of them with chapter cards +36%.

## Dimensions not in play

- Placing an image in the passage it illustrates: images are not tied to passages, so they are spread over the narration in order.
- Third-party footage or LUT files: every effect is FFmpeg's own filters with fixed numbers.
- Fog: procedural blotches along the bottom third; it reads as low mist but is the weakest of the three atmospheres.
- Sound from animated or uploaded clips: always muted.
