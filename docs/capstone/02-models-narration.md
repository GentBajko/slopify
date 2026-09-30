---
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: f72a522a3a13
paths_covered:
  - ":(top)packages/app/src/slices/narration/*.ts"
  - ":(top)packages/app/src/kernel/ports/narration-aliases.ts"
  - ":(top)packages/app/src/kernel/ports/tts.ts"
  - ":(top)packages/app/src/slices/voices/model.ts"
  - ":(top)packages/app/src/slices/admission/model.ts"
  - ":(top)packages/app/src/slices/admission/schema.ts"
  - ":(top)packages/app/src/slices/admission/rules.ts"
  - ":(top)packages/app/src/slices/article/plain.ts"
  - ":(top)packages/app/src/slices/article/split.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-text.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-audio*.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-voices.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-model.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-input-schema.ts"
  - ":(top)packages/app/src/slices/rebuild/work-records.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-narration-text.ts"
  - ":(top)packages/app/src/slices/revisions/model.ts"
  - ":(top)packages/app/src/slices/revisions/schema.ts"
  - ":(top)packages/app/src/slices/revisions/rules.ts"
  - ":(top)packages/app/src/slices/revisions/mutations.ts"
  - ":(top)packages/app/src/slices/revisions/repo.ts"
  - ":(top)packages/app/src/edge/http/pronunciations.ts"
  - ":(top)packages/app/src/kernel/db/migrations/0035-narration-aliases.sql"
---

# Narration text models

Scope: spoken (clean) text versus request (sent-to-voice) text, the Pronunciation Glossary, shared pronunciations, narration aliases, narration grouping/source bindings, the voice choice and multi-voice speaker records, and the TTS request shapes. Broader revision, recipe and run-config entities live in `02-models.md`.

## Entities

| Name | Definition site | Storage | Purpose |
|---|---|---|---|
| GlossaryEntry | `packages/app/src/slices/narration/pronunciation.ts:4` | In memory | Written term paired with one IPA word per written word. |
| SkippedGlossaryRow | `packages/app/src/slices/narration/pronunciation.ts:10` | In memory | 1-based row number and reason for a glossary row left out; never the row's text. |
| GlossaryResult | `packages/app/src/slices/narration/pronunciation.ts:14` | In memory | Parsed glossary: usable entries plus optional skipped rows, or a refusal. |
| SkippedSpeakerPronunciations | `packages/app/src/slices/narration/pronunciation.ts:153` | In memory | Skipped rows of one speaker's own pronunciations. |
| PronunciationSpan | `packages/app/src/slices/narration/pronunciation.ts:182` | In memory | Source range and the replacement text sent to the voice. |
| PronunciationMatch | `packages/app/src/slices/narration/pronunciation.ts:187` | In memory | Source range matched to a glossary entry. |
| SharedPronunciation | `packages/app/src/slices/admission/model.ts:60` | Run config JSON (`project_revisions.config`) | One pronunciation copied from another project's glossary. |
| SharedGlossary | `packages/app/src/slices/narration/shared-glossary.ts:12` | In memory; HTTP JSON | Merged glossary of every other project plus contributor count. |
| NarrationAlias | `packages/app/src/kernel/ports/narration-aliases.ts:8` | `narration_aliases` table; run config JSON | Written word/phrase and how the narrator says it. |
| AliasMatch | `packages/app/src/kernel/ports/narration-aliases.ts:16` | In memory | Chosen alias occurrence in a text. |
| AliasProblem | `packages/app/src/slices/narration/aliases-schema.ts:23` | In memory; HTTP problem extension | Field-level save problem of Library → Aliases. |
| NarrationSource | `packages/app/src/slices/narration/pronunciation-chunks.ts:10` | Revision content JSON (`narrationSources`) | Source identity of a merged narration group. |
| PronunciationChunk | `packages/app/src/slices/narration/pronunciation-chunks.ts:16` | In memory | Logical body narration group with optional source binding. |
| NarrationOverride | `packages/app/src/slices/revisions/model.ts:28` | Revision content JSON (`narrationOverrides`) | Per-group replacement: uploaded asset or edited text. |
| PreparedRequest | `packages/app/src/slices/narration/steering.ts:4` | In memory; projected into TTS RecipeInput | Exact request text paired with clean spoken text. |
| SteeringResult | `packages/app/src/slices/narration/steering.ts:8` | In memory | Prepared requests or a refusal reason. |
| PreparationSource | `packages/app/src/slices/narration/preparation.ts:8` | `input_json` (`llm` RecipeInput `preparation`) | Narration Preparation request identity. |
| SourceSentence | `packages/app/src/slices/narration/preparation.ts:20` | In memory | Numbered sentence of the clean narration text. |
| Cue | `packages/app/src/slices/narration/preparation.ts:42` | In memory (parsed from an LLM answer) | Delivery cue anchored to a sentence. |
| NarrationRequest | `packages/app/src/slices/narration/plan.ts:4` | In memory | One planned TTS request of the plain splitter. |
| TextRecipes | `packages/app/src/slices/rebuild/recipe-text.ts:93` | In memory | Text-stage recipes plus article text, narration text, glossary and entry texts. |
| NarrationTextPart | `packages/app/src/slices/rebuild/runtime-narration-text.ts:10` | In memory → text outputs | Spoken and request text of one retained narration piece. |
| VoiceChoice | `packages/app/src/slices/admission/model.ts:41` | Run config JSON (`audio`) | Narration provider/model/voice plus narration switches. |
| Speaker | `packages/app/src/slices/voices/model.ts:60` | Run config JSON (`voices.speakers`) | One multi-voice speaker with voice, pace and own pronunciations. |
| VoicesSettings | `packages/app/src/slices/voices/model.ts:92` | Run config JSON (`voices`) | Multi-voice format, script source, speakers and output switches. |
| DialogueLine | `packages/app/src/slices/rebuild/recipe-model.ts:77` | `input_json` (`tts` RecipeInput `dialogue`) | One speaker turn of a native multi-speaker request. |
| TtsRequest | `packages/app/src/kernel/ports/tts.ts:15` | In memory | What a TTS adapter is asked to synthesize. |

