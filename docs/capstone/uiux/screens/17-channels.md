---
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: 567a07633610
paths_covered:
  - ":(top)packages/web/src/routes/channels.tsx"
  - ":(top)packages/web/src/routes/channel.tsx"
  - ":(top)packages/web/src/channels/**"
  - ":(top)packages/web/src/youtube/channel-links.tsx"
---

# Channels

## Mode & job
Operate surface in two routes. `/channels` lists every channel beside a summary of the picked one, with New, Rename and Delete (`packages/web/src/routes/channels.tsx:27-30`, `packages/web/src/router.tsx:114-118`). `/channels/$channelId?tab=` is one channel's page: six tabs (Brand, Cast, Templates, Schedules, Episodes, Existing videos) under the page header (`packages/web/src/routes/channel.tsx:20-36`, `packages/web/src/routes/channel.tsx:42-45`). `?tab=` is validated by `channelTabOf`, where an unknown value reads as `brand`; switching tabs navigates with `replace: true`, and the page remounts keyed by `channelId` (`packages/web/src/routes/channel.tsx:38-40`, `packages/web/src/router.tsx:124-150`).

Ways in: the rail's Channels item (users icon, also in the phone bottom bar) (`packages/web/src/components/shell.tsx:95-102`); Ctrl+K "Open channels" with shortcut G K (`packages/web/src/components/shell.tsx:196-203`, `packages/web/src/lib/shortcuts.ts:13`); Settings → Channel links' "Open the default channel's links" button (`packages/web/src/youtube/channel-links.tsx:83-97`); tutorial step "24. Set up a channel", which targets `data-tour="channels"` (`packages/web/src/tutorial/model.ts:105`, `packages/web/src/routes/channels.tsx:84`).

The rail's `ChannelPicker` ("Channel" select: "All channels" plus one option per channel, kept in `localStorage` key `slopify.channel`) filters Home, the calendar and Projects. It is not a control on these routes (`packages/web/src/channels/current.tsx:17-21`, `packages/web/src/channels/current.tsx:89-119`).

## Composition

### `/channels`
| Region | What renders | Kit / tokens |
|---|---|---|
| Page header | Title "Channels"; meta "A channel keeps its brand kit, cast, series brief, templates and schedules together." with InfoTip `planning.channels`; primary "New channel" (plus icon) (`packages/web/src/routes/channels.tsx:85-98`) | `PageHeader` (`packages/web/src/components/kit/layout.tsx:9`), `Button`, `InfoTip` |
| Status line | Load error, delete error or "Loading channels…" (`packages/web/src/routes/channels.tsx:100-108`) | `StatusSlot` (`packages/web/src/components/kit/action-bar.tsx:16`) |
| Empty state | Zero channels: "No channels yet" with a primary "New channel" (`packages/web/src/routes/channels.tsx:109-120`) | `EmptyState` (`packages/web/src/components/kit/empty-state.tsx:6`) |
| List / detail | `ListDetail`: a 280-380px list column beside the detail; below 768px one column (`packages/web/src/routes/channels.tsx:122-176`, `packages/web/src/styles/shell.css:719-724`, `packages/web/src/styles/shell.css:934-984`) | `ListDetail` (`packages/web/src/components/kit/layout.tsx:98`) |
| Channel rows | `List label="Channels"` of `ListRow`s. Selecting a row picks it for the detail. Title is the name. Meta is `Default · ` (default only) + `N template(s) · N in the cast`. Actions: TextLink "Open" to `/channels/$channelId`, quiet small "Rename", and quiet small "Delete" on non-default channels only (`packages/web/src/routes/channels.tsx:124-173`) | `List`, `ListRow` (`packages/web/src/components/kit/list-row.tsx:13-77`), `TextLink` |
| Detail: `ChannelGlance` | `SectionHead` "About <name>" (meta "The default channel" when default) with ButtonLink "Open channel"; `Stats` Templates / In the cast; h3 "Series brief" with the brief or its placeholder; h3 "Brand kit" `dl` listing Intro, Outro, Document theme and End screen text, each "None"/"Default" when unset. The picked row shows here, else the first (`packages/web/src/routes/channels.tsx:39-41`, `packages/web/src/routes/channels.tsx:241-281`) | `SectionHead`, `Stats`, `Stat` (`packages/web/src/components/kit/stats.tsx:5-33`), `ButtonLink` |
| Name dialog | Title "New channel" or `Rename <name>`. One `Field` "Channel name" (tip `planning.channel.name`, max 200, required). Footer: StatusSlot, "Cancel", primary "Create channel" / "Rename channel" (`packages/web/src/routes/channels.tsx:178-221`) | `Dialog` (`packages/web/src/components/kit/dialog.tsx:13`), `Field`, `Input` |
| Delete confirm | `Delete <name>?`, "Keep it" / "Delete channel" (`packages/web/src/routes/channels.tsx:222-236`) | `ConfirmDialog` (`packages/web/src/components/kit/dialog.tsx:60`) |

