---
scenario: channel-memory
screens:
- 02-play
- 13-schedules
depends_on:
- 04-run-admission
- 07-article-writing
- 14-storage-and-downloads
- 22-play-drafts
- 25-scheduled-jobs
- 30-channels-and-cast
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: ff3268ab3122
paths_covered:
  - ":(top)packages/app/src/slices/episodes/**"
  - ":(top)packages/app/src/slices/channels/videos.ts"
  - ":(top)packages/app/src/slices/channels/studio-csv.ts"
  - ":(top)packages/app/src/edge/http/channel-memory.ts"
  - ":(top)packages/app/src/kernel/db/migrations/0039-channel-essentials.sql"
  - ":(top)packages/web/src/channels/episodes-tab.tsx"
  - ":(top)packages/web/src/channels/videos-tab.tsx"
  - ":(top)packages/web/src/channels/memory-api.ts"
  - ":(top)packages/web/src/play/seen-before.tsx"
---

# 31 Channel memory

What a channel remembers of what it already made, in two stores. **Episode memory**: when a project finishes, a small LLM call writes a summary of at most 150 words onto its channel; later runs on that channel whose article is generated carry up to 5 related summaries into the article (or script) prompt. **Existing videos**: titles of videos made before or outside Slopify, pasted or imported from a YouTube Studio CSV, which schedule topic suggestions and Play's "already made" note check against. Both live on the channel page's Episodes and Existing videos tabs. Channel CRUD and the cast are scenario 30. Paths below are relative to `packages/app/src/` unless they start with `packages/`.

## Trigger & preconditions

- Routes, mounted at `/api/channels` beside the channel routes (`edge/http/app.ts:185`), in `channelMemoryRoutes` (`edge/http/channel-memory.ts:37-84`): `GET /:id/episodes`, `PUT /:id/episodes/setting`, `PUT /:id/episodes/:memoryId`, `DELETE /:id/episodes/:memoryId`, `GET /:id/videos`, `POST /:id/videos/preview`, `POST /:id/videos`, `DELETE /:id/videos`, `DELETE /:id/videos/:videoId`. The channel id and video id are UUIDs; a memory id is 1–100 characters (`:22-24`).
- Storage (`kernel/db/migrations/0039-channel-essentials.sql`): `episode_memories` with one row per project (unique index on `project_id`) and no foreign key to projects, cascading with its channel (`:27-42`), plus a later `recipe` column (`:64`); `channels.episode_memory` 0/1 (`:45`); `channel_videos` with titles 1–500 characters, unique per channel ignoring case (`:53-59`).
- Episode memory switch defaults: every channel that existed at the migration is off; on an install with no project yet the default channel is on (`0039-channel-essentials.sql:43-46`); every channel created afterwards starts on (`slices/channels/service.ts:46-52`).
- Summaries are triggered by the event hub: `createEpisodeMemoryWatcher` observes every project event (`main.ts:307-316`, `:355-362`) and acts on `project.state` with state `done` (`slices/episodes/summarize.ts:205-206`).
- Single local user; no authority checks.

## Steps

**Episode summary (on finish)**

