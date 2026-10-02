---
scenario: channels-and-cast
screens:
- 02-play
- 03-project
- 13-schedules
- 14-templates
depends_on:
- 04-run-admission
- 09-image-generation
- 12-reruns-and-edits
- 14-storage-and-downloads
- 17-subtitles
- 22-play-drafts
- 24-project-templates
- 25-scheduled-jobs
- 26-document
- 27-youtube-description
generated_at_commit: d83482c1175e
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: e59347f388e6
paths_covered:
  - ":(top)packages/app/src/slices/channels/model.ts"
  - ":(top)packages/app/src/slices/channels/schema.ts"
  - ":(top)packages/app/src/slices/channels/service.ts"
  - ":(top)packages/app/src/slices/channels/repo.ts"
  - ":(top)packages/app/src/slices/channels/cast-images.ts"
  - ":(top)packages/app/src/slices/channels/cast-match.ts"
  - ":(top)packages/app/src/slices/channels/images.ts"
  - ":(top)packages/app/src/slices/channels/rebrand.ts"
  - ":(top)packages/app/src/slices/channels/runs.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-cast.ts"
  - ":(top)packages/app/src/edge/http/channels.ts"
  - ":(top)packages/app/src/kernel/db/migrations/0032-channels.sql"
  - ":(top)packages/app/src/kernel/db/migrations/0039-channel-essentials.sql"
  - ":(top)packages/app/src/kernel/db/migrations/0041-cast-hosts.sql"
  - ":(top)packages/web/src/channels/**"
  - ":(top)packages/web/src/routes/channels.tsx"
  - ":(top)packages/web/src/routes/channel.tsx"
  - ":(top)packages/web/src/play/channel-picker.tsx"
---

# 30 Channels and cast

A channel groups templates, schedules and projects under one brand kit, series brief, YouTube AI-disclosure answer and cast library (characters, creatures, places and objects drawn the same way in every episode). The brand kit fills a run's settings that are left at their default; the cast rides into the run's config as a snapshot and is sent as reference pictures with every image request whose text names a member. Episode memory and existing videos, the channel page's other two tabs, are scenario 31 (`31-channel-memory.md`). Paths below are relative to `packages/app/src/` unless they start with `packages/`.

## Trigger & preconditions

- Surfaces: Channels list `/channels` (`packages/web/src/routes/channels.tsx`) and the channel page `/channels/$id` with tabs brand, cast, templates, schedules, episodes, videos (`packages/web/src/routes/channel.tsx:21-26`; an unknown tab reads as brand, `:39`). Play picks the channel and the "Use the channel's brand kit" switch (`packages/web/src/play/channel-picker.tsx:23`, `:41`, `:71-72`); Edit project can move a project to another channel.
- Routes, mounted at `/api/channels` (`edge/http/app.ts:184`), in `channelRoutes` (`edge/http/channels.ts:38-127`): `GET /`, `POST /`, `GET /pictures/:sha256`, `PUT /templates/:templateId`, `PUT /cast/:memberId`, `DELETE /cast/:memberId`, `POST /cast/:memberId/images`, `POST /cast/:memberId/generate`, `DELETE /cast/:memberId/images/:imageId`, `GET /:id`, `PUT /:id`, `PUT /:id/ai-disclosure`, `DELETE /:id`, `POST /:id/cast`. Every id param is a UUID; a picture hash is 64 lowercase hex characters (`:30-34`).
- One default channel exists on every install, id `00000000-0000-4000-8000-000000000001`, name "My channel" (`slices/channels/model.ts:6-7`, inserted by `kernel/db/migrations/0032-channels.sql:21-24`); a unique partial index allows only one `is_default = 1` row (`:20`).
- A template's channel is the plain column `project_templates.channel_id`, a project's a row of `project_channels`; neither has a foreign key to `channels` (`0032-channels.sql:6-9`, `:59-63`). `resolveChannelId` reads NULL or an id this install lacks as the default channel (`slices/channels/repo.ts:95-100`). A schedule's channel is its template's (`scheduleChannel` `:211-215`).
- Single local user; no authority checks on any route.

## Steps