A new channel is created with a client `crypto.randomUUID()` id; on success the list refreshes and the browser goes to the new channel's page (`packages/web/src/routes/channels.tsx:42-50`). Rename saves name, brand, series brief and `baseVersion` together (`packages/web/src/routes/channels.tsx:51-63`). Ctrl+K carries "New channel" (group Channels) while this route is mounted (`packages/web/src/routes/channels.tsx:76`).

### `/channels/$channelId` frame
| Region | What renders | Kit / tokens |
|---|---|---|
| Page header | Crumb link "Channels". Title is the channel name, or "Channel" before load. Meta "Default channel" when default. Actions: primary "Add to cast" (plus icon) only on the Cast tab, and quiet "Delete channel" on non-default channels (`packages/web/src/routes/channel.tsx:86-111`) | `PageHeader`, `Button` |
| Tabs | `Tabs label="Channel sections"` with idPrefix `channel`; the Cast tab carries a badge with the cast count. Arrow keys, Home and End move between tabs (`packages/web/src/routes/channel.tsx:112-123`, `packages/web/src/components/kit/tabs.tsx:38-56`) | `Tabs`, `TabPanel` (`packages/web/src/components/kit/tabs.tsx:20`, `packages/web/src/components/kit/tabs.tsx:126`) |
| Status line | "Loading the channel…" or the load error (`packages/web/src/routes/channel.tsx:124-130`) | `StatusSlot` |
| Panels | All six `TabPanel`s render once the channel loads. Brand and Cast stay mounted while hidden; Templates, Schedules, Episodes and Existing videos mount only while active (`packages/web/src/routes/channel.tsx:131-158`, `packages/web/src/components/kit/tabs.tsx:139-148`) | `TabPanel` (`hidden` attribute) |

Ctrl+K "Add to cast" (group Channel, context the channel name, keywords character/creature/place/object) switches to Cast and opens an empty editor (`packages/web/src/routes/channel.tsx:72-83`). Deleting navigates back to `/channels` (`packages/web/src/routes/channel.tsx:62-69`).

### Brand tab
Above the form, `AiDisclosureSettingField` is a separate section (max-w-3xl, bottom rule). It holds a `Select` "YouTube AI disclosure" with the options Automatic / Always Yes / Always No, help "Mark voices in Settings → Voices and Image prompts in Library → Prompts.", and tip `planning.channel.ai-disclosure`. Picking an option saves immediately and toasts `YouTube AI disclosure set to <label>.` (`packages/web/src/channels/ai-disclosure.tsx:19-67`, `packages/app/src/slices/studio/disclosure.ts:29-36`).

`BrandTab` is a `form aria-label="Brand kit"`, remounted per channel version, in one max-w-3xl column (`packages/web/src/routes/channel.tsx:135`, `packages/web/src/channels/brand-tab.tsx:109-117`):

