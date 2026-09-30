---
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: e3955ba998f1
paths_covered:
  - ":(top)packages/app/src/**"
  - ":(top)packages/web/src/**"
  - ":(top)packages/extension/src/**"
---

# Glossary

## Concepts

### Runs, stages and work

| Term | Meaning in Slopify | Defined at |
|---|---|---|
| Project, run | One video, audiobook or podcast being made or already made. It is created from a `RunDraft` and carries a frozen `RunConfig` (settings, prompts, cast snapshot, shared glossary, aliases). Project states: `running`, `paused`, `canceled`, `failed`, `partial` (the main output was made but a side step failed), `done`, `pending`. | `packages/app/src/slices/admission/model.ts:150`, `:273`; `packages/app/src/kernel/pipeline.ts:37-46` |
| Stage | One of the seven pipeline units: `research`, `article`, `audio`, `images`, `thumbnail`, `video`, `document`. Stage states: `pending`, `running`, `done`, `failed`, `canceled`, `provided`, `skipped`. Dependencies between stages form a graph: the video never waits on the thumbnail, and the document runs beside narration and images. | `packages/app/src/kernel/pipeline.ts:11-31`; `packages/app/src/kernel/runner/graph.ts:3-7` |
| Source | How a stage is fulfilled: `generate`, `provide`, `off`, or, for the thumbnail, `from_prompt` / `prompt_by_llm`. The article is always Generate or Provide. Video and Document are Generate or Off. | `packages/app/src/slices/admission/model.ts:11-13` |
| Format | The frame a run is made in: `16:9` (long video) or `9:16` (vertical). | `packages/app/src/kernel/pipeline.ts:6` |
| Short-mode run | A run narrowed to one vertical clip. "Make a 60-second short" on the first-run screen starts one, picking providers from what the machine already has. | `packages/app/src/slices/admission/short-mode.ts:5`; `packages/app/src/slices/onboarding/quick-short.ts:10-14` |
| Piece | A resumable sub-unit of a stage (a research chapter, an audio chunk, one image), stored as a `stage_pieces` row. | `packages/app/src/kernel/runner/piece-repo.ts:4` |
| Attempt | One provider call under the retry policy: at most `attemptLimit = 4` tries with backoff of 2 s, 8 s and 30 s. | `packages/app/src/kernel/runner/attempt.ts:14-24` |
| Automatic retry (wait) | The second retry tier. A step that failed on `rate_limit`, `timeout` or `dropped` is put back to `pending` with a stored wake time, about 2/4/8/16 minutes apart, so a restart keeps the wait. | `packages/app/src/kernel/runner/retry-policy.ts:4-21`; `packages/app/src/kernel/runner/work-authority.ts:79-104` |
| Plan limit | A CLI provider saying its subscription allowance is used up. The reset time is stored per account, and every call to that CLI waits for it instead of failing. | `packages/app/src/slices/run-cost/limits.ts:9-16` |
| Provider error kind | The one classification an adapter gives a failure: `auth`, `missing_key`, `unavailable`, `rate_limit`, `refusal`, `unsupported`, `timeout`, `dropped`, `other`. | `packages/app/src/kernel/ports/model.ts:43-70` |
| Provider request queue | The in-process limit of five concurrent provider calls app-wide, lowered further by per-provider catalogue limits. | `packages/app/src/kernel/runner/queue.ts:10` |
| Standalone call | A provider call that belongs to no project: schedule topic generation, a channel's episode summary, cast pictures. It uses the same attempt wrapper but records no attempts, and it is metered against its schedule or channel. | `packages/app/src/kernel/runner/standalone.ts:13-16` |
| Fix-it | The one action shown beside a failed step (sign in to a CLI, add a key, Soften and retry…). It comes from a single pure mapping from a failure to its fix. | `packages/app/src/slices/fixes/rules.ts:4-10`, `:56` |
| Soften and retry | For an image prompt that a content filter refused: the project's text model rewords the prompt inside the image step, then the image is drawn again. | `packages/app/src/slices/rebuild/soften.ts:5-8` |
| Re-run, redo plan | Re-running a stage marks its source-dependent descendants `pending`. Provided or skipped stages are stepped over. | `packages/app/src/slices/reruns/cascade.ts:6-11`, `:44` |
| Batch queue | Several runs started together. One batch video runs at a time; a paused item holds its place, and a failed or canceled one releases the next. | `packages/app/src/slices/batch/index.ts:81-82` |
| ETA, time left | The remaining time on a running step. Its basis is `progress` (the rate so far), `history` (the same kind of step in finished runs), `overdue`, or `unknown`, never a made-up number. | `packages/app/src/slices/eta/model.ts:1-12` |
| Run cost | Per-call pricing kept with each project (or schedule/channel for standalone calls), separate from telemetry and never leaving the machine. | `packages/app/src/slices/run-cost/meter.ts:24-26`, `:71-72` |
| Estimate | The pre-run `CostEstimate`: USD low/high, stage rows, unknown charges, catalogue date and assumptions. | `packages/app/src/slices/estimate/index.ts:58` |
| Catalogue | Refreshable model metadata (models, capabilities, concurrency, pricing). It is checked daily, and OpenRouter prices come from its public list. | `packages/app/src/catalog/store.ts:18-23` |
| Thinking | An optional LLM reasoning mode, accepted only when the chosen catalogue model lists it. | `packages/app/src/catalog/registry.ts:54-56` |
| Retired model | A model the catalogue no longer offers that a template, schedule, draft or project still names (the model-upkeep usage slots `llm`, `audio`, `images`, `animate`). | `packages/app/src/slices/model-upkeep/model.ts:4-20` |
| Host CLI bridge | The helper service (`slopify-cli-bridge.service`) on the host machine. It lets a Docker install run the host's `claude-code`, `codex`, `gemini` and `codex-image` CLIs. It is used when `SLOPIFY_HOST_CLI_DIR` is set. | `packages/app/src/host-cli/service.ts:12`; `packages/app/src/kernel/ports/host-cli.ts:8-11`; `packages/app/src/main.ts:333` |

