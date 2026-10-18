---
scenario: template-studio
screens:
- 14-templates
- 25-template-studio
- 08-settings
- 29-settings-models
- 13-schedules
- 26-designs
depends_on:
- 03-placeholder-substitution
- 04-run-admission
- 12-reruns-and-edits
- 22-play-drafts
- 24-project-templates
- 25-scheduled-jobs
- 37-run-cost-and-eta
- 45-mcp-agent-access
- 47-builtin-keywords
- 48-model-lists-and-checks
- 49-promise-check
- 52-designs
generated_at_commit: d6a72d6428ff
generated_date: 2026-10-18
capstone_version: 7.0.1
content_hash: 4b9e0c52a7d1
paths_covered:
  - ":(top)packages/app/src/slices/template-studio/**"
  - ":(top)packages/app/src/edge/http/template-studio.ts"
  - ":(top)packages/app/src/edge/http/design-templates.ts"
  - ":(top)packages/app/src/edge/mcp/tools-template-studio.ts"
  - ":(top)packages/app/src/slices/designs/gate.ts"
  - ":(top)packages/app/src/slices/designs/sections.ts"
  - ":(top)packages/app/src/slices/designs/studio-kind.ts"
  - ":(top)packages/app/src/slices/designs/templates.ts"
  - ":(top)packages/app/src/slices/designs/budget.ts"
  - ":(top)packages/app/src/kernel/db/migrations/0064-template-studio.sql"
  - ":(top)packages/app/src/kernel/db/migrations/0074-template-bakeoffs.sql"
  - ":(top)packages/web/src/template-studio/**"
  - ":(top)packages/web/src/routes/templates.tsx"
---

# 46 Template studio

A project template is set up once, section by section, with live samples beside its settings, and then marked ready so that its schedules run it. The studio is Library → Templates → **Open studio** (`/templates/$templateId`, `packages/web/src/router.tsx:380`). It is not `slices/studio`, which is the YouTube Studio pack and its extension (44-studio-autopilot.md). Paths starting `slices/` or `edge/` are under `packages/app/src/`; studio slice files are under `slices/template-studio/`; routes are under `/api/template-studio` (`edge/http/app.ts:237`); design templates are under `/api/design-templates` (`edge/http/app.ts:242`).

A sample is a taste of one video made from the template: free ones are made on this computer, the paid one on a hidden project through the same engine every project runs on. Nothing is spent above what the person saw, with a price unknown they did not accept, or past a daily budget. Until a version is first marked ready the studio changes nothing for schedules: they run the template's newest version as in 3.x.

## Trigger & preconditions

| Behavior | Trigger | Preconditions |
|---|---|---|
| Open a template's studio | Library → Templates row **Open studio**, or the address `/templates/$templateId?section=` (`packages/web/src/routes/templates.tsx`, `packages/web/src/template-studio/page.tsx:39-85`); `GET /:id` and `GET /:id/checks` (`edge/http/template-studio.ts:278`, `:363`) | The template exists (404 "This template no longer exists…" otherwise); a design template's id opens the design editor instead (`page.tsx:54-62`) |
| Free samples | Opening the studio asks once per version when a free sample is stale or the schedules' cost is unpriced (`page.tsx:138-147`); **Make samples**; a Save without a sample; `POST /:id/free-samples` (`edge/http/template-studio.ts:477`) | Nothing is paid; the video, loudness and PDF samples need ffmpeg (`slices/template-studio/free.ts:151-158`) |
| Save | The action bar's **Save · <price>** or **Save without a sample**; `POST /:id/quote` first, then `POST /:id/save` (`packages/web/src/template-studio/save-bar.tsx:28-175`, `edge/http/template-studio.ts:368`, `:399`) | The template is at the version the page opened (`baseVersion`); Play's review at the server (`review`) is present or the route answers 503 (`edge/http/template-studio.ts:404`) |
| Make sample | The paid sample's button after it waited or failed; `POST /:id/samples/make` (`edge/http/template-studio.ts:458`) | The template is at the version shown |
| Change the sample topic or full script | **Sample topic**, **Write the full script in the sample**; `PUT /:id/topic`, `POST /:id/full-script` (`edge/http/template-studio.ts:420`, `:439`) | Priced first like a Save |
| Say it as | Voice → **Say it as**; `GET /:id/pronunciations`, `POST /:id/say-it-as/quote`, `POST /:id/say-it-as` (`edge/http/template-studio.ts:327`, `:333`, `:348`) | A paid sample with a script exists |
| Prompt anatomy | A section's **Prompt anatomy**; `GET /:id/anatomy?section=&item=` (`edge/http/template-studio.ts:283`) | `review` present |
| Mark ready | **Mark ready** in the studio's header or `mark_template_ready`; `POST /:id/ready` (`edge/http/template-studio.ts:305`, `packages/web/src/template-studio/ready-gate.tsx:31-97`) | The version is the template's newest; every free check passes; every section's sample is current, off or provided at run time |
| Compare models | **Compare models** beside Script, Voice or Pictures, or Settings → Models → New for you → **Compare on a sample**; `POST /:id/bakeoff/quote`, `POST /:id/bakeoff`, `GET`, `DELETE /:id/bakeoff` (`edge/http/template-studio.ts:525-575`, `packages/web/src/template-studio/bakeoff.tsx`, `compare-on-sample.tsx:21`) | The section has a model; the newest version has a done paid sample |
| Export pack | **Export pack**; `GET /:id/pack` (`edge/http/template-studio.ts:578`, `packages/web/src/template-studio/pack.tsx:28-78`) | A version its schedules may run exists (marked ready, carried, or saved before the studio) |
| Import pack | Library → Templates **Import template pack**, `import_template_pack`; `POST /packs/import` (`edge/http/template-studio.ts:246`, `packages/web/src/template-studio/pack.tsx:92`) | A zip of at most 30 MB |
| Daily sample budget | Settings → Template studio; `GET`/`PUT /settings` (`edge/http/template-studio.ts:221-226`, `packages/web/src/template-studio/settings-panel.tsx:21`) | Budget 0 to 1000 dollars |
| Samples for all | Settings → Template studio → **Make samples for all**; `POST /samples-for-all/quote`, `POST /samples-for-all` (`edge/http/template-studio.ts:228-244`) | `review` present |
| Design template | Library → Templates, **Design templates** section; `/api/design-templates` (`packages/web/src/routes/templates.tsx`, `edge/http/design-templates.ts:82-232`) | Designs are wired (else 503 "Design templates aren't available…") |

