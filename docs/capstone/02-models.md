---
generated_at_commit: 3a9796eb7fec
generated_date: 2026-09-10
content_hash: e293a0b5e022
paths_covered:
  - ":(top)packages/app/src/**"
  - ":(top)packages/web/src/**"
  - ":(top)packages/collector/**"
  - ":(top)packages/site/**"
---

# Models

## Entities

| Entity | Definition site | Storage | Purpose |
|---|---|---|---|
| ProviderChoice | `packages/app/src/slices/admission/model.ts:17` | in-memory / nested DTO | ProviderChoice contract |
| VoiceChoice | `packages/app/src/slices/admission/model.ts:23` | in-memory / nested DTO | VoiceChoice contract |
| ImagePromptChoice | `packages/app/src/slices/admission/model.ts:27` | in-memory / nested DTO | ImagePromptChoice contract |
| EntryChoice | `packages/app/src/slices/admission/model.ts:33` | in-memory / nested DTO | EntryChoice contract |
| ProvidedText | `packages/app/src/slices/admission/model.ts:42` | in-memory / nested DTO | ProvidedText contract |
| ProvidedFiles | `packages/app/src/slices/admission/model.ts:48` | in-memory / nested DTO | ProvidedFiles contract |
| RunDraft | `packages/app/src/slices/admission/model.ts:55` | in-memory / nested DTO | RunDraft contract |
| RunConfig | `packages/app/src/slices/admission/model.ts:80` | projects.config JSON | RunConfig contract |
| Project | `packages/app/src/slices/admission/model.ts:84` | projects + folder | Project contract |
| Stage | `packages/app/src/slices/admission/model.ts:95` | stages | Stage contract |
| ProjectSummary | `packages/app/src/slices/admission/model.ts:109` | in-memory / nested DTO | ProjectSummary contract |
| ProjectListing | `packages/app/src/slices/admission/model.ts:117` | in-memory / nested DTO | ProjectListing contract |
| Output | `packages/app/src/slices/storage/model.ts:49` | outputs + file | Output contract |
| StagedFile | `packages/app/src/slices/storage/model.ts:63` | staged_files + file | StagedFile contract |
| Prompt | `packages/app/src/slices/library/model.ts:26` | prompts | Prompt contract |
| Entry | `packages/app/src/slices/library/model.ts:43` | entries | Entry contract |
| Voice | `packages/app/src/slices/settings/model.ts:105` | voices | Voice contract |
| ProviderStatus | `packages/app/src/slices/settings/model.ts:97` | in-memory / nested DTO | ProviderStatus contract |
| ProviderChanges | `packages/app/src/slices/control/providers.ts:31` | in-memory / nested DTO | ProviderChanges contract |
| Attempt | `packages/app/src/kernel/runner/attempt-repo.ts:27` | attempts | Attempt contract |
| StagePiece | `packages/app/src/kernel/runner/piece-repo.ts:22` | stage_pieces | StagePiece contract |
| ThinkingConfig | `packages/app/src/kernel/ports/llm.ts:43` | in-memory / nested DTO | ThinkingConfig contract |
| TimedWord | `packages/app/src/kernel/ports/subtitles.ts:1` | in-memory / nested DTO | TimedWord contract |
| FontSummary | `packages/app/src/slices/fonts/model.ts:1` | in-memory / nested DTO | FontSummary contract |
| ResolvedFont | `packages/app/src/slices/fonts/model.ts:8` | in-memory / nested DTO | ResolvedFont contract |
| TelemetryEvent | `packages/app/src/slices/telemetry/model.ts:77` | telemetry_events | TelemetryEvent contract |
| CollectorEvent | `packages/app/src/slices/telemetry/collector-client.ts:6` | HTTP / collector events | CollectorEvent contract |
| UpdateInfo | `packages/app/src/updater/model.ts:3` | in-memory / nested DTO | UpdateInfo contract |
| UpdateResult | `packages/app/src/updater/model.ts:14` | in-memory / nested DTO | UpdateResult contract |
| CostRow | `packages/app/src/slices/estimate/index.ts:5` | in-memory / nested DTO | CostRow contract |
| CostEstimate | `packages/app/src/slices/estimate/index.ts:11` | in-memory / nested DTO | CostEstimate contract |
| Catalogue | `packages/app/src/catalog/schema.ts:1` | local YAML | Validated model |
| CatalogueModel | `packages/app/src/catalog/schema.ts:1` | catalogue member | Validated model |
| QueueEntry | `packages/app/src/slices/batch/index.ts:1` | project_queue | Validated model |
| SubtitleConfig | `packages/app/src/slices/subtitles/model.ts:1` | projects.config JSON | Validated model |
| Aggregates | `packages/collector/src/model.ts:1` | collector aggregate response | Validated model |

