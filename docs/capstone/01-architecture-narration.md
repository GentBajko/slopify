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

# Narration Text Boundaries

Scoped pre-pronunciation baseline at `9e439aa80dc9`; unrelated historical chapter stamps are unchanged.

## Layers

The article slice separates the Markdown body, sources and pronunciation glossary. Rebuild recipes plan logical/physical narration; the runtime sends exact request text through the provider wrapper. Inworld adapters serialize that text into their existing API requests. No glossary substitution is currently performed (`packages/app/src/slices/article/split.ts:39`, `packages/app/src/slices/rebuild/recipe-audio-parts.ts:14`, `packages/app/src/adapters/tts/inworld.ts:97`).

## Module boundaries

- `textRecipes` chooses provided/edited/generated article Markdown, then exposes only plain body text; the glossary is not a member of `TextRecipes` (`packages/app/src/slices/rebuild/recipe-text.ts:73`, `:147`, `:210`).
- `plainText` parses with remark/GFM, strips markup, then serializes using the Markdown processor. This is the separately reported escaped-character boundary, not fixed by video recovery (`packages/app/src/slices/article/plain.ts:11`).
- `audioRecipes` creates stable logical body groups plus independent intro/outro work. `narrationParts` chooses provided overrides, prepared requests or ordinary physical splitting (`packages/app/src/slices/rebuild/recipe-audio.ts:25`, `recipe-audio-parts.ts:14`).
- Optional preparation supplies validated sentence cues. `prepareRequests` produces request `text` and clean `spokenText`, accounting for tags and UTF-16 character limits. Its ordinary-word fallback can split by code point; it has no phoneme-token model (`packages/app/src/slices/rebuild/recipe-preparation.ts:60`, `packages/app/src/slices/narration/steering.ts:16`).
- TTS recipes and their strict persisted schema currently require `pronunciation: null`. Request identity uses exact request text and a reserved null position, so changing sent IPA affects reuse (`packages/app/src/slices/rebuild/recipe-model.ts:69`, `recipe-input-schema.ts:49`, `packages/app/src/slices/narration/plan.ts:38`).

## Entry points

`audioRecipes` plans narration. `executeProviderRecipe` calls the wrapped TTS provider and persists exact request text plus optional clean transcript. `publishNarrationText` publishes clean/script downloads (`packages/app/src/slices/rebuild/recipe-audio.ts:25`, `runtime-provider.ts:29`, `runtime-narration-text.ts:76`).

## Communication

Prepared parts preserve the pair of sent text and spoken spelling in their saved payload. `narrationTextParts` checks that pair against the saved recipe; `joinedNarration` joins logical groups for readable downloads. Export's `revisionTranscript` currently selects this clean path only when Narration Preparation is enabled; any future independent pronunciation option must account for that boundary too (`packages/app/src/slices/rebuild/runtime-provider.ts:113`, `runtime-narration-text.ts:27`, `runtime-export-inputs.ts:80`).

## Composition

No pronunciation dictionary API field is passed by the Inworld adapter. Streaming and asynchronous paths consume the recipe's text. The existing clean/script pair is an application concern, not a new provider port (`packages/app/src/adapters/tts/inworld.ts:67`, `packages/app/src/slices/rebuild/runtime-provider.ts:29`).

## Frontend

Play and project Audio expose the saved Narration Preparation prompt. It defaults Off, adds a preparation LLM call, and is restricted to Inworld TTS-2, not Flash. No separate pronunciation control exists (`packages/web/src/play/media-rails.tsx:79`, `narration-preparation.tsx:5`, `packages/web/src/project/revision-narration.tsx:7`, `packages/app/src/slices/admission/rules.ts:284`).