## Steps

### Sections, lamps and what a change outdates (`slices/template-studio/model.ts`, `sections.ts`, `status.ts`)

1. **Sections** (`model.ts:6-19`), in the order a run makes them: `subject` (Subject & research), `script`, `voice`, `pictures`, `video` (Video & captions), `thumbnail` (Thumbnail & title), `shorts`, `document` (Document (PDF)), `reviews` (Reviews & checkpoints), `upload` (Upload pack), `schedule`. Labels are `sectionLabel` (`model.ts:21-33`).
2. **Where a setting lives** (`sections.ts:10-95`): `formSections` and `documentSections` are full records over Play's form and document, so a field added to Play fails the typecheck until it has a section (or `null`: the schema version, the librarySnapshot, Play's open tab). `sectionOfField` reads a path down to the third level (`form.sources.audio`); `sectionOfWork` places a rebuild work key (`article:body`, `image:harbor`, `review:…`) in a section (`sections.ts:96`, `:111`).
3. **What a change outdates** (`dependents`, `sections.ts:143`; `affectedSections`, `:158`; `withDependents`, `:171`): a changed section outdates the sections made from it, in pipeline order: subject → script, schedule; script → voice, pictures, thumbnail, document, upload, reviews; voice → video, reviews; pictures → video, thumbnail, reviews; video → shorts, upload; thumbnail → reviews.
4. **Lamp states** (`sectionStates`, `model.ts:37-47`): `current`, `making`, `waiting` (with why), `needs-fix` (with the failed step's own sentence), `stale` (no sample, or made for an older version), `off`, `provided`. `baseStatuses` (`status.ts:75`) starts every section from its source: off (`offSentence`, `:58`), provided at run time (no sample, never blocks Mark ready), or "No sample yet. Press Save to make one, or Make sample." `madeStatuses` (`:103`) lays the free samples over it (video, voice's loudness, document), Reviews as always current, and Schedule current, off (no schedule uses the template) or stale (a run could not be priced). `paidStatuses` (`:175`) covers `subject, script, voice, pictures, thumbnail, shorts, upload` (`paidSections`, `:148`) from the version's sample row: done → current "Made for version N."; a section the change since the last done sample never touched stays current "Made for version M; nothing it shows changed since."; queued or making → making or waiting ("Waits for another template's sample to finish." / "Queued: it starts in a moment."); held → waiting with the hold sentence; failed → needs-fix with the step's sentence; else stale "Changed since the sample of version M."
5. **The studio's view** (`getStudio`, `service.ts:142`): the template at its head version; its gate (`gateOf`), `runnableVersion`, `gated`; the sample topic, topic source and full-script flag (`sampleOf`, else `defaultSampleTopic`, setting `templateStudio.sampleTopic.default`, fallback "The history of the lighthouse", `model.ts`); the sections (a version Slopify itself wrote keeps its gate and each stale section says so, `carriedSentences`, `service.ts:187`); the paid view; the free samples; the next five scheduled runs and the monthly cost; the reviews path (`reviews-path.ts`; its "The opening's promise" step is 49-promise-check.md's). It does not wait on the providers: the free checks are read on their own (`getStudioChecks`, `service.ts:213`; the provider lookup is shared for 30 s by `createReadinessCache`, `service.ts:118`, and a failed one is never kept).
6. **The page** (`packages/web/src/template-studio/page.tsx:105-267`): a section rail (`section-rail.tsx`; lamp tones `stateTone`, words `stateWord`), the section's controls (`visible.tsx`) with the rest under **Fine-tune**, **Made with** (`made-with.tsx`), Compare models for Script, Voice and Pictures, **Prompt anatomy**, the sample panel and checks list on the right, and the action bar. On a narrow screen the three columns become the tabs Sections, Settings and Sample. Leaving with unsaved changes asks first (`UnsavedLeaveGuard`).

### Free samples (`free.ts`, `loudness.ts`, `document-sample.ts`, `free-video.ts`, `schedule-sample.ts`)

1. `createFreeSamples` (`free.ts:65`) keeps each sample by the hash of what it is made from, so a setting changed back, or the same setup in another template, shows at once.
2. **Video & captions**: 30 seconds made by the style preview's renderer from the template's frame, captions, Look and picture timing on Slopify's bundled sample pictures and narration (`free-video.ts`; served as `/api/style-preview/<hash>.mp4`).
3. **Voice's loudness**: Slopify's sample narration as it came, and the same levelled to the template's video target; before and after LUFS, the target and the peak ceiling are read back. The reading is the levelled master's, not the MP3 played (`loudness.ts:39-43`). Off when Level the volume is off. Served by `GET /:id/loudness/before.mp3|after.mp3` (`edge/http/template-studio.ts:491`).
4. **Document**: the Library theme editor's sample article laid out in the template's theme (`document-sample.ts`), `GET /:id/document.pdf`.
5. **Schedule**: the next five runs of the schedules that use the template with the titles their queued topics fill, and the cost a month at the high estimate (`upcomingRuns`, `schedule-sample.ts:22`; `runsPerMonth`, `:55`; `monthlyCost`, `:79`). A paused schedule still uses the template: its runs are listed marked paused and it costs nothing a month until resumed, when it would cost `paused.high`. A run that cannot be priced counts as an unknown step and its reason becomes the schedule lamp's sentence.
6. A failure is kept in memory by sample and hash (`free.ts:66-67`) and shown as a `needs-fix` sentence naming the missing font, missing ffmpeg or an ffmpeg error and "press Make samples" (`free.ts:241-256`). Without ffmpeg every free sample says so (`free.ts:154-158`).
7. The free samples run on the studio's one loop (below) as a job of kind `free`; the job also prices each schedule's run through Play's review (`make.ts:48-54`, `schedule-price.ts`), kept in an in-memory `PriceCache` by schedule and template version (`service.ts:43-60`), so after a restart the next job prices them again.