## Fields and types

All property spellings below are read from the exported interfaces. `readonly` fields retain their declared type; nullable fields remain required when the declaration requires the property. Enum aliases resolve at the cited definition sites.

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

Source: `packages/app/src/slices/admission/model.ts:23`; includes inherited ProviderChoice  fields.

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

Source: `packages/app/src/slices/admission/model.ts:80`; includes inherited RunDraft  fields.

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

Source: `packages/app/src/slices/admission/model.ts:109`; includes inherited Project  fields.

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

Source: `packages/app/src/slices/admission/model.ts:117`; includes inherited ProjectSummary  fields.

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

Source: `packages/app/src/slices/storage/model.ts:49`.

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

Source: `packages/app/src/slices/storage/model.ts:63`.

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

### Voice

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| provider | `ProviderId` | yes |
| name | `string` | yes |
| voiceId | `string` | yes |

Source: `packages/app/src/slices/settings/model.ts:105`.

### ProviderStatus

| Field | Type | Required |
|---|---|---|
| id | `ProviderId` | yes |
| family | `ProviderFamily` | yes |
| displayName | `string` | yes |
| readiness | `Readiness` | yes |
| cliPath | `{ readonly configured: string \| null` | no |
| command | `string }` | yes |

Source: `packages/app/src/slices/settings/model.ts:97`.

### ProviderChanges

| Field | Type | Required |
|---|---|---|
| chunking | `Chunking \| undefined` | no |
| llm | `ProviderChoice \| undefined` | no |
| audio | `VoiceChoice \| undefined` | no |
| images | `ProviderChoice \| undefined` | no |

Source: `packages/app/src/slices/control/providers.ts:31`.

### Attempt

| Field | Type | Required |
|---|---|---|
| stageId | `string` | yes |
| pieceId | `string \| null` | yes |
| n | `number` | yes |
| startedAt | `string` | yes |
| id | `string` | yes |
| endedAt | `string \| null` | yes |
| outcome | `AttemptOutcome \| null` | yes |
| errorText | `string \| null` | yes |

Source: `packages/app/src/kernel/runner/attempt-repo.ts:27`; includes inherited AttemptStart  fields.

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

### ThinkingConfig

| Field | Type | Required |
|---|---|---|
| budget | `number \| undefined` | no |
| level | `"minimal" \| "low" \| "medium" \| "high" \| undefined` | no |
| effort | `"none" \| "minimal" \| "low" \| "medium" \| "high" \| "xhigh" \| undefined` | no |

Source: `packages/app/src/kernel/ports/llm.ts:43`.

### TimedWord

| Field | Type | Required |
|---|---|---|
| text | `string` | yes |
| start | `number` | yes |
| end | `number` | yes |
| confidence | `number \| undefined` | no |

Source: `packages/app/src/kernel/ports/subtitles.ts:1`.

### FontSummary

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| name | `string` | yes |
| family | `string` | yes |
| source | `"bundled" \| "system" \| "uploaded"` | yes |

Source: `packages/app/src/slices/fonts/model.ts:1`.

### ResolvedFont

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| name | `string` | yes |
| family | `string` | yes |
| source | `"bundled" \| "system" \| "uploaded"` | yes |
| path | `string` | yes |
| extension | `".ttf" \| ".otf" \| ".ttc"` | yes |
| assName | `string` | yes |
| faceIndex | `number` | yes |

Source: `packages/app/src/slices/fonts/model.ts:8`; includes inherited FontSummary  fields.

### TelemetryEvent

