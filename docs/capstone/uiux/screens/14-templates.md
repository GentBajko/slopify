---
generated_at_commit: d6a72d6428ff
generated_date: '2026-10-18'
capstone_version: 7.0.1
content_hash: a9c5ff651ebc
paths_covered:
  - ":(top)packages/web/src/routes/templates.tsx"
  - ":(top)packages/web/src/routes/library.tsx"
  - ":(top)packages/web/src/templates/**"
  - ":(top)packages/web/src/project/save-template.tsx"
  - ":(top)packages/web/src/play/save-template-dialog.tsx"
  - ":(top)packages/web/src/router.tsx"
  - ":(top)packages/web/src/template-studio/gate-words.ts"
  - ":(top)packages/web/src/template-studio/pack.tsx"
  - ":(top)packages/web/src/designs/designs-route.tsx"
---

# Templates

## Mode & job

Operate surface, the Library's Templates tab at `/templates`, for saved Play setups ("project templates"): list and filter them by channel, see a template's keywords, rename, duplicate, open a template's studio, apply one to Play as a fresh draft, browse and restore its versions, delete it, save a Play draft as a new template, add a starter pack, import a template pack, and list and start design templates (`packages/web/src/routes/templates.tsx:49-54`). Settings of a template are no longer changed by Use in Play and Save a setup: Open studio goes to `/templates/$templateId`, the Template Studio (`25-template-studio.md`, `packages/web/src/router.tsx:376-379`). Applying creates a draft and opens Play on it; it never starts generation (`packages/web/src/templates/use-template-actions.ts:47-80`). The route sits under the pathless Library layout (`packages/web/src/router.tsx:174-188`, `:275-280`).

## Composition

**Library frame.** Kit `PageHeader` "Library" with meta "Templates and designs to start from, and the prompts, intros and outros, PDF themes and narration aliases they use", then `TabLinks` in three groups, Setups (Templates, Designs), Building blocks (Prompts, Intros & outros, PDF themes, Narration aliases) and Results (A/B results) (`packages/web/src/routes/library.tsx:14-52`).

