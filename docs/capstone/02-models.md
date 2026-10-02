---
generated_at_commit: d83482c1175e
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: e3cc0ff8fc41
paths_covered:
  - ":(top)packages/app/src/kernel/db/**"
  - ":(top)packages/app/src/kernel/ports/*.ts"
  - ":(top)packages/app/src/kernel/runner/*.ts"
  - ":(top)packages/app/src/kernel/events.ts"
  - ":(top)packages/app/src/kernel/ids.ts"
  - ":(top)packages/app/src/slices/**"
  - ":(top)packages/app/src/catalog/*.ts"
  - ":(top)packages/app/src/updater/model.ts"
  - ":(top)packages/app/src/edge/http/*.ts"
  - ":(top)packages/app/src/edge/events/hub.ts"
  - ":(top)packages/app/src/edge/autostart/model.ts"
  - ":(top)packages/web/src/**/*api.ts"
  - ":(top)packages/web/src/http.ts"
  - ":(top)packages/web/src/events.ts"
  - ":(top)packages/extension/src/pack.ts"
  - ":(top)packages/collector/src/*.ts"
  - ":(top)packages/collector/schema.sql"
---

# Models

One SQLite database (`slopify.db`, `packages/app/src/kernel/paths.ts:36`) opened with foreign keys on, WAL journaling and 0600 file modes (`packages/app/src/kernel/db/index.ts:8`), migrated by 42 SQL files numbered up to 0049 (`packages/app/src/kernel/db/migrations/`). Domain types live beside the slice that owns them (`packages/app/src/slices/*/model.ts`, `schema.ts`, `repo.ts`), provider contracts in `packages/app/src/kernel/ports/`, and the browser imports the app's own declarations through the `@app/*` path alias (`packages/web/tsconfig.json`, `packages/web/src/api.ts:1`). The Cloudflare collector has its own two-table D1 schema (`packages/collector/schema.sql:3`).

Companion chapters own three areas in depth and are not repeated here: narration text preparation, glossary and pronunciation types in `02-models-narration.md`; research documents and the reader model in `02-models-research.md`; the Docker host, container and project-folder types in `02-models-docker.md`. `slices/narration/` and `slices/research/` types are listed there only.

Coverage: every table and every exported object type of the slices' `model.ts`/`schema.ts`/`repo.ts` files, the provider ports, the runner's work and attempt records, the event stream, the backup format, and the browser's own HTTP body types. Shallow, not inventoried field by field: rendering internals (`packages/app/src/slices/document/{blocks,flow,writer,pages,render}.ts`, `packages/app/src/slices/video/{plan,ffmpeg,slideshow,figure-card,transitions,cuts}.ts`, `packages/app/src/slices/voices/{grouping,palette,panel,portraits,timing,join}.ts`, `packages/app/src/slices/loudness/{loudnorm,line-level}.ts`), `packages/app/src/slices/rebuild/runtime-*.ts` and `recipe-*.ts` helper types other than those listed, dependency-injection `*Deps` interfaces, provider adapter wire types (`packages/app/src/adapters/`), and browser in-memory UI state (`packages/web/src/play/draft-save.ts`, `packages/web/src/play/review-state.ts`, `packages/web/src/play/state.ts`, `packages/web/src/tutorial/model.ts`).

## Entities

| Entity | Definition site | Storage | Purpose |
|---|---|---|---|
| StageSources | `packages/app/src/slices/admission/model.ts:19` | `RunConfig` JSON | Source per stage kind: generate, provide, off, from_prompt, prompt_by_llm |
| ProviderChoice | `packages/app/src/slices/admission/model.ts:35` | `RunConfig` JSON | Provider, model and thinking chosen for a stage |
| VoiceChoice | `packages/app/src/slices/admission/model.ts:41` | `RunConfig` JSON | Narration provider, model, voice and narration options |
| SharedPronunciation | `packages/app/src/slices/admission/model.ts:60` | `RunConfig` JSON | One shared pronunciation, copied into a project from another project's glossary |
| ImagePromptChoice | `packages/app/src/slices/admission/model.ts:65` | `RunConfig` JSON | Library image prompt and how many images it makes |
| EntryChoice | `packages/app/src/slices/admission/model.ts:71` | `RunConfig` JSON | Library intro/outro choice and its mode |
| ProvidedText | `packages/app/src/slices/admission/model.ts:80` | `RunConfig` JSON | Text a stage set to Provide carries instead of a file |
| ProvidedFiles | `packages/app/src/slices/admission/model.ts:86` | `RunConfig` JSON | Ids of files already in staging, in slideshow order for images |
| ReferenceSettings | `packages/app/src/slices/admission/model.ts:135` | `RunConfig` JSON | Establishing reference image source for the Images stage |
| RunDraft | `packages/app/src/slices/admission/model.ts:150` | Play POST body; `play_drafts` review JSON | Everything a run is configured with, as Play posts it |
| TitleStyle | `packages/app/src/slices/admission/model.ts:265` | `RunConfig` JSON | Font and colour of on-screen titles |
| RunConfig | `packages/app/src/slices/admission/model.ts:273` | `projects.config`; `project_revisions.config` | RunDraft as accepted, with rendered prompt text |
| Project | `packages/app/src/slices/admission/model.ts:292` | `projects` + `project_controls` | A project row with its accepted RunConfig and pause state |
| StageActivity | `packages/app/src/slices/admission/model.ts:305` | In-memory | A running step in words, with its own progress: a percentage, or how many of its things are done |
| Stage | `packages/app/src/slices/admission/model.ts:312` | `stages` | One stage of a project with state, progress, failure and ETA |
| ProjectSummary | `packages/app/src/slices/admission/model.ts:338` | In-memory | Project plus derived status and the Keep as is mark (`project_set_aside`) |
| ProjectListing | `packages/app/src/slices/admission/model.ts:349` | `projects` + `stages` + `project_channels` + `project_uploads` + `project_set_aside` + `video_stats` | Projects list row with progress, channel, upload mark, Keep as is mark, the long video's Studio views and CTR, and limit waits |
| ListingLimitWait | `packages/app/src/slices/admission/model.ts:366` | In-memory | A plan-limit wait shown on a project listing row |
| FieldError | `packages/app/src/slices/admission/rules.ts:17` | In-memory | Field-level validation message |
| AdmissionInput | `packages/app/src/slices/admission/rules.ts:27` | HTTP request/response | Input to admission rules: draft, staged files, required slots |
| LlmUse | `packages/app/src/slices/admission/rules.ts:402` | In-memory | An LLM use in a run and the Play section holding it |
| SlotLintError | `packages/app/src/slices/admission/substitute.ts:9` | In-memory | A malformed keyword slot in a prompt body |
| DetectedSlots | `packages/app/src/slices/admission/substitute.ts:15` | In-memory | Keyword slots found in prompt bodies |
| Field | `packages/app/src/slices/admission/substitute.ts:23` | In-memory | A Play keyword field and its group |
| AttemptStart | `packages/app/src/kernel/runner/attempt-repo.ts:16` | In-memory | Fields written when an attempt starts |
| AttemptEnd | `packages/app/src/kernel/runner/attempt-repo.ts:28` | In-memory | Fields written when an attempt ends |
| Attempt | `packages/app/src/kernel/runner/attempt-repo.ts:34` | `attempts` | One provider attempt with revision/work/piece provenance |
| StageProgress | `packages/app/src/kernel/runner/graph.ts:101` | In-memory | Progress of a stage row |
| RunnerStage | `packages/app/src/kernel/runner/index.ts:11` | In-memory | Stage view the runner executes |
| StageContext | `packages/app/src/kernel/runner/index.ts:44` | In-memory | Per-stage execution context handed to a stage function |
| MeteredCall | `packages/app/src/kernel/runner/meter.ts:8` | `provider_usage` | One successful project provider call's usage |
| ProviderUse | `packages/app/src/kernel/runner/meter.ts:14` | In-memory | Usage of one provider call |
| StandaloneOwner | `packages/app/src/kernel/runner/meter.ts:39` | In-memory | Schedule or channel a standalone call belongs to |
| StandaloneUse | `packages/app/src/kernel/runner/meter.ts:44` | In-memory | Owner and purpose of a call made outside a project |
| StandaloneMeteredCall | `packages/app/src/kernel/runner/meter.ts:49` | `standalone_usage` | Metered provider call made outside a project |
| LimitWaiter | `packages/app/src/kernel/runner/meter.ts:55` | `plan_limit_waiters` | Project stage waiting on a plan-limit reset |
| StagePiece | `packages/app/src/kernel/runner/piece-repo.ts:22` | `stage_pieces` | One chunk/image/segment piece of a legacy stage |
| WorkRef | `packages/app/src/kernel/runner/work.ts:15` | In-memory | Identity of one revision_work row a provider call runs under |
| PublicationRef | `packages/app/src/kernel/runner/work.ts:24` | In-memory | Work plus piece/publication identity an output is published under |
| EventOrigin | `packages/app/src/kernel/events.ts:7` | In-memory | Revision/work identity every ProjectEvent carries |
| StageStateEvent | `packages/app/src/kernel/events.ts:13` | SSE stream | Stage state change pushed to open pages |
| StageProgressEvent | `packages/app/src/kernel/events.ts:25` | SSE stream | Stage progress pushed to open pages |
| ArticleDeltaEvent | `packages/app/src/kernel/events.ts:33` | SSE stream | Streamed article text pushed to open pages |
| LlmPreviewEvent | `packages/app/src/kernel/events.ts:39` | SSE stream | Streamed LLM text of any stage pushed to open pages |
| ImageLandedEvent | `packages/app/src/kernel/events.ts:49` | SSE stream | One image saved, pushed to open pages |
| NarrationPieceEvent | `packages/app/src/kernel/events.ts:58` | SSE stream | Narration piece saved, pushed to open pages |
| ProjectStateEvent | `packages/app/src/kernel/events.ts:65` | SSE stream | Project state change pushed to open pages |
| ReviewFlaggedEvent | `packages/app/src/kernel/events.ts:74` | SSE stream | Review flagged and kept an item, pushed to open pages |
| ProjectUpdatedEvent | `packages/app/src/kernel/events.ts:85` | SSE stream | Project changed; pages refetch |
| RunningCountEvent | `packages/app/src/kernel/events.ts:90` | SSE stream | Number of running projects |
| ScheduleTopicsEvent | `packages/app/src/kernel/events.ts:98` | SSE stream | Schedule held new topics for approval |
| ProjectEvent | `packages/app/src/kernel/events.ts:107` | SSE stream (`kernel/events.ts`) | Union of every project event on the event stream |
| OutputMeta | `packages/app/src/slices/storage/model.ts:66` | `outputs.meta` JSON | Metadata JSON kept on an output row |
| Output | `packages/app/src/slices/storage/model.ts:97` | `outputs` | A file a stage produced for a project |
| StagedFile | `packages/app/src/slices/storage/model.ts:111` | `staged_files` + staging file | An uploaded file waiting in staging before a project owns it |
| StagingProgressEvent | `packages/app/src/slices/storage/model.ts:124` | In-memory | Staging upload progress on the global event channel |
| StagingFailedEvent | `packages/app/src/slices/storage/model.ts:133` | In-memory | Staging upload failure event |
| StagingEvent | `packages/app/src/slices/storage/model.ts:141` | In-memory | Union of staging progress and failure events |
| QueueEntry | `packages/app/src/slices/batch/index.ts:19` | `project_queue` | One project_queue row |
| Eta | `packages/app/src/slices/eta/model.ts:15` | In-memory | Estimated remaining seconds and what the estimate is based on |
| EtaStage | `packages/app/src/slices/eta/model.ts:21` | In-memory | Stage timing inputs for the ETA |
| ModelChoices | `packages/app/src/slices/eta/model.ts:69` | In-memory | Provider and model per stage, for ETA history |
| ManualCue | `packages/app/src/slices/revisions/model.ts:19` | `RevisionContent.subtitleCues` | A caption cue edited by hand |
| NarrationOverride | `packages/app/src/slices/revisions/model.ts:28` | `RevisionContent.narrationOverrides` | Uploaded or edited narration replacing a generated piece |
| RevisionContent | `packages/app/src/slices/revisions/model.ts:37` | `project_revisions.content` | Edited article, image order, overrides, cues and prompt snapshots of a revision |
| RevisionUpload | `packages/app/src/slices/revisions/model.ts:75` | In-memory | Staged file attached by a Save to a slot |
| RevisionEdit | `packages/app/src/slices/revisions/model.ts:83` | In-memory | Proposed config/content plus regeneration and uploads of a Save |
| ProjectRevision | `packages/app/src/slices/revisions/model.ts:89` | `project_revisions` | One retained revision: config, content, ancestry, fingerprints |
| ProjectAsset | `packages/app/src/slices/revisions/model.ts:99` | `project_assets` + file | Registered immutable file of a project |
| ManifestOutput | `packages/app/src/slices/revisions/model.ts:106` | `revision_outputs` | One output slot of a revision manifest |
| ManifestPiece | `packages/app/src/slices/revisions/model.ts:114` | `revision_pieces` | One piece of a revision manifest |
| RevisionManifest | `packages/app/src/slices/revisions/model.ts:121` | In-memory | Outputs and pieces a revision selects |
| RevisionOutputView | `packages/app/src/slices/revisions/model.ts:125` | In-memory | Revision output with selection and file availability |
| RevisionPieceView | `packages/app/src/slices/revisions/model.ts:131` | In-memory | Revision piece with selection and file availability |
| RevisionView | `packages/app/src/slices/revisions/model.ts:137` | In-memory | Saved revision with its outputs, pieces and article |
| RevisionSummary | `packages/app/src/slices/revisions/model.ts:144` | In-memory | History row of a revision |
| RevisionMutationResult | `packages/app/src/slices/revisions/model.ts:152` | In-memory | Save/Restore result or refusal |
| BaselineResult | `packages/app/src/slices/revisions/model.ts:165` | In-memory | Lazy adoption of a legacy project into a first revision |
| RevisionOutputRecord | `packages/app/src/slices/revisions/model.ts:178` | `revision_outputs` | Parsed revision_outputs row |
| RevisionPieceRecord | `packages/app/src/slices/revisions/model.ts:179` | `revision_pieces` | Parsed revision_pieces row |
| MutationIdentity | `packages/app/src/slices/revisions/mutation-request.ts:8` | `revision_mutations` | Canonical identity of a Save/Restore for idempotent replay |
| SaveRevisionInput | `packages/app/src/slices/revisions/mutations.ts:51` | HTTP request/response | Save request |
| PreparedOutput | `packages/app/src/slices/revisions/publication-model.ts:6` | In-memory | Output ready to publish to a revision |
| PreparedPiece | `packages/app/src/slices/revisions/publication-model.ts:13` | In-memory | Piece ready to publish to a revision |
| RestoreRevisionInput | `packages/app/src/slices/revisions/restore.ts:18` | HTTP request/response | Restore request |
| WorkRecipe | `packages/app/src/slices/rebuild/dependencies.ts:4` | In-memory | Dependency node of a revision's work graph |
| RetainedWork | `packages/app/src/slices/rebuild/dependencies.ts:14` | In-memory | Existing work a rebuild can reuse |
| RebuildSelection | `packages/app/src/slices/rebuild/model.ts:6` | In-memory | What a rebuild preview was asked for |
| RebuildWork | `packages/app/src/slices/rebuild/model.ts:10` | In-memory | One step a rebuild would run, reuse or skip |
| RebuildPreview | `packages/app/src/slices/rebuild/model.ts:23` | `rebuild_previews.body_json` | Reviewed rebuild plan with costs and reuse |
| RebuildAdmission | `packages/app/src/slices/rebuild/model.ts:62` | `rebuild_admissions.response_json` | Idempotent rebuild admission receipt |
| RebuildResult | `packages/app/src/slices/rebuild/model.ts:69` | In-memory | Rebuild preview/start result or refusal |
| ExecutionSnapshot | `packages/app/src/slices/rebuild/preview-plan.ts:49` | `rebuild_previews.execution_json` | Frozen execution plan stored with a rebuild preview |
| PreviewPlan | `packages/app/src/slices/rebuild/preview-plan.ts:50` | In-memory | Rebuild preview plus its execution snapshot |
| AudioRecipes | `packages/app/src/slices/rebuild/recipe-audio.ts:28` | In-memory | Compiled narration recipes with timeline and levels |
| ResolvedRevisionInputs | `packages/app/src/slices/rebuild/recipe-model.ts:19` | In-memory | Article and research text a recipe resolves from a revision |
| ScriptCheck | `packages/app/src/slices/rebuild/recipe-model.ts:83` | In-memory | Speakers a script must attribute |
| RecipeInput | `packages/app/src/slices/rebuild/recipe-model.ts:87` | `revision_work_pieces.input_json` | Frozen provider input of one work piece |
| ResolvedWorkRecipe | `packages/app/src/slices/rebuild/recipe-model.ts:168` | In-memory | WorkRecipe plus resolved input and logical fingerprint |
| RecipeContext | `packages/app/src/slices/rebuild/recipe-model.ts:179` | In-memory | Inputs every recipe is compiled from |
| RecipeProviderChoice | `packages/app/src/slices/rebuild/recipe-provider-choice.ts:5` | In-memory | Provider, model, family and voice a recipe resolves to |
| RecoveryRequest | `packages/app/src/slices/rebuild/recovery-model.ts:19` | HTTP request/response | Recovery action request |
| RecoveryResult | `packages/app/src/slices/rebuild/recovery-model.ts:50` | In-memory | Recovery action result or refusal |
| RecoveryRecord | `packages/app/src/slices/rebuild/recovery-repo.ts:20` | `project_recovery_requests` | Parsed project_recovery_requests row |
| PublicationTarget | `packages/app/src/slices/rebuild/repo.ts:11` | In-memory | Revision an output is published to |
| WorkTransition | `packages/app/src/slices/rebuild/transition-repo.ts:17` | In-memory | Work carried from a base revision to a new one on Save |
| WorkPiece | `packages/app/src/slices/rebuild/work-records.ts:5` | `revision_work_pieces` | Durable input, continuation and dispatch state of one work piece |
| ProviderChanges | `packages/app/src/slices/control/providers.ts:40` | In-memory | Legacy provider-change input |
| RevisionControlInput | `packages/app/src/slices/control/revision-control-schema.ts:9` | `project_control_receipts` identity | Pause/cancel/rerun request identity |
| CheckpointStatus | `packages/app/src/slices/checkpoints/change.ts:31` | In-memory | Checkpoints of a revision with recalculated closure |
| CheckpointRow | `packages/app/src/slices/checkpoints/model.ts:12` | `review_checkpoints` | One review checkpoint gate on a revision |
| CheckpointSetInput | `packages/app/src/slices/checkpoints/model.ts:23` | HTTP request/response | Checkpoints to create for a revision |
| CheckpointApprovalInput | `packages/app/src/slices/checkpoints/model.ts:35` | `review_checkpoint_approvals` | Idempotent approval of one checkpoint at a fingerprint |
| CheckpointResult | `packages/app/src/slices/checkpoints/model.ts:44` | In-memory | Typed success/refusal of a checkpoint operation |
| CheckpointDecision | `packages/app/src/slices/checkpoints/model.ts:47` | In-memory | Whether a stage may run past its checkpoints |
| CheckpointClosureSettlement | `packages/app/src/slices/checkpoints/repo.ts:33` | In-memory | Work keys a checkpoint approval releases |
| DraftSummary | `packages/app/src/slices/play-drafts/model.ts:16` | In-memory | Draft list row |
| PlayDraft | `packages/app/src/slices/play-drafts/model.ts:23` | `play_drafts` | Versioned saved Play draft |
| DraftAttachment | `packages/app/src/slices/play-drafts/model.ts:30` | `play_draft_attachments` + `staged_files` | File attached to a draft with availability |
| ResolvedPlayRun | `packages/app/src/slices/play-drafts/model.ts:39` | In-memory | One run of a draft resolved with rendered prompts |
| PlayReview | `packages/app/src/slices/play-drafts/model.ts:44` | `play_drafts.review_json` | Bound cost review a Start must name |
| PlayStartResult | `packages/app/src/slices/play-drafts/model.ts:53` | `play_start_receipts.result_json` | Durable Start result: request id, project ids, queue |
| DraftView | `packages/app/src/slices/play-drafts/model.ts:62` | In-memory | Draft with attachments, review and start state |
| DraftSaveInput | `packages/app/src/slices/play-drafts/model.ts:69` | HTTP request/response | Versioned idempotent draft save |
| PlayStartInput | `packages/app/src/slices/play-drafts/model.ts:75` | HTTP request/response | Start request naming draft version and review |
| DraftResult | `packages/app/src/slices/play-drafts/model.ts:80` | In-memory | Draft operation result or refusal |
| ResolvedPlayReview | `packages/app/src/slices/play-drafts/model.ts:106` | In-memory | Resolved review plus the execution inputs it captured |
| ReviewedCheckpoint | `packages/app/src/slices/play-drafts/model.ts:120` | In-memory | Checkpoint a review promised for one run |
| DraftRow | `packages/app/src/slices/play-drafts/repo.ts:24` | `play_drafts` | Parsed play_drafts row |
| AttachmentRow | `packages/app/src/slices/play-drafts/repo.ts:34` | `play_draft_attachments` | Parsed play_draft_attachments row |
| AttachmentRef | `packages/app/src/slices/play-drafts/repo.ts:35` | In-memory | File reference found in a draft document |
| PlayDraftForm | `packages/app/src/slices/play-drafts/schema.ts:247` | `play_drafts.document_json` (form) | Raw Play editor form, all fields tolerant |
| PlayDraftDocument | `packages/app/src/slices/play-drafts/schema.ts:248` | `play_drafts.document_json` | Versioned envelope stored in play_drafts.document_json |
| StoredStartReceipt | `packages/app/src/slices/play-drafts/start-repo.ts:23` | `play_start_receipts` | Parsed play_start_receipts row |
| ProjectTemplate | `packages/app/src/slices/project-templates/model.ts:6` | `project_templates` + `project_template_revisions` | Named reusable Play setup at a version |
| TemplateSummary | `packages/app/src/slices/project-templates/model.ts:7` | `project_templates` + `project_template_revisions` | Template list row |
| TemplateResult | `packages/app/src/slices/project-templates/model.ts:8` | In-memory | Template operation result or refusal |
| LibraryVersion | `packages/app/src/slices/library/history.ts:17` | `library_versions` | One saved version of a prompt or entry |
| Prompt | `packages/app/src/slices/library/model.ts:35` | `prompts` | A Library prompt |
| PromptDraft | `packages/app/src/slices/library/model.ts:46` | HTTP request/response | Prompt create/update body |
| Entry | `packages/app/src/slices/library/model.ts:52` | `entries` | A Library intro or outro |
| EntryDraft | `packages/app/src/slices/library/model.ts:62` | HTTP request/response | Entry create/update body |
| LibraryRef | `packages/app/src/slices/library/used-by.ts:12` | In-memory | A Library item a used-by lookup names |
| UsedByTemplate | `packages/app/src/slices/library/used-by.ts:16` | In-memory | Template using a Library item |
| UsedBySchedule | `packages/app/src/slices/library/used-by.ts:21` | In-memory | Schedule using a Library item |
| UsedByProject | `packages/app/src/slices/library/used-by.ts:27` | In-memory | Project using a Library item |
| UsedBy | `packages/app/src/slices/library/used-by.ts:37` | In-memory | Everything using a Library item |
| NarrationAlias | `packages/app/src/kernel/ports/narration-aliases.ts:8` | `narration_aliases`; copied into `RunConfig` | A written word and how the narrator says it |
| AliasMatch | `packages/app/src/kernel/ports/narration-aliases.ts:16` | In-memory | One narration-alias match inside a text |
| CustomDocumentTheme | `packages/app/src/slices/document/model.ts:29` | `document_themes` | A theme saved in Library → Documents |
| DocumentSettings | `packages/app/src/slices/document/model.ts:37` | `RunConfig.document` | What a project says about its document |
| SavedDocumentTheme | `packages/app/src/slices/document/model.ts:62` | `document_themes` | A saved Library theme, as the list endpoint returns it |
| RGB | `packages/app/src/slices/document/theme.ts:19` | In-memory | Colour as 0-255 channels inside DocumentTheme |
| FontFace | `packages/app/src/slices/document/theme.ts:32` | In-memory | Font family, style and letter spacing inside DocumentTheme |
| DocumentTheme | `packages/app/src/slices/document/theme.ts:39` | `document_themes.values_json`; `RunConfig.document` | Complete PDF look: page, fonts, sizes, spacing, title page, contents, header/footer, brand |
| DocumentThemeOverrides | `packages/app/src/slices/document/theme.ts:283` | In-memory | Per-section overrides merged onto a base DocumentTheme |
| BrandKit | `packages/app/src/slices/channels/model.ts:14` | `channels.brand_json` | Channel brand kit: caption/title fonts and colours, intro/outro, end screen text, document theme, ambient bed, language, links |
| Channel | `packages/app/src/slices/channels/model.ts:41` | `channels` | A channel: brand kit, series brief, AI disclosure, version |
| ChannelSummary | `packages/app/src/slices/channels/model.ts:57` | `channels` + counts | Channel plus template and cast counts, as lists show it |
| CastImage | `packages/app/src/slices/channels/model.ts:62` | `cast_images` + `image_blobs` | One reference picture of a cast member |
| CastVoice | `packages/app/src/slices/channels/model.ts:74` | `cast_members.voice_json` | A cast member's voice: provider, model, voice, pace, pronunciations |
| CastMember | `packages/app/src/slices/channels/model.ts:83` | `cast_members` | A recurring character, creature, place or object of a channel |
| CastSnapshot | `packages/app/src/slices/channels/model.ts:103` | `RunConfig` cast copy | A cast member as a run is started with it: only what the images need, the pictures named by content hash |
| ChannelResult | `packages/app/src/slices/channels/model.ts:116` | In-memory | Typed success/refusal of a channel operation |
| ChannelVideo | `packages/app/src/slices/channels/videos.ts:15` | `channel_videos` | Title of a video the channel made outside Slopify |
| VideoResult | `packages/app/src/slices/channels/videos.ts:27` | In-memory | Channel video operation result or refusal |
| EpisodeMemory | `packages/app/src/slices/episodes/repo.ts:8` | `episode_memories` | Summary a finished project leaves on its channel |
| EarlierEpisode | `packages/app/src/slices/episodes/repo.ts:23` | `RunDraft.earlierEpisodes` | What a new run carries of an earlier episode (`RunDraft.earlierEpisodes`) |
| EpisodeResult | `packages/app/src/slices/episodes/service.ts:16` | In-memory | Episode memory operation result or refusal |
| ChannelEpisodes | `packages/app/src/slices/episodes/service.ts:24` | In-memory | Channel episode memory setting and summaries |
| Cadence | `packages/app/src/slices/schedules/calendar.ts:18` | `schedules.cadence_json` | One-off, daily or weekly schedule recurrence |
| ScheduleResult | `packages/app/src/slices/schedules/model.ts:26` | In-memory | Schedule operation result or refusal |
| ClaimedScheduleRun | `packages/app/src/slices/schedules/model.ts:49` | In-memory | A due run claimed with its schedule |
| TopicGeneration | `packages/app/src/slices/schedules/schema.ts:52` | `schedules.topic_*` columns | Schedule topic generation mode, queue minimum and LLM |
| ScheduleCreate | `packages/app/src/slices/schedules/schema.ts:160` | HTTP request/response | Schedule create body |
| ScheduleUpdate | `packages/app/src/slices/schedules/schema.ts:161` | HTTP request/response | Versioned schedule update body |
| ScheduleSummary | `packages/app/src/slices/schedules/schema.ts:162` | `schedules` | A schedule with next run and topics |
| ScheduleRun | `packages/app/src/slices/schedules/schema.ts:163` | `schedule_runs` | One schedule run with status, projects and estimate |
| HeldTopic | `packages/app/src/slices/schedules/schema.ts:180` | `schedule_topics` | Generated topic waiting for approval |
| CalendarRun | `packages/app/src/slices/schedules/schema.ts:278` | In-memory | A future schedule run on the calendar |
| Calendar | `packages/app/src/slices/schedules/schema.ts:279` | In-memory | Calendar window: future runs, projects, queued projects |
| CliPathStatus | `packages/app/src/slices/settings/cli-paths.ts:24` | In-memory | Configured and resolved command of a CLI |
| ProviderDefaults | `packages/app/src/slices/settings/first-run.ts:14` | `settings` key `provider.defaults` | First-run default LLM and image providers |
| DetectedCli | `packages/app/src/slices/settings/first-run.ts:19` | In-memory | A CLI detected during first run |
| FirstRunStatus | `packages/app/src/slices/settings/first-run.ts:28` | In-memory | First-run detection result |
| HealthCheck | `packages/app/src/slices/settings/health.ts:19` | In-memory | One health check line |
| ProviderHealth | `packages/app/src/slices/settings/health.ts:25` | In-memory | Health checks of one provider |
| HealthReport | `packages/app/src/slices/settings/health.ts:33` | In-memory | Provider health check report |
| KeyStatus | `packages/app/src/slices/settings/keys.ts:18` | In-memory | Whether a provider key is stored, and its mask |
| KeyLookup | `packages/app/src/slices/settings/keys.ts:39` | In-memory | Key lookup result for a provider call |
| KeyedProvider | `packages/app/src/slices/settings/model.ts:49` | In-memory | Provider authenticated by an API key |
| CliProvider | `packages/app/src/slices/settings/model.ts:55` | In-memory | Provider backed by a local agent CLI login |
| LocalProvider | `packages/app/src/slices/settings/model.ts:63` | In-memory | The computer's own speech engine as a provider |
| Provider | `packages/app/src/slices/settings/model.ts:67` | In-memory | Union of KeyedProvider, CliProvider and LocalProvider |
| ProviderStatus | `packages/app/src/slices/settings/model.ts:177` | In-memory | Provider identity plus readiness and CLI path, as Settings lists it |
| Voice | `packages/app/src/slices/settings/model.ts:189` | `voices` | A saved TTS voice |
| AppSettings | `packages/app/src/slices/settings/model.ts:207` | `settings` keys `silenceGapSeconds`, `appearance`, `loudness` | App-wide playback settings: silence gap, appearance, loudness |
| TutorialSession | `packages/app/src/slices/settings/tutorial-schema.ts:46` | `settings` key `tutorial.session` | Persisted in-app tutorial cursor |
| TutorialWrite | `packages/app/src/slices/settings/tutorial-schema.ts:47` | In-memory | Compare-and-set tutorial save |
| TutorialView | `packages/app/src/slices/settings/tutorial-schema.ts:48` | In-memory | Versioned tutorial progress |
| TutorialSaveResult | `packages/app/src/slices/settings/tutorial.ts:21` | In-memory | Tutorial save result or refusal |
| VoiceDraft | `packages/app/src/slices/settings/voices.ts:20` | HTTP request/response | Voice create body |
| AddVoiceResult | `packages/app/src/slices/settings/voices.ts:40` | In-memory | Voice add result or refusal |
| Catalogue | `packages/app/src/catalog/schema.ts:101` | Catalogue YAML file; snapshot in `rebuild_previews.execution_json` | Model catalogue: providers, LLM, image and TTS models with prices |
| CatalogueModel | `packages/app/src/catalog/schema.ts:129` | In-memory | One catalogue model with pricing and capabilities |
| CatalogueSyncStatus | `packages/app/src/catalog/store.ts:24` | In-memory | Result of the last catalogue sync check |
| HostCliStatus | `packages/app/src/kernel/ports/host-cli.ts:40` | In-memory | Host-side CLI readiness reported over the host CLI bridge |
| HostLlmBody | `packages/app/src/kernel/ports/host-cli.ts:134` | HTTP request/response | Host CLI bridge LLM request body |
| HostImageBody | `packages/app/src/kernel/ports/host-cli.ts:135` | HTTP request/response | Host CLI bridge image request body |
| HostFrame | `packages/app/src/kernel/ports/host-cli.ts:208` | In-memory | One NDJSON frame of a host CLI bridge stream |
| Host CLI protocol | `packages/app/src/kernel/ports/host-cli.ts:15` | HTTP wire between app and host helper | Health body, open-folder body, negotiation headers and byte limits of protocol 1 |
| ImageRequest | `packages/app/src/kernel/ports/image.ts:4` | HTTP request/response | One image-generation request |
| CastReference | `packages/app/src/kernel/ports/image.ts:25` | In-memory | A cast member's reference pictures sent with an image request |
| GeneratedImage | `packages/app/src/kernel/ports/image.ts:31` | In-memory | Image bytes returned by an image adapter with usage |
| AnimateRequest | `packages/app/src/kernel/ports/image.ts:43` | HTTP request/response | Image-to-video request animating one still |
| GeneratedVideo | `packages/app/src/kernel/ports/image.ts:52` | In-memory | Video bytes returned by an animate call |
| LanguageInfo | `packages/app/src/kernel/ports/languages.ts:29` | In-memory | A supported narration/caption language with its script and timing engine |
| LlmDocument | `packages/app/src/kernel/ports/llm-documents.ts:24` | In-memory; research documents in `project_assets` | A source document handed to an LLM call beside its messages |
| Message | `packages/app/src/kernel/ports/llm.ts:8` | In-memory | One chat message sent to an LLM |
| Usage | `packages/app/src/kernel/ports/llm.ts:15` | In-memory | Token usage a provider reported for one LLM call |
| LlmDelta | `packages/app/src/kernel/ports/llm.ts:25` | In-memory | Streamed answer text chunk |
| LlmDone | `packages/app/src/kernel/ports/llm.ts:30` | In-memory | Final stream event with usage, finish reason and plan windows |
| LlmActivity | `packages/app/src/kernel/ports/llm.ts:39` | In-memory | Provider activity refreshes the idle deadline without exposing reasoning or tools |
| LlmPartial | `packages/app/src/kernel/ports/llm.ts:46` | In-memory | Answer text as the provider types it, before it commits the message the text belongs to |
| LlmEvent | `packages/app/src/kernel/ports/llm.ts:50` | In-memory | Union of LLM stream events |
| LlmCapabilities | `packages/app/src/kernel/ports/llm.ts:52` | In-memory | What an LLM adapter supports: streaming, usage, web search, images |
| LlmImage | `packages/app/src/kernel/ports/llm.ts:63` | In-memory | A picture the model is asked to look at: a local file (PNG, JPEG or WebP) and the name the prompt calls it by |
| ThinkingConfig | `packages/app/src/kernel/ports/llm.ts:72` | In-memory | Provider-specific reasoning budget, level or effort |
| LlmCompletion | `packages/app/src/kernel/ports/llm.ts:86` | In-memory | One LLM request: model, messages, documents, thinking, web search, images |
| ModelInfo | `packages/app/src/kernel/ports/model.ts:8` | In-memory | What Play's model dropdown is filled from, fetched per load |
| Readiness | `packages/app/src/kernel/ports/model.ts:19` | In-memory | What Settings and Play both read per provider |
| ProviderFault | `packages/app/src/kernel/ports/model.ts:59` | In-memory | Classified provider failure carried by ProviderError |
| ProviderError | `packages/app/src/kernel/ports/model.ts:70` | In-memory | Error subclass carrying a ProviderFault |
| ProviderErrorInit | `packages/app/src/kernel/ports/model.ts:72` | In-memory | Constructor input for ProviderError |
| LimitWindow | `packages/app/src/kernel/ports/plan-limits.ts:25` | In-memory | One CLI plan-limit window (five-hour or weekly) with percent used and reset time |
| PlanLimitReading | `packages/app/src/kernel/ports/plan-limits.ts:33` | `plan_limit_readings.reading_json`; `standalone_usage.reading_json` | Plan windows a CLI reported before and after one call |
| PlanLimitHit | `packages/app/src/kernel/ports/plan-limits.ts:40` | `plan_limit_waits` | A CLI reporting its plan allowance is used up, with the reset time |
| SubtitleOmission | `packages/app/src/kernel/ports/subtitles.ts:3` | In-memory | Narration text the aligner could not time |
| TimedWord | `packages/app/src/kernel/ports/subtitles.ts:7` | In-memory | One aligned word with start/end seconds |
| AlignmentRequest | `packages/app/src/kernel/ports/subtitles.ts:13` | HTTP request/response | Input to the forced aligner |
| SpeechVoice | `packages/app/src/kernel/ports/system-speech.ts:25` | In-memory | A voice of the computer's speech engine |
| DetectedSpeech | `packages/app/src/kernel/ports/system-speech.ts:40` | In-memory | Speech engines found on this computer |
| TtsCapabilities | `packages/app/src/kernel/ports/tts.ts:3` | In-memory | What a TTS adapter supports: streaming, native dialogue |
| DialogueLine | `packages/app/src/kernel/ports/tts.ts:10` | In-memory | One line of a multi-speaker request: the words and the voice that speaks them |
| TtsRequest | `packages/app/src/kernel/ports/tts.ts:15` | HTTP request/response | One text-to-speech request |
| TtsAudio | `packages/app/src/kernel/ports/tts.ts:37` | In-memory | Audio bytes and container a TTS adapter returns |
| ModelChoice | `packages/app/src/slices/model-upkeep/model.ts:15` | In-memory | Provider and model |
| RetiredUsage | `packages/app/src/slices/model-upkeep/model.ts:20` | In-memory | A place a retired model is still chosen |
| FontSummary | `packages/app/src/slices/fonts/model.ts:1` | In-memory | A caption font as pickers list it |
| ResolvedFont | `packages/app/src/slices/fonts/model.ts:8` | In-memory | Font resolved to a file path for rendering |
| LoudnessSettings | `packages/app/src/slices/loudness/model.ts:17` | `RunConfig` JSON | Per-run loudness targets for the video and the audio files |
| LoudnessDefault | `packages/app/src/slices/loudness/model.ts:25` | `settings` key `loudness` | The app-wide default (Settings → General), which Play starts a new run from |
| LoudnessGoal | `packages/app/src/slices/loudness/model.ts:66` | In-memory | What one file is brought to |
| LoudnessForm | `packages/app/src/slices/loudness/model.ts:162` | `play_drafts.document_json` | Play's choice as a draft holds it: absent is Settings' default throughout, and a target left out is Settings' own |
| LoudnessReport | `packages/app/src/slices/loudness/model.ts:188` | In-memory | What the levelling found and did, kept on the levelled narration's output |
| MasterReport | `packages/app/src/slices/loudness/model.ts:202` | In-memory | What a mastered export measured once written (the finished file, after its encode), in LUFS and dBTP |
| PickedSentence | `packages/app/src/slices/shorts/clips.ts:8` | In-memory | A narration sentence with its times, as short picks use it |
| PickedShorts | `packages/app/src/slices/shorts/clips.ts:30` | In-memory | The picked shorts with the sentences they cut |
| ShortRange | `packages/app/src/slices/shorts/clips.ts:49` | `project_revisions.content` | Hand-set sentence range of one short |
| ClipLimits | `packages/app/src/slices/shorts/clips.ts:55` | In-memory | Min/max seconds of a short clip |
| ShortsSettings | `packages/app/src/slices/shorts/model.ts:6` | `RunConfig` (Video stage) | Video stage Shorts step settings |
| ShortsExtrasForm | `packages/app/src/slices/shorts/model.ts:155` | `play_drafts.document_json` | Shorts settings as typed in Play |
| PickBrief | `packages/app/src/slices/shorts/pick.ts:11` | In-memory | Brief the text model picks shorts from |
| ShortPick | `packages/app/src/slices/shorts/pick.ts:23` | In-memory | One picked short: sentence range, times, title, description, hashtags |
| CheckedPicks | `packages/app/src/slices/shorts/pick.ts:191` | In-memory | Validated short picks or refusal |
| PickLimits | `packages/app/src/slices/shorts/pick.ts:202` | In-memory | Count and duration limits a short pick is checked against |
| StylePreviewImage | `packages/app/src/slices/style-preview/schema.ts:28` | In-memory | Picture a style preview is drawn on |
| StylePreviewRequest | `packages/app/src/slices/style-preview/schema.ts:58` | HTTP request/response | Style preview request |
| StylePreviewSettings | `packages/app/src/slices/style-preview/settings.ts:18` | In-memory | Settings a style preview renders from |
| CaptionCue | `packages/app/src/slices/subtitles/captions.ts:5` | In-memory | One caption cue with optional speaker |
| SubtitleConfig | `packages/app/src/slices/subtitles/model.ts:33` | `RunConfig.subtitles` | Caption settings of a run: mode, language, font, position, colours |
| SubtitleAsset | `packages/app/src/slices/subtitles/prepare.ts:37` | In-memory | One caption file written |
| PreparedSubtitles | `packages/app/src/slices/subtitles/prepare.ts:41` | In-memory | Caption files and burn-in path of a run |
| AmbientBedSettings | `packages/app/src/slices/video/ambient-bed.ts:17` | `RunConfig` | Ambient sound bed under a video: source, level, fades |
| ChannelAmbientBed | `packages/app/src/slices/video/ambient-bed.ts:31` | `channels.brand_json` | Built-in ambient bed of a channel brand kit |
| AmbientBedForm | `packages/app/src/slices/video/ambient-bed.ts:125` | `play_drafts.document_json` | Ambient bed as typed in Play |
| AudioSegment | `packages/app/src/slices/video/edit-list.ts:31` | In-memory | One audio file or silence in an EditList |
| Point | `packages/app/src/slices/video/edit-list.ts:41` | In-memory | Crop window position of a zoom |
| Motion | `packages/app/src/slices/video/edit-list.ts:50` | In-memory | Pan/zoom of one shot |
| ImageSource | `packages/app/src/slices/video/edit-list.ts:59` | In-memory | Still image source of a shot |
| VideoSource | `packages/app/src/slices/video/edit-list.ts:68` | In-memory | Moving clip source of a shot |
| Transition | `packages/app/src/slices/video/edit-list.ts:80` | In-memory | Transition into a shot |
| Shot | `packages/app/src/slices/video/edit-list.ts:85` | In-memory | One shot of an EditList |
| Look | `packages/app/src/slices/video/edit-list.ts:93` | In-memory | Filters every shot is rendered with |
| Card | `packages/app/src/slices/video/edit-list.ts:101` | In-memory | Title card over the picture |
| CardFont | `packages/app/src/slices/video/edit-list.ts:107` | In-memory | Font file for title cards |
| AmbientBed | `packages/app/src/slices/video/edit-list.ts:117` | In-memory | Ambient bed in an EditList |
| EditList | `packages/app/src/slices/video/edit-list.ts:128` | Video `render.json` record | Complete video edit: audio, shots, look, cards, bed |
| VideoEditSettings | `packages/app/src/slices/video/edit-settings.ts:34` | `RunConfig.videoEdit` | Video stage edit options: cuts, transitions, look, chapter cards, animation |
| AudioExportRecord | `packages/app/src/slices/video/reuse-audio.ts:22` | Audio export render record JSON | What an audio export was made from, for reuse |
| Speaker | `packages/app/src/slices/voices/model.ts:60` | `RunConfig` JSON | One speaker of a multi-voice run with voice, pace and pronunciations |
| Book | `packages/app/src/slices/voices/model.ts:72` | `RunConfig` JSON | Audiobook title and chapter numbering |
| VoicesSettings | `packages/app/src/slices/voices/model.ts:92` | `RunConfig.voices` | Multi-voice settings of a run: format, script source, speakers |
| VoiceProblem | `packages/app/src/slices/voices/model.ts:165` | In-memory | A field-level problem in VoicesSettings |
| ScriptTurn | `packages/app/src/slices/voices/script.ts:14` | In-memory | One speaker turn of a multi-voice script |
| ScriptSection | `packages/app/src/slices/voices/script.ts:25` | In-memory | A script section title and its first turn |
| Script | `packages/app/src/slices/voices/script.ts:30` | In-memory | Parsed multi-voice script |
| NamedSpeaker | `packages/app/src/slices/voices/script.ts:41` | In-memory | Speaker id and name a script is parsed against |
| AiDisclosure | `packages/app/src/slices/studio/disclosure.ts:45` | In-memory | YouTube altered/synthetic content answer with its reason |
| DisclosureInput | `packages/app/src/slices/studio/disclosure.ts:54` | HTTP request/response | Inputs the AI disclosure answer is worked out from |
| PackFile | `packages/app/src/slices/studio/model.ts:20` | In-memory | One file of a Studio upload pack |
| StudioPlaylist | `packages/app/src/slices/studio/model.ts:32` | `settings` keys `studio.playlist[.<channelId>]` | A playlist of a channel's list (Settings → YouTube Studio), ticked by default or not |
| PackItem | `packages/app/src/slices/studio/model.ts:37` | In-memory | One video or short of an upload pack with its metadata |
| UploadPack | `packages/app/src/slices/studio/model.ts:85` | In-memory | Everything the Studio extension fills for a project |
| ActivePack | `packages/app/src/slices/studio/model.ts:105` | In-memory | Pack item the extension fills |
| FillQueueItem | `packages/app/src/slices/studio/model.ts:131` | `settings` key `studio.fillQueue.<hash>` | Item waiting for the Studio extension |
| StudioPairingView | `packages/app/src/slices/studio/model.ts:145` | `settings` key `studio.pairing` | Extension pairing token, origin and time |
| UploadPick | `packages/app/src/slices/studio/pick.ts:11` | `settings` key `studio.uploadPick.<projectId>` | Which title and thumbnail (indexes 0-9) the upload carries |
| PostingPlan | `packages/app/src/slices/studio/plan-model.ts:23` | `settings` key `studio.postingPlan` | A week of posting-plan lines, each a long-video time with its series and its shorts' times, in one time zone |
| PlanLine | `packages/app/src/slices/studio/plan-model.ts:24` | `settings` JSON (`PostingPlan.rows`) | One line of the posting plan |
| PlanSlot | `packages/app/src/slices/studio/plan-model.ts:25` | `settings` JSON (`PostingPlan`) | A weekday and HH:MM time of the plan |
| Release | `packages/app/src/slices/studio/releases.ts:12` | `releases` | One release time of a project's long video (short 0) or one short, with its plan line and who set it |
| Slot | `packages/app/src/slices/studio/releases.ts:20` | In-memory; taken as a `releases` short-0 row (`line`, `release_at`) | A posting-plan line's long-video time |
| Schedule | `packages/app/src/slices/studio/releases.ts:27` | In-memory, read from `releases` | A project's long-video release plus each short's release |
| ReleaseCalendar | `packages/app/src/slices/studio/calendar.ts:43` | HTTP response (`GET /api/studio/releases`) | Calendar → Releases: the coming long videos with their shorts, the plan's free times, and finished projects that could fill them |
| CalendarEntry | `packages/app/src/slices/studio/calendar.ts:34` | HTTP response (`ReleaseCalendar.entries`) | One long-video release of a project, or one free plan time |
| CalendarItem | `packages/app/src/slices/studio/calendar.ts:24` | HTTP response (`CalendarEntry.items`) | One video or short of an entry with its release, upload-by time, state and Studio's checks |
| YoutubeVideo | `packages/app/src/slices/studio/videos.ts:11` | `youtube_videos` | The YouTube video an upload became, its upload state, its A/B, finish and comment task states and Studio's checks |
| VideoStats | `packages/app/src/slices/studio/stats.ts:8` | `video_stats` | Studio's numbers for one video as the extension last read them |
| AbVariant | `packages/app/src/slices/studio/stats.ts:29` | `ab_results.variants` JSON | One variant of a finished A/B test |
| AbResult | `packages/app/src/slices/studio/stats.ts:31` | `ab_results` | A finished A/B test as Studio shows it |
| StudioRow | `packages/app/src/slices/studio/backfill.ts:10` | In-memory | One row of Studio's Content list sent by the extension |
| FillEntry | `packages/app/src/slices/studio/queue.ts:18` | `settings` key `studio.fillQueue.<hash>` | One stored fill-queue entry |
| TitleShape | `packages/app/src/slices/youtube/titles.ts:8` | In-memory | A title pattern with keywords and what each holds in the video's title |
| DescriptionBrief | `packages/app/src/slices/youtube/answer.ts:21` | In-memory | Brief the text model writes the YouTube description from |
| DescriptionAnswer | `packages/app/src/slices/youtube/answer.ts:37` | In-memory | Parsed LLM answer for the YouTube description |
| ProjectDescriptionEdits | `packages/app/src/slices/youtube/edits-repo.ts:30` | `youtube_description_edits` | A project's description edits and own links |
| DescriptionFields | `packages/app/src/slices/youtube/edits.ts:22` | In-memory | YouTube description fields as editable text |
| FieldEdit | `packages/app/src/slices/youtube/edits.ts:24` | In-memory | User text of a description field and the generated text it was edited from |
| DescriptionEdits | `packages/app/src/slices/youtube/edits.ts:31` | `youtube_description_edits.fields_json` | Per-field hand edits of a YouTube description |
| ResolvedField | `packages/app/src/slices/youtube/edits.ts:33` | In-memory | Effective text of a description field |
| ChannelLink | `packages/app/src/slices/youtube/placeholders.ts:8` | `settings` key `channel_links`; `channels.brand_json`; `youtube_description_edits.links_json` | A named link (for example Previous video) filled into description placeholders |
| PlaceholderPart | `packages/app/src/slices/youtube/placeholders.ts:21` | In-memory | Parsed text or placeholder part of a description |
| FilledText | `packages/app/src/slices/youtube/placeholders.ts:74` | In-memory | Description text with placeholders filled and unknown names listed |
| CostRow | `packages/app/src/slices/estimate/index.ts:47` | In-memory | One stage row of a cost estimate |
| CostEstimate | `packages/app/src/slices/estimate/index.ts:58` | In-memory | Estimated low/high run cost with assumptions |
| Fix | `packages/app/src/slices/fixes/rules.ts:10` | In-memory | Fix-it action a failed step offers |
| FailedStep | `packages/app/src/slices/fixes/rules.ts:28` | In-memory | Failure facts a Fix is chosen from |
| NoticeText | `packages/app/src/slices/notifications/rules.ts:32` | In-memory | Rendered notification text |
| ReviewNoticeSubject | `packages/app/src/slices/notifications/rules.ts:41` | In-memory | Flagged-review facts a notification is written from |
| NoticeSubject | `packages/app/src/slices/notifications/rules.ts:67` | In-memory | Project facts a finished/failed notification is written from |
| TopicsNoticeSubject | `packages/app/src/slices/notifications/rules.ts:120` | In-memory | Held-topics facts a notification is written from |
| ReviewStageSettings | `packages/app/src/slices/reviews/model.ts:16` | `RunConfig` JSON | Automatic review mode and prompt for one stage |
| ReviewSettings | `packages/app/src/slices/reviews/model.ts:22` | `RunConfig.reviews` | Automatic review settings of a run: reviewer model, retries, per-stage modes |
| ReviewSettingsForm | `packages/app/src/slices/reviews/model.ts:90` | `play_drafts.document_json` | Review settings as Play and templates keep them |
| ReviewVerdict | `packages/app/src/slices/reviews/model.ts:154` | In-memory | A reviewer's pass/fail answer with reasons |
| ReviewRecord | `packages/app/src/slices/reviews/model.ts:160` | `review_verdicts` | One saved verdict, as the project page shows it |
| ReviewView | `packages/app/src/slices/reviews/view.ts:11` | In-memory | Review verdict with current output, as the project page lists it |
| UsageTotals | `packages/app/src/slices/run-cost/panel.ts:18` | In-memory | Token, character, image and second totals of a run |
| CostLine | `packages/app/src/slices/run-cost/panel.ts:27` | In-memory | Calls and cost totals |
| StageCost | `packages/app/src/slices/run-cost/panel.ts:37` | In-memory | Run cost of one stage |
| ModelCost | `packages/app/src/slices/run-cost/panel.ts:43` | In-memory | Run cost of one provider/model |
| PlanWindowUse | `packages/app/src/slices/run-cost/panel.ts:51` | In-memory | Share of a plan window a run took |
| PlanUse | `packages/app/src/slices/run-cost/panel.ts:60` | In-memory | Plan windows of one CLI account |
| LimitWait | `packages/app/src/slices/run-cost/panel.ts:70` | In-memory | A stage waiting on a plan limit |
| RunCost | `packages/app/src/slices/run-cost/panel.ts:78` | In-memory | Project Run cost tab data |
| CallPrice | `packages/app/src/slices/run-cost/pricing.ts:12` | `provider_usage.price_json`, `standalone_usage.price_json` | Priced provider call: cost, API equivalent, rates used |
| RunTiming | `packages/app/src/slices/run-cost/timing.ts:12` | In-memory | Working time of a project's steps from attempts |
| ProjectTiming | `packages/app/src/slices/run-cost/timing.ts:19` | In-memory | Working time of a project per stage |
| PlanStanding | `packages/app/src/slices/run-cost/week.ts:18` | In-memory | Latest plan window standing of a CLI account |
| WeekSummary | `packages/app/src/slices/run-cost/week.ts:28` | In-memory | Home's this-week summary |
| BackupConfigInput | `packages/app/src/slices/backups/model.ts:35` | HTTP request/response | Automatic backup settings as submitted |
| BackupConfig | `packages/app/src/slices/backups/model.ts:42` | `settings` key `backups.config` | Saved automatic backup settings |
| BackupStatus | `packages/app/src/slices/backups/model.ts:66` | `settings` key `backups.status` | Last automatic backup attempt and success |
| BackupFile | `packages/app/src/slices/backups/model.ts:80` | Archive file in the backup folder | A backup archive in the backup folder |
| BackupView | `packages/app/src/slices/backups/model.ts:86` | In-memory | Settings view of automatic backups |
| BackupManifest | `packages/app/src/slices/storage/backup-format.ts:181` | Backup tar `manifest.json` | Manifest of a backup archive |
| LibraryPart | `packages/app/src/slices/storage/backup-format.ts:215` | Backup tar `data/library.json` | Library tables and files inside a backup |
| UsagePart | `packages/app/src/slices/storage/backup-format.ts:218` | Backup tar `data/usage.json` | Usage tables inside a backup |
| ProjectPart | `packages/app/src/slices/storage/backup-format.ts:231` | Backup tar `data/projects/<id>.json` | One project's tables and files inside a backup |
| ItemCounts | `packages/app/src/slices/storage/backup-import.ts:103` | In-memory | Added/renamed/skipped counts of one kind in a backup import |
| BackupImportSummary | `packages/app/src/slices/storage/backup-import.ts:109` | In-memory | What a backup import added, renamed and skipped |
| FilesLocation | `packages/app/src/slices/storage/files-location.ts:40` | `settings` key `files.location` | Where project files live |
| SettleFilesInput | `packages/app/src/slices/storage/files-location.ts:67` | HTTP request/response | Boot input that settles the files location |
| MoveProgress | `packages/app/src/slices/storage/files-location.ts:118` | `settings` key `files.move` | Progress of a files-location move |
| FilesView | `packages/app/src/slices/storage/files-location.ts:130` | In-memory | Settings view of file locations |
| PortableImportResult | `packages/app/src/slices/storage/portable.ts:153` | In-memory | Counts imported from an older .zip portable backup |
| StorageUsage | `packages/app/src/slices/storage/portable.ts:164` | In-memory | Byte totals: data, projects, staging, trash, per project |
| ProjectStorage | `packages/app/src/slices/storage/trim.ts:37` | In-memory | Bytes a project uses and how much Trim frees |
| TrashItem | `packages/app/src/slices/trash/model.ts:27` | `project_trash`; `deleted_at` columns | One trashed item with purge date |
| Restored | `packages/app/src/slices/trash/model.ts:36` | In-memory | What a restore brought back |
| TrashResult | `packages/app/src/slices/trash/model.ts:57` | In-memory | Trash operation result or refusal |
| UploadMarkResult | `packages/app/src/slices/uploads/repo.ts:6` | In-memory | Mark uploaded result or refusal |
| PrepareResult | `packages/app/src/slices/schedules/prepare.ts:61` | In-memory | A schedule topic prepared ahead, or the refusal reason |
| AutostartView | `packages/app/src/edge/autostart/model.ts:3` | `settings` key `autostart.answered` + OS launcher | Start-at-login switch state |
| AutostartBody | `packages/app/src/edge/autostart/model.ts:24` | HTTP request/response | Autostart toggle body |
| SampleProjects | `packages/app/src/slices/onboarding/model.ts:17` | In-memory | Seeded sample project ids |
| FirstRunView | `packages/app/src/slices/onboarding/model.ts:64` | In-memory | Onboarding first-run view |
| QuickShortInput | `packages/app/src/slices/onboarding/model.ts:73` | HTTP request/response | Quick short onboarding request |
| PackPrompt | `packages/app/src/slices/onboarding/packs.ts:11` | In-memory | Starter pack Library prompt |
| PackVoice | `packages/app/src/slices/onboarding/packs.ts:27` | In-memory | Starter pack's suggested voice |
| PackStyle | `packages/app/src/slices/onboarding/packs.ts:35` | In-memory | Starter pack video style |
| StarterPack | `packages/app/src/slices/onboarding/packs.ts:49` | In-memory | Starter pack: prompts, voice and style |
| SampleRecord | `packages/app/src/slices/onboarding/state.ts:20` | `settings` key `onboarding.sample[.<id>]` | Seeded sample project record |
| PackRecord | `packages/app/src/slices/onboarding/state.ts:28` | `settings` key `onboarding.packs` | Installed starter pack record |
| PatchNoteSummary | `packages/app/src/slices/patch-notes/library.ts:26` | In-memory | One patch note in the What's new list |
| PatchNotesView | `packages/app/src/slices/patch-notes/seen.ts:13` | `settings` key `patchNotes.seenVersion` | Patch notes due to be shown |
| CollectorEvent | `packages/app/src/slices/telemetry/collector-client.ts:6` | HTTP POST to the collector | Telemetry event as posted to the collector |
| Tokens | `packages/app/src/slices/telemetry/model.ts:25` | In-memory | Tokens in and out as the provider reports them, 0 when unreported |
| TelemetryCounters | `packages/app/src/slices/telemetry/model.ts:66` | In-memory | Counters one telemetry event carries |
| TelemetryPayload | `packages/app/src/slices/telemetry/model.ts:81` | `telemetry_events.payload` | Telemetry counters plus app version |
| TelemetryEvent | `packages/app/src/slices/telemetry/model.ts:85` | `telemetry_events` | One queued telemetry event |
| Machine | `packages/app/src/slices/telemetry/model.ts:95` | `machine` | Single `machine` row: random machine id |
| UsageCounters | `packages/app/src/slices/telemetry/usage.ts:13` | In-memory | All-time Usage screen totals |
| StageTokens | `packages/app/src/slices/telemetry/usage.ts:22` | In-memory | Tokens by stage row |
| UsageInput | `packages/app/src/slices/telemetry/usage.ts:39` | HTTP request/response | Events and machine id the Usage view is computed from |
| TutorialPageSummary | `packages/app/src/slices/tutorials/library.ts:12` | In-memory | Tutorial page id and title |
| TutorialGroup | `packages/app/src/slices/tutorials/library.ts:17` | In-memory | Group of tutorial pages |
| TutorialsIndex | `packages/app/src/slices/tutorials/library.ts:22` | In-memory | Tutorials sidebar index |
| TutorialHit | `packages/app/src/slices/tutorials/library.ts:31` | In-memory | Tutorial search hit |
| TutorialBook | `packages/app/src/slices/tutorials/library.ts:40` | In-memory | All tutorial pages |
| UpdateInfo | `packages/app/src/updater/model.ts:5` | In-memory | Update check state |
| ProjectListBody | `packages/web/src/api.ts:98` | Browser HTTP DTO | GET projects body |
| ProjectBody | `packages/web/src/api.ts:104` | Browser HTTP DTO | GET project body: head revision, project, stages, outputs |
| CreatedProjectBody | `packages/web/src/api.ts:113` | Browser HTTP DTO | Project create body |
| StagingListBody | `packages/web/src/api.ts:117` | Browser HTTP DTO | Staging list body |
| NoticeBody | `packages/web/src/api.ts:139` | Browser HTTP DTO | Telemetry notice body |
| ProviderListBody | `packages/web/src/api.ts:145` | Browser HTTP DTO | Provider list body |
| VoiceListBody | `packages/web/src/api.ts:148` | Browser HTTP DTO | Voice list body |
| PromptListBody | `packages/web/src/api.ts:154` | Browser HTTP DTO | All prompts list body |
| EntryListBody | `packages/web/src/api.ts:159` | Browser HTTP DTO | All entries list body |
| DocumentThemeListBody | `packages/web/src/api.ts:164` | Browser HTTP DTO | Built-in and saved document themes list body |
| KeyStatusBody | `packages/web/src/api.ts:174` | Browser HTTP DTO | Key save response: presence and mask |
| BackupExportSummary | `packages/web/src/api.ts:256` | Browser HTTP DTO | Backup export response |
| NotificationUrlBody | `packages/web/src/api.ts:447` | Browser HTTP DTO | Notification URL body |
| StudioSettingsBody | `packages/web/src/api.ts:477` | Browser HTTP DTO | Settings → YouTube Studio body: playlists, pairing and the auto-comment switch |
| PlanBody | `packages/web/src/api.ts:531` | Browser HTTP DTO | Posting plan, lead hours and the projects' series |
| VoiceRefusal | `packages/web/src/api.ts:711` | Browser HTTP DTO | Voice add refusal |
| LibraryHistoryBody | `packages/web/src/api.ts:916` | Browser HTTP DTO | Library history body |
| AuditionLine | `packages/web/src/api.ts:1062` | Browser HTTP DTO | One speaker line of a voice audition request |
| CastMemberInput | `packages/web/src/channels/api.ts:82` | Browser HTTP DTO | Cast member create/update body |
| CatalogueStatus | `packages/web/src/components/provider-upkeep-api.ts:18` | Browser HTTP DTO | Catalogue file status body |
| SampleState | `packages/web/src/onboarding/api.ts:58` | Browser HTTP DTO | Sample project state body |
| DraftRefusal | `packages/web/src/play/draft-api.ts:24` | Browser HTTP DTO | Parsed draft refusal |
| DraftReply | `packages/web/src/play/draft-api.ts:32` | Browser HTTP DTO | Parsed draft response or refusal |
| ActionBody | `packages/web/src/project/api.ts:16` | Browser HTTP DTO | Control action response body |
| ActionResult | `packages/web/src/project/api.ts:25` | Browser HTTP DTO | Browser-side control action result or refusal |
| RecoveryActionResult | `packages/web/src/project/api.ts:56` | Browser HTTP DTO | Browser-side recovery action result |
| CheckpointGate | `packages/web/src/project/checkpoint-api.ts:24` | Browser mirror of CheckpointRow | Browser-side checkpoint row with closure |
| CheckpointChange | `packages/web/src/project/checkpoint-api.ts:39` | Browser HTTP DTO | Browser-side checkpoint configuration change |
| ApprovalIdentity | `packages/web/src/project/checkpoint-api.ts:40` | Browser HTTP DTO | Browser-side checkpoint approval identity |
| CheckpointReply | `packages/web/src/project/checkpoint-api.ts:45` | Browser HTTP DTO | Browser-side checkpoint response or refusal |
| Review | `packages/web/src/project/review-api.ts:28` | Browser mirror of ReviewView | Browser-side review verdict row |
| ReviewReply | `packages/web/src/project/review-api.ts:32` | Browser HTTP DTO | Browser-side review action reply |
| RevisionRefusal | `packages/web/src/project/revision-api.ts:31` | Browser HTTP DTO | Parsed revision refusal |
| RevisionReply | `packages/web/src/project/revision-api.ts:38` | Browser HTTP DTO | Parsed revision response or refusal |
| NarrationChunkOrder | `packages/web/src/project/revision-api.ts:158` | Browser HTTP DTO | Narration chunk keys per segment |
| ScheduleReply | `packages/web/src/schedules/api.ts:29` | Browser HTTP DTO | Browser-side schedule response or refusal |
| TemplateReply | `packages/web/src/templates/api.ts:29` | Browser HTTP DTO | Browser-side template response or refusal |
| Aggregates | `packages/collector/src/model.ts:34` | Collector D1 `aggregates` | Collector totals the marketing page reads |
| FillPayload | `packages/extension/src/pack.ts:56` | Extension message | Item, thumbnail bytes and captions bytes handed to a Studio page |
| WorkerRequest | `packages/extension/src/pack.ts:71` | Extension message | Message to the extension's background worker |
| ReadyProject | `packages/extension/src/pack.ts:140` | Extension HTTP DTO (`GET /api/studio/ext/ready`) | A finished project not marked uploaded, as the popup lists it |
| WaitingTask | `packages/extension/src/pack.ts:162` | Extension HTTP DTO (`GET /api/studio/ext/tasks`) | An upload with a Details touch or pinned comment waiting on YouTube's side |

## Fields and types

### StageSources

| Field | Type | Required | Notes |
|---|---|---|---|
| research | `"off" \| "generate" \| "provide" \| "from_prompt" \| "prompt_by_llm"` | yes | accepted: off, generate, provide, from_prompt, prompt_by_llm |
| article | `"off" \| "generate" \| "provide" \| "from_prompt" \| "prompt_by_llm"` | yes | accepted: off, generate, provide, from_prompt, prompt_by_llm |
| audio | `"off" \| "generate" \| "provide" \| "from_prompt" \| "prompt_by_llm"` | yes | accepted: off, generate, provide, from_prompt, prompt_by_llm |
| images | `"off" \| "generate" \| "provide" \| "from_prompt" \| "prompt_by_llm"` | yes | accepted: off, generate, provide, from_prompt, prompt_by_llm |
| thumbnail | `"off" \| "generate" \| "provide" \| "from_prompt" \| "prompt_by_llm"` | yes | accepted: off, generate, provide, from_prompt, prompt_by_llm |
| video | `"off" \| "generate" \| "provide" \| "from_prompt" \| "prompt_by_llm"` | yes | accepted: off, generate, provide, from_prompt, prompt_by_llm |
| document | `StageSource` | no | accepted: off, generate, provide, from_prompt, prompt_by_llm |

### ProviderChoice

| Field | Type | Required | Notes |
|---|---|---|---|
| thinking | `ThinkingMode` | no | accepted: off, low, medium, high, xhigh, max, ultra |
| provider | `string` | yes |  |
| model | `string` | yes |  |

### VoiceChoice

| Field | Type | Required | Notes |
|---|---|---|---|
| voice | `string` | yes |  |
| usePronunciationGlossary | `boolean` | no |  |
| shareGlossary | `boolean` | no |  |
| useNarrationAliases | `boolean` | no |  |
| describeFigures | `boolean` | no |  |
| skipCode | `boolean` | no |  |
| thinking | `ThinkingMode` | no | accepted: off, low, medium, high, xhigh, max, ultra |
| provider | `string` | yes |  |
| model | `string` | yes |  |

### SharedPronunciation

| Field | Type | Required |
|---|---|---|
| term | `string` | yes |
| ipa | `readonly string[]` | yes |

### ImagePromptChoice

| Field | Type | Required |
|---|---|---|
| name | `string` | yes |
| number | `number` | yes |

### EntryChoice

| Field | Type | Required | Notes |
|---|---|---|---|
| name | `string` | yes |  |
| mode | `EntryMode` | yes | accepted: llm, text |

### ProvidedText

| Field | Type | Required |
|---|---|---|
| research | `string` | no |
| article | `string` | no |

### ProvidedFiles

| Field | Type | Required |
|---|---|---|
| audio | `string` | no |
| images | `readonly string[]` | no |
| thumbnail | `string` | no |
| reference | `string` | no |
| shortsMusic | `string` | no |
| ambientBed | `string` | no |

### ReferenceSettings

| Field | Type | Required | Notes |
|---|---|---|---|
| source | `ReferenceSource` | yes | accepted: prompt, provide |
| prompt | `string` | no |  |
| thumbnail | `boolean` | no |  |

### RunDraft

| Field | Type | Required | Notes |
|---|---|---|---|
| mode | `RunMode` | no | accepted: video, short |
| sharedGlossary | `readonly SharedPronunciation[]` | no |  |
| narrationAliases | `readonly NarrationAlias[]` | no |  |
| checkpoints | `readonly CheckpointStage[]` | no |  |
| title | `string` | yes |  |
| format | `Format` | yes | accepted: 16:9, 9:16, 1:1 |
| sources | `StageSources` | yes |  |
| llm | `ProviderChoice` | no |  |
| audio | `VoiceChoice` | no |  |
| images | `ProviderChoice` | no |  |
| reference | `ReferenceSettings` | no |  |
| articlePrompt | `string` | no |  |
| narrationPrompt | `string` | no |  |
| imagePrompts | `readonly ImagePromptChoice[]` | yes |  |
| imageScale | `ImageScale` | no |  |
| imageScenes | `boolean` | no |  |
| thumbnailPrompt | `string` | no |  |
| thumbnailCount | `ThumbnailCount` | no |  |
| intro | `EntryChoice` | no |  |
| outro | `EntryChoice` | no |  |
| values | `Record<string, string>` | yes |  |
| provided | `ProvidedText & ProvidedFiles` | yes |  |
| chunking | `Chunking` | no |  |
| silenceGapSeconds | `number` | yes |  |
| imageSeconds | `number` | yes |  |
| zoomPercent | `number` | yes |  |
| motionStyle | `MotionStyle` | yes | accepted: zoom, pan, mixed, still |
| edgeSilenceSeconds | `number` | yes |  |
| subtitles | `SubtitleConfig` | no |  |
| document | `DocumentSettings` | no |  |
| showFigures | `boolean` | no |  |
| youtubeDescription | `boolean` | no |  |
| descriptionPrompt | `string` | no |  |
| shorts | `ShortsSettings` | no |  |
| videoEdit | `VideoEditSettings` | no |  |
| reviews | `ReviewSettings` | no |  |
| channelId | `string` | no |  |
| useBrandKit | `false` | no |  |
| cast | `readonly CastSnapshot[]` | no |  |
| earlierEpisodes | `readonly EarlierEpisode[]` | no |  |
| titleStyle | `TitleStyle` | no |  |
| endScreen | `{ readonly text: string }` | no |  |
| voices | `VoicesSettings` | no |  |
| ambientBed | `AmbientBedSettings` | no |  |
| loudness | `LoudnessSettings` | no |  |
| sentencePauseSeconds | `number` | no |  |
| paragraphPauseSeconds | `number` | no |  |
| language | `LanguageCode` | no | accepted: id, en, es, de, fr, it, pt, nl, ca, pl, cs, ro, sv, da, nb, fi, hu, tr, vi, el, ru, uk, ar, he, hi, th, ja, zh, ko |

### TitleStyle

| Field | Type | Required |
|---|---|---|
| fontId | `string` | no |
| color | `string` | no |

### RunConfig

| Field | Type | Required | Notes |
|---|---|---|---|
| rendered | `Record<string, string>` | yes |  |
| titlePattern | `string` | no | The title as written with its keywords, kept when `title` was filled from it; YouTube's other titles change only the keywords (`packages/app/src/slices/admission/model.ts:277`) |
| subjectTitle | `string` | no | The title the project was made about, kept on the first rename by `keptSubject`; `subjectOf(config)` returns it before `title` (`packages/app/src/slices/admission/model.ts:281`, `:285`, `packages/app/src/slices/revisions/subject.ts:7`) |
| mode | `RunMode` | no | accepted: video, short |
| sharedGlossary | `readonly SharedPronunciation[]` | no |  |
| narrationAliases | `readonly NarrationAlias[]` | no |  |
| checkpoints | `readonly CheckpointStage[]` | no |  |
| title | `string` | yes |  |
| format | `Format` | yes | accepted: 16:9, 9:16, 1:1 |
| sources | `StageSources` | yes |  |
| llm | `ProviderChoice` | no |  |
| audio | `VoiceChoice` | no |  |
| images | `ProviderChoice` | no |  |
| reference | `ReferenceSettings` | no |  |
| articlePrompt | `string` | no |  |
| narrationPrompt | `string` | no |  |
| imagePrompts | `readonly ImagePromptChoice[]` | yes |  |
| imageScale | `ImageScale` | no |  |
| imageScenes | `boolean` | no |  |
| thumbnailPrompt | `string` | no |  |
| thumbnailCount | `ThumbnailCount` | no |  |
| intro | `EntryChoice` | no |  |
| outro | `EntryChoice` | no |  |
| values | `Record<string, string>` | yes |  |
| provided | `ProvidedText & ProvidedFiles` | yes |  |
| chunking | `Chunking` | no |  |
| silenceGapSeconds | `number` | yes |  |
| imageSeconds | `number` | yes |  |
| zoomPercent | `number` | yes |  |
| motionStyle | `MotionStyle` | yes | accepted: zoom, pan, mixed, still |
| edgeSilenceSeconds | `number` | yes |  |
| subtitles | `SubtitleConfig` | no |  |
| document | `DocumentSettings` | no |  |
| showFigures | `boolean` | no |  |
| youtubeDescription | `boolean` | no |  |
| descriptionPrompt | `string` | no |  |
| shorts | `ShortsSettings` | no |  |
| videoEdit | `VideoEditSettings` | no |  |
| reviews | `ReviewSettings` | no |  |
| channelId | `string` | no |  |
| useBrandKit | `false` | no |  |
| cast | `readonly CastSnapshot[]` | no |  |
| earlierEpisodes | `readonly EarlierEpisode[]` | no |  |
| titleStyle | `TitleStyle` | no |  |
| endScreen | `{ readonly text: string }` | no |  |
| voices | `VoicesSettings` | no |  |
| ambientBed | `AmbientBedSettings` | no |  |
| loudness | `LoudnessSettings` | no |  |
| sentencePauseSeconds | `number` | no |  |
| paragraphPauseSeconds | `number` | no |  |
| language | `LanguageCode` | no | accepted: id, en, es, de, fr, it, pt, nl, ca, pl, cs, ro, sv, da, nb, fi, hu, tr, vi, el, ru, uk, ar, he, hi, th, ja, zh, ko |

### Project

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes |  |
| title | `string` | yes |  |
| format | `Format` | yes | accepted: 16:9, 9:16, 1:1 |
| config | `RunConfig` | yes |  |
| createdAt | `string` | yes |  |
| updatedAt | `string` | yes |  |
| paused | `boolean` | no |  |

### StageActivity

| Field | Type | Required |
|---|---|---|
| label | `string` | yes |
| percent | `number` | no |
| done | `number` | no |
| total | `number` | no |

### Stage

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes |  |
| projectId | `string` | yes |  |
| kind | `StageKind` | yes | accepted: research, article, audio, images, thumbnail, video, document |
| source | `StageSource` | yes | accepted: off, generate, provide, from_prompt, prompt_by_llm |
| state | `StageState` | yes | accepted: done, pending, running, failed, canceled, provided, skipped |
| failureReason | `string \| null` | yes |  |
| attemptCount | `number` | yes |  |
| progressCurrent | `number \| null` | yes |  |
| progressTotal | `number \| null` | yes |  |
| startedAt | `string \| null` | yes |  |
| finishedAt | `string \| null` | yes |  |
| failureKind | `string` | no |  |
| activity | `StageActivity` | no |  |
| retryAt | `string` | no |  |
| etaSeconds | `number` | no |  |
| etaBasis | `EtaBasis` | no | accepted: unknown, progress, history, overdue |
| typicalSeconds | `number` | no |  |

### ProjectSummary

| Field | Type | Required | Notes |
|---|---|---|---|
| status | `ProjectState` | yes | accepted: done, partial, pending, running, failed, canceled, paused |
| setAside | `boolean` | no | "Keep as is" on Needs you, while `project_set_aside` names the current head revision (`packages/app/src/slices/admission/model.ts:341`) |
| id | `string` | yes |  |
| title | `string` | yes |  |
| format | `Format` | yes | accepted: 16:9, 9:16, 1:1 |
| config | `RunConfig` | yes |  |
| createdAt | `string` | yes |  |
| updatedAt | `string` | yes |  |
| paused | `boolean` | no |  |

### ProjectListing

| Field | Type | Required | Notes |
|---|---|---|---|
| progress | `number` | yes |  |
| channelId | `string` | yes |  |
| uploadedAt | `string \| null` | yes |  |
| views | `number` | no | The long video's views from `video_stats` (`packages/app/src/slices/admission/model.ts:359`) |
| ctr | `number` | no | The long video's click-through rate in percent from `video_stats` |
| limitWaits | `readonly ListingLimitWait[]` | no |  |
| status | `ProjectState` | yes | accepted: done, partial, pending, running, failed, canceled, paused |
| setAside | `boolean` | no |  |
| id | `string` | yes |  |
| title | `string` | yes |  |
| format | `Format` | yes | accepted: 16:9, 9:16, 1:1 |
| config | `RunConfig` | yes |  |
| createdAt | `string` | yes |  |
| updatedAt | `string` | yes |  |
| paused | `boolean` | no |  |

### ListingLimitWait

| Field | Type | Required | Notes |
|---|---|---|---|
| name | `string` | yes |  |
| stage | `StageKind` | yes | accepted: research, article, audio, images, thumbnail, video, document |
| resetsAt | `string \| null` | yes |  |
| retryAt | `string` | yes |  |

### FieldError

| Field | Type | Required |
|---|---|---|
| field | `string` | yes |
| message | `string` | yes |

### AdmissionInput

| Field | Type | Required |
|---|---|---|
| draft | `RunDraft` | yes |
| staged | `readonly StagedFile[]` | yes |
| requiredSlots | `readonly string[]` | yes |

### LlmUse

| Field | Type | Required | Notes |
|---|---|---|---|
| section | `"article" \| "narration" \| "outputs"` | yes | accepted: article, narration, outputs |
| label | `string` | yes |  |

### SlotLintError

| Field | Type | Required | Notes |
|---|---|---|---|
| kind | `SlotLintKind` | yes | accepted: unclosed, empty, nested |
| at | `number` | yes |  |

### DetectedSlots

| Field | Type | Required |
|---|---|---|
| names | `readonly string[]` | yes |
| errors | `readonly SlotLintError[]` | yes |

### Field

| Field | Type | Required | Notes |
|---|---|---|---|
| name | `string` | yes |  |
| group | `FieldGroup` | yes | accepted: image, text, common |

### AttemptStart

| Field | Type | Required | Notes |
|---|---|---|---|
| revisionId | `string \| null` | no |  |
| workId | `string \| null` | no |  |
| workPieceId | `string \| null` | no |  |
| work | `WorkRef` | no |  |
| operation | `"submit" \| "retrieve"` | no | accepted: submit, retrieve |
| stageId | `string` | yes |  |
| pieceId | `string \| null` | yes |  |
| n | `number` | yes |  |
| startedAt | `string` | yes |  |

### AttemptEnd

| Field | Type | Required | Notes |
|---|---|---|---|
| outcome | `AttemptOutcome` | yes | accepted: other, auth, missing_key, unavailable, rate_limit, refusal, unsupported, timeout, dropped, canceled, ok |
| endedAt | `string` | yes |  |
| errorText | `string \| null` | yes |  |

### Attempt

| Field | Type | Required | Notes |
|---|---|---|---|
| revisionId | `string \| null` | yes |  |
| workId | `string \| null` | yes |  |
| workPieceId | `string \| null` | yes |  |
| id | `string` | yes |  |
| endedAt | `string \| null` | yes |  |
| outcome | `AttemptOutcome \| null` | yes | accepted: other, auth, missing_key, unavailable, rate_limit, refusal, unsupported, timeout, dropped, canceled, ok |
| errorText | `string \| null` | yes |  |
| work | `WorkRef` | no |  |
| operation | `"submit" \| "retrieve"` | no | accepted: submit, retrieve |
| stageId | `string` | yes |  |
| pieceId | `string \| null` | yes |  |
| n | `number` | yes |  |
| startedAt | `string` | yes |  |

### StageProgress

| Field | Type | Required | Notes |
|---|---|---|---|
| progressCurrent | `number \| null` | yes |  |
| progressTotal | `number \| null` | yes |  |
| kind | `StageKind` | yes | accepted: research, article, audio, images, thumbnail, video, document |
| state | `StageState` | yes | accepted: done, pending, running, failed, canceled, provided, skipped |
| retryAt | `string \| null` | no |  |

### RunnerStage

| Field | Type | Required | Notes |
|---|---|---|---|
| work | `WorkRef` | yes |  |
| id | `string` | yes |  |
| projectId | `string` | yes |  |
| kind | `StageKind` | yes | accepted: research, article, audio, images, thumbnail, video, document |
| state | `StageState` | yes | accepted: done, pending, running, failed, canceled, provided, skipped |

### StageContext

| Field | Type | Required |
|---|---|---|
| work | `WorkRef` | yes |
| stage | `RunnerStage` | yes |
| signal | `AbortSignal` | yes |

### MeteredCall

| Field | Type | Required | Notes |
|---|---|---|---|
| projectId | `string` | yes |  |
| stage | `StageKind` | yes | accepted: research, article, audio, images, thumbnail, video, document |
| kind | `ProviderCallKind` | yes | accepted: llm, tts, image, video |
| provider | `string` | yes |  |
| model | `string` | yes |  |
| tokensIn | `number` | no |  |
| tokensOut | `number` | no |  |
| cachedTokens | `number` | no |  |
| characters | `number` | no |  |
| images | `number` | no |  |
| seconds | `number` | no |  |
| size | `string` | no |  |
| quality | `string` | no |  |
| wallMs | `number` | yes |  |
| limits | `PlanLimitReading` | no |  |

### ProviderUse

| Field | Type | Required | Notes |
|---|---|---|---|
| kind | `ProviderCallKind` | yes | accepted: llm, tts, image, video |
| provider | `string` | yes |  |
| model | `string` | yes |  |
| tokensIn | `number` | no |  |
| tokensOut | `number` | no |  |
| cachedTokens | `number` | no |  |
| characters | `number` | no |  |
| images | `number` | no |  |
| seconds | `number` | no |  |
| size | `string` | no |  |
| quality | `string` | no |  |
| wallMs | `number` | yes |  |
| limits | `PlanLimitReading` | no |  |

### StandaloneOwner

| Field | Type | Required | Notes |
|---|---|---|---|
| kind | `"schedule" \| "channel"` | yes | accepted: schedule, channel |
| id | `string` | yes |  |

Union of 2 object variants; a field present in only some variants is `Required: no`.

### StandaloneUse

| Field | Type | Required | Notes |
|---|---|---|---|
| owner | `StandaloneOwner` | yes |  |
| purpose | `StandalonePurpose` | yes | accepted: topics, episode-summary, cast-image |

### StandaloneMeteredCall

| Field | Type | Required | Notes |
|---|---|---|---|
| kind | `ProviderCallKind` | yes | accepted: llm, tts, image, video |
| provider | `string` | yes |  |
| model | `string` | yes |  |
| tokensIn | `number` | no |  |
| tokensOut | `number` | no |  |
| cachedTokens | `number` | no |  |
| characters | `number` | no |  |
| images | `number` | no |  |
| seconds | `number` | no |  |
| size | `string` | no |  |
| quality | `string` | no |  |
| wallMs | `number` | yes |  |
| limits | `PlanLimitReading` | no |  |
| owner | `StandaloneOwner` | yes |  |
| purpose | `StandalonePurpose` | yes | accepted: topics, episode-summary, cast-image |

### LimitWaiter

| Field | Type | Required | Notes |
|---|---|---|---|
| projectId | `string` | yes |  |
| stage | `StageKind` | yes | accepted: research, article, audio, images, thumbnail, video, document |

### StagePiece

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes |  |
| stageId | `string` | yes |  |
| kind | `PieceKind` | yes | accepted: image, chapter, chunk, segment, prompt_written, article_written |
| idx | `number` | yes |  |
| state | `PieceState` | yes | accepted: done, pending, running, failed |
| payload | `string \| null` | yes |  |

### WorkRef

| Field | Type | Required | Notes |
|---|---|---|---|
| projectId | `string` | yes |  |
| revisionId | `string` | yes |  |
| workId | `string` | yes |  |
| stageId | `string` | yes |  |
| kind | `StageKind` | yes | accepted: research, article, audio, images, thumbnail, video, document |
| fingerprint | `Fingerprint` | yes |  |

### PublicationRef

| Field | Type | Required |
|---|---|---|
| work | `WorkRef` | yes |
| pieceId | `string \| null` | yes |
| publicationId | `string` | yes |

### EventOrigin

| Field | Type | Required |
|---|---|---|
| revisionId | `string` | no |
| workId | `string` | no |
| workPieceId | `string` | no |

### StageStateEvent

| Field | Type | Required | Notes |
|---|---|---|---|
| type | `"stage.state"` | yes |  |
| projectId | `string` | yes |  |
| stage | `StageKind` | yes | accepted: research, article, audio, images, thumbnail, video, document |
| state | `StageState` | yes | accepted: done, pending, running, failed, canceled, provided, skipped |
| failureReason | `string` | no |  |
| failureKind | `string` | no |  |
| retryAt | `string` | no |  |
| revisionId | `string` | no |  |
| workId | `string` | no |  |
| workPieceId | `string` | no |  |

### StageProgressEvent

| Field | Type | Required | Notes |
|---|---|---|---|
| type | `"stage.progress"` | yes |  |
| projectId | `string` | yes |  |
| stage | `StageKind` | yes | accepted: research, article, audio, images, thumbnail, video, document |
| current | `number` | yes |  |
| total | `number` | yes |  |
| revisionId | `string` | no |  |
| workId | `string` | no |  |
| workPieceId | `string` | no |  |

### ArticleDeltaEvent

| Field | Type | Required |
|---|---|---|
| type | `"article.delta"` | yes |
| projectId | `string` | yes |
| text | `string` | yes |
| revisionId | `string` | no |
| workId | `string` | no |
| workPieceId | `string` | no |

### LlmPreviewEvent

| Field | Type | Required | Notes |
|---|---|---|---|
| type | `"llm.preview"` | yes |  |
| projectId | `string` | yes |  |
| stage | `StageKind` | yes | accepted: research, article, audio, images, thumbnail, video, document |
| callId | `string` | yes |  |
| label | `string` | no |  |
| text | `string` | yes |  |
| reset | `boolean` | no |  |
| revisionId | `string` | no |  |
| workId | `string` | no |  |
| workPieceId | `string` | no |  |

### ImageLandedEvent

| Field | Type | Required |
|---|---|---|
| type | `"image.landed"` | yes |
| projectId | `string` | yes |
| outputId | `string` | yes |
| index | `number` | yes |
| revisionId | `string` | no |
| workId | `string` | no |
| workPieceId | `string` | no |

### NarrationPieceEvent

| Field | Type | Required |
|---|---|---|
| type | `"narration.piece"` | yes |
| projectId | `string` | yes |
| key | `string` | yes |
| durationMs | `number \| null` | yes |
| revisionId | `string` | no |
| workId | `string` | no |
| workPieceId | `string` | no |

### ProjectStateEvent

| Field | Type | Required | Notes |
|---|---|---|---|
| type | `"project.state"` | yes |  |
| projectId | `string` | yes |  |
| state | `ProjectState` | yes | accepted: done, partial, pending, running, failed, canceled, paused |
| revisionId | `string` | no |  |
| workId | `string` | no |  |
| workPieceId | `string` | no |  |

### ReviewFlaggedEvent

| Field | Type | Required |
|---|---|---|
| type | `"review.flagged"` | yes |
| projectId | `string` | yes |
| verdictId | `string` | yes |
| stage | `string` | yes |
| itemKey | `string` | yes |
| reason | `string` | no |
| revisionId | `string` | no |
| workId | `string` | no |
| workPieceId | `string` | no |

### ProjectUpdatedEvent

| Field | Type | Required |
|---|---|---|
| type | `"project.updated"` | yes |
| projectId | `string` | yes |
| revisionId | `string` | no |
| workId | `string` | no |
| workPieceId | `string` | no |

### RunningCountEvent

| Field | Type | Required |
|---|---|---|
| type | `"running.count"` | yes |
| count | `number` | yes |
| revisionId | `string` | no |
| workId | `string` | no |
| workPieceId | `string` | no |

### ScheduleTopicsEvent

| Field | Type | Required |
|---|---|---|
| type | `"schedule.topics"` | yes |
| scheduleId | `string` | yes |
| scheduleName | `string` | yes |
| added | `number` | yes |
| waiting | `number` | yes |

### ProjectEvent

| Field | Type | Required | Notes |
|---|---|---|---|
| type | `"stage.state" \| "stage.progress" \| "article.delta" \| "llm.preview" \| "image.landed" \| "narration.piece" \| "project.state" \| "review.flagged" \| "project.updated"` | yes | accepted: stage.state, stage.progress, article.delta, llm.preview, image.landed, narration.piece, project.state, review.flagged, project.updated |
| projectId | `string` | yes |  |
| stage | `StageKind \| string` | no | accepted: research, article, audio, images, thumbnail, video, document; only when type is stage.state or stage.progress or llm.preview or review.flagged |
| state | `StageState \| ProjectState` | no | accepted: done, pending, running, failed, canceled, provided, skipped, partial, paused; only when type is stage.state or project.state |
| failureReason | `string` | no | only when type is stage.state |
| failureKind | `string` | no | only when type is stage.state |
| retryAt | `string` | no | only when type is stage.state |
| revisionId | `string` | no |  |
| workId | `string` | no |  |
| workPieceId | `string` | no |  |
| current | `number` | no | only when type is stage.progress |
| total | `number` | no | only when type is stage.progress |
| text | `string` | no | only when type is article.delta or llm.preview |
| callId | `string` | no | only when type is llm.preview |
| label | `string` | no | only when type is llm.preview |
| reset | `boolean` | no | only when type is llm.preview |
| outputId | `string` | no | only when type is image.landed |
| index | `number` | no | only when type is image.landed |
| key | `string` | no | only when type is narration.piece |
| durationMs | `number \| null` | no | only when type is narration.piece |
| verdictId | `string` | no | only when type is review.flagged |
| itemKey | `string` | no | only when type is review.flagged |
| reason | `string` | no | only when type is review.flagged |

Union of 9 object variants; a field present in only some variants is `Required: no`.

### OutputMeta

| Field | Type | Required | Notes |
|---|---|---|---|
| segment | `"body" \| "intro" \| "outro"` | no | accepted: body, intro, outro |
| subtitleOmissions | `\| readonly { readonly start: number; readonly text: string }[]` | no |  |
| subtitlesMode | `"off" \| "files" \| "burn-in"` | no | accepted: off, files, burn-in |
| promptName | `string` | no |  |
| prompt | `string` | no |  |
| index | `number` | no |  |
| short | `number` | no |  |
| format | `"16:9" \| "9:16" \| "1:1"` | no | accepted: 16:9, 9:16, 1:1 |
| sentences | `readonly [number, number]` | no |  |
| warnings | `readonly string[]` | no |  |
| provider | `string` | no |  |
| model | `string` | no |  |
| voice | `string` | no |  |
| loudness | `LoudnessReport` | no |  |
| master | `MasterReport` | no |  |

### Output

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes |  |
| projectId | `string` | yes |  |
| stageKind | `StageKind` | yes | accepted: research, article, audio, images, thumbnail, video, document |
| role | `OutputRole` | yes | accepted: image, thumbnail, video, reference, shorts, notes, article_md, article_txt, narration_txt, tts_script, sources, glossary, audio_body, audio_intro, audio_outro, audio_export, render_params, subtitles_srt, subtitles_vtt, subtitle_words, subtitle_ass, subtitle_font, instructions, document_pdf, youtube_description, youtube_tags, youtube_pinned_comment, youtube_titles, short_image, short_video, animated_image, figure_card, script_md, audio_mp3, audio_m4b, audio_levelled |
| path | `string` | yes |  |
| originalFilename | `string \| null` | yes |  |
| bytes | `number` | yes |  |
| durationMs | `number \| null` | yes |  |
| meta | `OutputMeta` | yes |  |
| createdAt | `string` | yes |  |

### StagedFile

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes |  |
| stageKind | `StageKind` | yes | accepted: research, article, audio, images, thumbnail, video, document |
| path | `string` | yes |  |
| originalFilename | `string` | yes |  |
| bytes | `number` | yes |  |
| state | `StagedFileState` | yes | accepted: copying, staged |
| createdAt | `string` | yes |  |

### StagingProgressEvent

| Field | Type | Required | Notes |
|---|---|---|---|
| type | `"staging.progress"` | yes |  |
| stagedFileId | `string` | yes |  |
| stageKind | `StageKind` | yes | accepted: research, article, audio, images, thumbnail, video, document |
| originalFilename | `string` | yes |  |
| bytes | `number` | yes |  |
| state | `StagedFileState` | yes | accepted: copying, staged |

### StagingFailedEvent

| Field | Type | Required | Notes |
|---|---|---|---|
| type | `"staging.failed"` | yes |  |
| stagedFileId | `string` | yes |  |
| stageKind | `StageKind` | yes | accepted: research, article, audio, images, thumbnail, video, document |
| originalFilename | `string` | yes |  |
| detail | `string` | yes |  |

### StagingEvent

| Field | Type | Required | Notes |
|---|---|---|---|
| type | `"staging.progress" \| "staging.failed"` | yes | accepted: staging.progress, staging.failed |
| stagedFileId | `string` | yes |  |
| stageKind | `StageKind` | yes | accepted: research, article, audio, images, thumbnail, video, document |
| originalFilename | `string` | yes |  |
| bytes | `number` | no | only when type is staging.progress |
| state | `StagedFileState` | no | accepted: copying, staged; only when type is staging.progress |
| detail | `string` | no | only when type is staging.failed |

Union of 2 object variants; a field present in only some variants is `Required: no`.

### QueueEntry

| Field | Type | Required | Notes |
|---|---|---|---|
| projectId | `string` | yes |  |
| batchId | `string` | yes |  |
| position | `number` | yes |  |
| state | `"queued" \| "active" \| "finished"` | yes | accepted: queued, active, finished |

### Eta

| Field | Type | Required | Notes |
|---|---|---|---|
| basis | `EtaBasis` | yes | accepted: unknown, progress, history, overdue |
| seconds | `number` | no |  |

### EtaStage

| Field | Type | Required | Notes |
|---|---|---|---|
| state | `StageState` | yes | accepted: done, pending, running, failed, canceled, provided, skipped |
| startedAt | `string \| null` | yes |  |
| progressCurrent | `number \| null` | yes |  |
| progressTotal | `number \| null` | yes |  |
| typicalSeconds | `number` | no |  |

### ModelChoices

| Field | Type | Required |
|---|---|---|
| llm | `{ readonly provider: string; readonly model: string }` | no |
| audio | `{ readonly provider: string; readonly model: string }` | no |
| images | `{ readonly provider: string; readonly model: string }` | no |

### ManualCue

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| text | `string` | yes |
| start | `number` | yes |
| end | `number` | yes |
| speaker | `string` | no |

### NarrationOverride

| Field | Type | Required | Notes |
|---|---|---|---|
| kind | `"asset" \| "text"` | yes | accepted: asset, text |
| assetId | `string` | no | only when kind is asset |
| text | `string` | no | only when kind is text |
| direction | `string` | no | only when kind is text; this chunk's delivery note, 1–20,000 characters (`packages/app/src/slices/revisions/model.ts:35`, `packages/app/src/slices/revisions/schema.ts:68`) |

Union of 2 object variants; a field present in only some variants is `Required: no`.

### RevisionContent

| Field | Type | Required | Notes |
|---|---|---|---|
| articleMarkdown | `string` | no |  |
| articleEdited | `boolean` | no |  |
| provided | `Partial<Record<ProvidedKind, string \| undefined>>` | yes |  |
| imageOrder | `readonly string[]` | yes |  |
| imageDefinitions | `object (inline)` | yes | inline shape at `packages/app/src/slices/revisions/model.ts:42` |
| narrationOverrides | `Record<string, NarrationOverride>` | yes |  |
| narrationSources | `Record<string, NarrationSource>` | no |  |
| subtitleCues | `\| { readonly audioFingerprint: string; readonly cues: readonly ManualCue[]; }` | no |  |
| regenerationTokens | `Record<WorkKey, string>` | yes |  |
| promptTemplates | `Record<string, string \| null>` | yes |  |
| shortsMusic | `string` | no |  |
| shortsRanges | `\| Readonly<Record<string, ShortRange>>` | no |  |
| ambientBed | `string` | no |  |

### RevisionUpload

| Field | Type | Required | Notes |
|---|---|---|---|
| stagedFileId | `string` | yes |  |
| destination | `object union (inline)` | yes | inline shape at `packages/app/src/slices/revisions/model.ts:77` |

### RevisionEdit

| Field | Type | Required |
|---|---|---|
| config | `RunConfig` | yes |
| content | `RevisionContent` | yes |
| regenerate | `readonly WorkKey[]` | no |
| uploads | `readonly RevisionUpload[]` | no |

### ProjectRevision

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| projectId | `string` | yes |
| parentId | `string \| null` | yes |
| restoredFromId | `string \| null` | yes |
| config | `RunConfig` | yes |
| content | `RevisionContent` | yes |
| fingerprints | `Record<WorkKey, Fingerprint>` | yes |
| createdAt | `string` | yes |

### ProjectAsset

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| projectId | `string` | yes |
| path | `string` | yes |
| bytes | `number \| null` | yes |
| createdAt | `string` | yes |

### ManifestOutput

| Field | Type | Required | Notes |
|---|---|---|---|
| slot | `string` | yes |  |
| workKey | `WorkKey` | yes |  |
| assetId | `string` | yes |  |
| output | `Output` | yes |  |
| fingerprint | `Fingerprint` | yes |  |
| state | `OutputState` | yes | accepted: ready, outdated, review |

### ManifestPiece

| Field | Type | Required | Notes |
|---|---|---|---|
| key | `string` | yes |  |
| stageKind | `StageKind` | yes | accepted: research, article, audio, images, thumbnail, video, document |
| piece | `StagePiece` | yes |  |
| assetId | `string \| null` | yes |  |
| fingerprint | `Fingerprint` | yes |  |

### RevisionManifest

| Field | Type | Required |
|---|---|---|
| outputs | `readonly ManifestOutput[]` | yes |
| pieces | `readonly ManifestPiece[]` | yes |

### RevisionOutputView

| Field | Type | Required | Notes |
|---|---|---|---|
| recordId | `string` | yes |  |
| publicationId | `string \| null` | yes |  |
| selected | `boolean` | yes |  |
| available | `boolean` | yes |  |
| slot | `string` | yes |  |
| workKey | `WorkKey` | yes |  |
| assetId | `string` | yes |  |
| output | `Output` | yes |  |
| fingerprint | `Fingerprint` | yes |  |
| state | `OutputState` | yes | accepted: ready, outdated, review |

### RevisionPieceView

| Field | Type | Required | Notes |
|---|---|---|---|
| recordId | `string` | yes |  |
| publicationId | `string \| null` | yes |  |
| selected | `boolean` | yes |  |
| available | `boolean` | yes |  |
| key | `string` | yes |  |
| stageKind | `StageKind` | yes | accepted: research, article, audio, images, thumbnail, video, document |
| piece | `StagePiece` | yes |  |
| assetId | `string \| null` | yes |  |
| fingerprint | `Fingerprint` | yes |  |

### RevisionView

| Field | Type | Required |
|---|---|---|
| articleMarkdown | `string \| null` | yes |
| revision | `ProjectRevision` | yes |
| outputs | `readonly RevisionOutputView[]` | yes |
| pieces | `readonly RevisionPieceView[]` | yes |
| current | `boolean` | yes |

### RevisionSummary

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| parentId | `string \| null` | yes |
| restoredFromId | `string \| null` | yes |
| title | `string` | yes |
| createdAt | `string` | yes |
| current | `boolean` | yes |

### RevisionMutationResult

| Field | Type | Required | Notes |
|---|---|---|---|
| ok | `true \| false` | yes |  |
| view | `RevisionView` | no | not in every variant |
| duplicate | `boolean` | no | not in every variant |
| reason | `\| "no-project" \| "no-revision" \| "conflict" \| "idempotency-conflict" \| "invalid-edit"` | no | accepted: conflict, no-project, no-revision, idempotency-conflict, invalid-edit; not in every variant |
| currentRevisionId | `string \| null` | no | not in every variant |
| fields | `readonly FieldError[]` | no | not in every variant |

Union of 2 object variants; a field present in only some variants is `Required: no`.

### BaselineResult

| Field | Type | Required | Notes |
|---|---|---|---|
| ok | `true \| false` | yes |  |
| view | `RevisionView` | no | not in every variant |
| created | `boolean` | no | not in every variant |
| reason | `"no-project"` | no | not in every variant |

Union of 2 object variants; a field present in only some variants is `Required: no`.

### RevisionOutputRecord

| Field | Type | Required | Notes |
|---|---|---|---|
| output | `Output` | yes |  |
| recordId | `string` | yes |  |
| publicationId | `string \| null` | yes |  |
| selected | `boolean` | yes |  |
| slot | `string` | yes |  |
| workKey | `WorkKey` | yes |  |
| assetId | `string` | yes |  |
| fingerprint | `Fingerprint` | yes |  |
| state | `OutputState` | yes | accepted: ready, outdated, review |

### RevisionPieceRecord

| Field | Type | Required | Notes |
|---|---|---|---|
| key | `string` | yes |  |
| recordId | `string` | yes |  |
| publicationId | `string \| null` | yes |  |
| selected | `boolean` | yes |  |
| assetId | `string \| null` | yes |  |
| fingerprint | `Fingerprint` | yes |  |
| stageKind | `StageKind` | yes | accepted: research, article, audio, images, thumbnail, video, document |
| piece | `StagePiece` | yes |  |

### MutationIdentity

| Field | Type | Required | Notes |
|---|---|---|---|
| projectId | `string` | yes |  |
| baseRevisionId | `string` | yes |  |
| idempotencyKey | `string` | yes |  |
| operation | `"save" \| "restore"` | yes | accepted: save, restore |
| hash | `string` | yes |  |

### SaveRevisionInput

| Field | Type | Required |
|---|---|---|
| projectId | `string` | yes |
| baseRevisionId | `string` | yes |
| idempotencyKey | `string` | yes |
| edit | `RevisionEdit` | yes |

### PreparedOutput

| Field | Type | Required |
|---|---|---|
| slot | `string` | yes |
| workKey | `WorkKey` | yes |
| output | `Output` | yes |
| asset | `PreparedAsset` | yes |
| fingerprint | `Fingerprint` | yes |

### PreparedPiece

| Field | Type | Required | Notes |
|---|---|---|---|
| key | `string` | yes |  |
| stageKind | `StageKind` | yes | accepted: research, article, audio, images, thumbnail, video, document |
| piece | `StagePiece` | yes |  |
| asset | `PreparedAsset \| null` | yes |  |
| fingerprint | `Fingerprint` | yes |  |

### RestoreRevisionInput

| Field | Type | Required |
|---|---|---|
| projectId | `string` | yes |
| baseRevisionId | `string` | yes |
| idempotencyKey | `string` | yes |
| targetRevisionId | `string` | yes |

### WorkRecipe

| Field | Type | Required | Notes |
|---|---|---|---|
| key | `string` | yes |  |
| stage | `StageKind` | yes | accepted: research, article, audio, images, thumbnail, video, document |
| kind | `"provider" \| "local" \| "provided"` | yes | accepted: local, provided, provider |
| requestFingerprint | `string` | yes |  |
| fingerprint | `string` | yes |  |
| dependsOn | `readonly string[]` | yes |  |
| unresolved | `boolean` | yes |  |

### RetainedWork

| Field | Type | Required |
|---|---|---|
| key | `string` | yes |
| requestFingerprint | `string` | yes |
| fingerprint | `string` | yes |
| available | `boolean` | yes |
| inflight | `boolean` | yes |
| pieceIds | `readonly string[]` | yes |

### RebuildSelection

| Field | Type | Required | Notes |
|---|---|---|---|
| kind | `"allAffected" \| "selected"` | yes | accepted: allAffected, selected |
| workKeys | `readonly string[]` | no | only when kind is selected |

Union of 2 object variants; a field present in only some variants is `Required: no`.

### RebuildWork

| Field | Type | Required | Notes |
|---|---|---|---|
| key | `string` | yes |  |
| stage | `StageKind` | yes | accepted: research, article, audio, images, thumbnail, video, document |
| kind | `"provider" \| "local" \| "provided"` | yes | accepted: local, provided, provider |
| disposition | `"reuse" \| "generate" \| "local" \| "review" \| "blocked"` | yes | accepted: local, generate, review, reuse, blocked |
| requestFingerprint | `string` | yes |  |
| fingerprint | `string` | yes |  |
| dependsOn | `readonly string[]` | yes |  |
| reason | `string` | yes |  |
| inflight | `boolean` | yes |  |
| pieceIds | `readonly string[]` | yes |  |

### RebuildPreview

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes |  |
| projectId | `string` | yes |  |
| baseRevisionId | `string` | yes |  |
| planFingerprint | `string` | yes |  |
| selection | `RebuildSelection` | yes |  |
| changedInputs | `readonly { readonly path: string; readonly before: string \| null; readonly after: string \| null; }[]` | yes |  |
| work | `readonly RebuildWork[]` | yes |  |
| retained | `readonly { readonly slot: string; readonly outputId: string; readonly assetId: string; readonly state: "ready" \| "outdated" \| "review"; }[]` | yes |  |
| providedReuseRequired | `readonly string[]` | yes |  |
| costs | `CostEstimate` | yes |  |
| wholeRequestNotice | `string \| null` | yes |  |
| warnings | `readonly string[]` | yes |  |
| review | `object union (inline)` | no | inline shape at `packages/app/src/slices/rebuild/model.ts:45` |

### RebuildAdmission

| Field | Type | Required |
|---|---|---|
| revisionId | `string` | yes |
| admissionId | `string` | yes |
| workIds | `readonly string[]` | yes |
| replayed | `boolean` | yes |

### RebuildResult

| Field | Type | Required | Notes |
|---|---|---|---|
| ok | `true \| false` | yes |  |
| value | `T` | no | not in every variant |
| reason | `\| "no-project" \| "conflict" \| "stale-preview" \| "invalid-selection" \| "review-required" \| "cost-ack-required" \| "readiness"` | no | accepted: conflict, no-project, stale-preview, invalid-selection, review-required, cost-ack-required, readiness; not in every variant |
| fields | `readonly FieldError[]` | no | not in every variant |

Union of 2 object variants; a field present in only some variants is `Required: no`.

### ExecutionSnapshot

| Field | Type | Required | Notes |
|---|---|---|---|
| version | `1` | yes |  |
| submissions | `{ key: string; submit: boolean; uncertain: boolean; }[]` | yes |  |
| catalogue | `Catalogue` | yes |  |
| recipes | `object[] (inline)` | yes | inline shape at `packages/app/src/slices/rebuild/preview-plan.ts:29` |
| dispositions | `{ key: string; disposition: string; }[]` | yes |  |
| assets | `{ id: string; path: string; available: boolean; }[]` | yes |  |
| reviews | `{ key: string; fingerprint: string; }[]` | yes |  |
| anchors | `Record<string, string>` | yes |  |
| ordinals | `Record<string, number>` | yes |  |

### PreviewPlan

| Field | Type | Required |
|---|---|---|
| preview | `RebuildPreview` | yes |
| execution | `ExecutionSnapshot` | yes |

### AudioRecipes

| Field | Type | Required |
|---|---|---|
| recipes | `readonly ResolvedWorkRecipe[]` | yes |
| mediaFingerprint | `string \| null` | yes |
| timeline | `FingerprintValue` | yes |
| keys | `readonly string[]` | yes |
| sections | `readonly ScriptSection[]` | no |
| levels | `readonly ResolvedWorkRecipe[]` | yes |
| cards | `readonly ResolvedWorkRecipe[]` | no |

### ResolvedRevisionInputs

| Field | Type | Required |
|---|---|---|
| articleMarkdown | `string \| null` | yes |
| researchNotes | `string \| null` | yes |
| research | `\| { readonly outline: readonly string[]; readonly findings: readonly Finding[] }` | no |
| articleContinuation | `string` | no |

### ScriptCheck

| Field | Type | Required |
|---|---|---|
| speakers | `readonly { readonly id: string; readonly name: string }[]` | yes |
| attribute | `boolean` | yes |

### RecipeInput

| Field | Type | Required | Notes |
|---|---|---|---|
| kind | `"llm" \| "tts" \| "image" \| "provided" \| "local" \| "deferred"` | yes | accepted: llm, tts, image, provided, local, deferred |
| version | `1` | yes |  |
| provider | `string` | no | only when kind is llm or tts or image |
| model | `string` | no | only when kind is llm or tts or image |
| thinking | `ThinkingMode \| null \| ThinkingMode` | no | accepted: off, low, medium, high, xhigh, max, ultra; only when kind is llm or image |
| thinkingConfig | `ThinkingConfig \| null` | no | only when kind is llm |
| messages | `readonly Message[]` | no | only when kind is llm |
| documents | `readonly LlmDocument[]` | no | only when kind is llm |
| webSearch | `boolean` | no | only when kind is llm |
| preparation | `PreparationSource` | no | only when kind is llm |
| script | `ScriptCheck` | no | only when kind is llm |
| describe | `DescribeSource` | no | only when kind is llm |
| voice | `string` | no | only when kind is tts |
| text | `string` | no | only when kind is tts |
| spokenText | `string` | no | only when kind is tts |
| logicalKey | `string` | no | only when kind is tts |
| logicalText | `string` | no | only when kind is tts |
| segment | `"body" \| "intro" \| "outro"` | no | accepted: body, intro, outro; only when kind is tts |
| pronunciation | `null` | no | only when kind is tts |
| wholeRequest | `boolean` | no | only when kind is tts |
| speaker | `string` | no | only when kind is tts |
| turn | `number` | no | only when kind is tts |
| dialogue | `readonly DialogueLine[]` | no | only when kind is tts |
| prompt | `string` | no | only when kind is image |
| aspect | `RunConfig["format"]` | no | accepted: 16:9, 9:16, 1:1; only when kind is image |
| animate | `{ readonly image: string; readonly seconds: number }` | no | only when kind is image |
| reference | `\| { readonly fingerprint: string; readonly assetId: string \| null }` | no | only when kind is image |
| cast | `readonly CastInput[]` | no | only when kind is image |
| assetId | `string \| null` | no | only when kind is provided |
| semantic | `FingerprintValue` | no | only when kind is provided |
| operation | `(typeof localOperations)[number] \| (typeof deferredOperations)[number]` | no | accepted: export-wav, wav2vec2-en-a19f851-v2-omissions, wav2vec2-xlsr56-2d48b01-v1, sentence-timing-v1, automatic-cues-v1, manual-cues-v1, subtitle-files-v1, render-video, render-selected-video, provided-notes, provided-article, manual-article, entry-text, concat-narration, narration-files-v1, render-document, youtube-description-v1, shorts-pick-v1, short-render-v1, review-v1, concat-turns-v1, voice-captions-v1, audio-files-v1, level-narration-v1, figure-card-v1, article, shorts, animate, narration-preparation, narration-description, research-synthesis, entry:intro:text, entry:outro:text, thumbnail-prompt, thumbnail-image, body-narration, intro-narration, outro-narration, resolve-revision-recipe, script-attribution, image-scenes, image-scene, thumbnail-scenes, image-appearance; only when kind is local or deferred |
| values | `FingerprintValue` | no | only when kind is local |
| template | `FingerprintValue` | no | only when kind is deferred |

Union of 6 object variants; a field present in only some variants is `Required: no`.

### ResolvedWorkRecipe

| Field | Type | Required | Notes |
|---|---|---|---|
| refusal | `string` | no |  |
| unfoldsImages | `\| { readonly count: number; readonly provider: string; readonly model: string }` | no |  |
| input | `RecipeInput` | yes |  |
| logicalFingerprint | `string` | yes |  |
| deferred | `boolean` | yes |  |
| key | `string` | yes |  |
| stage | `StageKind` | yes | accepted: research, article, audio, images, thumbnail, video, document |
| kind | `"provider" \| "local" \| "provided"` | yes | accepted: local, provided, provider |
| requestFingerprint | `string` | yes |  |
| fingerprint | `string` | yes |  |
| dependsOn | `readonly string[]` | yes |  |
| unresolved | `boolean` | yes |  |

### RecipeContext

| Field | Type | Required |
|---|---|---|
| config | `RunConfig` | yes |
| content | `RevisionContent` | yes |
| manifest | `RevisionManifest` | yes |
| resolved | `ResolvedRevisionInputs` | yes |
| catalogue | `Catalogue` | no |

### RecipeProviderChoice

| Field | Type | Required | Notes |
|---|---|---|---|
| provider | `string` | yes |  |
| model | `string` | yes |  |
| family | `ProviderFamily` | yes | accepted: llm, tts, image |
| voice | `string` | no |  |
| thinking | `ThinkingMode \| null` | no | accepted: off, low, medium, high, xhigh, max, ultra |

### RecoveryRequest

| Field | Type | Required | Notes |
|---|---|---|---|
| baseRevisionId | `string` | yes |  |
| idempotencyKey | `string` | yes |  |
| action | `object union (inline)` | yes | inline shape at `packages/app/src/slices/rebuild/recovery-model.ts:16` |

### RecoveryResult

| Field | Type | Required | Notes |
|---|---|---|---|
| ok | `true \| false` | yes |  |
| value | `RebuildAdmission & { warnings: readonly string[]; }` | no | not in every variant |
| reason | `string` | no | accepted: running, conflict, no-project, no-revision, idempotency-conflict, invalid-edit, stale-preview, invalid-selection, review-required, cost-ack-required, readiness, accepted-job, control-changed; not in every variant |
| fields | `readonly { field: string; message: string; }[]` | no | not in every variant |
| intentRevisionId | `string` | no | not in every variant |
| currentRevisionId | `string \| null` | no | not in every variant |

Union of 2 object variants; a field present in only some variants is `Required: no`.

### RecoveryRecord

| Field | Type | Required |
|---|---|---|
| pending | `true` | yes |
| authority | `string` | yes |
| edit | `RevisionEdit \| null` | yes |
| intentRevisionId | `string \| null` | yes |

### PublicationTarget

| Field | Type | Required |
|---|---|---|
| revisionId | `string` | yes |
| current | `boolean` | yes |
| selected | `boolean` | yes |

### WorkTransition

| Field | Type | Required |
|---|---|---|
| projectId | `string` | yes |
| baseRevisionId | `string` | yes |
| revisionId | `string` | yes |
| fingerprints | `Record<string, string>` | yes |
| baseFingerprints | `Record<string, string>` | no |
| logicalKeys | `Record<string, string>` | no |
| recipes | `readonly ResolvedWorkRecipe[]` | no |
| stages | `Record<string, StageKind>` | no |

### WorkPiece

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes |  |
| workId | `string` | yes |  |
| key | `string` | yes |  |
| requestFingerprint | `string` | yes |  |
| fingerprint | `string` | yes |  |
| input | `RecipeInput` | yes |  |
| logicalFingerprint | `string` | no |  |
| continuation | `string \| null` | yes |  |
| generationToken | `string \| null` | yes |  |
| state | `"pending" \| "running" \| "done" \| "failed" \| "held"` | yes | accepted: done, pending, running, failed, held |
| dispatchState | `"held" \| "allowed" \| "draining"` | yes | accepted: held, allowed, draining |
| submittedAt | `string \| null` | yes |  |

### ProviderChanges

| Field | Type | Required |
|---|---|---|
| chunking | `Chunking` | no |
| llm | `ProviderChoice` | no |
| audio | `VoiceChoice` | no |
| images | `ProviderChoice` | no |

### RevisionControlInput

| Field | Type | Required |
|---|---|---|
| baseRevisionId | `string` | yes |
| idempotencyKey | `string` | yes |

### CheckpointStatus

| Field | Type | Required |
|---|---|---|
| revisionId | `string` | yes |
| checkpoints | `readonly (CheckpointRow & { readonly currentFingerprint: string; readonly dependents: readonly StageKind[]; readonly workKeys: readonly string[]; })[]` | yes |

### CheckpointRow

| Field | Type | Required | Notes |
|---|---|---|---|
| projectId | `string` | yes |  |
| revisionId | `string` | yes |  |
| checkpointId | `CheckpointId` | yes |  |
| stage | `CheckpointStage` | yes | accepted: audio, images, video |
| workId | `string` | yes |  |
| fingerprint | `string` | yes |  |
| state | `CheckpointState` | yes | accepted: canceled, configured, pending-review, held, released, satisfied, invalidated |
| createdAt | `string` | yes |  |
| approvedAt | `string \| null` | yes |  |

### CheckpointSetInput

| Field | Type | Required | Notes |
|---|---|---|---|
| projectId | `string` | yes |  |
| revisionId | `string` | yes |  |
| checkpoints | `object[] (inline)` | yes | inline shape at `packages/app/src/slices/checkpoints/model.ts:26` |
| createdAt | `string` | yes |  |

### CheckpointApprovalInput

| Field | Type | Required |
|---|---|---|
| projectId | `string` | yes |
| revisionId | `string` | yes |
| checkpointId | `CheckpointId` | yes |
| fingerprint | `string` | yes |
| idempotencyKey | `string` | yes |
| approvedAt | `string` | yes |

### CheckpointResult

| Field | Type | Required | Notes |
|---|---|---|---|
| ok | `true \| false` | yes |  |
| value | `T` | no |  |
| reason | `CheckpointRefusal` | no | accepted: duplicate, not-found, conflict, invalid-input; not in every variant |

Union of 2 object variants; a field present in only some variants is `Required: no`.

### CheckpointDecision

| Field | Type | Required | Notes |
|---|---|---|---|
| kind | `"held" \| "eligible" \| "refused"` | yes | accepted: held, eligible, refused |
| checkpointIds | `readonly CheckpointId[]` | no | only when kind is held |
| reason | `CheckpointRefusal` | no | accepted: duplicate, not-found, conflict, invalid-input; only when kind is refused |

Union of 3 object variants; a field present in only some variants is `Required: no`.

### CheckpointClosureSettlement

| Field | Type | Required |
|---|---|---|
| projectId | `string` | yes |
| revisionId | `string` | yes |
| checkpointId | `string` | yes |
| workKeys | `readonly string[]` | yes |

### DraftSummary

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| title | `string` | yes |
| version | `number` | yes |
| updatedAt | `string` | yes |
| readable | `boolean` | yes |

### PlayDraft

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| version | `number` | yes |
| createdAt | `string` | yes |
| updatedAt | `string` | yes |
| document | `PlayDraftDocument` | yes |

### DraftAttachment

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes |  |
| kind | `typeof draftAttachmentKinds[number]` | yes | accepted: audio, images, thumbnail, reference |
| name | `string` | yes |  |
| state | `"pending" \| "copying" \| "ready" \| "reattach"` | yes | accepted: pending, copying, ready, reattach |
| stagedFileId | `string \| null` | yes |  |
| bytes | `number` | yes |  |
| error | `string \| null` | yes |  |

### ResolvedPlayRun

| Field | Type | Required |
|---|---|---|
| draft | `RunDraft` | yes |
| rendered | `Record<string, string>` | yes |
| templates | `Record<string, string>` | yes |

### PlayReview

| Field | Type | Required |
|---|---|---|
| checkpointSet | `readonly ReviewedCheckpoint[]` | no |
| id | `string` | yes |
| draftId | `string` | yes |
| draftVersion | `number` | yes |
| fingerprint | `string` | yes |
| runs | `readonly ResolvedPlayRun[]` | yes |
| estimates | `readonly CostEstimate[]` | yes |

### PlayStartResult

| Field | Type | Required |
|---|---|---|
| checkpointSet | `\| readonly (CheckpointRow & { readonly reviewedFingerprint: string })[]` | no |
| requestId | `string` | yes |
| projectIds | `readonly string[]` | yes |
| queue | `readonly QueueEntry[]` | yes |
| replayed | `boolean` | yes |

### DraftView

| Field | Type | Required |
|---|---|---|
| draft | `PlayDraft` | yes |
| attachments | `readonly DraftAttachment[]` | yes |
| review | `PlayReview \| null` | yes |
| pendingStart | `{ readonly reviewId: string; readonly draftVersion: number } \| null` | yes |
| start | `PlayStartResult \| null` | yes |

### DraftSaveInput

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| baseVersion | `number` | yes |
| mutationId | `string` | yes |
| document | `PlayDraftDocument` | yes |

### PlayStartInput

| Field | Type | Required |
|---|---|---|
| draftId | `string` | yes |
| baseVersion | `number` | yes |
| reviewId | `string` | yes |

### DraftResult

| Field | Type | Required | Notes |
|---|---|---|---|
| ok | `true \| false` | yes |  |
| value | `T` | no | not in every variant |
| reason | `\| "not-found" \| "invalid-draft" \| "conflict" \| "invalid-edit" \| "pending-start" \| "already-started" \| "stale-review" \| "readiness"` | no | accepted: not-found, conflict, invalid-edit, readiness, invalid-draft, pending-start, already-started, stale-review; not in every variant |
| currentVersion | `number \| null` | no | not in every variant |
| fields | `readonly FieldError[]` | no | not in every variant |
| reviewId | `string` | no | not in every variant |

Union of 2 object variants; a field present in only some variants is `Required: no`.

### ResolvedPlayReview

| Field | Type | Required |
|---|---|---|
| checkpointSet | `readonly ReviewedCheckpoint[]` | no |
| runs | `readonly ResolvedPlayRun[]` | yes |
| estimates | `readonly CostEstimate[]` | yes |
| fingerprint | `string` | yes |
| catalogue | `Catalogue` | yes |
| attachmentIdentity | `readonly { readonly id: string; readonly stagedFileId: string; readonly bytes: number; }[]` | yes |
| font | `ResolvedFont \| null` | yes |

### ReviewedCheckpoint

| Field | Type | Required | Notes |
|---|---|---|---|
| runIndex | `number` | yes |  |
| checkpointId | `string` | yes |  |
| stage | `CheckpointStage` | yes | accepted: audio, images, video |
| fingerprint | `string` | yes |  |
| workKeys | `readonly string[]` | yes |  |
| dependents | `readonly StageKind[]` | yes |  |

### DraftRow

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes |  |
| schema_version | `number` | yes |  |
| version | `number` | yes |  |
| title | `string` | yes |  |
| document_json | `string` | yes |  |
| creation_hash | `string` | yes |  |
| save_mutation_id | `string \| null` | yes |  |
| save_request_hash | `string \| null` | yes |  |
| created_at | `string` | yes |  |
| updated_at | `string` | yes |  |
| state | `"started" \| "starting" \| "active"` | yes | accepted: started, starting, active |
| review_id | `string \| null` | yes |  |
| review_json | `string \| null` | yes |  |
| review_fingerprint | `string \| null` | yes |  |
| start_id | `string \| null` | yes |  |

### AttachmentRow

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes |  |
| draft_id | `string` | yes |  |
| staged_file_id | `string \| null` | yes |  |
| kind | `"audio" \| "images" \| "thumbnail" \| "reference"` | yes | accepted: audio, images, thumbnail, reference |
| original_filename | `string` | yes |  |
| status | `"pending" \| "ready" \| "reattach"` | yes | accepted: pending, ready, reattach |
| error | `string \| null` | yes |  |

### AttachmentRef

| Field | Type | Required | Notes |
|---|---|---|---|
| attachmentId | `string` | yes |  |
| name | `string` | yes |  |
| kind | `(typeof draftAttachmentKinds)[number]` | yes | accepted: audio, images, thumbnail, reference |

### PlayDraftForm

| Field | Type | Required | Notes |
|---|---|---|---|
| title | `string` | yes |  |
| format | `"16:9" \| "9:16" \| "1:1"` | yes | accepted: 16:9, 9:16, 1:1 |
| sources | `object (inline)` | yes | inline shape at `packages/app/src/slices/play-drafts/schema.ts:36` |
| llm | `{ provider: string; model: string; thinking?: "off" \| "low" \| "medium" \| "high" \| "xhigh" \| "max" \| "ultra" \| undefined; }` | yes |  |
| audio | `object (inline)` | yes | inline shape at `packages/app/src/slices/play-drafts/schema.ts:52` |
| images | `{ provider: string; model: string; thinking?: "off" \| "low" \| "medium" \| "high" \| "xhigh" \| "max" \| "ultra" \| undefined; }` | yes |  |
| articlePrompt | `string` | yes |  |
| imagePrompts | `readonly Readonly<{ name: string; number: string; }>[]` | yes |  |
| thumbnailPrompt | `string` | yes |  |
| intro | `string` | yes |  |
| outro | `string` | yes |  |
| chunking | `{ mode: "characters" \| "paragraph" \| "words" \| "whole"; words: string; characters: string; }` | yes |  |
| subtitles | `object (inline)` | yes | inline shape at `packages/app/src/slices/play-drafts/schema.ts:162` |
| imageSeconds | `string` | yes |  |
| edgeSilenceSeconds | `string` | yes |  |
| zoomPercent | `string` | yes |  |
| motionStyle | `"zoom" \| "pan" \| "mixed" \| "still"` | yes | accepted: zoom, pan, mixed, still |
| values | `Record<string, string>` | yes |  |
| provided | `object (inline)` | yes | inline shape at `packages/app/src/slices/play-drafts/schema.ts:203` |
| checkpoints | `readonly ("audio" \| "images" \| "video")[]` | no |  |
| document | `object union (inline)` | no | inline shape at `packages/app/src/slices/play-drafts/schema.ts:50` |
| reference | `{ source: "off" \| "prompt" \| "provide"; prompt: string; thumbnail: boolean; }` | no |  |
| narrationPrompt | `string` | no |  |
| thumbnailCount | `1 \| 3` | no |  |
| loudness | `{ enabled: boolean; videoLufs?: number \| undefined; audioFilesLufs?: number \| undefined; }` | no |  |
| sentencePause | `string` | no |  |
| paragraphPause | `string` | no |  |
| youtubeDescription | `boolean` | no |  |
| showFigures | `boolean` | no |  |
| descriptionPrompt | `string` | no |  |
| language | `string` | no | accepted: id, en, es, de, fr, it, pt, nl, ca, pl, cs, ro, sv, da, nb, fi, hu, tr, vi, el, ru, uk, ar, he, hi, th, ja, zh, ko |
| shorts | `object union (inline)` | no | inline shape at `packages/app/src/slices/play-drafts/schema.ts:105` |
| reviews | `object union (inline)` | no | inline shape at `packages/app/src/slices/play-drafts/schema.ts:126` |
| imageScale | `{ every: "minutes" \| "hour"; value: string; }` | no |  |
| imageScenes | `boolean` | no |  |
| silenceGapSeconds | `string` | no |  |
| videoEdit | `object union (inline)` | no | inline shape at `packages/app/src/slices/play-drafts/schema.ts:183` |
| useBrandKit | `boolean` | no |  |
| voices | `object union (inline)` | no | inline shape at `packages/app/src/slices/play-drafts/schema.ts:189` |
| ambientBed | `{ source: "none" \| "rain" \| "fire" \| "wind" \| "upload"; level: string; fadeIn: string; tail: string; }` | no |  |

### PlayDraftDocument

| Field | Type | Required | Notes |
|---|---|---|---|
| schemaVersion | `1` | yes |  |
| form | `PlayDraftForm` | yes |  |
| section | `"content" \| "outputs" \| "review" \| "style"` | yes | accepted: content, outputs, review, style |
| variants | `readonly Readonly<{ id: string; title: string; values: Readonly<Record<string, string>>; }>[]` | yes |  |
| expectedWords | `string` | yes |  |
| previewText | `string` | yes |  |
| fontUpload | `Readonly<{ operationId: string; name: string; }> \| null` | yes |  |
| librarySnapshot | `object union (inline)` | no | inline shape at `packages/app/src/slices/play-drafts/schema.ts:227` |
| templateSource | `{ id: string; version: number; }` | no |  |
| channelId | `string` | no |  |
| queue | `boolean` | no | Several videos from one Start: absent or `true` queues them one after another, `false` starts them together (`packages/app/src/slices/play-drafts/schema.ts:240`) |

### StoredStartReceipt

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| draftId | `string` | yes |
| draftVersion | `number` | yes |
| requestHash | `string` | yes |
| result | `PlayStartResult` | yes |

### ProjectTemplate

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| name | `string` | yes |
| version | `number` | yes |
| createdAt | `string` | yes |
| updatedAt | `string` | yes |
| document | `PlayDraftDocument` | yes |

### TemplateSummary

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| version | `number` | yes |
| name | `string` | yes |
| updatedAt | `string` | yes |
| createdAt | `string` | yes |

### TemplateResult

| Field | Type | Required | Notes |
|---|---|---|---|
| ok | `true \| false` | yes |  |
| value | `T` | no | not in every variant |
| reason | `\| "not-found" \| "conflict" \| "invalid-input" \| "missing-prompt" \| "referenced-by-schedule"` | no | accepted: not-found, conflict, invalid-input, missing-prompt, referenced-by-schedule; not in every variant |

Union of 2 object variants; a field present in only some variants is `Required: no`.

### LibraryVersion

| Field | Type | Required | Notes |
|---|---|---|---|
| version | `number` | yes |  |
| name | `string` | yes |  |
| body | `string` | yes |  |
| kind | `string` | yes |  |
| mode | `EntryMode \| null` | yes | accepted: llm, text |
| author | `string` | yes |  |
| restoredFrom | `number \| null` | yes |  |
| createdAt | `string` | yes |  |

### Prompt

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes |  |
| kind | `PromptKind` | yes | accepted: image, article, thumbnail, description, narration, shorts, script, review |
| name | `string` | yes |  |
| body | `string` | yes |  |
| slots | `readonly string[]` | yes |  |
| updatedAt | `string` | yes |  |

### PromptDraft

| Field | Type | Required | Notes |
|---|---|---|---|
| kind | `PromptKind` | yes | accepted: image, article, thumbnail, description, narration, shorts, script, review |
| name | `string` | yes |  |
| body | `string` | yes |  |

### Entry

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes |  |
| category | `EntryCategory` | yes | accepted: intro, outro |
| mode | `EntryMode` | yes | accepted: llm, text |
| name | `string` | yes |  |
| body | `string` | yes |  |
| slots | `readonly string[]` | yes |  |
| updatedAt | `string` | yes |  |

### EntryDraft

| Field | Type | Required | Notes |
|---|---|---|---|
| category | `EntryCategory` | yes | accepted: intro, outro |
| mode | `EntryMode` | yes | accepted: llm, text |
| name | `string` | yes |  |
| body | `string` | yes |  |

### LibraryRef

| Field | Type | Required | Notes |
|---|---|---|---|
| item | `"prompt" \| "entry"` | yes | accepted: prompt, entry |
| kind | `PromptKind` | no | accepted: image, article, thumbnail, description, narration, shorts, script, review; only when item is prompt |
| name | `string` | yes |  |
| category | `EntryCategory` | no | accepted: intro, outro; only when item is entry |

Union of 2 object variants; a field present in only some variants is `Required: no`.

### UsedByTemplate

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| name | `string` | yes |

### UsedBySchedule

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| name | `string` | yes |
| status | `string` | yes |

### UsedByProject

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| title | `string` | yes |
| revisions | `number` | yes |
| totalRevisions | `number` | yes |
| current | `boolean` | yes |

### UsedBy

| Field | Type | Required |
|---|---|---|
| templates | `readonly UsedByTemplate[]` | yes |
| schedules | `readonly UsedBySchedule[]` | yes |
| projects | `readonly UsedByProject[]` | yes |

### NarrationAlias

| Field | Type | Required |
|---|---|---|
| written | `string` | yes |
| spoken | `string` | yes |
| wholeWord | `boolean` | yes |
| caseSensitive | `boolean` | yes |

### AliasMatch

| Field | Type | Required |
|---|---|---|
| start | `number` | yes |
| end | `number` | yes |
| spoken | `string` | yes |

### CustomDocumentTheme

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| name | `string` | yes |
| values | `DocumentTheme` | yes |

### DocumentSettings

| Field | Type | Required | Notes |
|---|---|---|---|
| theme | `DocumentThemeName` | yes | accepted: plain, dicemaster |
| custom | `CustomDocumentTheme` | no |  |

### SavedDocumentTheme

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| name | `string` | yes |
| values | `DocumentTheme` | yes |
| updatedAt | `string` | yes |

### RGB

| Field | Type | Required |
|---|---|---|
| r | `number` | yes |
| g | `number` | yes |
| b | `number` | yes |

### FontFace

| Field | Type | Required | Notes |
|---|---|---|---|
| family | `FontFamily` | yes | accepted: Cinzel, Literata, times, helvetica, courier |
| style | `FontStyle` | yes | accepted: medium, normal, bold, black, italic, bolditalic |
| letterSpacing | `number` | yes |  |

### DocumentTheme

| Field | Type | Required | Notes |
|---|---|---|---|
| page | `{ readonly format: "a4" \| "letter"; readonly margin: number; readonly contentTop: number; }` | yes |  |
| background | `{ readonly image: "parchment" \| null; readonly color: string; }` | yes |  |
| colors | `{ readonly heading: string; readonly text: string; readonly muted: string; readonly faint: string; }` | yes |  |
| fonts | `object (inline)` | yes | inline shape at `packages/app/src/slices/document/theme.ts:61` |
| sizes | `object (inline)` | yes | inline shape at `packages/app/src/slices/document/theme.ts:73` |
| spacing | `object (inline)` | yes | inline shape at `packages/app/src/slices/document/theme.ts:86` |
| dropCap | `object (inline)` | yes | inline shape at `packages/app/src/slices/document/theme.ts:101` |
| titlePage | `object (inline)` | yes | inline shape at `packages/app/src/slices/document/theme.ts:114` |
| contents | `object (inline)` | yes | inline shape at `packages/app/src/slices/document/theme.ts:130` |
| header | `{ readonly enabled: boolean; readonly top: number; readonly maxTitleCharacters: number; }` | yes |  |
| footer | `{ readonly enabled: boolean; readonly bottom: number; readonly reserve: number; readonly text: string; }` | yes |  |
| brand | `{ readonly name: string \| null; readonly url: string \| null; readonly tagline: string \| null; readonly linkLabel: string \| null; }` | yes |  |
| metadata | `{ readonly author: string; readonly subject: string; readonly keywords: string; readonly creator: string; }` | yes |  |
| sources | `object (inline)` | yes | inline shape at `packages/app/src/slices/document/theme.ts:168` |
| endPage | `object (inline)` | yes | inline shape at `packages/app/src/slices/document/theme.ts:177` |

### DocumentThemeOverrides

| Field | Type | Required | Notes |
|---|---|---|---|
| page | `Partial<{ readonly format: "a4" \| "letter"; readonly margin: number; readonly contentTop: number; }>` | no |  |
| background | `Partial<{ readonly image: "parchment" \| null; readonly color: string; }>` | no |  |
| colors | `Partial<{ readonly heading: string; readonly text: string; readonly muted: string; readonly faint: string; }>` | no |  |
| fonts | `object (inline)` | no | inline shape at `packages/app/src/slices/document/theme.ts:61` |
| sizes | `object (inline)` | no | inline shape at `packages/app/src/slices/document/theme.ts:73` |
| spacing | `object (inline)` | no | inline shape at `packages/app/src/slices/document/theme.ts:86` |
| dropCap | `object (inline)` | no | inline shape at `packages/app/src/slices/document/theme.ts:101` |
| titlePage | `object (inline)` | no | inline shape at `packages/app/src/slices/document/theme.ts:114` |
| contents | `object (inline)` | no | inline shape at `packages/app/src/slices/document/theme.ts:130` |
| header | `Partial<{ readonly enabled: boolean; readonly top: number; readonly maxTitleCharacters: number; }>` | no |  |
| footer | `Partial<{ readonly enabled: boolean; readonly bottom: number; readonly reserve: number; readonly text: string; }>` | no |  |
| brand | `Partial<{ readonly name: string \| null; readonly url: string \| null; readonly tagline: string \| null; readonly linkLabel: string \| null; }>` | no |  |
| metadata | `Partial<{ readonly author: string; readonly subject: string; readonly keywords: string; readonly creator: string; }>` | no |  |
| sources | `object (inline)` | no | inline shape at `packages/app/src/slices/document/theme.ts:168` |
| endPage | `object (inline)` | no | inline shape at `packages/app/src/slices/document/theme.ts:177` |

### BrandKit

| Field | Type | Required |
|---|---|---|
| captionFontId | `string` | no |
| captionColor | `string` | no |
| captionOutlineColor | `string` | no |
| titleFontId | `string` | no |
| titleColor | `string` | no |
| intro | `string` | no |
| outro | `string` | no |
| endScreenText | `string` | no |
| documentTheme | `string` | no |
| ambientBed | `ChannelAmbientBed` | no |
| language | `string` | no |
| links | `readonly ChannelLink[]` | no |

### Channel

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes |  |
| name | `string` | yes |  |
| isDefault | `boolean` | yes |  |
| brand | `BrandKit` | yes |  |
| seriesBrief | `string` | yes |  |
| aiDisclosure | `AiDisclosureSetting` | yes | accepted: auto, yes, no |
| version | `number` | yes |  |
| createdAt | `string` | yes |  |
| updatedAt | `string` | yes |  |

### ChannelSummary

| Field | Type | Required | Notes |
|---|---|---|---|
| templates | `number` | yes |  |
| cast | `number` | yes |  |
| id | `string` | yes |  |
| name | `string` | yes |  |
| isDefault | `boolean` | yes |  |
| brand | `BrandKit` | yes |  |
| seriesBrief | `string` | yes |  |
| aiDisclosure | `AiDisclosureSetting` | yes | accepted: auto, yes, no |
| version | `number` | yes |  |
| createdAt | `string` | yes |  |
| updatedAt | `string` | yes |  |

### CastImage

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes |  |
| source | `"upload" \| "generate"` | yes | accepted: upload, generate |
| prompt | `string \| null` | yes |  |
| state | `"ready" \| "generating" \| "failed"` | yes | accepted: failed, ready, generating |
| error | `string \| null` | yes |  |
| sha256 | `string \| null` | yes |  |
| createdAt | `string` | yes |  |

### CastVoice

| Field | Type | Required |
|---|---|---|
| provider | `string` | yes |
| model | `string` | yes |
| voice | `string` | yes |
| pace | `number` | no |
| pronunciations | `string` | no |

### CastMember

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes |  |
| channelId | `string` | yes |  |
| kind | `CastKind` | yes | accepted: object, character, creature, place |
| name | `string` | yes |  |
| aliases | `readonly string[]` | yes |  |
| description | `string` | yes |  |
| voice | `CastVoice` | no |  |
| host | `boolean` | no |  |
| version | `number` | yes |  |
| images | `readonly CastImage[]` | yes |  |
| createdAt | `string` | yes |  |
| updatedAt | `string` | yes |  |

### CastSnapshot

| Field | Type | Required |
|---|---|---|
| name | `string` | yes |
| aliases | `readonly string[]` | yes |
| description | `string` | yes |
| images | `readonly string[]` | yes |

### ChannelResult

| Field | Type | Required | Notes |
|---|---|---|---|
| ok | `true \| false` | yes |  |
| value | `T` | no | not in every variant |
| reason | `\| "not-found" \| "conflict" \| "invalid-input" \| "default-channel" \| "has-templates" \| "not-an-image" \| "too-many-images" \| "no-image-provider"` | no | accepted: not-found, conflict, invalid-input, default-channel, has-templates, not-an-image, too-many-images, no-image-provider; not in every variant |
| message | `string` | no | not in every variant |

Union of 2 object variants; a field present in only some variants is `Required: no`.

### ChannelVideo

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| title | `string` | yes |
| createdAt | `string` | yes |

### VideoResult

| Field | Type | Required | Notes |
|---|---|---|---|
| ok | `true \| false` | yes |  |
| value | `T` | no | not in every variant |
| reason | `"not-found" \| "invalid-input"` | no | accepted: not-found, invalid-input; not in every variant |
| message | `string` | no | not in every variant |

Union of 2 object variants; a field present in only some variants is `Required: no`.

### EpisodeMemory

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes |  |
| channelId | `string` | yes |  |
| projectId | `string` | yes |  |
| title | `string` | yes |  |
| summary | `string` | yes |  |
| cast | `readonly string[]` | yes |  |
| source | `"generated" \| "edited"` | yes | accepted: generated, edited |
| createdAt | `string` | yes |  |
| updatedAt | `string` | yes |  |

### EarlierEpisode

| Field | Type | Required |
|---|---|---|
| title | `string` | yes |
| summary | `string` | yes |

### EpisodeResult

| Field | Type | Required | Notes |
|---|---|---|---|
| ok | `true \| false` | yes |  |
| value | `T` | no | not in every variant |
| reason | `"not-found" \| "invalid-input"` | no | accepted: not-found, invalid-input; not in every variant |
| message | `string` | no | not in every variant |

Union of 2 object variants; a field present in only some variants is `Required: no`.

### ChannelEpisodes

| Field | Type | Required |
|---|---|---|
| enabled | `boolean` | yes |
| memories | `readonly EpisodeMemory[]` | yes |

### Cadence

| Field | Type | Required | Notes |
|---|---|---|---|
| kind | `"once" \| "daily" \| "weekly"` | yes | accepted: once, daily, weekly |
| at | `string` | no | only when kind is once |
| time | `string` | no | only when kind is daily or weekly |
| days | `readonly number[]` | no | only when kind is weekly |

Union of 3 object variants; a field present in only some variants is `Required: no`.

### ScheduleResult

| Field | Type | Required | Notes |
|---|---|---|---|
| ok | `true \| false` | yes |  |
| value | `T` | no | not in every variant |
| reason | `string` | no | accepted: not-found, conflict, invalid-input, readiness, cancel-required, missing-template, unsupported-media, not-due, spend-limit, queue-full, topic-not-found, busy, invalid-topics; not in every variant |
| message | `string` | no | not in every variant |

Union of 2 object variants; a field present in only some variants is `Required: no`.

### ClaimedScheduleRun

| Field | Type | Required |
|---|---|---|
| run | `ScheduleRun` | yes |
| schedule | `ScheduleSummary` | yes |

### TopicGeneration

| Field | Type | Required | Notes |
|---|---|---|---|
| mode | `"off" \| "queue" \| "hold"` | yes | accepted: off, queue, hold |
| keepAtLeast | `number` | yes |  |
| llm | `Readonly<{ provider: string; model: string; thinking?: "off" \| "low" \| "medium" \| "high" \| "xhigh" \| "max" \| "ultra" \| undefined; }> \| null` | yes |  |

### ScheduleCreate

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes |  |
| name | `string` | yes |  |
| templateId | `string` | yes |  |
| templateVersion | `number` | yes |  |
| cadence | `{ kind: "once"; at: string; } \| { kind: "daily"; time: string; } \| { kind: "weekly"; time: string; days: readonly number[]; }` | yes |  |
| timezone | `string` | yes |  |
| missedPolicy | `"skip" \| "run-once"` | yes | accepted: skip, run-once |
| overlapPolicy | `"skip"` | yes |  |
| spendLimitCents | `number \| null` | yes |  |
| items | `readonly Readonly<{ title: string; values: Readonly<Record<string, string>>; }>[]` | yes |  |
| topicKeyword | `string \| null` | yes |  |
| values | `Record<string, string>` | yes |  |
| brief | `string \| null` | yes |  |
| topicGeneration | `TopicGeneration` | yes |  |

### ScheduleUpdate

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes |  |
| name | `string` | yes |  |
| templateId | `string` | yes |  |
| templateVersion | `number` | yes |  |
| cadence | `{ kind: "once"; at: string; } \| { kind: "daily"; time: string; } \| { kind: "weekly"; time: string; days: readonly number[]; }` | yes |  |
| timezone | `string` | yes |  |
| missedPolicy | `"skip" \| "run-once"` | yes | accepted: skip, run-once |
| overlapPolicy | `"skip"` | yes |  |
| spendLimitCents | `number \| null` | yes |  |
| items | `readonly Readonly<{ title: string; values: Readonly<Record<string, string>>; }>[]` | yes |  |
| topicKeyword | `string \| null` | yes |  |
| values | `Record<string, string>` | yes |  |
| brief | `string \| null` | yes |  |
| topicGeneration | `TopicGeneration` | yes |  |
| baseVersion | `number` | yes |  |
| mutationId | `string` | yes |  |

### ScheduleSummary

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes |  |
| name | `string` | yes |  |
| templateId | `string` | yes |  |
| templateVersion | `number` | yes |  |
| cadence | `{ kind: "once"; at: string; } \| { kind: "daily"; time: string; } \| { kind: "weekly"; time: string; days: readonly number[]; }` | yes |  |
| timezone | `string` | yes |  |
| missedPolicy | `"skip" \| "run-once"` | yes | accepted: skip, run-once |
| overlapPolicy | `"skip"` | yes |  |
| spendLimitCents | `number \| null` | yes |  |
| items | `readonly Readonly<{ title: string; values: Readonly<Record<string, string>>; }>[]` | yes |  |
| topicKeyword | `string \| null` | yes |  |
| values | `Record<string, string>` | yes |  |
| brief | `string \| null` | yes |  |
| topicGeneration | `TopicGeneration` | yes |  |
| topics | `{ held: number; generatingSince: string \| null; generatedAt: string \| null; failedAt: string \| null; error: string \| null; }` | yes |  |
| status | `"canceled" \| "paused" \| "active" \| "completed"` | yes | accepted: canceled, paused, active, completed |
| version | `number` | yes |  |
| nextRunAt | `string \| null` | yes |  |
| createdAt | `string` | yes |  |
| updatedAt | `string` | yes |  |
| deletedAt | `string \| null` | yes |  |

### ScheduleRun

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes |  |
| scheduleId | `string` | yes |  |
| scheduledFor | `string` | yes |  |
| status | `"running" \| "failed" \| "skipped" \| "succeeded"` | yes | accepted: running, failed, skipped, succeeded |
| requestId | `string \| null` | yes |  |
| projectIds | `readonly string[]` | yes |  |
| estimate | `unknown` | yes |  |
| startedAt | `string` | yes |  |
| endedAt | `string \| null` | yes |  |
| error | `string \| null` | yes |  |

### HeldTopic

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| title | `string` | yes |
| values | `Record<string, string>` | yes |
| rank | `number` | yes |
| createdAt | `string` | yes |

### CalendarRun

| Field | Type | Required | Notes |
|---|---|---|---|
| at | `string` | yes |  |
| scheduleId | `string` | yes |  |
| scheduleName | `string` | yes |  |
| scheduleVersion | `number` | yes |  |
| paused | `boolean` | yes |  |
| templateId | `string` | yes |  |
| templateVersion | `number` | yes |  |
| templateName | `string \| null` | yes |  |
| index | `number \| null` | yes |  |
| topic | `string \| null` | yes |  |
| topicSource | `"held" \| "generated" \| "queued" \| "template"` | yes | accepted: held, generated, queued, template |
| renderedTitle | `string \| null` | yes |  |
| prepared | `string \| null` | yes | Project id prepared ahead for this run; schema default null (`packages/app/src/slices/schedules/schema.ts:223`) |

### Calendar

| Field | Type | Required | Notes |
|---|---|---|---|
| from | `string` | yes |  |
| to | `string` | yes |  |
| runs | `readonly CalendarRun[]` | yes |  |
| projects | `object[] (inline)` | yes | inline shape at `packages/app/src/slices/schedules/schema.ts:273` |
| queued | `readonly Readonly<{ projectId: string; title: string; batchId: string; position: number; state: "queued" \| "active"; queuedAt: string; }>[]` | yes |  |

### CliPathStatus

| Field | Type | Required |
|---|---|---|
| configured | `string \| null` | yes |
| command | `string` | yes |

### ProviderDefaults

| Field | Type | Required |
|---|---|---|
| llm | `{ provider: string; model: string; }` | no |
| images | `{ provider: string; model: string; }` | no |

### DetectedCli

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `ProviderId` | yes | accepted: claude-code, codex, gemini, codex-image, openrouter, elevenlabs, openai-tts, cartesia, inworld, system-voice, google-tts, fal, replicate, openai-image, google-image |
| displayName | `string` | yes |  |
| installed | `boolean` | yes |  |
| usable | `boolean` | yes |  |
| version | `string` | no |  |
| issue | `string` | no |  |

### FirstRunStatus

| Field | Type | Required |
|---|---|---|
| firstRun | `boolean` | yes |
| detected | `readonly DetectedCli[]` | yes |
| defaults | `ProviderDefaults` | yes |
| message | `string \| null` | yes |
| detail | `string \| null` | yes |

### HealthCheck

| Field | Type | Required | Notes |
|---|---|---|---|
| label | `string` | yes |  |
| state | `"ok" \| "problem" \| "warning" \| "skipped"` | yes | accepted: skipped, ok, problem, warning |
| detail | `string` | yes |  |

### ProviderHealth

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `ProviderId` | yes | accepted: claude-code, codex, gemini, codex-image, openrouter, elevenlabs, openai-tts, cartesia, inworld, system-voice, google-tts, fal, replicate, openai-image, google-image |
| displayName | `string` | yes |  |
| family | `ProviderFamily` | yes | accepted: llm, tts, image |
| state | `"ok" \| "problem" \| "warning" \| "unused"` | yes | accepted: ok, problem, warning, unused |
| checks | `readonly HealthCheck[]` | yes |  |

### HealthReport

| Field | Type | Required |
|---|---|---|
| checkedAt | `string` | yes |
| providers | `readonly ProviderHealth[]` | yes |

### KeyStatus

| Field | Type | Required | Notes |
|---|---|---|---|
| provider | `ProviderId` | yes | accepted: claude-code, codex, gemini, codex-image, openrouter, elevenlabs, openai-tts, cartesia, inworld, system-voice, google-tts, fal, replicate, openai-image, google-image |
| hasKey | `boolean` | yes |  |
| masked | `string \| null` | yes |  |

### KeyLookup

| Field | Type | Required | Notes |
|---|---|---|---|
| ok | `true \| false` | yes |  |
| key | `string` | no | not in every variant |
| reason | `"key-missing" \| "cli-provider"` | no | accepted: cli-provider, key-missing; not in every variant |

Union of 2 object variants; a field present in only some variants is `Required: no`.

### KeyedProvider

| Field | Type | Required | Notes |
|---|---|---|---|
| auth | `"key"` | yes |  |
| id | `ProviderId` | yes | accepted: claude-code, codex, gemini, codex-image, openrouter, elevenlabs, openai-tts, cartesia, inworld, system-voice, google-tts, fal, replicate, openai-image, google-image |
| family | `ProviderFamily` | yes | accepted: llm, tts, image |
| displayName | `string` | yes |  |

### CliProvider

| Field | Type | Required | Notes |
|---|---|---|---|
| auth | `"cli"` | yes |  |
| binary | `string` | yes |  |
| versionArgs | `readonly string[]` | yes |  |
| id | `ProviderId` | yes | accepted: claude-code, codex, gemini, codex-image, openrouter, elevenlabs, openai-tts, cartesia, inworld, system-voice, google-tts, fal, replicate, openai-image, google-image |
| family | `ProviderFamily` | yes | accepted: llm, tts, image |
| displayName | `string` | yes |  |

### LocalProvider

| Field | Type | Required | Notes |
|---|---|---|---|
| auth | `"local"` | yes |  |
| id | `ProviderId` | yes | accepted: claude-code, codex, gemini, codex-image, openrouter, elevenlabs, openai-tts, cartesia, inworld, system-voice, google-tts, fal, replicate, openai-image, google-image |
| family | `ProviderFamily` | yes | accepted: llm, tts, image |
| displayName | `string` | yes |  |

### Provider

| Field | Type | Required | Notes |
|---|---|---|---|
| auth | `"key" \| "cli" \| "local"` | yes | accepted: key, cli, local |
| id | `ProviderId` | yes | accepted: claude-code, codex, gemini, codex-image, openrouter, elevenlabs, openai-tts, cartesia, inworld, system-voice, google-tts, fal, replicate, openai-image, google-image |
| family | `ProviderFamily` | yes | accepted: llm, tts, image |
| displayName | `string` | yes |  |
| binary | `string` | no | only when auth is cli |
| versionArgs | `readonly string[]` | no | only when auth is cli |

Union of 3 object variants; a field present in only some variants is `Required: no`.

### ProviderStatus

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `ProviderId` | yes | accepted: claude-code, codex, gemini, codex-image, openrouter, elevenlabs, openai-tts, cartesia, inworld, system-voice, google-tts, fal, replicate, openai-image, google-image |
| family | `ProviderFamily` | yes | accepted: llm, tts, image |
| displayName | `string` | yes |  |
| readiness | `Readiness` | yes |  |
| cliPath | `{ readonly configured: string \| null; readonly command: string; readonly managedOnHost?: boolean; }` | no |  |

### Voice

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes |  |
| provider | `ProviderId` | yes | accepted: claude-code, codex, gemini, codex-image, openrouter, elevenlabs, openai-tts, cartesia, inworld, system-voice, google-tts, fal, replicate, openai-image, google-image |
| name | `string` | yes |  |
| voiceId | `string` | yes |  |
| languages | `readonly string[]` | no |  |
| imitatesRealPerson | `true` | no |  |

### AppSettings

| Field | Type | Required | Notes |
|---|---|---|---|
| silenceGapSeconds | `number` | yes |  |
| appearance | `Appearance` | yes | accepted: system, light, dark |
| loudness | `LoudnessDefault` | yes |  |

### TutorialSession

| Field | Type | Required | Notes |
|---|---|---|---|
| schemaVersion | `1` | yes |  |
| active | `boolean` | yes |  |
| stepId | `string` | yes | accepted: voice, channels, project, text-key, audio-key, image-key, article-name, article-body, article-keywords, article-save, image-prompt, image-save, play-options, play-article, play-keywords, play-audio, play-images, play-video, play-subtitles, play-start, download, run-cost, studio-prep, home, calendar |
| articleId | `string` | no |  |
| imageId | `string` | no |  |
| projectId | `string` | no |  |

### TutorialWrite

| Field | Type | Required |
|---|---|---|
| baseVersion | `number` | yes |
| mutationId | `string` | yes |
| session | `TutorialSession` | yes |

### TutorialView

| Field | Type | Required |
|---|---|---|
| version | `number` | yes |
| session | `TutorialSession` | yes |
| readable | `boolean` | yes |

### TutorialSaveResult

| Field | Type | Required | Notes |
|---|---|---|---|
| ok | `true \| false` | yes |  |
| value | `TutorialView` | no | not in every variant |
| reason | `"conflict" \| "unreadable"` | no | accepted: conflict, unreadable; not in every variant |

Union of 2 object variants; a field present in only some variants is `Required: no`.

### VoiceDraft

| Field | Type | Required | Notes |
|---|---|---|---|
| provider | `ProviderId` | yes | accepted: claude-code, codex, gemini, codex-image, openrouter, elevenlabs, openai-tts, cartesia, inworld, system-voice, google-tts, fal, replicate, openai-image, google-image |
| name | `string` | yes |  |
| voiceId | `string` | yes |  |
| languages | `readonly string[]` | no |  |

### AddVoiceResult

| Field | Type | Required | Notes |
|---|---|---|---|
| ok | `true \| false` | yes |  |
| voice | `Voice` | no | not in every variant |
| reason | `AddVoiceReason` | no | accepted: blank-name, blank-voice-id, name-too-long, voice-id-too-long, not-a-tts-provider, duplicate-voice-id, unknown-language; not in every variant |

Union of 2 object variants; a field present in only some variants is `Required: no`.

### Catalogue

| Field | Type | Required |
|---|---|---|
| schemaVersion | `1` | yes |
| updatedAt | `string` | yes |
| providers | `Record<string, { maxConcurrent: number; }>` | yes |
| llm | `CatalogueModel[]` | yes |
| image | `CatalogueModel[]` | yes |
| tts | `CatalogueModel[]` | yes |

### CatalogueModel

| Field | Type | Required | Notes |
|---|---|---|---|
| provider | `string` | yes |  |
| id | `string` | yes |  |
| name | `string` | yes |  |
| enabled | `boolean` | yes |  |
| deprecated | `boolean` | yes |  |
| source | `string` | yes |  |
| keywords | `string[]` | yes |  |
| pricing | `object` | yes |  |
| llm | `object (inline)` | no | not in every variant; inline shape at `packages/app/src/catalog/schema.ts:30` |
| image | `{ aspectRatios: ("16:9" \| "9:16" \| "1:1")[]; resolution?: string \| undefined; }` | no | not in every variant |
| tts | `{ maxCharacters: number; streaming: boolean; asyncMaxCharacters?: number \| undefined; }` | no | not in every variant |

Union of 3 object variants; a field present in only some variants is `Required: no`.

### CatalogueSyncStatus

| Field | Type | Required |
|---|---|---|
| checkedAt | `string \| null` | yes |
| changes | `CatalogueChanges` | yes |
| warning | `string \| null` | yes |

### HostCliStatus

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `HostCliId` | yes | accepted: claude-code, codex, gemini, codex-image |
| command | `string` | yes |  |
| installed | `boolean` | yes |  |
| version | `string` | no |  |
| login | `"signed-in" \| "signed-out" \| "unknown"` | yes | accepted: unknown, signed-in, signed-out |
| issueKind | `"missing" \| "version" \| "login" \| "bridge"` | no | accepted: missing, version, login, bridge |
| issue | `string` | no |  |

### HostLlmBody

| Field | Type | Required | Notes |
|---|---|---|---|
| model | `string` | yes |  |
| messages | `{ role: "system" \| "user" \| "assistant"; content: string; }[]` | yes |  |
| documents | `{ id: string; title: string; content: string; }[]` | no |  |
| thinking | `"off" \| "low" \| "medium" \| "high" \| "xhigh" \| "max" \| "ultra"` | no | accepted: off, low, medium, high, xhigh, max, ultra |
| webSearch | `boolean` | no |  |

### HostImageBody

| Field | Type | Required | Notes |
|---|---|---|---|
| model | `string` | yes |  |
| prompt | `string` | yes |  |
| aspect | `"16:9" \| "9:16" \| "1:1"` | yes | accepted: 16:9, 9:16, 1:1 |
| thinking | `"off" \| "low" \| "medium" \| "high" \| "xhigh" \| "max" \| "ultra"` | no | accepted: off, low, medium, high, xhigh, max, ultra |
| reference | `{ mime: "image/png" \| "image/jpeg"; base64: string; }` | no |  |
| cast | `{ name: string; description: string; images: { mime: "image/png" \| "image/jpeg"; base64: string; }[]; }[]` | no |  |

### HostFrame

| Field | Type | Required | Notes |
|---|---|---|---|
| type | `"delta" \| "activity" \| "done" \| "error"` | yes | accepted: delta, activity, done, error |
| text | `string` | no | only when type is delta |
| usage | `{ inputTokens: number; outputTokens: number; cachedInputTokens?: number \| undefined; model?: string \| undefined; } \| null` | no | only when type is done |
| finishReason | `string \| null` | no | only when type is done |
| limits | `object union (inline)` | no | only when type is done; inline shape at `packages/app/src/kernel/ports/host-cli.ts:204` |
| kind | `"other" \| "auth" \| "missing_key" \| "unavailable" \| "rate_limit" \| "refusal" \| "unsupported" \| "timeout" \| "dropped"` | no | accepted: other, auth, missing_key, unavailable, rate_limit, refusal, unsupported, timeout, dropped; only when type is error |
| message | `string` | no | only when type is error |

Union of 4 object variants; a field present in only some variants is `Required: no`.

### Host CLI protocol

Wire contract between the app and the host CLI helper, protocol 1 (`hostCliProtocol`, `packages/app/src/kernel/ports/host-cli.ts:15`). Request/stream bodies are HostLlmBody, HostImageBody, HostFrame and HostCliStatus above; this table lists the remaining fields: the health body, the open-folder body and the negotiation headers.

| Field | Type | Required | Notes |
|---|---|---|---|
| protocol | `1` | yes | health body (`hostHealthSchema`); read as an exact value by both sides |
| version | `string` | yes | health body; 1–256 characters, no control characters |
| active | `number` | yes | health body; integer 0–5 (`bridgeLimits.generation`) |
| accepting | `boolean` | yes | health body |
| path | `string` | yes | open-folder body (`hostOpenFolderSchema`); absolute, at most 4096 characters; answered by `{ opened: true }` |
| x-slopify-frames | `"2"` | no | request header the app sends on LLM calls; version 2 adds `usage.cachedInputTokens`, `usage.model` and `limits` to the `done` frame |
| x-slopify-image-report | `string` | no | response header on a bridged image: base64url JSON `{usage?, limits?}`, at most 8192 characters |

Byte limits (`bridgeLimits`): request 16 MiB, status 64 KiB, models 1 MiB, frame 4 MiB, stream 64 MiB, image 32 MiB, reference image 10 MiB, text 2 MiB; at most 5 concurrent generations and 8 metadata requests. `unavailable` is a terminal fault kind in the attempt wrapper (`packages/app/src/kernel/runner/attempt.ts:28`). No command, environment or path field other than the open-folder `path` crosses the wire.

Source: `packages/app/src/kernel/ports/host-cli.ts:26`, `packages/app/src/kernel/ports/host-cli.ts:124`, `packages/app/src/kernel/ports/host-cli.ts:163`.

### ImageRequest

| Field | Type | Required | Notes |
|---|---|---|---|
| model | `string` | yes |  |
| prompt | `string` | yes |  |
| aspect | `Format` | yes | accepted: 16:9, 9:16, 1:1 |
| signal | `AbortSignal` | yes |  |
| thinking | `ThinkingMode` | no | accepted: off, low, medium, high, xhigh, max, ultra |
| reference | `GeneratedImage` | no |  |
| cast | `readonly CastReference[]` | no |  |

### CastReference

| Field | Type | Required |
|---|---|---|
| name | `string` | yes |
| description | `string` | yes |
| images | `readonly GeneratedImage[]` | yes |

### GeneratedImage

| Field | Type | Required | Notes |
|---|---|---|---|
| bytes | `Uint8Array` | yes |  |
| mime | `"image/png" \| "image/jpeg"` | yes | accepted: image/png, image/jpeg |
| usage | `Usage` | no |  |
| limits | `PlanLimitReading` | no |  |

### AnimateRequest

| Field | Type | Required | Notes |
|---|---|---|---|
| model | `string` | yes |  |
| prompt | `string` | yes |  |
| image | `GeneratedImage` | yes |  |
| aspect | `Format` | yes | accepted: 16:9, 9:16, 1:1 |
| seconds | `number` | yes |  |
| signal | `AbortSignal` | yes |  |

### GeneratedVideo

| Field | Type | Required |
|---|---|---|
| bytes | `Uint8Array` | yes |
| mime | `"video/mp4"` | yes |

### LanguageInfo

| Field | Type | Required | Notes |
|---|---|---|---|
| code | `string` | yes |  |
| name | `string` | yes |  |
| native | `string` | yes |  |
| script | `WritingSystem` | yes | accepted: latin, cyrillic, greek, arabic, hebrew, devanagari, thai, cjk, hangul |
| timing | `WordTiming` | yes | accepted: english, multilingual, sentences |

### LlmDocument

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| title | `string` | yes |
| content | `string` | yes |

### Message

| Field | Type | Required | Notes |
|---|---|---|---|
| role | `MessageRole` | yes | accepted: system, user, assistant |
| content | `string` | yes |  |

### Usage

| Field | Type | Required |
|---|---|---|
| inputTokens | `number` | yes |
| outputTokens | `number` | yes |
| cachedInputTokens | `number` | no |
| model | `string` | no |

### LlmDelta

| Field | Type | Required |
|---|---|---|
| type | `"delta"` | yes |
| text | `string` | yes |

### LlmDone

| Field | Type | Required |
|---|---|---|
| type | `"done"` | yes |
| usage | `Usage \| null` | yes |
| finishReason | `string \| null` | yes |
| limits | `PlanLimitReading` | no |

### LlmActivity

| Field | Type | Required |
|---|---|---|
| type | `"activity"` | yes |

### LlmPartial

| Field | Type | Required |
|---|---|---|
| type | `"partial"` | yes |
| text | `string` | yes |

### LlmEvent

| Field | Type | Required | Notes |
|---|---|---|---|
| type | `"delta" \| "done" \| "activity" \| "partial"` | yes | accepted: delta, done, activity, partial |
| text | `string` | no | only when type is delta or partial |
| usage | `Usage \| null` | no | only when type is done |
| finishReason | `string \| null` | no | only when type is done |
| limits | `PlanLimitReading` | no | only when type is done |

Union of 4 object variants; a field present in only some variants is `Required: no`.

### LlmCapabilities

| Field | Type | Required |
|---|---|---|
| streams | `boolean` | yes |
| reportsUsage | `boolean` | yes |
| webSearch | `boolean` | yes |
| images | `boolean` | no |

### LlmImage

| Field | Type | Required |
|---|---|---|
| path | `string` | yes |
| name | `string` | yes |

### ThinkingConfig

| Field | Type | Required | Notes |
|---|---|---|---|
| budget | `number` | no |  |
| level | `"minimal" \| "low" \| "medium" \| "high"` | no | accepted: low, medium, high, minimal |
| effort | `\| "none" \| "minimal" \| "low" \| "medium" \| "high" \| "xhigh" \| "max" \| "ultra"` | no | accepted: low, medium, high, xhigh, max, ultra, minimal, none |

### LlmCompletion

| Field | Type | Required | Notes |
|---|---|---|---|
| documents | `readonly LlmDocument[]` | no |  |
| thinking | `ThinkingMode` | no | accepted: off, low, medium, high, xhigh, max, ultra |
| thinkingConfig | `ThinkingConfig \| null` | no |  |
| model | `string` | yes |  |
| messages | `readonly Message[]` | yes |  |
| webSearch | `boolean` | no |  |
| images | `readonly LlmImage[]` | no |  |
| signal | `AbortSignal` | yes |  |

### ModelInfo

| Field | Type | Required |
|---|---|---|
| thinkingModes | `readonly ThinkingMode[]` | no |
| id | `string` | yes |
| name | `string` | yes |
| group | `string` | no |

### Readiness

| Field | Type | Required | Notes |
|---|---|---|---|
| kind | `"keyed" \| "cli" \| "local"` | yes | accepted: keyed, cli, local |
| hasKey | `boolean` | no | only when kind is keyed |
| installed | `boolean` | no | only when kind is cli |
| version | `string` | no | only when kind is cli |
| issue | `string` | no | only when kind is cli or local |
| issueKind | `"missing" \| "version" \| "login" \| "bridge"` | no | accepted: missing, version, login, bridge; only when kind is cli |
| available | `boolean` | no | only when kind is local |
| engine | `string` | no | only when kind is local |

Union of 3 object variants; a field present in only some variants is `Required: no`.

### ProviderFault

| Field | Type | Required | Notes |
|---|---|---|---|
| kind | `ProviderErrorKind` | yes | accepted: other, auth, missing_key, unavailable, rate_limit, refusal, unsupported, timeout, dropped |
| retryAfterMs | `number` | no |  |
| planLimit | `PlanLimitHit` | no |  |

### ProviderError

| Field | Type | Required |
|---|---|---|
| name | `string` | yes |
| message | `string` | yes |
| stack | `string` | no |
| cause | `unknown` | no |
| fault | `ProviderFault` | yes |

### ProviderErrorInit

| Field | Type | Required | Notes |
|---|---|---|---|
| kind | `ProviderErrorKind` | yes | accepted: other, auth, missing_key, unavailable, rate_limit, refusal, unsupported, timeout, dropped |
| message | `string` | yes |  |
| retryAfterMs | `number` | no |  |
| planLimit | `PlanLimitHit` | no |  |

### LimitWindow

| Field | Type | Required | Notes |
|---|---|---|---|
| kind | `"five_hour" \| "weekly" \| "other"` | yes | accepted: five_hour, weekly, other |
| usedPercent | `number` | yes |  |
| resetsAt | `string \| null` | yes |  |

### PlanLimitReading

| Field | Type | Required |
|---|---|---|
| before | `readonly LimitWindow[]` | no |
| after | `readonly LimitWindow[]` | no |

### PlanLimitHit

| Field | Type | Required | Notes |
|---|---|---|---|
| account | `PlanAccount` | yes | accepted: claude-code, codex, gemini |
| resetsAt | `string \| null` | yes |  |

### SubtitleOmission

| Field | Type | Required |
|---|---|---|
| start | `number` | yes |
| text | `string` | yes |

### TimedWord

| Field | Type | Required |
|---|---|---|
| text | `string` | yes |
| start | `number` | yes |
| end | `number` | yes |
| confidence | `number` | no |

### AlignmentRequest

| Field | Type | Required |
|---|---|---|
| audioPath | `string` | yes |
| text | `string` | yes |
| aliases | `readonly NarrationAlias[]` | no |
| cacheDir | `string` | yes |
| ffmpeg | `string` | yes |
| signal | `AbortSignal` | yes |
| language | `string` | no |

### SpeechVoice

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| name | `string` | yes |
| language | `string` | no |

### DetectedSpeech

| Field | Type | Required |
|---|---|---|
| engines | `readonly SpeechEngine[]` | yes |
| issue | `string` | no |

### TtsCapabilities

| Field | Type | Required |
|---|---|---|
| streams | `boolean` | yes |
| dialogue | `boolean` | no |

### DialogueLine

| Field | Type | Required |
|---|---|---|
| voiceId | `string` | yes |
| text | `string` | yes |

### TtsRequest

| Field | Type | Required |
|---|---|---|
| model | `string` | no |
| voiceId | `string` | yes |
| text | `string` | yes |
| dialogue | `readonly DialogueLine[]` | no |
| signal | `AbortSignal` | yes |
| continuation | `\| { readonly read: () => string \| undefined; readonly write: (token: string) => void; }` | no |

### TtsAudio

| Field | Type | Required |
|---|---|---|
| audio | `ReadableStream<Uint8Array>` | yes |
| container | `"mp3"` | yes |

### ModelChoice

| Field | Type | Required |
|---|---|---|
| provider | `string` | yes |
| model | `string` | yes |

### RetiredUsage

| Field | Type | Required | Notes |
|---|---|---|---|
| key | `string` | yes |  |
| kind | `UsageKind` | yes | accepted: schedule, template, draft, project |
| id | `string` | yes |  |
| name | `string` | yes |  |
| slot | `UsageSlot` | yes | accepted: llm, audio, images, animate |
| provider | `string` | yes |  |
| model | `string` | yes |  |
| why | `"retired" \| "unlisted"` | yes | accepted: retired, unlisted |
| replacement | `{ readonly id: string; readonly name: string } \| null` | yes |  |
| blocked | `string \| null` | yes |  |

### FontSummary

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes |  |
| name | `string` | yes |  |
| family | `string` | yes |  |
| source | `"bundled" \| "system" \| "uploaded"` | yes | accepted: system, bundled, uploaded |

### ResolvedFont

| Field | Type | Required | Notes |
|---|---|---|---|
| path | `string` | yes |  |
| extension | `".ttf" \| ".otf" \| ".ttc"` | yes | accepted: .ttf, .otf, .ttc |
| assName | `string` | yes |  |
| faceIndex | `number` | yes |  |
| id | `string` | yes |  |
| name | `string` | yes |  |
| family | `string` | yes |  |
| source | `"bundled" \| "system" \| "uploaded"` | yes | accepted: system, bundled, uploaded |

### LoudnessSettings

| Field | Type | Required |
|---|---|---|
| videoLufs | `number` | yes |
| audioFilesLufs | `number` | yes |

### LoudnessDefault

| Field | Type | Required |
|---|---|---|
| enabled | `boolean` | yes |
| videoLufs | `number` | yes |
| audioFilesLufs | `number` | yes |

### LoudnessGoal

| Field | Type | Required |
|---|---|---|
| lufs | `number` | yes |
| truePeak | `number` | yes |

### LoudnessForm

| Field | Type | Required |
|---|---|---|
| enabled | `boolean` | yes |
| videoLufs | `number` | no |
| audioFilesLufs | `number` | no |

### LoudnessReport

| Field | Type | Required |
|---|---|---|
| pieces | `number` | yes |
| skipped | `number` | yes |
| spreadBefore | `number` | yes |
| spreadAfter | `number` | yes |
| target | `number` | yes |

### MasterReport

| Field | Type | Required |
|---|---|---|
| target | `number` | yes |
| integrated | `number` | yes |
| truePeak | `number` | yes |

### PickedSentence

| Field | Type | Required |
|---|---|---|
| start | `number` | yes |
| end | `number` | yes |
| text | `string` | yes |

### PickedShorts

| Field | Type | Required |
|---|---|---|
| shorts | `readonly ShortPick[]` | yes |
| durationSeconds | `number` | no |
| sentences | `readonly PickedSentence[]` | no |

### ShortRange

| Field | Type | Required |
|---|---|---|
| first | `number` | yes |
| last | `number` | yes |
| pick | `string` | yes |

### ClipLimits

| Field | Type | Required |
|---|---|---|
| minSeconds | `number` | yes |
| maxSeconds | `number` | yes |

### ShortsSettings

| Field | Type | Required |
|---|---|---|
| enabled | `boolean` | yes |
| count | `number` | yes |
| minSeconds | `number` | yes |
| maxSeconds | `number` | yes |
| prompt | `string` | no |
| imagePrompt | `string` | no |
| titleOnScreen | `boolean` | no |
| fullVideoLink | `string` | no |
| musicVolume | `number` | no |
| speed | `number` | no |

### ShortsExtrasForm

| Field | Type | Required |
|---|---|---|
| titleOnScreen | `boolean` | no |
| fullVideoLink | `string` | no |
| musicVolume | `string` | no |
| speed | `string` | no |

### PickBrief

| Field | Type | Required |
|---|---|---|
| instruction | `string` | yes |
| title | `string` | yes |
| durationSeconds | `number` | yes |
| count | `number` | yes |
| minSeconds | `number` | yes |
| maxSeconds | `number` | yes |
| sentences | `string` | yes |

### ShortPick

| Field | Type | Required |
|---|---|---|
| number | `number` | yes |
| first | `number` | yes |
| last | `number` | yes |
| start | `number` | yes |
| end | `number` | yes |
| title | `string` | yes |
| description | `string` | yes |
| hashtags | `readonly string[]` | yes |
| why | `string` | yes |
| text | `string` | yes |
| seed | `string \| null` | no |

### CheckedPicks

| Field | Type | Required | Notes |
|---|---|---|---|
| ok | `false \| true` | yes |  |
| reason | `string` | no | not in every variant |
| picks | `readonly ShortPick[]` | no | not in every variant |
| problems | `readonly string[]` | no | not in every variant |

Union of 2 object variants; a field present in only some variants is `Required: no`.

### PickLimits

| Field | Type | Required |
|---|---|---|
| count | `number` | yes |
| minSeconds | `number` | yes |
| maxSeconds | `number` | yes |
| durationSeconds | `number` | yes |

### StylePreviewImage

| Field | Type | Required | Notes |
|---|---|---|---|
| kind | `"upload" \| "output" \| "picture"` | yes | accepted: upload, output, picture |
| stagedFileId | `string` | no | only when kind is upload |
| outputId | `string` | no | only when kind is output |
| sha256 | `string` | no | only when kind is picture |

Union of 3 object variants; a field present in only some variants is `Required: no`.

### StylePreviewRequest

| Field | Type | Required | Notes |
|---|---|---|---|
| format | `"16:9" \| "9:16" \| "1:1"` | yes | accepted: 16:9, 9:16, 1:1 |
| subtitles | `{ mode: "off" \| "files" \| "burn-in"; fontId: string; fontSize: number; position: "top" \| "bottom" \| "upper-middle" \| "center" \| "lower-middle"; }` | yes |  |
| videoEdit | `object` | no |  |
| previewText | `string` | no |  |
| image | `{ kind: "upload"; stagedFileId: string; } \| { kind: "output"; outputId: string; } \| { kind: "picture"; sha256: string; }` | no |  |
| shorts | `{ titleOnScreen: boolean; speed?: number \| undefined; title?: string \| undefined; }` | no |  |
| force | `boolean` | no |  |

### StylePreviewSettings

| Field | Type | Required | Notes |
|---|---|---|---|
| version | `2` | yes |  |
| format | `Format` | yes | accepted: 16:9, 9:16, 1:1 |
| captions | `{ readonly fontId: string; readonly fontSize: number; readonly position: SubtitleConfig["position"]; readonly text: string; } \| null` | yes |  |
| look | `Look` | yes |  |
| transition | `{ readonly kind: TransitionStyle; readonly seconds: number } \| null` | yes |  |
| chapterCard | `{ readonly fontId: string } \| null` | yes |  |
| image | `string` | no |  |
| short | `\| { readonly fontId: string; readonly text: string; readonly title: string \| null; readonly speed: number; }` | no |  |

### CaptionCue

| Field | Type | Required |
|---|---|---|
| start | `number` | yes |
| end | `number` | yes |
| text | `string` | yes |
| speaker | `string` | no |

### SubtitleConfig

| Field | Type | Required | Notes |
|---|---|---|---|
| mode | `"off" \| "files" \| "burn-in"` | yes | accepted: off, files, burn-in |
| language | `"en"` | yes |  |
| fontId | `string` | yes |  |
| position | `"top" \| "bottom" \| "upper-middle" \| "center" \| "lower-middle"` | yes | accepted: top, bottom, upper-middle, center, lower-middle |
| fontSize | `number` | yes |  |
| color | `string` | no |  |
| outlineColor | `string` | no |  |

### SubtitleAsset

| Field | Type | Required | Notes |
|---|---|---|---|
| role | `(typeof subtitleRoles)[number]` | yes | accepted: subtitles_srt, subtitles_vtt, subtitle_words, subtitle_ass, subtitle_font |
| path | `string` | yes |  |

### PreparedSubtitles

| Field | Type | Required |
|---|---|---|
| directory | `string` | yes |
| burnIn | `boolean` | yes |
| omissions | `readonly SubtitleOmission[]` | no |
| assets | `readonly SubtitleAsset[]` | yes |

### AmbientBedSettings

| Field | Type | Required | Notes |
|---|---|---|---|
| source | `AmbientBedSource` | yes | accepted: rain, fire, wind, upload |
| levelDb | `number` | yes |  |
| fadeInSeconds | `number` | yes |  |
| tailSeconds | `number` | yes |  |

### ChannelAmbientBed

| Field | Type | Required | Notes |
|---|---|---|---|
| source | `BuiltInBed` | yes | accepted: rain, fire, wind |
| levelDb | `number` | yes |  |
| fadeInSeconds | `number` | yes |  |
| tailSeconds | `number` | yes |  |

### AmbientBedForm

| Field | Type | Required | Notes |
|---|---|---|---|
| source | `"none" \| AmbientBedSource` | yes | accepted: none, rain, fire, wind, upload |
| level | `string` | yes |  |
| fadeIn | `string` | yes |  |
| tail | `string` | yes |  |

### AudioSegment

| Field | Type | Required | Notes |
|---|---|---|---|
| kind | `AudioKind` | yes | accepted: body, intro, outro, gap, edge |
| path | `string \| null` | yes |  |
| seconds | `number` | yes |  |

### Point

| Field | Type | Required |
|---|---|---|
| x | `number` | yes |
| y | `number` | yes |

### Motion

| Field | Type | Required | Notes |
|---|---|---|---|
| kind | `"zoom" \| "pan" \| "still"` | yes | accepted: zoom, pan, still |
| direction | `ZoomDirection` | no | accepted: out, in; only when kind is zoom |
| percent | `number` | no | only when kind is zoom or pan |
| from | `Point` | no | only when kind is pan |
| to | `Point` | no | only when kind is pan |

Union of 3 object variants; a field present in only some variants is `Required: no`.

### ImageSource

| Field | Type | Required |
|---|---|---|
| kind | `"image"` | yes |
| path | `string` | yes |

### VideoSource

| Field | Type | Required |
|---|---|---|
| kind | `"video"` | yes |
| path | `string` | yes |
| seconds | `number` | yes |

### Transition

| Field | Type | Required | Notes |
|---|---|---|---|
| kind | `TransitionStyle` | yes | accepted: crossfade, fadeblack, slide, wipe |
| frames | `number` | yes |  |

### Shot

| Field | Type | Required |
|---|---|---|
| source | `ImageSource \| VideoSource` | yes |
| frames | `number` | yes |
| motion | `Motion` | yes |
| transition | `Transition` | no |

### Look

| Field | Type | Required | Notes |
|---|---|---|---|
| vignette | `LookLevel` | yes | accepted: off, subtle, strong |
| grain | `LookLevel` | yes | accepted: off, subtle, strong |
| grade | `ColorGrade` | yes | accepted: none, warm, cold, desaturated, sepia |
| atmosphere | `Atmosphere` | yes | accepted: none, embers, dust, fog |

### Card

| Field | Type | Required |
|---|---|---|
| title | `string` | yes |
| startFrame | `number` | yes |
| frames | `number` | yes |

### CardFont

| Field | Type | Required |
|---|---|---|
| path | `string` | yes |
| name | `string` | yes |

### AmbientBed

| Field | Type | Required |
|---|---|---|
| source | `{ readonly kind: "noise"; readonly preset: "rain" \| "fire" \| "wind"; } \| { readonly kind: "file"; readonly path: string; }` | yes |
| levelDb | `number` | yes |
| fadeInSeconds | `number` | yes |
| fadeOutAt | `number` | yes |
| fadeOutSeconds | `number` | yes |

### EditList

| Field | Type | Required |
|---|---|---|
| version | `typeof editListVersion` | yes |
| width | `number` | yes |
| height | `number` | yes |
| fps | `number` | yes |
| audio | `readonly AudioSegment[]` | yes |
| shots | `readonly Shot[]` | yes |
| look | `Look` | no |
| cards | `readonly Card[]` | no |
| cardFont | `CardFont` | no |
| cardColor | `string` | no |
| bed | `AmbientBed` | no |

### VideoEditSettings

| Field | Type | Required | Notes |
|---|---|---|---|
| cuts | `CutMode` | yes | accepted: narration, interval |
| transition | `TransitionKind` | yes | accepted: cut, crossfade, fadeblack, slide, wipe |
| transitionSeconds | `number` | yes |  |
| vignette | `LookLevel` | yes | accepted: off, subtle, strong |
| grain | `LookLevel` | yes | accepted: off, subtle, strong |
| grade | `ColorGrade` | yes | accepted: none, warm, cold, desaturated, sepia |
| atmosphere | `Atmosphere` | yes | accepted: none, embers, dust, fog |
| chapterCards | `boolean` | yes |  |
| animate | `AnimateMode` | yes | accepted: off, chapters, every |
| animateEvery | `number` | yes |  |
| animateModel | `string` | yes |  |

### AudioExportRecord

| Field | Type | Required |
|---|---|---|
| sampleRate | `number` | yes |
| channels | `number` | yes |
| codec | `string` | yes |
| gapSeconds | `number` | yes |
| totalSeconds | `number` | yes |
| audio | `{ kind: string; path: string \| null; seconds: number; }[]` | yes |
| output | `string` | yes |
| edgeSeconds | `number` | no |
| sourceIds | `string[]` | no |
| sourceHashes | `{ id: string; sha256: string; }[]` | no |

### Speaker

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes |  |
| name | `string` | yes |  |
| role | `"narrator" \| "host" \| "guest" \| "character"` | yes | accepted: narrator, host, guest, character |
| voice | `{ provider: string; model: string; voice: string; }` | yes |  |
| pace | `number` | no |  |
| pronunciations | `string` | no |  |
| castId | `string` | no |  |
| portrait | `string` | no |  |

### Book

| Field | Type | Required |
|---|---|---|
| title | `string` | yes |
| chapter | `number` | yes |

### VoicesSettings

| Field | Type | Required | Notes |
|---|---|---|---|
| format | `"audiobook" \| "podcast" \| "drama" \| "interview"` | yes | accepted: audiobook, podcast, drama, interview |
| source | `"script" \| "attribute"` | yes | accepted: script, attribute |
| speakers | `object[] (inline)` | yes | inline shape at `packages/app/src/slices/voices/model.ts:81` |
| turnGapSeconds | `number` | yes |  |
| nameTags | `boolean` | yes |  |
| nativeDialogue | `boolean` | yes |  |
| audioFiles | `boolean` | yes |  |
| book | `{ title: string; chapter: number; }` | no |  |

### VoiceProblem

| Field | Type | Required |
|---|---|---|
| field | `string` | yes |
| message | `string` | yes |

### ScriptTurn

| Field | Type | Required |
|---|---|---|
| index | `number` | yes |
| speaker | `string` | yes |
| text | `string` | yes |
| section | `number` | yes |
| markdown | `string` | no |

### ScriptSection

| Field | Type | Required |
|---|---|---|
| title | `string` | yes |
| firstTurn | `number` | yes |

### Script

| Field | Type | Required |
|---|---|---|
| turns | `readonly ScriptTurn[]` | yes |
| sections | `readonly ScriptSection[]` | yes |

### NamedSpeaker

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| name | `string` | yes |

### AiDisclosure

| Field | Type | Required |
|---|---|---|
| altered | `boolean` | yes |
| why | `string` | yes |

### DisclosureInput

| Field | Type | Required | Notes |
|---|---|---|---|
| setting | `AiDisclosureSetting` | yes | accepted: auto, yes, no |
| kind | `"video" \| "short"` | yes | accepted: video, short |
| realPersonVoices | `readonly string[]` | yes |  |
| realFootage | `boolean` | yes |  |
| footageOverlay | `string` | no |  |
| photorealistic | `boolean` | yes |  |

### PackFile

| Field | Type | Required |
|---|---|---|
| url | `string` | yes |
| asset | `string` | yes |
| filename | `string` | yes |
| contentType | `string` | yes |
| bytes | `number` | yes |

### StudioPlaylist

| Field | Type | Required |
|---|---|---|
| name | `string` | yes |
| byDefault | `boolean` | yes |

### PackItem

| Field | Type | Required | Notes |
|---|---|---|---|
| kind | `"video" \| "short"` | yes | accepted: video, short |
| short | `number` | no |  |
| video | `PackFile \| null` | yes |  |
| title | `string` | yes |  |
| titles | `readonly string[]` | yes |  |
| description | `string` | yes |  |
| tags | `readonly string[]` | yes |  |
| thumbnails | `readonly PackFile[]` | yes |  |
| audience | `typeof studioAudience` | yes |  |
| alteredContent | `AiDisclosure` | yes |  |
| playlists | `readonly string[]` | yes |  |
| playlist | `string \| null` | yes |  |
| pickable | `{ readonly titles: readonly string[]; readonly thumbnails: readonly PackFile[]; readonly title: number; readonly thumbnail: number }` | no | Long video only: all titles and thumbnails in the project's order and the UploadPick indexes; `title` and `thumbnails[0]` are the picked ones (`packages/app/src/slices/studio/model.ts:61`, `packages/app/src/slices/studio/pick.ts:41`) |
| scheduleAt | `string` | no | ISO time from the project's `releases` rows through `scheduleOf`: `Schedule.longAt` for the long video, `Schedule.shortsAt[n-1]` for short n when not null (`packages/app/src/slices/studio/pack.ts:176`, `:205`, `:255`) |
| captions | `PackFile` | no | Long video's `subtitles_srt` output (`packages/app/src/slices/studio/pack.ts:180`) |
| endScreenVideoId | `string` | no | The project's Previous video, else `previousLongVideo` (`packages/app/src/slices/studio/pack.ts:182`, `packages/app/src/slices/studio/videos.ts:169`) |
| relatedVideoId | `string` | no | A short's: the long video's id once its `upload_state` is `done` (`packages/app/src/slices/studio/pack.ts:256`) |
| pinnedComment | `string` | no | Long video only: the `youtube_pinned_comment` output with the project's description edits applied, when non-empty (`packages/app/src/slices/studio/pack.ts:126`, `:183`); shorts carry none |
| chapterNotice | `string` | no |  |

### UploadPack

| Field | Type | Required |
|---|---|---|
| projectId | `string` | yes |
| projectTitle | `string` | yes |
| items | `readonly PackItem[]` | yes |
| missing | `readonly string[]` | yes |
| footage | `{ readonly clips: number; readonly real: boolean }` | no |
| schedule | `Schedule` | no |
| series | `string` | yes |
| playlistChoices | `readonly { readonly name: string; readonly chosen: boolean }[]` | yes |

### ActivePack

| Field | Type | Required |
|---|---|---|
| pack | `UploadPack` | yes |
| item | `PackItem` | yes |

### FillQueueItem

| Field | Type | Required |
|---|---|---|
| projectId | `string` | yes |
| projectTitle | `string` | yes |
| short | `number \| null` | yes |
| at | `string` | yes |

### StudioPairingView

| Field | Type | Required |
|---|---|---|
| token | `string` | yes |
| origin | `string \| null` | yes |
| pairedAt | `string \| null` | yes |

### UploadPick

| Field | Type | Required | Notes |
|---|---|---|---|
| title | `number` | yes | 0-9; 0 is the project's title, 1 and up its other titles |
| thumbnail | `number` | yes | 0-9; 0 is thumbnail A |

Read with default `{title:0, thumbnail:0}` when the setting is missing or invalid (`packages/app/src/slices/studio/pick.ts:24`).

### PostingPlan

| Field | Type | Required | Notes |
|---|---|---|---|
| timeZone | `string` | yes | 1-100 characters |
| rows | `PlanLine[]` | yes | ≤ 14 rows (`packages/app/src/slices/studio/plan-model.ts:19-22`) |

Missing or invalid setting reads as `emptyPlan(localTimeZone())`: no rows, so nothing is scheduled (`packages/app/src/slices/studio/plan.ts:24-26`, `:32-42`).

### PlanLine

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| name | `string` | yes |  | Trimmed 1-20; an inner id ("1", "2"…), never shown; a release keeps the line it came from (`packages/app/src/slices/studio/plan-model.ts:12-13`) |
| series | `string` | no | `""` | Trimmed ≤ 100; `""` takes any project, else only a project whose `seriesOf` matches (`packages/app/src/slices/studio/plan-model.ts:14-15`, `packages/app/src/slices/studio/releases.ts:92-93`) |
| long | `PlanSlot` | yes |  | The long video's weekly time |
| shorts | `PlanSlot[]` | yes |  | ≤ 10 (`packages/app/src/slices/studio/plan-model.ts:17`) |

`seriesOf` reads a project's series from its title pattern (else its title): the text after the last `|`, with `{{…}}` keywords removed and spaces collapsed; `""` without a `|` (`packages/app/src/slices/studio/plan-model.ts:32-47`).

### PlanSlot

| Field | Type | Required | Notes |
|---|---|---|---|
| day | `number` | yes | 0-6, Sunday first (`weekdays`, `packages/app/src/slices/studio/plan-model.ts:5`) |
| time | `string` | yes | `HH:MM`, 24-hour |

### Release

| Field | Type | Required | Notes |
|---|---|---|---|
| short | `number` | yes | 0 is the long video |
| at | `string` | yes | ISO; `""` is not scheduled |
| line | `string \| null` | yes | The posting-plan line (`PlanLine.name`) the time came from; null when picked by hand |
| by | `"plan" \| "person"` | yes | accepted: plan, person |

Read by `releasesOf` (one project, by `short`) and `allReleases` (every scheduled row, by time); written by `planReleases` (`by='plan'`) and `setRelease` (`by='person'`), which for short 0 also deletes the project's `by='plan'` short rows (`packages/app/src/slices/studio/releases.ts:46-81`, `:140-197`).

### Slot

| Field | Type | Required | Notes |
|---|---|---|---|
| row | `string` | yes | Plan line name |
| longAt | `string` | yes | ISO time of the long video |

`lineSlots` lists every line's long-video times between two instants in time order; `freeSlots` keeps those from `studio.leadHours` ahead over eight weeks whose line takes the project's series and whose hour no other project's release holds (`packages/app/src/slices/studio/releases.ts:96-135`).

### Schedule

| Field | Type | Required | Notes |
|---|---|---|---|
| row | `string` | yes | The long video's `line`, `""` when null |
| longAt | `string` | yes |  |
| shortsAt | `readonly (string \| null)[]` | yes | Short n's release at index n-1, up to the highest short with a row; null where it has none or is not scheduled (`packages/app/src/slices/studio/releases.ts:199-212`) |

Absent (`scheduleOf` answers undefined) when the project has no short-0 row or it is not scheduled.

### ReleaseCalendar

| Field | Type | Required | Notes |
|---|---|---|---|
| leadHours | `number` | yes | Setting `studio.leadHours` |
| timeZone | `string` | yes | The posting plan's |
| from | `string` | yes | ISO, 24 h before now |
| until | `string` | yes | ISO, `weeks` after now |
| entries | `readonly CalendarEntry[]` | yes | Sorted by `at` |
| candidates | `readonly { id: string; title: string; series: string }[]` | yes | Finished projects with no short-0 release row, or one set to not scheduled, whose upload pack's first item has a rendered video (`packages/app/src/slices/studio/calendar.ts:132-150`) |

### CalendarEntry

| Field | Type | Required | Notes |
|---|---|---|---|
| at | `string` | yes | ISO long-video release or free plan time |
| line | `string \| null` | yes |  |
| series | `string` | yes | The project's `seriesOf`, or the free line's `series` |
| project | `{ id: string; title: string } \| null` | yes | null for a free time of the plan (`packages/app/src/slices/studio/calendar.ts:118-130`) |
| items | `readonly CalendarItem[]` | yes | Empty for a free time |

### CalendarItem

| Field | Type | Required | Notes |
|---|---|---|---|
| short | `number` | yes | 0 is the long video |
| title | `string` | yes |  |
| at | `string \| null` | yes | Its release; null when none or not scheduled |
| uploadBy | `string \| null` | yes | `at` minus `leadHours` (`packages/app/src/slices/studio/calendar.ts:93`) |
| state | `ItemState` | yes | accepted: not-ready, ready, late, filled, scheduled. `scheduled` when the video's `upload_state` is `done`, `filled` when `filled`, `not-ready` without a video file, `late` once now is past `uploadBy`, else `ready` (`packages/app/src/slices/studio/calendar.ts:12-22`, `:95-104`) |
| checks | `string \| null` | yes | `YoutubeVideo.checks` |
| videoId | `string \| null` | yes |  |

### YoutubeVideo

| Field | Type | Required | Notes |
|---|---|---|---|
| projectId | `string` | yes |  |
| short | `number \| null` | yes | null is the long video; stored as 0 |
| videoId | `string` | yes | 11 characters `[A-Za-z0-9_-]` (`videoIdPattern`, `packages/app/src/slices/studio/videos.ts:35`) |
| recordedAt | `string` | yes |  |
| uploadState | `"filled" \| "done"` | yes | accepted: filled, done |
| abState | `AbState` | yes | accepted: none, waiting, started, failed. Only `recordVideo` writes it (reset to `none` on a new video id); A/B tests start on request and are not tracked (`packages/app/src/slices/studio/videos.ts:84`) |
| finishState | `TaskState` | yes | accepted: none, waiting, done, failed |
| finishMessage | `string \| null` | yes |  |
| commentState | `TaskState` | yes | accepted: none, waiting, done, failed |
| commentMessage | `string \| null` | yes |  |
| abMessage | `string \| null` | yes |  |
| abAt | `string \| null` | yes |  |
| checks | `string \| null` | yes | Studio's Content-list Restrictions as the extension last read them: `ok` for None, else Studio's words (≤ 100); null until read. Written by `setChecks` from `/ext/backfill` (`packages/app/src/slices/studio/videos.ts:29-31`, `:183`) |

### VideoStats

| Field | Type | Required | Notes |
|---|---|---|---|
| projectId | `string` | yes |  |
| short | `number \| null` | yes |  |
| videoId | `string` | yes |  |
| readAt | `string` | yes |  |
| impressions | `number \| null` | yes |  |
| ctr | `number \| null` | yes | Percent as Studio shows it |
| views | `number \| null` | yes |  |
| averageViewSeconds | `number \| null` | yes |  |
| watchHours | `number \| null` | yes |  |

### AbVariant

| Field | Type | Required | Notes |
|---|---|---|---|
| title | `string \| null` | yes | ≤ 200 characters |
| thumbnail | `number \| null` | yes | 1-3 |
| share | `number \| null` | yes | Share of watch time, 0-100 |
| winner | `boolean` | yes |  |

Zod `abVariantSchema` (`packages/app/src/slices/studio/stats.ts:21`).

### AbResult

| Field | Type | Required | Notes |
|---|---|---|---|
| projectId | `string` | yes |  |
| short | `number \| null` | yes |  |
| videoId | `string` | yes |  |
| readAt | `string` | yes |  |
| variants | `readonly AbVariant[]` | yes | `abResults` re-parses the stored JSON and drops rows that fail, and adds `projectTitle` from `projects` (`packages/app/src/slices/studio/stats.ts:107`) |

### StudioRow

| Field | Type | Required | Notes |
|---|---|---|---|
| title | `string` | yes | Matched to a pack item's titles after trim, whitespace collapse and lower-casing (`packages/app/src/slices/studio/backfill.ts:15`) |
| videoId | `string` | yes |  |

### FillEntry

| Field | Type | Required | Notes |
|---|---|---|---|
| projectId | `string` | yes |  |
| short | `number \| null` | yes | null is the long video |
| at | `string` | yes |  |

Entries older than `fillQueueMs` (24 h) are dropped on read; at most `fillQueueMax` (50) are kept (`packages/app/src/slices/studio/queue.ts:14`, `:16`).

### TitleShape

| Field | Type | Required | Notes |
|---|---|---|---|
| pattern | `string` | yes | `RunConfig.titlePattern` |
| keywords | `readonly { readonly name: string; readonly value: string }[]` | yes | Each `{{keyword}}` of the pattern and its value in the run's `values` (`packages/app/src/slices/youtube/titles.ts:15`) |

### DescriptionBrief

| Field | Type | Required |
|---|---|---|
| instruction | `string` | yes |
| title | `string` | yes |
| shape | `TitleShape` | no |
| durationSeconds | `number` | yes |
| transcript | `string` | yes |

### DescriptionAnswer

| Field | Type | Required |
|---|---|---|
| summary | `string` | yes |
| chapters | `readonly Chapter[]` | yes |
| hashtags | `readonly string[]` | yes |
| tags | `readonly string[]` | yes |
| pinnedComment | `string` | yes |
| titles | `readonly string[]` | yes |

### ProjectDescriptionEdits

| Field | Type | Required |
|---|---|---|
| fields | `DescriptionEdits` | yes |
| links | `readonly ChannelLink[]` | yes |

### DescriptionFields

| Field | Type | Required |
|---|---|---|
| chapters | `string` | yes |
| summary | `string` | yes |
| tags | `string` | yes |
| hashtags | `string` | yes |
| pinnedComment | `string` | yes |
| titles | `string` | yes |

### FieldEdit

| Field | Type | Required |
|---|---|---|
| base | `string` | yes |
| text | `string` | yes |

### DescriptionEdits

| Field | Type | Required |
|---|---|---|
| chapters | `FieldEdit` | no |
| summary | `FieldEdit` | no |
| tags | `FieldEdit` | no |
| hashtags | `FieldEdit` | no |
| pinnedComment | `FieldEdit` | no |
| titles | `FieldEdit` | no |

### ResolvedField

| Field | Type | Required |
|---|---|---|
| text | `string` | yes |
| edited | `boolean` | yes |
| pending | `string` | no |

### ChannelLink

| Field | Type | Required |
|---|---|---|
| name | `string` | yes |
| url | `string` | yes |

### PlaceholderPart

| Field | Type | Required | Notes |
|---|---|---|---|
| kind | `"text" \| "placeholder"` | yes | accepted: text, placeholder |
| text | `string` | no | only when kind is text |
| raw | `string` | no | only when kind is placeholder |
| name | `string` | no | only when kind is placeholder |
| url | `string` | no | only when kind is placeholder |

Union of 2 object variants; a field present in only some variants is `Required: no`.

### FilledText

| Field | Type | Required |
|---|---|---|
| text | `string` | yes |
| unknown | `readonly string[]` | yes |

### CostRow

| Field | Type | Required |
|---|---|---|
| stage | `string` | yes |
| low | `number \| null` | yes |
| high | `number \| null` | yes |
| detail | `string` | yes |
| onPlan | `boolean` | no |
| apiLow | `number \| null` | no |
| apiHigh | `number \| null` | no |

### CostEstimate

| Field | Type | Required |
|---|---|---|
| currency | `"USD"` | yes |
| rows | `readonly CostRow[]` | yes |
| low | `number` | yes |
| high | `number` | yes |
| unknown | `number` | yes |
| apiLow | `number` | no |
| apiHigh | `number` | no |
| apiUnknown | `number` | no |
| expectedWords | `number` | yes |
| catalogueDate | `string \| null` | yes |
| assumptions | `readonly string[]` | yes |

### Fix

| Field | Type | Required | Notes |
|---|---|---|---|
| kind | `"sign-in" \| "provider-settings" \| "free-space" \| "refused" \| "switch-model"` | yes | accepted: sign-in, provider-settings, free-space, refused, switch-model |
| label | `string` | yes |  |
| cli | `SignInCli` | no | accepted: claude-code, codex, gemini; only when kind is sign-in |
| command | `string` | no | only when kind is sign-in |
| provider | `string` | no | only when kind is provider-settings |
| soften | `boolean` | no | only when kind is refused; also set for a Video failure naming a short's still (`packages/app/src/slices/fixes/rules.ts:56`, `:70`) |

Union of 5 object variants; a field present in only some variants is `Required: no`.

### FailedStep

| Field | Type | Required | Notes |
|---|---|---|---|
| stage | `StageKind` | yes | accepted: research, article, audio, images, thumbnail, video, document |
| kind | `string` | no |  |
| reason | `string \| null` | yes |  |
| provider | `string` | no |  |

### NoticeText

| Field | Type | Required |
|---|---|---|
| headline | `string` | yes |
| detail | `string` | yes |
| link | `string` | no |

### ReviewNoticeSubject

| Field | Type | Required |
|---|---|---|
| title | `string` | yes |
| stage | `string` | yes |
| reason | `string` | no |

### NoticeSubject

| Field | Type | Required |
|---|---|---|
| title | `string` | yes |
| makesVideo | `boolean` | yes |
| reason | `string` | no |

### TopicsNoticeSubject

| Field | Type | Required |
|---|---|---|
| scheduleName | `string` | yes |
| added | `number` | yes |
| waiting | `number` | yes |

### ReviewStageSettings

| Field | Type | Required | Notes |
|---|---|---|---|
| mode | `ReviewMode` | yes | accepted: off, flag, redo |
| prompt | `string` | no |  |

### ReviewSettings

| Field | Type | Required | Notes |
|---|---|---|---|
| provider | `string` | yes |  |
| model | `string` | yes |  |
| thinking | `ThinkingMode` | no | accepted: off, low, medium, high, xhigh, max, ultra |
| retries | `number` | no |  |
| stages | `Partial<Record<ReviewStage, ReviewStageSettings>>` | yes |  |

### ReviewSettingsForm

| Field | Type | Required | Notes |
|---|---|---|---|
| provider | `string` | yes |  |
| model | `string` | yes |  |
| thinking | `ThinkingMode` | no | accepted: off, low, medium, high, xhigh, max, ultra |
| retries | `string` | yes |  |
| stages | ` Partial<Record<ReviewStage, { readonly mode: ReviewMode; readonly prompt: string }>> ` | yes |  |

### ReviewVerdict

| Field | Type | Required |
|---|---|---|
| passed | `boolean` | yes |
| reasons | `readonly string[]` | yes |

### ReviewRecord

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes |  |
| projectId | `string` | yes |  |
| revisionId | `string` | yes |  |
| itemKey | `string` | yes |  |
| stage | `ReviewStage` | yes | accepted: article, images, thumbnail, narration, shorts |
| itemFingerprint | `string` | yes |  |
| reviewFingerprint | `string` | yes |  |
| outcome | `ReviewOutcome` | yes | accepted: redo, passed, flagged |
| attempt | `number` | yes |  |
| action | `"overruled" \| "redone" \| null` | yes | accepted: overruled, redone |
| actionAt | `string \| null` | yes |  |
| redoState | `"pending" \| "started" \| "failed" \| null` | yes | accepted: pending, failed, started |
| redoError | `string \| null` | yes |  |
| createdAt | `string` | yes |  |
| passed | `boolean` | yes |  |
| reasons | `readonly string[]` | yes |  |

### ReviewView

| Field | Type | Required | Notes |
|---|---|---|---|
| current | `boolean` | yes |  |
| outputId | `string \| null` | yes |  |
| verdicts | `number` | yes |  |
| id | `string` | yes |  |
| projectId | `string` | yes |  |
| revisionId | `string` | yes |  |
| itemKey | `string` | yes |  |
| stage | `ReviewStage` | yes | accepted: article, images, thumbnail, narration, shorts |
| itemFingerprint | `string` | yes |  |
| reviewFingerprint | `string` | yes |  |
| outcome | `ReviewOutcome` | yes | accepted: redo, passed, flagged |
| attempt | `number` | yes |  |
| action | `"overruled" \| "redone" \| null` | yes | accepted: overruled, redone |
| actionAt | `string \| null` | yes |  |
| redoState | `"pending" \| "started" \| "failed" \| null` | yes | accepted: pending, failed, started |
| redoError | `string \| null` | yes |  |
| createdAt | `string` | yes |  |
| passed | `boolean` | yes |  |
| reasons | `readonly string[]` | yes |  |

### UsageTotals

| Field | Type | Required |
|---|---|---|
| tokensIn | `number` | yes |
| tokensOut | `number` | yes |
| cachedTokens | `number` | yes |
| characters | `number` | yes |
| images | `number` | yes |
| seconds | `number` | yes |

### CostLine

| Field | Type | Required |
|---|---|---|
| calls | `number` | yes |
| cost | `number` | yes |
| unpriced | `number` | yes |
| apiEquivalent | `number \| null` | yes |
| apiUnpriced | `number` | yes |

### StageCost

| Field | Type | Required | Notes |
|---|---|---|---|
| stage | `StageKind` | yes | accepted: research, article, audio, images, thumbnail, video, document |
| wallMs | `number \| null` | yes |  |
| calls | `number` | yes |  |
| cost | `number` | yes |  |
| unpriced | `number` | yes |  |
| apiEquivalent | `number \| null` | yes |  |
| apiUnpriced | `number` | yes |  |
| tokensIn | `number` | yes |  |
| tokensOut | `number` | yes |  |
| cachedTokens | `number` | yes |  |
| characters | `number` | yes |  |
| images | `number` | yes |  |
| seconds | `number` | yes |  |

### ModelCost

| Field | Type | Required | Notes |
|---|---|---|---|
| provider | `string` | yes |  |
| model | `string` | yes |  |
| kind | `"llm" \| "tts" \| "image" \| "video"` | yes | accepted: llm, tts, image, video |
| onPlan | `boolean` | yes |  |
| apiModel | `string \| null` | yes |  |
| calls | `number` | yes |  |
| cost | `number` | yes |  |
| unpriced | `number` | yes |  |
| apiEquivalent | `number \| null` | yes |  |
| apiUnpriced | `number` | yes |  |
| tokensIn | `number` | yes |  |
| tokensOut | `number` | yes |  |
| cachedTokens | `number` | yes |  |
| characters | `number` | yes |  |
| images | `number` | yes |  |
| seconds | `number` | yes |  |

### PlanWindowUse

| Field | Type | Required | Notes |
|---|---|---|---|
| kind | `LimitWindow["kind"]` | yes | accepted: five_hour, weekly, other |
| usedPercent | `number` | yes |  |
| nowPercent | `number` | yes |  |
| resetsAt | `string \| null` | yes |  |

### PlanUse

| Field | Type | Required | Notes |
|---|---|---|---|
| account | `PlanAccount` | yes | accepted: claude-code, codex, gemini |
| name | `string` | yes |  |
| calls | `number` | yes |  |
| reported | `boolean` | yes |  |
| windows | `readonly PlanWindowUse[]` | yes |  |

### LimitWait

| Field | Type | Required | Notes |
|---|---|---|---|
| account | `PlanAccount` | yes | accepted: claude-code, codex, gemini |
| name | `string` | yes |  |
| stage | `StageKind` | yes | accepted: research, article, audio, images, thumbnail, video, document |
| resetsAt | `string \| null` | yes |  |
| retryAt | `string` | yes |  |

### RunCost

| Field | Type | Required |
|---|---|---|
| currency | `"USD"` | yes |
| totals | `UsageTotals & { readonly wallMs: number }` | yes |
| run | `RunTiming \| null` | yes |
| byStage | `readonly StageCost[]` | yes |
| byModel | `readonly ModelCost[]` | yes |
| plans | `readonly PlanUse[]` | yes |
| waits | `readonly LimitWait[]` | yes |
| catalogueDate | `string \| null` | yes |
| calls | `number` | yes |
| cost | `number` | yes |
| unpriced | `number` | yes |
| apiEquivalent | `number \| null` | yes |
| apiUnpriced | `number` | yes |

### CallPrice

| Field | Type | Required |
|---|---|---|
| onPlan | `boolean` | yes |
| cost | `number \| null` | yes |
| apiModel | `string \| null` | yes |
| apiCost | `number \| null` | yes |
| price | `Readonly<Record<string, unknown>> \| null` | yes |

### RunTiming

| Field | Type | Required |
|---|---|---|
| current | `boolean` | yes |
| running | `boolean` | yes |
| workingMs | `number` | yes |

### ProjectTiming

| Field | Type | Required |
|---|---|---|
| run | `RunTiming \| null` | yes |
| workingMs | `number` | yes |
| byStage | `ReadonlyMap<StageKind, number>` | yes |

### PlanStanding

| Field | Type | Required | Notes |
|---|---|---|---|
| account | `PlanAccount` | yes | accepted: claude-code, codex, gemini |
| name | `string` | yes |  |
| weeklyPercent | `number \| null` | yes |  |
| fiveHourPercent | `number \| null` | yes |  |
| weeklyResetsAt | `string \| null` | yes |  |
| readAt | `string` | yes |  |

### WeekSummary

| Field | Type | Required |
|---|---|---|
| since | `string` | yes |
| videos | `number` | yes |
| calls | `number` | yes |
| cost | `number` | yes |
| unpriced | `number` | yes |
| apiEquivalent | `number \| null` | yes |
| plans | `readonly PlanStanding[]` | yes |

### BackupConfigInput

| Field | Type | Required |
|---|---|---|
| enabled | `boolean` | yes |
| time | `string` | yes |
| timeZone | `string` | yes |
| keep | `number` | yes |
| folder | `string \| null` | yes |

### BackupConfig

| Field | Type | Required |
|---|---|---|
| enabled | `boolean` | yes |
| time | `string` | yes |
| timeZone | `string` | yes |
| keep | `number` | yes |
| folder | `string \| null` | yes |
| enabledAt | `string \| null` | yes |

### BackupStatus

| Field | Type | Required | Notes |
|---|---|---|---|
| lastAttemptAt | `string \| null` | yes |  |
| lastResult | `"failed" \| "succeeded" \| "waiting" \| null` | yes | accepted: failed, succeeded, waiting |
| lastTrigger | `"manual" \| "scheduled" \| "catch-up" \| null` | yes | accepted: manual, scheduled, catch-up |
| lastSlot | `string \| null` | yes |  |
| detail | `string \| null` | yes |  |
| lastSuccessAt | `string \| null` | yes |  |
| lastSuccessFile | `string \| null` | yes |  |
| lastSuccessBytes | `number \| null` | yes |  |
| lastDurationMs | `number \| null` | yes |  |

### BackupFile

| Field | Type | Required |
|---|---|---|
| name | `string` | yes |
| bytes | `number` | yes |
| createdAt | `string` | yes |

### BackupView

| Field | Type | Required |
|---|---|---|
| config | `BackupConfigInput` | yes |
| folder | `string` | yes |
| defaultFolder | `string` | yes |
| hostFolder | `string \| null` | yes |
| container | `boolean` | yes |
| running | `boolean` | yes |
| nextRunAt | `string \| null` | yes |
| overdue | `boolean` | yes |
| status | `BackupStatus` | yes |
| files | `readonly BackupFile[]` | yes |

### BackupManifest

| Field | Type | Required |
|---|---|---|
| format | `"slopify-backup"` | yes |
| schemaVersion | `2` | yes |
| appVersion | `string` | yes |
| databaseVersion | `number` | yes |
| backupId | `string` | yes |
| createdAt | `string` | yes |
| projects | `{ id: string; title: string; bytes: number; }[]` | yes |
| files | `number` | yes |
| bytes | `number` | yes |

### LibraryPart

| Field | Type | Required | Notes |
|---|---|---|---|
| tables | `object (inline)` | yes | inline shape at `packages/app/src/slices/storage/backup-format.ts:197` |
| fonts | `{ name: string; bytes: number; }[]` | yes |  |
| staged | `{ id: string; bytes: number; }[]` | yes |  |
| images | `{ sha256: string; mime: "image/png" \| "image/jpeg"; bytes: number; }[]` | no |  |

### UsagePart

| Field | Type | Required |
|---|---|---|
| tables | `{ telemetry_events?: Record<string, string \| number \| null>[] \| undefined; }` | yes |

### ProjectPart

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes |  |
| tables | `object (inline)` | yes | inline shape at `packages/app/src/slices/storage/backup-format.ts:223` |
| files | `{ path: string; bytes: number; }[]` | yes |  |

### ItemCounts

| Field | Type | Required |
|---|---|---|
| added | `number` | yes |
| renamed | `number` | yes |
| skipped | `number` | yes |

### BackupImportSummary

| Field | Type | Required | Notes |
|---|---|---|---|
| backup | `{ readonly id: string; readonly createdAt: string; readonly appVersion: string; }` | yes |  |
| projects | `object (inline)` | yes | inline shape at `packages/app/src/slices/storage/backup-import.ts:115` |
| prompts | `ItemCounts` | yes |  |
| entries | `ItemCounts` | yes |  |
| channels | `ItemCounts` | no |  |
| cast | `ItemCounts` | no |  |
| episodeMemories | `ItemCounts` | no |  |
| channelVideos | `ItemCounts` | no |  |
| documentThemes | `ItemCounts` | yes |  |
| narrationAliases | `ItemCounts` | yes |  |
| templates | `ItemCounts` | yes |  |
| schedules | `ItemCounts & { readonly paused: number }` | yes |  |
| voices | `ItemCounts` | yes |  |
| drafts | `ItemCounts` | yes |  |
| settings | `{ readonly added: number; readonly kept: number }` | yes |  |
| fonts | `number` | yes |  |
| usage | `{ readonly events: number; readonly alreadyImported: boolean }` | yes |  |
| files | `{ readonly count: number; readonly bytes: number }` | yes |  |

### FilesLocation

| Field | Type | Required | Notes |
|---|---|---|---|
| kind | `"data-dir" \| "root"` | yes | accepted: data-dir, root |
| root | `string` | no | only when kind is root |

Union of 2 object variants; a field present in only some variants is `Required: no`.

### SettleFilesInput

| Field | Type | Required |
|---|---|---|
| db | `DatabaseSync` | yes |
| dataDir | `string` | yes |
| fresh | `boolean` | yes |

### MoveProgress

| Field | Type | Required | Notes |
|---|---|---|---|
| target | `string` | yes |  |
| phase | `MovePhase` | yes | accepted: done, failed, copying, interrupted, verifying |
| files | `number` | yes |  |
| totalFiles | `number` | yes |  |
| bytes | `number` | yes |  |
| totalBytes | `number` | yes |  |
| error | `string \| null` | yes |  |
| oldFolder | `string \| null` | yes |  |

### FilesView

| Field | Type | Required |
|---|---|---|
| docker | `boolean` | yes |
| folder | `string \| null` | yes |
| projects | `string \| null` | yes |
| backups | `string \| null` | yes |
| exports | `string \| null` | yes |
| inDataDir | `boolean` | yes |
| documentsRoot | `string \| null` | yes |
| inDocuments | `boolean` | yes |
| move | `MoveProgress \| null` | yes |
| dockerCommand | `string \| null` | yes |

### PortableImportResult

| Field | Type | Required |
|---|---|---|
| settings | `number` | yes |
| prompts | `number` | yes |
| entries | `number` | yes |
| voices | `number` | yes |
| templates | `number` | yes |
| fonts | `number` | yes |
| fontFallbacks | `number` | yes |
| stagedFiles | `number` | yes |

### StorageUsage

| Field | Type | Required | Notes |
|---|---|---|---|
| data | `number` | yes |  |
| projects | `number` | yes |  |
| staging | `number` | yes |  |
| trash | `{ readonly projects: number; readonly bytes: number }` | yes |  |
| byProject | `object[] (inline)` | yes | inline shape at `packages/app/src/slices/storage/portable.ts:171` |

### ProjectStorage

| Field | Type | Required |
|---|---|---|
| outputsBytes | `number` | yes |
| workingBytes | `number` | yes |
| removableFiles | `number` | yes |
| removableBytes | `number` | yes |
| finished | `boolean` | yes |

### TrashItem

| Field | Type | Required | Notes |
|---|---|---|---|
| kind | `"prompt" \| "schedule" \| "template" \| "entry" \| "project"` | yes | accepted: prompt, schedule, template, entry, project |
| id | `string` | yes |  |
| name | `string` | yes |  |
| detail | `string \| null` | yes |  |
| deletedAt | `string` | yes |  |
| purgeAt | `string` | yes |  |
| daysLeft | `number` | yes |  |

### Restored

| Field | Type | Required | Notes |
|---|---|---|---|
| kind | `"prompt" \| "schedule" \| "template" \| "entry" \| "project"` | yes | accepted: prompt, schedule, template, entry, project |
| id | `string` | yes |  |
| name | `string` | yes |  |
| renamedFrom | `string \| null` | yes |  |

### TrashResult

| Field | Type | Required | Notes |
|---|---|---|---|
| ok | `true \| false` | yes |  |
| value | `T` | no | not in every variant |
| reason | `TrashRefusal` | no | accepted: running, files, not-found, template-in-trash, template-gone; not in every variant |
| detail | `string` | no | not in every variant |

Union of 2 object variants; a field present in only some variants is `Required: no`.

### PrepareResult

| Field | Type | Required | Notes |
|---|---|---|---|
| ok | `true \| false` | yes |  |
| projectId | `string` | no | ok variant |
| title | `string` | no | ok variant |
| reason | `string` | no | refusal variant; the route names `not-found`, `already-prepared`, `missing-template`, `spend-limit` (`packages/app/src/edge/http/schedules.ts:225`) |
| detail | `string` | no | refusal variant |

Union of 2 object variants; a field present in only some variants is `Required: no`.

### UploadMarkResult

| Field | Type | Required | Notes |
|---|---|---|---|
| ok | `true \| false` | yes |  |
| uploadedAt | `string \| null` | no | not in every variant |
| reason | `"not-found"` | no | not in every variant |

Union of 2 object variants; a field present in only some variants is `Required: no`.

### AutostartView

| Field | Type | Required | Notes |
|---|---|---|---|
| kind | `"native" \| "docker"` | yes | accepted: native, docker |
| available | `boolean` | yes |  |
| enabled | `boolean \| null` | yes |  |
| summary | `string` | yes |  |
| where | `string \| null` | yes |  |
| howTo | `string \| null` | yes |  |
| checkedAt | `string \| null` | yes |  |
| offer | `boolean` | yes |  |

### AutostartBody

| Field | Type | Required |
|---|---|---|
| enabled | `boolean` | yes |

### SampleProjects

| Field | Type | Required |
|---|---|---|
| library | `string \| null` | yes |
| audiobook | `string \| null` | yes |
| podcast | `string \| null` | yes |

### FirstRunView

| Field | Type | Required | Notes |
|---|---|---|---|
| show | `boolean` | yes |  |
| settle | `boolean` | yes |  |
| voice | `{ keyed: string \| null; system: { available: boolean; engine: string \| null; issue: string \| null; }; }` | yes |  |
| sampleProjectId | `string \| null` | yes |  |
| samples | `{ library: string \| null; audiobook: string \| null; podcast: string \| null; }` | yes |  |
| clis | `object[] (inline)` | yes | inline shape at `packages/app/src/slices/onboarding/model.ts:41` |
| packs | `{ id: string; name: string; summary: string; installed: boolean; templateId: string \| null; }[]` | yes |  |

### QuickShortInput

| Field | Type | Required |
|---|---|---|
| topic | `string` | yes |
| requestId | `string` | yes |
| packId | `string` | no |

### PackPrompt

| Field | Type | Required | Notes |
|---|---|---|---|
| key | `PackPromptKey` | yes | accepted: image, article, thumbnail, description, shorts, shortScript |
| kind | `PromptKind` | yes | accepted: image, article, thumbnail, description, narration, shorts, script, review |
| name | `string` | yes |  |
| body | `string` | yes |  |

### PackVoice

| Field | Type | Required |
|---|---|---|
| provider | `"openai-tts"` | yes |
| model | `string` | yes |
| voiceId | `string` | yes |
| name | `string` | yes |

### PackStyle

| Field | Type | Required | Notes |
|---|---|---|---|
| research | `boolean` | yes |  |
| expectedWords | `number` | yes |  |
| imagesPerVideo | `number` | yes |  |
| imageSeconds | `number` | yes |  |
| zoomPercent | `number` | yes |  |
| motionStyle | `"zoom" \| "pan" \| "mixed" \| "still"` | yes | accepted: zoom, pan, mixed, still |
| captions | `{ readonly fontSize: number; readonly position: (typeof subtitlePositions)[number]; }` | yes |  |
| videoEdit | `VideoEditSettings` | yes |  |

### StarterPack

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| name | `string` | yes |
| summary | `string` | yes |
| prompts | `readonly PackPrompt[]` | yes |
| voice | `PackVoice` | yes |
| style | `PackStyle` | yes |

### SampleRecord

| Field | Type | Required |
|---|---|---|
| projectId | `string` | yes |
| seededAt | `string` | yes |

### PackRecord

| Field | Type | Required |
|---|---|---|
| installedAt | `string` | yes |
| prompts | `Record<string, string>` | yes |
| voice | `string` | no |
| template | `string` | no |

### PatchNoteSummary

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| title | `string` | yes |
| date | `string` | yes |
| version | `string` | no |
| range | `string` | no |

### PatchNotesView

| Field | Type | Required |
|---|---|---|
| version | `string` | yes |
| current | `string \| null` | yes |
| due | `string \| null` | yes |
| notes | `readonly PatchNoteSummary[]` | yes |

### CollectorEvent

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes |  |
| machineId | `string` | yes |  |
| type | `TelemetryEventType` | yes | accepted: install, project.created, stage.completed |
| payload | `TelemetryPayload` | yes |  |
| createdAt | `string` | yes |  |

### Tokens

| Field | Type | Required |
|---|---|---|
| tokensIn | `number` | yes |
| tokensOut | `number` | yes |

### TelemetryCounters

| Field | Type | Required | Notes |
|---|---|---|---|
| stage | `StageKind` | no | accepted: research, article, audio, images, thumbnail, video, document |
| segment | `AudioSegment` | no | accepted: body, intro, outro |
| provider | `string` | no |  |
| model | `string` | no |  |
| tokensIn | `number` | no |  |
| tokensOut | `number` | no |  |
| audioSeconds | `number` | no |  |
| images | `number` | no |  |
| thumbnails | `number` | no |  |
| descriptions | `number` | no |  |
| shorts | `number` | no |  |

### TelemetryPayload

| Field | Type | Required | Notes |
|---|---|---|---|
| appVersion | `string` | yes |  |
| stage | `StageKind` | no | accepted: research, article, audio, images, thumbnail, video, document |
| segment | `AudioSegment` | no | accepted: body, intro, outro |
| provider | `string` | no |  |
| model | `string` | no |  |
| tokensIn | `number` | no |  |
| tokensOut | `number` | no |  |
| audioSeconds | `number` | no |  |
| images | `number` | no |  |
| thumbnails | `number` | no |  |
| descriptions | `number` | no |  |
| shorts | `number` | no |  |

### TelemetryEvent

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes |  |
| type | `TelemetryEventType` | yes | accepted: install, project.created, stage.completed |
| payload | `TelemetryPayload` | yes |  |
| createdAt | `string` | yes |  |
| deliveredAt | `string \| null` | yes |  |

### Machine

| Field | Type | Required |
|---|---|---|
| machineId | `string` | yes |
| noticeSeenAt | `string \| null` | yes |
| appVersion | `string` | yes |

### UsageCounters

| Field | Type | Required |
|---|---|---|
| videosMade | `number` | yes |
| audioSeconds | `number` | yes |
| imagesMade | `number` | yes |
| tokensUsed | `number` | yes |
| projects | `number` | yes |

### StageTokens

| Field | Type | Required | Notes |
|---|---|---|---|
| stage | `StageKind` | yes | accepted: research, article, audio, images, thumbnail, video, document |
| provider | `string` | yes |  |
| model | `string \| null` | yes |  |
| tokensIn | `number` | yes |  |
| tokensOut | `number` | yes |  |

### UsageInput

| Field | Type | Required |
|---|---|---|
| events | `readonly TelemetryEvent[]` | yes |
| machineId | `string \| null` | yes |
| appVersion | `string` | yes |

### TutorialPageSummary

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| title | `string` | yes |

### TutorialGroup

| Field | Type | Required |
|---|---|---|
| title | `string` | yes |
| pages | `readonly TutorialPageSummary[]` | yes |

### TutorialsIndex

| Field | Type | Required |
|---|---|---|
| home | `TutorialPageSummary` | yes |
| groups | `readonly TutorialGroup[]` | yes |
| pages | `readonly TutorialPageSummary[]` | yes |
| footer | `string` | yes |

### TutorialHit

| Field | Type | Required |
|---|---|---|
| page | `string` | yes |
| pageTitle | `string` | yes |
| anchor | `string` | yes |
| heading | `string \| undefined` | yes |
| snippet | `string` | yes |

### TutorialBook

| Field | Type | Required |
|---|---|---|
| index | `TutorialsIndex` | yes |
| pages | `ReadonlyMap<string, string>` | yes |

### UpdateInfo

| Field | Type | Required | Notes |
|---|---|---|---|
| currentVersion | `string` | yes |  |
| latestVersion | `string \| null` | yes |  |
| available | `boolean` | yes |  |
| busy | `boolean` | yes |  |
| canUpdate | `boolean` | yes |  |
| blockedReason | `string` | no |  |
| status | `UpdateStatus` | yes | accepted: error, waiting, idle, checking, installing, restarting |
| error | `string` | no |  |
| pendingVersion | `string` | no |  |
| waitingFor | `string` | no |  |

### ProjectListBody

| Field | Type | Required |
|---|---|---|
| projects | `readonly ProjectListing[]` | yes |

### ProjectBody

| Field | Type | Required |
|---|---|---|
| revisionId | `string \| null` | yes |
| resumable | `boolean` | yes |
| project | `ProjectSummary` | yes |
| stages | `readonly Stage[]` | yes |
| outputs | `readonly Output[]` | yes |

### CreatedProjectBody

| Field | Type | Required |
|---|---|---|
| project | `ProjectSummary` | yes |
| stages | `readonly Stage[]` | yes |

### StagingListBody

| Field | Type | Required |
|---|---|---|
| files | `readonly StagedFile[]` | yes |

### NoticeBody

| Field | Type | Required |
|---|---|---|
| seen | `boolean` | yes |
| appVersion | `string` | no |

### ProviderListBody

| Field | Type | Required |
|---|---|---|
| providers | `readonly ProviderStatus[]` | yes |

### VoiceListBody

| Field | Type | Required |
|---|---|---|
| voices | `readonly Voice[]` | yes |

### PromptListBody

| Field | Type | Required |
|---|---|---|
| prompts | `readonly (Prompt & { readonly photorealistic?: true \| undefined })[]` | yes |

### EntryListBody

| Field | Type | Required |
|---|---|---|
| entries | `readonly Entry[]` | yes |

### DocumentThemeListBody

| Field | Type | Required |
|---|---|---|
| builtIns | `readonly { readonly name: DocumentThemeName; readonly label: string; readonly values: DocumentTheme; }[]` | yes |
| themes | `readonly SavedDocumentTheme[]` | yes |

### KeyStatusBody

| Field | Type | Required | Notes |
|---|---|---|---|
| provider | `ProviderId` | yes | accepted: system-voice, cartesia, claude-code, codex, codex-image, elevenlabs, fal, gemini, google-image, google-tts, inworld, openai-image, openai-tts, openrouter, replicate |
| hasKey | `boolean` | yes |  |
| masked | `string \| null` | yes |  |

### BackupExportSummary

| Field | Type | Required |
|---|---|---|
| ready | `boolean` | yes |
| projects | `number` | no |
| files | `number` | no |
| bytes | `number` | no |
| detail | `string` | no |

### NotificationUrlBody

| Field | Type | Required |
|---|---|---|
| url | `string \| null` | yes |

### StudioSettingsBody

| Field | Type | Required |
|---|---|---|
| playlists | `readonly StudioPlaylist[]` | yes |
| channelPlaylists | `Record<string, readonly StudioPlaylist[]>` | yes |
| pairing | `StudioPairingView` | yes |
| autoComment | `boolean` | no |

### PlanBody

| Field | Type | Required |
|---|---|---|
| plan | `PostingPlan` | yes |
| leadHours | `number` | yes |
| series | `readonly string[]` | yes |

### VoiceRefusal

| Field | Type | Required | Notes |
|---|---|---|---|
| field | `VoiceField` | yes | accepted: languages, name, provider, voiceId |
| message | `string` | yes |  |

### LibraryHistoryBody

| Field | Type | Required |
|---|---|---|
| versions | `readonly LibraryVersion[]` | yes |

### AuditionLine

| Field | Type | Required |
|---|---|---|
| speaker | `string` | yes |
| provider | `string` | yes |
| model | `string` | yes |
| text | `string` | yes |

### CastMemberInput

| Field | Type | Required | Notes |
|---|---|---|---|
| kind | `CastKind` | yes | accepted: object, character, creature, place |
| name | `string` | yes |  |
| aliases | `readonly string[]` | yes |  |
| description | `string` | yes |  |
| voice | `CastVoice \| null` | no |  |
| host | `boolean` | no |  |

### CatalogueStatus

| Field | Type | Required |
|---|---|---|
| updatedAt | `string` | no |
| path | `string` | no |
| warning | `string \| null` | yes |
| sync | `CatalogueSyncStatus` | no |

### SampleState

| Field | Type | Required |
|---|---|---|
| projectId | `string \| null` | yes |
| samples | `SampleProjects` | yes |

### DraftRefusal

| Field | Type | Required |
|---|---|---|
| ok | `false` | yes |
| reason | `string` | yes |
| message | `string` | yes |
| currentVersion | `number \| null` | yes |
| fields | `readonly { readonly field: string; readonly message: string }[]` | yes |
| reviewId | `string` | no |

### DraftReply

| Field | Type | Required | Notes |
|---|---|---|---|
| ok | `false \| true` | yes |  |
| reason | `string` | no | not in every variant |
| message | `string` | no | not in every variant |
| currentVersion | `number \| null` | no | not in every variant |
| fields | `readonly { readonly field: string; readonly message: string }[]` | no | not in every variant |
| reviewId | `string` | no | not in every variant |
| value | `T` | no | not in every variant |

Union of 2 object variants; a field present in only some variants is `Required: no`.

### ActionBody

| Field | Type | Required |
|---|---|---|
| redone | `readonly StageKind[]` | no |
| canceled | `readonly StageKind[]` | no |
| revisionId | `string \| null` | yes |
| resumable | `boolean` | yes |
| project | `ProjectSummary` | yes |
| stages | `readonly Stage[]` | yes |
| outputs | `readonly Output[]` | yes |

### ActionResult

| Field | Type | Required | Notes |
|---|---|---|---|
| ok | `true \| false` | yes |  |
| value | `ActionBody` | no | not in every variant |
| message | `string` | no | not in every variant |

Union of 2 object variants; a field present in only some variants is `Required: no`.

### RecoveryActionResult

| Field | Type | Required | Notes |
|---|---|---|---|
| ok | `true \| false` | yes |  |
| value | `Extract<RecoveryResult, { ok: true }>["value"]` | no | not in every variant |
| warnings | `readonly string[]` | no | not in every variant |
| message | `string` | no | not in every variant |

Union of 2 object variants; a field present in only some variants is `Required: no`.

### CheckpointGate

| Field | Type | Required | Notes |
|---|---|---|---|
| projectId | `string` | yes |  |
| revisionId | `string` | yes |  |
| checkpointId | `string` | yes |  |
| stage | `"images" \| "video" \| "audio"` | yes | accepted: images, video, audio |
| workId | `string` | yes |  |
| fingerprint | `string` | yes |  |
| state | `"held" \| "canceled" \| "configured" \| "invalidated" \| "pending-review" \| "released" \| "satisfied"` | yes | accepted: held, canceled, configured, invalidated, pending-review, released, satisfied |
| createdAt | `string` | yes |  |
| approvedAt | `string \| null` | yes |  |
| currentFingerprint | `string` | yes |  |
| dependents | `("article" \| "images" \| "video" \| "audio" \| "thumbnail" \| "research" \| "document")[]` | yes |  |
| workKeys | `string[]` | yes |  |

### CheckpointChange

| Field | Type | Required |
|---|---|---|
| revisionId | `string` | yes |
| stages | `readonly ("images" \| "video" \| "audio")[]` | yes |

### ApprovalIdentity

| Field | Type | Required |
|---|---|---|
| revisionId | `string` | yes |
| fingerprint | `string` | yes |
| idempotencyKey | `string` | yes |

### CheckpointReply

| Field | Type | Required | Notes |
|---|---|---|---|
| ok | `true \| false` | yes |  |
| value | `T` | no | not in every variant |
| reason | `CheckpointRefusal` | no | accepted: conflict, duplicate, not-found, invalid-input; not in every variant |
| message | `string` | no | not in every variant |

Union of 2 object variants; a field present in only some variants is `Required: no`.

### Review

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes |  |
| projectId | `string` | yes |  |
| revisionId | `string` | yes |  |
| itemKey | `string` | yes |  |
| stage | `"article" \| "narration" \| "images" \| "shorts" \| "thumbnail"` | yes | accepted: article, narration, images, shorts, thumbnail |
| itemFingerprint | `string` | yes |  |
| reviewFingerprint | `string` | yes |  |
| passed | `boolean` | yes |  |
| reasons | `string[]` | yes |  |
| outcome | `"redo" \| "passed" \| "flagged"` | yes | accepted: redo, passed, flagged |
| attempt | `number` | yes |  |
| action | `"overruled" \| "redone" \| null` | yes | accepted: overruled, redone |
| actionAt | `string \| null` | yes |  |
| redoState | `"pending" \| "started" \| "failed" \| null` | yes | accepted: pending, started, failed |
| redoError | `string \| null` | yes |  |
| createdAt | `string` | yes |  |
| current | `boolean` | yes |  |
| outputId | `string \| null` | yes |  |
| verdicts | `number` | yes |  |

### ReviewReply

| Field | Type | Required | Notes |
|---|---|---|---|
| ok | `true \| false` | yes |  |
| message | `string` | no | not in every variant |

Union of 2 object variants; a field present in only some variants is `Required: no`.

### RevisionRefusal

| Field | Type | Required |
|---|---|---|
| ok | `false` | yes |
| reason | `string` | yes |
| message | `string` | yes |
| currentRevisionId | `string \| null` | yes |
| fields | `readonly { readonly field: string; readonly message: string }[]` | yes |

### RevisionReply

| Field | Type | Required | Notes |
|---|---|---|---|
| ok | `false \| true` | yes |  |
| reason | `string` | no | not in every variant |
| message | `string` | no | not in every variant |
| currentRevisionId | `string \| null` | no | not in every variant |
| fields | `readonly { readonly field: string; readonly message: string }[]` | no | not in every variant |
| value | `T` | no | not in every variant |

Union of 2 object variants; a field present in only some variants is `Required: no`.

### NarrationChunkOrder

| Field | Type | Required |
|---|---|---|
| body | `readonly string[]` | no |
| intro | `readonly string[]` | no |
| outro | `readonly string[]` | no |

### ScheduleReply

| Field | Type | Required | Notes |
|---|---|---|---|
| ok | `true \| false` | yes |  |
| value | `T` | no | not in every variant |
| message | `string` | no | not in every variant |
| reason | `string` | no | not in every variant |

Union of 2 object variants; a field present in only some variants is `Required: no`.

### TemplateReply

| Field | Type | Required | Notes |
|---|---|---|---|
| ok | `true \| false` | yes |  |
| value | `T` | no | not in every variant |
| message | `string` | no | not in every variant |
| reason | `string` | no | not in every variant |

Union of 2 object variants; a field present in only some variants is `Required: no`.

### Aggregates

| Field | Type | Required |
|---|---|---|
| installs | `number` | yes |
| projects_created | `number` | yes |
| videos_made | `number` | yes |
| images_made | `number` | yes |
| thumbnails_made | `number` | yes |
| documents_made | `number` | yes |
| descriptions_made | `number` | yes |
| shorts_made | `number` | yes |
| audio_seconds | `number` | yes |
| tokens_used | `number` | yes |

### FillPayload

| Field | Type | Required |
|---|---|---|
| projectId | `string` | yes |
| waiting | `number` | no |
| item | `PackItem` | yes |
| captions | `{ readonly filename: string; readonly base64: string }` | no |
| thumbnails | `readonly { readonly filename: string; readonly contentType: string; readonly base64: string; }[]` | yes |

The extension's `PackItem` copy (`packages/extension/src/pack.ts:13`) marks `titles`, `alteredContent`, `playlists`, `scheduleAt`, `captions`, `endScreenVideoId`, `relatedVideoId` and `pinnedComment` optional and has no `pickable`.

### WorkerRequest

| Field | Type | Required | Notes |
|---|---|---|---|
| type | `"pair" \| "status" \| "payload" \| "pack" \| "filled" \| "video" \| "backfill" \| "ready" \| "stats-now" \| "upload" \| "video-done" \| "item" \| "upload-all" \| "task-result" \| "stats"` | yes | accepted: pair, status, payload, pack, filled, video, backfill, ready, stats-now, upload, video-done, item, upload-all, task-result, stats |
| base | `string` | no | only when type is pair |
| token | `string` | no | only when type is pair |
| projectId | `string` | no | filled, video, upload, video-done, item, upload-all, task-result, stats |
| short | `number \| null` | no | filled, video, upload, video-done, item, task-result, stats |
| videoId | `string` | no | video, video-done, stats |
| videos | `readonly { readonly title: string; readonly videoId: string; readonly checks?: string }[]` | no | only when type is backfill |
| close | `boolean` | no | only when type is backfill; the worker closes the sending tab (`packages/extension/src/background.ts:422`) |
| task | `"finish" \| "comment"` | no | only when type is task-result |
| ok | `boolean` | no | only when type is task-result |
| message | `string` | no | only when type is task-result |
| metrics | `Readonly<Record<string, number>>` | no | only when type is stats; Studio metric ids such as `VIDEO_THUMBNAIL_IMPRESSIONS`, mapped to the `/ext/stats` body by the worker (`packages/extension/src/background.ts:360`) |
| abVariants | `readonly { title: string \| null; thumbnail: number \| null; share: number \| null; winner: boolean }[]` | no | only when type is stats |
| last | `boolean` | no | only when type is stats |

Union of 15 object variants; a field present in only some variants is `Required: no`.

### ReadyProject

| Field | Type | Required | Notes |
|---|---|---|---|
| projectId | `string` | yes |  |
| title | `string` | yes |  |
| items | `readonly { kind: "video" \| "short"; short: number \| null; title: string; ready: boolean; uploaded: boolean; started?: boolean; scheduleAt?: string; uploadBy?: string; videoId?: string }[]` | yes | `ready`: rendered; `uploaded`: `upload_state` done; `started`: `upload_state` filled; `uploadBy`: `scheduleAt` minus `studio.leadHours` (`packages/app/src/edge/http/studio.ts:661`, `:671-679`) |

### WaitingTask

| Field | Type | Required |
|---|---|---|
| projectId | `string` | yes |
| short | `number \| null` | yes |
| videoId | `string` | yes |
| item | `PackItem` | yes |

## Relationships

Projects and runs:

- `projects` owns `stages`, `outputs`, `project_controls`, `project_revisions`, `project_assets`, `project_heads`, `revision_mutations`, `project_queue` and every 3.0 per-project table (`review_verdicts`, `provider_usage`, `plan_limit_readings`, `plan_limit_waiters`, `prompt_softening`, `youtube_description_edits`, `project_channels`, `project_uploads`, `project_trash`, `narration_retries`) and the 3.1-3.4 per-project tables (`prepared_videos`, `project_set_aside`, `youtube_videos`, `video_stats`, `ab_results`, `releases`) through `ON DELETE CASCADE` foreign keys (`packages/app/src/kernel/db/migrations/0001-init.sql:2`, `packages/app/src/kernel/db/migrations/0027-run-cost.sql:7`, `packages/app/src/kernel/db/migrations/0039-channel-essentials.sql:11`, `packages/app/src/kernel/db/migrations/0042-narration-retries.sql:5`, `packages/app/src/kernel/db/migrations/0043-prepared-videos.sql:7`, `packages/app/src/kernel/db/migrations/0044-project-set-aside.sql:6`, `packages/app/src/kernel/db/migrations/0045-youtube-videos.sql:7`, `packages/app/src/kernel/db/migrations/0047-studio-autopilot.sql:20`, `:33`, `packages/app/src/kernel/db/migrations/0048-releases.sql:7`).
- `stages` is unique on `(project_id, kind)`: one row per stage kind, seven kinds since migration 0014 added `document` and gave every existing project a skipped `document` stage (`packages/app/src/kernel/db/migrations/0014-document-stage.sql:15`). `attempts.stage_id` references `stages`; `attempts.piece_id` is a plain nullable column; `revision_id`, `work_id` and `work_piece_id` reference the revision tables with `ON DELETE SET NULL` (`packages/app/src/kernel/db/migrations/0005-revision-work.sql:80`).
- `project_queue` orders projects into `batches`; only `project_id` cascades (`packages/app/src/kernel/db/migrations/0003-batch-queue.sql:5`).
- A project's accepted RunConfig (`projects.config`, `project_revisions.config`) holds copies, not references: rendered prompt text (`RunConfig.rendered`), narration aliases, shared pronunciations, custom document theme values, cast snapshots with pictures named by SHA-256, earlier episode summaries, the channel id (`packages/app/src/slices/admission/model.ts:150`, `packages/app/src/slices/channels/model.ts:103`, `packages/app/src/slices/document/model.ts:29`). No SQL foreign key joins config JSON to library, channel or theme rows.

Revisions and rebuilds:

- `project_revisions.parent_id` and `restored_from_id` are project-scoped self references; `project_heads` selects one revision per project (`packages/app/src/kernel/db/migrations/0004-project-revisions.sql:1`). ProjectRevision embeds RunConfig, RevisionContent and fingerprints (`packages/app/src/slices/revisions/model.ts:89`).
- `revision_outputs` and `revision_pieces` reference a revision and a `project_assets` row; partial unique indexes allow one selected row per revision slot/piece key and one row per publication id, so deselected publications stay retained (`packages/app/src/kernel/db/migrations/0004-project-revisions.sql:50`). ManifestOutput embeds an Output descriptor; ManifestPiece embeds a StagePiece descriptor (`packages/app/src/slices/revisions/model.ts:106`).
- `revision_work` belongs to a revision and to a `(project_id, stage_id, kind)` stage identity; `revision_work_pieces` belong to one work row; `revision_work_reservations` grant one work key per revision to a work row and optional piece, with `logical_key`/`desired_fingerprint` set together (`packages/app/src/kernel/db/migrations/0005-revision-work.sql:2`). Submission requires the current head to still own the reservation (`packages/app/src/kernel/runner/work-authority.ts:31`).
- `rebuild_previews` belong to a revision; `rebuild_admissions` reference one preview; `revision_work.admission_id` is plain text; `revision_provided_reviews` ties a work key's dependency fingerprint to an admission (`packages/app/src/kernel/db/migrations/0005-revision-work.sql:56`).
- `revision_mutations`, `project_control_receipts`, `rebuild_admissions` and `project_recovery_requests` are keyed by `(project_id, idempotency_key)`; `checkMutation` treats the four as one idempotency namespace (`packages/app/src/slices/revisions/mutation-request.ts:37`, `packages/app/src/kernel/db/migrations/0012-project-recovery.sql:3`).
- `review_checkpoints` anchor one work row per revision and stage; `review_checkpoint_approvals` record the exact revision, checkpoint and fingerprint released (`packages/app/src/kernel/db/migrations/0007-review-checkpoints.sql:2`).
- `review_verdicts` cascade from `projects`; `revision_id` and `item_key` are plain columns; `review_fingerprint` is unique per project, so one review of one output is asked once (`packages/app/src/kernel/db/migrations/0025-automatic-reviews.sql:20`).

Play drafts, templates and schedules:

- `play_draft_attachments.draft_id` cascades from `play_drafts`; `staged_file_id` is `ON DELETE SET NULL` (`packages/app/src/kernel/db/migrations/0024-reference-attachments.sql:4`). `play_start_receipts.draft_id` has no foreign key, so a discarded draft keeps its Start receipt (`packages/app/src/kernel/db/migrations/0006-play-drafts.sql:29`). PlayStartResult lists the created project ids (`packages/app/src/slices/play-drafts/model.ts:53`).
- `project_templates` selects `head_version` in `project_template_revisions` (cascade); `project_template_instantiations` is owned by a draft and names template id/version by value (`packages/app/src/kernel/db/migrations/0008-project-templates.sql:1`).
- `schedules.template_id`/`template_version` pin a template revision by value; migration 0010 rebuilt `schedules` without its template foreign key and `schedule_runs` without its schedule foreign key, so run history outlives both (`packages/app/src/kernel/db/migrations/0010-retain-schedule-history.sql:1`). `schedule_runs.project_ids_json` lists admitted projects. `schedule_topics` cascades from `schedules` (`packages/app/src/kernel/db/migrations/0026-schedule-topic-generation.sql:14`).
- `prepared_videos` ties a project to a schedule id and the run title by value (no schedule foreign key); the scheduler's run of that title continues the project instead of starting one, and `CalendarRun.prepared` names it (`packages/app/src/slices/schedules/prepare.ts:135`, `:170`, `packages/app/src/slices/schedules/schema.ts:223`).
- `project_set_aside.revision_id` is compared with `project_heads.revision_id` by value; an edit that moves the head ends the mark (`packages/app/src/slices/uploads/repo.ts:61`).

Studio uploads (3.2-3.4):

- `youtube_videos`, `video_stats` and `ab_results` are keyed `(project_id, short)` with `short` 0 for the long video; `video_stats.video_id` and `ab_results.video_id` repeat the id by value (`packages/app/src/kernel/db/migrations/0045-youtube-videos.sql:14`, `packages/app/src/kernel/db/migrations/0047-studio-autopilot.sql:29`, `:38`).
- `releases` is keyed `(project_id, short)` with `short` 0 for the long video and cascades with its project; `line` names a posting-plan line by value (`PlanLine.name`), and the plan itself is the `settings` key `studio.postingPlan` (`packages/app/src/kernel/db/migrations/0048-releases.sql:6-14`, `packages/app/src/slices/studio/plan.ts:20`, `packages/app/src/slices/studio/releases.ts:156`). `youtube_videos` and `releases` are joined by `(project_id, short)` in code (`packages/app/src/slices/studio/calendar.ts:91-94`).
- A PackItem names its end-screen video and a short's related video by YouTube id from `youtube_videos` (`previousLongVideo`, `packages/app/src/slices/studio/videos.ts:169`; `packages/app/src/slices/studio/pack.ts:256`).
- `settings` keys added for Studio: `studio.autoComment` (`on`/`off`, `packages/app/src/edge/http/studio.ts:274`), `studio.postingPlan`, `studio.leadHours` (integer 1-168, default 24, `packages/app/src/slices/studio/releases.ts:33-44`), `studio.uploadPick.<projectId>` (`packages/app/src/slices/studio/pick.ts:21`).

Channels (3.0):

- `channels` has one `is_default = 1` row (partial unique index), created with the fixed id `00000000-0000-4000-8000-000000000001` (`packages/app/src/kernel/db/migrations/0032-channels.sql:20`, `packages/app/src/slices/channels/model.ts:6`).
- `project_templates.channel_id` and `project_channels.channel_id` carry no foreign key; a missing row or an unknown id reads as the default channel (`packages/app/src/slices/channels/repo.ts:217`, `packages/app/src/slices/channels/repo.ts:226`). A schedule's channel is its template's channel (`packages/app/src/slices/channels/repo.ts:211`).
- `cast_members`, `episode_memories` and `channel_videos` cascade from `channels`; `cast_images` cascade from `cast_members` and name bytes in `image_blobs` by `sha256` (`packages/app/src/kernel/db/migrations/0032-channels.sql:26`, `packages/app/src/kernel/db/migrations/0039-channel-essentials.sql:30`). `episode_memories.project_id` has no foreign key and is unique, so a memory outlives its project (`packages/app/src/kernel/db/migrations/0039-channel-essentials.sql:41`).
- `standalone_usage.owner_kind`/`owner_id` name a schedule or channel without a foreign key (`packages/app/src/kernel/db/migrations/0040-standalone-usage.sql:8`).

Library and settings:

- `library_versions` keys `(item_kind, item_id, version)` over `prompts` or `entries` without a foreign key; the save path deletes versions with their item (`packages/app/src/kernel/db/migrations/0031-prompt-history-and-description-edits.sql:6`, `packages/app/src/slices/library/history.ts:101`).
- `document_themes` and `narration_aliases` are referenced by nothing; projects copy their values (`packages/app/src/kernel/db/migrations/0016-document-themes.sql:1`, `packages/app/src/kernel/db/migrations/0035-narration-aliases.sql:1`).
- Trash: `project_trash` stamps a project; `deleted_at` columns stamp prompts, entries, templates and schedules; `schedules.purged_at` marks a schedule that left the trash (`packages/app/src/kernel/db/migrations/0039-channel-essentials.sql:11`). Lists skip stamped projects through `liveProject` (`packages/app/src/slices/admission/repo.ts:68`); `purgeExpired` removes rows older than `trashDays` = 30 (`packages/app/src/slices/trash/service.ts:288`, `packages/app/src/slices/trash/model.ts:10`).
- `settings` rows are key/value strings. Keys in use: `silenceGapSeconds`, `appearance`, `loudness` (`packages/app/src/slices/settings/playback.ts:24`); `tutorial.session` (`packages/app/src/slices/settings/tutorial.ts:35`); `provider.defaults`, `first-run.done` (`packages/app/src/slices/settings/first-run.ts:15`); `cli.path.<installation>` (`packages/app/src/slices/settings/cli-paths.ts:40`); `voices.realPerson` (`packages/app/src/slices/settings/voices.ts:132`); `whats-new.seen-major` (`packages/app/src/slices/settings/whats-new.ts:9`); `patchNotes.seenVersion` (`packages/app/src/slices/patch-notes/seen.ts:11`); `notificationUrl` (`packages/app/src/slices/notifications/settings.ts:7`); `backups.config`, `backups.status` (`packages/app/src/slices/backups/model.ts:8`); `files.location`, `files.move` (`packages/app/src/slices/storage/files-location.ts:27`); `library.photorealisticPrompts` (`packages/app/src/slices/library/photorealistic.ts:14`); `channel_links` (`packages/app/src/slices/youtube/edits-repo.ts:22`); `channels.importFilter.<channelId>` (`packages/app/src/slices/channels/videos.ts:40`); `schedules.held-topic-values` (`packages/app/src/slices/schedules/topics.ts:368`); `studio.playlist[.<channelId>]`, `studio.pairing`, `studio.projectPlaylists`, `studio.realFootage`, `studio.fillQueue.<hash>` (`packages/app/src/slices/studio/settings.ts:10`, `packages/app/src/slices/studio/settings.ts:117`, `packages/app/src/slices/studio/settings.ts:167`, `packages/app/src/slices/studio/settings.ts:212`); `onboarding.dismissed`, `onboarding.sample[.<id>]`, `onboarding.packs`, `onboarding.short-requests` (`packages/app/src/slices/onboarding/state.ts:11`); `autostart.answered` (`packages/app/src/edge/autostart/model.ts:30`).
- `provider_keys` is keyed by provider; `credential_generation` is a fresh UUID on every save (`packages/app/src/slices/settings/repo.ts:21`).

Collector: `events` are deduplicated by id with `INSERT OR IGNORE`; `aggregates` holds one row per counter key (`packages/collector/src/index.ts:71`, `packages/collector/src/index.ts:86`).

## Boundaries

| Boundary | Conversion | Site |
|---|---|---|
| SQLite row ↔ domain | Every repository parses rows with a zod row schema (snake_case) and maps to camelCase domain objects; JSON columns are `JSON.parse`d and re-validated by the domain schema | `packages/app/src/slices/admission/repo.ts:183`, `packages/app/src/slices/admission/repo.ts:235`, `packages/app/src/slices/revisions/repo.ts:108`, `packages/app/src/slices/revisions/manifest-repo.ts:191`, `packages/app/src/slices/play-drafts/repo.ts:7`, `packages/app/src/slices/schedules/repo.ts:461`, `packages/app/src/slices/channels/repo.ts:31` |
| Booleans | `0/1` INTEGER columns become booleans in row schemas | `packages/app/src/slices/revisions/manifest-repo.ts:16`, `packages/app/src/slices/channels/repo.ts:78` |
| Provider keys | Only `keyOf` reads the `key` column, per provider call; routes read presence and a mask (KeyStatus) | `packages/app/src/slices/settings/repo.ts:42`, `packages/app/src/slices/settings/keys.ts:18` |
| Play POST → Project | `runDraftSchema` parses RunDraft; `castVoicedRun` copies cast voices; `pickTemplates` resolves Library rows; `admit` validates and normalizes; `modelFields` checks the catalogue; `startRun` writes Project, Stage rows and RunConfig with rendered prompts | `packages/app/src/edge/http/projects.ts:57`, `packages/app/src/edge/http/project-create.ts:29`, `packages/app/src/edge/http/project-create.ts:60`, `packages/app/src/edge/http/project-create.ts:61`, `packages/app/src/edge/http/project-create.ts:66`, `packages/app/src/slices/admission/start.ts:47` |
| Draft document → RunDraft | `toAdmissionDraft` turns the string-typed PlayDraftForm into RunDraft or FieldError[] | `packages/app/src/slices/play-drafts/convert.ts:65` |
| Review → stored snapshot | `review_json` stores `{review, execution: {catalogue, attachmentIdentity, font}}`; PlayReview is the public part | `packages/app/src/slices/play-drafts/review.ts:124`, `packages/app/src/slices/play-drafts/start-repo.ts:30` |
| Revision ↔ current projection | A revision's stage rows are upserted from its config and its selected manifest outputs/pieces are written into `outputs`/`stage_pieces`, which the project page reads | `packages/app/src/slices/revisions/projection.ts:24`, `packages/app/src/slices/revisions/manifest-repo.ts:122`, `packages/app/src/slices/revisions/view.ts:7` |
| Work piece ↔ execution | `input_json` parses through `recipeInputSchema`; `recipe_context` stores the catalogue a work row runs with | `packages/app/src/slices/rebuild/work-records.ts:48`, `packages/app/src/slices/rebuild/runtime-admission.ts:101` |
| Rebuild preview/admission | `body_json` = RebuildPreview, `execution_json` = ExecutionSnapshot, `response_json` = RebuildAdmission (replayed on a repeated idempotency key) | `packages/app/src/slices/rebuild/repo.ts:76`, `packages/app/src/slices/rebuild/admission-repo.ts:39`, `packages/app/src/slices/rebuild/admission-repo.ts:84` |
| Provider call → cost rows | MeteredCall is priced (CallPrice) when the call lands and written to `provider_usage`, or `standalone_usage` for schedule/channel calls; plan windows go to `plan_limit_readings` | `packages/app/src/slices/run-cost/meter.ts:27`, `packages/app/src/slices/run-cost/meter.ts:73` |
| Runner → browser events | ProjectEvent objects are JSON-serialized onto SSE (`event` = type) by the hub; the browser `JSON.parse`s without validation | `packages/app/src/edge/events/hub.ts:105`, `packages/app/src/edge/http/app.ts:299`, `packages/web/src/events.ts:186` |
| HTTP responses → browser | Route handlers `c.json` domain objects; `packages/web/src/api.ts` names the bodies from the app's declarations (`*Body` interfaces) and casts; drafts, revisions, checkpoints and the tutorial session parse request bodies (and draft/revision responses) with the app's zod schemas; problems are RFC 9457 `application/problem+json` with `fields`/`errors` members | `packages/web/src/api.ts:94`, `packages/web/src/http.ts:24`, `packages/web/src/play/draft-api.ts:94`, `packages/web/src/project/revision-api.ts:114`, `packages/web/src/tutorial/session-api.ts:28`, `packages/app/src/edge/http/problem.ts:29` |
| Upload pack → extension | UploadPack/PackItem are copied, not imported, into the extension; the copy's PackItem makes the fields an older app omits optional and has no `pickable`; the worker base64-encodes thumbnails and captions into FillPayload, and the hidden video frame hands the video `File` to the Studio page by `postMessage` | `packages/app/src/slices/studio/model.ts:37`, `packages/extension/src/pack.ts:1`, `packages/extension/src/background.ts:96`, `packages/extension/src/video-frame.ts:28` |
| Database → backup tar | Rows travel table by table as stored (`BackupRow` cells: string, finite number, null) with the schema version they fit; project tables per project, library and usage tables once; `image_blobs` travel as files; provider keys, the machine id and `project_queue` never leave | `packages/app/src/slices/storage/backup-format.ts:38`, `packages/app/src/slices/storage/backup-format.ts:83`, `packages/app/src/slices/storage/backup-export.ts:270` |
| Backup tar → database | Import loads rows into a scratch database migrated `through` the backup's `databaseVersion`, then migrates it forward with the same files and copies rows in, renaming or skipping clashes (BackupImportSummary); `backup_imports` records the backup id once | `packages/app/src/slices/storage/backup-import.ts:159`, `packages/app/src/kernel/db/migrate.ts:10`, `packages/app/src/slices/storage/backup-import.ts:914` |
| Older .zip backup | `importPortable` reads the version-1 portable manifest (settings, library, voices, templates, fonts, staged files) and returns PortableImportResult | `packages/app/src/slices/storage/portable.ts:276`, `packages/app/src/edge/http/storage.ts:139` |
| Telemetry → collector | `telemetry_events.payload` JSON is re-read, stamped with the machine id (CollectorEvent) and posted; the collector validates with `ingestSchema` and adds `deltasFor` to `aggregates` | `packages/app/src/slices/telemetry/repo.ts:22`, `packages/app/src/slices/telemetry/collector-client.ts:6`, `packages/collector/src/index.ts:51`, `packages/collector/src/model.ts:90` |
| Catalogue YAML ↔ Catalogue | YAML parsed with `maxAliasCount: 20`, `uniqueKeys: true`, then `catalogueSchema` | `packages/app/src/catalog/store.ts:50` |
| Host CLI bridge | App ↔ host helper speaks JSON bodies (HostLlmBody, HostImageBody) and NDJSON HostFrame streams, all zod-checked on both sides | `packages/app/src/kernel/ports/host-cli.ts:72`, `packages/app/src/kernel/ports/host-cli.ts:196` |

## Validation

- HTTP input: route handlers validate `param` and `json` with `@hono/zod-validator`; a failure answers 400 problem+json with `errors[{path,message}]` via `onInvalid` (`packages/app/src/edge/http/actions.ts:236`, `packages/app/src/edge/http/problem.ts:78`). 39 route files use it; request schemas not exported from a slice are declared inline in the route file (shallow: those inline schemas, for example `packages/app/src/edge/http/studio.ts`, `packages/app/src/edge/http/settings.ts`, `packages/app/src/edge/http/providers.ts`, are not inventoried as entities).
- Admission: `runDraftSchema`/`runConfigSchema` check shape (`packages/app/src/slices/admission/schema.ts:59`, `packages/app/src/slices/admission/schema.ts:217`); `admit` applies source combinations, required provider choices, prompt counts, files and keyword values and returns FieldError[] (`packages/app/src/slices/admission/rules.ts:96`). Numeric limits: title and keyword values 200 characters, 20 images per prompt, 60 images per run, image seconds 1–600, zoom up to 50 %, silence gaps up to 30 s (`packages/app/src/slices/admission/rules.ts:35`).
- Revisions: ids 1–64 of `[0-9A-Za-z_-]`, work keys 1–256, article and template text up to 500,000 characters, `imageOrder` up to `scaledImagesMax` = 240, cue text 1–10,000 with `end > start`, strict objects (`packages/app/src/slices/revisions/schema.ts:8`, `packages/app/src/slices/images/scale.ts:41`). Save/Restore idempotency keys are UUIDs (`packages/app/src/edge/http/revisions.ts:23`).
- Work recipes: `recipeInputSchema` accepts only its discriminated `kind` branches (`packages/app/src/slices/rebuild/recipe-input-schema.ts:19`). Publication checks work/piece authority, bundle shape, registered asset identity and fingerprint before selecting an output (`packages/app/src/slices/revisions/publication-rules.ts:13`, `packages/app/src/slices/revisions/publication-rules.ts:42`).
- Drafts: PlayDraftForm/PlayDraftDocument are strict, version 1, with raw numbers kept as strings (`packages/app/src/slices/play-drafts/schema.ts:31`, `packages/app/src/slices/play-drafts/schema.ts:224`); review requires expectedWords 1–100,000 and at most 50 runs (`packages/app/src/slices/play-drafts/review-inputs.ts:71`, `packages/app/src/slices/play-drafts/review-inputs.ts:79`).
- Templates: names 1–120 characters on create and 1–200 on update (older names), UUID ids, strict PlayDraftDocument (`packages/app/src/slices/project-templates/schema.ts:6`).
- Schedules: Cadence is a discriminated union of `once` (offset datetime), `daily` and `weekly` (`HH:MM`, weekdays 0–6) (`packages/app/src/slices/schedules/calendar.ts:5`); timezone must be a valid IANA zone, the topic queue holds at most 500 items, the brief up to 4,000 characters (`packages/app/src/slices/schedules/schema.ts:33`, `packages/app/src/slices/schedules/schema.ts:76`).
- Channels: brand kit colours `#RRGGBB` (upper-cased), font ids `[A-Za-z0-9_-]{1,160}`, blank fields dropped; series brief up to 10,000 characters; cast names/aliases 1–200 characters, at most 20 aliases, descriptions up to 2,000 (`packages/app/src/slices/channels/schema.ts:16`, `packages/app/src/slices/channels/schema.ts:28`, `packages/app/src/slices/channels/schema.ts:87`, `packages/app/src/slices/channels/schema.ts:124`).
- Backups: automatic backup time `HH:MM`, keep 1–30, folder up to 1,024 characters (`packages/app/src/slices/backups/model.ts:11`); backup JSON parts are capped (256 MiB JSON, 2,000,000 rows, 50,000 projects), column names match `^[a-z][a-z0-9_]{0,63}$`, file paths must stay inside their folder (`packages/app/src/slices/storage/backup-format.ts:117`, `packages/app/src/slices/storage/backup-format.ts:127`).
- Library: `lintPrompt`/`lintEntry` check bodies and keyword slots (`packages/app/src/slices/library/lint.ts:11`); name uniqueness per kind/category is the case-insensitive partial unique index over rows not in the trash (`packages/app/src/kernel/db/migrations/0039-channel-essentials.sql:19`).
- Catalogue: unknown provider/family pairs, duplicate models and providers without concurrency limits are refused (`packages/app/src/catalog/schema.ts:85`).
- Host CLI bridge: strict schemas with 1–128 messages, text up to 2 MiB, ids up to 256 characters without control characters; frames and faults are read leniently (unknown fields dropped) (`packages/app/src/kernel/ports/host-cli.ts:64`, `packages/app/src/kernel/ports/host-cli.ts:171`).
- Studio: `postingPlanSchema` (≤ 14 rows, `name` 1-20, `series` ≤ 100 defaulting to `""`, ≤ 10 shorts each, `HH:MM` times, weekday 0-6) is parsed on write and on read, falling back to the empty plan (`packages/app/src/slices/studio/plan-model.ts:7-22`, `packages/app/src/slices/studio/plan.ts:32-46`); `studio.leadHours` is an integer 1-168 on write and reads as 24 otherwise (`packages/app/src/edge/http/studio.ts:286-300`, `packages/app/src/slices/studio/releases.ts:35-40`); `PUT /releases/:projectId` takes a strict `{short 0-99, at: ISO datetime or null, line? 1-20}` and `GET /releases` a `weeks` 1-8 (`packages/app/src/edge/http/studio.ts:302-306`, `:327-340`); `/ext/*` bodies are route-local zod schemas: video ids `^[A-Za-z0-9_-]{11}$`, `short` 1-99 or null, stats `ctr` 0-100, at most 3 `abVariantSchema` variants, backfill ≤ 200 rows of titles ≤ 200 with optional `checks` ≤ 100 and an optional `close`, task messages ≤ 2,000, upload pick indexes 0-9 (`packages/app/src/edge/http/studio.ts:115`-`:158`). `ab_results.variants` is re-parsed with `abVariantSchema` on read (`packages/app/src/slices/studio/stats.ts:117`).
- Collector: at most 500 events and 256 KiB per request, one machine per request, flat payloads of at most 20 keys (`packages/collector/src/model.ts:39`, `packages/collector/src/model.ts:75`).
- Database: CHECK constraints below enforce enums, JSON validity (`json_valid`, text only, not shape), non-negative sizes and trimmed name lengths. Some legacy columns carry no SQL enum (`stages.source`, `stage_pieces.kind`/`state`, `attempts.outcome`, `outputs.role`); their row schemas check them (`packages/app/src/slices/admission/repo.ts:29`, `packages/app/src/kernel/runner/piece-repo.ts:32`). Writes that span tables run inside `transact` (a SAVEPOINT) (`packages/app/src/kernel/db/tx.ts:9`).

## Schema

DDL below is the text SQLite holds after every migration runs in filename order (`packages/app/src/kernel/db/migrate.ts:16`); a quoted table name marks a table a later migration rebuilt, and `ALTER TABLE ... ADD COLUMN` columns appear at the end of their row. Each migration runs in one transaction and records its version in `schema_migrations`; a database newer than the newest known file is refused (`packages/app/src/kernel/db/migrate.ts:24`). A migration whose first line is `-- foreign-keys: off` runs with enforcement off and must pass `PRAGMA foreign_key_check` before commit (`packages/app/src/kernel/db/migrate.ts:44`). Version numbers 0020, 0021, 0023, 0028, 0029, 0033 and 0036 have no file. Migration 0017 inserts a saved `DiceMaster` document theme only on installs that already used the Document stage; 0022 deletes duplicate held work rows (`packages/app/src/kernel/db/migrations/0017-legacy-dicemaster-theme.sql:7`, `packages/app/src/kernel/db/migrations/0022-drop-duplicate-held-work.sql:15`).

### projects

```sql
CREATE TABLE "projects" (id TEXT PRIMARY KEY, title TEXT NOT NULL CHECK(length(title) <= 200), format TEXT NOT NULL CHECK(format IN ('16:9','9:16','1:1')), config TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
```

Migrations: `packages/app/src/kernel/db/migrations/0001-init.sql:1`, `packages/app/src/kernel/db/migrations/0049-square-format.sql:6`, which rebuilds the table to widen the `format` CHECK with `1:1`, copying every row and running with foreign-key enforcement off (`-- foreign-keys: off`, `:1`). Code model: Project via `projectRow` (`packages/app/src/slices/admission/repo.ts:11`); `config` parsed by `runConfigSchema` (`packages/app/src/slices/admission/repo.ts:235`).

### stages

```sql
CREATE TABLE "stages" (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, kind TEXT NOT NULL CHECK(kind IN ('research','article','audio','images','thumbnail','video','document')), source TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('pending','running','done','failed','canceled','provided','skipped')), failure_reason TEXT, attempt_count INTEGER NOT NULL DEFAULT 0, progress_current INTEGER, progress_total INTEGER, started_at TEXT, finished_at TEXT, retry_at TEXT, failure_kind TEXT, UNIQUE(project_id, kind));
CREATE UNIQUE INDEX stages_project_identity ON stages(project_id,id,kind);
```

Migrations: `packages/app/src/kernel/db/migrations/0001-init.sql:2`, `packages/app/src/kernel/db/migrations/0005-revision-work.sql:1`, `packages/app/src/kernel/db/migrations/0014-document-stage.sql:9`, `packages/app/src/kernel/db/migrations/0030-automatic-retries.sql:9`. Code model: Stage via `stageRow` (`packages/app/src/slices/admission/repo.ts:29`).

### attempts

```sql
CREATE TABLE attempts (id TEXT PRIMARY KEY, stage_id TEXT NOT NULL REFERENCES stages(id) ON DELETE CASCADE, piece_id TEXT, n INTEGER NOT NULL, started_at TEXT NOT NULL, ended_at TEXT, outcome TEXT, error_text TEXT, revision_id TEXT REFERENCES project_revisions(id) ON DELETE SET NULL, work_id TEXT REFERENCES revision_work(id) ON DELETE SET NULL, work_piece_id TEXT REFERENCES revision_work_pieces(id) ON DELETE SET NULL);
```

Migrations: `packages/app/src/kernel/db/migrations/0001-init.sql:3`, `packages/app/src/kernel/db/migrations/0005-revision-work.sql:80`. Code model: Attempt via `attemptRow` (`packages/app/src/kernel/runner/attempt-repo.ts:52`).

### stage_pieces

```sql
CREATE TABLE stage_pieces (id TEXT PRIMARY KEY, stage_id TEXT NOT NULL REFERENCES stages(id) ON DELETE CASCADE, kind TEXT NOT NULL, idx INTEGER NOT NULL, state TEXT NOT NULL, payload TEXT, UNIQUE(stage_id, kind, idx));
```

Migrations: `packages/app/src/kernel/db/migrations/0001-init.sql:4`. Code model: StagePiece via `pieceRow` (`packages/app/src/kernel/runner/piece-repo.ts:32`).

### outputs

```sql
CREATE TABLE outputs (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, stage_kind TEXT NOT NULL, role TEXT NOT NULL, path TEXT NOT NULL, original_filename TEXT, bytes INTEGER NOT NULL, duration_ms INTEGER, meta TEXT, created_at TEXT NOT NULL);
CREATE INDEX outputs_project ON outputs(project_id, stage_kind);
```

Migrations: `packages/app/src/kernel/db/migrations/0001-init.sql:5`. Code model: Output via `outputRow` (`packages/app/src/slices/storage/repo.ts:8`).

### prompts

```sql
CREATE TABLE "prompts" (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('article','image','thumbnail','narration','description','shorts','review','script')),
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  slots TEXT NOT NULL,
  updated_at TEXT NOT NULL
, deleted_at TEXT);
CREATE UNIQUE INDEX prompts_name ON prompts(kind,lower(name)) WHERE deleted_at IS NULL;
```

Migrations: `packages/app/src/kernel/db/migrations/0001-init.sql:7`, `packages/app/src/kernel/db/migrations/0011-narration-prompts.sql:11`, `packages/app/src/kernel/db/migrations/0015-description-prompts.sql:11`, `packages/app/src/kernel/db/migrations/0019-shorts-prompts.sql:14`, `packages/app/src/kernel/db/migrations/0025-automatic-reviews.sql:14`, `packages/app/src/kernel/db/migrations/0034-script-prompts.sql:17`, `packages/app/src/kernel/db/migrations/0039-channel-essentials.sql:15`. Code model: Prompt via `promptRow` (`packages/app/src/slices/library/repo.ts:8`).

### entries

```sql
CREATE TABLE entries (id TEXT PRIMARY KEY, category TEXT NOT NULL CHECK(category IN ('intro','outro')), mode TEXT NOT NULL CHECK(mode IN ('text','llm')), name TEXT NOT NULL, body TEXT NOT NULL, slots TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
CREATE UNIQUE INDEX entries_name ON entries(category,lower(name)) WHERE deleted_at IS NULL;
```

Migrations: `packages/app/src/kernel/db/migrations/0001-init.sql:9`, `packages/app/src/kernel/db/migrations/0039-channel-essentials.sql:16`. Code model: Entry via `entryRow` (`packages/app/src/slices/library/repo.ts:17`).

### provider_keys

```sql
CREATE TABLE provider_keys (provider TEXT PRIMARY KEY, key TEXT NOT NULL, updated_at TEXT NOT NULL, credential_generation TEXT NOT NULL DEFAULT 'legacy');
```

Migrations: `packages/app/src/kernel/db/migrations/0001-init.sql:11`, `packages/app/src/kernel/db/migrations/0012-project-recovery.sql:1`. Code model: none; `keyOf` reads the `key` column for one provider call (`packages/app/src/slices/settings/repo.ts:42`), KeyStatus exposes presence and mask only.

### voices

```sql
CREATE TABLE voices (id TEXT PRIMARY KEY, provider TEXT NOT NULL, name TEXT NOT NULL, voice_id TEXT NOT NULL, languages_json TEXT CHECK (languages_json IS NULL OR json_valid(languages_json)), UNIQUE(provider, voice_id));
```

Migrations: `packages/app/src/kernel/db/migrations/0001-init.sql:12`, `packages/app/src/kernel/db/migrations/0038-voice-languages.sql:7`. Code model: Voice via `voiceRow` (`packages/app/src/slices/settings/repo.ts:11`).

### settings

```sql
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
```

Migrations: `packages/app/src/kernel/db/migrations/0001-init.sql:13`. Code model: key/value strings via `readSetting`/`writeSetting` (`packages/app/src/slices/settings/repo.ts:96`); each key's value has its own schema (see Relationships).

### staged_files

```sql
CREATE TABLE staged_files (id TEXT PRIMARY KEY, stage_kind TEXT NOT NULL, path TEXT NOT NULL, original_filename TEXT NOT NULL, bytes INTEGER NOT NULL, state TEXT NOT NULL, created_at TEXT NOT NULL);
```

Migrations: `packages/app/src/kernel/db/migrations/0001-init.sql:14`. Code model: StagedFile via `stagedFileRow` (`packages/app/src/slices/storage/repo.ts:21`).

### telemetry_events

```sql
CREATE TABLE telemetry_events (id TEXT PRIMARY KEY, type TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, delivered_at TEXT);
```

Migrations: `packages/app/src/kernel/db/migrations/0001-init.sql:15`. Code model: TelemetryEvent via `eventRow` (`packages/app/src/slices/telemetry/repo.ts:6`).

### machine

```sql
CREATE TABLE machine (machine_id TEXT PRIMARY KEY, notice_seen_at TEXT, app_version TEXT NOT NULL);
```

Migrations: `packages/app/src/kernel/db/migrations/0001-init.sql:16`. Code model: Machine via `machineRow` (`packages/app/src/slices/telemetry/repo.ts:14`).

### schema_migrations

```sql
CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
```

Migrations: `packages/app/src/kernel/db/migrations/0001-init.sql:17`. Code model: none; read by `appliedVersions` (`packages/app/src/kernel/db/migrate.ts:99`).

### project_controls

```sql
CREATE TABLE project_controls (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  paused INTEGER NOT NULL DEFAULT 0 CHECK(paused IN (0, 1))
);
```

Migrations: `packages/app/src/kernel/db/migrations/0002-project-controls.sql:1`. Code model: Project.paused (`paused` column of `projectRow`, `packages/app/src/slices/admission/repo.ts:18`).

### batches

```sql
CREATE TABLE batches (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
```

Migrations: `packages/app/src/kernel/db/migrations/0003-batch-queue.sql:1`. Code model: none; existence checks in `packages/app/src/slices/batch/index.ts:39`.

### project_queue

```sql
CREATE TABLE project_queue (
  position INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  batch_id TEXT NOT NULL REFERENCES batches(id),
  state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','active','finished'))
);
CREATE INDEX project_queue_state ON project_queue(state, position);
```

Migrations: `packages/app/src/kernel/db/migrations/0003-batch-queue.sql:5`. Code model: QueueEntry via `queueRow` (`packages/app/src/slices/batch/index.ts:13`).

### project_revisions

```sql
CREATE TABLE project_revisions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id TEXT,
  restored_from_id TEXT,
  config TEXT NOT NULL CHECK(json_valid(config)),
  content TEXT NOT NULL CHECK(json_valid(content)),
  fingerprints TEXT NOT NULL CHECK(json_valid(fingerprints)),
  created_at TEXT NOT NULL,
  UNIQUE(project_id, id),
  FOREIGN KEY(project_id, parent_id)
    REFERENCES project_revisions(project_id, id),
  FOREIGN KEY(project_id, restored_from_id)
    REFERENCES project_revisions(project_id, id)
);
CREATE INDEX project_revisions_project ON project_revisions(project_id, created_at, id);
```

Migrations: `packages/app/src/kernel/db/migrations/0004-project-revisions.sql:1`. Code model: ProjectRevision via `revisionRow` + `projectRevisionSchema` (`packages/app/src/slices/revisions/repo.ts:15`).

### project_heads

```sql
CREATE TABLE project_heads (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  revision_id TEXT NOT NULL,
  FOREIGN KEY(project_id, revision_id)
    REFERENCES project_revisions(project_id, id) ON DELETE CASCADE
);
```

Migrations: `packages/app/src/kernel/db/migrations/0004-project-revisions.sql:17`. Code model: none; head id read in `packages/app/src/slices/revisions/repo.ts:60`.

### project_assets

```sql
CREATE TABLE project_assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path TEXT NOT NULL CHECK(length(path) > 0),
  bytes INTEGER CHECK(bytes IS NULL OR bytes >= 0),
  created_at TEXT NOT NULL,
  UNIQUE(project_id, id),
  UNIQUE(project_id, path)
);
```

Migrations: `packages/app/src/kernel/db/migrations/0004-project-revisions.sql:23`. Code model: ProjectAsset via `assetRow` (`packages/app/src/slices/revisions/repo.ts:25`).

### revision_outputs

```sql
CREATE TABLE revision_outputs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  slot TEXT NOT NULL,
  work_key TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('ready','outdated','review')),
  descriptor TEXT NOT NULL CHECK(json_valid(descriptor)),
  publication_id TEXT,
  selected INTEGER NOT NULL CHECK(selected IN (0,1)),
  created_at TEXT NOT NULL,
  FOREIGN KEY(project_id, revision_id)
    REFERENCES project_revisions(project_id, id) ON DELETE CASCADE,
  FOREIGN KEY(project_id, asset_id)
    REFERENCES project_assets(project_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX revision_outputs_selected ON revision_outputs(revision_id, slot)
  WHERE selected = 1;
CREATE INDEX revision_outputs_revision ON revision_outputs(revision_id, created_at, id);
CREATE UNIQUE INDEX revision_outputs_publication ON revision_outputs(revision_id, publication_id, slot)
  WHERE publication_id IS NOT NULL;
```

Migrations: `packages/app/src/kernel/db/migrations/0004-project-revisions.sql:32`. Code model: RevisionOutputRecord via `commonRow` + `outputSchema` (`packages/app/src/slices/revisions/manifest-repo.ts:17`).

### revision_pieces

```sql
CREATE TABLE "revision_pieces" (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  piece_key TEXT NOT NULL,
  stage_kind TEXT NOT NULL CHECK(stage_kind IN
    ('research','article','audio','images','thumbnail','video','document')),
  asset_id TEXT,
  fingerprint TEXT NOT NULL,
  descriptor TEXT NOT NULL CHECK(json_valid(descriptor)),
  publication_id TEXT,
  selected INTEGER NOT NULL CHECK(selected IN (0,1)),
  created_at TEXT NOT NULL,
  FOREIGN KEY(project_id, revision_id)
    REFERENCES project_revisions(project_id, id) ON DELETE CASCADE,
  FOREIGN KEY(project_id, asset_id)
    REFERENCES project_assets(project_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX revision_pieces_selected ON revision_pieces(revision_id, piece_key)
  WHERE selected = 1;
CREATE INDEX revision_pieces_revision ON revision_pieces(revision_id, created_at, id);
CREATE UNIQUE INDEX revision_pieces_publication ON revision_pieces(revision_id, publication_id, piece_key)
  WHERE publication_id IS NOT NULL;
```

Migrations: `packages/app/src/kernel/db/migrations/0004-project-revisions.sql:55`, `packages/app/src/kernel/db/migrations/0014-document-stage.sql:38`. Code model: RevisionPieceRecord via `commonRow` + `stagePieceSchema` (`packages/app/src/slices/revisions/manifest-repo.ts:17`).

### revision_mutations

```sql
CREATE TABLE revision_mutations (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('save','restore')),
  request_hash TEXT NOT NULL,
  base_revision_id TEXT NOT NULL,
  result_revision_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(project_id, idempotency_key),
  FOREIGN KEY(project_id, base_revision_id)
    REFERENCES project_revisions(project_id, id) ON DELETE CASCADE,
  FOREIGN KEY(project_id, result_revision_id)
    REFERENCES project_revisions(project_id, id) ON DELETE CASCADE
);
```

Migrations: `packages/app/src/kernel/db/migrations/0004-project-revisions.sql:78`. Code model: MutationIdentity (`packages/app/src/slices/revisions/mutation-request.ts:44`).

### revision_work

```sql
CREATE TABLE revision_work (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL,
 revision_id TEXT NOT NULL,
 stage_id TEXT NOT NULL,
 kind TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 admission_id TEXT,
 recipe_context TEXT CHECK(recipe_context IS NULL OR json_valid(recipe_context)),
 progress_current REAL,
 progress_total REAL,
 state TEXT NOT NULL CHECK(state IN ('pending','running','done','failed','canceled')),
 dispatch_state TEXT NOT NULL CHECK(dispatch_state IN ('held','allowed','draining')),
 failure_reason TEXT,
 created_at TEXT NOT NULL, auto_retries INTEGER NOT NULL DEFAULT 0, retry_at TEXT, failure_kind TEXT,
 UNIQUE(project_id,id),
 FOREIGN KEY(project_id,revision_id) REFERENCES project_revisions(project_id,id) ON DELETE CASCADE,
 FOREIGN KEY(project_id,stage_id,kind) REFERENCES stages(project_id,id,kind) ON DELETE CASCADE
);
CREATE INDEX revision_work_stage ON revision_work(revision_id,stage_id);
CREATE INDEX revision_work_dispatch ON revision_work(project_id,dispatch_state,state);
CREATE UNIQUE INDEX revision_work_revision_identity ON revision_work(project_id,revision_id,id);
CREATE INDEX revision_work_retry ON revision_work(retry_at) WHERE retry_at IS NOT NULL;
```

Migrations: `packages/app/src/kernel/db/migrations/0005-revision-work.sql:2`, `packages/app/src/kernel/db/migrations/0007-review-checkpoints.sql:1`, `packages/app/src/kernel/db/migrations/0022-drop-duplicate-held-work.sql:52`, `packages/app/src/kernel/db/migrations/0030-automatic-retries.sql:5`. Code model: none as one type; WorkRef identity (`packages/app/src/kernel/runner/work.ts:15`), rows read ad hoc across `packages/app/src/slices/rebuild/`.

### revision_work_pieces

```sql
CREATE TABLE revision_work_pieces (
 id TEXT PRIMARY KEY,
 work_id TEXT NOT NULL REFERENCES revision_work(id) ON DELETE CASCADE,
 work_key TEXT NOT NULL,
 request_fingerprint TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 input_json TEXT NOT NULL CHECK(json_valid(input_json)),
 logical_fingerprint TEXT,
 result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
 continuation TEXT,
 generation_token TEXT,
 state TEXT NOT NULL CHECK(state IN ('pending','running','done','failed','held')),
 dispatch_state TEXT NOT NULL CHECK(dispatch_state IN ('held','allowed','draining')),
 submitted_at TEXT,
 UNIQUE(work_id,id),
 UNIQUE(work_id,work_key)
);
CREATE INDEX revision_piece_dispatch ON revision_work_pieces(work_id,dispatch_state,state);
```

Migrations: `packages/app/src/kernel/db/migrations/0005-revision-work.sql:23`. Code model: WorkPiece via `pieceRow` (`packages/app/src/slices/rebuild/work-records.ts:19`).

### revision_work_reservations

```sql
CREATE TABLE revision_work_reservations (
 project_id TEXT NOT NULL,
 revision_id TEXT NOT NULL,
 work_key TEXT NOT NULL,
 work_id TEXT NOT NULL,
 piece_id TEXT,
 fingerprint TEXT NOT NULL,
 logical_key TEXT,
 desired_fingerprint TEXT,
 CHECK((logical_key IS NULL) = (desired_fingerprint IS NULL)),
 PRIMARY KEY(revision_id,work_key),
 FOREIGN KEY(project_id,revision_id) REFERENCES project_revisions(project_id,id) ON DELETE CASCADE,
 FOREIGN KEY(project_id,work_id) REFERENCES revision_work(project_id,id) ON DELETE CASCADE,
 FOREIGN KEY(work_id,piece_id) REFERENCES revision_work_pieces(work_id,id) ON DELETE CASCADE
);
```

Migrations: `packages/app/src/kernel/db/migrations/0005-revision-work.sql:41`, `packages/app/src/kernel/db/migrations/0022-drop-duplicate-held-work.sql:43`. Code model: none; read ad hoc (`packages/app/src/slices/rebuild/transition-repo.ts:53`).

### rebuild_previews

```sql
CREATE TABLE rebuild_previews (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL,
 revision_id TEXT NOT NULL,
 plan_fingerprint TEXT NOT NULL,
 body_json TEXT NOT NULL CHECK(json_valid(body_json)),
 execution_json TEXT CHECK(execution_json IS NULL OR json_valid(execution_json)),
 created_at TEXT NOT NULL,
 UNIQUE(project_id,revision_id,id),
 FOREIGN KEY(project_id,revision_id) REFERENCES project_revisions(project_id,id) ON DELETE CASCADE
);
```

Migrations: `packages/app/src/kernel/db/migrations/0005-revision-work.sql:56`. Code model: RebuildPreview (`body_json`) and ExecutionSnapshot (`execution_json`, `packages/app/src/slices/rebuild/admission-repo.ts:84`).

### rebuild_admissions

```sql
CREATE TABLE rebuild_admissions (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL,
 revision_id TEXT NOT NULL,
 idempotency_key TEXT NOT NULL,
 request_hash TEXT NOT NULL,
 preview_id TEXT NOT NULL,
 response_json TEXT NOT NULL CHECK(json_valid(response_json)),
 created_at TEXT NOT NULL,
 UNIQUE(project_id,idempotency_key),
 FOREIGN KEY(project_id,revision_id) REFERENCES project_revisions(project_id,id) ON DELETE CASCADE,
 FOREIGN KEY(project_id,revision_id,preview_id) REFERENCES rebuild_previews(project_id,revision_id,id)
);
```

Migrations: `packages/app/src/kernel/db/migrations/0005-revision-work.sql:67`. Code model: RebuildAdmission (`response_json`, `packages/app/src/slices/rebuild/admission-repo.ts:39`).

### project_control_receipts

```sql
CREATE TABLE project_control_receipts (
 project_id TEXT NOT NULL,
 idempotency_key TEXT NOT NULL,
 operation TEXT NOT NULL CHECK(operation IN ('pause','cancel')),
 request_hash TEXT NOT NULL,
 base_revision_id TEXT NOT NULL,
 response_json TEXT NOT NULL CHECK(json_valid(response_json)),
 created_at TEXT NOT NULL,
 PRIMARY KEY(project_id,idempotency_key),
 FOREIGN KEY(project_id,base_revision_id) REFERENCES project_revisions(project_id,id) ON DELETE CASCADE
);
```

Migrations: `packages/app/src/kernel/db/migrations/0005-revision-work.sql:84`. Code model: none; `response_json` replayed by `packages/app/src/slices/control/revision-control.ts:47`.

### revision_provided_reviews

```sql
CREATE TABLE revision_provided_reviews (
 project_id TEXT NOT NULL,
 revision_id TEXT NOT NULL,
 work_key TEXT NOT NULL,
 dependency_fingerprint TEXT NOT NULL,
 admission_id TEXT NOT NULL REFERENCES rebuild_admissions(id) ON DELETE CASCADE,
 PRIMARY KEY(revision_id,work_key),
 FOREIGN KEY(project_id,revision_id) REFERENCES project_revisions(project_id,id) ON DELETE CASCADE
);
```

Migrations: `packages/app/src/kernel/db/migrations/0005-revision-work.sql:95`. Code model: none; read in `packages/app/src/slices/rebuild/provided-review.ts:29`.

### play_drafts

```sql
CREATE TABLE play_drafts (
 id TEXT PRIMARY KEY,
 schema_version INTEGER NOT NULL,
 version INTEGER NOT NULL CHECK(version >= 1),
 title TEXT NOT NULL,
 document_json TEXT NOT NULL CHECK(json_valid(document_json)),
 creation_hash TEXT NOT NULL,
 save_mutation_id TEXT,
 save_request_hash TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('active','starting','started')),
 review_id TEXT UNIQUE,
 review_json TEXT CHECK(review_json IS NULL OR json_valid(review_json)),
 review_fingerprint TEXT,
 start_id TEXT
);
```

Migrations: `packages/app/src/kernel/db/migrations/0006-play-drafts.sql:1`. Code model: DraftRow via `rowSchema` (`packages/app/src/slices/play-drafts/repo.ts:7`).

### play_draft_attachments

```sql
CREATE TABLE "play_draft_attachments" (
 id TEXT PRIMARY KEY,
 draft_id TEXT NOT NULL REFERENCES play_drafts(id) ON DELETE CASCADE,
 staged_file_id TEXT REFERENCES staged_files(id) ON DELETE SET NULL,
 kind TEXT NOT NULL CHECK(kind IN ('audio','images','thumbnail','reference')),
 original_filename TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','ready','reattach')),
 error TEXT
);
CREATE INDEX play_draft_attachment_file ON play_draft_attachments(staged_file_id);
CREATE INDEX play_draft_attachment_owner ON play_draft_attachments(draft_id);
```

Migrations: `packages/app/src/kernel/db/migrations/0006-play-drafts.sql:18`, `packages/app/src/kernel/db/migrations/0024-reference-attachments.sql:15`. Code model: AttachmentRow (`packages/app/src/slices/play-drafts/repo.ts:52`).

### play_start_receipts

```sql
CREATE TABLE play_start_receipts (
 id TEXT PRIMARY KEY,
 draft_id TEXT NOT NULL,
 draft_version INTEGER NOT NULL,
 request_hash TEXT NOT NULL,
 result_json TEXT NOT NULL CHECK(json_valid(result_json)),
 created_at TEXT NOT NULL,
 UNIQUE(draft_id,draft_version)
);
CREATE INDEX play_start_receipt_draft ON play_start_receipts(draft_id);
```

Migrations: `packages/app/src/kernel/db/migrations/0006-play-drafts.sql:29`. Code model: StoredStartReceipt via `receiptSchema` (`packages/app/src/slices/play-drafts/start-repo.ts:16`).

### review_checkpoints

```sql
CREATE TABLE review_checkpoints (
 project_id TEXT NOT NULL,
 revision_id TEXT NOT NULL,
 checkpoint_id TEXT NOT NULL,
 stage TEXT NOT NULL CHECK(stage IN ('audio','images','video')),
 work_id TEXT NOT NULL,
 fingerprint TEXT NOT NULL CHECK(length(fingerprint)=64),
 state TEXT NOT NULL CHECK(state IN ('configured','pending-review','held','released','satisfied','invalidated','canceled')),
 created_at TEXT NOT NULL,
 approved_at TEXT,
 PRIMARY KEY(project_id,revision_id,checkpoint_id),
 UNIQUE(project_id,revision_id,stage),
 FOREIGN KEY(project_id,revision_id) REFERENCES project_revisions(project_id,id) ON DELETE CASCADE,
 FOREIGN KEY(project_id,revision_id,work_id) REFERENCES revision_work(project_id,revision_id,id) ON DELETE CASCADE
);
CREATE INDEX review_checkpoint_work ON review_checkpoints(work_id);
```

Migrations: `packages/app/src/kernel/db/migrations/0007-review-checkpoints.sql:2`. Code model: CheckpointRow via `checkpointRowSchema` (`packages/app/src/slices/checkpoints/schema.ts:15`).

### review_checkpoint_approvals

```sql
CREATE TABLE review_checkpoint_approvals (
 project_id TEXT NOT NULL,
 idempotency_key TEXT NOT NULL,
 revision_id TEXT NOT NULL,
 checkpoint_id TEXT NOT NULL,
 fingerprint TEXT NOT NULL CHECK(length(fingerprint)=64),
 approved_at TEXT NOT NULL,
 PRIMARY KEY(project_id,idempotency_key),
 UNIQUE(project_id,revision_id,checkpoint_id),
 FOREIGN KEY(project_id,revision_id,checkpoint_id) REFERENCES review_checkpoints(project_id,revision_id,checkpoint_id) ON DELETE CASCADE
);
```

Migrations: `packages/app/src/kernel/db/migrations/0007-review-checkpoints.sql:18`. Code model: CheckpointApprovalInput (`packages/app/src/slices/checkpoints/repo.ts:192`).

### project_templates

```sql
CREATE TABLE project_templates (
 id TEXT PRIMARY KEY,
 head_version INTEGER NOT NULL CHECK(head_version >= 1),
 creation_hash TEXT NOT NULL,
 created_at TEXT NOT NULL,
 mutation_id TEXT,
 mutation_hash TEXT
, channel_id TEXT, deleted_at TEXT);
```

Migrations: `packages/app/src/kernel/db/migrations/0008-project-templates.sql:1`, `packages/app/src/kernel/db/migrations/0032-channels.sql:58`, `packages/app/src/kernel/db/migrations/0039-channel-essentials.sql:17`. Code model: ProjectTemplate / TemplateSummary (`packages/app/src/slices/project-templates/repo.ts:30`).

### project_template_revisions

```sql
CREATE TABLE project_template_revisions (
 template_id TEXT NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE,
 version INTEGER NOT NULL CHECK(version >= 1),
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
 document_json TEXT NOT NULL CHECK(json_valid(document_json)),
 created_at TEXT NOT NULL,
 PRIMARY KEY(template_id,version)
);
```

Migrations: `packages/app/src/kernel/db/migrations/0008-project-templates.sql:9`. Code model: ProjectTemplate.document (`packages/app/src/slices/project-templates/repo.ts:30`).

### project_template_instantiations

```sql
CREATE TABLE project_template_instantiations (
 draft_id TEXT PRIMARY KEY REFERENCES play_drafts(id) ON DELETE CASCADE,
 template_id TEXT NOT NULL,
 template_version INTEGER NOT NULL CHECK(template_version >= 1)
);
```

Migrations: `packages/app/src/kernel/db/migrations/0008-project-templates.sql:17`. Code model: none; written in `packages/app/src/slices/project-templates/service.ts:162`.

### schedules

```sql
CREATE TABLE "schedules" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
  template_id TEXT NOT NULL,
  template_version INTEGER NOT NULL CHECK(template_version >= 1),
  cadence_json TEXT NOT NULL CHECK(json_valid(cadence_json)),
  timezone TEXT NOT NULL,
  missed_policy TEXT NOT NULL CHECK(missed_policy IN ('skip','run-once')),
  overlap_policy TEXT NOT NULL CHECK(overlap_policy IN ('skip')),
  spend_limit_cents INTEGER CHECK(spend_limit_cents IS NULL OR spend_limit_cents >= 0),
  items_json TEXT NOT NULL CHECK(json_valid(items_json)),
  status TEXT NOT NULL CHECK(status IN ('active','paused','completed','canceled')),
  version INTEGER NOT NULL CHECK(version >= 1),
  creation_hash TEXT NOT NULL,
  next_run_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  mutation_id TEXT,
  mutation_hash TEXT,
  deleted_at TEXT, topic_keyword TEXT, values_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(values_json)), brief TEXT, topic_mode TEXT NOT NULL DEFAULT 'off' CHECK(topic_mode IN ('off','queue','hold')), topic_min INTEGER NOT NULL DEFAULT 10 CHECK(topic_min BETWEEN 1 AND 100), topic_llm_json TEXT CHECK(topic_llm_json IS NULL OR json_valid(topic_llm_json)), topics_generating_at TEXT, topics_generated_at TEXT, topics_failed_at TEXT, topics_error TEXT, purged_at TEXT,
  CHECK(deleted_at IS NULL OR (status IN ('completed','canceled') AND next_run_at IS NULL))
);
CREATE INDEX schedules_due ON schedules(status, next_run_at) WHERE deleted_at IS NULL;
```

Migrations: `packages/app/src/kernel/db/migrations/0009-scheduled-jobs.sql:1`, `packages/app/src/kernel/db/migrations/0010-retain-schedule-history.sql:60`, `packages/app/src/kernel/db/migrations/0013-schedule-topic-queue.sql:3`, `packages/app/src/kernel/db/migrations/0026-schedule-topic-generation.sql:4`, `packages/app/src/kernel/db/migrations/0039-channel-essentials.sql:24`. Code model: ScheduleSummary via `rowSchema` (`packages/app/src/slices/schedules/repo.ts:15`).

### schedule_runs

```sql
CREATE TABLE "schedule_runs" (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL,
  scheduled_for TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('running','succeeded','failed','skipped')),
  request_id TEXT,
  project_ids_json TEXT NOT NULL CHECK(json_valid(project_ids_json)),
  estimate_json TEXT CHECK(estimate_json IS NULL OR json_valid(estimate_json)),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  projects_settled_at TEXT,
  error TEXT,
  UNIQUE(schedule_id, scheduled_for),
  UNIQUE(request_id)
);
CREATE INDEX schedule_runs_schedule ON schedule_runs(schedule_id, started_at DESC);
```

Migrations: `packages/app/src/kernel/db/migrations/0009-scheduled-jobs.sql:23`, `packages/app/src/kernel/db/migrations/0010-retain-schedule-history.sql:24`. Code model: ScheduleRun via `scheduleRunSchema` (`packages/app/src/slices/schedules/repo.ts:512`).

### project_recovery_requests

```sql
CREATE TABLE project_recovery_requests (
 project_id TEXT NOT NULL,
 idempotency_key TEXT NOT NULL,
 request_hash TEXT NOT NULL,
 base_revision_id TEXT NOT NULL,
 authority_stamp TEXT NOT NULL,
 edit_json TEXT CHECK(edit_json IS NULL OR json_valid(edit_json)),
 intent_revision_id TEXT,
 response_json TEXT CHECK(response_json IS NULL OR json_valid(response_json)),
 PRIMARY KEY(project_id,idempotency_key),
 FOREIGN KEY(project_id,base_revision_id)
   REFERENCES project_revisions(project_id,id) ON DELETE CASCADE,
 FOREIGN KEY(project_id,intent_revision_id)
   REFERENCES project_revisions(project_id,id) ON DELETE CASCADE
);
```

Migrations: `packages/app/src/kernel/db/migrations/0012-project-recovery.sql:3`. Code model: RecoveryRecord via `rowSchema` (`packages/app/src/slices/rebuild/recovery-repo.ts:12`).

### document_themes

```sql
CREATE TABLE document_themes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  values_json TEXT NOT NULL CHECK (json_valid(values_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX document_themes_name ON document_themes(lower(name));
```

Migrations: `packages/app/src/kernel/db/migrations/0016-document-themes.sql:3`, `packages/app/src/kernel/db/migrations/0017-legacy-dicemaster-theme.sql:7`. Code model: SavedDocumentTheme; `values_json` parsed by `documentThemeSchema` (`packages/app/src/slices/document/library.ts:38`).

### backup_imports

```sql
CREATE TABLE backup_imports (
  backup_id TEXT PRIMARY KEY,
  imported_at TEXT NOT NULL,
  summary_json TEXT NOT NULL CHECK (json_valid(summary_json))
);
```

Migrations: `packages/app/src/kernel/db/migrations/0018-backup-imports.sql:3`. Code model: none; written and checked in `packages/app/src/slices/storage/backup-import.ts:914`.

### review_verdicts

```sql
CREATE TABLE review_verdicts (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 revision_id TEXT NOT NULL,
 item_key TEXT NOT NULL,
 stage TEXT NOT NULL CHECK(stage IN ('article','images','narration','thumbnail','shorts')),
 item_fingerprint TEXT NOT NULL,
 review_fingerprint TEXT NOT NULL,
 passed INTEGER NOT NULL CHECK(passed IN (0,1)),
 reasons TEXT NOT NULL,
 outcome TEXT NOT NULL CHECK(outcome IN ('passed','flagged','redo')),
 attempt INTEGER NOT NULL CHECK(attempt >= 1),
 action TEXT CHECK(action IN ('overruled','redone')),
 action_at TEXT,
 redo_state TEXT CHECK(redo_state IN ('pending','started','failed')),
 redo_error TEXT,
 created_at TEXT NOT NULL,
 UNIQUE(project_id,review_fingerprint)
);
CREATE INDEX review_verdicts_item ON review_verdicts(project_id,item_key);
CREATE INDEX review_verdicts_redo ON review_verdicts(redo_state);
```

Migrations: `packages/app/src/kernel/db/migrations/0025-automatic-reviews.sql:20`. Code model: ReviewRecord via `rowSchema` (`packages/app/src/slices/reviews/repo.ts:5`).

### schedule_topics

```sql
CREATE TABLE schedule_topics (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),
  state TEXT NOT NULL CHECK(state IN ('held','rejected','used')),
  rank INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  decided_at TEXT
);
CREATE INDEX schedule_topics_schedule ON schedule_topics(schedule_id, state, rank);
```

Migrations: `packages/app/src/kernel/db/migrations/0026-schedule-topic-generation.sql:14`. Code model: HeldTopic (`packages/app/src/slices/schedules/topics.ts:418`).

### provider_usage

```sql
CREATE TABLE provider_usage (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 stage TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('llm','tts','image','video')),
 provider TEXT NOT NULL,
 model TEXT NOT NULL,
 tokens_in INTEGER,
 tokens_out INTEGER,
 tokens_cached INTEGER,
 characters INTEGER,
 images INTEGER,
 seconds REAL,
 size TEXT,
 quality TEXT,
 wall_ms INTEGER NOT NULL,
 on_plan INTEGER NOT NULL DEFAULT 0 CHECK(on_plan IN (0,1)),
 cost REAL,
 api_model TEXT,
 api_cost REAL,
 price_json TEXT CHECK(price_json IS NULL OR json_valid(price_json)),
 created_at TEXT NOT NULL
);
CREATE INDEX provider_usage_project ON provider_usage(project_id, created_at);
```

Migrations: `packages/app/src/kernel/db/migrations/0027-run-cost.sql:5`. Code model: MeteredCall on write (`packages/app/src/slices/run-cost/meter.ts:34`); `usageRow` on read (`packages/app/src/slices/run-cost/panel.ts:91`).

### plan_limit_readings

```sql
CREATE TABLE plan_limit_readings (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 account TEXT NOT NULL,
 reading_json TEXT NOT NULL CHECK(json_valid(reading_json)),
 created_at TEXT NOT NULL
);
CREATE INDEX plan_limit_readings_project ON plan_limit_readings(project_id, created_at);
```

Migrations: `packages/app/src/kernel/db/migrations/0027-run-cost.sql:32`. Code model: PlanLimitReading in `reading_json` (`packages/app/src/slices/run-cost/panel.ts:275`).

### plan_limit_waits

```sql
CREATE TABLE plan_limit_waits (
 account TEXT PRIMARY KEY,
 resets_at TEXT,
 retry_at TEXT NOT NULL,
 detected_at TEXT NOT NULL
);
```

Migrations: `packages/app/src/kernel/db/migrations/0027-run-cost.sql:43`. Code model: none; `waitRow` (`packages/app/src/slices/run-cost/limits.ts:27`).

### plan_limit_waiters

```sql
CREATE TABLE plan_limit_waiters (
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 stage TEXT NOT NULL,
 account TEXT NOT NULL,
 since TEXT NOT NULL,
 PRIMARY KEY(project_id, stage, account)
);
```

Migrations: `packages/app/src/kernel/db/migrations/0027-run-cost.sql:52`. Code model: LimitWaiter (`packages/app/src/slices/run-cost/limits.ts:65`).

### prompt_softening

```sql
CREATE TABLE prompt_softening (
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 work_key TEXT NOT NULL,
 requested_at TEXT NOT NULL,
 PRIMARY KEY(project_id, work_key)
);
```

Migrations: `packages/app/src/kernel/db/migrations/0030-automatic-retries.sql:13`. Code model: none; written in `packages/app/src/slices/rebuild/soften.ts:50`. Keys are the stage's `softenableKeys`: refused Images or Thumbnail work keys, or refused short stills `shorts:N:image:M` of Video (`packages/app/src/slices/rebuild/soften.ts:32`).

### library_versions

```sql
CREATE TABLE library_versions (
  item_kind TEXT NOT NULL CHECK(item_kind IN ('prompt','entry')),
  item_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version >= 1),
  kind TEXT NOT NULL,
  mode TEXT CHECK(mode IS NULL OR mode IN ('text','llm')),
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  author TEXT NOT NULL,
  restored_from INTEGER,
  created_at TEXT NOT NULL,
  PRIMARY KEY(item_kind,item_id,version)
);
```

Migrations: `packages/app/src/kernel/db/migrations/0031-prompt-history-and-description-edits.sql:6`. Code model: LibraryVersion via `versionRow` (`packages/app/src/slices/library/history.ts:31`).

### youtube_description_edits

```sql
CREATE TABLE youtube_description_edits (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  fields_json TEXT NOT NULL CHECK(json_valid(fields_json)),
  links_json TEXT NOT NULL CHECK(json_valid(links_json)),
  updated_at TEXT NOT NULL
);
```

Migrations: `packages/app/src/kernel/db/migrations/0031-prompt-history-and-description-edits.sql:28`. Code model: ProjectDescriptionEdits (`packages/app/src/slices/youtube/edits-repo.ts:43`).

### channels

```sql
CREATE TABLE channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0,1)),
  brand_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(brand_json)),
  series_brief TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
, episode_memory INTEGER NOT NULL DEFAULT 0 CHECK(episode_memory IN (0,1)), ai_disclosure TEXT NOT NULL DEFAULT 'auto' CHECK(ai_disclosure IN ('auto','yes','no')));
CREATE UNIQUE INDEX channels_one_default ON channels(is_default) WHERE is_default = 1;
```

Migrations: `packages/app/src/kernel/db/migrations/0032-channels.sql:10`, `packages/app/src/kernel/db/migrations/0039-channel-essentials.sql:45`. Code model: Channel via `channelRow` (`packages/app/src/slices/channels/repo.ts:31`).

### cast_members

```sql
CREATE TABLE cast_members (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('character','creature','place','object')),
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
  aliases_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(aliases_json)),
  description TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
, voice_json TEXT CHECK (voice_json IS NULL OR json_valid(voice_json)), host INTEGER NOT NULL DEFAULT 0 CHECK (host IN (0, 1)));
CREATE INDEX cast_members_channel ON cast_members(channel_id);
```

Migrations: `packages/app/src/kernel/db/migrations/0032-channels.sql:26`, `packages/app/src/kernel/db/migrations/0034-script-prompts.sql:23`, `packages/app/src/kernel/db/migrations/0041-cast-hosts.sql:3`. Code model: CastMember via `memberRow` (`packages/app/src/slices/channels/repo.ts:42`).

### image_blobs

```sql
CREATE TABLE image_blobs (
  sha256 TEXT PRIMARY KEY,
  mime TEXT NOT NULL CHECK(mime IN ('image/png','image/jpeg')),
  bytes BLOB NOT NULL,
  created_at TEXT NOT NULL
);
```

Migrations: `packages/app/src/kernel/db/migrations/0032-channels.sql:41`. Code model: none; bytes read by `imageBlob` (`packages/app/src/slices/channels/repo.ts:247`).

### cast_images

```sql
CREATE TABLE cast_images (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES cast_members(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK(source IN ('upload','generate')),
  prompt TEXT,
  state TEXT NOT NULL CHECK(state IN ('ready','generating','failed')),
  error TEXT,
  sha256 TEXT REFERENCES image_blobs(sha256),
  created_at TEXT NOT NULL
);
CREATE INDEX cast_images_member ON cast_images(member_id);
```

Migrations: `packages/app/src/kernel/db/migrations/0032-channels.sql:47`. Code model: CastImage via `imageRow` (`packages/app/src/slices/channels/repo.ts:62`).

### project_channels

```sql
CREATE TABLE project_channels (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL
);
```

Migrations: `packages/app/src/kernel/db/migrations/0032-channels.sql:59`. Code model: ProjectListing.channelId (`packages/app/src/slices/channels/repo.ts:219`).

### narration_aliases

```sql
CREATE TABLE narration_aliases (
  id TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  written TEXT NOT NULL CHECK (length(trim(written)) > 0),
  spoken TEXT NOT NULL CHECK (length(trim(spoken)) > 0),
  whole_word INTEGER NOT NULL CHECK (whole_word IN (0, 1)),
  case_sensitive INTEGER NOT NULL CHECK (case_sensitive IN (0, 1)),
  updated_at TEXT NOT NULL
);
```

Migrations: `packages/app/src/kernel/db/migrations/0035-narration-aliases.sql:5`. Code model: NarrationAlias via `narrationAliasSchema` (`packages/app/src/slices/narration/aliases-library.ts:46`).

### project_uploads

```sql
CREATE TABLE project_uploads (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  uploaded_at TEXT NOT NULL
);
```

Migrations: `packages/app/src/kernel/db/migrations/0037-project-uploads.sql:5`. Code model: ProjectListing.uploadedAt (`packages/app/src/slices/uploads/repo.ts:27`).

### project_trash

```sql
CREATE TABLE project_trash (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  deleted_at TEXT NOT NULL
);
```

Migrations: `packages/app/src/kernel/db/migrations/0039-channel-essentials.sql:11`. Code model: TrashItem via `row` (`packages/app/src/slices/trash/service.ts:29`).

### episode_memories

```sql
CREATE TABLE episode_memories (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL CHECK(length(trim(summary)) > 0),
  cast_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(cast_json)),
  source TEXT NOT NULL CHECK(source IN ('generated','edited')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
, recipe TEXT);
CREATE UNIQUE INDEX episode_memories_project ON episode_memories(project_id);
CREATE INDEX episode_memories_channel ON episode_memories(channel_id, created_at);
```

Migrations: `packages/app/src/kernel/db/migrations/0039-channel-essentials.sql:30`. Code model: EpisodeMemory via `memoryRow` (`packages/app/src/slices/episodes/repo.ts:28`).

### channel_videos

```sql
CREATE TABLE channel_videos (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 500),
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX channel_videos_title ON channel_videos(channel_id, lower(title));
```

Migrations: `packages/app/src/kernel/db/migrations/0039-channel-essentials.sql:53`. Code model: ChannelVideo via `row` (`packages/app/src/slices/channels/videos.ts:58`).

### standalone_usage

```sql
CREATE TABLE standalone_usage (
 id TEXT PRIMARY KEY,
 owner_kind TEXT NOT NULL CHECK(owner_kind IN ('schedule','channel')),
 owner_id TEXT NOT NULL,
 channel_id TEXT NOT NULL,
 purpose TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('llm','tts','image','video')),
 provider TEXT NOT NULL,
 model TEXT NOT NULL,
 tokens_in INTEGER,
 tokens_out INTEGER,
 tokens_cached INTEGER,
 characters INTEGER,
 images INTEGER,
 seconds REAL,
 size TEXT,
 quality TEXT,
 wall_ms INTEGER NOT NULL,
 on_plan INTEGER NOT NULL DEFAULT 0 CHECK(on_plan IN (0,1)),
 cost REAL,
 api_model TEXT,
 api_cost REAL,
 price_json TEXT CHECK(price_json IS NULL OR json_valid(price_json)),
 account TEXT,
 reading_json TEXT CHECK(reading_json IS NULL OR json_valid(reading_json)),
 created_at TEXT NOT NULL
);
CREATE INDEX standalone_usage_created ON standalone_usage(created_at);
```

Migrations: `packages/app/src/kernel/db/migrations/0040-standalone-usage.sql:8`. Code model: StandaloneMeteredCall on write (`packages/app/src/slices/run-cost/meter.ts:84`); `standaloneRow` on read (`packages/app/src/slices/run-cost/week.ts:46`).

### narration_retries

```sql
CREATE TABLE narration_retries (
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 chunk_key TEXT NOT NULL,
 tries INTEGER NOT NULL CHECK (tries > 0),
 state TEXT NOT NULL CHECK (state IN ('pending', 'started', 'failed')),
 detail TEXT,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(project_id, chunk_key)
);
CREATE INDEX narration_retries_pending ON narration_retries(state) WHERE state = 'pending';
```

Migrations: `packages/app/src/kernel/db/migrations/0042-narration-retries.sql:4`. Code model: none; `row` (`packages/app/src/slices/rebuild/narration-retry.ts:15`).

### prepared_videos

```sql
CREATE TABLE prepared_videos (
 project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
 schedule_id TEXT NOT NULL,
 title TEXT NOT NULL,
 added_checkpoint INTEGER NOT NULL CHECK (added_checkpoint IN (0, 1)),
 prepared_at TEXT NOT NULL
);
CREATE INDEX prepared_videos_title ON prepared_videos(schedule_id, title);
```

Migrations: `packages/app/src/kernel/db/migrations/0043-prepared-videos.sql:6`. `schedule_id` has no foreign key. Code model: none; written by `prepareTopic`, read by `preparedProject`, deleted by `continuePrepared` (`packages/app/src/slices/schedules/prepare.ts:108`, `:144`, `:184`). Not in backups (`packages/app/src/slices/storage/backup-format.ts:72`).

### project_set_aside

```sql
CREATE TABLE project_set_aside (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  revision_id TEXT NOT NULL,
  set_at TEXT NOT NULL
);
```

Migrations: `packages/app/src/kernel/db/migrations/0044-project-set-aside.sql:5`. `revision_id` has no foreign key; a row counts only while it equals `project_heads.revision_id` (`setAsideProjects`, `packages/app/src/slices/uploads/repo.ts:61`). Code model: ProjectSummary.setAside. Not in backups (`packages/app/src/slices/storage/backup-format.ts:73`).

### youtube_videos

```sql
CREATE TABLE youtube_videos (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  short INTEGER NOT NULL CHECK (short >= 0),
  video_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  ab_state TEXT NOT NULL DEFAULT 'none' CHECK (ab_state IN ('none', 'waiting', 'started', 'failed')),
  ab_message TEXT,
  ab_at TEXT,
  upload_state TEXT NOT NULL DEFAULT 'done' CHECK (upload_state IN ('filled', 'done')),
  finish_state TEXT NOT NULL DEFAULT 'none' CHECK (finish_state IN ('none', 'waiting', 'done', 'failed')),
  finish_message TEXT,
  comment_state TEXT NOT NULL DEFAULT 'none' CHECK (comment_state IN ('none', 'waiting', 'done', 'failed')),
  comment_message TEXT,
  checks TEXT,
  PRIMARY KEY (project_id, short)
);
```

Migrations: `packages/app/src/kernel/db/migrations/0045-youtube-videos.sql:6`; `upload_state` added by `0046-youtube-upload-state.sql:5` (rows from before it read `done`); `finish_state`, `finish_message`, `comment_state`, `comment_message` added by `0047-studio-autopilot.sql:12`-`:17`; `checks` added by `0048-releases.sql:20` (null until the extension reads Studio's Content list). `short` 0 is the long video. Code model: YoutubeVideo via `rowOf` (`packages/app/src/slices/studio/videos.ts:51`). In backups since 3.2.8 (`packages/app/src/slices/storage/backup-format.ts:64`).

### releases

```sql
CREATE TABLE releases (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  short INTEGER NOT NULL CHECK (short >= 0),
  release_at TEXT NOT NULL,
  line TEXT,
  by TEXT NOT NULL DEFAULT 'plan' CHECK (by IN ('plan', 'person')),
  set_at TEXT NOT NULL,
  PRIMARY KEY (project_id, short)
);
```

Migrations: `packages/app/src/kernel/db/migrations/0048-releases.sql:6`, which copies each `upload_slots` row in as short 0 (`row_name` '' becomes a null `line`, `assigned_at` becomes `set_at`, `by` 'plan') and drops `upload_slots` (`:15`-`:17`). `short` 0 is the long video; `release_at` '' is not scheduled. No uniqueness on `release_at`; `freeSlots` and `planReleases` keep two releases out of the same hour in code (`packages/app/src/slices/studio/releases.ts:83-90`, `:114-135`). Code model: Release (`releasesOf`, `allReleases`, `planReleases`, `setRelease`, `packages/app/src/slices/studio/releases.ts:46`, `:58`, `:140`, `:186`). In backups since 3.4.0 in place of `upload_slots` (`packages/app/src/slices/storage/backup-format.ts:66`).

### video_stats

```sql
CREATE TABLE video_stats (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  short INTEGER NOT NULL,
  video_id TEXT NOT NULL,
  read_at TEXT NOT NULL,
  impressions INTEGER,
  ctr REAL,
  views INTEGER,
  average_view_seconds INTEGER,
  watch_hours REAL,
  PRIMARY KEY (project_id, short)
);
```

Migrations: `packages/app/src/kernel/db/migrations/0047-studio-autopilot.sql:19`. Code model: VideoStats (`saveStats`, `projectStats`, `longVideoStats`, `packages/app/src/slices/studio/stats.ts:42`, `:76`, `:84`). In backups since 3.3.0.

### ab_results

```sql
CREATE TABLE ab_results (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  short INTEGER NOT NULL,
  video_id TEXT NOT NULL,
  read_at TEXT NOT NULL,
  variants TEXT NOT NULL CHECK (json_valid(variants)),
  PRIMARY KEY (project_id, short)
);
```

Migrations: `packages/app/src/kernel/db/migrations/0047-studio-autopilot.sql:32`. Code model: AbResult; `variants` is `AbVariant[]` JSON (`saveAbResult`, `abResults`, `packages/app/src/slices/studio/stats.ts:93`, `:107`). In backups since 3.3.0.

### collector.events

```sql
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  machine_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_machine ON events (machine_id, received_at);
```

Cloudflare D1, not the app database (`packages/collector/schema.sql:3`). Code model: CollectorEvent via `collectorEventSchema` (`packages/collector/src/model.ts:49`).

### collector.aggregates

```sql
CREATE TABLE IF NOT EXISTS aggregates (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
```

One row per AggregateKey (`packages/collector/schema.sql:15`, `packages/collector/src/model.ts:21`). Code model: Aggregates.
