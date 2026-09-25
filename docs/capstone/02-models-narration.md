---
generated_at_commit: 6eeac3fd9043
generated_date: 2026-09-25
content_hash: 8a13ab2b16e5
absorbed_from: features/2026-09-25-glossary-pronunciation@2026-09-25
paths_covered:
  - ':(top)packages/app/src/slices/narration/*.ts'
  - ':(top)packages/app/src/slices/article/plain.ts'
  - ':(top)packages/app/src/slices/article/split.ts'
  - ':(top)packages/app/src/slices/admission/model.ts'
  - ':(top)packages/app/src/slices/admission/schema.ts'
  - ':(top)packages/app/src/slices/admission/rules.ts'
  - ':(top)packages/app/src/slices/rebuild/recipe-text.ts'
  - ':(top)packages/app/src/slices/rebuild/recipe-audio*.ts'
  - ':(top)packages/app/src/slices/rebuild/recipe-preparation.ts'
  - ':(top)packages/app/src/slices/rebuild/recipe-model.ts'
  - ':(top)packages/app/src/slices/rebuild/recipe-input-schema.ts'
  - ':(top)packages/app/src/slices/rebuild/work-records.ts'
  - ':(top)packages/app/src/slices/rebuild/runtime-narration-text.ts'
  - ':(top)packages/app/src/slices/revisions/model.ts'
  - ':(top)packages/app/src/slices/revisions/schema.ts'
  - ':(top)packages/app/src/slices/revisions/rules.ts'
  - ':(top)packages/app/src/slices/revisions/mutations.ts'
  - ':(top)packages/app/src/slices/revisions/mutations-narration-source-trust.test.ts'
  - ':(top)packages/app/src/slices/revisions/repo.ts'
  - ':(top)packages/app/src/kernel/runner/work.ts'
---

# Narration Text Models

## Entities

| Name | Definition site | Storage | Purpose |
|---|---|---|---|
| GlossaryEntry | `packages/app/src/slices/narration/pronunciation.ts:4` | In-memory | Written term paired with IPA words. |
| GlossaryResult | `packages/app/src/slices/narration/pronunciation.ts:4` | In-memory | Successful entries or a refusal reason. |
| PronunciationSpan | `packages/app/src/slices/narration/pronunciation.ts:100` | In-memory | Source range and replacement IPA text. |
| PronunciationMatch | `packages/app/src/slices/narration/pronunciation.ts:100` | In-memory | Source range associated with a glossary entry. |
| NarrationSource | `packages/app/src/slices/narration/pronunciation-chunks.ts:10` | In-memory; nested revision-content JSON | Source identity for a merged narration group; persistence crosses through `RevisionContent`. |
| PronunciationChunk | `packages/app/src/slices/narration/pronunciation-chunks.ts:10` | In-memory | Logical narration group with optional source binding. |
| PreparedRequest | `packages/app/src/slices/narration/steering.ts:4` | In-memory; projected into TTS recipe JSON | Exact request text paired with clean spoken text. |
| TextRecipe | `packages/app/src/slices/rebuild/recipe-text.ts:75` | In-memory | Private helper pairing a recipe with possibly unresolved text. |
| TextRecipes | `packages/app/src/slices/rebuild/recipe-text.ts:75` | In-memory | Resolved recipes, article text, glossary status and optional entry text. |

Nested persistence and request projections are implemented in `packages/app/src/slices/revisions/repo.ts:33`, `packages/app/src/slices/rebuild/work-records.ts:57` and `packages/app/src/slices/rebuild/recipe-audio-parts.ts:60`.

## Fields and types

### GlossaryEntry

Both fields are `readonly`; the IPA array is also readonly. Definition: `packages/app/src/slices/narration/pronunciation.ts:4`.

| Field | Type | Required | Notes |
|---|---|---|---|
| term | `string` | yes | Written term. |
| ipa | `readonly string[]` | yes | IPA words without enclosing slashes. |

The parser trims the term, collapses whitespace to one space, and requires one IPA word per written word. `packages/app/src/slices/narration/pronunciation.ts:65`