## Fields and types

### GlossaryEntry

Both fields `readonly`.

| Field | Type | Required | Notes |
|---|---|---|---|
| term | string | yes | Trimmed, whitespace collapsed to one space (`packages/app/src/slices/narration/pronunciation.ts:95`). |
| ipa | readonly string[] | yes | IPA words without slashes; length equals the term's word count. |

### SkippedGlossaryRow

| Field | Type | Required | Notes |
|---|---|---|---|
| row | number | yes | 1-based entry number among the parsed rows. |
| reason | string | yes | Fixed explanatory text (`packages/app/src/slices/narration/pronunciation.ts:103`). |

### GlossaryResult

Discriminated union on `ok`; every property `readonly`.

| Field | Type | Required | Notes |
|---|---|---|---|
| ok | true \| false | yes | accepted: true, false |
| entries | GlossaryEntry[] | no | Required when `ok: true`. |
| skipped | SkippedGlossaryRow[] | no | `ok: true` only; absent when every row was used. |
| reason | string | no | Required when `ok: false`. |

`parsePronunciationGlossary` returns only `ok: true` results (`packages/app/src/slices/narration/pronunciation.ts:134`); bad rows become `skipped`. `narrationParts` turns an `ok: false` value into a deferred refusal (`packages/app/src/slices/rebuild/recipe-audio-parts.ts:46`); `speakerGlossary` builds one from a failed own-glossary result (`packages/app/src/slices/rebuild/recipe-voices.ts:381`).

### SkippedSpeakerPronunciations

| Field | Type | Required | Notes |
|---|---|---|---|
| speaker | string | yes | Trimmed speaker name, or `A speaker` when blank. |
| skipped | SkippedGlossaryRow[] | yes | Non-empty. |

### PronunciationSpan

All fields `readonly`. UTF-16 offsets, exclusive end.

| Field | Type | Required | Notes |
|---|---|---|---|
| start | number | yes | Inclusive source offset. |
| end | number | yes | Exclusive source offset. |
| text | string | yes | Glossary spans: `/<ipa>/` (`packages/app/src/slices/narration/pronunciation.ts:244`). Alias spans: the spoken form on the first word, `""` on later words (`packages/app/src/slices/narration/aliases.ts:23`). |

