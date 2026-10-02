---
generated_at_commit: e9226a34aa8a
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: f889c39e3382
paths_covered:
  - ":(top)packages/web/src/routes/usage.tsx"
  - ":(top)packages/web/src/routes/settings.tsx"
  - ":(top)packages/web/src/components/kit/board.tsx"
  - ":(top)packages/web/src/components/kit/stats.tsx"
  - ":(top)packages/web/src/router.tsx"
---

# Usage

## Mode & job

Read surface for this install's own totals: videos, audio hours, images, tokens and projects, plus tokens by stage and provider/model. It is the Usage section of Settings at `/settings?section=usage`; the old `/usage` address redirects there (`packages/web/src/routes/settings.tsx:155`, `:311`, `packages/web/src/router.tsx:407`). All numbers come from `GET /api/usage` via `usageQuery`, computed from the local event log without contacting the collector, so the section reads the same offline (`packages/web/src/routes/usage.tsx:9`, `packages/web/src/queries.ts:97`).

## Composition

- Settings frame (see `08-settings.md`): `PageHeader` crumb "Settings", title "Usage", meta "This machine only. The same counters, anonymised, feed slopify.stream." (`packages/web/src/routes/settings.tsx:155`, `:250`). The section adds no `SectionHead` of its own.
- `UsageBoard` renders a `flex-col gap-8` column: the error line (if any), then the numbers (`packages/web/src/routes/usage.tsx:18`).
- `Numbers`: kit `Board split="even"`, two equal columns, stacked below 1024 px (`packages/web/src/routes/usage.tsx:57`, `packages/web/src/styles/shell.css:872`, `:882`).
  - Left `BoardColumn`: kit `Stats` of five `Stat` tiles in this order: Videos made, Hours of audio (seconds ÷ 3600, one decimal), Images made, Tokens used (whole below a million, compact notation above), Projects (`packages/web/src/routes/usage.tsx:60`, `:104`). Under them the small ink-3 line "Machine ID <id> · Slopify <version>" ("not made yet" when no id exists) (`packages/web/src/routes/usage.tsx:69`).
  - Right `BoardColumn`: kit `DataTable` captioned (screen-reader only) "Tokens by stage", min width 480 px inside a sideways scroller, columns Stage, Provider · model, Tokens in (numeric), Tokens out (numeric); one row per stage/provider/model (`packages/web/src/routes/usage.tsx:44`, `:75`, `packages/web/src/components/kit/stats.tsx:95`). The model cell is "<provider> · <model>", or the provider alone when no model was reported (`packages/web/src/routes/usage.tsx:92`).

## States

| State | Trigger | Rendering | Source |
|---|---|---|---|
| Loading | query without data and no error | `StatsSkeleton` (five tiles of two sunken bars) and `TableSkeleton` (four ruled rows of four bars) | `packages/web/src/routes/usage.tsx:30`, `:121`, `:134` |
| Error | query error | `role="alert"` danger paragraph with the message; no skeleton or numbers | `packages/web/src/routes/usage.tsx:24` |
| Fresh install | every counter is 0 | tiles show 0 and the line "Numbers appear after your first run." | `packages/web/src/routes/usage.tsx:55`, `:65` |
| No stage rows | `byStage` empty | table body shows "No stages have run yet." | `packages/web/src/routes/usage.tsx:81` |
| Loaded | data present | tiles and table filled; numbers use locale grouping; numeric columns carry the table's `num` class | `packages/web/src/routes/usage.tsx:96` |

## Motion

None: no transitions or animation in the section (`packages/web/src/routes/usage.tsx`).

## Copy

Counter labels are the public counters' own: "Videos made", "Hours of audio", "Images made", "Tokens used", "Projects" (`packages/web/src/routes/usage.tsx:100`). Table headers "Stage", "Provider · model", "Tokens in", "Tokens out"; stage names come from `stageNames` (`packages/web/src/routes/usage.tsx:44`, `packages/web/src/project/summary.ts`). Teaching copy: "Numbers appear after your first run." and "No stages have run yet." (`packages/web/src/routes/usage.tsx:66`, `:81`).

## Not in play

- No date range, filter, export or reset control; the section is read-only (`packages/web/src/routes/usage.tsx:18`).
- No cost or price figures; only counts and tokens (`packages/web/src/routes/usage.tsx:104`).
- No per-model breakdown is sent to the public counters; the provider/model attribution is local to this table (`packages/web/src/routes/usage.tsx:13`).
- No offline or permission-denied state; the data is local (`packages/web/src/routes/usage.tsx:9`).
