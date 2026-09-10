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

# Cost review and batch scheduling

## Trigger & preconditions

- Trigger: the Play planner requests an estimate or confirms a reviewed batch with a UUID.
- Preconditions: draft validation, provider/model catalogue, expected word count, and optional item substitutions are available (`packages/app/src/edge/http/planning.ts:15-55`).

## Steps

1. `POST /api/projects/estimate` prepares each draft, returns validation fields on failure, and otherwise calls `estimateRun` (`packages/app/src/edge/http/planning.ts:60-75`).
2. The estimate reports USD low/high totals, unknown-row count, catalogue date, and assumptions (`packages/app/src/slices/estimate/index.ts:5-20,124-137`). LLM estimates use character/token assumptions; TTS uses character or minute pricing; image work uses per-image pricing (`packages/app/src/slices/estimate/index.ts:54-123`).
3. Confirmation sends a UUID. The batch endpoint returns the existing queue for a duplicate UUID (`packages/app/src/edge/http/planning.ts:77-80`).
4. Font and all fields are revalidated before `enqueueBatch`; projects and queue rows are created in one transaction (`packages/app/src/edge/http/planning.ts:81-108`; `packages/app/src/slices/batch/index.ts:38-68`).
5. The queue marks one project active and calls the runner; finished, failed, canceled and paused entries control advancement (`packages/app/src/slices/batch/index.ts:70-90`).

## Branches

- One draft creates one queue item; `items` creates up to 50 prepared drafts (`packages/app/src/edge/http/planning.ts:15-29,33-55`).
- Unknown pricing produces an unknown estimate row; it is not counted as zero (`packages/app/src/slices/estimate/index.ts:47-62,129-136`).
- Duplicate request UUID is idempotent and returns persisted queue state (`packages/app/src/edge/http/planning.ts:77-80`).

## Unhappy paths

- Invalid fields or unavailable active font return 400 before project creation (`packages/app/src/edge/http/planning.ts:81-101`).
- Transaction failure leaves no partial batch rows; staging cleanup occurs after commit (`packages/app/src/slices/batch/index.ts:45-68`).
- A failed or canceled queue item is finished and the next item can advance; a paused item holds its place (`packages/app/src/slices/batch/index.ts:70-90`).

## State transitions

`absent request → estimate`; `confirmed UUID → batches/project_queue`; queue `queued → active → finished`. Project stages use the existing runner states.

## Invariants

- A UUID creates at most one batch.
- No provider call starts before confirmation and successful transactional creation.
- Queue execution is sequential; provider calls remain globally capped by the provider queue.

## Outcomes & side effects

Estimate is read-only. Confirmation writes batch/projects/queue rows and consumes staged provided-file metadata; runner execution writes ordinary stage outputs.

## Dimensions not in play

- No payment or credit transfer occurs; provider billing remains external.
- No notification channel is created; queue state is returned and exposed through the API.

Descriptive scope: D2/D3 eligibility and input, D4 computation, D6 limits, D7 deadlines, D8 concurrency, D9 lifecycle, D10 recovery, D11 termination, D12 visibility, D14 related records, D15 persistence and D16 invariants are covered above and by the cited implementations. D1 has no multi-user authorization model: the app binds loopback by default. D5 does not implement billing or refunds; the estimate only approximates external provider charges. D13 has no outbound notification channel; failures/status are local UI/API responses. No separate durable audit of estimate views, catalogue edits, or queue-position changes is implemented.
