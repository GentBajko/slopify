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
  - :(top)packages/app/src/assets/fonts/Barlow-Bold.ttf
  - :(top)packages/web/src/play/shorts.tsx
  - :(top)packages/web/src/project/body-shorts.tsx
  - :(top)packages/web/src/project/revision-shorts.tsx
---

# 28 Shorts

An optional step inside the Video stage: once the narration's words are timed, the project's text model picks the best self-contained moments, each becomes a vertical 1080×1920 clip with new 9:16 images and big word-by-word captions, and each gets a title, a one-line description and hashtags. It runs beside the render and the YouTube description, fully automatically, with no review checkpoint and no stage of its own. Afterwards one short can be made again, the moments picked again (keeping every clip that comes back unchanged), or a clip moved by hand.

## Trigger & preconditions

- A per-project `shorts` setting (`packages/app/src/slices/shorts/model.ts`): `enabled` (absent or false is Off, the default), `count` 1–10 (default 3), `minSeconds` and `maxSeconds` 15–180 (defaults 60 and 120, min ≤ max), an optional Shorts prompt name `prompt` and an optional Image prompt name `imagePrompt` (absent or blank is the built-in wording in the same file). Off keeps the numbers and prompts. The seconds each image is held reuse the project's `imageSeconds`.
- Four later optional settings, each absent on projects, drafts and templates saved before them and read then as the behaviour before they existed: `titleOnScreen` (absent is off; a new Play form and `defaultShorts` start it on), `speed` 1.00–1.25 in steps of 0.05 (absent is 1), `musicVolume` 0–100 % (absent is 15) and `fullVideoLink` (an http or https address, absent or blank is none). Play and Edit project hold the numbers and the link as typed text (`shortsExtrasOf`, `shortsExtrasForm`).
- The background music is not a setting but a project file: the revision content's `shortsMusic`, a project asset id uploaded in Edit project → Shorts through the same staging upload as provided narration (`RevisionUpload` destination `{ kind: "shortsMusic" }`, `revisions/mutation-prepare.ts`). It is referenced from the content only, never an output of its own; the edit refuses an upload while Shorts is off and an id that was never this project's music.
- Hand-set clip ranges live on the revision content too: `shortsRanges`, by short number, each `{ first, last, pick }`, where `pick` is the fingerprint of the pick it was set on (`slices/shorts/clips.ts`). A range set on an earlier pick no longer applies and is ignored.
- Set on Play's Export rail below the YouTube description (`packages/web/src/play/shorts.tsx`) and in Edit project → Shorts, a section of its own (`packages/web/src/project/revision-shorts.tsx`). The title, speed, music volume and link sit in a "More shorts options" disclosure whose summary names what differs from the defaults; in Edit project it also holds the music upload. Drafts, templates and schedules carry the settings as raw text like Play's other numbers (`play-drafts/schema.ts`, `project-templates/from-project.ts`); the music file stays with its project.
- It needs narration: admission refuses the switch with narration Off ("Shorts are cut from the narration. Turn narration on, or turn Shorts off."), and Play's draft conversion drops it (`usesShorts`, `shortsFields` in `packages/app/src/slices/admission/rules.ts`). It works whether the video renders or only the WAV is exported; with the video off, `imageSeconds` is checked for the shorts.
- It needs the project's text model and image model: both rows become required (`admit`, `modelFields`, `validateRecipeInputs`, Play readiness, the project page's retry readiness). The image model must make 9:16 images whatever the video's shape ("This image model cannot make the vertical (9:16) images Shorts need. Choose another image model, or turn Shorts off.").
- The settings are refused in one set of sentences shared by admission, Play's draft conversion and Edit project (`shortsSettingsProblems`): "Enter a whole number of shorts between 1 and 10.", "Enter a whole number of seconds between 15 and 180.", against both lengths "The longest a short may be must be at least the shortest. Raise the maximum or lower the minimum.", "Choose a speed between 1.00× and 1.25×, in steps of 0.05.", "Enter the music volume as a whole number of percent between 0 and 100." and "The full video link must be a whole web address starting with https:// or http://, like https://youtu.be/abc123. Paste it again, or leave the box empty." Play's readiness rail names each ("Choose the shorts' speed to play", "Set the shorts' music volume to play", "Fix the full video link to play") and opens the disclosure to show the field.
- Shorts prompts are a Library prompt kind, `shorts` (migration `0019-shorts-prompts.sql` widens the prompts table's kind check, as 0015 did for `description`). A picked Shorts prompt is frozen under key `shorts`, a picked Image prompt for the style under `shortsImage`; their keywords become Play fields (`pickTemplates`).

## Steps

1. Planning adds `subtitles:timing` when captions, the YouTube description or Shorts are on; with captions Off it makes no caption files (`recipe-exports.ts`). The timing's fingerprint does not include Shorts.
2. `shorts:pick` (stage `video`, kind `provider`, local operation `shorts-pick-v1`) depends on `subtitles:timing` only. Its fingerprint is the timing's selected identity, the LLM provider, model and thinking mode, the rendered Shorts prompt (blank for built-in), the count, the two lengths and the title (`recipe-shorts.ts`). Until its saved answer matches, one deferred `shorts:future` (operation `shorts`) stands for everything after it and carries the cost.
3. When the timing lands the pick runs (`runtime-shorts.ts`). The words become numbered sentences: a sentence closes at `.`, `!` or `?`, at a pause of 1.5 s, or after 30 s (`transcriptSentences` in `slices/youtube/transcript.ts`); each line reads `[n] (M:SS-M:SS) text`. A narration shorter than the minimum fails before any call.
4. The request asks for strict JSON, best clip first: `[{first, last, title, description, hashtags, why}]` by sentence number (`pickMessages`). An answer that is not such a list is a failed attempt the wrapper asks again for.
5. Each clip is checked in the model's order (`checkPicks`): sentence numbers in range and in order; start and end taken from the sentences' own word times (`clipBounds`), opened up to 0.25 s before and closed up to 0.4 s after, never past halfway to the neighbouring sentence; length within [min, max]; no sentence shared with a clip already kept; a title of 1–60 characters; a one-line description; 1–5 one-word hashtags (a missing `#` is added, the rest dropped). Up to `count` clips are kept and ordered as they play.
6. When fewer than `count` are usable, the model is asked once more with its answer and one sentence per problem (`pickRetryMessages`); whichever answer held more usable clips is kept. None usable fails the step.
7. Numbering (`keepNumbers`): a clip on exactly the sentences of a clip in the pick it replaces keeps that clip's number, title, description, hashtags and seed, while the number is still within the new count; the others take the free numbers in playing order and carry this pick's regeneration token as their seed (null when there is none). A first pick therefore numbers 1..N as the clips play.
8. The pick publishes `shorts.json` (role `shorts`, the clips without their words or seed) and keeps in its payload the clips with their words and seeds, the narration's length and the numbered transcript's times and words (`sentences`), which hand-set ranges are measured against. The same publication deselects every output slot and piece key of a short numbered past the new count (`commitRevisionOutputs`' `retired`), so a pick that makes fewer shorts leaves none of the old extra files selected; their files stay in History and go with the existing orphan cleanup once nothing names them.
9. Planning then unfolds each clip `N`, with any usable hand-set range in its place (`effectiveClips`: the model's title and words about it stay, the sentences, times and text are the range's): `shorts:N:prompts`, one LLM call writing exactly K = ceil(clip seconds / `imageSeconds`) image prompts from the style prompt and what is said in the clip (`imagePromptMessages`, checked by `checkImagePrompts`, asked again while attempts remain). Its publication deselects the clip's image slots past K.
10. Once a clip's prompts match, planning adds `shorts:N:image:M` (image requests at aspect `9:16` on the project's image model, fingerprinted, retried and priced like any image) and `shorts:N:render` (local operation `short-render-v1`, its fingerprint holding the timing, the clip's number and times, the images' identities, `imageSeconds`, zoom, motion, the subtitle font id and, only when one is in use, a fourth group: the title when `titleOnScreen` is on, the speed when not 1, and the music asset id with its volume).
11. A clip's prompts, images and render carry the clip's own token (`clipToken`): its seed (for a pick saved before seeds, the pick's current token, as before) combined with the token "Make this short again" renews under `shorts:N`. So picking the moments again redoes only clips whose sentences changed, and one short can be made again alone. The runner's materialization anchors a clip's prompts to the pick's reservation and its images and render to its prompts' (`runtime-materialize.ts`); a save carries unfolded work over only while the new plan still wants it under its own key (`transition-repo.ts`).
12. The render (`slices/shorts/render.ts`) cuts the clip's sound out of the video's own timeline (edge silence, intro, gaps, body, outro), the timeline the word timing walked, joining the segments it overlaps and trimming at the sample (`shortAudioArgs`). At a speed above 1 the narration plays faster with its pitch kept (`atempo`), the word times are divided by the speed (`fasterWords`) and each image is held `imageSeconds / speed`, so the number of images is the one the prompts were written for. With music the file is looped (`-stream_loop -1`) and cut to the short, set to its volume, faded in over 1 s and out over the last 2 s, ducked under the narration with `sidechaincompress` keyed by the voice (threshold 0.02, ratio 8, attack 20 ms, release 400 ms), and mixed with `amix` at full narration level. The music is probed first; one that can't be read fails with a sentence naming it.
13. The images play for their share each with the project's motion, the last running to the end (`shortEditList`). The captions are ASS (`shortCaptionsAss`): the clip's words re-timed to it, two to four on screen (a group closes at a sentence end, after a comma once it holds two words, at a 0.6 s pause, or at four); a word left alone joins the group before it (or, when it opens a sentence, the one after) if that keeps every line within 12 characters or the group's own widest, otherwise the neighbour's nearest word comes over to make a pair; it stays alone only after a pause over 1.5 s or between groups too short to share (`captionGroups`). They are centred at 62% of the height, 7.5% of the height tall, the word being spoken in gold and slightly larger. With `titleOnScreen` the title is a headline on a layer above them from the first frame to the last, centred 11% from the top (below the apps' own buttons), bold, at the largest of 6%–3.5% of the height that fits two lines inside the side margins, cut with an ellipsis if even that doesn't fit (`titleLayout`).
14. Captions and title are drawn in the project's subtitle font (`subtitles.fontId`, default when captions are off). For the bundled Barlow that is its own Bold face, `Barlow-Bold.ttf` (SIL OFL 1.1, from the google/fonts repository, recorded in `assets/fonts/SOURCE.txt`) through `resolveBoldFont`; any other font is emboldened by libass. The slideshow renderer burns them in with the same `ass` filter and font folder as the video, H.264/AAC, faststart. The result is measured with `probeDurationMs` and published as role `short_video` with `meta.short` and `meta.sentences` (the clip's first and last sentence); its images as `short_image` with the same and `meta.index`. Their slot is the work key, so they never join the slideshow's images.

## Branches

- Built-in prompts versus Library prompts: only the instruction or the style differs; the rules and answer shapes are fixed.
- Hand-edited captions normally skip timing; with Shorts on, timing still runs for them (`runtime-store.ts`).
- Edit project → Shorts: Built-in drops the frozen `shorts` or `shortsImage` template; a Library prompt freezes its body. Below the settings, each picked clip shows its first and last sentence with Earlier and Later for both, "Use my own range" (start and end pickers over the numbered transcript), "Back to the AI's choice" when set by hand, and "Make this short again" (adds `shorts:N` to the edit's regenerate list; "Keep this short" takes it back). "Pick different moments" adds `shorts:pick` and drops the hand-set ranges; "Keep the current moments" takes it back. While a setting that re-picks is changed, the clips can't be moved.
- The project page's Shorts part offers "Pick different moments" and, per short, "Make this short again" on projects with versions. They open the Edit tab with that change applied, the Shorts section showing, for the user to save and then Resume or Rebuild affected outputs (`EditRequestContext`).
- Copy puts the title, the description with a last line "Watch the full video: <link>" (or "[PASTE THE FULL VIDEO LINK HERE]" without one) and the hashtags on the clipboard (`shortUploadText`); the card shows the same line. The link is read when copying, so changing it redoes nothing.

## Unhappy paths

Every message says what failed and how to fix it; the stage prefixes it with the step: "Shorts:", "Short N image prompts:", "Short N image M:" or "Short N:".

- No usable clip twice → "The AI model didn't pick any clip Slopify could use as a short, twice (…). Retry stage; if it keeps happening, widen the length range in Edit project → Shorts, or choose another model in Edit project → Providers."
- The narration is shorter than the minimum → "The narration is N seconds long, shorter than the M-second minimum for a short, so there is nothing to cut. Lower the shortest length in Edit project → Shorts, then Retry stage."
- Every attempt at a clip's prompts had the wrong count or format → "The AI model wrote N image prompts for a short that needs exactly K. Retry stage, or choose another model in Edit project → Providers."
- A short's image is missing at render → "Short N is missing one of its images. Retry stage to make it again; if it keeps happening, use Make this short again in Edit project → Shorts."
- A hand-set range that breaks a rule is refused on save under `content.shortsRanges.N` and shown under the clip: "Short N would last S seconds, shorter than the M-second minimum. Start it earlier or end it later.", "… longer than the M-second maximum. Start it later or end it earlier.", "Short N would share sentences with short K (sentences a-b). Choose a range that doesn't overlap it.", or, for shorts picked before ranges existed, "These shorts were picked before clips could be adjusted by hand. Use Pick different moments, then adjust the new clips."
- The music: "Background music is only used by the shorts. Turn Shorts on in Edit project → Shorts, then add the music." on an upload with Shorts off; at render "The shorts' background music couldn't be read as audio (…). Choose another file under Background music in Edit project → Shorts, or remove the music, then Retry stage." (or "… is no longer in the project." / "… holds no sound.").
- No text model, or the word timing missing or empty → the same fixes as scenario 27.
- ffmpeg failures read as the video export's (scenario 11).

## State transitions

- The Video stage is pending → running → done or failed across the render, the description and every Shorts step together; a failed short fails the stage while everything already made stays published, and Retry stage redoes only what did not finish.
- Stale when: the narration or its text changes (new timing), the silence gap or edge silence changes, the prompt, count or lengths change, the model changes, or the title changes (the pick; clips it chooses again on the same sentences keep their work); `imageSeconds` or the style prompt changes (the prompts, images and renders); a clip's range is set by hand or "Make this short again" (that clip's prompts, images and render); motion, zoom, the subtitle font, the title on screen, the speed or the music and its volume (the renders only). Not stale when captions' look, the slideshow images, the Document or the full video link change.

## Invariants

- Clips start and end on sentence edges measured by the word timing, and their sound is cut from exactly the timeline those times are on.
- A project saved before Shorts, or with Shorts off, plans exactly the work and fingerprints it did before; a short saved before the title, speed, music and seeds existed keeps its fingerprints (proved against the old request in `recipe-shorts.test.ts`).
- The step never delays the render and the render never waits for it.
- A short on screen is the current pick's: a video or image is shown when it was made after the pick or cut from the same sentences as its clip (`currentShorts`).

## Outcomes & side effects

- Success: `shorts.json`, K vertical images per short and one MP4 per short, shown in the Video stage's Shorts part with a player, the length, the link line, Copy and Download, and in the stage's Download menu as "Short N (.mp4)".
- Cost: Play's estimate adds a Shorts row (the pick, one prompt call per short, and `count × ceil(maxSeconds / imageSeconds)` images, the most the step can ask for); the rebuild review prices `shorts:future` the same way until the clips are picked, and once they are, each clip's prompt call together with its K images before the prompts are written (`unfoldsImages`, `priceRecipes`).
- No telemetry: counting shorts needs a new collector field, which this change does not add.

## Dimensions not in play

- Uploading to YouTube Shorts, TikTok or Reels: the user downloads and copies.
- Reviewing the picks before the render: the step stays automatic; clips are adjusted afterwards.
- Background music on Play: the file belongs to a project and is added in Edit project; Play sets only its volume.
- Non-English narration: timing is English-only, as in scenario 17.