### GlossaryResult

Discriminated union; every declared property is `readonly`. `entries` and `reason` are required in their respective branches and absent from the other branch. `packages/app/src/slices/narration/pronunciation.ts:4`

| Field | Type | Required | Notes |
|---|---|---|---|
| ok | `true \| false` | yes | accepted: true, false |
| entries | `GlossaryEntry[]` | no | Readonly array; required when `ok: true`. |
| reason | `string` | no | Required when `ok: false`. |

### PronunciationSpan

All fields are `readonly`. The producer emits one span per matched written word, using UTF-16 string offsets and an exclusive end; `text` is the corresponding IPA word wrapped in slashes. `packages/app/src/slices/narration/pronunciation.ts:100`, `packages/app/src/slices/narration/pronunciation.ts:145`

| Field | Type | Required | Notes |
|---|---|---|---|
| start | `number` | yes | Inclusive source offset. |
| end | `number` | yes | Exclusive source offset. |
| text | `string` | yes | Replacement such as `/lɪtʃ/`. |

### PronunciationMatch

All fields are `readonly`. Match construction uses the regular-expression index and matched string length. `packages/app/src/slices/narration/pronunciation.ts:100`, `packages/app/src/slices/narration/pronunciation.ts:133`

| Field | Type | Required | Notes |
|---|---|---|---|
| start | `number` | yes | Inclusive UTF-16 source offset. |
| end | `number` | yes | Exclusive UTF-16 source offset. |
| entry | `GlossaryEntry` | yes | Selected glossary mapping. |

### NarrationSource

All fields are `readonly`; none has a declaration default. Definition and construction: `packages/app/src/slices/narration/pronunciation-chunks.ts:10`, `packages/app/src/slices/narration/pronunciation-chunks.ts:117`.

| Field | Type | Required | Notes |
|---|---|---|---|
| text | `string` | yes | Exact merged source substring. |
| start | `number` | yes | Substring offset in the normalized narration body. |
| bodyFingerprint | `string` | yes | Fingerprint of the complete normalized body. |
| chunkingFingerprint | `string` | yes | Fingerprint of effective chunk mode and its active limit. |

The caller normalizes line endings and trims the article text before grouping. The chunking fingerprint uses `words ?? 500`, `characters ?? 3000`, or `null` for the other modes. Fingerprints are SHA-256 hexadecimal digests of canonical JSON. `packages/app/src/slices/rebuild/recipe-audio.ts:25`, `packages/app/src/slices/narration/plan.ts:33`, `packages/app/src/slices/narration/pronunciation-chunks.ts:46`, `packages/app/src/kernel/runner/work.ts:35`

### PronunciationChunk

All fields are `readonly`. `packages/app/src/slices/narration/pronunciation-chunks.ts:10`

| Field | Type | Required | Notes |
|---|---|---|---|
| key | `string` | yes | Logical body-group identity. |
| text | `string` | yes | Group source text. |
| source | `NarrationSource` | no | Present for newly merged groups or retained validated bindings. |

Generated keys have the form `audio:body:<first 20 fingerprint characters>-<occurrence>`. Ordinary single chunks omit `source`; merged groups receive a new key and source binding. `packages/app/src/slices/narration/pronunciation-chunks.ts:28`, `packages/app/src/slices/narration/pronunciation-chunks.ts:80`

### PreparedRequest

Both fields are `readonly`. IPA substitutions and cue tags enter `text`; source characters enter `spokenText`. `packages/app/src/slices/narration/steering.ts:4`, `packages/app/src/slices/narration/steering.ts:17`, `packages/app/src/slices/narration/steering.ts:104`

| Field | Type | Required | Notes |
|---|---|---|---|
| text | `string` | yes | Exact physical request text. |
| spokenText | `string` | yes | Corresponding clean source spelling, punctuation and whitespace. |

### TextRecipe

Private type alias; both fields are `readonly`. `packages/app/src/slices/rebuild/recipe-text.ts:75`