### The paid sample: quote, Save, queue (`quote.ts`, `save.ts`, `scope.ts`, `jobs.ts`, `paid.ts`)

1. **What a sample is** (`sampleDocument`, `scope.ts:28`): the template's setup as one short run. Every keyword the title names and the template leaves empty is the topic (a title without a keyword is the topic itself); sections provided at run time are off, except text the template holds; variants, checkpoints and the image scale are dropped; the thumbnail count is 1; the shorts count is 1; at most `samplePictures` = 4 pictures (`:10`, `cappedPrompts`); an agent's reviews are not asked (stages emptied); a provided reference is off, an uploaded ambient file is none, and provided music, audio, thumbnail and pictures are dropped. The article is told "write the outline and only chapter 1, then stop" unless the full script was asked for (`sampleArticleInstruction`, `:16`); the narration says about `sampleSpokenWords` = 80 words (`:12`, `sampleNarrationText`, `:111`).
2. **Quote** (`quoteSample`, `quote.ts:139`): Play's own review resolves the sample's single run on a draft that is never saved (`resolveSampleRun`, `:48`); `estimateRun` prices it. The first sample of a template (none yet, or its project gone) prices every row; later ones price only the rows of the sections the change outdates (`sectionOfRow`, `:93`; a row the studio cannot place is counted, so a quote may be high, never low). `totals` (`:116`) gives low, high, the count of rows with no price (`unknown`), `onPlan` (every priced row runs on a CLI plan) and `usesPlan` (some row does). `fits` is `fitsBudget` for that high. A setup Play's review refuses comes back as `problem` (an empty keyword is named, with where it is filled, `fieldSentence`, `:87`), `fits` false.
3. **Save** (`saveStudio`, `save.ts:109`), after `saveStudioSchema` (`:20`: `mutationId`, `baseVersion`, `name`, `document`, `sample` make|skip, `acknowledgedHigh`, `acknowledgedUnknown`):
   - The same `mutationId` as the head's answers what it did the first time (`replayed`), or 409 if the document differs (`:134-154`).
   - `baseVersion` other than the head → 409 "This template changed since you opened it: it is now version N…" (`:155-160`).
   - With `sample: "make"` the quote is taken again: a problem → 400 "… Press Save without a sample to keep the change."; a high above `acknowledgedHigh × 1.25 + 0.05` (`exceedsAcknowledged`, `:38`: a quarter and five cents over) → 409 `cost-changed` with the new quote; unknown steps with `acknowledgedUnknown` not true → 409 `cost-changed`; not `fits` → 409 `over-budget` (`budgetWords`). A refusal carries the new quote so the page shows it on the button (`edge/http/template-studio.ts:136-150`).
   - `updateTemplate` writes the next version (the same service as 24-project-templates.md); then, with a sample, the version's row is `queued` at the quoted high and a job of kind `save` is queued; without, the row is `skipped` and a `free` job is queued (`save.ts:195-231`). Unknown prices are accepted for that version when ticked, or when the quote priced every step (`UnknownAcks`, `:46-81`, kept in setting `templateStudio.unknownAccepted`, the newest 20 versions per template).
4. **Queue** (`enqueueJob`, `jobs.ts:30`): at most one queued and one running job per template (`template_sample_jobs`, primary key `(template_id, state)`, `0064-template-studio.sql`); a newer request replaces the queued one and waits behind the running one, which is never stopped. A `free` request never replaces a queued paid job for the same version or a queued bake-off. A paid job queued over a waiting bake-off drops it, saying so (`supersedeQueuedBakeoff`, `bakeoff-repo.ts:167`). `claimNextJob` (`:69`) hands out the oldest queued job only while none runs anywhere: one sample at a time across every template. `recoverJobs` (`:102`) queues a job that was running at shutdown again, unless a newer one waits for its template.
5. **The loop** (`createSampleRunner`, `runner.ts:30`, started in `main.ts:687-704`, stopped at shutdown `main.ts:1126`): claims a job, tells the studio (`changed`), runs `sampleMaker` (`make.ts:26`: free samples, then the paid one unless the job is `free`, then the schedules' prices; a `bakeoff` job makes only the bake-off), finishes the job and tells again. It yields to the event loop between jobs, so the server and page stay responsive. An error is logged with the template and version and never stops the loop.
6. **The paid job** (`makePaidSample`, `paid.ts:162`): resolves the sample's run again from the template version.
   - If the template's hidden project exists, it first waits until the last sample's work has finished (`settled`, `sampleBusy`, `:68`: a stage running, or admitted work pending while nothing failed, was canceled or paused). Work already going is never stopped.
   - A version whose sample already started on that project (a restart queued its job again) is continued there, never made again on a new one; if a restart stopped it (`stoppedByRestart`), what is left of the quote is held against the budget and the run resumed (`recoverProject`).
   - A later version saves the project's next revision with the new setup (`sampleEdit`, `edit.ts:9`: the config a fresh run would start with and each prompt's template body as written now), previews `allAffected`, holds, and `startRebuild` makes only what the change outdates. A change the project's editor cannot make starts the sample on a project of its own; a new topic does too (the old project is removed only once the new one actually starts).
   - The first sample starts a run through Play's start path (`startRun`) after `checkDraftReadiness`, under an id reserved in the sample's row first, so every file the run writes is in the data directory from its first file (`:356-398`).
