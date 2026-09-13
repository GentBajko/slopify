---
absorbed_from:
  - features/2026-09-09-pausable-optional-runs@2026-09-10
  - features/2026-09-10-editable-projects@2026-09-12
scenario: pipeline-lifecycle
mockup_row: S9
screens:
  - 06-play
  - 08-project
depends_on: []
cited_by_forward:
  - 04-run-admission
  - 12-reruns-and-edits
  - 13-cancel
  - 16-telemetry
generated_date: '2026-09-13'
generated_at_commit: 7bdb84e3f57e
capstone_version: 5.2.0
paths_covered:
  - :(top)packages/app/src/kernel/runner/**
  - :(top)packages/app/src/slices/admission/**
  - :(top)packages/app/src/slices/rebuild/**
  - :(top)packages/app/src/slices/revisions/**
  - :(top)packages/app/src/main.ts
content_hash: 16a212d5b9d4
---

# 01 Pipeline lifecycle

A project has immutable revisions, revision-scoped desired work and retained output manifests. Stage summaries project that state; they do not authorize provider dispatch (`packages/app/src/slices/rebuild/runtime-store.ts:1`, `packages/app/src/slices/rebuild/admission-repo.ts:1`).

## Trigger & preconditions

Reviewed Play or scheduled admission creates a project and baseline revision. Editing creates another revision, while a separate reviewed rebuild admits changed or missing work. Article is required; Research, Audio, Images, Thumbnail and Video can be generated, provided where supported, or disabled under admission rules (`packages/app/src/slices/admission/rules.ts:17`, `packages/app/src/slices/revisions/mutations.ts:47`).

## Steps

1. Build recipes from the selected revision, retained manifest and active source choices. Each text, image, narration, caption and export item has dependency and request identities (`packages/app/src/slices/rebuild/recipe-build.ts:1`, `packages/app/src/slices/rebuild/recipe-work.ts:1`).
2. Admit the reviewed revision under an idempotent request. Persist invocations, physical pieces, reservations and the execution snapshot before waking work (`packages/app/src/slices/rebuild/runtime-admission.ts:1`, `packages/app/src/slices/rebuild/admission-repo.ts:1`).
3. Claim only eligible work whose dependencies and checkpoint gates permit dispatch. Direct image and thumbnail prompts can proceed independently from Article; article-derived work waits for its text inputs (`packages/app/src/slices/rebuild/runtime-run.ts:1`, `packages/app/src/slices/rebuild/runtime-materialize.ts:1`).
4. Submit provider requests through the shared attempt wrapper and provider-aware queue. Authority is checked after queue waits and before another physical request or retry (`packages/app/src/kernel/runner/providers.ts:1`, `packages/app/src/kernel/runner/queue.ts:1`).
5. Publish immutable bytes to the originating revision. A compatible current reservation may select them, but a late result from an older revision cannot overwrite unrelated current content (`packages/app/src/slices/revisions/publish.ts:1`, `packages/app/src/slices/rebuild/runtime-publication.ts:1`).
6. Build MP4, silent MP4, combined WAV, or article-only output from the selected image order and active narration/caption timeline (`packages/app/src/slices/rebuild/runtime-export-inputs.ts:1`, `packages/app/src/slices/rebuild/runtime-export.ts:1`).

## Branches

- Saving during active work retains matching reservations and revokes affected future dispatch; submitted work can still settle to its origin (`packages/app/src/slices/rebuild/transition-repo.ts:1`).
- A reviewed retry reuses complete compatible requests and retained files. Accepted asynchronous continuation data is retrieved on the same piece rather than resubmitted (`packages/app/src/slices/rebuild/runtime-narration-reuse.ts:1`, `packages/app/src/slices/rebuild/runtime-provider.ts:1`).
- Review checkpoints hold only their dependency closure, so independent work remains eligible (`packages/app/src/slices/rebuild/runtime-checkpoints.ts:1`).

## Unhappy paths

Provider faults use the common attempt policy. A sibling failure preserves completed pieces. Restart marks interrupted stages, recovers checkpoints and reconciles registered storage before serving again; unqueued interrupted work waits for explicit resume (`packages/app/src/kernel/runner/attempt.ts:13`, `packages/app/src/main.ts:113`). Missing retained bytes remain visible as unavailable and require an explicit affected rebuild (`packages/app/src/slices/rebuild/preview-retained.ts:1`).

## State transitions

Visible stages use pending, running, done, failed, canceled, provided and skipped. Project pause is persisted separately. Work reservations and pieces additionally record whether dispatch is held, running, draining or terminal under a specific revision/work identity (`packages/app/src/slices/rebuild/model.ts:1`, `packages/app/src/kernel/runner/piece-repo.ts:1`).

## Invariants

Every provider attempt and published output belongs to durable work identity. Current revision ownership, not completion order, determines selection. Article cannot be disabled. A download, Save, Restore, template application or schedule edit does not itself authorize a provider call (`packages/app/src/slices/revisions/publication-rules.ts:1`, `packages/app/src/slices/admission/rules.ts:17`).

## Outcomes & side effects

Admission persists execution state, wakes the runner and eventually records immutable outputs. Save and Restore persist revisions without generation. Project deletion is explicit and storage cleanup refuses unsafe removal while known work is active (`packages/app/src/slices/rebuild/service.ts:1`, `packages/app/src/slices/revisions/restore.ts:1`).

## Dimensions not in play

There is no multi-user ownership, remote worker orchestration or exactly-once billing guarantee for external providers. The lifecycle is local and idempotent at Slopify's request and publication boundaries (`packages/app/src/kernel/config/index.ts:20`, `packages/app/src/slices/rebuild/admission-repo.ts:1`).