### PronunciationMatch

All fields `readonly`.

| Field | Type | Required | Notes |
|---|---|---|---|
| start | number | yes | Inclusive UTF-16 offset. |
| end | number | yes | Exclusive UTF-16 offset. |
| entry | GlossaryEntry | yes | Matched entry. |

### SharedPronunciation

| Field | Type | Required | Notes |
|---|---|---|---|
| term | string | yes | Schema: 1–200 characters (`packages/app/src/slices/admission/schema.ts:94`). |
| ipa | readonly string[] | yes | 1–20 words, each 1–200 characters. |

### SharedGlossary

| Field | Type | Required | Notes |
|---|---|---|---|
| entries | readonly GlossaryEntry[] | yes | Sorted by `term.localeCompare`. |
| projects | number | yes | Projects that contributed at least one entry. |

### NarrationAlias

All fields `readonly`.

| Field | Type | Required | Notes |
|---|---|---|---|
| written | string | yes | Trimmed, 1–`aliasWrittenMax` (200) characters. |
| spoken | string | yes | Trimmed, 1–`aliasSpokenMax` (500) characters. |
| wholeWord | boolean | yes | Match only where the written form is not inside a longer word. |
| caseSensitive | boolean | yes | Regex flags `gu` versus `giu`. |

### AliasMatch

All fields `readonly`.

| Field | Type | Required | Notes |
|---|---|---|---|
| start | number | yes | Inclusive UTF-16 offset. |
| end | number | yes | Exclusive UTF-16 offset. |
| spoken | string | yes | Replacement text. |

### AliasProblem

| Field | Type | Required | Notes |
|---|---|---|---|
| field | string | yes | `aliases` or `aliases.<index>`. |
| message | string | yes | Names the 1-based row (`Alias 3: …`). |

### NarrationSource

All fields `readonly`.

| Field | Type | Required | Notes |
|---|---|---|---|
| text | string | yes | Exact merged source substring. |
| start | number | yes | Offset in the normalized narration body. |
| bodyFingerprint | string | yes | `fingerprint(source)` of the whole body (`packages/app/src/slices/narration/pronunciation-chunks.ts:49`). |
| chunkingFingerprint | string | yes | `fingerprint([mode, words ?? defaultChunkWords \| characters ?? defaultChunkCharacters \| null])` (`packages/app/src/slices/narration/pronunciation-chunks.ts:50`). |

### PronunciationChunk

All fields `readonly`.

| Field | Type | Required | Notes |
|---|---|---|---|
| key | string | yes | `audio:body:<first 20 fingerprint chars>-<occurrence>` (`packages/app/src/slices/narration/pronunciation-chunks.ts:30`). |
| text | string | yes | Group source text. |
| source | NarrationSource | no | Present for merged groups and retained pinned bindings; absent for single base chunks. |

### NarrationOverride

Discriminated union on `kind`; all fields `readonly`.

| Field | Type | Required | Notes |
|---|---|---|---|
| kind | "asset" \| "text" | yes | accepted: asset, text |
| assetId | string | no | Required when `kind` is `asset`. |
| text | string | no | Required when `kind` is `text`; schema trims, 1–500,000 characters. |

### PreparedRequest

Both fields `readonly`.

| Field | Type | Required | Notes |
|---|---|---|---|
| text | string | yes | Exact request text: IPA/alias substitutions and cue tags included. |
| spokenText | string | yes | Clean source characters the request covers. |

### SteeringResult

| Field | Type | Required | Notes |
|---|---|---|---|
| ok | true \| false | yes | accepted: true, false |
| requests | PreparedRequest[] | no | Required when `ok: true`. |
| reason | string | no | Required when `ok: false`. |

### PreparationSource

All fields `readonly`.

| Field | Type | Required | Notes |
|---|---|---|---|
| format | "inworld-tts-2" | yes | accepted: inworld-tts-2 |
| version | 1 | yes | accepted: 1 |
| source | string | yes | Text Narration Preparation reads. |
| logicalKey | string | yes | Narration group key. |
| segment | NarrationSegment | yes | accepted: body, intro, outro |

