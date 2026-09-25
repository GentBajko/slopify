---
generated_at_commit: 6eeac3fd9043
generated_date: 2026-09-25
content_hash: 78ad050c2eab
absorbed_from: features/2026-09-25-glossary-pronunciation@2026-09-25
paths_covered:
  - ':(top)packages/app/src/edge/http/app.ts'
  - ':(top)packages/app/src/edge/http/files.ts'
  - ':(top)packages/app/src/edge/http/revision-files.ts'
  - ':(top)packages/app/src/edge/http/revisions.ts'
  - ':(top)packages/app/src/main.ts'
  - ':(top)packages/app/src/slices/admission/rules.ts'
  - ':(top)packages/app/src/slices/article/plain.ts'
  - ':(top)packages/app/src/slices/article/split.ts'
  - ':(top)packages/app/src/slices/narration/plan.ts'
  - ':(top)packages/app/src/slices/narration/preparation.ts'
  - ':(top)packages/app/src/slices/narration/pronunciation-chunks.ts'
  - ':(top)packages/app/src/slices/narration/pronunciation.ts'
  - ':(top)packages/app/src/slices/narration/steering.ts'
  - ':(top)packages/app/src/slices/play-drafts/schema.ts'
  - ':(top)packages/app/src/slices/rebuild/recipe-audio-parts.ts'
  - ':(top)packages/app/src/slices/rebuild/recipe-audio.ts'
  - ':(top)packages/app/src/slices/rebuild/recipe-build.ts'
  - ':(top)packages/app/src/slices/rebuild/recipe-exports.ts'
  - ':(top)packages/app/src/slices/rebuild/recipe-model.ts'
  - ':(top)packages/app/src/slices/rebuild/recipe-narration-text.ts'
  - ':(top)packages/app/src/slices/rebuild/recipe-preparation.ts'
  - ':(top)packages/app/src/slices/rebuild/recipe-text.ts'
  - ':(top)packages/app/src/slices/rebuild/runtime-export-inputs.ts'
  - ':(top)packages/app/src/slices/rebuild/runtime-narration-publication.ts'
  - ':(top)packages/app/src/slices/rebuild/runtime-narration-reuse.ts'
  - ':(top)packages/app/src/slices/rebuild/runtime-narration-text.ts'
  - ':(top)packages/app/src/slices/rebuild/runtime-provider.ts'
  - ':(top)packages/app/src/slices/rebuild/runtime-publication.ts'
  - ':(top)packages/app/src/slices/rebuild/runtime-run.ts'
  - ':(top)packages/app/src/slices/rebuild/transition-repo.ts'
  - ':(top)packages/app/src/slices/revisions/mutations.ts'
  - ':(top)packages/app/src/slices/revisions/restore.ts'
  - ':(top)packages/app/src/slices/revisions/rules.ts'
  - ':(top)packages/web/src/main.tsx'
  - ':(top)packages/web/src/play/draft-state.ts'
  - ':(top)packages/web/src/play/media-rails.tsx'
  - ':(top)packages/web/src/play/pronunciation-glossary.tsx'
  - ':(top)packages/web/src/project/narration-downloads.tsx'
  - ':(top)packages/web/src/project/revision-api.ts'
  - ':(top)packages/web/src/project/revision-media.tsx'
  - ':(top)packages/web/src/project/revision-narration.tsx'
  - ':(top)packages/web/src/project/revision-providers.tsx'
  - ':(top)packages/web/vite.config.ts'
---

# Narration Text Boundaries

## Layers

| Layer | Observed dependency direction |
| --- | --- |
| Configuration and controls | Web narration controls import admission rules and revision contracts, then update draft or revision configuration. `packages/web/src/play/media-rails.tsx:1`, `packages/web/src/project/revision-providers.tsx:1` |
| Article and narration transformations | Article processing separates body/end matter. Narration grouping imports kernel fingerprinting; request steering imports preparation and pronunciation types. `packages/app/src/slices/article/split.ts:35`, `packages/app/src/slices/narration/pronunciation-chunks.ts:1`, `packages/app/src/slices/narration/steering.ts:1` |
| Planning and execution | Rebuild recipes import article/narration transformations; revision mutations import rebuild planning. Runtime execution publishes through revision and storage modules. `packages/app/src/slices/rebuild/recipe-text.ts:5`, `packages/app/src/slices/revisions/rules.ts:1`, `packages/app/src/slices/rebuild/runtime-publication.ts:1` |

