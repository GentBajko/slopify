---
generated_at_commit: 7bdb84e3f57e
generated_date: '2026-09-13'
capstone_version: 5.2.0
content_hash: 4d249b710857
paths_covered:
  - :(top)packages/app/src/**
  - :(top)packages/web/src/**
  - :(top)packages/collector/**
  - :(top)packages/site/**
absorbed_from:
  - features/2026-09-10-editable-projects@2026-09-12
  - features/2026-09-10-play-redesign-drafts@2026-09-13
  - features/2026-09-10-review-checkpoints@2026-09-13
  - features/2026-09-10-project-templates@2026-09-13
---

# Models

Observed source: `7bdb84e3f57e` (2026-09-13). This chapter includes retained project revisions/rebuild admission, durable incomplete Play drafts with owned attachments and reviewed Start receipts, persisted tutorial progress, review checkpoint rows/approval receipts, reusable project template heads/revisions, scheduled jobs/runs, and portable backup projections (`packages/app/src/kernel/db/migrations/0007-review-checkpoints.sql:1`, `packages/app/src/kernel/db/migrations/0008-project-templates.sql:1`, `packages/app/src/kernel/db/migrations/0009-scheduled-jobs.sql:1`, `packages/app/src/slices/storage/portable.ts:58`).

## Entities

| Entity | Definition site | Storage | Purpose |
|---|---|---|---|
| ProviderChoice | `packages/app/src/slices/admission/model.ts:17` | Nested domain, in-memory or HTTP value | ProviderChoice data contract |
| VoiceChoice | `packages/app/src/slices/admission/model.ts:23` | Nested domain, in-memory or HTTP value | VoiceChoice data contract |
| ImagePromptChoice | `packages/app/src/slices/admission/model.ts:27` | Nested domain, in-memory or HTTP value | ImagePromptChoice data contract |
| EntryChoice | `packages/app/src/slices/admission/model.ts:33` | Nested domain, in-memory or HTTP value | EntryChoice data contract |
| ProvidedText | `packages/app/src/slices/admission/model.ts:42` | Nested domain, in-memory or HTTP value | ProvidedText data contract |
| ProvidedFiles | `packages/app/src/slices/admission/model.ts:48` | Nested domain, in-memory or HTTP value | ProvidedFiles data contract |
| RunDraft | `packages/app/src/slices/admission/model.ts:55` | Play admission/estimate/batch request | User-selected run setup before admission |
| RunConfig | `packages/app/src/slices/admission/model.ts:80` | `projects.config`; `project_revisions.config` JSON | Accepted setup with rendered prompt snapshots |
| Project | `packages/app/src/slices/admission/model.ts:84` | `projects`; `project_controls`; current revision projection | Current title/config/timestamps and pause state |
| Stage | `packages/app/src/slices/admission/model.ts:95` | `stages` current projection | Current stage source, state, attempts and progress |
| ProjectSummary | `packages/app/src/slices/admission/model.ts:109` | HTTP derived Project status | ProjectSummary data contract |
| ProjectListing | `packages/app/src/slices/admission/model.ts:117` | HTTP derived Project status/progress | ProjectListing data contract |
| FieldError | `packages/app/src/slices/admission/rules.ts:6` | Nested domain, in-memory or HTTP value | FieldError data contract |
| Field | `packages/app/src/slices/admission/substitute.ts:23` | Nested domain, in-memory or HTTP value | Detected keyword control grouped for Play |
| DetectedSlots | `packages/app/src/slices/admission/substitute.ts:15` | Nested domain, in-memory or HTTP value | DetectedSlots data contract |
| SlotLintError | `packages/app/src/slices/admission/substitute.ts:9` | Nested domain, in-memory or HTTP value | SlotLintError data contract |
| OutputMeta | `packages/app/src/slices/storage/model.ts:36` | `outputs.meta` and retained output descriptor JSON | OutputMeta data contract |
| Output | `packages/app/src/slices/storage/model.ts:52` | `outputs`; immutable descriptors in `revision_outputs` | Output data contract |
| StagedFile | `packages/app/src/slices/storage/model.ts:66` | `staged_files` and staging file | StagedFile data contract |
| Prompt | `packages/app/src/slices/library/model.ts:26` | `prompts` | Prompt data contract |
| Entry | `packages/app/src/slices/library/model.ts:43` | `entries` | Entry data contract |
| KeyedProvider | `packages/app/src/slices/settings/model.ts:34` | Nested domain, in-memory or HTTP value | KeyedProvider data contract |
| CliProvider | `packages/app/src/slices/settings/model.ts:40` | Nested domain, in-memory or HTTP value | CliProvider data contract |
| ProviderStatus | `packages/app/src/slices/settings/model.ts:97` | Nested domain, in-memory or HTTP value | ProviderStatus data contract |
| Voice | `packages/app/src/slices/settings/model.ts:105` | `voices` | Voice data contract |
| AppSettings | `packages/app/src/slices/settings/model.ts:116` | JSON values in `settings` | AppSettings data contract |
| CliPathStatus | `packages/app/src/slices/settings/cli-paths.ts:19` | `settings` configured path plus resolved command | CliPathStatus data contract |
| ModelInfo | `packages/app/src/kernel/ports/model.ts:8` | Nested domain, in-memory or HTTP value | ModelInfo data contract |
| ProviderChanges | `packages/app/src/slices/control/providers.ts:35` | Nested domain, in-memory or HTTP value | Legacy provider-change service input; revision editing is the current HTTP path |
| AttemptStart | `packages/app/src/kernel/runner/attempt-repo.ts:16` | Nested domain, in-memory or HTTP value | AttemptStart data contract |
| Attempt | `packages/app/src/kernel/runner/attempt-repo.ts:34` | `attempts` | Provider attempt with revision/work/piece provenance |
| StagePiece | `packages/app/src/kernel/runner/piece-repo.ts:22` | `stage_pieces`; descriptors in `revision_pieces` | StagePiece data contract |
| Message | `packages/app/src/kernel/ports/llm.ts:6` | Nested domain, in-memory or HTTP value | Message data contract |
| ThinkingConfig | `packages/app/src/kernel/ports/llm.ts:43` | Nested domain, in-memory or HTTP value | ThinkingConfig data contract |
| TimedWord | `packages/app/src/kernel/ports/subtitles.ts:5` | Nested domain, in-memory or HTTP value | TimedWord data contract |
| SubtitleOmission | `packages/app/src/kernel/ports/subtitles.ts:1` | Nested domain, in-memory or HTTP value | SubtitleOmission data contract |
| AlignmentRequest | `packages/app/src/kernel/ports/subtitles.ts:11` | Nested domain, in-memory or HTTP value | AlignmentRequest data contract |
| FontSummary | `packages/app/src/slices/fonts/model.ts:1` | Nested domain, in-memory or HTTP value | FontSummary data contract |
| ResolvedFont | `packages/app/src/slices/fonts/model.ts:8` | Nested domain, in-memory or HTTP value | ResolvedFont data contract |
| TelemetryCounters | `packages/app/src/slices/telemetry/model.ts:60` | Nested domain, in-memory or HTTP value | TelemetryCounters data contract |
| TelemetryPayload | `packages/app/src/slices/telemetry/model.ts:73` | Nested domain, in-memory or HTTP value | TelemetryPayload data contract |
| TelemetryEvent | `packages/app/src/slices/telemetry/model.ts:77` | `telemetry_events` | TelemetryEvent data contract |
| Machine | `packages/app/src/slices/telemetry/model.ts:87` | `machine` | Machine data contract |
| CollectorEvent | `packages/app/src/slices/telemetry/collector-client.ts:6` | HTTP outbound collector event | CollectorEvent data contract |
| UpdateInfo | `packages/app/src/updater/model.ts:3` | Nested domain, in-memory or HTTP value | UpdateInfo data contract |
| UpdateResult | `packages/app/src/updater/model.ts:14` | Nested domain, in-memory or HTTP value | UpdateResult data contract |
| CostRow | `packages/app/src/slices/estimate/index.ts:9` | Nested domain, in-memory or HTTP value | CostRow data contract |
| CostEstimate | `packages/app/src/slices/estimate/index.ts:15` | Nested domain, in-memory or HTTP value | CostEstimate data contract |
| Chunking | `packages/app/src/slices/narration/chunk.ts:4` | Nested domain, in-memory or HTTP value | Chunking data contract |
| SubtitleAsset | `packages/app/src/slices/subtitles/prepare.ts:34` | Nested domain, in-memory or HTTP value | SubtitleAsset data contract |
| PreparedSubtitles | `packages/app/src/slices/subtitles/prepare.ts:38` | Nested domain, in-memory or HTTP value | PreparedSubtitles data contract |
| ManualCue | `packages/app/src/slices/revisions/model.ts:17` | Nested domain, in-memory or HTTP value | ManualCue data contract |
| RevisionContent | `packages/app/src/slices/revisions/model.ts:26` | `project_revisions.content` JSON | Edited article, stable image order, overrides, cues and prompt snapshots |
| RevisionUpload | `packages/app/src/slices/revisions/model.ts:52` | Save request; refers to `staged_files` | RevisionUpload data contract |
| RevisionEdit | `packages/app/src/slices/revisions/model.ts:59` | Save request | Proposed saved setup/content and optional regeneration/upload intentions |
| ProjectRevision | `packages/app/src/slices/revisions/model.ts:65` | `project_revisions` | Retained setup/content, ancestry and desired fingerprints |
| CheckpointRow | `packages/app/src/slices/checkpoints/model.ts:12` | `review_checkpoints` | Revision-bound dependency gate and approval state |
| CheckpointApprovalInput | `packages/app/src/slices/checkpoints/model.ts:35` | Request persisted in `review_checkpoint_approvals` | Idempotent exact approval identity |
| CheckpointStatus | `packages/app/src/slices/checkpoints/change.ts:31` | HTTP DTO | Current checkpoint rows with recalculated closure data |
| ProjectAsset | `packages/app/src/slices/revisions/model.ts:75` | `project_assets` and immutable file | Registered immutable file identity shared by retained revisions |
| ManifestOutput | `packages/app/src/slices/revisions/model.ts:82` | `revision_outputs` descriptor and selection metadata | ManifestOutput data contract |
| ManifestPiece | `packages/app/src/slices/revisions/model.ts:90` | `revision_pieces` descriptor and selection metadata | ManifestPiece data contract |
| RevisionManifest | `packages/app/src/slices/revisions/model.ts:97` | Nested domain, in-memory or HTTP value | RevisionManifest data contract |
| RevisionOutputView | `packages/app/src/slices/revisions/model.ts:101` | `revision_outputs` plus runtime availability | RevisionOutputView data contract |
| RevisionPieceView | `packages/app/src/slices/revisions/model.ts:107` | `revision_pieces` plus runtime availability | RevisionPieceView data contract |
| RevisionView | `packages/app/src/slices/revisions/model.ts:113` | HTTP assembled revision and retained media | Saved revision with selected/deselected outputs and file availability |
| RevisionSummary | `packages/app/src/slices/revisions/model.ts:120` | HTTP history listing | RevisionSummary data contract |
| SaveRevisionInput | `packages/app/src/slices/revisions/mutations.ts:40` | Save service input; route plus JSON body | SaveRevisionInput data contract |
| RestoreRevisionInput | `packages/app/src/slices/revisions/restore.ts:17` | Restore service input; route plus JSON body | RestoreRevisionInput data contract |
| MutationIdentity | `packages/app/src/slices/revisions/mutation-request.ts:7` | Identity fields used by `revision_mutations` | Canonical operation/request identity for durable Save/Restore replay |
| WorkRef | `packages/app/src/kernel/runner/work.ts:15` | Identity subset of `revision_work` | Frozen invocation authority scoped to project and origin revision |
| PublicationRef | `packages/app/src/kernel/runner/work.ts:24` | Nested domain, in-memory or HTTP value | PublicationRef data contract |
| RunnerStage | `packages/app/src/kernel/runner/index.ts:7` | Runtime view of revision invocation | RunnerStage data contract |
| WorkPiece | `packages/app/src/slices/rebuild/work-records.ts:5` | `revision_work_pieces` | Durable physical recipe input, continuation and dispatch state |
| RebuildWork | `packages/app/src/slices/rebuild/model.ts:10` | Nested domain, in-memory or HTTP value | RebuildWork data contract |
| RebuildPreview | `packages/app/src/slices/rebuild/model.ts:23` | `rebuild_previews.body_json` and HTTP | Selected dependency/cost/reuse review before admission |
| RebuildAdmission | `packages/app/src/slices/rebuild/model.ts:62` | `rebuild_admissions.response_json` and HTTP | Idempotent explicit rebuild receipt |
| WorkRecipe | `packages/app/src/slices/rebuild/dependencies.ts:4` | Nested domain, in-memory or HTTP value | WorkRecipe data contract |
| RetainedWork | `packages/app/src/slices/rebuild/dependencies.ts:14` | Nested domain, in-memory or HTTP value | RetainedWork data contract |
| ResolvedRevisionInputs | `packages/app/src/slices/rebuild/recipe-model.ts:17` | Nested domain, in-memory or HTTP value | ResolvedRevisionInputs data contract |
| ResolvedWorkRecipe | `packages/app/src/slices/rebuild/recipe-model.ts:101` | Preview/execution recipe snapshot | ResolvedWorkRecipe data contract |
| ProjectBody | `packages/web/src/api.ts:77` | HTTP current project response | Current head ID and legacy-compatible project/stage/output projection |
| CreatedProjectBody | `packages/web/src/api.ts:83` | HTTP initial admission response | CreatedProjectBody data contract |
| RevisionRefusal | `packages/web/src/project/revision-api.ts:30` | Parsed client refusal DTO | RevisionRefusal data contract |
| Catalogue | `packages/app/src/catalog/schema.ts:98` | Local YAML and admitted execution snapshots | Catalogue data contract |
| CatalogueModel | `packages/app/src/catalog/schema.ts:99` | Member of Catalogue family lists | CatalogueModel data contract |
| QueueEntry | `packages/app/src/slices/batch/index.ts:19` | `project_queue` | QueueEntry data contract |
| SubtitleConfig | `packages/app/src/slices/subtitles/model.ts:22` | RunConfig.subtitles | SubtitleConfig data contract |
| Aggregates | `packages/collector/src/model.ts:31` | Collector response assembled from `aggregates` rows | Aggregates data contract |
| AudioExportRecord | `packages/app/src/slices/video/reuse-audio.ts:17` | Audio export render record JSON | AudioExportRecord data contract |
| NarrationOverride | `packages/app/src/slices/revisions/model.ts:23` | RevisionContent.narrationOverrides member | NarrationOverride data contract |
| RevisionOutputRecord | `packages/app/src/slices/revisions/model.ts:154` | `revision_outputs` parsed record | RevisionOutputRecord data contract |
| RevisionPieceRecord | `packages/app/src/slices/revisions/model.ts:155` | `revision_pieces` parsed record | RevisionPieceRecord data contract |
| RebuildSelection | `packages/app/src/slices/rebuild/model.ts:6` | Preview request/preview.selection | RebuildSelection data contract |
| RevisionControlInput | `packages/app/src/slices/control/revision-control-schema.ts:9` | Pause/cancel request; control receipt identity | RevisionControlInput data contract |
| RecipeInput | `packages/app/src/slices/rebuild/recipe-model.ts:51` | `revision_work_pieces.input_json`; execution snapshot recipes | RecipeInput data contract |
| RecipeProviderChoice | `packages/app/src/slices/rebuild/recipe-provider-choice.ts:5` | In-memory provider resolution for preview and readiness | Provider, model, family and optional voice selected by concrete or deferred recipe |
| AudioRecipes | `packages/app/src/slices/rebuild/recipe-audio.ts:18` | In-memory audio recipe compilation | Ordered narration recipes, media identity and transcript/duration timeline |
| ExecutionSnapshot | `packages/app/src/slices/rebuild/preview-plan.ts:48` | `rebuild_previews.execution_json` | ExecutionSnapshot data contract |
| RevisionMutationResult | `packages/app/src/slices/revisions/model.ts:128` | Save/Restore service result | RevisionMutationResult data contract |
| BaselineResult | `packages/app/src/slices/revisions/model.ts:141` | Lazy adoption service result | BaselineResult data contract |
| RebuildResult | `packages/app/src/slices/rebuild/model.ts:69` | Preview/Start service result | RebuildResult data contract |
| Readiness | `packages/app/src/kernel/ports/model.ts:17` | ProviderStatus readiness union | Readiness data contract |
| PlayDraftForm | `packages/app/src/slices/play-drafts/schema.ts:79` | play_drafts.document_json (form) | Incomplete raw editor configuration |
| PlayDraftDocument | `packages/app/src/slices/play-drafts/schema.ts:80` | play_drafts.document_json | Versioned durable editor envelope |
| DraftSummary | `packages/app/src/slices/play-drafts/model.ts:15` | Derived HTTP listing from play_drafts | Tolerant draft list metadata |
| PlayDraft | `packages/app/src/slices/play-drafts/model.ts:22` | play_drafts row and HTTP DTO | Versioned saved document |
| DraftAttachment | `packages/app/src/slices/play-drafts/model.ts:29` | Derived play_draft_attachments plus staged_files/file state | Owned file availability projection |
| ResolvedPlayRun | `packages/app/src/slices/play-drafts/model.ts:38` | Review JSON and HTTP DTO | One normalized run with exact wording |
| PlayReview | `packages/app/src/slices/play-drafts/model.ts:43` | play_drafts.review_json.review and HTTP DTO | Bound cost review and Start identity |
| PlayStartResult | `packages/app/src/slices/play-drafts/model.ts:51` | play_start_receipts.result_json and HTTP DTO | Durable single/batch admission result |
| DraftView | `packages/app/src/slices/play-drafts/model.ts:57` | Assembled HTTP DTO | Saved draft with uploads and pending/accepted execution |
| DraftSaveInput | `packages/app/src/slices/play-drafts/model.ts:64` | PUT service request | Versioned, idempotent document save |
| PlayStartInput | `packages/app/src/slices/play-drafts/model.ts:70` | POST service request | Exact reviewed admission identity |
| ResolvedPlayReview | `packages/app/src/slices/play-drafts/model.ts:97` | In-memory resolution; private review execution JSON | Resolved review plus captured execution dependencies |
| DraftResult | `packages/app/src/slices/play-drafts/model.ts:75` | In-memory service result | Typed expected success/refusal |
| DraftRow | `packages/app/src/slices/play-drafts/repo.ts:23` | play_drafts | Parsed SQL row |
| ProjectTemplate | `packages/app/src/slices/project-templates/model.ts:6` | project_templates + project_template_revisions | Named immutable reusable Play setup |
| TemplateSummary | `packages/app/src/slices/project-templates/model.ts:7` | Current template head HTTP listing | Template identity, version and timestamps |
| Cadence | `packages/app/src/slices/schedules/calendar.ts:16` | Nested in schedules | One-off, daily, or weekly local-time recurrence |
| ScheduleCreate | `packages/app/src/slices/schedules/schema.ts:76` | HTTP create input | New local schedule definition |
| ScheduleUpdate | `packages/app/src/slices/schedules/schema.ts:77` | HTTP update input | Versioned schedule replacement and mutation identity |
| ScheduleSummary | `packages/app/src/slices/schedules/schema.ts:41` | `schedules` and HTTP DTO | Local cadence, policy, template revision and next occurrence |
| ScheduleRun | `packages/app/src/slices/schedules/schema.ts:61` | `schedule_runs` and HTTP history | Claimed dispatch status, projects, estimate and safe error |
| PortableImportResult | `packages/app/src/slices/storage/portable.ts:65` | HTTP import response | Counts of imported portable resources |
| StorageUsage | `packages/app/src/slices/storage/portable.ts:74` | HTTP storage response | Total and per-project byte counts |
| AttachmentRow | `packages/app/src/slices/play-drafts/repo.ts:33` | play_draft_attachments | Parsed owned attachment SQL row |
| AttachmentRef | `packages/app/src/slices/play-drafts/repo.ts:34` | In-memory traversal of PlayDraftDocument | File reference with inferred slot kind |
| StoredStartReceipt | `packages/app/src/slices/play-drafts/start-repo.ts:23` | play_start_receipts projection | Canonical durable replay authority |
| DraftRefusal | `packages/web/src/play/draft-api.ts:24` | Browser HTTP error DTO | Normalized expected server problem |
| DraftReply | `packages/web/src/play/draft-api.ts:32` | Browser API result | Parsed success or DraftRefusal |
| TutorialSession | `packages/app/src/slices/settings/tutorial-schema.ts:41; packages/web/src/tutorial/model.ts:9` | settings tutorial.session JSON; distinct browser in-memory representation | Persisted stable guide cursor and browser index projection |
| TutorialWrite | `packages/app/src/slices/settings/tutorial-schema.ts:42` | PUT /api/tutorial body | CAS tutorial cursor save |
| TutorialView | `packages/app/src/slices/settings/tutorial-schema.ts:43` | GET/PUT /api/tutorial response | Readable versioned tutorial progress |
| TutorialSaveResult | `packages/app/src/slices/settings/tutorial.ts:21` | In-memory service result | Tutorial CAS refusal/success |
| SaveClock | `packages/web/src/play/draft-save.ts:6` | In-memory browser value | Local edit/acknowledgement authority |
| PendingSave | `packages/web/src/play/draft-save.ts:11` | In-memory browser value | Frozen retriable document write |
| SaveEvent | `packages/web/src/play/draft-save.ts:17` | In-memory browser value | Save clock transition |
| DraftSessionState | `packages/web/src/play/draft-save.ts:45` | In-memory browser value | Session-owned recoverable draft state |
| RevealRequest | `packages/web/src/play/draft-context.tsx:18` | In-memory browser value | Explicit section and focus request |
| ReviewedGeneration | `packages/web/src/play/review-state.ts:14` | In-memory browser value | Client authorization generation |
| ReviewState | `packages/web/src/play/review-state.ts:29` | In-memory browser value | Client review/admission state |
| UploadOwner | `packages/web/src/play/draft-uploads.ts:1` | In-memory browser value | Attachment callback identity fence |
| Upload | `packages/web/src/play/state.ts:28` | In-memory browser value | Compatibility attachment projection |
| ProvidedState | `packages/web/src/play/state.ts:35` | In-memory browser value | Compatibility provided-input shape |
| LegacyPlayFormState | `packages/web/src/play/state.ts:43` | In-memory browser value | Numeric compatibility controls |
| DraftInput | `packages/web/src/play/state.ts:127` | In-memory browser value | Browser live-admission conversion input |
| PlayFormState | `packages/web/src/play/state.ts:66; packages/web/src/play/draft-state.ts:10` | In-memory alias | Module-scoped aliases for compatibility and raw editor data |
| ControlledFontUpload | `packages/web/src/subtitles/font-picker.tsx:8` | In-memory browser value | Session-owned font upload status and picker callback |
| TutorialEvent | `packages/web/src/tutorial/model.ts:1` | In-memory browser event | Guide resource creation signal |
| TutorialStep | `packages/web/src/tutorial/model.ts:90` | In-memory static guide list | Stable target/page metadata |

## Fields and types

Each table uses the code spelling and declared type. “Required” describes the property, so a required nullable property remains required. Inherited interface fields are included. Defaulted Zod output fields are required after parsing even when omitted by input.

### ProviderChoice

| Field | Type | Required |
|---|---|---|
| thinking | `import("../../kernel/ports/llm.js").ThinkingMode \| undefined` | no |
| provider | `string` | yes |
| model | `string` | yes |

Source: `packages/app/src/slices/admission/model.ts:17`.

### VoiceChoice

| Field | Type | Required |
|---|---|---|
| thinking | `import("../../kernel/ports/llm.js").ThinkingMode \| undefined` | no |
| provider | `string` | yes |
| model | `string` | yes |
| voice | `string` | yes |

Source: `packages/app/src/slices/admission/model.ts:23`.

### ImagePromptChoice

| Field | Type | Required |
|---|---|---|
| name | `string` | yes |
| number | `number` | yes |

Source: `packages/app/src/slices/admission/model.ts:27`.

### EntryChoice

| Field | Type | Required |
|---|---|---|
| name | `string` | yes |
| mode | `EntryMode` | yes |

Source: `packages/app/src/slices/admission/model.ts:33`.

### ProvidedText

| Field | Type | Required |
|---|---|---|
| research | `string \| undefined` | no |
| article | `string \| undefined` | no |

Source: `packages/app/src/slices/admission/model.ts:42`.

### ProvidedFiles

| Field | Type | Required |
|---|---|---|
| audio | `string \| undefined` | no |
| images | `readonly string[] \| undefined` | no |
| thumbnail | `string \| undefined` | no |

Source: `packages/app/src/slices/admission/model.ts:48`.

### RunDraft

| Field | Type | Required |
|---|---|---|
| title | `string` | yes |
| format | `Format` | yes |
| sources | `Readonly<Record<StageKind, StageSource>>` | yes |
| llm | `ProviderChoice \| undefined` | no |
| audio | `VoiceChoice \| undefined` | no |
| images | `ProviderChoice \| undefined` | no |
| articlePrompt | `string \| undefined` | no |
| imagePrompts | `readonly ImagePromptChoice[]` | yes |
| thumbnailPrompt | `string \| undefined` | no |
| intro | `EntryChoice \| undefined` | no |
| outro | `EntryChoice \| undefined` | no |
| values | `Readonly<Record<string, string>>` | yes |
| provided | `ProvidedText & ProvidedFiles` | yes |
| chunking | `Chunking \| undefined` | no |
| silenceGapSeconds | `number` | yes |
| subtitles | `SubtitleConfig \| undefined` | no |

Source: `packages/app/src/slices/admission/model.ts:55`.

### RunConfig

| Field | Type | Required |
|---|---|---|
| title | `string` | yes |
| format | `Format` | yes |
| sources | `Readonly<Record<StageKind, StageSource>>` | yes |
| llm | `ProviderChoice \| undefined` | no |
| audio | `VoiceChoice \| undefined` | no |
| images | `ProviderChoice \| undefined` | no |
| articlePrompt | `string \| undefined` | no |
| imagePrompts | `readonly ImagePromptChoice[]` | yes |
| thumbnailPrompt | `string \| undefined` | no |
| intro | `EntryChoice \| undefined` | no |
| outro | `EntryChoice \| undefined` | no |
| values | `Readonly<Record<string, string>>` | yes |
| provided | `ProvidedText & ProvidedFiles` | yes |
| chunking | `Chunking \| undefined` | no |
| silenceGapSeconds | `number` | yes |
| subtitles | `SubtitleConfig \| undefined` | no |
| rendered | `Readonly<Record<string, string>>` | yes |

Source: `packages/app/src/slices/admission/model.ts:80`.

### Project

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| title | `string` | yes |
| format | `Format` | yes |
| config | `RunConfig` | yes |
| createdAt | `string` | yes |
| updatedAt | `string` | yes |
| paused | `boolean` | no |

Source: `packages/app/src/slices/admission/model.ts:84`.

### Stage

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| projectId | `string` | yes |
| kind | `StageKind` | yes |
| source | `StageSource` | yes |
| state | `StageState` | yes |
| failureReason | `string \| null` | yes |
| attemptCount | `number` | yes |
| progressCurrent | `number \| null` | yes |
| progressTotal | `number \| null` | yes |
| startedAt | `string \| null` | yes |
| finishedAt | `string \| null` | yes |

Source: `packages/app/src/slices/admission/model.ts:95`.

### ProjectSummary

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| title | `string` | yes |
| format | `Format` | yes |
| config | `RunConfig` | yes |
| createdAt | `string` | yes |
| updatedAt | `string` | yes |
| paused | `boolean` | no |
| status | `ProjectState` | yes |

Source: `packages/app/src/slices/admission/model.ts:109`.

### ProjectListing

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| title | `string` | yes |
| format | `Format` | yes |
| config | `RunConfig` | yes |
| createdAt | `string` | yes |
| updatedAt | `string` | yes |
| paused | `boolean` | no |
| status | `ProjectState` | yes |
| progress | `number` | yes |

Source: `packages/app/src/slices/admission/model.ts:117`.

### FieldError

| Field | Type | Required |
|---|---|---|
| field | `string` | yes |
| message | `string` | yes |

Source: `packages/app/src/slices/admission/rules.ts:6`.

### Field

| Field | Type | Required |
|---|---|---|
| name | `string` | yes |
| group | `FieldGroup` | yes |

Source: `packages/app/src/slices/admission/substitute.ts:23`.

### DetectedSlots

| Field | Type | Required |
|---|---|---|
| names | `readonly string[]` | yes |
| errors | `readonly SlotLintError[]` | yes |

Source: `packages/app/src/slices/admission/substitute.ts:15`.

### SlotLintError

| Field | Type | Required |
|---|---|---|
| kind | `SlotLintKind` | yes |
| at | `number` | yes |

Source: `packages/app/src/slices/admission/substitute.ts:9`.

### OutputMeta

| Field | Type | Required | Notes |
|---|---|---|---|
| subtitleOmissions | `\| readonly { readonly start: number; readonly text: string }[] \| undefined` | no |  |
| subtitlesMode | `"off" \| "files" \| "burn-in" \| undefined` | no | accepted: off, files, burn-in |
| promptName | `string \| undefined` | no |  |
| prompt | `string \| undefined` | no |  |
| index | `number \| undefined` | no |  |
| provider | `string \| undefined` | no |  |
| model | `string \| undefined` | no |  |
| voice | `string \| undefined` | no |  |

Source: `packages/app/src/slices/storage/model.ts:36`.

### Output

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| projectId | `string` | yes |
| stageKind | `StageKind` | yes |
| role | `OutputRole` | yes |
| path | `string` | yes |
| originalFilename | `string \| null` | yes |
| bytes | `number` | yes |
| durationMs | `number \| null` | yes |
| meta | `OutputMeta` | yes |
| createdAt | `string` | yes |

Source: `packages/app/src/slices/storage/model.ts:52`.

### StagedFile

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| stageKind | `StageKind` | yes |
| path | `string` | yes |
| originalFilename | `string` | yes |
| bytes | `number` | yes |
| state | `StagedFileState` | yes |
| createdAt | `string` | yes |

Source: `packages/app/src/slices/storage/model.ts:66`.

### Prompt

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| kind | `PromptKind` | yes |
| name | `string` | yes |
| body | `string` | yes |
| slots | `readonly string[]` | yes |
| updatedAt | `string` | yes |

Source: `packages/app/src/slices/library/model.ts:26`.

### Entry

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| category | `EntryCategory` | yes |
| mode | `EntryMode` | yes |
| name | `string` | yes |
| body | `string` | yes |
| slots | `readonly string[]` | yes |
| updatedAt | `string` | yes |

Source: `packages/app/src/slices/library/model.ts:43`.

### KeyedProvider

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `ProviderId` | yes |  |
| family | `ProviderFamily` | yes |  |
| displayName | `string` | yes |  |
| auth | `"key"` | yes | accepted: key |

Source: `packages/app/src/slices/settings/model.ts:34`.

### CliProvider

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `ProviderId` | yes |  |
| family | `ProviderFamily` | yes |  |
| displayName | `string` | yes |  |
| auth | `"cli"` | yes | accepted: cli |
| binary | `string` | yes |  |
| versionArgs | `readonly string[]` | yes |  |

Source: `packages/app/src/slices/settings/model.ts:40`.

### ProviderStatus

| Field | Type | Required |
|---|---|---|
| id | `ProviderId` | yes |
| family | `ProviderFamily` | yes |
| displayName | `string` | yes |
| readiness | `Readiness` | yes |
| cliPath | `{ readonly configured: string \| null; readonly command: string }` | no |

Source: `packages/app/src/slices/settings/model.ts:97`.

### Voice

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| provider | `ProviderId` | yes |
| name | `string` | yes |
| voiceId | `string` | yes |

Source: `packages/app/src/slices/settings/model.ts:105`.

### AppSettings

| Field | Type | Required |
|---|---|---|
| silenceGapSeconds | `number` | yes |
| appearance | `Appearance` | yes |

Source: `packages/app/src/slices/settings/model.ts:116`.

### CliPathStatus

| Field | Type | Required |
|---|---|---|
| configured | `string \| null` | yes |
| command | `string` | yes |

Source: `packages/app/src/slices/settings/cli-paths.ts:19`.

### ModelInfo

| Field | Type | Required |
|---|---|---|
| thinkingModes | `readonly import("./llm.js").ThinkingMode[]` | no |
| id | `string` | yes |
| name | `string` | yes |

Source: `packages/app/src/kernel/ports/model.ts:8`.

### ProviderChanges

| Field | Type | Required |
|---|---|---|
| chunking | `Chunking \| undefined` | no |
| llm | `ProviderChoice \| undefined` | no |
| audio | `VoiceChoice \| undefined` | no |
| images | `ProviderChoice \| undefined` | no |

Source: `packages/app/src/slices/control/providers.ts:35`.

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

Source: `packages/app/src/kernel/runner/attempt-repo.ts:16`.

### Attempt

| Field | Type | Required | Notes |
|---|---|---|---|
| revisionId | `string \| null` | yes |  |
| workId | `string \| null` | yes |  |
| workPieceId | `string \| null` | yes |  |
| work | `WorkRef` | no |  |
| operation | `"submit" \| "retrieve"` | no | accepted: submit, retrieve |
| stageId | `string` | yes |  |
| pieceId | `string \| null` | yes |  |
| n | `number` | yes |  |
| startedAt | `string` | yes |  |
| id | `string` | yes |  |
| endedAt | `string \| null` | yes |  |
| outcome | `AttemptOutcome \| null` | yes |  |
| errorText | `string \| null` | yes |  |

Source: `packages/app/src/kernel/runner/attempt-repo.ts:34`.

### StagePiece

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| stageId | `string` | yes |
| kind | `PieceKind` | yes |
| idx | `number` | yes |
| state | `PieceState` | yes |
| payload | `string \| null` | yes |

Source: `packages/app/src/kernel/runner/piece-repo.ts:22`.

### Message

| Field | Type | Required |
|---|---|---|
| role | `MessageRole` | yes |
| content | `string` | yes |

Source: `packages/app/src/kernel/ports/llm.ts:6`.

### ThinkingConfig

| Field | Type | Required | Notes |
|---|---|---|---|
| budget | `number \| undefined` | no |  |
| level | `"minimal" \| "low" \| "medium" \| "high" \| undefined` | no | accepted: minimal, low, medium, high |
| effort | `"none" \| "minimal" \| "low" \| "medium" \| "high" \| "xhigh" \| undefined` | no | accepted: none, minimal, low, medium, high, xhigh |

Source: `packages/app/src/kernel/ports/llm.ts:43`.

### TimedWord

| Field | Type | Required |
|---|---|---|
| text | `string` | yes |
| start | `number` | yes |
| end | `number` | yes |
| confidence | `number \| undefined` | no |

Source: `packages/app/src/kernel/ports/subtitles.ts:5`.

### SubtitleOmission

| Field | Type | Required |
|---|---|---|
| start | `number` | yes |
| text | `string` | yes |

Source: `packages/app/src/kernel/ports/subtitles.ts:1`.

### AlignmentRequest

| Field | Type | Required |
|---|---|---|
| audioPath | `string` | yes |
| text | `string` | yes |
| cacheDir | `string` | yes |
| ffmpeg | `string` | yes |
| signal | `AbortSignal` | yes |
| onOmission | `(omission: SubtitleOmission) => void` | no |
| onProgress | `(current: number, total: number) => void` | no |

Source: `packages/app/src/kernel/ports/subtitles.ts:11`.

### FontSummary

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes |  |
| name | `string` | yes |  |
| family | `string` | yes |  |
| source | `"bundled" \| "system" \| "uploaded"` | yes | accepted: bundled, system, uploaded |

Source: `packages/app/src/slices/fonts/model.ts:1`.

### ResolvedFont

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes |  |
| name | `string` | yes |  |
| family | `string` | yes |  |
| source | `"bundled" \| "system" \| "uploaded"` | yes | accepted: bundled, system, uploaded |
| path | `string` | yes |  |
| extension | `".ttf" \| ".otf" \| ".ttc"` | yes | accepted: .ttf, .otf, .ttc |
| assName | `string` | yes |  |
| faceIndex | `number` | yes |  |

Source: `packages/app/src/slices/fonts/model.ts:8`.

### TelemetryCounters

| Field | Type | Required |
|---|---|---|
| stage | `StageKind \| undefined` | no |
| segment | `AudioSegment \| undefined` | no |
| provider | `string \| undefined` | no |
| model | `string \| undefined` | no |
| tokensIn | `number \| undefined` | no |
| tokensOut | `number \| undefined` | no |
| audioSeconds | `number \| undefined` | no |
| images | `number \| undefined` | no |
| thumbnails | `number \| undefined` | no |

Source: `packages/app/src/slices/telemetry/model.ts:60`.

### TelemetryPayload

| Field | Type | Required |
|---|---|---|
| stage | `StageKind \| undefined` | no |
| segment | `AudioSegment \| undefined` | no |
| provider | `string \| undefined` | no |
| model | `string \| undefined` | no |
| tokensIn | `number \| undefined` | no |
| tokensOut | `number \| undefined` | no |
| audioSeconds | `number \| undefined` | no |
| images | `number \| undefined` | no |
| thumbnails | `number \| undefined` | no |
| appVersion | `string` | yes |

Source: `packages/app/src/slices/telemetry/model.ts:73`.

### TelemetryEvent

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| type | `TelemetryEventType` | yes |
| payload | `TelemetryPayload` | yes |
| createdAt | `string` | yes |
| deliveredAt | `string \| null` | yes |

Source: `packages/app/src/slices/telemetry/model.ts:77`.

### Machine

| Field | Type | Required |
|---|---|---|
| machineId | `string` | yes |
| noticeSeenAt | `string \| null` | yes |
| appVersion | `string` | yes |

Source: `packages/app/src/slices/telemetry/model.ts:87`.

### CollectorEvent

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| machineId | `string` | yes |
| type | `TelemetryEventType` | yes |
| payload | `TelemetryPayload` | yes |
| createdAt | `string` | yes |

Source: `packages/app/src/slices/telemetry/collector-client.ts:6`.

### UpdateInfo

| Field | Type | Required |
|---|---|---|
| currentVersion | `string` | yes |
| latestVersion | `string \| null` | yes |
| available | `boolean` | yes |
| busy | `boolean` | yes |
| canUpdate | `boolean` | yes |
| blockedReason | `string` | no |
| status | `UpdateStatus` | yes |
| error | `string` | no |

Source: `packages/app/src/updater/model.ts:3`.

### UpdateResult

| Field | Type | Required |
|---|---|---|
| ok | `boolean` | yes |
| info | `UpdateInfo` | yes |
| code | `400 \| 409 \| 503` | no |

Source: `packages/app/src/updater/model.ts:14`.

### CostRow

| Field | Type | Required |
|---|---|---|
| stage | `string` | yes |
| low | `number \| null` | yes |
| high | `number \| null` | yes |
| detail | `string` | yes |

Source: `packages/app/src/slices/estimate/index.ts:9`.

### CostEstimate

| Field | Type | Required | Notes |
|---|---|---|---|
| currency | `"USD"` | yes | accepted: USD |
| rows | `readonly CostRow[]` | yes |  |
| low | `number` | yes |  |
| high | `number` | yes |  |
| unknown | `number` | yes |  |
| expectedWords | `number` | yes |  |
| catalogueDate | `string \| null` | yes |  |
| assumptions | `readonly string[]` | yes |  |

Source: `packages/app/src/slices/estimate/index.ts:15`.

### Chunking

| Field | Type | Required |
|---|---|---|
| mode | `ChunkMode` | yes |
| words | `number \| undefined` | no |
| characters | `number \| undefined` | no |

Source: `packages/app/src/slices/narration/chunk.ts:4`.

### SubtitleAsset

| Field | Type | Required |
|---|---|---|
| role | `(typeof subtitleRoles)[number]` | yes |
| path | `string` | yes |

Source: `packages/app/src/slices/subtitles/prepare.ts:34`.

### PreparedSubtitles

| Field | Type | Required |
|---|---|---|
| directory | `string` | yes |
| burnIn | `boolean` | yes |
| omissions | `readonly SubtitleOmission[]` | no |
| assets | `readonly SubtitleAsset[]` | yes |

Source: `packages/app/src/slices/subtitles/prepare.ts:38`.

### ManualCue

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| text | `string` | yes |
| start | `number` | yes |
| end | `number` | yes |

Source: `packages/app/src/slices/revisions/model.ts:17`.

### RevisionContent

| Field | Type | Required |
|---|---|---|
| articleMarkdown | `string \| undefined` | no |
| articleEdited | `boolean \| undefined` | no |
| provided | `Readonly<Partial<Record<ProvidedKind, string \| undefined>>>` | yes |
| imageOrder | `readonly string[]` | yes |
| imageDefinitions | `Readonly< Record< string, { readonly source: "generate" \| "provide"; readonly assetId: string \| null; readonly prompt: string \| null; readonly templateKey?: string \| null \| undefined; } > >` | yes |
| narrationOverrides | `Readonly<Record<string, NarrationOverride>>` | yes |
| subtitleCues | `\| { readonly audioFingerprint: string; readonly cues: readonly ManualCue[]; } \| undefined` | no |
| regenerationTokens | `Readonly<Record<WorkKey, string>>` | yes |
| promptTemplates | `Readonly<Record<string, string \| null>>` | yes |

Source: `packages/app/src/slices/revisions/model.ts:26`.

### RevisionUpload

| Field | Type | Required |
|---|---|---|
| stagedFileId | `string` | yes |
| destination | `\| { readonly kind: "provided"; readonly stage: "audio" \| "thumbnail" } \| { readonly kind: "image"; readonly imageKey: string } \| { readonly kind: "narration"; readonly key: string }` | yes |

Source: `packages/app/src/slices/revisions/model.ts:52`.

### RevisionEdit

| Field | Type | Required |
|---|---|---|
| config | `RunConfig` | yes |
| content | `RevisionContent` | yes |
| regenerate | `readonly WorkKey[] \| undefined` | no |
| uploads | `readonly RevisionUpload[] \| undefined` | no |

Source: `packages/app/src/slices/revisions/model.ts:59`.

### ProjectRevision

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| projectId | `string` | yes |
| parentId | `string \| null` | yes |
| restoredFromId | `string \| null` | yes |
| config | `RunConfig` | yes |
| content | `RevisionContent` | yes |
| fingerprints | `Readonly<Record<WorkKey, Fingerprint>>` | yes |
| createdAt | `string` | yes |

Source: `packages/app/src/slices/revisions/model.ts:65`.

### ProjectAsset

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| projectId | `string` | yes |
| path | `string` | yes |
| bytes | `number \| null` | yes |
| createdAt | `string` | yes |

Source: `packages/app/src/slices/revisions/model.ts:75`.

### ManifestOutput

| Field | Type | Required |
|---|---|---|
| slot | `string` | yes |
| workKey | `WorkKey` | yes |
| assetId | `string` | yes |
| output | `Output` | yes |
| fingerprint | `Fingerprint` | yes |
| state | `OutputState` | yes |

Source: `packages/app/src/slices/revisions/model.ts:82`.

### ManifestPiece

| Field | Type | Required |
|---|---|---|
| key | `string` | yes |
| stageKind | `StageKind` | yes |
| piece | `StagePiece` | yes |
| assetId | `string \| null` | yes |
| fingerprint | `Fingerprint` | yes |

Source: `packages/app/src/slices/revisions/model.ts:90`.

### RevisionManifest

| Field | Type | Required |
|---|---|---|
| outputs | `readonly ManifestOutput[]` | yes |
| pieces | `readonly ManifestPiece[]` | yes |

Source: `packages/app/src/slices/revisions/model.ts:97`.

### RevisionOutputView

| Field | Type | Required |
|---|---|---|
| slot | `string` | yes |
| workKey | `WorkKey` | yes |
| assetId | `string` | yes |
| output | `Output` | yes |
| fingerprint | `Fingerprint` | yes |
| state | `OutputState` | yes |
| recordId | `string` | yes |
| publicationId | `string \| null` | yes |
| selected | `boolean` | yes |
| available | `boolean` | yes |

Source: `packages/app/src/slices/revisions/model.ts:101`.

### RevisionPieceView

| Field | Type | Required |
|---|---|---|
| key | `string` | yes |
| stageKind | `StageKind` | yes |
| piece | `StagePiece` | yes |
| assetId | `string \| null` | yes |
| fingerprint | `Fingerprint` | yes |
| recordId | `string` | yes |
| publicationId | `string \| null` | yes |
| selected | `boolean` | yes |
| available | `boolean` | yes |

Source: `packages/app/src/slices/revisions/model.ts:107`.

### RevisionView

| Field | Type | Required |
|---|---|---|
| articleMarkdown | `string \| null` | yes |
| revision | `ProjectRevision` | yes |
| outputs | `readonly RevisionOutputView[]` | yes |
| pieces | `readonly RevisionPieceView[]` | yes |
| current | `boolean` | yes |

Source: `packages/app/src/slices/revisions/model.ts:113`.

### RevisionSummary

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| parentId | `string \| null` | yes |
| restoredFromId | `string \| null` | yes |
| title | `string` | yes |
| createdAt | `string` | yes |
| current | `boolean` | yes |

Source: `packages/app/src/slices/revisions/model.ts:120`.

### SaveRevisionInput

| Field | Type | Required |
|---|---|---|
| projectId | `string` | yes |
| baseRevisionId | `string` | yes |
| idempotencyKey | `string` | yes |
| edit | `RevisionEdit` | yes |

Source: `packages/app/src/slices/revisions/mutations.ts:40`.

### RestoreRevisionInput

| Field | Type | Required |
|---|---|---|
| projectId | `string` | yes |
| baseRevisionId | `string` | yes |
| idempotencyKey | `string` | yes |
| targetRevisionId | `string` | yes |

Source: `packages/app/src/slices/revisions/restore.ts:17`.

### MutationIdentity

| Field | Type | Required | Notes |
|---|---|---|---|
| projectId | `string` | yes |  |
| baseRevisionId | `string` | yes |  |
| idempotencyKey | `string` | yes |  |
| operation | `"save" \| "restore"` | yes | accepted: save, restore |
| hash | `string` | yes |  |

Source: `packages/app/src/slices/revisions/mutation-request.ts:7`.

### WorkRef

| Field | Type | Required |
|---|---|---|
| projectId | `string` | yes |
| revisionId | `string` | yes |
| workId | `string` | yes |
| stageId | `string` | yes |
| kind | `StageKind` | yes |
| fingerprint | `Fingerprint` | yes |

Source: `packages/app/src/kernel/runner/work.ts:15`.

### PublicationRef

| Field | Type | Required |
|---|---|---|
| work | `WorkRef` | yes |
| pieceId | `string \| null` | yes |
| publicationId | `string` | yes |

Source: `packages/app/src/kernel/runner/work.ts:24`.

### RunnerStage

| Field | Type | Required |
|---|---|---|
| work | `WorkRef` | yes |
| id | `string` | yes |
| projectId | `string` | yes |
| kind | `StageKind` | yes |
| state | `StageState` | yes |

Source: `packages/app/src/kernel/runner/index.ts:7`.

### WorkPiece

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes |  |
| workId | `string` | yes |  |
| key | `string` | yes |  |
| requestFingerprint | `string` | yes |  |
| fingerprint | `string` | yes |  |
| input | `RecipeInput` | yes |  |
| logicalFingerprint | `string \| undefined` | no |  |
| continuation | `string \| null` | yes |  |
| generationToken | `string \| null` | yes |  |
| state | `"pending" \| "running" \| "done" \| "failed" \| "held"` | yes | accepted: pending, running, done, failed, held |
| dispatchState | `"held" \| "allowed" \| "draining"` | yes | accepted: held, allowed, draining |
| submittedAt | `string \| null` | yes |  |

Source: `packages/app/src/slices/rebuild/work-records.ts:5`.

### RebuildWork

| Field | Type | Required | Notes |
|---|---|---|---|
| key | `string` | yes |  |
| stage | `StageKind` | yes |  |
| kind | `"provider" \| "local" \| "provided"` | yes | accepted: provider, local, provided |
| disposition | `"reuse" \| "generate" \| "local" \| "review" \| "blocked"` | yes | accepted: reuse, generate, local, review, blocked |
| requestFingerprint | `string` | yes |  |
| fingerprint | `string` | yes |  |
| dependsOn | `readonly string[]` | yes |  |
| reason | `string` | yes |  |
| inflight | `boolean` | yes |  |
| pieceIds | `readonly string[]` | yes |  |

Source: `packages/app/src/slices/rebuild/model.ts:10`.

### RebuildPreview

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| projectId | `string` | yes |
| baseRevisionId | `string` | yes |
| planFingerprint | `string` | yes |
| selection | `RebuildSelection` | yes |
| changedInputs | `readonly { readonly path: string; readonly before: string \| null; readonly after: string \| null; }[]` | yes |
| work | `readonly RebuildWork[]` | yes |
| retained | `readonly { readonly slot: string; readonly outputId: string; readonly assetId: string; readonly state: "ready" \| "outdated" \| "review"; }[]` | yes |
| providedReuseRequired | `readonly string[]` | yes |
| costs | `CostEstimate` | yes |
| wholeRequestNotice | `string \| null` | yes |
| warnings | `readonly string[]` | yes |
| review | `{ inputChanges: readonly { label: string; before: string \| null; after: string \| null }[]; requests: readonly { key: string; label: string; text: string \| null; settings: string \| null }[] } \| undefined` | no |

Source: `packages/app/src/slices/rebuild/model.ts:23`.

### RebuildAdmission

| Field | Type | Required |
|---|---|---|
| revisionId | `string` | yes |
| admissionId | `string` | yes |
| workIds | `readonly string[]` | yes |
| replayed | `boolean` | yes |

Source: `packages/app/src/slices/rebuild/model.ts:62`.

### WorkRecipe

| Field | Type | Required | Notes |
|---|---|---|---|
| key | `string` | yes |  |
| stage | `StageKind` | yes |  |
| kind | `"provider" \| "local" \| "provided"` | yes | accepted: provider, local, provided |
| requestFingerprint | `string` | yes |  |
| fingerprint | `string` | yes |  |
| dependsOn | `readonly string[]` | yes |  |
| unresolved | `boolean` | yes |  |

Source: `packages/app/src/slices/rebuild/dependencies.ts:4`.

### RetainedWork

| Field | Type | Required |
|---|---|---|
| key | `string` | yes |
| requestFingerprint | `string` | yes |
| fingerprint | `string` | yes |
| available | `boolean` | yes |
| inflight | `boolean` | yes |
| pieceIds | `readonly string[]` | yes |

Source: `packages/app/src/slices/rebuild/dependencies.ts:14`.

### ResolvedRevisionInputs

| Field | Type | Required |
|---|---|---|
| articleMarkdown | `string \| null` | yes |
| researchNotes | `string \| null` | yes |
| research | `\| { readonly outline: readonly string[]; readonly findings: readonly Finding[] } \| undefined` | no |
| articleContinuation | `string \| undefined` | no |

Source: `packages/app/src/slices/rebuild/recipe-model.ts:17`.

### ResolvedWorkRecipe

| Field | Type | Required | Notes |
|---|---|---|---|
| key | `string` | yes |  |
| stage | `StageKind` | yes |  |
| kind | `"provider" \| "local" \| "provided"` | yes | accepted: provider, local, provided |
| requestFingerprint | `string` | yes |  |
| fingerprint | `string` | yes |  |
| dependsOn | `readonly string[]` | yes |  |
| unresolved | `boolean` | yes |  |
| input | `RecipeInput` | yes |  |
| logicalFingerprint | `string` | yes |  |
| deferred | `boolean` | yes |  |

Source: `packages/app/src/slices/rebuild/recipe-model.ts:101`.

### ProjectBody

| Field | Type | Required |
|---|---|---|
| revisionId | `string \| null` | yes |
| project | `ProjectSummary` | yes |
| stages | `readonly Stage[]` | yes |
| outputs | `readonly Output[]` | yes |

Source: `packages/web/src/api.ts:77`.

### CreatedProjectBody

| Field | Type | Required |
|---|---|---|
| project | `ProjectSummary` | yes |
| stages | `readonly Stage[]` | yes |

Source: `packages/web/src/api.ts:83`.

### RevisionRefusal

| Field | Type | Required |
|---|---|---|
| ok | `false` | yes |
| reason | `string` | yes |
| message | `string` | yes |
| currentRevisionId | `string \| null` | yes |
| fields | `readonly { readonly field: string; readonly message: string }[]` | yes |

Source: `packages/web/src/project/revision-api.ts:30`.

### Catalogue

| Field | Type | Required |
|---|---|---|
| schemaVersion | `1` | yes |
| updatedAt | `string (YYYY-MM-DD)` | yes |
| providers | `Record<string, {maxConcurrent: number (1..5)}>` | yes |
| llm | `CatalogueModel[] (LLM branch)` | yes |
| image | `CatalogueModel[] (image branch)` | yes |
| tts | `CatalogueModel[] (TTS branch)` | yes |

Source: `packages/app/src/catalog/schema.ts:98`.

### CatalogueModel

| Field | Type | Required |
|---|---|---|
| provider | `string` | yes |
| id | `string` | yes |
| name | `string` | yes |
| enabled | `boolean (default true)` | yes |
| deprecated | `boolean (default false)` | yes |
| source | `URL string` | yes |
| keywords | `string[] (default [])` | yes |
| pricing | `object (default {}): optional inputPerMillionTokens, outputPerMillionTokens, perMillionCharacters, perImage, perMinute, note` | yes |
| llm | `object: optional contextTokens, maxOutputTokens, thinking; webSearch boolean default false` | no |
| image | `object: aspectRatios (16:9 \| 9:16)[], optional resolution` | no |
| tts | `object: maxCharacters integer 2..1000000, streaming boolean, optional asyncMaxCharacters` | no |

Source: `packages/app/src/catalog/schema.ts:99`.

### QueueEntry

| Field | Type | Required | Notes |
|---|---|---|---|
| projectId | `string` | yes |  |
| batchId | `string` | yes |  |
| position | `number` | yes |  |
| state | `"queued" \| "active" \| "finished"` | yes | accepted: queued, active, finished |

Source: `packages/app/src/slices/batch/index.ts:19`.

### SubtitleConfig

| Field | Type | Required | Notes |
|---|---|---|---|
| mode | `"off" \| "files" \| "burn-in"` | yes | accepted: off, files, burn-in |
| language | `"en" (default)` | yes |  |
| fontId | `string (default "default")` | yes |  |
| position | `"top" \| "upper-middle" \| "center" \| "lower-middle" \| "bottom" (default)` | yes |  |
| fontSize | `integer 16..120 (default 48)` | yes |  |

Source: `packages/app/src/slices/subtitles/model.ts:22`.

### Aggregates

| Field | Type | Required |
|---|---|---|
| installs | `number` | yes |
| projects_created | `number` | yes |
| videos_made | `number` | yes |
| images_made | `number` | yes |
| thumbnails_made | `number` | yes |
| audio_seconds | `number` | yes |
| tokens_used | `number` | yes |

Source: `packages/collector/src/model.ts:31`.

### AudioExportRecord

| Field | Type | Required |
|---|---|---|
| sampleRate | `number` | yes |
| channels | `number` | yes |
| codec | `string` | yes |
| gapSeconds | `number` | yes |
| totalSeconds | `number` | yes |
| audio | `{ kind: string; path: string \| null; seconds: number }[]` | yes |
| output | `string` | yes |
| sourceIds | `string[]` | no |

Source: `packages/app/src/slices/video/reuse-audio.ts:17`.

### NarrationOverride

| Field | Type | Required | Notes |
|---|---|---|---|
| kind | `"asset" \| "text"` | yes | accepted: asset, text |
| assetId | `string` | yes | asset branch |
| text | `string` | yes | text branch |

Source: `packages/app/src/slices/revisions/model.ts:23`. Notes: branches are exclusive; asset IDs identify registered ProjectAsset values; text replaces a logical narration unit.

### RevisionOutputRecord

| Field | Type | Required |
|---|---|---|
| slot | `string` | yes |
| workKey | `WorkKey` | yes |
| assetId | `string` | yes |
| output | `Output` | yes |
| fingerprint | `Fingerprint` | yes |
| state | `OutputState` | yes |
| recordId | `string` | yes |
| publicationId | `string \| null` | yes |
| selected | `boolean` | yes |

Source: `packages/app/src/slices/revisions/model.ts:154`. Notes: `Omit<RevisionOutputView, "available">`; availability is measured when constructing RevisionView.

### RevisionPieceRecord

| Field | Type | Required |
|---|---|---|
| key | `string` | yes |
| stageKind | `StageKind` | yes |
| piece | `StagePiece` | yes |
| assetId | `string \| null` | yes |
| fingerprint | `Fingerprint` | yes |
| recordId | `string` | yes |
| publicationId | `string \| null` | yes |
| selected | `boolean` | yes |

Source: `packages/app/src/slices/revisions/model.ts:155`. Notes: `Omit<RevisionPieceView, "available">`; a null asset ID is valid for a non-file piece.

### RebuildSelection

| Field | Type | Required | Notes |
|---|---|---|---|
| kind | `"allAffected" \| "selected"` | yes | accepted: allAffected, selected |
| workKeys | `readonly string[]` | yes | selected branch |

Source: `packages/app/src/slices/rebuild/model.ts:6`. Notes: the HTTP schema accepts 1–10,000 selected keys, each 1–200 characters, and rejects extra branch properties (`packages/app/src/slices/rebuild/model.ts:84`). Duplicate keys and unavailable/disabled dependencies produce a refusal in planning (`packages/app/src/slices/rebuild/preview-plan.ts:62`).

### RevisionControlInput

| Field | Type | Required |
|---|---|---|
| baseRevisionId | `string` | yes |
| idempotencyKey | `string` | yes |

Source: `packages/app/src/slices/control/revision-control-schema.ts:3`. Notes: strict object; base ID is 1–64 characters; key must be a UUID. The operation comes from the pause/cancel route, not an extra body property (`packages/app/src/edge/http/actions.ts:41`).

### RecipeInput

| Field | Type | Required | Notes |
|---|---|---|---|
| kind | `"llm" \| "tts" \| "image" \| "provided" \| "local" \| "deferred"` | yes | accepted: llm, tts, image, provided, local, deferred |
| version | `1` | yes |  |
| provider | `string` | yes | llm/tts/image branches |
| model | `string` | yes | llm/tts/image branches |
| thinking | `ThinkingMode \| null` | yes | llm branch |
| thinkingConfig | `ThinkingConfig \| null` | yes | llm branch |
| messages | `readonly Message[]` | yes | llm branch |
| webSearch | `boolean` | yes | llm branch |
| voice | `string` | yes | tts branch |
| text | `string` | yes | tts branch |
| logicalKey | `string` | yes | tts branch |
| logicalText | `string` | yes | tts branch |
| segment | `"body" \| "intro" \| "outro"` | yes | tts branch; accepted: body, intro, outro |
| pronunciation | `null` | yes | tts branch |
| wholeRequest | `boolean \| undefined` | no | tts branch only |
| prompt | `string` | yes | image branch |
| aspect | `RunConfig["format"]` | yes | image branch |
| assetId | `string \| null` | yes | provided branch |
| semantic | `FingerprintValue` | yes | provided branch |
| operation | `(typeof localOperations)[number]` or `(typeof deferredOperations)[number]` | yes | local/deferred branches respectively |
| values | `FingerprintValue` | yes | local branch |
| template | `FingerprintValue` | yes | deferred branch |

Source: `packages/app/src/slices/rebuild/recipe-model.ts:51`. Notes: `recipeInputSchema` is a strict version-1 discriminated union. FingerprintValue admits null, booleans, finite numbers, strings, recursive arrays and records; it does not admit undefined (`packages/app/src/slices/rebuild/recipe-input-schema.ts:6`).

Finite local operations: export-wav, wav2vec2-en-a19f851-v2-omissions, automatic-cues-v1, manual-cues-v1, subtitle-files-v1, render-video, render-selected-video, provided-notes, provided-article, manual-article, entry-text, concat-narration. Deferred operations: research-synthesis, article, entry:intro:text, entry:outro:text, thumbnail-prompt, thumbnail-image, body-narration, intro-narration, outro-narration, resolve-revision-recipe. Unknown operation strings fail the persisted recipe schema (`packages/app/src/slices/rebuild/recipe-model.ts:26`, `packages/app/src/slices/rebuild/recipe-input-schema.ts:70`).

### RecipeProviderChoice

| Field | Type | Required | Notes |
|---|---|---|---|
| provider | `string` | yes |  |
| model | `string` | yes |  |
| family | `ProviderFamily` | yes | accepted: llm, tts, image |
| voice | `string \| undefined` | no |  |

Source: `packages/app/src/slices/rebuild/recipe-provider-choice.ts:5`. Concrete recipe kinds identify the provider family; deferred thumbnail-image selects the image provider even though its stage is thumbnail. The same resolution feeds readiness and catalogue snapshot selection (`packages/app/src/slices/rebuild/recipe-provider-choice.ts:16`, `packages/app/src/slices/rebuild/service-readiness.ts:25`, `packages/app/src/slices/rebuild/preview-plan.ts:232`).

### AudioRecipes

| Field | Type | Required |
|---|---|---|
| recipes | `readonly ResolvedWorkRecipe[]` | yes |
| mediaFingerprint | `string \| null` | yes |
| timeline | `FingerprintValue` | yes |
| keys | `readonly string[]` | yes |

Source: `packages/app/src/slices/rebuild/recipe-audio.ts:18`. Media identity uses ordered audio resource identities and silence gaps; the subtitle timeline additionally contains transcript and observed duration. Observed duration is excluded from mediaFingerprint. Audio Off returns no media fingerprint (`packages/app/src/slices/rebuild/recipe-audio.ts:27`, `packages/app/src/slices/rebuild/recipe-audio.ts:139`, `packages/app/src/slices/rebuild/recipe-audio.ts:150`). Export recipes use mediaFingerprint for WAV and timeline for alignment (`packages/app/src/slices/rebuild/recipe-exports.ts:15`, `packages/app/src/slices/rebuild/recipe-exports.ts:44`).

### ExecutionSnapshot

| Field | Type | Required | Notes |
|---|---|---|---|
| version | `1` | yes |  |
| submissions | `{key: string; submit: boolean; uncertain: boolean}[]` | yes | after parsing; defaults to [] |
| catalogue | `Catalogue` | yes |  |
| recipes | `ResolvedWorkRecipe[]` | yes |  |
| dispositions | `{key: string; disposition: string}[]` | yes |  |
| assets | `{id: string; path: string; available: boolean}[]` | yes |  |
| reviews | `{key: string; fingerprint: string}[]` | yes |  |
| anchors | `Record<string, string>` | yes |  |
| ordinals | `Record<string, number>` | yes |  |

Source: `packages/app/src/slices/rebuild/preview-plan.ts:22`. Notes: numeric ordinals are integers. This is persisted private execution data, separate from RebuildPreview's public cost/dependency summary. Submission classification records whether another request is needed and whether a previous submitted request has an uncertain result; that classification participates in the plan fingerprint. A reviewed paid request can become a free join, but a free join becoming a new submission or acquiring new uncertainty requires a fresh preview (`packages/app/src/slices/rebuild/preview-plan.ts:147`, `packages/app/src/slices/rebuild/preview-plan.ts:253`, `packages/app/src/slices/rebuild/preview-plan.ts:260`).

### RevisionMutationResult

| Field | Type | Required | Notes |
|---|---|---|---|
| ok | `boolean` discriminant | yes |  |
| view | `RevisionView` | yes | success branch |
| duplicate | `boolean` | yes | success branch |
| reason | `"no-project" \| "no-revision" \| "conflict" \| "idempotency-conflict" \| "invalid-edit"` | yes | refusal branch; accepted: no-project, no-revision, conflict, idempotency-conflict, invalid-edit |
| currentRevisionId | `string \| null` | yes | refusal branch |
| fields | `readonly FieldError[] \| undefined` | no | refusal branch only |

Source: `packages/app/src/slices/revisions/model.ts:128`. Notes: HTTP successful Save/Restore returns the success branch directly; refusals become Problem Details with reason/current revision/fields (`packages/app/src/edge/http/revisions.ts:35`).

### BaselineResult

| Field | Type | Required | Notes |
|---|---|---|---|
| ok | `boolean` discriminant | yes |  |
| view | `RevisionView` | yes | success branch |
| created | `boolean` | yes | success branch |
| reason | `"no-project"` | yes | refusal branch; accepted: no-project |

Source: `packages/app/src/slices/revisions/model.ts:141`.

### RebuildResult

| Field | Type | Required | Notes |
|---|---|---|---|
| ok | `boolean` discriminant | yes |  |
| value | `T` | yes | success branch |
| reason | `"no-project" \| "conflict" \| "stale-preview" \| "invalid-selection" \| "review-required" \| "cost-ack-required" \| "readiness"` | yes | refusal branch; accepted: no-project, conflict, stale-preview, invalid-selection, review-required, cost-ack-required, readiness |
| fields | `readonly FieldError[] \| undefined` | no | refusal branch only |

Source: `packages/app/src/slices/rebuild/model.ts:69`. Notes: T is RebuildPreview or RebuildAdmission at the public boundary; Start success is HTTP 202 (`packages/app/src/edge/http/revisions.ts:117`).

### Readiness

| Field | Type | Required | Notes |
|---|---|---|---|
| kind | `"keyed" \| "cli"` | yes | accepted: keyed, cli |
| hasKey | `boolean` | yes | keyed branch |
| installed | `boolean` | yes | cli branch |
| version | `string` | no | cli branch only |

Source: `packages/app/src/kernel/ports/model.ts:17`. Notes: readiness DTOs contain key presence, not key values.

**Notes on field values**

Chunking.mode accepts whole/paragraph/words/characters. Whole is the default; words defaults to 500 and characters to 3000. Character grouping counts Unicode code points and preserves sentences, so one oversized sentence can exceed its requested grouping budget before provider-specific splitting (`packages/app/src/slices/narration/chunk.ts:1`, `packages/app/src/slices/narration/chunk.ts:22`, `packages/app/src/slices/narration/chunk.ts:55`).

CatalogueModel is a union with one required llm, image or tts family object. Defaulted enabled/deprecated/keywords/pricing fields are present after parse. The catalogue is capped at 300 LLM, 200 image and 100 TTS models, with provider maxConcurrent 1–5 (`packages/app/src/catalog/schema.ts:5`, `packages/app/src/catalog/schema.ts:70`).

- Format is `16:9` or `9:16`. StageKind is research, article, audio, images, thumbnail or video. StageState is pending, running, done, failed, canceled, provided or skipped; ProjectState adds paused and excludes provided/skipped (`packages/app/src/kernel/pipeline.ts:6`). StageSource is generate, provide, off, from_prompt or prompt_by_llm; admission applies stage-specific restrictions (`packages/app/src/slices/admission/model.ts:11`, `packages/app/src/slices/admission/rules.ts:46`).
- ProviderFamily is llm, tts or image. Provider IDs are openrouter, claude-code, codex, gemini, elevenlabs, openai-tts, cartesia, inworld, fal, replicate, openai-image and google-image (`packages/app/src/kernel/ports/model.ts:4`, `packages/app/src/slices/settings/model.ts:12`). ThinkingMode is off, low, medium, high or xhigh; model-specific availability comes from Catalogue (`packages/app/src/kernel/ports/llm.ts:41`, `packages/app/src/catalog/schema.ts:25`).
- OutputRole accepts notes, article_md, article_txt, sources, glossary, audio_body, audio_intro, audio_outro, audio_export, image, thumbnail, video, render_params, subtitles_srt, subtitles_vtt, subtitle_words, subtitle_ass, subtitle_font and instructions. StagedFileState is copying or staged; output paths are project-relative (`packages/app/src/slices/storage/model.ts:6`, `packages/app/src/slices/storage/model.ts:33`, `packages/app/src/slices/storage/model.ts:57`). PieceKind accepts chapter, chunk, segment, image, prompt_written and article_written; PieceState accepts pending, running, done and failed. The nullable payload remains a JSON string at the StagePiece boundary (`packages/app/src/kernel/runner/piece-repo.ts:9`, `packages/app/src/kernel/runner/piece-repo.ts:19`).
- Prompt.kind accepts article/image/thumbnail; Entry.category accepts intro/outro and mode text/llm. Their detected slots are serialized arrays, not references to another table (`packages/app/src/slices/library/model.ts:4`, `packages/app/src/slices/library/model.ts:12`, `packages/app/src/slices/library/repo.ts:171`).
- RevisionContent uses stable image keys and a separate imageOrder; generated definitions can retain raw-template identity in templateKey. Raw promptTemplates can be null when an old project has only rendered wording. Manual subtitle cues bind to an audioFingerprint. OutputState is ready/outdated/review (`packages/app/src/slices/revisions/model.ts:15`, `packages/app/src/slices/revisions/model.ts:26`).
- Attempt.revisionId/workId/workPieceId are required nullable values on repository reads. The inherited work/operation fields are optional call-context inputs; they are not columns in attempts and `toAttempt` does not return them (`packages/app/src/kernel/runner/attempt-repo.ts:16`, `packages/app/src/kernel/runner/attempt-repo.ts:114`). AttemptOutcome adds ok and canceled to provider faults auth/missing_key/rate_limit/refusal/unsupported/timeout/other (`packages/app/src/kernel/runner/attempt-repo.ts:13`, `packages/app/src/kernel/ports/model.ts:21`).
- RebuildWork.kind accepts provider/local/provided, while disposition distinguishes reuse/generate/local/review/blocked. Physical work can be held independently of a pending state: WorkPiece.state and dispatchState are separate persisted dimensions (`packages/app/src/slices/rebuild/model.ts:10`, `packages/app/src/slices/rebuild/work-records.ts:5`).
- AppSettings defaults to a 3-second silence gap and system appearance; setting validation accepts integer gaps 0–30 and appearance system/light/dark (`packages/app/src/slices/settings/model.ts:116`, `packages/app/src/slices/settings/playback.ts:26`, `packages/app/src/slices/admission/rules.ts:30`). UpdateStatus is idle/checking/installing/restarting/error (`packages/app/src/updater/model.ts:1`).
- TelemetryPayload includes the app version and optional counters; TelemetryEventType is install/project.created/stage.completed, segment is body/intro/outro. The strict outbound payload excludes additional fields. The collector's separately named CollectorEvent accepts a bounded flat payload for forward compatibility; its definition is `packages/collector/src/model.ts:70`, distinct from the app outbound interface listed above (`packages/app/src/slices/telemetry/model.ts:7`, `packages/app/src/slices/telemetry/model.ts:44`, `packages/collector/src/model.ts:46`).
Tables apply to readonly fields unless the source says otherwise. Required=yes permits explicitly nullable/undefined values; branch-only fields use Required=no with branch requirements in Notes. Inline structural types are written directly rather than assigning invented entity names.

### PlayDraftForm

Definition: `packages/app/src/slices/play-drafts/schema.ts:79`.

| Field | Type | Required | Notes |
|---|---|---|---|
| title | string | yes | Untrimmed editor text |
| format | "16:9" ∣ "9:16" | yes | accepted: 16:9, 9:16 |
| sources | { research: StageSource; article: StageSource; audio: StageSource; images: StageSource; thumbnail: StageSource; video: StageSource } | yes | Each value accepted: generate, provide, off, from_prompt, prompt_by_llm; stage-specific runnable combinations are checked later |
| llm | { provider: string; model: string; thinking?: ThinkingMode } | yes | thinking optional; accepted: off, low, medium, high, xhigh |
| audio | { provider: string; model: string; thinking?: ThinkingMode; voice: string } | yes | thinking optional; accepted: off, low, medium, high, xhigh |
| images | { provider: string; model: string; thinking?: ThinkingMode } | yes | thinking optional; accepted: off, low, medium, high, xhigh |
| articlePrompt | string | yes | Saved prompt name, including empty/unavailable choice |
| imagePrompts | { name: string; number: string }[] | yes | Order retained; number stays raw text |
| thumbnailPrompt | string | yes | Saved prompt name |
| intro | string | yes | Entry name; empty string represents Off |
| outro | string | yes | Entry name; empty string represents Off |
| chunking | { mode: ChunkMode; words: string; characters: string } | yes | mode accepted: whole, paragraph, words, characters; both numeric strings retained |
| subtitles | { mode: "off" ∣ "files" ∣ "burn-in"; language: "en"; fontId: string; fontSize: string; position: "top" ∣ "upper-middle" ∣ "center" ∣ "lower-middle" ∣ "bottom" } | yes | mode accepted: off, files, burn-in; position accepted: top, upper-middle, center, lower-middle, bottom |
| values | Readonly<Record<string, string>> | yes | Includes inactive keyword values |
| provided | { research: string; article: string; audio: { attachmentId: string; name: string } ∣ null; thumbnail: { attachmentId: string; name: string } ∣ null; images: { attachmentId: string; name: string }[] } | yes | File references carry UUID attachment identity and original name; no browser File bytes |

The schema uses strict nested objects and readonly inferred values. It has no runnable-field defaults; fresh editor defaults come from `packages/web/src/play/draft-state.ts:11`. Raw numeric text accepts blanks/fractions/out-of-range values for saving; admission parses active numeric requirements (`packages/app/src/slices/play-drafts/convert.ts:22`). Source/thinking/chunk/subtitle literal sets are imported at `packages/app/src/slices/play-drafts/schema.ts:2`.

### PlayDraftDocument

Definition: `packages/app/src/slices/play-drafts/schema.ts:80`.

| Field | Type | Required | Notes |
|---|---|---|---|
| schemaVersion | 1 | yes | accepted: 1 |
| form | PlayDraftForm | yes | Raw editor fields |
| section | "content" ∣ "outputs" ∣ "style" ∣ "review" | yes | accepted: content, outputs, style, review |
| variants | { id: string; title: string; values: Readonly<Record<string, string>> }[] | yes | Stable UUID per extra video; title and keyword values are raw |
| expectedWords | string | yes | Raw cost-estimate input |
| previewText | string | yes | Local caption preview sample |
| fontUpload | { operationId: string; name: string } ∣ null | yes | UUID operation and filename; pending/failed/interrupted upload marker |

### DraftSummary

Definition: `packages/app/src/slices/play-drafts/model.ts:15`.

| Field | Type | Required | Notes |
|---|---|---|---|
| id | string | yes | UUID |
| title | string | yes | Saved title |
| version | number | yes | Positive integer |
| updatedAt | string | yes | Saved timestamp |
| readable | boolean | yes | Whether stored document schema is readable |

### PlayDraft

Definition: `packages/app/src/slices/play-drafts/model.ts:22`.

| Field | Type | Required | Notes |
|---|---|---|---|
| id | string | yes | UUID |
| version | number | yes | Positive integer |
| createdAt | string | yes | Creation timestamp |
| updatedAt | string | yes | Last save timestamp |
| document | PlayDraftDocument | yes | Strict editor envelope |

### DraftAttachment

Definition: `packages/app/src/slices/play-drafts/model.ts:29`.

| Field | Type | Required | Notes |
|---|---|---|---|
| id | string | yes | Attachment UUID |
| kind | "audio" ∣ "images" ∣ "thumbnail" | yes | accepted: audio, images, thumbnail |
| name | string | yes | Original filename |
| state | "pending" ∣ "copying" ∣ "ready" ∣ "reattach" | yes | accepted: pending, copying, ready, reattach |
| stagedFileId | string ∣ null | yes | Validated staging identity or null |
| bytes | number | yes | Nonnegative |
| error | string ∣ null | yes | Recovery message or null |

### ResolvedPlayRun

Definition: `packages/app/src/slices/play-drafts/model.ts:38`.

| Field | Type | Required | Notes |
|---|---|---|---|
| draft | RunDraft | yes | Admission representation |
| rendered | Readonly<Record<string, string>> | yes | Resolved prompt text |
| templates | Readonly<Record<string, string>> | yes | Raw templates |

### PlayReview

Definition: `packages/app/src/slices/play-drafts/model.ts:43`.

| Field | Type | Required | Notes |
|---|---|---|---|
| id | string | yes | Review UUID reused for Start |
| draftId | string | yes | Draft UUID |
| draftVersion | number | yes | Positive saved version |
| fingerprint | string | yes | Resolved setup binding |
| runs | ResolvedPlayRun[] | yes | Base run plus variants |
| estimates | CostEstimate[] | yes | Per-run estimates |

### PlayStartResult

Definition: `packages/app/src/slices/play-drafts/model.ts:51`.

| Field | Type | Required | Notes |
|---|---|---|---|
| requestId | string | yes | Review UUID |
| projectIds | string[] | yes | Created project IDs |
| queue | QueueEntry[] | yes | Empty for single run |
| replayed | boolean | yes | Whether result is a receipt replay |

### DraftView

Definition: `packages/app/src/slices/play-drafts/model.ts:57`.

| Field | Type | Required | Notes |
|---|---|---|---|
| draft | PlayDraft | yes | Saved document |
| attachments | DraftAttachment[] | yes | Owned attachment views |
| review | PlayReview ∣ null | yes | Persisted review |
| pendingStart | { reviewId: string; draftVersion: number } ∣ null | yes | Starting identity |
| start | PlayStartResult ∣ null | yes | Accepted receipt projection |

### DraftSaveInput

Definition: `packages/app/src/slices/play-drafts/model.ts:64`.

| Field | Type | Required | Notes |
|---|---|---|---|
| id | string | yes | Draft UUID from route |
| baseVersion | number | yes | Positive integer |
| mutationId | string | yes | UUID |
| document | PlayDraftDocument | yes | Complete replacement editor document |

### PlayStartInput

Definition: `packages/app/src/slices/play-drafts/model.ts:70`.

| Field | Type | Required | Notes |
|---|---|---|---|
| draftId | string | yes | Draft UUID from route |
| baseVersion | number | yes | Positive integer |
| reviewId | string | yes | Review UUID |

### ResolvedPlayReview

Definition: `packages/app/src/slices/play-drafts/model.ts:97`.

| Field | Type | Required | Notes |
|---|---|---|---|
| runs | ResolvedPlayRun[] | yes | Resolved run list |
| estimates | CostEstimate[] | yes | Run estimates |
| fingerprint | string | yes | Complete review identity |
| catalogue | Catalogue | yes | Captured pricing/model catalogue |
| attachmentIdentity | { id: string; stagedFileId: string; bytes: number }[] | yes | Bound ready attachments |
| font | ResolvedFont ∣ null | yes | Resolved font when applicable |

### DraftResult

Definition: `packages/app/src/slices/play-drafts/model.ts:75`.

| Field | Type | Required | Notes |
|---|---|---|---|
| ok | boolean | yes | Discriminant: true success; false refusal |
| value | T | no | Required on success only |
| reason | "not-found" ∣ "invalid-draft" ∣ "conflict" ∣ "invalid-edit" ∣ "pending-start" ∣ "already-started" ∣ "stale-review" ∣ "readiness" | no | Required on refusal; accepted: not-found, invalid-draft, conflict, invalid-edit, pending-start, already-started, stale-review, readiness |
| currentVersion | number ∣ null | no | Required on refusal |
| fields | FieldError[] | no | Required on refusal |
| reviewId | string | no | Optional pending review identity |

Generic spelling in code is `DraftResult<T>`; the heading uses its named type identifier. Required=no for branch-only fields means the field is absent from the other discriminated branch, not optional inside the named branch.

### DraftRow

Definition: `packages/app/src/slices/play-drafts/repo.ts:23`.

| Field | Type | Required | Notes |
|---|---|---|---|
| id | string | yes | Primary key |
| schema_version | number | yes | Stored document version |
| version | number | yes | CAS revision |
| title | string | yes | List metadata |
| document_json | string | yes | Serialized PlayDraftDocument |
| creation_hash | string | yes | Creation/fork replay body hash |
| save_mutation_id | string ∣ null | yes | Last accepted save UUID |
| save_request_hash | string ∣ null | yes | Last accepted save body hash |
| created_at | string | yes | Timestamp |
| updated_at | string | yes | Timestamp |
| state | "active" ∣ "starting" ∣ "started" | yes | accepted: active, starting, started |
| review_id | string ∣ null | yes | Current review UUID |
| review_json | string ∣ null | yes | Review and private execution snapshot |
| review_fingerprint | string ∣ null | yes | Resolved binding |
| start_id | string ∣ null | yes | Claimed review UUID |

### AttachmentRow

Definition: `packages/app/src/slices/play-drafts/repo.ts:33`.

| Field | Type | Required | Notes |
|---|---|---|---|
| id | string | yes | Primary key |
| draft_id | string | yes | Draft owner |
| staged_file_id | string ∣ null | yes | Shared staged row |
| kind | "audio" ∣ "images" ∣ "thumbnail" | yes | accepted: audio, images, thumbnail |
| original_filename | string | yes | Original name |
| status | "pending" ∣ "ready" ∣ "reattach" | yes | accepted: pending, ready, reattach |
| error | string ∣ null | yes | Failure detail |

### AttachmentRef

Definition: `packages/app/src/slices/play-drafts/repo.ts:34`.

| Field | Type | Required | Notes |
|---|---|---|---|
| attachmentId | string | yes | UUID |
| name | string | yes | Original name |
| kind | "audio" ∣ "images" ∣ "thumbnail" | yes | accepted: audio, images, thumbnail |

### StoredStartReceipt

Definition: `packages/app/src/slices/play-drafts/start-repo.ts:23`.

| Field | Type | Required | Notes |
|---|---|---|---|
| id | string | yes | Review UUID |
| draftId | string | yes | Draft UUID |
| draftVersion | number | yes | Reviewed version |
| requestHash | string | yes | Start request hash |
| result | PlayStartResult | yes | Parsed result_json |

### DraftRefusal

Definition: `packages/web/src/play/draft-api.ts:24`.

| Field | Type | Required | Notes |
|---|---|---|---|
| ok | false | yes | accepted: false |
| reason | string | yes | Server reason or invalid-request fallback |
| message | string | yes | Problem detail or title |
| currentVersion | number ∣ null | yes | Server version or null |
| fields | { field: string; message: string }[] | yes | Server fields or converted validation paths |
| reviewId | string | no | UUID if supplied |

### DraftReply

Definition: `packages/web/src/play/draft-api.ts:32`.

| Field | Type | Required | Notes |
|---|---|---|---|
| ok | boolean | yes | Discriminant |
| value | T | no | Required on success; failure branch is DraftRefusal |
| reason | string | no | Required on failure |
| message | string | no | Required on failure |
| currentVersion | number ∣ null | no | Required on failure |
| fields | { field: string; message: string }[] | no | Required on failure |
| reviewId | string | no | Optional on failure |

### TutorialSession

Definition: `packages/app/src/slices/settings/tutorial-schema.ts:41; packages/web/src/tutorial/model.ts:9`.

| Field | Type | Required | Notes |
|---|---|---|---|
| schemaVersion | 1 | yes | Server representation only; accepted: 1 |
| active | boolean | yes | Server and browser |
| stepId | "text-key" ∣ "audio-key" ∣ "image-key" ∣ "voice" ∣ "article-name" ∣ "article-body" ∣ "article-keywords" ∣ "article-save" ∣ "image-prompt" ∣ "image-save" ∣ "play-options" ∣ "play-article" ∣ "play-keywords" ∣ "play-audio" ∣ "play-images" ∣ "play-video" ∣ "play-subtitles" ∣ "play-start" ∣ "project" ∣ "download" | yes | Server only; accepted: text-key, audio-key, image-key, voice, article-name, article-body, article-keywords, article-save, image-prompt, image-save, play-options, play-article, play-keywords, play-audio, play-images, play-video, play-subtitles, play-start, project, download |
| articleId | string | no | Server and browser; referenced article prompt |
| imageId | string | no | Server and browser; referenced image prompt |
| projectId | string | no | Server and browser; created project |

There are two distinct code declarations with this same name, not one merged type. The table above is the **server** representation. The browser table below replaces schemaVersion/stepId with numeric step; see the additional scoped table. Conversion is in `packages/web/src/tutorial/use-session.ts:41` and `packages/web/src/tutorial/use-session.ts:98`.

**Browser representation** (`packages/web/src/tutorial/model.ts:9`):

| Field | Type | Required | Notes |
|---|---|---|---|
| active | boolean | yes | Guide active flag |
| step | number | yes | Index into tutorialSteps |
| articleId | string | no | Article prompt |
| imageId | string | no | Image prompt |
| projectId | string | no | Created project |

### TutorialWrite

Definition: `packages/app/src/slices/settings/tutorial-schema.ts:42`.

| Field | Type | Required | Notes |
|---|---|---|---|
| baseVersion | number | yes | Nonnegative integer |
| mutationId | string | yes | UUID |
| session | TutorialSession | yes | Server stable-step representation |

### TutorialView

Definition: `packages/app/src/slices/settings/tutorial-schema.ts:43`.

| Field | Type | Required | Notes |
|---|---|---|---|
| version | number | yes | 0 for absent/unreadable record |
| session | TutorialSession | yes | Server stable-step representation |
| readable | boolean | yes | False for malformed/unsupported saved record |

### TutorialSaveResult

Definition: `packages/app/src/slices/settings/tutorial.ts:21`.

| Field | Type | Required | Notes |
|---|---|---|---|
| ok | boolean | yes | Discriminant |
| value | TutorialView | no | Required on success only |
| reason | "conflict" ∣ "unreadable" | no | Required on failure; accepted: conflict, unreadable |

### SaveClock

Definition: `packages/web/src/play/draft-save.ts:6`.

| Field | Type | Required | Notes |
|---|---|---|---|
| edited | number | yes | Local edit generation |
| acknowledged | number | yes | Latest saved generation |
| version | number | yes | Server version; 0 before creation |

### PendingSave

Definition: `packages/web/src/play/draft-save.ts:11`.

| Field | Type | Required | Notes |
|---|---|---|---|
| mutationId | string | yes | UUID |
| document | PlayDraftDocument | yes | Serialized/normalized copy |
| generation | number | yes | Captured edit generation |
| baseVersion | number | yes | Captured CAS version |

### SaveEvent

Definition: `packages/web/src/play/draft-save.ts:17`.

| Field | Type | Required | Notes |
|---|---|---|---|
| type | "edit" ∣ "acknowledge" | yes | accepted: edit, acknowledge |
| generation | number | no | Required in acknowledge branch |
| version | number | no | Required in acknowledge branch |

### DraftSessionState

Definition: `packages/web/src/play/draft-save.ts:45`.

| Field | Type | Required | Notes |
|---|---|---|---|
| document | PlayDraftDocument | yes | Latest local raw values |
| view | DraftView ∣ null | yes | Acknowledged server view |
| clock | SaveClock | yes | Edit/save authority |
| id | string ∣ null | yes | Active create/save ID |
| recoveryId | string ∣ null | yes | Failed-restore identity |
| pending | PendingSave ∣ null | yes | Unacknowledged frozen write |
| status | DraftSaveStatus | yes | accepted: unsaved, saving, saved, error, conflict |
| error | string ∣ null | yes | Save/restore failure |
| reveal | RevealRequest ∣ null | yes | Explicit focus/navigation intent |

### RevealRequest

Definition: `packages/web/src/play/draft-context.tsx:18`.

| Field | Type | Required | Notes |
|---|---|---|---|
| section | PlaySection | yes | accepted: content, outputs, style, review |
| field | string | no | Stable control identity |
| sequence | number | yes | Distinguishes repeated requests |

### ReviewedGeneration

Definition: `packages/web/src/play/review-state.ts:14`.

| Field | Type | Required | Notes |
|---|---|---|---|
| draftId | string | yes | Saved draft identity |
| version | number | yes | Saved version |
| editGeneration | number | yes | Local edit generation |

### ReviewState

Definition: `packages/web/src/play/review-state.ts:29`.

| Field | Type | Required | Notes |
|---|---|---|---|
| receipt | PlayReview ∣ null | yes | Last review result |
| pending | boolean | yes | Review in progress |
| starting | boolean | yes | Start in progress |
| uncertain | boolean | yes | Start result unresolved |
| valid | boolean | yes | Current identity still reviewed |
| error | string ∣ null | yes | Review/Start error |
| fields | DraftRefusal["fields"] | yes | Linked server field errors |
| created | PlayStartResult ∣ null | yes | Confirmed admission |

### UploadOwner

Definition: `packages/web/src/play/draft-uploads.ts:1`.

| Field | Type | Required | Notes |
|---|---|---|---|
| draftId | string | yes | Draft identity |
| attachmentId | string | yes | Attachment identity |

### Upload

Definition: `packages/web/src/play/state.ts:28`.

| Field | Type | Required | Notes |
|---|---|---|---|
| key | string | yes | Attachment UUID |
| name | string | yes | Original name |
| file | StagedFile ∣ undefined | yes | Ready staged metadata |
| error | string ∣ undefined | yes | Recovery error |

### ProvidedState

Definition: `packages/web/src/play/state.ts:35`.

| Field | Type | Required | Notes |
|---|---|---|---|
| research | string | yes | Provided research |
| article | string | yes | Provided article |
| audio | Upload ∣ undefined | yes | Supplied audio |
| images | Upload[] | yes | Ordered supplied images |
| thumbnail | Upload ∣ undefined | yes | Supplied thumbnail |

### LegacyPlayFormState

Definition: `packages/web/src/play/state.ts:43`.

| Field | Type | Required | Notes |
|---|---|---|---|
| title | string | yes | Title |
| format | Format | yes | accepted: 16:9, 9:16 |
| sources | Readonly<Record<StageKind, StageSource>> | yes | Source choices |
| llm | ProviderChoice | yes | Text model |
| audio | VoiceChoice | yes | Narration model/voice |
| images | ProviderChoice | yes | Image model |
| articlePrompt | string | yes | Name |
| imagePrompts | ImagePromptChoice[] | yes | Numeric counts |
| thumbnailPrompt | string | yes | Name |
| intro | string | yes | Name or empty |
| outro | string | yes | Name or empty |
| chunking | Chunking | yes | Numeric chunk amounts |
| subtitles | SubtitleConfig | yes | Numeric font size |
| values | Readonly<Record<string, string>> | yes | All editor keywords |
| provided | ProvidedState | yes | Compatibility uploads |

### DraftInput

Definition: `packages/web/src/play/state.ts:127`.

| Field | Type | Required | Notes |
|---|---|---|---|
| form | PlayFormState | yes | state.ts numeric compatibility alias |
| entries | Entry[] | yes | Current library |
| slots | string[] | yes | Active keyword names |
| silenceGapSeconds | number | yes | Current setting |

### PlayFormState

Definition: `packages/web/src/play/state.ts:66; packages/web/src/play/draft-state.ts:10`.

| Field | Type | Required | Notes |
|---|---|---|---|
| title | string | yes | Title |
| format | Format | yes | accepted: 16:9, 9:16 |
| sources | Readonly<Record<StageKind, StageSource>> | yes | Source choices |
| llm | ProviderChoice | yes | Text model |
| audio | VoiceChoice | yes | Narration model/voice |
| images | ProviderChoice | yes | Image model |
| articlePrompt | string | yes | Name |
| imagePrompts | ImagePromptChoice[] | yes | Numeric counts |
| thumbnailPrompt | string | yes | Name |
| intro | string | yes | Name or empty |
| outro | string | yes | Name or empty |
| chunking | Chunking | yes | Numeric chunk amounts |
| subtitles | SubtitleConfig | yes | Numeric font size |
| values | Readonly<Record<string, string>> | yes | All editor keywords |
| provided | ProvidedState | yes | Compatibility uploads |

The first table is `state.ts`’s alias of LegacyPlayFormState. `draft-state.ts` independently aliases PlayDraftForm; the second table gives its raw representation, including string-valued image counts/chunk amounts/font size and nullable attachment references. These are distinct module-scoped aliases, not a merged type; `packages/web/src/lib/form-drafts.tsx:50` bridges them.

**Raw representation** (`packages/web/src/play/draft-state.ts:10`, alias of PlayDraftForm):

| Field | Type | Required | Notes |
|---|---|---|---|
| title | string | yes | Untrimmed editor text |
| format | "16:9" ∣ "9:16" | yes | accepted: 16:9, 9:16 |
| sources | { research: StageSource; article: StageSource; audio: StageSource; images: StageSource; thumbnail: StageSource; video: StageSource } | yes | Each value accepted: generate, provide, off, from_prompt, prompt_by_llm; stage-specific runnable combinations are checked later |
| llm | { provider: string; model: string; thinking?: ThinkingMode } | yes | thinking optional; accepted: off, low, medium, high, xhigh |
| audio | { provider: string; model: string; thinking?: ThinkingMode; voice: string } | yes | thinking optional; accepted: off, low, medium, high, xhigh |
| images | { provider: string; model: string; thinking?: ThinkingMode } | yes | thinking optional; accepted: off, low, medium, high, xhigh |
| articlePrompt | string | yes | Saved prompt name, including empty/unavailable choice |
| imagePrompts | { name: string; number: string }[] | yes | Order retained; number stays raw text |
| thumbnailPrompt | string | yes | Saved prompt name |
| intro | string | yes | Entry name; empty string represents Off |
| outro | string | yes | Entry name; empty string represents Off |
| chunking | { mode: ChunkMode; words: string; characters: string } | yes | mode accepted: whole, paragraph, words, characters; both numeric strings retained |
| subtitles | { mode: "off" ∣ "files" ∣ "burn-in"; language: "en"; fontId: string; fontSize: string; position: "top" ∣ "upper-middle" ∣ "center" ∣ "lower-middle" ∣ "bottom" } | yes | mode accepted: off, files, burn-in; position accepted: top, upper-middle, center, lower-middle, bottom |
| values | Readonly<Record<string, string>> | yes | Includes inactive keyword values |
| provided | { research: string; article: string; audio: { attachmentId: string; name: string } ∣ null; thumbnail: { attachmentId: string; name: string } ∣ null; images: { attachmentId: string; name: string }[] } | yes | File references carry UUID attachment identity and original name; no browser File bytes |

### ControlledFontUpload

Definition: `packages/web/src/subtitles/font-picker.tsx:8`.

| Field | Type | Required | Notes |
|---|---|---|---|
| pending | boolean | yes | Upload in progress |
| error | string ∣ undefined | yes | Current operation failure |
| pick | (file: File) => void | yes | Explicit upload selection |

### TutorialEvent

Definition: `packages/web/src/tutorial/model.ts:1`.

| Field | Type | Required | Notes |
|---|---|---|---|
| type | "prompt-saved" ∣ "project-created" | yes | accepted: prompt-saved, project-created |
| id | string | yes | Resource identity |
| kind | "article" ∣ "image" ∣ "thumbnail" | no | Required for prompt-saved; accepted: article, image, thumbnail |

### TutorialStep

Definition: `packages/web/src/tutorial/model.ts:90`.

| Field | Type | Required | Notes |
|---|---|---|---|
| id | TutorialStepId | yes | Stable step IDs listed in server TutorialSession |
| title | string | yes | Visible title literal |
| target | string | yes | data-tour target literal |
| page | "settings" ∣ "article" ∣ "image" ∣ "play" ∣ "project" | yes | accepted: settings, article, image, play, project |

### CheckpointRow

| Field | Type | Required | Notes |
|---|---|---|---|
| projectId | `string` | yes | Project identity |
| revisionId | `string` | yes | Origin revision identity |
| checkpointId | `string` | yes | Stable gate identity |
| stage | `"audio" \| "images" \| "video"` | yes | accepted: audio, images, video |
| workId | `string` | yes | Work held by the gate |
| fingerprint | `string` | yes | 64-character lowercase hexadecimal dependency fingerprint |
| state | `CheckpointState` | yes | accepted: configured, pending-review, held, released, satisfied, invalidated, canceled |
| createdAt | `string` | yes | ISO timestamp |
| approvedAt | `string \| null` | yes | ISO timestamp after approval |

Source: `packages/app/src/slices/checkpoints/model.ts:12`.

### CheckpointApprovalInput

| Field | Type | Required | Notes |
|---|---|---|---|
| projectId | `string` | yes | Project identity |
| revisionId | `string` | yes | Reviewed revision identity |
| checkpointId | `string` | yes | Gate identity |
| fingerprint | `string` | yes | Exact reviewed dependency fingerprint |
| idempotencyKey | `string` | yes | UUID request identity |
| approvedAt | `string` | yes | ISO approval timestamp |

Source: `packages/app/src/slices/checkpoints/model.ts:35`.

### CheckpointStatus

| Field | Type | Required | Notes |
|---|---|---|---|
| revisionId | `string` | yes | Current project revision |
| checkpoints | `readonly (CheckpointRow & { currentFingerprint: string; dependents: readonly StageKind[]; workKeys: readonly string[] })[]` | yes | Stored gates with recalculated dependency closure |

Source: `packages/app/src/slices/checkpoints/change.ts:31`.

### ProjectTemplate

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes | UUID template identity |
| name | `string` | yes | Trimmed name, 1–200 characters on writes |
| version | `number` | yes | Positive immutable revision number |
| createdAt | `string` | yes | Head creation timestamp |
| updatedAt | `string` | yes | Selected revision timestamp |
| document | `PlayDraftDocument` | yes | Credential-free reusable Play setup |

Source: `packages/app/src/slices/project-templates/schema.ts:28`.

### TemplateSummary

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes | UUID template identity |
| name | `string` | yes | Current name |
| version | `number` | yes | Current head version |
| createdAt | `string` | yes | Template creation timestamp |
| updatedAt | `string` | yes | Head revision timestamp |

Source: `packages/app/src/slices/project-templates/model.ts:7`.

### Cadence

| Field | Type | Required | Notes |
|---|---|---|---|
| kind | `"once" \| "daily" \| "weekly"` | yes | Discriminator |
| at | `string` | no | Offset ISO timestamp for `once` |
| time | `string` | no | `HH:mm` local time for `daily` and `weekly` |
| days | `readonly number[]` | no | One to seven weekday numbers 0–6 for `weekly` |

Source: `packages/app/src/slices/schedules/calendar.ts:3`.

### ScheduleCreate

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes | UUID schedule identity |
| name | `string` | yes | Trimmed name, 1–200 characters |
| templateId | `string` | yes | UUID template identity |
| templateVersion | `number` | yes | Positive pinned template revision |
| cadence | `Cadence` | yes | Recurrence definition |
| timezone | `string` | yes | Valid IANA timezone |
| missedPolicy | `"skip" \| "run-once"` | yes | Defaults to `skip` |
| overlapPolicy | `"skip"` | yes | Overlap behavior |
| spendLimitCents | `number \| null` | yes | Nonnegative ceiling; null means no ceiling |
| items | `readonly { title: string; values: Readonly<Record<string,string>> }[]` | yes | At most 49 variant rows |

Source: `packages/app/src/slices/schedules/schema.ts:13`.

### ScheduleUpdate

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes | UUID schedule identity |
| name | `string` | yes | Trimmed name, 1–200 characters |
| templateId | `string` | yes | UUID template identity |
| templateVersion | `number` | yes | Positive pinned template revision |
| cadence | `Cadence` | yes | Recurrence definition |
| timezone | `string` | yes | Valid IANA timezone |
| missedPolicy | `"skip" \| "run-once"` | yes | Missed occurrence behavior |
| overlapPolicy | `"skip"` | yes | Overlap behavior |
| spendLimitCents | `number \| null` | yes | Nonnegative ceiling; null means no ceiling |
| items | `readonly { title: string; values: Readonly<Record<string,string>> }[]` | yes | At most 49 variant rows |
| baseVersion | `number` | yes | Positive compare-and-swap version |
| mutationId | `string` | yes | UUID mutation identity |

Source: `packages/app/src/slices/schedules/schema.ts:28`.

### ScheduleSummary

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes | UUID schedule identity |
| name | `string` | yes | Schedule name |
| templateId | `string` | yes | Referenced template identity |
| templateVersion | `number` | yes | Pinned template revision |
| cadence | `Cadence` | yes | Recurrence definition |
| timezone | `string` | yes | IANA timezone |
| missedPolicy | `"skip" \| "run-once"` | yes | Missed occurrence behavior |
| overlapPolicy | `"skip"` | yes | Overlap behavior |
| spendLimitCents | `number \| null` | yes | Optional per-occurrence estimate ceiling |
| items | `readonly { title: string; values: Readonly<Record<string,string>> }[]` | yes | Variant keyword rows |
| status | `"active" \| "paused" \| "completed" \| "canceled"` | yes | Durable schedule lifecycle |
| version | `number` | yes | Positive row version |
| nextRunAt | `string \| null` | yes | Offset ISO occurrence time |
| createdAt | `string` | yes | Creation timestamp |
| updatedAt | `string` | yes | Last mutation timestamp |

Source: `packages/app/src/slices/schedules/schema.ts:41`.

### ScheduleRun

| Field | Type | Required | Notes |
|---|---|---|---|
| id | `string` | yes | UUID occurrence identity |
| scheduleId | `string` | yes | Owning schedule |
| scheduledFor | `string` | yes | Offset ISO occurrence time |
| status | `"running" \| "succeeded" \| "failed" \| "skipped"` | yes | Dispatch result |
| requestId | `string \| null` | yes | Play Start request identity after success |
| projectIds | `readonly string[]` | yes | Created project identities |
| estimate | `unknown \| null` | yes | Stored cost estimate payload |
| startedAt | `string` | yes | ISO claim timestamp |
| endedAt | `string \| null` | yes | ISO terminal timestamp |
| error | `string \| null` | yes | Safe failure or skip reason |

Source: `packages/app/src/slices/schedules/schema.ts:61`.

### PortableImportResult

| Field | Type | Required |
|---|---|---|
| settings | `number` | yes |
| prompts | `number` | yes |
| entries | `number` | yes |
| voices | `number` | yes |
| templates | `number` | yes |
| stagedFiles | `number` | yes |

Source: `packages/app/src/slices/storage/portable.ts:65`.

### StorageUsage

| Field | Type | Required | Notes |
|---|---|---|---|
| data | `number` | yes | Bytes under the data directory, including project/staging bytes |
| projects | `number` | yes | Bytes under project directories |
| staging | `number` | yes | Bytes under staging |
| byProject | `readonly { id: string; title: string; bytes: number }[]` | yes | Per-project directory totals |

Source: `packages/app/src/slices/storage/portable.ts:74`.

## Relationships

`review_checkpoints` belongs to one project/revision and anchors one admitted work identity. Its closure contains reserved work keys for the selected stage and transitive dependents. `review_checkpoint_approvals` is keyed by project and idempotency key and records the exact revision, checkpoint and fingerprint that was released (`packages/app/src/kernel/db/migrations/0007-review-checkpoints.sql:1`).

- Project owns stages, outputs, project control state, revisions and assets through cascading project foreign keys. Attempt.stageId refers to Stage, while legacy attempts.piece_id is a plain nullable TEXT column, not a declared foreign key. Migration 0005 separately adds nullable foreign keys revision_id, work_id and work_piece_id with ON DELETE SET NULL (`packages/app/src/kernel/db/migrations/0001-init.sql:2`, `packages/app/src/kernel/db/migrations/0002-project-controls.sql:1`, `packages/app/src/kernel/db/migrations/0004-project-revisions.sql:1`, `packages/app/src/kernel/db/migrations/0005-revision-work.sql:83`).
- ProjectRevision.parentId/restoredFromId are project-scoped ancestry references. project_heads selects one revision per project. ProjectAsset can be shared by many revision manifest rows; its project/path pair is unique. revision_outputs and revision_pieces enforce at most one selected record per revision slot/key while retaining deselected publications (`packages/app/src/kernel/db/migrations/0004-project-revisions.sql:1`).
- RevisionContent embeds RunConfig-independent content overrides, image keys/order, optional ManualCue arrays and raw prompt templates; ProjectRevision embeds RunConfig, RevisionContent and fingerprint records. ManifestOutput embeds an Output descriptor and references a ProjectAsset. ManifestPiece embeds a StagePiece descriptor and optionally references a ProjectAsset (`packages/app/src/slices/revisions/model.ts:26`).
- WorkRef identifies an origin revision invocation; revision_work also references its project/stage/kind identity. WorkPiece belongs to revision_work. revision_work_reservations grants one desired key per revision to an invocation and optional physical piece; paired logical_key/desired_fingerprint anchor it to the desired revision snapshot. Submission checks require that the current head still owns that reservation (`packages/app/src/kernel/db/migrations/0005-revision-work.sql:1`, `packages/app/src/kernel/runner/work-authority.ts:31`).
- RebuildPreview belongs to a project/revision and persists its private ExecutionSnapshot separately. RebuildAdmission belongs to that same scoped preview/revision; its response references admitted work IDs. revision_work.admission_id is nullable TEXT without a declared foreign key. revision_provided_reviews ties a work key/dependency fingerprint to an admission; no separate exported row interface represents this review grant (`packages/app/src/kernel/db/migrations/0005-revision-work.sql:2`, `packages/app/src/kernel/db/migrations/0005-revision-work.sql:54`, `packages/app/src/slices/rebuild/admission-repo.ts:160`).
- Save/Restore receipts identify both base and resulting revisions; pause/cancel receipts identify the reviewed base. Each table enforces project/idempotency-key uniqueness, and service checks additionally share that namespace across mutations, admissions and controls (`packages/app/src/kernel/db/migrations/0004-project-revisions.sql:78`, `packages/app/src/kernel/db/migrations/0005-revision-work.sql:66`, `packages/app/src/slices/revisions/mutation-request.ts:36`, `packages/app/src/slices/control/revision-control.ts:25`).
- Prompt and Entry library rows are selected by kind/category and case-insensitive name; projects retain rendered text and revisions also retain raw templates. No SQL foreign key connects project config JSON to live library rows (`packages/app/src/slices/library/repo.ts:29`, `packages/app/src/slices/library/repo.ts:66`, `packages/app/src/edge/http/projects.ts:102`, `packages/app/src/slices/revisions/model.ts:50`).
- QueueEntry connects an ordered Project to a batch; only project_id has ON DELETE CASCADE. Batch rows have no separate domain interface (`packages/app/src/kernel/db/migrations/0003-batch-queue.sql:1`). Collector events are deduplicated by event ID; aggregate rows store one named counter each rather than a serialized Aggregates object (`packages/collector/schema.sql:3`, `packages/collector/src/index.ts:65`).

- PlayDraft embeds PlayDraftDocument; its form retains attachment UUID/name references. AttachmentRow.draft_id references play_drafts with ON DELETE CASCADE, and staged_file_id references staged_files with ON DELETE SET NULL. Multiple draft attachments can share the same staged file; Fork allocates new attachment UUIDs while sharing only ready validated staging (`packages/app/src/slices/play-drafts/schema.ts:15`, `packages/app/src/slices/play-drafts/repo.ts:66`, `packages/app/src/slices/play-drafts/service.ts:212`, `packages/app/src/kernel/db/migrations/0006-play-drafts.sql:18`).
- PlayReview contains one ResolvedPlayRun and CostEstimate per base/variant run. Its UUID is PlayStartInput.reviewId and PlayStartResult.requestId; Start stores a receipt keyed by that UUID and unique on draft_id/draft_version. Receipt draft_id deliberately has no foreign key, so an explicit draft deletion does not delete the accepted replay receipt (`packages/app/src/slices/play-drafts/model.ts:43`, `packages/app/src/slices/play-drafts/start-repo.ts:66`, `packages/app/src/kernel/db/migrations/0006-play-drafts.sql:29`).
- DraftAttachment.copying is a view state inferred from staged_files.state, not an allowed AttachmentRow.status. Read projects missing/size-mismatched staged bytes as reattach; restart reconciliation retains complete referenced staging and unbinds interrupted/missing bytes (`packages/app/src/slices/play-drafts/service.ts:79`, `packages/app/src/slices/storage/reconcile.ts:69`).
- TutorialSession uses optional plain-string prompt/project references inside settings JSON without SQL foreign keys. Restore validates article/image IDs against the current prompt list and reads a referenced project (`packages/app/src/slices/settings/tutorial-schema.ts:29`, `packages/web/src/tutorial/use-session.ts:106`).
- `project_templates` selects an immutable head in `project_template_revisions`; deleting a template cascades its revisions. `project_template_instantiations` is owned by a Play draft and records template provenance, while its template identity/version are plain columns so historical provenance survives template revision rules (`packages/app/src/kernel/db/migrations/0008-project-templates.sql:1`).
- `schedules.template_id` references the template head record, while `template_version` pins an immutable revision by value. `schedule_runs` retains schedule identity after soft deletion, is unique by schedule/occurrence and non-null Start request identity, and records when every admitted project became terminal. Schedule rows use tombstones and no longer hold template foreign keys, so run history survives template/schedule deletion (`packages/app/src/kernel/db/migrations/0010-retain-schedule-history.sql:1`).
- Portable backups serialize current settings, libraries, voices, template heads and staged files into a version-1 manifest and ZIP entries. Import upserts settings/library/voice identities, inserts only missing templates, and allocates new staged-file identities; it does not add a database relation or restore projects and schedules (`packages/app/src/slices/storage/portable.ts:85`, `packages/app/src/slices/storage/portable.ts:135`).

## Boundaries

| Boundary | Conversion and representation | Implementation |
|---|---|---|
| Project/stage SQLite ↔ domain | RunConfig is JSON; snake_case rows become camelCase Project/Stage; pause is read as a boolean from project_controls | `packages/app/src/slices/admission/repo.ts:43`, `packages/app/src/slices/admission/repo.ts:160`, `packages/app/src/slices/admission/repo.ts:199` |
| Outputs/staging SQLite ↔ domain | OutputMeta is JSON; column names map to Output/StagedFile properties | `packages/app/src/slices/storage/repo.ts:30`, `packages/app/src/slices/storage/repo.ts:104` |
| Prompt/Entry SQLite ↔ domain | slots JSON parses through a string-array schema; case-insensitive names are lookup keys | `packages/app/src/slices/library/repo.ts:34`, `packages/app/src/slices/library/repo.ts:166` |
| Keys/voices/settings SQLite ↔ domain | Key value is only read through keyOf; readiness reads presence; voice_id becomes voiceId; settings store JSON scalar values | `packages/app/src/slices/settings/repo.ts:18`, `packages/app/src/slices/settings/repo.ts:40`, `packages/app/src/slices/settings/repo.ts:81`, `packages/app/src/slices/settings/playback.ts:29`, `packages/app/src/slices/settings/cli-paths.ts:35` |
| Attempts/pieces SQLite ↔ domain | Attempt provenance columns map to nullable IDs; StagePiece.payload stays a string rather than generic JSON domain data | `packages/app/src/kernel/runner/attempt-repo.ts:106`, `packages/app/src/kernel/runner/piece-repo.ts:90` |
| Revision SQLite ↔ domain | config/content/fingerprints JSON parse through projectRevisionSchema; saved history title comes from saved config | `packages/app/src/slices/revisions/repo.ts:33`, `packages/app/src/slices/revisions/repo.ts:66`, `packages/app/src/slices/revisions/repo.ts:111` |
| Manifest SQLite ↔ domain | descriptor JSON parses as Output/StagePiece; selected 0/1 becomes boolean; view construction adds file availability from project-scoped registered paths | `packages/app/src/slices/revisions/manifest-repo.ts:16`, `packages/app/src/slices/revisions/manifest-repo.ts:33`, `packages/app/src/slices/revisions/manifest-repo.ts:184`, `packages/app/src/slices/revisions/view.ts:7` |
| Revision ↔ current projection | Selected retained output/piece descriptors populate compatibility outputs/stage_pieces; saved config updates current Project; stage standings are projected separately | `packages/app/src/slices/revisions/projection.ts:77`, `packages/app/src/slices/revisions/mutations.ts:206`, `packages/app/src/slices/rebuild/runtime-store.ts:155` |
| Invocation/piece SQLite ↔ execution | recipe_context serializes the selected Catalogue; input_json parses through recipeInputSchema; work rows become RunnerStage/WorkRef | `packages/app/src/slices/rebuild/runtime-admission.ts:54`, `packages/app/src/slices/rebuild/work-records.ts:33`, `packages/app/src/slices/rebuild/runtime-store.ts:22` |
| Preview/admission SQLite ↔ domain | body_json stores parsed RebuildPreview; execution_json stores private ExecutionSnapshot; response_json is parsed as RebuildAdmission on replay | `packages/app/src/slices/rebuild/repo.ts:61`, `packages/app/src/slices/rebuild/admission-repo.ts:20`, `packages/app/src/slices/rebuild/admission-repo.ts:78` |
| Save/Restore/control receipts | Canonical request hash and resulting revision ID form mutation replay; controls first store pending JSON then replace it with completed response JSON | `packages/app/src/slices/revisions/mutation-request.ts:14`, `packages/app/src/slices/revisions/mutation-request.ts:85`, `packages/app/src/slices/control/revision-control.ts:25`, `packages/app/src/slices/control/revision-control.ts:89` |
| Admission HTTP → frozen setup | runDraftSchema parses input, pickTemplates resolves library rows, admit normalizes/validates, renderPicked substitutes values, startRun snapshots config and templates | `packages/app/src/edge/http/projects.ts:73`, `packages/app/src/slices/admission/start.ts:28` |
| Revision HTTP ↔ client | Prepare/save/restore use typed success envelopes; history is {revisions}, detail is {view}; preview/start return {ok:true,value}; client revalidates successful JSON and converts expected Problem Details into RevisionRefusal | `packages/app/src/edge/http/revisions.ts:65`, `packages/web/src/project/revision-api.ts:48` |
| Current project HTTP ↔ client | ProjectBody includes revisionId plus ProjectSummary/Stage[]/Output[]; route types use Hono and explicit domain response interfaces | `packages/app/src/edge/http/projects.ts:160`, `packages/web/src/api.ts:62`, `packages/web/src/api.ts:77` |
| Historical binary download/folder | Route uses project/revision/record IDs; resolver reads retained manifest plus registered ProjectAsset, names download from the saved title; no body-supplied filesystem path | `packages/app/src/edge/http/revision-files.ts:20`, `packages/app/src/slices/revisions/downloads.ts:15` |
| Catalogue YAML ↔ domain | YAML parser limits aliases and rejects duplicate keys; catalogueSchema validates families/pricing/concurrency; registry exposes ModelInfo | `packages/app/src/catalog/store.ts:21`, `packages/app/src/catalog/registry.ts:1` |
| Telemetry SQLite ↔ outbound JSON ↔ collector | App parses strict stored payload before sending; collector validates bounded flat event payloads, writes received_at, and returns named aggregate totals | `packages/app/src/slices/telemetry/repo.ts:20`, `packages/app/src/slices/telemetry/repo.ts:86`, `packages/app/src/slices/telemetry/collector-client.ts:6`, `packages/collector/src/index.ts:41`, `packages/collector/src/index.ts:104` |
| SQL row → draft domain | DraftRow and AttachmentRow parse snake_case SQL. document_json parses only schema version 1; readDraft produces camelCase PlayDraft, attachment filesystem availability, PlayReview and pending/accepted Start projections. List derives tolerant metadata without dropping unreadable documents. | `packages/app/src/slices/play-drafts/repo.ts:39`, `packages/app/src/slices/play-drafts/service.ts:74`, `packages/app/src/slices/play-drafts/service.ts:104`, `packages/app/src/slices/play-drafts/service.ts:146` |
| Raw editor → admission | toAdmissionDraft parses active number strings, resolves entry names and owned ready attachment IDs, and normalizes Provided Article → Research Off, Images Off → Video Off, Audio Off → subtitles Off, and burn-in without video → files. It returns RunDraft or FieldError[]; saving an incomplete raw document is separate from runnable validation. | `packages/app/src/slices/play-drafts/convert.ts:11` |
| Browser controls ↔ raw document | usePlayDraft derives numeric LegacyPlayFormState and Upload/StagedFile views, then converts edits back to string numbers and attachment UUID/name references. Existing raw strings remain when the numeric value is unchanged. serializeDraftDocument validates and normalizes source/subtitle applicability; freezeSave captures that JSON-decoded document and edit/version identity. | `packages/web/src/lib/form-drafts.tsx:50`, `packages/web/src/lib/form-drafts.tsx:123`, `packages/web/src/play/draft-state.ts:44`, `packages/web/src/play/draft-state.ts:84`, `packages/web/src/play/draft-save.ts:32` |
| Draft HTTP ↔ typed client | Create/Fork return DraftView with 201 for new identity and 200 for replay; Save/Read return DraftView, Review returns PlayReview, Start returns PlayStartResult, Discard returns {discarded:true}, List returns {drafts:DraftSummary[]}. Path UUID is combined with strict body input. Expected 400/404/409 problems become DraftRefusal; successful bodies are revalidated. | `packages/app/src/edge/http/drafts.ts:29`, `packages/app/src/edge/http/drafts.ts:55`, `packages/app/src/edge/http/draft-problem.ts:5`, `packages/web/src/play/draft-api.ts:65` |
| Review → private stored snapshot | review_json contains {review,execution:{catalogue,attachmentIdentity,font}}, while public PlayReview excludes private catalogue/file/font execution data. executionSchema validates the private representation; requireStartingIdentity re-resolves and hashes current inputs against it. | `packages/app/src/slices/play-drafts/review.ts:87`, `packages/app/src/slices/play-drafts/start-repo.ts:30`, `packages/app/src/slices/play-drafts/start-repo.ts:80` |
| Start receipt SQL ↔ domain | request_hash binds the exact input; result_json parses as PlayStartResult. created_at is retained in SQL but omitted from StoredStartReceipt. Replay checks UUID/draft/version/hash/result identity before returning replayed:true. | `packages/app/src/slices/play-drafts/start-repo.ts:16`, `packages/app/src/slices/play-drafts/start-repo.ts:51`, `packages/app/src/slices/play-drafts/start-repo.ts:66`, `packages/app/src/slices/play-drafts/start-repo.ts:119` |
| Tutorial settings JSON ↔ DTO | settings key tutorial.session stores strict {version,session,mutationId,requestHash}; no named code model represents the complete envelope. readTutorial returns version/session/readable, uses version 0/inactive text-key fallback for absent/unreadable data, and does not overwrite unreadable JSON. CAS writes replace the envelope; DELETE removes only that settings key. | `packages/app/src/slices/settings/tutorial.ts:25`, `packages/app/src/slices/settings/tutorial.ts:48`, `packages/app/src/slices/settings/tutorial.ts:57`, `packages/app/src/slices/settings/tutorial.ts:80` |
| Tutorial HTTP ↔ browser cursor | GET/PUT use TutorialView; PUT uses TutorialWrite and errors with 409 conflict/unreadable; DELETE returns 204. Browser serializes numeric step through tutorialSteps[next.step].id and converts restored stepId through tutorialStepIndex. | `packages/app/src/edge/http/tutorial.ts:13`, `packages/web/src/tutorial/session-api.ts:10`, `packages/web/src/tutorial/use-session.ts:41`, `packages/web/src/tutorial/use-session.ts:98` |
| Template SQLite ↔ domain | The join selects a template head or exact version; document_json is decoded and parsed as `ProjectTemplate`, while current listings parse a document-free `TemplateSummary`. Writes encode the Play document into an immutable revision row. | `packages/app/src/slices/project-templates/repo.ts:6`, `packages/app/src/slices/project-templates/repo.ts:17`, `packages/app/src/slices/project-templates/repo.ts:31`, `packages/app/src/slices/project-templates/repo.ts:46` |
| Schedule SQLite ↔ domain | cadence/items/estimate/project IDs are JSON columns. Repository readers convert snake_case rows, decode JSON and parse `ScheduleSummary`/`ScheduleRun`; writes encode those nested values and use row versions or occurrence uniqueness for concurrency. | `packages/app/src/slices/schedules/repo.ts:10`, `packages/app/src/slices/schedules/repo.ts:62`, `packages/app/src/slices/schedules/repo.ts:149`, `packages/app/src/slices/schedules/repo.ts:214` |
| Portable ZIP ↔ local resources | `manifest.json` is parsed through a strict version-1 Zod schema. Export writes stored rows plus referenced staged bytes; import validates the manifest before applying resource rows and writes staged bytes under newly allocated IDs. | `packages/app/src/slices/storage/portable.ts:45`, `packages/app/src/slices/storage/portable.ts:85`, `packages/app/src/slices/storage/portable.ts:135` |

For revision-aware exports, render record paths reference immutable registered assets. WAV records retain sample rate/channels/codec/gap/duration/audio timeline; new export records retain source IDs and SHA-256 hashes; legacy records may omit hashes. Subtitle timing writes `{key,words,omissions}`; cues are a separate `{cues,omissions}` artifact/piece; prepared subtitle files retain font identity in piece payload. Changing subtitle files can republish the retained WAV asset with updated metadata without encoding another WAV (`packages/app/src/slices/rebuild/runtime-export.ts:101`, `packages/app/src/slices/rebuild/runtime-subtitles.ts:25`, `packages/app/src/slices/rebuild/runtime-subtitles.ts:121`, `packages/app/src/slices/rebuild/runtime-subtitles.ts:261`).

Legacy subtitle preparation still uses a `{key,words,font,omissions}` timing cache and the versioned `wav2vec2-en-a19f851-v2-omissions` key; legacy `writeSubtitles` updates a mutable Output row and replaces sidecars. Those functions describe the legacy video slice, while the revision runtime above supplies retained publication behavior (`packages/app/src/slices/subtitles/prepare.ts:56`, `packages/app/src/slices/subtitles/prepare.ts:149`, `packages/app/src/slices/video/write-subtitles.ts:12`).

## Validation

- runDraftSchema/runConfigSchema check shape; admission applies source combinations, required provider choices, prompt counts, files and keyword values. catalogue model checks run separately at HTTP admission. Schema validity alone does not make a project runnable (`packages/app/src/slices/admission/schema.ts:16`, `packages/app/src/slices/admission/rules.ts:46`, `packages/app/src/edge/http/projects.ts:102`).
- Revision input IDs are 1–64 alphanumeric/underscore/hyphen characters; work keys are 1–256. Article/template text caps are 500,000; imageOrder caps at 60; upload arrays cap at 10,000. Cue text trims to 1–10,000, starts must be finite/nonnegative, and ends finite/positive/after start. Revision edit/content/upload objects reject extra properties (`packages/app/src/slices/revisions/schema.ts:7`).
- Save/Restore HTTP idempotency keys are UUIDs, stricter than the reusable revision schema's bounded ID. Asset references/staged destinations are checked in the owning project; actual audio measurements and current fingerprint determine whether manual cues remain valid. Cue arrays must be ordered, non-overlapping and within measured narration duration (`packages/app/src/edge/http/revisions.ts:22`, `packages/app/src/slices/revisions/mutation-assets.ts:47`, `packages/app/src/slices/revisions/mutation-assets.ts:85`, `packages/app/src/slices/revisions/mutation-cues.ts:58`, `packages/app/src/slices/revisions/rules.ts:7`).
- Persisted RecipeInput accepts only the version-1 discriminated branches and their finite local/deferred operation lists. Unknown operation strings fail schema parsing; RebuildPreview.review is an optional structured human-readable input/request summary (`packages/app/src/slices/rebuild/recipe-input-schema.ts:17`, `packages/app/src/slices/rebuild/recipe-input-schema.ts:70`, `packages/app/src/slices/rebuild/model.ts:173`).
- Project rebuild Preview/Start have strict body schemas; Start requires an explicit unknown-cost acknowledgement flag and list of confirmed provided-work keys. Service validation verifies reviewed inputs, required confirmations and fresh provider readiness; preview alone does not grant execution (`packages/app/src/slices/rebuild/model.ts:96`, `packages/app/src/slices/rebuild/service.ts:30`, `packages/app/src/slices/rebuild/admission-repo.ts:51`).
- Publication validates invocation/piece authority, output bundles, registered asset identities, fingerprint match and idempotent publication before selecting a retained output. Submission authority additionally checks allowed dispatch and current-head ownership (`packages/app/src/slices/revisions/publication-rules.ts:13`, `packages/app/src/slices/revisions/publication-rules.ts:42`, `packages/app/src/kernel/runner/work-authority.ts:31`).
- Catalogue schemas reject unknown provider/family combinations, duplicate provider/model IDs and missing provider concurrency settings. They validate nonnegative finite prices, family-specific fields, flags and model limits (`packages/app/src/catalog/schema.ts:4`).
- SQLite migration checks are exactly those shown below. JSON validity checks ensure valid JSON text, not the full TypeScript/Zod shape. Some legacy columns (stage source, piece kind/state, attempt outcome, output role) have no SQL enum check, so repositories/domain boundaries supply their validation (`packages/app/src/kernel/db/migrations/0001-init.sql:2`, `packages/app/src/kernel/db/migrations/0004-project-revisions.sql:1`, `packages/app/src/kernel/db/migrations/0005-revision-work.sql:1`, `packages/app/src/kernel/db/migrations/0006-play-drafts.sql:1`).
- Font IDs/configuration are validated before generation and fonts resolve on disk; output metadata validates nonnegative finite subtitle omission times. Alignment worker messages add a stricter 1–10,000 character bound to omission text. AudioExportRecord parsing allows legacy absent source IDs/hashes; hashed records compare source bytes, while legacy records fall back to source timestamps (`packages/app/src/slices/subtitles/model.ts:11`, `packages/app/src/edge/http/projects.ts:74`, `packages/app/src/slices/storage/schema.ts:4`, `packages/app/src/adapters/alignment/protocol.ts:9`, `packages/app/src/slices/video/reuse-audio.ts:7`).
- Incomplete Play drafts persist in play_drafts with owned attachments in play_draft_attachments and accepted Start results in play_start_receipts. Browser storage retains only the active draft UUID; prompt-editor drafts remain an in-memory map. Tutorial progress persists under settings key tutorial.session. Migrations 0007–0010 add checkpoints, reusable project templates, scheduled jobs and retained schedule history (`packages/app/src/kernel/db/migrations/0006-play-drafts.sql:1`, `packages/app/src/kernel/db/migrations/0007-review-checkpoints.sql:1`, `packages/app/src/kernel/db/migrations/0008-project-templates.sql:1`, `packages/app/src/kernel/db/migrations/0009-scheduled-jobs.sql:1`).

- Draft document/form schemas are strict and versioned; identity values use UUID validation. Raw fields remain strings, including image counts, chunk amounts, font size and expected words; unknown enum values and extra object fields fail schema parsing. Save/Discard baseVersion must be positive; Save mutationId must be UUID. Create/Fork/Discard/Review inputs use anonymous inferred structural schemas, not additional named DTO aliases (`packages/app/src/slices/play-drafts/schema.ts:9`, `packages/app/src/slices/play-drafts/schema.ts:80`, `packages/app/src/slices/play-drafts/schema.ts:81`, `packages/app/src/edge/http/drafts.ts:29`).
- Service validation rejects duplicate attachment IDs and references belonging to another draft/kind/name; malformed/unsupported persisted documents return invalid-draft and remain listed. Creation/Fork replay is accepted only for matching creation hash on an active version-1 target; changed targets refuse conflict. Save records its latest mutation/hash and uses CAS (`packages/app/src/slices/play-drafts/service.ts:55`, `packages/app/src/slices/play-drafts/service.ts:74`, `packages/app/src/slices/play-drafts/service.ts:155`, `packages/app/src/slices/play-drafts/service.ts:175`, `packages/app/src/slices/play-drafts/service.ts:212`).
- Review additionally validates active numeric requirements, prompt/model availability, keyword variants, expectedWords 1–100000 and at most 50 total runs. Any retained fontUpload blocks review independently of current subtitle/audio applicability. Explicit inactive recovery clears that marker through selecting the existing font; normal source changes do not clear it (`packages/app/src/slices/play-drafts/review-inputs.ts:53`, `packages/app/src/slices/play-drafts/convert.ts:22`, `packages/web/src/subtitles/controls.tsx:252`, `packages/web/src/play/use-draft-uploads.ts:180`).
- Tutorial session/write schemas reject extra fields and unknown stable step IDs. baseVersion is a nonnegative integer; mutationId is UUID. The private stored record requires positive version and a 64-character lowercase hex request hash; invalid record JSON/schema is retained as unreadable. Same mutation/hash replays its accepted response; conflicting mutation/body/base version refuses (`packages/app/src/slices/settings/tutorial-schema.ts:3`, `packages/app/src/slices/settings/tutorial.ts:25`, `packages/app/src/slices/settings/tutorial.ts:57`).
- Template schemas require UUID identities, names of 1–200 trimmed characters, positive versions and strict version-1 Play documents. Schedule schemas require a future offset timestamp or `HH:mm` recurrence, a valid IANA timezone, at most 49 variants, skip-only overlap behavior and a nullable nonnegative cent ceiling (`packages/app/src/slices/project-templates/schema.ts:4`, `packages/app/src/slices/schedules/calendar.ts:3`, `packages/app/src/slices/schedules/schema.ts:13`).
- Portable import accepts only a strict version-1 manifest after ZIP decompression. The HTTP route limits the upload to 1 byte–100 MiB and returns a generic invalid-backup problem when ZIP, JSON, schema, or referenced content parsing fails (`packages/app/src/slices/storage/portable.ts:45`, `packages/app/src/edge/http/storage.ts:31`).

## Schema

The per-table DDL below is copied directly from migrations 0001–0010 and the collector schema, including later ALTER statements and indexes. Migrations run in numeric filename order, each in a transaction, and record their version; a newer unknown database version is refused (`packages/app/src/kernel/db/migrate.ts:10`).

DB records without dedicated exported domain row models are provider_keys, settings, schema_migrations, project_controls, batches, project_heads, revision_mutations, revision_work_reservations, project_control_receipts, revision_provided_reviews and project-template instantiation receipts. WorkRef is an identity subset of revision_work; RebuildPreview/ExecutionSnapshot and RebuildAdmission are JSON projections rather than complete table rows. Collector aggregates is a key/value table, while Aggregates is the response object. The exact remaining columns are included below. DraftRow and AttachmentRow represent the complete play_drafts and play_draft_attachments table projections. StoredStartReceipt omits SQL created_at, so play_start_receipts has no complete exported row model. The tutorial record is a strict unnamed JSON envelope inside settings, not a separate table (`packages/app/src/slices/play-drafts/repo.ts:6`, `packages/app/src/slices/play-drafts/start-repo.ts:16`, `packages/app/src/kernel/db/migrations/0006-play-drafts.sql:29`, `packages/app/src/slices/settings/tutorial.ts:25`).

### projects

Source: `packages/app/src/kernel/db/migrations/0001-init.sql:1`.

```sql
CREATE TABLE projects (id TEXT PRIMARY KEY, title TEXT NOT NULL CHECK(length(title) <= 200), format TEXT NOT NULL CHECK(format IN ('16:9','9:16')), config TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
```


### stages

Source: `packages/app/src/kernel/db/migrations/0001-init.sql:2`.

```sql
CREATE TABLE stages (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, kind TEXT NOT NULL CHECK(kind IN ('research','article','audio','images','thumbnail','video')), source TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('pending','running','done','failed','canceled','provided','skipped')), failure_reason TEXT, attempt_count INTEGER NOT NULL DEFAULT 0, progress_current INTEGER, progress_total INTEGER, started_at TEXT, finished_at TEXT, UNIQUE(project_id, kind));
```

Source: `packages/app/src/kernel/db/migrations/0005-revision-work.sql:1`.

```sql
CREATE UNIQUE INDEX stages_project_identity ON stages(project_id,id,kind);
```


### attempts

Source: `packages/app/src/kernel/db/migrations/0001-init.sql:3`.

```sql
CREATE TABLE attempts (id TEXT PRIMARY KEY, stage_id TEXT NOT NULL REFERENCES stages(id) ON DELETE CASCADE, piece_id TEXT, n INTEGER NOT NULL, started_at TEXT NOT NULL, ended_at TEXT, outcome TEXT, error_text TEXT);
```

Source: `packages/app/src/kernel/db/migrations/0005-revision-work.sql:80`.

```sql
ALTER TABLE attempts ADD COLUMN revision_id TEXT REFERENCES project_revisions(id) ON DELETE SET NULL;
```

Source: `packages/app/src/kernel/db/migrations/0005-revision-work.sql:81`.

```sql
ALTER TABLE attempts ADD COLUMN work_id TEXT REFERENCES revision_work(id) ON DELETE SET NULL;
```

Source: `packages/app/src/kernel/db/migrations/0005-revision-work.sql:82`.

```sql
ALTER TABLE attempts ADD COLUMN work_piece_id TEXT REFERENCES revision_work_pieces(id) ON DELETE SET NULL;
```


### stage_pieces

Source: `packages/app/src/kernel/db/migrations/0001-init.sql:4`.

```sql
CREATE TABLE stage_pieces (id TEXT PRIMARY KEY, stage_id TEXT NOT NULL REFERENCES stages(id) ON DELETE CASCADE, kind TEXT NOT NULL, idx INTEGER NOT NULL, state TEXT NOT NULL, payload TEXT, UNIQUE(stage_id, kind, idx));
```


### outputs

Source: `packages/app/src/kernel/db/migrations/0001-init.sql:5`.

```sql
CREATE TABLE outputs (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, stage_kind TEXT NOT NULL, role TEXT NOT NULL, path TEXT NOT NULL, original_filename TEXT, bytes INTEGER NOT NULL, duration_ms INTEGER, meta TEXT, created_at TEXT NOT NULL);
```

Source: `packages/app/src/kernel/db/migrations/0001-init.sql:6`.

```sql
CREATE INDEX outputs_project ON outputs(project_id, stage_kind);
```


### prompts

Source: `packages/app/src/kernel/db/migrations/0001-init.sql:7`.

```sql
CREATE TABLE prompts (id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('article','image','thumbnail')), name TEXT NOT NULL, body TEXT NOT NULL, slots TEXT NOT NULL, updated_at TEXT NOT NULL);
```

Source: `packages/app/src/kernel/db/migrations/0001-init.sql:8`.

```sql
CREATE UNIQUE INDEX prompts_name ON prompts(kind, lower(name));
```


### entries

Source: `packages/app/src/kernel/db/migrations/0001-init.sql:9`.

```sql
CREATE TABLE entries (id TEXT PRIMARY KEY, category TEXT NOT NULL CHECK(category IN ('intro','outro')), mode TEXT NOT NULL CHECK(mode IN ('text','llm')), name TEXT NOT NULL, body TEXT NOT NULL, slots TEXT NOT NULL, updated_at TEXT NOT NULL);
```

Source: `packages/app/src/kernel/db/migrations/0001-init.sql:10`.

```sql
CREATE UNIQUE INDEX entries_name ON entries(category, lower(name));
```


### provider_keys

Source: `packages/app/src/kernel/db/migrations/0001-init.sql:11`.

```sql
CREATE TABLE provider_keys (provider TEXT PRIMARY KEY, key TEXT NOT NULL, updated_at TEXT NOT NULL);
```


### voices

Source: `packages/app/src/kernel/db/migrations/0001-init.sql:12`.

```sql
CREATE TABLE voices (id TEXT PRIMARY KEY, provider TEXT NOT NULL, name TEXT NOT NULL, voice_id TEXT NOT NULL, UNIQUE(provider, voice_id));
```


### settings

Source: `packages/app/src/kernel/db/migrations/0001-init.sql:13`.

```sql
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
```


### staged_files

Source: `packages/app/src/kernel/db/migrations/0001-init.sql:14`.

```sql
CREATE TABLE staged_files (id TEXT PRIMARY KEY, stage_kind TEXT NOT NULL, path TEXT NOT NULL, original_filename TEXT NOT NULL, bytes INTEGER NOT NULL, state TEXT NOT NULL, created_at TEXT NOT NULL);
```


### telemetry_events

Source: `packages/app/src/kernel/db/migrations/0001-init.sql:15`.

```sql
CREATE TABLE telemetry_events (id TEXT PRIMARY KEY, type TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, delivered_at TEXT);
```


### machine

Source: `packages/app/src/kernel/db/migrations/0001-init.sql:16`.

```sql
CREATE TABLE machine (machine_id TEXT PRIMARY KEY, notice_seen_at TEXT, app_version TEXT NOT NULL);
```


### schema_migrations

Source: `packages/app/src/kernel/db/migrations/0001-init.sql:17`.

```sql
CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
```


### project_controls

Source: `packages/app/src/kernel/db/migrations/0002-project-controls.sql:1`.

```sql
CREATE TABLE project_controls (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  paused INTEGER NOT NULL DEFAULT 0 CHECK(paused IN (0, 1))
);
```


### batches

Source: `packages/app/src/kernel/db/migrations/0003-batch-queue.sql:1`.

```sql
CREATE TABLE batches (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
```


### project_queue

Source: `packages/app/src/kernel/db/migrations/0003-batch-queue.sql:5`.

```sql
CREATE TABLE project_queue (
  position INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  batch_id TEXT NOT NULL REFERENCES batches(id),
  state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','active','finished'))
);
```

Source: `packages/app/src/kernel/db/migrations/0003-batch-queue.sql:11`.

```sql
CREATE INDEX project_queue_state ON project_queue(state, position);
```


### project_revisions

Source: `packages/app/src/kernel/db/migrations/0004-project-revisions.sql:1`.

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
```

Source: `packages/app/src/kernel/db/migrations/0004-project-revisions.sql:16`.

```sql
CREATE INDEX project_revisions_project ON project_revisions(project_id, created_at, id);
```


### project_heads

Source: `packages/app/src/kernel/db/migrations/0004-project-revisions.sql:17`.

```sql
CREATE TABLE project_heads (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  revision_id TEXT NOT NULL,
  FOREIGN KEY(project_id, revision_id)
    REFERENCES project_revisions(project_id, id) ON DELETE CASCADE
);
```


### project_assets

Source: `packages/app/src/kernel/db/migrations/0004-project-revisions.sql:23`.

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


### revision_outputs

Source: `packages/app/src/kernel/db/migrations/0004-project-revisions.sql:32`.

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
```

Source: `packages/app/src/kernel/db/migrations/0004-project-revisions.sql:50`.

```sql
CREATE UNIQUE INDEX revision_outputs_selected ON revision_outputs(revision_id, slot)
  WHERE selected = 1;
```

Source: `packages/app/src/kernel/db/migrations/0004-project-revisions.sql:52`.

```sql
CREATE INDEX revision_outputs_revision ON revision_outputs(revision_id, created_at, id);
```

Source: `packages/app/src/kernel/db/migrations/0004-project-revisions.sql:53`.

```sql
CREATE UNIQUE INDEX revision_outputs_publication ON revision_outputs(revision_id, publication_id, slot)
  WHERE publication_id IS NOT NULL;
```


### revision_pieces

Source: `packages/app/src/kernel/db/migrations/0004-project-revisions.sql:55`.

```sql
CREATE TABLE revision_pieces (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  piece_key TEXT NOT NULL,
  stage_kind TEXT NOT NULL CHECK(stage_kind IN
    ('research','article','audio','images','thumbnail','video')),
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
```

Source: `packages/app/src/kernel/db/migrations/0004-project-revisions.sql:73`.

```sql
CREATE UNIQUE INDEX revision_pieces_selected ON revision_pieces(revision_id, piece_key)
  WHERE selected = 1;
```

Source: `packages/app/src/kernel/db/migrations/0004-project-revisions.sql:75`.

```sql
CREATE INDEX revision_pieces_revision ON revision_pieces(revision_id, created_at, id);
```

Source: `packages/app/src/kernel/db/migrations/0004-project-revisions.sql:76`.

```sql
CREATE UNIQUE INDEX revision_pieces_publication ON revision_pieces(revision_id, publication_id, piece_key)
  WHERE publication_id IS NOT NULL;
```


### revision_mutations

Source: `packages/app/src/kernel/db/migrations/0004-project-revisions.sql:78`.

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


### revision_work

Source: `packages/app/src/kernel/db/migrations/0005-revision-work.sql:2`.

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
 created_at TEXT NOT NULL,
 UNIQUE(project_id,id),
 FOREIGN KEY(project_id,revision_id) REFERENCES project_revisions(project_id,id) ON DELETE CASCADE,
 FOREIGN KEY(project_id,stage_id,kind) REFERENCES stages(project_id,id,kind) ON DELETE CASCADE
);
```

Source: `packages/app/src/kernel/db/migrations/0005-revision-work.sql:21`.

```sql
CREATE INDEX revision_work_stage ON revision_work(revision_id,stage_id);
```

Source: `packages/app/src/kernel/db/migrations/0005-revision-work.sql:22`.

```sql
CREATE INDEX revision_work_dispatch ON revision_work(project_id,dispatch_state,state);
```


### revision_work_pieces

Source: `packages/app/src/kernel/db/migrations/0005-revision-work.sql:23`.

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
```

Source: `packages/app/src/kernel/db/migrations/0005-revision-work.sql:40`.

```sql
CREATE INDEX revision_piece_dispatch ON revision_work_pieces(work_id,dispatch_state,state);
```


### revision_work_reservations

Source: `packages/app/src/kernel/db/migrations/0005-revision-work.sql:41`.

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


### rebuild_previews

Source: `packages/app/src/kernel/db/migrations/0005-revision-work.sql:56`.

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


### rebuild_admissions

Source: `packages/app/src/kernel/db/migrations/0005-revision-work.sql:67`.

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


### project_control_receipts

Source: `packages/app/src/kernel/db/migrations/0005-revision-work.sql:84`.

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


### revision_provided_reviews

Source: `packages/app/src/kernel/db/migrations/0005-revision-work.sql:95`.

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


The following DDL is transcribed verbatim from migration 0006; none of its columns declare DEFAULT values. The tutorial uses the existing settings table, not a new table (`packages/app/src/kernel/db/migrations/0006-play-drafts.sql:1`, `packages/app/src/slices/settings/tutorial.ts:35`).

### play_drafts
Source: `packages/app/src/kernel/db/migrations/0006-play-drafts.sql:1`.

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

### play_draft_attachments

Source: `packages/app/src/kernel/db/migrations/0006-play-drafts.sql:18`.

```sql
CREATE TABLE play_draft_attachments (
 id TEXT PRIMARY KEY,
 draft_id TEXT NOT NULL REFERENCES play_drafts(id) ON DELETE CASCADE,
 staged_file_id TEXT REFERENCES staged_files(id) ON DELETE SET NULL,
 kind TEXT NOT NULL CHECK(kind IN ('audio','images','thumbnail')),
 original_filename TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','ready','reattach')),
 error TEXT
);
CREATE INDEX play_draft_attachment_file ON play_draft_attachments(staged_file_id);
CREATE INDEX play_draft_attachment_owner ON play_draft_attachments(draft_id);
```

### play_start_receipts

Source: `packages/app/src/kernel/db/migrations/0006-play-drafts.sql:29`.

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

### review_checkpoints

Source: `packages/app/src/kernel/db/migrations/0007-review-checkpoints.sql:1`.

```sql
CREATE UNIQUE INDEX revision_work_revision_identity ON revision_work(project_id,revision_id,id);
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

### review_checkpoint_approvals

Source: `packages/app/src/kernel/db/migrations/0007-review-checkpoints.sql:18`.

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

### project_templates

Source: `packages/app/src/kernel/db/migrations/0008-project-templates.sql:1`.

```sql
CREATE TABLE project_templates (
 id TEXT PRIMARY KEY,
 head_version INTEGER NOT NULL CHECK(head_version >= 1),
 creation_hash TEXT NOT NULL,
 created_at TEXT NOT NULL,
 mutation_id TEXT,
 mutation_hash TEXT
);
```

### project_template_revisions

Source: `packages/app/src/kernel/db/migrations/0008-project-templates.sql:9`.

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

### project_template_instantiations

Source: `packages/app/src/kernel/db/migrations/0008-project-templates.sql:17`.

```sql
CREATE TABLE project_template_instantiations (
 draft_id TEXT PRIMARY KEY REFERENCES play_drafts(id) ON DELETE CASCADE,
 template_id TEXT NOT NULL,
 template_version INTEGER NOT NULL CHECK(template_version >= 1)
);
```

### schedules

Final schema source: `packages/app/src/kernel/db/migrations/0010-retain-schedule-history.sql:28`.

```sql
CREATE TABLE schedules (
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
  deleted_at TEXT,
  CHECK(deleted_at IS NULL OR (status IN ('completed','canceled') AND next_run_at IS NULL))
);
CREATE INDEX schedules_due ON schedules(status, next_run_at) WHERE deleted_at IS NULL;
```

### schedule_runs

Final schema source: `packages/app/src/kernel/db/migrations/0010-retain-schedule-history.sql:1`.

```sql
CREATE TABLE schedule_runs (
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

### collector.events

Source: `packages/collector/schema.sql:3`.

```sql
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  machine_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  received_at TEXT NOT NULL
);
```

Source: `packages/collector/schema.sql:13`.

```sql
CREATE INDEX IF NOT EXISTS events_machine ON events (machine_id, received_at);
```


### collector.aggregates

Source: `packages/collector/schema.sql:15`.

```sql
CREATE TABLE IF NOT EXISTS aggregates (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
```
