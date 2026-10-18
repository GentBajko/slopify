---
scenario: builtin-keywords
screens:
- 02-play
- 03-project
- 04-prompts
- 05-prompt-editor
- 06-entries
- 07-entry-editor
- 25-template-studio
depends_on:
- 03-placeholder-substitution
- 04-run-admission
- 09-image-generation
- 12-reruns-and-edits
- 15-prompt-management
- 24-project-templates
- 27-youtube-description
- 31-channel-memory
- 46-template-studio
generated_at_commit: d6a72d6428ff
generated_date: 2026-10-18
capstone_version: 7.0.1
content_hash: 91c3e6d07a4f
paths_covered:
  - ":(top)packages/app/src/slices/keywords/**"
  - ":(top)packages/app/src/slices/rebuild/recipe-keywords.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-digest.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-keywords.ts"
  - ":(top)packages/app/src/edge/http/keywords.ts"
  - ":(top)packages/app/src/slices/library/lint.ts"
  - ":(top)packages/web/src/components/keyword-insert-bar.tsx"
  - ":(top)packages/web/src/components/keyword-card.tsx"
  - ":(top)packages/web/src/components/old-keyword-names.tsx"
  - ":(top)packages/web/src/project/keyword-facts-refresh.tsx"
  - ":(top)packages/web/src/help/keyword-tips.test.ts"
---

# 47 Built-in keywords

Prompts, intro/outro entries and descriptions can use keywords Slopify fills itself. Each is written with the reserved `Slopify_` prefix, so it never becomes a field on Play and never takes a name a template already uses: `{{Title}}`, `{{Channel}}` and every other name stay the person's own. There are 23 of them; one table describes each (what fills it, where it works, what it costs) and the Insert bar, the hover cards, the help tips, the lint, the fillers and the wiki page all read that table. The old names `{{Scene}}` and `{{Appearance}}` keep working as `{{Slopify_Scene}}` and `{{Slopify_Appearance}}`. 03-placeholder-substitution.md has the keyword grammar, fields and rendering; this chapter has the registry, the fillers and the rules around them. Paths starting `slices/` or `edge/` are under `packages/app/src/`; keyword files are under `slices/keywords/`.

## Trigger & preconditions