| Group | Fields | Source |
|---|---|---|
| Identity | "Channel name" (max 200, required); "Series brief" textarea (4 rows, max 10000), help "Topic generation reads it for this channel's schedules." | `packages/web/src/channels/brand-tab.tsx:118-137` |
| Brand kit head | `SectionHead` "Brand kit", meta "Fills what a template leaves at its default. Blank fields add nothing.", info `planning.channel.brand-kit` | `packages/web/src/channels/brand-tab.tsx:138-143` |
| Language | `LanguageSelect` "Language of new projects", inherited option "Not set" | `packages/web/src/channels/brand-tab.tsx:144-153` |
| Captions (3 columns from 700px) | "Caption font" select; "Caption colour"; "Caption outline" | `packages/web/src/channels/brand-tab.tsx:154-174` |
| Chapter cards and end screen (3 columns) | "Title font"; "Title colour"; "End screen text" (placeholder "Subscribe for more", help "Shown over the last 5 seconds.") | `packages/web/src/channels/brand-tab.tsx:175-204` |
| Intro, outro and document (3 columns) | "Intro" and "Outro" from Library entries of that category; "Document theme" from built-in plus saved themes | `packages/web/src/channels/brand-tab.tsx:101-108`, `packages/web/src/channels/brand-tab.tsx:205-230` |
| Ambient sound | `AmbientBedControls` with inherit label "Not set", built-in beds only, no "None"; Level (dB), Fade in, Tail fields appear once a bed is picked | `packages/web/src/channels/ambient-bed-kit.tsx:12-34`, `packages/web/src/video/ambient-bed-controls.tsx:72-111` |
| Channel links | `ChannelLinksEditor`: `SectionHead` "Channel links" (meta "Write a link's name in braces in a description, such as {{Patreon}}."); rows of Name (placeholder "Patreon") + Address (`type="url"`, placeholder "https://") + quiet "Remove" (trash icon), 220px / fluid / auto from `md`; "Add link" button | `packages/web/src/channels/brand-tab.tsx:232-234`, `packages/web/src/youtube/channel-links.tsx:15-78` |
| Sticky action bar | StatusSlot ("Saving…" / error) and primary "Save channel" | `packages/web/src/channels/brand-tab.tsx:236-253`, `packages/web/src/components/kit/action-bar.tsx:52-75` |

Every `Choice` select opens with "Not set". A saved value missing from the library shows as `<value> (no longer in the library)` (`packages/web/src/channels/brand-tab.tsx:258-286`). `Colour` is a text `Input` (placeholder "#FFFFFF", max 7) beside a 24px swatch that fills only for a valid `#RRGGBB` (`packages/web/src/channels/brand-tab.tsx:288-322`). Save sends only non-blank trimmed kit fields, the bed when one is picked, and links only when any exist or were edited. It toasts "Channel saved." and invalidates the channel list and every project's link placeholders (`packages/web/src/channels/brand-tab.tsx:64-95`). The default channel without saved links shows the older Settings list until its Brand tab saves (`packages/web/src/channels/brand-tab.tsx:55-62`).

### Cast tab
`CastTab` is a two-column grid from 1024px (fluid gallery, 440px editor aside), one column below (`packages/web/src/channels/cast-tab.tsx:68`).
- Lead line: "When a video's title or an image's brief names a member, its pictures go with that image as references, so it looks the same in every video." (`packages/web/src/channels/cast-tab.tsx:70-73`).
- Gallery: a `MediaGrid label="Cast"` of `MediaFrame`s. Each shows the member's first ready picture, the name, and meta `<Kind>[ · Host] · N picture(s)`. A member with no ready picture carries a waiting `Badge` "No picture". Visible secondary small "Edit" (`aria-pressed` when selected) and "Delete" sit on each frame. The selected frame has a 2px accent outline (`packages/web/src/channels/cast-tab.tsx:86-136`, `packages/web/src/components/kit/media.tsx:19`, `packages/web/src/components/kit/media.tsx:102`).
- Clicking a picture opens the `Lightbox` with caption `<Kind> · <description or "No description yet">` and a small `Edit <name>` action (`packages/web/src/channels/cast-tab.tsx:55-64`, `packages/web/src/channels/cast-tab.tsx:138-157`, `packages/web/src/components/kit/media.tsx:145`).
- Aside `aria-label="Cast member editor"`: `CastEditor` when adding or editing. Otherwise, with a non-empty cast, it shows "Pick a member's Edit to change its names, description and pictures here." (`packages/web/src/channels/cast-tab.tsx:162-177`).

