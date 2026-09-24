---
absorbed_from: features/2026-09-24-research-documents@2026-09-25
scenario: research
mockup_row: S4
screens: [06-play, 08-project]
depends_on: [01-pipeline-lifecycle, 02-provider-credentials, 03-placeholder-substitution, 05-provided-outputs]
generated_date: 2026-09-02
capstone_version: 5.2.0
---

# 06 Research

The research stage: agentic, web-grounded, one sub-agent per chapter, synthesized by an editorial call.

## Trigger & preconditions

- Trigger: scenario 01 step 2 starts the research stage of a project whose research source is Generate.
- Preconditions: article is Generate (a provided article forces research Off, scenario 05); the LLM provider has a key and a model is chosen (scenarios 02, 04); the rendered article prompt and keyword values exist (scenario 03).
- Actor: none beyond the pipeline; the user only started the run.

## Steps

1. Planner call: send a built-in instruction composed by the app from the keyword values and the rendered article prompt; the response is the chapter list, derived from the prompt's section guide. When the prompt has no section structure, the planner proposes the chapters. No cap on the count.
2. Sub-agent calls: one per chapter, all in parallel, each web-grounded, each returning that chapter's notes plus its sources. The web-grounding mechanism is `stack`'s.
3. Synthesis call: an editorial pass receives every original report as a separate document with an ordered index. It selects and organizes findings; it does not replace the originals. Output: notes ending in a Sources list. Model context limits and validated request-size limits apply; input is never silently clipped.
4. Store each new report as an immutable research-N.md revision asset plus the existing title/notes payload. Retain final notes and exact instructions, including supplied documents. Existing revision downloads serve report assets; legacy payload-only reports remain reusable without regeneration.
5. Progress on the project page: "k of N chapters researched"; refines scenario 01's plain running for this stage.
6. The article stage and its continuations receive all original reports plus editorial notes in full (scenario 07).

## Branches

- Section guide present in the article prompt → chapters from it; absent → planner proposes.
- Reviewed rebuild after failure → reuse matching completed reports; admit affected calls only after cost review and Start. The new document handoff preserves planner/chapter fingerprints.
- CLI providers materialize request-only private files and expose only a read-only MCP document tool. API providers receive separately labelled complete document messages. Host transport accepts contents, never arbitrary paths.

## Unhappy paths

- Any call fails → scenario 01's retry policy per call (4 attempts, 2s/8s/30s, Retry-After, 120s).
- Empty response from any call → counts as a failed attempt.
- Synthesis output lacking a Sources list → counts as a failed attempt.
- Provider or model rejects or lacks web grounding → the stage fails immediately with "web research unsupported by this model"; no fallback to model knowledge.
- One sub-agent exhausts its retries → the whole stage fails; sub-agents still running finish or are abandoned per scenario 13 cancel rules; their completed outputs are kept for the resume.
- Interrupted process → stage failed "interrupted" (scenario 01); resume applies on manual retry.
- Cancel mid-stage → scenario 13.
- Invalid or oversized documents, changed files, failed stdin delivery or incomplete page reads fail explicitly. Uncertain submitted work requires review before retry; a document reader does not expand a model's context window.

## State transitions

- Stage: per scenario 01 (`pending` → `running` → `done` | `failed`; `failed` → `running` on retry).
- Per sub-agent, persisted for resume: `pending` → `running` → `done` | `failed`.

## Invariants

- Article never starts before research is `done` (scenario 01 step 3).
- Stored notes always end with a Sources list.
- No chapter is researched twice within one successful run.
- Research never runs when the article is provided (scenario 05).

## Outcomes & side effects

- Success: notes, instructions, and sub-agent outputs on the project; article stage starts (scenario 01 step 3).
- Failure: stage `failed` with the error text verbatim (scenario 01); completed sub-agent outputs retained.
- Tokens used by every call are counted by scenario 16 telemetry.

## Dimensions not in play

- D1 authority: no actor beyond the pipeline.
- D5 money: nothing charged in-app; provider spend on the user's key, tokens counted by telemetry.
- D7 time: nothing beyond scenario 01's per-call timeouts and backoff.
- D13 notification: no channel.