### SourceSentence

| Field | Type | Required | Notes |
|---|---|---|---|
| sentence | number | yes | 1-based, from `Intl.Segmenter("en", { granularity: "sentence" })` (`packages/app/src/slices/narration/preparation.ts:47`). |
| text | string | yes | Sentence text including trailing whitespace. |

### Cue

Discriminated union on `kind`, each branch strict (`packages/app/src/slices/narration/preparation.ts:30`).

| Field | Type | Required | Notes |
|---|---|---|---|
| sentence | number | yes | Positive integer. |
| kind | "instruction" \| "reset" \| "sound" | yes | accepted: instruction, reset, sound |
| text | string | no | `instruction` only: 1–240 characters, non-blank, no `[]<>*_`~#` or control characters. |
| sound | string | no | `sound` only; accepted: laugh, breathe, clear throat, sigh, cough, yawn |

### NarrationRequest

All fields `readonly`.

| Field | Type | Required | Notes |
|---|---|---|---|
| key | string | yes | `<logicalKey>:<n>`. |
| logicalKey | string | yes | Group key. |
| logicalText | string | yes | Normalized group text. |
| segment | "body" \| "intro" \| "outro" | yes | accepted: body, intro, outro |
| text | string | yes | Request text from `splitText`. |
| requestFingerprint | string | yes | `narrationRequestFingerprint(...)`. |
| fingerprint | string | yes | `fingerprint([requestFingerprint, regenerationToken])`. |
| assetId | string \| null | yes | Retained audio asset, or null. |

### TextRecipes

All fields `readonly`.

| Field | Type | Required | Notes |
|---|---|---|---|
| recipes | ResolvedWorkRecipe[] | yes | Research, article, entry and thumbnail-prompt recipes. |
| articleText | string \| null | yes | `plainText(splitEndMatter(articleMarkdown).body)`; null while unwritten (`packages/app/src/slices/rebuild/recipe-text.ts:256`). |
| narrationText | string \| null | yes | The single-voice body as spoken: `articleText`, or with describing on the described text (null until descriptions answer) (`packages/app/src/slices/rebuild/recipe-text.ts:296`). |
| descriptions | ResolvedWorkRecipe[] | yes | `narration:describe:<n>` steps. |
| cards | ResolvedWorkRecipe[] | yes | `figure:card:<n>` steps. |
| glossary | GlossaryResult \| null | yes | See Relationships. |
| article | ResolvedWorkRecipe | yes | `article:body` recipe. |
| entries | Readonly<Partial<Record<"intro" \| "outro", TextRecipe>>> | yes | accepted keys: intro, outro. `TextRecipe` is a private alias `{ recipe: ResolvedWorkRecipe; text: string \| null }` (`packages/app/src/slices/rebuild/recipe-text.ts:92`). |
| script | ScriptText | no | Multi-voice script text, dependencies and fingerprint. |

### NarrationTextPart

All fields `readonly`.

| Field | Type | Required | Notes |
|---|---|---|---|
| logicalKey | string | yes | Group key. |
| spokenText | string | yes | Clean text. |
| requestText | string \| null | yes | Request text; null for provided (uploaded) audio. |

### VoiceChoice

Extends `ProviderChoice` (`provider`, `model`, optional `thinking`) (`packages/app/src/slices/admission/model.ts:35`). All optional switches have no schema default; absent reads as off.

| Field | Type | Required | Notes |
|---|---|---|---|
| provider | string | yes | TTS provider id. |
| model | string | yes | TTS model id. |
| thinking | ThinkingMode | no | Inherited; unused by narration. |
| voice | string | yes | Provider voice id. |
| usePronunciationGlossary | boolean | no | Use the article's Pronunciation Glossary. |
| shareGlossary | boolean | no | Also use other projects' pronunciations. |
| useNarrationAliases | boolean | no | Apply the run's copied aliases. |
| describeFigures | boolean | no | Describe tables/figures/equations/code in the narration. |
| skipCode | boolean | no | With describing on, leave code blocks out. |

### Speaker

