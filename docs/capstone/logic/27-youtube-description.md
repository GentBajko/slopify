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
generated_at_commit: e9226a34aa8a
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: 2baf60a210ab
paths_covered:
  - ":(top)packages/app/src/slices/youtube/**"
  - ":(top)packages/app/src/slices/rebuild/recipe-youtube.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-youtube.ts"
  - ":(top)packages/app/src/edge/http/youtube-edits.ts"
  - ":(top)packages/app/src/kernel/db/migrations/0015-description-prompts.sql"
  - ":(top)packages/app/src/kernel/db/migrations/0031-prompt-history-and-description-edits.sql"
  - ":(top)packages/web/src/play/youtube-description.tsx"
  - ":(top)packages/web/src/project/body-youtube.tsx"
  - ":(top)packages/web/src/project/revision-youtube.tsx"
  - ":(top)packages/app/src/slices/revisions/subject.ts"
---

# 27 YouTube description

An optional step inside the Video stage: once the narration's words are timed, the project's text model answers one JSON object from which Slopify writes four files: a YouTube description (summary, chapter list, hashtags), a Tags list, a comment to pin under the video, and two other titles for YouTube's title A/B test (`packages/app/src/slices/youtube/model.ts:1-3`, `packages/app/src/slices/rebuild/runtime-youtube.ts:23-26`). It runs beside the render and has no stage of its own. The project page shows the text with the user's hand edits, chapters fitted to YouTube's rules and `{{Name}}` link placeholders filled.

## Trigger & preconditions