7. **Holds** (`holdReason`, `paid.ts:48`): the version waits (state `held`, nothing spent) when its cost is above `ackHigh × 1.25 + 0.05` ("Waiting: this sample now costs about $X, more than the $Y you saw. Press Make sample ($X) to make it."), when steps have no known price and the version is not covered by `UnknownAcks`, or when it does not fit today's budget (`budgetWords`). The rebuild's preview prices a step that depends on an earlier answer only once that answer is there, so the larger of the preview and the price on record is held (`covered`, `:405`). `Make sample` (`requestSample`, `save.ts:250`) queues the current version again at the price on the button, accepting unknown prices when ticked.
8. **Result** (`finish`, `paid.ts:429`): the project is settled, then the version's row is `done`, or `failed` with the failed step's own sentence (`outcome`, `:125`) where a project's "use Try again (on Stage)" reads "press Make sample to try again", the studio's button (`studioWords`), or a stopped-before-finish sentence.
9. **Topic and full script** (`topic.ts`): `setSampleTopic` (`:191`) takes a typed topic, `"next-queued"` (the first queued topic of any schedule using the template, else "No schedule of this template has a topic queued…") or `"fixed"` (back to the default). It prices every section; a retry with the same `mutationId` and body replays (`templateStudio.topicMutation.<id>` setting). `setFullScript` (`:272`) prices the script and what is made from it (`withDependents(["script"])`). Both go through the same cost-changed, unknown-price and over-budget refusals as Save and queue a job of kind `topic` or `full-script`; a second press of what the sample is already made, or being made, of spends nothing (`alreadyMade`, `:160`).
10. **Say it as** (`say-it-as.ts`): `pronunciationsOf` (`:151`) lists the names the sample's script says that a voice may get wrong with the line each is said in; `sayItAs` (`:287`) writes a Library → Narration aliases row and voices again only the sample's lines that say it, priced first and refused with the new quote on the same rules. **Prompt anatomy** (`anatomy.ts:81`, `anatomy-view.ts:71`) cuts each prompt a section sends into the person's words, their keywords' values, Slopify's own keywords and what a setting added, read from the prompt as it was sent when the sample was made from this setup.

### Hidden projects and isolation (`repo.ts`, `hidden.ts`, `0064-template-studio.sql`, `0074-template-bakeoffs.sql`)

1. A template's sample project is recorded in `template_samples` (`0064`), a bake-off copy in `template_bakeoff_clones` (`0074`); the view `template_hidden_projects` unions both.
2. Every list the person sees leaves them out with `notTemplateSample()` (`repo.ts:13`): the Projects lists (`admission/heads.ts:44`, `admission/repo.ts:111`), first-run, the Library's Used by (`library/used-by.ts:213`, `:234`), the schedules' topic and prepared-video lookups, the calendar, the week and cost figures, storage trim and arrange, backups and portable export, Trash, the weekly autopilot report and designs. The global event feed and the tally skip them (`templateSampleCheck`, `main.ts:388`, `:1235`, `:1343`), notifications and episode memory ignore them (`notifications/subject.ts:19`, `episodes/summarize.ts:110`), and the agents' attention list skips their stops (`agents/attention.ts:102`). `edge/http/template-sample-isolation.test.ts` asks every GET route of the API and fails if a route added later names a hidden project.
3. The folders are kept in the data directory (`kernel/paths.ts:82`, `<dataDir>/template-studio/samples`; `sampleProjects`, `repo.ts:33`), including a sample whose row went with its template, until the project is deleted.
4. A write to `/api/projects/:id/*` on a sample project is refused with 409 "This is the studio sample of <name>. Change the template in its studio instead…" (`reason: "template-sample"`, `edge/http/app.ts:390-401`); the studio's runner reaches the project's slices directly (`sampleOwner`, `repo.ts:54`).
5. Removing one (a sample made again on a new topic, a discarded bake-off copy) goes through `removeHiddenProject` (`hidden.ts:8`): its priced calls are first copied into `template_studio_spend`, so removing a project never frees budget it already spent; if the project cannot be removed (still running, a file the OS keeps) the copied rows are dropped again so nothing counts twice.

### The daily sample budget (`budget.ts`)

1. Settings → Template studio holds the project templates' two settings (and, beside them, the designed pieces' own `designs.dailySampleBudget`, scenario 52): `templateStudio.dailyBudget` (dollars, 0 to 1000, default `defaultDailyBudget` = 2, `budget.ts:14`; stored rounded to cents) and `templateStudio.samplesUsePlans` (default off) — "Samples may use my CLI plans" (`budget.ts:12-52`). A CLI plan has no dollar price, so the budget cannot hold it back: a sample with a step on a plan waits until plans are allowed (`fitsBudget`, `:120`).
2. **Spent today** (`spentToday`, `:70`): the priced calls of every hidden project billed per use since local midnight on this computer's clock (`provider_usage` where `on_plan = 0`), plus `template_studio_spend` for removed ones. Other projects' calls never count. Calls billed per use whose price nobody knows add nothing but are counted and named beside it (`unpricedToday`, `:85`).
3. **Room** (`budgetRoom`, `:106`): `{ budget, spent, unpriced, left, plans }`; a sample of about `high` dollars fits when `high ≤ left` (`fitsBudget`). `budgetWords` (`:129`) is the one sentence every wait uses: "… costs about $X and $Y of today's $Z sample budget is left (samples spent …). Raise the budget in Settings → Template studio", or "… runs on your CLI plan, and samples may not use CLI plans. Turn on Samples may use my CLI plans…".
4. Budget 0 means nothing spends money. A sample that does not fit waits (state `held`) until the next day, a higher budget or plans allowed; it starts only when the person presses Make sample again.
5. **Samples for all** (`for-all.ts`): `quoteSamplesForAll` (`:64`) prices, one template at a time and yielding to the event loop between them, the sections each template's newest version lacks (`wanted`, `:46`: every section before a first sample, the paid sections changed since the last done one, none when the version is made or on its way); each item fits what is left after the ones before it, in name order. `makeSamplesForAll` (`:149`) refuses 409 `cost-changed` when the total is above `acknowledgedTotal × 1.25 + 0.05`; items that fit are accepted and queued as `save` jobs at their share of the total the person saw; the rest are held with the budget sentence, an unaccepted unknown price, or the CLI-plan sentence.

### Mark ready and the schedule opt-in (`gate.ts`, `checks.ts`, `ready.ts`, `schedule-gate.ts`)