1. **List** (`GET /`): `channelSummaries` returns channels default first, then by lower-cased name, then id, each with its count of non-trashed templates and cast members; templates naming no channel or a missing one count toward the default channel (`slices/channels/repo.ts:102-125`).
2. **Create** (`POST /`): body `{ id, name }`, id a client-made UUID (`packages/web/src/routes/channels.tsx:43`), name trimmed 1–200 characters ("Enter a name.", "Keep the name to 200 characters or fewer.", `slices/channels/schema.ts:81-86`). Inside one transaction a row is inserted with `episode_memory = 1` (`slices/channels/service.ts:34-56`). Answer 201.
3. **Read** (`GET /:id`): the channel and its cast, members ordered by lower-cased name then id, each member's pictures by creation time (`slices/channels/service.ts:25-32`, `slices/channels/repo.ts:133-160`).
4. **Save Brand** (`PUT /:id`): body `{ name, brand, seriesBrief, baseVersion }` (`channelUpdateSchema`, `slices/channels/schema.ts:87-95`). The series brief is at most 10,000 characters. The brand kit (`BrandKit`, `slices/channels/model.ts:14-39`) is strict and every field optional; a blank field is dropped so it inherits (`slices/channels/schema.ts:75-79`):
   - `captionFontId`, `titleFontId`: at most 160 characters of `[A-Za-z0-9_-]` ("Choose a font from the list.", `:21-25`).
   - `captionColor`, `captionOutlineColor`, `titleColor`: `#RRGGBB`, stored upper-case ("Use a colour like #FFD700.", `:16-19`).
   - `intro`, `outro`, `endScreenText`, `documentTheme`: trimmed text up to 200 characters (`:35-38`).
   - `ambientBed`: a built-in bed checked by `ambientBedProblems`, each problem suffixed "Change it under Brand kit → Ambient sound on the channel page." (`:40-49`).
   - `language`: a `languageSchema` code (`:50`, `kernel/ports/languages.ts:83`); absent is English (`slices/channels/model.ts:32-34`).
   - `links`: named links for description placeholders, checked by `channelLinksProblem`; an empty list is kept (`slices/channels/schema.ts:51-72`). Their use is scenario 27.
   The update runs in a transaction: not found, or `version ≠ baseVersion` → conflict; else name, brand JSON and brief are written and `version` goes up by one (`slices/channels/service.ts:59-92`).
