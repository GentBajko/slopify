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

The 2.x names (`bg`, `panel`, `panel2`, `line2`, `ink2`, `ink3`, `red`, `amber`, `lamp-*`,
`run-text`, `done`, `accent-edge`, `text-row`, `text-title`, `rounded-panel`, `--color-shadow`)
are gone; `styles/tokens.test.ts` fails if one is defined again. Only the `engraved` utility is
left, deprecated in favour of `.sl-kicker`. `accent-ink` is accent-coloured text; text on an
accent fill is `on-accent`.

**slopify.stream uses the same tokens.** `packages/site/public/styles.css` names them without
Tailwind's namespace (`--ground`, `--ink-2`, `--radius-media`, `--space-4`), and
`packages/site/tokens.test.js` fails when a value there differs from `index.css`, dark or
light. Change a token in `index.css` first, then copy it to the site.

**One grid.** Spacing is the scale: `--space-1` to `--space-8`, or Tailwind's numbered steps
(`p-3`, `gap-2`, `mb-1`). An arbitrary pixel spacing (`p-[18px]`, `gap-[6px]`) outside
`components/kit` fails `styles/grid.test.ts`.

The 2.x `components/ui/button.tsx` and `ui/dialog.tsx` now render the kit's classes (outline
and accent become secondary, ghost becomes quiet, danger becomes destructive, play becomes the
Play key). New code imports from `components/kit`.

## Components

`kit/button` (Button: primary, secondary, quiet, destructive, icon; small; `disabledReason`;
IconButton; PlayKey; ButtonRow) · `kit/field` (Field wires label, help and error into its
control's `id`, `aria-describedby` and `aria-invalid`, and `tip` puts the info button beside
the label; Input, Select, Textarea, Code) · `kit/switch` (Switch, Segmented, both with `tip`) ·
`kit/info-tip` (InfoTip, reading the help catalogue; `helpScope`) · `kit/tabs` (roving focus: arrows, Home, End) ·
`kit/section-head` (kicker, title, meta, info, actions) · `kit/status` (Lamp, Status, Badge,
Chip) · `kit/media` (MediaFrame with aspect, caption, badge, hover and focus actions and a
generating state; MediaGrid; Lightbox with arrow paging and Esc) · `kit/player` (a real
`<video controls>` with its poster) · `kit/rail` (Rail, RailLink with `aria-current`,
RailButton) · `kit/steps` · `kit/next-action` · `kit/callout` (danger, waiting, info, with
actions) · `kit/list-row` (List, ListRow with visible actions) · `kit/stats` (Stats, Stat,
Meter, DataTable) · `kit/command-palette` · `kit/dialog` (Dialog, ConfirmDialog) · `kit/toast`
· `kit/empty-state` · `kit/reading-view` (contents from `##` headings, search that marks every
hit and steps through them, copy one section or all as Markdown; the one reading view, used by
the project page too, where `regionLabel` puts the text in a scrolling region) · `kit/layout`
(PageHeader, Workspace, ListDetail, Rule) · `kit/board` (Board and BoardColumn: `main-side`
for Home, `aside` for the calendar beside its suggestions, `even`; stacked below 1024px).

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

Matching is fuzzy (letters in order, word starts and runs score higher). Several words match
across the title, the context and the keywords in any order, so "tiamat regenerate image 3"
finds "Regenerate image 3" in the project Tiamat. A `numbered` command takes the number typed
with it ("Regenerate image 3", handed to `run(3)`); a `searchOnly` command waits until
something is typed. Arrow keys move, Enter runs, Esc closes; focus stays in the palette
while it is open.

From anywhere (`components/global-commands.tsx`, searched only): "Open ‹project›", "Regenerate
image N in ‹project›" (opens the project on Images and asks to regenerate that image, as the
button does), New schedule and Add to calendar. A command that finishes on another screen
navigates there and leaves an intent that screen takes once loaded (`lib/intents.ts`).

### Keyboard shortcuts

A command's `shortcut` is its label and its binding: the palette's provider runs it when the
keys are pressed, so the two cannot drift. Keys live in `lib/shortcuts.ts`; the button that
does the same thing carries `aria-keyshortcuts` (`ariaKeyShortcuts(shortcut)`). Keys without
Ctrl wait while a field, a textarea or an editable area has focus; Ctrl ones (Cmd on a Mac)
work from a field too. Nothing fires while the palette or a modal dialog is open. `?` or "Show
keyboard shortcuts" lists every key that works on the current screen.

| Keys | Does |
| --- | --- |
| Ctrl+K | Search or run a command |
| ? | Show keyboard shortcuts |
| C | New video |
| G then H / P / C / S / L / K / , | Open home / projects / calendar / schedules / library / channels / settings |
| / | Search the list (Projects, Prompts, Intros and outros) |
| Shift+N | The project's next action (Soften and retry still asks at its button) |
| Shift+D | Copy the YouTube description |
| Ctrl+Enter | Play: review the whole setup |
| Ctrl+S | Save in a Library editor (prompt, intro or outro, PDF theme) |

### Shell

A 232px rail (wordmark, the palette button, Home `/`, Projects `/projects`, Calendar,
Channels, Library, Settings, the channel picker and the New video key), a thin top bar, and the
page up to 1680px. Below 768px the rail becomes a bottom bar of five (Channels is left out) and
Home carries the channel picker itself.

