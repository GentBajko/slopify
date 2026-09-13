---
absorbed_from:
  - features/2026-09-09-pausable-optional-runs@2026-09-10
  - features/2026-09-10-subtitles-fonts@2026-09-10
  - features/2026-09-10-play-redesign-drafts@2026-09-13
  - features/2026-09-10-review-checkpoints@2026-09-13
scenario: run-admission
mockup_row: S2
screens:
  - 06-play
  - 08-project
depends_on:
  - 01-pipeline-lifecycle
  - 02-provider-credentials
  - 03-placeholder-substitution
generated_date: '2026-09-13'
generated_at_commit: 7bdb84e3f57e
capstone_version: 5.2.0
paths_covered:
  - :(top)packages/app/src/slices/play-drafts/**
  - :(top)packages/app/src/slices/admission/**
  - :(top)packages/web/src/play/**
  - :(top)packages/web/src/routes/play.tsx
content_hash: 7c9779e384e7
---

# 04 Run admission

Play saves an editable setup before it creates any project. Review resolves that exact saved setup and optional dependency gates; Start explicitly admits one run or a batch. Existing-project Save/Rebuild is a separate workflow.

## Trigger & preconditions

The local user opens Play and moves freely through Content, Outputs, Style and Review. Opening, editing, autosaving and reviewing do not start generation. Start requires an acknowledged draft, valid current review and ready active inputs (`packages/web/src/routes/play.tsx:36`, `packages/web/src/play/review-state.ts:152`, `packages/app/src/slices/play-drafts/start.ts:23`).

## Steps

1. Defaults remain Article/Audio/Images/Video Generate; Research/Thumbnail Off; 16:9; empty title, keywords and generation selections; intro/outro Off; subtitles Off, English, default font and size48. Expected words defaults1500. Incomplete raw values can be saved (`packages/app/src/slices/play-drafts/schema.ts:16`, `packages/app/src/slices/play-drafts/schema.ts:67`).
2. Content owns title, article prompt or supplied text, shared keyword values, text provider/model/thinking and optional Research. Providing Article normalizes Research Off. Text generation remains required for active LLM thumbnail/entry work even with a supplied article (`packages/web/src/play/content-section.tsx:16`, `packages/app/src/slices/play-drafts/convert.ts`).
3. Outputs select generated/provided/off media and applicable providers. Article cannot be Off. Images Off normalizes Video Off; Audio Off permits silent MP4; Video Off with Audio enabled produces combined WAV; both off retain individual outputs. Inactive generation selections and supplied media do not impose active admission requirements (`packages/app/src/slices/play-drafts/convert.ts`, `packages/app/src/slices/admission/rules.ts`).
4. Active validation retains title1–200, keyword values≤200, integer image counts1–20 per prompt and total≤60, expected words1–100000, at most50 runs, and active subtitle font/size16–120 validation. Fonts and media must be available. A retained font upload needs explicit completion/recovery even when captions are turned off (`packages/app/src/slices/play-drafts/review-inputs.ts:39`, `packages/web/src/subtitles/controls.tsx:252`).
5. Review refreshes provider and model choices, flushes the draft, resolves current template bodies/keywords, calculates catalogue estimates and stores a UUID-bound review. Its Run readiness summary classifies the active LLM, TTS and image requirements and links failed checks back to the field; Start repeats readiness against the catalogue snapshot (`packages/web/src/play/review-state.ts:151`, `packages/web/src/play/review-summary.tsx:147`, `packages/app/src/slices/play-drafts/start.ts:82`).
6. Start posts draft ID, base version and review ID. The server replays a committed receipt first; otherwise it claims the reviewed draft, checks provider and local readiness, and commits project(s), checkpoint set and receipt transactionally. Supplied bytes are copied before draft references are released (`packages/app/src/slices/play-drafts/start.ts:32`, `packages/app/src/slices/play-drafts/start.ts:92`, `packages/app/src/slices/play-drafts/start.ts:115`).
7. Confirmed creation clears the active draft selection and opens the created project. A transport-uncertain Start retains the same identity for recovery; it never offers a fresh chargeable submission first (`packages/web/src/play/review-state.ts`, `packages/web/src/play/use-draft-session.ts`).

## Branches

- Selected Audio, Images and Video/export checkpoints are persisted with the reviewed Start identity. They hold only that closure until explicit project-page approval; independent work can continue.

- One resolved run uses ordinary independent project scheduling. More than one enters the existing sequential batch queue; this does not serialize the independent stages of a single run.
- Generated thumbnail/LLM entries can require providers even when the corresponding main article/images sources are supplied or off.
- Review errors reveal their section/disclosure and focus the correcting control. Untouched fresh fields do not start covered in errors.
- A saved unavailable option stays visible until explicitly cleared or replaced; no paid provider/model/voice is silently substituted.

These branches are implemented in `packages/web/src/routes/play.tsx:36`, `packages/web/src/play/field-targets.ts`, `packages/web/src/play/pickers.tsx` and `packages/app/src/slices/play-drafts/start.ts:23`.

## Unhappy paths

Invalid/missing active input returns typed field errors and creates no project. Stale review or failed readiness keeps the setup for correction. Lost Start acknowledgement recovers the original receipt. Save conflicts retain local edits with Reload/Save as new; confirmed Discard uses its exact displayed version. Disk/copy failures clean uncommitted allocations without treating an uncertain committed Start as a new submission (`packages/app/src/slices/play-drafts/start.ts:23`, `packages/web/src/play/review-state.ts`, `packages/web/src/play/use-draft-session.ts`).

## State transitions

Draft state is active → starting → started. Review exists only for an exact saved version/input identity. A committed Start receipt survives release of draft attachments and is replayed before readiness/consumed-file checks (`packages/app/src/kernel/db/migrations/0006-play-drafts.sql`, `packages/app/src/slices/play-drafts/start-repo.ts:51`).

## Invariants

Saving/reviewing does not dispatch providers. Article is required. An MP4 needs images; combined WAV needs audio. One reviewed Start identity yields its original result rather than duplicate projects. This is local admission idempotency, not an exactly-once billing guarantee for external providers.

## Outcomes & side effects

Drafts and reviews are durable SQLite records. Explicit Start creates project/revision records and owned media, then wakes ordinary execution. Failed editing/review retains the draft. See [draft lifetime and recovery](22-play-drafts.md) and [cost/batch behavior](18-cost-review-batch.md).

## Dimensions not in play

Play does not edit an existing project or choose a recurring clock. Multiple tabs are writers protected by CAS; recurring admission is configured separately from an immutable template revision on Schedules (`packages/app/src/slices/play-drafts/schema.ts:90`, `packages/app/src/slices/schedules/schema.ts:13`).