### Revisions, reviews and held work

| Term | Meaning in Slopify | Defined at |
|---|---|---|
| Revision, head | An immutable saved snapshot of a project's config, content and per-work fingerprints, with `parentId`/`restoredFromId`. The `project_heads` row selects the current one, and older revisions stay restorable. Edit project saves a new revision. | `packages/app/src/slices/revisions/model.ts:83-92`; `packages/app/src/kernel/db/migrations/0004-project-revisions.sql:17` |
| Output state | How an output stands against the head revision: `ready`, `outdated` (its inputs changed) or `review`. | `packages/app/src/slices/revisions/model.ts:16` |
| Work, work key, fingerprint | A unit of recipe work in a revision (`revision_work`), keyed by a `WorkKey`. The unit counts as current only while its `Fingerprint` (a hash of its inputs) matches the head revision's. | `packages/app/src/kernel/runner/work.ts:5-35`; `packages/app/src/kernel/runner/work-authority.ts:49-60` |
| Work piece, continuation | A durable per-request row (`revision_work_pieces`) with input/result JSON, fingerprint and dispatch state. `continuation` stores a provider's async job token, so a retry fetches the accepted job instead of paying for it again. | `packages/app/src/kernel/db/migrations/0005-revision-work.sql:23-32` |
| Held work | Work or a piece whose `dispatch_state` is not `allowed` (`held` or `draining`). `maySubmit` refuses it, the stage returns `"held"`, and the project goes to `pending` ("waiting") until a checkpoint approval, an admission or Resume releases it. | `packages/app/src/kernel/db/migrations/0005-revision-work.sql:14`; `packages/app/src/kernel/runner/work-authority.ts:31-47`; `packages/app/src/kernel/runner/work.ts:33`; `packages/app/src/slices/notifications/rules.ts:11-12` |
| Rebuild preview, admission | A saved review of what an edit would redo, reuse and cost (`RebuildPreview`), then an explicit grant (`RebuildAdmission`) that lets the selected work run. Saving a revision alone starts no paid generation. | `packages/app/src/slices/rebuild/model.ts:23`, `:62` |
| Review checkpoint | A person's gate on `audio`, `images` or `video` in a revision. States: `configured`, `pending-review`, `held`, `released`, `satisfied`, `invalidated`, `canceled`. Work that depends on the checkpoint is held until the reviewed fingerprint is approved; independent work carries on. | `packages/app/src/slices/checkpoints/model.ts:1-10`; `packages/app/src/kernel/runner/checkpoint-authority.ts:4-6` |
| Automatic review | A reviewer model judges each finished item of `article`, `images`, `narration`, `thumbnail` or `shorts`. Mode `off`, `flag` (a failed item is marked for the person) or `redo` (made again, up to `defaultReviewRetries` = 2 times (0–5), then kept and flagged). Image reviews need a vision-capable CLI (`claude-code`, `codex`). | `packages/app/src/slices/reviews/model.ts:1-59`; `packages/app/src/slices/reviews/outcome.ts:19-21` |
| Review hold, review redo | While a review verdict waits to send an item back, the item's dependents are held. The redo goes through Re-run's path as a new revision. | `packages/app/src/slices/rebuild/review-redo.ts:15-18`, `:44-49` |
| Overrule | The person keeping an item an automatic review flagged. The flagged item waits on the project page for Overrule or Redo. | `packages/app/src/slices/notifications/rules.ts:39-40` |
| Next action | The single primary action a project shows for its situation, derived only from project state, so the rail, the section and the command palette agree. | `packages/web/src/project/next-action.ts:9-13` |
| Live | The project page's read-only watch of a build: step states, the article as it is written, images as they land, the narration waveform growing. It is fed by the page's event stream. | `packages/web/src/project/live-build.tsx:18-20` |
| Run notice | The notification kinds for a watched run: `ready`, `partial`, `failed`, `waiting`. Only a run seen `running` produces one. | `packages/app/src/slices/notifications/rules.ts:7-30` |