## Module boundaries

### Configuration

`audio.usePronunciationGlossary?: boolean` is independent of `narrationPrompt`. Glossary processing requires explicit `true`, generated audio, and `inworld-tts-2` or `inworld-tts-2-flash`. Narration Preparation requires generated audio and a nonblank prompt; its validation accepts only `inworld-tts-2`. Glossary processing alone adds no preparation LLM requirement. `packages/app/src/slices/admission/rules.ts:65`, `packages/app/src/slices/admission/rules.ts:284`

New Play drafts default **Use Pronunciation Glossary On**, with Narration Preparation Off. Persisted schemas keep the glossary property optional; loading saved documents does not apply fresh defaults. Missing legacy values therefore remain effectively Off. `packages/web/src/play/draft-state.ts:25`, `packages/web/src/play/draft-state.ts:60`, `packages/app/src/slices/play-drafts/schema.ts:35`

### Article and glossary

`textRecipes` selects provided, edited or generated Markdown, separates end matter, and exposes clean body text independently from `GlossaryResult`. Enabled processing parses the supplied glossary; disabled processing supplies an empty entry list; unresolved article text leaves the glossary pending. `packages/app/src/slices/rebuild/recipe-text.ts:143`, `packages/app/src/slices/rebuild/recipe-text.ts:206`

`parsePronunciationGlossary` accepts `Term: /IPA/` rows and Markdown tables. It validates the implemented English IPA alphabet, requires one IPA word per written word, deduplicates equivalent mappings, and refuses malformed or conflicting entries. It does not infer pronunciations. Matching is literal, case-insensitive, longest-term-first and boundary-aware; matched words become slash-delimited IPA spans. `packages/app/src/slices/narration/pronunciation.ts:19`, `packages/app/src/slices/narration/pronunciation.ts:65`, `packages/app/src/slices/narration/pronunciation.ts:110`

The article plain-serialization escape issue remains unfixed: `plainText` still returns the string produced by remark/GFM/strip-markdown through `processSync`, retaining Markdown serialization. `packages/app/src/slices/article/plain.ts:11`

### Logical groups and trusted bindings

`pronunciationChunks` merges ordinary chunks when a glossary match crosses their boundary. Merged groups carry `NarrationSource`: required `text:string`, `start:number`, `bodyFingerprint:string`, and `chunkingFingerprint:string`. Unmerged chunks retain ordinary keys. `packages/app/src/slices/narration/pronunciation-chunks.ts:10`, `packages/app/src/slices/narration/pronunciation-chunks.ts:95`

Save discards client-submitted `narrationSources`. `bindNarrationSources` reconstructs bindings from the base revision and computed groups for text/asset overrides, regeneration and narration uploads. `packages/app/src/slices/revisions/mutations.ts:62`, `packages/app/src/slices/revisions/rules.ts:10`

These server-origin merged bindings remain sticky across glossary changes or disabling pronunciation when fingerprints, source slice, key and chunk boundaries still validate. Stale or overlapping bindings are ignored; overridden ordinary chunks block merging across them. `packages/app/src/slices/narration/pronunciation-chunks.ts:46`

### Generation boundaries

`narrationParts` handles asset overrides before glossary validation. Text overrides become normalized clean logical text. Invalid active glossaries refuse generated work; supplied group audio bypasses preparation and pronunciation. `packages/app/src/slices/rebuild/recipe-audio-parts.ts:22`

Preparation operates on clean sentences. Validated cues and IPA spans meet only in `prepareRequests`, which preserves separate request `text` and clean `spokenText`. IPA tokens are indivisible; request limits include tags and IPA using JavaScript string length. Ordinary fallback splitting uses code points. `packages/app/src/slices/rebuild/recipe-preparation.ts:59`, `packages/app/src/slices/narration/steering.ts:17`, `packages/app/src/slices/narration/steering.ts:80`

