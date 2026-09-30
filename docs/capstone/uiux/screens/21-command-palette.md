---
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: 5348fa474ed3
paths_covered:
  - ":(top)packages/web/src/components/kit/command-palette.tsx"
  - ":(top)packages/web/src/components/global-commands.tsx"
  - ":(top)packages/web/src/components/shell.tsx"
  - ":(top)packages/web/src/lib/shortcuts.ts"
  - ":(top)packages/web/src/lib/intents.ts"
  - ":(top)packages/web/src/tutorials/commands.tsx"
---

# Command palette and keyboard shortcuts

## Mode & job

Operate mode, app-wide overlay. Ctrl+K (Cmd+K on a Mac) opens a search-or-run palette listing what can be done from the current screen; the `?` key opens a "Keyboard shortcuts" sheet (`packages/web/src/components/kit/command-palette.tsx:21-25`, `packages/web/src/components/kit/command-palette.tsx:358-378`). Screens register commands with `useCommand` while mounted, so the list always reflects the page in front of the person (`packages/web/src/components/kit/command-palette.tsx:100-130`). A command with a `shortcut` is bound to those keys by the same provider, so the label shown and the key that works come from one registration (`packages/web/src/components/kit/command-palette.tsx:42-45`). All app shortcuts are declared in one map (`packages/web/src/lib/shortcuts.ts:1-22`). `CommandPaletteProvider` wraps the whole shell inside `TutorialProvider` (`packages/web/src/components/shell.tsx:166-180`).

## Composition

**Openers.**

| Opener | Where | Source |
|---|---|---|
| `sl-searchbtn` "Search or run a command" with `SearchIcon` and `Ctrl` `K` key caps | Sidebar, under the wordmark (≥768px) | `packages/web/src/components/shell.tsx:376-383`, `packages/web/src/styles/shell.css:533-554` |
| Kit `IconButton` "Search or run a command" | Phone top bar (<768px) | `packages/web/src/components/shell.tsx:456-458` |
| Ctrl/Cmd+K (no Alt) | Anywhere; toggles open/closed, even from a text field | `packages/web/src/components/kit/command-palette.tsx:374-378` |

**Palette.** A Radix `Dialog` portal: `sl-overlay` scrim (fixed, `z-70`, `--color-scrim`) and content `sl-overlay-content sl-palette sl-enter`, fixed 72px from the top, centred, `min(640px, 100% − 32px)` wide, `radius-media`, `raised` background, `shadow-dialog`, 1px `line` border; sr-only title "Command palette" (`packages/web/src/components/kit/command-palette.tsx:497-514`, `packages/web/src/styles/shell.css:149-176`, `packages/web/src/styles/kit.css:1253-1260`). Inside (`packages/web/src/components/kit/command-palette.tsx:579-648`):

1. Input row `sl-palette__input`: 52px tall, 17px text, bottom rule; `SearchIcon` 18px, autofocused `role="combobox"` input with placeholder and label "Search or run a command", `Esc` key cap on the right (`packages/web/src/styles/kit.css:1261-1270`, `packages/web/src/styles/shell.css:177-195`).
2. `role="listbox"` "Commands", scrolling up to `min(420px, 100vh − 240px)` (`packages/web/src/styles/shell.css:196-200`). Per group a `role="group"` with an `sl-kicker` heading; each option is a 40px row: optional icon (16px `ink-2`), truncated title, `sl-palette__meta` context (13px `ink-3`, pushed right), and `ShortcutKeys` caps; the active option has `accent-tint` (`packages/web/src/styles/kit.css:1271-1290`, `packages/web/src/styles/shell.css:201-213`).

Keys inside: ArrowDown/ArrowUp wrap, Home/End jump, Enter runs the active command and closes; mouse move sets the active row, click runs it (`packages/web/src/components/kit/command-palette.tsx:560-577`, `packages/web/src/components/kit/command-palette.tsx:628-631`). The active option scrolls into view (`packages/web/src/components/kit/command-palette.tsx:545-549`).

**Matching and order** (`packages/web/src/components/kit/command-palette.tsx:162-270`):

- Fuzzy subsequence score; consecutive characters, word starts and a whole-word prefix score higher. Fields: title (+2), context (+1), keywords and group (+0).
- A multi-word query matches as a phrase against one field or word by word across fields, in any order; a word typed in full gets +4.
- A `numbered` command takes a number from the query: "regenerate image 3" retitles to `numbered(3)` and runs with 3.
- Empty query: `searchOnly` commands are hidden; commands with a `context` (about the screen in front) list first, then registration order. With a query: by score, then context, then order.
- Groups appear in the order of their best-ranked command.

**Shortcuts** (`packages/web/src/components/kit/command-palette.tsx:272-421`, `packages/web/src/lib/shortcuts.ts:6-22`):

