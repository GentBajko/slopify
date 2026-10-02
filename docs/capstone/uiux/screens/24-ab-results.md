---
generated_at_commit: e9226a34aa8a
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: f50ef69144cd
paths_covered:
  - ":(top)packages/web/src/routes/ab-results.tsx"
  - ":(top)packages/web/src/routes/library.tsx"
  - ":(top)packages/web/src/router.tsx"
  - ":(top)packages/app/src/slices/studio/stats.ts"
---

# A/B results

## Mode & job
Operate surface at `/ab-results`, the Library's "A/B results" tab: every finished YouTube A/B test the Slopify Studio extension read from Studio, one block per test with the winner first, and one button that copies them as notes to paste into the Library prompts that write titles and thumbnails; nothing on the page changes a prompt (`packages/web/src/routes/ab-results.tsx:10-13`, `packages/web/src/routes/library.tsx:14-21`).

- The route is a child of the pathless Library layout, so it renders under the "Library" `PageHeader` and the `TabLinks` row (`packages/web/src/router.tsx:311-315`, `packages/web/src/router.tsx:621`, `packages/web/src/routes/library.tsx:23-35`).
- The rail's Library item does not list `/ab-results` among its matches, so no rail item is lit on this tab (`packages/web/src/components/shell.tsx:103-117`, `packages/web/src/components/shell.tsx:143-147`).
- No Ctrl+K command opens this tab; the Library commands open prompts, intros and outros, templates and document themes only (`packages/web/src/routes/library.tsx:39-109`).
- Data: `GET /api/studio/ab-results`, newest read first, each row joined to its project's title (`packages/web/src/api.ts:571-578`, `packages/app/src/slices/studio/stats.ts:107-131`). The extension writes a result during its daily Analytics sweep, on the long video's Details page (`packages/extension/src/content.ts:384-407`). A/B tests are started from a project's On YouTube rows or the extension popup (03-project, 23-studio-upload).

## Composition
| Region | What renders | Kit / tokens |
|---|---|---|
| Toolbar | A `flex-1` `text-small text-ink-2` line "Finished A/B tests, as the Slopify Studio extension read them from YouTube Studio once a day. The winner is listed first." beside a secondary "Copy as prompt notes" button with a copy icon, disabled while the list is empty (`packages/web/src/routes/ab-results.tsx:51-74`) | `Button` |
| Results | `ul` of one `li` per result (keyed by project and short): the project title in `sl-row__title`, then an `ol` of its variants sorted by watch-time share, highest first. Each variant is its title, else `Thumbnail <A/B/C>`, else `Variant <n>`; then ` · <n>% of watch time` when known; the first adds ` · winner` and renders in `text-ink`, the rest in `text-ink-2` (`packages/web/src/routes/ab-results.tsx:17-22`, `packages/web/src/routes/ab-results.tsx:83-107`) | plain list markup, `text-small`; no `List`/`ListRow` |

The copied notes are plain text: a heading line "What won YouTube's A/B tests on this channel (share of watch time):", one `- <project>: "<winner>" won (<n>% of watch time) over "<other>" (<n>%), ….` line per result, a blank line, and "Write new titles and thumbnails closer to the winners than to the losers." (`packages/web/src/routes/ab-results.tsx:24-39`). The winner is the variant with the highest share; the stored `winner` flag is not read here (`packages/web/src/routes/ab-results.tsx:26`, `packages/app/src/slices/studio/stats.ts:21-28`).

## States
| State | Trigger | Rendered |
|---|---|---|
| Loading | query pending | `text-small text-ink-3` "Loading…" (`packages/web/src/routes/ab-results.tsx:75-76`) |
| Empty | no results | "No finished A/B tests yet. Start one from a project's Video section (On YouTube → A/B test) or the extension; its result shows here once Studio has one."; Copy as prompt notes disabled (`packages/web/src/routes/ab-results.tsx:77-81`, `packages/web/src/routes/ab-results.tsx:59`) |
| Load error | query fails | not rendered separately: the list is treated as empty and the Empty text shows (`packages/web/src/routes/ab-results.tsx:48`, `packages/web/src/routes/ab-results.tsx:75-81`) |
| Copied | clipboard write resolves | success toast "Copied the notes. Paste them into the prompt that writes titles." (`packages/web/src/routes/ab-results.tsx:61-66`) |
| Copy refused | clipboard write rejects | error toast "Couldn't copy the notes. Select them and copy by hand." (`packages/web/src/routes/ab-results.tsx:67`) |
| No Clipboard API | `navigator.clipboard` undefined | nothing happens and no toast shows (`packages/web/src/routes/ab-results.tsx:61`) |
| Unreadable row | stored variants fail the schema | the row is left out (`packages/app/src/slices/studio/stats.ts:117-118`) |

## Motion
- None authored on this page; toasts enter with the shared `sl-enter` (`packages/web/src/components/kit/toast.tsx:91`).

## Copy
- Labels: "A/B results" (tab), "Copy as prompt notes", "winner", "% of watch time", "Thumbnail A/B/C", "Variant n" (`packages/web/src/routes/library.tsx:20`, `packages/web/src/routes/ab-results.tsx:17-22`, `packages/web/src/routes/ab-results.tsx:72`, `packages/web/src/routes/ab-results.tsx:99-100`).
- The empty text names where a test starts ("a project's Video section (On YouTube → A/B test) or the extension") (`packages/web/src/routes/ab-results.tsx:79-80`).

## Not in play
- Starting, stopping or editing an A/B test here: absent; the page only lists read results (`packages/web/src/routes/ab-results.tsx:41-111`).
- Links from a result to its project or to Studio: absent; the project title is plain text (`packages/web/src/routes/ab-results.tsx:91`).
- Channel filtering: absent; every project's results show regardless of the rail's channel (`packages/app/src/slices/studio/stats.ts:107-114`).
- Read date, impressions and per-variant CTR: not shown, though `readAt` is stored (`packages/app/src/slices/studio/stats.ts:31-37`).
- Pagination, sorting controls and search: absent.
- Automatic prompt edits: absent; notes go to the clipboard only (`packages/web/src/routes/ab-results.tsx:10-13`).