- Per-project switch `youtubeDescription` (absent or false is Off) and prompt name `descriptionPrompt` (absent or blank is the built-in `defaultDescriptionPrompt`, shown as "Built-in") (`packages/app/src/slices/admission/model.ts:212-214`, `packages/app/src/slices/youtube/model.ts:25-38`). Both sit on Play's Export rail and in Edit project → Prompts; the switch is disabled without narration unless already on, and the prompt picker is disabled while the switch is off (`packages/web/src/play/youtube-description.tsx:8-10`, `youtube-description.tsx:41-65`, `packages/web/src/play/stage-rails.tsx:219`, `packages/web/src/project/revision-form.tsx:684-685`).
- `usesYoutubeDescription` is true only when the switch is on and narration is not Off (`packages/app/src/slices/admission/rules.ts:473-479`). Switch on with narration Off → field error "The YouTube description is timed from the narration. Turn narration on, or turn the YouTube description off." (`rules.ts:481-492`); Play's draft conversion drops the switch without narration (`packages/app/src/slices/play-drafts/convert.ts:265-268`). With Article Off it is refused: "The YouTube description is written from the narration's words, which come from the article, and Article is Off…" (`rules.ts:685-691`).
- It needs the project's text model: it is listed as an LLM use "writing the YouTube description" (`rules.ts:422-423`) and makes the LLM row required in Play readiness (`packages/app/src/slices/play-drafts/readiness.ts:33`).
- Description prompts are the Library prompt kind `description` (migration `0015-description-prompts.sql`; kept in 0019 and 0034's CHECK lists). A picked prompt's body is frozen into the project under template key `description` and its keywords become Play fields (`pickTemplates`, `packages/app/src/slices/library/slots.ts:43`, `slots.ts:84-96`); the built-in prompt has no keywords. Only a picked prompt's rendered text is validated at rebuild (`packages/app/src/slices/rebuild/recipe-validation.ts:89-99`).

## Steps

1. Planning adds `subtitles:timing` when captions are on or the description (or shorts, edit cuts, reviews, voice files) needs it; caption cue and file items follow captions only (`packages/app/src/slices/rebuild/recipe-exports.ts:31-46`).
2. `youtube:description` (stage `video`, kind `local`, operation `youtube-description-v1`, version 1, charged as `{ kind: "provider" }`) depends on `subtitles:timing` only. Fingerprint values: the timing's resource identity, LLM provider, model, thinking, the rendered Description prompt (blank for built-in), the project's kept subject `subjectOf(config)` (`subjectTitle`, kept on the first rename, else `title`; `packages/app/src/slices/admission/model.ts:285-290`, `packages/app/src/slices/revisions/subject.ts:4-11`), and `config.language` when it is not English (`packages/app/src/slices/rebuild/recipe-youtube.ts:16-49`).
3. The runner claims it once timing is done. It needs an LLM choice, the selected ready `subtitle_words` output of `subtitles:timing`, and at least one passage (`runtime-youtube.ts:48-74`). Word times are already in final-video time (`packages/app/src/slices/youtube/transcript.ts:4-8`).
4. Video length is the sum of `revisionAudio` segments: edge silence, intro, gaps, body, outro (`runtime-youtube.ts:75-78`).
5. Passages: a passage closes at the first sentence end after 20 s, at a pause of 1.5 s or more, or once it would exceed 60 s; each line reads `[M:SS] text` (or `[H:MM:SS]`) (`transcript.ts:11-62`, `packages/app/src/slices/youtube/timestamps.ts:1-11`).
6. Messages: a system message with the JSON shape `{summary, chapters[{start,title}], hashtags[], tags[], pinnedComment, titles[]}` and YouTube's rules, then a user message with the instruction, `Video title` (the current `config.title`), `Video length` and the timed transcript (`packages/app/src/slices/youtube/answer.ts:47-88`, `runtime-youtube.ts:85-94`). When the project kept a `titlePattern` (set at start when the draft's title had keywords and rendered to something else, `packages/app/src/slices/admission/start.ts:67`, `start.ts:75-77`) and the current title still matches that pattern's fixed wording (`keepsShape`), the system message adds `titleShapeRule`: each other title keeps every word of the pattern outside its keywords and changes only what the keywords hold (`runtime-youtube.ts:82-84`, `answer.ts:68`, `packages/app/src/slices/youtube/titles.ts:14-42`). A title renamed away from its pattern has no shape. A non-English project language appends a language instruction to the system message (`withLanguage`, `packages/app/src/kernel/ports/languages.ts:113-126`; `runtime-youtube.ts:85-94`). The call has `webSearch: false` and a `check` hook (`runtime-youtube.ts:102-115`).
7. `checkDescriptionAnswer` reads the object between the first `{` and last `}` (`answer.ts:324-335`) and refuses, in order (`answer.ts:107-160`):
   - summary empty;
   - chapters: fewer than 3; a start not a non-negative integer or `M:SS`/`MM:SS`/`H:MM:SS`; a title empty, multi-line or starting with a time; first not 0:00; not strictly ascending; a start at or after the video end; a chapter under 10 s, the last measured to the end (`answer.ts:188-243`);
   - hashtags: none, more than 15, or not one word after `#` (`#` added when missing) (`answer.ts:275-294`);
   - tags: none, one over 100 characters, containing `,` `<` `>`, a case-insensitive duplicate, or a Tags field over 500 characters counted as YouTube counts it (commas plus 2 for quotes around a tag with whitespace) (`answer.ts:179-186`, `answer.ts:296-322`);
   - pinned comment empty or over 500 characters (the model is asked for at most 200) (`packages/app/src/slices/youtube/model.ts:19-23`, `answer.ts:130-137`, `answer.ts:70`);
   - titles: after trim and whitespace collapse, not exactly 2; one over 100 characters; containing `<` or `>`; with a shape, one that changes the pattern outside its keywords ("changes the title pattern … outside its keywords"); equal (case-insensitive) to the video title or each other (`answer.ts:245-273`);
   - the assembled description containing `<`/`>` or over 5,000 characters (`answer.ts:148-158`).
8. A refused answer is a failed attempt; the provider wrapper asks again while attempts remain. After the wrapper, the answer is checked once more, without the title shape, and a refusal throws (`runtime-youtube.ts:111-118`).
9. `assembleDescription` writes summary, blank line, one `M:SS Title` per chapter, blank line, hashtags joined by spaces; `tagsText` joins tags with `, ` (`answer.ts:162-177`). Published as `description.txt` (`youtube_description`), `tags.txt` (`youtube_tags`), `pinned-comment.txt` (`youtube_pinned_comment`), `titles.txt` (`youtube_titles`, one per line) of the originating revision; the payload keeps description, tags, chapters, pinned comment, titles and `durationSeconds` (`runtime-youtube.ts:119-141`, `packages/app/src/slices/storage/layout.ts:92-99`, `packages/app/src/slices/storage/model.ts:33-39`).
10. A `stage.completed` count with provider, model, token counts and `descriptions: 1` (`runtime-youtube.ts:142-148`, `packages/app/src/slices/telemetry/model.ts:60`).