Inferred from `speakerSchema` (`packages/app/src/slices/voices/model.ts:37`).

| Field | Type | Required | Notes |
|---|---|---|---|
| id | string | yes | 1–60 characters, `^[a-z0-9-]+$`; stable across renames. |
| name | string | yes | At most 40 characters. |
| role | SpeakerRole | yes | accepted: narrator, host, guest, character |
| voice | { provider: string; model: string; voice: string } | yes | The speaker's TTS choice. |
| pace | number | no | Applied after synthesis; UI steps 0.8–1.2 (`packages/app/src/slices/voices/model.ts:27`). |
| pronunciations | string | no | `Term: /IPA/` lines, at most 20,000 characters. |
| castId | string | no | At most 200 characters. |
| portrait | string | no | 64 lowercase hex SHA-256. |

### VoicesSettings

Inferred from `voicesSettingsSchema` (`packages/app/src/slices/voices/model.ts:78`).

| Field | Type | Required | Notes |
|---|---|---|---|
| format | VoiceFormat | yes | accepted: audiobook, podcast, drama, interview |
| source | ScriptSource | yes | accepted: script, attribute |
| speakers | Speaker[] | yes | At most 10. |
| turnGapSeconds | number | yes | Default 0.35 in `defaultVoicesSettings`. |
| nameTags | boolean | yes | Speaker name before captions. |
| nativeDialogue | boolean | yes | Use a provider's multi-speaker request. |
| audioFiles | boolean | yes | MP3/M4B with chapter markers. |
| book | Book | no | `{ title ≤ 200, chapter: number }`, strict. |

### DialogueLine

Recipe-side turn (`packages/app/src/slices/rebuild/recipe-model.ts:77`). The TTS port declares a separate `DialogueLine` `{ voiceId: string; text: string }` for the provider call (`packages/app/src/kernel/ports/tts.ts:10`).

| Field | Type | Required | Notes |
|---|---|---|---|
| speaker | string | yes | Speaker id. |
| turn | number | yes | Integer script turn. |
| voice | string | yes | Voice id. |
| text | string | yes | Turn request text. |

### TtsRequest

| Field | Type | Required | Notes |
|---|---|---|---|
| model | string | no | Provider model. |
| voiceId | string | yes | Voice id (whole request when `dialogue` is present). |
| text | string | yes | Request text. |
| dialogue | readonly { voiceId: string; text: string }[] | no | Only for providers whose capabilities say `dialogue`. |
| signal | AbortSignal | yes | Cancellation. |
| onActivity | () => void | no | Queued-job status activity. |
| continuation | { read(): string \| undefined; write(token: string): void } | no | Opaque provider continuation across attempts. |

## Relationships

