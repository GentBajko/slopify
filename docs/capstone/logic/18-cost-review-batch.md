---
generated_at_commit: 7bdb84e3f57e
capstone_version: 5.2.0
generated_date: '2026-09-13'
content_hash: 1b77cfb1a776
paths_covered:
  - :(top)packages/app/src/slices/estimate/**
  - :(top)packages/app/src/slices/play-drafts/**
  - :(top)packages/app/src/slices/batch/**
  - :(top)packages/app/src/slices/schedules/**
  - :(top)packages/web/src/play/**
  - :(top)packages/web/src/routes/schedules.tsx
absorbed_from:
  - features/2026-09-10-play-redesign-drafts@2026-09-13
---

# Cost review and batch scheduling

## Trigger & preconditions

The user opens Play's full-page Review after configuring a durable base draft and optional title/keyword variants. There are1–50 runs including the base; expected words is1–100000 with default1500. Review itself creates no project (`packages/web/src/play/review-section.tsx:11`, `packages/app/src/slices/play-drafts/review-inputs.ts:39`).

## Steps

1. Flush pending draft edits. POST `/api/drafts/:id/review` binds the acknowledged version and resolves active supplied inputs, templates, providers, models, keywords and fonts. It persists a review UUID, input fingerprint, resolved runs and estimates after identity rechecks (`packages/app/src/edge/http/drafts.ts:50`, `packages/app/src/slices/play-drafts/review.ts:49`).
2. Existing estimate arithmetic prices research/article/entries/narration/images/thumbnail and local export/subtitles using the captured enabled catalogue. Review shows ranges, assumptions, catalogue date, known subtotal and unpriced charges; ranges are not a spending cap (`packages/app/src/slices/estimate/index.ts`, `packages/app/src/slices/estimate/requests.ts`, `packages/web/src/play/review-section.tsx:11`).
3. Editing setup/expected words or refreshing active templates/catalogue invalidates authorization. Review includes providers/models/chunking, files, subtitle choices, resolved prompts, exact edit links and a readiness summary for each required provider/model/voice. Review refreshes provider/model queries; Start repeats authoritative readiness checks (`packages/web/src/play/review-summary.tsx:147`, `packages/web/src/play/review-state.ts:151`, `packages/app/src/slices/play-drafts/start.ts:92`).
4. Explicit Start/Queue posts the review identity to the draft Start endpoint. Receipt replay precedes consumed-input validation. New admission claims the draft, performs readiness checks, rechecks input authority and commits projects and the Start receipt atomically (`packages/app/src/slices/play-drafts/start.ts:23`, `packages/app/src/slices/play-drafts/start-repo.ts:51`).
5. For multiple runs, existing batch creation copies shared supplied inputs into each project, persists queue order and initial revisions, and releases staging references only after creation. Reference-aware cleanup preserves bytes still owned by another draft (`packages/app/src/slices/batch/index.ts`, `packages/app/src/slices/storage/staging-refs.ts`).
6. The existing queue activates one batch project at a time; a paused item holds position, and completed/failed/canceled work releases the next item after draining. Per-project provider concurrency is separately bounded (`packages/app/src/slices/batch/index.ts`).

## Branches

Single Play runs keep ordinary independent scheduling; they do not enter the sequential batch queue. Recurring Schedules instantiate a fresh reviewed template-derived draft at each due occurrence; their optional spend ceiling rejects a high estimate and rejects unknown pricing only when a ceiling is configured (`packages/app/src/slices/play-drafts/start.ts:110`, `packages/app/src/slices/schedules/scheduler.ts:96`).

## Unhappy paths

Incomplete input, unavailable files/font, invalid catalogue choice or failed estimate prevents admission and produces corrective fields. An input change while font/readiness work is awaited invalidates the review/claim. A lost Start reply retains the original review identity and recovers its result. Copy/DB failures remove only uncommitted allocations; source staging is retained where still referenced. Provider execution failures use normal pipeline/queue recovery after admission (`packages/app/src/slices/play-drafts/review.ts:18`, `packages/app/src/slices/play-drafts/start.ts:23`, `packages/web/src/play/review-state.ts`).

## State transitions

Raw variants/expected words persist with the draft. Review records are version/fingerprint-bound. Explicit admission changes active → starting → started and records the result. Batch rows move queued → active → finished through the existing pump (`packages/app/src/kernel/db/migrations/0006-play-drafts.sql`, `packages/app/src/slices/batch/index.ts`).

## Invariants

Navigation/keyboard shortcuts never bypass review. A confirmed Start identity returns one recorded result. Unknown pricing is visible, not treated as zero known cost. Ordinary single-project independent work and sequential multi-project batch scheduling remain distinct.

## Outcomes & side effects

Review now persists a durable resolved snapshot. Start creates project configurations, revisions, copied media and optional queue entries; only then is execution dispatched. Local draft/review updates do not incur provider generation calls.

## Dimensions not in play

Play review does not enforce a spending cap, transfer payment, query a credit balance or send an outbound notification. Recurring schedule ceilings are separate local admission rules and do not change the Play batch queue (`packages/app/src/slices/schedules/schema.ts:13`, `packages/app/src/slices/schedules/scheduler.ts:117`).