`CastEditor` (`packages/web/src/channels/cast-editor.tsx:40-222`):
- `SectionHead`: kicker "New cast member" or the kind label; title "Add to cast" or the name. Meta "Name it first, then give it reference pictures." or "Used whenever a title or an image brief names it or one of its aliases."; quiet small "Close" (`packages/web/src/channels/cast-editor.tsx:100-112`).
- A saved member with no ready picture shows a `text-waiting` line: "No picture yet, so it is not sent with any image. Upload or generate one below." (`packages/web/src/channels/cast-editor.tsx:113-117`).
- Form: "Kind" select (Character, Creature, Place, Object) and "Name" (max 200) side by side from 600px. "Aliases" input (placeholder "Another name, such as the Last Pharaoh"; Enter or "Add alias" adds it; case-insensitive duplicates are ignored) above removable `Chip`s. "Description for the image model" textarea (3 rows, max 2000) (`packages/web/src/channels/cast-editor.tsx:91-96`, `packages/web/src/channels/cast-editor.tsx:127-188`, `packages/web/src/channels/api.ts:17-22`).
- Voice fieldset (legend "Voice", tip `planning.cast.voice`): the line "For multi-voice runs: pick this member under Speakers on Play."; Voice provider, Voice model and Voice pickers, with voices filtered to the channel's language (default `en`) and a `VoiceLanguageNote` offering the rest. The Voice placeholder is "No voices. Add one in Settings." when the list is empty. "Pace" runs Normal / `<n>×`; quiet "Remove the voice" appears once a voice is set. Only a complete provider+model+voice is saved (`packages/web/src/channels/cast-editor.tsx:75-79`, `packages/web/src/channels/cast-editor.tsx:421-510`).
- `Switch` "One of the channel's hosts". Turned on without a voice, it shows the waiting line "A host joins new podcasts and interviews only with a voice. Pick one under Voice above." (`packages/web/src/channels/cast-editor.tsx:190-203`).
- Submit: primary "Add to cast" for a new member, secondary "Save" for an existing one, with a StatusSlot "Saving…" / "Saved." / error. A new member switches the editor to that member once saved (`packages/web/src/channels/cast-editor.tsx:86-89`, `packages/web/src/channels/cast-editor.tsx:204-217`).