5. **AI disclosure** (`PUT /:id/ai-disclosure`): `{ aiDisclosure: "auto" | "yes" | "no" }` ("Choose Automatic, Always Yes or Always No.", `slices/channels/schema.ts:157-161`). Written without touching `version`, so an open Brand form still saves (`slices/channels/service.ts:94-111`). Column default `'auto'` (`kernel/db/migrations/0039-channel-essentials.sql:49`). How the answer is used at upload prep (`aiDisclosureOf`, `slices/studio/disclosure.ts:70-80`) is scenario 32.
6. **Move a template** (`PUT /templates/:templateId`): `{ channelId }`; the target channel must exist and the template row must exist (`slices/channels/service.ts:141-157`). Its schedules move with it because a schedule reads its template's channel (`slices/channels/repo.ts:209-215`).
7. **Add a cast member** (`POST /:id/cast`): `{ id, kind, name, aliases, description, voice?, host? }` (`slices/channels/schema.ts:124-140`): kind one of character, creature, place, object (`slices/channels/model.ts:9`); name and each alias trimmed 1–200 characters ("Enter a name, and remove empty aliases."); at most 20 aliases; description at most 2,000 characters; a voice `{ provider, model, voice, pace?, pronunciations? }` with the pace one of the Speakers list's `paceSteps` and pronunciations up to 20,000 characters (`:106-123`). Aliases are de-duplicated without case, the name itself removed from them (`unique`, `slices/channels/service.ts:248-257`). Inserted in a transaction (`:159-196`).
8. **Edit a cast member** (`PUT /cast/:memberId`): same fields plus `baseVersion`; version mismatch → conflict. `voice` absent keeps the saved voice, `null` removes it; `host` absent keeps the saved flag (`slices/channels/service.ts:198-236`). How cast voices and hosts become speakers is scenario 34 (`slices/voices/cast.ts:12-14`).
9. **Upload a picture** (`POST /cast/:memberId/images`, raw bytes as body): body limit 10 MB (`castImageMaxBytes`, `slices/channels/images.ts:7`; `edge/http/channels.ts:79-87`). `uploadCastImage` checks room (fewer than 4 non-failed pictures, `castImagesPerMember` `slices/channels/images.ts:9`, `roomFor` `slices/channels/cast-images.ts:133-146`), size, and PNG/JPEG magic bytes (`sniffImage` `slices/channels/images.ts:11-16`), stores the bytes in `image_blobs` under their SHA-256 (the same bytes twice are one row, `:18-28`, `slices/channels/repo.ts:258-266`), and inserts a `ready` `upload` row (`slices/channels/cast-images.ts:25-54`). Answer 201.
10. **Generate a picture** (`POST /cast/:memberId/generate`): `{ prompt (1–4,000 chars), provider, model }` (`slices/channels/schema.ts:144-154`). After the room check, a `generating` row is inserted and returned at once with 202 (`slices/channels/cast-images.ts:59-107`). The generator runs detached: characters and creatures at 9:16, places and objects at 16:9 (`aspectOf` `:148-150`), through `standaloneImage` with owner `{ kind: "channel", id }` and purpose `cast-image` (`main.ts:647-652`, `kernel/runner/meter.ts:38-42`). A PNG/JPEG answer within 10 MB is stored and the row turns `ready` only while still `generating` (`slices/channels/cast-images.ts:81-95`). The channel page polls every 3 s while any picture is generating (`packages/web/src/channels/api.ts:51-56`).
11. **Serve a picture** (`GET /pictures/:sha256`): the bytes with their MIME, `Cache-Control: private, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff` (`edge/http/channels.ts:54-62`).
12. **Delete a picture** (`DELETE /cast/:memberId/images/:imageId`): removes the row only; the blob stays because a started project may name it (`slices/channels/cast-images.ts:109-121`).
13. **Delete a cast member** (`DELETE /cast/:memberId`): no version check (`slices/channels/service.ts:238-246`); its pictures' rows cascade (`0032-channels.sql:49`).
14. **Delete a channel** (`DELETE /:id`), in a transaction: not found; default → refused; any non-trashed template on it → refused; otherwise its projects' `project_channels` rows are pointed at the default channel and the channel row is deleted (`slices/channels/service.ts:113-139`), cascading its cast (`0032-channels.sql:28`), episode memories and existing videos (`0039-channel-essentials.sql:32`, `:55`).
15. **Run start (Play, schedule, batch, API)**: the draft's channel is the one picked on Play, else its template's, else the default (`draftChannel`, `slices/channels/runs.ts:21-31`). `brandedForm` (`:37-74`) fills the form:
    - `language` from the kit when the form has none, with the kit switch on or off (`:43-49`);
    - with the kit on only: the caption font when the form's is `"default"`; intro and outro when the form's is `""`, matched to a Library entry by case-insensitive name and skipped when none exists; the document theme when the form has none (`brandDocument`: a built-in theme name, else a saved theme id, else nothing, `:76-85`); the ambient bed when the form never set one (`:70-72`).
    `brandedRun` (`:90-126`) then sets `channelId`, keeps `useBrandKit: false` only when off, puts caption colours under the draft's own subtitle settings, sets `titleStyle` and `endScreen.text` only when the draft has none, and adds `cast` when non-empty. `castSnapshot` (`:129-145`) keeps only members with at least one `ready` picture, as `{ name, aliases, description, images: [sha256…] }`. `castVoicedRun` (`:151-158`) applies cast voices to speakers picked from the cast; it runs on Play review (`slices/play-drafts/review-inputs.ts:84-102`), batch planning (`edge/http/planning.ts:42`) and project create (`edge/http/project-create.ts:29`). Admission writes the project's `project_channels` row (`slices/admission/start.ts:119`).
