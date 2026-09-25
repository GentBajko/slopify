---
generated_at_commit: 9e439aa80dc9
generated_date: 2026-09-25
content_hash: 8f6a4e096f0a
paths_covered:
  - ':(top)packages/app/src/slices/narration/**'
  - ':(top)packages/app/src/slices/article/**'
  - ':(top)packages/app/src/slices/rebuild/recipe-*.ts'
  - ':(top)packages/app/src/slices/rebuild/runtime-narration-text.ts'
  - ':(top)packages/app/src/slices/rebuild/runtime-provider.ts'
  - ':(top)packages/app/src/slices/rebuild/runtime-export-inputs.ts'
  - ':(top)packages/app/src/slices/admission/model.ts'
  - ':(top)packages/app/src/slices/admission/rules.ts'
  - ':(top)packages/app/src/slices/admission/schema.ts'
  - ':(top)packages/app/src/adapters/tts/inworld*.ts'
  - ':(top)packages/web/src/play/narration-preparation.tsx'
  - ':(top)packages/web/src/play/media-rails.tsx'
  - ':(top)packages/web/src/project/revision-narration.tsx'
---

# Narration Text Models

Scoped pre-pronunciation baseline. No glossary-setting or dictionary entity exists yet.

## Entities

| Entity | Field | Type | Required |
| --- | --- | --- | --- |
| EndMatter | body, sources, glossary | string | Yes |
| RunDraft / RunConfig | narrationPrompt | string | No |
| RecipeContext.resolved | articleMarkdown | string or null | Yes |
| TextRecipes | articleText | string or null | Yes |
| TextRecipes | article, recipes, entries | resolved recipes | Yes |
| TTS RecipeInput | text | string sent to provider | Yes |
| TTS RecipeInput | spokenText | clean spelling | No |
| TTS RecipeInput | logicalKey, logicalText | string | Yes |
| TTS RecipeInput | pronunciation | null | Yes |
| TTS RecipeInput | segment | body, intro or outro | Yes |
| PreparedRequest | text, spokenText | paired strings | Yes |

Sources: `packages/app/src/slices/article/split.ts:16`, `packages/app/src/slices/admission/model.ts:55`, `packages/app/src/slices/rebuild/recipe-model.ts:19`, `:69`, `recipe-text.ts:73`, `packages/app/src/slices/narration/steering.ts:3`.

## Relationships

An article yields one spoken body and separate end matter. Body logical chunks and enabled entries yield physical TTS requests. Optional cue preparation changes only sent text while retaining clean spelling. TTS completion saves both for prepared requests; narration text files and export alignment consume their clean projection (`packages/app/src/slices/rebuild/recipe-audio.ts:25`, `runtime-provider.ts:113`, `runtime-narration-text.ts:27`, `runtime-export-inputs.ts:80`).

## Lifecycles

Saved narration prompts bind to exact source and model settings. Immutable request fingerprints determine reuse; changing only the glossary currently leaves narration unchanged because it is excluded from the body and recipes. Existing recipes accept only null pronunciation metadata, so adding application pronunciation cannot simply reinterpret every stored config without affecting retained work (`packages/app/src/slices/rebuild/recipe-preparation.ts:60`, `recipe-input-schema.ts:61`, `recipe-text.test.ts:158`).

## Persistence

Generated/provided article publication saves Markdown, plain text and optional glossary as registered assets. TTS pieces save exact text and optional spokenText in their payload; clean narration and TTS script are separate revision-owned outputs when preparation is enabled. There is no separate dictionary table (`packages/app/src/slices/rebuild/runtime-provider.ts:113`, `:217`, `runtime-narration-text.ts:106`).