`Pictures` renders only for a saved member (`packages/web/src/channels/cast-editor.tsx:219`, `packages/web/src/channels/cast-editor.tsx:224-419`):
- Header: a `Rule`, then h3 "Reference pictures" with meta `Sent with every image whose brief, or the video's title, names <name>.`.
- A compact square `MediaGrid` of the member's pictures, or "No pictures yet.". A generating picture shows "Making the picture…" on the striped `sl-media__generating` fill. A failed picture shows a failed `Badge` "Failed" with `PictureFailure` beneath. Each picture has a secondary small "Delete", disabled while generating (reason "Wait until the picture is made") (`packages/web/src/channels/cast-editor.tsx:275-321`, `packages/web/src/styles/kit.css:557-568`).
- Lightbox of the ready pictures with a small "Download" `FileLink` (`packages/web/src/channels/cast-editor.tsx:322-343`).
- "Upload a picture" opens a hidden file input (PNG/JPEG) beside the note "PNG or JPEG, up to 10 MB." (`packages/web/src/channels/cast-editor.tsx:344-362`).
- The "Make a picture" kicker covers the Image provider and Image model pickers. A "Picture to make" textarea (max 4000) is prefilled `<name>, <description>. A clear reference picture on a plain background, the whole <place|object|figure> in view.`. "Generate a picture" stays disabled until provider, model and prompt are set, with reason "Pick an image provider and model, and describe the picture" (`packages/web/src/channels/cast-editor.tsx:238-240`, `packages/web/src/channels/cast-editor.tsx:363-408`).
- `PictureFailure` shows the provider error in `text-danger` and the `fixFor({ stage: "images" })` `FixActions`. A refused prompt adds "Reword the picture", which focuses the prompt box. Retry is offered only while provider, model and prompt are filled (`packages/web/src/channels/cast-editor.tsx:305-314`, `packages/web/src/channels/cast-editor.tsx:512-547`).

### Templates tab
- Lead: "Runs from these templates use this channel's brand kit and cast. Save new ones from Play in Library → Templates. Move to sends a template and its schedules to another channel." The copy links to `/templates` and carries InfoTip `planning.channel.template-move` (`packages/web/src/channels/members-tabs.tsx:42-49`).
- `List label="Channel templates"`: title is the template name, meta `Version N`; the action is "Move to" plus a `Select` of every channel, and picking one moves the template immediately (`packages/web/src/channels/members-tabs.tsx:59-86`).
- A template without `channelId` counts as the default channel's (`packages/web/src/channels/members-tabs.tsx:16-19`).

### Schedules tab
Read-only.
- Lead: "A schedule belongs to the channel of the template it runs. Create and change schedules in Calendar → Schedules.", linking to `/calendar?tab=schedules` (`packages/web/src/channels/members-tabs.tsx:120-126`).
- `List label="Channel schedules"`: rows show the name with meta: `Status` lamp (Active=running, Paused=waiting, Completed=done, Canceled=off) · `Next run <date>` or "No next run" · `N queued`. Deleted schedules are excluded. Rows have no actions (`packages/web/src/channels/members-tabs.tsx:91-102`, `packages/web/src/channels/members-tabs.tsx:110-157`).

### Episodes tab
- `Switch` "Episode memory" (tip `planning.channel.episode-memory`) saves on toggle, with the help text "Finished episodes leave a short summary that new related episodes are written with." (`packages/web/src/channels/episodes-tab.tsx:46-56`).
- `List label="Episode summaries"`: title is the episode title; meta is `Edited · ` when edited + cast names + a summary preview cut at 160 characters with "…". Actions: small "Open", quiet small "Delete" (`packages/web/src/channels/episodes-tab.tsx:20`, `packages/web/src/channels/episodes-tab.tsx:70-108`).
- `SummaryDialog`: the title is the episode title. The description is "You edited this summary; finishing the video again keeps your text." or "Written by the text model when the video finished. An edit here is kept.". It holds a "Summary" textarea (8 rows) with footer "Close" and primary "Save summary", enabled only after a change (`packages/web/src/channels/episodes-tab.tsx:135-185`).

### Existing videos tab
- Lead: "Topic suggestions and duplicate checks skip these titles, as they skip the videos made here." (`packages/web/src/channels/videos-tab.tsx:89-91`).
- "Paste titles" textarea (5 rows, help "One title per line."). The row below holds primary "Add titles", "Import a YouTube Studio CSV…" (hidden `.csv` input) with InfoTip `planning.channel.videos-csv`, and quiet "Remove all", disabled when the list is empty (`packages/web/src/channels/videos-tab.tsx:92-140`).
- `CsvPreview` after a CSV is read. h3 "Titles in the CSV" has meta `N of N title(s) ticked`, primary `Add N ticked title(s)` and quiet "Cancel". Below: a "Keep only titles containing…" filter, prefilled by the server's suggestion, which re-ticks titles by case-insensitive substring; small "Tick all" / "Untick all"; one checkbox row per title (`packages/web/src/channels/videos-tab.tsx:30-35`, `packages/web/src/channels/videos-tab.tsx:66-72`, `packages/web/src/channels/videos-tab.tsx:214-294`).
- `List label="Existing videos"`: one row per title with a quiet small "Remove" (`packages/web/src/channels/videos-tab.tsx:177-197`).

