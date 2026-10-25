# Design system

Slopify 4.0 has one visual language: a studio console for a one-person YouTube channel. Dark,
calm and precise, with one lit key that says "go". The goal behind every rule here is ease of
use for people who don't build software: anyone should know what a control does from its label
alone, without a tooltip, an info popover, a doc or a paragraph of help; and a finished project
should show the video, its downloads and where each stage stands in the first screen, with
nothing that needs a press to find out what it is.

This page says where the system lives in the code and states the rules the app follows. Where a
test holds a rule, the rule names it. The design-system artifact
(<https://claude.ai/artifact/QYUbjbesVrfoeDPVE1zdg4>) keeps the full reference of tokens,
typefaces and colours; where it and this page differ on layout, density or wording, this page
wins.

## Where it lives

| What | Where |
| --- | --- |
| Tokens (colour, type, radius, shadow, motion), dark default and light | `packages/web/src/styles/index.css` (`@theme static`) |
| Component classes (`sl-*`) | `packages/web/src/styles/kit.css` |
| States, overlays, the shell and the page shapes | `packages/web/src/styles/shell.css` |
| React components | `packages/web/src/components/kit/` |
| The app shell (rail, phone top bar and bottom bar) | `packages/web/src/components/shell.tsx` |
| The help catalogue, and the rule for what counts as explained | `packages/web/src/help/catalog.ts` (entries in `help/entries/<area>.ts`), `help/coverage.ts` |
| One name per stage, one word per state, one table of keys | `lib/stage-words.ts`, `lib/state-words.ts` (from `packages/app/src/slices/admission/state-words.ts`), `lib/shortcuts.ts` |
| A gallery of every component in every state | `/design`, dev server only (`npm run dev`) |

Token names are the design system's names inside Tailwind's namespaces: `ground` is
`--color-ground` and `bg-ground`, `ink-2` is `text-ink-2`, `radius-media` is `rounded-media`,
`title-2` is `text-title-2`. The spacing scale is `--space-1` to `--space-8` (4, 8, 12, 16, 24,
32, 48, 64px); Tailwind's own steps line up with it (space-5 = `6`, space-6 = `8`, space-7 =
`12`). Shadows change per theme, so use `shadow-[var(--shadow-pop)]` or a kit class, not the
bare `shadow-pop` utility. `accent-ink` is accent-coloured text; text on an accent fill is
`on-accent`.

The theme is dark unless the system asks for light; Settings → General can pin either by writing
`data-theme` on the document element (`components/theme.tsx`). The light values are written twice
in `index.css` (media query and attribute); `styles/tokens.test.ts` keeps the two copies
identical and fails if a 2.x token name (`bg`, `panel`, `ink2`, `lamp-*`, `text-title` and the
rest) is defined again.

**slopify.stream uses the same tokens.** `packages/site/public/styles.css` names them without
Tailwind's namespace (`--ground`, `--ink-2`, `--space-4`), and `packages/site/tokens.test.js`
fails when a value there differs from `index.css`, dark or light. Change a token in `index.css`
first, then copy it to the site.

**One grid.** Spacing is the scale: `--space-1` to `--space-8`, or Tailwind's numbered steps
(`p-3`, `gap-2`, `mb-1`). An arbitrary pixel spacing (`p-[18px]`, `gap-[6px]`) outside
`components/kit` fails `styles/grid.test.ts`.

## Words

One word per thing, in every label, sentence, toast and help entry; the state words are the MCP
tools' words too. The left column is the thing, the middle what to write, the right what never to
write in visible text.

| Thing | Write | Never |
| --- | --- | --- |
| The creation screen and its rail key | Create | Play, Create run |
| Create's main button | Make the video, Make the audiobook, Make the podcast, Make the article, Make the images; Make 3 videos; Queue 3 videos when they run one after another | Start run, Play |
| What the main button waits for | "<the next thing to do> first": "Pick a voice first" | "… to play" |
| Using a prompt or a template | Make a video (opens Create with it picked) | Use in Play, Apply to Play |
| The stages | Research, Article, Narration, Images, Thumbnail, Video, PDF (`lib/stage-words.ts`); Audio export for a sound-only export; Audiobook, Radio drama or Episode for a listening project's last stage | Audio, Document, Export, Speech, TTS |
| Who does a stage | A group named for the role, over two selects, Service and Model: Written by, Read by, Images by, Drawn by, Checked by. In a sentence: the voice service, the image service | LLM, Text model, TTS model, Speech provider, Provider on its own |
| Who reads the narration | Voice | TTS voice |
| The pictures a run makes | Images; the image service | Pictures in a label for them |
| On-screen text over the video | Captions (the `.srt` and `.vtt` files are Subtitles (.srt) and Subtitles (.vtt)) | Subtitles for the on-screen text |
| `{{Topic}}` and friends | keyword: "Asks for: Topic", "Asks you for" | slot, field |
| A saved setup | template; starter templates for the bundled ones | setup (as the saved thing), pack, studio |
| Editing a template | Edit template | Open studio, Template Studio |
| Doing paid work again | Make <object> again, with count and cost where known: "Make all 4 images again · 4 image calls", "Make this image again", "Write the description again · 1 AI call" | Regenerate, Remake, Redo, Record again, Write again on its own |
| Making something again on this computer | "Make the video again (free)", "Make the PDF again (free)" | Render as a button's verb |
| Getting it onto YouTube | Copy for YouTube Studio (its last row is I've uploaded it); the states Ready to upload and Uploaded | Prepare upload; On YouTube or Marked uploaded as a state (a toast may say "Marked uploaded: <title>.") |
| A project's views | All files, Progress (only while the run goes or is paused), Versions, Pauses and checks | Outputs, Live, History, Revision, Checkpoints, Reviews |
| Pausing a run for approval | "Pause after <step> (before <stage>)": "Pause after the images (before the video)". It waits under Home → Needs you | Before Audio, checkpoint in a label |
| A saved state of a project's settings | version | revision |
| A video's YouTube date | Release; Clear the date; No date yet | Schedule (Visibility), Release time (a schedule's Release times are its times of day, a different thing) |
| The uploads of one project | Video, Short 1, Short 2 | |
| Home's list of finished work | Finished | Ready (Ready is a service's or a part's readiness) |
| The pages that were Library | Prompts, Templates | Library |
| Saving | Save (one verb; it never spends money) | Save a setup, Save without a sample |

States are one word each, from one table (see Status), and a lamp always sits next to its word.

The rest of the voice: sentence case; "you" for the person; no emoji and no exclamation marks;
US spelling (canceled); exact numbers with units. Every action button is named for its result,
with its object ("Download video (.mp4)", not "Download ▾"; "Delete project", never "OK" or
"Submit"). A button that spends money says so on the button or in the one line under it, never
only in an info popover. A link that leaves the page ends in "↗" and names a destination that is
not obvious ("New narration prompt ↗ (opens Prompts)"); two links on one screen never share a
name.

Some strings are not in these words yet. Don't copy them; move them when you touch them:

- Remake, Render, Redo: the outdated next action and its palette commands ("Remake 3 outdated
  images", "Remake outdated outputs", "Remake everything outdated", "Choose what to remake" in
  More and Ctrl+K), the style preview's "Render again", an AI check's "Redo", Edit settings'
  "press Remake" for new shorts music, and Settings' "Render priority".
- Library, Play, revision: Edit settings' "Update from Library", "Library → Narration aliases",
  "the Library version" and "Library wording" (`project/revision-providers.tsx`,
  `revision-prompts.tsx`, `revision-form.tsx`), Save as template's "Save this revision's setup
  for a fresh Play draft", the tour's "Play is where you configure one project", the backup
  count "Play drafts", and help entries that still say Library, LLM, text model or TTS.
- Subtitles for the on-screen text: the Video section's "Subtitles and fonts" fold and "Passages
  left out of the subtitles".
- Places that moved: the failed-key fix "Open Settings → Providers → <service>" (the page is now
  Keys & services), and What worked on YouTube's empty line "(On YouTube → A/B test)" (the fold
  is "Test other titles and thumbnails" under YouTube).