| Field | Type | Required | Notes |
|---|---|---|---|
| recipe | `ResolvedWorkRecipe` | yes | Entry recipe. |
| text | `string \| null` | yes | Available text or unresolved value. |

### TextRecipes

All properties are `readonly`; `recipes` is a readonly array and `entries` is a readonly partial record. `packages/app/src/slices/rebuild/recipe-text.ts:75`

| Field | Type | Required | Notes |
|---|---|---|---|
| recipes | `ResolvedWorkRecipe[]` | yes | Readonly collection. |
| articleText | `string \| null` | yes | Plain article body or unresolved value. |
| glossary | `GlossaryResult \| null` | yes | Parsed result, disabled empty success, or pending article. |
| article | `ResolvedWorkRecipe` | yes | Article-body recipe. |
| entries | `Readonly<Partial<Record<"intro" \| "outro", TextRecipe>>>` | yes | accepted keys: intro, outro; either may be absent. |

`articleText` comes from `plainText(splitEndMatter(articleMarkdown).body)`. Disabled glossary use produces `{ ok: true, entries: [] }`; enabled use with no article produces `null`; otherwise the extracted glossary is parsed. Entries exist only for configured intro/outro choices with generated audio; literal entries use the rendered prompt, while generated entries use matching retained text or `null`. `packages/app/src/slices/rebuild/recipe-text.ts:206`

## Relationships

`GlossaryResult.entries` supplies mappings to both grouping and substitution. `pronunciationMatches` associates source ranges with entries; `pronunciationSpans` expands each matched phrase into per-word substitutions without replacing intervening whitespace. `packages/app/src/slices/narration/pronunciation.ts:110`, `packages/app/src/slices/narration/pronunciation.ts:145`

`bodyNarrationGroups` combines normalized `TextRecipes.articleText`, effective chunking, enabled successful glossary entries, override keys and saved `NarrationSource` bindings. A glossary occurrence crossing adjacent base chunks merges those chunks. Matches intersecting overridden base chunks or pinned groups are excluded from new merging. `packages/app/src/slices/rebuild/recipe-audio.ts:25`, `packages/app/src/slices/narration/pronunciation-chunks.ts:80`

`narrationParts` applies text overrides before calculating pronunciation spans. Asset overrides return a provided-audio recipe before glossary processing. A pending glossary returns no resolved parts; an invalid glossary produces a deferred refusal. With preparation enabled, validated cues and spans jointly produce `PreparedRequest[]`; otherwise matching spans alone produce those requests. With no matches and no preparation, the existing narration splitter supplies requests without `spokenText`. `packages/app/src/slices/rebuild/recipe-audio-parts.ts:13`, `packages/app/src/slices/rebuild/recipe-audio-parts.ts:60`, `packages/app/src/slices/rebuild/recipe-audio-parts.ts:124`

`TextRecipes.article`, `recipes` and `TextRecipe.recipe` reference the broader [ResolvedWorkRecipe model](02-models.md), whose source definition contains the recipe input, logical fingerprint, deferred flag and optional refusal. `packages/app/src/slices/rebuild/recipe-model.ts:108`

## Boundaries