## States
| State | Trigger | Treatment |
|---|---|---|
| List loading | `channelsQuery` pending | StatusSlot "Loading channels…"; no list (`packages/web/src/routes/channels.tsx:105-106`) |
| List load error | query rejects | `role="alert"` StatusSlot `The channels couldn't be loaded: <message> Reload the page to try again.` (`packages/web/src/routes/channels.tsx:101-102`, `packages/web/src/components/kit/action-bar.tsx:33`) |
| No channels | list empty | `EmptyState` "No channels yet", "Make one for each series you run; it keeps that series' look and cast." (`packages/web/src/routes/channels.tsx:109-120`) |
| Default channel | `isDefault` | No Delete on its row or page; the meta reads "Default ·" / "Default channel" / "The default channel" (`packages/web/src/routes/channels.tsx:131`, `packages/web/src/routes/channels.tsx:156`, `packages/web/src/routes/channel.tsx:89`, `packages/web/src/routes/channel.tsx:98`) |
| Name dialog saving / failed | create or rename pending / rejects | Footer StatusSlot "Saving…" or the error; the field and Cancel are disabled, and the dialog cannot be dismissed while pending (`packages/web/src/routes/channels.tsx:180-197`, `packages/web/src/routes/channels.tsx:216`) |
| Delete channel | Delete pressed | `ConfirmDialog` with consequence "Its cast goes with it. Its videos move to the default channel and keep what they were made with."; a failure replaces the consequence with the error (`packages/web/src/routes/channels.tsx:222-236`, `packages/web/src/routes/channel.tsx:159-171`) |
| Channel loading / error | `channelQuery` pending / rejects | "Loading the channel…"; `The channel couldn't be loaded: <message> Go back to Channels and open it again.`; no panels render (`packages/web/src/routes/channel.tsx:124-131`) |
| Brand save blocked | blank name / bed number out of range | "Save channel" disabled with reason "Give the channel a name" or "Fix the ambient sound settings above" (`packages/web/src/channels/brand-tab.tsx:243-252`, `packages/web/src/channels/ambient-bed-kit.tsx:41-53`) |
| Invalid colour | non-blank, not `#RRGGBB` | Field error "Write the colour as # and six hex digits."; swatch transparent (`packages/web/src/channels/brand-tab.tsx:300-311`) |
| Brand saved / failed | save settles | Success toast "Channel saved."; failure in the action bar StatusSlot (`packages/web/src/channels/brand-tab.tsx:84-85`, `packages/web/src/channels/brand-tab.tsx:237-241`) |
| AI disclosure failed | save rejects | `Couldn't save the YouTube AI disclosure: <message>`; the select shows the pending value while saving and is disabled (`packages/web/src/channels/ai-disclosure.tsx:51-64`) |
| No cast | cast empty | `EmptyState` "No cast yet", "Add the characters, creatures, places and objects this channel keeps coming back to.", secondary "Add to cast" (`packages/web/src/channels/cast-tab.tsx:74-84`) |
| Picture generating | any cast image `generating` | Frame shows "Making the picture…"; the channel query polls every 3 s until none is generating; StatusSlot "The picture is being made; it appears here when it is ready." (`packages/web/src/channels/api.ts:51-56`, `packages/web/src/channels/cast-editor.tsx:285`, `packages/web/src/channels/cast-editor.tsx:413-414`) |
| Picture failed | image `failed` | "Failed" badge, error text, fix-it buttons (`packages/web/src/channels/cast-editor.tsx:288-315`) |
| Upload / generate / delete picture error | mutation rejects | StatusSlot error under the pictures section; "Uploading…" while uploading (`packages/web/src/channels/cast-editor.tsx:409-416`) |
| Delete cast member | Delete pressed | `ConfirmDialog` with the consequence "New videos stop using its pictures. Videos already made keep the pictures they were started with.", buttons "Keep it" / "Delete from cast". A failure shows in the consequence or, after close, in a StatusSlot under the gallery (`packages/web/src/channels/cast-tab.tsx:158-160`, `packages/web/src/channels/cast-tab.tsx:178-192`) |
| No templates | none in channel | `EmptyState` "No templates in this channel", "Pick this channel on Play, then save the setup as a template, or move one here from another channel." (`packages/web/src/channels/members-tabs.tsx:53-58`) |
| Template move pending / failed | move running / rejects | Every Move-to select is disabled while pending; the error shows in a StatusSlot above the list (`packages/web/src/channels/members-tabs.tsx:50-52`, `packages/web/src/channels/members-tabs.tsx:72`) |
| No schedules | none for the channel's templates | `EmptyState` "No schedules run this channel's templates", "Make one in Calendar → Schedules from one of this channel's templates." (`packages/web/src/channels/members-tabs.tsx:130-134`) |
| Episodes loading / error | query pending / rejects | "Loading the episodes…" or the error; the switch is disabled until data arrives (`packages/web/src/channels/episodes-tab.tsx:48`, `packages/web/src/channels/episodes-tab.tsx:57-62`) |
| No episodes | list empty | `EmptyState` "No episodes remembered yet". With memory on: "When a video on this channel finishes, its summary appears here."; off: "Turn on episode memory, and the next finished video's summary appears here." (`packages/web/src/channels/episodes-tab.tsx:63-69`) |
| Delete summary | Delete pressed | `ConfirmDialog` `Delete the summary of <title>?`, "New episodes stop being reminded of it. The video itself is not changed.", "Delete summary" (`packages/web/src/channels/episodes-tab.tsx:117-130`) |
| Summary save failed | save rejects | Field error on "Summary" (`packages/web/src/channels/episodes-tab.tsx:180`) |
| Videos busy | any add/scan/remove/clear pending | All buttons and ticks disabled; "Loading the titles…" / "Reading the CSV…" (`packages/web/src/channels/videos-tab.tsx:85`, `packages/web/src/channels/videos-tab.tsx:141-149`) |
| Titles added | add succeeds | Success StatusSlot `Added N title(s)[; skipped N already listed].` (`packages/web/src/channels/videos-tab.tsx:53-64`) |
| No existing videos | list empty | `EmptyState` "No existing videos listed", with the Studio export path "In YouTube Studio open Analytics → Content → Advanced mode, export the table as a CSV, and import it here; or paste the titles above." (`packages/web/src/channels/videos-tab.tsx:171-176`) |
| Remove all | Remove all pressed | `ConfirmDialog` `Remove all N title(s)?`, "Topic suggestions and duplicate checks stop skipping them. Your videos on YouTube are not touched." (`packages/web/src/channels/videos-tab.tsx:198-209`) |
| No channel links | links empty | Ruled paragraph "No channel links yet. Add one, then write its name in braces in a description." (`packages/web/src/youtube/channel-links.tsx:31-34`) |
| Stale current channel | the channel picked in the rail was deleted | Reads as All channels (`packages/web/src/channels/current.tsx:49-53`) |

