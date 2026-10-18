---
generated_date: '2026-10-18'
capstone_version: 5.2.0
generated_at_commit: d6a72d6428ff
paths_covered:
  - :(top)packages/web/src/styles/index.css
  - :(top)packages/web/src/components/ui/**
  - :(top)packages/web/src/components/kit/**
  - :(top)packages/web/src/components/rail.tsx
  - :(top)packages/web/src/components/lamp.tsx
  - :(top)packages/web/src/components/confirm.tsx
  - :(top)packages/web/src/components/theme.tsx
  - :(top)packages/web/src/assets/**
  - :(top)packages/web/public/**
  - :(top)packages/site/public/styles.css
  - :(top)packages/site/public/assets/**
content_hash: eb5721b4bea8
---

# 02 System

The implemented design system is defined by the web token sheet, shared UI primitives and static-site token sheet (`packages/web/src/styles/index.css:7-63`, `packages/site/public/styles.css:57-105`).

## Typography

| Role | Face | Weight | Size / line | Notes |
|---|---|---|---|---|
| Body, values, table text | Barlow | 400 / 500 | 15 px / 22 px (`--text-body`) | the type scale is `--text-display` 44, `-title-1` 30, `-title-2` 20, `-title-3` 16, `-counter` 32, `-body` 15, `-small` 13, `-label` 12, `-reading` 18, `-code` 13 (`packages/web/src/styles/index.css:54-75`) |
| Small body, hints | Barlow | 400 | 13 px / 19 px (`--text-small`) | |
| Kickers (control names, section headers, state words) | Barlow Condensed | 600 / 700 | 12 px / 16 px (`--text-label`), uppercase, `.sl-kicker` | 11 px never used for text |
| Row titles, field values emphasised | Barlow | 600 | 16 px (`--text-title-3`) | |
| Page title | Barlow Condensed | 700 | 30 px / 34 px (`--text-title-1`, `.sl-title-1`); `--text-title-2` 20 px for sheet and section titles | |
| Wordmark | Barlow | 800 | 20 px beside a 26 px mark, tracking -0.02 em | mark sits 3 px below the text baseline so the goo reads as a descender |
| Landing headline | Barlow | 800 | 32 px desktop, 24 px mobile, tracking -0.02 em | at most two lines |
| Counters (tally board) | Barlow Condensed | 700, `font-variant-numeric: tabular-nums` | 32 px / 34 px (`--text-counter`, `.sl-stat__value`) | |

Reason no listed default could satisfy: Barlow's California-signage lineage matches the control-room world and ships a condensed sibling for labels plus tabular figures, so the project needs no separate display face. Code and file paths use JetBrains Mono (`--font-mono`). Prose measure on the project page and the landing: 65-75 ch. Emphasis inside a heading is bold of the same family. No serif.

## Color

Strategy: Restrained; the accent and the lamp colours are the only chroma on any screen.

Token names are the design system's (`docs/design-system.md`), set in `packages/web/src/styles/index.css` (`@theme static`; the light values are written twice, in the media query and under `data-theme`, and `styles/tokens.test.ts` keeps them identical). The 2.x names (`bg`, `panel`, `panel2`, `line2`, `ink3` as a label colour on `panel`, `red`, `amber`, `done`, `lamp-*`, `run-text`, `accent-edge`) no longer exist.

Dark theme (default from the use scene):

| Token | Value | Use | Contrast |
|---|---|---|---|
| `--color-ground` | #121214 | page | |
| `--color-surface` | #19191c | rails, sheets, dialogs | |
| `--color-raised` | #212125 | controls, inputs, hovered rows | |
| `--color-sunken` / `--color-screen` | #0d0d0f / #08080a | wells / media and player screens | |
| `--color-line` / `--color-line-strong` | #2a2a30 / #6c6c76 | dividers / control borders | strong line 3.4:1 on surface |
| `--color-ink` | #ece9e2 | primary text | 14.5:1 on surface |
| `--color-ink-2` | #a9a69e | secondary text | 7.2:1 on surface |
| `--color-ink-3` | #8e8c84 | labels, placeholders | 5.2:1 on surface, 4.8:1 on raised |
| `--color-accent` | #a6d45c | the locked accent: Play key fill, running and done lamp, active underline, mark | 10.2:1 on surface |
| `--color-on-accent` | #15200a | text on accent fills | 9.8:1 on accent |
| `--color-accent-strong` | #86b33c | Play key base shadow (`--shadow-key`), pressed fill | |
| `--color-accent-ink` | #b6e070 | accent-coloured text | 11.6:1 on surface |
| `--color-waiting` | #e8a84c | waiting and canceled lamp and state word | 8.5:1 on surface |
| `--color-danger` | #f08073 | failed lamp, state word, error text | 6.7:1 on surface |
| `--color-info` | #86b7f2 | info lamp and callout | 8.4:1 on surface |
| `--color-focus` | accent | focus ring | |
| `*-tint` | the colour at 12% alpha | callout and lamp halos | non-text |
| `--color-speaker-1` to `-6` | six fixed hues | speaker chips | non-text |
| pending lamp | `--color-line-strong` | unlit | non-text |

Light theme (same token names):

| Token | Value | Use | Contrast |
|---|---|---|---|
| `--color-ground` | #f2f0ea | page | |
| `--color-surface` | #fbfaf6 | rails, sheets, dialogs | |
| `--color-raised` | #ffffff | controls, inputs | |
| `--color-sunken` / `--color-screen` | #e8e6df / #141416 | wells / media and player screens (stays dark) | |
| `--color-line` / `--color-line-strong` | #dcd9d0 / #827f76 | dividers / control borders | strong line 3.8:1 on surface |
| `--color-ink` | #1b1b1d | primary text | 16.5:1 on surface |
| `--color-ink-2` | #51504b | secondary text | 7.7:1 on surface |
| `--color-ink-3` | #62615b | labels, placeholders | 5.9:1 on surface |
| `--color-accent` | #4d7a1c | fills, lamps, underline, focus ring (a dark green in this theme) | 4.9:1 on surface |
| `--color-on-accent` | #ffffff | text on accent fills | 5.1:1 on accent |
| `--color-accent-strong` / `--color-accent-ink` | #3c6214 | pressed fill and key shadow / accent-coloured text | 6.8:1 on surface |
| `--color-waiting` | #8a560c | waiting and canceled | 5.9:1 on surface |
| `--color-danger` | #b3322a | failed | 5.9:1 on surface |
| `--color-info` | #1f5da3 | info | 6.4:1 on surface |
| pending lamp | `--color-line-strong` | unlit | non-text |

Rules: no pure #000 (the light theme's `--color-raised` is the one #fff surface); lamps are always paired with the state word; floors 4.5:1 body and placeholder, 3:1 large text and UI indicators, on both themes. Semantic states standardised once: hover = `--color-raised` lift; focus = 2 px `--color-focus` outline with 2 px offset (`packages/web/src/styles/index.css:257-258`); selected = the accent underline or tinted row; disabled = reduced opacity with a stated reason; error = `--color-danger` border plus message below; warning = `--color-waiting`; success = `--color-accent`; info = `--color-info`.

Theme switching: `prefers-color-scheme` by default, overridden by the Settings control (System / Dark / Light), persisted locally.

## Spacing and shape

- 8 px grid (`--space-1` 4 px to `--space-8` 64 px, `packages/web/src/styles/index.css:93-105`); rail padding 14 px 16 px; sheet padding 18 px; gap between rails 0 (they share borders), between sheet fields 14 px.
- Frame: a 232 px left rail (`--rail-width`), a fluid page centred beyond `--content-max` (1680 px), and on phones a top bar and a bottom bar (`packages/web/src/styles/index.css:106-109`, `packages/web/src/styles/shell.css:512-589`). With the Assistant panel open the page narrows beside it. A `PageHeader` carries each page title; status slots reserve 32 px; action bars are at least 56 px.
- Radius lock: three tokens, `--radius-control` 6 px (controls, inputs, rails, sheets, dialogs, popovers, toasts and the Play key), `--radius-media` 10 px (media frames and tiles) and `--radius-pill` 999 px (chips and badges only); nothing else (`packages/web/src/styles/index.css:78-80`).
- Lists are kit List/ListRow rows divided by hairlines, never a card inside a card. Elevation uses `--shadow-pop` (popovers, toasts and the drawer) and `--shadow-dialog` (dialogs), plus `--shadow-key` for the Play key; sticky action bars sit on the page background without a shadow.
- Sticky layers: header at the top (z 40), action bars at the viewport bottom (z 20, safe-area padded), the drawer fixed under the header on the right (z 30), toasts top-right under the header (z 60).
- More space above a section header (24 px) than below it (10 px).

## Iconography

Lucide, 24 px grid, 2 px stroke, round caps and joins, one weight everywhere. The six stage glyphs in `packages/web/src/assets/stage-*.svg` follow the same grid and stroke so they sit in Lucide rows unnoticed; they carry no drip. Brand assets: `packages/web/src/components/logo.tsx` (evenodd, `currentColor`; the former `assets/logo-mark.svg` is gone), `packages/web/public/favicon.svg`, `packages/web/public/app-icon.svg`. No emoji, no hand-rolled decorative SVG.

## Motion

- Operate transitions 150-250 ms, ease-out, state-conveying only: switch marker slide, dialog fade and 4 px rise, drawer and toast `tick-in` (150 ms), tab underline colour, row expand, 2 px stage meter and Run bar fill (200 ms transform).
- The one authored moment: the running lamp's pulse, 1.2 s ease-in-out halo, and the Play key's 3 px press. Nothing else animates on its own.
- Skeletons fade in after 1 s and match the final layout's shape.
- `prefers-reduced-motion`: the pulse becomes a steady lamp, the press becomes an instant colour change, fades become cuts.
- Implementation floor: transform and opacity only; no scroll listeners.

## Component library

Since 3.0 the token names, the `sl-*` component classes and the kit components are those of `docs/design-system.md`, and `ui/button.tsx` is gone in favour of `kit/button`. Read this chapter for the intent and that document for the current names.

shadcn/ui restyled to the tokens above, never in default state, on Radix primitives (`packages/web/src/components/ui/`): Dialog for every confirmation, Select for pickers, Toggle Group for segmented switches and kind filters, Dropdown Menu for row and page overflow menus, Popover (`packages/web/src/components/ui/popover.tsx`, `--color-surface`, `--radius-control`, portalled) for help text, located folder paths, error details, the drafts list and the batch queue. `stack` records the exact packages and versions. The control-room aesthetic has no official package; it is built with plain CSS on top of those primitives and labelled as such.

The layout kit (`packages/web/src/components/kit/`) is what every screen composes from:

| Component | File | Contract |
|---|---|---|
| PageHeader | `kit/layout.tsx:10` | Crumb, title, one meta line and the page's actions; `display` for the Home greeting, `row` for a one-line working header. Replaced the removed `PageBar`. |
| Callout | `kit/callout.tsx` | A notice in the flow of a section (info, waiting, danger) with title, body and actions; named by its title through `aria-labelledby`. Replaced the removed `EditorNotice`. |
| StatusSlot | `kit/action-bar.tsx` | Always rendered, fixed 32 px line; `role="status"`, or `alert` when the tone is error; long text truncated with the full text in `title`, unless `wrap` shows every word (a price or refusal to read in full). |
| ActionBar | `kit/action-bar.tsx` | Sticky bar at the viewport bottom: a StatusSlot at left, the page's primary actions at right; placed straight in a short page it sits at the window's bottom edge. |
| Drawer | `kit/drawer.tsx` | Non-modal right panel (560 px wide, 440 px narrow, full width on phones) under the header; `role="dialog"`, `aria-modal="false"`; Escape closes unless a modal dialog is open; focus goes to the title unless the caller already focused inside, and returns to the opener; optional pinned footer. Non-modal so the tutorial spotlight keeps working. |
| Tabs, TabLinks, TabPanel | `kit/tabs.tsx` | Tab row with a 2 px running-lamp underline, arrow-key movement, badges ("· unsaved", "· 2 held") and a trailing slot; TabLinks is the same bar for route tabs; panels stay mounted while hidden. |
| InfoTip | `kit/info-tip.tsx` | Info glyph button ("About {label}") opening a popover on press, never on hover. |
| Toast | `kit/toast.tsx` | `ToastProvider` in `packages/web/src/app-context.tsx`; top-right stack of at most three, 4 s, dismissible; `status`, or `alert` for errors. |
| SplitButton | `kit/split-button.tsx` | Primary action plus a chevron menu of related actions; menu items disable rather than disappear. |
| SectionHead | `kit/section-head.tsx` | Section title, optional InfoTip and right-aligned section actions on one row. |

## Implementation constraints

The build-time checklist from capstone's design method, binding on `build`:

- Every interactive component implements default, hover, focus, active, disabled, loading, error.
- Skeletal loading matching layout shape; empty states teach; errors name the problem and the recovery, inline where the user acts or in the reserved status slot beside the action.
- Contrast verified 4.5:1 / 3:1 on both shipped themes, buttons and form fields included (no white-on-white CTAs, no grey-on-coloured secondary text).
- One radius system, one icon family and stroke weight, one accent, as locked above.
- Animation on transform/opacity only; no scroll listeners; reduced motion collapses every effect; motion isolated in leaf components with cleanup.
- Overlays escape their containers (dialogs, selects, menus and popovers render in a portal).
- Real images only: the landing screenshot is a capture of the built Play screen; no div-fake screenshots, no hand-rolled icons, no emoji-as-icons.
- Interface copy: zero em-dashes, controls name their action, no AI-tell labels, no placeholder-as-label on inputs, labels above inputs, error text below.
- CTAs: one label per intent across the page; no wrapped button labels at desktop.
- `prefers-reduced-motion` and keyboard focus honoured; focus states visible on every interactive element.

Project-specific additions:

- Lamps never convey state alone; the state word is always rendered beside them.
- Accent-coloured text is `--color-accent-ink` on both themes; text on an accent fill is `--color-on-accent`.
- Stage glyphs come from `packages/web/src/assets/` verbatim; they are not redrawn.
- The wordmark is live text in Barlow 800 beside the mark, never a rasterised lockup.

## Binding visual reference

The rendered ten-screen reference the user supplied on 2026-09-03 ("this is exactly how the page has to look like") governed every screen step and was removed with the rest of `assets/` once they were built. Its palette and its state styling live on as `packages/web/src/styles/index.css`'s `@theme` tokens and `[data-theme]` blocks, which were measured against it; git history holds the file.

One amendment the user made at the same time and which still stands: the marketing page's hero is a **video** of a real run, not the still the reference drew.

## Assets

| Asset | File | Source | Status |
|---|---|---|---|
| App logo mark | `packages/web/src/components/logo.tsx` (inline SVG; `assets/logo-mark.svg` removed in 4.0) | repository | present |
| App favicon | `packages/web/public/favicon.svg` | repository | present |
| App icon | `packages/web/public/app-icon.svg` | repository | present |
| Stage glyphs | `packages/web/src/assets/stage-*.svg` | repository | present |
| Site logo mark | `packages/site/public/assets/logo-mark.svg` | repository | present |
| Site favicon | `packages/site/public/assets/favicon.svg` | repository | present |
| Social preview | `packages/site/public/assets/og.png` | repository | present |
| Showcase poster | `packages/site/public/assets/play-run-poster.jpg` | repository | present |
| Showcase recording | `packages/site/public/assets/play-run.mp4` | repository | present |