| Field | Type | Required |
|---|---|---|
| id | `string` | yes |
| type | `TelemetryEventType` | yes |
| payload | `TelemetryPayload` | yes |
| createdAt | `string` | yes |
| deliveredAt | `string \| null` | yes |

Source: `packages/app/src/slices/telemetry/model.ts:77`.

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

Source: `packages/app/src/slices/estimate/index.ts:5`.

### CostEstimate

| Field | Type | Required |
|---|---|---|
| currency | `"USD"` | yes |
| rows | `readonly CostRow[]` | yes |
| low | `number` | yes |
| high | `number` | yes |
| unknown | `number` | yes |
| expectedWords | `number` | yes |
| catalogueDate | `string \| null` | yes |
| assumptions | `readonly string[]` | yes |

Source: `packages/app/src/slices/estimate/index.ts:11`.

### Catalogue

| Field | Type | Required |
|---|---|---|
| schemaVersion | `1` | yes |
| updatedAt | `string (YYYY-MM-DD)` | yes |
| providers | `Record<string, {maxConcurrent: number (1..5)}>` | yes |
| llm | `CatalogueModel[] (LLM branch)` | yes |
| image | `CatalogueModel[] (image branch)` | yes |
| tts | `CatalogueModel[] (TTS branch)` | yes |

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

### QueueEntry

| Field | Type | Required |
|---|---|---|
| projectId | `string` | yes |
| batchId | `string` | yes |
| position | `number` | yes |
| state | `"queued" \| "active" \| "finished"` | yes |

### SubtitleConfig

| Field | Type | Required |
|---|---|---|
| mode | `"off" \| "files" \| "burn-in"` | yes |
| language | `"en" (default)` | yes |
| fontId | `string (default "default")` | yes |
| position | `"top" \| "upper-middle" \| "center" \| "lower-middle" \| "bottom" (default)` | yes |
| fontSize | `integer 16..120 (default 48)` | yes |

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

CatalogueModel is a union: exactly one family object is required for the selected branch. Parsed schema defaults are present; input YAML may omit those defaulted fields. Thinking maps supported modes to optional budget, level and effort fields (`packages/app/src/catalog/schema.ts:28`).

## Relationships

- A Project has stages, attempts, pieces, and outputs; an Attempt optionally references a StagePiece. `packages/app/src/kernel/db/migrations/0001-init.sql:1-80` `packages/app/src/kernel/runner/attempt-repo.ts:28-34`
- A batch contains ordered QueueEntry rows, each referencing one Project. `packages/app/src/kernel/db/migrations/0003-batch-queue.sql:1-14` `packages/app/src/slices/batch/index.ts:19-29`
- RunConfig embeds provider choices, prompt values, chunking, silence, and subtitles. `packages/app/src/slices/admission/model.ts:54-100`

## Boundaries

- SQLite rows use snake_case and JSON text; repositories convert rows to camelCase domain entities. `packages/app/src/kernel/runner/attempt-repo.ts:36-92` `packages/app/src/kernel/runner/piece-repo.ts:22-82`
- HTTP handlers serialize domain entities and Zod-derived DTOs; the SPA consumes generated Hono route types. `packages/app/src/edge/http/app.ts:24-67` `packages/web/src/api.ts:60-67`
- Files remain project-relative paths and are served as binary responses; provider payloads remain inside adapters. `packages/app/src/slices/storage/model.ts:32-54` `packages/app/src/edge/http/files.ts:33-50`

## Validation

- HTTP bodies and params use Zod validators; catalogue, provider, DB-row, collector, and alignment payloads also use Zod schemas. `packages/app/src/edge/http/planning.ts:15-29` `packages/app/src/catalog/schema.ts:5-99` `packages/collector/src/model.ts:46-75`
- SQLite migrations enforce primary keys, foreign keys, uniqueness, enum checks, and queue-state checks. `packages/app/src/kernel/db/migrations/0001-init.sql:1-80` `packages/app/src/kernel/db/migrations/0003-batch-queue.sql:1-14`

## Schema

SQL below is transcribed from the migrations, including constraints and indexes. `provider_keys`, `settings`, `machine`, `project_controls`, `batches`, and migration records are DB-only records or mapped by repository functions rather than dedicated exported row types.

### 0001-init.sql