## Branches

- Built-in versus Library prompt: only the instruction differs; rules and answer shape are fixed (`runtime-youtube.ts:79-81`). Edit project → Prompts: Built-in drops the frozen template; a Library prompt freezes its body; a saved prompt no longer in the Library is offered as "(saved choice)" (`packages/web/src/project/revision-youtube.tsx:9-40`, `youtube-description.tsx:71`).
- Hand-edited captions skip timing, except when the description (or shorts, edit, reviews) reads it (`packages/app/src/slices/rebuild/runtime-store.ts:47-57`).
- Video edit chapters: with the description on, the video's chapter cards and chapter openers take the description's chapters from the `youtube:description` payload and the edit fingerprint depends on it; otherwise the article's headings (`packages/app/src/slices/rebuild/recipe-edit.ts:58-85`, `packages/app/src/slices/rebuild/runtime-export-edit.ts:179-194`).
- Hand edits (project page YouTube block): fields `summary`, `chapters`, `hashtags`, `tags`, `pinnedComment`, `titles` (`packages/app/src/slices/youtube/edits.ts:9-16`). The generated files are split back into fields by reading the description from the end (`splitDescription`, `edits.ts:43-76`). Each edit stores `{base, text}`; `resolveField`: no edit → generated; edit with unchanged base → user's text; generated changed and differs from the user's text → user's text with the new one `pending` ("Use it / Keep mine / View diff"); generated now equal to the user's text → generated, not edited (`edits.ts:91-106`, `packages/web/src/project/body-youtube.tsx:600-617`). Saving text equal to the generated text clears the edit (`edits.ts:136-146`).
- Chapter fitting at show, copy and download time, never stored (`packages/app/src/slices/youtube/chapters.ts:1-7`): sort by time (first listed wins a tie); drop chapters starting at or after the video end when its length is known; move the first to 0:00; merge a chapter under 10 s into the one before (the first into the one after); drop the whole list if fewer than 3 remain. Non-chapter lines stay. The page shows "Chapters adjusted for YouTube: …" (`chapters.ts:34-143`, `body-youtube.tsx:186-196`).
- Link placeholders `{{Name}}` (1–80 characters, no braces or newline) fill from the project's own links first, then its channel's Brand-tab links; the default channel falls back to the older Settings `channel_links` list until its Brand tab saves one; names match case- and space-insensitively; a placeholder with no link stays as typed and is listed on the page (`packages/app/src/slices/youtube/placeholders.ts:1-91`, `packages/app/src/slices/youtube/edits-repo.ts:87-95`, `packages/app/src/slices/channels/model.ts:35-38`, `body-youtube.tsx:390-404`). The page offers a per-project "Previous video" link (`placeholders.ts:13-15`, `body-youtube.tsx:756-814`).
- `effectiveDescription` (edits over generated, chapters fitted, placeholders filled in description, tags and pinned comment; titles unfilled) feeds the page, the downloads and Prepare upload (`edits-repo.ts:97-143`, `packages/app/src/slices/storage/downloads.ts:92-150`, `packages/app/src/slices/studio/pack.ts:115-138`).
- Write again on the head of the description, the pinned comment and the other titles (each labelled "Write the <part> again") opens "Write the description again?" (one AI call writing summary, chapters, hashtags, tags, pinned comment and other titles anew) and regenerates only `youtube:description` at once; it is hidden while the stage runs or before anything is written (`body-youtube.tsx:96-97`, `body-youtube.tsx:215-219`, `body-youtube.tsx:497-506`, `body-youtube.tsx:422-434`). Write again reads the current title, so a renamed project's description is written about the new name (`packages/app/src/slices/admission/model.ts:279-281`).
- A description written before pinned comments or other titles existed shows an empty field with a placeholder naming Write again or Edit (`body-youtube.tsx:256-262`).

## Unhappy paths

Each refusal is a full sentence ending "Try again, or choose another model in Edit project → Providers." (`answer.ts:103`).