| Behavior | Trigger | Preconditions |
|---|---|---|
| Insert and read a keyword | The Insert bar above a prompt or entry body, hover cards over a chip or over a keyword in the text (`packages/web/src/components/keyword-insert-bar.tsx`, `keyword-card.tsx`) | A prompt or entry editor (Library, template studio, Edit project's raw prompts) |
| Save a prompt or entry | Prompt and entry editors, Duplicate, Restore, `create_prompt`, `update_prompt` (`slices/library/lint.ts:15-84`, `slices/library/save.ts:42-77`, `:128-159`) | An unknown `Slopify_` name is refused unless the stored item already had it |
| Review and Start | Play's review and the Start click; a saved version of a project (`slices/library/slots.ts:141-148`, `slices/admission/rules.ts`, `slices/rebuild/recipe-validation.ts:117-147`) | A keyword outside its places stops the run |
| Copy the facts | A run starting whose picked prompts use a fact keyword (`slices/admission/start.ts:156-179`); Edit project → Prompts → **Refresh keyword facts** (`packages/web/src/project/keyword-facts-refresh.tsx`, `GET /api/keywords/facts/:projectId`, `edge/http/keywords.ts:25-43`) | The project exists and is not in the trash |
| Fill a planned prompt | Planning a project's requests (`slices/rebuild/recipe-keywords.ts:66-96`) | The prompt names a keyword usable at its place |
| Fill the late keywords | Sending an AI or image request, or opening an agent review (`slices/rebuild/runtime-run.ts:25`, `runtime-agent-review.ts:52`) | The request still holds `Slopify_Release_Date` or `Slopify_Duration` |
| The keyword digest | A planned version whose active prompts use a digest keyword (`slices/rebuild/recipe-digest.ts:20-53`) | An article exists or is planned |
| Read the registry | `GET /api/keywords`, `list_keywords` (`edge/http/keywords.ts:16-24`, `edge/mcp/tools-library.ts:25`) | None |

## Steps

### The registry (`slices/keywords/model.ts`, `specs.ts`)

1. **Spec** (`KeywordSpec`, `model.ts:43-56`): `name` (`Slopify_…`), `filler`, `fills` (the editor's words), `example`, `available` (when it exists), `places`, `cost`, `legacy` (the old name, if any) and `batch` (1 for the first batch the spec starred, 2 for the rest). `isReserved` (`model.ts:60`) treats the whole prefix as Slopify's, in any case, so a near miss never turns into a field a later keyword would take over.
2. **Places** (`keywordPlaces`, `model.ts:8-21`): `title`, `article`, `script`, `narration`, `intro`, `outro`, `image`, `thumbnail`, `description`, `shorts`, `review`. `placeOfKey` (`rules.ts:126`) maps a rendered prompt key to its place: `article` (or `script` when speakers write the script), `narration`, `intro`, `outro`, `description`, `shorts`, `shortsImage`, `referencePrompt` and `imagePrompts.N` (`image`), `thumbnailPrompt`, `review.*`.
3. **Fillers** (`fillerKinds`, `model.ts:26-35`) and **costs** (`keywordCosts`, `:38`; `costLabel`, `:65`): `facts` (free, copied when the run starts), `release` (free, read when the step runs), `chapters` (free, from the written article), `duration` (free, once the narration is finished), `digest` (part of one AI call per run, shared by every digest keyword), `scenes` (part of the scenes call, shared by every picture), `appearance` (part of the appearance lookup, with web search).
4. **The 23 keywords** (`keywordSpecs`, `specs.ts:24-266`, in the order the Insert bar and the wiki list them):
   - Facts, free, "When the run starts; later changes don't change this project.": `Slopify_Title` (the title with its keywords filled), `_Channel`, `_Series` (the channel's series brief), `_Links`, `_Previous_Video`, `_Next_Video`, `_Episode`, `_Cast`, `_Covered_Before`, all in every place but the title; `_Brand` in `image` and `thumbnail` only.
   - `Slopify_Chapters` (the article's chapter titles; not in Article or Script), `Slopify_Release_Date` (every place but the title), `Slopify_Duration` (`description`, `shorts`, `review`).
   - Digest (`image`, `thumbnail`, `description`, `shorts`, `review`): `Slopify_Summary`, `_Hook`, `_Thumbnail_Text`, `_Key_Facts`, `_Quote`, `_Tags`.
   - Pictures (`image`, `thumbnail`): `Slopify_Scene` (legacy `Scene`), `_Setting`, `_Mood`, `Slopify_Appearance` (legacy `Appearance`).
   `keywordNames` and `legacyNames` (`specs.ts:268-273`) feed `filledKeywords`, the names `collectFields` never asks for (`slices/admission/substitute.ts:72`, `:77-92`); `keywordOf` (`:275`) finds a spec by its name or its legacy one; `keywordsFor(place)` (`:279`) lists a place's keywords.
5. **Read by agents and the editor** (`edge/http/keywords.ts:16-24`): `GET /api/keywords` returns each spec with `cost: { kind, label }` and `places` as `{ place, label }`; `list_keywords` is the same route.

### Checking a body (`slices/keywords/rules.ts`, `slices/library/lint.ts`)

1. `keywordProblems(body, place, grandfathered)` (`rules.ts:32`) reads each well-formed slot and answers three kinds:
   - `unknown`: a `Slopify_` name that is no keyword, unless the stored item already had that slot (`grandfathered`): "{{X}} at line L, column C isn't a keyword Slopify fills: names starting with Slopify_ are Slopify's own. Rename it, e.g. {{X}}…".
   - `wrong-place`: a keyword outside its `places`: in the title ("Slopify fills its keywords from the title"), in Article or Script when it exists only once the article is written, a digest keyword where it cannot be written, a picture keyword outside picture prompts, the length before the narration is finished (`why`, `:79-96`). The message names where the keyword does work. An old name outside the picture prompts was plain text before the keywords and still is, so it is never a problem there (`:54-60`).
   - `legacy`: `{{Scene}}` or `{{Appearance}}` in a picture prompt: "It keeps working; use Update to new names in the editor".
2. **Save**: `lintPrompt` and `lintEntry` refuse only `unknown`, together with the name, length and slot-grammar errors (`lint.ts:15-84`); `keywordWarnings` (`:31-48`) returns the other two kinds, and `textEntryProblems` (`rules.ts:223`) for a Text-mode intro or outro, as warnings that do not stop a save. The grandfathered names are the stored item's own slots (`save.ts:77`, `:159`), a restored version's (`restoredSlots`), and, for Duplicate, the copied item's (`copyOf` on `POST /api/prompts` and `/api/entries`, `save.ts:42-52`, `:128-137`, so a copy of a prompt saved before the prefix was reserved can be made, and only names the copied prompt already has get through).
3. **Run** (`placedProblems`, `rules.ts:197-221`): a `wrong-place` keyword marks the field that picked the prompt ("… Change the prompt in Library, or pick another one."), unless the person gave that name a value of their own (a prompt saved before the prefix was reserved). Play's review applies it to the picked bodies (`slots.ts:147`), to the title (`admission/rules.ts:112`: any keyword in the title is refused) and a saved project version applies it to the version's prompts (`recipe-validation.ts:137`). An unknown `Slopify_` name is not a run problem: it stays an ordinary field to fill in.
4. **Text entries** (`textEntryProblems`, `rules.ts:223-238`): `{{Slopify_Release_Date}}` in a Text intro or outro is refused at Review and in a saved version (`recipe-validation.ts:138-147`): Text is narrated as written, and the release date is filled only into a request sent to an AI model. The message tells the person to set the entry's Mode to LLM.
5. **Costly uses** (`keywordUsesOf`, `rules.ts:175-195`): the first field whose body uses a `digest`, `chapters` or `scenes` keyword where it works. They make the text model required (`needsLlmFor`, `admission/rules.ts:450`, `recipe-validation.ts:54`), appear in the run's estimate, and are refused with Article Off ("{{Slopify_Summary}}, {{Slopify_Hook}} and the other digest keywords are written from the article, and Article is Off…", `articleOffFields`, `admission/rules.ts:664-740`). `{{Scene}}` is not one of them: it follows the Images switch as it always did.
6. **Old names** (`usesLegacy`, `rules.ts:106`; `upgradeLegacy`, `:117`): the editor offers **Update to new names** one name at a time (`packages/web/src/components/old-keyword-names.tsx`). Appearance means the same under both names; `Slopify_Scene` gives the picture its scene even with the Images switch off, which is why each is its own choice (`rules.ts:114-116`).

### Facts (`slices/keywords/facts.ts`, `values.ts`, `schema.ts`)

1. **When**: at the run's start `usesFacts` (`rules.ts:155`) asks whether any picked body names a fact keyword (every `facts` keyword but the title); only then `keywordFactsFor` runs and the result is saved as `config.keywordFacts` (`start.ts:156-179`). A draft never brings its own (`keywordFacts` is dropped from the draft). A run that uses none saves the config it always did.
2. **What** (`keywordFactsFor`, `facts.ts:30-102`; `KeywordFacts`, `values.ts:7`; `keywordFactsSchema`, `schema.ts:6`, bounded because Edit project sends it back with the config): the channel's name and series brief, its links (`readChannelLinksFor`), its cast, the other projects of the same channel made before this one (`coveredBefore`, the newest `coveredBeforeMax` = 50 titles), the previous project in the same series (`seriesOf`, `studio/plan-model.ts`) with its YouTube link when it has a video id, the next planned long video in the same series and posting plan line (`allReleases`, later than now), the episode number (earlier projects of the series plus one), and the brand kit's caption and title colours and font names unless the draft turns the brand kit off. A font is named for the bundled one ("Barlow") or an uploaded font's own family; a system font is left out because finding it scans the computer's folders (`fontName`, `:107`).
3. **Refresh**: `GET /api/keywords/facts/:projectId` runs `keywordFactsFor` for an existing project with `projectId`, which sees only the projects made before it. Edit project → Prompts → **Refresh keyword facts** lands the answer in the edit like any other change, so nothing is remade until Save, and the save remakes only what uses a changed fact (`keyword-facts-refresh.tsx`). A saved version whose prompt uses a fact keyword while the project has no facts is refused with "… Use Refresh keyword facts in Edit project → Prompts, then save again." (`recipe-validation.ts:117-127`). `get_keyword_facts` is the same route for agents.
4. **Text** (`factValues`, `values.ts:29`): each fact as a keyword's text. `Slopify_Links` is one `name: address` per line; `_Previous_Video` is `title – https://youtu.be/id`, or the title alone; `_Brand` is "Colours: …. Fonts: ….". In a Description prompt the links and neighbours stay the description's own placeholders (`{{<link name>}}`, `{{Previous video}}`, `{{Next video}}`, `nextVideoLink`, `values.ts:25`), filled when the description is shown or copied (27-youtube-description.md). Empty facts are the empty string.

### Filling a prompt (`slices/keywords/fill.ts`, `slices/rebuild/recipe-keywords.ts`)

1. **Order**: the person's own values are substituted first (`render`), so a value they gave a `Slopify_` name still wins; then `fillPrompt` (`recipe-keywords.ts:66`) replaces each keyword usable at the prompt's place. A text without a `Slopify_` keyword is returned as the very same string (`mentionsKeyword`, `fill.ts:19`), so its planned requests and fingerprints are unchanged; `recipe-keywords-compat.test.ts` pins golden fingerprints taken before the keywords were wired in, with old names, an unknown `{{Slopify_Wish}}` and the `Scene`/`Appearance` lines, and a change there is a change to every existing project.
2. **Values** (`fillKeywords`, `fill.ts:25`): fact values for the place (`factValues` with the project's subject as the title), plus the value a producer wrote (below). `scenes`, `appearance`, `release` and `duration` fillers are left as written here (`elsewhere`, `:17`): the pictures fill their scene and looks, and the late ones are filled as a request is sent.
3. **Empty value**: a line holding a keyword whose value is empty is left out, and three or more line breaks collapse to two (`fillWith`, `:60-98`). A `Series: {{Slopify_Series}}` line vanishes when the channel has no brief.
4. **Waiting**: a keyword whose producer has not answered (`Slopify_Chapters` before the article, a digest keyword before the digest) makes the prompt wait (`waiting`); the step is planned deferred and names the steps it waits on (`FilledPrompt.waits`, `dependsOn`), so it runs after its producer. `chaptersProducer` (`:45`) reads the article's top headings (`topHeadings`, `video/chapters.js`) from the article as this version has it (`articleMarkdownOf`, `:37`).
5. **Late keywords** (`fillLateKeywords`, `fill.ts:40`; `lateKeywordProviders`, `runtime-keywords.ts:20`; `lateValuesOf`, `:58`): `{{Slopify_Release_Date}}` (the long video's release time in the posting plan, "Thursday 22 October 2026" in this computer's time zone, `releaseDateText`) and `{{Slopify_Duration}}` (the narration's length, "42 min 10 s", `durationText`) stay in the planned request and are filled as an AI or image request is sent, or as an agent review opens; with none, the line is left out. A length that cannot be read yet (an article review runs before the narration) is blank, and the reason is logged as `keywords.duration`. Changing the date or the length never outdates anything.

### The digest (`slices/keywords/digest.ts`, `slices/rebuild/recipe-digest.ts`)

1. **When** (`keywordDigest`, `recipe-digest.ts:20`): only while a prompt the version runs uses a digest keyword (`keywordUsesOf(keywordBodies(…)).digest`). The step is `article:digest` (`digestKey`, `:15`), one text call in the Article stage ("Keyword digest" in the estimate, `slices/estimate/index.ts:316-327`, 600 output tokens, and in the run's step labels), asking the project's text model for all six parts every time, so adding another digest keyword to a prompt later reuses the same answer.
2. **Input**: the article the pictures are drawn from (`pictureText`), so editing the article by hand keeps the digest with the pictures; deferred (`operation: "keyword-digest"`) while the article is still to be written (`:30-43`).
3. **Prompt** (`digestMessages`, `digest.ts:14`): summary (two or three sentences), hook (one sentence), thumbnailText (two to four words, in the video's language), keyFacts (three to five), quote (one line as the article writes it), tags (five to fifteen); "Use only what the article says. Write in the article's language." Answer: JSON.
4. **Check** (`checkDigest`, `digest.ts:53`): a JSON object (the first `{` to the last `}`) with all six parts; whitespace tidied, list items stripped of bullets, tags joined with ", ". An answer that is not that, or leaves a part empty, fails the step with "The AI model didn't answer with the keyword digest… Use Try again; if it keeps happening, choose another model in the Providers section of Edit project." (`runtime-provider.ts:298`, `:370`).
5. **Stored**: the answer's `digest` is saved as the piece's payload (`runtime-provider.ts:370-381`) and read back by `savedDigest` (`recipe-digest.ts:56`), by either the physical or the logical fingerprint (a thinking setting change does not remake it). Its keywords are the producer `Slopify_Summary`, `_Hook`, `_Thumbnail_Text`, `_Key_Facts`, `_Quote`, `_Tags` (`digestNames`, `digest.ts:10`).
6. It is planned beside the chapters producer (`recipe-text.ts:293-303`) so every later prompt fills from the same two producers.

### Picture keywords

`Slopify_Scene`, `_Setting`, `_Mood` and `Slopify_Appearance` are filled per picture by the scenes call and the appearance lookup (09-image-generation.md). A `Slopify_` scene keyword in a picture's prompt turns the scenes call on for that picture even with Scenes from the article off, and adds the setting and mood to the request when asked (`usesSlopifyScene`, `slices/images/scenes.ts:28`); the estimate prices it (`slices/estimate/index.ts:306-315`); Edit project shows, under Scenes from the article when it is off, one fixed-on switch per picture that gets its scene anyway, naming the keyword (`packages/web/src/components/scene-keyword-rows.tsx`).

### Telling the person (in-app explanation)

1. **Insert bar** (`keyword-insert-bar.tsx`): above every prompt and entry body, a row of chips for the keywords that body's place can use (`keywordsFor`), wrapping within the editor's width; pressing one puts `{{Slopify_X}}` where the caret is, over a selection; one tab stop with arrow keys, Home and End.
2. **Hover card** (`keyword-card.tsx`): over a chip or over the keyword in the text, the table's own words: what it fills, an example, when it exists, where it works and what it costs, and, if used wrongly, the lint's sentence; an old name says it keeps working once. The card floats without taking focus; Esc closes it.
3. **Marked in the text**: with a place, the prompt body's mirror marks each keyword Slopify fills: one usable here, a misuse (with the lint's sentence) and an old name (`packages/web/src/components/slot-body.tsx`); the editor's local lint is the server's own (`packages/web/src/lib/draft-lint.ts`). Edit project's raw prompts have the same bar and a callout when a scene keyword has no effect (the establishing image and a short's picture are drawn without a scene, `raw-prompt-field.tsx:69-73`).
4. **Help**: each Insert bar has a tip, `library.keywords.<place>`, that lists the keywords the place can use and links the wiki page `Keywords-Slopify-Fills` (`packages/web/src/help/entries/library.ts`).
5. **Requirement, kept by two tests**: every keyword must be explained in the app and on the wiki page `docs/wiki/Keywords-Slopify-Fills.md`. `slices/keywords/wiki.test.ts` reads the page and fails unless it contains `{{<name>}}` for every spec and every legacy name; `packages/web/src/help/keyword-tips.test.ts` fails unless each place's tip lists exactly `keywordsFor(place)` in order and links that page. A keyword added to `specs.ts` without the wiki page and the tips fails the build.

### In the template studio and schedules

1. The studio's `keywords` check counts a keyword as filled when it has a value, is a schedule's topic keyword, or `filledKeywords` or `isReserved` names it (`slices/template-studio/checks.ts:95-127`); an empty keyword that blocks a sample is named with where it is filled (`quote.ts:87-91`). 46-template-studio.md has the rest.
2. A schedule may name the keywords of the newest version that is not yet ready as well as the version it runs (`scheduleKeywords`, `slices/schedules/topic-list.ts:238`). Built-in keywords are never a schedule's keywords: they are no fields, so the topic keyword and every-run values must name the template's own.

## Branches

| Decision | Rule | Pointer |
|---|---|---|
| Name is a registry name | never a field; filled where it works | `substitute.ts:72`, `:85` |
| Name is `Scene` or `Appearance` | the old name of `Slopify_Scene` / `Slopify_Appearance`; plain text outside picture prompts | `rules.ts:54-60` |
| Name starts `Slopify_` but is unknown | refused on save unless already stored; an ordinary field on Play | `rules.ts:44-51`, `lint.ts:80-81` |
| Keyword outside its places | warning in the editor, refusal at Review and for a saved version, unless the person gave the name a value | `rules.ts:197-221` |
| Keyword in the title | refused | `admission/rules.ts:112` |
| Text intro/outro with the release date | refused | `rules.ts:223-238` |
| Digest, chapters or scene keyword used | text model required, priced, deferred behind its producer; refused with Article Off | `rules.ts:175-195`, `admission/rules.ts:450`, `:664-740` |
| Fact keyword used | facts copied at start; absent facts refuse a saved version | `start.ts:162`, `recipe-validation.ts:117-127` |
| Value empty | its line is left out | `fill.ts:75-85` |
| Producer not answered | the prompt waits, its step deferred | `recipe-keywords.ts:89-95` |
| Description prompt | links and neighbour videos stay the description's own placeholders | `values.ts:29-60` |
| Release date / length | filled when the request is sent | `runtime-keywords.ts:20-53` |
| Brand kit off | `Slopify_Brand` is empty | `facts.ts:73` |

## Unhappy paths

| Case | Result | Pointer |
|---|---|---|
| Unknown `Slopify_` name saved | 400 on the body "…isn't a keyword Slopify fills: names starting with Slopify_ are Slopify's own. Rename it…" | `rules.ts:44-51` |
| Keyword where it can't be filled | field error naming the prompt, the place and where it works | `rules.ts:72-77`, `:197-221` |
| Digest answer not usable | step fails with the sentence above; Try again | `digest.ts:53-90` |
| Digest keyword with Article Off | refused with "Set Article to Generate or Provide, or remove them from this prompt" | `admission/rules.ts:731-738` |
| Saved version using facts with none | refused, naming Refresh keyword facts | `recipe-validation.ts:117-127` |
| Project in the trash on Refresh | 404 "This project is in the trash. Restore it in Settings → Trash, then refresh its keyword facts." | `edge/http/keywords.ts:29-34` |
| Project gone on Refresh | 404 "This project no longer exists. Go back to Projects to pick another." | `edge/http/keywords.ts:29-34` |
| Length can't be read yet | the line is left out, `keywords.duration` warning logged | `runtime-keywords.ts:66-78` |
| Duplicate of a prompt holding a name the copy didn't have | refused like a new prompt | `save.ts:42-52` |

## State transitions

None of its own. The facts and the digest are written once into the project's config and revision pieces (`config.keywordFacts`; piece `article:digest`) and change only when the person refreshes the facts, edits the article or a prompt, or remakes the step; the late values are never stored.

## Invariants

1. A body with no `Slopify_` keyword fills to the very same string, so no existing project's request, fingerprint or outdated mark changes (`fill.ts:60-98`, `recipe-keywords-compat.test.ts`).
2. A keyword Slopify fills is never a field on Play, a template or a schedule (`substitute.ts:77-92`).
3. The person's own value for a `Slopify_` name wins over the filler and over the place check (`recipe-keywords.ts:75-86`, `rules.ts:205`).
4. Facts are copied when the run starts and change only on Refresh; the release date and the length change nothing when they change (`start.ts:156-179`, `runtime-keywords.ts:16-19`).
5. One digest call serves every digest keyword of a run, whatever the number used (`digest.ts:5-8`).
6. A keyword that costs an AI call appears in the estimate, makes the text model required and is refused with Article Off (`estimate/index.ts:306-327`, `admission/rules.ts`).
7. Every keyword is explained in the editor, the help and the wiki page (`wiki.test.ts`, `keyword-tips.test.ts`).
8. Editor, Play and run share one grammar (`detectSlots`), imported and never restated (`rules.ts:4`, `lint.ts:1-3`).

## Outcomes & side effects

- `config.keywordFacts` on a project that uses a fact keyword; an `article:digest` piece with its `digest` payload on a project whose prompts use a digest keyword; both appear in the project's revisions and files like other pieces.
- A digest call is a billed or plan-metered AI call in the Article stage; scenes and appearance calls are 09's.
- No keyword writes anything on the Library or the channel.

## Recorded differences from the feature spec

The spec is the 4.0 changelog entry (`changelog.d/2026-10-18-keywords-slopify-fills.md`).

- Specified as "saving refuses an unknown `Slopify_` name"; shipped as that, with the stored item's own slots, a restored version's and a Duplicate's source let through, so nothing already saved becomes unsavable (`lint.ts:13-14`, `save.ts:42-52`).
- Specified as "Play refuses a keyword where it can't be filled"; shipped also for a saved version of a project and for the title, and not when the person gave the name a value of their own (`rules.ts:197-221`, `recipe-validation.ts:137`).
- Specified with a keyword count left open; shipped 23 (10 facts, 3 other free ones, 6 digest, 3 scene and 1 appearance), of which batch 1 is the starred set (`specs.ts`).
- Specified as "the keyword digest adds to the run and to the cost estimate"; shipped as one `article:digest` step, planned deferred, priced as "Keyword digest" (`recipe-digest.ts`, `estimate/index.ts:316-327`).

## Dimensions not in play

- D1 Authority: none; keywords read the channel's own data on this computer.
- D5 Money: a digest, scenes or appearance keyword adds one AI call per run, shown in the estimate; fact keywords are free.
- D7 Time: facts are a snapshot at the run's start; only the release date and the length are read later.
- D13 Notification: none.