- Glossary source: `glossaryOf` returns `{ ok: true, entries: [] }` when `usesPronunciationGlossary` is false, `null` while the article is unwritten, otherwise `parsePronunciationGlossary(endMatter.glossary, config.language)` merged with shared entries by `withShared` (`packages/app/src/slices/rebuild/recipe-text.ts:424`, `packages/app/src/slices/rebuild/recipe-text.ts:443`). `withSharedGlossary` keeps the project's own entries first and drops shared terms it already defines, keyed by NFC + `toLocaleLowerCase("en")` + collapsed whitespace (`packages/app/src/slices/narration/shared-glossary.ts:60`).
- Shared pronunciations: `collectSharedGlossary` reads each other project's selected, ready `article:glossary` output at its head revision, newest first; the first project to define a key wins (`packages/app/src/slices/narration/shared-glossary.ts:18`). The result is copied into `RunDraft.sharedGlossary` and used only while `audio.shareGlossary` is on (`packages/app/src/slices/admission/model.ts:154`).
- Aliases: Library rows (`narration_aliases`) are copied into `RunDraft.narrationAliases` (`packages/app/src/slices/admission/model.ts:157`); `narrationAliasesOf` returns them only for generated audio with `useNarrationAliases === true`, for any provider (`packages/app/src/slices/admission/rules.ts:601`). The same matcher (`aliasMatches`) feeds request text, Narration Preparation sentences (`aliasedSentences`) and caption alignment (`packages/app/src/slices/rebuild/runtime-subtitles.ts:119`).
- Spans per group: `narrationParts` computes glossary spans and alias spans on the normalized group text, then `withAliasSpans` drops any glossary span overlapping an alias span (`packages/app/src/slices/rebuild/recipe-audio-parts.ts:51`, `packages/app/src/slices/narration/aliases.ts:30`).
- Grouping: `bodyNarrationGroups` passes normalized `TextRecipes.narrationText`, effective chunking, glossary entries (only when the glossary is in use and `ok`), overridden keys and saved `narrationSources` to `pronunciationChunks` (`packages/app/src/slices/rebuild/recipe-audio.ts:41`). A glossary match crossing adjacent base chunks merges them into one group with a new key and `NarrationSource`; matches intersecting overridden chunks or pinned groups do not merge (`packages/app/src/slices/narration/pronunciation-chunks.ts:83`). Aliases do not affect grouping.
- Request construction in `narrationParts` (`packages/app/src/slices/rebuild/recipe-audio-parts.ts:19`): an `asset` override yields a `provided` recipe carrying `semantic: [normalizedText, voiceValues]`; a `text` override replaces the group text; `glossary === null` yields no parts; `ok: false` yields a deferred refusal; with Narration Preparation on, cues and spans produce `PreparedRequest[]` via `preparationForGroup`; with spans only, `prepareRequests(text, [], maxCharacters, spans)`; with neither, `planNarration` (plain splitter, no `spokenText`).
- Multi-voice: each speaker's glossary is their own `pronunciations` plus the run glossary (when `usePronunciationGlossary` is on and ok), only for `readsIpa` speakers (Inworld `inworld-tts-2` or `inworld-tts-2-flash`) (`packages/app/src/slices/rebuild/recipe-voices.ts:381`, `packages/app/src/slices/rebuild/recipe-voices.ts:415`).
- `TextRecipes.article`, `recipes` and entry recipes reference `ResolvedWorkRecipe` (`02-models.md`).

## Boundaries

| Boundary | Representation and conversion |
|---|---|
| Article → narration text | `splitEndMatter` separates body, sources and glossary (`packages/app/src/slices/article/split.ts:40`); `plainText` strips Markdown from the body (`packages/app/src/slices/article/plain.ts:11`); only the glossary part feeds the parser. `normalizeNarrationText` converts `\r\n?` to `\n` and trims (`packages/app/src/slices/narration/plan.ts:33`). |
| Run config | `VoiceChoice` under `RunDraft.audio`; schema extends `providerChoice` with `voice` and the five optional booleans (`packages/app/src/slices/admission/schema.ts:83`). `narrationAliases: narrationAliasesSchema.optional()` and `sharedGlossary` (≤ 20,000 rows) sit at run-config top level (`packages/app/src/slices/admission/schema.ts:93`). Glossary use activates only for generated audio, explicit `usePronunciationGlossary: true`, provider `inworld`, model `inworld-tts-2` or `inworld-tts-2-flash` (`packages/app/src/slices/admission/rules.ts:631`). |
| Library aliases ↔ DB | `listNarrationAliases` selects ordered rows and drops any row failing `narrationAliasSchema` (`packages/app/src/slices/narration/aliases-library.ts:18`); `saveNarrationAliases` validates, deletes all rows and reinserts in order in one transaction (`packages/app/src/slices/narration/aliases-library.ts:40`). HTTP: `GET /aliases`, `PUT /aliases` (body `{ aliases: unknown[] }`, ≤ 2000), `GET /shared?except=<projectId>` returning SharedGlossary (`packages/app/src/edge/http/pronunciations.ts:21`). |
| Revision content | `RevisionContent.narrationOverrides: Record<string, NarrationOverride>` (required) and `narrationSources?: Record<string, NarrationSource>` (`packages/app/src/slices/revisions/model.ts:47`). `insertRevision` stores config/content/fingerprints via `JSON.stringify`; reads parse and validate with `projectRevisionSchema` (`packages/app/src/slices/revisions/repo.ts:33`, `packages/app/src/slices/revisions/repo.ts:110`). |
| Prepared text → TTS payload | TTS `RecipeInput` (`packages/app/src/slices/rebuild/recipe-model.ts:106`): `kind: "tts"`, `version: 1`, `provider`, `model`, `voice`, `text`, optional `spokenText`, `logicalKey`, `logicalText`, `segment` (body/intro/outro), `pronunciation: null`, optional `wholeRequest`, and multi-voice `speaker`, `turn`, `dialogue: DialogueLine[]`. IPA and alias forms are embedded in `text`; `pronunciation` stays null. |
| TTS payload ↔ work JSON | `insertWorkPiece` validates with `recipeInputSchema` before writing `input_json`; `workPieces` parses and re-validates (`packages/app/src/slices/rebuild/work-records.ts:57`, `packages/app/src/slices/rebuild/work-records.ts:33`). |
| Fingerprints | `narrationRequestFingerprint` covers `narration-request-v1`, provider, model, voice, request text, `null`, segment and optional whole-text fingerprint; `spokenText` is not a separate component (`packages/app/src/slices/narration/plan.ts:36`). Work fingerprints add the regeneration token (`packages/app/src/slices/narration/plan.ts:65`). |
| Retained pieces → text files | `narrationTextParts` requires every dependency of `audio:body:concat` / `audio:<segment>` to be selected, available, done and fingerprint-matching; a `provided` part contributes `semantic[0]` and no request text; a TTS part whose input has `spokenText` must have payload `text` and `spokenText` equal to the input (`packages/app/src/slices/rebuild/runtime-narration-text.ts:25`). Outputs: `narration_txt` → `<segment>-narration.txt` (spoken text, newline between groups) and `tts_script` → `<segment>-tts-script.txt` (request texts joined by blank lines) (`packages/app/src/slices/rebuild/runtime-narration-text.ts:116`). |