- Unparseable answer → "The AI model's YouTube description didn't come back in the expected format (a JSON object with a summary, chapters, hashtags, tags, a pinned comment and titles)…" (`answer.ts:116-120`). Chapter, hashtag, tag and title failures name the rule broken (`answer.ts:192-195`, `answer.ts:250-253`, `answer.ts:278-281`, `answer.ts:299-302`).
- No text model → "The YouTube description needs an AI text model, and none is chosen. Choose one in Edit project → Providers, then Try again." (`runtime-youtube.ts:49-52`).
- Timing output missing, or timing with no words → message naming More → Render the video again in the Video section, then Try again (`runtime-youtube.ts:61-74`).
- Wrong operation on the piece → internal-error message naming Download diagnostics (`runtime-youtube.ts:42-45`).
- Edit routes: unknown project → 404 "This project no longer exists…"; a field body over 20,000 characters is refused by validation; bad project links → 400 "This project's links weren't saved: <reason> Then press Save links under YouTube on the Video section." with `channelLinksProblem` reasons (at most 50 links, name 1–60 characters without braces, unique names, `http(s)` URL at most 2,000 characters) (`packages/app/src/edge/http/youtube-edits.ts:20-112`, `placeholders.ts:93-117`).
- Copy failure → "Couldn't copy the <what>. Select the text in the YouTube section and copy it." (`body-youtube.tsx:220-236`).
- Prepare upload with no description → "The YouTube description isn't written yet…" or, switch off, "No YouTube description is written for this project. Turn on YouTube description in Edit project → Prompts…" (`pack.ts:133-138`).
- Cancel, pause and restart follow scenario 13; `maySubmit` is checked before and after building the request (`runtime-youtube.ts:39`, `runtime-youtube.ts:101`); an unanswered request returns `held` (`runtime-youtube.ts:116`).

## State transitions

- The Video stage is pending → running → done or failed across the render and this step; a failed description fails the stage while the render's output stays published.
- Outdated when: the timing identity changes (narration, its text, silence gap, edge silence, language), the prompt or its keyword values, the model or thinking, the kept subject (a project rename alone keeps it, so it remakes nothing), or the project language. Not outdated by motion, zoom, image timing, images, captions' look or the Document (`recipe-youtube.ts:32-43`).
- Hand edits live in `youtube_description_edits` (one row per project, `ON DELETE CASCADE`); a row with no field edits and no links is deleted (`packages/app/src/kernel/db/migrations/0031-prompt-history-and-description-edits.sql`, `edits-repo.ts:50-64`). Routes: `GET /:id/youtube-edits`, `GET /:id/channel-links`, `PUT|DELETE /:id/youtube-edits/fields/:field`, `PUT /:id/youtube-edits/links` (`youtube-edits.ts:38-112`); the Settings list is `GET|PUT /channel-links` (`packages/app/src/edge/http/settings.ts:95-99`).

## Invariants

- The model never lays out the description: chapter lines, blank lines and the hashtag line are assembled deterministically (`answer.ts:17-19`).
- Chapter times come from the narration's real times in the final video; fitting changes only what is shown, copied and downloaded, never the stored file, the edit or any fingerprint (`chapters.ts:4-7`).
- The files on disk stay the generated text; downloads serve the effective text in their place (`downloads.ts:111-114`).
- Placeholders are filled when shown or copied, never when written, so a changed link changes every description (`placeholders.ts:1-6`).
- The step never delays the render and the render never waits for it (`recipe-youtube.ts:11-15`).

## Outcomes & side effects

- Success: four text outputs; the project page's Video section YouTube block with folded parts (description, tags, pinned comment, other titles), each editable with a character count against YouTube's limit, Copy buttons, and palette commands Copy description, Copy tags, Copy pinned comment (`body-youtube.tsx:83-172`, `body-youtube.tsx:302-353`). Below the parts the block shows On YouTube, the video each upload of the project became (scenario 32; `body-youtube.tsx:407-410`, `packages/web/src/project/on-youtube.tsx:11-14`).
- One LLM request per attempt, priced on Play as "YouTube description" from the prompt length plus 1.05 × article characters plus 1,500 input and 2,400 output (`packages/app/src/slices/estimate/index.ts:310-321`), and in rebuild review.

## Dimensions not in play

- Uploading to YouTube or reading a channel: absent; the user copies the text or uses Prepare upload.
- Non-English timing limits: as in scenario 17.
- Money beyond the LLM call: none.