Without preparation, pronunciation uses the same builder with empty cues. With no matching spans, ordinary splitting and recipe shape remain in use. Persisted TTS `pronunciation` remains `null`; IPA travels in `text`. `packages/app/src/slices/rebuild/recipe-audio-parts.ts:97`

## Entry points

Narration uses the application’s injected stage runner; its `audio` implementation invokes `runRevisionInvocation`. Deferred work holds, exact LLM/TTS recipes dispatch to request execution, and supplied/local recipes dispatch to local execution. `packages/app/src/main.ts:555`, `packages/app/src/slices/rebuild/runtime-run.ts:18`

| Work keys | Stage and operation |
| --- | --- |
| `entry:intro:text`, `entry:outro:text` | `article`: supplied or generated entry text. `packages/app/src/slices/rebuild/recipe-text.ts:214` |
| `narration:prepare:<segment>:<logicalKey>`; `narration:prepare:<segment>:future` | `audio`: exact or deferred preparation; segments are body, intro and outro. `packages/app/src/slices/rebuild/recipe-preparation.ts:34` |
| `<logicalKey>:<part>`; `audio:<segment>:future` | `audio`: physical narration parts or deferred narration. `packages/app/src/slices/rebuild/recipe-audio-parts.ts:13`, `packages/app/src/slices/rebuild/recipe-audio.ts:92` |
| `audio:provided` | `audio`: supplied whole-body audio. `packages/app/src/slices/rebuild/recipe-audio.ts:49` |
| `audio:body:concat`, `audio:intro`, `audio:outro` | `audio`: `concat-narration`. `packages/app/src/slices/rebuild/recipe-audio.ts:128`, `packages/app/src/slices/rebuild/recipe-audio.ts:208` |
| `narration:files:<segment>` | `audio`: `narration-files-v1`, deferred until exact parts resolve. `packages/app/src/slices/rebuild/recipe-narration-text.ts:9` |

## Communication

### Internal payloads

| Boundary | Request → response |
| --- | --- |
| Preparation | `{direction:string,sentences:{sentence:number,text:string}[]}` → JSON `{cues:Cue[]}`. Cue variants are instruction `{sentence,kind:"instruction",text}`, reset `{sentence,kind:"reset"}`, and sound `{sentence,kind:"sound",sound}`. Validation checks sentence range/order and duplicate directions/sounds. `packages/app/src/slices/narration/preparation.ts:22`, `packages/app/src/slices/narration/preparation.ts:46`, `packages/app/src/slices/narration/preparation.ts:88` |
| Request construction | Clean `source:string`, `cues:Cue[]`, `maxCharacters:number`, optional `{start:number,end:number,text:string}[]` → `{ok:true,requests:PreparedRequest[]}` or `{ok:false,reason:string}`. Each request contains required `text:string` and `spokenText:string`. `packages/app/src/slices/narration/steering.ts:4`, `packages/app/src/slices/narration/steering.ts:80` |
| Synthesis | `{provider:string,model:string,voiceId:string,text:string}` → held result or successful audio bytes. Publication retains request text, optional clean text, logical key/text, segment, voice selection and optional duration; the publication wrapper adds request fingerprint and asset path. `packages/app/src/slices/rebuild/runtime-provider.ts:77`, `packages/app/src/slices/rebuild/runtime-publication.ts:86` |
| Transcript assembly | Selected completed pieces plus saved recipes → `{logicalKey:string,spokenText:string,requestText:string\|null}[]`. Supplied audio has no request text; transformed generated parts require exact saved request/clean-text agreement. `packages/app/src/slices/rebuild/runtime-narration-text.ts:25` |

`Cue` and `PreparedRequest` are documented in [02-models.md](02-models.md) and [02-models-narration.md](02-models-narration.md).

### Save, restore and generation admission