### Creation: Play, Library, templates

| Term | Meaning in Slopify | Defined at |
|---|---|---|
| Play, Play draft | The creation screen and its durable, versioned draft document. Start creates exactly the runs the person reviewed (`PlayReview`). | `packages/app/src/slices/play-drafts/model.ts:23`, `:44`; `packages/app/src/slices/play-drafts/start.ts:124` |
| Library, prompt | Named, reusable prompts by kind: `article`, `image`, `thumbnail`, `narration`, `description`, `shorts`, `review`, `script`. | `packages/app/src/slices/library/model.ts:1-23` |
| Entry | An intro or outro (`entryCategories`), in text or LLM mode. | `packages/app/src/slices/library/model.ts:25`, `:52` |
| Keyword, slot | A `{{name}}` placeholder in a prompt or title, substituted from one run's values. | `packages/app/src/slices/admission/substitute.ts:1` |
| Topic keyword | A keyword the project title names (`{{Topic}}` in "History: {{Topic}}"). A template stores it empty; every other keyword keeps its value as a setting. | `packages/app/src/slices/project-templates/one-off.ts:4-8` |
| Template | A named Play document saved without one-off values. It opens as a fresh draft or is pinned by a schedule. | `packages/app/src/slices/project-templates/model.ts:6`; `packages/app/src/slices/project-templates/one-off.ts:25-27` |
| Next chapter, book | For audiobooks: "Make the next chapter" opens a draft sharing the book's format, speakers, channel, prompts and settings, with the chapter number one higher. | `packages/app/src/slices/project-templates/next-chapter.ts:13-40` |
| Starter pack | A niche's worth of Library prompts, a suggested voice and a Play template, installed together from the first-run screen or the Library. | `packages/app/src/slices/onboarding/packs.ts:6-9` |
| Sample | The bundled demo projects `library`, `audiobook` and `podcast`. | `packages/app/src/slices/onboarding/model.ts:6-8` |
| Provided output | User-supplied research, article, audio, thumbnail or reference image staged before a run. Its stage state is `provided`. | `packages/app/src/slices/revisions/model.ts:17-18`; `packages/app/src/slices/storage/staging.ts:77-79` |

### Narration and voices