1. The watcher skips a project already being summarised (one in flight per project), then yields off the emitter's call stack and runs `summarizeEpisode` (`slices/episodes/summarize.ts:201-217`).
2. `summarize` (`slices/episodes/summarize.ts:103-162`), in order: project gone → `gone`; the project's channel (`projectChannelId`) has memory off → `off`; an existing memory with `source = "edited"` → `edited`; no non-empty `article_txt` output file → `no-article` (`articleText` `:183-190`).
3. The recipe is SHA-256 of `[promptVersion (1), project title, article text]` (`:116-118`); equal to the saved memory's recipe → `unchanged`, no LLM call.
4. The model is the project's `config.llm`, else its automatic reviews' provider and model (`llmOf` `:165-170`); neither → `no-llm` with an info log "No episode summary: this project has no text model chosen, so later episodes won't be reminded of it." (`:120-128`).
5. The call goes through the standalone LLM runner with owner `{ kind: "channel", id }` and purpose `episode-summary`, a 3-minute timeout combined with the shutdown signal (`:129-139`, `timeoutMs` `:32`). Messages (`summaryMessages` `:58-75`): a system line asking for plain prose of at most 150 words, and a user message naming the episode title and sending the article cut to its first 24,000 characters plus "…" (`articleCharsMax` `:31`).
6. The answer's whitespace is collapsed and cut to its first 150 words plus "…" (`clampSummary` `:78-83`); an empty result throws (`:141`).
7. Re-check after the call: project deleted meanwhile → `gone`; summary edited meanwhile → `edited` (`:142-144`).
8. `saveGeneratedMemory` upserts by `project_id`, keeping the first id and `created_at` and replacing channel, title, summary, cast, recipe and `updated_at` with `source = 'generated'` (`slices/episodes/repo.ts:87-117`). The cast column holds the names of members `castMentions` finds in title plus article, using the run's cast snapshot, else the channel's current cast (`slices/episodes/summarize.ts:153-156`, `castOf` `:172-181`; matching rule in scenario 30).

**Earlier episodes (on run start)**

9. Admission strips any `earlierEpisodes` the draft brings and computes them afresh (`slices/admission/start.ts:68-71`, `:83`). `earlierEpisodesFor` (`slices/episodes/related.ts:67-88`) returns undefined unless `sources.article === "generate"`, the resolved channel has memory on, and it has at least one memory.
10. The subject is the rendered title plus every keyword value (`:83`). `relatedEpisodes` (`:24-55`) scores each memory: 100 per cast member it lists that the subject mentions (`castWeight` `:18`), plus 1 per title word shared with the subject. Title words are `topicWords` (normalised, filler words and plural `s` removed, `slices/schedules/similar.ts:35-53`) longer than 2 letters or containing a digit (`titleWords` `slices/episodes/related.ts:59-61`); a word in at least 2 memory titles and in more than half of them is ignored as the template's (`:32-39`). A memory whose normalised title equals the new title is a remake and is excluded (`:44`). Score 0 is dropped; sort by score, then newest first; keep at most 5 (`earlierEpisodesMax` `:15`).
11. The picked `{ title, summary }` list is frozen into the run config as `earlierEpisodes` (`slices/admission/schema.ts:177-180`). `withEarlierEpisodes` appends an "Earlier episodes" block with the instruction to stay consistent, never contradict, refer back where natural and not retell, then one `- "<title>": <summary>` line each (`slices/episodes/related.ts:93-107`). It is applied to the article prompt (`slices/article/run.ts:64`) and to the article or script prompt in the recipe (`slices/rebuild/recipe-text.ts:192`); how the article is written is scenario 07.

**Episodes tab**

12. `GET /:id/episodes` returns `{ enabled, memories }`, newest first (`slices/episodes/service.ts:45-57`, `slices/episodes/repo.ts:63-70`).
13. `PUT /:id/episodes/setting` `{ enabled: boolean }` writes the switch (`slices/episodes/service.ts:59-71`). Turning it on does not summarise projects that already finished.
14. `PUT /:id/episodes/:memoryId` `{ summary }` trimmed, 1–4,000 characters (`summaryCharsMax`), sets `source = 'edited'` (`slices/episodes/service.ts:29-43`, `:73-91`). The tab marks it "Edited · " (`packages/web/src/channels/episodes-tab.tsx:78`).
15. `DELETE /:id/episodes/:memoryId` removes it (`slices/episodes/service.ts:93-104`), behind a "Delete summary" confirmation (`packages/web/src/channels/episodes-tab.tsx:124`).

**Existing videos tab**