Revision routes register under `/api/projects`. Save sends `{baseRevisionId:string,idempotencyKey:string,edit:RevisionEdit}`; restore sends `{baseRevisionId:string,idempotencyKey:string,targetRevisionId:string}`. Both return successful `RevisionMutationResult`, or problem JSON containing reason, current revision ID and field errors. `packages/app/src/edge/http/app.ts:108`, `packages/web/src/project/revision-api.ts:99`, `packages/app/src/edge/http/revisions.ts:36`

Rebuild preview sends `{baseRevisionId:string,request:RebuildSelection}` and returns `{ok:true,value:RebuildPreview}`. Admission sends revision/idempotency/preview IDs, `acknowledgeUnknownCosts:boolean`, and `confirmedProvidedWorkKeys:string[]`; success returns HTTP 202 `{ok:true,value:RebuildAdmission}`. `packages/web/src/project/revision-api.ts:156`, `packages/app/src/edge/http/revisions.ts:109`

### Downloads

Publication creates `<segment>-narration.txt` from clean spelling and `<segment>-tts-script.txt` from exact requests separated by blank lines. Clean assembly concatenates physical parts directly and separates logical groups with newlines. `packages/app/src/slices/rebuild/runtime-narration-text.ts:16`, `packages/app/src/slices/rebuild/runtime-narration-text.ts:96`

`GET /files/:projectId/:asset` and `GET /files/:projectId/revisions/:revisionId/:recordId` take string path identifiers and return file bytes with content type, length and attachment filename, or 404 problems. Revision-aware clients resolve selected available records before constructing URLs. `packages/app/src/edge/http/files.ts:44`, `packages/app/src/edge/http/revision-files.ts:36`, `packages/web/src/project/revision-media.tsx:54`

## Composition

`buildRecipes` composes text → audio → export recipes. Audio planning creates narration text files when preparation or glossary processing is active. `packages/app/src/slices/rebuild/recipe-build.ts:7`, `packages/app/src/slices/rebuild/recipe-audio.ts:44`

**Restore narration stage:** restoration copies saved configuration/content and source bindings into a new revision, clones selected manifests, and transitions work. Both `audio:` and `narration:` keys map to the audio stage; newly created work remains held. `packages/app/src/slices/revisions/restore.ts:41`, `packages/app/src/slices/rebuild/transition-repo.ts:95`

Request identity includes exact sent text, voice/model selection, segment and the reserved null slot. Whole requests additionally include clean logical-text identity; work identity adds regeneration tokens. `packages/app/src/slices/narration/plan.ts:36`, `packages/app/src/slices/rebuild/recipe-model.ts:136`

Reused audio receives a new revision-local descriptor with current clean/request text and grouping metadata. Late publication finds selected revisions carrying that publication and rebinds matching exact recipes against each receiving revision’s plan. `packages/app/src/slices/rebuild/runtime-narration-reuse.ts:122`, `packages/app/src/slices/rebuild/runtime-narration-publication.ts:10`

Caption identity includes audio resource identity, effective clean transcript and retained duration; timing also includes silence gap, edge silence and language. Caption/export transcript selection uses clean narration whenever either pronunciation or preparation is active. `packages/app/src/slices/rebuild/recipe-audio.ts:233`, `packages/app/src/slices/rebuild/recipe-exports.ts:36`, `packages/app/src/slices/rebuild/runtime-export-inputs.ts:80`

## Frontend

Narration controls render within the client-mounted React application and use its shared API dependency; Vite configures React and Tailwind. `packages/web/src/main.tsx:22`, `packages/web/vite.config.ts:12`

Play and revision controls expose the glossary checkbox independently of preparation. Unsupported selections disable the checkbox while retaining its saved preference. Revision preparation preserves saved prompt content when the library entry is absent. `packages/web/src/play/pronunciation-glossary.tsx:19`, `packages/web/src/project/revision-providers.tsx:110`, `packages/web/src/project/revision-narration.tsx:20`

`NarrationDownloads` groups `narration_txt` and `tts_script` outputs by intro/body/outro and renders shared download controls labeled Clean Narration and TTS Script. `packages/web/src/project/narration-downloads.tsx:5`
