---
generated_at_commit: e9226a34aa8a
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: a9c5ff651ebc
paths_covered:
  - ":(top)packages/web/src/routes/templates.tsx"
  - ":(top)packages/web/src/routes/library.tsx"
  - ":(top)packages/web/src/templates/**"
  - ":(top)packages/web/src/project/save-template.tsx"
  - ":(top)packages/web/src/play/save-template-dialog.tsx"
  - ":(top)packages/web/src/router.tsx"
---

# Templates

## Mode & job

Operate surface, the Library's Templates tab at `/templates`, for saved Play setups ("project templates"): list and filter them by channel, see a template's keywords, rename, duplicate, apply one to Play as a fresh draft, browse and restore its versions, delete it, save a Play draft as a new template, and add a starter pack (`packages/web/src/routes/templates.tsx:39-53`). Applying creates a draft and opens Play on it; it never starts generation (`templates.tsx:136-175`, `packages/web/src/router.tsx:230-249`). The route sits under the pathless Library layout (`router.tsx:98-104`, `router.tsx:154-158`).

## Composition

**Library frame.** Kit `PageHeader` "Library" with meta "Prompts, intros and outros, templates, document themes, narration aliases and A/B results", then `TabLinks` Prompts / Intros & Outros / Templates / Documents / Aliases / A/B results (`packages/web/src/routes/library.tsx:14-35`).

**Toolbar** (`LibraryToolbar`, filters left, actions right, action wraps under on a phone) (`templates.tsx:241-280`, `library.tsx:111-115`): a "Show templates of" `Select` (All channels + each channel) with InfoTip; a line "Reuse a Play setup and its checkpoint choices. Use in Play creates a fresh draft to review." with InfoTip; secondary "Add pack" (opens the starter-pack `PacksDrawer` "Add a starter pack") and primary "Save a setup", each with an InfoTip (`templates.tsx:234-257`, `packages/web/src/onboarding/packs-drawer.tsx:35-37`).

**Status row**: a kit `StatusSlot`, "Reload templates" when the list failed, and quiet "Refresh templates" (`templates.tsx:281-296`).

**List and detail.** Kit `ListDetail`, two equal columns at ≥1180px (`templates.tsx:306-383`, `packages/web/src/library/list-states.tsx:7`). The list is "Project templates" `ListRow`s, one column below md (`templates.tsx:310-314`):

| Part | Content | Source |
|---|---|---|
| Title | `InlineName`: the name as a select control plus a pencil icon "Rename <name>" that turns it into an input ("New name for <name>"); rename toasts with Undo | `templates.tsx:315-326`, `packages/web/src/library/inline-name.tsx:18-114` |
| Meta | `<channel> · Version N · updated YYYY-MM-DD` | `templates.tsx:328-334` |
| Actions | `LibraryRowActions` group "Actions for <name>": quiet Edit (picks the row), quiet Duplicate, quiet "Use in Play", History icon, Delete icon | `templates.tsx:335-374`, `packages/web/src/library/row-actions.tsx:7-60` |
| After row | `RetiredModelRow` when the template names a retired model | `templates.tsx:376` |

The detail column is `TemplateDetail`: "Pick a template to see the keywords it fills." until a row is picked; then an `h3` `SectionHead` with the name and InfoTip, the read-only `TemplateKeywords` list (`KeywordList` of each keyword, its saved value, what it feeds, and whether it is a topic keyword), and the line "To change the settings, press Use in Play, change the draft, then Save a setup." (`packages/web/src/templates/row-parts.tsx:39-62`, `packages/web/src/templates/keywords.tsx:9-56`).

**Save a setup drawer.** Kit `Drawer`, `width="narrow"`, title "Save a setup" (`templates.tsx:384-488`). Body: "Choose a saved Play draft, or open Play to prepare one." (link to `/play`), "A template keeps the settings, not one video's topic.", then fields "Saved Play draft" (readable drafts, "Untitled draft" fallback, "Choose a draft" placeholder), "Template name" (max `templateNameMax`), "Channel" ("The draft's channel" or a channel). Footer: `StatusSlot` (error or "Saving…") and primary "Save template" (`templates.tsx:389-403`).

**History drawer.** Kit `Drawer` "History of <name>", up to 1080px wide (`row-parts.tsx:106-112`). "Versions" list newest first: "Version N", meta `<name> · <when>`, "Current" on the newest, "Restore" on older ones; then "Compare with the current version" with a rename note and `DiffColumns` of the two setups as one line per setting (`row-parts.tsx:119-194`). Restore saves the older setup as a new version with `baseVersion` (`row-parts.tsx:21-37`, `row-parts.tsx:92-104`).

**Delete confirm.** Kit `ConfirmDialog` "Delete <name>?", consequence "Moves it to the trash for 30 days (Settings → Trash). Existing projects and drafts keep their setup.", confirm "Delete template" (`templates.tsx:496-509`).

