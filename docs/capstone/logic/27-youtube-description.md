---
scenario: youtube-description
screens:
- 06-play
- 08-project
- 04-prompts
depends_on:
- 03-placeholder-substitution
- 04-run-admission
- 11-video-assembly
- 12-reruns-and-edits
- 14-storage-and-downloads
- 15-prompt-management
- 17-subtitles
generated_date: '2026-09-25'
capstone_version: 5.2.0
paths_covered:
  - :(top)packages/app/src/slices/youtube/**
  - :(top)packages/app/src/slices/rebuild/recipe-youtube.ts
  - :(top)packages/app/src/slices/rebuild/runtime-youtube.ts
  - :(top)packages/app/src/kernel/db/migrations/0015-description-prompts.sql
  - :(top)packages/web/src/play/youtube-description.tsx
  - :(top)packages/web/src/project/body-youtube.tsx
  - :(top)packages/web/src/project/revision-youtube.tsx
---

# 27 YouTube description

An optional step inside the Video stage: once the narration's words are timed, the project's text model writes a YouTube description (a short summary, a chapter list in YouTube's format, hashtags at the end) and a separate list for YouTube's Tags field. It runs beside the render, not after it, and has no stage of its own.

## Trigger & preconditions

- A per-project switch, `youtubeDescription` (absent or false is Off, the default), and a Description prompt, `descriptionPrompt` (absent or blank is the built-in prompt in `packages/app/src/slices/youtube/model.ts`). Both are on Play's Export rail and in Edit project → Prompts (`packages/web/src/play/youtube-description.tsx`, `packages/web/src/project/revision-youtube.tsx`).
- It needs narration: admission refuses the switch with narration Off ("The YouTube description is timed from the narration. Turn narration on, or turn the YouTube description off."), and Play's draft conversion drops it (`usesYoutubeDescription`, `youtubeDescriptionFields` in `packages/app/src/slices/admission/rules.ts`). It works whether the video renders or only the WAV is exported.
- It needs the project's text model: the LLM row becomes required, like the article's (`admit`, `modelFields`, `validateRecipeInputs`, Play readiness).
- Description prompts are a Library prompt kind, `description` (migration `0015-description-prompts.sql` widens the prompts table's kind check). A picked prompt's keywords become Play fields and its body is frozen into the project like every other prompt (`pickTemplates`, key `description`); the built-in prompt has no keywords.

## Steps

1. Planning adds `subtitles:timing` when captions are on or the description is on; with captions Off it makes no `subtitles:cues` or `subtitles:files` (`recipe-exports.ts`). The timing's fingerprint does not include the description, so switching it on beside captions keeps the timing.
2. `youtube:description` (stage `video`, kind `provider`, local operation `youtube-description-v1`) depends on `subtitles:timing` only. Its fingerprint is the timing's selected identity, the LLM provider, model and thinking mode, the rendered Description prompt (blank for built-in) and the title (`recipe-youtube.ts`). Readiness, charge warnings, credentials and the rebuild estimate treat it as an LLM call (`recipeProviderChoice`, `priceRecipe`).
3. When the timing lands, the runner claims the step. It reads the selected `subtitles.json`, whose word times are already in the final video's time: the timing walks the same edge silence, intro, gap, body, gap, outro timeline the export uses (`runtime-subtitles.ts`, `audioTimeline`). The video length is that timeline's total (`runtime-youtube.ts`).
4. The words become passages: a passage closes at the first sentence end after 20 s, at any pause of 1.5 s or more, or after 60 s without a sentence end. Each line reads `[M:SS] text`, or `[H:MM:SS]` from the first hour (`transcript.ts`, `timestamps.ts`).
5. The request is a system message with the answer's JSON shape and YouTube's rules, then a user message with the prompt, `Video title`, `Video length` and the timed transcript (`descriptionMessages`, `answer.ts`). It goes through the attempt wrapper with a `check` hook.
6. The answer is read as `{summary, chapters[{start,title}], hashtags[], tags[]}` (bare or fenced JSON) and checked: summary present; at least 3 chapters; each time readable as M:SS or H:MM:SS; the first exactly 0:00; strictly ascending; every start before the end; every chapter at least 10 s long, the last measured to the end; one-line titles not starting with a time; 1–15 one-word hashtags (a missing `#` is added); at least one tag, each at most 100 characters, without commas or angle brackets, no duplicates ignoring case, and the Tags field at most 500 characters counted as YouTube counts it (commas, plus quotes around a tag with a space); the assembled description without `<` or `>` and at most 5,000 characters (`checkDescriptionAnswer`).
7. A refused answer is a failed attempt, so the wrapper asks again with backoff while attempts remain.
8. Slopify writes the description itself: summary, a blank line, one `M:SS Title` per chapter, a blank line, the hashtags joined by spaces. Tags are joined with `, `. Both are published as `description.txt` (role `youtube_description`) and `tags.txt` (role `youtube_tags`) of the originating revision, stage `video`; the piece payload keeps the chapters and the length.

## Branches

- Built-in prompt versus a Library prompt: only the instruction differs; the rules and answer shape are fixed.
- Hand-edited captions normally skip timing; with the description on, timing still runs for it (`runtime-store.ts`).
- Edit project → Prompts: picking Built-in removes the frozen `description` template and its rendered text; picking a Library prompt freezes its body.

## Unhappy paths

Every message says what failed and how to fix it; the stage shows it prefixed "YouTube description:".

- Every attempt broke a rule → e.g. "The AI model's chapters broke YouTube's rules (the first chapter must start at 0:00). Retry stage, or choose another model in Edit project → Providers." Tags and hashtags have their own sentences; an unreadable answer says it didn't come back in the expected format.
- The word timing output is missing → "…Use Re-run section on Video, then Retry stage."; timing with no words → the same fix.
- No text model chosen → "Choose one in Edit project → Providers, then Retry stage."
- Timing itself fails as in scenario 17 (its no-narration message now names the YouTube description too).
- Cancel, pause and restart follow scenario 13; an unanswered request is resumed like any provider piece.

## State transitions

- The Video stage is pending → running → done or failed across the render and this step together; a failed description fails the stage while the render's output stays published.
- Stale when: the narration or its text changes (new timing), the silence gap or edge silence changes, the prompt or its keywords change, the model or thinking changes, or the title changes. Not stale when only motion, zoom, seconds per image, images, captions' look or the Document change.

## Invariants

- The model never lays out the description: chapter lines, blank lines and the hashtag line are assembled deterministically.
- Chapter times are the narration's real times in the final video; nothing re-times them after the model answers.
- The step never delays the render and the render never waits for it.

## Outcomes & side effects

- Success: `description.txt` and `tags.txt`, shown in the Video stage's YouTube block with Copy and Download, and in the output list.
- One LLM request per attempt, priced on Play (the timed transcript estimated from the article length) and in rebuild review. No telemetry event of its own.

## Dimensions not in play

- Uploading to YouTube or reading a channel: the user copies the text.
- Non-English captions: timing is English-only, as in scenario 17.