- A prompt row's ⋯ says History where a template card's says Versions.

## Components

`kit/button` (Button: primary, secondary, quiet, destructive, icon; small; `disabledReason`,
the reason as the button's tooltip, beside the visible line that says it; `focusableWhenDisabled`
for a reason the person needs to go on ("Cancel the run first, then delete it."): the button
stays in the tab order with `aria-disabled`, refuses presses, and its reason is also its
description and the kit's tooltip on hover and keyboard focus; IconButton, whose `label` is its
name and tooltip, only for the few controls Links and buttons names; PlayKey, the lime key: the
rail's Create key and Create's Make button; ButtonRow) · `kit/link` (ButtonLink and TextLink
for router links, FileLink for a download or a file opened in a new tab, named for its file;
see Links and buttons. The kit's IconFileLink is used nowhere; don't start) · `kit/field`
(Field wires label, `help`, `error` and `tip` into its control's `id`, `aria-describedby` and
`aria-invalid`; HelpLine, the same one visible sentence for a row that lays out its own control;
Input, Checkbox, Select, Textarea, Code) · `kit/switch` (Switch and Segmented, both with `help`
and `tip`; a Segmented's `label` is only its accessible name, so a choice like "Free / Premium /
Premium+" sits under a Field label) · `components/labelled-switch.tsx` (LabelledSwitch, `help`
and `tip`) · `kit/fold` (Fold, see Folds) · `kit/info-tip` (InfoTip, reading the help
catalogue; `helpScope` for a hand-laid-out row) · `kit/tabs` (Tabs and TabPanel, roving focus:
arrows, Home, End) · `kit/section-head` (kicker, title, meta, a status beside the title,
`size="small"` for a sub-head, `row` to put the meta beside the title, `id` for
`aria-labelledby`, actions as children; its `info` prop puts an info button right after the
heading, which the rules below forbid: four heads still use it, Notifications' "Browser and
phone", the poster template editor's Rows, Free space and the style preview, and each should
become a line under the heading) · `kit/status` (Lamp, Status, Badge, Chip) · `kit/steps`
(Steps: lamp, name, time, then the state word before one detail, "Done · 4 images") ·
`kit/media` (MediaFrame, MediaGrid, Lightbox; see Media) · `kit/player` (Player) and
`kit/audio-player` (AudioPlayer, `compact`, `waveform`) · `kit/rail` (Rail, RailLink with
`aria-current`, RailButton; a stage item takes `tone` and `state` together, so its lamp always
has its word, and `meta` for a count: `<RailLink tone="done" state="Done" meta="2 outdated">`) ·
`kit/menu` (Menu, MenuTrigger, MenuContent, MenuItem, MenuLabel for a heading over a group of
rows, MenuSeparator; the shell's menus open from MenuTrigger) · `kit/popover` · `kit/callout`
(danger, waiting, info, with actions) · `kit/list-row` (List, ListRow with visible actions and
an inline body, the whole row its target; RowSelect, with `expanded` for a row whose details
open in place; `hitArea` and `hitTarget` for a row or card made by hand) · `kit/stats` (Stats,
Stat, Meter, DataTable; a Meter is a quantity in a range, a plan limit or disk space, and
`progress` makes it a progress bar for a task moving towards done) · `kit/command-palette` ·
`kit/dialog` (Dialog; ConfirmDialog) · `kit/drawer` (a right-hand panel that does not block the
page, its footer pinned) · `kit/action-bar` (ActionBar, the sticky bar of an editing surface,
and StatusSlot, its one line of feedback, which takes no room while empty) · `kit/toast` ·
`kit/query-state` (QueryState, LoadingBlock, LoadFailed, StaleNote: a region of fetched data is
loading, failed with Retry in place and the fix, stale with when it last loaded, or loaded; a
failed first load never reads as an empty list) · `kit/empty-state` · `kit/reading-view`
(contents from `##` headings, search that marks every hit and steps through them, copy one
section or all as Markdown) · `kit/layout` (PageHeader, Workspace, ListDetail, Rule) ·
`components/selection.tsx` (bulk selection for a collection: `useSelection`, RowCheck with a
24px target round its 16px box, Shift+click for a range, Space to toggle, Esc to clear;
SelectionBar, see Lists) · `kit/facts` (Facts and Fact: label left in ink-2, value right) ·
`kit/board` (Board and BoardColumn: `main-side` for Home, `aside` for the calendar beside its
suggestions, `even`; stacked below 1024px).

The 2.x `components/ui/button.tsx` is gone; every screen uses `kit/button`. `ui/dialog.tsx`
stays only as the Radix parts `kit/dialog` is built on.

### Links and buttons

A button does something; a link goes somewhere. The kit holds the line:

- **Buttons** are `Button`, `IconButton` or `PlayKey` from `kit/button`, named for their result.
  A button never navigates, and `Button` has no `asChild`.
- **An action says its word.** An icon alone (`IconButton`, the `icon` kind) is kept for the
  few controls whose icon everyone reads: a player's own controls, Close ×, the Lightbox's
  Previous, Next and zoom, a search's previous and next match, Show or Hide on a secret field,
  and the ⋯ that opens a row's More menu ("More for <name>"). Every other action is a worded
  button. Icon-only actions still in the code, to be given their words: Delete on a Create
  draft, Reset on a PDF theme setting, Remove on a table's row, line or alias and on a topic,
  Move up and Move down on topics, Move earlier and Move later in the calendar's list, Reject on
  a suggested topic, and "Use the every-run value for all topics".
- **A link wears a button's look only through `kit/link`**, and only when it is the main call to
  action of its item or area (New prompt, Watch, the fix a Needs you item names, a step's Open in
  the tour), or one of a row of buttons it sits in (a prompt row's Edit, an editor's Cancel
  beside Save). That is `ButtonLink` for a route and `FileLink` for a download or a file in a new
  tab (Download PDF, Download diagnostics).
- **Any other navigation is a `TextLink`**: "See all 12 finished in Projects", Manage models ↗.
- **Nothing that acts looks like text.** Quiet and icon buttons carry a soft fill at rest, so
  they never read as grey text.
- **Actions sit top right of their section**, through `SectionHead`'s children, in the order
  primary, secondary, quiet, then a worded "More ▾" for the rare ones. A heading is a
  `SectionHead`, never a hand-set `h2` (Prompts' list head, the calendar's Recent, the
  Releases weeks and the project's view titles still set its class on an `h2` by hand).
- **A row or tile is one target.** A ListRow with `onSelect` or a title link is picked or opened
  by a press anywhere on it: the title's button or link stretches over the row (`::after`), and
  the row's own buttons, links and fields sit above it. It stays one tab stop, with the focus
  ring round the whole row. A title made of more than the name picks the row through
  `RowSelect`. A row or card made by hand gets `hitArea` on itself and `hitTarget` on its one
  link or button; a MediaFrame with `onOpen` is its figure, caption included.
- **A stage's files are one Download and one Open folder.** `StageFiles` (`project/parts.tsx`)
  draws them in their own ButtonRow: one Download (a menu when there are several files, a plain
  download named for its file when there is one), a zip of a set beside it, the stage's ONE
  Open folder, then its other actions. Downloads are secondary; a section's main download is
  primary only on a page whose title row has no next action. Every download names its file:
  "Download video (.mp4)", "Download PDF", "Download both shorts (.zip)". A set downloads as
  one zip at once; the tick list ("Choose images to download…") appears only once a member is
  outdated. Never an Open folder per file, never a quiet file link.
- **List rows carry their actions in words, in one order** (`library/row-actions.tsx`): Edit,
  Make a video, then ⋯ for Duplicate, History and Delete. A list leaves out what its rows can't
  do (a PDF theme makes no video and keeps no history).
- **An opener goes while the form it opens is open.** The header's Add to cast is hidden while
  the New cast member form shows, so one screen never has two buttons with one name for one
  step. The form's heading names the thing ("New cast member"), not the action.

`src/kit-rules.test.ts` fails on an import of `ui/button` or `ui/dialog` outside the kit, a
hand-written `sl-btn`/`sl-key` class or `buttonClass()` outside the kit, an `<a>` with `onClick`,
a raw `<button>` outside the kit (the shell's three rail and top-bar items aside: Search and
Assistant in the rail, Search in the phone's top bar), a button hand-made into a ListRow's
title, a click handler on a row or card element (`li`, `tr`, `article`, `figure`), a stage body
file with more than one Open folder, a `FileLink` made quiet, and a Tailwind arbitrary variant
that names a kit class with `__` inside it. `project/section-rules.test.tsx` counts, as
rendered, at most one Open folder in each open section and one lime button on the page.

### Every control explains itself

A control passes if its label says what it does. Where the label is not enough, ONE visible
sentence goes under it, in ink-2 at 13/19 and at most the reading measure (`.sl-help`). The
info button (ⓘ, `InfoTip`) is only for a setting whose consequence (a cost, a limit, a side
effect) needs a paragraph. Fix a confusing control with a clearer label, a verb and its object,
or fewer controls, before adding a sentence; never with an icon-only button.

- **Write the line through the kit**: `<Field label="Article length (words)" help="About 150
  words is one minute.">`, `Switch help="…"`, `Segmented help="…"`, `LabelledSwitch help="…"`,
  or `<HelpLine>` inside an element that spreads `helpScope` for a row with its own control. The
  line is wired into the control's `aria-describedby`.
- **An info button** is `Field tip="…"`, `Switch tip="…"`, `Segmented tip="…"`,
  `LabelledSwitch tip="…"`, or `<InfoTip id="…" />` inside a `helpScope`. It sits beside a
  field's label, where the question comes up: never right after a button, a heading or a list
  row's title, never inside a heading, and never two in one field. A heading carries a line under
  it, not an info button. It is a real button named "About {thing}", in the tab order; a press,
  Enter or Space opens it (never hover alone) and Esc closes it.
- **Its words come from one help catalogue**, `packages/web/src/help/catalog.ts` (split into
  `help/entries/<area>.ts`). An entry is `id → { title, body }`; the body says, in about 60
  words, what the control does, when to change it, the default, and what it costs or slows (API
  calls, money, time, disk). One thing has one id, reused wherever it shows. Write ids as
  literals, never built from pieces. A service's setup may show an entry's body as a visible
  paragraph through `helpEntry(id).body`.
- **No jargon in a control's name**: TTS, LLM, STT, ASR and Chunking fail. Say voice, writer,
  split into parts. PDF and AI are words people know.
- **Screens with none.** The first Create screen (the kinds, Start from, the topic and the row
  sentences) and the first-run screens carry no info buttons; a row's editor, once opened, may.

The tests hold the rule. `help/walk/*.test.tsx` render the main screens with fixture data, open
every section and fold, and read them with `help/coverage.ts`. A labelled form control (input,
select, textarea, switch, checkbox, radio group, slider, combobox, or a group of pressed buttons)
is explained when its nearest `data-help-scope` holds a readable help line (`data-help-text`
with words in it, not hidden, `aria-hidden`, inert, `display: none` or `.sr-only`) or an info
button. Controls in a hidden branch, file inputs and a player's own controls are skipped. A
control whose label says it all goes in an allow list with a reason: every screen allows
Search…, Filter…, Sort…, Select all and Select row, and "Showing:" (`selfExplanatory`);
the stage editors of Create, Edit template and Edit settings allow a stage's switch named for
its stage, a service group's Service and Model ("Read by Service"), and the Voice select
(`stageEditors`). The same pass fails on jargon in a name, an info button in the wrong place or
a second one in a field, and a second lime button in one area (see The lime).
`help/catalog.test.ts` fails on an id used but missing, an entry used nowhere, a title left
empty, a body under 8 or over 75 words, an exclamation mark or an "I" in a body, and a Learn
more link to a tutorial page or heading that doesn't exist.

### The lime

The accent marks the one thing to do next, so an area has one lime (primary) control, given to
its real next step. An area is the page, each rail, the shell's navigation, each dialog, and each
card or row of a list (its own next step). Mark an area of your own with `data-area`. A disabled
primary wears no lime and doesn't count: a disabled PlayKey is an outline with ink-2 words, a
disabled primary Button is transparent with a hairline. Downloads are secondary by default.

- A forward action that will be refused stays pressable, so the refusal can explain why, but
  wears no lime until nothing is missing; the lime stays with the step's real next action
  (Next, Make). The welcome's "Make a 60-second short" does this.
- An empty list's only lime is "New <thing>" in its empty state; the header does not repeat it.
- Home's main column has one lime: the first decision's action, else the newest video's Watch.
  A project page has one: its next action.

`help/coverage.ts` counts them in every walk; `project/section-rules.test.tsx` counts the
project page. Neither counts the kit Player's big play key, which is drawn in the player's own
lime (`.sl-player__big`): before a video starts it is a second lime beside the page's next
action. It is a known break of this rule, not a pattern to copy.

### Status

A lamp never appears without its word ("● Done"), in lists, rails, run steps and headers.
`Status` is the lamp with its word; a bare `Lamp` is only for a place where the word sits beside
it in the same row (the rail item's state, the "● 2 running" count). State words are visible, so
they are sentence case. Home's autopilot warnings still lead each row with a bare lamp for its
severity; give it its word when you touch them.

One word per state everywhere, the MCP tools included (`slices/admission/state-words.ts`, read
by `lib/state-words.ts`):

- **A project**: Queued (not started), Running, Paused, Failed, Done with problems, Done,
  Canceled. A held one reads by what it waits for: Kept as is, Waiting for the agent, Stopped,
  Prepared, Waiting for your review. A run with a failed step beside such a wait reads by the
  wait while something can still move, and Failed once nothing can. A failed step retrying by
  itself is Waiting to try again; a CLI plan's limit reads "Waiting for Codex limits (resets at
  14:00)" on the project page, Home, the Projects row and the calendar (`project/limit-wait.ts`).
- **A step**: Not started, Running, Done, Provided, Failed, Canceled, and Off for a step a setting
  turned off.
- **A list row** (`home/ready.tsx`, shared by Home and Projects): Ready to upload (a finished
  video not marked uploaded), Uploaded, Done with problems (the video was made but another step
  failed, named: "PDF failed · See what failed"), Done (a sample, or a run without a video), else
  the project page's word. The Projects filter chips use the same words.
- **Anything on YouTube** reads "● Uploaded", in YouTube links, Release rows, the drawer's last
  row and Projects. The sentence for the opposite is "Not on YouTube yet". The long video's
  YouTube link and the project's uploaded mark are one record: saving the link marks the project
  uploaded, and forgetting it or Mark not uploaded takes both off. A short's link is its own.
- **A service** reads, in Settings' lists, Voices and the health check: Ready, No key, Not found,
  Signed out, Needs fixing, and Not installed for the computer's own voice without its program;
  the health check adds May need fixing and Not set up. Where Create, Edit template and the
  project page say why a service can't be picked (`lib/provider-status.ts`), the words are No
  key, Not found, Signed out, Host helper unavailable, Needs an update and Needs attention. A
  readiness line names the stage it serves (Article, Narration, Images) and what the video
  lacks without it.
- **A schedule**: Active, Paused, Completed, Canceled.

A state word reads in its colour only when it moves, waits or failed: Running in accent-ink,
waiting in the waiting colour, failed in danger, info in the info colour. Done, Not started and
Off stay quiet in ink-2, so a finished run is not a column of lime. Status colours always come
with a word.

### Media

Images and video live in a MediaFrame: `screen` behind, a fixed aspect box (landscape, portrait,
square, tall 4:5) so grids never jump, a caption line under it, a status badge in the corner.

- **Actions at rest, in words.** A frame's `actions` show in a row under the caption, always:
  "Make this image again", "Download", "More ▾" (Compare with previous, Replace with my file,
  Delete). Nothing important appears only on hover.
- **Full size is a visible button.** A frame with `onOpen` shows a small worded button in its top
  right corner, "Full size" by default (`openText="Open"` for a frame that leads to the item's
  own page); `openLabel` is its accessible name, and a press on the picture does the same. On a
  compact grid it is 24px in 12px type, without its icon.
- **One gallery grid**, MediaGrid: 220px columns, `shorts` for 9:16 tiles (240px; 180px inside a
  project on a window wider than 1180px), `density="compact"` at 140px for a drawer, a side
  panel or a Home card, `list` for `<li>` tiles. A project's Images tiles are at least 200px
  wide, two across a phone.
- **The Lightbox** pages with the arrows, closes on Esc, and carries the shown picture's actions
  in words on its bar (Make this image again, Download).
- **Video plays in the kit Player** with its poster, sound in the AudioPlayer; see The project
  page.
- **A preview that can't be drawn** says so in words and points at Full size. A preview tile may
  draw text larger than real scale so the setting shown (a font, an outline) can be seen; its
  caption or a code comment says so.

### Folds

A folded section looks like a disclosure, never like an empty input: `<Fold summary="More
narration settings" state="Split by chapter, 2 voices">` draws a chevron that turns, the name in
ink, what it is set to now in ink-2 after a dot, and Show or Hide in accent-ink at the line's
end, with no border box; what opens lines up under the name. `remember` keeps it open or shut
per browser.

- The current value goes in `state`, in words starting with a capital, not in `summary`.
- A fold is named for what it holds ("Technical details", "Where to get a key", "Posting plan",
  "Install the Slopify Studio extension", "All Narration settings (6)"), never a bare "More". Name
  it with a noun, since Show follows it: "Text that will be spoken", not "Show the text that will
  be spoken".
- A fold never holds only one or two settings: those follow the lead settings with no fold. Its
  count counts what a person sets; a row of choices counts once.
- On the welcome, terminal commands sit apart in a Fold (the computer's own voice, installed from
  a terminal), never inside a sentence, and a server sentence never names another screen's button;
  each screen adds its own ("Then press Check again.").
- No one-open-at-a-time accordions for parts a person needs side by side.

### Showing, hiding and disabling

A control that cannot apply is hidden, not drawn greyed: bulk actions until something is ticked,
Test and Remove until a key exists, the transition length until a transition is picked, a move a
queue can't make, Reset until a value has left its default, a 0 B clean-up, Empty trash on an
empty trash. When the reason matters, it goes in the row's text. A hidden filter stops filtering:
with one channel nothing is filtered and a stored pick is ignored.

A control that stays disabled says why in visible text: the row's line, the action bar's status,
or the menu row's own label ("Read-only sample. Press Make my own copy first."). `disabledReason`
puts the same words on the button as its tooltip, and with `focusableWhenDisabled` as its
description too; a tooltip alone is not the visible reason. The reason names what would
make it work ("Only Inworld TTS-2 voices read it"), not "this provider". A control that cannot
act on a paused item is hidden, and the item's state word (Paused) is the reason shown. A commit
button that stays on screen (Save link) may instead say in its state line what is missing when
pressed ("Paste the video's link from YouTube first.").

A prerequisite's fix replaces the action it blocks: a select's first entry says what to do next,
with the fix as a link under it; a picked service that can't be used says so under its group
with the link that fixes it. A fix for a setting in another section is a link naming that
section ("Change it in Images").

### Saving

- **Save never spends money.** Paid work has its own button with its price ("· about $0.40",
  "· free", "· plan usage", never "$0").
- **Save waits for a change.** Edit template's Save bar and Pronunciation's appear once something
  changed, and the poster template editor's bar shows its Save only then; until then the page's
  own next step keeps the lime. A Save that stays on screen (a Settings group, a project's Save
  changes) is disabled until something changed, and its line or its reason says so ("Nothing to
  save yet: change a setting first.", "Nothing changed since the last save.").
- **The prompt, intro and outro, and PDF theme editors** (`components/editor-actions.tsx`) keep
  Save on screen and lime; it holds only while the form has a problem, with the problem said
  beside it in the bar's status ("Enter the text.").
- **A switch saves the moment it moves.** Fields that matter only while a switch is on show only
  while it is on, with their own Save.
- **A value shown in place saves at once** (a project's Release dates): when its box loses focus
  or on Enter, with Undo in the notice and no Save button at rest. A half-typed value goes back to
  the saved one. A schedule's New topic is saved with Enter.
- **Validation waits for the person.** A missing name or text is said once the field is left empty
  or Save is pressed; real problems in the text are said as it is typed.
- **The primary action of an editing surface never leaves the screen**: ActionBar and
  EditorActions stick to the bottom of the window and sit as a direct child of the page or form
  column (a wrapper breaks sticky). Ctrl+S saves from anywhere in a prompt, intro, outro or PDF
  theme editor.
- When an action bar swaps one button for another in the same place (Next → Make), each gets its
  own React `key`, so one press never does two things.

### Density and layout

Use the width; show more and waste less.

- **Page header is one line**: the crumb small before the title, the title, a short meta inline,
  the actions on the right; about 40px, then 16px to the content (`PageHeader`). Only a
  `display` greeting stacks. `title-1` (24/30 condensed 700) is the page header's title and
  nothing else.
- **Page padding** is 16px top, 24px at the sides, 32px at the bottom (`.sl-page`); 16px on a
  phone. Anything that bleeds to the page edge uses 24px. Nothing scrolls sideways.
- **Sections are 12-16px apart**: section head 12px, Rule 16px, a Workspace column's sections
  16px. A blank band never waits for a message: an empty StatusSlot takes no height, and inside an
  ActionBar or a button row the buttons hold the line.
- **Three page shapes**: Workspace (a main column beside a status, action or section column: the
  project page, Create, Settings), List and detail (Prompts, Intros and outros, PDF themes,
  schedules), Board (Home, the calendar). A list and detail beside a section rail sizes its
  columns by its own container, not the window.
- **A column lays out by its own width** (container queries: Tailwind `@container` and
  `@min-[…]`), not the window's: a column beside a rail can be 380px on a 1024px window.
- **Fields**: labels above them (`.sl-field__label`); a group of fields is one `.sl-fields` grid
  (equal columns at least 15rem wide, so three or four across a wide screen and one on a phone;
  a select as wide as its column; `.sl-fields__wide` spans the row); lead settings two across,
  the rest under a Fold. A number box is `.sl-input--number`. Tile pickers fit as many columns as
  they can and wrap their words, never truncate. Rows of label, box and button keep the label
  column at `w-16`.
- **On a phone** nothing may widen the page: a segmented choice wider than the screen sits in a
  sideways-scrolling wrapper, and screen-reader text inside such a scroller has a positioned
  ancestor inside it.
- **Don't state a fact twice on one screen.** Machine output (ffmpeg errors, file paths, raw
  dates) never leads a page or a section's meta and is never help text: lead with a plain
  sentence and put the output under Details or a named Fold.

### Lists

- **Rows are dense enough to show 8 or more items in 900px.** A row whose column is too narrow
  for its text and its actions side by side puts the actions under the text; the title is never
  squeezed to a few letters.
- **Finished work shows what it is.** A row of finished work has its thumbnail, its title, then
  one line, "● Ready to upload · 3:05 · 16:9 · video + 2 shorts + PDF · finished Sep 27", and
  visible Watch (Home) or Open (Projects) and Download video.
- **Rows of authored text are two lines**: the name, then "Asks for: Topic · <first words>". A new
  item is named from the first six words of its text until a name is typed.
- **Filters carry their counts** on the chip. A filter with nothing in it is not offered, except
  the one in use. On a phone a row of chips becomes one select with counts ("Ready to upload
  (3)"). Sort reads "Sort: Name ▾".
- **Selection bars** (`components/selection.tsx`): at rest only Select all and the count ("14
  topics"), at a fixed one-line height. Once a box is ticked: "2 of 14 topics selected", Clear
  selection and the bulk actions, each only when it applies to a ticked row, the destructive one
  last. The same on Projects, Trash, topic lists, Prompts and speakers.
- **Empty states teach**: one sentence on what the thing is for and one button that makes the
  first one ("No article prompts yet" with New article prompt). No illustrations, and no Sort
  over an empty list.
- **A list of one is that thing's page**, with no list around it.
- **A tab strip** has one ink-2 line under it saying what the open tab is for.

### Command palette

Ctrl+K (Cmd+K on a Mac) opens it anywhere. A screen offers its actions while it is mounted:

```tsx
useCommand({
  id: "project.next",
  title: "Approve and make the images", // named for its result
  group: "This project",
  context: project.title, // listed first, shown beside the title
  keywords: ["next", "approve"],
  shortcut: shortcuts.nextAction,
  run: () => approve.mutate(),
});
```

With nothing typed, the palette lists the last five commands run (Recent), then the commands about
the screen in front of the person (those with a `context`), then Create a video, then Go to with
exactly the rail's destinations in its order and words (Open Home … Open Settings; Open Channels
only with two or more channels), then the screen's other commands. `rank` sets the order (lower
first, default 0). Every other place to go (schedules, usage and costs, tutorials, the tour, the
welcome screen, each Settings page as "Open Settings: <page>") is `searchOnly` and waits until
something is typed. Switching channel ("Switch to …", "Show all channels") is offered only with two
or more channels.

Matching is fuzzy (letters in order, word starts and runs score higher). Several words match
across the title, the context and the keywords in any order, so "cleopatra image 3" finds "Make
image 3 again in Cleopatra". A `numbered` command takes the number typed with it and hands it to
`run(3)`. Arrow keys move, Enter runs, Esc closes; focus stays in the palette while it is open.

From anywhere (`components/global-commands.tsx`, searched only): Open <project>, Make image N
again in <project> (opens the project on Images and asks to make that image again, as its button
does), New schedule and Add topics to a schedule. By name (`components/entity-commands.tsx`):
Open template <name> (Templates with it marked, `?item=`), Edit prompt <name>, Edit intro
<name>, Edit outro <name>, Edit PDF theme <name>, Open schedule <name>, Open channel <name>. A
command that finishes on another screen goes there and leaves an intent that screen takes once
loaded (`lib/intents.ts`).

### Keyboard shortcuts

A command's `shortcut` is its label and its binding: the palette's provider runs it when the keys
are pressed, so the two cannot drift. Keys live in `lib/shortcuts.ts`; the button that does the
same thing carries `aria-keyshortcuts` (`ariaKeyShortcuts(shortcut)`). Keys without Ctrl wait
while a field, a textarea or an editable area has focus; Ctrl ones (Cmd on a Mac) work from a
field too. Nothing fires while the palette or a modal dialog is open. `?`, Help → Keyboard
shortcuts or "Show keyboard shortcuts" lists every key that works on the current screen.

| Keys | Does |
| --- | --- |
| Ctrl+K | Search or run a command |
| ? | Show keyboard shortcuts |
| C | Create |
| G then H / P / L / T / C / K / , | Open Home / Projects / Prompts / Templates / Calendar / Channels / Settings |
| G then S | Open schedules (the calendar's Schedules tab) |
| / | Search the list (Projects, Prompts, Intros and outros, Tutorials) |
| Shift+N | The project's next action (Soften and retry still asks at its button) |
| Shift+D | Copy the YouTube description |
| Ctrl+Enter | Create: See everything this run will do |
| Ctrl+S | Save in a prompt, intro or outro, or PDF theme editor |

### Toasts and notices

Acknowledgements are toasts (`kit/toast`), bottom right, above the bottom bar on a phone. A plain
toast stays 5 s; one with an action (Undo, Watch) stays 15 s; an error stays until it is
dismissed. Nothing leaves while the pointer is over the toasts or focus is inside them. An action
that can be taken back says so in its toast with Undo: a project or a selection moved to the
trash, Mark uploaded, a move to another channel, a value saved in place.

The end of a run is always said on the page, whatever the browser-notification switch: "Video
ready: <title>" with Watch. Browser notifications and sounds are extras.

A notice that needs an acknowledgement is a banner on the window's bottom edge
(`data-slot="usage-notice"`, the usage notice), never a modal; while it shows, the page, sticky
action bars and toasts sit above it (`--usage-notice-height`). A Dialog with
`dismissible={false}` is only for a dialog whose one action is the only way on: the tab that was
loaded before an update ("Slopify was updated", Reload).

Confirm dialogs: the title names the object ("Delete “Cleopatra”?"), one sentence names the
consequence, the action button repeats the verb with its object (Delete project). A destructive
dialog's way out keeps the thing ("Keep it", "Keep them", "Keep running"), which `ConfirmDialog`
uses by default; a neutral dialog's way out is Cancel. A make-again confirmation leads with the
price, then one plain sentence, says where the old one stays (Versions), and its button is
primary, not destructive ("Make all 4 images again"). A one-time reminder starts focus on the
answer that changes nothing, and both answers are secondary.

## Shell

From 768px up, every page has a 76px rail (`--rail-width`) in which each item is a 20px icon over
a 12px word. Top to bottom: the logo (goes Home); the lime Create key, 60px tall, a plus over
"Create" (key C); Home, Projects, Prompts, Templates, Calendar, Channels (only with two or more
channels) and Settings; "● 2 running" while runs are active (the lamp and count over the word,
to Home's Running); then, after a hairline at the foot, the update item (only while an update is
ready, waiting, installing or failed, in words), Search (opens Ctrl+K), Assistant, Help (a menu)
and Support Slopify (a menu; its word wraps onto two lines). Nothing else goes in the rail, and
nothing in it but the logo is a bare icon. The page fills the rest, up to 1680px.

Below 760px tall the rail closes up (42px items, an 18px icon, a 48px Create key), and its foot
stays pinned to the bottom, so Help is always in view; in a window shorter still the
destinations scroll under it.

A destination stays lit on its other addresses: Prompts on `/prompts`, `/entries`, `/library`;
Templates on `/templates`, `/designs`, `/design-templates`; Calendar on `/calendar`,
`/schedules`; Channels on `/channels`, `/ab-results` (with one channel these light Settings);
Settings on `/settings`, `/usage`, `/document-themes`, `/narration-aliases`. Help shows as
current on `/help/*`. Old addresses redirect: `/library` to Prompts, `/designs?tab=templates`
to Templates' poster tab, `/schedules` to the calendar's Schedules tab, `/usage` to Settings →
Usage. `/designs` itself is still the Designs page (the pictures and posters made), linked from
Templates and lit as Templates.

**Help** holds Start the tour, Tutorials, Keyboard shortcuts (desktop only), What's new, a
separator, then the update sentence and its one row (Check for updates, or Install update after
"Installing restarts Slopify; anything running finishes first."), then Download diagnostics (the
file a bug report needs, the same one Settings → About saves). **Support Slopify** holds a
"Support Slopify" heading over GitHub, Patreon and Buy Me a Coffee. The slogan and the version are not in
the rail; they are in Settings → About.

**On a phone** (below 768px) a top bar holds the logo and wordmark (the logo alone at 380px and
narrower), "● N running", Search and Help, all as words; Help also holds the Assistant, the update row and the support links, and
turns accent-ink while an update is ready. A bottom bar of five, about 60px tall: Home,
Projects, the lime Create in the centre, Prompts, and More (Templates, Calendar, Channels,
Settings). Nothing is reachable only through Ctrl+K.

**The channel picker** (`channels/current.tsx`) is "Showing: All channels ▾" in the page header
of Home, Projects and the calendar, a native select with no info button, shown only with two or
more channels. Home, the calendar and Projects then show only that channel's work;
`useCurrentChannel().includes(channelId)` answers whether something is in view, and the choice
is kept per browser and shared by its tabs. With one channel nothing filters and a stored pick
is ignored.

**The Assistant panel**: its first line says what it does; Answer with shows only when there is
a choice, and New chat only once there is a chat.

**The browser tab** names the page ("Prompts · Intros and outros", "Edit template", "What worked
on YouTube"); a project's tab names the project and, once one is picked, its section.

**Connection status** (`components/connection-status.tsx`). The page hears every change over one
event stream; while it is down, counts and progress would look current. A drop longer than
1.5 s shows "Reconnecting… Numbers on this page may be out of date." in one line pinned to the
top of the window; after 20 s it says Slopify can't be reached and to check that it is still
running; the browser going offline says Offline. When the stream is back the shell reloads every
list and the line says "Back online. The page is up to date." for 4 s. The line is a polite live
region, empty while live.

## Screens

### Home

`routes/home.tsx`. The header is one line: the date, Home, Showing (two or more channels) and
Open calendar (once a schedule exists); no Create, which is in the rail. The main column, in
order: Your first video (until the person has a project); Finished, the newest 6 finished
projects, uploaded or not, headed "4 videos · 3 ready to upload", with Watch (Open for work
without a video) and Download video; Needs you, decisions and failures, headed "2 decisions · 1
failed"; Running, each run as "Step 2 of 5 · Images · about 4 min left on this step", then the
videos waiting to start in queue order. A step with no time to tell shows no time. The side
column: Finished samples (until the person has finished work), Coming up, This week, Start from
a template. Marking a video uploaded changes its word on Home; it does not remove it.

### Projects

`routes/projects.tsx`. Search, the filter and the order (Newest first, Finished first, Recently
changed, Name (A–Z), Status) are in the address (`?q=`, `?show=`, `?sort=`). Fifty rows are
drawn, then Show more. Each row is a finished-work row (see Lists) with Open, Download video,
Mark uploaded and Delete; a row offers Undo of its Mark uploaded for a day, after which the
selection bar's Mark not uploaded reverses it. A row that waits in the video queue offers
Earlier, Later and Remove in place of Delete. Below an 860px list width a row's actions go under its
text; on a phone it leaves Delete to the selection bar. Ticked rows can be marked uploaded or
not, moved to another channel, made up to date with Make outdated parts again (one scope and cost
review for all of them first, samples left out) and deleted to the trash, each with Undo in its
toast where it can be taken back.

### Create

`routes/play.tsx` at `/play`. Create is one screen, in this order: the kind tiles in one row; Start
from <template>, and For <channel> with two or more channels; one full-width topic field labelled
by kind ("What's the video about?"), with "Title will be: …" under it once it differs; Another
topic; then the setup rows. The rows, in run order: Keywords, Article, Narration, Images, Video
and style (named Sound and captions or Shape and look by kind), Extras, Pauses and checks,
Channel. Each row has its name, where its values come from ("From Weekly lore" or "Changed
here"), one plain sentence of what the run will do that wraps and never truncates, and one
button: Change, Fix when the row has a problem, or Close <row> while it is open ("Close
narration"). One row is open at a time; the first problem row opens on arrival, never over a row
the person opened, and nothing is inserted above what they filled.

Problems come from one list (`play/problems.ts`), which feeds the row's red line, the one hint
under the main button ("Pick a voice first") and the drawer's "Before you can start". A row's
problem is an action ("Pick a voice") or a readiness sentence ("<Service> has no key yet: add one
in Settings, or pick another voice service."). Refusals on the title and keywords stay quiet until
the field is touched or the main button is pressed.

The 340px rail, top to bottom: how many it makes; "Expected length: about 10 min · 1,500 words"
(150 words a minute, edited in place); the estimate; the main button; its one hint; See everything
this run will do, which opens the drawer "Everything this run will do" beside the rail; the
preview line ("Captions: Barlow 48, bottom") with Watch a 6-second preview. Where the
drawer covers the rail's button (always below 900px), its foot carries the button and the hint.
On a phone the rail follows the form, the button first.

Inside a row: who does a stage is a group named for its role over Service and Model, with one
quiet line under Model ("<state> · Manage models ↗"), and Show 12 more models… and Type a model
ID… as the list's last entries. A source switch names its stage and puts the cost on the paid
choice ("Narration: Off | AI voice (paid per character) | My own audio file"). Optional outputs
are a checklist whose settings appear once ticked. The prompt at the heart of the run is chosen
from cards. Pauses read "Pause after the article (before the narration)" with the Home → Needs you
line; AI checks are one run-wide choice. A button that leaves Create says where it goes ("(opens
the design editor)").

A draft made from a template takes, for a writer or image service the template leaves empty,
what the first launch found, else the first service of that kind that answers, with its first
listed model; a fresh blank draft takes only what the first launch found.

### Prompts and Templates

**Prompts** (`/prompts`) lists the kinds down the left (about 196px, names wrap), every prompt
kind, then after a rule Intros and Outros, each with its count. Beside it is a list and detail;
above the list one line, "<Kind> prompts · <what it makes>", with search and Sort on the right.
Search spans every kind and puts the hit's kind in its row meta. A prompt's detail shows its text
as prose, "Asks you for" with its keywords, and one meta line ("Updated … · 3 versions · used by
2 templates", or "not used yet"); Compare versions only with two or more versions. Prompt text is
prose: Barlow at body size in full ink, spell check on, no line numbers. Slopify's keywords are
accent-ink letters; the person's own keywords (the questions Create asks) wear an accent tint with
a hairline accent ring (`components/slot-body.tsx`). In a mirror behind a textarea only paint
that takes no room is allowed: colour, background, ring, underline.

**Templates** (`/templates`) holds video templates and, on their own tab, poster templates. A
video template is a card: a still or a dashed shape box, a facts line, "Asks for:", the lime Make
a video (Create with the template picked and only the topic to type), Edit template, and ⋯ for
the rare actions. A template exported as a file is `<name>.slopify-template.zip`. Before a first
approval a template a schedule uses says "Used by 2 schedules"; Ready for schedules and Not ready
for schedules apply only after one.

Pages that used to sit under Library draw their own one-line header with a crumb to where they are
reached from: PDF themes from Create's PDF choice and Settings → Production defaults (PDF look),
Pronunciation from Settings → Voices, What worked on YouTube from the channel page. Crumbs never
start with "Library ›".

**The three setup editors** (Create, Edit template, a project's Edit settings) list the setup in
the order a run makes it and keep their own data models. Their section names are meant to be
one shared list in one vocabulary; today they differ, so move a name towards the others when you
touch it and don't add a fourth. Their names today:

| Create's rows | Edit settings | Edit template |
| --- | --- | --- |
| Keywords | Title and keywords | Topic & title |
| Article | Article | Article |
| Narration | Narration | Narration |
| Images | Images | Images |
| Video and style | Video and style, Captions | Video & captions, Thumbnail, Shorts, PDF |
| Extras | Outputs | |
| Pauses and checks | Pauses and checks | Pauses and checks |
| | | YouTube description & posts |
| Channel | Channel | Schedule |

Edit template's names come from one list
(`packages/app/src/slices/project-templates/setup-sections.ts`). A picker that copies a saved prompt
into a project is "Use a saved prompt for <name>"; "template" means a whole saved setup only.

### Settings

`routes/settings.tsx`. Settings is one flat list of pages with no second tab row, in four runs
separated by a 12px gap and no headings (`routes/settings-sections.ts`): Keys & services, Voices,
Models; Production defaults, Notifications, YouTube Studio and posting; Backup & storage, Trash,
General, Remote access, AI agents; About, Usage, What's new. Each page's title is its row's name,
said once. Rows are 36px and a long name wraps; on a phone the list is one select. An old
`?section=` still opens the page that holds its content now.

A service's setup goes in this order: its name and kind, what it does and costs in words, the key
Field, Test and Remove once a key exists, then "Where to get a key" as a Fold. Wherever a voice
key is suggested, OpenAI comes first with the reason: its key works at once with the bundled
voices. A link into Settings names what to open and how to come back
(`?section=providers&family=tts&provider=<id>&return=welcome&step=found`); the page opens that
service, scrolls only when it is not already in view, shows "Back to the welcome" or "Back to
Create" while `return` is set, and a primary "Done · back to …" once a key is saved. Download
diagnostics lives on About under "Something wrong?".

### Welcome

`/welcome` is three steps in order (What a short needs, Pick a style, Make your first short),
with the step in the address (`?step=style`) and the typed topic and style kept for the tab, so
a detour to Settings comes back to it. A step's header is one SectionHead line, the title with
"Step 1 of 3" as meta; only the current step is mounted; the ActionBar pins to the bottom with
Back, "Next: <step>" and, on the last step, "Make a 60-second short". The readiness list comes
from the same server check that refuses the short, one row per part: "Script · ● Ready · Claude
Code writes it with your sign-in.", or the gap with a secondary fix named verb and object ("Add
a voice key", "Add an image key", "Save a voice"). Leaving the welcome (Skip, Done, the first
project) answers the one-time questions such as start at login, so no dialog follows a fresh
install. After it is skipped it stays reachable from Help → Tutorials and Ctrl+K (Open the
welcome screen).

## The project page

`routes/project.tsx`. A title row, then a Workspace of one main column for the open section and one
sticky status column (about 300px) beside it. There is no left section rail: the status list's rows
lead to the sections. The page scrolls as every page does. Below 1180px the status column follows
the main column; on a phone nothing scrolls sideways and the title wraps.

**The title row**: the way back (to wherever the project was opened from), the title, the meta,
then the next action as the page's ONE primary, Edit settings (secondary; pressed again it closes
the settings) and a worded "More ▾". The title is one line, cut with an ellipsis and whole on
hover. The meta is the state lamp and word at body size, "finished Sep 27 17:18, 3 min" or
"started 14:02", the channel (two or more channels only) and "uploaded Sep 28"; it gives way
before the title. An audiobook or podcast says first what it is ("Audiobook", "Podcast episode").
When the row has less than 24rem for the title beside the actions, the actions wrap to a line of
their own. More holds Mark uploaded or Mark not uploaded, Choose what to remake… (only with
outdated outputs), Rename…, Save as template…, Move to channel… (two or more channels),
Posters & pictures…, a separator, then Delete project… (Cancel the run… while running). On a
sample More has one disabled row that says why. One line under the title row appears only for a
sample, a paused, stopped or queued run, a run waiting for an agent, and a finished short.

**The status column** holds one status list of what the project makes (Article, Narration, Images,
Video, Shorts, YouTube, PDF), each row a link to its section reading "● Name  State · one detail"
("● Images  Done · 4 images + 1 thumbnail", "● Shorts  Not made"); a running, failed or waiting row
gets a second line with what it is doing and the time left. All files ends the list, a place with no
lamp that keeps the lamp column. Progress leads the list only while the run goes or is paused. Under
it one cost line: "Cost $0.07 · 4 s of working time · See the breakdown" ("Cost so far" while
running). Nothing else, except Make the next chapter on a finished audiobook and the video queue's
count while videos wait.

**Where it opens**: where the next action points (a failed step, a held review, a wait, outdated
work), else on the stage the run is at. A finished video opens on Video, with the player, its
downloads and Copy description in the first screen at 1440×900. The address keeps the section
(`?section=images`; also `outputs` for All files, `shorts`, `youtube`, `live` for Progress, `cost`,
`settings`, `checkpoints` for Pauses and checks, `history` for Versions); old addresses still
work.

**Each section** leads with what it made, its downloads in sight and one way to make it again.
The section head has ONE make-again button, named for its result with its cost on it ("Make the
video again (free)", "Make all 4 images again · 4 image calls", "Make the narration again · voice
calls", "Write the article again · AI calls"), confirmed first with what it replaces and costs.
The per-piece form sits on the piece ("Make this image again"). Under the files, one facts line
a person can use: "3 min 5 s · 16:9 · 10 MB · loudness set for YouTube" (`MetaLine`);
measurements (LUFS, dBTP, the narration's parts) go behind a Technical details fold. A section
head does not repeat what the status list says. The full review of outdated work stays in More
and Ctrl+K. Section callouts (the next action beside its item) show at every width.

**Video**: the player is capped at 720px; with a column of 760px or more, a 300px side column
beside it holds the downloads, Open folder, the subtitle file links, the facts, chapters, Copy
description and Copy tags, and Read the narration; narrower, it stacks under the player. An
audiobook or podcast leads with its listening file. Shorts are 9:16 players in the shorts grid.
The thumbnail is the first tile of the Images grid, named in its caption, with "See it as YouTube
shows it" in sight.

**Narration** reads as flowing paragraphs at the reading measure, each opening with its time; a
heading the narration reads out is its own bold line. The words are the play target, and one line
beside the search says so ("Press a line to play from there."). The spoken line is tinted, with
one worded Fix this line under it. Search the narration and Copy the text are in sight; there is
no inner scroll box for 150 lines or fewer.

**YouTube**: Description, Tags, Pinned comment, Other titles, Release and YouTube links. Text that
will be pasted is shown once, exactly as pasted, in a well, with "Copy <object>" in its head and
"Edit <part>" under it. A paid rewrite is one button, "Write the description again · 1 AI call",
never on a part's head. Copy for YouTube Studio opens the drawer that lays out the file, title,
description, thumbnails and tags in the order YouTube Studio asks for them; a list of what is
missing before it is headed "Before you upload".

**Edit settings** always shows the editor, in two tabs, Settings and Versions, with the sections
in the order of the table above. After Save changes it opens again on the saved version at the
section that was open, with "Saved as a new version. Nothing is made again until you choose to."
in the action bar's status; only a discard of real changes leaves it shut, with Undo. Versions
shows one line while there is one version; with several, one row each, newest first, and Restore
(confirmed) on earlier rows. A paid or consequential button in settings carries one visible line
under it with its cost and when it happens. All files lists one row per output, its other files
as worded links under it and its main file as a secondary download, with one picture frame size,
the name linking to its section and "● State · made <date>"; a next-step link appears
only when the output is not current ("Open PDF to make it again, or keep this version").

**The read-only sample**: controls that would spend or save are disabled with "Read-only sample.
Press Make my own copy first.", per-tile paid actions are hidden, and the page's sample line says
it. Its settings stay readable section by section with their fields disabled.

**Player.** Every video that plays uses `kit/player`, never the browser's own controls (a muted
preview inside a MediaFrame may stay plain). Before it starts: the poster and a big play key in
the middle (drawn lime today, a second lime beside the page's next action: see The lime). Then a
bar on a dark gradient: play/pause, current / total time in tabular numerals, the lime track (buffered range behind, chapter marks with their title on hover, a time
tip under the pointer, click or drag to seek, touch too), mute and volume, playback speed 0.75–2×
in its own menu, captions (only when there is a text track), picture in picture (when the browser
has it) and full screen on the whole player. The bar hides while the video plays and nobody
touches it, never while a menu is open or focus is inside. Keys, anywhere inside the player:
Space or K play and pause, J and L jump 10 s, ← and → 5 s, M mutes, F full screen, C captions,
0–9 jump to that tenth. Seek and volume are sliders whose value reads in words ("12:40 of
2:04:11"). Props: `src`, `poster`, `label`, `portrait` (9:16), `captions`, `chapters`
(`{ start, title }[]`), `ref` to the `<video>`, `className`, `children`. The screen is dark in
both themes, so the bar's colours are fixed. A narrow player puts the track on its own row and
drops time, volume and speed; the keys still do all of it. Narration, intros and outros and
listening files play in the AudioPlayer, the same bar on its own.

Every project action is a Ctrl+K command: the next action by its name (Shift+N), Pause the run or
Continue the run, Copy for YouTube Studio, Edit settings, Choose what to remake, the outdated
groups, Save as template, Cancel the run, Make my own copy, Copy project ID, Copy description
(Shift+D), Copy tags, Make image N again and Make on-screen card N again.

### The next action

A project shows exactly one next action, named for its result, only when it applies: in the title
row as the page's one primary button, and beside the item it affects as a callout with the same
action as a secondary button. `project/next-action.ts` decides it from the project's state in one
pure function (`nextActionFor`, every row tested in `next-action.test.ts`); the title row, the
section callouts and Ctrl+K all read it. A next-action button shows its busy words ("Pausing…")
only for its own press. The first situation that holds wins, in this order:

| Situation | When | Status | Action | Beside |
| --- | --- | --- | --- | --- |
| Sample | the bundled sample project | Sample project | Make my own copy | none |
| Paused | the project is paused | Paused | Continue the run | none |
| Failed | a step failed and will not retry by itself | Failed | the fix-it (below), else Try images again / Try the article again | the step's section, with Error details |
| Waiting for the agent | the run is parked on an External agent (MCP) review and nothing else holds it | Waiting for the agent | none: it carries on once the agent answers, or the review passes by itself 2 hours after it was asked | none |
| Held | a pause holds work for review | Waiting for your review | Approve and make the images (named for what approving makes: the narration, the images, the video) | the section of the step ready to review |
| Prepared | a schedule prepared it ahead and its own pause before the video now holds it | Prepared | Approve and make the video (approving now makes it before its day) | Video |
| Waiting | a CLI plan's limit is reached, or a step waits to retry by itself | Waiting for limits / Waiting to try again | none: when it carries on, in words | the waiting stage's section |
| Running | the run is at work | Running | Pause | none (the section shows progress) |
| Kept as is | pending and set aside with Keep as is | Kept as is | Copy for YouTube Studio when the video is ready, else none | YouTube, or none |
| Stopped | canceled, failed without a failed step, or resumable work nothing will start (a restart stopped the run) | Stopped / Canceled | Continue the run (after a Cancel, only work taken up again runs; canceled steps stay canceled) | none |
| Queued | pending in the queue | Queued | none | none |
| Outdated | the last saved edit made outputs outdated | Outdated | Remake 3 outdated images (the first group in run order: article, narration, establishing image, images, animated images, thumbnails, video, shorts, YouTube description, PDF) | that group's section |
| Done (a short) | a short-mode project is done | Done | Make the full video on this topic (Create opens on a long video with the same topic, starter template and services) | none |
| Done | done or done with problems, and a video exists | Done | Copy for YouTube Studio | YouTube |

The fix-it of a failed step (`slices/fixes/rules.ts`): a signed-out CLI offers Copy sign-in
command (`codex login`, `claude auth login`) and Check again, which asks that CLI alone whether it
is signed in (`POST /api/providers/health?provider=`) and then tries the step again; a refused
image prompt offers Soften and retry (confirmed); a refused text prompt and a retired model open
the settings (Edit the prompt, Switch model); a rejected key opens that service in Settings → Keys
& services; a full disk offers Free space, which opens Settings → Backup & storage. The same rules
and buttons (`fixes/fix-actions.tsx`) serve a schedule's failed topic generation (Check again asks
for topics again) and a cast picture that could not be made (Check again makes it again; a refused
prompt offers Reword the picture). Home's Needs you offers Copy sign-in command beside Open to
retry.

Making outdated work again uses the rebuild flow for exactly those outputs: a preview of the
outdated outputs' work, started at once when it needs no consent (nothing blocked, no provided
content to confirm, every cost known), otherwise opened in the rebuild review ("Make 3 outputs
again") so the person sees why.

## Fewer clicks

Every common task is counted in clicks from the screen it starts on to done, and
`packages/web/src/click-budget.test.tsx` fails when one goes over its budget. A click is a press
on a button, link, row or field (focusing a field to type is one; typing and Enter are not);
picking from a select is two. Change a value where it is shown when that is safe and undoable
(the change saves at once and its notice carries Undo); keep menus for the rare actions.

| Task | The clicks, as the test counts them | Budget |
| --- | --- | --- |
| Make a video from Home with keys entered | Create, the topic field, Make the video. Create starts from the starter template with the services the first launch found; no row needs a Fix | 3 |
| Queue a video from another template | Start from (a select: 2), the topic field, Make the video | 4 |
| Make an image again | Images in the status list, Make this image again on its tile (at rest, no hover or menu), Make it again in the confirmation | 3 |
| Copy the description | Copy description beside the player: a finished video opens on Video | 1 |
| Edit a prompt | Edit on its row, the text, Save | 3 |
| Change a schedule's topics | New topic in the schedule's queue, type, Enter. The full form (Edit, the topics field, Save changes) is 3 and stays for a topic's own keyword values | 1 |

The confirmation before making an image again stays: it spends money on a paid model and cannot
be undone.

## Rules in short

- **Labels.** A control's label says what it does, with a verb and its object; where that is not
  enough, one visible sentence under it. The info button only for a consequence that needs a
  paragraph, beside a field's label, never beside a button, a heading or a row's title, and
  never two in one field.
- **Words.** One word per thing (Words). Action buttons are named for their result, with their
  object and, when they spend, their cost: "Make all 4 images again · 4 image calls", "Make the
  video again (free)". A stopped run is Continue the run; a schedule is Pause and Resume.
  *Delete* sends a thing to the trash or removes it for good (the dialog says which); *Remove*
  takes an item out of a list or an unsaved form; *Discard* throws away unsaved edits.
- **The lime.** One primary control per area, for the next thing to do. Downloads are secondary.
  A control that cannot act wears no lime. The Player's big lime play key is a known break.
- **Status.** A lamp never appears without its word. One word per state, from `state-words.ts`.
- **Hide, don't grey.** A control that cannot apply is not drawn; one that stays disabled says
  why in visible text.
- **Media.** A fixed aspect frame, a caption, actions at rest under it in words, a visible Full
  size, one gallery grid; video in the kit Player with its poster.
- **Folds.** A chevron, a name for what it holds, the current value in words, Show or Hide.
- **Density.** Page header one line; sections 12-16px apart; no blank band waiting for a status;
  list rows dense enough for 8 or more in 900px; lists of finished work show the thumbnail, the
  length, what was made and when, with visible Watch or Open and Download.
- **Empty states** say what the thing is for in one sentence and offer one button that makes the
  first one.
- **Saving.** Save never spends; a switch saves as it moves; a value shown in place saves at once
  with Undo; Save appears, or lights, only when something changed, except in the prompt, intro
  and outro, and PDF theme editors, where it holds only for a problem it names beside it.
- **Dates.** `startedAt` (clock time today, the date otherwise, the year when not this year) and
  `shortDate` from `lib/utils`; a short or relative time carries `exactTime` as its title. Errors
  say what failed, why, and the one thing that fixes it, with the fix as the button.
- **Colour.** `ground` behind the page, one `surface` for the working area, `raised` only for what
  floats. Never a surface inside a surface: sections are separated by space and a `line` hairline.
  Status colours always come with a word. Media sits on `screen`.
- **Type.** Barlow to read, Barlow Condensed for titles, big numbers and kickers, JetBrains Mono
  for `code`. `title-1` once per page, in the page header; `title-2` section heads; `title-3`
  sub-heads and row titles; `reading` at a 68ch measure for long text; help lines at 13/19 in
  ink-2.
- **Layout.** Use the width. Workspace, List and detail, Board. A column lays out by its own
  width. Nothing scrolls sideways. Labels above fields, groups in `.sl-fields`. Section heads
  carry their actions on the right: primary, secondary, quiet, More.
- **Actions.** Five button kinds, one meaning each (the icon kind only for the few controls
  named under Links and buttons); the lime key is the rail's Create and Create's Make. Actions
  are buttons, links go somewhere. A project shows exactly one primary action for its situation
  (the next action). Row actions are visible, in words. Every frequent action is in the palette.
- **States and motion.** Hover lifts to `raised`, focus draws a 2px ring offset 2px. 120ms for
  hover and toggles, 200ms for things entering; reduced motion stops the pulse and the slides.
  Elevation is only `shadow-pop` and `shadow-dialog` (the lime key's edge is its own
  `shadow-key`).
- **Icons.** Lucide at 16px (20px in the app rail), 1.75 stroke. An icon never replaces a word:
  the rail has a word under every icon, and an icon-only button is kept only for the few
  controls Links and buttons names (a player's controls, Close, the Lightbox's paging and zoom,
  a search's matches, Show or Hide on a secret, ⋯ for a row's More), always with an
  `aria-label` and the kit's tooltip.
