---
absorbed_from:
- features/2026-09-09-pausable-optional-runs@2026-09-10
- features/2026-09-10-editable-projects@2026-09-12
scenario: pipeline-lifecycle
mockup_row: S9
screens:
- 07-projects
- 08-project
depends_on: []
cited_by_forward:
- 04-run-admission
- 12-reruns-and-edits
- 13-cancel
- 16-telemetry
generated_date: '2026-09-12'
generated_at_commit: 29b88494eb40
---

# 01 Pipeline lifecycle

A project holds immutable configuration/content revisions and retained output manifests. The runner executes admitted work tied to an originating revision and exact physical request pieces. Current stage summaries are projections; they are not permission to submit a provider request.

## Trigger and preconditions

Initial Play/batch admission creates the project and baseline work. Editing an existing project saves a new revision; a separate reviewed rebuild admits missing or changed work. Article is required; optional stages can be generated, provided or disabled according to their source rules (`slices/rebuild/runtime-admission.ts`, `slices/revisions/mutations.ts`, `slices/rebuild/service.ts`).

## Steps

1. Build the desired recipes from saved configuration/content and available manifest records. Text, individual image/narration requests, alignment/cues/files and media export each have exact dependency identities. Supplied/disabled stages do not become provider requests (`slices/rebuild/recipe-build.ts`, `recipe-work.ts`).
2. Admit only the reviewed current revision under its idempotency receipt. Persist work invocations, physical pieces, current reservations and the frozen recipe context. Save alone neither admits providers nor runs a final render (`slices/rebuild/admission-repo.ts`, `runtime-admission.ts`).
3. Claim an eligible allowed invocation after prerequisites resolve. Saved image prompts and direct thumbnail prompts can run independently of Article. Article depends on enabled Research; generated narration and article-derived entry/thumbnail text wait for their actual text inputs. Materialize deferred requests under the original admission rather than creating a fresh unreviewed run (`runtime-store.ts`, `runtime-materialize.ts`).
4. Route provider work through the common attempt wrapper and app-wide queue. At most five requests are active across providers, with lower per-provider limits. Recheck dispatch authority after queue waits and before each new request/retry. Persist accepted asynchronous continuation state on the exact request piece (`kernel/runner/providers.ts`, `work-authority.ts`, `queue.ts`).
5. Store completed bytes in immutable assets and publish through the originating work authority. Results always remain with their origin; a compatible current reservation may also select them. A later unrelated edit cannot overwrite current content simply because its old request finishes last (`slices/revisions/publish.ts`, `slices/rebuild/repo.ts`).
6. Local export uses the saved selected image order and active narration timeline. Video with Audio Off is a silent slideshow. Video Off with active Audio produces WAV; both media sources Off leaves Article downloadable. Removed intro/outro audio remains retained but is excluded from rebuilt export and caption timelines (`runtime-export.ts`, `runtime-export-inputs.ts`).
7. Project/stage summaries derive from the current desired revision and its owned work, retaining old playable/downloadable outputs with outdated/unavailable indicators as appropriate. Old revision events, attempts and live previews are scoped by work/revision identity (`runtime-store.ts`, edge events and project client).

Provider attempts retain the shared maximum of four attempts, with retry waits of 2, 8 and 30 seconds unless the classified fault supplies Retry-After. Text/TTS idle deadlines are 120 seconds; image requests use 300 seconds. Local video rendering does not use that provider deadline (`packages/app/src/kernel/runner/attempt.ts:13`).

## Branches and recovery

- **Save during work:** retain unrelated matching reservations; hold affected future dispatch. Already submitted work may still be billed and settle to its origin. Save does not implicitly start the replacement work.
- **Explicit retry/rebuild:** reuse exact completed pieces and revalidate current readiness, dependency/cost review and provided-content acknowledgements. A stale preview or base revision returns a recoverable conflict.
- **Provider failure:** common retry/backoff policy applies per physical request. Retry keeps completed pieces. A sibling failure does not erase successful independent outputs.
- **Paused/canceled project:** no new dispatch. Submitted work drains/aborts according to its operation; retained completed media remains available. Explicit reviewed resume is required for changed/missing work.
- **Restart:** hold unfinished nonqueued project work for explicit resume. Persisted queued batch entries remain queued. Accepted async jobs are retrieved without submitting replacement jobs; uncertain submissions can require explicit repeat-charge acknowledgment (`rebuild/repo.ts`, service preview/confirmations).
- **Cached complete article:** a terminal owned initial/continuation chain can finish publication locally after a disk/DB failure even when the provider is unavailable. A truncated chain requiring another continuation still needs readiness. Accepted partial article text is separately downloadable from origin History without completing Article or its dependents (`preview-retained.ts`, `runtime-article.ts`, `runtime-publication.ts`).
- **Missing retained bytes:** show unavailability and allow explicit affected rebuild. A surviving metadata sibling alone does not prove a complete reusable output bundle.
- **Publication failure:** retain the previous selected output and immutable history; discard only unreferenced new allocations. Retrying cannot silently discard completed paid work.

## State and authority

Visible stage states remain pending, running, done, failed, canceled, provided and skipped; project pause is persisted separately. Work/pieces additionally distinguish held/draining dispatch and current reservation ownership. Forbidden: treating retained history or a stage-level status as a new dispatch grant. No provider request is authorized by a download, Save or Restore.

## Invariants and evidence

- Every provider attempt and publication belongs to exact durable work/piece identity.
- Current revision ownership, not completion order, decides selection.
- Article cannot be Off or saved as an empty manual edit.
- Preserving a disabled output in history does not include it in an active export.
- Startup reconciliation retains all registered historical assets; project deletion is explicit and refused with known active work.

Composed `test/revision-{rebuild,narration,provided,restart,article-recovery,bundle-recovery}.test.ts`, actual boot `test/e2e/editable-projects.test.ts`, runner authority tests and service concurrency/recovery tests cover these contracts. Native Windows checks exercise retained WAVs, restart and real FFmpeg durations. Review checkpoints, schedules and further reliability tooling are separate pending features; this lifecycle does not claim their implementation.