## Motion
- Dialogs, confirm dialogs and the lightbox use the kit's shared entrances. Neither route adds motion of its own (`packages/web/src/components/kit/dialog.tsx:13-108`, `packages/web/src/components/kit/media.tsx:145`).
- The generating picture fill is a static striped gradient, not animated (`packages/web/src/styles/kit.css:557-568`).
- The Schedules tab's Active `Status` lamp uses the kit's running pulse (`packages/web/src/channels/members-tabs.tsx:97-102`, `packages/web/src/components/kit/status.tsx:27`).
- Toasts ("Channel saved.", AI disclosure) use the kit toast entrance (`packages/web/src/components/kit/toast.tsx:44`).

## Copy
- Register: short plain statements of what a control does and imperative pointers to where to go ("Create and change schedules in Calendar → Schedules."), `Settings → …` / `Library → …` arrows for locations (`packages/web/src/channels/members-tabs.tsx:121-124`, `packages/web/src/channels/ai-disclosure.tsx:49`).
- Destructive confirms name the consequence and use "Keep it" as cancel on channel and cast deletes (`packages/web/src/routes/channels.tsx:227-230`, `packages/web/src/channels/cast-tab.tsx:183-186`).
- Load errors end with the recovery step ("Reload the page to try again.", "Go back to Channels and open it again.") (`packages/web/src/routes/channels.tsx:102`, `packages/web/src/routes/channel.tsx:126`).
- Spelling: "colour" in labels and errors (`packages/web/src/channels/brand-tab.tsx:163-190`, `packages/web/src/channels/brand-tab.tsx:305`).
- Tab labels: Brand, Cast, Templates, Schedules, Episodes, Existing videos (`packages/web/src/routes/channel.tsx:29-36`).
- Icon/aria names: `Open <name>`, `Rename <name>`, `Delete <name>`, `Edit <name>`, `Open <name>'s picture full size`, `Remove alias <alias>`, `Delete picture N of <name>`, `Download picture N of <name>`, `Channel of <template>`, `Open the summary of <title>`, `Remove <title>`, `Name of link N`, `Address of link N`, `Remove link N` (`packages/web/src/routes/channels.tsx:139-160`, `packages/web/src/channels/cast-tab.tsx:100-123`, `packages/web/src/channels/cast-editor.tsx:171`, `packages/web/src/channels/cast-editor.tsx:296`, `packages/web/src/channels/cast-editor.tsx:337`, `packages/web/src/channels/members-tabs.tsx:70`, `packages/web/src/channels/episodes-tab.tsx:87-95`, `packages/web/src/channels/videos-tab.tsx:188`, `packages/web/src/youtube/channel-links.tsx:44-60`).