**Toolbar** (`LibraryToolbar`, filters left, actions right, action wraps under on a phone) (`templates.tsx:169-218`, `library.tsx:130-143`): a name search `Input`; a "Show templates of" `Select` (All channels + each channel) with InfoTip; `SortMenu`; a line "Reuse a Play setup and its checkpoint choices. Use in Play creates a fresh draft to review." with InfoTip; secondary "Import template pack" (`ImportPack`: picks a .zip, shows "Importing…", then opens the new template's studio; a refused or failed import shows its sentence beside the button, InfoTip `templates.import-pack`; `packages/web/src/template-studio/pack.tsx:92`), secondary "Add pack" (opens the starter-pack `PacksDrawer` "Add a starter pack") and primary "Save a setup", each with an InfoTip (`templates.tsx:169-218`, `packages/web/src/onboarding/packs-drawer.tsx:35-37`).

**Status row**: a kit `StatusSlot`, "Reload templates" when the list failed, and quiet "Refresh templates" (`templates.tsx:220-233`).

**List and detail.** Kit `ListDetail`, two equal columns at ≥1180px (`templates.tsx:249-345`, `packages/web/src/library/list-states.tsx:7`). The list is "Project templates" `ListRow`s with a `RowCheck` for bulk selection (`LibraryBulkBar`), one column below md; the selected templates are shared with the Assistant (`useAssistantSelection`, `templates.tsx:87`):

| Part | Content | Source |
|---|---|---|
| Title | `InlineName`: the name as a select control plus a pencil icon "Rename <name>" that turns it into an input ("New name for <name>"); rename toasts with Undo | `templates.tsx:275`, `packages/web/src/library/inline-name.tsx:18-114` |
| Meta | a `GateBadge` first (so a narrow row cuts the date, not the badge), then `<channel> · Version N · updated YYYY-MM-DD`. The badge says whether the newest version is ready for schedules: "Ready" (running tone), "Not ready" (waiting; title explains that schedules don't run it until Mark ready in the studio, or which version they keep running), or "Not checked in the studio" (neutral; schedules run the newest version until the first Mark ready) | `templates.tsx:287-290`, `:382`, `packages/web/src/template-studio/gate-words.ts:36-62` |
| Actions | `LibraryRowActions` group "Actions for <name>": secondary `ButtonLink` "Open studio" (aria-label "Open the studio of <name>", to `/templates/$templateId`; this replaced Edit, which only picked the row), quiet "Use in Play", and a "More actions for <name>" menu holding Duplicate, History and Delete | `templates.tsx:298-336`, `packages/web/src/library/row-actions.tsx:7-70` |
| After row | `RetiredModelRow` when the template names a retired model | `templates.tsx:337` |

The detail column is `TemplateDetail`: "Pick a template to see the keywords it fills." until a row is picked; then an `h3` `SectionHead` with the name and InfoTip, the read-only `TemplateKeywords` list (`KeywordList` of each keyword, its saved value, or the word "the topic", "filled by Slopify" (for a `Slopify_` keyword) or "empty" when it has none, what it feeds, and whether it is a topic keyword), and the line "To change the settings, press Open studio." (`packages/web/src/templates/row-parts.tsx:39-70`, `packages/web/src/templates/keywords.tsx:9-56`).

**Design templates.** Below the project templates, `DesignTemplates` (`templates.tsx:393`): a `section` "Design templates" with `SectionHead` (InfoTip `templates.design`, meta "Posters and flyers with fields such as {{Event}}, made again by hand or by a schedule."), a secondary "New design template" button (disabled while a start is under way; a refusal shows as an alert line), and `DesignTemplateList`, each opening its own studio at `/design-templates/$templateId` (`packages/web/src/designs/designs-route.tsx`, `26-designs.md`).

**Save a setup drawer.** Kit `Drawer`, `width="narrow"`, title "Save a setup" (`packages/web/src/templates/save-drawer.tsx:20-185`). Body: "Choose a saved Play draft, or open Play to prepare one." (link to `/play`), "A template keeps the settings, not one video's topic.", then fields "Saved Play draft" (readable drafts, "Untitled draft" fallback, "Choose a draft" placeholder), "Template name" (max `templateNameMax`), "Channel" ("The draft's channel" or a channel). Footer: `StatusSlot` (error or "Saving…") and primary "Save template" (`save-drawer.tsx:89`).

**History drawer.** Kit `Drawer` "History of <name>", up to 1080px wide (`row-parts.tsx:106-112`). "Versions" list newest first: "Version N", meta `<name> · <when>`, "Current" on the newest, "Restore" on older ones; then "Compare with the current version" with a rename note and `DiffColumns` of the two setups as one line per setting (`row-parts.tsx:119-194`). Restore saves the older setup as a new version with `baseVersion` (`row-parts.tsx:21-37`, `row-parts.tsx:92-104`).

**Delete confirm.** Kit `ConfirmDialog` "Delete <name>?", consequence "Moves it to the trash for 30 days (Settings → Trash). Existing projects and drafts keep their setup.", confirm "Delete template" (`templates.tsx:363-380`).

**Other entry points that create templates.** The project page's "Save as template" dialog saves the displayed revision ("Save this revision’s setup for a fresh Play draft. This does not rebuild the project.") After saving, it toasts "Template saved. Set it up section by section in its studio." and navigates to the new template's studio (`packages/web/src/project/save-template.tsx:65-67`). Play's `SaveTemplateDialog` description ends with "Schedules use each new version of it right away until you press Mark ready in its Template studio; from then on new versions wait for Mark ready." (`packages/web/src/project/save-template.tsx:12-92`, `packages/web/src/routes/project.tsx:261`, `routes/project.tsx:451`). Play's start rail has a quiet "Save as template" opening `SaveTemplateDialog` (`packages/web/src/play/start-rail.tsx:207-208`, `packages/web/src/play/save-template-dialog.tsx:37-109`).

## States

| State | Trigger | Treatment | Source |
|---|---|---|---|
| Loading | Templates query pending | `StatusSlot` "Loading templates…" and a three-row `ListSkeleton` (`aria-busy`) | `templates.tsx:158`, `:247`, `list-states.tsx:10-15` |
| Load error | Query fails | Error in `StatusSlot` + "Reload templates" | `templates.tsx:220-225` |
| Empty | Zero templates | `EmptyState` "No templates yet": "Use Save a setup to keep a Play draft for reuse." | `templates.tsx:236-238` |
| Filtered empty | Channel filter hides all | "No templates in this channel." | `templates.tsx:241-244` |
| Play busy | A Play start is starting, uncertain or just created | Warning `StatusSlot` "A run is still starting in Play. Wait for it to finish (or press Check whether it started there), then apply a template."; Use in Play disabled with a title reason | `templates.tsx:153`, `:324` |
| Working | Any action in flight | Duplicate and Use in Play disabled "Working on the last press"; Refresh disabled | `templates.tsx:315`, `:326` |
| Action error | Save/apply/duplicate/delete throws | Message in `StatusSlot` (in the confirm's consequence while deleting) | `templates.tsx:153-160`, `:366-368` |
| Apply refused | Play draft not flushed | "Save or discard the draft open in Play first, then apply the template again." | `use-template-actions.ts:47` |
| Apply created but not opened | Play could not open the draft | "The template's draft was created but didn't open. Press Use in Play again to open it." | `use-template-actions.ts:80` |
| Apply stale | Page unmounted or Play session generation changed | Stops without navigating | `use-template-actions.ts:50-79` |
| Saved / duplicated / deleted | Success | Toasts "Template saved.", "Duplicated as <name>.", "Template moved to the trash. Restore it in Settings → Trash within 30 days." | `save-drawer.tsx:76`, `use-template-actions.ts:100`, `templates.tsx:135` |
| Save drawer | Drafts loading / none / failed | Field help "Loading saved drafts…" / "No saved drafts yet."; danger callout "The saved drafts couldn't be loaded." + "Reload drafts" | `save-drawer.tsx:128-155` |
| Save disabled | No draft picked or empty name or working | "Save template" disabled | `save-drawer.tsx:89` |
| Keywords | Reading / failed / none | "Reading the keywords…"; alert "The keywords of <name> didn't load. … Press Keywords again."; "No keywords: the prompts and the title name none." | `packages/web/src/templates/keywords.tsx:25-54` |
| History | Versions loading / one failed / only one | "Loading…" meta, "Loading the versions…"; alert "A version couldn't be read: … Close History and open it again."; "This is the only version so far." | `row-parts.tsx:105-118`, `row-parts.tsx:130`, `row-parts.tsx:160-167` |
| Restore | Pending / failed / done | Restore disabled "Restoring"; `StatusSlot` "The version wasn't restored: …"; toast "Restored version N of <name> as version M." and the drawer closes | `row-parts.tsx:92-104`, `row-parts.tsx:135-156` |

Idempotence: saving reuses one request ID per (draft, draft version, name, channel); applying reuses one ID per template version until Play opens the draft; duplicating reuses one ID per template version (`save-drawer.tsx`, `use-template-actions.ts:36-100`).

## Motion

Drawers use the kit `Drawer` entrance; no other authored animation. Applying navigates to `/play` only after the draft is created, the drafts query invalidated, the Play session has opened the draft and the page is still current (`use-template-actions.ts:50-79`).

## Copy

Labels: Templates, Show templates of, All channels, Import template pack, Add pack, Save a setup, Save template, Refresh templates, Open studio, Duplicate, Use in Play, History, Delete template, Restore, Current, Design templates, New design template (`templates.tsx:169-345`, `row-parts.tsx:127-165`). Duplicates are named "<name> copy" (`use-template-actions.ts:95`). Command palette: "Save a setup as a template", plus the Library-wide "Open templates" (`templates.tsx:140-148`, `library.tsx:93`).

## Not in play

No template editor on this tab: settings change in the template's studio (Open studio), and the name is the one field edited here (`row-parts.tsx:39-41`). The studio's own behavior, samples, Mark ready and pack export are in `25-template-studio.md`. Templates hold setups, not project outputs or run state. Scheduling a template lives in the Calendar's Schedules tab (`13-schedules.md`). Deleted templates are restored from Settings → Trash, not here (`templates.tsx:135`).
