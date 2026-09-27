## 2026-09-27 - refactor: one theme, one grid, no card inside a card
key: refactor/one-theme-one-grid

- Every use of the 2.x token names (`bg-panel`, `text-ink2`, `text-red`, `rounded-panel`, `--color-shadow`, ...) now uses the 3.0 tokens, and the aliases are gone from `styles/index.css`; `styles/tokens.test.ts` fails if one is defined again.
- slopify.stream's `:root` tokens are checked against the app's: `packages/site/tokens.test.js` fails when a shared value differs, dark or light. The app's mono stack gained the site's fallbacks so both match.
- Hand-set pixel spacing outside the kit is snapped to the 4px grid, and `styles/grid.test.ts` rejects `p-[Npx]`, `gap-[Npx]` and friends outside `components/kit`.
- No card inside a card: the old `components/rail.tsx` (RailGroup) and the unused `components/tally.tsx` are deleted; their lists are kit List rows, and the batch queue, Play's Start panel, live writing and live narration, the Library editors and the font picker sit on the page with hairlines and space. The aliases load error is a kit Callout.
- Wider screens use the width: Welcome in two columns with PageHeader, Channels beside a summary of the picked channel, Projects beside counts per state and the video queue, template keywords beside the template list, aliases beside how they are used, and Usage in two columns.
