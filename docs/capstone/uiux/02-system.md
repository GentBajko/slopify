---
generated_date: 2026-09-02
capstone_version: 5.2.0
implements: [Q5, Q7, Q8, Q9, Q15, Q16, Q17, Q19]
source: uiux-interview.md
---

# 02 System

What `stack` and `build` consume. Every value below is locked unless a screen chapter cites an exception, and none does.

## Typography (§Q15)

| Role | Face | Weight | Size / line | Notes |
|---|---|---|---|---|
| Body, values, table text | Barlow | 400 / 500 | 14 px / 1.45 | fixed rem scale, ratio 1.2 |
| Small body, hints | Barlow | 400 | 13 px / 1.45 | |
| Engraved labels (control names, section headers, state words) | Barlow Condensed | 600 / 700 | 12 px, tracking 0.09 em, uppercase | 11 px never used for text |
| Row titles, field values emphasised | Barlow | 600 | 14-16 px | |
| Page title | Barlow | 700 | 18 px, tracking -0.01 em | |
| Wordmark | Barlow | 800 | 20 px beside a 26 px mark, tracking -0.02 em | mark sits 3 px below the text baseline so the goo reads as a descender |
| Landing headline | Barlow | 800 | 32 px desktop, 24 px mobile, tracking -0.02 em | at most two lines |
| Counters (tally board) | Barlow | 700, `font-variant-numeric: tabular-nums` | 32 px | |

Reason no listed default could satisfy: Barlow's California-signage lineage matches the control-room world and ships a condensed sibling for labels plus tabular figures, so the project needs neither a display face nor a monospace. Prose measure on the project page and the landing: 65-75 ch. Emphasis inside a heading is bold of the same family. No serif, no monospace (§Q15).

## Color (§Q7, §Q17, §Q19)

Strategy: Restrained; the accent and the lamp colours are the only chroma on any screen.

Dark theme (default from the use scene):

| Token | Value | Use | Contrast |
|---|---|---|---|
| `--bg` | #141416 | page | |
| `--panel` | #1B1B1F | rails, sheets, dialogs | |
| `--panel2` | #202026 | controls, inputs | |
| `--line` / `--line2` | #2A2A30 / #35353D | dividers / control borders | |
| `--ink` | #E6E3DC | primary text | 13.4:1 on panel |
| `--ink2` | #9A978F | secondary text | 5.9:1 on panel |
| `--ink3` | #8A887F | labels, placeholders | 4.8:1 on panel, 4.6:1 on controls |
| `--accent` | #9BCB4F | the locked accent: Play key fill, running lamp, active underline, focus ring, mark | 9.0:1 on panel as text |
| `--accent-ink` | #17200B | text on accent fills | 8.9:1 on accent |
| `--accent-edge` | #6D9333 | Play key base shadow | |
| `--done` | #6F9A3A | done lamp and state word | 4.9:1 on controls |
| `--red` | #E86960 | failed lamp, state word, error text | 5.1:1 on controls |
| `--amber` | #E2A247 | canceled lamp and state word | 7.3:1 on controls |
| pending lamp | #2C2C33 with a #3A3A42 ring | unlit | non-text |

Light theme:

| Token | Value | Use | Contrast |
|---|---|---|---|
| `--bg` | #F4F2EC | page | |
| `--panel` | #FBFAF7 | rails, sheets, dialogs | |
| `--panel2` | #ECEAE3 | controls, inputs | |
| `--line` / `--line2` | #DAD8D0 / #C9C7BE | dividers / control borders | |
| `--ink` | #1C1C1E | primary text | 16.3:1 on panel |
| `--ink2` | #5C5B56 | secondary text | 6.5:1 on panel |
| `--ink3` | #6B6A64 | labels, placeholders | 5.2:1 on panel, 4.5:1 on controls |
| `--accent` | #9BCB4F | fills only: Play key, mark; never text | fill with `--accent-ink` 8.9:1 |
| `--lamp-run` / `--focus` | #5F8A2B | running lamp, active underline, focus ring, segmented-switch marker | 3.4:1 on controls (non-text floor 3:1) |
| `--run-text` | #3F6B1C | RUNNING state word | 5.2:1 on controls |
| `--done` | #55673F | done lamp and state word | 5.1:1 on controls (measured in build S22; the 4.7 this row claimed understated it) |
| `--red` | #B8332C | failed | 4.9:1 on controls |
| `--amber` | #8F5E12 | canceled | 4.6:1 on controls |
| pending lamp | #DEDCD4 with a #C9C7BE ring | unlit | non-text |

