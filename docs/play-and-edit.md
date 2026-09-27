# Play and Edit project

Play sets up a new video; Edit project changes one that exists. Everything that can be set in
one should be settable in the other, with the same control where the two share a model. This
page is the audit of where they stand (3.0), what was closed, and what is still open.

## Play in 3.0

Play is one path from topic to queue:

1. **Template.** Picking one opens a fresh draft made from it. A topic already typed comes along.
2. **Topic.** A title that names keywords (`D&D Lore: {{Topic}}`) asks for those keywords here,
   with the title they make beneath. A title without keywords is typed itself.
3. **More videos from the same setup.** Each chip is one more video with its own topic (the
   draft's `variants`; Start still refuses a review that covers a different number of videos).
   Press a chip to change that video's title and keywords in a side panel.
4. **Summary rows**: Title and keywords, Article, Narration, Images, Video and style, Outputs,
   Reviews, Channel. Each is one line of what the run will do. Change opens the stage's own
   editor under the row (Reviews opens the side panel with checkpoints, automatic reviews, the
   whole setup and the resolved prompts). Rows that need attention when a draft opens start open.
5. **The right rail**: the rendered style preview, the videos count, the estimate (refreshed once
   typing pauses) and the Play key. When the key can't start, the reason is right under it, and
   pressing it opens and focuses the field.

Every Play action is in the command palette (Ctrl+K): Start or Queue, Add a topic, Save as
template, Review the whole setup, Pick a template, and Change for each row.

**Save as template** keeps the settings, never one video's values: keywords the project title
names are saved empty, other keywords (word counts, a style) keep their values, and the extra
videos are dropped. The dialog says which. The server applies the same rule to every template
save, including Templates → Save a setup and Edit project → Save as template
(`slices/project-templates/one-off.ts`).

**Keywords** are drawn by one component (`components/keyword-list.tsx`) in Play, Edit project →
Prompts and Templates → Keywords, each keyword with everything it feeds.

## The audit

| Setting | Play | Edit project | Shared component | State |
| --- | --- | --- | --- | --- |
| Title | Topic field / Title and keywords row | Inputs | none (both plain inputs, `titleMax`) | same |
| Format | Video and style | Inputs | `FormatPicker` | same |
| Stage sources | a switch per stage row | Inputs, a select per stage | `sourceOptions` | same options, different control |
| Research (source, notes) | Article | Inputs | none | same |
| Article prompt, supplied article | Article | Prompts (template), Article | none | same |
| Text generation (provider, model, thinking) | Article | Providers | `ProviderPicker`, `ModelPicker`, `ThinkingPicker` | same |
| Narration (provider, model, voice) | Narration | Providers | the pickers | same |
| Pronunciation glossary switches | Narration › Advanced | Providers | `PronunciationGlossary` | same |
| Narration Preparation | Narration › Advanced | Providers + Prompts | `NarrationPreparation` | same |
| Intro, outro | Narration › Advanced | Inputs + Prompts | none | same |
| Chunking | Narration › Advanced | Providers | `ChunkingControl` | same |
| Image provider, model, effort | Images | Providers | the pickers | same |
| Image prompts and Numbers | Images | Images (which prompts, each Number); Prompts edits each prompt's text; Images adds or removes single images | `ImagePrompts` | **closed in 3.0**: saving replans the images (`slices/revisions/image-plan.ts`) |
| Establishing image (+ thumbnail too) | Images | Images | `ReferenceImage` | same |
| Thumbnail prompt, 1 or 3 thumbnails | Outputs | Prompts, Images | `ThumbnailCountPicker` | same |
| Supplied audio, images, thumbnail | their rows | Replace provided … | none | same |
| Captions (mode, font, size, position, upload) | Video and style | Subtitles | `SubtitleControls` | same |
| Style preview (rendered) | right rail | Subtitles | `StylePreview` | same |
| Seconds per image, zoom, motion, edge silence | Video and style | Inputs | none | same |
| Silence between segments | Video and style (new, per run; empty uses Settings) | Inputs | none | **closed in 3.0** |
| Cuts, transitions, the Look, chapter cards, animate images | Video and style | Inputs | `useVideoEditControls` | same |
| PDF and its theme | Outputs | Inputs | `DocumentThemePicker` | same |
| YouTube description + prompt | Outputs | Prompts | `YoutubeDescription` | same |
| Shorts (all fields, music) | Outputs | Shorts | `Shorts` | same |
| Automatic reviews | Reviews (side panel) | Reviews | `ReviewSettings` | same |
| Checkpoints | Reviews (side panel) | the project's Checkpoints tab | none | same settings, another surface |
| Keyword values | Topic + Title and keywords | Prompts › Keywords | `KeywordList` | **shared in 3.0** |
| Channel, brand kit | Channel | Inputs › Channel | none (both a select and a switch) | **closed in 3.0**: saving a change applies the kit again (`slices/channels/rebrand.ts`) |
| Cast (and the aliases on cast members) | follows the channel | follows the channel | none | **closed in 3.0**, with the channel |
| Title style, end screen | from the brand kit only | from the brand kit only | none | neither side sets them directly |
| Voice formats and speakers (multiple voices) | Narration | Providers | the speakers panel from main | same |
| Narration aliases | on cast members (Channels), used by both | on cast members | none | same |

## Closed in 3.0

- **Image prompts and Numbers in Edit project.** Images → Image prompts is Play's control. The
  edit carries the new `imagePrompts`; its image definitions and prompt wording stay in the
  numbering the revision was saved with until saving, when `saveRevision` plans them again
  (`slices/revisions/image-plan.ts`, the layout Play's run plans: prompts in selection order,
  Number images each). A prompt is matched by name. One left as it was keeps its definitions,
  so its images keep their fingerprints and are reused; a raised Number adds definitions right
  after the prompt's last image, a lowered one drops its last ones, an unticked prompt's
  definitions go, and a newly ticked one gets its Library wording and Number new images at the
  end. Images written or uploaded one at a time stay where they are. The control says what
  saving will do, worked out with the same function. The rebuild review then lists only the
  new images to make.
- **Channel and brand kit in Edit project.** Inputs › Channel picks the channel and "Use the
  channel's brand kit". When either changes, saving takes the new channel's cast as it is now
  and applies the kit again (`slices/channels/rebrand.ts`): a setting at its default, or at the
  value the old channel's kit gave it, takes the new kit's (caption font and colours, title
  style, end screen, intro and outro, document theme); one set by hand stays. Turning the kit
  off takes the old kit's values off and keeps the cast, as on Play. The project moves to the
  channel (`project_channels`) with the saved revision, and a restored revision takes its
  channel back. `useBrandKit` is saved only when off, so every existing project keeps its config
  and fingerprints; saving any other change leaves the channel, cast and brand as they were.

## Still open

Nothing in this audit.
