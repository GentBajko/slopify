---
generated_at_commit: 7bdb84e3f57e
capstone_version: 5.2.0
generated_date: '2026-09-13'
paths_covered:
  - :(top)packages/app/src/slices/play-drafts/**
  - :(top)packages/app/src/slices/storage/**
  - :(top)packages/app/src/slices/project-templates/**
  - :(top)packages/web/src/play/**
  - :(top)packages/web/src/routes/templates.tsx
content_hash: e09069d018ba
absorbed_from:
  - features/2026-09-10-play-redesign-drafts@2026-09-13
---

# Play drafts, uploads and explicit admission

## Trigger & preconditions

A local user edits Play, restores a saved draft, or follows the tutorial. Draft storage shares the configured SQLite/data directory. Saving incomplete setup is allowed; generation requires a separately validated review and explicit Start (`packages/app/src/slices/play-drafts/schema.ts:67`, `packages/web/src/play/use-draft-session.ts`).

## Steps

1. First edit creates a client-UUID draft. Subsequent edits use a500ms serial autosave with frozen mutation identities; navigation flushes. Persist raw text/numeric strings, hidden selections, keywords, variants, expected words, section and preview sample (`packages/web/src/play/use-draft-session.ts`, `packages/web/src/play/draft-save.ts`).
2. SQLite owns the document/version, attachment references and optional review. Browser storage remembers only the selected draft ID; no form text, credentials or media bytes are stored there. Drafts list title and last edit and survive browser storage clearing (`packages/app/src/kernel/db/migrations/0006-play-drafts.sql`, `packages/web/src/play/draft-restore.ts`, `packages/web/src/play/draft-list.tsx`).
3. Save compares base version and request identity. A matching create/fork replay succeeds only while its target remains active at version1; an advanced/consumed target returns conflict without giving stale local content newer write authority (`packages/app/src/slices/play-drafts/service.ts:155`, `packages/app/src/slices/play-drafts/service.ts:175`, `packages/app/src/slices/play-drafts/service.ts:212`).
4. Attachments belong to a specific draft/kind. Save their metadata before sending bytes. Completed referenced files survive reconciliation; interrupted/missing files require Reattach/Remove. Fork remaps attachment IDs while sharing ready staged bytes (`packages/app/src/slices/play-drafts/uploads.ts`, `packages/app/src/slices/play-drafts/service.ts:212`, `packages/app/src/slices/storage/reconcile.ts`).
5. File/operation lifetime fences prevent removed, replaced, discarded or different-draft uploads from settling into newer state. A failed prerequisite Save exposes Reattach after retry instead of pretending a copy is running (`packages/web/src/play/use-draft-uploads.ts`, `packages/web/src/lib/form-drafts.tsx`).
6. Font selection/upload keeps an owned operation marker until completion or explicit recovery. Failed/interrupted font markers remain visible when Audio or subtitles are Off; Keep current font clears that operation while preserving style. Server/client/Fix setup links focus an enabled recovery control. Late font results cannot replace the retained choice (`packages/web/src/subtitles/controls.tsx:252`, `packages/web/src/play/review-state.ts:243`, `packages/web/src/play/use-draft-uploads.ts:180`).
7. Explicit Review resolves and persists exact inputs/costs. Explicit Start claims that review, performs readiness and atomically records project(s) plus receipt; confirmed creation clears the selected draft and navigates. Unknown response recovery reuses the same identity (`packages/app/src/slices/play-drafts/review.ts:49`, `packages/app/src/slices/play-drafts/start.ts:23`).
8. Confirmed Discard names the displayed ID/version, waits for already submitted saves without flushing discarded edits, then deletes. Success or authoritative not-found clears only the matching local identity/operation. Failed/refused deletion keeps local work; a delayed result cannot clear another selection (`packages/web/src/play/use-draft-session.ts`, `packages/app/src/slices/play-drafts/service.ts:266`).

## Branches

- Reload explicitly adopts saved content. Save as a new draft preserves local edits and forks references; a refused stale fork identity is retired so the next explicit fork can recover safely.
- New draft first saves existing edits; it does not silently abandon a conflict or network failure.
- Drafts can be incomplete without being admissible. Only active generation/media choices impose admission requirements, except an owned unfinished font operation needs explicit recovery.
- One run uses ordinary scheduling; variants enter the existing batch queue. Drafts are individual editable setups, not reusable templates.
- Applying a template creates a fresh draft with copied setup and fresh attachment references. It records the template origin, resets variants and requires provided files to be reattached; Apply never starts a run (`packages/app/src/slices/project-templates/setup.ts:37`, `packages/app/src/slices/project-templates/service.ts:117`).

These rules are in `packages/web/src/play/use-draft-session.ts`, `packages/app/src/slices/play-drafts/convert.ts` and `packages/app/src/slices/play-drafts/start.ts:23`.

## Unhappy paths

Save failure displays Couldn't save and retains latest edits/frozen retry identity. CAS conflict displays Changed elsewhere with actual Reload/Save as new controls, including first-create acknowledgement loss. Corrupt/unsupported stored schema remains listed as unreadable for explicit recovery/discard; it is not silently reset. Discard conflicts preserve the current editor; retry after a lost successful DELETE can finish local cleanup. Missing media/font and incomplete uploads block applicable Start and reveal corrective controls. Late responses are ignored after ownership changes (`packages/web/src/play/draft-list.tsx`, `packages/web/src/play/use-draft-session.ts`, `packages/app/src/slices/play-drafts/service.ts:104`).

## State transitions

Client save states: unsaved → saving → saved, or error/conflict; only acknowledgement advances the saved generation. Attachment views: pending/copying/ready/reattach (copying is process-local activity). Server draft states: active/starting/started. Start receipts remain durable independently of released attachment references (`packages/web/src/play/draft-save.ts`, `packages/app/src/slices/play-drafts/model.ts`, `packages/app/src/kernel/db/migrations/0006-play-drafts.sql`).

## Invariants

No automatic expiry. No provider generation during editing/autosave/review. No silent paid replacement for missing choices. No last-writer-wins overwrite across tabs. Unchanged media may share staged bytes, but references belong to their draft. Release deletes bytes only when no current owner needs them. No fresh Start identity while a prior result remains uncertain.

## Outcomes & side effects

Durable draft/review/attachment records, retained staged files and tutorial cursor are local state. Admission creates owned project inputs and execution records before releasing draft references. Tutorial progress uses stable IDs and a versioned settings write; it reveals sections/disclosures and never starts a run (`packages/app/src/slices/settings/tutorial.ts:48`, `packages/web/src/tutorial/use-session.ts:8`, `packages/web/src/tutorial/model.ts:115`).

## Dimensions not in play

No multi-user account sharing, automatic draft expiration, storage quota enforcement or external notification. Template updates do not mutate drafts already instantiated from an older revision, and recurring schedules create fresh drafts rather than reusing one draft's state (`packages/app/src/slices/project-templates/service.ts:66`, `packages/app/src/slices/schedules/scheduler.ts:96`).