16. Paste: `POST /:id/videos` `{ format: "lines", text }`; `titlesFromLines` drops a byte-order mark, splits on line breaks, collapses whitespace and drops blank lines (`slices/channels/studio-csv.ts:100-107`).
17. CSV: the file is first sent to `POST /:id/videos/preview` `{ format: "csv", text }`, which saves nothing and returns the titles plus the channel's remembered filter (`previewChannelVideos`, `slices/channels/videos.ts:84-96`). `titlesFromCsv` (`slices/channels/studio-csv.ts:55-68`): drops a byte-order mark; picks the separator among comma, semicolon and tab by count in the first line (`:49-53`); parses quoted fields with commas, doubled quotes and line breaks (`:11-47`); takes the column headed "video title", else "title", else "content" (any case, in that order), else the first column whose sample (rows 2–21) holds multi-word text that is not a number, duration, date or 11-character video id, else the first non-plain column (`textColumn` `:81-92`, `plainValue` `:71-79`); skips the header row when named or when it looks like one (`:94-98`); drops empty cells and a "Total" row.
18. The preview shows one tick per title; "Keep only titles containing…" ticks the titles containing the text case-insensitively, and an empty filter ticks all (`tickedBy`, `packages/web/src/channels/videos-tab.tsx:30-35`). Saving sends the ticked titles as lines plus the filter (`:162-163`).
19. `importChannelVideos` (`slices/channels/videos.ts:98-121`): each title cut to 500 characters (`videoTitleMax` `:35`, `:140-144`); inside one transaction each is inserted with `ON CONFLICT DO NOTHING`, so titles already on the channel (any case) and repeats in the import are skipped; a sent filter is stored trimmed as JSON under setting `channels.importFilter.<channelId>` (`:40`, `:117-118`). Answer 201 `{ added, skipped }`.
20. `DELETE /:id/videos/:videoId` removes one; `DELETE /:id/videos` removes all and answers `{ deleted }` (`slices/channels/videos.ts:163-183`), the latter behind a "Remove all" confirmation (`packages/web/src/channels/videos-tab.tsx:205`).

**Already-made checks**

21. Schedules: `knownTitles` lists the schedule's own topics plus the titles of live projects in the schedule's channel plus that channel's existing video titles (`slices/schedules/topics.ts:251-279`). Up to 5,000 of them go into the topic prompt (`knownMax` `:39`, `:299`), and `newTopics` drops a candidate when `topicInTitle` matches any of those titles (`slices/schedules/similar.ts:131-141`, `:79`). The schedule flow is scenario 25.
22. Play: `seenBefore` compares the typed title and topic keyword values with `similarTopics` against the draft channel's project titles first, then its existing video titles (`packages/web/src/play/seen-before.tsx:19-31`). A match shows a status line, "This channel already has a video on this: …" or "This channel already uploaded …"; nothing is refused, and the line disappears once Start created the project (`:56-63`).

## Branches

- Summary outcomes: `saved`, `off`, `unchanged`, `edited`, `no-article`, `no-llm`, `gone`, `failed` (`slices/episodes/summarize.ts:48-56`); only `saved` writes.
- A project moved to another channel and finished again: the upsert moves its memory to the new channel (`slices/episodes/repo.ts:103`).
- A run whose article is provided or off carries no earlier episodes (`slices/episodes/related.ts:72`).
- The run's own cast snapshot is used for the summary's cast names when present; otherwise the channel's cast as it is now, pictures or not (`slices/episodes/summarize.ts:173-181`).
- CSV versus lines is chosen by the client's `format` field; lines skip the preview.

## Unhappy paths