## Validation

### Glossary syntax and IPA

- Parsing uses remark + GFM; headings other than `Pronunciation Glossary`, paragraph lines, list items and table rows (first two cells after the header) become rows; other blocks become the row `(unsupported glossary block)`, which is skipped (`packages/app/src/slices/narration/pronunciation.ts:45`). A table IPA cell without `/` is wrapped as `/cell/`.
- Row rules, each failure producing a `SkippedGlossaryRow` (never a refusal): `Term: pronunciation` shape; term has a letter or number and no `/`, `[`, `]`, `<`, `>` or control character; pronunciation is one or more `/…/` groups optionally followed by a non-slash annotation; every IPA word matches the symbol set; IPA word count equals term word count; a term whose identity already maps to a different IPA is skipped (`packages/app/src/slices/narration/pronunciation.ts:88`).
- Symbol set depends on `config.language`: absent or `en` uses the standard-English atom (base `abdefghijklmnoprstuvwxzæðŋθɑɒɔəɚɛɜɝɡɪɹʃʊʌʒʔɫɾ`, optional leading `ˈ`/`ˌ`, modifiers U+0303, U+031A, U+0325, U+0329, U+032A, U+032C, U+032F, U+035C, U+0361, `ʰʲʷ`, trailing `ː`/`ˑ`); any other language uses the full IPA chart atom with combining marks U+0300–U+036F (`packages/app/src/slices/narration/pronunciation.ts:32`, `packages/app/src/slices/narration/pronunciation.ts:37`). Periods separate atom sequences.
- Term identity folds case character by character only where an anchored `/iu` match accepts the folded form (`packages/app/src/slices/narration/pronunciation.ts:66`).
- User-facing notices name entries by number and reason only (`packages/app/src/slices/narration/pronunciation.ts:140`, `packages/app/src/slices/narration/pronunciation.ts:168`).

### Matching boundaries

- Glossary matching sorts terms longest first, escapes regex punctuation, allows `\s+` between words, uses flags `giu`, and rejects matches adjacent (optionally through `'`/`’`) to letters, marks, numbers, `_`, `-`, U+00AD, U+2010, U+2011, U+FE63, U+FF0D; an unpaired trailing apostrophe also rejects the match (`packages/app/src/slices/narration/pronunciation.ts:192`).
- Alias matching: leftmost first, longest at equal start, non-overlapping; `wholeWord` checks only the characters adjacent to a written form whose first/last character is a word character `[\p{L}\p{M}\p{N}_]` (`packages/app/src/kernel/ports/narration-aliases.ts:30`).