| Boundary | Representation and conversion |
|---|---|
| Run configuration | [RunDraft / RunConfig](02-models.md) carry the flag through optional `audio: VoiceChoice`. `VoiceChoice.usePronunciationGlossary?: boolean \| undefined` has no schema default. Use activates only for generated audio, explicit `true`, provider `inworld`, and model `inworld-tts-2` or `inworld-tts-2-flash`. `packages/app/src/slices/admission/model.ts:23`, `packages/app/src/slices/admission/schema.ts:37`, `packages/app/src/slices/admission/rules.ts:307` |
| Article → narration | `splitEndMatter` separates body, sources and glossary using parsed heading/paragraph markers. `plainText` strips Markdown from the body; only the glossary portion feeds the glossary parser. `packages/app/src/slices/article/split.ts:35`, `packages/app/src/slices/article/plain.ts:11`, `packages/app/src/slices/rebuild/recipe-text.ts:206` |
| Revision content | [RevisionContent](02-models.md) contains required `narrationOverrides: Readonly<Record<string, NarrationOverride>>` and optional `narrationSources: Readonly<Record<string, NarrationSource>> \| undefined`. Overrides are `{ kind: "asset", assetId }` or `{ kind: "text", text }`; bindings identify original source groups. `packages/app/src/slices/revisions/model.ts:24` |
| Revision JSON | `insertRevision` serializes configuration, content and fingerprints with `JSON.stringify`; reads use `JSON.parse` followed by `projectRevisionSchema.parse`. `packages/app/src/slices/revisions/repo.ts:33`, `packages/app/src/slices/revisions/repo.ts:108` |
| Prepared text → TTS payload | The TTS branch of [RecipeInput](02-models.md) requires `kind: "tts"`, `version: 1`, `provider`, `model`, `voice`, `text`, `logicalKey`, `logicalText`, `segment` and `pronunciation: null`; `spokenText` and `wholeRequest` are optional. Accepted segments: body, intro, outro. IPA is embedded in `text`; the `pronunciation` property remains null. `packages/app/src/slices/rebuild/recipe-model.ts:68`, `packages/app/src/slices/rebuild/recipe-audio-parts.ts:60` |
| TTS payload → work JSON | `insertWorkPiece` validates through `recipeInputSchema` before serializing into `input_json`; `workPieces` parses JSON and validates it again. `packages/app/src/slices/rebuild/work-records.ts:33`, `packages/app/src/slices/rebuild/work-records.ts:57` |
| Retained payload → narration files | `narrationTextParts` requires selected, available, completed pieces matching current recipe fingerprints. If the input includes `spokenText`, both saved `text` and `spokenText` must exactly match the input. Clean text becomes `<segment>-narration.txt`; request text becomes `<segment>-tts-script.txt`, separated by blank lines. Provided replacements contribute clean semantic text and no request text. `packages/app/src/slices/rebuild/runtime-narration-text.ts:25`, `packages/app/src/slices/rebuild/runtime-narration-text.ts:96` |

TTS request fingerprints include exact request text, voice/model/provider, segment and an optional whole-text fingerprint; they do not include `spokenText` as a separate component. Work fingerprints additionally incorporate regeneration tokens. `packages/app/src/slices/narration/plan.ts:33`, `packages/app/src/slices/rebuild/recipe-model.ts:136`

## Validation

### Glossary syntax and English IPA

The parser uses remark with GFM, accepts paragraph lines, lists and tables, ignores the glossary title, and takes the first two table columns after the header. Unsupported blocks become invalid rows. Terms must contain a Unicode letter or number and cannot contain slash, square brackets, angle brackets or control characters. Pronunciations require slash-delimited notation; trailing non-slash annotations are permitted. `packages/app/src/slices/narration/pronunciation.ts:23`, `packages/app/src/slices/narration/pronunciation.ts:65`

The implemented English-IPA allow-list is:

- Base symbols: `abdefghijklmnoprstuvwxzæðŋθɑɒɔəɚɛɜɝɡɪɹʃʊʌʒʔɫɾ`.
- Each base may have one preceding `ˈ` or `ˌ`, zero or more modifiers from `U+0303`, `U+031A`, `U+0325`, `U+0329`, `U+032A`, `U+032C`, `U+032F`, `U+035C`, `U+0361`, `ʰ`, `ʲ`, `ʷ`, and one following `ː` or `ˑ`.
- Periods separate nonempty sequences of these atoms.

These are regular-expression checks; word count must additionally match the written term. Invalid input returns the first row-specific refusal with fixed explanatory text. `packages/app/src/slices/narration/pronunciation.ts:17`, `packages/app/src/slices/narration/pronunciation.ts:44`, `packages/app/src/slices/narration/pronunciation.ts:81`

### Unicode identity and matching boundaries