16. **Images**: `castFor` joins the texts of one image request (its prompt, and the title for reference, thumbnail and establishing pictures), takes the members `castMentions` finds, at most 4 (`castMembersPerImage`), and sends their name, description and pictures (`slices/rebuild/recipe-cast.ts:9-31`; callers `slices/rebuild/recipe-visual.ts:121`, `:256`, `:365`, `slices/rebuild/recipe-reference.ts:95`, `slices/rebuild/recipe-shorts.ts:159`). `castMentions` (`slices/channels/cast-match.ts:8-35`) matches the name or an alias as a whole word, case-insensitive, where a boundary is any character that is not a letter or digit in any script and inner spaces match any whitespace run; members come back in order of first mention, then cast order. How the pictures reach the provider is scenario 09.
17. **Edit project moves channel or flips the kit switch**: `rebrandedEdit` (`slices/channels/rebrand.ts:21-118`), applied on every revision save (`slices/revisions/mutations.ts:92`), returns the edit unchanged when neither the resolved channel nor the switch changed (`:26`). Otherwise: the cast is re-snapshotted from the new channel only when the channel changed (`:35-37`); caption font, caption colours, title font and colour, and end-screen text take the new kit's value when the current value is unset, the fallback, or equal to the old kit's, and keep the person's own otherwise (`swapped` `:122-131`); intro and outro are swapped the same way only while narration is generated, replacing the frozen prompt template body with the new entry's and dropping the setting when the new kit names no existing entry (`:81-102`); the document theme is swapped when it equals the old kit's theme or the built-in default (`:104-116`). When the revision becomes head, the project's `project_channels` row follows `config.channelId` if that channel still exists (`slices/revisions/mutations.ts:326-334`).

## Branches

- Brand kit switch off: only `language` is taken from the channel (`slices/channels/runs.ts:43-49`, `:96`); the cast still rides along (`:124`).
- A kit value the draft already set (template or Play) wins over the kit (`slices/channels/runs.ts:56-73`, `:115-123`).
- Default channel with no `links` in its kit: the older Settings links list stands in (`slices/channels/model.ts:35-38`); scenario 27.
- Cast member with no ready picture: left out of the snapshot, so never matched in image texts (`slices/channels/runs.ts:134`).
- A text naming more than 4 members: the first 4 by first mention (`slices/rebuild/recipe-cast.ts:23`).
- No member mentioned: `castFor` returns undefined, so the request and its fingerprint equal a run without a cast (`slices/rebuild/recipe-cast.ts:4-6`, `:24-25`).
- Same create sent twice: an existing id with the same name (and for cast, the same channel) answers with the existing row; a different name → conflict (`slices/channels/service.ts:39-44`, `:170-174`).

## Unhappy paths

Refusals are RFC 7807 problems with `extensions.reason`; `not-found` → 404, `conflict` and `has-templates` → 409, others 400; the detail is the slice's field message when present, else a fixed sentence (`edge/http/channels.ts:138-169`):

| Reason | Detail (fixed) |
|---|---|
| not-found | "This channel, cast member or picture no longer exists; it may have been deleted in another tab. Go back to Channels." |
| conflict | "This changed in another tab while you were editing. Reload the page to see the latest, then make your change again." |
| invalid-input | "Some of these settings are not valid. Check the highlighted fields and try again." |
| default-channel | "The default channel can't be deleted; projects and templates without a channel belong to it. Rename it in its Brand tab instead." |
| has-templates | "This channel still has templates. Move them to another channel in its Templates tab, or delete them, then delete the channel." |
| not-an-image | "This file is not a PNG or JPEG picture. Upload a PNG or JPEG file." (over 10 MB: "This picture is larger than 10 MB. Save it smaller (for example as a JPEG) and upload it again.") |
| too-many-images | "<name> already has 4 pictures. Delete one before adding another." (`slices/channels/cast-images.ts:139-144`) |
| no-image-provider | "Slopify can't make pictures here yet. Set up an image provider in Settings → Providers, or upload a picture instead." |