- Any thrown error during a summary (LLM failure, empty answer, file read) is caught: a `episode.memory` warn log "The episode summary wasn't saved: <error>. The project is unaffected; only later episodes won't be reminded of this one. Check the project's text model in Settings → Providers." and outcome `failed`; the project stays done (`slices/episodes/summarize.ts:85-101`). No retry is scheduled; the next finish of that project tries again.
- Shutdown: `close` aborts in-flight summaries and stops new ones; the shutdown path waits for `settled` (`slices/episodes/summarize.ts:218-223`, `main.ts:755`, `:783`). An aborted call returns `failed` without logging (`slices/episodes/summarize.ts:93-94`).
- Finished twice concurrently: the second `done` event is ignored while the first is in flight (`slices/episodes/summarize.ts:208`).
- Episodes and videos refusals (`edge/http/channel-memory.ts:111-126`): `not-found` → 404 "This channel or episode summary no longer exists; it may have been deleted in another tab. Reload the channel's Episodes tab." or the Existing videos equivalent; `invalid-input` → 400 with the slice's message, else "This request isn't valid. Reload the page and try again."
- Edit summary blank → "Write the summary, or delete the memory instead."; over 4,000 → "Keep the summary to 4,000 characters or fewer; about 150 words is plenty." (`slices/episodes/service.ts:32-43`). Editing or deleting a memory under another channel's id → not found (`:84`, `:99`).
- Import body over 20 MB → 400 "This file is larger than 20 MB. Export fewer videos from YouTube Studio, or paste the titles instead." (`edge/http/channel-memory.ts:25-26`, `:86-101`).
- No titles found: CSV → "No video titles were found in this file. Export it from YouTube Studio → Analytics → Content (Export current view → Comma-separated values), or paste the titles one per line instead."; lines → "Paste at least one video title, one per line." (`slices/channels/videos.ts:145-153`).
- More than 10,000 titles → "This holds N titles; import at most 10,000 at a time." (`importMax`, `slices/channels/videos.ts:38`, `:154-159`).
- Filter over 200 characters → refusal naming "Keep only titles containing…" (`slices/channels/videos.ts:39`, `:48-54`).
- A stored filter that is not a JSON string reads as "" (`storedFilter`, `slices/channels/videos.ts:124-132`).
- Deleting the source project leaves its memory in place (no foreign key, `0039-channel-essentials.sql:27-29`); deleting the channel removes memories and videos by cascade.

## State transitions

- Episode memory row: absent → `generated` (first summarised finish) → `generated` replaced in place on a later finish with a new recipe → `edited` (user edit) → deleted. `edited` never returns to `generated`: the watcher and the post-call re-check both stop on it (`slices/episodes/summarize.ts:113`, `:144`).
- Channel `episode_memory`: 0 ↔ 1 freely.
- `channel_videos`: rows added or removed; no update path for a title.

## Invariants

- At most one memory per project (`0039-channel-essentials.sql` unique index on `project_id`).
- A user-edited summary is never overwritten by a generated one.
- A project's `earlierEpisodes` are fixed at admission; later memory edits, deletions or new memories change no project already made, and a run without them sends the prompt it always sent (`slices/episodes/related.ts:63-66`, `:90-92`).
- A summary never fails or delays the project it describes.
- Existing video titles are unique per channel ignoring case.

## Outcomes & side effects

- Cost: the summary call is metered against the channel and shows on Home's run cost (`slices/episodes/summarize.ts:34-35`, `kernel/runner/meter.ts:42`).
- Backups carry `episode_memories` and `channel_videos` (`slices/storage/backup-format.ts:90-97`); scenario 14.
- Topic suggestions and the Play note read the stored titles; nothing else reads `channel_videos`.
- No notifications and no telemetry events.

## Dimensions not in play

- D1 Authority: single local user; no ownership checks.
- D5 Money: nothing charged in-app; the summary adds provider cost to the run-cost meter only.
- D7 Time: memories and titles never expire; no retention window.
- D13 Notification: none sent; failures are log lines only.
- D15 Record and audit: no history of summary edits beyond `source` and `updated_at`.
- Reading real YouTube data: titles come only from paste or a user-exported CSV; no YouTube API call exists.