Duplicate identity is built character by character using case conversions accepted by an anchored `/iu` matcher. Identical mappings retain the first term spelling; differing IPA for the same identity is rejected. Tests cover equivalent `Σ/ς`, `S/ſ`, `ẞ/ß`, `K/K`, while keeping `I/ı`, `İ/i◌̇`, `ß/ss` and `ﬀ/ff` distinct. `packages/app/src/slices/narration/pronunciation.ts:55`, `packages/app/src/slices/narration/pronunciation.ts:91`, `packages/app/src/slices/narration/pronunciation.test.ts:25`

Matching sorts terms by descending string length, escapes regex punctuation, permits `\s+` between written words, and uses `giu`. Adjacent Unicode letters, marks, numbers, underscore, ASCII hyphen, soft hyphen, `U+2010`, `U+2011`, `U+FE63` and `U+FF0D` block partial matches, including adjacency through `'` or `’`. An additional check rejects unpaired trailing possessive apostrophes; paired straight or curly quotes remain outside the match. `packages/app/src/slices/narration/pronunciation.ts:110`, `packages/app/src/slices/narration/pronunciation.ts:133`

Source offsets use UTF-16 indexing: the test with an initial emoji places the first following term at offset 3. Tests distinguish hyphen compounds from an em-dash boundary and preserve quoted terms. `packages/app/src/slices/narration/pronunciation.test.ts:103`

### Request spans and limits

`checkedSpans` sorts spans and requires integer, non-overlapping, positive-length ranges inside the source, with no whitespace or lone surrogate in the covered substring. Invalid spans throw. It does not validate the replacement string as IPA; that check belongs to glossary parsing. `packages/app/src/slices/narration/steering.ts:40`, `packages/app/src/slices/narration/pronunciation.ts:81`

`prepareRequests` requires an integer character limit of at least 2 and returns no requests for blank source. Ordinary characters are consumed by Unicode code point; an IPA replacement is one indivisible atom. Request limits count UTF-16 string length, including cue tags and carried instructions. An atom or required cue combination that cannot fit returns a refusal. Sentence anchors falling inside a pronunciation span move to its start. `packages/app/src/slices/narration/steering.ts:17`, `packages/app/src/slices/narration/steering.ts:58`, `packages/app/src/slices/narration/steering.ts:80`, `packages/app/src/slices/narration/steering.ts:104`

### Binding authority

The revision schema permits omitted bindings. Supplied records require keys of 1–256 characters, source text of 1–500,000 characters, integer starts from 0–500,000, and two lowercase 64-digit hexadecimal fingerprints. The record is limited to 10,000 entries and 500,000 combined text characters; each binding object is strict. `packages/app/src/slices/revisions/schema.ts:12`, `packages/app/src/slices/revisions/schema.ts:57`

Schema validity does not establish binding authority. `saveRevision` discards submitted `narrationSources` before computing the idempotency request hash, then calls `bindNarrationSources`; it repeats binding against the fresh revision inside the save transaction. `packages/app/src/slices/revisions/mutations.ts:51`, `packages/app/src/slices/revisions/mutations.ts:95`

`bindNarrationSources` derives candidates from the base revision’s saved bindings and computed body groups. It retains only keys associated with proposed overrides, base regeneration tokens, requested regeneration or narration uploads, and recomputes valid groups under the proposed configuration/content. No surviving binding means the property is omitted. `packages/app/src/slices/revisions/rules.ts:10`

A retained binding must match the current body and effective-chunking fingerprints, exact source substring and hash-derived key. Its endpoints must align with base chunks, span more than one chunk, avoid overlap with earlier pinned groups and contain no overridden constituent chunk. Invalid candidates are skipped. `packages/app/src/slices/narration/pronunciation-chunks.ts:46`

Tests cover forged metadata failing to create an inactive merged override, server derivation when metadata is omitted or forged, and idempotent replay despite changed submitted metadata. `packages/app/src/slices/revisions/mutations-narration-source-trust.test.ts:53`

## Schema

These representations use existing revision-content and work-input JSON storage. Shared table DDL remains in the broad [Models schema chapter](02-models.md); no table DDL is reproduced here. Serialization sites: `packages/app/src/slices/revisions/repo.ts:33`, `packages/app/src/slices/rebuild/work-records.ts:57`.