Rules: no pure #000 or #FFF; secondary text on the accent fill is tinted from the hue, never grey; lamps are always paired with the state word (§Q18); floors 4.5:1 body and placeholder, 3:1 large text and UI indicators, on both themes. Semantic states standardised once: hover = `--panel2` lift plus `--line2` border; focus = 2 px `--focus` ring with 2 px offset; selected = `--panel2` with a 2 px inset bottom line in `--lamp-run`; disabled = 45% opacity, no pointer; error = `--red` border plus message below; warning = `--amber`; success = `--done`; info = `--ink2`.

Theme switching (§Q19): `prefers-color-scheme` by default, overridden by the Settings control (System / Dark / Light), persisted locally.

## Spacing and shape (§Q17)

- 4 px base grid; rail padding 14 px 16 px; sheet padding 18 px; gap between rails 0 (they share borders), between sheet fields 14 px.
- Radius lock: 4 px on controls and inputs, 6 px on rails, sheets, dialogs, and the Play key; nothing else. No pill shapes.
- Rails are bordered rows sharing edges, not cards; elevation is used only by dialogs (shadow 0 8px 24px tinted toward the page hue, 24% alpha dark / 12% light).
- More space above a section header (24 px) than below it (10 px).

## Iconography (§Q5, §Q9)

Lucide, 24 px grid, 2 px stroke, round caps and joins, one weight everywhere. The six stage glyphs in `assets/stage-*.svg` follow the same grid and stroke so they sit in Lucide rows unnoticed; they carry no drip. Brand assets: `assets/logo-mark.svg` (evenodd, `currentColor`), `assets/favicon.svg`, `assets/app-icon.svg`. No emoji, no hand-rolled decorative SVG.

## Motion (§Q17, §Q18)

- Operate transitions 150-250 ms, ease-out, state-conveying only: switch marker slide, dialog fade and 4 px rise, row expand.
- The one authored moment: the running lamp's pulse, 1.2 s ease-in-out halo, and the Play key's 3 px press. Nothing else animates on its own.
- Skeletons fade in after 1 s and match the final layout's shape.
- `prefers-reduced-motion`: the pulse becomes a steady lamp, the press becomes an instant colour change, fades become cuts.
- Implementation floor: transform and opacity only; no scroll listeners.

## Component library (§Q16)

shadcn/ui restyled to the tokens above, never in default state, on Radix primitives: Dialog for every confirmation, Select for pickers, Toggle Group for segmented switches, Checkbox for prompt ticks, Tabs for kind tabs, Tooltip for truncated values. `stack` records the exact packages and versions. The control-room aesthetic has no official package; it is built with plain CSS on top of those primitives and labelled as such.

## Implementation constraints

The build-time checklist from capstone's design method, binding on `build`:

- Every interactive component implements default, hover, focus, active, disabled, loading, error.
- Skeletal loading matching layout shape; empty states teach; errors name the problem and the recovery, inline where the user acts.
- Contrast verified 4.5:1 / 3:1 on both shipped themes, buttons and form fields included (no white-on-white CTAs, no grey-on-coloured secondary text).
- One radius system, one icon family and stroke weight, one accent, as locked above.
- Animation on transform/opacity only; no scroll listeners; reduced motion collapses every effect; motion isolated in leaf components with cleanup.
- Overlays escape their containers (dialogs, selects, tooltips render in a portal).
- Real images only: the landing screenshot is a capture of the built Play screen; no div-fake screenshots, no hand-rolled icons, no emoji-as-icons.
- Interface copy: zero em-dashes, controls name their action, no AI-tell labels, no placeholder-as-label on inputs, labels above inputs, error text below.
- CTAs: one label per intent across the page; no wrapped button labels at desktop.
- `prefers-reduced-motion` and keyboard focus honoured; focus states visible on every interactive element.

Project-specific additions:

- Lamps never convey state alone; the state word is always rendered beside them (§Q18).
- The accent is text only on the dark theme; on light it is a fill with `--accent-ink` text, and `--run-text` carries the running word.
- Stage glyphs come from `docs/capstone/uiux/assets/` verbatim; they are not redrawn.
- The wordmark is live text in Barlow 800 beside the mark, never a rasterised lockup.
- `assets/reference-play.html` is a user-requested reference sample of the Play screen and a project rundown in both themes; the markdown chapters win where they disagree.

## Binding visual reference

`assets/reference-screens.html` (user, 2026-09-03: "this is exactly how the page has to look like") renders all ten screens in both themes from one token block, and outranks any prose in this chapter where the two disagree. Its `:root` / `[data-theme="light"]` custom properties are the authoritative palette; its `data-lamp`, `data-word`, `data-seg`, `data-nav`, `data-dis`, `data-pressed`, `data-err` and `data-ph` attribute rules are the authoritative state styling.

One amendment the user made at the same time: the marketing page's hero still `<img src="assets/play-screen.png">` in the reference, but it ships as a **video** of a real run, not a still.

`assets/reference-play.html` is the earlier single-screen study it supersedes.