Source: `packages/app/src/kernel/db/migrations/0001-init.sql:1`.

```sql
CREATE TABLE projects (id TEXT PRIMARY KEY, title TEXT NOT NULL CHECK(length(title) <= 200), format TEXT NOT NULL CHECK(format IN ('16:9','9:16')), config TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE stages (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, kind TEXT NOT NULL CHECK(kind IN ('research','article','audio','images','thumbnail','video')), source TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('pending','running','done','failed','canceled','provided','skipped')), failure_reason TEXT, attempt_count INTEGER NOT NULL DEFAULT 0, progress_current INTEGER, progress_total INTEGER, started_at TEXT, finished_at TEXT, UNIQUE(project_id, kind));
CREATE TABLE attempts (id TEXT PRIMARY KEY, stage_id TEXT NOT NULL REFERENCES stages(id) ON DELETE CASCADE, piece_id TEXT, n INTEGER NOT NULL, started_at TEXT NOT NULL, ended_at TEXT, outcome TEXT, error_text TEXT);
CREATE TABLE stage_pieces (id TEXT PRIMARY KEY, stage_id TEXT NOT NULL REFERENCES stages(id) ON DELETE CASCADE, kind TEXT NOT NULL, idx INTEGER NOT NULL, state TEXT NOT NULL, payload TEXT, UNIQUE(stage_id, kind, idx));
CREATE TABLE outputs (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, stage_kind TEXT NOT NULL, role TEXT NOT NULL, path TEXT NOT NULL, original_filename TEXT, bytes INTEGER NOT NULL, duration_ms INTEGER, meta TEXT, created_at TEXT NOT NULL);
CREATE INDEX outputs_project ON outputs(project_id, stage_kind);
CREATE TABLE prompts (id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('article','image','thumbnail')), name TEXT NOT NULL, body TEXT NOT NULL, slots TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE UNIQUE INDEX prompts_name ON prompts(kind, lower(name));
CREATE TABLE entries (id TEXT PRIMARY KEY, category TEXT NOT NULL CHECK(category IN ('intro','outro')), mode TEXT NOT NULL CHECK(mode IN ('text','llm')), name TEXT NOT NULL, body TEXT NOT NULL, slots TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE UNIQUE INDEX entries_name ON entries(category, lower(name));
CREATE TABLE provider_keys (provider TEXT PRIMARY KEY, key TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE voices (id TEXT PRIMARY KEY, provider TEXT NOT NULL, name TEXT NOT NULL, voice_id TEXT NOT NULL, UNIQUE(provider, voice_id));
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE staged_files (id TEXT PRIMARY KEY, stage_kind TEXT NOT NULL, path TEXT NOT NULL, original_filename TEXT NOT NULL, bytes INTEGER NOT NULL, state TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE telemetry_events (id TEXT PRIMARY KEY, type TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, delivered_at TEXT);
CREATE TABLE machine (machine_id TEXT PRIMARY KEY, notice_seen_at TEXT, app_version TEXT NOT NULL);
CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
```

### 0002-project-controls.sql

Source: `packages/app/src/kernel/db/migrations/0002-project-controls.sql:1`.

```sql
CREATE TABLE project_controls (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  paused INTEGER NOT NULL DEFAULT 0 CHECK(paused IN (0, 1))
);
```

### 0003-batch-queue.sql

Source: `packages/app/src/kernel/db/migrations/0003-batch-queue.sql:1`.

```sql
CREATE TABLE batches (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
CREATE TABLE project_queue (
  position INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  batch_id TEXT NOT NULL REFERENCES batches(id),
  state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','active','finished'))
);
CREATE INDEX project_queue_state ON project_queue(state, position);
```

### Collector D1

Source: `packages/collector/schema.sql:1`.

```sql
-- The collector's database. Aggregates are sums over deduplicated events;
-- the event rows are kept so a lost aggregate can be recomputed from them.
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  machine_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  received_at TEXT NOT NULL
);

-- The rate limit counts a machine's recent rows, so it reads this index rather than the
-- table.
CREATE INDEX IF NOT EXISTS events_machine ON events (machine_id, received_at);

CREATE TABLE IF NOT EXISTS aggregates (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
```