### Aliases

- `narrationAliasSchema`: strict, readonly; `narrationAliasesSchema` at most 1000 entries (`packages/app/src/slices/narration/aliases-schema.ts:10`). `aliasProblems` rejects rows failing the schema and duplicate written forms keyed by `=`+text (case-sensitive) or `~`+lower-cased text (`packages/app/src/slices/narration/aliases-schema.ts:27`, `packages/app/src/slices/narration/aliases-schema.ts:63`).

### Request spans and limits

- `checkedSpans` requires integer, non-overlapping, positive-length spans inside the source whose covered text has no whitespace and no surrogate code unit; violations throw (`packages/app/src/slices/narration/steering.ts:59`). The replacement text itself is not validated there.
- `prepareRequests` requires an integer limit ≥ 2, returns no requests for blank source, consumes ordinary characters by code point and each span as one atom, and counts the limit in UTF-16 length including cue tags; content that cannot fit returns the `cannotFit` refusal (`packages/app/src/slices/narration/steering.ts:101`, `packages/app/src/slices/narration/steering.ts:11`). Whitespace before an empty alias span is omitted from request text but kept in `spokenText` (`packages/app/src/slices/narration/steering.ts:43`). Sentence anchors inside a span move to the span start (`packages/app/src/slices/narration/steering.ts:89`).
- `maxCharacters` is the catalogue model's `tts.maxCharacters` (enabled, deprecated allowed), else the group's substituted length (min 2) (`packages/app/src/slices/rebuild/recipe-audio-parts.ts:61`).

### Binding authority

- Schema: `narrationSources` optional; keys 1–256 characters; `text` 1–500,000; `start` integer 0–500,000; both fingerprints `^[0-9a-f]{64}$`; each object strict; ≤ 10,000 entries and ≤ 500,000 total text characters. `narrationOverrides` text is trimmed, 1–500,000 characters; asset ids match `^[0-9A-Za-z_-]+$`, 1–64 (`packages/app/src/slices/revisions/schema.ts:60`, `packages/app/src/slices/revisions/schema.ts:67`).
- `saveRevision` discards submitted `narrationSources` before the idempotency hash, calls `bindNarrationSources` against the base, and again against the fresh revision inside the transaction (`packages/app/src/slices/revisions/mutations.ts:72`, `packages/app/src/slices/revisions/mutations.ts:90`, `packages/app/src/slices/revisions/mutations.ts:124`).
- `bindNarrationSources` keeps only keys tied to overrides, base regeneration tokens, requested regenerations or narration uploads, recomputes groups under the proposed config/content, and omits the property when no binding survives (`packages/app/src/slices/revisions/rules.ts:10`).
- A saved binding is honoured only if its body and chunking fingerprints match, the source substring matches, the key matches `^audio:body:<fp20>-[1-9][0-9]*$`, both ends align with base chunk boundaries, it spans more than one chunk, does not overlap an earlier pinned group, and contains no overridden chunk (`packages/app/src/slices/narration/pronunciation-chunks.ts:62`). Tests: `packages/app/src/slices/revisions/mutations-narration-source-trust.test.ts:53`.

## Schema

One table is narration-specific:

```sql
CREATE TABLE narration_aliases (
  id TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  written TEXT NOT NULL CHECK (length(trim(written)) > 0),
  spoken TEXT NOT NULL CHECK (length(trim(spoken)) > 0),
  whole_word INTEGER NOT NULL CHECK (whole_word IN (0, 1)),
  case_sensitive INTEGER NOT NULL CHECK (case_sensitive IN (0, 1)),
  updated_at TEXT NOT NULL
);
```

Source: `packages/app/src/kernel/db/migrations/0035-narration-aliases.sql:5`. No index beyond the primary key; no foreign key references it (projects hold copies in run config). Everything else in this chapter is stored as JSON inside `project_revisions.config` / `content` and `revision_work_pieces.input_json`, whose DDL is in `02-models.md`.
