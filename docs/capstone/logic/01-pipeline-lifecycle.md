---
scenario: pipeline-lifecycle
mockup_row: S9
screens: [07-projects, 08-project]
depends_on: []
cited_by_forward: [04-run-admission, 12-reruns-and-edits, 13-cancel, 16-telemetry]
implements: [Q2, Q3, Q4, Q5, Q6, Q7, Q8, Q9, Q10, Q62, Q77, Q93, Q97, Q111]
generated_date: 2026-09-02
capstone_version: 5.2.0
source: logic-interview.md
---

# 01 Pipeline lifecycle

The spine every other scenario hangs on: which stages run in what order, what a stage's status means, and what happens when a call fails or the process dies. Rules cite `logic-interview.md §Q<n>`.

## Trigger & preconditions

- Trigger: a run accepted by scenario 04 `run-admission` (Play on `mockup/06-play.md`); one play creates one project (`mockup-interview.md §Q10`).
- Precondition: the project record exists with its run configuration: per-stage source (Generate / Provide / Off), prompts, keyword values, providers, models, voice, format, card toggles, title (mockup §Q28, §Q14-§Q19).
- Actor: the single local user; there are no roles (§Q10, D1 not in play).

## Steps

1. Mark stages at creation (§Q2): every stage with source Provide → `provided`, with its supplied output attached; research or thumbnail with source Off → `skipped`; every other stage → `pending`.
2. Start research if pending (§Q2). Progress signal: "k of N chapters researched" (scenario 06 §Q54, superseding the plain `running` of §Q10).
3. Start article when research is `done`, `provided`, or `skipped` (§Q2). Progress: text streamed into the page as it arrives (§Q6). The article stage also writes the text of any LLM-mode intro or outro entry picked for the run, after the article (§Q97; scenario 07).
4. When article is `done` or `provided`, start audio, images, and thumbnail together, each independently (§Q2). Progress: images appear one by one, k of N (§Q6); audio streams when the provider streams, otherwise appears on completion (§Q6). The audio stage narrates the body and the picked intro and outro (§Q93; scenario 08).
5. Start video when audio, images, and thumbnail are each `done`, `provided`, or `skipped` (§Q2). Progress: render percentage (§Q6). Video is always generated (mockup `06-play.md`, assumed there).
6. A stage's provider call is attempted up to 4 times: the first attempt plus 3 retries, waiting 2 s, 8 s, 30 s between attempts; a 429 response waits the provider's Retry-After instead when one is given; each attempt times out at 120 s, measured between streamed chunks for a streaming call and over the whole call otherwise (§Q62), except image-generation calls, which time out at 300 s (§Q77); the video render has no timeout (§Q4, §Q10).
7. Project status is derived, never stored independently (§Q9): `running` if any stage is `running`; else `canceled` if any stage is `canceled` (scenario 13); else `failed` if any stage is `failed`; else `done` if video is `done`.

## Branches

- Source per stage decides step 1: Provide vs Generate vs Off (mockup §Q28; Off exists only for research and thumbnail).
- Dependencies satisfied by `provided` or `skipped` exactly as by `done` (§Q2).
- Retry-After present on a 429 → it replaces the fixed backoff for that wait (§Q4).
- Number of parallel projects: unlimited; no queue, no `queued` status (§Q8, §Q10).

## Unhappy paths

- Attempts exhausted (4 failures): stage → `failed`; the stage on `mockup/08-project.md` shows the provider's error text verbatim and the attempt count (§Q3, §Q10). Siblings keep running; outputs of `done` stages are kept (§Q10).
- Manual retry on a `failed` stage: the stage re-runs from scratch with a fresh attempt budget; on success every `pending` dependent proceeds automatically; independent stages are untouched (§Q5).
- Process dies mid-run (terminal closed, machine asleep): on next app start every stage found `running` → `failed` with reason "interrupted"; the project reads `failed` and waits for manual retry; nothing auto-resumes (§Q7).
- Parallel projects hitting one provider's rate limit: absorbed by the retry policy in step 6; no cross-project coordination (§Q8).
- Cancellation mid-run: scenario 13.
- Abandonment: a `failed` project stays `failed` indefinitely; nothing expires (§Q7, D7).

## State transitions

Stage states: `pending`, `running`, `done`, `failed`, `canceled`, `provided`, `skipped`.

| From | To | When |
|---|---|---|
| (new) | pending / provided / skipped | step 1 |
| pending | running | dependencies satisfied |
| running | done | provider output stored |
| running | failed | attempts exhausted, or interrupted at app start |
| failed | running | manual retry (§Q5) |
| running | canceled | user cancel (scenario 13 §Q111) |
| canceled | running | manual retry, resuming like failed (scenario 13 §Q111) |
| done | running | re-run, scenario 11 only |

Forbidden: `provided` → `running`, `skipped` → `running`, any state → `pending` (§Q10).

Project states: `running`, `failed`, `done`, `canceled` (§Q9; `canceled` per scenario 13).

## Invariants

- Video never starts before audio, images, and thumbnail are each `done`, `provided`, or `skipped` (§Q2, §Q10).
- A stage holds exactly one state at any time (§Q10).
- No provider call is attempted more than 4 times without a human retry (§Q4, §Q10).
- A project with any `failed` stage never reads `done` (§Q9).
- A failure in one stage never discards another stage's `done` output (§Q10).

## Outcomes & side effects

- Success: video `done`, project `done`; every stage's output available on `mockup/08-project.md` and for download (scenario 13 owns storage).
- Failure: a `failed` stage with its error text and attempt count, project `failed`, awaiting manual retry (§Q3, §Q5).
- Record: per stage, status, attempt count, last error text, and timestamps of each transition are persisted with the project (D15; storage layout is scenario 13's).
- Telemetry counters increment per stage per scenario 15; nothing else fans out.
- Nobody is notified; the page reflects status changes (D13 not in play).

## Dimensions not in play

- D1 authority: one local actor, no roles, no delegation (§Q10).
- D3 input: run inputs are validated by scenarios 03, 04, and 05 before this scenario starts (§Q10).
- D5 money: no charge, credit, or balance moves inside the app; provider spend happens on the user's own keys outside it (mockup §Q20; §Q10).
- D13 notification: no channel exists; the UI updates in place (§Q10).
- D7 time beyond timeouts and backoff: nothing expires or is scheduled (§Q7).
