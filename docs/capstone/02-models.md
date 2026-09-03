---
generated_date: 2026-09-02
capstone_version: 5.2.0
paths_covered:
 - "packages/app/src/kernel/db/**"
 - "packages/app/src/slices/**/model.ts"
 - "packages/collector/src/**"
---

# Models

## Entities

| Entity | Planned definition site | Storage | Purpose |
|---|---|---|---|
| Project | `packages/app/src/slices/admission/model.ts` | table `projects` + folder `projects/<id>/` | one run (`logic/04`) |
| Stage | `slices/admission/model.ts` | table `stages` | one of research, article, audio, images, thumbnail, video per project (`logic/01`) |
| Attempt | `kernel/runner/model.ts` | table `attempts` | one provider call attempt with error text (`logic/01`) |
| StagePiece | `kernel/runner/model.ts` | table `stage_pieces` | resumable sub-unit: research chapter, audio chunk or segment, image index, thumbnail prompt-written (`logic/06`, `08`, `09`, `10`) |
| Output | `slices/storage/model.ts` | table `outputs` + file | a produced or provided file with its metadata (`logic/14`) |
| Prompt | `slices/library/model.ts` | table `prompts` | article / image / thumbnail template (`logic/15`) |
| Entry | `slices/library/model.ts` | table `entries` | intro / outro, Text or LLM mode (`logic/15`) |
| ProviderKey | `slices/settings/model.ts` | table `provider_keys` | one key per provider (`logic/02`) |
| Voice | `slices/settings/model.ts` | table `voices` | name, provider, voice ID (`logic/02`) |
| Setting | `slices/settings/model.ts` | table `settings` | silence gap seconds, appearance (`logic/11`) |
| RunConfig | `slices/admission/model.ts` | column `projects.config` (JSON) | the full Play configuration, keyword values, rendered prompt texts (`logic/03`, `logic/04`) |
| StagedFile | `slices/storage/model.ts` | table `staged_files` + `staging/` | an upload before Play (`logic/05`) |
| TelemetryEvent | `slices/telemetry/model.ts` | table `telemetry_events` | one local event, queued then delivered (`logic/16`) |
| Machine | `slices/telemetry/model.ts` | table `machine` (single row) | machine ID, notice seen, app version (`logic/16`) |
| CollectorEvent, Aggregate | `packages/collector/src/model.ts` | collector database | received events (dedup by ID) and the totals the site reads (`logic/16`) |

## Fields and types

- Project: `id` ULID; `title` text ≤200; `format` enum `16:9`, `9:16`; `config` JSON (RunConfig); `status` derived, never stored (`logic/01`); `created_at`, `updated_at` UTC ISO-8601 text.
- Stage: `id`, `project_id`, `kind` enum (`research`, `article`, `audio`, `images`, `thumbnail`, `video`); `source` enum (`generate`, `provide`, `off`, `from_prompt`, `prompt_by_llm`); `state` enum (`pending`, `running`, `done`, `failed`, `canceled`, `provided`, `skipped`); `failure_reason` text nullable (verbatim provider text, "interrupted", "canceled by user"); `attempt_count` integer; `progress_current`, `progress_total` integer nullable; `started_at`, `finished_at` nullable.
- Attempt: `id`, `stage_id`, `piece_id` nullable, `n` 1-4, `started_at`, `ended_at`, `outcome` enum (`ok`, `error`, `timeout`, `refusal`, `aborted`), `error_text`.
- StagePiece: `id`, `stage_id`, `kind` (`chapter`, `chunk`, `segment`, `image`, `prompt_written`), `index` integer, `state` (`pending`, `running`, `done`, `failed`), `payload` JSON (prompt text, chapter title, chunk text).
- Output: `id`, `project_id`, `stage_kind`, `role` (`notes`, `article_md`, `article_txt`, `sources`, `glossary`, `audio_body`, `audio_intro`, `audio_outro`, `image`, `thumbnail`, `video`, `render_params`, `instructions`), `path` relative to the project folder, `original_filename` nullable (provided files), `bytes`, `duration_ms` nullable, `meta` JSON (prompt name, index, provider, model, voice), `created_at`.
- Prompt: `id`, `kind` (`article`, `image`, `thumbnail`), `name` unique per kind case-insensitively, `body`, `slots` JSON (detected names), `updated_at`.
- Entry: `id`, `category` (`intro`, `outro`), `mode` (`text`, `llm`), `name` unique per category, `body`, `slots` JSON.
- ProviderKey: `provider` primary key, `key` text, `updated_at`. CLI providers have no row; their `installed` status is computed at request time.
- Voice: `id`, `provider`, `name`, `voice_id`; unique (`provider`, `voice_id`).
- Setting: `key` primary key, `value` JSON.
- StagedFile: `id`, `stage_kind`, `path`, `original_filename`, `bytes`, `state` (`copying`, `staged`), `created_at`.
- TelemetryEvent: `id` ULID (the dedup key), `type`, `payload` JSON (counters, provider, model), `created_at`, `delivered_at` nullable.
- Machine: `machine_id` UUID, `notice_seen_at`, `app_version`.
- Money and quantities: none are currency; durations in integer milliseconds; counts as integers.