The channel picker (`channels/current.tsx`) is the current channel: Home, the calendar and
Projects show only its work, or every channel's. `useCurrentChannel().includes(channelId)`
answers whether something is in view; the choice is kept per browser. Every destination, each
channel ("Switch to …") and New video are Ctrl+K commands; each screen adds its own actions.

The rail's surface and hairline are painted on the shell itself as well (`.sl-app`'s
background), so on a long page the rail's column never ends at the first screen, even where
`position: sticky` gives up.

### The project page

A Workspace (`routes/project.tsx`). The title row carries the way back to Projects, the state
word, Edit settings and a More menu (Choose what to remake…, Save as template…, Cancel the
run…). The left rail lists the sections (Article, Narration, Images, Video, Shorts, YouTube,
PDF when the run makes one, Cost, Live), each stage with its lamp and "3 outdated" when it has
outdated outputs, then the views that replace the main column (Settings, Checkpoints with
"1 held", History). The right rail has the next action, the run's steps with their times and
one detail line each, and the cost so far with each CLI plan's share. Below 1180px the rails
sit above the column; on phones the section rail scrolls sideways as tabs and only the next
action stays above it.

Media is a MediaFrame in one MediaGrid per image prompt, opening the Lightbox; the video plays
in the Player; shorts are 9:16 players in their own grid; review verdicts are badges on the
frame with Overrule and Redo among its actions. Making a whole stage again is rare, so it sits
behind each section's More, confirmed first.

### Controls that say what they do: the next action

A project shows exactly one next action, named for its result, only when it applies: in the
right rail as the primary button, and beside the item it affects as a callout with the same
action as a secondary button. `project/next-action.ts` decides it from the project's state in
one pure function (`nextActionFor`, every row tested in `next-action.test.ts`); the page, the
section callouts and Ctrl+K all read it. The first situation that holds wins, in this order:

| Situation | When | Status | Action | Beside |
| --- | --- | --- | --- | --- |
| Sample | the bundled sample project | Sample project | Make my own copy | none |
| Paused | the project is paused | Paused | Continue the run | none |
| Failed | a step failed and will not retry by itself | Failed | the fix-it (below), else Try images again / Try the article again | the step's section, with Error details |
| Held | a checkpoint holds work for review | Waiting for you | Approve and render the video (or … make the images / record the narration) | the held stage's section |
| Waiting | a CLI plan's limit is reached, or a step waits to retry by itself | Waiting for limits / Waiting to try again | none: when it carries on, in words | the waiting stage's section |
| Running | the run is at work | Running | Pause | none (the section shows progress) |
| Stopped | canceled, failed without a failed step, or resumable work nothing will start | Stopped / Canceled | Continue the run | none |
| Queued | pending in the queue | Queued | none | none |
| Outdated | the last saved edit made outputs outdated | Outdated | Remake 3 outdated images (the first group in run order: article, narration, establishing image, images, animated images, thumbnails, video, shorts, YouTube description, PDF) | that group's section |
| Done | done or done with problems, and a video exists | Done | Prepare upload | YouTube |

The fix-it of a failed step (`slices/fixes/rules.ts`): a signed-out CLI says the command to
run and offers Try … again; a refused image prompt offers Soften and retry (confirmed); a
refused text prompt and a retired model open the settings (Edit the prompt, Switch model); a
rejected key links to Settings → Providers → the provider; a full disk to Settings → Storage.

Remake uses the rebuild flow for exactly those outputs: a preview of the outdated outputs' work
keys, started at once when it needs no consent (nothing blocked, no provided content to
confirm, every cost known), otherwise opened in the rebuild review so the person sees why.
The full review (Choose what to remake) stays in the More menu and Ctrl+K.

Every project action is a Ctrl+K command: the next action by its name, Pause the run /
Continue the run, Prepare upload, Edit project settings, Choose what to remake, Remake …
outdated … and Remake everything outdated, Save as template, Cancel the run, Make my own copy,
Open the project folder, Copy description, Copy tags, Regenerate image N and Regenerate
thumbnail N.

### Every control explains itself

Nobody should have to guess what a control does. Every setting, option, toggle, select, number
field and non-obvious action has an info button (`InfoTip`) beside it, and its words come from
one help catalogue, `packages/web/src/help/catalog.ts` (split into `help/entries/<area>.ts` so
the list stays readable). An entry is `id → { title, body }`; the body says, in about 60 words
at most, what the control does, when to change it, the default, and what it costs or slows (API
calls, money, time, disk), in the Voice below. One thing has one id, reused wherever it shows.

- Wire it through the kit: `Field tip="…"`, `Switch tip="…"`, `Segmented tip="…"`,
  `LabelledSwitch tip="…"`, `SectionHead info="…"`, or `<InfoTip id="…" />` inside an element
  that spreads `helpScope` for a hand-laid-out row. Write ids as literals, never built from
  pieces.
- The button is a real button named "About {thing}", in the tab order; a press, Enter or Space
  opens it (never hover alone, so touch gets it too) and Esc closes it.
- Keep a short `help` line under a field only where it helps scanning; never repeat the tip.
- Tests hold the rule: `help/catalog.test.ts` fails on an id used but missing, an entry used
  nowhere, or a body that is too long or too short; `help/walk/*.test.tsx` render the main
  screens with fixture data, open every section, and fail on any labelled control whose
  nearest `data-help-scope` has no info button. Self-explanatory controls (search boxes, row
  checkboxes) go in an explicit allowlist with a reason.

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