1. **Gates** (`template_gates`, `0064-template-studio.sql`; `repo.ts:82`): one row per template version with state `legacy` (written by the migration for every revision that existed), `ready` (marked in the studio, with the checks it passed and `marked_at`) or `carried` (Slopify copied a runnable gate, `carried_from`). A version with no row was never checked.
2. **Opt-in** (`isGated`, `gate.ts:28`): a template is gated from the first time any of its versions is marked `ready`. Until then `runnableVersion` (`gate.ts:34`) is the head, so an edit applies to the next run as in 3.x; the studio, the Schedules screen and Library → Templates say "Not checked in the studio" (`packages/web/src/template-studio/gate-words.ts:12-61`). Once gated, `runnableVersion` is `checkedVersion` (`gate.ts:19`): the newest version at or below the head that is legacy, ready, or carried from a runnable one (`runnable` follows `carried_from` down to a ready or legacy gate, never in a cycle). A newer unchecked version waits for Mark ready while schedules keep running the checked one.
3. **What schedules read**: `templateGate` (`schedule-gate.ts:22`) answers `{ head, runs, gated, gate }`; `runnableTemplate` (`:41`) is the version a schedule runs, previews and checks against (a gated template with nothing to run answers its head so the schedule can still be edited); `notReadySentence` (`:52`) is "Not started: <name> has no version marked ready. Open it in Library → Templates → Open studio and press Mark ready." when a gated template has no runnable version. They are wired as `ScheduleDeps.template`, `.notReady`, `.templateHead` and `.templateGate` (`main.ts:633-636`). 25-scheduled-jobs.md has the scheduler's side; `GET /api/project-templates` adds the same `gate` to each template (`edge/http/project-templates.ts:58-66`), and the agents' attention list reports an active schedule whose gated template has nothing to run as `template-not-ready` (`slices/agents/attention-templates.ts:12-44`, `agentCanAct` false).
4. **Free checks** (`freeChecks`, `checks.ts:77`), read by `GET /:id/checks` as `{ version, checks }`; each failing check has a sentence and a fix link:
   - `keywords` (`:95`): every keyword the title, the prompts and the intro/outro bodies name has a value, is the topic keyword of a schedule (or the title's), or is filled by Slopify (`filledKeywords`, the registry's names and `Scene`/`Appearance`, 47-builtin-keywords.md). The bodies are the Library's now, else the template's copy (`bodies`, `bodiesOf`, `service.ts:103`).
   - `providers` (`:192`): the text, voice, picture and reviewer providers the template uses (`usedProviders`, `:129`) are chosen and ready on this computer (a key stored or a CLI found).
   - `voice` (`:219`): when Slopify voices the narration, a voice is chosen and the narration's and each speaker's voice ID is one of the voices in Settings → Voices (an imported pack's voice may be someone else's).
   - `release-slots` (`:258`): each schedule's run day has a release time and enough short release times for the template's shorts count.
   - `monthly-cost` (`:298`): the schedules' cost a month is known (every step priced); with paused schedules the sentence says what resuming would add.
   - `answerers` (`:331`): when a checkpoint or an agent reviewer would wait for an answer, a notification address is set or an agent connected in the last 7 days (`agentWindowMs`, `:75`).
5. **Mark ready** (`markReady`, `ready.ts:107`; `POST /:id/ready`, body `{ version }`): unknown template → 404; a version that is not the head → 409 "Version N is no longer the newest…" (re-checked after the provider lookup and again inside the write); a version already `ready` is answered again without checking (`replayed`); `getStudio` and `getStudioChecks` are read together and the problems are `readyProblems` (`:64`): each failing check, and each section whose state is not `current`, `off` or `provided` (`settled`, `:54`). Any problem → 409 `not-ready` with every problem (label, sentence, fix, section) in `extensions.problems`; otherwise one transaction writes a `ready` gate with the checks as JSON and the time (`ready.ts:144-157`). The page asks first, saying what changes for the schedules ("Schedules start running this version from their next run. Until now they ran version N" / "none of their runs started", or for the first mark "Schedules keep running this version. From now on a version you save waits until you press Mark ready…", `ready-gate.tsx:51-57`), and disables the button with the reason (`readyBlocker`, `:13-27`).
6. **Slopify's own changes keep the mark** (`carryGateOnto`, `repo.ts:232`; `carryGate`, `gate.ts:44`): a version Slopify writes from a runnable one (a retired-model switch, a restore under a new name) is `carried`, so no schedule stops over a change its user did not make. The retired-model switch saves the version the schedules run, switched and carried, then the person's newer head on top of it (`model-upkeep/switch.ts:191-239`), and moves schedules that named the old version (`switch.ts:234-238`); a trash restore that renames carries the same way (`trash/service.ts:218`).
7. **Backups** carry `template_gates` (`storage/backup-export.ts:366`, `backup-import.ts:836`); the samples, bake-offs and their projects are not exported.

### Compare models (`bakeoff.ts`, `bakeoff-make.ts`, `bakeoff-repo.ts`, `0074-template-bakeoffs.sql`)