**Other entry points that create templates.** The project page's "Save as template" dialog saves the displayed revision ("Save this revision’s setup for a fresh Play draft. This does not rebuild the project.") (`packages/web/src/project/save-template.tsx:12-92`, `packages/web/src/routes/project.tsx:261`, `routes/project.tsx:451`). Play's start rail has a quiet "Save as template" opening `SaveTemplateDialog` (`packages/web/src/play/start-rail.tsx:207-208`, `packages/web/src/play/save-template-dialog.tsx:37-109`).

## States

| State | Trigger | Treatment | Source |
|---|---|---|---|
| Loading | Templates query pending | `StatusSlot` "Loading templates…" and a three-row `ListSkeleton` (`aria-busy`) | `templates.tsx:229-230`, `templates.tsx:305`, `list-states.tsx:10-15` |
| Load error | Query fails | Error in `StatusSlot` + "Reload templates" | `templates.tsx:227-228`, `templates.tsx:283-287` |
| Empty | Zero templates | `EmptyState` "No templates yet": "Use Save a setup to keep a Play draft for reuse." | `templates.tsx:297-301` |
| Filtered empty | Channel filter hides all | "No templates in this channel." | `templates.tsx:302-304` |
| Play busy | A Play start is starting, uncertain or just created | Warning `StatusSlot` "A run is still starting in Play. Wait for it to finish (or press Check whether it started there), then apply a template."; Use in Play disabled with a title reason | `templates.tsx:222-226`, `templates.tsx:360-367`, `router.tsx:234-236` |
| Working | Any action in flight | Duplicate and Use in Play disabled "Working on the last press"; Refresh disabled | `templates.tsx:97-110`, `templates.tsx:291`, `templates.tsx:353-366` |
| Action error | Save/apply/duplicate/delete throws | Message in `StatusSlot` (in the confirm's consequence while deleting) | `templates.tsx:104-106`, `templates.tsx:219-221`, `templates.tsx:499-501` |
| Apply refused | Play draft not flushed | "Save or discard the draft open in Play first, then apply the template again." | `templates.tsx:137-141` |
| Apply created but not opened | Play could not open the draft | "The template's draft was created but didn't open. Press Use in Play again to open it." | `templates.tsx:169-174` |
| Apply stale | Page unmounted or Play session generation changed | Stops without navigating | `templates.tsx:142-168` |
| Saved / duplicated / deleted | Success | Toasts "Template saved.", "Duplicated as <name>.", "Template moved to the trash. Restore it in Settings → Trash within 30 days." | `templates.tsx:133`, `templates.tsx:193`, `templates.tsx:206-209` |
| Save drawer | Drafts loading / none / failed | Field help "Loading saved drafts…" / "No saved drafts yet."; danger callout "The saved drafts couldn't be loaded." + "Reload drafts" | `templates.tsx:427-463` |
| Save disabled | No draft picked or empty name or working | "Save template" disabled | `templates.tsx:398` |
| Keywords | Reading / failed / none | "Reading the keywords…"; alert "The keywords of <name> didn't load. … Press Keywords again."; "No keywords: the prompts and the title name none." | `packages/web/src/templates/keywords.tsx:25-54` |
| History | Versions loading / one failed / only one | "Loading…" meta, "Loading the versions…"; alert "A version couldn't be read: … Close History and open it again."; "This is the only version so far." | `row-parts.tsx:105-118`, `row-parts.tsx:130`, `row-parts.tsx:160-167` |
| Restore | Pending / failed / done | Restore disabled "Restoring"; `StatusSlot` "The version wasn't restored: …"; toast "Restored version N of <name> as version M." and the drawer closes | `row-parts.tsx:92-104`, `row-parts.tsx:135-156` |

Idempotence: saving reuses one request ID per (draft, draft version, name, channel); applying reuses one ID per template version until Play opens the draft; duplicating reuses one ID per template version (`templates.tsx:111-125`, `templates.tsx:147-152`, `templates.tsx:176-183`).

## Motion

Drawers use the kit `Drawer` entrance; no other authored animation. Applying navigates to `/play` only after the draft is created, the drafts query invalidated, the Play session has opened the draft and the page is still current (`templates.tsx:163-170`, `router.tsx:237-247`).

## Copy

Labels: Templates, Show templates of, All channels, Add pack, Save a setup, Save template, Refresh templates, Edit, Duplicate, Use in Play, History, Delete template, Restore, Current (`templates.tsx:245-400`, `row-parts.tsx:127-145`). Duplicates are named "<name> copy" (`templates.tsx:176-190`). Command palette: "Save a setup as a template", plus the Library-wide "Open templates" (`templates.tsx:212-218`, `library.tsx:90-98`).

## Not in play

No template editor on this tab: settings change only by Use in Play, editing the draft, then Save a setup; the name is the one field edited here (`row-parts.tsx:39-41`). Templates hold setups, not project outputs or run state. Scheduling a template lives in the Calendar's Schedules tab (`13-schedules.md`). Deleted templates are restored from Settings → Trash, not here (`templates.tsx:206-209`).