| Keys | Command | Registered in |
|---|---|---|
| Ctrl+K | Open/close the palette (fixed) | `components/kit/command-palette.tsx:374-378` |
| Esc | Close a dialog, a drawer or the palette (listed, handled by Radix) | `components/kit/command-palette.tsx:471` |
| `?` | Show keyboard shortcuts | `components/kit/command-palette.tsx:358-369` |
| `C` | New project → `/play` | `components/shell.tsx:222-229` |
| G then H / P / C / S / L / K / , | Open home / projects / calendar / schedules / library / channels / settings | `components/shell.tsx:189-260` |
| `/` | Search <list> (Projects, Prompts, Intros and outros, Tutorials) | `components/kit/command-palette.tsx:132-150`, `routes/projects.tsx:125`, `routes/prompts.tsx:44`, `routes/entries.tsx:45`, `routes/tutorials.tsx:195` |
| Shift+N | The project's next action | `routes/project.tsx:193-199` |
| Shift+D | Copy description | `project/body-youtube.tsx:139-145` |
| Ctrl+Enter | Review the whole setup (Play) | `routes/play.tsx:483-489` |
| Ctrl+S | Save (library editors) | `components/editor-actions.tsx:40-45` |

Binding rules: a sequence is two plain keys pressed within 1500ms; letters without Ctrl are ignored while focus is in a text field, select, textarea or contenteditable, but Ctrl chords still fire; nothing fires while the palette or any open dialog/alertdialog is up; when two commands share a key, the one with a context wins, then the latest registered (`packages/web/src/components/kit/command-palette.tsx:315-343`, `packages/web/src/components/kit/command-palette.tsx:379-418`). Buttons that do the same thing carry `aria-keyshortcuts` from `ariaKeyShortcuts` (Ctrl chords as `Control+X Meta+X`; sequences get none) (`packages/web/src/components/kit/command-palette.tsx:297-306`, `packages/web/src/components/shell.tsx:413`).

**Shortcuts sheet.** Kit `Dialog` "Keyboard shortcuts", description "Ctrl works as Cmd on a Mac. Keys without Ctrl wait while you type in a field. A screen's own shortcuts are listed while it is open." Body: a two-column `dl` (`text-small`), Ctrl+K and Esc first, then every registered command with a shortcut, one row per key combination, sorted by group then title; keys render as `sl-kbd` caps with "then" between sequence keys (`packages/web/src/components/kit/command-palette.tsx:433-495`, `packages/web/src/styles/kit.css:1291-1302`).

**Always-registered commands** (mounted by the shell):