| Term | Meaning in Slopify | Defined at |
|---|---|---|
| Chunk mode | How narration text is split into TTS requests: `whole`, `paragraph`, `words` or `characters`. | `packages/app/src/slices/narration/chunk.ts:1` |
| Narration alias | A written word or phrase and how the voice says it ("Dr." as "Doctor"). It changes only what the voice is sent; the article, transcript and captions keep the written form. It is kept in Library → Aliases and copied into a run. | `packages/app/src/kernel/ports/narration-aliases.ts:1-8`; `packages/app/src/slices/narration/aliases.ts:9-12`; `packages/app/src/slices/admission/model.ts:154-155` |
| Pronunciation Glossary, shared glossary | Model-written IPA pronunciations for a project's terms. The shared glossary is every other project's copy, merged, taken at start. | `packages/app/src/slices/narration/pronunciation.ts:8-9`; `packages/app/src/slices/narration/shared-glossary.ts:7-10` |
| Narration Preparation | A model pass that turns the clean text into what the voice is sent, aware of aliases, language and speaker. | `packages/app/src/slices/narration/preparation.ts:96-101` |
| Pauses | A minimum silence between sentences, added in the join before word timing so captions, cuts and shorts stay in step. | `packages/app/src/slices/narration/pauses-model.ts:1-7` |
| Level the volume (loudness) | Every narration piece normalised to one loudness before the join, and every finished file mastered to a target: −14 LUFS for video, −18 for audio files. | `packages/app/src/slices/loudness/model.ts:1-34` |
| Voice format, speaker | Multi-voice runs: format `audiobook`, `podcast`, `drama` or `interview`; speaker role `narrator`, `host`, `guest` or `character`. The script comes from `script` (the model writes speaker turns) or `attribute` (the article's dialogue is handed to speakers). | `packages/app/src/slices/voices/model.ts:3-22` |
| Audition | A speaker reading their first script line (about 200 characters), or a sample line, to try a voice. | `packages/app/src/slices/voices/audition.ts:4-6` |
| Ambient bed | Rain, fire or wind that ffmpeg generates under the long video, ducked under the voice. | `packages/app/src/slices/video/ambient-bed.ts:1` |

### Channels and outputs

| Term | Meaning in Slopify | Defined at |
|---|---|---|
| Channel | A YouTube channel's identity in Slopify: brand kit, cast, episode memory, existing videos, and the channel that templates, schedules and projects count under. Every install has the default channel "My channel"; a NULL or unknown channel id belongs to it. | `packages/app/src/slices/channels/model.ts:4-7`, `:41` |
| Brand kit | Optional per-channel defaults: caption and title fonts and colours (`#RRGGBB`), intro/outro entries, end-screen text, document theme, ambient bed, language and description links. An empty kit changes nothing about a run. | `packages/app/src/slices/channels/model.ts:12-39` |
| Rebrand | Moving a project to another channel, or switching its brand kit. The project takes the new channel's cast and kit, and values the person set themselves are kept. | `packages/app/src/slices/channels/rebrand.ts:1-6` |
| Cast, cast member, cast snapshot | A channel's recurring `character`, `creature`, `place` or `object`, with reference images and optionally a voice. A run copies a snapshot, so later edits change no finished project. Hosts with voices seed a new podcast's speakers. | `packages/app/src/slices/channels/model.ts:9`, `:72-103`; `packages/app/src/slices/voices/cast.ts:4-12` |
| Episode, episode memory | A finished project of a channel, summarised in at most 150 words after it finishes. Up to 5 related earlier episodes (shared cast first, then title words) are appended to a new article or script prompt. | `packages/app/src/slices/episodes/summarize.ts:23-27`; `packages/app/src/slices/episodes/related.ts:14-24`, `:93` |
| Existing videos | Titles the channel made before or outside Slopify, pasted or imported from a YouTube Studio CSV, so topic generation and duplicate checks skip them. | `packages/app/src/slices/channels/videos.ts:9-13`; `packages/app/src/slices/channels/studio-csv.ts:1-7` |
| Short | An optional Video step: the text model picks self-contained clips by sentence number (1–10 clips, 15–180 s). Each becomes a 1080×1920 clip with new 9:16 images, word-by-word captions and its own title, description and hashtags. | `packages/app/src/slices/shorts/model.ts:1-37`; `packages/app/src/slices/shorts/pick.ts:7` |
| YouTube description | An optional Video step: a summary, a chapter list at the narration's real times (at least 3 chapters of at least 10 s), hashtags, a Tags list, a pinned comment and two alternative titles. | `packages/app/src/slices/youtube/model.ts:1-13`; `packages/app/src/slices/youtube/answer.ts:16` |
| Edit settings, Look, chapter card | How the Video stage cuts and finishes the slideshow (cuts, transitions, vignette/grain/grade, chapter cards drawn by libass). | `packages/app/src/slices/video/edit-settings.ts:3`; `packages/app/src/slices/video/cards.ts:4` |
| Animate images | Selected slideshow stills turned into clips by the image provider's image-to-video model, paid per clip. | `packages/app/src/slices/rebuild/runtime-animate.ts:15` |
| Render plan | Image slots, zoom and frame at 30 fps (1920×1080 or 1080×1920), passed to local FFmpeg. | `packages/app/src/slices/video/plan.ts:23` |
| Style preview | A short rendered preview of the chosen look and narration, cached by a hash of its settings. | `packages/app/src/slices/style-preview/service.ts:10-13` |
| Document, document theme | The optional seventh stage: the article as a styled PDF with the thumbnail as cover. The built-in theme is `plain`, plus Library themes. `dicemaster` is legacy and parsed but never offered. | `packages/app/src/slices/document/render.ts:20`; `packages/app/src/slices/document/model.ts:4-16` |
| Upload pack | Everything YouTube Studio asks for when a finished video or short is uploaded by hand, in Studio's order. Slopify never publishes. | `packages/app/src/slices/studio/model.ts:1-5`, `:63` |
| Studio extension, pairing token, fill queue | The browser extension that fills Studio's upload dialog from a pack. It holds the Slopify address and a pairing token, and takes entries oldest-first from the fill queue. | `packages/extension/src/background.ts:4-6`; `packages/app/src/slices/studio/queue.ts:7-12` |
| Mark uploaded | The person's own note that a finished video is on YouTube, which drops it from Home's Ready to upload. | `packages/app/src/slices/uploads/repo.ts:3-4` |

### Schedules and automation

| Term | Meaning in Slopify | Defined at |
|---|---|---|
| Schedule | A local recurrence that starts runs from a template. Missed/overlap policy is `skip` or `run-once`. Status: `active`, `paused`, `completed`, `canceled`. Each occurrence is a run with status `running`, `succeeded`, `failed` or `skipped`. It advances only while Slopify runs. | `packages/app/src/slices/schedules/schema.ts:30`, `:136`, `:150`; `packages/app/src/slices/schedules/scheduler.ts:36` |
| Topic queue | A schedule's list of upcoming topics (lines, a keyword table, or YAML/JSON). Each run takes the first. A schedule without self-generated topics completes when the queue empties. | `packages/app/src/slices/schedules/topic-list.ts:4-8`; `packages/app/src/slices/schedules/agenda.ts:62-64` |
| Topic generation, held topic | With `topicModes` `queue` or `hold`, the schedule asks an LLM for topics when the queue drops below `keepAtLeast`. Under `hold`, new topics wait for the person's approval ("waiting for you"). A lease stops two generations running at once. | `packages/app/src/slices/schedules/schema.ts:31-38`, `:164`; `packages/app/src/slices/schedules/topics.ts:25-34` |
| Similar topic | A near-duplicate by normalised equality, Jaccard word overlap, or containment. | `packages/app/src/slices/schedules/similar.ts:1-8` |
| Calendar, agenda | The coming weeks: every run a live schedule will make with its topic, projects running or finished in range, and waiting batch items. | `packages/app/src/slices/schedules/agenda.ts:31-33` |
| Home | What needs the person, what is running, what is coming up, what is ready to upload, and this week's cost, for the channel picked in the rail. | `packages/web/src/routes/home.tsx:38-39` |

### Storage, app and help

| Term | Meaning in Slopify | Defined at |
|---|---|---|
| Trash | Deleted projects, prompts, entries, templates and schedules are stamped rather than removed, and purged after 30 days. | `packages/app/src/slices/trash/model.ts:7-14` |
| Export everything (full backup) | A tar of manifest, settings/library/templates/schedules/drafts, usage, per-project rows, files and checksums. It never carries provider keys, logs or caches. | `packages/app/src/slices/storage/backup-format.ts:4-20` |
| Scheduled backup | The same archive written daily to a folder on disk, keeping the newest N (1–30). Off by default. | `packages/app/src/slices/backups/model.ts:4-13` |
| Update waiting | An update asked for while work runs installs by itself once nothing is running. | `packages/app/src/updater/model.ts:1-2`; `packages/app/src/updater/work-in-progress.ts:9-12` |
| Data directory | The local folder holding SQLite, project files, staging and logs. | `packages/app/src/kernel/paths.ts:4` |
| Telemetry event | An anonymous install/project/stage event, batched to the collector. | `packages/app/src/slices/telemetry/model.ts:6` |
| Tutorials, patch notes | Help → Tutorials renders the repository's `docs/wiki/` pages, and Settings → Patch notes renders `docs/patch-notes/`. Both are copied into the build and read offline. | `packages/app/src/slices/tutorials/library.ts:7-10`; `packages/app/src/slices/patch-notes/library.ts:7-10` |
| Info tip, help entry | One plain-words answer behind an info button (about 60 words), linking a tutorial section as Learn more. | `packages/web/src/help/entry.ts:1-7` |
| Command palette | Ctrl+K. Screens register the commands they offer with `useCommand` while mounted. | `packages/web/src/components/kit/command-palette.tsx:21-24`, `:102` |