## Not in play
- Search, sort and filtering of the channel list: absent (`packages/web/src/routes/channels.tsx:122-176`).
- Creating or editing schedules from the channel page: absent; the Schedules tab links to the calendar (`packages/web/src/channels/members-tabs.tsx:104-159`).
- Creating templates here: absent; the Templates tab links to Library → Templates and Play (`packages/web/src/channels/members-tabs.tsx:42-49`).
- Unsaved-changes guard on the Brand form: absent; leaving the tab keeps the form mounted, but leaving the route drops the draft (`packages/web/src/routes/channel.tsx:133-136`).
- Uploaded ("My own file") ambient beds on a channel: not offered; built-in beds only (`packages/web/src/channels/ambient-bed-kit.tsx:12-13`, `packages/web/src/channels/ambient-bed-kit.tsx:48`).
- Reordering cast members, links or existing videos: absent.
- Undo on any delete: absent; each delete is behind a `ConfirmDialog`, except single existing-video "Remove", link "Remove" (unsaved until Save channel) and picture "Delete", which act immediately (`packages/web/src/channels/videos-tab.tsx:184-192`, `packages/web/src/youtube/channel-links.tsx:56-65`, `packages/web/src/channels/cast-editor.tsx:293-302`).
- A switch to the rail's current channel on opening a channel page: not implemented; the rail picker is independent of `/channels/$id` (`packages/web/src/channels/current.tsx:17-21`).
- Offline and permission-denied states: not rendered.
