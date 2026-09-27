# Design system

Slopify 3.0 has one visual language: a studio console for a one-person YouTube channel. Dark,
calm and precise, with one lit key that says "go". This page says where the system lives in
the code and summarises its rules. The full reference (every token, every component with its
states, and the screen mockups) is the design-system artifact:
<https://claude.ai/artifact/QYUbjbesVrfoeDPVE1zdg4>.

## Where it lives

| What | Where |
| --- | --- |
| Tokens (colour, type, radius, shadow, motion), dark default and light | `packages/web/src/styles/index.css` (`@theme static`) |
| Component classes (`sl-*`), ported from the design system's `bundle.css` | `packages/web/src/styles/kit.css` |
| States, overlays, the shell and the page shapes | `packages/web/src/styles/shell.css` |
| React components | `packages/web/src/components/kit/` |
| The app shell (rail, top bar, bottom nav on phones) | `packages/web/src/components/shell.tsx` |
| A gallery of every component in every state | `/design`, dev server only (`npm run dev`) |

Token names are the design system's names inside Tailwind's namespaces: `ground` is
`--color-ground` and `bg-ground`, `ink-2` is `text-ink-2`, `radius-media` is `rounded-media`,
`title-2` is `text-title-2`. The 8px grid is `--space-1` to `--space-8`; Tailwind's own scale
lines up with it (space-5 = `6`, space-6 = `8`, space-7 = `12`). Shadows change per theme, so
use `shadow-[var(--shadow-pop)]` or a kit class, not the bare `shadow-pop` utility.

The theme is dark unless the system asks for light; Settings > Appearance can pin either by
writing `data-theme` on the document element (`components/theme.tsx`). The light values are
written twice in `index.css` (media query and attribute); `styles/tokens.test.ts` keeps the two
copies identical.

**Deprecated 2.x names** (`bg`, `panel`, `panel2`, `line2`, `ink2`, `ink3`, `red`, `amber`,
`lamp-*`, `run-text`, `done`, `accent-edge`, `text-row`, `text-title`, `rounded-panel`, the
`engraved` utility) are aliases onto the 3.0 tokens so screens that have not been redesigned
keep rendering. Don't use them in new code; the screen redesign removes their last uses and
then the aliases. `accent-ink` changed meaning: in 3.0 it is accent-coloured text; text on an
accent fill is `on-accent`.

The 2.x `components/ui/button.tsx` and `ui/dialog.tsx` now render the kit's classes (outline
and accent become secondary, ghost becomes quiet, danger becomes destructive, play becomes the
Play key). New code imports from `components/kit`.

## Components

`kit/button` (Button: primary, secondary, quiet, destructive, icon; small; `disabledReason`;
IconButton; PlayKey; ButtonRow) · `kit/field` (Field wires label, help and error into its
control's `id`, `aria-describedby` and `aria-invalid`; Input, Select, Textarea, Code) ·
`kit/switch` (Switch, Segmented) · `kit/tabs` (roving focus: arrows, Home, End) ·
`kit/section-head` (kicker, title, meta, info, actions) · `kit/status` (Lamp, Status, Badge,
Chip) · `kit/media` (MediaFrame with aspect, caption, badge, hover and focus actions and a
generating state; MediaGrid; Lightbox with arrow paging and Esc) · `kit/player` (a real
`<video controls>` with its poster) · `kit/rail` (Rail, RailLink with `aria-current`,
RailButton) · `kit/steps` · `kit/next-action` · `kit/callout` (danger, waiting, info, with
actions) · `kit/list-row` (List, ListRow with visible actions) · `kit/stats` (Stats, Stat,
Meter, DataTable) · `kit/command-palette` · `kit/dialog` (Dialog, ConfirmDialog) · `kit/toast`
· `kit/empty-state` · `kit/reading-view` (contents from `##` headings, search that marks every
hit, copy one section or all as Markdown) · `kit/layout` (PageHeader, Workspace, ListDetail,
Rule).

### Command palette

Ctrl+K (Cmd+K on a Mac) opens it anywhere. A screen offers its actions while it is mounted:

```tsx
useCommand({
  id: "project.approve",
  title: "Approve and render", // named for its result
  group: "This project",
  context: project.name, // listed first, shown beside the title
  keywords: ["export", "review"],
  run: () => approve.mutate(),
});
```

Matching is fuzzy (letters in order, word starts and runs score higher). Arrow keys move,
Enter runs, Esc closes; focus stays in the palette while it is open.

### Shell

A 232px rail (wordmark, the palette button, Home, Projects, Calendar, Channels, Library,
Settings, the channel picker slot and the New video key), a thin top bar, and the page up to
1680px. Below 768px the rail becomes a bottom bar of five (Channels is left out). Home and
Channels point at the closest existing screens until their routes exist (see the TODO in
`shell.tsx`). A channels screen renders its picker into the rail with
`<ChannelPickerSlot>`.

## Rules in short

- **Voice.** Name actions for their result ("Remake 3 outdated images", never "Submit" or
  "OK"). Errors say what failed, why, and the one thing that fixes it, with the fix as the
  button. Sentence case; "you" for the person; exact numbers with units; no emoji, no
  exclamation marks.
- **Colour.** `ground` behind the page, one `surface` for the working area, `raised` only for
  what floats. Never a surface inside a surface: sections are separated by `space-6` and a
  `line` hairline. Accent (lime) is spent once per area. Status colours always come with a
  word or an icon. Media sits on `screen`.
- **Type.** Barlow to read, Barlow Condensed for titles, big numbers and kickers, JetBrains
  Mono for `code`. `title-1` once per page; `title-2` section heads; `title-3` sub-heads and
  row titles; `reading` at a 68ch measure for long text.
- **Layout.** Use the width. Three page shapes: Workspace (section rail, main, action rail),
  List and detail, Board. Page padding `space-7` on desktop, `space-4` on phones; nothing
  scrolls sideways. Labels above fields; field groups in two columns on desktop. Section heads
  carry their actions on the right: primary, secondary, quiet, overflow.
- **Actions.** Five button kinds, one meaning each; the Play key only starts runs. Actions are
  buttons, links go somewhere. A project shows exactly one primary action for its situation
  (the next action rule). Row actions are visible. Every frequent action is in the palette.
- **Media.** A media frame with a fixed aspect box, a caption, actions on hover and focus, a
  status badge; one gallery grid; click opens the lightbox; video plays in a real player.
- **States and motion.** The lamp is the status mark and always sits next to its word. Hover
  lifts to `raised`, focus draws a 2px ring offset 2px, disabled controls say why. 120ms for
  hover and toggles, 200ms for things entering; reduced motion stops the pulse and the slides.
  Elevation is only `shadow-pop` and `shadow-dialog`.
- **Icons.** Lucide at 16px (18px in the rail), 1.75 stroke. An icon never replaces a word,
  except on an icon button, which always has an `aria-label`.