1. **Scope**: one section (`script`, `voice` or `pictures`, `bakeoffSections`) made again on one or two other models (`bakeoffQuoteSchema`, `bakeoff.ts:46`), each on a hidden copy of the template's sample, so cost and speed sit beside the model in use. Nothing about the template changes; **Use this model** edits the page's document (`usingModel`, `bakeoff.tsx:74`) and the person Saves as usual.
2. **Basis** (`basis`, `bakeoff.ts:159`): the newest version, a section some model makes (`sectionModel`, `:69`), a sample project that exists and a done paid sample for that version (else 409/400 sentences naming the fix); the model must differ from the one in use, be picked once, and for Voice be a model of the template's voice provider.
3. **Quote** (`quoteBakeoff`, `:210`): `quoteSample` for the section with the model switched (`withModel`, `:89`; a script keeps its thinking setting through `keepThinking`) per model; total high, unknown count, `usesPlan`, the budget room and `fits`.
4. **Start** (`startBakeoff`, `:260`): refused 409 while a bake-off is queued or making, or while a sample job of the template is queued or running; priced again; a problem, a total above the person's figure (a quarter and five cents), unknown prices not accepted, or a total past the budget is refused with the new quote and nothing spent. A finished earlier bake-off is discarded first. One transaction inserts the bake-off and one clone row per model and queues a job of kind `bakeoff`.
5. **Make** (`makeBakeoff`, `bakeoff-make.ts:52`), on the studio loop: fails with a sentence if the template was saved again since or the sample is gone; waits for the sample's work to settle; for each model, copies the sample project (`copyProject`, with the project's id reserved in the clone row first so it is hidden from its first file, and its copied usage deleted so only the copy's own spending counts), saves its next revision with the model switched, previews all affected work and then only that section's work keys (`prepare`, `:173`); a model that changes nothing in the section fails with that sentence. The whole bake-off is then held against what the person accepted (`:93-125`); waiting removes every prepared copy (a copy that cannot be removed fails with a sentence and stays hidden for Discard) and sets the bake-off `held`. Otherwise each copy's section work is started and awaited in turn; the bake-off is `done` when any copy is, else `failed` with "No other model could make the sample…".
6. **View** (`bakeoffView`, `bakeoff.ts:455`): the model in use (from the template's sample project: its cost and the section stage's time) then each other model's copy with state, quote, cost, seconds, failure, the section's files, and for the script the first 1200 characters of the article; `stale` when the template was saved since. **Discard** (`discardBakeoff`, `:346`) removes every copy and its files through `removeHiddenProject` (today's spend still counts) and drops a queued bake-off job; it is refused while a copy still has work going.
7. Settings → Models → New for you → **Compare on a sample** (48-model-lists-and-checks.md) opens a template's studio with `?compareProvider=&compareModel=` ready for the new model (`packages/web/src/router.tsx:380-419`, `compare-on-sample.tsx:21`).

### Template packs (`pack.ts`, `pack-import.ts`, `pack-samples.ts`)

1. **Export** (`exportPack`, `pack.ts:183`): the newest version its schedules may run (`checkedVersion`), else 409 `not-ready` "No version of this template is marked ready, so there is nothing to put in a pack…". `templateSetup` resolves the Library's text of each prompt and intro/outro as it is now (a deleted one → 400 naming the fix). The manifest (`packManifestSchema`, `:59`; format `slopify-template-pack`, version 1) holds the template (name, version, document), the voice it picks as the exporter's Settings → Voices names it, and up to `packLimits.samples` = 6 sample files from the sample project (one thumbnail, up to four pictures, one narration; a file over 6 MB left out). Text that looks like an API key or a bearer token (`looksSecret`, `redact` from `kernel/log.ts`) refuses the export. The zip is `<name>.slopify-pack.zip`; it is a download, not an agent tool (`edge/mcp/excluded-routes.ts:60`).
2. **Import** (`importPack`, `pack-import.ts:255`; `POST /packs/import`): the upload is read whole, at most `packLimits.uploadBytes` = 30 MB (413 "…larger than 30 MB…"; empty → 400). `readPack` (`:63`) checks before anything is written: entry count (a manifest and at most 6 samples), each entry named once and by its stated size (manifest 2 MB, sample 6 MB, total capped), unknown files, a manifest with a secret, JSON, the format and a version not newer than this Slopify's ("made by a newer Slopify… Update Slopify in Settings → About"), the schema, and that every named sample is inside the zip. Every refusal says what is wrong and what to do.
3. **Write** (one transaction): each prompt and intro/outro joins the Library (`placePrompt`, `placeEntry`: identical text is reused, a name taken by other text comes in as "<name> (2)" and the template's references are renamed to match, `placeLibrary`, `:207`); the template is made with a free name (`freeTemplateName`), no channel, no `templateSource`, no font upload, as a new template with no gate (so nothing runs it until it is looked over and marked ready). The answer says how many Library items were added, which were renamed, whether Settings → Voices has the pack's voice (`voiceKnown`; the Voice check names it otherwise) and how many samples came. The samples are written afterwards to `<dataDir>/template-studio/packs/<templateId>/` (`pack-samples.ts:19`, `writePackSamples`, `:42`) to be shown beside the studio (`GET /:id/pack-samples`) until the template makes its own; a failure to write them keeps the template without them and logs a warning. The studio opens on the new template.

### Design templates in the studio (`slices/designs/`, `edge/http/design-templates.ts`)

52-designs.md has designs and their templates in full; this part is how a design template meets the studio.
1. **Listing and address**: design templates (posters, flyers; fields such as `{{Event}}`) are listed under **Design templates** below the project templates on Library → Templates, each with **New design template** (`packages/web/src/routes/templates.tsx`). The studio address `/templates/$templateId` falls back to `/design-templates/$templateId` when the id is not a project template's (`page.tsx:54-62`); the rail is the same component (`StudioRail`, `section-rail.tsx:43`).
2. **Sections** (`designs/sections.ts:8-16`): Picture, Text layout, Formats, Schedule; `designAffectedSections` (`:30`) says which a Save changed, and only a changed Picture (or a sample value its prompt uses) makes a paid picture (`sampleNeedsPicture`, `:54`); text, formats and the schedule redraw the sample for free. `designStudioKind` (`designs/studio-kind.ts:48`) is the seam that lets both kinds share the studio: sections, affected sections, free checks, sample quote, sample request and per-section state.
3. **Versions and the gate**: every Save adds a revision (`saveTemplate`, `designs/templates.ts:204`; a Save identical to the head saves nothing; a stale `baseVersion` → `changed` with the current template); `POST /:id/ready` runs the document's checks (`documentChecks`: every field is written `{{Name}}`, every field has a sample value, the sample date is `YYYY-MM-DD`) and, when wired, `contextChecks` (the picture provider is ready or the template's own picture is saved; the schedule's date field is used; each text block's font exists and has every letter of the samples; the samples fit every format) and `sampleCheck` (the version's own sample is made) (`designs/gate.ts:53-173`, `edge/http/design-templates.ts:205-226`). The checks are kept on the revision; the revision is `ready` only if all pass, otherwise 409 `not-ready` with the failing checks. **Unlike a project template, a design template is always gated**: a schedule makes only the newest `ready` revision (`runnableDesignVersion`, `designs/gate.ts:26`), never an unchecked one.
4. **Samples**: the editor's sample is a hidden design (`designs.sample_of`) redrawn after each Save (`samples.afterSave`); `POST /:id/quote` prices a document (a changed picture is paid, the rest free) or a piece from the newest version; `POST /:id/sample` (Make sample) starts a held, failed or missing sample at the price the person saw. A design template's samples have their own daily budget, setting `designs.dailySampleBudget`, default $1 (`designs/budget.ts:10-12`), separate from the project studio's.

### Agents (`edge/mcp/tools-template-studio.ts`)

1. Twenty-three route tools mirror the studio: `get_template_studio`, `get_template_checks`, `mark_template_ready` (confirm), `get_prompt_anatomy`, `quote_template_save`, `save_template_studio`, `make_template_sample`, `set_sample_topic`, `set_sample_full_script`, `get_sample_pronunciations`, `quote_say_it_as`, `say_it_as`, `get_template_studio_settings`, `update_template_studio_settings`, `quote_samples_for_all`, `make_samples_for_all` (confirm), `make_template_free_samples`, `import_template_pack` (multipart upload), `get_template_pack_samples`, `quote_bakeoff`, `start_bakeoff` (confirm), `get_bakeoff`, `discard_bakeoff` (confirm). The quote tools are `unrecorded`. Exporting a pack, the loudness and PDF samples and a pack's sample files are files, not tools (`edge/mcp/excluded-routes.ts:58-62`).
2. Design templates have their own tools (`list_design_templates` … `mark_design_template_ready`, `make_design_from_template`, `edge/mcp/tools-designs.ts:108-162`).
3. The in-app assistant asks before the tools that spend (`assistantCostlyTools`, `slices/assistant/gate.ts:21-72`, which lists `save_template_studio`, `make_template_sample`, `set_sample_topic`, `set_sample_full_script`, `say_it_as`, `update_template_studio_settings` and the design template tools) and before any tool that carries a `confirm` sentence (`edge/mcp/assistant.ts:87-88`: marking ready, removing a bake-off, starting one, samples for all).

## Branches

| Decision | Rule | Pointer |
|---|---|---|
| First sample vs later | none yet, or the project is gone → every section is priced and a run is started; later → only the outdated sections, on the project's next revision | `quote.ts:165-171`, `paid.ts:201-398` |
| Which version schedules run | not gated → the head; gated → the newest legacy, ready or carried version at or below the head | `gate.ts:19-36` |
| Mark ready on a version already ready | answered again (`replayed`), no check | `ready.ts:125-126` |
| Section state at Mark ready | `current`, `off`, `provided` pass; `making`, `waiting`, `needs-fix`, `stale` block | `ready.ts:54-88` |
| A section provided at run time | no sample, never blocks | `status.ts:83-89` |
| Sample vs Save price | within `ack × 1.25 + 0.05` → goes; above → 409 `cost-changed` (Save) or held (queued job) | `save.ts:38`, `paid.ts:56-57` |
| Unknown prices | need a ticked acceptance or a quote that priced every step | `save.ts:180`, `paid.ts:58`, `save.ts:42-47` |
| Budget | high ≤ left, and a CLI plan only when allowed; else 409 `over-budget` (Save) or held | `budget.ts:120` |
| Topic | typed, `"next-queued"` or `"fixed"`; a new topic starts the sample on a new project | `topic.ts:52-73`, `paid.ts:249-258` |
| Full script | off: outline and chapter 1; on: the whole script, remaking the script and what follows | `scope.ts:16`, `topic.ts:272` |
| Bake-off section | only `script`, `voice`, `pictures`; voice only within the voice provider | `bakeoff-repo.ts`, `bakeoff.ts:201-205` |
| Bake-off waits | past the total seen, an unaccepted unknown price or the budget → `held`, copies removed | `bakeoff-make.ts:93-125` |
| Pack export version | the newest runnable version (ready, carried or legacy), not only a ready one | `pack.ts:196` |
| Pack voice | kept; `voiceKnown` false when Settings → Voices lacks the ID | `pack-import.ts:278-283` |
| Design vs project template | design templates are always gated and have their own $1 budget | `designs/gate.ts:26`, `designs/budget.ts:12` |

## Unhappy paths

HTTP mapping: `not-found` 404; `invalid-input` 400; `conflict`, `cost-changed`, `over-budget`, `not-ready` 409; problem details with `extensions.reason`, and `extensions.quote` or `extensions.problems` where they apply (`edge/http/template-studio.ts:104-115`, `:136-150`, `:305-325`).

| Case | Result | Pointer |
|---|---|---|
| Template deleted | 404 "This template no longer exists; it may have been deleted. Go to Library → Templates to see your templates." | `service.ts:140` |
| Play's review unavailable | 503 "This Slopify can't price or make paid samples because Play's review isn't available here. Restart Slopify…" | `edge/http/template-studio.ts:404` |
| Save of a stale version | 409 "This template changed since you opened it…" | `save.ts:155-160` |
| Save repeated with different settings | 409 "This Save was already sent with different settings…" | `save.ts:137-144` |
| Sample costs more than seen, unknown prices, past the budget | 409 with the new quote on the button | `save.ts:173-193` |
| A prompt the template uses was deleted | 400 "A prompt or intro/outro entry this template uses was deleted. Choose another…" | `save.ts:205-207` |
| Setup Play's review refuses | the quote's `problem` ("No sample can be made of this setup: …"); Save offers Save without a sample | `quote.ts:66-72`, `save.ts:166-172` |
| Providers not set up when the sample starts | state `failed`: "The sample can't start: …"; nothing spent | `paid.ts:343-351` |
| Restart mid-sample | the job is queued again; the version is continued on its project, the remaining quote held against the budget | `jobs.ts:102`, `paid.ts:212-244` |
| Old project of a new topic can't be removed | `failed` "The new topic needs a new sample project, and the old one's files couldn't be removed…" | `paid.ts:252-256`, `:352-355` |
| Step of the sample fails | `needs-fix` lamp with the step's own sentence, or "A step of the sample failed without saying why. Press Make sample…" | `paid.ts:125-139` |
| ffmpeg missing, font gone | the free sample's `needs-fix` sentence | `free.ts:241-256` |
| Mark ready with a failing check or a section not current | 409 `not-ready` listing each problem with its fix | `ready.ts:136-143` |
| Mark ready on a version no longer the newest | 409 "Version N is no longer the newest…" | `ready.ts:98-105` |
| Bake-off with nothing to compare, no done sample, a model picked twice | 400 or 409 sentences naming the fix | `bakeoff.ts:159-208` |
| Bake-off while a sample or another bake-off runs | 409 | `bakeoff.ts:265-278` |
| Discard while a copy has work | 409 "The bake-off is still being made, and work already going is never stopped…" | `bakeoff.ts:352-359` |
| Pack that is not a pack, damaged, with a key, from a newer Slopify, too large | 400 or 413 with what is wrong and what to do | `pack-import.ts:63-175`, `edge/http/template-studio.ts:262-274` |
| Pack export with nothing marked ready, a deleted prompt, or a secret | 409 `not-ready` or 400 | `pack.ts:196-241` |
| A project-route write to a sample project | 409 `template-sample` | `edge/http/app.ts:390-401` |
| Loop throws | logged `template-studio.sample` (one job) or `template-studio.runner` (the loop, "Restart Slopify to make samples again") | `runner.ts:63-66`, `:78-82` |

## State transitions

- Gate of a version: no row → `ready` (Mark ready); no row → `carried` (a Slopify-made version of a runnable one); `legacy` or `carried` → `ready` on Mark ready (replaces it); the migration wrote `legacy` for every revision that existed. A gate is never removed except with its revision (`ON DELETE CASCADE`).
- Template: ungated → gated at the first `ready` row. Never back.
- Paid sample of a version (`template_sample_versions.state`, `sampleVersionStates`, `model.ts:59-67`): none → `queued` (Save, Make sample, topic, samples for all) or `skipped` (Save without a sample); `queued → making → done|failed`; `queued|making → held` (cost, unknown price, budget) `→ queued` (Make sample); `failed → queued` (Make sample).
- Job (`template_sample_jobs`): `queued → running → deleted when finished`; a running job found at start → `queued` (or dropped when a newer one waits); a queued bake-off job is dropped by a newer paid request or a Discard.
- Bake-off: `queued → making → done|failed`; `queued|making → held` (waiting for the person's say); deleted by Discard or when a new one starts. Clone: `queued → making → done|failed`.
- Sample project: made on the first sample, kept across versions as revisions, replaced by a new project on a new topic or a change the project's editor cannot make, deleted with its template or by Discard (bake-off copies).
- Forbidden: Mark ready on a non-newest version; two bake-offs of a template at once; a sample job stopped from the studio.

## Invariants

1. The studio never spends above what the person saw (a quarter and five cents over), with an unknown price they did not accept, or past the daily budget; a sample that would waits as `held` and starts only on the person's Make sample (`paid.ts:48-64`, `bakeoff-make.ts:93-125`).
2. Work already going is never stopped by a newer Save, topic, bake-off or discard; the newer request waits (`paid.ts:204-205`, `jobs.ts:26-29`, `bakeoff.ts:352-359`).
3. One sample is made at a time across every template (`jobs.ts:69-83`).
4. A hidden project is in no list, count, feed, backup or notification the person sees, and no project route can change it (`repo.ts:13`, `edge/http/app.ts:390`).
5. Today's budget counts the priced calls of every hidden project, including those removed (`budget.ts:70-81`, `hidden.ts:8-23`).
6. Schedules of a project template run the newest version until one is first marked ready, and from then on only a legacy, ready or carried version (`gate.ts:19-36`); a design template's schedules run only a ready revision (`designs/gate.ts:26`).
7. A version Slopify writes from a runnable one is runnable (`gate.ts:44`).
8. A pack never carries a key, a login or anything of this computer's (`pack.ts:96-99`, `:235-241`), and an import writes nothing until every check passed (`pack-import.ts:63`).
9. Every error says what failed, why and the exact screen, button or command to fix it (the sentences above).
10. The server answers while samples are made: the loop yields between jobs and quotes for all yield between templates (`runner.ts:51`, `for-all.ts:72`).

## Outcomes & side effects

- Rows in `template_gates`, `template_samples`, `template_sample_versions`, `template_sample_jobs`, `template_bakeoffs`, `template_bakeoff_clones` and `template_studio_spend` (`0064-template-studio.sql`, `0074-template-bakeoffs.sql`); settings `templateStudio.dailyBudget`, `.samplesUsePlans`, `.sampleTopic.default`, `.unknownAccepted`, `.topicMutation.<id>`.
- Hidden projects, with real provider spending (billed per use or a CLI plan's usage), under `<dataDir>/template-studio/samples`; an imported pack's sample files under `<dataDir>/template-studio/packs/<id>`.
- `template.sample` events on the global stream after every change, which refresh open studio pages (`edge/http/template-studio.ts`).
- A Save adds a template version through `updateTemplate`; Library items and templates from an import; a Library alias from Say it as.
- Free samples are cached by content hash and shared across templates with the same setup.

## Recorded differences from the feature spec

The spec is the 4.0 changelog entry (`changelog.d/2026-10-18-template-studio.md`).

- Specified as "Export pack saves the version marked ready"; shipped exports the newest version the schedules may run: ready, carried or saved before the studio (`pack.ts:196`).
- Specified with one daily budget ($2.00 by default); shipped adds a second setting, "Samples may use my CLI plans", off by default, because a plan has no dollar price (`budget.ts:12-52`). Design templates have a separate $1 budget (`designs/budget.ts:12`).
- Specified as "Mark ready after free checks (keywords, providers, a voice that is one of yours, release times, a known monthly cost, someone to answer each checkpoint)"; shipped also requires every section's sample to be current, off or provided at run time (`ready.ts:54-88`).
- Specified with design templates "with the same rail of sections"; shipped as a separate editor with four sections and a gate that is always on (`designs/gate.ts:26`).
- Specified as "a retired-model switch now also switches the version your schedules run when a newer one waits"; shipped as a switched, carried copy of the running version below the person's newer head (`model-upkeep/switch.ts:191-239`).

## Dimensions not in play

- D1 Authority: no login; the studio is the same local trust as `/api`. Marking ready, raising the budget, starting a bake-off and samples for all are the person's or an agent's, with the assistant asking first.
- D5 Money: in play, and the chapter's centre: quotes, the quarter-and-five-cents rule, unknown prices, the daily budget and the CLI-plan switch.
- D7 Time: the budget day starts at local midnight; nothing expires.
- D13 Notification: none of its own; the global event refreshes open pages.
- Sharing: a pack is the only way a template travels, and it carries no key.