| Group | Commands | Source |
|---|---|---|
| Go to | Open home, Open projects, Open calendar, Open schedules (`/calendar?tab=schedules`), Open library (`/prompts`), Open settings, Open channels, Open tutorials, Open usage and costs (`/settings?section=usage`), Show patch notes | `packages/web/src/components/shell.tsx:183-280`, `packages/web/src/patch-notes/popup.tsx:86-94` |
| Create | New project; New schedule and Add to calendar (search-only, hidden where the target screen registers its own) | `packages/web/src/components/shell.tsx:222-229`, `packages/web/src/components/global-commands.tsx:15-69` |
| Channel | Show all channels; Switch to <name> per channel | `packages/web/src/components/shell.tsx:214-220`, `packages/web/src/components/shell.tsx:282-300` |
| Projects | Open <title>; Regenerate an image in <title> (numbered: "Regenerate image N in <title>", only when the project's images are not off) — search-only, one set per project except the one open | `packages/web/src/components/global-commands.tsx:71-126` |
| Tutorials | Open tutorial: <title>, search-only, one per wiki page | `packages/web/src/tutorials/commands.tsx:8-35` |
| Help | Show keyboard shortcuts | `packages/web/src/components/kit/command-palette.tsx:358-369` |

A command that finishes on another screen leaves an intent (`schedules.new`, `calendar.add`, `project.<id>.show-images`, `project.<id>.regenerate-image`) the target screen takes once mounted; an intent not taken within 10s is dropped (`packages/web/src/lib/intents.ts:1-37`).

**Screen-registered commands** (present only while the screen is mounted):

| Screen | Group | Commands | Source |
|---|---|---|---|
| Home | Needs you / Ready to upload | <next-action label> or "Open the held run"; Mark uploaded — each with the project title as context | `packages/web/src/home/needs-you.tsx:156-160`, `packages/web/src/home/ready.tsx:50-54` |
| Projects | Projects | Show projects that need you, Show videos ready to upload, Show failed projects | `packages/web/src/routes/projects.tsx:147-165` |
| Project | This project | Next action (Shift+N), Pause/Continue the run, Prepare upload, Edit project settings, Choose what to remake, Save as template, Cancel the run, Remake <group> / Remake everything outdated, Make my own copy, Open the project folder, Copy description (Shift+D), Copy tags, Copy pinned comment, Regenerate the thumbnail / thumbnail N, Regenerate an image / on-screen card (numbered, search-only) | `packages/web/src/routes/project.tsx:193-310`, `packages/web/src/project/body-video.tsx:55-59`, `packages/web/src/project/body-youtube.tsx:139-166`, `packages/web/src/project/body-thumbnail.tsx:153-157`, `packages/web/src/project/regenerate-by-number.tsx:54-73` |
| Play | Play | <start label> (context = title or "New project"), Add a topic for another video, Save as template, Review the whole setup (Ctrl+Enter), Pick a template, Change <row> per setup row | `packages/web/src/routes/play.tsx:456-495`, `packages/web/src/routes/play.tsx:604-612` |
| Calendar | Calendar | Add to calendar, Show the schedules, Show the calendar as weeks, Show the calendar as a list, Queue all suggested topics (per schedule) | `packages/web/src/routes/calendar.tsx:216-243`, `packages/web/src/calendar/suggestions.tsx:102-106` |
| Schedules tab | Schedules | New schedule; Pause/Resume schedule (context = schedule name) | `packages/web/src/schedules/view.tsx:143-146`, `packages/web/src/schedules/view.tsx:650-664` |
| Channels / Channel | Channels / Channel | New channel; Add to cast (context = channel name) | `packages/web/src/routes/channels.tsx:76`, `packages/web/src/routes/channel.tsx:76-80` |
| Library (all its routes) | Library | New prompt, New intro or outro, New document theme, Open prompts, Open intros and outros, Open templates, Open document themes; Save a setup as a template on Templates | `packages/web/src/routes/library.tsx:45-106`, `packages/web/src/routes/templates.tsx:212-215` |
| Library editors | This editor | Save (Ctrl+S) | `packages/web/src/components/editor-actions.tsx:40-45` |
| Settings | Settings | Check all providers, Back up now, Download diagnostics, Export everything (context "Backup & storage"), Check for new models (context "Models") | `packages/web/src/routes/settings.tsx:211-241`, `packages/web/src/routes/settings.tsx:471-475`, `packages/web/src/components/catalogue.tsx:112-116` |

The dev-only design gallery registers two "Design gallery" commands (`packages/web/src/routes/design.tsx:135-146`); excluded here.

## States

| State | Trigger | Render |
|---|---|---|
| Closed | default | Nothing rendered; shortcuts listen on `window` (`packages/web/src/components/kit/command-palette.tsx:419-420`) |
| Open, empty query | palette opened | Every non-search-only command, context-bearing first (`packages/web/src/components/kit/command-palette.tsx:246`, `packages/web/src/components/kit/command-palette.tsx:264-266`) |
| No commands | registry empty | `sl-palette__empty` "No commands here yet." (`packages/web/src/components/kit/command-palette.tsx:605-608`, `packages/web/src/styles/shell.css:214-219`) |
| No match | query matches nothing | `Nothing matches "<query>". Try fewer letters or another word.` (`packages/web/src/components/kit/command-palette.tsx:609`) |
| Run | Enter or click | Palette closes, then the command runs (`packages/web/src/components/kit/command-palette.tsx:551-558`) |
| Reopen | Ctrl+K again | Query and active row reset; `PaletteBody` remounts with the dialog (`packages/web/src/components/kit/command-palette.tsx:525-526`) |
| Sheet open | `?` outside a field | Kit `Dialog`; the palette's key bindings are suspended while it is open (`packages/web/src/components/kit/command-palette.tsx:326-328`, `packages/web/src/components/kit/command-palette.tsx:379`) |

## Motion

- Palette content enters with `sl-enter` (`enter`: fade and 4px rise, 200ms ease-out), none under reduced motion (`packages/web/src/styles/shell.css:165-172`, `packages/web/src/styles/index.css:205-206`).
- The shortcuts sheet uses the kit `Dialog`'s entrance (`packages/web/src/components/kit/dialog.tsx:13-50`).
- The active option has no transition; it changes background immediately (`packages/web/src/styles/kit.css:1283-1285`).

## Copy

- "Search or run a command", "Command palette", "Commands", "Esc" (`packages/web/src/components/kit/command-palette.tsx:508`, `packages/web/src/components/kit/command-palette.tsx:591-604`).
- Empty lines: "No commands here yet.", `Nothing matches "<query>". Try fewer letters or another word.` (`packages/web/src/components/kit/command-palette.tsx:607-609`).
- Sheet: "Keyboard shortcuts", its description, "Search or run a command", "Close a dialog, a drawer or the palette", "then" between sequence keys (`packages/web/src/components/kit/command-palette.tsx:440`, `packages/web/src/components/kit/command-palette.tsx:469-478`).
- Command titles are named for their result, verb first ("Open settings", "Approve and render") (`packages/web/src/components/kit/command-palette.tsx:30`).

## Not in play

- Recent or frequently used commands: absent; order is score, context, then registration (`packages/web/src/components/kit/command-palette.tsx:264-268`).
- User-remappable shortcuts: absent; keys are fixed in `packages/web/src/lib/shortcuts.ts:6-22`.
- Nested pages or argument prompts inside the palette: absent; the only argument is a number typed with a `numbered` command (`packages/web/src/components/kit/command-palette.tsx:46-48`).
- Searching tutorial text from the palette: absent; only page titles ("Open tutorial: …") are listed; full-text search lives on Help → Tutorials (`packages/web/src/tutorials/commands.tsx:22-33`).
- Icons on registered commands: the `icon` field exists but no registration in the app passes one (`packages/web/src/components/kit/command-palette.tsx:41`).
- Shortcut hints for sequences in `aria-keyshortcuts`: none (`packages/web/src/components/kit/command-palette.tsx:297-302`).