## Relationships

- Project 1-6 Stage (one per kind, created at Play per `logic/01` step 1); Stage 1-n Attempt; Stage 1-n StagePiece; Project 1-n Output; Project references Prompt and Entry names only inside `config` (never foreign keys: a deleted template must not touch a project, `logic/15`).
- Voice n-1 provider by name; ProviderKey 1 per provider name.
- StagedFile attaches to a Project at Play by moving the file into the project folder and becoming an Output (`logic/05` step 8).
- TelemetryEvent references nothing; its payload carries stage kind and counters.
- Aggregates in the collector are sums over deduplicated CollectorEvents.

## Boundaries

Three representations: SQLite rows (snake_case columns, JSON columns for config, slots, meta, payload) → domain objects (TypeScript types per slice `model.ts`, camelCase, enums as string literal unions) converted in each slice's `repo.ts`; domain → API JSON in `edge/http/<context>.ts` (same shapes, dates as ISO strings, derived `status` added on Project); API JSON → SPA types via the generated client. Files never pass through the API as JSON; they are served from `/files/...`.

## Validation

- HTTP edge: every request body validated against a schema before a slice sees it (library per `stack`); violations → RFC 9457 400.
- SQLite constraints: enums as CHECK constraints, uniqueness (`prompts(kind, lower(name))`, `entries(category, lower(name))`, `voices(provider, voice_id)`), foreign keys with cascade delete from `projects` to `stages`, `attempts`, `stage_pieces`, `outputs` (`logic/14`).
- Slice rules: admission (`logic/04`), substitution (`logic/03`), provided outputs (`logic/05`), storage (`logic/14`) enforced in the slices, never in the edge.
- Absent by design: validation of provider payloads beyond what an adapter needs to map them.

## Schema

Migrations in `packages/app/src/kernel/db/migrations/NNNN-<name>.sql`, forward-only, applied at boot in order, recorded in `schema_migrations(version, applied_at)`; the app refuses to start when the database records a version newer than it knows. WAL journal mode on open. Planned DDL, transcribed into the first migration when `build` runs:

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

Tables with no code model: `schema_migrations`. Collector schema (`logic/16`): `events(id TEXT PRIMARY KEY, machine_id, type, payload, received_at)` and `aggregates(key TEXT PRIMARY KEY, value INTEGER)` in the managed database; the engine is `stack`'s.

Data lifecycle (`logic/14`): hard deletes only; projects and templates kept until the user deletes them; the telemetry log kept forever; no archival, no legal hold; PII: none stored except provider keys, classified secret and never exported. Analytics path: local `telemetry_events` → collector aggregates; no warehouse. Search: none. Caching: none (model lists are fetched per Play load, `logic/02`). Backups: none for local data (§0.5, `logic/14`); collector: the host's daily backup.