- Create with a malformed body answers `invalid-input` without a field message (`slices/channels/service.ts:36`); a malformed JSON body reads as `undefined` (`edge/http/channels.ts:130-136`).
- Generation fails: the row turns `failed` with "The picture couldn't be made: <reason, first 500 chars> Check the image provider in Settings → Providers, then press Generate again." and a `channels.cast-image.failed` warn log (`slices/channels/cast-images.ts:96-104`); an answer that is not PNG/JPEG or over 10 MB → "The provider answered with something that is not a usable PNG or JPEG picture. Press Generate again, or upload a picture instead." (`:83-89`).
- Slopify stops mid-generation: at boot `settleInterruptedCastImages` turns every `generating` row `failed` with "Slopify stopped before this picture was finished. Press Generate again." (`slices/channels/cast-images.ts:123-131`, `main.ts:278`).
- Member or picture deleted while generating: the cascade removes the row, the late answer's `UPDATE … WHERE state='generating'` changes nothing, and the stored blob stays (`slices/channels/cast-images.ts:91-94`).
- A kit intro, outro or document theme that no longer exists is skipped at run start, not refused (`slices/channels/runs.ts:33-36`, `:81-84`). A kit font id is not checked against the fonts list on save (`slices/channels/schema.ts:21-25`).
- Deleting a channel whose templates are all in the trash is allowed; a restored template then reads as the default channel (`slices/channels/service.ts:123-124`).
- `moveTemplate` does not check `deleted_at`, so a trashed template can be moved (`slices/channels/service.ts:151-153`).
- A backup naming a channel this install lacks: its projects and templates read as the default channel (`0032-channels.sql:6-8`, `slices/channels/repo.ts:95-100`).
- A revision restored from a since-deleted channel leaves the project's channel row where it is (`slices/revisions/mutations.ts:326-330`).

## State transitions

- Channel: created (version 1) → each Brand save version+1 → deleted (non-default, no live templates). The default channel is never deleted (`slices/channels/service.ts:122`). AI disclosure changes do not move the version.
- Cast member: created → edits version+1 → deleted (cascade of its image rows).
- Cast image: `ready` (upload) or `generating` → `ready` | `failed`; `failed` never returns to `generating` (a retry is a new row); only `generating` rows move (`slices/channels/cast-images.ts:93`, `:154`).
- Project's channel: set at admission; changes only when a head revision names another existing channel, or when its channel is deleted (moved to default).

## Invariants

- Exactly one default channel with the fixed id (`0032-channels.sql:20-24`).
- A project or template always resolves to an existing channel (`resolveChannelId`).
- A started project's cast, brand values and language are copies in its config; later channel edits change no existing project (`slices/channels/model.ts:100-102`), except through an Edit project save that changes channel or switch (`slices/channels/rebrand.ts:5-6`).
- `image_blobs` rows are never deleted by any code path; only `INSERT … ON CONFLICT DO NOTHING` writes them (`slices/channels/repo.ts:258-266`).
- A channel with an empty kit and no cast produces the same run config and fingerprints it always did (`slices/channels/runs.ts:87-89`, `slices/rebuild/recipe-cast.ts:4-6`).
- At most 4 non-failed pictures per member; at most 4 members per image request.

## Outcomes & side effects

- Success endings: channel/member/picture rows written; responses 201 (create, upload), 202 (generate), 200 (read/update), 204 (deletes).
- Cost: a generated cast picture is metered as a standalone call against the channel and shows on Home's run cost (`slices/channels/cast-images.ts:9-11`, `kernel/runner/meter.ts:38-42`).
- Backups carry `channels`, `cast_members`, `cast_images` and `project_channels`, with `image_blobs` as files (`slices/storage/backup-format.ts:69`, `:90-95`); scenario 14.
- Schedules without their own brief read the channel's series brief (`withChannelBrief`, `slices/schedules/topics.ts:284-291`); scenario 25.
- No notifications and no telemetry events are emitted by this scenario.

## Dimensions not in play

- D1 Authority: single local user; no roles or ownership checks on any channel route.
- D5 Money: nothing charged in-app; generated pictures only add provider cost to the run-cost meter.
- D7 Time: no expiry or retention on channels, cast or pictures; blobs are kept forever.
- D13 Notification: none sent; the channel page polls picture state.
- D15 Record and audit: no history of brand or cast edits beyond `version` and `updated_at`.
